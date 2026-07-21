begin;
set local search_path = public, extensions;

select plan(21);

insert into public.game_data_versions (
  id, package_hash, content_hash, schema_version, extractor_name, extractor_version,
  status, manifest, validation_report, validated_at
) values
  (
    '75000000-0000-4000-8000-000000000001', repeat('1', 64), repeat('2', 64),
    '1.0.0', 'fixture', '1.0.0', 'validated', '{}', '{"valid":true}', now()
  ),
  (
    '75000000-0000-4000-8000-000000000002', repeat('3', 64), repeat('4', 64),
    '1.0.0', 'fixture', '1.0.0', 'validated', '{}', '{"valid":true}', now()
  );

insert into public.catalog_pals (
  version_id, pal_id, encyclopedia_no, name_key, element_types, rarity, breeding_power, metadata
)
select version_id, 'fixture-pal-a', 1, 'fixture.pal.a', array['neutral'], 1, 100, '{}'
from (values
  ('75000000-0000-4000-8000-000000000001'::uuid),
  ('75000000-0000-4000-8000-000000000002'::uuid)
) as versions(version_id);

insert into public.catalog_passive_skills (
  version_id, passive_skill_id, name_key, description_key, rank, is_negative, metadata
) values (
  '75000000-0000-4000-8000-000000000002',
  'fixture-passive-only-in-target', 'fixture.passive', null, 1, false, '{}'
);

update public.game_data_versions
   set status = 'published',
       published_at = now(),
       manifest = jsonb_build_object(
         'breeding_source_provenance',
         jsonb_build_object('base_content_hash', repeat('c', 64))
       )
 where id = '75000000-0000-4000-8000-000000000002';

select throws_ok(
  $$
    update public.worlds
       set active_game_data_version_id = '75000000-0000-4000-8000-000000000002'
     where id = '10000000-0000-4000-8000-000000000001'
  $$,
  'P0001', 'BREEDING_BASE_CATALOG_MISMATCH',
  'the world pointer cannot publish a breeding candidate with hidden base-catalog changes'
);

update public.game_data_versions
   set manifest = jsonb_build_object('breeding_source_provenance', null),
       status = 'published',
       published_at = now()
 where id = '75000000-0000-4000-8000-000000000001';

select lives_ok(
  $$
    update public.worlds
       set active_game_data_version_id = '75000000-0000-4000-8000-000000000001'
     where id = '10000000-0000-4000-8000-000000000001'
  $$,
  'a full catalog with JSON null breeding provenance can become active'
);

select set_config('app.game_data_rollback', 'true', true);
update public.worlds
   set active_game_data_version_id = '51000000-0000-4000-8000-000000000001'
 where id = '10000000-0000-4000-8000-000000000001';
select set_config('app.game_data_rollback', 'false', true);

select is(
  (select count(*)::integer from public.scoring_profiles
    where is_active and algorithm_version = 'inventory-trait-aware-deterministic-v4'),
  4,
  'all four active profiles use the inventory trait-aware deterministic algorithm'
);

select is(
  (select count(*)::integer from public.scoring_profiles
    where is_active
      and (select count(*) from jsonb_object_keys(scoring_profiles.weights)) = 8),
  4,
  'all four active profiles persist the same eight scoring components as the engine'
);

select results_eq(
  $$ select version from public.scoring_profiles where is_active order by version $$,
  $$ values
    ('balanced-v5'::text),
    ('fastest-v5'::text),
    ('highest-success-v5'::text),
    ('least-borrowing-v5'::text)
  $$,
  'only the four v4 scoring profiles are active'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select * from public.create_breeding_job(
  'test_child_pal', array['test_passive_a'], 'balanced', 'phase4-balanced'
);
select * from public.create_breeding_job(
  'test_child_pal', array['test_passive_a'], 'fastest', 'phase4-fastest'
);
select * from public.create_breeding_job(
  'test_child_pal', array['test_passive_a'], 'highest_success', 'phase4-success'
);
select * from public.create_breeding_job(
  'test_child_pal', array['test_passive_a'], 'least_borrowing', 'phase4-borrowing'
);

select results_eq(
  $$
    select optimization_mode::text, algorithm_version, scoring_profile_version
      from public.breeding_jobs
     where idempotency_key like 'phase4-%'
     order by optimization_mode
  $$,
  $$ values
    ('balanced', 'inventory-trait-aware-deterministic-v4', 'balanced-v5'),
    ('fastest', 'inventory-trait-aware-deterministic-v4', 'fastest-v5'),
    ('highest_success', 'inventory-trait-aware-deterministic-v4', 'highest-success-v5'),
    ('least_borrowing', 'inventory-trait-aware-deterministic-v4', 'least-borrowing-v5')
  $$,
  'each optimization mode fixes an engine-supported algorithm and scoring version'
);

select throws_ok(
  $$ select * from public.create_breeding_job('Pal Target', '{}', 'balanced', 'invalid-target') $$,
  'P0001', 'INVALID_TARGET_PAL', 'unstable target IDs are rejected by the database'
);
select throws_ok(
  format(
    'select * from public.create_breeding_job(%L, array[%L], %L, %L)',
    'test_child_pal', repeat('a', 121), 'balanced', 'long-passive'
  ),
  'P0001', 'INVALID_DESIRED_PASSIVES', 'overlong passive IDs are rejected by the database'
);
select throws_ok(
  $$ select * from public.create_breeding_job('unknown-pal', '{}', 'balanced', 'unknown-target') $$,
  'P0001', 'TARGET_PAL_NOT_IN_GAME_DATA_VERSION',
  'format-valid targets must belong to the fixed catalog version'
);
select throws_ok(
  $$
    select * from public.create_breeding_job(
      'test_child_pal', array['unknown-passive'], 'balanced', 'unknown-passive'
    )
  $$,
  'P0001', 'DESIRED_PASSIVE_NOT_IN_GAME_DATA_VERSION',
  'format-valid passives must belong to the fixed catalog version'
);

select throws_ok(
  $$
    select public.configure_game_data_source(
      '76000000-0000-4000-8000-000000000001', 'Player Source', 'upload', null, false
    )
  $$,
  'P0001', 'ADMIN_REQUIRED', 'ordinary players cannot configure breeding sources'
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
    select public.configure_game_data_source(
      '76000000-0000-4000-8000-000000000001', 'Audited Upload', 'upload', null, true
    )
  $$,
  'administrators can create an audited disabled/enabled source record through RPC'
);

select lives_ok(
  $$
    select public.configure_game_data_source(
      '76000000-0000-4000-8000-000000000002',
      'Audited Local Game Package',
      'game_package',
      null,
      true
    )
  $$,
  'administrators can register a local game package without persisting a host path'
);

select throws_ok(
  $$
    select public.get_breeding_data_diff(
      '75000000-0000-4000-8000-000000000001',
      '75000000-0000-4000-8000-000000000002'
    )
  $$,
  'P0001', 'BREEDING_BASE_CATALOG_MISMATCH',
  'breeding-only review rejects any non-breeding catalog difference'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select is(
  (select count(*)::integer from public.get_active_scoring_profiles_for_agent()),
  4,
  'Agent startup can load exactly four active scoring profiles'
);
select is(
  (select count(*)::integer
     from jsonb_object_keys(
       (select weights from public.get_active_scoring_profiles_for_agent()
         where optimization_mode = 'balanced')
     )),
  8,
  'Agent startup receives every persisted balanced weight'
);
select is(
  (public.get_breeding_inventory_for_agent('60000000-0000-4000-8000-000000000001')->>'snapshot_id'),
  '40000000-0000-4000-8000-000000000002',
  'runtime inventory RPC returns the exact job-fixed snapshot envelope'
);
select is(
  jsonb_array_length(
    public.get_breeding_inventory_for_agent('60000000-0000-4000-8000-000000000001')->'items'
  ),
  5,
  'runtime inventory RPC returns only normalized engine fields for the fixed snapshot'
);
select is(
  (select source_type::text from public.get_game_data_source_for_agent(
    '76000000-0000-4000-8000-000000000001'
  )),
  'upload',
  'Agent resolves the exact audited source record by UUID'
);

select lives_ok(
  $$
    select * from public.begin_game_data_import(
      '76000000-0000-4000-8000-000000000002',
      jsonb_build_object(
        'schema_version', '1.1.0',
        'game_build_id', '24181105',
        'game_version', 'v1.0.1.100619',
        'package_hash', repeat('8', 64),
        'content_hash', repeat('9', 64),
        'extractor_name', 'palhatch-full-catalog-extractor',
        'extractor_version', 'fixture',
        'counts', '{}'::jsonb,
        'files', '[]'::jsonb,
        'breeding_source_provenance', null
      ),
      'game-catalog-artifacts',
      'versions/' || repeat('9', 64) || '/catalog.tar.gz'
    )
  $$,
  'a full catalog import treats JSON null breeding provenance as absent'
);

select throws_ok(
  $$
    select * from public.begin_game_data_import(
      '76000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'schema_version', '1.0.0',
        'game_build_id', 'fixture-build',
        'game_version', 'fixture-version',
        'package_hash', repeat('5', 64),
        'content_hash', repeat('6', 64),
        'extractor_name', 'breeding-source-transformer',
        'extractor_version', '1.0.0',
        'counts', '{}'::jsonb,
        'files', '[]'::jsonb,
        'breeding_source_provenance', jsonb_build_object(
          'source_id', '76000000-0000-4000-8000-000000000099',
          'source_type', 'upload',
          'source_name', 'Audited Upload',
          'base_content_hash', repeat('7', 64)
        )
      ),
      'game-catalog-artifacts',
      'versions/' || repeat('6', 64) || '/catalog.tar.gz'
    )
  $$,
  'P0001', 'BREEDING_SOURCE_PROVENANCE_MISMATCH',
  'staging cannot bind a candidate to a source UUID different from its provenance'
);

select * from finish();
rollback;
