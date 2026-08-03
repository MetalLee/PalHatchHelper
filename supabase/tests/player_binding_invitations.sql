begin;
set local search_path = public, extensions;

select plan(27);

select has_table(
  'public',
  'player_binding_invitations',
  'one-time player binding invitations have a dedicated store'
);
select has_function(
  'public',
  'list_sync_server_members',
  array[]::text[],
  'active server members are projected by a browser-safe RPC'
);
select has_function(
  'public',
  'create_player_binding_invitation',
  array['uuid', 'uuid', 'text', 'integer'],
  'device owners create hashed invitations through an RPC'
);
select has_function(
  'public',
  'get_player_binding_invitation',
  array['text'],
  'authenticated recipients preview an invitation through an RPC'
);
select has_function(
  'public',
  'accept_player_binding_invitation',
  array['text'],
  'authenticated recipients accept an invitation transactionally'
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
  );

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer from public.list_sync_devices()
     where id in (
       '90000000-0000-4000-8000-000000000095',
       '90000000-0000-4000-8000-000000000096'
     )
  ),
  1,
  'the browser device list excludes revoked servers'
);
select is(
  (
    select count(*)::integer from public.list_sync_server_members()
     where device_id = '90000000-0000-4000-8000-000000000095'
       and player_id in (
       '30000000-0000-4000-8000-000000000095',
       '30000000-0000-4000-8000-000000000096'
     )
  ),
  2,
  'an active server owner sees latest snapshot members'
);
select is(
  (
    select concat_ws('|', is_bound::text, is_current_user::text)
      from public.list_sync_server_members()
     where device_id = '90000000-0000-4000-8000-000000000095'
       and player_id = '30000000-0000-4000-8000-000000000001'
  ),
  'true|true',
  'the member projection marks the current bound character without exposing an account id'
);
select lives_ok(
  $$ select public.claim_synced_player('30000000-0000-4000-8000-000000000096') $$,
  'an already-bound device owner can choose This is me for an unbound member'
);

reset role;
select is(
  (
    select player_id::text from public.player_bindings
     where user_id = '00000000-0000-4000-8000-000000000002'
  ),
  '30000000-0000-4000-8000-000000000096',
  'self-service claiming atomically replaces the existing binding'
);
select is(
  (
    select status::text from public.breeding_jobs
     where id = '60000000-0000-4000-8000-000000000001'
  ),
  'pending',
  'self-service rebinding preserves existing breeding job state'
);
update public.player_bindings
   set player_id = '30000000-0000-4000-8000-000000000001'
 where user_id = '00000000-0000-4000-8000-000000000002';

set local role authenticated;
select lives_ok(
  $$
    select public.create_player_binding_invitation(
      '90000000-0000-4000-8000-000000000095',
      '30000000-0000-4000-8000-000000000095',
      repeat('1', 64),
      86400
    )
  $$,
  'an active server owner can create a hashed member invitation'
);
reset role;
select is(
  (
    select token_hash from public.player_binding_invitations
     where player_id = '30000000-0000-4000-8000-000000000095'
  ),
  repeat('1', 64),
  'only the supplied SHA-256 token hash is persisted'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000003"}',
  true
);
set local role authenticated;
select is(
  public.get_player_binding_invitation(repeat('1', 64))->>'nickname',
  'Invited Member',
  'a logged-in recipient can preview the invited character'
);
select lives_ok(
  $$ select public.accept_player_binding_invitation(repeat('1', 64)) $$,
  'an already-bound recipient can explicitly accept and rebind'
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
set local role authenticated;
select throws_ok(
  $$ select public.accept_player_binding_invitation(repeat('1', 64)) $$,
  'P0001',
  'BINDING_INVITATION_INVALID',
  'a consumed invitation cannot be reused'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000004"}',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select public.create_player_binding_invitation(
      '90000000-0000-4000-8000-000000000095',
      '30000000-0000-4000-8000-000000000096',
      repeat('2', 64),
      86400
    )
  $$,
  'P0001',
  'SYNC_DEVICE_NOT_FOUND',
  'another account cannot invite members from a server it does not own'
);

reset role;
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
      '30000000-0000-4000-8000-000000000096',
      repeat('3', 64),
      86400
    )
  $$,
  'the owner can create an invitation for another unbound member'
);
select lives_ok(
  $$
    select public.create_player_binding_invitation(
      '90000000-0000-4000-8000-000000000095',
      '30000000-0000-4000-8000-000000000096',
      repeat('4', 64),
      86400
    )
  $$,
  'regenerating an invitation succeeds for the same unbound member'
);
reset role;
select ok(
  (
    select revoked_at is not null from public.player_binding_invitations
     where token_hash = repeat('3', 64)
  ),
  'regenerating revokes the previous invitation'
);

set local role authenticated;
select lives_ok(
  $$ select public.revoke_sync_device('90000000-0000-4000-8000-000000000095') $$,
  'the owner can revoke the server after creating an invitation'
);
select is(
  (
    select count(*)::integer from public.list_sync_devices()
     where id = '90000000-0000-4000-8000-000000000095'
  ),
  0,
  'a revoked server disappears from the owner device list immediately'
);
select throws_ok(
  $$ select public.get_player_binding_invitation(repeat('4', 64)) $$,
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
