begin;
set local search_path = public, extensions;

select plan(25);

insert into public.breeding_steps (
  id,
  route_id,
  step_index,
  expected_child_pal_id,
  required_passive_ids,
  status
)
values
  (
    '63000000-0000-4000-8000-000000000002',
    '62000000-0000-4000-8000-000000000001',
    1,
    'test_child_pal',
    array['test_passive_a'],
    'not_started'
  ),
  (
    '63000000-0000-4000-8000-000000000003',
    '62000000-0000-4000-8000-000000000001',
    2,
    'test_child_pal',
    array['test_passive_a', 'test_passive_b'],
    'candidate_detected'
  );

insert into public.step_offspring_candidates (
  step_id,
  pal_instance_uid,
  detected_snapshot_id,
  match_score,
  matched_passive_ids,
  first_detected_at
)
values (
  '63000000-0000-4000-8000-000000000003',
  'fixture-pal-a-owned-002',
  '40000000-0000-4000-8000-000000000002',
  1.0,
  array['test_passive_a', 'test_passive_b'],
  '2026-07-13T10:05:00Z'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select *
  from public.create_breeding_job(
    'rpc_target_pal',
    array['test_passive_b', 'test_passive_a'],
    'balanced',
    'rpc-create-fixed-versions'
  );

select is(
  (
    select inventory_snapshot_id
      from public.breeding_jobs
     where idempotency_key = 'rpc-create-fixed-versions'
  ),
  '40000000-0000-4000-8000-000000000002'::uuid,
  'create RPC fixes the current published inventory snapshot'
);

select is(
  (
    select breeding_data_version_id
      from public.breeding_jobs
     where idempotency_key = 'rpc-create-fixed-versions'
  ),
  '51000000-0000-4000-8000-000000000001'::uuid,
  'create RPC fixes the published breeding data version'
);

select ok(
  (
    select reused
      from public.create_breeding_job(
        'rpc_target_pal',
        array['test_passive_b', 'test_passive_a'],
        'balanced',
        'rpc-create-fixed-versions'
      )
  ),
  'a duplicate idempotency key reuses the existing job'
);

select throws_ok(
  $$
    select *
      from public.create_breeding_job(
        'different_rpc_target_pal',
        array['test_passive_a', 'test_passive_b'],
        'balanced',
        'rpc-create-fixed-versions'
      )
  $$,
  'P0001',
  'IDEMPOTENCY_KEY_CONFLICT',
  'an idempotency key cannot be reused for a different request'
);

select is(
  (
    select desired_passive_ids
      from public.breeding_jobs
     where idempotency_key = 'rpc-create-fixed-versions'
  ),
  array['test_passive_a', 'test_passive_b']::text[],
  'create RPC canonicalizes desired passives'
);

select throws_ok(
  $$
    select *
      from public.create_breeding_job(
        'rpc_target_pal',
        array['a', 'b', 'c', 'd', 'e'],
        'balanced',
        'too-many-passives'
      )
  $$,
  'P0001',
  'INVALID_DESIRED_PASSIVES',
  'create RPC rejects more than four desired passives'
);

select is(
  public.set_pal_share_enabled('fixture-pal-a-owned-001', false),
  false,
  'a player can disable sharing for their current owned pal'
);

select is(
  (
    select share_enabled
      from public.list_available_pals('mine')
     where pal_instance_uid = 'fixture-pal-a-owned-001'
  ),
  false,
  'pal query reflects the persisted sharing preference'
);

select throws_ok(
  $$ select * from public.list_available_pals('guild') $$,
  'P0001',
  'INVALID_PAL_SCOPE',
  'pal query rejects scope bypass attempts'
);

select is(
  public.update_breeding_step_status(
    '63000000-0000-4000-8000-000000000002',
    'breeding'
  ),
  'breeding'::public.breeding_step_status,
  'a player can apply an allowed status transition to an owned plan step'
);

select public.confirm_step_offspring(
  '63000000-0000-4000-8000-000000000003',
  'fixture-pal-a-owned-002',
  '40000000-0000-4000-8000-000000000002'
);

select results_eq(
  $$
    select selected_child_instance_uid, status
      from public.breeding_steps
     where id = '63000000-0000-4000-8000-000000000003'
  $$,
  $$
    values (
      'fixture-pal-a-owned-002'::text,
      'completed'::public.breeding_step_status
    )
  $$,
  'a player can confirm a real candidate belonging to an owned plan'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select throws_ok(
  $$
    select public.fail_breeding_job(
      '60000000-0000-4000-8000-000000000002',
      'fixture-seed-worker',
      'unstable-error-code',
      true
    )
  $$,
  'P0001',
  'INVALID_JOB_FAILURE',
  'Agent failure RPC rejects unstable error codes'
);

select is(
  public.release_stale_breeding_jobs(now() - interval '1 minute'),
  1,
  'Agent recovery releases an expired Worker lease'
);

select throws_ok(
  $$
    update public.breeding_jobs
       set locked_by = 'direct-bypass-attempt'
     where id = '60000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'permission denied for table breeding_jobs',
  'Service Role cannot mutate job lease fields outside the dedicated RPCs'
);

select is(
  (
    select id
      from public.claim_breeding_job('fixture-worker-a')
     limit 1
  ),
  '60000000-0000-4000-8000-000000000001'::uuid,
  'the first Worker atomically claims the oldest pending job'
);

select is_empty(
  $$
    select id
      from public.claim_breeding_job('fixture-worker-b')
     where id = '60000000-0000-4000-8000-000000000001'
  $$,
  'a second Worker cannot claim the same job'
);

select matches(
  lower(
    pg_get_functiondef(
      'public.claim_breeding_job(text)'::regprocedure
    )
  ),
  'for update skip locked',
  'claim RPC uses FOR UPDATE SKIP LOCKED'
);

select lives_ok(
  $$
    select public.heartbeat_breeding_job(
      '60000000-0000-4000-8000-000000000001',
      'fixture-worker-a'
    )
  $$,
  'the lock owner can heartbeat its job'
);

select throws_ok(
  $$
    select public.complete_breeding_job(
      '60000000-0000-4000-8000-000000000001',
      'fixture-worker-b'
    )
  $$,
  'P0001',
  'JOB_LOCK_NOT_OWNED',
  'a different Worker cannot complete the job'
);

select lives_ok(
  $$
    select public.complete_breeding_job(
      '60000000-0000-4000-8000-000000000001',
      'fixture-worker-a'
    )
  $$,
  'the lock owner can complete the job idempotently'
);

select lives_ok(
  $$
    select public.complete_breeding_job(
      '60000000-0000-4000-8000-000000000001',
      'fixture-worker-a'
    )
  $$,
  'a retried completion call is idempotent'
);

select is(
  public.fail_breeding_job(
    '60000000-0000-4000-8000-000000000002',
    'fixture-worker-b',
    'ALGORITHM_TIMEOUT',
    true
  ),
  'retry_pending'::public.breeding_job_status,
  'a retryable Worker failure releases the job for a later attempt'
);

select lives_ok(
  $$
    insert into public.inventory_snapshots (
      id,
      world_id,
      source_save_hash,
      source_modified_at,
      save_version,
      parser_name,
      parser_version,
      status,
      captured_at,
      parsed_at
    ) values (
      '40000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000001',
      '9999999999999999999999999999999999999999999999999999999999999999',
      '2026-07-13T11:00:00Z',
      'fixture-save-v1',
      'fixture-parser',
      '1.0.0',
      'published',
      '2026-07-13T11:00:00Z',
      '2026-07-13T11:01:00Z'
    );
    update public.worlds
       set latest_snapshot_id = '40000000-0000-4000-8000-000000000003'
     where id = '10000000-0000-4000-8000-000000000001';
  $$,
  'Agent publication can switch latest inventory without rewriting history'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.admin_publish_breeding_version(
      '10000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000002'
    )
  $$,
  'admin can switch the active breeding version through the controlled RPC'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select results_eq(
  $$
    select inventory_snapshot_id, breeding_data_version_id
      from public.breeding_jobs
     where id = '60000000-0000-4000-8000-000000000003'
  $$,
  $$
    values (
      '40000000-0000-4000-8000-000000000001'::uuid,
      '51000000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'historical plans retain their original snapshot and breeding version references'
);

select * from finish();
rollback;
