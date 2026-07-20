alter table public.breeding_routes
  add column feasibility_status text generated always as (
    coalesce(route_payload->>'feasibility_status', 'ready')
  ) stored,
  add column adoptable boolean generated always as (
    coalesce((route_payload->>'adoptable')::boolean, true)
  ) stored,
  add column missing_pal_count integer generated always as (
    coalesce((route_payload->>'missing_pal_count')::integer, 0)
  ) stored,
  add constraint breeding_routes_feasibility_status_check
    check (feasibility_status in ('ready', 'needs_inventory')),
  add constraint breeding_routes_missing_pal_count_check
    check (missing_pal_count >= 0),
  add constraint breeding_routes_adoptability_check check (
    (
      feasibility_status = 'ready'
      and adoptable
      and missing_pal_count = 0
    )
    or (
      feasibility_status = 'needs_inventory'
      and not adoptable
      and missing_pal_count > 0
    )
  );

create index breeding_routes_feasibility_rank_idx
  on public.breeding_routes(plan_id, feasibility_status, rank);

create function private.enforce_adoptable_breeding_route()
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
  ) then
    raise exception using errcode = 'P0001', message = 'ROUTE_NOT_ADOPTABLE';
  end if;
  return new;
end;
$$;

create trigger execution_plans_require_adoptable_route
  before insert on public.execution_plans
  for each row execute function private.enforce_adoptable_breeding_route();

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
    end
  );
$$;

update public.scoring_profiles set is_active = false where is_active;

insert into public.scoring_profiles (
  id, version, optimization_mode, algorithm_version, weights, is_active, created_at
) values
  (
    '52000000-0000-4000-8000-000000000021',
    'balanced-v3',
    'balanced',
    'inventory-aware-deterministic-v2',
    '{"route_length":0.14,"inventory_coverage":0.14,"passive_concentration":0.12,"borrowing":0.07,"intermediate_cost":0.08,"attempt_cost":0.12,"stability":0.08,"acquisition_cost":0.25}',
    true,
    '2026-07-20T00:00:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000022',
    'fastest-v3',
    'fastest',
    'inventory-aware-deterministic-v2',
    '{"route_length":0.4,"inventory_coverage":0.08,"passive_concentration":0.04,"borrowing":0.02,"intermediate_cost":0.1,"attempt_cost":0.2,"stability":0.06,"acquisition_cost":0.1}',
    true,
    '2026-07-20T00:00:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000023',
    'highest-success-v3',
    'highest_success',
    'inventory-aware-deterministic-v2',
    '{"route_length":0.04,"inventory_coverage":0.07,"passive_concentration":0.25,"borrowing":0.02,"intermediate_cost":0.12,"attempt_cost":0.26,"stability":0.09,"acquisition_cost":0.15}',
    true,
    '2026-07-20T00:00:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000024',
    'least-borrowing-v3',
    'least_borrowing',
    'inventory-aware-deterministic-v2',
    '{"route_length":0.04,"inventory_coverage":0.05,"passive_concentration":0.06,"borrowing":0.55,"intermediate_cost":0.06,"attempt_cost":0.07,"stability":0.05,"acquisition_cost":0.12}',
    true,
    '2026-07-20T00:00:00Z'
  );

do $$
begin
  if (select count(*) from public.scoring_profiles
       where is_active
         and algorithm_version = 'inventory-aware-deterministic-v2'
         and version in (
           'balanced-v3', 'fastest-v3', 'highest-success-v3', 'least-borrowing-v3'
         )) <> 4
  then
    raise exception using
      errcode = 'P0001',
      message = 'BREEDING_SCORING_PROFILE_REGISTRY_MISMATCH';
  end if;
end;
$$;

revoke all on function private.enforce_adoptable_breeding_route() from public, anon, authenticated;

comment on column public.breeding_routes.feasibility_status is
  'Inventory feasibility persisted from the deterministic route payload.';
comment on column public.breeding_routes.missing_pal_count is
  'Number of starting parent requirements not backed by the pinned inventory snapshot.';
comment on function private.enforce_adoptable_breeding_route() is
  'Rejects execution plans for deterministic routes that still require inventory.';
