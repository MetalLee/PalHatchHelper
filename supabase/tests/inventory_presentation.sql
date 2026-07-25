begin;
set local search_path = public, extensions;

select plan(2);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select results_eq(
  $$
    select item->'element_types'
    from jsonb_array_elements(
      public.list_available_pals_page_v2(
        p_scope => 'mine',
        p_query => 'test_parent_a'
      )->'data'->'items'
    ) as item
  $$,
  $$ values ('["fixture-neutral"]'::jsonb) $$,
  'inventory pages expose fixed-version catalog elements'
);

select results_eq(
  $$
    select (item->>'encyclopedia_no')::integer
    from jsonb_array_elements(
      public.list_available_pals_page_v2(
        p_scope => 'all',
        p_page_number => 1,
        p_page_size => 3
      )->'data'->'items'
    ) with ordinality as page(item, position)
    order by page.position
  $$,
  $$ values (1), (2), (3) $$,
  'inventory pagination is ordered by encyclopedia number'
);

select * from finish();
rollback;
