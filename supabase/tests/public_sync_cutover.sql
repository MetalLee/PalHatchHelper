begin;
set local search_path = public, extensions;

select plan(50);

select has_table('private', 'public_sync_world_transitions', 'cutover backup is private');
select has_table('private', 'public_sync_uid_mappings', 'UID rollback mappings are private');
select has_function(
  'public', 'preflight_public_sync_world_transition', array['uuid'],
  'preflight is exposed as one controlled RPC'
);
select has_function(
  'public', 'transition_world_to_public_sync', array['uuid', 'text', 'boolean'],
  'transition requires an expected current UID and explicit heartbeat override'
);
select has_function(
  'public', 'rollback_public_sync_world_transition', array['uuid'],
  'rollback is exposed as one controlled RPC'
);
select has_function(
  'public', 'verify_public_sync_world_transition', array['uuid'],
  'verification is exposed as one safe-report RPC'
);
select is(
  private.public_sync_redact_uid('fixture-world-local'),
  'pb1_5f9e8f9da19f9e744f70723081bf058d9241375c30c56690aa7be452c71b5ba4',
  'PostgreSQL redaction matches the fixed TypeScript SHA-256 vector'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.transition_world_to_public_sync(uuid,text,boolean)',
    'execute'
  ),
  'browser roles cannot execute identity transition'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.preflight_public_sync_world_transition(
    '10000000-0000-4000-8000-000000000001'
  ) ->> 'current_world_uid',
  'fixture-world-local',
  'preflight reports the current world UID without writing'
);
select is(
  public.preflight_public_sync_world_transition(
    '10000000-0000-4000-8000-000000000001'
  ) ->> 'target_world_uid',
  'pb1_5f9e8f9da19f9e744f70723081bf058d9241375c30c56690aa7be452c71b5ba4',
  'preflight reports the exact target world UID'
);
select is(
  (public.preflight_public_sync_world_transition(
    '10000000-0000-4000-8000-000000000001'
  ) ->> 'guild_count')::integer,
  2,
  'preflight reports guild count'
);
select is(
  (public.preflight_public_sync_world_transition(
    '10000000-0000-4000-8000-000000000001'
  ) ->> 'processing_job_count')::integer,
  1,
  'preflight exposes processing jobs as a cutover blocker'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select throws_ok(
  $$
    select public.transition_world_to_public_sync(
      '10000000-0000-4000-8000-000000000001',
      'fixture-world-local',
      false
    )
  $$,
  'P0001',
  'PUBLIC_SYNC_PROCESSING_JOBS_ACTIVE',
  'transition refuses a processing breeding job'
);
reset role;

update public.breeding_jobs
   set status = 'failed',
       locked_by = null,
       lease_token = null,
       locked_at = null,
       heartbeat_at = null,
       error_code = 'CUTOVER_TEST',
       error_summary = 'Synthetic cutover fixture',
       completed_at = now(),
       updated_at = now()
 where id = '60000000-0000-4000-8000-000000000002';

insert into public.agent_worker_heartbeats (
  worker_kind, worker_id, deployment_version, safe_metadata, heartbeat_at
) values (
  'save_worker', 'synthetic-save-worker', 'fixture-sha', '{}'::jsonb, now()
) on conflict (worker_kind) do update
  set worker_id = excluded.worker_id,
      deployment_version = excluded.deployment_version,
      safe_metadata = excluded.safe_metadata,
      heartbeat_at = excluded.heartbeat_at;

set local role service_role;
select throws_ok(
  $$
    select public.transition_world_to_public_sync(
      '10000000-0000-4000-8000-000000000001',
      'fixture-world-local',
      false
    )
  $$,
  'P0001',
  'PUBLIC_SYNC_SAVE_WORKER_ACTIVE',
  'transition refuses a recent Save Worker heartbeat by default'
);
select lives_ok(
  $$
    select public.transition_world_to_public_sync(
      '10000000-0000-4000-8000-000000000001',
      'fixture-world-local',
      true
    )
  $$,
  'the controlled heartbeat override is explicit and transactional'
);
reset role;

select is(
  (select world_uid from public.worlds where id = '10000000-0000-4000-8000-000000000001'),
  private.public_sync_redact_uid('fixture-world-local'),
  'transition changes only the durable world external UID'
);
select is(
  (select id from public.worlds where world_uid = private.public_sync_redact_uid('fixture-world-local')),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'world UUID remains unchanged'
);
select is(
  (select game_guild_uid from public.guilds where id = '20000000-0000-4000-8000-000000000001'),
  private.public_sync_redact_uid('fixture-guild-alpha'),
  'guild UUID is reused with a redacted external UID'
);
select is(
  (select game_player_uid from public.players where id = '30000000-0000-4000-8000-000000000001'),
  private.public_sync_redact_uid('fixture-player-a-uid'),
  'player UUID is reused with a redacted external UID'
);
select is(
  (select count(*)::integer from public.player_bindings),
  3,
  'player bindings remain unchanged during transition'
);
select ok(
  exists (
    select 1 from public.pal_share_preferences
     where world_id = '10000000-0000-4000-8000-000000000001'
       and pal_instance_uid = private.public_sync_redact_uid('fixture-pal-b-private-001')
       and share_enabled is false
  ),
  'current share preference identity and disabled value are preserved'
);
select ok(
  exists (
    select 1 from public.pal_snapshot_items
     where id = '41000000-0000-4000-8000-000000000005'
       and pal_instance_uid = 'fixture-pal-b-private-001'
  ),
  'immutable historical snapshot items are not rewritten'
);
select ok(
  exists (
    select 1 from public.breeding_steps
     where id = '63000000-0000-4000-8000-000000000001'
       and parent_a_instance_uid = 'fixture-pal-a-historical-001'
       and parent_b_instance_uid = 'fixture-pal-b-shared-001'
  ),
  'historical breeding instance UIDs are not rewritten'
);

set local role service_role;
select lives_ok(
  $$
    select public.transition_world_to_public_sync(
      '10000000-0000-4000-8000-000000000001',
      'fixture-world-local',
      false
    )
  $$,
  'transition is idempotent after the exact mapping is applied'
);
reset role;

insert into public.sync_devices (
  id, owner_user_id, name, platform, token_hash, token_prefix
) values (
  '90000000-0000-4000-8000-000000000099',
  '00000000-0000-4000-8000-000000000005',
  'Cutover fixture', 'linux-x64', repeat('9', 64), 'pbs_cutover1'
);

set local role service_role;
select is(
  (
    public.publish_sync_device_snapshot(
      repeat('9', 64),
      jsonb_build_object(
        'source_save_hash', 'c7c68938565e0ac2c20f46a57e6d92dedf712528a0de04f331c89c4b6b9c3607',
        'source_modified_at', '2026-07-30T00:00:00Z',
        'save_version', 'fixture-public-sync',
        'captured_at', '2026-07-30T00:00:00Z',
        'parser_name', 'palhatch-plm-save-parser',
        'parser_version', '1.2.0',
        'server', jsonb_build_object(
          'world_uid', private.public_sync_redact_uid('fixture-world-local'),
          'save_version', 'fixture-public-sync',
          'captured_at', '2026-07-30T00:00:00Z'
        ),
        'guilds', jsonb_build_array(
          jsonb_build_object('guild_uid', private.public_sync_redact_uid('fixture-guild-alpha'), 'name', 'Fixture Guild Alpha'),
          jsonb_build_object('guild_uid', private.public_sync_redact_uid('fixture-guild-beta'), 'name', 'Fixture Guild Beta')
        ),
        'players', jsonb_build_array(
          jsonb_build_object('player_uid', private.public_sync_redact_uid('fixture-player-a-uid'), 'nickname', 'Fixture Player A', 'level', 35, 'guild_uid', private.public_sync_redact_uid('fixture-guild-alpha')),
          jsonb_build_object('player_uid', private.public_sync_redact_uid('fixture-player-b-uid'), 'nickname', 'Fixture Player B', 'level', 32, 'guild_uid', private.public_sync_redact_uid('fixture-guild-alpha')),
          jsonb_build_object('player_uid', private.public_sync_redact_uid('fixture-player-c-uid'), 'nickname', 'Fixture Player C', 'level', 28, 'guild_uid', private.public_sync_redact_uid('fixture-guild-beta'))
        ),
        'pals', jsonb_build_array(
          jsonb_build_object(
            'instance_uid', private.public_sync_redact_uid('fixture-pal-a-owned-001'),
            'owner_player_uid', private.public_sync_redact_uid('fixture-player-a-uid'),
            'guild_uid', private.public_sync_redact_uid('fixture-guild-alpha'),
            'pal_id', 'test_parent_a', 'is_boss', false, 'gender', 'male',
            'level', 20, 'passive_skill_ids', jsonb_build_array('test_passive_a'),
            'location_type', 'player_storage', 'location_name', 'Fixture Storage A',
            'location_id', null, 'location_slot_index', 64,
            'location_access_scope', 'player', 'metadata', null,
            'ownership_scope', 'player', 'owner_resolved', true,
            'guild_resolved', true, 'shared_eligible', true,
            'warning_codes', '[]'::jsonb
          )
        ),
        'warnings', '[]'::jsonb
      )
    ) ->> 'world_id'
  )::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  'first public Sync upload returns the original world UUID'
);
reset role;

select is(
  (select count(*)::integer from public.worlds where id = '10000000-0000-4000-8000-000000000001'),
  1,
  'first Sync upload does not create a second world'
);
select is(
  (select world_id from public.sync_devices where id = '90000000-0000-4000-8000-000000000099'),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'the Sync device binds to the transitioned world'
);
select is(
  (select id from public.guilds where world_id = '10000000-0000-4000-8000-000000000001' and game_guild_uid = private.public_sync_redact_uid('fixture-guild-alpha')),
  '20000000-0000-4000-8000-000000000001'::uuid,
  'first Sync reuses the original guild UUID'
);
select is(
  (select id from public.players where world_id = '10000000-0000-4000-8000-000000000001' and game_player_uid = private.public_sync_redact_uid('fixture-player-a-uid')),
  '30000000-0000-4000-8000-000000000001'::uuid,
  'first Sync reuses the original player UUID'
);
select is(
  (select count(*)::integer from public.player_bindings),
  3,
  'first Sync leaves player bindings unchanged'
);
select ok(
  exists (
    select 1
      from public.worlds as world
      join private.public_sync_snapshot_publications as publication
        on publication.snapshot_id = world.latest_snapshot_id
     where world.id = '10000000-0000-4000-8000-000000000001'
       and publication.device_id = '90000000-0000-4000-8000-000000000099'
  ),
  'latest inventory is formally attributed to public Sync'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;
select is(
  (public.list_available_pals_page_v4(p_page_size => 24, p_locale => 'zh-CN') #>> '{data,total_count}')::integer,
  1,
  'the pal list remains readable after first public Sync upload'
);
select lives_ok(
  $$
    select * from public.create_breeding_job_v3(
      'test_child_pal', '{}'::text[], 'balanced', true, 5, 'zh-CN'
    )
  $$,
  'breeding job creation remains available after cutover'
);
reset role;
select is(
  (
    select count(*)::integer
      from public.breeding_jobs as job
      join public.worlds as world on world.latest_snapshot_id = job.inventory_snapshot_id
     where job.requester_user_id = '00000000-0000-4000-8000-000000000002'
       and world.id = '10000000-0000-4000-8000-000000000001'
       and job.inventory_snapshot_id <> '40000000-0000-4000-8000-000000000002'
  ),
  1,
  'new breeding jobs pin the public Sync latest snapshot'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select ok(
  public.verify_public_sync_world_transition(
    '10000000-0000-4000-8000-000000000001'
  ) @> jsonb_build_object(
    'world_id_preserved', true,
    'single_world', true,
    'player_ids_preserved', true,
    'bindings_preserved', true,
    'duplicate_guild_count', 0,
    'duplicate_player_count', 0,
    'latest_parser_version', '1.2.0',
    'latest_pal_count', 1,
    'latest_snapshot_source', 'public_sync',
    'sync_device_id', '90000000-0000-4000-8000-000000000099',
    'migration_state', 'transitioned'
  ),
  'verify returns the required safe cutover invariants'
);
select ok(
  position(
    'fixture-world-local' in public.verify_public_sync_world_transition(
      '10000000-0000-4000-8000-000000000001'
    )::text
  ) = 0,
  'verify never returns original external UIDs'
);
select throws_ok(
  $$ select public.rollback_public_sync_world_transition('10000000-0000-4000-8000-000000000001') $$,
  'P0001',
  'PUBLIC_SYNC_DEVICE_ACTIVE',
  'rollback refuses an unrevoked Sync device'
);
reset role;

update public.sync_devices
   set revoked_at = now()
 where id = '90000000-0000-4000-8000-000000000099';

set local role service_role;
select lives_ok(
  $$ select public.rollback_public_sync_world_transition('10000000-0000-4000-8000-000000000001') $$,
  'rollback restores durable external UIDs after device revocation'
);
reset role;

select is(
  (select world_uid from public.worlds where id = '10000000-0000-4000-8000-000000000001'),
  'fixture-world-local',
  'rollback restores the original world UID'
);
select is(
  (select game_guild_uid from public.guilds where id = '20000000-0000-4000-8000-000000000001'),
  'fixture-guild-alpha',
  'rollback restores the original guild UID'
);
select is(
  (select game_player_uid from public.players where id = '30000000-0000-4000-8000-000000000001'),
  'fixture-player-a-uid',
  'rollback restores the original player UID'
);
select ok(
  exists (
    select 1 from public.pal_share_preferences
     where world_id = '10000000-0000-4000-8000-000000000001'
       and pal_instance_uid = 'fixture-pal-b-private-001'
       and share_enabled is false
  ),
  'rollback restores original share preference identity and value'
);
select is(
  (select count(*)::integer from public.player_bindings),
  3,
  'rollback preserves player bindings'
);
select ok(
  exists (
    select 1 from private.public_sync_snapshot_publications
     where device_id = '90000000-0000-4000-8000-000000000099'
  ),
  'rollback does not delete public Sync snapshot history'
);

set local role service_role;
select lives_ok(
  $$
    select public.publish_inventory_snapshot(
      '10000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'source_save_hash', repeat('d', 64),
        'source_modified_at', '2026-07-30T00:10:00Z',
        'save_version', 'fixture-agent-after-rollback',
        'captured_at', '2026-07-30T00:10:00Z',
        'parser_name', 'palhatch-plm-save-parser',
        'parser_version', '1.2.0',
        'server', jsonb_build_object('world_uid', 'fixture-world-local'),
        'guilds', jsonb_build_array(jsonb_build_object('guild_uid', 'fixture-guild-alpha', 'name', 'Fixture Guild Alpha')),
        'players', jsonb_build_array(jsonb_build_object('player_uid', 'fixture-player-a-uid', 'nickname', 'Fixture Player A', 'level', 35, 'guild_uid', 'fixture-guild-alpha')),
        'pals', jsonb_build_array(jsonb_build_object(
          'instance_uid', 'fixture-pal-a-owned-001',
          'owner_player_uid', 'fixture-player-a-uid', 'guild_uid', 'fixture-guild-alpha',
          'pal_id', 'test_parent_a', 'is_boss', false, 'gender', 'male', 'level', 20,
          'passive_skill_ids', jsonb_build_array('test_passive_a'),
          'location_type', 'player_storage', 'location_name', 'Fixture Storage A',
          'location_id', null, 'location_slot_index', 64,
          'location_access_scope', 'player', 'metadata', null,
          'ownership_scope', 'player', 'owner_resolved', true,
          'guild_resolved', true, 'shared_eligible', true, 'warning_codes', '[]'::jsonb
        )),
        'warnings', '[]'::jsonb
      )
    )
  $$,
  'old Agent can publish a new raw-UID snapshot after rollback'
);
reset role;
select ok(
  exists (
    select 1
      from public.worlds as world
      join public.pal_snapshot_items as item on item.snapshot_id = world.latest_snapshot_id
     where world.id = '10000000-0000-4000-8000-000000000001'
       and item.pal_instance_uid = 'fixture-pal-a-owned-001'
  ),
  'the post-rollback Agent snapshot becomes latest with raw instance identity'
);
select is(
  (select count(*)::integer from public.admin_audit_events where event_type in ('public_sync.transition', 'public_sync.rollback')),
  2,
  'transition and rollback each append an audit event'
);
select ok(
  not has_table_privilege('authenticated', 'private.public_sync_uid_mappings', 'select'),
  'browser roles cannot read rollback UID mappings'
);
select is(
  (select source_save_hash from public.inventory_snapshots where id = '40000000-0000-4000-8000-000000000002'),
  repeat('b', 64),
  'historical inventory snapshot metadata remains immutable'
);
select is(
  (select parent_a_instance_uid from public.breeding_steps where id = '63000000-0000-4000-8000-000000000001'),
  'fixture-pal-a-historical-001',
  'historical route facts remain unchanged after transition and rollback'
);

select * from finish();
rollback;
