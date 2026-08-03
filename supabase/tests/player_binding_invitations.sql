begin;
set local search_path = public, extensions;

select plan(33);

select has_table(
  'public',
  'player_binding_invitations',
  'server-level binding invitations have a dedicated store'
);
select has_function(
  'public',
  'create_player_binding_invitation',
  array['uuid', 'text', 'integer'],
  'device owners create server-level hashed invitations through an RPC'
);
select has_function(
  'public',
  'get_player_binding_invitation',
  array['text'],
  'authenticated recipients preview a server invitation and its unbound members'
);
select has_function(
  'public',
  'accept_player_binding_invitation',
  array['text', 'uuid'],
  'authenticated recipients choose and bind an unbound member transactionally'
);
select ok(
  not has_table_privilege('authenticated', 'public.player_binding_invitations', 'select'),
  'authenticated users cannot read invitation hashes directly'
);

insert into public.players (
  id, world_id, guild_id, game_player_uid, nickname, level, last_seen_at
) values
  (
    '30000000-0000-4000-8000-000000000095',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'binding-invite-player-95', 'Invited Member', 25, '2026-07-13T09:00:00Z'
  ),
  (
    '30000000-0000-4000-8000-000000000096',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'binding-invite-player-96', 'Replacement Member', 26, '2026-07-13T09:00:00Z'
  ),
  (
    '30000000-0000-4000-8000-000000000097',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'binding-invite-player-97', 'Claimable Member', 27, '2026-07-13T09:00:00Z'
  );
insert into public.sync_devices (
  id, owner_user_id, world_id, name, platform, token_hash, token_prefix, revoked_at
) values
  (
    '90000000-0000-4000-8000-000000000095',
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Active binding fixture', 'linux-x64', repeat('a', 64), 'pbs_active12', null
  ),
  (
    '90000000-0000-4000-8000-000000000096',
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Revoked binding fixture', 'linux-x64', repeat('b', 64), 'pbs_revoke12', now()
  ),
  (
    '90000000-0000-4000-8000-000000000097',
    '00000000-0000-4000-8000-000000000002',
    null,
    'Unsynced binding fixture', 'linux-x64', repeat('c', 64), 'pbs_unsynced', null
  );

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.create_player_binding_invitation(
      '90000000-0000-4000-8000-000000000095',
      repeat('1', 64),
      86400
    )
  $$,
  'an active server owner can create one server-level invitation'
);

reset role;
select is(
  (
    select token_hash from public.player_binding_invitations
     where token_hash = repeat('1', 64)
  ),
  repeat('1', 64),
  'only the supplied SHA-256 token hash is persisted'
);
select ok(
  (
    select player_id is null from public.player_binding_invitations
     where token_hash = repeat('1', 64)
  ),
  'a server-level invitation is not bound to any single member'
);

set local role authenticated;
select lives_ok(
  $$
    select public.create_player_binding_invitation(
      '90000000-0000-4000-8000-000000000095',
      repeat('3', 64),
      86400
    )
  $$,
  'regenerating a server invitation succeeds'
);
reset role;
select ok(
  (
    select revoked_at is not null from public.player_binding_invitations
     where token_hash = repeat('1', 64)
  ),
  'regenerating revokes the previous server invitation'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000003"}',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select public.create_player_binding_invitation(
      '90000000-0000-4000-8000-000000000095',
      repeat('2', 64),
      86400
    )
  $$,
  'P0001',
  'SYNC_DEVICE_NOT_FOUND',
  'another account cannot invite members from a server it does not own'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select public.create_player_binding_invitation(
      '90000000-0000-4000-8000-000000000097',
      repeat('7', 64),
      86400
    )
  $$,
  'P0001',
  'SYNC_DEVICE_NOT_FOUND',
  'a paired server that has not synced yet cannot be invited'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000003"}',
  true
);
set local role authenticated;
select is(
  public.get_player_binding_invitation(repeat('3', 64))->>'device_name',
  'Active binding fixture',
  'a logged-in recipient can preview the paired server'
);
select is(
  public.get_player_binding_invitation(repeat('3', 64))->>'world_name',
  'Fixture Local World',
  'the preview includes the synced world name'
);
select is(
  jsonb_array_length(public.get_player_binding_invitation(repeat('3', 64))->'players'),
  3,
  'candidates contain only unbound members from the latest snapshot'
);
select lives_ok(
  $$
    select public.accept_player_binding_invitation(
      repeat('3', 64),
      '30000000-0000-4000-8000-000000000095'
    )
  $$,
  'an already-bound recipient can explicitly accept and rebind to a chosen member'
);
reset role;
select is(
  (
    select player_id::text from public.player_bindings
     where user_id = '00000000-0000-4000-8000-000000000003'
  ),
  '30000000-0000-4000-8000-000000000095',
  'accepting the invitation replaces the recipient binding'
);
select is(
  (
    select status::text from public.breeding_jobs
     where id = '60000000-0000-4000-8000-000000000002'
  ),
  'processing',
  'invitation rebinding preserves the recipient existing breeding job state'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000004"}',
  true
);
set local role authenticated;
select lives_ok(
  $$
    select public.accept_player_binding_invitation(
      repeat('3', 64),
      '30000000-0000-4000-8000-000000000096'
    )
  $$,
  'a second user can use the same server link to bind another unbound member'
);
reset role;
select is(
  (
    select player_id::text from public.player_bindings
     where user_id = '00000000-0000-4000-8000-000000000004'
  ),
  '30000000-0000-4000-8000-000000000096',
  'the second recipient binds their own chosen member'
);
select ok(
  (
    select consumed_at is null from public.player_binding_invitations
     where token_hash = repeat('3', 64)
  ),
  'accepting does not consume the shared link for later users'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000005"}',
  true
);
set local role authenticated;
select is(
  (
    select count(*)::integer
      from jsonb_array_elements(
        public.get_player_binding_invitation(repeat('3', 64))->'players'
      )
     where value->>'player_id' in (
       '30000000-0000-4000-8000-000000000095',
       '30000000-0000-4000-8000-000000000096'
     )
  ),
  0,
  'members bound through the shared link disappear from the candidate list'
);
select is(
  jsonb_array_length(public.get_player_binding_invitation(repeat('3', 64))->'players'),
  3,
  'rebinding frees the previous characters back into the candidate pool'
);
select throws_ok(
  $$
    select public.accept_player_binding_invitation(
      repeat('3', 64),
      '30000000-0000-4000-8000-000000000095'
    )
  $$,
  'P0001',
  'PLAYER_ALREADY_CLAIMED',
  'a member already bound by another account cannot be chosen'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;
select lives_ok(
  $$ select public.claim_synced_player('30000000-0000-4000-8000-000000000097') $$,
  'a paired device owner can still self-claim a remaining member'
);
select lives_ok(
  $$ select public.get_player_binding_invitation(repeat('3', 64)) $$,
  'self-service claiming does not consume the shared server link'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;
select lives_ok(
  $$
    select public.create_player_binding_invitation(
      '90000000-0000-4000-8000-000000000095',
      repeat('5', 64),
      300
    )
  $$,
  'the owner can create a short-lived server invitation'
);
reset role;
select ok(
  (
    select revoked_at is not null from public.player_binding_invitations
     where token_hash = repeat('3', 64)
  ),
  'creating a new server invitation revokes the previous one'
);
update public.player_binding_invitations
   set expires_at = now() - interval '1 minute',
       created_at = now() - interval '2 hours'
 where token_hash = repeat('5', 64);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000005"}',
  true
);
set local role authenticated;
select throws_ok(
  $$ select public.get_player_binding_invitation(repeat('5', 64)) $$,
  'P0001',
  'BINDING_INVITATION_EXPIRED',
  'an expired invitation cannot be previewed'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;
select lives_ok(
  $$ select public.revoke_sync_device('90000000-0000-4000-8000-000000000095') $$,
  'the owner can revoke the server after creating an invitation'
);
reset role;
select is(
  (
    select count(*)::integer from public.list_sync_devices()
     where id = '90000000-0000-4000-8000-000000000095'
  ),
  0,
  'a revoked server disappears from the owner device list immediately'
);
select throws_ok(
  $$ select public.get_player_binding_invitation(repeat('5', 64)) $$,
  'P0001',
  'BINDING_INVITATION_INVALID',
  'revoking a server invalidates its outstanding invitations'
);
select is(
  (
    select count(*)::integer from public.list_sync_server_members()
     where device_id = '90000000-0000-4000-8000-000000000095'
  ),
  0,
  'a revoked server no longer exposes members for self-service rebinding'
);

select * from finish();
rollback;
