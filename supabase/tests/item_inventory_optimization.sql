begin;
set local search_path = public, extensions;

select plan(12);

insert into public.game_data_versions (
  id, package_hash, content_hash, schema_version, extractor_name,
  extractor_version, status, manifest, validation_report
) values (
  '5a000000-0000-4000-8000-000000000001', repeat('a', 64), repeat('b', 64),
  '2.0.0', 'item-optimization-fixture', '1.0.0', 'staging', '{}'::jsonb, '{}'::jsonb
);

insert into public.catalog_items (
  version_id, item_id, name_key, description_key, type_a, type_b,
  max_stack_count, enable_handcraft, is_legal, restore_health,
  restore_sanity, restore_satiety, corruption_factor, legacy_item_ids, metadata
) values
  (
    '5a000000-0000-4000-8000-000000000001', 'wood', 'fixture.item.wood', null,
    'material', 'wood', 9999, true, true, 0, 0, 0, 0, '{}', '{}'::jsonb
  ),
  (
    '5a000000-0000-4000-8000-000000000001', 'stone', 'fixture.item.stone', null,
    'material', 'stone', 9999, false, true, 0, 0, 0, 0, '{}', '{}'::jsonb
  );

insert into public.catalog_item_recipes (
  version_id, recipe_id, product_item_id, product_count, craft_kind,
  work_amount, workable_attribute, energy_type, energy_amount,
  unlock_item_id, deny_recipe_chain, metadata
) values (
  '5a000000-0000-4000-8000-000000000001', 'recipe.wood', 'wood', 1,
  'handcraft', 1, 1, null, 0, null, '{}', '{}'::jsonb
);
insert into public.catalog_item_recipe_ingredients (
  version_id, recipe_id, slot, item_id, count
) values (
  '5a000000-0000-4000-8000-000000000001', 'recipe.wood', 1, 'stone', 2
);

update public.game_data_versions
   set status = 'published', validated_at = statement_timestamp(),
       published_at = statement_timestamp()
 where id = '5a000000-0000-4000-8000-000000000001';
update public.worlds
   set active_game_data_version_id = '5a000000-0000-4000-8000-000000000001'
 where id = '10000000-0000-4000-8000-000000000001';

create temporary table optimized_item_result(snapshot_id uuid) on commit drop;
grant select on optimized_item_result to service_role;
insert into optimized_item_result
select private.publish_item_inventory_snapshot(
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'source_save_hash', repeat('d', 64),
    'captured_at', statement_timestamp(),
    'parser_name', 'item-optimization-fixture',
    'parser_version', '1.0.0',
    'item_inventory_status', 'available',
    'bases', jsonb_build_array(jsonb_build_object(
      'base_id', 'optimization-base', 'guild_uid', 'fixture-guild-alpha',
      'name', 'Optimization Base'
    )),
    'item_stacks', jsonb_build_array(
      jsonb_build_object(
        'container_id', 'optimization-base-box', 'guild_uid', 'fixture-guild-alpha',
        'base_id', 'optimization-base', 'item_id', 'wood', 'quantity', 10,
        'container_type', 'storage_box', 'slot_index', 0,
        'resolution_status', 'resolved'
      ),
      jsonb_build_object(
        'container_id', 'optimization-guild-box', 'guild_uid', 'fixture-guild-alpha',
        'base_id', null, 'item_id', 'wood', 'quantity', 5,
        'container_type', 'guild_chest', 'slot_index', 0,
        'resolution_status', 'resolved'
      )
    ),
    'item_recipe_capacities', jsonb_build_array(jsonb_build_object(
      'guild_uid', 'fixture-guild-alpha', 'item_id', 'wood', 'on_hand', 10,
      'craftable_additional', 0, 'obtainable_total', 10,
      'selected_recipe_id', null, 'status', 'ready',
      'recipe_plan', jsonb_build_array(), 'limiting_materials', jsonb_build_array()
    ))
  )
);

select is(
  (select quantity from public.item_inventory_totals
    where snapshot_id = (select snapshot_id from optimized_item_result)
      and item_id = 'wood'),
  15::bigint,
  'guild totals include both base storage and the guild chest'
);
select is(
  (select quantity from public.item_inventory_base_totals
    where snapshot_id = (select snapshot_id from optimized_item_result)
      and item_id = 'wood'),
  10::bigint,
  'base totals do not misattribute the guild chest to a base'
);
select ok(
  exists (select 1 from public.item_inventory_stack_items
    where snapshot_id = (select snapshot_id from optimized_item_result)
      and container_type = 'guild_chest' and resolution_status = 'resolved'
      and guild_id = '20000000-0000-4000-8000-000000000001' and base_id is null),
  'guild chest stacks retain resolved guild-only ownership'
);
select is(
  (select count(*)::integer from public.item_inventory_recipe_capacities
    where snapshot_id = (select snapshot_id from optimized_item_result)),
  0,
  'ingestion no longer persists recipe capacity calculations'
);
select is(
  (select count(*)::integer from public.item_inventory_five_minute_samples
    where world_id = '10000000-0000-4000-8000-000000000001'
      and guild_id = '20000000-0000-4000-8000-000000000001'),
  1,
  'publishing creates one shared five-minute sample marker per guild bucket'
);
select is(
  (select quantity from public.item_inventory_five_minute_totals
    where world_id = '10000000-0000-4000-8000-000000000001'
      and guild_id = '20000000-0000-4000-8000-000000000001'
      and item_id = 'wood'),
  15::bigint,
  'publishing records the current total in the active five-minute bucket'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select is(
  public.get_guild_item_inventory('en-US') #>> '{items,0,guild_chest_quantity}',
  '5',
  'the browser aggregate reports the guild chest contribution separately'
);
select ok(
  jsonb_array_length(public.get_guild_item_inventory('en-US')->'capacity_recipes') = 1
  and jsonb_array_length(public.get_guild_item_inventory('en-US') #> '{items,0,trend_1h}') = 13,
  'one aggregate request returns recipe context and the shared 13-point axis'
);

reset role;
select private.publish_item_inventory_snapshot(
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'source_save_hash', repeat('e', 64),
    'captured_at', statement_timestamp(),
    'parser_name', 'item-optimization-fixture',
    'parser_version', '1.0.1',
    'item_inventory_status', 'available',
    'bases', jsonb_build_array(),
    'item_stacks', jsonb_build_array(),
    'item_recipe_capacities', jsonb_build_array()
  )
);
update public.item_inventory_snapshots
   set created_at = statement_timestamp() - interval '31 minutes'
 where id = (select snapshot_id from optimized_item_result);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select public.cleanup_expired_inventory_snapshot_payloads(25);

select isnt(
  (select payload_purged_at from public.item_inventory_snapshots
    where id = (select snapshot_id from optimized_item_result)),
  null::timestamptz,
  'a superseded item payload older than 30 minutes becomes an audit stub'
);
select is(
  (select count(*)::integer from public.item_inventory_stack_items
    where snapshot_id = (select snapshot_id from optimized_item_result)),
  0,
  'item stack payload rows are removed with the superseded snapshot payload'
);
select ok(
  exists (select 1 from public.item_inventory_snapshots as snapshot
    join public.worlds as world on world.latest_item_inventory_snapshot_id = snapshot.id
    where world.id = '10000000-0000-4000-8000-000000000001'
      and snapshot.payload_purged_at is null),
  'cleanup always preserves the latest item snapshot payload'
);

reset role;
select isnt(
  private.publish_item_inventory_snapshot(
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'source_save_hash', repeat('d', 64),
      'captured_at', statement_timestamp(),
      'parser_name', 'item-optimization-fixture',
      'parser_version', '1.0.0',
      'item_inventory_status', 'available',
      'bases', jsonb_build_array(),
      'item_stacks', jsonb_build_array(),
      'item_recipe_capacities', jsonb_build_array()
    )
  ),
  (select snapshot_id from optimized_item_result),
  'the same source hash creates a fresh payload after its prior payload was purged'
);

select * from finish();
rollback;
