begin;
set local search_path = public, extensions;

select plan(12);

insert into public.game_data_sources (
  id, name, source_type, source_url, enabled
) values
  (
    '74000000-0000-4000-8000-000000000001',
    'Phase4A Disabled GitHub',
    'github',
    'https://github.example/fixture.json',
    false
  ),
  (
    '74000000-0000-4000-8000-000000000002',
    'Phase4A Disabled URL',
    'url',
    'https://source.example/fixture.json',
    false
  ),
  (
    '74000000-0000-4000-8000-000000000003',
    'Phase4A Disabled Upload',
    'upload',
    null,
    false
  );

select is(
  (
    select count(*)::integer from public.game_data_sources
     where id::text like '74000000-0000-4000-8000-%'
  ),
  3,
  'GitHub, URL, and Upload are explicit configurable source records'
);
select ok(
  (
    select bool_and(not enabled) from public.game_data_sources
     where id::text like '74000000-0000-4000-8000-%'
  ),
  'every configured source can be disabled independently'
);

insert into public.game_data_versions (
  id,
  package_hash,
  content_hash,
  schema_version,
  extractor_name,
  extractor_version,
  status,
  manifest,
  validation_report,
  validated_at
) values
  (
    '73000000-0000-4000-8000-000000000001',
    repeat('1', 64),
    repeat('2', 64),
    '1.0.0',
    'fixture-breeding-transformer',
    '1.0.0',
    'validated',
    '{"fixture":true}',
    '{"valid":true}',
    '2026-07-14T00:00:00Z'
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    repeat('3', 64),
    repeat('4', 64),
    '1.0.0',
    'fixture-breeding-transformer',
    '1.0.0',
    'validated',
    '{"fixture":true}',
    '{"valid":true}',
    '2026-07-14T01:00:00Z'
  );

insert into public.catalog_pals (
  version_id, pal_id, encyclopedia_no, name_key, element_types, rarity, breeding_power, metadata
)
select
  version.id,
  pal.pal_id,
  pal.number,
  'fixture.' || pal.pal_id || '.name',
  array['fixture-neutral'],
  1,
  100,
  '{"fixture":true}'::jsonb
from (
  values
    ('73000000-0000-4000-8000-000000000001'::uuid),
    ('73000000-0000-4000-8000-000000000002'::uuid)
) as version(id)
cross join (
  values
    ('fixture-pal-a'::text, 1),
    ('fixture-pal-b'::text, 2),
    ('fixture-pal-c'::text, 3),
    ('fixture-pal-d'::text, 4),
    ('fixture-pal-e'::text, 5),
    ('fixture-pal-f'::text, 6)
) as pal(pal_id, number);

insert into public.catalog_breeding_recipes (
  version_id, parent_a_pal_id, parent_b_pal_id, child_pal_id, recipe_type, metadata
) values
  (
    '73000000-0000-4000-8000-000000000001',
    'fixture-pal-a', 'fixture-pal-b', 'fixture-pal-c', 'normal', '{"fixture":true}'
  ),
  (
    '73000000-0000-4000-8000-000000000001',
    'fixture-pal-a', 'fixture-pal-b', 'fixture-pal-d', 'special', '{"fixture":true}'
  ),
  (
    '73000000-0000-4000-8000-000000000001',
    'fixture-pal-d', 'fixture-pal-e', 'fixture-pal-f', 'normal', '{"fixture":true}'
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    'fixture-pal-a', 'fixture-pal-b', 'fixture-pal-f', 'normal', '{"fixture":true}'
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    'fixture-pal-a', 'fixture-pal-b', 'fixture-pal-d', 'special', '{"fixture":true}'
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    'fixture-pal-a', 'fixture-pal-c', 'fixture-pal-e', 'normal', '{"fixture":true}'
  );

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select public.get_breeding_data_diff(
      '73000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000002'
    )
  $$,
  'P0001',
  'ADMIN_REQUIRED',
  'ordinary players cannot inspect unpublished breeding data diffs'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;

create temporary table phase4a_diff as
select public.get_breeding_data_diff(
  '73000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000002'
) as report;

select is((select report->'counts'->>'added' from phase4a_diff), '1', 'diff counts additions');
select is((select report->'counts'->>'removed' from phase4a_diff), '1', 'diff counts removals');
select is((select report->'counts'->>'changed' from phase4a_diff), '1', 'diff counts changes');
select is((select report->'counts'->>'unchanged' from phase4a_diff), '1', 'diff counts unchanged recipes');
select is(
  (select report->'changed'->0->>'before_child_pal_id' from phase4a_diff),
  'fixture-pal-c',
  'diff reports the previous child'
);
select is(
  (select report->'changed'->0->>'after_child_pal_id' from phase4a_diff),
  'fixture-pal-f',
  'diff reports the replacement child'
);
select is(
  (select active_game_data_version_id from public.worlds where id = '10000000-0000-4000-8000-000000000001'),
  '51000000-0000-4000-8000-000000000001'::uuid,
  'diffing validated versions never auto-publishes them'
);
select is(
  (select game_data_version_id from public.breeding_jobs where id = '60000000-0000-4000-8000-000000000001'),
  '51000000-0000-4000-8000-000000000001'::uuid,
  'existing running work keeps its fixed historical version'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select throws_ok(
  $$
    select * from public.begin_game_data_import(
      '74000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'schema_version', '1.0.0',
        'package_hash', repeat('5', 64),
        'content_hash', repeat('6', 64),
        'extractor_name', 'fixture-breeding-transformer',
        'extractor_version', '1.0.0',
        'counts', '{}'::jsonb,
        'files', '[]'::jsonb
      ),
      'game-catalog-artifacts',
      'versions/' || repeat('6', 64) || '/catalog.tar.gz'
    )
  $$,
  'P0001',
  'GAME_DATA_SOURCE_NOT_FOUND',
  'a disabled remote source cannot start an import'
);

select * from finish();
rollback;
