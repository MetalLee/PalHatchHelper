begin;
set local search_path = public, extensions;

select plan(36);

select has_function(
  'public',
  'list_available_pals_page',
  array[
    'text', 'text', 'text', 'pal_gender', 'text', 'pal_location_type',
    'boolean', 'uuid', 'uuid', 'text', 'text', 'integer'
  ],
  'Phase 5 exposes a snapshot-bound browser-safe inventory projection'
);
select has_function(
  'public',
  'get_inventory_data_status',
  array[]::text[],
  'Phase 5 exposes a safe inventory and game-data status projection'
);
select has_function(
  'public',
  'set_pal_share_enabled_for_web',
  array['text', 'boolean'],
  'Phase 5 exposes a structured ownership-checked sharing mutation'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select is(
  jsonb_array_length(public.list_available_pals_page('all')->'data'->'items'),
  3,
  'all returns own inventory plus same-guild shared inventory'
);
select is(
  jsonb_array_length(public.list_available_pals_page('mine')->'data'->'items'),
  2,
  'mine returns only the requester inventory'
);
select is(
  jsonb_array_length(public.list_available_pals_page('shared')->'data'->'items'),
  1,
  'shared returns only same-guild opted-in inventory'
);
select is(
  jsonb_array_length(
    public.list_available_pals_page(
      p_scope => 'all',
      p_owner_filter_key => (
        select item->>'owner_filter_key'
          from jsonb_array_elements(
            public.list_available_pals_page('shared')->'data'->'items'
          ) as item
         limit 1
      )
    )->'data'->'items'
  ),
  1,
  'opaque owner filtering stays within the safe candidate pool'
);
select is(
  jsonb_array_length(
    public.list_available_pals_page(p_scope => 'all', p_gender => 'female')->'data'->'items'
  ),
  2,
  'gender filtering is supported'
);
select is(
  jsonb_array_length(
    public.list_available_pals_page(
      p_scope => 'all', p_passive_skill_id => 'test_passive_a'
    )->'data'->'items'
  ),
  2,
  'passive filtering is supported'
);
select is(
  jsonb_array_length(
    public.list_available_pals_page(p_scope => 'all', p_location_type => 'base')->'data'->'items'
  ),
  2,
  'location filtering is supported'
);
select is(
  jsonb_array_length(
    public.list_available_pals_page(p_scope => 'all', p_query => 'PARENT_B')->'data'->'items'
  ),
  1,
  'stable ID filtering is case-insensitive'
);
select is(
  jsonb_array_length(
    public.list_available_pals_page(p_scope => 'all', p_query => '棉')->'data'->'items'
  ),
  2,
  'a localized partial-name query returns every matching Pal instead of one hard-coded ID'
);
select is(
  public.list_available_pals_page(p_scope => 'all', p_query => '棉悠悠')
    #>> '{data,items,0,pal_id}',
  'test_parent_a',
  'Chinese localized names are searchable on the active catalog version'
);
select is(
  public.list_available_pals_page(p_scope => 'all', p_query => '2')
    #>> '{data,items,0,pal_id}',
  'test_parent_b',
  'encyclopedia number search resolves through the active catalog version'
);
select results_eq(
  $$
    select
      item->>'pal_display_name',
      item->>'encyclopedia_no',
      item->'passive_display_names'
    from jsonb_array_elements(
      public.list_available_pals_page(p_scope => 'mine', p_query => '棉悠悠')
        ->'data'->'items'
    ) as item
  $$,
  $$ values ('棉悠悠'::text, '1'::text, '["认真"]'::jsonb) $$,
  'display name, encyclopedia number and passive names come from the fixed catalog'
);
select results_eq(
  $$
    select
      public.list_available_pals_page('all') #>> '{data,catalog_state}',
      public.list_available_pals_page('all') #>> '{data,game_data_version_id}'
  $$,
  $$ values (
    'published'::text,
    '51000000-0000-4000-8000-000000000001'::text
  ) $$,
  'inventory responses identify the published catalog version used for display and search'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
insert into public.pal_snapshot_items (
  id, snapshot_id, world_id, pal_instance_uid, pal_id, owner_player_id,
  guild_id, gender, level, passive_skill_ids, location_type, location_name,
  raw_metadata
) values (
  '41000000-0000-4000-8000-000000000088',
  '40000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'fixture-pal-unknown-001',
  'unknown_pal',
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'unknown',
  1,
  array['unknown_passive'],
  'unknown',
  null,
  '{"fixture":true}'
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
      item->>'pal_display_name',
      item->>'catalog_entry_state',
      item->'unknown_passive_skill_ids'
    from jsonb_array_elements(
      public.list_available_pals_page(p_scope => 'mine', p_query => 'unknown_pal')
        ->'data'->'items'
    ) as item
  $$,
  $$ values (
    'unknown_pal'::text,
    'unknown'::text,
    '["unknown_passive"]'::jsonb
  ) $$,
  'unknown Pal and passive IDs remain visible but are explicitly marked unresolved'
);
select is(
  public.list_available_pals_page(p_scope => 'mine', p_query => 'unknown_pal')
    #>> '{data,items,0,encyclopedia_no}',
  null,
  'unknown catalog IDs never receive a fabricated encyclopedia number'
);
select is(
  public.list_available_pals_page(p_scope => 'all', p_page_size => 1)
    #>> '{data,items,0,pal_instance_uid}',
  'fixture-pal-a-owned-002',
  'the first page uses a stable pal ID and instance UID order'
);
select ok(
  not exists (
    select 1
      from jsonb_array_elements(
        public.list_available_pals_page('shared')->'data'->'items'
      ) as item
     where item ?| array['owner_player_id', 'guild_id', 'snapshot_id']
  ),
  'shared rows exclude internal owner, guild and per-row snapshot UUIDs'
);
select is(
  public.list_available_pals_page(p_page_size => 51)->>'error_code',
  'INVALID_PAGINATION',
  'invalid pagination is rejected with a structured stable code'
);
select is(
  public.get_inventory_data_status() #>> '{data,state}',
  'stale',
  'old synthetic inventory is reported as stale'
);
select is(
  public.get_inventory_data_status() #>> '{data,game_data_state}',
  'review_pending',
  'a newer validated catalog is reported as pending review'
);
select is(
  public.get_inventory_data_status() #>> '{data,algorithm_version}',
  'phase4b-deterministic-v1',
  'the safe status includes the configured deterministic algorithm version'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

insert into public.inventory_snapshots (
  id, world_id, source_save_hash, source_modified_at, parser_name,
  parser_version, status, captured_at, parsed_at
) values (
  '40000000-0000-4000-8000-000000000088',
  '10000000-0000-4000-8000-000000000001',
  repeat('8', 64), now(), 'fixture-parser', '1.0.0', 'published', now(), now()
);
update public.worlds
   set latest_snapshot_id = '40000000-0000-4000-8000-000000000088'
 where id = '10000000-0000-4000-8000-000000000001';

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select is(
  public.list_available_pals_page(
    p_scope => 'all',
    p_snapshot_id => '40000000-0000-4000-8000-000000000002',
    p_game_data_version_id => '51000000-0000-4000-8000-000000000001',
    p_after_pal_id => 'test_child_pal',
    p_after_instance_uid => 'fixture-pal-a-owned-002',
    p_page_size => 1
  )->>'error_code',
  'INVENTORY_SNAPSHOT_CHANGED',
  'a cursor cannot silently continue after the latest inventory snapshot changes'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
update public.worlds
   set latest_snapshot_id = '40000000-0000-4000-8000-000000000002'
 where id = '10000000-0000-4000-8000-000000000001';

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000005"}',
  true
);
set local role authenticated;

select is(
  public.list_available_pals_page('all')->>'error_code',
  'PLAYER_BINDING_REQUIRED',
  'an unbound account gets a structured binding error'
);
select is(
  public.get_inventory_data_status()->>'error_code',
  'PLAYER_BINDING_REQUIRED',
  'status queries do not turn binding failures into empty data'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

insert into public.inventory_snapshots (
  id, world_id, source_save_hash, source_modified_at, parser_name,
  parser_version, status, captured_at, error_code, error_summary
) values (
  '40000000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000001',
  repeat('f', 64), now(), 'fixture-parser', '1.0.0', 'failed', now(),
  'PARSER_INVALID_JSON', 'synthetic safe summary'
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
      public.get_inventory_data_status() #>> '{data,state}',
      public.get_inventory_data_status() #>> '{data,error_code}',
      (public.get_inventory_data_status() #>> '{data,using_previous_snapshot}')::boolean
  $$,
  $$ values ('parse_error'::text, 'PARSER_INVALID_JSON'::text, true) $$,
  'a newer parse failure reports the retained previous inventory without a stack or path'
);
select is(
  public.set_pal_share_enabled_for_web('fixture-pal-a-owned-001', false)
    #>> '{data,share_enabled}',
  'false',
  'the structured sharing RPC preserves the ownership-checked mutation'
);

reset role;
update public.game_data_versions
   set status = 'rejected', validated_at = null
 where id = '51000000-0000-4000-8000-000000000002';

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;
select is(
  public.get_inventory_data_status() #>> '{data,game_data_state}',
  'blocked',
  'a newer rejected catalog is reported as blocked'
);

reset role;
update public.game_data_versions
   set status = 'validated',
       validated_at = '2026-07-13T07:30:00Z',
       imported_at = '2026-07-13T06:00:00Z'
 where id = '51000000-0000-4000-8000-000000000002';

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;
select is(
  public.get_inventory_data_status() #>> '{data,game_data_state}',
  'published',
  'an active catalog without a newer candidate is reported as published'
);

reset role;
update public.worlds
   set active_breeding_version_id = null, active_game_data_version_id = null
 where id = '10000000-0000-4000-8000-000000000001';

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;
select is(
  public.get_inventory_data_status() #>> '{data,game_data_state}',
  'not_configured',
  'a world without an active catalog is reported as not configured'
);
select is(
  public.list_available_pals_page('all') #>> '{data,catalog_state}',
  'not_configured',
  'inventory remains available but explicitly marks an unconfigured catalog'
);

reset role;
insert into public.breeding_data_versions (
  id, source_id, external_version, content_hash, status, validation_report,
  imported_at
) values (
  '51000000-0000-4000-8000-000000000088',
  '50000000-0000-4000-8000-000000000001',
  'fixture-switched-v88', repeat('8', 64), 'validated', '{"valid":true}',
  '2026-07-15T03:00:00Z'
);
insert into public.catalog_pals (
  version_id, pal_id, encyclopedia_no, name_key, element_types, rarity,
  breeding_power, metadata
) values
  (
    '51000000-0000-4000-8000-000000000088', 'test_parent_a', 101,
    'fixture.v88.test_parent_a.name', array['fixture-neutral'], 1, 100,
    '{"fixture":true}'
  ),
  (
    '51000000-0000-4000-8000-000000000088', 'test_parent_b', 102,
    'fixture.v88.test_parent_b.name', array['fixture-neutral'], 1, 100,
    '{"fixture":true}'
  ),
  (
    '51000000-0000-4000-8000-000000000088', 'test_child_pal', 103,
    'fixture.v88.test_child_pal.name', array['fixture-neutral'], 1, 100,
    '{"fixture":true}'
  );
insert into public.catalog_passive_skills (
  version_id, passive_skill_id, name_key, description_key, rank, is_negative,
  metadata
) values
  (
    '51000000-0000-4000-8000-000000000088', 'test_passive_a',
    'fixture.v88.passive.a', null, 1, false, '{"fixture":true}'
  ),
  (
    '51000000-0000-4000-8000-000000000088', 'test_passive_b',
    'fixture.v88.passive.b', null, 1, false, '{"fixture":true}'
  );
insert into public.catalog_localizations (version_id, locale, text_key, text)
values
  (
    '51000000-0000-4000-8000-000000000088', 'zh-CN',
    'fixture.v88.test_parent_a.name', '版本二棉悠悠'
  ),
  (
    '51000000-0000-4000-8000-000000000088', 'zh-CN',
    'fixture.v88.test_parent_b.name', '版本二棉绒兽'
  ),
  (
    '51000000-0000-4000-8000-000000000088', 'zh-CN',
    'fixture.v88.test_child_pal.name', '版本二幻色幼崽'
  ),
  (
    '51000000-0000-4000-8000-000000000088', 'zh-CN',
    'fixture.v88.passive.a', '版本二认真'
  ),
  (
    '51000000-0000-4000-8000-000000000088', 'zh-CN',
    'fixture.v88.passive.b', '版本二工匠精神'
  );
update public.breeding_data_versions
   set status = 'published',
       published_at = '2026-07-15T03:01:00Z',
       published_by = '00000000-0000-4000-8000-000000000001'
 where id = '51000000-0000-4000-8000-000000000088';
update public.worlds
   set active_breeding_version_id = '51000000-0000-4000-8000-000000000088',
       active_game_data_version_id = '51000000-0000-4000-8000-000000000088'
 where id = '10000000-0000-4000-8000-000000000001';

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;
select is(
  public.get_inventory_data_status() #>> '{data,game_data_version_id}',
  '51000000-0000-4000-8000-000000000088',
  'switching the world catalog changes the safe active-version summary'
);
select is(
  public.list_available_pals_page(p_scope => 'mine', p_query => '版本二棉悠悠')
    #>> '{data,items,0,pal_display_name}',
  '版本二棉悠悠',
  'switching catalog versions changes inventory names without a Web fixture fallback'
);
select is(
  public.list_available_pals_page(
    p_scope => 'all',
    p_snapshot_id => '40000000-0000-4000-8000-000000000002',
    p_game_data_version_id => '51000000-0000-4000-8000-000000000001',
    p_after_pal_id => 'test_child_pal',
    p_after_instance_uid => 'fixture-pal-a-owned-002',
    p_page_size => 1
  )->>'error_code',
  'GAME_DATA_VERSION_CHANGED',
  'a cursor cannot continue with display and filter facts from a different catalog version'
);

select * from finish();
rollback;
