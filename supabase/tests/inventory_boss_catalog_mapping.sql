begin;
set local search_path = public, extensions;

select plan(2);

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
  raw_metadata
) values (
  '41000000-0000-4000-8000-000000000087',
  '40000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'fixture-pal-boss-001',
  'boss_test_parent_a',
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'male',
  25,
  array['test_passive_a'],
  'player_storage',
  'Fixture Boss Storage',
  '{"fixture":true}'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select results_eq(
  $$
    select
      item->>'pal_id',
      item->>'pal_display_name',
      item->>'encyclopedia_no',
      item->>'catalog_entry_state'
    from jsonb_array_elements(
      public.list_available_pals_page(
        p_scope => 'mine',
        p_query => 'boss_test_parent_a'
      )->'data'->'items'
    ) as item
  $$,
  $$ values (
    'boss_test_parent_a'::text,
    '棉悠悠'::text,
    '1'::text,
    'resolved'::text
  ) $$,
  'boss-prefixed inventory IDs resolve through their base catalog Pal ID'
);

select results_eq(
  $$
    select
      item->>'pal_id',
      item->>'pal_display_name',
      item->>'encyclopedia_no',
      item->>'catalog_entry_state'
    from jsonb_array_elements(
      public.list_available_pals_page_v2(
        p_scope => 'mine',
        p_query => 'boss_test_parent_a'
      )->'data'->'items'
    ) as item
  $$,
  $$ values (
    'boss_test_parent_a'::text,
    '棉悠悠'::text,
    '1'::text,
    'resolved'::text
  ) $$,
  'V2 inventory pages preserve boss-prefixed catalog mapping'
);

select * from finish();
rollback;
