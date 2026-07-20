begin;
set local search_path = public, extensions;

select plan(53);

create temporary table phase7_ids (
  name text primary key,
  id uuid not null,
  lease_token uuid
) on commit drop;
grant select, insert on phase7_ids to authenticated, service_role;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    insert into phase7_ids(name, id)
    select 'job', job_id
    from public.create_breeding_job_v2(
      'test_child_pal',
      array['test_passive_a', 'test_passive_b'],
      'balanced',
      false,
      5
    )
  $$,
  'the Phase 7 fixture job is created through the formal Phase 6 RPC'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

insert into phase7_ids(name, id, lease_token)
select 'seed-job', id, lease_token
from public.claim_breeding_job('phase7-fixture-worker');

select ok(
  public.cancel_breeding_job(
    (select id from phase7_ids where name = 'seed-job'),
    'phase7-fixture-worker',
    (select lease_token from phase7_ids where name = 'seed-job'),
    'PHASE7_FIXTURE_QUEUE_ADVANCE'
  ),
  'the pre-existing seed job is fenced and cancelled through its lifecycle RPC'
);

insert into phase7_ids(name, id, lease_token)
select 'claimed-job', id, lease_token
from public.claim_breeding_job('phase7-fixture-worker');

select is(
  (select id from phase7_ids where name = 'claimed-job'),
  (select id from phase7_ids where name = 'job'),
  'the formal worker claim receives the Phase 7 fixture job'
);

select lives_ok(
  $$
    select public.persist_breeding_algorithm_result(
      (select id from phase7_ids where name = 'claimed-job'),
      'phase7-fixture-worker',
      (select lease_token from phase7_ids where name = 'claimed-job'),
      jsonb_build_object(
        'target_pal_id', 'test_child_pal',
        'desired_passive_ids', jsonb_build_array('test_passive_a', 'test_passive_b'),
        'inventory_snapshot_id', '40000000-0000-4000-8000-000000000002',
        'game_data_version_id', '51000000-0000-4000-8000-000000000001',
        'game_data_content_hash', repeat('c', 64),
        'algorithm_version', 'inventory-aware-deterministic-v2',
        'scoring_profile_version', 'balanced-v3',
        'optimization_mode', 'balanced',
        'routes', jsonb_build_array(
          jsonb_build_object(
            'route_key', repeat('7', 64), 'rank', 1,
            'optimization_mode', 'balanced', 'total_score', 90,
            'generation_count', 2, 'estimated_attempts_min', 2,
            'estimated_attempts_max', 6, 'difficulty', 'medium',
            'borrowed_pal_count', 0, 'inventory_coverage', 1,
            'inheritance_score', 1, 'score_breakdown', '{}'::jsonb,
            'steps', jsonb_build_array(
              jsonb_build_object(
                'step_index', 0, 'generation', 1, 'recipe_type', 'normal',
                'parent_a', jsonb_build_object(
                  'source_type', 'inventory', 'pal_id', 'test_parent_a',
                  'instance_uid', 'fixture-pal-a-owned-001',
                  'owner_display_name', 'Fixture Player A', 'gender', 'male',
                  'passive_skill_ids', jsonb_build_array('test_passive_a'),
                  'required_passive_ids', jsonb_build_array('test_passive_a'),
                  'borrowed', false, 'produced_by_step_index', null,
                  'location_type', 'player_storage', 'location_name', 'Fixture Storage A'
                ),
                'parent_b', jsonb_build_object(
                  'source_type', 'inventory', 'pal_id', 'test_child_pal',
                  'instance_uid', 'fixture-pal-a-owned-002',
                  'owner_display_name', 'Fixture Player A', 'gender', 'female',
                  'passive_skill_ids', jsonb_build_array('test_passive_a', 'test_passive_b'),
                  'required_passive_ids', jsonb_build_array('test_passive_b'),
                  'borrowed', false, 'produced_by_step_index', null,
                  'location_type', 'base', 'location_name', 'Fixture Base Alpha'
                ),
                'child_pal_id', 'test_child_pal', 'child_required_gender', 'female',
                'required_passive_ids', jsonb_build_array('test_passive_a', 'test_passive_b')
              ),
              jsonb_build_object(
                'step_index', 1, 'generation', 2, 'recipe_type', 'normal',
                'parent_a', jsonb_build_object(
                  'source_type', 'intermediate', 'pal_id', 'test_child_pal',
                  'instance_uid', null, 'owner_display_name', '步骤 1 子代',
                  'gender', 'female',
                  'passive_skill_ids', jsonb_build_array('test_passive_a', 'test_passive_b'),
                  'required_passive_ids', jsonb_build_array('test_passive_a', 'test_passive_b'),
                  'borrowed', false, 'produced_by_step_index', 0,
                  'location_type', null, 'location_name', null
                ),
                'parent_b', jsonb_build_object(
                  'source_type', 'inventory', 'pal_id', 'test_parent_a',
                  'instance_uid', 'fixture-pal-a-owned-001',
                  'owner_display_name', 'Fixture Player A', 'gender', 'male',
                  'passive_skill_ids', jsonb_build_array('test_passive_a'),
                  'required_passive_ids', jsonb_build_array('test_passive_a'),
                  'borrowed', false, 'produced_by_step_index', null,
                  'location_type', 'player_storage', 'location_name', 'Fixture Storage A'
                ),
                'child_pal_id', 'test_child_pal', 'child_required_gender', null,
                'required_passive_ids', jsonb_build_array('test_passive_a')
              )
            )
          ),
          jsonb_build_object(
            'route_key', repeat('8', 64), 'rank', 2,
            'optimization_mode', 'balanced', 'total_score', 80,
            'generation_count', 1, 'estimated_attempts_min', 1,
            'estimated_attempts_max', 3, 'difficulty', 'low',
            'borrowed_pal_count', 0, 'inventory_coverage', 1,
            'inheritance_score', 1, 'score_breakdown', '{}'::jsonb,
            'steps', jsonb_build_array(jsonb_build_object(
              'step_index', 0, 'generation', 1, 'recipe_type', 'normal',
              'parent_a', jsonb_build_object(
                'source_type', 'inventory', 'pal_id', 'test_parent_a',
                'instance_uid', 'fixture-pal-a-owned-001',
                'owner_display_name', 'Fixture Player A', 'gender', 'male',
                'passive_skill_ids', jsonb_build_array('test_passive_a'),
                'required_passive_ids', '[]'::jsonb, 'borrowed', false,
                'produced_by_step_index', null, 'location_type', 'player_storage',
                'location_name', 'Fixture Storage A'
              ),
              'parent_b', jsonb_build_object(
                'source_type', 'inventory', 'pal_id', 'test_child_pal',
                'instance_uid', 'fixture-pal-a-owned-002',
                'owner_display_name', 'Fixture Player A', 'gender', 'female',
                'passive_skill_ids', jsonb_build_array('test_passive_a', 'test_passive_b'),
                'required_passive_ids', '[]'::jsonb, 'borrowed', false,
                'produced_by_step_index', null, 'location_type', 'base',
                'location_name', 'Fixture Base Alpha'
              ),
              'child_pal_id', 'test_child_pal', 'child_required_gender', null,
              'required_passive_ids', jsonb_build_array('test_passive_a', 'test_passive_b')
            ))
          ),
          jsonb_build_object(
            'route_key', repeat('9', 64), 'rank', 3,
            'optimization_mode', 'balanced', 'total_score', 70,
            'generation_count', 1, 'estimated_attempts_min', 1,
            'estimated_attempts_max', 3, 'difficulty', 'low',
            'borrowed_pal_count', 0, 'inventory_coverage', 1,
            'inheritance_score', 1, 'score_breakdown', '{}'::jsonb,
            'steps', jsonb_build_array(jsonb_build_object(
              'step_index', 0, 'generation', 1, 'recipe_type', 'normal',
              'parent_a', jsonb_build_object(
                'source_type', 'inventory', 'pal_id', 'test_parent_a',
                'instance_uid', 'fixture-pal-a-owned-001',
                'owner_display_name', 'Fixture Player A', 'gender', 'male',
                'passive_skill_ids', jsonb_build_array('test_passive_a'),
                'required_passive_ids', '[]'::jsonb, 'borrowed', false,
                'produced_by_step_index', null, 'location_type', 'player_storage',
                'location_name', 'Fixture Storage A'
              ),
              'parent_b', jsonb_build_object(
                'source_type', 'inventory', 'pal_id', 'test_child_pal',
                'instance_uid', 'fixture-pal-a-owned-002',
                'owner_display_name', 'Fixture Player A', 'gender', 'female',
                'passive_skill_ids', jsonb_build_array('test_passive_a', 'test_passive_b'),
                'required_passive_ids', '[]'::jsonb, 'borrowed', false,
                'produced_by_step_index', null, 'location_type', 'base',
                'location_name', 'Fixture Base Alpha'
              ),
              'child_pal_id', 'test_child_pal', 'child_required_gender', null,
              'required_passive_ids', '[]'::jsonb
            ))
          )
        ),
        'explanation_codes', '[]'::jsonb,
        'diagnostics', '{}'::jsonb,
        'result_digest', repeat('a', 64)
      )
    )
  $$,
  'the official Phase 6 persistence RPC stores three deterministic routes'
);

select ok(
  public.complete_breeding_job(
    (select id from phase7_ids where name = 'claimed-job'),
    'phase7-fixture-worker',
    (select lease_token from phase7_ids where name = 'claimed-job')
  ),
  'the fixture job completes through the fenced worker RPC'
);

insert into phase7_ids(name, id)
select 'route-main', route.id
from public.breeding_routes route
join public.breeding_plans plan on plan.id = route.plan_id
where plan.job_id = (select id from phase7_ids where name = 'job')
  and route.route_key = repeat('7', 64);

insert into phase7_ids(name, id)
select 'route-existing', route.id
from public.breeding_routes route
join public.breeding_plans plan on plan.id = route.plan_id
where plan.job_id = (select id from phase7_ids where name = 'job')
  and route.route_key = repeat('8', 64);

insert into phase7_ids(name, id)
select 'route-skip', route.id
from public.breeding_routes route
join public.breeding_plans plan on plan.id = route.plan_id
where plan.job_id = (select id from phase7_ids where name = 'job')
  and route.route_key = repeat('9', 64);

insert into public.breeding_routes (
  plan_id, route_key, rank, optimization_mode, total_score,
  generation_count, estimated_attempts_min, estimated_attempts_max,
  difficulty, borrowed_pal_count, inventory_coverage, inheritance_score,
  score_breakdown, route_payload
)
select
  plan.id, repeat('a', 64), 4, 'balanced', 60,
  1, 1, 3, 'medium', 0, 0.5, 0.8, '{}'::jsonb,
  jsonb_build_object(
    'route_key', repeat('a', 64), 'rank', 4,
    'optimization_mode', 'balanced', 'total_score', 60,
    'generation_count', 1, 'step_count', 1,
    'estimated_attempts_min', 1, 'estimated_attempts_max', 3,
    'difficulty', 'medium', 'borrowed_pal_count', 0,
    'inventory_coverage', 0.5, 'inheritance_score', 0.8,
    'feasibility_status', 'needs_inventory', 'adoptable', false,
    'missing_pal_count', 1,
    'missing_requirements', jsonb_build_array(jsonb_build_object(
      'pal_id', 'test_child_pal', 'gender', 'female',
      'required_passive_ids', jsonb_build_array('test_passive_b'),
      'quantity', 1, 'step_indexes', jsonb_build_array(0)
    )),
    'score_breakdown', '{}'::jsonb,
    'steps', jsonb_build_array(jsonb_build_object(
      'step_index', 0, 'generation', 1, 'recipe_type', 'normal',
      'parent_a', jsonb_build_object(
        'source_type', 'inventory', 'pal_id', 'test_parent_a',
        'instance_uid', 'fixture-pal-a-owned-001',
        'owner_display_name', 'Fixture Player A', 'gender', 'male',
        'passive_skill_ids', jsonb_build_array('test_passive_a'),
        'required_passive_ids', jsonb_build_array('test_passive_a'),
        'borrowed', false, 'produced_by_step_index', null,
        'location_type', 'player_storage', 'location_name', 'Fixture Storage A'
      ),
      'parent_b', jsonb_build_object(
        'source_type', 'missing', 'pal_id', 'test_child_pal',
        'instance_uid', null, 'owner_display_name', 'untrusted value',
        'gender', 'female', 'passive_skill_ids', '[]'::jsonb,
        'required_passive_ids', jsonb_build_array('test_passive_b'),
        'borrowed', false, 'produced_by_step_index', null,
        'location_type', null, 'location_name', null
      ),
      'child_pal_id', 'test_child_pal', 'child_required_gender', null,
      'required_passive_ids', jsonb_build_array('test_passive_a', 'test_passive_b')
    ))
  )
from public.breeding_plans as plan
where plan.job_id = (select id from phase7_ids where name = 'job');

insert into phase7_ids(name, id)
select 'route-missing', route.id
from public.breeding_routes route
join public.breeding_plans plan on plan.id = route.plan_id
where plan.job_id = (select id from phase7_ids where name = 'job')
  and route.route_key = repeat('a', 64);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select results_eq(
  $$
    select feasibility_status, adoptable, missing_pal_count
      from public.breeding_routes
     where id = (select id from phase7_ids where name = 'route-missing')
  $$,
  $$ values ('needs_inventory'::text, false, 1) $$,
  'missing inventory feasibility is persisted as queryable route state'
);

select is(
  public.get_breeding_job_detail((select id from phase7_ids where name = 'job'))
    #>> '{data,plan,routes,3,steps,0,parent_b,owner_display_name}',
  '缺少：需补充库存',
  'the route view labels a missing parent without trusting worker display text'
);

select is(
  public.get_breeding_job_detail((select id from phase7_ids where name = 'job'))
    #>> '{data,plan,routes,0,feasibility_status}',
  'ready',
  'the route view projects historical routes as inventory-ready'
);

select is(
  public.get_breeding_job_detail((select id from phase7_ids where name = 'job'))
    #>> '{data,plan,routes,0,adoptable}',
  'true',
  'the route view keeps historical inventory-backed routes adoptable'
);

select is(
  jsonb_array_length(
    public.get_breeding_job_detail((select id from phase7_ids where name = 'job'))
      #> '{data,plan,routes,0,missing_requirements}'
  ),
  0,
  'the route view projects an empty missing-inventory summary for historical routes'
);

select isnt(
  (select route_payload from public.breeding_routes
    where id = (select id from phase7_ids where name = 'route-main')),
  (select route_payload from public.breeding_routes
    where id = (select id from phase7_ids where name = 'route-main'))
    || jsonb_build_object('feasibility_status', 'ready'),
  'historical route payloads remain immutable while their browser view is normalized'
);

select throws_ok(
  $$ select * from public.adopt_breeding_route(
    (select id from phase7_ids where name = 'route-missing'), 'phase7:adopt:missing'
  ) $$,
  'P0001', 'ROUTE_NOT_ADOPTABLE',
  'a route with missing starting parents cannot become an execution plan'
);

select lives_ok(
  $$ select * from public.adopt_breeding_route(
    (select id from phase7_ids where name = 'route-main'), 'phase7:adopt:main'
  ) $$,
  'a player adopts their completed deterministic route'
);

insert into phase7_ids(name, id)
select 'plan-main', id from public.execution_plans
where adopted_route_id = (select id from phase7_ids where name = 'route-main');

select ok(
  (select reused from public.adopt_breeding_route(
    (select id from phase7_ids where name = 'route-main'), 'phase7:adopt:retry'
  )),
  'route adoption is idempotent and returns the same plan'
);

select results_eq(
  $$
    select step_index, status::text
    from public.breeding_steps
    where execution_plan_id = (select id from phase7_ids where name = 'plan-main')
    order by step_index
  $$,
  $$ values (0, 'not_started'::text), (1, 'not_started'::text) $$,
  'adoption keeps deterministic topological step order'
);

select results_eq(
  $$
    select inventory_snapshot_id, game_data_version_id, content_hash,
           algorithm_version, scoring_profile_version
    from public.execution_plans
    where id = (select id from phase7_ids where name = 'plan-main')
  $$,
  $$ values (
    '40000000-0000-4000-8000-000000000002'::uuid,
    '51000000-0000-4000-8000-000000000001'::uuid,
    repeat('c', 64)::text,
    'inventory-aware-deterministic-v2'::text,
    'balanced-v3'::text
  ) $$,
  'adoption preserves every Phase 6 version pin'
);

select throws_ok(
  $$
    select public.update_breeding_step_status(
      (select id from public.breeding_steps
       where execution_plan_id = (select id from phase7_ids where name = 'plan-main')
         and step_index = 0),
      'breeding'
    )
  $$,
  'P0001', 'STEP_NOT_OWNED',
  'the legacy arbitrary-status RPC cannot mutate an execution-plan step'
);

select throws_ok(
  $$
    select public.confirm_step_offspring(
      (select id from public.breeding_steps
       where execution_plan_id = (select id from phase7_ids where name = 'plan-main')
         and step_index = 0),
      'fixture-pal-a-owned-002',
      '40000000-0000-4000-8000-000000000002'
    )
  $$,
  'P0001', 'STEP_NOT_OWNED',
  'the legacy confirmation RPC cannot set an execution-plan selected instance'
);

select throws_ok(
  $$
    select public.start_breeding_step(
      (select id from public.breeding_steps
       where execution_plan_id = (select id from phase7_ids where name = 'plan-main')
         and step_index = 1),
      1, 'phase7:start:wrong-step'
    )
  $$,
  'P0001', 'PLAN_NOT_CURRENT_STEP',
  'a non-current step cannot start'
);

select lives_ok(
  $$
    select public.start_breeding_step(
      (select id from public.breeding_steps
       where execution_plan_id = (select id from phase7_ids where name = 'plan-main')
         and step_index = 0),
      1, 'phase7:start:main'
    )
  $$,
  'the current step starts with optimistic concurrency'
);

select is(
  (select baseline_snapshot_id from public.breeding_steps
   where execution_plan_id = (select id from phase7_ids where name = 'plan-main')
     and step_index = 0),
  '40000000-0000-4000-8000-000000000002'::uuid,
  'starting a step records the latest safe snapshot as its baseline'
);

select throws_ok(
  $$
    select public.start_breeding_step(
      (select id from public.breeding_steps
       where execution_plan_id = (select id from phase7_ids where name = 'plan-main')
         and step_index = 0),
      1, 'phase7:start:stale'
    )
  $$,
  'P0001', 'PLAN_VERSION_CONFLICT',
  'a stale optimistic version is rejected'
);

select lives_ok(
  $$ select public.pause_execution_plan(
    (select id from phase7_ids where name = 'plan-main'), 2, 'phase7:pause:main'
  ) $$,
  'an active plan can be paused'
);

select lives_ok(
  $$ select public.resume_execution_plan(
    (select id from phase7_ids where name = 'plan-main'), 3, 'phase7:resume:main'
  ) $$,
  'a paused plan can be resumed'
);

select is(
  (select status::text || '|' || concurrency_version::text
   from public.execution_plans where id = (select id from phase7_ids where name = 'plan-main')),
  'active|4',
  'pause and resume use legal states and monotonic versions'
);

select lives_ok(
  $$ select * from public.adopt_breeding_route(
    (select id from phase7_ids where name = 'route-existing'), 'phase7:adopt:existing'
  ) $$,
  'a second legal route can be adopted independently'
);
insert into phase7_ids(name, id)
select 'plan-existing', id from public.execution_plans
where adopted_route_id = (select id from phase7_ids where name = 'route-existing');

select lives_ok(
  $$
    select public.select_existing_pal_for_step(
      (select id from public.breeding_steps
       where execution_plan_id = (select id from phase7_ids where name = 'plan-existing')),
      'fixture-pal-a-owned-002', false, 1, 'phase7:existing:select'
    )
  $$,
  'an eligible Pal from the latest safe inventory can complete a step'
);

select is(
  (select status::text from public.execution_plans
   where id = (select id from phase7_ids where name = 'plan-existing')),
  'completed',
  'selecting an eligible existing Pal completes a one-step plan'
);

select lives_ok(
  $$ select * from public.adopt_breeding_route(
    (select id from phase7_ids where name = 'route-skip'), 'phase7:adopt:skip'
  ) $$,
  'a third legal route can be adopted for skip behavior'
);
insert into phase7_ids(name, id)
select 'plan-skip', id from public.execution_plans
where adopted_route_id = (select id from phase7_ids where name = 'route-skip');

select lives_ok(
  $$
    select public.start_breeding_step(
      (select id from public.breeding_steps
       where execution_plan_id = (select id from phase7_ids where name = 'plan-skip')),
      1, 'phase7:skip-plan:start'
    )
  $$,
  'the skip fixture enters breeding through the legal start transition'
);

select lives_ok(
  $$
    select public.continue_breeding_attempt(
      (select id from public.breeding_steps
       where execution_plan_id = (select id from phase7_ids where name = 'plan-skip')),
      2, 'phase7:skip-plan:retry'
    )
  $$,
  'continuing an attempt enters the explicit retrying state without deleting history'
);

select is(
  (select status::text || '|' || attempt_number::text
   from public.breeding_steps
   where execution_plan_id = (select id from phase7_ids where name = 'plan-skip')),
  'retrying|2',
  'retrying keeps a monotonic attempt window'
);

select lives_ok(
  $$
    select public.skip_breeding_step(
      (select id from public.breeding_steps
       where execution_plan_id = (select id from phase7_ids where name = 'plan-skip')),
      '玩家决定不执行此步骤', 3, 'phase7:skip:main'
    )
  $$,
  'the current step can be skipped only with an audited reason'
);

select is(
  (select skip_reason from public.breeding_steps
   where execution_plan_id = (select id from phase7_ids where name = 'plan-skip')),
  '玩家决定不执行此步骤',
  'the skip reason is preserved in history'
);

select ok(
  not has_table_privilege('authenticated', 'public.execution_plans', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.step_offspring_candidates', 'INSERT'),
  'browser users cannot write internal plan or candidate tables directly'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

insert into phase7_ids(name, id)
select 'next-snapshot', public.publish_inventory_snapshot(
  '10000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'source_save_hash', repeat('7', 64),
    'source_modified_at', '2026-07-16T04:00:00Z',
    'save_version', 'phase7-fixture-v1',
    'captured_at', '2026-07-16T04:00:00Z',
    'parser_name', 'phase7-fixture-parser', 'parser_version', '1.0.0',
    'server', jsonb_build_object('world_uid', 'fixture-world-local'),
    'guilds', jsonb_build_array(jsonb_build_object(
      'guild_uid', 'fixture-guild-alpha', 'name', 'Fixture Guild Alpha'
    )),
    'players', jsonb_build_array(jsonb_build_object(
      'player_uid', 'fixture-player-a-uid', 'nickname', 'Fixture Player A',
      'level', 36, 'guild_uid', 'fixture-guild-alpha'
    )),
    'pals', jsonb_build_array(
      jsonb_build_object(
        'instance_uid', 'fixture-pal-a-owned-001',
        'owner_player_uid', 'fixture-player-a-uid', 'guild_uid', 'fixture-guild-alpha',
        'pal_id', 'test_parent_a', 'gender', 'male', 'level', 20,
        'passive_skill_ids', jsonb_build_array('test_passive_a'),
        'location_type', 'player_storage', 'location_name', 'Fixture Storage A',
        'owner_resolved', true, 'guild_resolved', true, 'shared_eligible', true,
        'warning_codes', '[]'::jsonb, 'metadata', '{}'::jsonb
      ),
      jsonb_build_object(
        'instance_uid', 'fixture-pal-a-owned-002',
        'owner_player_uid', 'fixture-player-a-uid', 'guild_uid', 'fixture-guild-alpha',
        'pal_id', 'test_child_pal', 'gender', 'female', 'level', 22,
        'passive_skill_ids', jsonb_build_array('test_passive_a', 'test_passive_b'),
        'location_type', 'base', 'location_name', 'Fixture Base Alpha',
        'owner_resolved', true, 'guild_resolved', true, 'shared_eligible', true,
        'warning_codes', '[]'::jsonb, 'metadata', '{}'::jsonb
      ),
      jsonb_build_object(
        'instance_uid', 'phase7-child-best',
        'owner_player_uid', 'fixture-player-a-uid', 'guild_uid', 'fixture-guild-alpha',
        'pal_id', 'test_child_pal', 'gender', 'female', 'level', 1,
        'passive_skill_ids', jsonb_build_array('test_passive_a', 'test_passive_b'),
        'location_type', 'base', 'location_name', 'Fixture Breeding Base',
        'owner_resolved', true, 'guild_resolved', true, 'shared_eligible', true,
        'warning_codes', '[]'::jsonb, 'metadata', '{}'::jsonb
      ),
      jsonb_build_object(
        'instance_uid', 'phase7-child-weak',
        'owner_player_uid', 'fixture-player-a-uid', 'guild_uid', 'fixture-guild-alpha',
        'pal_id', 'test_child_pal', 'gender', 'male', 'level', 1,
        'passive_skill_ids', jsonb_build_array('test_passive_a'),
        'location_type', 'base', 'location_name', 'Fixture Breeding Base',
        'owner_resolved', true, 'guild_resolved', true, 'shared_eligible', true,
        'warning_codes', '[]'::jsonb, 'metadata', '{}'::jsonb
      ),
      jsonb_build_object(
        'instance_uid', 'phase7-wrong-species',
        'owner_player_uid', 'fixture-player-a-uid', 'guild_uid', 'fixture-guild-alpha',
        'pal_id', 'test_parent_b', 'gender', 'female', 'level', 1,
        'passive_skill_ids', '[]'::jsonb,
        'location_type', 'base', 'location_name', 'Fixture Breeding Base',
        'owner_resolved', true, 'guild_resolved', true, 'shared_eligible', true,
        'warning_codes', '[]'::jsonb, 'metadata', '{}'::jsonb
      )
    ),
    'warnings', '[]'::jsonb
  )
);

select is(
  jsonb_array_length(public.get_execution_detection_context(
    (select id from phase7_ids where name = 'next-snapshot')
  )),
  1,
  'a successful later snapshot exposes only the current breeding step to the Agent'
);

select is(
  public.record_execution_candidates(
    (select id from public.breeding_steps
     where execution_plan_id = (select id from phase7_ids where name = 'plan-main')
       and step_index = 0),
    (select id from phase7_ids where name = 'next-snapshot'),
    jsonb_build_array(
      jsonb_build_object('pal_instance_uid', 'phase7-child-best', 'match_score', 1,
        'match_breakdown', jsonb_build_object('species', 1, 'passive_overlap', 1, 'gender', 1, 'accessibility', 1, 'first_appearance', 1)),
      jsonb_build_object('pal_instance_uid', 'phase7-child-weak', 'match_score', 0.65,
        'match_breakdown', jsonb_build_object('species', 1, 'passive_overlap', 0.5, 'gender', 0, 'accessibility', 1, 'first_appearance', 1)),
      jsonb_build_object('pal_instance_uid', 'phase7-wrong-species', 'match_score', 0.8,
        'match_breakdown', jsonb_build_object('species', 0, 'passive_overlap', 0, 'gender', 1, 'accessibility', 1, 'first_appearance', 1))
    )
  ),
  2,
  'Agent detection keeps all matching species candidates and excludes wrong species'
);

select is(
  public.record_execution_candidates(
    (select id from public.breeding_steps
     where execution_plan_id = (select id from phase7_ids where name = 'plan-main')
       and step_index = 0),
    (select id from phase7_ids where name = 'next-snapshot'),
    '[]'::jsonb
  ),
  2,
  'reprocessing the same snapshot and step is idempotent'
);

select is(
  (select status::text from public.breeding_steps
   where execution_plan_id = (select id from phase7_ids where name = 'plan-main')
     and step_index = 0),
  'candidate_detected',
  'candidate detection does not complete a step before player confirmation'
);

select throws_ok(
  $$
    select public.confirm_offspring_candidate(
      (select id from public.breeding_steps
       where execution_plan_id = (select id from phase7_ids where name = 'plan-main')
         and step_index = 0),
      encode(extensions.digest(convert_to(concat_ws('|',
        (select id::text from public.breeding_steps
         where execution_plan_id = (select id from phase7_ids where name = 'plan-main')
           and step_index = 0),
        (select id::text from phase7_ids where name = 'next-snapshot'),
        'phase7-child-best'
      ),'UTF8'),'sha256'),'hex'),
      5, 'phase7:agent:cannot-confirm'
    )
  $$,
  '42501', 'permission denied for function confirm_offspring_candidate',
  'the Agent role cannot confirm offspring for a player'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000003"}',
  true
);
set local role authenticated;

select is_empty(
  $$ select id from public.execution_plans $$,
  'RLS hides every other player execution plan'
);

select throws_ok(
  $$
    select public.confirm_offspring_candidate(
      (select id from public.breeding_steps
       where execution_plan_id = (select id from phase7_ids where name = 'plan-main')
         and step_index = 0),
      (select candidate_key from public.step_offspring_candidates
       where pal_instance_uid = 'phase7-child-best'),
      5, 'phase7:other:confirm'
    )
  $$,
  'P0001', 'PLAN_NOT_FOUND',
  'a player cannot confirm another player candidate'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.confirm_offspring_candidate(
      (select id from public.breeding_steps
       where execution_plan_id = (select id from phase7_ids where name = 'plan-main')
         and step_index = 0),
      encode(extensions.digest(convert_to(concat_ws('|',
        (select id::text from public.breeding_steps
         where execution_plan_id = (select id from phase7_ids where name = 'plan-main')
           and step_index = 0),
        (select id::text from phase7_ids where name = 'next-snapshot'),
        'phase7-child-best'
      ),'UTF8'),'sha256'),'hex'),
      5, 'phase7:player:confirm-best'
    )
  $$,
  'the owning player explicitly confirms a detected real offspring'
);

select results_eq(
  $$
    select status::text, selected_child_instance_uid
    from public.breeding_steps
    where execution_plan_id = (select id from phase7_ids where name = 'plan-main')
      and step_index = 0
  $$,
  $$ values ('completed'::text, 'phase7-child-best'::text) $$,
  'confirmation stores the real UID and completes only the confirmed step'
);

select is(
  (select status::text || '|' || current_step_index::text
   from public.execution_plans where id = (select id from phase7_ids where name = 'plan-main')),
  'active|1',
  'confirmation unlocks the next topological step'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

insert into phase7_ids(name, id)
select 'later-snapshot', public.publish_inventory_snapshot(
  '10000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'source_save_hash', repeat('8', 64),
    'source_modified_at', '2026-07-16T05:00:00Z',
    'save_version', 'phase7-fixture-v2',
    'captured_at', '2026-07-16T05:00:00Z',
    'parser_name', 'phase7-fixture-parser', 'parser_version', '1.0.0',
    'server', jsonb_build_object('world_uid', 'fixture-world-local'),
    'guilds', jsonb_build_array(jsonb_build_object(
      'guild_uid', 'fixture-guild-alpha', 'name', 'Fixture Guild Alpha'
    )),
    'players', jsonb_build_array(jsonb_build_object(
      'player_uid', 'fixture-player-a-uid', 'nickname', 'Fixture Player A',
      'level', 36, 'guild_uid', 'fixture-guild-alpha'
    )),
    'pals', jsonb_build_array(jsonb_build_object(
      'instance_uid', 'phase7-child-best',
      'owner_player_uid', 'fixture-player-a-uid', 'guild_uid', 'fixture-guild-alpha',
      'pal_id', 'test_child_pal', 'gender', 'female', 'level', 1,
      'passive_skill_ids', jsonb_build_array('test_passive_a', 'test_passive_b'),
      'location_type', 'base', 'location_name', 'Fixture Breeding Base',
      'owner_resolved', true, 'guild_resolved', true, 'shared_eligible', true,
      'warning_codes', '[]'::jsonb, 'metadata', '{}'::jsonb
    )),
    'warnings', '[]'::jsonb
  )
);

select is(
  public.invalidate_execution_plan_dependencies(
    (select id from phase7_ids where name = 'later-snapshot')
  ),
  1,
  'a disappeared downstream inventory dependency invalidates the unfinished plan'
);

select is(
  (select invalidation_reasons->0->>'code' from public.execution_plans
   where id = (select id from phase7_ids where name = 'plan-main')),
  'DEPENDENCY_DISAPPEARED',
  'invalidation keeps a stable structured reason'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.recalculate_execution_plan(
      (select id from phase7_ids where name = 'plan-main'),
      7,
      '依赖实例已消失',
      'phase7:recalculate:main'
    )
  $$,
  'recalculation creates a new Phase 6 job without rewriting history'
);

select is(
  (select source_plan_id from public.breeding_jobs
   where source_plan_id = (select id from phase7_ids where name = 'plan-main')),
  (select id from phase7_ids where name = 'plan-main'),
  'the new job records its source historical plan'
);

select is(
  (select inventory_snapshot_id from public.breeding_jobs
   where source_plan_id = (select id from phase7_ids where name = 'plan-main')),
  (select id from phase7_ids where name = 'later-snapshot'),
  'recalculation pins the latest safe inventory snapshot'
);

select is(
  (select inventory_snapshot_id from public.execution_plans
   where id = (select id from phase7_ids where name = 'plan-main')),
  '40000000-0000-4000-8000-000000000002'::uuid,
  'recalculation never changes the old plan version pins'
);

select is(
  public.get_execution_plan_detail(
    (select id from phase7_ids where name = 'plan-main')
  ) #>> '{ok}',
  'true',
  'the historical detail projection remains readable after invalidation'
);

reset role;

select throws_ok(
  $$ update public.execution_plan_events set event_type = 'MUTATED' $$,
  'P0001', 'PLAN_HISTORY_IMMUTABLE',
  'audit history cannot be updated even by a privileged SQL caller'
);

select * from finish();
rollback;
