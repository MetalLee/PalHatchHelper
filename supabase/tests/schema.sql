begin;
set local search_path = public, extensions;

select plan(33);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'player_bindings', 'player_bindings exists');
select has_table('public', 'worlds', 'worlds exists');
select has_table('public', 'guilds', 'guilds exists');
select has_table('public', 'players', 'players exists');
select has_table('public', 'inventory_snapshots', 'inventory_snapshots exists');
select has_table('public', 'pal_snapshot_items', 'pal_snapshot_items exists');
select has_table('public', 'pal_share_preferences', 'pal_share_preferences exists');
select has_table('public', 'breeding_data_sources', 'breeding_data_sources exists');
select has_table('public', 'breeding_data_versions', 'breeding_data_versions exists');
select has_table('public', 'breeding_recipes', 'breeding_recipes exists');
select has_table('public', 'scoring_profiles', 'scoring_profiles exists');
select has_table('public', 'breeding_jobs', 'breeding_jobs exists');
select has_column(
  'public',
  'breeding_jobs',
  'lease_token',
  'breeding job leases have a fencing token'
);
select has_table('public', 'breeding_plans', 'breeding_plans exists');
select has_table('public', 'breeding_routes', 'breeding_routes exists');
select has_table('public', 'breeding_steps', 'breeding_steps exists');
select has_table('public', 'step_offspring_candidates', 'step_offspring_candidates exists');

select col_type_is(
  'public',
  'breeding_jobs',
  'optimization_mode',
  'optimization_mode',
  'optimization mode uses a database enum'
);
select col_type_is(
  'public',
  'breeding_jobs',
  'status',
  'breeding_job_status',
  'job status uses a database enum'
);

select throws_ok(
  $$
    update public.breeding_jobs
       set lease_token = null
     where id = '60000000-0000-4000-8000-000000000002'
  $$,
  '23514',
  null,
  'an active job cannot lose its lease fencing token'
);

select throws_ok(
  $$
    update public.breeding_jobs
       set lease_token = '70000000-0000-4000-8000-000000000099'
     where id = '60000000-0000-4000-8000-000000000003'
  $$,
  '23514',
  null,
  'a terminal job cannot retain an active lease fencing token'
);
select col_type_is(
  'public',
  'breeding_steps',
  'status',
  'breeding_step_status',
  'step status uses a database enum'
);

select throws_ok(
  $$
    insert into public.breeding_jobs (
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
      request_fingerprint,
      idempotency_key
    ) values (
      '00000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'invalid-passive-count',
      array['a', 'b', 'c', 'd', 'e'],
      'balanced',
      '40000000-0000-4000-8000-000000000002',
      '51000000-0000-4000-8000-000000000001',
      'phase1-contract-v1',
      'balanced-v1',
      'invalid-passive-count',
      'invalid-passive-count'
    )
  $$,
  '23514',
  null,
  'desired passives cannot exceed four'
);

select throws_ok(
  $$
    insert into public.breeding_recipes (
      version_id,
      parent_a_pal_id,
      parent_b_pal_id,
      child_pal_id,
      recipe_type
    ) values (
      '51000000-0000-4000-8000-000000000002',
      'test_parent_d',
      'test_parent_c',
      'duplicate_child',
      'normal'
    )
  $$,
  '23505',
  null,
  'parent order is normalized for uniqueness'
);

select throws_ok(
  $$
    update public.inventory_snapshots
       set parser_version = 'mutated'
     where id = '40000000-0000-4000-8000-000000000002'
  $$,
  'P0001',
  'INVENTORY_SNAPSHOT_IMMUTABLE',
  'inventory snapshots are immutable'
);

select throws_ok(
  $$
    delete from public.pal_snapshot_items
     where snapshot_id = '40000000-0000-4000-8000-000000000002'
  $$,
  'P0001',
  'PAL_SNAPSHOT_ITEM_IMMUTABLE',
  'snapshot items are immutable'
);

select throws_ok(
  $$
    update public.scoring_profiles
       set weights = '{"changed":1}'::jsonb
     where version = 'balanced-v1'
  $$,
  'P0001',
  'SCORING_PROFILE_VERSION_IMMUTABLE',
  'a scoring version cannot change historical deterministic weights'
);

select throws_ok(
  $$
    insert into public.inventory_snapshots (
      id,
      world_id,
      source_save_hash,
      source_modified_at,
      parser_name,
      parser_version,
      status,
      captured_at,
      parsed_at
    ) values (
      '40000000-0000-4000-8000-000000000099',
      '10000000-0000-4000-8000-000000000001',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      '2026-07-13T09:00:00Z',
      'fixture-parser',
      '1.0.0',
      'published',
      '2026-07-13T09:00:00Z',
      '2026-07-13T09:01:00Z'
    )
  $$,
  '23505',
  null,
  'a successful save hash is unique within its world'
);

select throws_ok(
  $$
    insert into public.inventory_snapshots (
      id,
      world_id,
      source_save_hash,
      source_modified_at,
      parser_name,
      parser_version,
      status,
      captured_at,
      error_code
    ) values (
      '40000000-0000-4000-8000-000000000098',
      '10000000-0000-4000-8000-000000000001',
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      '2026-07-13T09:00:00Z',
      'fixture-parser',
      '1.0.0',
      'failed',
      '2026-07-13T09:00:00Z',
      'unstable-error-code'
    )
  $$,
  '23514',
  null,
  'snapshot error codes use the stable uppercase format'
);

select throws_ok(
  $$
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
      error_code,
      completed_at
    ) values (
      '60000000-0000-4000-8000-000000000099',
      '00000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'invalid_error_code_target',
      '{}',
      'balanced',
      '40000000-0000-4000-8000-000000000002',
      '51000000-0000-4000-8000-000000000001',
      'phase1-contract-v1',
      'balanced-v1',
      'failed',
      repeat('9', 64),
      'invalid-error-code',
      1,
      'unstable-error-code',
      '2026-07-13T10:10:00Z'
    )
  $$,
  '23514',
  null,
  'job error codes use the stable uppercase format'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000006',
  'authenticated',
  'authenticated',
  'new-user@palhatch.fixture.invalid',
  extensions.crypt('palhatch-local-fixture', '$2a$06$abcdefghijklmnopqrstuu'),
  '2026-07-13T00:00:00Z',
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"New Fixture User","role":"admin"}',
  '2026-07-13T00:00:00Z',
  '2026-07-13T00:00:00Z',
  '', '', '', ''
);

select is(
  (
    select role
      from public.profiles
     where id = '00000000-0000-4000-8000-000000000006'
  ),
  'player'::public.profile_role,
  'new Auth users always receive a player profile even if metadata requests admin'
);

select ok(
  (
    select active_breeding_version_id is not null
      from public.worlds
     where id = '10000000-0000-4000-8000-000000000001'
  ),
  'seed world has a published active breeding version'
);

select * from finish();
rollback;
