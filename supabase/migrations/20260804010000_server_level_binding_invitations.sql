-- 服务器级统一邀请链接（多用户共用）。
--
-- 变更语义：
--   1. 邀请不再绑定到某个具体角色，而是绑定到整台配对服务器（sync_device）。
--      同一台服务器一次只保留一个有效邀请；重新生成时撤销此前未消费的邀请。
--   2. 链接在有效期内可被多个不同用户接受：每个用户从最新快照的未绑定成员中
--      选择自己的角色完成绑定（或换绑）。接受不会消费链接，链接一直有效，
--      直到过期、服务器撤销或重新生成。
--   3. 原"每角色一条一次性邀请"的旧记录在迁移时全部撤销，旧 token 一律失效，
--      避免旧语义与新函数混淆。
--   4. 表仍只保存高熵 Token 的 SHA-256，不保存明文链接。

alter table public.player_binding_invitations
  alter column player_id drop not null;

-- 迁移前未消费的一次性邀请全部失效。
update public.player_binding_invitations
   set revoked_at = now()
 where consumed_at is null
   and revoked_at is null;

-- player 维度索引不再匹配服务器级邀请（player_id 为 null），删除；
-- 设备维度索引保留：同一台服务器同时最多一个有效邀请。
drop index if exists public.player_binding_invitations_player_active_idx;

comment on table public.player_binding_invitations is
  'Server-level binding invitations shared by all unbound members; '
  'only SHA-256 token hashes are stored.';

-- 旧签名（角色级）函数退役。
drop function if exists public.create_player_binding_invitation(uuid, uuid, text, integer);
drop function if exists public.accept_player_binding_invitation(text);

create or replace function public.create_player_binding_invitation(
  p_device_id uuid,
  p_token_hash text,
  p_ttl_seconds integer default 86400
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_device public.sync_devices%rowtype;
  v_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$'
     or p_ttl_seconds is null
     or p_ttl_seconds not between 300 and 86400 then
    raise exception using errcode = '22023', message = 'BINDING_INVITATION_INVALID';
  end if;

  select * into v_device
    from public.sync_devices
   where id = p_device_id
     and owner_user_id = v_user_id
     and revoked_at is null
   for update;
  if v_device.id is null or v_device.world_id is null then
    raise exception using errcode = 'P0001', message = 'SYNC_DEVICE_NOT_FOUND';
  end if;

  update public.player_binding_invitations
     set revoked_at = now()
   where sync_device_id = v_device.id
     and consumed_at is null
     and revoked_at is null;
  v_expires_at := now() + make_interval(secs => p_ttl_seconds);
  insert into public.player_binding_invitations(
    sync_device_id,
    inviter_user_id,
    token_hash,
    expires_at
  ) values (
    v_device.id,
    v_user_id,
    p_token_hash,
    v_expires_at
  );
  return jsonb_build_object('expires_at', v_expires_at);
end;
$$;

create or replace function public.get_player_binding_invitation(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_expires_at timestamptz;
  v_device_id uuid;
  v_device public.sync_devices%rowtype;
  v_world_name text;
  v_players jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  select invitation.expires_at, invitation.sync_device_id
    into v_expires_at, v_device_id
    from public.player_binding_invitations as invitation
   where invitation.token_hash = p_token_hash
     and invitation.consumed_at is null
     and invitation.revoked_at is null;
  if v_device_id is null then
    raise exception using errcode = 'P0001', message = 'BINDING_INVITATION_INVALID';
  end if;
  select * into v_device
    from public.sync_devices
   where id = v_device_id
     and revoked_at is null;
  if v_device.id is null then
    raise exception using errcode = 'P0001', message = 'BINDING_INVITATION_INVALID';
  end if;
  if v_expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'BINDING_INVITATION_EXPIRED';
  end if;

  select world.name into v_world_name
    from public.worlds as world
   where world.id = v_device.world_id;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'player_id', player.id,
               'nickname', player.nickname,
               'level', player.level,
               'guild_name', guild.name,
               'discriminator', '#' || right(md5(player.id::text), 6)
             )
             order by player.nickname, player.level nulls last, player.id
           ),
           '[]'::jsonb
         )
    into v_players
    from public.players as player
    join public.worlds as world on world.id = player.world_id
    join public.inventory_snapshots as snapshot
      on snapshot.id = world.latest_snapshot_id
     and player.last_seen_at = snapshot.captured_at
    left join public.guilds as guild on guild.id = player.guild_id
   where player.world_id = v_device.world_id
     and not exists (
       select 1 from public.player_bindings as binding
        where binding.player_id = player.id
     );

  return jsonb_build_object(
    'device_name', v_device.name,
    'world_name', v_world_name,
    'expires_at', v_expires_at,
    'players', v_players
  );
end;
$$;

create or replace function public.accept_player_binding_invitation(
  p_token_hash text,
  p_player_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invitation public.player_binding_invitations%rowtype;
  v_result uuid;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  select * into v_invitation
    from public.player_binding_invitations
   where token_hash = p_token_hash
   for update;
  if v_invitation.id is null
     or v_invitation.consumed_at is not null
     or v_invitation.revoked_at is not null
     or not exists (
       select 1 from public.sync_devices as device
        where device.id = v_invitation.sync_device_id
          and device.owner_user_id = v_invitation.inviter_user_id
          and device.revoked_at is null
     ) then
    raise exception using errcode = 'P0001', message = 'BINDING_INVITATION_INVALID';
  end if;
  if v_invitation.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'BINDING_INVITATION_EXPIRED';
  end if;
  if not exists (
    select 1
      from public.players as player
      join public.worlds as world on world.id = player.world_id
      join public.inventory_snapshots as snapshot
        on snapshot.id = world.latest_snapshot_id
       and player.last_seen_at = snapshot.captured_at
      join public.sync_devices as device
        on device.id = v_invitation.sync_device_id
       and device.world_id = player.world_id
       and device.revoked_at is null
     where player.id = p_player_id
  ) then
    raise exception using errcode = 'P0001', message = 'PLAYER_NOT_CLAIMABLE';
  end if;

  v_result := private.bind_synced_player(
    v_user_id,
    p_player_id,
    v_user_id,
    'invite-accept-' || v_invitation.id::text || '-' || gen_random_uuid()::text
  );
  -- 多用户共用：接受不消费链接；链接保持有效直到过期、服务器撤销或重新生成。
  return v_result;
end;
$$;

revoke all on function public.create_player_binding_invitation(uuid, text, integer)
  from public, anon;
revoke all on function public.accept_player_binding_invitation(text, uuid)
  from public, anon;
grant execute on function public.create_player_binding_invitation(uuid, text, integer)
  to authenticated;
grant execute on function public.accept_player_binding_invitation(text, uuid)
  to authenticated;
