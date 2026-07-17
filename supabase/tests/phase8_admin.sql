begin;
set local search_path = public, extensions;

select plan(47);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select throws_ok(
  $$ select public.get_admin_overview() $$,
  'P0001',
  'ADMIN_ACCESS_DENIED',
  'ordinary players cannot access the admin overview RPC'
);

select throws_ok(
  $$ select public.list_admin_binding_candidates(null, 20) $$,
  'P0001',
  'ADMIN_ACCESS_DENIED',
  'ordinary players cannot enumerate account binding candidates'
);

select throws_ok(
  $$ select public.list_player_binding_events(null, 20) $$,
  'P0001',
  'ADMIN_ACCESS_DENIED',
  'ordinary players cannot read binding history'
);

select throws_ok(
  $$ select public.create_agent_command('sync_save_once', '{}', 'player-command-denied', 300) $$,
  'P0001',
  'ADMIN_ACCESS_DENIED',
  'ordinary players cannot enqueue Agent commands'
);

select throws_ok(
  $$ select public.get_runtime_settings() $$,
  'P0001',
  'ADMIN_ACCESS_DENIED',
  'ordinary players cannot read administrator settings'
);

select throws_ok(
  $$ select public.admin_catalog_version_action(
    'publish',
    '10000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000001',
    'PUBLISH 51000000-0000-4000-8000-000000000001',
    'phase8-player-publish-denied'
  ) $$,
  'P0001',
  'ADMIN_ACCESS_DENIED',
  'ordinary players cannot publish catalog versions'
);

select throws_ok(
  $$ select public.admin_catalog_version_action(
    'rollback',
    '10000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000001',
    'ROLLBACK 51000000-0000-4000-8000-000000000001',
    'phase8-player-rollback-denied'
  ) $$,
  'P0001',
  'ADMIN_ACCESS_DENIED',
  'ordinary players cannot roll back catalog world pointers'
);

select throws_ok(
  $$ select count(*) from public.admin_audit_events $$,
  '42501',
  'permission denied for table admin_audit_events',
  'administrator audit table is not directly readable by players'
);

select throws_ok(
  $$ select count(*) from public.agent_commands $$,
  '42501',
  'permission denied for table agent_commands',
  'Agent command internals are not directly readable by players'
);

select throws_ok(
  $$ select count(*) from public.runtime_settings_versions $$,
  '42501',
  'permission denied for table runtime_settings_versions',
  'runtime settings history does not leak through RLS or grants'
);

select throws_ok(
  $$ select count(*) from public.admin_catalog_uploads $$,
  '42501',
  'permission denied for table admin_catalog_uploads',
  'private catalog upload metadata does not leak through table grants'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;

select ok(
  public.get_admin_overview() ?& array[
    'agent', 'save_worker', 'job_worker', 'candidate_detector',
    'latest_successful_snapshot', 'parser', 'catalog', 'job_counts',
    'ai_provider', 'recent_failure', 'disk', 'deployment_version', 'stale'
  ],
  'admin overview returns the complete browser-safe shape'
);

select is(
  jsonb_array_length(public.list_admin_binding_candidates(null, 100)),
  5,
  'admin can enumerate safe user binding summaries'
);

select ok(
  public.list_admin_binding_candidates('player-a', 20)::text not like '%player-a@palhatch.fixture.invalid%',
  'binding candidate summaries mask full auth email addresses'
);

select is(
  jsonb_array_length(public.list_admin_game_players(null, 100)),
  3,
  'admin can enumerate game players separately from Supabase users'
);

select is(
  jsonb_array_length(public.list_admin_catalog_sources()),
  1,
  'admin can list enabled catalog source summaries'
);

select is(
  jsonb_array_length(public.list_admin_catalog_worlds()),
  1,
  'admin can list safe catalog world summaries'
);

select ok(
  public.create_admin_catalog_upload(
    'fixture-catalog.tar.zst', 100, repeat('a', 64),
    '50000000-0000-4000-8000-000000000001',
    'phase8-catalog-upload'
  )->>'object_path' like
    'admin-uploads/00000000-0000-4000-8000-000000000001/%.tar.zst',
  'admin upload ticket returns only an exact private object path'
);

select is(
  (
    public.create_admin_catalog_upload(
      'fixture-catalog.tar.zst', 100, repeat('a', 64),
      '50000000-0000-4000-8000-000000000001',
      'phase8-catalog-upload'
    )->>'reused'
  )::boolean,
  true,
  'catalog upload ticket creation is idempotent'
);

select throws_ok(
  $$ select public.create_admin_catalog_operation(
    'shell',
    (public.list_admin_catalog_uploads(1)->0->>'upload_id')::uuid,
    'phase8-catalog-op-invalid'
  ) $$,
  'P0001',
  'CATALOG_ACTION_INVALID',
  'catalog operation queue rejects unknown action types'
);

select lives_ok(
  $$ select public.delete_player_binding(
    '00000000-0000-4000-8000-000000000004', 1, 'phase8-delete-player-c'
  ) $$,
  'admin can delete a binding with the expected optimistic version'
);

select lives_ok(
  $$ select public.create_player_binding(
    '00000000-0000-4000-8000-000000000005',
    '30000000-0000-4000-8000-000000000003',
    'phase8-create-unbound-user'
  ) $$,
  'admin can create a unique player binding'
);

select is(
  (
    select public.create_player_binding(
      '00000000-0000-4000-8000-000000000005',
      '30000000-0000-4000-8000-000000000003',
      'phase8-create-unbound-user-retry'
    )->>'reused'
  )::boolean,
  true,
  'creating the same binding is idempotent'
);

select throws_ok(
  $$ select public.create_player_binding(
    '00000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000003',
    'phase8-binding-conflict'
  ) $$,
  'P0001',
  'BINDING_CONFLICT',
  'player_id remains unique across bindings'
);

select throws_ok(
  $$ select public.update_player_binding(
    '00000000-0000-4000-8000-000000000005',
    '30000000-0000-4000-8000-000000000001',
    99,
    'phase8-stale-binding-update'
  ) $$,
  'P0001',
  'BINDING_VERSION_CONFLICT',
  'binding mutations reject stale optimistic versions'
);

select is(
  jsonb_array_length(public.list_player_binding_events(
    '00000000-0000-4000-8000-000000000005', 20
  )),
  1,
  'binding history records the successful binding mutation once'
);

select ok(
  public.list_admin_audit_events(100)::text like
    '%binding.created%00000000-0000-4000-8000-000000000005%',
  'binding mutations append an administrator audit event'
);

select is(
  (
    public.create_agent_command(
      'sync_save_once', '{}', 'phase8-command-idempotent', 300
    )->>'command_id'
  )::uuid,
  (
    public.create_agent_command(
      'sync_save_once', '{}', 'phase8-command-idempotent', 300
    )->>'command_id'
  )::uuid,
  'Agent command enqueue is idempotent for identical input'
);

select throws_ok(
  $$ select public.create_agent_command(
    'arbitrary_shell', '{}', 'phase8-command-unknown', 300
  ) $$,
  'P0001',
  'AGENT_COMMAND_NOT_ALLOWED',
  'unknown Agent command types fail closed'
);

select throws_ok(
  $$ select public.create_agent_command(
    'sync_save_once', '{"path":"/tmp/unsafe"}', 'phase8-command-path', 300
  ) $$,
  'P0001',
  'AGENT_COMMAND_INVALID',
  'Agent command payloads cannot carry arbitrary paths'
);

select is(
  (public.get_runtime_settings()->>'version')::integer,
  1,
  'runtime settings start at immutable version one'
);

select lives_ok(
  $$ select public.update_runtime_settings(
    1,
    '{
      "job_creation_enabled": false,
      "max_generations": 5,
      "job_worker_concurrency": 1,
      "ai_concurrency": 1,
      "parser_timeout_seconds": 180,
      "snapshot_retention_count": 3,
      "data_stale_threshold_minutes": 15,
      "ai_provider_order": ["template"],
      "maintenance_announcement": "Fixture maintenance"
    }',
    'phase8-settings-update'
  ) $$,
  'admin can append a valid non-secret settings version'
);

select throws_ok(
  $$ select public.update_runtime_settings(
    1,
    '{
      "job_creation_enabled": true,
      "max_generations": 5,
      "job_worker_concurrency": 1,
      "ai_concurrency": 1,
      "parser_timeout_seconds": 180,
      "snapshot_retention_count": 3,
      "data_stale_threshold_minutes": 15,
      "ai_provider_order": ["template"],
      "maintenance_announcement": null
    }',
    'phase8-settings-stale'
  ) $$,
  'P0001',
  'RUNTIME_SETTINGS_VERSION_CONFLICT',
  'runtime settings reject stale optimistic versions'
);

select throws_ok(
  $$ select public.update_runtime_settings(
    2,
    '{
      "job_creation_enabled": true,
      "max_generations": 99,
      "job_worker_concurrency": 1,
      "ai_concurrency": 1,
      "parser_timeout_seconds": 180,
      "snapshot_retention_count": 3,
      "data_stale_threshold_minutes": 15,
      "ai_provider_order": ["template"],
      "maintenance_announcement": null
    }',
    'phase8-settings-hard-limit'
  ) $$,
  'P0001',
  'RUNTIME_SETTINGS_INVALID',
  'runtime settings cannot exceed the maximum generation hard limit'
);

select lives_ok(
  $$ select public.rollback_runtime_settings(2, 'phase8-settings-rollback') $$,
  'settings rollback appends a new version instead of mutating history'
);

select lives_ok(
  $$ select public.admin_catalog_version_action(
    'inspect', null,
    '51000000-0000-4000-8000-000000000001', null,
    'phase8-catalog-inspect'
  ) $$,
  'admin can inspect browser-safe catalog version metadata'
);

reset role;

insert into storage.objects(bucket_id, name, owner_id, metadata)
select
  'game-catalog-artifacts', object_path, created_by::text,
  jsonb_build_object('size', size_bytes, 'mimetype', 'application/zstd')
from public.admin_catalog_uploads
where idempotency_key = 'phase8-catalog-upload';

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;

select lives_ok(
  $$ select public.mark_admin_catalog_upload_ready(
    (public.list_admin_catalog_uploads(1)->0->>'upload_id')::uuid,
    'phase8-catalog-ready'
  ) $$,
  'admin can finalize a completed private storage upload'
);

select lives_ok(
  $$ select public.create_admin_catalog_operation(
    'validate',
    (public.list_admin_catalog_uploads(1)->0->>'upload_id')::uuid,
    'phase8-catalog-validate'
  ) $$,
  'admin can queue deterministic validation after upload completion'
);

select ok(
  public.list_admin_audit_events(100)::text like '%catalog.validate_requested%',
  'catalog mutations append browser-safe audit events'
);

reset role;

select throws_ok(
  $$ update public.admin_audit_events set safe_summary = '{}' $$,
  'P0001',
  'APPEND_ONLY_RECORD',
  'audit events cannot be updated even by a privileged database session'
);

select throws_ok(
  $$ delete from public.admin_audit_events $$,
  'P0001',
  'APPEND_ONLY_RECORD',
  'audit events cannot be deleted'
);

select throws_ok(
  $$ update public.runtime_settings_versions set settings = settings $$,
  'P0001',
  'APPEND_ONLY_RECORD',
  'settings versions are append-only'
);

select set_config(
  'request.jwt.claims',
  '{"role":"service_role","sub":"00000000-0000-4000-8000-000000000099"}',
  true
);
set local role service_role;

select ok(
  public.claim_agent_command('phase8-command-worker', now() - interval '2 minutes')
    ? 'command_id',
  'Service Role command worker can atomically claim one command'
);

select lives_ok(
  $$ select public.record_agent_worker_heartbeat(
    'command_worker', 'phase8-command-worker', 'b41dbd5', '{}'
  ) $$,
  'Service Role can report a safe command worker heartbeat'
);

select ok(
  public.claim_admin_catalog_operation('phase8-command-worker', now() - interval '2 minutes')
    ? 'operation_id',
  'Service Role command worker can atomically claim one catalog operation'
);

select is(
  (public.bootstrap_first_admin('admin@palhatch.fixture.invalid')->>'reused')::boolean,
  true,
  'first-admin bootstrap is idempotent for the existing administrator'
);

select is(
  (public.get_runtime_settings_for_agent()->>'version')::integer,
  3,
  'Service Role receives the current non-secret runtime settings version'
);

select * from finish();
rollback;
