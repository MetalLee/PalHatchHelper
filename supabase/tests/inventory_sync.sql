begin;
set local search_path = public, extensions;

select plan(39);

select has_function(
  'public',
  'publish_inventory_snapshot',
  array['uuid', 'jsonb'],
  'atomic inventory publication RPC exists'
);
select has_function(
  'public',
  'get_inventory_catalog_ids_for_agent',
  array['uuid'],
  'Agent catalog validation lookup RPC exists'
);
select has_function(
  'public',
  'get_latest_inventory_snapshot_for_agent',
  array['uuid'],
  'Agent latest inventory summary RPC exists'
);
select has_function(
  'public',
  'record_inventory_snapshot_failure',
  array['uuid', 'jsonb'],
  'Agent inventory failure metadata RPC exists'
);

select ok(
  not has_function_privilege('anon', 'public.publish_inventory_snapshot(uuid, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.get_latest_inventory_snapshot_for_agent(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.get_inventory_catalog_ids_for_agent(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.record_inventory_snapshot_failure(uuid, jsonb)', 'execute'),
  'anon cannot execute Agent inventory RPCs'
);
select ok(
  not has_function_privilege('authenticated', 'public.publish_inventory_snapshot(uuid, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_latest_inventory_snapshot_for_agent(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_inventory_catalog_ids_for_agent(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.record_inventory_snapshot_failure(uuid, jsonb)', 'execute'),
  'authenticated users cannot execute Agent inventory RPCs'
);

set local role service_role;

select throws_ok(
  $$ select public.get_latest_inventory_snapshot_for_agent('10000000-0000-4000-8000-000000000001') $$,
  'P0001',
  'SERVICE_ROLE_REQUIRED',
  'latest inventory RPC requires a service-role JWT in addition to ACL'
);
select throws_ok(
  $$ select public.get_inventory_catalog_ids_for_agent('10000000-0000-4000-8000-000000000001') $$,
  'P0001',
  'SERVICE_ROLE_REQUIRED',
  'catalog inventory RPC requires a service-role JWT in addition to ACL'
);
select throws_ok(
  $$ select public.publish_inventory_snapshot(null, null) $$,
  'P0001',
  'SERVICE_ROLE_REQUIRED',
  'inventory publication RPC requires a service-role JWT in addition to ACL'
);
select throws_ok(
  $$ select public.record_inventory_snapshot_failure(null, null) $$,
  'P0001',
  'SERVICE_ROLE_REQUIRED',
  'inventory failure RPC requires a service-role JWT in addition to ACL'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select ok(
  jsonb_typeof(public.get_inventory_catalog_ids_for_agent(
    '10000000-0000-4000-8000-000000000001'
  ) -> 'pal_ids') = 'array'
  and jsonb_typeof(public.get_inventory_catalog_ids_for_agent(
    '10000000-0000-4000-8000-000000000001'
  ) -> 'passive_skill_ids') = 'array',
  'catalog lookup returns only normalized identifier arrays'
);

select ok(
  public.get_inventory_catalog_ids_for_agent(
    '10000000-0000-4000-8000-000000000001'
  ) -> 'pal_ids' @> '["fixtureinventoryonly"]'::jsonb,
  'catalog lookup recognizes inventory-only game characters from versioned localization facts'
);

create temporary table published_snapshot_ids (
  name text primary key,
  snapshot_id uuid not null
) on commit drop;
grant select, insert on published_snapshot_ids to service_role;

insert into published_snapshot_ids (name, snapshot_id)
select
  'first',
  public.publish_inventory_snapshot(
    '10000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'source_save_hash', repeat('c', 64),
      'source_modified_at', '2026-07-14T03:00:00Z',
      'save_version', 'fixture-save-v2',
      'captured_at', '2026-07-14T03:00:00Z',
      'parser_name', 'fixture-parser',
      'parser_version', '2.0.0',
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
          'level', 36,
          'guild_uid', 'fixture-guild-alpha'
        )
      ),
      'pals', jsonb_build_array(
        jsonb_build_object(
          'instance_uid', 'phase3-pal-001',
          'owner_player_uid', 'fixture-player-a-uid',
          'guild_uid', 'fixture-guild-alpha',
          'pal_id', 'FuturePal',
          'gender', 'unknown',
          'level', 1,
          'passive_skill_ids', jsonb_build_array('FuturePassive'),
          'location_type', 'unknown',
          'location_name', null,
          'owner_resolved', true,
          'guild_resolved', true,
          'shared_eligible', true,
          'warning_codes', jsonb_build_array('UNKNOWN_PAL', 'UNKNOWN_PASSIVE'),
          'metadata', jsonb_build_object(
            'source_internal_name', 'FuturePal',
            'source_passive_skill_internal_names', jsonb_build_array('FuturePassive')
          )
        )
      ),
      'warnings', jsonb_build_array()
    )
  );

select is(
  (select status::text from public.inventory_snapshots where id = (
    select snapshot_id from published_snapshot_ids where name = 'first'
  )),
  'published',
  'RPC inserts a complete immutable published snapshot'
);
select is(
  (select latest_snapshot_id from public.worlds where id = '10000000-0000-4000-8000-000000000001'),
  (select snapshot_id from published_snapshot_ids where name = 'first'),
  'RPC switches latest only after all normalized rows are inserted'
);
select lives_ok(
  $$
    select public.record_inventory_snapshot_failure(
      '10000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'source_save_hash', repeat('e', 64),
        'source_modified_at', '2026-07-14T03:01:00Z',
        'captured_at', '2026-07-14T03:01:00Z',
        'parser_name', 'fixture-parser',
        'parser_version', '2.0.0',
        'status', 'failed',
        'error_code', 'PARSER_OUTPUT_INVALID',
        'error_summary', 'Fixture parser output was invalid.'
      )
    )
  $$,
  'failure metadata can be recorded without publishing inventory'
);
select is(
  (
    select concat_ws('|', status::text, error_code)
    from public.inventory_snapshots
    where world_id = '10000000-0000-4000-8000-000000000001'
      and source_save_hash = repeat('e', 64)
  ),
  'failed|PARSER_OUTPUT_INVALID',
  'failure metadata uses a stable status and error code'
);
select is(
  (select latest_snapshot_id from public.worlds where id = '10000000-0000-4000-8000-000000000001'),
  (select snapshot_id from published_snapshot_ids where name = 'first'),
  'recording failure metadata never changes latest inventory'
);
select is(
  (select raw_metadata ->> 'resolution_status' from public.pal_snapshot_items where pal_instance_uid = 'phase3-pal-001'),
  'resolved',
  'published Pal metadata contains only filtered resolution data'
);
select is(
  (
    select raw_metadata -> 'source_passive_skill_internal_names'
    from public.pal_snapshot_items
    where pal_instance_uid = 'phase3-pal-001'
  ),
  '["FuturePassive"]'::jsonb,
  'stable-ID source metadata is preserved through an audited filtered field set'
);
select is(
  public.publish_inventory_snapshot(
    '10000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'source_save_hash', repeat('c', 64),
      'source_modified_at', '2026-07-14T03:00:00Z',
      'save_version', 'fixture-save-v2',
      'captured_at', '2026-07-14T03:00:00Z',
      'parser_name', 'fixture-parser',
      'parser_version', '2.0.0',
      'server', jsonb_build_object('world_uid', 'fixture-world-local'),
      'guilds', '[]'::jsonb,
      'players', '[]'::jsonb,
      'pals', '[]'::jsonb,
      'warnings', '[]'::jsonb
    )
  ),
  (select snapshot_id from published_snapshot_ids where name = 'first'),
  'same successful source hash is idempotently skipped'
);
select is(
  (select count(*)::integer from public.inventory_snapshots where world_id = '10000000-0000-4000-8000-000000000001' and source_save_hash = repeat('c', 64)),
  1,
  'duplicate publication does not create another snapshot row'
);
select is(
  (
    select concat_ws('|', parser_name, parser_version)
    from jsonb_to_record(public.get_latest_inventory_snapshot_for_agent(
      '10000000-0000-4000-8000-000000000001'
    )) as latest(
      snapshot_id uuid,
      source_save_hash text,
      pal_count integer,
      parser_name text,
      parser_version text
    )
  ),
  'fixture-parser|2.0.0',
  'latest inventory summary includes the parser identity'
);
insert into published_snapshot_ids (name, snapshot_id)
select
  'parser-upgrade',
  public.publish_inventory_snapshot(
    '10000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'source_save_hash', repeat('c', 64),
      'source_modified_at', '2026-07-14T03:00:00Z',
      'save_version', 'fixture-save-v2',
      'captured_at', '2026-07-14T03:00:00Z',
      'parser_name', 'fixture-parser',
      'parser_version', '2.0.1',
      'server', jsonb_build_object('world_uid', 'fixture-world-local'),
      'guilds', '[]'::jsonb,
      'players', '[]'::jsonb,
      'pals', '[]'::jsonb,
      'warnings', '[]'::jsonb
    )
  );
select isnt(
  (select snapshot_id from published_snapshot_ids where name = 'parser-upgrade'),
  (select snapshot_id from published_snapshot_ids where name = 'first'),
  'a new parser version can publish the same immutable source bytes as a new snapshot'
);
select is(
  (
    select count(*)::integer
    from public.inventory_snapshots
    where world_id = '10000000-0000-4000-8000-000000000001'
      and source_save_hash = repeat('c', 64)
  ),
  2,
  'successful snapshot identity includes parser name and version'
);
select is(
  public.publish_inventory_snapshot(
    '10000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'source_save_hash', repeat('c', 64),
      'source_modified_at', '2026-07-14T03:00:00Z',
      'save_version', 'fixture-save-v2',
      'captured_at', '2026-07-14T03:00:00Z',
      'parser_name', 'fixture-parser',
      'parser_version', '2.0.1',
      'server', jsonb_build_object('world_uid', 'fixture-world-local'),
      'guilds', '[]'::jsonb,
      'players', '[]'::jsonb,
      'pals', '[]'::jsonb,
      'warnings', '[]'::jsonb
    )
  ),
  (select snapshot_id from published_snapshot_ids where name = 'parser-upgrade'),
  'the same source and parser identity remains idempotent'
);
select is(
  (
    select latest_snapshot_id
    from public.worlds
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  (select snapshot_id from published_snapshot_ids where name = 'parser-upgrade'),
  'parser-upgrade publication atomically becomes latest'
);
select public.publish_inventory_snapshot(
  '10000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'source_save_hash', repeat('c', 64),
    'source_modified_at', '2026-07-14T03:00:00Z',
    'save_version', 'fixture-save-v2',
    'captured_at', '2026-07-14T03:00:00Z',
    'parser_name', 'fixture-parser',
    'parser_version', '2.0.0',
    'server', jsonb_build_object('world_uid', 'fixture-world-local'),
    'guilds', '[]'::jsonb,
    'players', '[]'::jsonb,
    'pals', jsonb_build_array(
      jsonb_build_object(
        'instance_uid', 'phase3-pal-001',
        'metadata', jsonb_build_object(
          'source_internal_name', 'TamperedReplay',
          'source_passive_skill_internal_names', jsonb_build_array('TamperedReplay')
        )
      )
    ),
    'warnings', '[]'::jsonb
  )
);
select is(
  (
    select raw_metadata ->> 'source_internal_name'
    from public.pal_snapshot_items
    where pal_instance_uid = 'phase3-pal-001'
  ),
  'FuturePal',
  'idempotent replay cannot mutate immutable stable-ID source metadata'
);

select throws_ok(
  $$
    select public.publish_inventory_snapshot(
      '10000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'source_save_hash', repeat('e', 64),
        'source_modified_at', '2026-07-14T04:00:00Z',
        'save_version', 'fixture-save-v2',
        'captured_at', '2026-07-14T04:00:00Z',
        'parser_name', 'fixture-parser',
        'parser_version', '2.0.0',
        'server', jsonb_build_object('world_uid', 'wrong-world'),
        'guilds', '[]'::jsonb,
        'players', '[]'::jsonb,
        'pals', '[]'::jsonb,
        'warnings', '[]'::jsonb
      )
    )
  $$,
  'P0001',
  'CANONICAL_WORLD_UID_MISMATCH',
  'world UID mismatch is rejected in the database boundary'
);

select public.publish_inventory_snapshot(
  '10000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'source_save_hash', repeat('1', 64),
    'source_modified_at', '2026-07-14T04:30:00Z',
    'save_version', 'fixture-save-v2',
    'captured_at', '2026-07-14T04:30:00Z',
    'parser_name', 'fixture-parser',
    'parser_version', '2.0.0',
    'server', jsonb_build_object('world_uid', 'fixture-world-local'),
    'guilds', '[]'::jsonb,
    'players', '[]'::jsonb,
    'pals', jsonb_build_array(
      jsonb_build_object(
        'instance_uid', 'fixture-pal-b-private-001',
        'owner_player_uid', null,
        'guild_uid', 'fixture-guild-alpha',
        'pal_id', 'Lamball',
        'gender', 'male',
        'level', 19,
        'passive_skill_ids', jsonb_build_array(),
        'location_type', 'player_party',
        'location_name', null,
        'owner_resolved', false,
        'guild_resolved', true,
        'shared_eligible', false,
        'warning_codes', jsonb_build_array('OWNER_UNRESOLVED')
      )
    ),
    'warnings', '[]'::jsonb
  )
);
select is(
  (
    select concat_ws(
      '|', share_enabled::text, owner_player_id_at_set::text, updated_by::text
    )
    from public.pal_share_preferences
    where world_id = '10000000-0000-4000-8000-000000000001'
      and pal_instance_uid = 'fixture-pal-b-private-001'
  ),
  'false|30000000-0000-4000-8000-000000000002|00000000-0000-4000-8000-000000000003',
  'an unresolved owner preserves the existing private sharing preference'
);

select public.publish_inventory_snapshot(
  '10000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'source_save_hash', repeat('2', 64),
    'source_modified_at', '2026-07-14T04:40:00Z',
    'save_version', 'fixture-save-v2',
    'captured_at', '2026-07-14T04:40:00Z',
    'parser_name', 'fixture-parser',
    'parser_version', '2.0.0',
    'server', jsonb_build_object('world_uid', 'fixture-world-local'),
    'guilds', '[]'::jsonb,
    'players', '[]'::jsonb,
    'pals', jsonb_build_array(
      jsonb_build_object(
        'instance_uid', 'fixture-pal-b-private-001',
        'owner_player_uid', 'fixture-player-b-uid',
        'guild_uid', 'fixture-guild-alpha',
        'pal_id', 'Lamball',
        'gender', 'male',
        'level', 19,
        'passive_skill_ids', jsonb_build_array(),
        'location_type', 'player_party',
        'location_name', null,
        'owner_resolved', true,
        'guild_resolved', true,
        'shared_eligible', true,
        'warning_codes', jsonb_build_array()
      )
    ),
    'warnings', '[]'::jsonb
  )
);
select is(
  (
    select concat_ws(
      '|', share_enabled::text, owner_player_id_at_set::text, updated_by::text
    )
    from public.pal_share_preferences
    where world_id = '10000000-0000-4000-8000-000000000001'
      and pal_instance_uid = 'fixture-pal-b-private-001'
  ),
  'false|30000000-0000-4000-8000-000000000002|00000000-0000-4000-8000-000000000003',
  'the original resolved owner still preserves the private sharing preference'
);

select public.publish_inventory_snapshot(
  '10000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'source_save_hash', repeat('3', 64),
    'source_modified_at', '2026-07-14T04:50:00Z',
    'save_version', 'fixture-save-v2',
    'captured_at', '2026-07-14T02:00:00Z',
    'parser_name', 'fixture-parser',
    'parser_version', '2.0.0',
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
        'level', 36,
        'guild_uid', 'fixture-guild-alpha'
      )
    ),
    'pals', jsonb_build_array(
      jsonb_build_object(
        'instance_uid', 'fixture-pal-b-private-001',
        'owner_player_uid', 'fixture-player-a-uid',
        'guild_uid', 'fixture-guild-alpha',
        'pal_id', 'Lamball',
        'gender', 'male',
        'level', 19,
        'passive_skill_ids', jsonb_build_array(),
        'location_type', 'player_party',
        'location_name', null,
        'owner_resolved', true,
        'guild_resolved', true,
        'shared_eligible', true,
        'warning_codes', jsonb_build_array()
      )
    ),
    'warnings', '[]'::jsonb
  )
);
select is(
  (
    select concat_ws(
      '|', share_enabled::text, owner_player_id_at_set::text, coalesce(updated_by::text, 'null')
    )
    from public.pal_share_preferences
    where world_id = '10000000-0000-4000-8000-000000000001'
      and pal_instance_uid = 'fixture-pal-b-private-001'
  ),
  'true|30000000-0000-4000-8000-000000000001|null',
  'a different resolved owner resets sharing to the safe default'
);
select is(
  (
    select last_seen_at
    from public.players
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  '2026-07-14T03:00:00Z'::timestamptz,
  'an older captured_at cannot move player last_seen_at backwards'
);
select is(
  (
    select last_seen_at
    from public.guilds
    where id = '20000000-0000-4000-8000-000000000001'
  ),
  '2026-07-14T03:00:00Z'::timestamptz,
  'an older captured_at cannot move guild last_seen_at backwards'
);

select is(
  public.publish_inventory_snapshot(
    '10000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'source_save_hash', repeat('a', 64),
      'source_modified_at', '2026-07-14T04:55:00Z',
      'save_version', 'fixture-save-v1',
      'captured_at', '2026-07-14T04:55:00Z',
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
  'a historical successful hash reuses its immutable snapshot row'
);
select is(
  (
    select latest_snapshot_id
    from public.worlds
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  '40000000-0000-4000-8000-000000000001'::uuid,
  'a historical hash replay atomically switches latest to the returned snapshot'
);

insert into public.inventory_snapshots (
  id, world_id, source_save_hash, source_modified_at, save_version,
  parser_name, parser_version, status, captured_at, parsed_at
) values (
  '40000000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000001',
  repeat('d', 64),
  '2026-07-14T05:00:00Z',
  'fixture-save-v3',
  'fixture-parser',
  '3.0.0',
  'published',
  '2026-07-14T05:00:00Z',
  '2026-07-14T05:00:01Z'
);
insert into public.pal_snapshot_items (
  snapshot_id, world_id, pal_instance_uid, pal_id, gender,
  passive_skill_ids, location_type, raw_metadata
)
select
  '40000000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000001',
  'previous-pal-' || value,
  'Lamball',
  'unknown',
  '{}',
  'unknown',
  '{}'
from generate_series(1, 120) as value;
update public.worlds
set latest_snapshot_id = '40000000-0000-4000-8000-000000000099',
    inventory_source_modified_at = '2026-07-14T05:00:00Z'
where id = '10000000-0000-4000-8000-000000000001';

select throws_ok(
  $$
    select public.publish_inventory_snapshot(
      '10000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'source_save_hash', repeat('f', 64),
        'source_modified_at', '2026-07-14T06:00:00Z',
        'save_version', 'fixture-save-v4',
        'captured_at', '2026-07-14T06:00:00Z',
        'parser_name', 'fixture-parser',
        'parser_version', '4.0.0',
        'server', jsonb_build_object('world_uid', 'fixture-world-local'),
        'guilds', '[]'::jsonb,
        'players', '[]'::jsonb,
        'pals', (
          select jsonb_agg(jsonb_build_object(
            'instance_uid', 'new-pal-' || value,
            'owner_player_uid', null,
            'guild_uid', null,
            'pal_id', 'Lamball',
            'gender', 'unknown',
            'level', 1,
            'passive_skill_ids', jsonb_build_array(),
            'location_type', 'unknown',
            'location_name', null,
            'owner_resolved', false,
            'guild_resolved', false,
            'shared_eligible', false,
            'warning_codes', jsonb_build_array('OWNER_UNRESOLVED', 'GUILD_UNRESOLVED')
          ))
          from generate_series(1, 59) as value
        ),
        'warnings', '[]'::jsonb
      )
    )
  $$,
  'P0001',
  'INVENTORY_DROP_REVIEW_REQUIRED',
  'an inventory drop below half and over fifty is rejected atomically'
);
select is(
  (select latest_snapshot_id from public.worlds where id = '10000000-0000-4000-8000-000000000001'),
  '40000000-0000-4000-8000-000000000099'::uuid,
  'rejected inventory drop preserves the previous latest snapshot'
);
select throws_ok(
  $$
    select public.publish_inventory_snapshot(
      '10000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'source_save_hash', repeat('4', 64),
        'source_modified_at', '2026-07-14T04:59:00Z',
        'save_version', 'fixture-save-v4',
        'captured_at', '2026-07-14T04:59:00Z',
        'parser_name', 'fixture-parser',
        'parser_version', '4.0.0',
        'server', jsonb_build_object('world_uid', 'fixture-world-local'),
        'guilds', '[]'::jsonb,
        'players', '[]'::jsonb,
        'pals', '[]'::jsonb,
        'warnings', '[]'::jsonb
      )
    )
  $$,
  'P0001',
  'INVENTORY_SNAPSHOT_STALE',
  'a stale source observation is rejected with a stable error code'
);
select is(
  (
    select latest_snapshot_id
    from public.worlds
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  '40000000-0000-4000-8000-000000000099'::uuid,
  'a stale publication cannot replace the newer latest snapshot'
);

reset role;
select * from finish();
rollback;
