begin;
set local search_path = public, extensions;

select plan(18);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select results_eq(
  $$
    select pal_instance_uid
      from public.pal_snapshot_items
     order by pal_instance_uid
  $$,
  $$
    values ('fixture-pal-a-owned-001'::text), ('fixture-pal-a-owned-002'::text)
  $$,
  'player_a reads complete rows only for the current owned inventory'
);

select is_empty(
  $$
    select pal_instance_uid
      from public.pal_snapshot_items
     where pal_instance_uid = 'fixture-pal-b-private-001'
  $$,
  'player_a cannot read player_b private inventory from the base table'
);

select results_eq(
  $$
    select pal_instance_uid
      from public.list_available_pals('shared')
     order by pal_instance_uid
  $$,
  $$ values ('fixture-pal-b-shared-001'::text) $$,
  'player_a can read the same-guild shared projection'
);

select is_empty(
  $$
    select pal_instance_uid
      from public.list_available_pals('all')
     where pal_instance_uid = 'fixture-pal-c-shared-001'
  $$,
  'player_a cannot read another guild shared pool'
);

select throws_ok(
  $$ select public.set_pal_share_enabled('fixture-pal-b-shared-001', false) $$,
  'P0001',
  'PAL_NOT_OWNED',
  'player_a cannot change player_b sharing'
);

select throws_ok(
  $$
    insert into public.breeding_jobs (
      requester_user_id,
      world_id,
      player_id,
      target_pal_id,
      desired_passive_ids,
      optimization_mode,
      inventory_snapshot_id,
      breeding_data_version_id,
      algorithm_version,
      scoring_profile_version,
      request_fingerprint,
      idempotency_key
    ) values (
      '00000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      'forbidden-target',
      '{}',
      'balanced',
      '40000000-0000-4000-8000-000000000002',
      '51000000-0000-4000-8000-000000000001',
      'phase1-contract-v1',
      'balanced-v1',
      'forbidden-other-player',
      'forbidden-other-player'
    )
  $$,
  '42501',
  'permission denied for table breeding_jobs',
  'player_a cannot create a task for player_b by inserting directly'
);

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = auth.uid() $$,
  '42501',
  'permission denied for table profiles',
  'a player cannot promote their own profile'
);

select throws_ok(
  $$
    select public.admin_publish_breeding_version(
      '10000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000002'
    )
  $$,
  'P0001',
  'ADMIN_REQUIRED',
  'a player cannot publish breeding data'
);

select throws_ok(
  $$ select * from public.claim_breeding_job('browser-worker') $$,
  '42501',
  'permission denied for function claim_breeding_job',
  'authenticated users cannot execute Agent RPCs'
);

select throws_ok(
  $$
    select public.release_breeding_job(
      '60000000-0000-4000-8000-000000000002',
      'browser-worker',
      '70000000-0000-4000-8000-000000000099',
      'WORKER_SHUTDOWN'
    )
  $$,
  '42501',
  'permission denied for function release_breeding_job',
  'authenticated users cannot release Agent job leases'
);

select throws_ok(
  $$
    select public.cancel_breeding_job(
      '60000000-0000-4000-8000-000000000002',
      'browser-worker',
      '70000000-0000-4000-8000-000000000099',
      'JOB_CANCELLED'
    )
  $$,
  '42501',
  'permission denied for function cancel_breeding_job',
  'authenticated users cannot cancel jobs through Agent RPCs'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000005"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select *
      from public.create_breeding_job(
        'test_target_pal',
        array['test_passive_a'],
        'balanced',
        'unbound-request'
      )
  $$,
  'P0001',
  'PLAYER_BINDING_REQUIRED',
  'an unbound user cannot create a breeding job'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.pal_snapshot_items),
  6,
  'admin can read inventory rows across all snapshots'
);

select throws_ok(
  $$
    insert into public.breeding_data_versions (
      id,
      source_id,
      content_hash,
      status,
      validation_report,
      published_at,
      published_by
    ) values (
      '51000000-0000-4000-8000-000000000099',
      '50000000-0000-4000-8000-000000000001',
      'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      'published',
      '{"valid":true}',
      now(),
      auth.uid()
    )
  $$,
  '42501',
  null,
  'admin cannot insert an already-published version outside the publish RPC'
);

select throws_ok(
  $$
    update public.breeding_data_versions
       set status = 'published',
           published_at = now(),
           published_by = auth.uid()
     where id = '51000000-0000-4000-8000-000000000002'
  $$,
  '42501',
  null,
  'admin cannot publish a validated version by updating the table directly'
);

update public.breeding_recipes
   set child_pal_id = 'bypassed_validation_child'
 where id = '51100000-0000-4000-8000-000000000003';

select is(
  (
    select child_pal_id
      from public.breeding_recipes
     where id = '51100000-0000-4000-8000-000000000003'
  ),
  'test_child_v2'::text,
  'admin cannot mutate a recipe after its version is validated'
);

select lives_ok(
  $$
    select public.admin_unbind_player('00000000-0000-4000-8000-000000000004');
    select public.admin_bind_player(
      '00000000-0000-4000-8000-000000000005',
      '30000000-0000-4000-8000-000000000003'
    )
  $$,
  'admin can manage player bindings'
);

select lives_ok(
  $$
    select public.admin_publish_breeding_version(
      '10000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000002'
    )
  $$,
  'admin can publish a validated breeding version'
);

select * from finish();
rollback;
