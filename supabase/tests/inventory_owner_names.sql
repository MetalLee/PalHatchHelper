begin;
set local search_path = public, extensions;

select plan(2);

update public.profiles
   set display_name = case id
     when '00000000-0000-4000-8000-000000000002' then 'Supabase Account A'
     when '00000000-0000-4000-8000-000000000003' then 'Supabase Account B'
     else display_name
   end
 where id in (
   '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000003'
 );

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select results_eq(
  $$
    select distinct owner_display_name
      from public.list_available_pals('all')
     order by owner_display_name
  $$,
  $$ values ('Fixture Player A'::text), ('Fixture Player B'::text) $$,
  'legacy inventory RPC always returns game player nicknames'
);

select results_eq(
  $$
    select distinct item->>'owner_display_name'
      from jsonb_array_elements(
        public.list_available_pals_page('all')->'data'->'items'
      ) as item
     order by item->>'owner_display_name'
  $$,
  $$ values ('Fixture Player A'::text), ('Fixture Player B'::text) $$,
  'paginated inventory RPC always returns game player nicknames'
);

select * from finish();
rollback;
