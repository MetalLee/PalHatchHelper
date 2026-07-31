begin;
set local search_path = public, extensions;

select plan(24);

select has_table('public', 'item_inventory_snapshots', 'item snapshots are stored independently');
select has_table('public', 'item_inventory_bases', 'snapshot base ownership is retained');
select has_table('public', 'item_inventory_stack_items', 'short-lived audited stack detail exists');
select has_table('public', 'item_inventory_totals', 'guild item totals exist');
select has_table('public', 'item_inventory_base_totals', 'base item totals exist');
select has_table('public', 'item_inventory_recipe_capacities', 'deterministic recipe capacities exist');
select has_table('public', 'item_inventory_hourly_rollups', 'hourly item rollups exist');
select has_table('public', 'item_inventory_daily_rollups', 'daily item rollups exist');
select has_table('public', 'item_inventory_five_minute_samples', 'five-minute sample markers exist');
select has_table('public', 'item_inventory_five_minute_totals', 'five-minute aggregate totals exist');

select has_column(
  'public', 'worlds', 'latest_item_inventory_snapshot_id',
  'worlds retain a separate latest valid item snapshot pointer'
);
select has_column(
  'public', 'item_inventory_snapshots', 'payload_purged_at',
  'item payload expiry is recorded without deleting the audit header'
);

select has_function(
  'public', 'get_guild_item_inventory', array['text'],
  'guild aggregate inventory RPC exists'
);
select has_function(
  'public', 'get_guild_item_inventory_trend',
  array['text', 'text', 'timestamp with time zone', 'timestamp with time zone', 'text'],
  'item trend RPC exists'
);
select has_function(
  'public', 'cleanup_item_inventory_history', array['timestamp with time zone'],
  'bounded item history cleanup RPC exists'
);

select table_privs_are(
  'public', 'item_inventory_stack_items', 'authenticated', array[]::text[],
  'authenticated clients cannot read raw container stacks'
);
select table_privs_are(
  'public', 'item_inventory_totals', 'authenticated', array['SELECT'],
  'authenticated clients receive aggregate totals only'
);
select table_privs_are(
  'public', 'item_inventory_recipe_capacities', 'authenticated', array['SELECT'],
  'authenticated clients may read deterministic aggregate capacities'
);

select ok(
  has_function_privilege('authenticated', 'public.get_guild_item_inventory(text)', 'execute'),
  'authenticated users may read their guild aggregate inventory'
);
select ok(
  not has_table_privilege('authenticated', 'public.item_inventory_five_minute_samples', 'select')
  and not has_table_privilege('authenticated', 'public.item_inventory_five_minute_totals', 'select'),
  'five-minute samples are exposed only through the aggregate RPC'
);
select ok(
  has_function_privilege(
    'service_role', 'public.sample_latest_item_inventory(uuid, timestamp with time zone)', 'execute'
  ) and not has_function_privilege(
    'authenticated', 'public.sample_latest_item_inventory(uuid, timestamp with time zone)', 'execute'
  ),
  'only service role may trigger a five-minute sample'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_guild_item_inventory_trend(text, text, timestamp with time zone, timestamp with time zone, text)',
    'execute'
  ),
  'authenticated users may read their guild item trends'
);
select ok(
  has_function_privilege(
    'service_role', 'public.cleanup_item_inventory_history(timestamp with time zone)', 'execute'
  ) and not has_function_privilege(
    'authenticated', 'public.cleanup_item_inventory_history(timestamp with time zone)', 'execute'
  ),
  'only service role may execute item history cleanup'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.item_inventory_recipe_capacities'::regclass),
  'recipe capacities enforce row-level security'
);

select * from finish();
rollback;
