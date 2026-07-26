update public.scoring_profiles set is_active = false where is_active;

insert into public.scoring_profiles (
  id, version, optimization_mode, algorithm_version, weights, is_active, created_at
) values
  (
    '52000000-0000-4000-8000-000000000033', 'balanced-v6', 'balanced',
    'inventory-trait-aware-deterministic-v5',
    '{"route_length":0.14,"inventory_coverage":0.14,"passive_concentration":0.12,"borrowing":0.07,"intermediate_cost":0.08,"attempt_cost":0.12,"stability":0.08,"acquisition_cost":0.25}',
    true, '2026-07-27T01:00:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000034', 'fastest-v6', 'fastest',
    'inventory-trait-aware-deterministic-v5',
    '{"route_length":0.4,"inventory_coverage":0.08,"passive_concentration":0.04,"borrowing":0.02,"intermediate_cost":0.1,"attempt_cost":0.2,"stability":0.06,"acquisition_cost":0.1}',
    true, '2026-07-27T01:00:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000035', 'highest-success-v6', 'highest_success',
    'inventory-trait-aware-deterministic-v5',
    '{"route_length":0.04,"inventory_coverage":0.07,"passive_concentration":0.25,"borrowing":0.02,"intermediate_cost":0.12,"attempt_cost":0.26,"stability":0.09,"acquisition_cost":0.15}',
    true, '2026-07-27T01:00:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000036', 'least-borrowing-v6', 'least_borrowing',
    'inventory-trait-aware-deterministic-v5',
    '{"route_length":0.04,"inventory_coverage":0.05,"passive_concentration":0.06,"borrowing":0.55,"intermediate_cost":0.06,"attempt_cost":0.07,"stability":0.05,"acquisition_cost":0.12}',
    true, '2026-07-27T01:00:00Z'
  );

create table public.saved_breeding_plans (
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  route_id uuid not null references public.breeding_routes(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (requester_user_id, route_id)
);

create index saved_breeding_plans_user_page_idx
  on public.saved_breeding_plans(requester_user_id, saved_at desc, route_id desc);

alter table public.saved_breeding_plans enable row level security;
revoke all on table public.saved_breeding_plans from public, anon;
grant select, insert, delete on table public.saved_breeding_plans to authenticated;

create policy saved_breeding_plans_select_own
  on public.saved_breeding_plans for select to authenticated
  using (requester_user_id = auth.uid());
create policy saved_breeding_plans_insert_own
  on public.saved_breeding_plans for insert to authenticated
  with check (requester_user_id = auth.uid());
create policy saved_breeding_plans_delete_own
  on public.saved_breeding_plans for delete to authenticated
  using (requester_user_id = auth.uid());

create function public.save_breeding_plan(p_route_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_saved_at timestamptz;
  v_reused boolean := false;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if not exists (
    select 1
    from public.breeding_routes route
    join public.breeding_plans plan on plan.id = route.plan_id
    join public.breeding_jobs job on job.id = plan.job_id
    where route.id = p_route_id and job.requester_user_id = auth.uid()
  ) then
    raise exception using errcode = 'P0001', message = 'ROUTE_NOT_FOUND';
  end if;

  insert into public.saved_breeding_plans(requester_user_id, route_id)
  values (auth.uid(), p_route_id)
  on conflict do nothing
  returning saved_at into v_saved_at;
  if v_saved_at is null then
    v_reused := true;
    select saved_at into v_saved_at
    from public.saved_breeding_plans
    where requester_user_id = auth.uid() and route_id = p_route_id;
  end if;
  return jsonb_build_object(
    'route_id', p_route_id,
    'saved_at', v_saved_at,
    'reused', v_reused
  );
end;
$$;

create function public.remove_breeding_plan(p_route_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  delete from public.saved_breeding_plans
  where requester_user_id = auth.uid() and route_id = p_route_id;
  get diagnostics v_count = row_count;
  return jsonb_build_object('route_id', p_route_id, 'removed', v_count = 1);
end;
$$;

create function public.list_saved_breeding_plans(
  p_limit integer default 20,
  p_cursor_saved_at timestamptz default null,
  p_cursor_route_id uuid default null,
  p_query_boundary timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_boundary timestamptz := coalesce(p_query_boundary, now());
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_items jsonb;
  v_next_cursor text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error_code', 'AUTH_REQUIRED');
  end if;

  with page as (
    select
      saved.route_id,
      job.id as source_job_id,
      job.target_pal_id,
      coalesce(target_localization.text, job.target_pal_id) as target_pal_display_name,
      job.desired_passive_ids,
      job.optimization_mode,
      route.feasibility_status,
      route.generation_count,
      jsonb_array_length(coalesce(route.route_payload->'steps', '[]'::jsonb)) as step_count,
      route.borrowed_pal_count,
      route.missing_pal_count,
      coalesce(route.estimated_attempts_min, 0) as estimated_attempts_min,
      coalesce(route.estimated_attempts_max, 0) as estimated_attempts_max,
      route.difficulty,
      route.total_score,
      saved.saved_at
    from public.saved_breeding_plans saved
    join public.breeding_routes route on route.id = saved.route_id
    join public.breeding_plans plan on plan.id = route.plan_id
    join public.breeding_jobs job on job.id = plan.job_id
    left join public.catalog_pals target_pal
      on target_pal.version_id = job.game_data_version_id
     and target_pal.pal_id = job.target_pal_id
    left join public.catalog_localizations target_localization
      on target_localization.version_id = target_pal.version_id
     and target_localization.locale = 'zh-CN'
     and target_localization.text_key = target_pal.name_key
    where saved.requester_user_id = auth.uid()
      and saved.saved_at <= v_boundary
      and (
        p_cursor_saved_at is null
        or (saved.saved_at, saved.route_id) < (p_cursor_saved_at, p_cursor_route_id)
      )
    order by saved.saved_at desc, saved.route_id desc
    limit v_limit + 1
  ), visible as (
    select * from page order by saved_at desc, route_id desc limit v_limit
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'route_id', visible.route_id,
      'source_job_id', visible.source_job_id,
      'target_pal_id', visible.target_pal_id,
      'target_pal_display_name', visible.target_pal_display_name,
      'desired_passive_ids', visible.desired_passive_ids,
      'desired_passive_display_names', coalesce((
        select jsonb_agg(coalesce(localization.text, desired.passive_id) order by desired.ordinality)
        from unnest(visible.desired_passive_ids) with ordinality desired(passive_id, ordinality)
        left join public.catalog_passive_skills skill
          on skill.version_id = (select game_data_version_id from public.breeding_jobs where id = visible.source_job_id)
         and skill.passive_skill_id = desired.passive_id
        left join public.catalog_localizations localization
          on localization.version_id = skill.version_id
         and localization.locale = 'zh-CN'
         and localization.text_key = skill.name_key
      ), '[]'::jsonb),
      'desired_passives', coalesce((
        select jsonb_agg(jsonb_build_object(
          'passive_skill_id', desired.passive_id,
          'display_name', coalesce(localization.text, desired.passive_id),
          'rank', skill.rank,
          'is_negative', skill.is_negative
        ) order by desired.ordinality)
        from unnest(visible.desired_passive_ids) with ordinality desired(passive_id, ordinality)
        left join public.catalog_passive_skills skill
          on skill.version_id = (select game_data_version_id from public.breeding_jobs where id = visible.source_job_id)
         and skill.passive_skill_id = desired.passive_id
        left join public.catalog_localizations localization
          on localization.version_id = skill.version_id
         and localization.locale = 'zh-CN'
         and localization.text_key = skill.name_key
      ), '[]'::jsonb),
      'optimization_mode', visible.optimization_mode,
      'feasibility_status', visible.feasibility_status,
      'generation_count', visible.generation_count,
      'step_count', visible.step_count,
      'borrowed_pal_count', visible.borrowed_pal_count,
      'missing_pal_count', visible.missing_pal_count,
      'estimated_attempts_min', visible.estimated_attempts_min,
      'estimated_attempts_max', visible.estimated_attempts_max,
      'difficulty', visible.difficulty,
      'total_score', visible.total_score,
      'saved_at', visible.saved_at
    ) order by visible.saved_at desc, visible.route_id desc
  ), '[]'::jsonb)
  into v_items
  from visible;

  with page as (
    select saved.saved_at, saved.route_id
    from public.saved_breeding_plans saved
    where saved.requester_user_id = auth.uid()
      and saved.saved_at <= v_boundary
      and (
        p_cursor_saved_at is null
        or (saved.saved_at, saved.route_id) < (p_cursor_saved_at, p_cursor_route_id)
      )
    order by saved.saved_at desc, saved.route_id desc
    limit v_limit + 1
  ), visible as (
    select * from page order by saved_at desc, route_id desc limit v_limit
  )
  select case when (select count(*) from page) > v_limit then (
    select saved_at::text || '|' || route_id::text
    from visible order by saved_at, route_id limit 1
  ) else null end into v_next_cursor;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'items', v_items,
      'next_cursor', v_next_cursor,
      'query_boundary', v_boundary
    )
  );
end;
$$;

create function public.get_saved_breeding_plan_detail(p_route_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job_id uuid;
  v_saved_at timestamptz;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error_code', 'AUTH_REQUIRED');
  end if;
  select job.id, saved.saved_at into v_job_id, v_saved_at
  from public.saved_breeding_plans saved
  join public.breeding_routes route on route.id = saved.route_id
  join public.breeding_plans plan on plan.id = route.plan_id
  join public.breeding_jobs job on job.id = plan.job_id
  where saved.requester_user_id = auth.uid()
    and saved.route_id = p_route_id;
  if v_job_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'PLAN_NOT_FOUND');
  end if;
  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'route_id', p_route_id,
      'source_job_id', v_job_id,
      'saved_at', v_saved_at
    )
  );
end;
$$;

revoke all on function public.save_breeding_plan(uuid) from public, anon;
revoke all on function public.remove_breeding_plan(uuid) from public, anon;
revoke all on function public.list_saved_breeding_plans(integer,timestamptz,uuid,timestamptz)
  from public, anon;
revoke all on function public.get_saved_breeding_plan_detail(uuid) from public, anon;
grant execute on function public.save_breeding_plan(uuid) to authenticated;
grant execute on function public.remove_breeding_plan(uuid) to authenticated;
grant execute on function public.list_saved_breeding_plans(integer,timestamptz,uuid,timestamptz)
  to authenticated;
grant execute on function public.get_saved_breeding_plan_detail(uuid) to authenticated;

do $migration$
declare
  v_function regprocedure := 'public.get_breeding_job_detail(uuid)'::regprocedure;
  v_definition text := pg_get_functiondef(v_function);
  v_original text := v_definition;
begin
  v_definition := replace(
    v_definition,
    '''execution_plan_id'', execution.id,',
    '''saved_plan_at'', saved.saved_at,'
  );
  v_definition := replace(
    v_definition,
    E'left join public.execution_plans execution\n        on execution.adopted_route_id = route.id',
    E'left join public.saved_breeding_plans saved\n        on saved.route_id = route.id\n       and saved.requester_user_id = auth.uid()'
  );
  if v_definition = v_original or position('execution_plan_id' in v_definition) > 0 then
    raise exception using errcode = 'P0001', message = 'SAVED_PLAN_JOB_PROJECTION_PATCH_FAILED';
  end if;
  execute v_definition;
end;
$migration$;

truncate table public.execution_candidate_detection_runs,
  public.execution_plan_events,
  public.execution_plan_dependencies,
  public.step_offspring_candidates;
delete from public.breeding_steps where execution_plan_id is not null;
delete from public.execution_plans;

comment on table public.saved_breeding_plans is
  'User-owned read-only My Plans route saves; no execution progress or candidate state.';
comment on table public.scoring_profiles is
  'Versioned deterministic scoring profiles; v6 pins semantic route deduplication without changing score weights.';
