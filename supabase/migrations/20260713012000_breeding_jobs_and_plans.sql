create type public.breeding_job_status as enum (
  'pending',
  'processing',
  'algorithm_completed',
  'ai_enriching',
  'retry_pending',
  'completed',
  'failed',
  'cancelled'
);
create type public.breeding_step_status as enum (
  'not_started',
  'breeding',
  'candidate_detected',
  'completed',
  'retrying',
  'skipped',
  'invalidated'
);

create table public.breeding_jobs (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  world_id uuid not null references public.worlds(id) on delete restrict,
  player_id uuid not null,
  guild_id uuid,
  target_pal_id text not null,
  desired_passive_ids text[] not null default '{}',
  optimization_mode public.optimization_mode not null,
  inventory_snapshot_id uuid not null,
  breeding_data_version_id uuid not null
    references public.breeding_data_versions(id) on delete restrict,
  algorithm_version text not null,
  scoring_profile_version text not null
    references public.scoring_profiles(version) on delete restrict,
  status public.breeding_job_status not null default 'pending',
  request_fingerprint text not null,
  idempotency_key text not null,
  locked_by text,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  error_code text,
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint breeding_jobs_player_world_fkey
    foreign key (player_id, world_id)
    references public.players(id, world_id)
    on delete restrict,
  constraint breeding_jobs_guild_world_fkey
    foreign key (guild_id, world_id)
    references public.guilds(id, world_id)
    on delete restrict,
  constraint breeding_jobs_snapshot_world_fkey
    foreign key (inventory_snapshot_id, world_id)
    references public.inventory_snapshots(id, world_id)
    on delete restrict,
  constraint breeding_jobs_target_pal_check
    check (char_length(btrim(target_pal_id)) between 1 and 120),
  constraint breeding_jobs_desired_passives_check check (
    cardinality(desired_passive_ids) between 0 and 4
    and public.is_valid_id_array(desired_passive_ids)
  ),
  constraint breeding_jobs_algorithm_version_check
    check (char_length(btrim(algorithm_version)) between 1 and 100),
  constraint breeding_jobs_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint breeding_jobs_idempotency_key_check
    check (char_length(btrim(idempotency_key)) between 1 and 160),
  constraint breeding_jobs_attempts_check
    check (attempt_count >= 0 and max_attempts between 1 and 20 and attempt_count <= max_attempts),
  constraint breeding_jobs_lock_check check (
    (
      status in ('processing', 'algorithm_completed', 'ai_enriching')
      and locked_by is not null
      and locked_at is not null
      and heartbeat_at is not null
    )
    or (
      status not in ('processing', 'algorithm_completed', 'ai_enriching')
      and locked_by is null
      and locked_at is null
      and heartbeat_at is null
    )
  ),
  constraint breeding_jobs_locked_by_check
    check (locked_by is null or char_length(btrim(locked_by)) between 1 and 128),
  constraint breeding_jobs_error_code_check
    check (
      error_code is null
      or (
        char_length(error_code) between 1 and 100
        and error_code ~ '^[A-Z][A-Z0-9_]*$'
      )
    ),
  constraint breeding_jobs_error_summary_check
    check (error_summary is null or char_length(error_summary) <= 500),
  constraint breeding_jobs_completion_check check (
    (status in ('completed', 'failed', 'cancelled') and completed_at is not null)
    or (status not in ('completed', 'failed', 'cancelled') and completed_at is null)
  ),
  constraint breeding_jobs_requester_idempotency_key
    unique (requester_user_id, idempotency_key)
);

create unique index breeding_jobs_active_fingerprint_idx
  on public.breeding_jobs(requester_user_id, request_fingerprint)
  where status not in ('completed', 'failed', 'cancelled');
create index breeding_jobs_claim_idx
  on public.breeding_jobs(status, created_at, id)
  where status in ('pending', 'retry_pending');
create index breeding_jobs_requester_created_idx
  on public.breeding_jobs(requester_user_id, created_at desc);
create index breeding_jobs_lease_idx
  on public.breeding_jobs(status, heartbeat_at)
  where status in ('processing', 'algorithm_completed', 'ai_enriching');

create table public.breeding_plans (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.breeding_jobs(id) on delete cascade,
  recommended_route_id uuid,
  ai_provider text not null default 'none',
  ai_model text,
  ai_explanation text,
  generated_at timestamptz not null default now(),
  constraint breeding_plans_ai_provider_check
    check (char_length(btrim(ai_provider)) between 1 and 80),
  constraint breeding_plans_ai_model_check
    check (ai_model is null or char_length(ai_model) <= 120),
  constraint breeding_plans_ai_explanation_check
    check (ai_explanation is null or char_length(ai_explanation) <= 10000)
);

create table public.breeding_routes (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.breeding_plans(id) on delete cascade,
  rank integer not null,
  total_score numeric(12, 6) not null,
  generation_count integer not null,
  estimated_attempts_min integer,
  estimated_attempts_max integer,
  borrowed_pal_count integer not null,
  inventory_coverage numeric(8, 6) not null,
  inheritance_score numeric(8, 6) not null,
  score_breakdown jsonb not null,
  created_at timestamptz not null default now(),
  constraint breeding_routes_rank_check check (rank > 0),
  constraint breeding_routes_total_score_check check (total_score >= 0),
  constraint breeding_routes_generation_count_check check (generation_count >= 0),
  constraint breeding_routes_attempts_check check (
    (estimated_attempts_min is null and estimated_attempts_max is null)
    or (
      estimated_attempts_min is not null
      and estimated_attempts_max is not null
      and estimated_attempts_min > 0
      and estimated_attempts_max >= estimated_attempts_min
    )
  ),
  constraint breeding_routes_borrowed_count_check check (borrowed_pal_count >= 0),
  constraint breeding_routes_inventory_coverage_check
    check (inventory_coverage between 0 and 1),
  constraint breeding_routes_inheritance_score_check
    check (inheritance_score between 0 and 1),
  constraint breeding_routes_score_breakdown_check
    check (jsonb_typeof(score_breakdown) = 'object'),
  constraint breeding_routes_plan_rank_key unique (plan_id, rank),
  constraint breeding_routes_id_plan_key unique (id, plan_id)
);

alter table public.breeding_plans
  add constraint breeding_plans_recommended_route_fkey
  foreign key (recommended_route_id)
  references public.breeding_routes(id)
  on delete restrict
  deferrable initially deferred;

create table public.breeding_steps (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.breeding_routes(id) on delete cascade,
  step_index integer not null,
  parent_a_instance_uid text,
  parent_b_instance_uid text,
  expected_child_pal_id text not null,
  required_passive_ids text[] not null default '{}',
  selected_child_instance_uid text,
  status public.breeding_step_status not null default 'not_started',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint breeding_steps_index_check check (step_index >= 0),
  constraint breeding_steps_parent_a_check
    check (
      parent_a_instance_uid is null
      or char_length(btrim(parent_a_instance_uid)) between 1 and 160
    ),
  constraint breeding_steps_parent_b_check
    check (
      parent_b_instance_uid is null
      or char_length(btrim(parent_b_instance_uid)) between 1 and 160
    ),
  constraint breeding_steps_expected_child_check
    check (char_length(btrim(expected_child_pal_id)) between 1 and 120),
  constraint breeding_steps_required_passives_check check (
    cardinality(required_passive_ids) between 0 and 4
    and public.is_valid_id_array(required_passive_ids)
  ),
  constraint breeding_steps_selected_child_check
    check (
      selected_child_instance_uid is null
      or char_length(btrim(selected_child_instance_uid)) between 1 and 160
    ),
  constraint breeding_steps_completion_check check (
    (status = 'completed' and completed_at is not null and selected_child_instance_uid is not null)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint breeding_steps_route_index_key unique (route_id, step_index)
);

create table public.step_offspring_candidates (
  step_id uuid not null references public.breeding_steps(id) on delete cascade,
  pal_instance_uid text not null,
  detected_snapshot_id uuid not null,
  match_score numeric(8, 6) not null,
  matched_passive_ids text[] not null default '{}',
  first_detected_at timestamptz not null,
  confirmed boolean not null default false,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete restrict,
  primary key (step_id, pal_instance_uid, detected_snapshot_id),
  constraint step_candidates_snapshot_item_fkey
    foreign key (detected_snapshot_id, pal_instance_uid)
    references public.pal_snapshot_items(snapshot_id, pal_instance_uid)
    on delete restrict,
  constraint step_candidates_instance_uid_check
    check (char_length(btrim(pal_instance_uid)) between 1 and 160),
  constraint step_candidates_match_score_check check (match_score between 0 and 1),
  constraint step_candidates_matched_passives_check check (
    cardinality(matched_passive_ids) between 0 and 4
    and public.is_valid_id_array(matched_passive_ids)
  ),
  constraint step_candidates_confirmation_check check (
    (confirmed and confirmed_at is not null and confirmed_by is not null)
    or (not confirmed and confirmed_at is null and confirmed_by is null)
  )
);

create unique index step_candidates_one_confirmed_idx
  on public.step_offspring_candidates(step_id)
  where confirmed;
create index step_candidates_snapshot_idx
  on public.step_offspring_candidates(detected_snapshot_id);

create function public.validate_recommended_route()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.recommended_route_id is not null and not exists (
    select 1
    from public.breeding_routes as route
    where route.id = new.recommended_route_id
      and route.plan_id = new.id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'RECOMMENDED_ROUTE_PLAN_MISMATCH';
  end if;
  return new;
end;
$$;

create constraint trigger breeding_plans_validate_recommended_route
  after insert or update of recommended_route_id on public.breeding_plans
  deferrable initially deferred
  for each row execute function public.validate_recommended_route();

create function public.validate_offspring_candidate_world()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_job_world_id uuid;
  v_snapshot_world_id uuid;
begin
  select job.world_id
    into v_job_world_id
    from public.breeding_steps as step
    join public.breeding_routes as route on route.id = step.route_id
    join public.breeding_plans as plan on plan.id = route.plan_id
    join public.breeding_jobs as job on job.id = plan.job_id
   where step.id = new.step_id;

  select snapshot.world_id
    into v_snapshot_world_id
    from public.inventory_snapshots as snapshot
   where snapshot.id = new.detected_snapshot_id;

  if v_job_world_id is null or v_snapshot_world_id is distinct from v_job_world_id then
    raise exception using
      errcode = 'P0001',
      message = 'CANDIDATE_WORLD_MISMATCH';
  end if;

  return new;
end;
$$;

create trigger step_candidates_validate_world
  before insert or update on public.step_offspring_candidates
  for each row execute function public.validate_offspring_candidate_world();

comment on table public.breeding_jobs is
  'Asynchronous deterministic breeding request with fixed inventory, data, algorithm, and scoring versions.';
comment on table public.breeding_routes is
  'Algorithm-owned route scores; authenticated players have read-only access through RLS.';
comment on table public.step_offspring_candidates is
  'Detection is only a candidate until an owning player explicitly confirms it.';
