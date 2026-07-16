begin;
set local search_path = public, extensions;

select plan(29);

select ok(
  not exists (
    select 1
      from public.breeding_data_sources as legacy
      left join public.game_data_sources as unified on unified.id = legacy.id
     where unified.id is null
  ),
  'legacy breeding sources are mirrored into unified game data sources'
);

select ok(
  not exists (
    select 1
      from public.breeding_data_versions as legacy
      left join public.game_data_versions as unified on unified.id = legacy.id
     where unified.id is null
  ),
  'legacy breeding versions are mirrored with reusable UUIDs'
);

select is(
  (select active_game_data_version_id from public.worlds where id = '10000000-0000-4000-8000-000000000001'),
  '51000000-0000-4000-8000-000000000001'::uuid,
  'seed writes through the compatibility trigger to the game data world pointer'
);

select ok(
  not exists (
    select 1 from public.breeding_jobs
     where game_data_version_id is distinct from breeding_data_version_id
  ),
  'legacy jobs are backfilled without losing their exact version'
);

select is(
  (select public from storage.buckets where id = 'game-catalog-artifacts'),
  false,
  'the catalog artifact bucket is private'
);

insert into public.worlds (
  id, world_uid, name, active_breeding_version_id, active_game_data_version_id
) values (
  '10000000-0000-4000-8000-000000000002',
  'fixture-world-secondary',
  'Fixture Secondary World',
  '51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001'
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
  validation_report
) values (
  '72000000-0000-4000-8000-000000000001',
  repeat('9', 64),
  repeat('8', 64),
  '1.0.0',
  'fixture-extractor',
  '1.0.0',
  'staging',
  '{}'::jsonb,
  '{}'::jsonb
);

create temporary table test_game_import (
  version_id uuid not null,
  import_run_id uuid not null
) on commit drop;
grant select on test_game_import to authenticated;
grant select, insert on test_game_import to service_role;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

insert into test_game_import (version_id, import_run_id)
select version_id, import_run_id
from public.begin_game_data_import(
  null,
  jsonb_build_object(
    'schema_version', '1.0.0',
    'game_build_id', 'fixture-build',
    'game_version', 'fixture-version',
    'package_hash', repeat('b', 64),
    'content_hash', repeat('a', 64),
    'extractor_name', 'fixture-extractor',
    'extractor_version', '1.0.0',
    'created_at', '2026-07-14T00:00:00Z',
    'locales', jsonb_build_array('en-US'),
    'counts', jsonb_build_object(
      'pals', 3,
      'passive_skills', 1,
      'active_skills', 1,
      'pal_active_skills', 1,
      'partner_skills', 1,
      'breeding_recipes', 2,
      'localizations', 8
    ),
    'files', jsonb_build_array(),
    'compression', 'tar.gz'
  ),
  'game-catalog-artifacts',
  'versions/' || repeat('a', 64) || '/catalog.tar.gz'
);

select is(
  (select status from public.game_data_versions where id = (select version_id from test_game_import)),
  'staging'::public.game_data_status,
  'begin import creates an unpublished staging version'
);

select public.stage_catalog_batch(
  (select import_run_id from test_game_import),
  'pals',
  'pals:0',
  '[
    {"pal_id":"fixture-pal-a","encyclopedia_no":1,"name_key":"fixture.pal.a.name","element_types":["fixture-fire"],"rarity":1,"breeding_power":100,"metadata":{"fictional":true}},
    {"pal_id":"fixture-pal-b","encyclopedia_no":2,"name_key":"fixture.pal.b.name","element_types":["fixture-water"],"rarity":1,"breeding_power":110,"metadata":{"fictional":true}},
    {"pal_id":"fixture-pal-c","encyclopedia_no":3,"name_key":"fixture.pal.c.name","element_types":["fixture-neutral"],"rarity":2,"breeding_power":120,"metadata":{"fictional":true}}
  ]'::jsonb
);
select public.stage_catalog_batch(
  (select import_run_id from test_game_import),
  'passive_skills',
  'passives:0',
  '[{"passive_skill_id":"fixture-passive-a","name_key":"fixture.passive.a.name","description_key":"fixture.passive.a.description","rank":-1,"is_negative":true,"metadata":{"fictional":true}}]'::jsonb
);
select public.stage_catalog_batch(
  (select import_run_id from test_game_import),
  'active_skills',
  'active:0',
  '[{"active_skill_id":"fixture-active-skill-a","name_key":"fixture.active.a.name","element_type":"fixture-fire","power":10,"cooldown_seconds":2.5,"metadata":{"fictional":true}}]'::jsonb
);
select public.stage_catalog_batch(
  (select import_run_id from test_game_import),
  'pal_active_skills',
  'pal-active:0',
  '[{"pal_id":"fixture-pal-a","active_skill_id":"fixture-active-skill-a","learn_level":1,"is_exclusive":false,"metadata":{"fictional":true}}]'::jsonb
);
select public.stage_catalog_batch(
  (select import_run_id from test_game_import),
  'partner_skills',
  'partner:0',
  '[{"partner_skill_id":"fixture-partner-skill-a","pal_id":"fixture-pal-a","name_key":"fixture.partner.a.name","description_key":"fixture.partner.a.description","metadata":{"fictional":true}}]'::jsonb
);
select public.stage_catalog_batch(
  (select import_run_id from test_game_import),
  'breeding_recipes',
  'breeding:0',
  '[
    {"parent_a_pal_id":"fixture-pal-a","parent_a_gender":"female","parent_b_pal_id":"fixture-pal-b","parent_b_gender":"male","child_pal_id":"fixture-pal-c","recipe_type":"special","metadata":{"fictional":true}},
    {"parent_a_pal_id":"fixture-pal-a","parent_a_gender":"male","parent_b_pal_id":"fixture-pal-b","parent_b_gender":"female","child_pal_id":"fixture-pal-b","recipe_type":"special","metadata":{"fictional":true}}
  ]'::jsonb
);
select public.stage_catalog_batch(
  (select import_run_id from test_game_import),
  'localizations',
  'localizations:0',
  '[
    {"locale":"en-US","text_key":"fixture.pal.a.name","text":"Fixture Pal A"},
    {"locale":"en-US","text_key":"fixture.pal.b.name","text":"Fixture Pal B"},
    {"locale":"en-US","text_key":"fixture.pal.c.name","text":"Fixture Pal C"},
    {"locale":"en-US","text_key":"fixture.passive.a.name","text":"Fixture Passive A"},
    {"locale":"en-US","text_key":"fixture.passive.a.description","text":"Fixture Passive Description"},
    {"locale":"en-US","text_key":"fixture.active.a.name","text":"Fixture Active A"},
    {"locale":"en-US","text_key":"fixture.partner.a.name","text":"Fixture Partner A"},
    {"locale":"en-US","text_key":"fixture.partner.a.description","text":"Fixture Partner Description"}
  ]'::jsonb
);

select is(
  public.finalize_catalog_import((select import_run_id from test_game_import)),
  (select version_id from test_game_import),
  'finalize atomically returns the staged exact version'
);

select is(
  (select status from public.game_data_versions where id = (select version_id from test_game_import)),
  'validated'::public.game_data_status,
  'a complete valid import becomes validated'
);

select is(
  (select rank from public.catalog_passive_skills
    where version_id = (select version_id from test_game_import)
      and passive_skill_id = 'fixture-passive-a'),
  -1,
  'negative passive ranks remain exact in the relational projection'
);

select results_eq(
  $$
    select parent_a_pal_id, parent_a_gender, parent_b_pal_id, parent_b_gender
      from public.catalog_breeding_recipes
     where version_id = (select version_id from test_game_import)
     order by parent_a_gender
  $$,
  $$ values
    ('fixture-pal-a'::text, 'female'::text, 'fixture-pal-b'::text, 'male'::text),
    ('fixture-pal-a'::text, 'male'::text, 'fixture-pal-b'::text, 'female'::text)
  $$,
  'gender-specific parent orientations remain distinct in relational projection'
);

select is(
  (select count(*)::integer from public.catalog_localizations where version_id = (select version_id from test_game_import)),
  8,
  'finalize writes the complete localization projection'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select throws_ok(
  format(
    'select public.publish_game_data_version(%L, %L)',
    '10000000-0000-4000-8000-000000000001',
    (select version_id from test_game_import)
  ),
  'P0001',
  'ADMIN_REQUIRED',
  'ordinary players cannot publish game data'
);

select throws_ok(
  format(
    'select public.rollback_game_data_version(%L, %L)',
    '10000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000001'
  ),
  'P0001',
  'ADMIN_REQUIRED',
  'ordinary players cannot roll back game data'
);

select throws_ok(
  $$
    select public.stage_catalog_batch(
      '70000000-0000-4000-8000-000000000099',
      'pals',
      'browser-batch',
      '[{"pal_id":"forbidden"}]'::jsonb
    )
  $$,
  '42501',
  null,
  'ordinary players cannot access staging RPCs'
);

select is_empty(
  $$
    select pal_id from public.catalog_pals
     where version_id = (select version_id from test_game_import)
  $$,
  'validated but unpublished projections are invisible to ordinary players'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select public.publish_game_data_version(
      '10000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'GAME_DATA_VERSION_NOT_VALIDATED',
  'an unvalidated version cannot be published'
);

select lives_ok(
  format(
    'select public.publish_game_data_version(%L, %L)',
    '10000000-0000-4000-8000-000000000001',
    (select version_id from test_game_import)
  ),
  'an administrator can publish a validated complete catalog'
);

select is(
  (select active_game_data_version_id from public.worlds where id = '10000000-0000-4000-8000-000000000001'),
  (select version_id from test_game_import),
  'publish atomically switches the requested world'
);

select is(
  (select active_game_data_version_id from public.worlds where id = '10000000-0000-4000-8000-000000000002'),
  '51000000-0000-4000-8000-000000000001'::uuid,
  'publish does not switch another world'
);

select is(
  (select count(*)::integer from public.search_catalog_pals(
    '10000000-0000-4000-8000-000000000001', 'Fixture Pal', 'en-US', 50
  )),
  3,
  'catalog search resolves only the current published world version'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select * from public.create_breeding_job(
  'fixture-pal-c',
  array['fixture-passive-a'],
  'balanced',
  'phase25-fixed-game-version'
);

select is(
  (select game_data_version_id from public.breeding_jobs where idempotency_key = 'phase25-fixed-game-version'),
  (select version_id from test_game_import),
  'new jobs fix the authoritative game data version in the creation transaction'
);

select is(
  (select game_data_version_id from public.breeding_jobs where id = '60000000-0000-4000-8000-000000000001'),
  '51000000-0000-4000-8000-000000000001'::uuid,
  'publishing a new version does not rewrite an old job'
);

select throws_ok(
  $$ update public.catalog_pals set rarity = 99 where pal_id = 'fixture-pal-a' $$,
  '42501',
  null,
  'authenticated users cannot directly modify catalog facts'
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
    select public.rollback_game_data_version(
      '10000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000001'
    )
  $$,
  'an administrator can roll back by switching pointers only'
);

select is(
  (select active_game_data_version_id from public.worlds where id = '10000000-0000-4000-8000-000000000001'),
  '51000000-0000-4000-8000-000000000001'::uuid,
  'rollback restores the prior exact pointer'
);

select ok(
  exists (
    select 1 from public.game_data_versions
     where id = (select version_id from test_game_import) and status = 'published'
  ),
  'rollback never deletes or demotes the newer published version'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select is(
  (
    select version_id from public.begin_game_data_import(
      null,
      jsonb_build_object(
        'schema_version', '1.0.0',
        'package_hash', repeat('b', 64),
        'content_hash', repeat('a', 64),
        'extractor_name', 'fixture-extractor',
        'extractor_version', '1.0.0',
        'counts', '{}'::jsonb,
        'files', '[]'::jsonb
      ),
      'game-catalog-artifacts',
      'versions/' || repeat('a', 64) || '/catalog.tar.gz'
    )
  ),
  (select version_id from test_game_import),
  'reimporting the same content hash reuses the immutable version'
);

create temporary table test_failed_import (
  version_id uuid not null,
  import_run_id uuid not null
) on commit drop;
grant select, insert on test_failed_import to service_role;

insert into test_failed_import (version_id, import_run_id)
select version_id, import_run_id
from public.begin_game_data_import(
  null,
  jsonb_build_object(
    'schema_version', '1.0.0',
    'package_hash', repeat('d', 64),
    'content_hash', repeat('7', 64),
    'extractor_name', 'fixture-extractor',
    'extractor_version', '1.0.0',
    'counts', jsonb_build_object(
      'pals', 1,
      'passive_skills', 1,
      'active_skills', 1,
      'pal_active_skills', 1,
      'partner_skills', 1,
      'breeding_recipes', 1,
      'localizations', 1
    ),
    'files', '[]'::jsonb
  ),
  'game-catalog-artifacts',
  'versions/' || repeat('7', 64) || '/catalog.tar.gz'
);

select public.stage_catalog_batch(
  (select import_run_id from test_failed_import),
  'pals',
  'pals:0',
  '[{"pal_id":"fixture-only","encyclopedia_no":1,"name_key":"fixture.only.name","element_types":["fixture"],"rarity":1,"breeding_power":1,"metadata":{}}]'::jsonb
);

select throws_ok(
  format(
    'select public.finalize_catalog_import(%L)',
    (select import_run_id from test_failed_import)
  ),
  'P0001',
  'GAME_DATA_IMPORT_COUNT_MISMATCH',
  'an incomplete import fails atomically'
);

select is(
  (select active_game_data_version_id from public.worlds where id = '10000000-0000-4000-8000-000000000001'),
  '51000000-0000-4000-8000-000000000001'::uuid,
  'a failed import never changes the active world version'
);

select * from finish();
rollback;
