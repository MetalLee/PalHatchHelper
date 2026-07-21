alter table public.breeding_plans
  add column missing_passive_ids text[] not null default '{}',
  add constraint breeding_plans_missing_passive_ids_check
    check (cardinality(missing_passive_ids) <= 4);

alter table public.breeding_routes
  drop constraint breeding_routes_adoptability_check,
  add constraint breeding_routes_adoptability_check check (
    (
      feasibility_status = 'ready'
      and adoptable
      and missing_pal_count = 0
      and jsonb_array_length(
        coalesce(route_payload->'missing_passive_ids', '[]'::jsonb)
      ) = 0
    )
    or (
      feasibility_status = 'needs_inventory'
      and not adoptable
      and (
        missing_pal_count > 0
        or jsonb_array_length(
          coalesce(route_payload->'missing_passive_ids', '[]'::jsonb)
        ) > 0
      )
    )
  );

create or replace function private.enforce_adoptable_breeding_route()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
      from public.breeding_routes as route
     where route.id = new.adopted_route_id
       and route.feasibility_status = 'ready'
       and route.adoptable
       and route.missing_pal_count = 0
       and jsonb_array_length(
         coalesce(route.route_payload->'missing_passive_ids', '[]'::jsonb)
       ) = 0
  ) then
    raise exception using errcode = 'P0001', message = 'ROUTE_NOT_ADOPTABLE';
  end if;
  return new;
end;
$$;

create or replace function private.breeding_parent_view(p_parent jsonb)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (p_parent - 'owner_player_id' - 'guild_id') || jsonb_build_object(
    'owner_display_name',
    case p_parent->>'source_type'
      when 'intermediate' then '中间产物'
      when 'missing' then '缺少：需补充库存'
      else coalesce((
        select player.nickname from public.players as player
         where player.id = nullif(p_parent->>'owner_player_id', '')::uuid
      ), '未知所有者')
    end,
    'required_passive_ids',
    case when p_parent->>'source_type' = 'missing'
      then '[]'::jsonb
      else coalesce(p_parent->'required_passive_ids', '[]'::jsonb)
    end
  );
$$;

create or replace function private.breeding_route_view(p_route jsonb)
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
  for v_step in
    select value from jsonb_array_elements(coalesce(p_route->'steps', '[]'::jsonb))
  loop
    v_step := jsonb_set(
      jsonb_set(v_step, '{parent_a}', private.breeding_parent_view(v_step->'parent_a')),
      '{parent_b}', private.breeding_parent_view(v_step->'parent_b')
    );
    v_steps := v_steps || jsonb_build_array(v_step);
  end loop;

  return jsonb_set(p_route, '{steps}', v_steps) || jsonb_build_object(
    'feasibility_status', coalesce(p_route->>'feasibility_status', 'ready'),
    'adoptable', coalesce((p_route->>'adoptable')::boolean, true),
    'missing_pal_count', coalesce((p_route->>'missing_pal_count')::integer, 0),
    'missing_requirements', coalesce(p_route->'missing_requirements', '[]'::jsonb),
    'missing_passive_ids', coalesce(p_route->'missing_passive_ids', '[]'::jsonb),
    'passive_sources', coalesce(p_route->'passive_sources', '[]'::jsonb),
    'inventory_passive_coverage',
      coalesce((p_route->>'inventory_passive_coverage')::numeric, 1)
  );
end;
$$;

update public.scoring_profiles set is_active = false where is_active;

insert into public.scoring_profiles (
  id, version, optimization_mode, algorithm_version, weights, is_active, created_at
) values
  (
    '52000000-0000-4000-8000-000000000025',
    'balanced-v4',
    'balanced',
    'inventory-trait-aware-deterministic-v3',
    '{"route_length":0.14,"inventory_coverage":0.14,"passive_concentration":0.12,"borrowing":0.07,"intermediate_cost":0.08,"attempt_cost":0.12,"stability":0.08,"acquisition_cost":0.25}',
    true,
    '2026-07-21T00:00:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000026',
    'fastest-v4',
    'fastest',
    'inventory-trait-aware-deterministic-v3',
    '{"route_length":0.4,"inventory_coverage":0.08,"passive_concentration":0.04,"borrowing":0.02,"intermediate_cost":0.1,"attempt_cost":0.2,"stability":0.06,"acquisition_cost":0.1}',
    true,
    '2026-07-21T00:00:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000027',
    'highest-success-v4',
    'highest_success',
    'inventory-trait-aware-deterministic-v3',
    '{"route_length":0.04,"inventory_coverage":0.07,"passive_concentration":0.25,"borrowing":0.02,"intermediate_cost":0.12,"attempt_cost":0.26,"stability":0.09,"acquisition_cost":0.15}',
    true,
    '2026-07-21T00:00:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000028',
    'least-borrowing-v4',
    'least_borrowing',
    'inventory-trait-aware-deterministic-v3',
    '{"route_length":0.04,"inventory_coverage":0.05,"passive_concentration":0.06,"borrowing":0.55,"intermediate_cost":0.06,"attempt_cost":0.07,"stability":0.05,"acquisition_cost":0.12}',
    true,
    '2026-07-21T00:00:00Z'
  );

alter function public.persist_breeding_algorithm_result(uuid, text, uuid, jsonb)
  rename to persist_breeding_algorithm_result_inventory_v2;

create or replace function public.persist_breeding_algorithm_result_inventory_v2(
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
  v_route_keys text[] := '{}'::text[];
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
  v_plan_id uuid;
begin
  if jsonb_typeof(coalesce(p_result->'missing_passive_ids', '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_result->'missing_passive_ids', '[]'::jsonb)) > 4
  then
    raise exception using errcode = 'P0001', message = 'INVALID_BREEDING_RESULT';
  end if;
  v_plan_id := public.persist_breeding_algorithm_result_inventory_v2(
    p_job_id,
    p_worker_id,
    p_lease_token,
    p_result
  );
  update public.breeding_plans
     set missing_passive_ids = array(
       select jsonb_array_elements_text(
         coalesce(p_result->'missing_passive_ids', '[]'::jsonb)
       )
       order by 1
     )
   where id = v_plan_id;
  return v_plan_id;
end;
$$;

create or replace function public.get_breeding_job_detail(p_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.breeding_jobs%rowtype;
  v_plan jsonb;
  v_localization jsonb;
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
    'locale', 'zh-CN',
    'pals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pal_id', pal.pal_id,
        'display_name', coalesce(localization.text, pal.pal_id)
      ) order by pal.encyclopedia_no nulls last, pal.pal_id)
      from public.catalog_pals as pal
      left join public.catalog_localizations as localization
        on localization.version_id = pal.version_id
       and localization.locale = 'zh-CN'
       and localization.text_key = pal.name_key
      where pal.version_id = v_job.game_data_version_id
    ), '[]'::jsonb),
    'passive_skills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'passive_skill_id', skill.passive_skill_id,
        'display_name', coalesce(localization.text, skill.passive_skill_id)
      ) order by skill.rank desc, skill.passive_skill_id)
      from public.catalog_passive_skills as skill
      left join public.catalog_localizations as localization
        on localization.version_id = skill.version_id
       and localization.locale = 'zh-CN'
       and localization.text_key = skill.name_key
      where skill.version_id = v_job.game_data_version_id
    ), '[]'::jsonb)
  ) into v_localization;

  select jsonb_build_object(
    'plan_id', plan.id,
    'result_digest', plan.result_digest,
    'route_count', plan.route_count,
    'missing_passive_ids', plan.missing_passive_ids,
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
          'route_id', route.id,
          'execution_plan_id', execution.id,
          'ai_explanation', route.ai_explanation,
          'ai_labels', route.ai_labels
        ) order by route.rank
      )
      from public.breeding_routes as route
      left join public.execution_plans execution on execution.adopted_route_id = route.id
      where route.plan_id = plan.id
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
      'localization', v_localization,
      'attempt_count', v_job.attempt_count,
      'error_code', v_job.error_code,
      'created_at', v_job.created_at,
      'completed_at', v_job.completed_at,
      'plan', v_plan
    )
  );
end;
$$;

do $$
begin
  if (select count(*) from public.scoring_profiles
       where is_active
         and algorithm_version = 'inventory-trait-aware-deterministic-v3'
         and version in (
           'balanced-v4', 'fastest-v4', 'highest-success-v4', 'least-borrowing-v4'
         )) <> 4
  then
    raise exception using
      errcode = 'P0001',
      message = 'BREEDING_SCORING_PROFILE_REGISTRY_MISMATCH';
  end if;
end;
$$;

revoke all on function public.persist_breeding_algorithm_result_inventory_v2(
  uuid, text, uuid, jsonb
) from public, anon, authenticated;
revoke all on function public.persist_breeding_algorithm_result(
  uuid, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.persist_breeding_algorithm_result(
  uuid, text, uuid, jsonb
) to service_role;

revoke all on function private.enforce_adoptable_breeding_route()
  from public, anon, authenticated;
revoke all on function private.breeding_parent_view(jsonb)
  from public, anon, authenticated;
revoke all on function private.breeding_route_view(jsonb)
  from public, anon, authenticated;
revoke all on function public.get_breeding_job_detail(uuid) from public, anon;
grant execute on function public.get_breeding_job_detail(uuid) to authenticated;

comment on column public.breeding_plans.missing_passive_ids is
  'Desired passive IDs absent from every eligible instance in the fixed inventory snapshot.';
comment on function private.breeding_route_view(jsonb) is
  'Returns browser-safe v3 trait-source fields and compatibility defaults for immutable v2/v3 route payloads.';
