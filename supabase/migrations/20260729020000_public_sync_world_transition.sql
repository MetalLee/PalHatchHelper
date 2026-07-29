create table private.public_sync_world_transitions (
  world_id uuid primary key references public.worlds(id) on delete restrict,
  original_world_uid text not null,
  target_world_uid text not null unique,
  state text not null default 'prepared',
  guild_ids uuid[] not null default '{}',
  player_ids uuid[] not null default '{}',
  binding_count integer not null,
  binding_digest text not null,
  latest_snapshot_id_at_transition uuid references public.inventory_snapshots(id) on delete restrict,
  unresolved_pal_count_at_transition integer not null,
  created_at timestamptz not null default now(),
  transitioned_at timestamptz,
  rolled_back_at timestamptz,
  constraint public_sync_world_transitions_state_check check (
    state in ('prepared', 'transitioned', 'rolled_back')
  ),
  constraint public_sync_world_transitions_target_check check (
    target_world_uid ~ '^pb1_[0-9a-f]{64}$'
  ),
  constraint public_sync_world_transitions_digest_check check (
    binding_digest ~ '^[0-9a-f]{64}$'
  ),
  constraint public_sync_world_transitions_counts_check check (
    binding_count >= 0 and unresolved_pal_count_at_transition >= 0
  )
);

create table private.public_sync_uid_mappings (
  world_id uuid not null references private.public_sync_world_transitions(world_id) on delete restrict,
  entity_kind text not null,
  entity_id uuid,
  original_uid text not null,
  target_uid text not null,
  created_at timestamptz not null default now(),
  primary key (world_id, entity_kind, original_uid),
  unique (world_id, entity_kind, target_uid),
  constraint public_sync_uid_mappings_kind_check check (
    entity_kind in (
      'world',
      'guild',
      'player',
      'pal_share_preference',
      'pal_instance_lifecycle'
    )
  ),
  constraint public_sync_uid_mappings_target_check check (
    target_uid ~ '^pb1_[0-9a-f]{64}$'
  ),
  constraint public_sync_uid_mappings_entity_check check (
    (entity_kind in ('world', 'guild', 'player') and entity_id is not null)
    or (entity_kind in ('pal_share_preference', 'pal_instance_lifecycle') and entity_id is null)
  )
);

create table private.public_sync_snapshot_publications (
  snapshot_id uuid not null references public.inventory_snapshots(id) on delete restrict,
  device_id uuid not null references public.sync_devices(id) on delete restrict,
  world_id uuid not null references public.worlds(id) on delete restrict,
  published_at timestamptz not null default now(),
  primary key (snapshot_id, device_id),
  constraint public_sync_snapshot_publications_snapshot_world_fkey
    foreign key (snapshot_id, world_id)
    references public.inventory_snapshots(id, world_id)
    on delete restrict
);

revoke all on table private.public_sync_world_transitions
  from public, anon, authenticated, service_role;
revoke all on table private.public_sync_uid_mappings
  from public, anon, authenticated, service_role;
revoke all on table private.public_sync_snapshot_publications
  from public, anon, authenticated, service_role;

create function private.public_sync_redact_uid(p_raw_uid text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, extensions
as $$
  select 'pb1_' || encode(
    extensions.digest(
      pg_catalog.convert_to('palbeacon:v1:' || p_raw_uid, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function private.public_sync_redact_uid(text)
  from public, anon, authenticated;
grant execute on function private.public_sync_redact_uid(text) to service_role;

create function private.public_sync_binding_state(p_world_id uuid)
returns table (binding_count integer, binding_digest text)
language sql
stable
set search_path = pg_catalog, public, extensions
as $$
  select
    count(*)::integer,
    encode(
      extensions.digest(
        convert_to(
          coalesce(
            string_agg(
              binding.user_id::text || ':' || binding.player_id::text,
              '|' order by binding.user_id, binding.player_id
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  from public.player_bindings as binding
  join public.players as player on player.id = binding.player_id
  where player.world_id = p_world_id;
$$;

revoke all on function private.public_sync_binding_state(uuid)
  from public, anon, authenticated, service_role;

create function public.preflight_public_sync_world_transition(p_world_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_world public.worlds%rowtype;
  v_transition private.public_sync_world_transitions%rowtype;
  v_target_uid text;
  v_guild_count integer;
  v_player_count integer;
  v_binding_count integer;
  v_share_count integer;
  v_lifecycle_count integer;
  v_active_job_count integer;
  v_processing_job_count integer;
  v_uid_conflict boolean;
  v_target_world_exists boolean;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  select * into v_world from public.worlds where id = p_world_id;
  if v_world.id is null then
    raise exception using errcode = 'P0001', message = 'WORLD_NOT_FOUND';
  end if;
  select * into v_transition
    from private.public_sync_world_transitions
   where world_id = p_world_id;
  v_target_uid := coalesce(
    v_transition.target_world_uid,
    private.public_sync_redact_uid(v_world.world_uid)
  );

  select count(*)::integer into v_guild_count
    from public.guilds where world_id = p_world_id;
  select count(*)::integer into v_player_count
    from public.players where world_id = p_world_id;
  select count(*)::integer into v_binding_count
    from public.player_bindings as binding
    join public.players as player on player.id = binding.player_id
   where player.world_id = p_world_id;
  select count(*)::integer into v_share_count
    from public.pal_share_preferences where world_id = p_world_id;
  select count(*)::integer into v_lifecycle_count
    from public.pal_instance_lifecycle where world_id = p_world_id;
  select count(*)::integer into v_active_job_count
    from public.breeding_jobs
   where world_id = p_world_id
     and status not in ('completed', 'failed', 'cancelled');
  select count(*)::integer into v_processing_job_count
    from public.breeding_jobs
   where world_id = p_world_id
     and status in ('processing', 'algorithm_completed', 'ai_enriching');

  select exists (
    select 1 from public.worlds as other
     where other.world_uid = v_target_uid and other.id <> p_world_id
  ) into v_target_world_exists;
  select v_target_world_exists
    or exists (
      select 1
        from public.guilds as source
        join public.guilds as other
          on other.world_id = source.world_id
         and other.id <> source.id
         and other.game_guild_uid = private.public_sync_redact_uid(source.game_guild_uid)
       where source.world_id = p_world_id
    )
    or exists (
      select 1
        from public.players as source
        join public.players as other
          on other.world_id = source.world_id
         and other.id <> source.id
         and other.game_player_uid = private.public_sync_redact_uid(source.game_player_uid)
       where source.world_id = p_world_id
    )
    or exists (
      select 1
        from public.pal_share_preferences as source
        join public.pal_share_preferences as other
          on other.world_id = source.world_id
         and other.pal_instance_uid <> source.pal_instance_uid
         and other.pal_instance_uid = private.public_sync_redact_uid(source.pal_instance_uid)
       where source.world_id = p_world_id
    )
    or exists (
      select 1
        from public.pal_instance_lifecycle as source
        join public.pal_instance_lifecycle as other
          on other.world_id = source.world_id
         and other.pal_instance_uid <> source.pal_instance_uid
         and other.pal_instance_uid = private.public_sync_redact_uid(source.pal_instance_uid)
       where source.world_id = p_world_id
    )
  into v_uid_conflict;

  return jsonb_build_object(
    'world_id', p_world_id,
    'current_world_uid', v_world.world_uid,
    'target_world_uid', v_target_uid,
    'guild_count', v_guild_count,
    'player_count', v_player_count,
    'player_binding_count', v_binding_count,
    'share_preference_count', v_share_count,
    'latest_snapshot_id', v_world.latest_snapshot_id,
    'active_job_count', v_active_job_count,
    'processing_job_count', v_processing_job_count,
    'already_migrated', coalesce(v_transition.state = 'transitioned', false),
    'uid_conflict', v_uid_conflict,
    'target_world_exists', v_target_world_exists,
    'required_changes', jsonb_build_object(
      'worlds', case when v_transition.state = 'transitioned' then 0 else 1 end,
      'guilds', case when v_transition.state = 'transitioned' then 0 else v_guild_count end,
      'players', case when v_transition.state = 'transitioned' then 0 else v_player_count end,
      'pal_share_preferences', case when v_transition.state = 'transitioned' then 0 else v_share_count end,
      'pal_instance_lifecycle', case when v_transition.state = 'transitioned' then 0 else v_lifecycle_count end
    )
  );
end;
$$;

revoke all on function public.preflight_public_sync_world_transition(uuid)
  from public, anon, authenticated;
grant execute on function public.preflight_public_sync_world_transition(uuid)
  to service_role;

create function public.transition_world_to_public_sync(
  p_world_id uuid,
  p_expected_current_world_uid text,
  p_allow_recent_save_worker boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_world public.worlds%rowtype;
  v_transition private.public_sync_world_transitions%rowtype;
  v_preflight jsonb;
  v_target_uid text;
  v_binding_count integer;
  v_binding_digest text;
  v_guild_ids uuid[];
  v_player_ids uuid[];
  v_unresolved_count integer;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_expected_current_world_uid is null or btrim(p_expected_current_world_uid) = '' then
    raise exception using errcode = '22023', message = 'PUBLIC_SYNC_EXPECTED_WORLD_UID_REQUIRED';
  end if;

  select * into v_world
    from public.worlds
   where id = p_world_id
   for update;
  if v_world.id is null then
    raise exception using errcode = 'P0001', message = 'WORLD_NOT_FOUND';
  end if;
  select * into v_transition
    from private.public_sync_world_transitions
   where world_id = p_world_id
   for update;
  if v_transition.world_id is not null and v_transition.state = 'transitioned' then
    if v_transition.original_world_uid <> p_expected_current_world_uid
       or v_world.world_uid <> v_transition.target_world_uid then
      raise exception using errcode = 'P0001', message = 'PUBLIC_SYNC_TRANSITION_STATE_CHANGED';
    end if;
    return public.verify_public_sync_world_transition(p_world_id);
  end if;
  if v_transition.world_id is not null then
    raise exception using errcode = 'P0001', message = 'PUBLIC_SYNC_TRANSITION_ALREADY_ROLLED_BACK';
  end if;
  if v_world.world_uid ~ '^pb1_[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'PUBLIC_SYNC_WORLD_ALREADY_REDACTED';
  end if;
  if v_world.world_uid <> p_expected_current_world_uid then
    raise exception using errcode = 'P0001', message = 'PUBLIC_SYNC_WORLD_UID_CHANGED';
  end if;
  if exists (
    select 1 from public.breeding_jobs
     where world_id = p_world_id
       and status in ('processing', 'algorithm_completed', 'ai_enriching')
  ) then
    raise exception using errcode = 'P0001', message = 'PUBLIC_SYNC_PROCESSING_JOBS_ACTIVE';
  end if;
  if not coalesce(p_allow_recent_save_worker, false)
     and exists (
       select 1 from public.agent_worker_heartbeats
        where worker_kind = 'save_worker'
          and heartbeat_at >= now() - interval '5 minutes'
     ) then
    raise exception using errcode = 'P0001', message = 'PUBLIC_SYNC_SAVE_WORKER_ACTIVE';
  end if;

  v_preflight := public.preflight_public_sync_world_transition(p_world_id);
  if coalesce((v_preflight ->> 'uid_conflict')::boolean, true) then
    raise exception using errcode = 'P0001', message = 'PUBLIC_SYNC_UID_CONFLICT';
  end if;
  v_target_uid := v_preflight ->> 'target_world_uid';
  select state.binding_count, state.binding_digest
    into v_binding_count, v_binding_digest
    from private.public_sync_binding_state(p_world_id) as state;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_guild_ids
    from public.guilds where world_id = p_world_id;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_player_ids
    from public.players where world_id = p_world_id;
  select count(*)::integer into v_unresolved_count
    from public.pal_snapshot_items
   where snapshot_id = v_world.latest_snapshot_id
     and coalesce(raw_metadata ->> 'resolution_status', 'unresolved') = 'unresolved';

  insert into private.public_sync_world_transitions (
    world_id,
    original_world_uid,
    target_world_uid,
    state,
    guild_ids,
    player_ids,
    binding_count,
    binding_digest,
    latest_snapshot_id_at_transition,
    unresolved_pal_count_at_transition
  ) values (
    p_world_id,
    v_world.world_uid,
    v_target_uid,
    'prepared',
    v_guild_ids,
    v_player_ids,
    v_binding_count,
    v_binding_digest,
    v_world.latest_snapshot_id,
    v_unresolved_count
  );

  insert into private.public_sync_uid_mappings (
    world_id, entity_kind, entity_id, original_uid, target_uid
  ) values (
    p_world_id, 'world', p_world_id, v_world.world_uid, v_target_uid
  );
  insert into private.public_sync_uid_mappings (
    world_id, entity_kind, entity_id, original_uid, target_uid
  )
  select p_world_id, 'guild', guild.id, guild.game_guild_uid,
         private.public_sync_redact_uid(guild.game_guild_uid)
    from public.guilds as guild where guild.world_id = p_world_id;
  insert into private.public_sync_uid_mappings (
    world_id, entity_kind, entity_id, original_uid, target_uid
  )
  select p_world_id, 'player', player.id, player.game_player_uid,
         private.public_sync_redact_uid(player.game_player_uid)
    from public.players as player where player.world_id = p_world_id;
  insert into private.public_sync_uid_mappings (
    world_id, entity_kind, original_uid, target_uid
  )
  select p_world_id, 'pal_share_preference', preference.pal_instance_uid,
         private.public_sync_redact_uid(preference.pal_instance_uid)
    from public.pal_share_preferences as preference
   where preference.world_id = p_world_id;
  insert into private.public_sync_uid_mappings (
    world_id, entity_kind, original_uid, target_uid
  )
  select p_world_id, 'pal_instance_lifecycle', lifecycle.pal_instance_uid,
         private.public_sync_redact_uid(lifecycle.pal_instance_uid)
    from public.pal_instance_lifecycle as lifecycle
   where lifecycle.world_id = p_world_id;

  update public.guilds as guild
     set game_guild_uid = mapping.target_uid
    from private.public_sync_uid_mappings as mapping
   where mapping.world_id = p_world_id
     and mapping.entity_kind = 'guild'
     and mapping.entity_id = guild.id;
  update public.players as player
     set game_player_uid = mapping.target_uid
    from private.public_sync_uid_mappings as mapping
   where mapping.world_id = p_world_id
     and mapping.entity_kind = 'player'
     and mapping.entity_id = player.id;
  update public.pal_share_preferences as preference
     set pal_instance_uid = mapping.target_uid
    from private.public_sync_uid_mappings as mapping
   where mapping.world_id = p_world_id
     and mapping.entity_kind = 'pal_share_preference'
     and preference.world_id = p_world_id
     and preference.pal_instance_uid = mapping.original_uid;
  update public.pal_instance_lifecycle as lifecycle
     set pal_instance_uid = mapping.target_uid
    from private.public_sync_uid_mappings as mapping
   where mapping.world_id = p_world_id
     and mapping.entity_kind = 'pal_instance_lifecycle'
     and lifecycle.world_id = p_world_id
     and lifecycle.pal_instance_uid = mapping.original_uid;
  update public.worlds
     set world_uid = v_target_uid,
         updated_at = now()
   where id = p_world_id;
  update private.public_sync_world_transitions
     set state = 'transitioned', transitioned_at = now()
   where world_id = p_world_id;

  perform private.write_admin_audit(
    null,
    'public_sync.transition',
    'world',
    p_world_id::text,
    null,
    jsonb_build_object(
      'world_id', p_world_id,
      'guild_count', cardinality(v_guild_ids),
      'player_count', cardinality(v_player_ids),
      'binding_count', v_binding_count,
      'share_preference_count', (v_preflight ->> 'share_preference_count')::integer
    )
  );
  return public.verify_public_sync_world_transition(p_world_id);
end;
$$;

revoke all on function public.transition_world_to_public_sync(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.transition_world_to_public_sync(uuid, text, boolean)
  to service_role;

create function public.verify_public_sync_world_transition(p_world_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_transition private.public_sync_world_transitions%rowtype;
  v_world public.worlds%rowtype;
  v_snapshot public.inventory_snapshots%rowtype;
  v_current_player_ids uuid[];
  v_binding_count integer;
  v_binding_digest text;
  v_device_id uuid;
  v_device_world_id uuid;
  v_latest_pal_count integer := 0;
  v_unresolved_count integer := 0;
  v_expected_world_uid text;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  select * into v_transition
    from private.public_sync_world_transitions where world_id = p_world_id;
  if v_transition.world_id is null then
    raise exception using errcode = 'P0001', message = 'PUBLIC_SYNC_TRANSITION_NOT_FOUND';
  end if;
  select * into v_world from public.worlds where id = p_world_id;
  if v_world.id is null then
    raise exception using errcode = 'P0001', message = 'WORLD_NOT_FOUND';
  end if;
  v_expected_world_uid := case
    when v_transition.state = 'transitioned' then v_transition.target_world_uid
    else v_transition.original_world_uid
  end;
  select * into v_snapshot
    from public.inventory_snapshots where id = v_world.latest_snapshot_id;
  select count(*)::integer into v_latest_pal_count
    from public.pal_snapshot_items where snapshot_id = v_world.latest_snapshot_id;
  select count(*)::integer into v_unresolved_count
    from public.pal_snapshot_items
   where snapshot_id = v_world.latest_snapshot_id
     and coalesce(raw_metadata ->> 'resolution_status', 'unresolved') = 'unresolved';
  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_current_player_ids
    from public.players where world_id = p_world_id;
  select state.binding_count, state.binding_digest
    into v_binding_count, v_binding_digest
    from private.public_sync_binding_state(p_world_id) as state;
  select publication.device_id, device.world_id
    into v_device_id, v_device_world_id
    from private.public_sync_snapshot_publications as publication
    join public.sync_devices as device on device.id = publication.device_id
   where publication.snapshot_id = v_world.latest_snapshot_id
   order by publication.published_at desc, publication.device_id
   limit 1;

  return jsonb_build_object(
    'world_id', p_world_id,
    'world_id_preserved', v_world.id = v_transition.world_id,
    'single_world', (
      select count(*) = 1 and bool_and(id = p_world_id)
        from public.worlds where world_uid = v_expected_world_uid
    ),
    'player_ids_preserved', v_current_player_ids = v_transition.player_ids,
    'bindings_preserved',
      v_binding_count = v_transition.binding_count
      and v_binding_digest = v_transition.binding_digest,
    'binding_count', v_binding_count,
    'guild_count', (select count(*)::integer from public.guilds where world_id = p_world_id),
    'player_count', cardinality(v_current_player_ids),
    'duplicate_guild_count', (
      select count(*)::integer
        from public.guilds as guild
       where guild.world_id = p_world_id
         and guild.game_guild_uid in (
           select case when v_transition.state = 'transitioned' then mapping.original_uid else mapping.target_uid end
             from private.public_sync_uid_mappings as mapping
            where mapping.world_id = p_world_id and mapping.entity_kind = 'guild'
         )
    ),
    'duplicate_player_count', (
      select count(*)::integer
        from public.players as player
       where player.world_id = p_world_id
         and player.game_player_uid in (
           select case when v_transition.state = 'transitioned' then mapping.original_uid else mapping.target_uid end
             from private.public_sync_uid_mappings as mapping
            where mapping.world_id = p_world_id and mapping.entity_kind = 'player'
         )
    ),
    'latest_snapshot_id', v_world.latest_snapshot_id,
    'latest_parser_name', v_snapshot.parser_name,
    'latest_parser_version', v_snapshot.parser_version,
    'latest_pal_count', v_latest_pal_count,
    'latest_unresolved_count', v_unresolved_count,
    'unresolved_count_increased',
      v_unresolved_count > v_transition.unresolved_pal_count_at_transition,
    'latest_snapshot_source', case
      when v_device_id is null then 'agent' else 'public_sync'
    end,
    'sync_device_id', v_device_id,
    'sync_device_world_id', v_device_world_id,
    'data_status', case
      when v_snapshot.status = 'published' and v_snapshot.payload_purged_at is null
        then 'normal'
      else 'invalid'
    end,
    'migration_state', v_transition.state
  );
end;
$$;

revoke all on function public.verify_public_sync_world_transition(uuid)
  from public, anon, authenticated;
grant execute on function public.verify_public_sync_world_transition(uuid)
  to service_role;

create function public.rollback_public_sync_world_transition(p_world_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_transition private.public_sync_world_transitions%rowtype;
  v_world public.worlds%rowtype;
  v_current_guild_ids uuid[];
  v_current_player_ids uuid[];
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  select * into v_transition
    from private.public_sync_world_transitions
   where world_id = p_world_id
   for update;
  if v_transition.world_id is null then
    raise exception using errcode = 'P0001', message = 'PUBLIC_SYNC_TRANSITION_NOT_FOUND';
  end if;
  if v_transition.state = 'rolled_back' then
    return public.verify_public_sync_world_transition(p_world_id);
  end if;
  if v_transition.state <> 'transitioned' then
    raise exception using errcode = 'P0001', message = 'PUBLIC_SYNC_TRANSITION_STATE_CHANGED';
  end if;
  if exists (
    select 1 from public.sync_devices
     where world_id = p_world_id and revoked_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'PUBLIC_SYNC_DEVICE_ACTIVE';
  end if;
  select * into v_world
    from public.worlds where id = p_world_id for update;
  if v_world.world_uid <> v_transition.target_world_uid then
    raise exception using errcode = 'P0001', message = 'PUBLIC_SYNC_TRANSITION_STATE_CHANGED';
  end if;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_current_guild_ids
    from public.guilds where world_id = p_world_id;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_current_player_ids
    from public.players where world_id = p_world_id;
  if v_current_guild_ids <> v_transition.guild_ids
     or v_current_player_ids <> v_transition.player_ids then
    raise exception using errcode = 'P0001', message = 'PUBLIC_SYNC_IDENTITY_SET_CHANGED';
  end if;
  if exists (
    select 1
      from private.public_sync_uid_mappings as mapping
     where mapping.world_id = p_world_id
       and mapping.entity_kind = 'guild'
       and not exists (
         select 1 from public.guilds as guild
          where guild.id = mapping.entity_id
            and guild.world_id = p_world_id
            and guild.game_guild_uid = mapping.target_uid
       )
  ) or exists (
    select 1
      from private.public_sync_uid_mappings as mapping
     where mapping.world_id = p_world_id
       and mapping.entity_kind = 'player'
       and not exists (
         select 1 from public.players as player
          where player.id = mapping.entity_id
            and player.world_id = p_world_id
            and player.game_player_uid = mapping.target_uid
       )
  ) or exists (
    select 1
      from private.public_sync_uid_mappings as mapping
     where mapping.world_id = p_world_id
       and mapping.entity_kind = 'pal_share_preference'
       and not exists (
         select 1 from public.pal_share_preferences as preference
          where preference.world_id = p_world_id
            and preference.pal_instance_uid = mapping.target_uid
       )
  ) or exists (
    select 1
      from private.public_sync_uid_mappings as mapping
     where mapping.world_id = p_world_id
       and mapping.entity_kind = 'pal_instance_lifecycle'
       and not exists (
         select 1 from public.pal_instance_lifecycle as lifecycle
          where lifecycle.world_id = p_world_id
            and lifecycle.pal_instance_uid = mapping.target_uid
       )
  ) then
    raise exception using errcode = 'P0001', message = 'PUBLIC_SYNC_TRANSITION_STATE_CHANGED';
  end if;

  update public.guilds as guild
     set game_guild_uid = mapping.original_uid
    from private.public_sync_uid_mappings as mapping
   where mapping.world_id = p_world_id
     and mapping.entity_kind = 'guild'
     and mapping.entity_id = guild.id
     and guild.game_guild_uid = mapping.target_uid;
  update public.players as player
     set game_player_uid = mapping.original_uid
    from private.public_sync_uid_mappings as mapping
   where mapping.world_id = p_world_id
     and mapping.entity_kind = 'player'
     and mapping.entity_id = player.id
     and player.game_player_uid = mapping.target_uid;
  update public.pal_share_preferences as preference
     set pal_instance_uid = mapping.original_uid
    from private.public_sync_uid_mappings as mapping
   where mapping.world_id = p_world_id
     and mapping.entity_kind = 'pal_share_preference'
     and preference.world_id = p_world_id
     and preference.pal_instance_uid = mapping.target_uid;
  update public.pal_instance_lifecycle as lifecycle
     set pal_instance_uid = mapping.original_uid
    from private.public_sync_uid_mappings as mapping
   where mapping.world_id = p_world_id
     and mapping.entity_kind = 'pal_instance_lifecycle'
     and lifecycle.world_id = p_world_id
     and lifecycle.pal_instance_uid = mapping.target_uid;
  update public.worlds
     set world_uid = v_transition.original_world_uid,
         updated_at = now()
   where id = p_world_id and world_uid = v_transition.target_world_uid;
  update private.public_sync_world_transitions
     set state = 'rolled_back', rolled_back_at = now()
   where world_id = p_world_id;

  perform private.write_admin_audit(
    null,
    'public_sync.rollback',
    'world',
    p_world_id::text,
    null,
    jsonb_build_object(
      'world_id', p_world_id,
      'guild_count', cardinality(v_transition.guild_ids),
      'player_count', cardinality(v_transition.player_ids),
      'binding_count', v_transition.binding_count
    )
  );
  return public.verify_public_sync_world_transition(p_world_id);
end;
$$;

revoke all on function public.rollback_public_sync_world_transition(uuid)
  from public, anon, authenticated;
grant execute on function public.rollback_public_sync_world_transition(uuid)
  to service_role;

alter function public.publish_sync_device_snapshot(text, jsonb) set schema private;
revoke all on function private.publish_sync_device_snapshot(text, jsonb)
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
  v_result jsonb;
  v_device_id uuid;
  v_world_id uuid;
  v_snapshot_id uuid;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  v_result := private.publish_sync_device_snapshot(p_token_hash, p_snapshot);
  v_world_id := (v_result ->> 'world_id')::uuid;
  v_snapshot_id := (v_result ->> 'snapshot_id')::uuid;
  select id into v_device_id
    from public.sync_devices
   where token_hash = p_token_hash and revoked_at is null;
  if v_device_id is null then
    raise exception using errcode = 'P0001', message = 'SYNC_DEVICE_UNAUTHORIZED';
  end if;
  insert into private.public_sync_snapshot_publications (
    snapshot_id, device_id, world_id
  ) values (
    v_snapshot_id, v_device_id, v_world_id
  ) on conflict (snapshot_id, device_id) do update
    set published_at = excluded.published_at;
  return v_result;
end;
$$;

revoke all on function public.publish_sync_device_snapshot(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_sync_device_snapshot(text, jsonb)
  to service_role;

comment on table private.public_sync_world_transitions is
  'Private rollback state for one in-place durable external-UID transition; never browser-readable.';
comment on table private.public_sync_uid_mappings is
  'Original-to-pb1 UID mappings for world, guild, player, share preference, and lifecycle rollback.';
comment on table private.public_sync_snapshot_publications is
  'Formal source attribution for immutable snapshots published through a public Sync device.';
comment on function public.preflight_public_sync_world_transition(uuid) is
  'Read-only service-role preflight for an in-place public Sync identity transition.';
comment on function public.transition_world_to_public_sync(uuid, text, boolean) is
  'Atomically backs up and redacts durable external UIDs while preserving UUID primary keys and immutable history.';
comment on function public.rollback_public_sync_world_transition(uuid) is
  'Restores backed-up durable external UIDs after every bound Sync device is revoked.';
comment on function public.verify_public_sync_world_transition(uuid) is
  'Returns a safe service-role cutover report without original external UIDs.';
