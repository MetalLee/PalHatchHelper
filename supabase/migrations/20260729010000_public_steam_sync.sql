create table public.steam_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  steam_id text not null unique,
  persona_name text,
  avatar_url text,
  profile_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint steam_identities_steam_id_check check (steam_id ~ '^[0-9]{17}$'),
  constraint steam_identities_persona_name_check
    check (persona_name is null or char_length(persona_name) between 1 and 120),
  constraint steam_identities_avatar_url_check
    check (avatar_url is null or char_length(avatar_url) between 1 and 500),
  constraint steam_identities_profile_url_check
    check (profile_url is null or char_length(profile_url) between 1 and 500)
);

create table public.sync_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sync_pairing_codes_hash_check check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint sync_pairing_codes_expiry_check check (expires_at > created_at)
);

create index sync_pairing_codes_owner_active_idx
  on public.sync_pairing_codes(owner_user_id, expires_at desc)
  where consumed_at is null;

create table public.sync_devices (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  world_id uuid references public.worlds(id) on delete restrict,
  name text not null,
  platform text not null,
  token_hash text not null unique,
  token_prefix text not null,
  app_version text,
  last_seen_at timestamptz,
  last_snapshot_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sync_devices_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint sync_devices_platform_check check (platform = 'linux-x64'),
  constraint sync_devices_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint sync_devices_token_prefix_check check (
    token_prefix ~ '^pbs_[-_A-Za-z0-9]{8}$'
  ),
  constraint sync_devices_app_version_check check (
    app_version is null or char_length(app_version) between 1 and 40
  )
);

create index sync_devices_owner_created_idx
  on public.sync_devices(owner_user_id, created_at desc);
create index sync_devices_world_active_idx
  on public.sync_devices(world_id)
  where revoked_at is null;

alter table public.steam_identities enable row level security;
alter table public.sync_pairing_codes enable row level security;
alter table public.sync_devices enable row level security;

create policy steam_identities_select_own
  on public.steam_identities for select to authenticated
  using (user_id = auth.uid());

create policy sync_devices_select_own
  on public.sync_devices for select to authenticated
  using (owner_user_id = auth.uid());

revoke all on public.steam_identities from public, anon, authenticated;
grant select on public.steam_identities to authenticated;
grant all on public.steam_identities to service_role;

revoke all on public.sync_pairing_codes from public, anon, authenticated;
grant all on public.sync_pairing_codes to service_role;

revoke all on public.sync_devices from public, anon, authenticated;
grant select (
  id,
  owner_user_id,
  world_id,
  name,
  platform,
  token_prefix,
  app_version,
  last_seen_at,
  last_snapshot_at,
  revoked_at,
  created_at
) on public.sync_devices to authenticated;
grant all on public.sync_devices to service_role;

create function public.create_sync_pairing_code(
  p_code_hash text,
  p_ttl_seconds integer default 600
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or p_ttl_seconds is null
     or p_ttl_seconds not between 60 and 600 then
    raise exception using errcode = '22023', message = 'SYNC_PAIRING_CODE_INVALID';
  end if;

  update public.sync_pairing_codes
     set consumed_at = now()
   where owner_user_id = auth.uid()
     and consumed_at is null;

  v_expires_at := now() + make_interval(secs => p_ttl_seconds);
  insert into public.sync_pairing_codes (
    owner_user_id,
    code_hash,
    expires_at
  ) values (
    auth.uid(),
    p_code_hash,
    v_expires_at
  );
  return v_expires_at;
end;
$$;

revoke all on function public.create_sync_pairing_code(text, integer)
  from public, anon;
grant execute on function public.create_sync_pairing_code(text, integer)
  to authenticated;

create function public.consume_sync_pairing_code(
  p_code_hash text,
  p_device_name text,
  p_platform text,
  p_app_version text,
  p_token_hash text,
  p_token_prefix text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code public.sync_pairing_codes%rowtype;
  v_device_id uuid;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_token_prefix !~ '^pbs_[-_A-Za-z0-9]{8}$'
     or char_length(btrim(coalesce(p_device_name, ''))) not between 1 and 80
     or p_platform <> 'linux-x64'
     or (p_app_version is not null and char_length(p_app_version) not between 1 and 40) then
    raise exception using errcode = '22023', message = 'SYNC_PAIRING_REQUEST_INVALID';
  end if;

  select code.* into v_code
    from public.sync_pairing_codes as code
   where code.code_hash = p_code_hash
   for update;
  if v_code.id is null or v_code.consumed_at is not null then
    raise exception using errcode = 'P0001', message = 'SYNC_PAIRING_CODE_INVALID';
  end if;
  if v_code.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'SYNC_PAIRING_CODE_EXPIRED';
  end if;

  update public.sync_pairing_codes
     set consumed_at = now()
   where id = v_code.id;
  insert into public.sync_devices (
    owner_user_id,
    name,
    platform,
    token_hash,
    token_prefix,
    app_version,
    last_seen_at
  ) values (
    v_code.owner_user_id,
    btrim(p_device_name),
    p_platform,
    p_token_hash,
    p_token_prefix,
    p_app_version,
    now()
  ) returning id into v_device_id;
  return v_device_id;
end;
$$;

revoke all on function public.consume_sync_pairing_code(
  text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.consume_sync_pairing_code(
  text, text, text, text, text, text
) to service_role;

create function public.list_sync_devices()
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
  order by device.created_at desc;
$$;

revoke all on function public.list_sync_devices() from public, anon;
grant execute on function public.list_sync_devices() to authenticated;

create function public.revoke_sync_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  update public.sync_devices
     set revoked_at = coalesce(revoked_at, now())
   where id = p_device_id
     and owner_user_id = auth.uid();
  if not found then
    raise exception using errcode = 'P0001', message = 'SYNC_DEVICE_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.revoke_sync_device(uuid) from public, anon;
grant execute on function public.revoke_sync_device(uuid) to authenticated;

create function private.assert_public_sync_snapshot(p_snapshot jsonb)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_record jsonb;
begin
  if p_snapshot is null
     or jsonb_typeof(p_snapshot -> 'guilds') <> 'array'
     or jsonb_typeof(p_snapshot -> 'players') <> 'array'
     or jsonb_typeof(p_snapshot -> 'pals') <> 'array'
     or coalesce(p_snapshot #>> '{server,world_uid}', '') !~ '^pb1_[0-9a-f]{64}$'
     or p_snapshot ->> 'parser_name' <> 'palhatch-plm-save-parser' then
    raise exception using errcode = '22023', message = 'SYNC_SNAPSHOT_INVALID';
  end if;

  for v_record in select value from jsonb_array_elements(p_snapshot -> 'guilds') loop
    if coalesce(v_record ->> 'guild_uid', '') !~ '^pb1_[0-9a-f]{64}$' then
      raise exception using errcode = '22023', message = 'SYNC_UID_NOT_REDACTED';
    end if;
  end loop;
  for v_record in select value from jsonb_array_elements(p_snapshot -> 'players') loop
    if coalesce(v_record ->> 'player_uid', '') !~ '^pb1_[0-9a-f]{64}$'
       or (v_record ->> 'guild_uid' is not null
           and v_record ->> 'guild_uid' !~ '^pb1_[0-9a-f]{64}$') then
      raise exception using errcode = '22023', message = 'SYNC_UID_NOT_REDACTED';
    end if;
  end loop;
  for v_record in select value from jsonb_array_elements(p_snapshot -> 'pals') loop
    if coalesce(v_record ->> 'instance_uid', '') !~ '^pb1_[0-9a-f]{64}$'
       or (v_record ->> 'owner_player_uid' is not null
           and v_record ->> 'owner_player_uid' !~ '^pb1_[0-9a-f]{64}$')
       or (v_record ->> 'guild_uid' is not null
           and v_record ->> 'guild_uid' !~ '^pb1_[0-9a-f]{64}$')
       or (v_record ->> 'location_id' is not null
           and v_record ->> 'location_id' !~ '^pb1_[0-9a-f]{64}$')
       or (v_record ? 'metadata' and jsonb_typeof(v_record -> 'metadata') <> 'null') then
      raise exception using errcode = '22023', message = 'SYNC_UID_NOT_REDACTED';
    end if;
  end loop;
end;
$$;

revoke all on function private.assert_public_sync_snapshot(jsonb)
  from public, anon, authenticated, service_role;

create function public.publish_sync_device_snapshot(
  p_token_hash text,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_device public.sync_devices%rowtype;
  v_world_id uuid;
  v_world_uid text;
  v_catalog_id uuid;
  v_snapshot_id uuid;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'SYNC_DEVICE_UNAUTHORIZED';
  end if;
  select device.* into v_device
    from public.sync_devices as device
   where device.token_hash = p_token_hash
   for update;
  if v_device.id is null or v_device.revoked_at is not null then
    raise exception using errcode = 'P0001', message = 'SYNC_DEVICE_UNAUTHORIZED';
  end if;

  perform private.assert_public_sync_snapshot(p_snapshot);
  v_world_uid := p_snapshot #>> '{server,world_uid}';
  v_world_id := v_device.world_id;
  if v_world_id is not null then
    if not exists (
      select 1 from public.worlds as world
      where world.id = v_world_id and world.world_uid = v_world_uid
    ) then
      raise exception using errcode = 'P0001', message = 'SYNC_DEVICE_WORLD_MISMATCH';
    end if;
  else
    select world.id into v_world_id
      from public.worlds as world
     where world.world_uid = v_world_uid
     for update;
    if v_world_id is not null and exists (
      select 1 from public.sync_devices as other
      where other.world_id = v_world_id
        and other.owner_user_id <> v_device.owner_user_id
    ) then
      raise exception using errcode = 'P0001', message = 'SYNC_WORLD_OWNED_BY_OTHER';
    end if;
    if v_world_id is null then
      select version.id into v_catalog_id
        from public.game_data_versions as version
        join public.breeding_data_versions as breeding on breeding.id = version.id
       where version.status = 'published'
         and breeding.status = 'published'
       order by version.published_at desc nulls last, version.imported_at desc
       limit 1;
      if v_catalog_id is null then
        raise exception using errcode = 'P0001', message = 'SYNC_CATALOG_NOT_PUBLISHED';
      end if;
      insert into public.worlds (
        world_uid,
        name,
        active_breeding_version_id,
        active_game_data_version_id
      ) values (
        v_world_uid,
        'PalBeacon ' || substr(v_world_uid, 5, 8),
        v_catalog_id,
        v_catalog_id
      ) returning id into v_world_id;
    end if;
    update public.sync_devices
       set world_id = v_world_id
     where id = v_device.id;
  end if;

  v_snapshot_id := private.publish_inventory_snapshot(v_world_id, p_snapshot);
  update public.sync_devices
     set last_seen_at = now(),
         last_snapshot_at = now()
   where id = v_device.id;
  return jsonb_build_object('world_id', v_world_id, 'snapshot_id', v_snapshot_id);
end;
$$;

revoke all on function public.publish_sync_device_snapshot(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_sync_device_snapshot(text, jsonb)
  to service_role;

create function public.heartbeat_sync_device(
  p_token_hash text,
  p_app_version text,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_device_id uuid;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$'
     or p_status not in ('ok', 'unchanged', 'idle', 'error')
     or (p_app_version is not null and char_length(p_app_version) not between 1 and 40) then
    raise exception using errcode = '22023', message = 'SYNC_HEARTBEAT_INVALID';
  end if;
  update public.sync_devices
     set last_seen_at = now(),
         app_version = coalesce(p_app_version, app_version)
   where token_hash = p_token_hash
     and revoked_at is null
  returning id into v_device_id;
  if v_device_id is null then
    raise exception using errcode = 'P0001', message = 'SYNC_DEVICE_UNAUTHORIZED';
  end if;
  return v_device_id;
end;
$$;

revoke all on function public.heartbeat_sync_device(text, text, text)
  from public, anon, authenticated;
grant execute on function public.heartbeat_sync_device(text, text, text)
  to service_role;

create function public.list_claimable_synced_players()
returns table (
  player_id uuid,
  nickname text,
  level integer,
  guild_name text,
  world_name text,
  discriminator text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    player.id,
    player.nickname,
    player.level,
    guild.name,
    world.name,
    '#' || right(md5(player.id::text), 6)
  from public.players as player
  join public.worlds as world on world.id = player.world_id
  join public.inventory_snapshots as snapshot on snapshot.id = world.latest_snapshot_id
  left join public.guilds as guild on guild.id = player.guild_id
  where auth.uid() is not null
    and not exists (
      select 1 from public.player_bindings as own where own.user_id = auth.uid()
    )
    and exists (
      select 1 from public.sync_devices as device
      where device.owner_user_id = auth.uid()
        and device.world_id = player.world_id
        and device.revoked_at is null
    )
    and player.last_seen_at = snapshot.captured_at
    and not exists (
      select 1 from public.player_bindings as binding
      where binding.player_id = player.id
    )
  order by player.nickname, player.level nulls last, player.id;
$$;

revoke all on function public.list_claimable_synced_players() from public, anon;
grant execute on function public.list_claimable_synced_players() to authenticated;

create function public.claim_synced_player(p_player_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if exists (select 1 from public.player_bindings where user_id = v_user_id) then
    raise exception using errcode = 'P0001', message = 'USER_ALREADY_BOUND';
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
  if exists (select 1 from public.player_bindings where player_id = p_player_id) then
    raise exception using errcode = 'P0001', message = 'PLAYER_ALREADY_CLAIMED';
  end if;

  begin
    insert into public.player_bindings (user_id, player_id, bound_by)
    values (v_user_id, p_player_id, v_user_id);
  exception when unique_violation then
    if exists (select 1 from public.player_bindings where user_id = v_user_id) then
      raise exception using errcode = 'P0001', message = 'USER_ALREADY_BOUND';
    end if;
    raise exception using errcode = 'P0001', message = 'PLAYER_ALREADY_CLAIMED';
  end;
  return p_player_id;
end;
$$;

revoke all on function public.claim_synced_player(uuid) from public, anon;
grant execute on function public.claim_synced_player(uuid) to authenticated;

comment on table public.steam_identities is
  'Server-controlled Steam OpenID identities; authorization remains in profiles.role.';
comment on table public.sync_pairing_codes is
  'One-time public Sync pairing codes stored only as SHA-256 hashes.';
comment on table public.sync_devices is
  'Revocable public Sync device credentials; token_hash is never browser-readable.';
comment on function public.publish_sync_device_snapshot(text, jsonb) is
  'Authenticates one device, fixes its world, and delegates atomically to the existing immutable inventory publisher.';
