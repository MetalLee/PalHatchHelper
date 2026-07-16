create type public.execution_plan_status as enum (
  'active',
  'awaiting_confirmation',
  'paused',
  'completed',
  'invalidated',
  'cancelled'
);

create table public.execution_plans (
  id uuid primary key default gen_random_uuid(),
  adopted_route_id uuid not null unique references public.breeding_routes(id) on delete restrict,
  source_job_id uuid not null references public.breeding_jobs(id) on delete restrict,
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  player_id uuid not null,
  world_id uuid not null,
  guild_id uuid,
  target_pal_id text not null,
  desired_passive_ids text[] not null default '{}',
  optimization_mode public.optimization_mode not null,
  allow_guild_shared boolean not null,
  max_generations integer not null,
  inventory_snapshot_id uuid not null,
  game_data_version_id uuid not null references public.game_data_versions(id) on delete restrict,
  content_hash text not null,
  algorithm_version text not null,
  scoring_profile_version text not null references public.scoring_profiles(version) on delete restrict,
  status public.execution_plan_status not null default 'active',
  current_step_index integer not null default 0,
  concurrency_version bigint not null default 1,
  invalidation_reasons jsonb not null default '[]'::jsonb,
  adopted_idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  paused_at timestamptz,
  constraint execution_plans_player_world_fkey
    foreign key (player_id, world_id) references public.players(id, world_id) on delete restrict,
  constraint execution_plans_guild_world_fkey
    foreign key (guild_id, world_id) references public.guilds(id, world_id) on delete restrict,
  constraint execution_plans_snapshot_world_fkey
    foreign key (inventory_snapshot_id, world_id)
    references public.inventory_snapshots(id, world_id) on delete restrict,
  constraint execution_plans_content_hash_check check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint execution_plans_target_check
    check (target_pal_id ~ '^[a-z0-9][a-z0-9._-]*$' and char_length(target_pal_id) <= 120),
  constraint execution_plans_passives_check check (
    cardinality(desired_passive_ids) between 0 and 4
    and public.is_stable_id_array(desired_passive_ids)
  ),
  constraint execution_plans_current_step_check check (current_step_index >= 0),
  constraint execution_plans_concurrency_check check (concurrency_version >= 1),
  constraint execution_plans_invalidation_check check (jsonb_typeof(invalidation_reasons) = 'array'),
  constraint execution_plans_idempotency_check
    check (char_length(adopted_idempotency_key) between 8 and 160),
  constraint execution_plans_completion_check check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint execution_plans_pause_check check (
    (status = 'paused' and paused_at is not null)
    or (status <> 'paused' and paused_at is null)
  )
);

create index execution_plans_requester_page_idx
  on public.execution_plans(requester_user_id, created_at desc, id desc);
create index execution_plans_detection_idx
  on public.execution_plans(world_id, status, updated_at)
  where status in ('active', 'awaiting_confirmation');

alter table public.breeding_steps
  add column execution_plan_id uuid references public.execution_plans(id) on delete restrict,
  add column parent_a_source_kind text,
  add column parent_a_step_index integer,
  add column parent_a_required_gender text,
  add column parent_b_source_kind text,
  add column parent_b_step_index integer,
  add column parent_b_required_gender text,
  add column preferred_gender text,
  add column baseline_snapshot_id uuid references public.inventory_snapshots(id) on delete restrict,
  add column candidate_detection_started_at timestamptz,
  add column attempt_number integer not null default 0,
  add column concurrency_version bigint not null default 1,
  add column skip_reason text,
  add column invalidation_reasons jsonb not null default '[]'::jsonb,
  add constraint breeding_steps_execution_parent_a_kind_check check (
    parent_a_source_kind is null or parent_a_source_kind in ('inventory', 'prior_step')
  ),
  add constraint breeding_steps_execution_parent_b_kind_check check (
    parent_b_source_kind is null or parent_b_source_kind in ('inventory', 'prior_step')
  ),
  add constraint breeding_steps_parent_a_step_check check (
    (parent_a_source_kind is null)
    or (parent_a_source_kind = 'inventory' and parent_a_instance_uid is not null and parent_a_step_index is null)
    or (parent_a_source_kind = 'prior_step' and parent_a_instance_uid is null and parent_a_step_index is not null)
  ),
  add constraint breeding_steps_parent_b_step_check check (
    (parent_b_source_kind is null)
    or (parent_b_source_kind = 'inventory' and parent_b_instance_uid is not null and parent_b_step_index is null)
    or (parent_b_source_kind = 'prior_step' and parent_b_instance_uid is null and parent_b_step_index is not null)
  ),
  add constraint breeding_steps_parent_gender_check check (
    (parent_a_required_gender is null or parent_a_required_gender in ('male', 'female'))
    and (parent_b_required_gender is null or parent_b_required_gender in ('male', 'female'))
    and (preferred_gender is null or preferred_gender in ('male', 'female'))
  ),
  add constraint breeding_steps_attempt_check check (attempt_number >= 0),
  add constraint breeding_steps_concurrency_check check (concurrency_version >= 1),
  add constraint breeding_steps_skip_reason_check
    check (skip_reason is null or char_length(btrim(skip_reason)) between 1 and 500),
  add constraint breeding_steps_invalidation_reasons_check
    check (jsonb_typeof(invalidation_reasons) = 'array');

create unique index breeding_steps_execution_plan_index_key
  on public.breeding_steps(execution_plan_id, step_index)
  where execution_plan_id is not null;
create unique index breeding_steps_execution_selected_uid_key
  on public.breeding_steps(execution_plan_id, selected_child_instance_uid)
  where execution_plan_id is not null and selected_child_instance_uid is not null;

alter table public.step_offspring_candidates
  add column candidate_key text,
  add column pal_id text,
  add column species_match boolean not null default false,
  add column required_passive_count integer not null default 0,
  add column gender text,
  add column level integer,
  add column owner_display_name text,
  add column location_type text,
  add column location_name text,
  add column accessible boolean not null default false,
  add column match_breakdown jsonb not null default '{}'::jsonb,
  add column rejected_at timestamptz,
  add column rejected_by uuid references auth.users(id) on delete restrict,
  add column rejection_reason text,
  add constraint step_candidates_candidate_key_check
    check (candidate_key is null or candidate_key ~ '^[0-9a-f]{64}$'),
  add constraint step_candidates_pal_id_check
    check (pal_id is null or (pal_id ~ '^[a-z0-9][a-z0-9._-]*$' and char_length(pal_id) <= 120)),
  add constraint step_candidates_required_count_check check (required_passive_count between 0 and 4),
  add constraint step_candidates_gender_check
    check (gender is null or gender in ('male', 'female', 'genderless', 'unknown')),
  add constraint step_candidates_level_check check (level is null or level between 1 and 100),
  add constraint step_candidates_owner_display_check
    check (owner_display_name is null or char_length(owner_display_name) between 1 and 160),
  add constraint step_candidates_location_check
    check (location_type is null or location_type in ('player_party','player_storage','base','viewing_cage','unknown')),
  add constraint step_candidates_breakdown_check check (jsonb_typeof(match_breakdown) = 'object'),
  add constraint step_candidates_rejection_check check (
    (rejected_at is null and rejected_by is null and rejection_reason is null)
    or (
      rejected_at is not null and rejected_by is not null
      and char_length(btrim(rejection_reason)) between 1 and 500
      and not confirmed
    )
  );

create unique index step_candidates_step_instance_key
  on public.step_offspring_candidates(step_id, pal_instance_uid);
create unique index step_candidates_candidate_key_unique
  on public.step_offspring_candidates(candidate_key)
  where candidate_key is not null;
create unique index step_candidates_one_confirmed_per_step
  on public.step_offspring_candidates(step_id)
  where confirmed;

create table public.execution_candidate_detection_runs (
  step_id uuid not null references public.breeding_steps(id) on delete restrict,
  detected_snapshot_id uuid not null references public.inventory_snapshots(id) on delete restrict,
  candidate_count integer not null default 0 check (candidate_count >= 0),
  processed_at timestamptz not null default now(),
  primary key (step_id, detected_snapshot_id)
);

create table public.execution_plan_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.execution_plans(id) on delete restrict,
  step_id uuid references public.breeding_steps(id) on delete restrict,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  actor_kind text not null,
  from_status text,
  to_status text,
  safe_metadata jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint execution_plan_events_type_check
    check (event_type ~ '^[A-Z][A-Z0-9_]*$' and char_length(event_type) <= 100),
  constraint execution_plan_events_actor_check
    check (actor_kind in ('player', 'admin', 'agent', 'system')),
  constraint execution_plan_events_status_check check (
    (from_status is null or char_length(from_status) <= 40)
    and (to_status is null or char_length(to_status) <= 40)
  ),
  constraint execution_plan_events_metadata_check check (jsonb_typeof(safe_metadata) = 'object'),
  constraint execution_plan_events_idempotency_check
    check (char_length(idempotency_key) between 8 and 200),
  constraint execution_plan_events_plan_idempotency_key unique (plan_id, idempotency_key)
);

alter table public.breeding_jobs
  add column source_plan_id uuid references public.execution_plans(id) on delete restrict,
  add column recalculation_reason text,
  add constraint breeding_jobs_recalculation_check check (
    (source_plan_id is null and recalculation_reason is null)
    or (
      source_plan_id is not null
      and char_length(btrim(recalculation_reason)) between 1 and 500
    )
  );

create function public.reject_execution_history_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = 'P0001', message = 'PLAN_HISTORY_IMMUTABLE';
end;
$$;

create trigger execution_plan_events_immutable
  before update or delete on public.execution_plan_events
  for each row execute function public.reject_execution_history_mutation();

create function public.protect_execution_plan_pins()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if row(
    new.adopted_route_id, new.source_job_id, new.requester_user_id,
    new.player_id, new.world_id, new.guild_id, new.target_pal_id,
    new.desired_passive_ids, new.optimization_mode, new.allow_guild_shared,
    new.max_generations, new.inventory_snapshot_id, new.game_data_version_id,
    new.content_hash, new.algorithm_version, new.scoring_profile_version,
    new.created_at
  ) is distinct from row(
    old.adopted_route_id, old.source_job_id, old.requester_user_id,
    old.player_id, old.world_id, old.guild_id, old.target_pal_id,
    old.desired_passive_ids, old.optimization_mode, old.allow_guild_shared,
    old.max_generations, old.inventory_snapshot_id, old.game_data_version_id,
    old.content_hash, old.algorithm_version, old.scoring_profile_version,
    old.created_at
  ) then
    raise exception using errcode = 'P0001', message = 'PLAN_FIXED_VERSION_IMMUTABLE';
  end if;
  if new.concurrency_version <= old.concurrency_version then
    raise exception using errcode = 'P0001', message = 'PLAN_VERSION_NOT_MONOTONIC';
  end if;
  return new;
end;
$$;

create trigger execution_plans_protect_pins
  before update on public.execution_plans
  for each row execute function public.protect_execution_plan_pins();

create function private.owns_execution_plan(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.execution_plans as plan
     where plan.id = p_plan_id
       and plan.requester_user_id = auth.uid()
  );
$$;

create or replace function private.owns_step(p_step_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.breeding_steps as step
    join public.breeding_routes as route on route.id = step.route_id
    join public.breeding_plans as plan on plan.id = route.plan_id
    join public.breeding_jobs as job on job.id = plan.job_id
    where step.id = p_step_id
      and step.execution_plan_id is null
      and job.requester_user_id = auth.uid()
  );
$$;

create function private.execution_actor_kind()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case when public.is_admin() then 'admin' else 'player' end;
$$;

create function private.execution_plan_result(p_plan_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'plan_id', plan.id,
    'status', plan.status,
    'current_step_index', plan.current_step_index,
    'concurrency_version', plan.concurrency_version
  )
  from public.execution_plans as plan
  where plan.id = p_plan_id;
$$;

create function public.adopt_breeding_route(
  p_route_id uuid,
  p_idempotency_key text
)
returns table (
  plan_id uuid,
  reused boolean,
  status public.execution_plan_status,
  concurrency_version bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_job public.breeding_jobs%rowtype;
  v_route public.breeding_routes%rowtype;
  v_plan_id uuid;
  v_step jsonb;
  v_parent jsonb;
  v_step_index integer;
  v_step_count integer;
  v_is_admin boolean;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_route_id is null
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 8 and 160
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
  then
    raise exception using errcode = 'P0001', message = 'ROUTE_NOT_ADOPTABLE';
  end if;

  select route.* into v_route
    from public.breeding_routes as route
   where route.id = p_route_id;
  if v_route.id is null then
    raise exception using errcode = 'P0001', message = 'ROUTE_NOT_ADOPTABLE';
  end if;

  select job.* into v_job
    from public.breeding_plans as algorithm_plan
    join public.breeding_jobs as job on job.id = algorithm_plan.job_id
   where algorithm_plan.id = v_route.plan_id;
  v_is_admin := public.is_admin();
  if v_job.id is null
    or (v_job.requester_user_id <> v_user_id and not v_is_admin)
  then
    raise exception using errcode = 'P0001', message = 'PLAN_ACCESS_DENIED';
  end if;

  select plan.id into v_plan_id
    from public.execution_plans as plan
   where plan.adopted_route_id = p_route_id;
  if v_plan_id is not null then
    if not v_is_admin and not exists (
      select 1 from public.execution_plans as plan
       where plan.id = v_plan_id and plan.requester_user_id = v_user_id
    ) then
      raise exception using errcode = 'P0001', message = 'PLAN_ACCESS_DENIED';
    end if;
    return query
      select plan.id, true, plan.status, plan.concurrency_version
        from public.execution_plans as plan where plan.id = v_plan_id;
    return;
  end if;

  if v_job.status <> 'completed'
    or v_route.route_key is null
    or v_route.route_payload->>'route_key' is distinct from v_route.route_key
    or jsonb_typeof(v_route.route_payload->'steps') <> 'array'
    or not exists (
      select 1 from public.inventory_snapshots as snapshot
       where snapshot.id = v_job.inventory_snapshot_id
         and snapshot.world_id = v_job.world_id
         and snapshot.status = 'published'
    )
    or not exists (
      select 1 from public.game_data_versions as version
       where version.id = v_job.game_data_version_id
         and version.content_hash = v_job.game_data_content_hash
         and version.status = 'published'
    )
  then
    raise exception using errcode = 'P0001', message = 'ROUTE_NOT_ADOPTABLE';
  end if;
  if not v_is_admin and public.current_player_id() is distinct from v_job.player_id then
    raise exception using errcode = 'P0001', message = 'PLAN_ACCESS_DENIED';
  end if;

  for v_step in
    select value from jsonb_array_elements(v_route.route_payload->'steps')
  loop
    v_step_index := (v_step->>'step_index')::integer;
    if v_step_index < 0 then
      raise exception using errcode = 'P0001', message = 'ROUTE_NOT_ADOPTABLE';
    end if;
    foreach v_parent in array array[v_step->'parent_a', v_step->'parent_b']
    loop
      if v_parent->>'source_type' = 'inventory' then
        if not exists (
          select 1
            from public.pal_snapshot_items as item
            left join public.pal_share_preferences as preference
              on preference.world_id = item.world_id
             and preference.pal_instance_uid = item.pal_instance_uid
           where item.snapshot_id = v_job.inventory_snapshot_id
             and item.world_id = v_job.world_id
             and item.pal_instance_uid = v_parent->>'instance_uid'
             and item.pal_id = v_parent->>'pal_id'
             and (
               item.owner_player_id = v_job.player_id
               or (
                 v_job.allow_guild_shared
                 and v_job.guild_id is not null
                 and item.guild_id = v_job.guild_id
                 and coalesce(preference.share_enabled, true)
               )
             )
        ) then
          raise exception using errcode = 'P0001', message = 'PLAN_DEPENDENCY_UNAVAILABLE';
        end if;
      elsif v_parent->>'source_type' = 'intermediate' then
        if (v_parent->>'produced_by_step_index')::integer >= v_step_index then
          raise exception using errcode = 'P0001', message = 'ROUTE_NOT_ADOPTABLE';
        end if;
      else
        raise exception using errcode = 'P0001', message = 'ROUTE_NOT_ADOPTABLE';
      end if;
    end loop;
  end loop;

  v_step_count := jsonb_array_length(v_route.route_payload->'steps');
  begin
    insert into public.execution_plans (
      adopted_route_id, source_job_id, requester_user_id, player_id, world_id, guild_id,
      target_pal_id, desired_passive_ids, optimization_mode, allow_guild_shared,
      max_generations, inventory_snapshot_id, game_data_version_id, content_hash,
      algorithm_version, scoring_profile_version, status, current_step_index,
      adopted_idempotency_key, completed_at
    ) values (
      v_route.id, v_job.id, v_job.requester_user_id, v_job.player_id, v_job.world_id,
      v_job.guild_id, v_job.target_pal_id, v_job.desired_passive_ids,
      v_job.optimization_mode, v_job.allow_guild_shared, v_job.max_generations,
      v_job.inventory_snapshot_id, v_job.game_data_version_id,
      v_job.game_data_content_hash, v_job.algorithm_version,
      v_job.scoring_profile_version,
      (case when v_step_count = 0 then 'completed' else 'active' end)::public.execution_plan_status,
      0, p_idempotency_key,
      case when v_step_count = 0 then now() else null end
    ) returning id into v_plan_id;
  exception when unique_violation then
    select plan.id into v_plan_id from public.execution_plans as plan
     where plan.adopted_route_id = p_route_id;
    return query
      select plan.id, true, plan.status, plan.concurrency_version
        from public.execution_plans as plan where plan.id = v_plan_id;
    return;
  end;

  for v_step in
    select value from jsonb_array_elements(v_route.route_payload->'steps')
    order by (value->>'step_index')::integer
  loop
    insert into public.breeding_steps (
      route_id, execution_plan_id, step_index,
      parent_a_source_kind, parent_a_instance_uid, parent_a_step_index,
      parent_a_required_gender, parent_b_source_kind, parent_b_instance_uid,
      parent_b_step_index, parent_b_required_gender, expected_child_pal_id,
      required_passive_ids, preferred_gender, status
    ) values (
      v_route.id,
      v_plan_id,
      (v_step->>'step_index')::integer,
      case v_step->'parent_a'->>'source_type' when 'inventory' then 'inventory' else 'prior_step' end,
      case when v_step->'parent_a'->>'source_type' = 'inventory'
        then v_step->'parent_a'->>'instance_uid' else null end,
      case when v_step->'parent_a'->>'source_type' = 'intermediate'
        then (v_step->'parent_a'->>'produced_by_step_index')::integer else null end,
      nullif(v_step->'parent_a'->>'gender', ''),
      case v_step->'parent_b'->>'source_type' when 'inventory' then 'inventory' else 'prior_step' end,
      case when v_step->'parent_b'->>'source_type' = 'inventory'
        then v_step->'parent_b'->>'instance_uid' else null end,
      case when v_step->'parent_b'->>'source_type' = 'intermediate'
        then (v_step->'parent_b'->>'produced_by_step_index')::integer else null end,
      nullif(v_step->'parent_b'->>'gender', ''),
      v_step->>'child_pal_id',
      array(select jsonb_array_elements_text(coalesce(v_step->'required_passive_ids', '[]'))),
      nullif(v_step->>'child_required_gender', ''),
      'not_started'
    );
  end loop;

  insert into public.execution_plan_events (
    plan_id, event_type, actor_user_id, actor_kind, to_status,
    safe_metadata, idempotency_key
  ) values (
    v_plan_id, 'ROUTE_ADOPTED', v_user_id, private.execution_actor_kind(),
    case when v_step_count = 0 then 'completed' else 'active' end,
    jsonb_build_object('route_id', p_route_id, 'step_count', v_step_count),
    p_idempotency_key
  );

  return query
    select plan.id, false, plan.status, plan.concurrency_version
      from public.execution_plans as plan where plan.id = v_plan_id;
end;
$$;

create function public.start_breeding_step(
  p_step_id uuid,
  p_expected_concurrency_version bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan public.execution_plans%rowtype;
  v_step public.breeding_steps%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='P0001', message='AUTH_REQUIRED'; end if;
  select step.* into v_step from public.breeding_steps as step where step.id=p_step_id for update;
  if v_step.id is null or v_step.execution_plan_id is null then
    raise exception using errcode='P0001', message='PLAN_NOT_FOUND';
  end if;
  select plan.* into v_plan from public.execution_plans as plan
   where plan.id=v_step.execution_plan_id for update;
  if v_plan.requester_user_id <> auth.uid() and not public.is_admin() then
    raise exception using errcode='P0001', message='PLAN_ACCESS_DENIED';
  end if;
  if exists (select 1 from public.execution_plan_events where plan_id=v_plan.id and idempotency_key=p_idempotency_key) then
    return private.execution_plan_result(v_plan.id);
  end if;
  if v_plan.concurrency_version <> p_expected_concurrency_version then
    raise exception using errcode='P0001', message='PLAN_VERSION_CONFLICT';
  end if;
  if v_plan.status='paused' then raise exception using errcode='P0001', message='PLAN_PAUSED'; end if;
  if v_plan.status not in ('active','awaiting_confirmation') or v_step.status <> 'not_started' then
    raise exception using errcode='P0001', message='PLAN_INVALID_STATE_TRANSITION';
  end if;
  if v_step.step_index <> v_plan.current_step_index then
    raise exception using errcode='P0001', message='PLAN_NOT_CURRENT_STEP';
  end if;
  if exists (
    select 1 from public.breeding_steps as previous
     where previous.execution_plan_id=v_plan.id and previous.step_index<v_step.step_index
       and previous.status not in ('completed','skipped')
  ) then
    raise exception using errcode='P0001', message='STEP_PREREQUISITE_INCOMPLETE';
  end if;
  update public.breeding_steps
     set status='breeding', baseline_snapshot_id=(select latest_snapshot_id from public.worlds where id=v_plan.world_id),
         candidate_detection_started_at=now(), attempt_number=attempt_number+1,
         concurrency_version=concurrency_version+1, updated_at=now()
   where id=v_step.id;
  update public.execution_plans set status='active', concurrency_version=concurrency_version+1,
         updated_at=now(), paused_at=null where id=v_plan.id;
  insert into public.execution_plan_events(plan_id,step_id,event_type,actor_user_id,actor_kind,from_status,to_status,safe_metadata,idempotency_key)
  values(v_plan.id,v_step.id,'STEP_BREEDING_STARTED',auth.uid(),private.execution_actor_kind(),v_step.status::text,'breeding','{}',p_idempotency_key);
  return private.execution_plan_result(v_plan.id);
end;
$$;

create function public.continue_breeding_attempt(
  p_step_id uuid,
  p_expected_concurrency_version bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan public.execution_plans%rowtype;
  v_step public.breeding_steps%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='P0001', message='AUTH_REQUIRED'; end if;
  select step.* into v_step from public.breeding_steps as step where step.id=p_step_id for update;
  if v_step.id is null or v_step.execution_plan_id is null then raise exception using errcode='P0001', message='PLAN_NOT_FOUND'; end if;
  select plan.* into v_plan from public.execution_plans as plan where plan.id=v_step.execution_plan_id for update;
  if v_plan.requester_user_id<>auth.uid() and not public.is_admin() then raise exception using errcode='P0001', message='PLAN_ACCESS_DENIED'; end if;
  if exists(select 1 from public.execution_plan_events where plan_id=v_plan.id and idempotency_key=p_idempotency_key) then return private.execution_plan_result(v_plan.id); end if;
  if v_plan.concurrency_version<>p_expected_concurrency_version then raise exception using errcode='P0001', message='PLAN_VERSION_CONFLICT'; end if;
  if v_plan.status='paused' then raise exception using errcode='P0001', message='PLAN_PAUSED'; end if;
  if v_step.step_index<>v_plan.current_step_index then raise exception using errcode='P0001', message='PLAN_NOT_CURRENT_STEP'; end if;
  if v_step.status not in ('breeding','candidate_detected','retrying') then raise exception using errcode='P0001', message='PLAN_INVALID_STATE_TRANSITION'; end if;
  update public.breeding_steps set status='retrying', candidate_detection_started_at=now(),
    attempt_number=attempt_number+1, concurrency_version=concurrency_version+1, updated_at=now()
    where id=v_step.id;
  update public.execution_plans set status='active', concurrency_version=concurrency_version+1,
    updated_at=now(), paused_at=null where id=v_plan.id;
  insert into public.execution_plan_events(plan_id,step_id,event_type,actor_user_id,actor_kind,from_status,to_status,safe_metadata,idempotency_key)
  values(v_plan.id,v_step.id,'BREEDING_ATTEMPT_CONTINUED',auth.uid(),private.execution_actor_kind(),v_step.status::text,'retrying',jsonb_build_object('attempt_number',v_step.attempt_number+1),p_idempotency_key);
  return private.execution_plan_result(v_plan.id);
end;
$$;

create function public.skip_breeding_step(
  p_step_id uuid,
  p_reason text,
  p_expected_concurrency_version bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan public.execution_plans%rowtype;
  v_step public.breeding_steps%rowtype;
  v_next integer;
begin
  if auth.uid() is null then raise exception using errcode='P0001', message='AUTH_REQUIRED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception using errcode='P0001', message='PLAN_INVALID_STATE_TRANSITION'; end if;
  select step.* into v_step from public.breeding_steps as step where step.id=p_step_id for update;
  if v_step.id is null or v_step.execution_plan_id is null then raise exception using errcode='P0001', message='PLAN_NOT_FOUND'; end if;
  select plan.* into v_plan from public.execution_plans as plan where plan.id=v_step.execution_plan_id for update;
  if v_plan.requester_user_id<>auth.uid() and not public.is_admin() then raise exception using errcode='P0001', message='PLAN_ACCESS_DENIED'; end if;
  if exists(select 1 from public.execution_plan_events where plan_id=v_plan.id and idempotency_key=p_idempotency_key) then return private.execution_plan_result(v_plan.id); end if;
  if v_plan.concurrency_version<>p_expected_concurrency_version then raise exception using errcode='P0001', message='PLAN_VERSION_CONFLICT'; end if;
  if v_plan.status='paused' then raise exception using errcode='P0001', message='PLAN_PAUSED'; end if;
  if v_step.step_index<>v_plan.current_step_index then raise exception using errcode='P0001', message='PLAN_NOT_CURRENT_STEP'; end if;
  if v_step.status in ('completed','skipped','invalidated') then raise exception using errcode='P0001', message='PLAN_INVALID_STATE_TRANSITION'; end if;
  update public.breeding_steps set status='skipped', skip_reason=btrim(p_reason),
    concurrency_version=concurrency_version+1, updated_at=now() where id=v_step.id;
  select min(step_index) into v_next from public.breeding_steps
   where execution_plan_id=v_plan.id and step_index>v_step.step_index and status not in ('completed','skipped');
  update public.execution_plans set
    current_step_index=coalesce(v_next,v_step.step_index+1),
    status=case when v_next is null then 'completed'::public.execution_plan_status else 'active' end,
    completed_at=case when v_next is null then now() else null end,
    paused_at=null, concurrency_version=concurrency_version+1, updated_at=now()
    where id=v_plan.id;
  insert into public.execution_plan_events(plan_id,step_id,event_type,actor_user_id,actor_kind,from_status,to_status,safe_metadata,idempotency_key)
  values(v_plan.id,v_step.id,'STEP_SKIPPED',auth.uid(),private.execution_actor_kind(),v_step.status::text,'skipped',jsonb_build_object('reason',btrim(p_reason)),p_idempotency_key);
  return private.execution_plan_result(v_plan.id);
end;
$$;

create function public.pause_execution_plan(
  p_plan_id uuid,
  p_expected_concurrency_version bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_plan public.execution_plans%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='P0001', message='AUTH_REQUIRED'; end if;
  select * into v_plan from public.execution_plans where id=p_plan_id for update;
  if v_plan.id is null then raise exception using errcode='P0001', message='PLAN_NOT_FOUND'; end if;
  if v_plan.requester_user_id<>auth.uid() and not public.is_admin() then raise exception using errcode='P0001', message='PLAN_ACCESS_DENIED'; end if;
  if exists(select 1 from public.execution_plan_events where plan_id=v_plan.id and idempotency_key=p_idempotency_key) then return private.execution_plan_result(v_plan.id); end if;
  if v_plan.concurrency_version<>p_expected_concurrency_version then raise exception using errcode='P0001', message='PLAN_VERSION_CONFLICT'; end if;
  if v_plan.status not in ('active','awaiting_confirmation') then raise exception using errcode='P0001', message='PLAN_INVALID_STATE_TRANSITION'; end if;
  update public.execution_plans set status='paused', paused_at=now(), concurrency_version=concurrency_version+1, updated_at=now() where id=v_plan.id;
  insert into public.execution_plan_events(plan_id,event_type,actor_user_id,actor_kind,from_status,to_status,safe_metadata,idempotency_key)
  values(v_plan.id,'PLAN_PAUSED',auth.uid(),private.execution_actor_kind(),v_plan.status::text,'paused','{}',p_idempotency_key);
  return private.execution_plan_result(v_plan.id);
end;
$$;

create function public.resume_execution_plan(
  p_plan_id uuid,
  p_expected_concurrency_version bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_plan public.execution_plans%rowtype; v_status public.execution_plan_status;
begin
  if auth.uid() is null then raise exception using errcode='P0001', message='AUTH_REQUIRED'; end if;
  select * into v_plan from public.execution_plans where id=p_plan_id for update;
  if v_plan.id is null then raise exception using errcode='P0001', message='PLAN_NOT_FOUND'; end if;
  if v_plan.requester_user_id<>auth.uid() and not public.is_admin() then raise exception using errcode='P0001', message='PLAN_ACCESS_DENIED'; end if;
  if exists(select 1 from public.execution_plan_events where plan_id=v_plan.id and idempotency_key=p_idempotency_key) then return private.execution_plan_result(v_plan.id); end if;
  if v_plan.concurrency_version<>p_expected_concurrency_version then raise exception using errcode='P0001', message='PLAN_VERSION_CONFLICT'; end if;
  if v_plan.status<>'paused' then raise exception using errcode='P0001', message='PLAN_INVALID_STATE_TRANSITION'; end if;
  v_status := case when exists(
    select 1 from public.breeding_steps s join public.step_offspring_candidates c on c.step_id=s.id
    where s.execution_plan_id=v_plan.id and s.step_index=v_plan.current_step_index
      and c.rejected_at is null and not c.confirmed
  ) then 'awaiting_confirmation' else 'active' end;
  update public.execution_plans set status=v_status, paused_at=null, concurrency_version=concurrency_version+1, updated_at=now() where id=v_plan.id;
  insert into public.execution_plan_events(plan_id,event_type,actor_user_id,actor_kind,from_status,to_status,safe_metadata,idempotency_key)
  values(v_plan.id,'PLAN_RESUMED',auth.uid(),private.execution_actor_kind(),'paused',v_status::text,'{}',p_idempotency_key);
  return private.execution_plan_result(v_plan.id);
end;
$$;

create function public.select_existing_pal_for_step(
  p_step_id uuid,
  p_pal_instance_uid text,
  p_allow_passive_mismatch boolean,
  p_expected_concurrency_version bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan public.execution_plans%rowtype; v_step public.breeding_steps%rowtype;
  v_item public.pal_snapshot_items%rowtype; v_next integer; v_latest uuid;
begin
  if auth.uid() is null then raise exception using errcode='P0001', message='AUTH_REQUIRED'; end if;
  select * into v_step from public.breeding_steps where id=p_step_id for update;
  if v_step.id is null or v_step.execution_plan_id is null then raise exception using errcode='P0001', message='PLAN_NOT_FOUND'; end if;
  select * into v_plan from public.execution_plans where id=v_step.execution_plan_id for update;
  if v_plan.requester_user_id<>auth.uid() and not public.is_admin() then raise exception using errcode='P0001', message='PLAN_ACCESS_DENIED'; end if;
  if exists(select 1 from public.execution_plan_events where plan_id=v_plan.id and idempotency_key=p_idempotency_key) then return private.execution_plan_result(v_plan.id); end if;
  if v_plan.concurrency_version<>p_expected_concurrency_version then raise exception using errcode='P0001', message='PLAN_VERSION_CONFLICT'; end if;
  if v_plan.status='paused' then raise exception using errcode='P0001', message='PLAN_PAUSED'; end if;
  if v_step.step_index<>v_plan.current_step_index then raise exception using errcode='P0001', message='PLAN_NOT_CURRENT_STEP'; end if;
  if v_step.status in ('completed','skipped','invalidated') then raise exception using errcode='P0001', message='PLAN_INVALID_STATE_TRANSITION'; end if;
  select latest_snapshot_id into v_latest from public.worlds where id=v_plan.world_id;
  select item.* into v_item from public.pal_snapshot_items item
   left join public.pal_share_preferences pref on pref.world_id=item.world_id and pref.pal_instance_uid=item.pal_instance_uid
   where item.snapshot_id=v_latest and item.world_id=v_plan.world_id and item.pal_instance_uid=p_pal_instance_uid
     and (item.owner_player_id=v_plan.player_id or (v_plan.allow_guild_shared and item.guild_id=v_plan.guild_id and coalesce(pref.share_enabled,true)));
  if v_item.id is null or v_item.pal_id<>v_step.expected_child_pal_id then raise exception using errcode='P0001', message='EXISTING_PAL_NOT_ELIGIBLE'; end if;
  if not p_allow_passive_mismatch and not v_step.required_passive_ids <@ v_item.passive_skill_ids then
    raise exception using errcode='P0001', message='CANDIDATE_CONFIRMATION_REQUIRED';
  end if;
  if exists(select 1 from public.breeding_steps where execution_plan_id=v_plan.id and selected_child_instance_uid=p_pal_instance_uid) then
    raise exception using errcode='P0001', message='CANDIDATE_ALREADY_USED';
  end if;
  update public.breeding_steps set selected_child_instance_uid=p_pal_instance_uid,status='completed',completed_at=now(),
    concurrency_version=concurrency_version+1,updated_at=now() where id=v_step.id;
  select min(step_index) into v_next from public.breeding_steps where execution_plan_id=v_plan.id and step_index>v_step.step_index and status not in ('completed','skipped');
  update public.execution_plans set current_step_index=coalesce(v_next,v_step.step_index+1),
    status=(case when v_next is null then 'completed' else 'active' end)::public.execution_plan_status,
    completed_at=case when v_next is null then now() else null end,
    concurrency_version=concurrency_version+1,updated_at=now(),paused_at=null where id=v_plan.id;
  insert into public.execution_plan_events(plan_id,step_id,event_type,actor_user_id,actor_kind,from_status,to_status,safe_metadata,idempotency_key)
  values(v_plan.id,v_step.id,'EXISTING_PAL_SELECTED',auth.uid(),private.execution_actor_kind(),v_step.status::text,'completed',jsonb_build_object('pal_instance_uid',p_pal_instance_uid,'passive_mismatch_accepted',p_allow_passive_mismatch),p_idempotency_key);
  return private.execution_plan_result(v_plan.id);
end;
$$;

create function public.get_execution_detection_context(p_detected_snapshot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_snapshot public.inventory_snapshots%rowtype;
begin
  if not private.is_service_role() then
    raise exception using errcode='P0001', message='SERVICE_ROLE_REQUIRED';
  end if;
  select * into v_snapshot from public.inventory_snapshots
   where id=p_detected_snapshot_id and status='published';
  if v_snapshot.id is null then
    raise exception using errcode='P0001', message='SNAPSHOT_DELTA_UNAVAILABLE';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'step_id',step.id,
      'plan_id',plan.id,
      'world_id',plan.world_id,
      'baseline_snapshot_id',step.baseline_snapshot_id,
      'expected_child_pal_id',step.expected_child_pal_id,
      'required_passive_ids',step.required_passive_ids,
      'preferred_gender',step.preferred_gender
    ) order by plan.created_at,step.step_index)
    from public.execution_plans plan
    join public.breeding_steps step on step.execution_plan_id=plan.id
    join public.inventory_snapshots baseline on baseline.id=step.baseline_snapshot_id
    where plan.world_id=v_snapshot.world_id
      and plan.status in ('active','awaiting_confirmation')
      and step.step_index=plan.current_step_index
      and step.status in ('breeding','retrying')
      and baseline.captured_at < v_snapshot.captured_at
      and not exists(
        select 1 from public.execution_candidate_detection_runs run
         where run.step_id=step.id and run.detected_snapshot_id=v_snapshot.id
      )
  ),'[]'::jsonb);
end;
$$;

create function public.record_execution_candidates(
  p_step_id uuid,
  p_detected_snapshot_id uuid,
  p_candidates jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_step public.breeding_steps%rowtype; v_plan public.execution_plans%rowtype;
  v_snapshot public.inventory_snapshots%rowtype; v_baseline public.inventory_snapshots%rowtype;
  v_candidate jsonb; v_item public.pal_snapshot_items%rowtype; v_matched text[];
  v_accessible boolean; v_count integer:=0; v_key text;
begin
  if not private.is_service_role() then raise exception using errcode='P0001', message='SERVICE_ROLE_REQUIRED'; end if;
  if p_candidates is null or jsonb_typeof(p_candidates)<>'array' or jsonb_array_length(p_candidates)>500 then
    raise exception using errcode='P0001', message='SNAPSHOT_DELTA_UNAVAILABLE';
  end if;
  select * into v_step from public.breeding_steps where id=p_step_id for update;
  if v_step.id is null or v_step.execution_plan_id is null or v_step.status not in ('breeding','retrying','candidate_detected') then
    raise exception using errcode='P0001', message='PLAN_INVALID_STATE_TRANSITION';
  end if;
  select * into v_plan from public.execution_plans where id=v_step.execution_plan_id for update;
  select * into v_snapshot from public.inventory_snapshots where id=p_detected_snapshot_id and status='published';
  select * into v_baseline from public.inventory_snapshots where id=v_step.baseline_snapshot_id and status='published';
  if v_plan.id is null or v_snapshot.id is null or v_baseline.id is null
    or v_snapshot.world_id<>v_plan.world_id or v_snapshot.captured_at<=v_baseline.captured_at
  then raise exception using errcode='P0001', message='SNAPSHOT_DELTA_UNAVAILABLE'; end if;
  if exists(select 1 from public.execution_candidate_detection_runs where step_id=p_step_id and detected_snapshot_id=p_detected_snapshot_id) then
    return (select candidate_count from public.execution_candidate_detection_runs where step_id=p_step_id and detected_snapshot_id=p_detected_snapshot_id);
  end if;

  for v_candidate in select value from jsonb_array_elements(p_candidates)
  loop
    if (v_candidate->>'match_score')::numeric not between 0 and 1
      or jsonb_typeof(v_candidate->'match_breakdown')<>'object'
    then raise exception using errcode='P0001', message='SNAPSHOT_DELTA_UNAVAILABLE'; end if;
    select * into v_item from public.pal_snapshot_items
     where snapshot_id=v_snapshot.id and pal_instance_uid=v_candidate->>'pal_instance_uid';
    if v_item.id is null or v_item.pal_id<>v_step.expected_child_pal_id then continue; end if;
    if exists(
      select 1 from public.pal_snapshot_items old_item
      join public.inventory_snapshots old_snapshot on old_snapshot.id=old_item.snapshot_id
      where old_item.world_id=v_plan.world_id
        and old_item.pal_instance_uid=v_item.pal_instance_uid
        and old_snapshot.status='published'
        and old_snapshot.captured_at<=v_baseline.captured_at
    ) then continue; end if;
    select coalesce(array_agg(required order by required),'{}'::text[]) into v_matched
      from unnest(v_step.required_passive_ids) required where required=any(v_item.passive_skill_ids);
    v_accessible := v_item.owner_player_id=v_plan.player_id or (
      v_plan.allow_guild_shared and v_plan.guild_id is not null and v_item.guild_id=v_plan.guild_id
      and coalesce((select share_enabled from public.pal_share_preferences pref
        where pref.world_id=v_item.world_id and pref.pal_instance_uid=v_item.pal_instance_uid),true)
    );
    if not v_accessible then continue; end if;
    v_key:=encode(extensions.digest(convert_to(concat_ws('|',p_step_id::text,p_detected_snapshot_id::text,v_item.pal_instance_uid),'UTF8'),'sha256'),'hex');
    insert into public.step_offspring_candidates(
      step_id,pal_instance_uid,detected_snapshot_id,candidate_key,pal_id,species_match,
      match_score,matched_passive_ids,required_passive_count,gender,level,
      owner_display_name,location_type,location_name,accessible,match_breakdown,first_detected_at
    ) values(
      p_step_id,v_item.pal_instance_uid,v_snapshot.id,v_key,v_item.pal_id,true,
      (v_candidate->>'match_score')::numeric,v_matched,cardinality(v_step.required_passive_ids),
      v_item.gender,v_item.level,coalesce((select nickname from public.players where id=v_item.owner_player_id),'未知所有者'),
      v_item.location_type,v_item.location_name,true,v_candidate->'match_breakdown',v_snapshot.captured_at
    ) on conflict (step_id,pal_instance_uid) do nothing;
    if found then v_count:=v_count+1; end if;
  end loop;
  insert into public.execution_candidate_detection_runs(step_id,detected_snapshot_id,candidate_count)
  values(p_step_id,p_detected_snapshot_id,v_count);
  if v_count>0 and v_step.status in ('breeding','retrying') then
    update public.breeding_steps set status='candidate_detected',concurrency_version=concurrency_version+1,updated_at=now() where id=v_step.id;
    update public.execution_plans set status='awaiting_confirmation',concurrency_version=concurrency_version+1,updated_at=now() where id=v_plan.id;
    insert into public.execution_plan_events(plan_id,step_id,event_type,actor_kind,from_status,to_status,safe_metadata,idempotency_key)
    values(v_plan.id,v_step.id,'OFFSPRING_CANDIDATES_DETECTED','agent',v_step.status::text,'candidate_detected',
      jsonb_build_object('snapshot_id',v_snapshot.id,'candidate_count',v_count),
      'agent:'||v_step.id::text||':'||v_snapshot.id::text);
  end if;
  return v_count;
end;
$$;

create function public.invalidate_execution_plan_dependencies(p_detected_snapshot_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_snapshot public.inventory_snapshots%rowtype; v_plan public.execution_plans%rowtype;
  v_step public.breeding_steps%rowtype; v_uid text; v_reason jsonb; v_count integer:=0;
  v_item public.pal_snapshot_items%rowtype; v_baseline_item public.pal_snapshot_items%rowtype;
  v_share_enabled boolean; v_reason_code text; v_required_gender text;
begin
  if not private.is_service_role() then raise exception using errcode='P0001', message='SERVICE_ROLE_REQUIRED'; end if;
  select * into v_snapshot from public.inventory_snapshots where id=p_detected_snapshot_id and status='published';
  if v_snapshot.id is null then raise exception using errcode='P0001', message='SNAPSHOT_DELTA_UNAVAILABLE'; end if;
  for v_plan in select * from public.execution_plans
    where world_id=v_snapshot.world_id and status in ('active','awaiting_confirmation','paused') for update
  loop
    v_reason:=null;
    if not exists(select 1 from public.game_data_versions where id=v_plan.game_data_version_id and content_hash=v_plan.content_hash) then
      v_reason:=jsonb_build_object('code','FIXED_CONTENT_HASH_MISMATCH','step_index',null,'instance_uid',null,'details','{}'::jsonb);
    else
      for v_step in select * from public.breeding_steps where execution_plan_id=v_plan.id and status not in ('completed','skipped','invalidated') order by step_index
      loop
        foreach v_uid in array array[v_step.parent_a_instance_uid,v_step.parent_b_instance_uid]
        loop
          if v_uid is null then continue; end if;
          v_reason_code:=null;
          v_required_gender:=case
            when v_uid is not distinct from v_step.parent_a_instance_uid then v_step.parent_a_required_gender
            else v_step.parent_b_required_gender
          end;
          select * into v_item from public.pal_snapshot_items item
            where item.snapshot_id=v_snapshot.id and item.pal_instance_uid=v_uid;
          select * into v_baseline_item from public.pal_snapshot_items item
            where item.snapshot_id=v_plan.inventory_snapshot_id and item.pal_instance_uid=v_uid;
          select coalesce(pref.share_enabled,true) into v_share_enabled
            from public.pal_share_preferences pref
            where pref.world_id=v_plan.world_id and pref.pal_instance_uid=v_uid;
          if v_item.id is null then
            v_reason_code:='DEPENDENCY_DISAPPEARED';
          elsif v_baseline_item.id is not null
            and v_item.owner_player_id is distinct from v_baseline_item.owner_player_id
          then
            v_reason_code:='OWNER_CHANGED';
          elsif v_item.owner_player_id<>v_plan.player_id and v_item.guild_id is distinct from v_plan.guild_id then
            v_reason_code:='GUILD_ACCESS_LOST';
          elsif v_item.owner_player_id<>v_plan.player_id
            and (not v_plan.allow_guild_shared or not coalesce(v_share_enabled,true))
          then
            v_reason_code:='SHARING_DISABLED';
          elsif v_required_gender is not null and v_item.gender::text<>v_required_gender then
            v_reason_code:='GENDER_INCOMPATIBLE';
          end if;
          if v_reason_code is not null then
            v_reason:=jsonb_build_object('code',v_reason_code,'step_index',v_step.step_index,'instance_uid',v_uid,'details',jsonb_build_object('snapshot_id',v_snapshot.id));
            exit;
          end if;
        end loop;
        exit when v_reason is not null;
      end loop;
    end if;
    if v_reason is not null then
      update public.breeding_steps set status='invalidated',invalidation_reasons=invalidation_reasons||jsonb_build_array(v_reason),
        concurrency_version=concurrency_version+1,updated_at=now()
        where execution_plan_id=v_plan.id and status not in ('completed','skipped','invalidated');
      update public.execution_plans set status='invalidated',invalidation_reasons=invalidation_reasons||jsonb_build_array(v_reason),
        paused_at=null,concurrency_version=concurrency_version+1,updated_at=now() where id=v_plan.id;
      insert into public.execution_plan_events(plan_id,event_type,actor_kind,from_status,to_status,safe_metadata,idempotency_key)
      values(v_plan.id,'PLAN_INVALIDATED','agent',v_plan.status::text,'invalidated',jsonb_build_object('reason',v_reason),
        'invalidate:'||v_snapshot.id::text||':'||v_plan.id::text);
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end;
$$;

create function public.confirm_offspring_candidate(
  p_step_id uuid,
  p_candidate_key text,
  p_expected_concurrency_version bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan public.execution_plans%rowtype; v_step public.breeding_steps%rowtype;
  v_candidate public.step_offspring_candidates%rowtype; v_current public.pal_snapshot_items%rowtype;
  v_latest uuid; v_next integer; v_reason jsonb; v_mismatch boolean;
begin
  if auth.uid() is null then raise exception using errcode='P0001', message='AUTH_REQUIRED'; end if;
  select * into v_step from public.breeding_steps where id=p_step_id for update;
  if v_step.id is null or v_step.execution_plan_id is null then raise exception using errcode='P0001', message='PLAN_NOT_FOUND'; end if;
  select * into v_plan from public.execution_plans where id=v_step.execution_plan_id for update;
  if v_plan.requester_user_id<>auth.uid() and not public.is_admin() then raise exception using errcode='P0001', message='PLAN_ACCESS_DENIED'; end if;
  if exists(select 1 from public.execution_plan_events where plan_id=v_plan.id and idempotency_key=p_idempotency_key) then return private.execution_plan_result(v_plan.id); end if;
  if v_plan.concurrency_version<>p_expected_concurrency_version then raise exception using errcode='P0001', message='PLAN_VERSION_CONFLICT'; end if;
  if v_step.step_index<>v_plan.current_step_index then raise exception using errcode='P0001', message='PLAN_NOT_CURRENT_STEP'; end if;
  if v_step.status<>'candidate_detected' then raise exception using errcode='P0001', message='PLAN_INVALID_STATE_TRANSITION'; end if;
  select * into v_candidate from public.step_offspring_candidates where step_id=p_step_id and candidate_key=p_candidate_key for update;
  if v_candidate.step_id is null or v_candidate.rejected_at is not null then raise exception using errcode='P0001', message='CANDIDATE_NOT_FOUND'; end if;
  if not v_candidate.species_match or v_candidate.pal_id<>v_step.expected_child_pal_id then raise exception using errcode='P0001', message='CANDIDATE_SPECIES_MISMATCH'; end if;
  if exists(select 1 from public.breeding_steps where selected_child_instance_uid=v_candidate.pal_instance_uid and id<>v_step.id) then raise exception using errcode='P0001', message='CANDIDATE_ALREADY_USED'; end if;
  select latest_snapshot_id into v_latest from public.worlds where id=v_plan.world_id;
  select item.* into v_current from public.pal_snapshot_items item
   left join public.pal_share_preferences pref on pref.world_id=item.world_id and pref.pal_instance_uid=item.pal_instance_uid
   where item.snapshot_id=v_latest and item.pal_instance_uid=v_candidate.pal_instance_uid
     and (item.owner_player_id=v_plan.player_id or (v_plan.allow_guild_shared and item.guild_id=v_plan.guild_id and coalesce(pref.share_enabled,true)));
  if v_current.id is null then raise exception using errcode='P0001', message='PLAN_DEPENDENCY_UNAVAILABLE'; end if;
  update public.step_offspring_candidates set confirmed=true,confirmed_at=now(),confirmed_by=auth.uid() where step_id=p_step_id and candidate_key=p_candidate_key;
  update public.breeding_steps set selected_child_instance_uid=v_candidate.pal_instance_uid,status='completed',completed_at=now(),
    concurrency_version=concurrency_version+1,updated_at=now() where id=v_step.id;
  v_mismatch := (v_step.preferred_gender is not null and v_current.gender::text<>v_step.preferred_gender)
    or not v_step.required_passive_ids <@ v_current.passive_skill_ids;
  if v_mismatch and exists(select 1 from public.breeding_steps where execution_plan_id=v_plan.id and step_index>v_step.step_index) then
    v_reason:=jsonb_build_object('code','CONFIRMED_RESULT_DIVERGED','step_index',v_step.step_index,
      'instance_uid',v_candidate.pal_instance_uid,'details',jsonb_build_object('gender',v_current.gender,'passive_skill_ids',v_current.passive_skill_ids));
    update public.breeding_steps set status='invalidated',invalidation_reasons=invalidation_reasons||jsonb_build_array(v_reason),
      concurrency_version=concurrency_version+1,updated_at=now()
      where execution_plan_id=v_plan.id and step_index>v_step.step_index and status not in ('completed','skipped');
    update public.execution_plans set status='invalidated',invalidation_reasons=invalidation_reasons||jsonb_build_array(v_reason),
      paused_at=null,concurrency_version=concurrency_version+1,updated_at=now() where id=v_plan.id;
  else
    select min(step_index) into v_next from public.breeding_steps where execution_plan_id=v_plan.id and step_index>v_step.step_index and status not in ('completed','skipped');
    update public.execution_plans set current_step_index=coalesce(v_next,v_step.step_index+1),
      status=(case when v_next is null then 'completed' else 'active' end)::public.execution_plan_status,
      completed_at=case when v_next is null then now() else null end,
      paused_at=null,concurrency_version=concurrency_version+1,updated_at=now() where id=v_plan.id;
  end if;
  insert into public.execution_plan_events(plan_id,step_id,event_type,actor_user_id,actor_kind,from_status,to_status,safe_metadata,idempotency_key)
  values(v_plan.id,v_step.id,'OFFSPRING_CONFIRMED',auth.uid(),private.execution_actor_kind(),'candidate_detected','completed',
    jsonb_build_object('candidate_key',p_candidate_key,'pal_instance_uid',v_candidate.pal_instance_uid,'downstream_invalidated',v_mismatch),p_idempotency_key);
  return private.execution_plan_result(v_plan.id);
end;
$$;

create function public.reject_offspring_candidate(
  p_candidate_key text,
  p_reason text,
  p_expected_concurrency_version bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_candidate public.step_offspring_candidates%rowtype; v_step public.breeding_steps%rowtype; v_plan public.execution_plans%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='P0001', message='AUTH_REQUIRED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception using errcode='P0001', message='CANDIDATE_NOT_FOUND'; end if;
  select * into v_candidate from public.step_offspring_candidates where candidate_key=p_candidate_key for update;
  if v_candidate.step_id is null then raise exception using errcode='P0001', message='CANDIDATE_NOT_FOUND'; end if;
  select * into v_step from public.breeding_steps where id=v_candidate.step_id;
  select * into v_plan from public.execution_plans where id=v_step.execution_plan_id for update;
  if v_plan.requester_user_id<>auth.uid() and not public.is_admin() then raise exception using errcode='P0001', message='PLAN_ACCESS_DENIED'; end if;
  if exists(select 1 from public.execution_plan_events where plan_id=v_plan.id and idempotency_key=p_idempotency_key) then return private.execution_plan_result(v_plan.id); end if;
  if v_plan.concurrency_version<>p_expected_concurrency_version then raise exception using errcode='P0001', message='PLAN_VERSION_CONFLICT'; end if;
  if v_candidate.confirmed or v_candidate.rejected_at is not null then raise exception using errcode='P0001', message='CANDIDATE_NOT_FOUND'; end if;
  update public.step_offspring_candidates set rejected_at=now(),rejected_by=auth.uid(),rejection_reason=btrim(p_reason) where candidate_key=p_candidate_key;
  update public.execution_plans set concurrency_version=concurrency_version+1,updated_at=now() where id=v_plan.id;
  insert into public.execution_plan_events(plan_id,step_id,event_type,actor_user_id,actor_kind,from_status,to_status,safe_metadata,idempotency_key)
  values(v_plan.id,v_step.id,'OFFSPRING_CANDIDATE_REJECTED',auth.uid(),private.execution_actor_kind(),v_step.status::text,v_step.status::text,
    jsonb_build_object('candidate_key',p_candidate_key,'reason',btrim(p_reason)),p_idempotency_key);
  return private.execution_plan_result(v_plan.id);
end;
$$;

create function public.recalculate_execution_plan(
  p_plan_id uuid,
  p_expected_concurrency_version bigint,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan public.execution_plans%rowtype; v_snapshot uuid; v_game uuid; v_breeding uuid;
  v_hash text; v_algorithm text; v_scoring text; v_fingerprint text; v_job_id uuid;
  v_job_key text; v_reused boolean:=false;
begin
  if auth.uid() is null then raise exception using errcode='P0001', message='AUTH_REQUIRED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500
    or p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 160
  then raise exception using errcode='P0001', message='PLAN_RECALCULATION_REQUIRED'; end if;
  select * into v_plan from public.execution_plans where id=p_plan_id for update;
  if v_plan.id is null then raise exception using errcode='P0001', message='PLAN_NOT_FOUND'; end if;
  if v_plan.requester_user_id<>auth.uid() and not public.is_admin() then raise exception using errcode='P0001', message='PLAN_ACCESS_DENIED'; end if;
  if v_plan.concurrency_version<>p_expected_concurrency_version then raise exception using errcode='P0001', message='PLAN_VERSION_CONFLICT'; end if;
  v_job_key:='recalc:'||encode(extensions.digest(convert_to(v_plan.id::text||'|'||p_idempotency_key,'UTF8'),'sha256'),'hex');
  select id into v_job_id from public.breeding_jobs where requester_user_id=v_plan.requester_user_id and idempotency_key=v_job_key;
  if v_job_id is not null then v_reused:=true;
  else
    select world.latest_snapshot_id,world.active_game_data_version_id,world.active_breeding_version_id,version.content_hash
      into v_snapshot,v_game,v_breeding,v_hash
      from public.worlds world left join public.game_data_versions version on version.id=world.active_game_data_version_id and version.status='published'
      where world.id=v_plan.world_id for share of world;
    select algorithm_version,version into v_algorithm,v_scoring from public.scoring_profiles
      where optimization_mode=v_plan.optimization_mode and is_active;
    if v_snapshot is null or v_game is null or v_game is distinct from v_breeding or v_hash is null or v_algorithm is null then
      raise exception using errcode='P0001', message='PLAN_FIXED_VERSION_UNAVAILABLE';
    end if;
    v_fingerprint:=encode(extensions.digest(convert_to(concat_ws('|','recalculate',v_plan.id::text,v_snapshot::text,v_game::text,v_hash,v_algorithm,v_scoring,v_plan.target_pal_id,array_to_string(v_plan.desired_passive_ids,','),v_plan.optimization_mode::text,v_plan.allow_guild_shared::text,v_plan.max_generations::text),'UTF8'),'sha256'),'hex');
    insert into public.breeding_jobs(
      requester_user_id,world_id,player_id,guild_id,target_pal_id,desired_passive_ids,
      optimization_mode,inventory_snapshot_id,breeding_data_version_id,game_data_version_id,
      game_data_content_hash,algorithm_version,scoring_profile_version,allow_guild_shared,
      max_generations,status,request_fingerprint,idempotency_key,source_plan_id,recalculation_reason
    ) values(
      v_plan.requester_user_id,v_plan.world_id,v_plan.player_id,v_plan.guild_id,v_plan.target_pal_id,v_plan.desired_passive_ids,
      v_plan.optimization_mode,v_snapshot,v_breeding,v_game,v_hash,v_algorithm,v_scoring,v_plan.allow_guild_shared,
      v_plan.max_generations,'pending',v_fingerprint,v_job_key,v_plan.id,btrim(p_reason)
    ) returning id into v_job_id;
    insert into public.execution_plan_events(plan_id,event_type,actor_user_id,actor_kind,from_status,to_status,safe_metadata,idempotency_key)
    values(v_plan.id,'PLAN_RECALCULATION_REQUESTED',auth.uid(),private.execution_actor_kind(),v_plan.status::text,v_plan.status::text,
      jsonb_build_object('job_id',v_job_id,'reason',btrim(p_reason)),p_idempotency_key);
  end if;
  return jsonb_build_object('source_plan_id',v_plan.id,'job_id',v_job_id,'reused',v_reused);
end;
$$;

create function private.execution_plan_summary(p_plan public.execution_plans)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'plan_id',p_plan.id,
    'target_pal_id',p_plan.target_pal_id,
    'target_pal_display_name',coalesce((
      select localization.text from public.catalog_pals pal
      left join public.catalog_localizations localization
        on localization.version_id=pal.version_id and localization.locale='zh-CN' and localization.text_key=pal.name_key
      where pal.version_id=p_plan.game_data_version_id and pal.pal_id=p_plan.target_pal_id
    ),p_plan.target_pal_id),
    'desired_passive_ids',p_plan.desired_passive_ids,
    'desired_passive_display_names',coalesce((
      select jsonb_agg(coalesce(localization.text,desired.passive_id) order by desired.ordinality)
      from unnest(p_plan.desired_passive_ids) with ordinality desired(passive_id,ordinality)
      left join public.catalog_passive_skills skill on skill.version_id=p_plan.game_data_version_id and skill.passive_skill_id=desired.passive_id
      left join public.catalog_localizations localization on localization.version_id=skill.version_id and localization.locale='zh-CN' and localization.text_key=skill.name_key
    ),'[]'::jsonb),
    'status',p_plan.status,
    'current_step_index',p_plan.current_step_index,
    'completed_step_count',(select count(*) from public.breeding_steps step where step.execution_plan_id=p_plan.id and step.status='completed'),
    'total_step_count',(select count(*) from public.breeding_steps step where step.execution_plan_id=p_plan.id),
    'pending_candidate_count',(select count(*) from public.step_offspring_candidates candidate join public.breeding_steps step on step.id=candidate.step_id where step.execution_plan_id=p_plan.id and not candidate.confirmed and candidate.rejected_at is null),
    'version_pin',jsonb_build_object(
      'inventory_snapshot_id',p_plan.inventory_snapshot_id,
      'game_data_version_id',p_plan.game_data_version_id,
      'content_hash',p_plan.content_hash,
      'algorithm_version',p_plan.algorithm_version,
      'scoring_profile_version',p_plan.scoring_profile_version
    ),
    'concurrency_version',p_plan.concurrency_version,
    'created_at',p_plan.created_at,
    'updated_at',p_plan.updated_at
  );
$$;

create function public.list_execution_plans(
  p_status text default 'all',
  p_limit integer default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_query_boundary timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_boundary timestamptz:=coalesce(p_query_boundary,now()); v_items jsonb; v_last_created timestamptz; v_last_id uuid; v_count integer;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error_code','AUTH_REQUIRED'); end if;
  if p_limit not between 1 and 50 or p_status not in ('all','active','awaiting_confirmation','paused','completed','invalidated','cancelled') then
    return jsonb_build_object('ok',false,'error_code','PLAN_INVALID_STATE_TRANSITION');
  end if;
  with page as (
    select plan.* from public.execution_plans plan
    where (plan.requester_user_id=auth.uid() or public.is_admin())
      and (p_status='all' or plan.status::text=p_status)
      and plan.updated_at<=v_boundary
      and (p_cursor_created_at is null or (plan.created_at,plan.id)<(p_cursor_created_at,p_cursor_id))
    order by plan.created_at desc,plan.id desc limit p_limit+1
  ), visible as (select * from page order by created_at desc,id desc limit p_limit)
  select coalesce(jsonb_agg(private.execution_plan_summary(visible) order by created_at desc,id desc),'[]'::jsonb),
    count(*),
    (array_agg(created_at order by created_at desc,id desc))[count(*)::integer],
    (array_agg(id order by created_at desc,id desc))[count(*)::integer]
    into v_items,v_count,v_last_created,v_last_id from visible;
  return jsonb_build_object('ok',true,'data',jsonb_build_object(
    'items',v_items,
    'next_cursor',case when v_count=p_limit and exists(
      select 1 from public.execution_plans plan where (plan.requester_user_id=auth.uid() or public.is_admin())
        and (p_status='all' or plan.status::text=p_status) and plan.updated_at<=v_boundary
        and (plan.created_at,plan.id)<(v_last_created,v_last_id)
    ) then v_last_created::text||'|'||v_last_id::text else null end,
    'query_boundary',v_boundary
  ));
end;
$$;

create function public.get_execution_plan_detail(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_plan public.execution_plans%rowtype; v_steps jsonb; v_candidates jsonb; v_events jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error_code','AUTH_REQUIRED'); end if;
  select * into v_plan from public.execution_plans where id=p_plan_id and (requester_user_id=auth.uid() or public.is_admin());
  if v_plan.id is null then return jsonb_build_object('ok',false,'error_code','PLAN_NOT_FOUND'); end if;
  if not exists(select 1 from public.game_data_versions where id=v_plan.game_data_version_id and content_hash=v_plan.content_hash) then
    return jsonb_build_object('ok',false,'error_code','PLAN_FIXED_VERSION_UNAVAILABLE');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'step_id',step.id,'step_index',step.step_index,
    'parent_a_source_kind',step.parent_a_source_kind,'parent_a_instance_uid',step.parent_a_instance_uid,'parent_a_step_index',step.parent_a_step_index,
    'parent_b_source_kind',step.parent_b_source_kind,'parent_b_instance_uid',step.parent_b_instance_uid,'parent_b_step_index',step.parent_b_step_index,
    'expected_child_pal_id',step.expected_child_pal_id,'required_passive_ids',step.required_passive_ids,'preferred_gender',step.preferred_gender,
    'selected_child_instance_uid',step.selected_child_instance_uid,'baseline_snapshot_id',step.baseline_snapshot_id,
    'candidate_detection_started_at',step.candidate_detection_started_at,'attempt_number',step.attempt_number,'status',step.status,
    'concurrency_version',step.concurrency_version,'skip_reason',step.skip_reason,'invalidation_reasons',step.invalidation_reasons,'completed_at',step.completed_at
  ) order by step.step_index),'[]'::jsonb) into v_steps from public.breeding_steps step where step.execution_plan_id=v_plan.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'candidate_key',candidate.candidate_key,'step_id',candidate.step_id,'pal_instance_uid',candidate.pal_instance_uid,
    'detected_snapshot_id',candidate.detected_snapshot_id,'pal_id',candidate.pal_id,
    'pal_display_name',coalesce((select localization.text from public.catalog_pals pal left join public.catalog_localizations localization on localization.version_id=pal.version_id and localization.locale='zh-CN' and localization.text_key=pal.name_key where pal.version_id=v_plan.game_data_version_id and pal.pal_id=candidate.pal_id),candidate.pal_id),
    'species_match',candidate.species_match,'matched_passive_ids',candidate.matched_passive_ids,'required_passive_count',candidate.required_passive_count,
    'gender',candidate.gender,'level',candidate.level,'owner_display_name',candidate.owner_display_name,'location_type',candidate.location_type,
    'location_name',candidate.location_name,'accessible',candidate.accessible,'match_score',candidate.match_score::float8,
    'match_breakdown',candidate.match_breakdown,'first_detected_at',candidate.first_detected_at,'confirmed',candidate.confirmed,
    'rejected_at',candidate.rejected_at,'rejection_reason',candidate.rejection_reason
  ) order by candidate.match_score desc,candidate.first_detected_at,candidate.pal_instance_uid),'[]'::jsonb)
  into v_candidates from public.step_offspring_candidates candidate join public.breeding_steps step on step.id=candidate.step_id where step.execution_plan_id=v_plan.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id',event.id,'step_id',event.step_id,'event_type',event.event_type,'actor_kind',event.actor_kind,
    'actor_display_name',coalesce(profile.display_name,case event.actor_kind when 'agent' then 'Agent' when 'system' then '系统' else '未知操作人' end),
    'from_status',event.from_status,'to_status',event.to_status,'safe_metadata',event.safe_metadata,'created_at',event.created_at
  ) order by event.created_at,event.id),'[]'::jsonb) into v_events
  from public.execution_plan_events event left join public.profiles profile on profile.id=event.actor_user_id where event.plan_id=v_plan.id;
  return jsonb_build_object('ok',true,'data',jsonb_build_object(
    'summary',private.execution_plan_summary(v_plan),'adopted_route_id',v_plan.adopted_route_id,
    'invalidation_reasons',v_plan.invalidation_reasons,'steps',v_steps,'candidates',v_candidates,'events',v_events
  ));
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
          'route_id', route.id,
          'execution_plan_id', execution.id,
          'ai_explanation', route.ai_explanation,
          'ai_labels', route.ai_labels
        ) order by route.rank
      )
      from public.breeding_routes as route
      left join public.execution_plans execution on execution.adopted_route_id=route.id
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
      'attempt_count', v_job.attempt_count,
      'error_code', v_job.error_code,
      'created_at', v_job.created_at,
      'completed_at', v_job.completed_at,
      'plan', v_plan
    )
  );
end;
$$;

alter table public.execution_plans enable row level security;
alter table public.execution_candidate_detection_runs enable row level security;
alter table public.execution_plan_events enable row level security;

create policy execution_plans_select_owner_or_admin
  on public.execution_plans for select to authenticated
  using (requester_user_id=auth.uid() or (select public.is_admin()));
create policy execution_plan_events_select_owner_or_admin
  on public.execution_plan_events for select to authenticated
  using ((select public.is_admin()) or private.owns_execution_plan(plan_id));

grant select on public.execution_plans, public.execution_plan_events to authenticated;
grant select on public.execution_plans, public.execution_candidate_detection_runs,
  public.execution_plan_events to service_role;

revoke all on function public.update_breeding_step_status(uuid,public.breeding_step_status)
  from public,anon;
revoke all on function public.confirm_step_offspring(uuid,text,uuid)
  from public,anon;
grant execute on function public.update_breeding_step_status(uuid,public.breeding_step_status)
  to authenticated;
grant execute on function public.confirm_step_offspring(uuid,text,uuid)
  to authenticated;

revoke all on function public.adopt_breeding_route(uuid,text) from public,anon;
revoke all on function public.start_breeding_step(uuid,bigint,text) from public,anon;
revoke all on function public.continue_breeding_attempt(uuid,bigint,text) from public,anon;
revoke all on function public.skip_breeding_step(uuid,text,bigint,text) from public,anon;
revoke all on function public.pause_execution_plan(uuid,bigint,text) from public,anon;
revoke all on function public.resume_execution_plan(uuid,bigint,text) from public,anon;
revoke all on function public.select_existing_pal_for_step(uuid,text,boolean,bigint,text) from public,anon;
revoke all on function public.confirm_offspring_candidate(uuid,text,bigint,text) from public,anon;
revoke all on function public.reject_offspring_candidate(text,text,bigint,text) from public,anon;
revoke all on function public.recalculate_execution_plan(uuid,bigint,text,text) from public,anon;
revoke all on function public.list_execution_plans(text,integer,timestamptz,uuid,timestamptz) from public,anon;
revoke all on function public.get_execution_plan_detail(uuid) from public,anon;

grant execute on function public.adopt_breeding_route(uuid,text) to authenticated;
grant execute on function public.start_breeding_step(uuid,bigint,text) to authenticated;
grant execute on function public.continue_breeding_attempt(uuid,bigint,text) to authenticated;
grant execute on function public.skip_breeding_step(uuid,text,bigint,text) to authenticated;
grant execute on function public.pause_execution_plan(uuid,bigint,text) to authenticated;
grant execute on function public.resume_execution_plan(uuid,bigint,text) to authenticated;
grant execute on function public.select_existing_pal_for_step(uuid,text,boolean,bigint,text) to authenticated;
grant execute on function public.confirm_offspring_candidate(uuid,text,bigint,text) to authenticated;
grant execute on function public.reject_offspring_candidate(text,text,bigint,text) to authenticated;
grant execute on function public.recalculate_execution_plan(uuid,bigint,text,text) to authenticated;
grant execute on function public.list_execution_plans(text,integer,timestamptz,uuid,timestamptz) to authenticated;
grant execute on function public.get_execution_plan_detail(uuid) to authenticated;

revoke all on function public.get_execution_detection_context(uuid) from public,anon,authenticated;
revoke all on function public.record_execution_candidates(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.invalidate_execution_plan_dependencies(uuid) from public,anon,authenticated;
grant execute on function public.get_execution_detection_context(uuid) to service_role;
grant execute on function public.record_execution_candidates(uuid,uuid,jsonb) to service_role;
grant execute on function public.invalidate_execution_plan_dependencies(uuid) to service_role;

revoke all on function private.owns_execution_plan(uuid) from public,anon,authenticated;
revoke all on function private.execution_actor_kind() from public,anon,authenticated;
revoke all on function private.execution_plan_result(uuid) from public,anon,authenticated;
revoke all on function private.execution_plan_summary(public.execution_plans) from public,anon,authenticated;
revoke all on function public.reject_execution_history_mutation() from public,anon,authenticated;
revoke all on function public.protect_execution_plan_pins() from public,anon,authenticated;

comment on table public.execution_plans is
  'Adopted immutable-version execution history; only audited RPCs may change workflow state.';
comment on table public.execution_plan_events is
  'Append-only safe audit history for player, administrator, Agent, and system plan actions.';
comment on function public.record_execution_candidates(uuid,uuid,jsonb) is
  'Service-only idempotent candidate creation from normalized immutable snapshot deltas; never confirms offspring.';

create function public.get_execution_snapshot_delta(
  p_step_id uuid,
  p_detected_snapshot_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_step public.breeding_steps%rowtype; v_plan public.execution_plans%rowtype;
  v_baseline public.inventory_snapshots%rowtype; v_detected public.inventory_snapshots%rowtype;
begin
  if not private.is_service_role() then raise exception using errcode='P0001', message='SERVICE_ROLE_REQUIRED'; end if;
  select * into v_step from public.breeding_steps where id=p_step_id;
  select * into v_plan from public.execution_plans where id=v_step.execution_plan_id;
  select * into v_baseline from public.inventory_snapshots where id=v_step.baseline_snapshot_id and status='published';
  select * into v_detected from public.inventory_snapshots where id=p_detected_snapshot_id and status='published';
  if v_step.id is null or v_plan.id is null or v_baseline.id is null or v_detected.id is null
    or v_detected.world_id<>v_plan.world_id or v_detected.captured_at<=v_baseline.captured_at
  then raise exception using errcode='P0001', message='SNAPSHOT_DELTA_UNAVAILABLE'; end if;
  return jsonb_build_object(
    'baseline',coalesce((select jsonb_agg(jsonb_build_object(
      'instance_uid',item.pal_instance_uid,'pal_id',item.pal_id,'gender',item.gender,
      'passive_skill_ids',item.passive_skill_ids,'level',item.level,
      'owner_display_name',coalesce(player.nickname,'未知所有者'),'location_type',item.location_type,
      'location_name',item.location_name,'accessible',true
    ) order by item.pal_instance_uid) from public.pal_snapshot_items item left join public.players player on player.id=item.owner_player_id where item.snapshot_id=v_baseline.id),'[]'::jsonb),
    'current',coalesce((select jsonb_agg(jsonb_build_object(
      'instance_uid',item.pal_instance_uid,'pal_id',item.pal_id,'gender',item.gender,
      'passive_skill_ids',item.passive_skill_ids,'level',item.level,
      'owner_display_name',coalesce(player.nickname,'未知所有者'),'location_type',item.location_type,
      'location_name',item.location_name,
      'accessible',(item.owner_player_id=v_plan.player_id or (v_plan.allow_guild_shared and item.guild_id=v_plan.guild_id and coalesce(pref.share_enabled,true)))
    ) order by item.pal_instance_uid) from public.pal_snapshot_items item left join public.players player on player.id=item.owner_player_id left join public.pal_share_preferences pref on pref.world_id=item.world_id and pref.pal_instance_uid=item.pal_instance_uid where item.snapshot_id=v_detected.id),'[]'::jsonb),
    'seen_before_or_at_baseline',coalesce((select jsonb_agg(uid order by uid) from (
      select distinct item.pal_instance_uid uid from public.pal_snapshot_items item
      join public.inventory_snapshots snapshot on snapshot.id=item.snapshot_id
      where item.world_id=v_plan.world_id and snapshot.status='published' and snapshot.captured_at<=v_baseline.captured_at
    ) seen),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_execution_snapshot_delta(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_execution_snapshot_delta(uuid,uuid) to service_role;
