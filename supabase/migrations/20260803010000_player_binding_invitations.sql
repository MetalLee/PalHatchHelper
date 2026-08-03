create table public.player_binding_invitations (
  id uuid primary key default gen_random_uuid(),
  sync_device_id uuid not null references public.sync_devices(id) on delete restrict,
  inviter_user_id uuid not null references auth.users(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  accepted_by_user_id uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint player_binding_invitations_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint player_binding_invitations_expiry_check
    check (expires_at > created_at),
  constraint player_binding_invitations_consumption_check check (
    (consumed_at is null and accepted_by_user_id is null)
    or (consumed_at is not null and accepted_by_user_id is not null)
  ),
  constraint player_binding_invitations_terminal_state_check check (
    not (consumed_at is not null and revoked_at is not null)
  )
);

create index player_binding_invitations_player_active_idx
  on public.player_binding_invitations(player_id, created_at desc)
  where consumed_at is null and revoked_at is null;
create index player_binding_invitations_device_active_idx
  on public.player_binding_invitations(sync_device_id, created_at desc)
  where consumed_at is null and revoked_at is null;

alter table public.player_binding_invitations enable row level security;
revoke all on public.player_binding_invitations from public, anon, authenticated;
grant all on public.player_binding_invitations to service_role;

create or replace function public.list_sync_devices()
returns table (
  id uuid,
  name text,
  platform text,
  token_prefix text,
  app_version text,
  world_id uuid,
  last_seen_at timestamptz,
  last_snapshot_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    device.id,
    device.name,
    device.platform,
    device.token_prefix,
    device.app_version,
    device.world_id,
    device.last_seen_at,
    device.last_snapshot_at,
    device.revoked_at,
    device.created_at
  from public.sync_devices as device
  where auth.uid() is not null
    and device.owner_user_id = auth.uid()
    and device.revoked_at is null
  order by device.created_at desc;
$$;

create function public.list_sync_server_members()
returns table (
  device_id uuid,
  player_id uuid,
  nickname text,
  level integer,
  guild_name text,
  world_name text,
  discriminator text,
  is_bound boolean,
  is_current_user boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    device.id,
    player.id,
    player.nickname,
    player.level,
    guild.name,
    world.name,
    '#' || right(md5(player.id::text), 6),
    binding.user_id is not null,
    binding.user_id = auth.uid()
  from public.sync_devices as device
  join public.worlds as world on world.id = device.world_id
  join public.inventory_snapshots as snapshot on snapshot.id = world.latest_snapshot_id
  join public.players as player
    on player.world_id = world.id
   and player.last_seen_at = snapshot.captured_at
  left join public.guilds as guild on guild.id = player.guild_id
  left join public.player_bindings as binding on binding.player_id = player.id
  where auth.uid() is not null
    and device.owner_user_id = auth.uid()
    and device.revoked_at is null
  order by device.created_at desc, player.nickname, player.level nulls last, player.id;
$$;

create function private.bind_synced_player(
  p_user_id uuid,
  p_player_id uuid,
  p_actor_user_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_binding public.player_bindings%rowtype;
  v_event_type text;
begin
  select * into v_binding
    from public.player_bindings
   where user_id = p_user_id
   for update;

  if exists (
    select 1 from public.player_bindings
     where player_id = p_player_id and user_id <> p_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'PLAYER_ALREADY_CLAIMED';
  end if;

  if v_binding.user_id is not null and v_binding.player_id = p_player_id then
    return p_player_id;
  end if;

  if v_binding.user_id is null then
    insert into public.player_bindings(user_id, player_id, bound_by, bound_at)
    values (p_user_id, p_player_id, p_actor_user_id, now())
    returning * into v_binding;
    v_event_type := 'binding_created';
  else
    update public.player_bindings
       set player_id = p_player_id,
           bound_by = p_actor_user_id,
           claim_code_hash = null
     where user_id = p_user_id
    returning * into v_binding;
    v_event_type := 'binding_updated';
  end if;

  insert into public.player_binding_events(
    event_type,
    user_id,
    player_id,
    actor_user_id,
    binding_version,
    idempotency_key
  ) values (
    v_event_type,
    p_user_id,
    p_player_id,
    p_actor_user_id,
    v_binding.concurrency_version,
    p_idempotency_key
  );
  return p_player_id;
exception when unique_violation then
  raise exception using errcode = 'P0001', message = 'PLAYER_ALREADY_CLAIMED';
end;
$$;

revoke all on function private.bind_synced_player(uuid, uuid, uuid, text)
  from public, anon, authenticated;

create or replace function public.claim_synced_player(p_player_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_result uuid;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if not exists (
    select 1
      from public.players as player
      join public.worlds as world on world.id = player.world_id
      join public.inventory_snapshots as snapshot on snapshot.id = world.latest_snapshot_id
     where player.id = p_player_id
       and player.last_seen_at = snapshot.captured_at
       and exists (
         select 1 from public.sync_devices as device
          where device.owner_user_id = v_user_id
            and device.world_id = player.world_id
            and device.revoked_at is null
       )
  ) then
    raise exception using errcode = 'P0001', message = 'PLAYER_NOT_CLAIMABLE';
  end if;

  v_result := private.bind_synced_player(
    v_user_id,
    p_player_id,
    v_user_id,
    'sync-claim-' || gen_random_uuid()::text
  );
  update public.player_binding_invitations
     set revoked_at = now()
   where player_id = p_player_id
     and consumed_at is null
     and revoked_at is null;
  return v_result;
end;
$$;

create function public.create_player_binding_invitation(
  p_device_id uuid,
  p_player_id uuid,
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
  if not exists (
    select 1
      from public.players as player
      join public.worlds as world on world.id = player.world_id
      join public.inventory_snapshots as snapshot on snapshot.id = world.latest_snapshot_id
     where player.id = p_player_id
       and player.world_id = v_device.world_id
       and player.last_seen_at = snapshot.captured_at
  ) then
    raise exception using errcode = 'P0001', message = 'PLAYER_NOT_CLAIMABLE';
  end if;
  if exists (select 1 from public.player_bindings where player_id = p_player_id) then
    raise exception using errcode = 'P0001', message = 'PLAYER_ALREADY_CLAIMED';
  end if;

  update public.player_binding_invitations
     set revoked_at = now()
   where player_id = p_player_id
     and consumed_at is null
     and revoked_at is null;
  v_expires_at := now() + make_interval(secs => p_ttl_seconds);
  insert into public.player_binding_invitations(
    sync_device_id,
    inviter_user_id,
    player_id,
    token_hash,
    expires_at
  ) values (
    v_device.id,
    v_user_id,
    p_player_id,
    p_token_hash,
    v_expires_at
  );
  return jsonb_build_object('expires_at', v_expires_at);
end;
$$;

create function public.get_player_binding_invitation(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  select invitation.expires_at,
         jsonb_build_object(
           'player_id', player.id,
           'nickname', player.nickname,
           'level', player.level,
           'guild_name', guild.name,
           'world_name', world.name,
           'device_name', device.name,
           'discriminator', '#' || right(md5(player.id::text), 6),
           'expires_at', invitation.expires_at
         )
    into v_expires_at, v_result
    from public.player_binding_invitations as invitation
    join public.sync_devices as device
      on device.id = invitation.sync_device_id and device.revoked_at is null
    join public.players as player on player.id = invitation.player_id
    join public.worlds as world
      on world.id = player.world_id and world.id = device.world_id
    join public.inventory_snapshots as snapshot
      on snapshot.id = world.latest_snapshot_id
     and player.last_seen_at = snapshot.captured_at
    left join public.guilds as guild on guild.id = player.guild_id
   where invitation.token_hash = p_token_hash
     and invitation.consumed_at is null
     and invitation.revoked_at is null
     and not exists (
       select 1 from public.player_bindings as binding
        where binding.player_id = invitation.player_id
     );
  if v_result is null then
    raise exception using errcode = 'P0001', message = 'BINDING_INVITATION_INVALID';
  end if;
  if v_expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'BINDING_INVITATION_EXPIRED';
  end if;
  return v_result;
end;
$$;

create function public.accept_player_binding_invitation(p_token_hash text)
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
      join public.inventory_snapshots as snapshot on snapshot.id = world.latest_snapshot_id
      join public.sync_devices as device
        on device.id = v_invitation.sync_device_id
       and device.world_id = player.world_id
       and device.revoked_at is null
     where player.id = v_invitation.player_id
       and player.last_seen_at = snapshot.captured_at
  ) then
    raise exception using errcode = 'P0001', message = 'PLAYER_NOT_CLAIMABLE';
  end if;

  v_result := private.bind_synced_player(
    v_user_id,
    v_invitation.player_id,
    v_user_id,
    'invite-accept-' || v_invitation.id::text
  );
  update public.player_binding_invitations
     set consumed_at = now(), accepted_by_user_id = v_user_id
   where id = v_invitation.id;
  update public.player_binding_invitations
     set revoked_at = now()
   where player_id = v_invitation.player_id
     and id <> v_invitation.id
     and consumed_at is null
     and revoked_at is null;
  return v_result;
end;
$$;

revoke all on function public.list_sync_server_members() from public, anon;
revoke all on function public.create_player_binding_invitation(uuid, uuid, text, integer)
  from public, anon;
revoke all on function public.get_player_binding_invitation(text) from public, anon;
revoke all on function public.accept_player_binding_invitation(text) from public, anon;
grant execute on function public.list_sync_server_members() to authenticated;
grant execute on function public.create_player_binding_invitation(uuid, uuid, text, integer)
  to authenticated;
grant execute on function public.get_player_binding_invitation(text) to authenticated;
grant execute on function public.accept_player_binding_invitation(text) to authenticated;

comment on table public.player_binding_invitations is
  'One-time player binding invitations; only SHA-256 token hashes are stored.';
