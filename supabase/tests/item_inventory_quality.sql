begin;
set local search_path = public, extensions;

select plan(4);

insert into public.game_data_versions (
  id, package_hash, content_hash, schema_version, extractor_name,
  extractor_version, status, manifest, validation_report, validated_at,
  published_at
) values (
  '59000000-0000-4000-8000-000000000001',
  repeat('9', 64), repeat('8', 64), '2.0.0', 'item-quality-fixture',
  '1.0.0', 'staging', '{}'::jsonb, '{}'::jsonb,
  null, null
);

insert into public.catalog_items (
  version_id, item_id, name_key, description_key, type_a, type_b,
  max_stack_count, enable_handcraft, is_legal, restore_health,
  restore_sanity, restore_satiety, corruption_factor, legacy_item_ids,
  metadata
) values (
  '59000000-0000-4000-8000-000000000001',
  'wood', 'fixture.item.wood', null, 'material', 'wood',
  9999, false, true, 0, 0, 0, 0, '{}', '{}'::jsonb
);

update public.game_data_versions
set
  status = 'published',
  validated_at = '2026-07-31T00:00:00Z',
  published_at = '2026-07-31T00:01:00Z'
where id = '59000000-0000-4000-8000-000000000001';

update public.worlds
set active_game_data_version_id = '59000000-0000-4000-8000-000000000001'
where id = '10000000-0000-4000-8000-000000000001';

create temporary table item_quality_result (
  first_snapshot_id uuid,
  second_snapshot_id uuid
) on commit drop;

insert into item_quality_result (first_snapshot_id)
select private.publish_item_inventory_snapshot(
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'source_save_hash', repeat('1', 64),
    'captured_at', '2026-07-31T01:00:00Z',
    'parser_name', 'item-quality-fixture',
    'parser_version', '1.0.0',
    'item_inventory_status', 'available',
    'bases', jsonb_build_array(jsonb_build_object(
      'base_id', 'fixture-quality-base',
      'guild_uid', 'fixture-guild-alpha',
      'name', 'Fixture Quality Base'
    )),
    'item_stacks', jsonb_build_array(jsonb_build_object(
      'container_id', 'fixture-quality-container',
      'guild_uid', 'fixture-guild-alpha',
      'base_id', 'fixture-quality-base',
      'item_id', 'wood',
      'quantity', 12,
      'container_type', 'storage_box',
      'slot_index', 0,
      'resolution_status', 'resolved'
    )),
    'item_recipe_capacities', '[]'::jsonb
  )
);

update item_quality_result
set second_snapshot_id = private.publish_item_inventory_snapshot(
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'source_save_hash', repeat('2', 64),
    'captured_at', '2026-07-31T02:00:00Z',
    'parser_name', 'item-quality-fixture',
    'parser_version', '1.0.1',
    'item_inventory_status', 'partial',
    'bases', jsonb_build_array(jsonb_build_object(
      'base_id', 'fixture-quality-base',
      'guild_uid', 'fixture-guild-alpha',
      'name', 'Fixture Quality Base'
    )),
    'item_stacks', '[]'::jsonb,
    'item_recipe_capacities', '[]'::jsonb
  )
);

select is(
  (select second_snapshot_id from item_quality_result),
  (select first_snapshot_id from item_quality_result),
  'a partial snapshot with no resolved stacks preserves the prior valid snapshot'
);

select is(
  (
    select latest_item_inventory_snapshot_id
    from public.worlds
    where id = '10000000-0000-4000-8000-000000000001'
  ),
  (select first_snapshot_id from item_quality_result),
  'the world latest-item pointer remains on the prior valid snapshot'
);

select is(
  (
    select count(*)::bigint
    from public.item_inventory_snapshots
    where parser_name = 'item-quality-fixture'
  ),
  1::bigint,
  'the invalid zero-stack partial snapshot is not retained as history'
);

select is(
  (
    select total.quantity
    from public.item_inventory_totals as total
    join item_quality_result as result
      on result.first_snapshot_id = total.snapshot_id
    where total.item_id = 'wood'
  ),
  12::bigint,
  'the prior valid item quantity remains queryable'
);

select * from finish();
rollback;
