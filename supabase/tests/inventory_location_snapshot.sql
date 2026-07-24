begin;
set local search_path = public, extensions;

select plan(15);

select ok(
  'dimensional_storage' = any(enum_range(null::public.pal_location_type)::text[]),
  'inventory locations include dimensional storage'
);

select has_column(
  'public',
  'pal_snapshot_items',
  'is_boss',
  'snapshot rows preserve the boss flag'
);

select has_column(
  'public',
  'pal_snapshot_items',
  'location_id',
  'snapshot rows preserve a stable logical location id'
);

select has_column(
  'public',
  'pal_snapshot_items',
  'location_slot_index',
  'snapshot rows preserve the zero-based absolute slot'
);

select has_column(
  'public',
  'pal_snapshot_items',
  'location_access_scope',
  'snapshot rows preserve independently resolved access scope'
);

select ok(
  position(
    'palhatch.source_metadata' in pg_get_functiondef(
      'public.publish_inventory_snapshot(uuid,jsonb)'::regprocedure
    )
  ) = 0,
  'snapshot publishing does not copy all Pal metadata through a transaction GUC'
);

select ok(
  position(
    'current_setting' in pg_get_functiondef(
      'private.attach_pal_snapshot_source_metadata()'::regprocedure
    )
  ) = 0,
  'per-row snapshot inserts do not repeatedly decode transaction-wide metadata'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

create temporary table published_location_snapshot as
select public.publish_inventory_snapshot(
  '10000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'source_save_hash',
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    'source_modified_at', '2026-07-24T12:00:00Z',
    'save_version', 'fixture-location-v1',
    'captured_at', '2026-07-24T12:00:00Z',
    'parser_name', 'palhatch-plm-save-parser',
    'parser_version', '1.1.0',
    'server', jsonb_build_object('world_uid', 'fixture-world-local'),
    'guilds', jsonb_build_array(
      jsonb_build_object(
        'guild_uid', 'fixture-guild-alpha',
        'name', 'Fixture Guild Alpha'
      )
    ),
    'players', jsonb_build_array(
      jsonb_build_object(
        'player_uid', 'fixture-player-a-uid',
        'nickname', 'Fixture Player A',
        'level', 35,
        'guild_uid', 'fixture-guild-alpha'
      ),
      jsonb_build_object(
        'player_uid', 'fixture-player-b-uid',
        'nickname', 'Fixture Player B',
        'level', 32,
        'guild_uid', 'fixture-guild-alpha'
      )
    ),
    'pals', jsonb_build_array(
      jsonb_build_object(
        'instance_uid', 'fixture-dps-shared-001',
        'owner_player_uid', 'fixture-player-b-uid',
        'guild_uid', 'fixture-guild-alpha',
        'pal_id', 'dps_shared_fixture',
        'is_boss', false,
        'gender', 'female',
        'level', 30,
        'passive_skill_ids', '[]'::jsonb,
        'location_type', 'dimensional_storage',
        'location_name', 'Fixture Player B',
        'location_id', 'dimensional-storage:fixture-player-b-uid',
        'location_slot_index', 64,
        'location_access_scope', 'guild',
        'ownership_scope', 'player',
        'owner_resolved', true,
        'guild_resolved', true,
        'shared_eligible', true,
        'warning_codes', '[]'::jsonb,
        'metadata', jsonb_build_object(
          'source_internal_name', 'DpsSharedFixture',
          'source_passive_skill_internal_names', '[]'::jsonb
        )
      ),
      jsonb_build_object(
        'instance_uid', 'fixture-dps-unresolved-001',
        'owner_player_uid', 'fixture-player-b-uid',
        'guild_uid', 'fixture-guild-alpha',
        'pal_id', 'dps_unresolved_fixture',
        'is_boss', false,
        'gender', 'male',
        'level', 30,
        'passive_skill_ids', '[]'::jsonb,
        'location_type', 'dimensional_storage',
        'location_name', 'Fixture Player B',
        'location_id', 'dimensional-storage:fixture-player-b-uid',
        'location_slot_index', 95,
        'location_access_scope', 'unresolved',
        'ownership_scope', 'player',
        'owner_resolved', true,
        'guild_resolved', true,
        'shared_eligible', false,
        'warning_codes', '["LOCATION_ACCESS_UNRESOLVED"]'::jsonb,
        'metadata', jsonb_build_object(
          'source_internal_name', 'DpsUnresolvedFixture',
          'source_passive_skill_internal_names', '[]'::jsonb
        )
      ),
      jsonb_build_object(
        'instance_uid', 'fixture-boss-storage-001',
        'owner_player_uid', 'fixture-player-a-uid',
        'guild_uid', 'fixture-guild-alpha',
        'pal_id', 'anubis',
        'is_boss', true,
        'gender', 'male',
        'level', 42,
        'passive_skill_ids', '[]'::jsonb,
        'location_type', 'player_storage',
        'location_name', 'Fixture Player A',
        'location_id', null,
        'location_slot_index', 64,
        'location_access_scope', 'player',
        'ownership_scope', 'player',
        'owner_resolved', true,
        'guild_resolved', true,
        'shared_eligible', true,
        'warning_codes', '[]'::jsonb,
        'metadata', jsonb_build_object(
          'source_internal_name', 'BOSS_Anubis',
          'source_passive_skill_internal_names', '[]'::jsonb
        )
      )
    ),
    'warnings', '[]'::jsonb
  )
) as snapshot_id;

select results_eq(
  $$
    select
      item.is_boss,
      item.location_type::text,
      item.location_id,
      item.location_slot_index,
      item.location_access_scope
    from public.pal_snapshot_items as item
    where item.pal_instance_uid = 'fixture-dps-shared-001'
  $$,
  $$ values (
    false,
    'dimensional_storage'::text,
    'dimensional-storage:fixture-player-b-uid'::text,
    64,
    'guild'::text
  ) $$,
  'publish persists boss and precise dimensional-storage location facts'
);

select is(
  (
    select is_boss
    from public.pal_snapshot_items
    where pal_instance_uid = 'fixture-boss-storage-001'
  ),
  true,
  'publish persists an explicit boss marker after species normalization'
);

select is(
  (
    select raw_metadata ->> 'source_internal_name'
    from public.pal_snapshot_items
    where pal_instance_uid = 'fixture-boss-storage-001'
  ),
  'BOSS_Anubis',
  'publish retains the audited source name without duplicating location facts'
);

select is(
  (
    select raw_metadata ->> 'shared_eligible'
    from public.pal_snapshot_items
    where pal_instance_uid = 'fixture-dps-unresolved-001'
  ),
  'false',
  'unresolved dimensional access remains ineligible for sharing'
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
      item->>'is_boss',
      item->>'location_type',
      item->>'location_id',
      item->>'location_slot_index',
      item->>'location_access_scope'
    from jsonb_array_elements(
      public.list_available_pals_page_v2(
        p_scope => 'shared',
        p_query => 'dps_shared_fixture'
      )->'data'->'items'
    ) as item
  $$,
  $$ values (
    'false'::text,
    'dimensional_storage'::text,
    'dimensional-storage:fixture-player-b-uid'::text,
    '64'::text,
    'guild'::text
  ) $$,
  'same-guild dimensional inventory exposes its logical storage and page slot'
);

select is(
  jsonb_array_length(
    public.list_available_pals_page_v2(
      p_scope => 'shared',
      p_query => 'dps_unresolved_fixture'
    )->'data'->'items'
  ),
  0,
  'unresolved dimensional storage is absent from shared inventory'
);

select results_eq(
  $$
    select
      item->>'is_boss',
      item->>'location_slot_index',
      item->>'location_access_scope'
    from jsonb_array_elements(
      public.list_available_pals_page_v2(
        p_scope => 'mine',
        p_query => 'anubis'
      )->'data'->'items'
    ) as item
  $$,
  $$ values ('true'::text, '64'::text, 'player'::text) $$,
  'personal inventory exposes the boss marker and absolute storage slot'
);

select ok(
  public.list_available_pals_page_v2(p_scope => 'all')
    #> '{data,filter_options,locations}'
    @> '["dimensional_storage"]'::jsonb,
  'location facets include dimensional storage'
);

select * from finish();
rollback;
