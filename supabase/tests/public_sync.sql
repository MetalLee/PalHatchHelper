begin;
set local search_path = public, extensions;

select plan(37);

delete from public.player_bindings
 where user_id = '00000000-0000-4000-8000-000000000005';

select has_table('public', 'steam_identities', 'Steam identities are stored separately from auth users');
select has_table('public', 'sync_pairing_codes', 'pairing codes have a dedicated one-time store');
select has_table('public', 'sync_devices', 'public Sync devices have a dedicated credential store');
select has_function('public', 'list_claimable_synced_players', array[]::text[], 'claimable players are derived server-side');
select has_function('public', 'claim_synced_player', array['uuid'], 'player claims use a transactional RPC');
select hasnt_column('public', 'sync_pairing_codes', 'code', 'pairing code plaintext has no database column');
select hasnt_column('public', 'sync_devices', 'device_token', 'device token plaintext has no database column');
select ok(
  not has_column_privilege('authenticated', 'public.sync_devices', 'token_hash', 'select'),
  'browser users cannot select device token hashes'
);

insert into public.steam_identities (user_id, steam_id, persona_name)
values
  ('00000000-0000-4000-8000-000000000005', '76561198000000005', 'Fixture Steam Five'),
  ('00000000-0000-4000-8000-000000000002', '76561198000000002', 'Fixture Steam Two');

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000005"}',
  true
);
set local role authenticated;

select throws_ok(
  $$ insert into public.steam_identities (user_id, steam_id) values (auth.uid(), '76561198000000999') $$,
  '42501',
  'permission denied for table steam_identities',
  'authenticated users cannot write Steam identities directly'
);
select is(
  (select count(*)::integer from public.steam_identities),
  1,
  'a user reads only their own Steam identity'
);
select lives_ok(
  $$ select public.create_sync_pairing_code(repeat('a', 64), 600) $$,
  'an authenticated user can create a hashed pairing code'
);

reset role;
select is(
  (select count(*)::integer from public.sync_pairing_codes where code_hash = repeat('a', 64)),
  1,
  'only the supplied pairing-code hash is stored'
);

set local role authenticated;
select lives_ok(
  $$ select public.create_sync_pairing_code(repeat('b', 64), 600) $$,
  'creating a new pairing code invalidates the previous code'
);
reset role;
select ok(
  (select consumed_at is not null from public.sync_pairing_codes where code_hash = repeat('a', 64)),
  'the previous unconsumed pairing code is expired by rotation'
);

insert into public.sync_pairing_codes (
  owner_user_id, code_hash, created_at, expires_at
) values (
  '00000000-0000-4000-8000-000000000005',
  repeat('9', 64),
  now() - interval '2 hours',
  now() - interval '1 hour'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select lives_ok(
  $$
    select public.consume_sync_pairing_code(
      repeat('b', 64), 'Paired fixture', 'linux-x64', '0.1.0',
      repeat('c', 64), 'pbs_12345678'
    )
  $$,
  'a valid code is atomically consumed into one device'
);
select is(
  (
    select concat_ws('|', owner_user_id::text, token_hash)
      from public.sync_devices where token_hash = repeat('c', 64)
  ),
  '00000000-0000-4000-8000-000000000005|' || repeat('c', 64),
  'the device belongs to the code owner and stores only the token hash'
);
insert into public.sync_pairing_codes (
  owner_user_id, code_hash, expires_at
) values (
  '00000000-0000-4000-8000-000000000005',
  repeat('8', 64),
  now() + interval '10 minutes'
);
select lives_ok(
  $$
    select public.consume_sync_pairing_code(
      repeat('8', 64), 'Windows fixture', 'win32-x64', '0.2.0',
      repeat('7', 64), 'pbs_windows1'
    )
  $$,
  'a Windows x64 device can be created through the same pairing RPC'
);
select is(
  (
    select platform from public.sync_devices where token_hash = repeat('7', 64)
  ),
  'win32-x64',
  'the Windows device retains its constrained platform value'
);
select throws_ok(
  $$
    insert into public.sync_devices (
      owner_user_id, name, platform, token_hash, token_prefix
    ) values (
      '00000000-0000-4000-8000-000000000005',
      'Unknown platform', 'windows-x64', repeat('6', 64), 'pbs_unknown1'
    )
  $$,
  '23514',
  null,
  'the database constraint rejects unknown device platforms'
);
select throws_ok(
  $$
    select public.consume_sync_pairing_code(
      repeat('b', 64), 'Replay', 'linux-x64', '0.1.0',
      repeat('d', 64), 'pbs_87654321'
    )
  $$,
  'P0001',
  'SYNC_PAIRING_CODE_INVALID',
  'a consumed pairing code cannot be replayed'
);
select throws_ok(
  $$
    select public.consume_sync_pairing_code(
      repeat('9', 64), 'Expired', 'linux-x64', '0.1.0',
      repeat('e', 64), 'pbs_abcdefgh'
    )
  $$,
  'P0001',
  'SYNC_PAIRING_CODE_EXPIRED',
  'an expired pairing code is rejected'
);
select lives_ok(
  $$
    select public.publish_sync_device_snapshot(
      repeat('c', 64),
      jsonb_build_object(
        'source_save_hash', repeat('1', 64),
        'source_modified_at', '2026-07-29T01:00:00Z',
        'save_version', 'fixture-public-sync',
        'captured_at', '2026-07-29T01:00:00Z',
        'parser_name', 'palhatch-plm-save-parser',
        'parser_version', '1.1.0',
        'server', jsonb_build_object(
          'world_uid', 'pb1_' || repeat('1', 64),
          'save_version', 'fixture-public-sync',
          'captured_at', '2026-07-29T01:00:00Z'
        ),
        'guilds', '[]'::jsonb,
        'players', '[]'::jsonb,
        'pals', '[]'::jsonb,
        'warnings', '[]'::jsonb
      )
    )
  $$,
  'the first upload creates and binds a world through the existing publisher'
);
select is(
  (
    select world.world_uid
      from public.sync_devices as device
      join public.worlds as world on world.id = device.world_id
     where device.token_hash = repeat('c', 64)
  ),
  'pb1_' || repeat('1', 64),
  'the device is fixed to the redacted world UID from its first upload'
);
select lives_ok(
  $$
    select public.publish_sync_device_snapshot(
      repeat('c', 64),
      jsonb_build_object(
        'source_save_hash', repeat('2', 64),
        'source_modified_at', '2026-07-29T01:05:00Z',
        'save_version', 'fixture-public-sync',
        'captured_at', '2026-07-29T01:05:00Z',
        'parser_name', 'palhatch-plm-save-parser',
        'parser_version', '1.1.0',
        'server', jsonb_build_object(
          'world_uid', 'pb1_' || repeat('1', 64),
          'save_version', 'fixture-public-sync',
          'captured_at', '2026-07-29T01:05:00Z'
        ),
        'guilds', '[]'::jsonb,
        'players', '[]'::jsonb,
        'pals', '[]'::jsonb,
        'warnings', '[]'::jsonb
      )
    )
  $$,
  'a later upload reuses the same device world'
);
select is(
  (
    select count(*)::integer from public.worlds
     where world_uid = 'pb1_' || repeat('1', 64)
  ),
  1,
  'later uploads do not create duplicate worlds'
);
reset role;

insert into public.sync_devices (
  id, owner_user_id, name, platform, token_hash, token_prefix, world_id
) values
  (
    '90000000-0000-4000-8000-000000000090',
    '00000000-0000-4000-8000-000000000005',
    'Revocable fixture', 'linux-x64', repeat('d', 64), 'pbs_revoke12', null
  ),
  (
    '90000000-0000-4000-8000-000000000091',
    '00000000-0000-4000-8000-000000000005',
    'World fixture', 'linux-x64', repeat('e', 64), 'pbs_world123',
    '10000000-0000-4000-8000-000000000001'
  );

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from public.list_sync_devices()),
  0,
  'a user cannot list another user device'
);
select throws_ok(
  $$ select public.revoke_sync_device('90000000-0000-4000-8000-000000000090') $$,
  'P0001',
  'SYNC_DEVICE_NOT_FOUND',
  'a user cannot revoke another user device'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000005"}',
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from public.list_sync_devices()),
  4,
  'a device owner can list only their own paired devices'
);
select lives_ok(
  $$ select public.revoke_sync_device('90000000-0000-4000-8000-000000000090') $$,
  'a device owner can revoke their own device'
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select throws_ok(
  $$ select public.heartbeat_sync_device(repeat('d', 64), '0.1.0', 'unchanged') $$,
  'P0001',
  'SYNC_DEVICE_UNAUTHORIZED',
  'a revoked device immediately loses API authorization'
);
select throws_ok(
  $$
    select public.publish_sync_device_snapshot(
      repeat('e', 64),
      jsonb_build_object(
        'parser_name', 'palhatch-plm-save-parser',
        'server', jsonb_build_object('world_uid', 'pb1_' || repeat('f', 64)),
        'guilds', '[]'::jsonb,
        'players', '[]'::jsonb,
        'pals', '[]'::jsonb
      )
    )
  $$,
  'P0001',
  'SYNC_DEVICE_WORLD_MISMATCH',
  'a bound device cannot switch to another world UID'
);
reset role;

insert into public.worlds (
  id, world_uid, name, created_at, updated_at
) values (
  '10000000-0000-4000-8000-000000000099',
  'pb1_' || repeat('9', 64),
  'Other Sync World', now(), now()
);
insert into public.inventory_snapshots (
  id, world_id, source_save_hash, source_modified_at, parser_name, parser_version,
  status, captured_at, parsed_at, created_at
) values (
  '40000000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000099', repeat('8', 64), now(),
  'fixture-parser', '1.0.0', 'published', '2026-07-29T00:00:00Z', now(), now()
);
update public.worlds
   set latest_snapshot_id = '40000000-0000-4000-8000-000000000099'
 where id = '10000000-0000-4000-8000-000000000099';
insert into public.players (
  id, world_id, game_player_uid, nickname, level, last_seen_at
) values
  (
    '30000000-0000-4000-8000-000000000098',
    '10000000-0000-4000-8000-000000000001',
    'pb1_' || repeat('7', 64), 'Claimable Fixture', 44, '2026-07-13T09:00:00Z'
  ),
  (
    '30000000-0000-4000-8000-000000000097',
    '10000000-0000-4000-8000-000000000001',
    'pb1_' || repeat('6', 64), 'Second Fixture', 33, '2026-07-13T09:00:00Z'
  ),
  (
    '30000000-0000-4000-8000-000000000099',
    '10000000-0000-4000-8000-000000000099',
    'pb1_' || repeat('5', 64), 'Other World Fixture', 22, '2026-07-29T00:00:00Z'
  );

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000005"}',
  true
);
set local role authenticated;
select throws_ok(
  $$ select public.claim_synced_player('30000000-0000-4000-8000-000000000099') $$,
  'P0001',
  'PLAYER_NOT_CLAIMABLE',
  'a device owner cannot claim a player from another world'
);
select is(
  (
    select count(*)::integer
      from public.list_claimable_synced_players()
     where player_id in (
       '30000000-0000-4000-8000-000000000097',
       '30000000-0000-4000-8000-000000000098'
     )
  ),
  2,
  'unbound players in the owner latest synced world are listed'
);
select lives_ok(
  $$ select public.claim_synced_player('30000000-0000-4000-8000-000000000098') $$,
  'a device owner can claim one player from the latest synced snapshot'
);
select lives_ok(
  $$ select public.claim_synced_player('30000000-0000-4000-8000-000000000097') $$,
  'an already-bound Auth user can rebind to another unbound game player'
);

reset role;
delete from public.player_bindings where user_id = '00000000-0000-4000-8000-000000000004';
insert into public.sync_devices (
  owner_user_id, world_id, name, platform, token_hash, token_prefix
) values (
  '00000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001',
  'Competing fixture', 'linux-x64', repeat('4', 64), 'pbs_compete1'
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000004"}',
  true
);
set local role authenticated;
select throws_ok(
  $$ select public.claim_synced_player('30000000-0000-4000-8000-000000000097') $$,
  'P0001',
  'PLAYER_ALREADY_CLAIMED',
  'the unique binding prevents a competing user from claiming the same player'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.create_sync_pairing_code(text, integer)', 'execute')
  and not has_function_privilege('anon', 'public.publish_sync_device_snapshot(text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.publish_sync_device_snapshot(text, jsonb)', 'execute'),
  'anonymous and browser roles cannot execute privileged Sync publication RPCs'
);

select * from finish();
rollback;
