alter function private.publish_item_inventory_snapshot(uuid, uuid, jsonb)
  rename to publish_item_inventory_snapshot_unchecked_v1;

create function private.publish_item_inventory_snapshot(
  p_world_id uuid,
  p_source_inventory_snapshot_id uuid,
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text := coalesce(p_snapshot->>'item_inventory_status', 'unavailable');
  v_latest_snapshot_id uuid;
begin
  -- A partial parse with no stack that can survive the same ownership/catalog
  -- checks as the publisher is not a usable item snapshot. Preserve the
  -- independent latest-valid pointer while the Pal snapshot continues through
  -- private.publish_inventory_snapshot.
  if v_status = 'partial'
     and jsonb_typeof(p_snapshot->'bases') = 'array'
     and jsonb_typeof(p_snapshot->'item_stacks') = 'array'
     and not exists (
       select 1
         from jsonb_array_elements(p_snapshot->'item_stacks') as stack(value)
        where stack.value->>'resolution_status' = 'resolved'
          and stack.value->>'container_type' in (
            'storage_box', 'refrigerator', 'feed_box', 'production_output'
          )
          and exists (
            select 1
              from public.worlds as world
              join public.game_data_versions as version
                on version.id = world.active_game_data_version_id
               and version.status = 'published'
               and version.schema_version = '2.0.0'
              join public.catalog_items as item
                on item.version_id = version.id
               and (
                 item.item_id = stack.value->>'item_id'
                 or stack.value->>'item_id' = any(item.legacy_item_ids)
               )
             where world.id = p_world_id
          )
          and exists (
            select 1
              from jsonb_array_elements(p_snapshot->'bases') as base(value)
              join public.guilds as guild
                on guild.world_id = p_world_id
               and guild.game_guild_uid = base.value->>'guild_uid'
             where base.value->>'base_id' = stack.value->>'base_id'
          )
     ) then
    select world.latest_item_inventory_snapshot_id
      into v_latest_snapshot_id
      from public.worlds as world
     where world.id = p_world_id
       for update;
    return v_latest_snapshot_id;
  end if;

  return private.publish_item_inventory_snapshot_unchecked_v1(
    p_world_id,
    p_source_inventory_snapshot_id,
    p_snapshot
  );
end;
$$;

revoke all on function
  private.publish_item_inventory_snapshot(uuid, uuid, jsonb),
  private.publish_item_inventory_snapshot_unchecked_v1(uuid, uuid, jsonb)
from public, anon, authenticated, service_role;

comment on function private.publish_item_inventory_snapshot(uuid, uuid, jsonb) is
  'Publishes item inventory only when a partial parse still contains a resolvable base-owned stack; otherwise preserves the latest valid item pointer.';
