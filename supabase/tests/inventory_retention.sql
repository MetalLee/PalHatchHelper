begin;
set local search_path = public, extensions;

select plan(20);

select has_column(
  'public',
  'inventory_snapshots',
  'payload_purged_at',
  'snapshot audit rows expose payload purge time'
);
select has_table(
  'public',
  'pal_instance_lifecycle',
  'cross-snapshot Pal lifecycle table exists'
);
select has_table(
  'public',
  'execution_plan_dependencies',
  'execution plans preserve minimal adopted inventory dependencies'
);
select has_function(
  'public',
  'cleanup_expired_inventory_snapshot_payloads',
  array['integer'],
  'bounded inventory payload cleanup RPC exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.cleanup_expired_inventory_snapshot_payloads(integer)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cleanup_expired_inventory_snapshot_payloads(integer)',
    'execute'
  ),
  'browser roles cannot execute inventory retention cleanup'
);

set local role service_role;

select throws_ok(
  $$ select public.cleanup_expired_inventory_snapshot_payloads(25) $$,
  'P0001',
  'SERVICE_ROLE_REQUIRED',
  'cleanup RPC requires a service-role JWT in addition to ACL'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select throws_ok(
  $$ select public.cleanup_expired_inventory_snapshot_payloads(0) $$,
  '22023',
  'INVENTORY_RETENTION_BATCH_INVALID',
  'cleanup rejects an unsafe batch size'
);

insert into public.inventory_snapshots (
  id,
  world_id,
  source_save_hash,
  source_modified_at,
  parser_name,
  parser_version,
  status,
  captured_at,
  error_code,
  error_summary,
  created_at
) values (
  '40000000-0000-4000-8000-0000000000f1',
  '10000000-0000-4000-8000-000000000001',
  repeat('f', 64),
  '2026-07-13T07:00:00Z',
  'fixture-parser',
  '1.0.0',
  'failed',
  '2026-07-13T07:00:00Z',
  'PARSER_OUTPUT_INVALID',
  'Expired fixture failure.',
  '2026-07-13T07:01:00Z'
);

insert into public.inventory_snapshots (
  id,
  world_id,
  source_save_hash,
  source_modified_at,
  parser_name,
  parser_version,
  status,
  captured_at,
  parsed_at,
  created_at
) values (
  '40000000-0000-4000-8000-0000000000e2',
  '10000000-0000-4000-8000-000000000001',
  repeat('e', 64),
  '2026-07-13T08:30:00Z',
  'fixture-parser',
  '1.0.0',
  'published',
  '2026-07-13T08:30:00Z',
  statement_timestamp() - interval '29 minutes',
  statement_timestamp() - interval '29 minutes'
);
insert into public.pal_snapshot_items (
  snapshot_id,
  world_id,
  pal_instance_uid,
  pal_id,
  gender,
  passive_skill_ids,
  location_type
) values (
  '40000000-0000-4000-8000-0000000000e2',
  '10000000-0000-4000-8000-000000000001',
  'retention-not-expired-pal',
  'test_parent_a',
  'male',
  '{}',
  'unknown'
);

create temporary table retention_result(payload jsonb) on commit drop;
grant select, insert on retention_result to service_role;
insert into retention_result
select public.cleanup_expired_inventory_snapshot_payloads(25);

select is(
  (select payload->>'purged_snapshot_count' from retention_result),
  '1',
  'one superseded published payload is purged'
);
select is(
  (select payload->>'deleted_item_count' from retention_result),
  '1',
  'the superseded snapshot item is deleted'
);
select is(
  (select payload->>'deleted_failure_count' from retention_result),
  '1',
  'expired failed snapshot metadata is deleted'
);
select isnt(
  (
    select payload_purged_at
    from public.inventory_snapshots
    where id = '40000000-0000-4000-8000-000000000001'
  ),
  null::timestamptz,
  'successful snapshot keeps a marked audit stub'
);
select is(
  (
    select count(*)::integer
    from public.pal_snapshot_items
    where snapshot_id = '40000000-0000-4000-8000-000000000001'
  ),
  0,
  'purged snapshot no longer retains inventory rows'
);
select is(
  (
    select latest_snapshot_id
    from public.worlds
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  '40000000-0000-4000-8000-000000000002'::uuid,
  'cleanup never changes the latest snapshot pointer'
);
select ok(
  exists (
    select 1
    from public.pal_snapshot_items
    where snapshot_id = '40000000-0000-4000-8000-000000000002'
  ),
  'latest inventory payload remains available even when older than 30 minutes'
);
select ok(
  exists (
    select 1
    from public.pal_snapshot_items
    where snapshot_id = '40000000-0000-4000-8000-0000000000e2'
  ),
  'a superseded payload younger than 30 minutes is not cleaned early'
);
select ok(
  exists (
    select 1
    from public.pal_instance_lifecycle
    where world_id = '10000000-0000-4000-8000-000000000001'
      and pal_instance_uid = 'fixture-pal-a-historical-001'
  ),
  'lightweight first-seen history survives payload cleanup'
);
select ok(
  exists (
    select 1
    from public.step_offspring_candidates
    where step_id = '63000000-0000-4000-8000-000000000001'
  ),
  'materialized offspring candidate history survives cleanup'
);
select ok(
  exists (
    select 1
    from public.breeding_steps
    where id = '63000000-0000-4000-8000-000000000001'
  ),
  'materialized breeding plan history survives cleanup'
);
select is(
  (
    select count(*)::integer
    from public.inventory_snapshots
    where id = '40000000-0000-4000-8000-0000000000f1'
  ),
  0,
  'expired failure audit row is physically removed'
);

select isnt(
  public.publish_inventory_snapshot(
    '10000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'source_save_hash', repeat('a', 64),
      'source_modified_at', '2026-07-13T10:00:00Z',
      'save_version', 'fixture-save-reappeared',
      'captured_at', '2026-07-13T10:00:00Z',
      'parser_name', 'fixture-parser',
      'parser_version', '1.0.0',
      'server', jsonb_build_object('world_uid', 'fixture-world-local'),
      'guilds', '[]'::jsonb,
      'players', '[]'::jsonb,
      'pals', '[]'::jsonb,
      'warnings', '[]'::jsonb
    )
  ),
  '40000000-0000-4000-8000-000000000001'::uuid,
  'a purged hash creates a new snapshot occurrence instead of reusing an empty stub'
);

reset role;
select * from finish();
rollback;
