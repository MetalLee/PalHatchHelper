create function public.create_breeding_job(
  p_target_pal_id text,
  p_desired_passive_ids text[] default '{}',
  p_optimization_mode public.optimization_mode default 'balanced',
  p_idempotency_key text default null
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
  v_breeding_version_id uuid;
  v_algorithm_version text;
  v_scoring_profile_version text;
  v_passive_ids text[];
  v_fingerprint text;
  v_idempotency_key text;
  v_job_id uuid;
  v_existing_fingerprint text;
begin
  if v_requester_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_target_pal_id is null or char_length(btrim(p_target_pal_id)) not between 1 and 120 then
    raise exception using errcode = 'P0001', message = 'INVALID_TARGET_PAL';
  end if;
  if p_desired_passive_ids is null
    or cardinality(p_desired_passive_ids) not between 0 and 4
    or not public.is_valid_id_array(p_desired_passive_ids)
  then
    raise exception using errcode = 'P0001', message = 'INVALID_DESIRED_PASSIVES';
  end if;
  if p_optimization_mode is null then
    raise exception using errcode = 'P0001', message = 'INVALID_OPTIMIZATION_MODE';
  end if;
  if p_idempotency_key is not null
    and char_length(btrim(p_idempotency_key)) not between 1 and 128
  then
    raise exception using errcode = 'P0001', message = 'INVALID_IDEMPOTENCY_KEY';
  end if;

  select coalesce(array_agg(passive_id order by passive_id), '{}'::text[])
    into v_passive_ids
    from unnest(p_desired_passive_ids) as passive_id;

  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception using errcode = 'P0001', message = 'PLAYER_BINDING_REQUIRED';
  end if;

  select
    player.world_id,
    player.guild_id,
    world.latest_snapshot_id,
    world.active_breeding_version_id
  into
    v_world_id,
    v_guild_id,
    v_snapshot_id,
    v_breeding_version_id
  from public.players as player
  join public.worlds as world on world.id = player.world_id
  where player.id = v_player_id;

  if v_world_id is null then
    raise exception using errcode = 'P0001', message = 'PLAYER_BINDING_INVALID';
  end if;
  if v_snapshot_id is null or not exists (
    select 1
    from public.inventory_snapshots as snapshot
    where snapshot.id = v_snapshot_id
      and snapshot.world_id = v_world_id
      and snapshot.status = 'published'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_INVENTORY_SNAPSHOT_REQUIRED';
  end if;
  if v_breeding_version_id is null or not exists (
    select 1
    from public.breeding_data_versions as version
    where version.id = v_breeding_version_id
      and version.status = 'published'
  ) then
    raise exception using errcode = 'P0001', message = 'PUBLISHED_BREEDING_VERSION_REQUIRED';
  end if;

  select profile.algorithm_version, profile.version
    into v_algorithm_version, v_scoring_profile_version
    from public.scoring_profiles as profile
   where profile.optimization_mode = p_optimization_mode
     and profile.is_active;

  if v_algorithm_version is null or v_scoring_profile_version is null then
    raise exception using errcode = 'P0001', message = 'ACTIVE_SCORING_PROFILE_REQUIRED';
  end if;

  v_fingerprint := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          v_requester_user_id::text,
          v_player_id::text,
          btrim(p_target_pal_id),
          array_to_string(v_passive_ids, ','),
          v_snapshot_id::text,
          v_breeding_version_id::text,
          p_optimization_mode::text
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_idempotency_key := coalesce(
    nullif(btrim(p_idempotency_key), ''),
    'auto:' || v_fingerprint
  );

  select job.id, job.request_fingerprint
    into v_job_id, v_existing_fingerprint
    from public.breeding_jobs as job
   where job.requester_user_id = v_requester_user_id
     and job.idempotency_key = v_idempotency_key;

  if found then
    if v_existing_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    job_id := v_job_id;
    reused := true;
    return next;
    return;
  end if;

  select job.id
    into v_job_id
    from public.breeding_jobs as job
   where job.requester_user_id = v_requester_user_id
     and job.request_fingerprint = v_fingerprint
     and job.status not in ('completed', 'failed', 'cancelled')
   order by job.created_at
   limit 1;

  if found then
    job_id := v_job_id;
    reused := true;
    return next;
    return;
  end if;

  insert into public.breeding_jobs (
    requester_user_id,
    world_id,
    player_id,
    guild_id,
    target_pal_id,
    desired_passive_ids,
    optimization_mode,
    inventory_snapshot_id,
    breeding_data_version_id,
    algorithm_version,
    scoring_profile_version,
    request_fingerprint,
    idempotency_key
  ) values (
    v_requester_user_id,
    v_world_id,
    v_player_id,
    v_guild_id,
    btrim(p_target_pal_id),
    v_passive_ids,
    p_optimization_mode,
    v_snapshot_id,
    v_breeding_version_id,
    v_algorithm_version,
    v_scoring_profile_version,
    v_fingerprint,
    v_idempotency_key
  )
  on conflict do nothing
  returning id into v_job_id;

  if v_job_id is null then
    select job.id, job.request_fingerprint
      into v_job_id, v_existing_fingerprint
      from public.breeding_jobs as job
     where job.requester_user_id = v_requester_user_id
       and job.idempotency_key = v_idempotency_key
     order by job.created_at
     limit 1;
    if v_job_id is not null and v_existing_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    if v_job_id is null then
      select job.id
        into v_job_id
        from public.breeding_jobs as job
       where job.requester_user_id = v_requester_user_id
         and job.request_fingerprint = v_fingerprint
         and job.status not in ('completed', 'failed', 'cancelled')
       order by job.created_at
       limit 1;
    end if;
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

create function public.set_pal_share_enabled(
  p_pal_instance_uid text,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_player_id uuid;
  v_world_id uuid;
  v_owner_player_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_pal_instance_uid is null
    or char_length(btrim(p_pal_instance_uid)) not between 1 and 160
    or p_enabled is null
  then
    raise exception using errcode = 'P0001', message = 'INVALID_SHARE_PREFERENCE';
  end if;

  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception using errcode = 'P0001', message = 'PLAYER_BINDING_REQUIRED';
  end if;

  select item.world_id, item.owner_player_id
    into v_world_id, v_owner_player_id
    from public.pal_snapshot_items as item
    join public.worlds as world
      on world.id = item.world_id
     and world.latest_snapshot_id = item.snapshot_id
    join public.inventory_snapshots as snapshot
      on snapshot.id = item.snapshot_id
     and snapshot.status = 'published'
   where item.pal_instance_uid = btrim(p_pal_instance_uid)
     and item.owner_player_id = v_player_id;

  if v_owner_player_id is null then
    raise exception using errcode = 'P0001', message = 'PAL_NOT_OWNED';
  end if;

  insert into public.pal_share_preferences (
    world_id,
    pal_instance_uid,
    owner_player_id_at_set,
    share_enabled,
    updated_by,
    updated_at
  ) values (
    v_world_id,
    btrim(p_pal_instance_uid),
    v_owner_player_id,
    p_enabled,
    v_user_id,
    now()
  )
  on conflict (world_id, pal_instance_uid) do update
    set owner_player_id_at_set = excluded.owner_player_id_at_set,
        share_enabled = excluded.share_enabled,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  return p_enabled;
end;
$$;

create function public.list_available_pals(p_scope text default 'all')
returns table (
  snapshot_id uuid,
  pal_instance_uid text,
  pal_id text,
  owner_player_id uuid,
  owner_display_name text,
  guild_id uuid,
  gender public.pal_gender,
  level integer,
  passive_skill_ids text[],
  location_type public.pal_location_type,
  location_name text,
  share_enabled boolean,
  is_owned_by_requester boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_player_id uuid;
  v_world_id uuid;
  v_guild_id uuid;
  v_latest_snapshot_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_scope is null or p_scope not in ('all', 'mine', 'shared') then
    raise exception using errcode = 'P0001', message = 'INVALID_PAL_SCOPE';
  end if;

  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception using errcode = 'P0001', message = 'PLAYER_BINDING_REQUIRED';
  end if;

  select player.world_id, player.guild_id, world.latest_snapshot_id
    into v_world_id, v_guild_id, v_latest_snapshot_id
    from public.players as player
    join public.worlds as world on world.id = player.world_id
   where player.id = v_player_id;

  return query
  select
    item.snapshot_id,
    item.pal_instance_uid,
    item.pal_id,
    item.owner_player_id,
    coalesce(owner_profile.display_name, owner.nickname) as owner_display_name,
    item.guild_id,
    item.gender,
    item.level,
    item.passive_skill_ids,
    item.location_type,
    item.location_name,
    coalesce(preference.share_enabled, true) as share_enabled,
    item.owner_player_id = v_player_id as is_owned_by_requester
  from public.pal_snapshot_items as item
  join public.players as owner on owner.id = item.owner_player_id
  left join public.player_bindings as owner_binding on owner_binding.player_id = owner.id
  left join public.profiles as owner_profile on owner_profile.id = owner_binding.user_id
  left join public.pal_share_preferences as preference
    on preference.world_id = item.world_id
   and preference.pal_instance_uid = item.pal_instance_uid
   and preference.owner_player_id_at_set = item.owner_player_id
  where item.snapshot_id = v_latest_snapshot_id
    and item.world_id = v_world_id
    and (
      (
        p_scope in ('all', 'mine')
        and item.owner_player_id = v_player_id
      )
      or (
        p_scope in ('all', 'shared')
        and item.owner_player_id <> v_player_id
        and item.guild_id is not null
        and item.guild_id = v_guild_id
        and coalesce(preference.share_enabled, true)
      )
    )
  order by item.pal_id, item.pal_instance_uid;
end;
$$;

create function public.update_breeding_step_status(
  p_step_id uuid,
  p_status public.breeding_step_status
)
returns public.breeding_step_status
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current_status public.breeding_step_status;
  v_selected_child text;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_step_id is null or p_status is null or not private.owns_step(p_step_id) then
    raise exception using errcode = 'P0001', message = 'STEP_NOT_OWNED';
  end if;

  select step.status, step.selected_child_instance_uid
    into v_current_status, v_selected_child
    from public.breeding_steps as step
   where step.id = p_step_id
   for update;

  if v_current_status is null then
    raise exception using errcode = 'P0001', message = 'STEP_NOT_FOUND';
  end if;
  if p_status = v_current_status then
    return v_current_status;
  end if;
  if not (
    (v_current_status = 'not_started' and p_status in ('breeding', 'skipped', 'invalidated'))
    or (v_current_status = 'breeding' and p_status in ('candidate_detected', 'retrying', 'skipped', 'invalidated'))
    or (v_current_status = 'candidate_detected' and p_status in ('breeding', 'retrying', 'completed', 'skipped', 'invalidated'))
    or (v_current_status = 'retrying' and p_status in ('breeding', 'skipped', 'invalidated'))
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_STEP_STATUS_TRANSITION';
  end if;
  if p_status = 'completed' and v_selected_child is null then
    raise exception using errcode = 'P0001', message = 'STEP_CHILD_CONFIRMATION_REQUIRED';
  end if;

  update public.breeding_steps
     set status = p_status,
         completed_at = case when p_status = 'completed' then now() else null end,
         updated_at = now()
   where id = p_step_id;

  return p_status;
end;
$$;

create function public.confirm_step_offspring(
  p_step_id uuid,
  p_pal_instance_uid text,
  p_detected_snapshot_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated integer;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_step_id is null
    or p_detected_snapshot_id is null
    or p_pal_instance_uid is null
    or char_length(btrim(p_pal_instance_uid)) not between 1 and 160
    or not private.owns_step(p_step_id)
  then
    raise exception using errcode = 'P0001', message = 'STEP_NOT_OWNED';
  end if;

  perform 1
    from public.breeding_steps as step
   where step.id = p_step_id
     and step.status not in ('completed', 'skipped', 'invalidated')
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'STEP_NOT_CONFIRMABLE';
  end if;

  update public.step_offspring_candidates
     set confirmed = false,
         confirmed_at = null,
         confirmed_by = null
   where step_id = p_step_id
     and confirmed;

  update public.step_offspring_candidates
     set confirmed = true,
         confirmed_at = now(),
         confirmed_by = v_user_id
   where step_id = p_step_id
     and pal_instance_uid = btrim(p_pal_instance_uid)
     and detected_snapshot_id = p_detected_snapshot_id;
  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    raise exception using errcode = 'P0001', message = 'CANDIDATE_NOT_FOUND';
  end if;

  update public.breeding_steps
     set selected_child_instance_uid = btrim(p_pal_instance_uid),
         status = 'completed',
         completed_at = now(),
         updated_at = now()
   where id = p_step_id;

  return true;
end;
$$;

create function public.admin_bind_player(p_user_id uuid, p_player_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_REQUIRED';
  end if;
  if p_user_id is null or p_player_id is null then
    raise exception using errcode = 'P0001', message = 'INVALID_BINDING';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception using errcode = 'P0001', message = 'PLAYER_NOT_FOUND';
  end if;
  if exists (
    select 1
    from public.player_bindings
    where player_id = p_player_id
      and user_id <> p_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'PLAYER_ALREADY_BOUND';
  end if;

  insert into public.player_bindings (user_id, player_id, bound_by, bound_at)
  values (p_user_id, p_player_id, auth.uid(), now())
  on conflict (user_id) do update
    set player_id = excluded.player_id,
        bound_by = excluded.bound_by,
        bound_at = excluded.bound_at,
        claim_code_hash = null;

  return p_player_id;
end;
$$;

create function public.admin_unbind_player(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_REQUIRED';
  end if;
  if p_user_id is null then
    raise exception using errcode = 'P0001', message = 'INVALID_BINDING';
  end if;

  delete from public.player_bindings where user_id = p_user_id;
  return found;
end;
$$;

create function public.admin_publish_breeding_version(
  p_world_id uuid,
  p_version_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status public.breeding_data_status;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_REQUIRED';
  end if;
  if p_world_id is null or p_version_id is null then
    raise exception using errcode = 'P0001', message = 'INVALID_BREEDING_VERSION';
  end if;
  if not exists (select 1 from public.worlds where id = p_world_id) then
    raise exception using errcode = 'P0001', message = 'WORLD_NOT_FOUND';
  end if;

  select version.status
    into v_status
    from public.breeding_data_versions as version
   where version.id = p_version_id
   for update;
  if v_status is null then
    raise exception using errcode = 'P0001', message = 'BREEDING_VERSION_NOT_FOUND';
  end if;
  if v_status not in ('validated', 'published') then
    raise exception using errcode = 'P0001', message = 'BREEDING_VERSION_NOT_VALIDATED';
  end if;

  if v_status = 'validated' then
    update public.breeding_data_versions
       set status = 'published',
           published_at = now(),
           published_by = auth.uid()
     where id = p_version_id;
  end if;

  update public.worlds
     set active_breeding_version_id = p_version_id,
         updated_at = now()
   where id = p_world_id;

  return p_version_id;
end;
$$;

create function public.claim_breeding_job(p_worker_id text)
returns setof public.breeding_jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_worker_id is null or char_length(btrim(p_worker_id)) not between 1 and 128 then
    raise exception using errcode = 'P0001', message = 'INVALID_WORKER_ID';
  end if;

  return query
  with candidate as (
    select job.id
    from public.breeding_jobs as job
    where job.status in ('pending', 'retry_pending')
      and job.attempt_count < job.max_attempts
    order by job.created_at, job.id
    for update skip locked
    limit 1
  )
  update public.breeding_jobs as job
     set status = 'processing',
         locked_by = btrim(p_worker_id),
         locked_at = now(),
         heartbeat_at = now(),
         attempt_count = job.attempt_count + 1,
         error_code = null,
         error_summary = null,
         updated_at = now()
    from candidate
   where job.id = candidate.id
  returning job.*;
end;
$$;

create function public.heartbeat_breeding_job(p_job_id uuid, p_worker_id text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated integer;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_job_id is null
    or p_worker_id is null
    or char_length(btrim(p_worker_id)) not between 1 and 128
  then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_LEASE';
  end if;

  update public.breeding_jobs
     set heartbeat_at = now(),
         updated_at = now()
   where id = p_job_id
     and locked_by = btrim(p_worker_id)
     and status in ('processing', 'algorithm_completed', 'ai_enriching');
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception using errcode = 'P0001', message = 'JOB_LOCK_NOT_OWNED';
  end if;
  return true;
end;
$$;

create function public.complete_breeding_job(p_job_id uuid, p_worker_id text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated integer;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_job_id is null
    or p_worker_id is null
    or char_length(btrim(p_worker_id)) not between 1 and 128
  then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_LEASE';
  end if;

  update public.breeding_jobs
     set status = 'completed',
         locked_by = null,
         locked_at = null,
         heartbeat_at = null,
         error_code = null,
         error_summary = null,
         completed_at = now(),
         updated_at = now()
   where id = p_job_id
     and locked_by = btrim(p_worker_id)
     and status in ('processing', 'algorithm_completed', 'ai_enriching');
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    if exists (
      select 1
      from public.breeding_jobs as job
      where job.id = p_job_id
        and job.status = 'completed'
    ) then
      return true;
    end if;
    raise exception using errcode = 'P0001', message = 'JOB_LOCK_NOT_OWNED';
  end if;
  return true;
end;
$$;

create function public.fail_breeding_job(
  p_job_id uuid,
  p_worker_id text,
  p_error_code text,
  p_retryable boolean,
  p_error_summary text default null
)
returns public.breeding_job_status
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status public.breeding_job_status;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_job_id is null
    or p_worker_id is null
    or char_length(btrim(p_worker_id)) not between 1 and 128
    or p_error_code is null
    or char_length(btrim(p_error_code)) not between 1 and 100
    or p_error_code !~ '^[A-Z][A-Z0-9_]*$'
    or p_retryable is null
    or (p_error_summary is not null and char_length(p_error_summary) > 500)
  then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_FAILURE';
  end if;

  update public.breeding_jobs as job
     set status = case
           when p_retryable and job.attempt_count < job.max_attempts
             then 'retry_pending'::public.breeding_job_status
           else 'failed'::public.breeding_job_status
         end,
         locked_by = null,
         locked_at = null,
         heartbeat_at = null,
         error_code = btrim(p_error_code),
         error_summary = p_error_summary,
         completed_at = case
           when p_retryable and job.attempt_count < job.max_attempts then null
           else now()
         end,
         updated_at = now()
   where job.id = p_job_id
     and job.locked_by = btrim(p_worker_id)
     and job.status in ('processing', 'algorithm_completed', 'ai_enriching')
  returning job.status into v_status;

  if v_status is null then
    raise exception using errcode = 'P0001', message = 'JOB_LOCK_NOT_OWNED';
  end if;
  return v_status;
end;
$$;

create function public.release_stale_breeding_jobs(p_stale_before timestamptz)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_released integer;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_stale_before is null or p_stale_before > now() then
    raise exception using errcode = 'P0001', message = 'INVALID_STALE_BEFORE';
  end if;

  update public.breeding_jobs
     set status = case
           when attempt_count < max_attempts
             then 'retry_pending'::public.breeding_job_status
           else 'failed'::public.breeding_job_status
         end,
         locked_by = null,
         locked_at = null,
         heartbeat_at = null,
         error_code = 'STALE_WORKER_LOCK',
         error_summary = null,
         completed_at = case when attempt_count < max_attempts then null else now() end,
         updated_at = now()
   where status in ('processing', 'algorithm_completed', 'ai_enriching')
     and heartbeat_at < p_stale_before;
  get diagnostics v_released = row_count;
  return v_released;
end;
$$;

revoke all on function public.create_breeding_job(text, text[], public.optimization_mode, text)
  from public, anon, authenticated;
revoke all on function public.set_pal_share_enabled(text, boolean)
  from public, anon, authenticated;
revoke all on function public.list_available_pals(text)
  from public, anon, authenticated;
revoke all on function public.update_breeding_step_status(uuid, public.breeding_step_status)
  from public, anon, authenticated;
revoke all on function public.confirm_step_offspring(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_bind_player(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_unbind_player(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_publish_breeding_version(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.create_breeding_job(text, text[], public.optimization_mode, text)
  to authenticated;
grant execute on function public.set_pal_share_enabled(text, boolean)
  to authenticated;
grant execute on function public.list_available_pals(text)
  to authenticated;
grant execute on function public.update_breeding_step_status(uuid, public.breeding_step_status)
  to authenticated;
grant execute on function public.confirm_step_offspring(uuid, text, uuid)
  to authenticated;
grant execute on function public.admin_bind_player(uuid, uuid)
  to authenticated;
grant execute on function public.admin_unbind_player(uuid)
  to authenticated;
grant execute on function public.admin_publish_breeding_version(uuid, uuid)
  to authenticated;

revoke all on function public.claim_breeding_job(text)
  from public, anon, authenticated;
revoke all on function public.heartbeat_breeding_job(uuid, text)
  from public, anon, authenticated;
revoke all on function public.complete_breeding_job(uuid, text)
  from public, anon, authenticated;
revoke all on function public.fail_breeding_job(uuid, text, text, boolean, text)
  from public, anon, authenticated;
revoke all on function public.release_stale_breeding_jobs(timestamptz)
  from public, anon, authenticated;

grant execute on function public.claim_breeding_job(text) to service_role;
grant execute on function public.heartbeat_breeding_job(uuid, text) to service_role;
grant execute on function public.complete_breeding_job(uuid, text) to service_role;
grant execute on function public.fail_breeding_job(uuid, text, text, boolean, text) to service_role;
grant execute on function public.release_stale_breeding_jobs(timestamptz) to service_role;

comment on function public.create_breeding_job(text, text[], public.optimization_mode, text) is
  'Creates an idempotent player-owned job while fixing all server-controlled versions.';
comment on function public.list_available_pals(text) is
  'Returns a safe projection of own and same-guild shared inventory; raw metadata is never returned.';
comment on function public.claim_breeding_job(text) is
  'Service Role only. Atomically leases one eligible job with FOR UPDATE SKIP LOCKED.';
