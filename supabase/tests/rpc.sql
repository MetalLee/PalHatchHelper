begin;
set local search_path = public, extensions;

select plan(39);

create temporary table test_lease_tokens (
  name text primary key,
  lease_token uuid not null
) on commit drop;

grant select, insert on test_lease_tokens to service_role;

update public.breeding_jobs
   set status = 'pending',
       locked_by = null,
       locked_at = null,
       heartbeat_at = null,
       attempt_count = 0,
       error_code = null,
       error_summary = null,
       completed_at = null,
       lease_token = null,
       updated_at = created_at
 where id = '60000000-0000-4000-8000-000000000001';

insert into public.breeding_jobs (
  id,
  requester_user_id,
  world_id,
  player_id,
  guild_id,
  target_pal_id,
  desired_passive_ids,
  optimization_mode,
  inventory_snapshot_id,
  breeding_data_version_id,
  algorithm_version,
  scoring_profile_version,
  status,
  request_fingerprint,
  idempotency_key,
  attempt_count,
  max_attempts,
  created_at,
  updated_at
)
select
  '60000000-0000-4000-8000-000000000004',
  requester_user_id,
  world_id,
  player_id,
  guild_id,
  'test_max_attempt_target',
  desired_passive_ids,
  optimization_mode,
  inventory_snapshot_id,
  breeding_data_version_id,
  algorithm_version,
  scoring_profile_version,
  'pending',
  repeat('4', 64),
  'fixture-max-attempt-job',
  0,
  1,
  '2026-07-13T10:03:30Z',
  '2026-07-13T10:03:30Z'
from public.breeding_jobs
where id = '60000000-0000-4000-8000-000000000001';

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
    'test_child_pal',
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
        'test_child_pal',
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
        'test_special_child',
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
        'test_child_pal',
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

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select throws_ok(
  $$
    select public.fail_breeding_job(
      '60000000-0000-4000-8000-000000000002',
      'fixture-seed-worker',
      (
        select lease_token
          from public.breeding_jobs
         where id = '60000000-0000-4000-8000-000000000002'
      ),
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

insert into test_lease_tokens (name, lease_token)
select 'worker-a', lease_token
  from public.breeding_jobs
 where id = '60000000-0000-4000-8000-000000000001';

insert into test_lease_tokens (name, lease_token)
select 'worker-b', lease_token
  from public.breeding_jobs
 where id = '60000000-0000-4000-8000-000000000002';

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
      'fixture-worker-a',
      (select lease_token from test_lease_tokens where name = 'worker-a')
    )
  $$,
  'the lock owner can heartbeat its job'
);

select is(
  public.release_stale_breeding_jobs(now() - interval '1 minute'),
  0,
  'jobs with a current heartbeat are not recovered as stale'
);

select throws_ok(
  $$
    select public.complete_breeding_job(
      '60000000-0000-4000-8000-000000000001',
      'fixture-worker-b',
      (select lease_token from test_lease_tokens where name = 'worker-a')
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
      'fixture-worker-a',
      (select lease_token from test_lease_tokens where name = 'worker-a')
    )
  $$,
  'the lock owner can complete the job idempotently'
);

select lives_ok(
  $$
    select public.complete_breeding_job(
      '60000000-0000-4000-8000-000000000001',
      'fixture-worker-a',
      (select lease_token from test_lease_tokens where name = 'worker-a')
    )
  $$,
  'a retried completion call is idempotent'
);

select is(
  public.fail_breeding_job(
    '60000000-0000-4000-8000-000000000002',
    'fixture-worker-b',
    (select lease_token from test_lease_tokens where name = 'worker-b'),
    'ALGORITHM_TIMEOUT',
    true
  ),
  'retry_pending'::public.breeding_job_status,
  'a retryable Worker failure releases the job for a later attempt'
);

select is(
  (
    select id
      from public.claim_breeding_job('fixture-worker-shutdown')
     limit 1
  ),
  '60000000-0000-4000-8000-000000000002'::uuid,
  'the retry-pending job can be reclaimed before graceful shutdown'
);

select is(
  public.release_breeding_job(
    '60000000-0000-4000-8000-000000000002',
    'fixture-worker-shutdown',
    (
      select lease_token
        from public.breeding_jobs
       where id = '60000000-0000-4000-8000-000000000002'
    ),
    'WORKER_SHUTDOWN'
  ),
  'retry_pending'::public.breeding_job_status,
  'SIGTERM release returns the active lease to retry_pending'
);

select is(
  (
    select attempt_count
      from public.breeding_jobs
     where id = '60000000-0000-4000-8000-000000000002'
  ),
  2,
  'graceful release does not consume the interrupted business attempt'
);

select is(
  (
    select id
      from public.claim_breeding_job('fixture-worker-cancel')
     limit 1
  ),
  '60000000-0000-4000-8000-000000000002'::uuid,
  'the released job can be reclaimed for cancellation'
);

select ok(
  public.cancel_breeding_job(
    '60000000-0000-4000-8000-000000000002',
    'fixture-worker-cancel',
    (
      select lease_token
        from public.breeding_jobs
       where id = '60000000-0000-4000-8000-000000000002'
    ),
    'JOB_CANCELLED'
  ),
  'the lease owner can cancel a claimed job'
);

select is(
  (
    select status
      from public.breeding_jobs
     where id = '60000000-0000-4000-8000-000000000002'
  ),
  'cancelled'::public.breeding_job_status,
  'cancellation persists the terminal cancelled status'
);

select is(
  (
    select id
      from public.claim_breeding_job('fixture-worker-final-attempt')
     limit 1
  ),
  '60000000-0000-4000-8000-000000000004'::uuid,
  'a one-attempt fixture is claimed for final-attempt coverage'
);

select is(
  public.fail_breeding_job(
    '60000000-0000-4000-8000-000000000004',
    'fixture-worker-final-attempt',
    (
      select lease_token
        from public.breeding_jobs
       where id = '60000000-0000-4000-8000-000000000004'
    ),
    'HANDLER_FAILED',
    true
  ),
  'failed'::public.breeding_job_status,
  'a retryable error becomes failed after the maximum attempt is reached'
);

select is(
  (
    select status
      from public.breeding_jobs
     where id = '60000000-0000-4000-8000-000000000004'
  ),
  'failed'::public.breeding_job_status,
  'the maximum-attempt failure is terminal'
);

reset role;

insert into public.breeding_jobs (
  id,
  requester_user_id,
  world_id,
  player_id,
  guild_id,
  target_pal_id,
  desired_passive_ids,
  optimization_mode,
  inventory_snapshot_id,
  breeding_data_version_id,
  algorithm_version,
  scoring_profile_version,
  status,
  request_fingerprint,
  idempotency_key,
  attempt_count,
  max_attempts,
  created_at,
  updated_at
)
select
  '60000000-0000-4000-8000-000000000005',
  requester_user_id,
  world_id,
  player_id,
  guild_id,
  'test_lease_fencing_target',
  desired_passive_ids,
  optimization_mode,
  inventory_snapshot_id,
  breeding_data_version_id,
  algorithm_version,
  scoring_profile_version,
  'pending',
  repeat('5', 64),
  'fixture-lease-fencing-job',
  0,
  3,
  '2026-07-13T10:04:00Z',
  '2026-07-13T10:04:00Z'
from public.breeding_jobs
where id = '60000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select is(
  (
    select id
      from public.claim_breeding_job('fixture-fence-worker')
     limit 1
  ),
  '60000000-0000-4000-8000-000000000005'::uuid,
  'the fencing fixture is claimed with its first lease'
);

insert into test_lease_tokens (name, lease_token)
select 'fence-old', lease_token
  from public.breeding_jobs
 where id = '60000000-0000-4000-8000-000000000005';

select is(
  public.release_breeding_job(
    '60000000-0000-4000-8000-000000000005',
    'fixture-fence-worker',
    (select lease_token from test_lease_tokens where name = 'fence-old'),
    'WORKER_SHUTDOWN'
  ),
  'retry_pending'::public.breeding_job_status,
  'the first fencing lease is released'
);

select is(
  (
    select id
      from public.claim_breeding_job('fixture-fence-worker')
     limit 1
  ),
  '60000000-0000-4000-8000-000000000005'::uuid,
  'the same Worker ID can receive a new lease after restart'
);

insert into test_lease_tokens (name, lease_token)
select 'fence-new', lease_token
  from public.breeding_jobs
 where id = '60000000-0000-4000-8000-000000000005';

select isnt(
  (select lease_token from test_lease_tokens where name = 'fence-new'),
  (select lease_token from test_lease_tokens where name = 'fence-old'),
  'a reclaimed job receives a fresh fencing token'
);

select throws_ok(
  $$
    select public.complete_breeding_job(
      '60000000-0000-4000-8000-000000000005',
      'fixture-fence-worker',
      (select lease_token from test_lease_tokens where name = 'fence-old')
    )
  $$,
  'P0001',
  'JOB_LOCK_NOT_OWNED',
  'an old lease cannot complete a newer lease with the same Worker ID'
);

select lives_ok(
  $$
    select public.complete_breeding_job(
      '60000000-0000-4000-8000-000000000005',
      'fixture-fence-worker',
      (select lease_token from test_lease_tokens where name = 'fence-new')
    )
  $$,
  'the current fencing token can complete the job'
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
