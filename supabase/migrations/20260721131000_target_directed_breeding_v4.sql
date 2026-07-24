update public.scoring_profiles set is_active = false where is_active;

insert into public.scoring_profiles (
  id, version, optimization_mode, algorithm_version, weights, is_active, created_at
) values
  (
    '52000000-0000-4000-8000-000000000029',
    'balanced-v5',
    'balanced',
    'inventory-trait-aware-deterministic-v4',
    '{"route_length":0.14,"inventory_coverage":0.14,"passive_concentration":0.12,"borrowing":0.07,"intermediate_cost":0.08,"attempt_cost":0.12,"stability":0.08,"acquisition_cost":0.25}',
    true,
    '2026-07-21T13:10:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000030',
    'fastest-v5',
    'fastest',
    'inventory-trait-aware-deterministic-v4',
    '{"route_length":0.4,"inventory_coverage":0.08,"passive_concentration":0.04,"borrowing":0.02,"intermediate_cost":0.1,"attempt_cost":0.2,"stability":0.06,"acquisition_cost":0.1}',
    true,
    '2026-07-21T13:10:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000031',
    'highest-success-v5',
    'highest_success',
    'inventory-trait-aware-deterministic-v4',
    '{"route_length":0.04,"inventory_coverage":0.07,"passive_concentration":0.25,"borrowing":0.02,"intermediate_cost":0.12,"attempt_cost":0.26,"stability":0.09,"acquisition_cost":0.15}',
    true,
    '2026-07-21T13:10:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000032',
    'least-borrowing-v5',
    'least_borrowing',
    'inventory-trait-aware-deterministic-v4',
    '{"route_length":0.04,"inventory_coverage":0.05,"passive_concentration":0.06,"borrowing":0.55,"intermediate_cost":0.06,"attempt_cost":0.07,"stability":0.05,"acquisition_cost":0.12}',
    true,
    '2026-07-21T13:10:00Z'
  );

do $$
begin
  if (select count(*) from public.scoring_profiles
       where is_active
         and algorithm_version = 'inventory-trait-aware-deterministic-v4'
         and version in (
           'balanced-v5', 'fastest-v5', 'highest-success-v5', 'least-borrowing-v5'
         )) <> 4
  then
    raise exception using
      errcode = 'P0001',
      message = 'BREEDING_SCORING_PROFILE_REGISTRY_MISMATCH';
  end if;
end;
$$;

comment on table public.scoring_profiles is
  'Versioned deterministic scoring profiles; v5 pins the target-directed v4 search implementation without changing score weights.';
