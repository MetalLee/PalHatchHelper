alter table public.breeding_jobs
  add column game_data_content_hash text,
  add column allow_guild_shared boolean not null default true,
  add column max_generations integer not null default 5;

update public.breeding_jobs as job
   set game_data_content_hash = version.content_hash
  from public.game_data_versions as version
 where version.id = job.game_data_version_id;

alter table public.breeding_jobs
  alter column game_data_content_hash set not null,
  add constraint breeding_jobs_content_hash_check
    check (game_data_content_hash ~ '^[0-9a-f]{64}$'),
  add constraint breeding_jobs_max_generations_check
    check (max_generations between 1 and 8);

alter table public.breeding_plans
  add column result_digest text,
  add column route_count integer not null default 0,
  add column explanation_codes text[] not null default '{}',
  add column diagnostics jsonb not null default '{}'::jsonb,
  add column ai_degraded boolean not null default false,
  add constraint breeding_plans_result_digest_check
    check (result_digest is null or result_digest ~ '^[0-9a-f]{64}$'),
  add constraint breeding_plans_route_count_check check (route_count between 0 and 3),
  add constraint breeding_plans_explanation_codes_check
    check (
      explanation_codes = '{}'
      or (
        cardinality(explanation_codes) <= 32
        and array_to_string(explanation_codes, ',')
          ~ '^[A-Z][A-Z0-9_]*(,[A-Z][A-Z0-9_]*)*$'
      )
    ),
  add constraint breeding_plans_diagnostics_check check (jsonb_typeof(diagnostics) = 'object');

alter table public.breeding_routes
  add column route_key text,
  add column optimization_mode public.optimization_mode,
  add column difficulty text,
  add column route_payload jsonb not null default '{}'::jsonb,
  add column ai_explanation text,
  add column ai_labels text[] not null default '{}';

update public.breeding_routes
   set route_key = encode(extensions.digest(convert_to(id::text, 'UTF8'), 'sha256'), 'hex'),
       optimization_mode = 'balanced',
       difficulty = 'medium';

alter table public.breeding_routes
  alter column route_key set not null,
  alter column optimization_mode set not null,
  alter column difficulty set not null,
  add constraint breeding_routes_route_key_check check (route_key ~ '^[0-9a-f]{64}$'),
  add constraint breeding_routes_difficulty_check check (difficulty in ('low', 'medium', 'high')),
  add constraint breeding_routes_route_payload_check check (jsonb_typeof(route_payload) = 'object'),
  add constraint breeding_routes_ai_explanation_check
    check (ai_explanation is null or char_length(ai_explanation) <= 4000),
  add constraint breeding_routes_ai_labels_check
    check (cardinality(ai_labels) <= 6),
  add constraint breeding_routes_plan_route_key unique (plan_id, route_key);

alter table public.breeding_routes drop constraint breeding_routes_attempts_check;
alter table public.breeding_routes
  add constraint breeding_routes_attempts_check check (
    (estimated_attempts_min is null and estimated_attempts_max is null)
    or (
      estimated_attempts_min is not null
      and estimated_attempts_max is not null
      and estimated_attempts_min >= 0
      and estimated_attempts_max >= estimated_attempts_min
    )
  );

create function public.create_breeding_job_v2(
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
    p_allow_guild_shared, p_max_generations, v_fingerprint, 'auto:' || v_fingerprint
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
      select job.id into v_job_id
        from public.breeding_jobs as job
       where job.requester_user_id = v_requester_user_id
         and job.idempotency_key = 'auto:' || v_fingerprint
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

create function public.persist_breeding_algorithm_result(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_result jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.breeding_jobs%rowtype;
  v_plan_id uuid;
  v_route jsonb;
  v_route_keys text[] := '{}';
  v_route_count integer;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_result is null
    or jsonb_typeof(p_result) <> 'object'
    or octet_length(p_result::text) > 2000000
    or (p_result->>'result_digest') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_result->'routes') <> 'array'
    or jsonb_array_length(p_result->'routes') > 3
  then
    raise exception using errcode = 'P0001', message = 'INVALID_BREEDING_RESULT';
  end if;

  select * into v_job from public.breeding_jobs as job
   where job.id = p_job_id
     and job.locked_by = btrim(p_worker_id)
     and job.lease_token = p_lease_token
     and job.status in ('processing', 'algorithm_completed')
   for update;
  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'JOB_LOCK_NOT_OWNED';
  end if;
  if p_result->>'target_pal_id' <> v_job.target_pal_id
    or (p_result->>'inventory_snapshot_id')::uuid <> v_job.inventory_snapshot_id
    or (p_result->>'game_data_version_id')::uuid <> v_job.game_data_version_id
    or p_result->>'game_data_content_hash' <> v_job.game_data_content_hash
    or p_result->>'algorithm_version' <> v_job.algorithm_version
    or p_result->>'scoring_profile_version' <> v_job.scoring_profile_version
    or p_result->>'optimization_mode' <> v_job.optimization_mode::text
  then
    raise exception using errcode = 'P0001', message = 'BREEDING_RESULT_VERSION_MISMATCH';
  end if;

  insert into public.breeding_plans (
    job_id, result_digest, route_count, explanation_codes, diagnostics, generated_at
  ) values (
    p_job_id,
    p_result->>'result_digest',
    jsonb_array_length(p_result->'routes'),
    array(select jsonb_array_elements_text(coalesce(p_result->'explanation_codes', '[]'))),
    coalesce(p_result->'diagnostics', '{}'::jsonb),
    now()
  )
  on conflict (job_id) do update
    set result_digest = excluded.result_digest,
        route_count = excluded.route_count,
        explanation_codes = excluded.explanation_codes,
        diagnostics = excluded.diagnostics,
        generated_at = excluded.generated_at
  returning id into v_plan_id;

  update public.breeding_plans set recommended_route_id = null where id = v_plan_id;
  for v_route in select value from jsonb_array_elements(p_result->'routes')
  loop
    if (v_route->>'route_key') !~ '^[0-9a-f]{64}$'
      or jsonb_typeof(v_route->'score_breakdown') <> 'object'
      or jsonb_typeof(v_route->'steps') <> 'array'
    then
      raise exception using errcode = 'P0001', message = 'INVALID_BREEDING_ROUTE';
    end if;
    v_route_keys := array_append(v_route_keys, v_route->>'route_key');
    insert into public.breeding_routes (
      plan_id, route_key, rank, optimization_mode, total_score,
      generation_count, estimated_attempts_min, estimated_attempts_max,
      difficulty, borrowed_pal_count, inventory_coverage, inheritance_score,
      score_breakdown, route_payload
    ) values (
      v_plan_id,
      v_route->>'route_key',
      (v_route->>'rank')::integer,
      (v_route->>'optimization_mode')::public.optimization_mode,
      (v_route->>'total_score')::numeric,
      (v_route->>'generation_count')::integer,
      (v_route->>'estimated_attempts_min')::integer,
      (v_route->>'estimated_attempts_max')::integer,
      v_route->>'difficulty',
      (v_route->>'borrowed_pal_count')::integer,
      (v_route->>'inventory_coverage')::numeric,
      (v_route->>'inheritance_score')::numeric,
      v_route->'score_breakdown',
      v_route
    )
    on conflict (plan_id, route_key) do update
      set rank = excluded.rank,
          optimization_mode = excluded.optimization_mode,
          total_score = excluded.total_score,
          generation_count = excluded.generation_count,
          estimated_attempts_min = excluded.estimated_attempts_min,
          estimated_attempts_max = excluded.estimated_attempts_max,
          difficulty = excluded.difficulty,
          borrowed_pal_count = excluded.borrowed_pal_count,
          inventory_coverage = excluded.inventory_coverage,
          inheritance_score = excluded.inheritance_score,
          score_breakdown = excluded.score_breakdown,
          route_payload = excluded.route_payload;
  end loop;

  delete from public.breeding_routes as route
   where route.plan_id = v_plan_id
     and not (route.route_key = any(v_route_keys));
  select count(*)::integer into v_route_count
    from public.breeding_routes where plan_id = v_plan_id;
  update public.breeding_plans
     set route_count = v_route_count,
         recommended_route_id = (
           select route.id from public.breeding_routes as route
            where route.plan_id = v_plan_id order by route.rank limit 1
         )
   where id = v_plan_id;
  update public.breeding_jobs
     set status = 'algorithm_completed', heartbeat_at = now(), updated_at = now()
   where id = p_job_id;
  return v_plan_id;
end;
$$;

create function public.persist_breeding_ai_result(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_provider text,
  p_model text,
  p_explanation text,
  p_degraded boolean,
  p_route_explanations jsonb default '[]'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan_id uuid;
  v_item jsonb;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_provider not in ('openai_compatible', 'codex_cli', 'template')
    or p_degraded is null
    or (p_model is not null and char_length(p_model) > 120)
    or (p_explanation is not null and char_length(p_explanation) > 10000)
    or jsonb_typeof(p_route_explanations) <> 'array'
    or jsonb_array_length(p_route_explanations) > 3
    or octet_length(p_route_explanations::text) > 30000
  then
    raise exception using errcode = 'P0001', message = 'INVALID_AI_EXPLANATION';
  end if;
  select plan.id into v_plan_id
    from public.breeding_jobs as job
    join public.breeding_plans as plan on plan.job_id = job.id
   where job.id = p_job_id
     and job.locked_by = btrim(p_worker_id)
     and job.lease_token = p_lease_token
     and job.status in ('algorithm_completed', 'ai_enriching')
   for update of job, plan;
  if v_plan_id is null then
    raise exception using errcode = 'P0001', message = 'JOB_LOCK_NOT_OWNED';
  end if;

  for v_item in select value from jsonb_array_elements(p_route_explanations)
  loop
    update public.breeding_routes
       set ai_explanation = left(v_item->>'explanation', 4000),
           ai_labels = array(
             select left(value, 80)
             from jsonb_array_elements_text(coalesce(v_item->'labels', '[]'))
             limit 6
           )
     where plan_id = v_plan_id and route_key = v_item->>'route_key';
  end loop;
  update public.breeding_plans
     set ai_provider = p_provider,
         ai_model = p_model,
         ai_explanation = p_explanation,
         ai_degraded = p_degraded
   where id = v_plan_id;
  update public.breeding_jobs
     set status = 'ai_enriching', heartbeat_at = now(), updated_at = now()
   where id = p_job_id;
  return true;
end;
$$;

create function private.breeding_parent_view(p_parent jsonb)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (p_parent - 'owner_player_id' - 'guild_id') || jsonb_build_object(
    'owner_display_name',
    case
      when p_parent->>'source_type' = 'intermediate' then '中间产物'
      else coalesce((
        select player.nickname from public.players as player
         where player.id = nullif(p_parent->>'owner_player_id', '')::uuid
      ), '未知所有者')
    end
  );
$$;

create function private.breeding_route_view(p_route jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_step jsonb;
  v_steps jsonb := '[]'::jsonb;
begin
  for v_step in select value from jsonb_array_elements(coalesce(p_route->'steps', '[]'))
  loop
    v_step := jsonb_set(
      jsonb_set(v_step, '{parent_a}', private.breeding_parent_view(v_step->'parent_a')),
      '{parent_b}', private.breeding_parent_view(v_step->'parent_b')
    );
    v_steps := v_steps || jsonb_build_array(v_step);
  end loop;
  return jsonb_set(p_route, '{steps}', v_steps);
end;
$$;

create function public.get_breeding_job_detail(p_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.breeding_jobs%rowtype;
  v_plan jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error_code', 'AUTH_REQUIRED');
  end if;
  select * into v_job from public.breeding_jobs as job
   where job.id = p_job_id
     and (job.requester_user_id = auth.uid() or public.is_admin());
  if v_job.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'JOB_NOT_FOUND');
  end if;

  select jsonb_build_object(
    'plan_id', plan.id,
    'result_digest', plan.result_digest,
    'route_count', plan.route_count,
    'explanation_codes', plan.explanation_codes,
    'diagnostics', plan.diagnostics,
    'ai', jsonb_build_object(
      'provider', plan.ai_provider,
      'model', plan.ai_model,
      'explanation', plan.ai_explanation,
      'degraded', plan.ai_degraded
    ),
    'routes', coalesce((
      select jsonb_agg(
        private.breeding_route_view(route.route_payload) || jsonb_build_object(
          'ai_explanation', route.ai_explanation,
          'ai_labels', route.ai_labels
        ) order by route.rank
      )
      from public.breeding_routes as route where route.plan_id = plan.id
    ), '[]'::jsonb)
  ) into v_plan
  from public.breeding_plans as plan where plan.job_id = v_job.id;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'job_id', v_job.id,
      'status', v_job.status,
      'target_pal_id', v_job.target_pal_id,
      'desired_passive_ids', v_job.desired_passive_ids,
      'optimization_mode', v_job.optimization_mode,
      'allow_guild_shared', v_job.allow_guild_shared,
      'max_generations', v_job.max_generations,
      'inventory_snapshot_id', v_job.inventory_snapshot_id,
      'game_data_version_id', v_job.game_data_version_id,
      'game_data_content_hash', v_job.game_data_content_hash,
      'algorithm_version', v_job.algorithm_version,
      'scoring_profile_version', v_job.scoring_profile_version,
      'attempt_count', v_job.attempt_count,
      'error_code', v_job.error_code,
      'created_at', v_job.created_at,
      'completed_at', v_job.completed_at,
      'plan', v_plan
    )
  );
end;
$$;

revoke all on function public.create_breeding_job_v2(
  text, text[], public.optimization_mode, boolean, integer
) from public, anon;
grant execute on function public.create_breeding_job_v2(
  text, text[], public.optimization_mode, boolean, integer
) to authenticated;

revoke all on function public.get_breeding_job_detail(uuid) from public, anon;
grant execute on function public.get_breeding_job_detail(uuid) to authenticated;

revoke all on function public.persist_breeding_algorithm_result(uuid, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.persist_breeding_ai_result(
  uuid, text, uuid, text, text, text, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.persist_breeding_algorithm_result(uuid, text, uuid, jsonb)
  to service_role;
grant execute on function public.persist_breeding_ai_result(
  uuid, text, uuid, text, text, text, boolean, jsonb
) to service_role;

revoke all on function private.breeding_parent_view(jsonb) from public, anon, authenticated;
revoke all on function private.breeding_route_view(jsonb) from public, anon, authenticated;

comment on function public.create_breeding_job_v2(
  text, text[], public.optimization_mode, boolean, integer
) is 'Creates an owner-bound idempotent Phase 6 job while atomically pinning snapshot, catalog hash, algorithm and scoring versions.';
comment on function public.persist_breeding_algorithm_result(uuid, text, uuid, jsonb) is
  'Service-only fenced and idempotent persistence boundary for at most three deterministic route comparisons.';
comment on function public.persist_breeding_ai_result(
  uuid, text, uuid, text, text, text, boolean, jsonb
) is 'Service-only fenced persistence for explanatory AI output; deterministic route facts remain unchanged.';
comment on function public.get_breeding_job_detail(uuid) is
  'Owner/admin refresh-safe projection that removes internal player and guild UUIDs from route facts.';
