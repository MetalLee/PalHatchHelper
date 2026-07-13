-- Deterministic local-only fixtures. These identities, UIDs, names, and hashes are synthetic.
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
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'admin@palhatch.fixture.invalid',
    extensions.crypt('palhatch-local-fixture', '$2a$06$abcdefghijklmnopqrstuu'),
    '2026-07-13T00:00:00Z',
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Fixture Admin"}',
    '2026-07-13T00:00:00Z',
    '2026-07-13T00:00:00Z',
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'player-a@palhatch.fixture.invalid',
    extensions.crypt('palhatch-local-fixture', '$2a$06$abcdefghijklmnopqrstuu'),
    '2026-07-13T00:00:00Z',
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Fixture Player A"}',
    '2026-07-13T00:00:00Z',
    '2026-07-13T00:00:00Z',
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'player-b@palhatch.fixture.invalid',
    extensions.crypt('palhatch-local-fixture', '$2a$06$abcdefghijklmnopqrstuu'),
    '2026-07-13T00:00:00Z',
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Fixture Player B"}',
    '2026-07-13T00:00:00Z',
    '2026-07-13T00:00:00Z',
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'player-c@palhatch.fixture.invalid',
    extensions.crypt('palhatch-local-fixture', '$2a$06$abcdefghijklmnopqrstuu'),
    '2026-07-13T00:00:00Z',
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Fixture Player C"}',
    '2026-07-13T00:00:00Z',
    '2026-07-13T00:00:00Z',
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'unbound@palhatch.fixture.invalid',
    extensions.crypt('palhatch-local-fixture', '$2a$06$abcdefghijklmnopqrstuu'),
    '2026-07-13T00:00:00Z',
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Fixture Unbound User"}',
    '2026-07-13T00:00:00Z',
    '2026-07-13T00:00:00Z',
    '', '', '', ''
  );

update public.profiles
set role = 'admin', updated_at = '2026-07-13T00:00:00Z'
where id = '00000000-0000-4000-8000-000000000001';

insert into public.worlds (id, world_uid, name, created_at, updated_at)
values (
  '10000000-0000-4000-8000-000000000001',
  'fixture-world-local',
  'Fixture Local World',
  '2026-07-13T00:00:00Z',
  '2026-07-13T00:00:00Z'
);

insert into public.guilds (
  id,
  world_id,
  game_guild_uid,
  name,
  last_seen_at,
  created_at
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'fixture-guild-alpha',
    'Fixture Guild Alpha',
    '2026-07-13T09:00:00Z',
    '2026-07-13T00:00:00Z'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'fixture-guild-beta',
    'Fixture Guild Beta',
    '2026-07-13T09:00:00Z',
    '2026-07-13T00:00:00Z'
  );

insert into public.players (
  id,
  world_id,
  guild_id,
  game_player_uid,
  nickname,
  level,
  last_seen_at,
  created_at
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'fixture-player-a-uid',
    'Fixture Player A',
    35,
    '2026-07-13T09:00:00Z',
    '2026-07-13T00:00:00Z'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'fixture-player-b-uid',
    'Fixture Player B',
    32,
    '2026-07-13T09:00:00Z',
    '2026-07-13T00:00:00Z'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    'fixture-player-c-uid',
    'Fixture Player C',
    28,
    '2026-07-13T09:00:00Z',
    '2026-07-13T00:00:00Z'
  );

insert into public.player_bindings (user_id, player_id, bound_by, bound_at)
values
  (
    '00000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '2026-07-13T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    '2026-07-13T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000001',
    '2026-07-13T00:00:00Z'
  );

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
  parsed_at,
  created_at
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '2026-07-13T08:00:00Z',
    'fixture-save-v1',
    'fixture-parser',
    '1.0.0',
    'published',
    '2026-07-13T08:00:00Z',
    '2026-07-13T08:01:00Z',
    '2026-07-13T08:01:00Z'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    '2026-07-13T09:00:00Z',
    'fixture-save-v1',
    'fixture-parser',
    '1.0.0',
    'published',
    '2026-07-13T09:00:00Z',
    '2026-07-13T09:01:00Z',
    '2026-07-13T09:01:00Z'
  );

insert into public.pal_snapshot_items (
  id,
  snapshot_id,
  world_id,
  pal_instance_uid,
  pal_id,
  owner_player_id,
  guild_id,
  gender,
  level,
  passive_skill_ids,
  location_type,
  location_name,
  raw_metadata,
  created_at
)
values
  (
    '41000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'fixture-pal-a-historical-001',
    'test_parent_a',
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'male',
    18,
    array['test_passive_a'],
    'player_storage',
    'Fixture Storage',
    '{"fixture_note":"historical"}',
    '2026-07-13T08:01:00Z'
  ),
  (
    '41000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'fixture-pal-a-owned-001',
    'test_parent_a',
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'male',
    20,
    array['test_passive_a'],
    'player_storage',
    'Fixture Storage A',
    '{"fixture_note":"owned-a-1"}',
    '2026-07-13T09:01:00Z'
  ),
  (
    '41000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'fixture-pal-a-owned-002',
    'test_child_pal',
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'female',
    22,
    array['test_passive_a', 'test_passive_b'],
    'base',
    'Fixture Base Alpha',
    '{"fixture_note":"owned-a-2"}',
    '2026-07-13T09:01:00Z'
  ),
  (
    '41000000-0000-4000-8000-000000000004',
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'fixture-pal-b-shared-001',
    'test_parent_b',
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'female',
    21,
    array['test_passive_b'],
    'base',
    'Fixture Base Alpha',
    '{"fixture_note":"shared-by-default"}',
    '2026-07-13T09:01:00Z'
  ),
  (
    '41000000-0000-4000-8000-000000000005',
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'fixture-pal-b-private-001',
    'test_private_pal',
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'male',
    19,
    array['test_passive_private'],
    'player_party',
    null,
    '{"fixture_note":"explicitly-private"}',
    '2026-07-13T09:01:00Z'
  ),
  (
    '41000000-0000-4000-8000-000000000006',
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'fixture-pal-c-shared-001',
    'test_other_guild_pal',
    '30000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000002',
    'female',
    17,
    '{}',
    'base',
    'Fixture Base Beta',
    '{"fixture_note":"other-guild"}',
    '2026-07-13T09:01:00Z'
  );

insert into public.pal_share_preferences (
  world_id,
  pal_instance_uid,
  owner_player_id_at_set,
  share_enabled,
  updated_by,
  updated_at
)
values (
  '10000000-0000-4000-8000-000000000001',
  'fixture-pal-b-private-001',
  '30000000-0000-4000-8000-000000000002',
  false,
  '00000000-0000-4000-8000-000000000003',
  '2026-07-13T09:02:00Z'
);

insert into public.breeding_data_sources (
  id,
  name,
  source_type,
  source_url,
  enabled,
  created_at,
  updated_at
)
values (
  '50000000-0000-4000-8000-000000000001',
  'Fixture Manual Upload',
  'upload',
  null,
  true,
  '2026-07-13T00:00:00Z',
  '2026-07-13T00:00:00Z'
);

insert into public.breeding_data_versions (
  id,
  source_id,
  external_version,
  content_hash,
  status,
  validation_report,
  imported_at
)
values
  (
    '51000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'fixture-v1',
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'validated',
    '{"valid":true,"fixture_recipe_count":2}',
    '2026-07-13T07:00:00Z'
  ),
  (
    '51000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000001',
    'fixture-v2-validated',
    'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    'validated',
    '{"valid":true,"fixture_recipe_count":1}',
    '2026-07-13T07:30:00Z'
  );

insert into public.breeding_recipes (
  id,
  version_id,
  parent_a_pal_id,
  parent_b_pal_id,
  child_pal_id,
  recipe_type,
  metadata,
  created_at
)
values
  (
    '51100000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000001',
    'test_parent_a',
    'test_parent_b',
    'test_child_pal',
    'normal',
    '{"fixture":true}',
    '2026-07-13T07:01:00Z'
  ),
  (
    '51100000-0000-4000-8000-000000000002',
    '51000000-0000-4000-8000-000000000001',
    'test_special_a',
    'test_special_b',
    'test_special_child',
    'special',
    '{"fixture":true}',
    '2026-07-13T07:01:00Z'
  ),
  (
    '51100000-0000-4000-8000-000000000003',
    '51000000-0000-4000-8000-000000000002',
    'test_parent_c',
    'test_parent_d',
    'test_child_v2',
    'normal',
    '{"fixture":true}',
    '2026-07-13T07:31:00Z'
  );

update public.breeding_data_versions
set
  status = 'published',
  published_at = '2026-07-13T07:05:00Z',
  published_by = '00000000-0000-4000-8000-000000000001'
where id = '51000000-0000-4000-8000-000000000001';

insert into public.scoring_profiles (
  id,
  version,
  optimization_mode,
  algorithm_version,
  weights,
  is_active,
  created_at
)
values
  (
    '52000000-0000-4000-8000-000000000001',
    'balanced-v1',
    'balanced',
    'phase1-contract-v1',
    '{"route_length":0.25,"inventory_coverage":0.25,"inheritance":0.25,"borrowing":0.25}',
    true,
    '2026-07-13T00:00:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000002',
    'fastest-v1',
    'fastest',
    'phase1-contract-v1',
    '{"route_length":0.7,"inventory_coverage":0.1,"inheritance":0.1,"borrowing":0.1}',
    true,
    '2026-07-13T00:00:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000003',
    'highest-success-v1',
    'highest_success',
    'phase1-contract-v1',
    '{"route_length":0.1,"inventory_coverage":0.1,"inheritance":0.7,"borrowing":0.1}',
    true,
    '2026-07-13T00:00:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000004',
    'least-borrowing-v1',
    'least_borrowing',
    'phase1-contract-v1',
    '{"route_length":0.1,"inventory_coverage":0.1,"inheritance":0.1,"borrowing":0.7}',
    true,
    '2026-07-13T00:00:00Z'
  );

update public.worlds
set
  latest_snapshot_id = '40000000-0000-4000-8000-000000000002',
  active_breeding_version_id = '51000000-0000-4000-8000-000000000001',
  updated_at = '2026-07-13T09:02:00Z'
where id = '10000000-0000-4000-8000-000000000001';

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
  locked_by,
  lease_token,
  locked_at,
  heartbeat_at,
  attempt_count,
  error_code,
  created_at,
  updated_at,
  completed_at
)
values
  (
    '60000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'test_pending_target',
    array['test_passive_a'],
    'balanced',
    '40000000-0000-4000-8000-000000000002',
    '51000000-0000-4000-8000-000000000001',
    'phase1-contract-v1',
    'balanced-v1',
    'pending',
    repeat('1', 64),
    'fixture-pending-job',
    null,
    null,
    null,
    null,
    0,
    null,
    '2026-07-13T10:00:00Z',
    '2026-07-13T10:00:00Z',
    null
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'test_processing_target',
    array['test_passive_b'],
    'balanced',
    '40000000-0000-4000-8000-000000000002',
    '51000000-0000-4000-8000-000000000001',
    'phase1-contract-v1',
    'balanced-v1',
    'processing',
    repeat('2', 64),
    'fixture-processing-job',
    'fixture-seed-worker',
    '70000000-0000-4000-8000-000000000001',
    '2026-07-13T10:01:00Z',
    '2026-07-13T10:01:30Z',
    1,
    null,
    '2026-07-13T10:01:00Z',
    '2026-07-13T10:01:30Z',
    null
  ),
  (
    '60000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'test_completed_target',
    array['test_passive_a', 'test_passive_b'],
    'balanced',
    '40000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000001',
    'phase1-contract-v1',
    'balanced-v1',
    'completed',
    repeat('3', 64),
    'fixture-completed-job',
    null,
    null,
    null,
    null,
    1,
    null,
    '2026-07-13T10:02:00Z',
    '2026-07-13T10:03:00Z',
    '2026-07-13T10:03:00Z'
  );

insert into public.breeding_plans (
  id,
  job_id,
  ai_provider,
  ai_model,
  ai_explanation,
  generated_at
)
values (
  '61000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000003',
  'template',
  null,
  'Fixture explanation generated without AI facts.',
  '2026-07-13T10:03:00Z'
);

insert into public.breeding_routes (
  id,
  plan_id,
  rank,
  total_score,
  generation_count,
  estimated_attempts_min,
  estimated_attempts_max,
  borrowed_pal_count,
  inventory_coverage,
  inheritance_score,
  score_breakdown,
  created_at
)
values (
  '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  1,
  0.85,
  1,
  1,
  3,
  1,
  1.0,
  0.75,
  '{"fixture":true,"deterministic":true}',
  '2026-07-13T10:03:00Z'
);

update public.breeding_plans
set recommended_route_id = '62000000-0000-4000-8000-000000000001'
where id = '61000000-0000-4000-8000-000000000001';

insert into public.breeding_steps (
  id,
  route_id,
  step_index,
  parent_a_instance_uid,
  parent_b_instance_uid,
  expected_child_pal_id,
  required_passive_ids,
  selected_child_instance_uid,
  status,
  completed_at,
  created_at,
  updated_at
)
values (
  '63000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  0,
  'fixture-pal-a-historical-001',
  'fixture-pal-b-shared-001',
  'test_child_pal',
  array['test_passive_a', 'test_passive_b'],
  'fixture-pal-a-owned-002',
  'completed',
  '2026-07-13T10:04:00Z',
  '2026-07-13T10:03:00Z',
  '2026-07-13T10:04:00Z'
);

insert into public.step_offspring_candidates (
  step_id,
  pal_instance_uid,
  detected_snapshot_id,
  match_score,
  matched_passive_ids,
  first_detected_at,
  confirmed,
  confirmed_at,
  confirmed_by
)
values (
  '63000000-0000-4000-8000-000000000001',
  'fixture-pal-a-owned-002',
  '40000000-0000-4000-8000-000000000002',
  1.0,
  array['test_passive_a', 'test_passive_b'],
  '2026-07-13T10:04:00Z',
  true,
  '2026-07-13T10:04:00Z',
  '00000000-0000-4000-8000-000000000002'
);
