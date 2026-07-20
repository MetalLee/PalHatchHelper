create or replace function public.create_breeding_job_v2(
  p_target_pal_id text,
  p_desired_passive_ids text[] default '{}',
  p_optimization_mode public.optimization_mode default 'balanced',
  p_allow_guild_shared boolean default true,
  p_max_generations integer default 5
)
returns table (job_id uuid, reused boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requester_user_id uuid := auth.uid();
  v_player_id uuid;
  v_world_id uuid;
  v_guild_id uuid;
  v_snapshot_id uuid;
  v_game_version_id uuid;
  v_breeding_version_id uuid;
  v_content_hash text;
  v_algorithm_version text;
  v_scoring_profile_version text;
  v_passive_ids text[];
  v_fingerprint text;
  v_job_id uuid;
begin
  if v_requester_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_target_pal_id is null
    or btrim(p_target_pal_id) !~ '^[a-z0-9][a-z0-9._-]*$'
    or char_length(btrim(p_target_pal_id)) not between 1 and 120
  then
    raise exception using errcode = 'P0001', message = 'INVALID_TARGET_PAL';
  end if;
  if p_desired_passive_ids is null
    or cardinality(p_desired_passive_ids) not between 0 and 4
    or not public.is_stable_id_array(p_desired_passive_ids)
    or cardinality(p_desired_passive_ids) <> (
      select count(distinct value)::integer from unnest(p_desired_passive_ids) as value
    )
  then
    raise exception using errcode = 'P0001', message = 'INVALID_DESIRED_PASSIVES';
  end if;
  if p_optimization_mode is null then
    raise exception using errcode = 'P0001', message = 'INVALID_OPTIMIZATION_MODE';
  end if;
  if p_allow_guild_shared is null then
    raise exception using errcode = 'P0001', message = 'INVALID_GUILD_SHARING';
  end if;
  if p_max_generations is null or p_max_generations not between 1 and 8 then
    raise exception using errcode = 'P0001', message = 'INVALID_MAX_GENERATIONS';
  end if;

  select coalesce(array_agg(value order by value), '{}'::text[])
    into v_passive_ids
    from unnest(p_desired_passive_ids) as value;

  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception using errcode = 'P0001', message = 'PLAYER_BINDING_REQUIRED';
  end if;

  select
    player.world_id,
    player.guild_id,
    world.latest_snapshot_id,
    world.active_game_data_version_id,
    world.active_breeding_version_id,
    version.content_hash
  into
    v_world_id,
    v_guild_id,
    v_snapshot_id,
    v_game_version_id,
    v_breeding_version_id,
    v_content_hash
  from public.players as player
  join public.worlds as world on world.id = player.world_id
  left join public.game_data_versions as version
    on version.id = world.active_game_data_version_id
   and version.status = 'published'
  where player.id = v_player_id
  for share of world;

  if v_world_id is null then
    raise exception using errcode = 'P0001', message = 'PLAYER_BINDING_INVALID';
  end if;
  if v_snapshot_id is null or not exists (
    select 1 from public.inventory_snapshots as snapshot
     where snapshot.id = v_snapshot_id
       and snapshot.world_id = v_world_id
       and snapshot.status = 'published'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_INVENTORY_SNAPSHOT_REQUIRED';
  end if;
  if v_game_version_id is null or v_content_hash is null then
    raise exception using errcode = 'P0001', message = 'PUBLISHED_GAME_DATA_VERSION_REQUIRED';
  end if;
  if v_breeding_version_id is distinct from v_game_version_id or not exists (
    select 1 from public.breeding_data_versions as version
     where version.id = v_breeding_version_id and version.status = 'published'
  ) then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_COMPATIBILITY_VERSION_REQUIRED';
  end if;
  if not exists (
    select 1 from public.catalog_pals
     where version_id = v_game_version_id and pal_id = btrim(p_target_pal_id)
  ) then
    raise exception using errcode = 'P0001', message = 'TARGET_PAL_NOT_IN_GAME_DATA_VERSION';
  end if;
  if exists (
    select 1 from unnest(v_passive_ids) as passive_id
     where not exists (
       select 1 from public.catalog_passive_skills as skill
        where skill.version_id = v_game_version_id
          and skill.passive_skill_id = passive_id
     )
  ) then
    raise exception using errcode = 'P0001', message = 'DESIRED_PASSIVE_NOT_IN_GAME_DATA_VERSION';
  end if;

  select profile.algorithm_version, profile.version
    into v_algorithm_version, v_scoring_profile_version
    from public.scoring_profiles as profile
   where profile.optimization_mode = p_optimization_mode
     and profile.is_active;
  if v_algorithm_version is null or v_scoring_profile_version is null then
    raise exception using errcode = 'P0001', message = 'ACTIVE_SCORING_PROFILE_REQUIRED';
  end if;

  v_fingerprint := encode(extensions.digest(convert_to(concat_ws(
    '|',
    v_requester_user_id::text,
    v_player_id::text,
    btrim(p_target_pal_id),
    array_to_string(v_passive_ids, ','),
    v_snapshot_id::text,
    v_game_version_id::text,
    v_content_hash,
    v_algorithm_version,
    v_scoring_profile_version,
    p_optimization_mode::text,
    p_allow_guild_shared::text,
    p_max_generations::text
  ), 'UTF8'), 'sha256'), 'hex');

  select job.id into v_job_id
    from public.breeding_jobs as job
   where job.requester_user_id = v_requester_user_id
     and job.request_fingerprint = v_fingerprint
     and job.status not in ('completed', 'failed', 'cancelled')
   order by job.created_at, job.id
   limit 1;
  if found then
    job_id := v_job_id;
    reused := true;
    return next;
    return;
  end if;

  insert into public.breeding_jobs (
    requester_user_id, world_id, player_id, guild_id,
    target_pal_id, desired_passive_ids, optimization_mode,
    inventory_snapshot_id, breeding_data_version_id, game_data_version_id,
    game_data_content_hash, algorithm_version, scoring_profile_version,
    allow_guild_shared, max_generations, request_fingerprint, idempotency_key
  ) values (
    v_requester_user_id, v_world_id, v_player_id, v_guild_id,
    btrim(p_target_pal_id), v_passive_ids, p_optimization_mode,
    v_snapshot_id, v_breeding_version_id, v_game_version_id,
    v_content_hash, v_algorithm_version, v_scoring_profile_version,
    p_allow_guild_shared, p_max_generations, v_fingerprint,
    'auto:' || v_fingerprint || ':' || gen_random_uuid()::text
  )
  on conflict do nothing
  returning id into v_job_id;

  if v_job_id is null then
    select job.id into v_job_id
      from public.breeding_jobs as job
     where job.requester_user_id = v_requester_user_id
       and job.request_fingerprint = v_fingerprint
       and job.status not in ('completed', 'failed', 'cancelled')
     order by job.created_at, job.id
     limit 1;
    if v_job_id is null then
      raise exception using errcode = 'P0001', message = 'JOB_CREATE_CONFLICT';
    end if;
    reused := true;
  else
    reused := false;
  end if;
  job_id := v_job_id;
  return next;
end;
$$;

comment on function public.create_breeding_job_v2(
  text, text[], public.optimization_mode, boolean, integer
) is
  'Creates one fixed-input job, reuses only active matching work, and preserves terminal history.';
