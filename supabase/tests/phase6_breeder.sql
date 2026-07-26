begin;
set local search_path = public, extensions;

select plan(39);

-- The acceptance database may keep the real local-test binding active. This
-- transaction-local fixture binding makes pgTAP deterministic and rolls back.
update public.player_bindings
   set player_id = '30000000-0000-4000-8000-000000000001'
 where user_id = '00000000-0000-4000-8000-000000000002';

select has_column('public', 'breeding_jobs', 'game_data_content_hash',
  'jobs pin the exact catalog content hash');
select has_column('public', 'breeding_jobs', 'allow_guild_shared',
  'jobs pin the guild-sharing choice');
select has_column('public', 'breeding_jobs', 'max_generations',
  'jobs pin the generation limit');
select has_column('public', 'breeding_routes', 'route_key',
  'routes keep the deterministic route key');
select has_column('public', 'breeding_routes', 'route_payload',
  'routes keep the deterministic facts needed by the comparison UI');
select has_column('public', 'breeding_plans', 'result_digest',
  'plans keep the deterministic result digest');
select has_trigger(
  'public', 'breeding_jobs', 'breeding_jobs_content_pin_guard',
  'all job insertion paths enforce the exact version content hash'
);

select has_function(
  'public',
  'create_breeding_job_v2',
  array['text', 'text[]', 'public.optimization_mode', 'boolean', 'integer'],
  'Phase 6 exposes the safe browser create RPC'
);
select has_function(
  'public',
  'get_breeder_form_context',
  array['text'],
  'Phase 6 exposes one atomic browser-safe form context RPC'
);
select has_function(
  'public',
  'get_breeding_job_detail',
  array['uuid'],
  'Phase 6 exposes an owner-filtered refresh-safe job projection'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000005"}',
  true
);
set local role authenticated;

select is(
  public.get_breeder_form_context() #>> '{error_code}',
  'PLAYER_BINDING_REQUIRED',
  'the form context rejects an unbound user'
);

select throws_ok(
  $$
    select * from public.create_breeding_job_v2(
      'test_child_pal', array['test_passive_a'], 'balanced', true, 5
    )
  $$,
  'P0001',
  'PLAYER_BINDING_REQUIRED',
  'an unbound user cannot create a breeding job'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select ok(
  (public.get_breeder_form_context() #>> '{ok}')::boolean
  and public.get_breeder_form_context()::text !~
    '(owner_player_id|guild_id|source_save_hash|raw_metadata|/opt/palworld)',
  'the form context is complete and excludes inventory identities and raw-save fields'
);

select lives_ok(
  $$
    select * from public.create_breeding_job_v2(
      'test_child_pal',
      array['test_passive_b', 'test_passive_a'],
      'balanced',
      true,
      4
    )
  $$,
  'a bound player can create a Phase 6 breeding job'
);

select results_eq(
  $$
    select
      inventory_snapshot_id,
      game_data_version_id,
      game_data_content_hash,
      algorithm_version,
      scoring_profile_version
    from public.breeding_jobs
    where target_pal_id = 'test_child_pal'
      and max_generations = 4
    order by created_at desc
    limit 1
  $$,
  $$
    values (
      '40000000-0000-4000-8000-000000000002'::uuid,
      '51000000-0000-4000-8000-000000000001'::uuid,
      repeat('c', 64)::text,
      'inventory-trait-aware-deterministic-v5'::text,
      'balanced-v6'::text
    )
  $$,
  'create fixes snapshot, published catalog, hash, algorithm and scoring in one transaction'
);

select results_eq(
  $$
    select desired_passive_ids, allow_guild_shared, max_generations
    from public.breeding_jobs
    where target_pal_id = 'test_child_pal'
      and max_generations = 4
    order by created_at desc
    limit 1
  $$,
  $$ values (array['test_passive_a', 'test_passive_b']::text[], true, 4) $$,
  'create canonicalizes passives and persists both Phase 6 controls'
);

select ok(
  (
    select reused from public.create_breeding_job_v2(
      'test_child_pal',
      array['test_passive_a', 'test_passive_b'],
      'balanced',
      true,
      4
    )
  ),
  'repeated active input returns the same job'
);

reset role;
update public.breeding_jobs
   set status = 'failed',
       error_code = 'HANDLER_FAILED',
       error_summary = 'terminal fixture',
       completed_at = now(),
       updated_at = now()
 where requester_user_id = '00000000-0000-4000-8000-000000000002'
   and target_pal_id = 'test_child_pal'
   and desired_passive_ids = array['test_passive_a', 'test_passive_b']::text[]
   and allow_guild_shared
   and max_generations = 4
   and status not in ('completed', 'failed', 'cancelled');
set local role authenticated;

select is(
  (
    select reused from public.create_breeding_job_v2(
      'test_child_pal',
      array['test_passive_a', 'test_passive_b'],
      'balanced',
      true,
      4
    )
  ),
  false,
  'terminal input creates a fresh job instead of reusing a failed job'
);

select is(
  (
    select count(*)::integer
      from public.breeding_jobs
     where requester_user_id = '00000000-0000-4000-8000-000000000002'
       and target_pal_id = 'test_child_pal'
       and desired_passive_ids = array['test_passive_a', 'test_passive_b']::text[]
       and allow_guild_shared
       and max_generations = 4
  ),
  2,
  'terminal and fresh jobs keep separate immutable history'
);

select isnt(
  (
    select job_id from public.create_breeding_job_v2(
      'test_child_pal', array['test_passive_a', 'test_passive_b'],
      'balanced', false, 4
    )
  ),
  (
    select job_id from public.create_breeding_job_v2(
      'test_child_pal', array['test_passive_a', 'test_passive_b'],
      'balanced', true, 4
    )
  ),
  'changing guild sharing changes the idempotency fingerprint'
);

select throws_ok(
  $$
    select * from public.create_breeding_job_v2(
      'test_child_pal', array[]::text[], 'balanced', true, 9
    )
  $$,
  'P0001',
  'INVALID_MAX_GENERATIONS',
  'the database rejects an out-of-range generation limit'
);

select throws_ok(
  $$
    select * from public.create_breeding_job_v2(
      'test_child_pal', array['a','b','c','d','e'], 'balanced', true, 5
    )
  $$,
  'P0001',
  'INVALID_DESIRED_PASSIVES',
  'the database rejects more than four desired passives'
);

select is(
  (
    public.get_breeding_job_detail(
      (select id from public.breeding_jobs where max_generations = 4
       order by created_at desc limit 1)
    ) #>> '{data,game_data_content_hash}'
  ),
  repeat('c', 64),
  'the refresh projection exposes the fixed content hash'
);

select is(
  (
    public.get_breeding_job_detail(
      (select id from public.breeding_jobs where max_generations = 4
       order by created_at desc limit 1)
    ) #>> '{data,localization,pals,2,display_name}'
  ),
  '幻色幼崽',
  'the job detail localizes Pals from its pinned catalog version'
);

select is(
  (
    public.get_breeding_job_detail(
      (select id from public.breeding_jobs where max_generations = 4
       order by created_at desc limit 1)
    ) #>> '{data,localization,passive_skills,0,display_name}'
  ),
  '认真',
  'the job detail localizes passives from its pinned catalog version'
);

select is(
  (
    public.get_breeding_job_detail(
      (select id from public.breeding_jobs where max_generations = 4
       order by created_at desc limit 1)
    ) #>> '{data,localization,passive_skills,0,rank}'
  ),
  '1',
  'the job detail projects passive rank from its pinned catalog version'
);

select is(
  (
    public.get_breeding_job_detail(
      (select id from public.breeding_jobs where max_generations = 4
       order by created_at desc limit 1)
    ) #>> '{data,localization,passive_skills,0,is_negative}'
  ),
  'false',
  'the job detail projects the catalog negative-passive fact'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000003"}',
  true
);
set local role authenticated;

select is_empty(
  $$
    select id from public.breeding_jobs
    where requester_user_id = '00000000-0000-4000-8000-000000000002'
      and max_generations = 4
  $$,
  'RLS hides another player job'
);

select is(
  public.get_breeding_job_detail(
    (select id from public.breeding_jobs
     where requester_user_id = '00000000-0000-4000-8000-000000000002'
     limit 1)
  ) #>> '{error_code}',
  'JOB_NOT_FOUND',
  'a player cannot use the detail RPC to discover another player job'
);

reset role;

insert into public.breeding_jobs (
  id, requester_user_id, world_id, player_id, guild_id,
  target_pal_id, desired_passive_ids, optimization_mode,
  inventory_snapshot_id, breeding_data_version_id, game_data_version_id,
  game_data_content_hash, algorithm_version, scoring_profile_version,
  allow_guild_shared, max_generations, status, request_fingerprint,
  idempotency_key, locked_by, lease_token, locked_at, heartbeat_at,
  attempt_count, max_attempts, created_at, updated_at
) values (
  '60000000-0000-4000-8000-000000000066',
  '00000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'test_child_pal', array['test_passive_a'], 'balanced',
  '40000000-0000-4000-8000-000000000002',
  '51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  repeat('c', 64), 'phase4b-deterministic-v1', 'balanced-v2',
  true, 5, 'processing', repeat('6', 64), 'phase6-worker-fixture',
  'phase6-worker', '70000000-0000-4000-8000-000000000066',
  now(), now(), 1, 3, now(), now()
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select lives_ok(
  $$
    select public.persist_breeding_algorithm_result(
      '60000000-0000-4000-8000-000000000066',
      'phase6-worker',
      '70000000-0000-4000-8000-000000000066',
      jsonb_build_object(
        'target_pal_id', 'test_child_pal',
        'desired_passive_ids', jsonb_build_array('test_passive_a'),
        'inventory_snapshot_id', '40000000-0000-4000-8000-000000000002',
        'game_data_version_id', '51000000-0000-4000-8000-000000000001',
        'game_data_content_hash', repeat('c', 64),
        'algorithm_version', 'phase4b-deterministic-v1',
        'scoring_profile_version', 'balanced-v2',
        'optimization_mode', 'balanced',
        'routes', jsonb_build_array(jsonb_build_object(
          'route_key', repeat('2', 64), 'rank', 1,
          'optimization_mode', 'balanced', 'total_score', 80,
          'generation_count', 1, 'estimated_attempts_min', 1,
          'estimated_attempts_max', 3, 'difficulty', 'low',
          'borrowed_pal_count', 0, 'inventory_coverage', 1,
          'inheritance_score', 1,
          'score_breakdown', jsonb_build_object('immutable_fixture', true),
          'steps', '[]'::jsonb
        )),
        'explanation_codes', '[]'::jsonb,
        'diagnostics', '{}'::jsonb,
        'result_digest', repeat('d', 64)
      )
    )
  $$,
  'the fenced Worker persists deterministic routes atomically'
);

select is(
  (select status from public.breeding_jobs where id = '60000000-0000-4000-8000-000000000066'),
  'algorithm_completed'::public.breeding_job_status,
  'algorithm persistence advances the real job stage'
);

select is(
  (select route_count from public.breeding_plans where job_id = '60000000-0000-4000-8000-000000000066'),
  1,
  'algorithm persistence records every available route when fewer than three exist'
);

select lives_ok(
  $$
    select public.persist_breeding_algorithm_result(
      '60000000-0000-4000-8000-000000000066',
      'phase6-worker',
      '70000000-0000-4000-8000-000000000066',
      jsonb_build_object(
        'target_pal_id', 'test_child_pal', 'desired_passive_ids', jsonb_build_array('test_passive_a'),
        'inventory_snapshot_id', '40000000-0000-4000-8000-000000000002',
        'game_data_version_id', '51000000-0000-4000-8000-000000000001',
        'game_data_content_hash', repeat('c', 64),
        'algorithm_version', 'phase4b-deterministic-v1', 'scoring_profile_version', 'balanced-v2',
        'optimization_mode', 'balanced',
        'routes', jsonb_build_array(jsonb_build_object(
          'route_key', repeat('2', 64), 'rank', 1, 'optimization_mode', 'balanced',
          'total_score', 80, 'generation_count', 1, 'estimated_attempts_min', 1,
          'estimated_attempts_max', 3, 'difficulty', 'low', 'borrowed_pal_count', 0,
          'inventory_coverage', 1, 'inheritance_score', 1,
          'score_breakdown', jsonb_build_object('immutable_fixture', true), 'steps', '[]'::jsonb
        )), 'explanation_codes', '[]'::jsonb, 'diagnostics', '{}'::jsonb,
        'result_digest', repeat('d', 64)
      )
    )
  $$,
  'a retried algorithm persistence call is idempotent'
);

select is(
  (select count(*)::integer from public.breeding_routes as route
    join public.breeding_plans as plan on plan.id = route.plan_id
   where plan.job_id = '60000000-0000-4000-8000-000000000066'),
  1,
  'a retry does not duplicate plans or routes'
);

select throws_ok(
  $$
    select public.persist_breeding_algorithm_result(
      '60000000-0000-4000-8000-000000000066', 'phase6-worker',
      '70000000-0000-4000-8000-000000000066',
      jsonb_build_object(
        'target_pal_id', 'test_child_pal',
        'inventory_snapshot_id', '40000000-0000-4000-8000-000000000002',
        'game_data_version_id', '51000000-0000-4000-8000-000000000001',
        'game_data_content_hash', repeat('0', 64),
        'algorithm_version', 'phase4b-deterministic-v1',
        'scoring_profile_version', 'balanced-v2', 'optimization_mode', 'balanced',
        'routes', '[]'::jsonb, 'result_digest', repeat('0', 64)
      )
    )
  $$,
  'P0001', 'BREEDING_RESULT_VERSION_MISMATCH',
  'a mismatched fixed content hash is rejected'
);

select ok(
  public.persist_breeding_ai_result(
    '60000000-0000-4000-8000-000000000066', 'phase6-worker',
    '70000000-0000-4000-8000-000000000066',
    'template', null, '本地模板解释', true,
    jsonb_build_array(jsonb_build_object(
      'route_key', repeat('2', 64), 'explanation', '仅解释既有路线',
      'labels', jsonb_build_array('解释已降级'), 'total_score', 999
    ))
  ),
  'AI explanation persistence succeeds after the algorithm stage'
);

select results_eq(
  $$
    select job.status, route.total_score, route.route_payload->'score_breakdown'
      from public.breeding_jobs as job
      join public.breeding_plans as plan on plan.job_id = job.id
      join public.breeding_routes as route on route.plan_id = plan.id
     where job.id = '60000000-0000-4000-8000-000000000066'
  $$,
  $$
    values (
      'ai_enriching'::public.breeding_job_status,
      80::numeric,
      jsonb_build_object('immutable_fixture', true)
    )
  $$,
  'AI can advance its stage but cannot change deterministic score or facts'
);

select ok(
  public.complete_breeding_job(
    '60000000-0000-4000-8000-000000000066', 'phase6-worker',
    '70000000-0000-4000-8000-000000000066'
  ),
  'the normal Phase 2 completion RPC completes an AI-enriched job'
);

select is(
  (select status from public.breeding_jobs where id = '60000000-0000-4000-8000-000000000066'),
  'completed'::public.breeding_job_status,
  'the final Worker state is completed'
);

select * from finish();
rollback;
