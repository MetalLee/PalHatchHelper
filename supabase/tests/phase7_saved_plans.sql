begin;
set local search_path = public, extensions;

select plan(20);

select has_table('public', 'saved_breeding_plans', 'My Plans uses a route-save table');
select has_column('public', 'saved_breeding_plans', 'requester_user_id', 'saves are user-owned');
select has_column('public', 'saved_breeding_plans', 'route_id', 'saves reference one route');
select has_column('public', 'saved_breeding_plans', 'saved_at', 'saves record UTC time');
select has_function('public', 'save_breeding_plan', array['uuid'], 'save RPC exists');
select has_function('public', 'remove_breeding_plan', array['uuid'], 'remove RPC exists');
select has_function(
  'public', 'list_saved_breeding_plans',
  array['integer', 'timestamptz', 'uuid', 'timestamptz'],
  'list RPC exists'
);
select has_function(
  'public', 'get_saved_breeding_plan_detail', array['uuid'],
  'detail reference RPC exists'
);
select hasnt_function(
  'public', 'adopt_breeding_route', array['uuid', 'text'],
  'legacy route adoption RPC is removed'
);
select hasnt_function(
  'public', 'update_breeding_step_status', array['uuid', 'breeding_step_status'],
  'legacy manual progress RPC is removed'
);
select hasnt_function(
  'public', 'list_execution_plans',
  array['text', 'integer', 'timestamptz', 'uuid', 'timestamptz'],
  'legacy execution-plan list RPC is removed'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select is(
  (public.save_breeding_plan('62000000-0000-4000-8000-000000000001') ->> 'reused')::boolean,
  false,
  'first save creates a My Plans row'
);
select is(
  (public.save_breeding_plan('62000000-0000-4000-8000-000000000001') ->> 'reused')::boolean,
  true,
  'repeated save is idempotent'
);
select is(
  (select count(*) from public.saved_breeding_plans
    where route_id = '62000000-0000-4000-8000-000000000001'),
  1::bigint,
  'repeated save keeps one row'
);
select is(
  public.list_saved_breeding_plans(20) #>> '{data,items,0,route_id}',
  '62000000-0000-4000-8000-000000000001',
  'list returns the saved route'
);
select is(
  public.get_saved_breeding_plan_detail('62000000-0000-4000-8000-000000000001')
    #>> '{data,source_job_id}',
  '60000000-0000-4000-8000-000000000003',
  'detail resolves the immutable source job'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000003"}',
  true
);
set local role authenticated;

select throws_ok(
  $$ select public.save_breeding_plan('62000000-0000-4000-8000-000000000001') $$,
  'P0001',
  'ROUTE_NOT_FOUND',
  'another player cannot save a route they do not own'
);
select is(
  jsonb_array_length(public.list_saved_breeding_plans(20) #> '{data,items}'),
  0,
  'another player cannot list the saved route'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select is(
  (public.remove_breeding_plan('62000000-0000-4000-8000-000000000001') ->> 'removed')::boolean,
  true,
  'owner can remove a saved plan'
);
select is(
  (public.remove_breeding_plan('62000000-0000-4000-8000-000000000001') ->> 'removed')::boolean,
  false,
  'repeated removal is idempotent'
);

reset role;
select * from finish();
rollback;
