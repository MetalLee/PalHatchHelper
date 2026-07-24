begin;
set local search_path = public, extensions;

select plan(10);

select has_column(
  'public',
  'pal_snapshot_items',
  'ownership_scope',
  'inventory facts distinguish player, guild and unresolved ownership'
);

select is(
  private.breeding_parent_view(jsonb_build_object(
    'source_type', 'inventory',
    'pal_id', 'guild_owned_fixture',
    'instance_uid', 'fixture-guild-owned-pal-001',
    'owner_player_id', null,
    'guild_id', '20000000-0000-4000-8000-000000000001',
    'gender', 'female',
    'passive_skill_ids', '[]'::jsonb,
    'required_passive_ids', '[]'::jsonb,
    'borrowed', true,
    'produced_by_step_index', null,
    'location_type', 'base',
    'location_name', 'Fixture Base Alpha'
  )) ->> 'owner_display_name',
  'Fixture Guild Alpha',
  'route parent projections use the guild name for guild-owned inventory'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

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
) values
  (
    '41000000-0000-4000-8000-000000000089',
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'fixture-guild-owned-pal-001',
    'guild_owned_fixture',
    null,
    '20000000-0000-4000-8000-000000000001',
    'female',
    30,
    array['test_passive_b'],
    'base',
    'Fixture Base Alpha',
    '{"resolution_status":"resolved","shared_eligible":true,"warning_codes":[]}'
  ),
  (
    '41000000-0000-4000-8000-000000000090',
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'fixture-other-guild-owned-pal-001',
    'other_guild_owned_fixture',
    null,
    '20000000-0000-4000-8000-000000000002',
    'male',
    30,
    array[]::text[],
    'base',
    'Fixture Base Beta',
    '{"resolution_status":"resolved","shared_eligible":true,"warning_codes":[]}'
  );

select is(
  (
    select ownership_scope
    from public.pal_snapshot_items
    where pal_instance_uid = 'fixture-guild-owned-pal-001'
  ),
  'guild',
  'ownerless base inventory with a resolved guild is stored as guild owned'
);

select is(
  (
    select raw_metadata ->> 'resolution_status'
    from public.pal_snapshot_items
    where pal_instance_uid = 'fixture-guild-owned-pal-001'
  ),
  'resolved',
  'guild-owned inventory remains a resolved snapshot fact'
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
    select
      item->>'owner_display_name',
      item->>'ownership_scope',
      item->>'share_enabled',
      item->>'is_owned_by_requester'
    from jsonb_array_elements(
      public.list_available_pals_page_v2(
        p_scope => 'shared',
        p_query => 'guild_owned_fixture'
      )->'data'->'items'
    ) as item
  $$,
  $$ values ('Fixture Guild Alpha'::text, 'guild'::text, 'true'::text, 'false'::text) $$,
  'same-guild base inventory is listed with the guild name as owner'
);

select is(
  jsonb_array_length(
    public.list_available_pals_page_v2(
      p_scope => 'mine',
      p_query => 'guild_owned_fixture'
    )->'data'->'items'
  ),
  0,
  'guild-owned inventory is not presented as personal inventory'
);

select is(
  jsonb_array_length(
    public.list_available_pals_page_v2(
      p_scope => 'shared',
      p_query => 'other_guild_owned_fixture'
    )->'data'->'items'
  ),
  0,
  'other-guild base inventory remains isolated'
);

select ok(
  public.list_available_pals_page_v2(p_scope => 'shared')
    #> '{data,filter_options,owners}'
    @> '[{"label":"Fixture Guild Alpha"}]'::jsonb,
  'owner facets include the guild display name'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

select results_eq(
  $$
    select
      item->>'ownership_scope',
      item->>'owner_resolved',
      item->>'guild_resolved',
      item->>'share_enabled'
    from jsonb_array_elements(
      public.get_breeding_inventory_for_agent(
        '60000000-0000-4000-8000-000000000001'
      )->'items'
    ) as item
    where item->>'instance_uid' = 'fixture-guild-owned-pal-001'
  $$,
  $$ values ('guild'::text, 'true'::text, 'true'::text, 'true'::text) $$,
  'breeding runtime facts retain resolved guild-owned inventory'
);

select ok(
  not exists (
    select 1
    from jsonb_array_elements(
      public.get_breeding_inventory_for_agent(
        '60000000-0000-4000-8000-000000000001'
      )->'items'
    ) as item
    where item->>'instance_uid' = 'fixture-other-guild-owned-pal-001'
      and item->>'guild_id' = '20000000-0000-4000-8000-000000000001'
  ),
  'breeding facts never rewrite another guild as the requester guild'
);

select * from finish();
rollback;
