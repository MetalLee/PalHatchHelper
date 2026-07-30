create type public.item_inventory_quality_status as enum ('valid', 'partial');

create table public.item_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete restrict,
  source_inventory_snapshot_id uuid not null,
  source_save_hash text not null,
  captured_at timestamptz not null,
  parser_name text not null,
  parser_version text not null,
  game_data_version_id uuid not null references public.game_data_versions(id) on delete restrict,
  quality_status public.item_inventory_quality_status not null,
  resolved_stack_count integer not null,
  unresolved_stack_count integer not null,
  created_at timestamptz not null default now(),
  constraint item_inventory_snapshots_source_fkey
    foreign key (source_inventory_snapshot_id, world_id)
    references public.inventory_snapshots(id, world_id) on delete restrict,
  constraint item_inventory_snapshots_counts_check
    check (resolved_stack_count >= 0 and unresolved_stack_count >= 0),
  constraint item_inventory_snapshots_hash_check
    check (char_length(source_save_hash) between 32 and 128),
  constraint item_inventory_snapshots_parser_check check (
    char_length(parser_name) between 1 and 100
    and char_length(parser_version) between 1 and 100
  ),
  constraint item_inventory_snapshots_id_world_key unique (id, world_id),
  constraint item_inventory_snapshots_source_key unique (
    world_id, source_save_hash, parser_name, parser_version, game_data_version_id
  )
);

create index item_inventory_snapshots_world_captured_idx
  on public.item_inventory_snapshots(world_id, captured_at desc);

alter table public.worlds add column latest_item_inventory_snapshot_id uuid;
alter table public.worlds
  add constraint worlds_latest_item_inventory_snapshot_fkey
  foreign key (latest_item_inventory_snapshot_id, id)
  references public.item_inventory_snapshots(id, world_id)
  on delete restrict deferrable initially immediate;

create table public.item_inventory_bases (
  snapshot_id uuid not null,
  world_id uuid not null,
  guild_id uuid not null,
  base_id text not null,
  name text,
  primary key (snapshot_id, base_id),
  constraint item_inventory_bases_snapshot_fkey
    foreign key (snapshot_id, world_id)
    references public.item_inventory_snapshots(id, world_id) on delete restrict,
  constraint item_inventory_bases_guild_fkey
    foreign key (guild_id, world_id)
    references public.guilds(id, world_id) on delete restrict,
  constraint item_inventory_bases_id_check check (char_length(base_id) between 1 and 160),
  constraint item_inventory_bases_name_check check (name is null or char_length(name) <= 160)
);

create table public.item_inventory_stack_items (
  snapshot_id uuid not null,
  world_id uuid not null,
  guild_id uuid,
  base_id text,
  container_id text not null,
  slot_index integer not null,
  item_id text not null,
  quantity bigint not null,
  container_type text not null,
  resolution_status text not null,
  captured_at timestamptz not null,
  primary key (snapshot_id, container_id, slot_index),
  constraint item_inventory_stack_items_snapshot_fkey
    foreign key (snapshot_id, world_id)
    references public.item_inventory_snapshots(id, world_id) on delete restrict,
  constraint item_inventory_stack_items_guild_fkey
    foreign key (guild_id, world_id)
    references public.guilds(id, world_id) on delete restrict,
  constraint item_inventory_stack_items_base_fkey
    foreign key (snapshot_id, base_id)
    references public.item_inventory_bases(snapshot_id, base_id) on delete restrict,
  constraint item_inventory_stack_items_values_check check (
    slot_index between 0 and 100000 and quantity > 0
    and char_length(container_id) between 1 and 160
    and char_length(item_id) between 1 and 120
  ),
  constraint item_inventory_stack_items_container_type_check check (
    container_type in ('storage_box', 'refrigerator', 'feed_box', 'production_output', 'unknown')
  ),
  constraint item_inventory_stack_items_resolution_check check (
    resolution_status in ('resolved', 'unresolved', 'unsupported')
    and (resolution_status <> 'resolved' or (guild_id is not null and base_id is not null))
  )
);

create index item_inventory_stack_items_retention_idx
  on public.item_inventory_stack_items(captured_at, snapshot_id);

create table public.item_inventory_totals (
  snapshot_id uuid not null,
  world_id uuid not null,
  guild_id uuid not null,
  item_id text not null,
  quantity bigint not null,
  primary key (snapshot_id, guild_id, item_id),
  constraint item_inventory_totals_snapshot_fkey
    foreign key (snapshot_id, world_id)
    references public.item_inventory_snapshots(id, world_id) on delete restrict,
  constraint item_inventory_totals_guild_fkey
    foreign key (guild_id, world_id)
    references public.guilds(id, world_id) on delete restrict,
  constraint item_inventory_totals_quantity_check check (quantity >= 0)
);

create table public.item_inventory_base_totals (
  snapshot_id uuid not null,
  world_id uuid not null,
  guild_id uuid not null,
  base_id text not null,
  item_id text not null,
  quantity bigint not null,
  primary key (snapshot_id, guild_id, base_id, item_id),
  constraint item_inventory_base_totals_snapshot_fkey
    foreign key (snapshot_id, world_id)
    references public.item_inventory_snapshots(id, world_id) on delete restrict,
  constraint item_inventory_base_totals_guild_fkey
    foreign key (guild_id, world_id)
    references public.guilds(id, world_id) on delete restrict,
  constraint item_inventory_base_totals_base_fkey
    foreign key (snapshot_id, base_id)
    references public.item_inventory_bases(snapshot_id, base_id) on delete restrict,
  constraint item_inventory_base_totals_quantity_check check (quantity >= 0)
);

create table public.item_inventory_recipe_capacities (
  snapshot_id uuid not null,
  world_id uuid not null,
  guild_id uuid not null,
  game_data_version_id uuid not null,
  item_id text not null,
  on_hand bigint not null,
  craftable_additional bigint not null,
  obtainable_total bigint not null,
  selected_recipe_id text,
  status text not null,
  recipe_plan jsonb not null,
  limiting_materials jsonb not null,
  primary key (snapshot_id, guild_id, item_id),
  constraint item_inventory_recipe_capacities_snapshot_fkey
    foreign key (snapshot_id, world_id)
    references public.item_inventory_snapshots(id, world_id) on delete restrict,
  constraint item_inventory_recipe_capacities_guild_fkey
    foreign key (guild_id, world_id)
    references public.guilds(id, world_id) on delete restrict,
  constraint item_inventory_recipe_capacities_item_fkey
    foreign key (game_data_version_id, item_id)
    references public.catalog_items(version_id, item_id) on delete restrict,
  constraint item_inventory_recipe_capacities_recipe_fkey
    foreign key (game_data_version_id, selected_recipe_id)
    references public.catalog_item_recipes(version_id, recipe_id) on delete restrict,
  constraint item_inventory_recipe_capacities_values_check check (
    on_hand >= 0 and craftable_additional >= 0
    and obtainable_total = on_hand + craftable_additional
    and status in ('ready', 'no_supported_recipe', 'recipe_cycle', 'complexity_limit')
    and jsonb_typeof(recipe_plan) = 'array'
    and jsonb_typeof(limiting_materials) = 'array'
  )
);

create table public.item_inventory_hourly_rollups (
  world_id uuid not null references public.worlds(id) on delete restrict,
  guild_id uuid not null,
  bucket_at timestamptz not null,
  base_key text not null,
  item_id text not null,
  quantity bigint not null,
  sampled_at timestamptz not null,
  primary key (world_id, guild_id, bucket_at, base_key, item_id),
  constraint item_inventory_hourly_guild_fkey
    foreign key (guild_id, world_id)
    references public.guilds(id, world_id) on delete restrict,
  constraint item_inventory_hourly_bucket_check
    check (bucket_at = date_trunc('hour', bucket_at, 'UTC') and quantity >= 0)
);

create table public.item_inventory_daily_rollups (
  world_id uuid not null references public.worlds(id) on delete restrict,
  guild_id uuid not null,
  bucket_at timestamptz not null,
  base_key text not null,
  item_id text not null,
  quantity bigint not null,
  sampled_at timestamptz not null,
  primary key (world_id, guild_id, bucket_at, base_key, item_id),
  constraint item_inventory_daily_guild_fkey
    foreign key (guild_id, world_id)
    references public.guilds(id, world_id) on delete restrict,
  constraint item_inventory_daily_bucket_check
    check (bucket_at = date_trunc('day', bucket_at, 'UTC') and quantity >= 0)
);

revoke all on table
  public.item_inventory_snapshots,
  public.item_inventory_bases,
  public.item_inventory_stack_items,
  public.item_inventory_totals,
  public.item_inventory_base_totals,
  public.item_inventory_recipe_capacities,
  public.item_inventory_hourly_rollups,
  public.item_inventory_daily_rollups
from public, anon, authenticated, service_role;

grant select on table
  public.item_inventory_snapshots,
  public.item_inventory_bases,
  public.item_inventory_totals,
  public.item_inventory_base_totals,
  public.item_inventory_recipe_capacities,
  public.item_inventory_hourly_rollups,
  public.item_inventory_daily_rollups
to authenticated, service_role;
grant select on table public.item_inventory_stack_items to service_role;

alter table public.item_inventory_snapshots enable row level security;
alter table public.item_inventory_bases enable row level security;
alter table public.item_inventory_stack_items enable row level security;
alter table public.item_inventory_totals enable row level security;
alter table public.item_inventory_base_totals enable row level security;
alter table public.item_inventory_recipe_capacities enable row level security;
alter table public.item_inventory_hourly_rollups enable row level security;
alter table public.item_inventory_daily_rollups enable row level security;

create function private.can_access_item_inventory_guild(p_guild_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_admin() or exists (
    select 1 from public.players as player
     where player.id = public.current_player_id() and player.guild_id = p_guild_id
  );
$$;

create policy item_inventory_snapshots_guild_select
  on public.item_inventory_snapshots for select to authenticated
  using (
    public.is_admin() or exists (
      select 1
        from public.item_inventory_totals as total
       where total.snapshot_id = item_inventory_snapshots.id
         and private.can_access_item_inventory_guild(total.guild_id)
    )
  );
create policy item_inventory_bases_guild_select
  on public.item_inventory_bases for select to authenticated
  using (private.can_access_item_inventory_guild(guild_id));
create policy item_inventory_totals_guild_select
  on public.item_inventory_totals for select to authenticated
  using (private.can_access_item_inventory_guild(guild_id));
create policy item_inventory_base_totals_guild_select
  on public.item_inventory_base_totals for select to authenticated
  using (private.can_access_item_inventory_guild(guild_id));
create policy item_inventory_recipe_capacities_guild_select
  on public.item_inventory_recipe_capacities for select to authenticated
  using (private.can_access_item_inventory_guild(guild_id));
create policy item_inventory_hourly_guild_select
  on public.item_inventory_hourly_rollups for select to authenticated
  using (private.can_access_item_inventory_guild(guild_id));
create policy item_inventory_daily_guild_select
  on public.item_inventory_daily_rollups for select to authenticated
  using (private.can_access_item_inventory_guild(guild_id));

alter function private.publish_inventory_snapshot(uuid, jsonb)
  rename to publish_pal_inventory_snapshot;

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
  v_version_id uuid;
  v_snapshot_id uuid;
  v_existing_id uuid;
  v_record jsonb;
  v_guild_id uuid;
  v_base_id text;
  v_item_id text;
  v_resolved integer := 0;
  v_unresolved integer := 0;
  v_captured_at timestamptz := (p_snapshot->>'captured_at')::timestamptz;
begin
  if v_status = 'unavailable' then
    return (select latest_item_inventory_snapshot_id from public.worlds where id = p_world_id);
  end if;
  if v_status not in ('available', 'partial')
     or jsonb_typeof(p_snapshot->'bases') <> 'array'
     or jsonb_typeof(p_snapshot->'item_stacks') <> 'array'
     or jsonb_typeof(coalesce(p_snapshot->'item_recipe_capacities', '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'ITEM_INVENTORY_SNAPSHOT_INVALID';
  end if;

  select world.active_game_data_version_id into v_version_id
    from public.worlds as world where world.id = p_world_id for update;
  if v_version_id is null or not exists (
    select 1 from public.game_data_versions as version
     where version.id = v_version_id and version.status = 'published'
       and version.schema_version = '2.0.0'
  ) then
    return (select latest_item_inventory_snapshot_id from public.worlds where id = p_world_id);
  end if;

  select snapshot.id into v_existing_id
    from public.item_inventory_snapshots as snapshot
   where snapshot.world_id = p_world_id
     and snapshot.source_save_hash = p_snapshot->>'source_save_hash'
     and snapshot.parser_name = p_snapshot->>'parser_name'
     and snapshot.parser_version = p_snapshot->>'parser_version'
     and snapshot.game_data_version_id = v_version_id;
  if v_existing_id is not null then
    update public.worlds set latest_item_inventory_snapshot_id = v_existing_id
     where id = p_world_id;
    return v_existing_id;
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_snapshot->'item_stacks') as stack(value)
     group by value->>'container_id', (value->>'slot_index')::integer
    having count(*) > 1
  ) then
    raise exception using errcode = 'P0001', message = 'ITEM_INVENTORY_CONTAINER_DUPLICATE';
  end if;

  v_snapshot_id := gen_random_uuid();
  insert into public.item_inventory_snapshots (
    id, world_id, source_inventory_snapshot_id, source_save_hash, captured_at,
    parser_name, parser_version, game_data_version_id, quality_status,
    resolved_stack_count, unresolved_stack_count
  ) values (
    v_snapshot_id, p_world_id, p_source_inventory_snapshot_id,
    p_snapshot->>'source_save_hash', v_captured_at, p_snapshot->>'parser_name',
    p_snapshot->>'parser_version', v_version_id,
    case
      when v_status = 'partial' then 'partial'::public.item_inventory_quality_status
      else 'valid'::public.item_inventory_quality_status
    end,
    0, 0
  );

  for v_record in select value from jsonb_array_elements(p_snapshot->'bases')
  loop
    select guild.id into v_guild_id from public.guilds as guild
     where guild.world_id = p_world_id and guild.game_guild_uid = v_record->>'guild_uid';
    if v_guild_id is not null then
      insert into public.item_inventory_bases (
        snapshot_id, world_id, guild_id, base_id, name
      ) values (
        v_snapshot_id, p_world_id, v_guild_id, v_record->>'base_id', v_record->>'name'
      ) on conflict (snapshot_id, base_id) do nothing;
    end if;
  end loop;

  for v_record in select value from jsonb_array_elements(p_snapshot->'item_stacks')
  loop
    v_guild_id := null;
    v_base_id := null;
    v_item_id := null;
    select catalog_item.item_id into v_item_id
      from public.catalog_items as catalog_item
     where catalog_item.version_id = v_version_id
       and (
         catalog_item.item_id = v_record->>'item_id'
         or v_record->>'item_id' = any(catalog_item.legacy_item_ids)
       )
     order by case when catalog_item.item_id = v_record->>'item_id' then 0 else 1 end
     limit 1;
    if v_record->>'resolution_status' = 'resolved'
       and v_record->>'container_type' in (
         'storage_box', 'refrigerator', 'feed_box', 'production_output'
       )
       and v_item_id is not null then
      select base.guild_id, base.base_id into v_guild_id, v_base_id
        from public.item_inventory_bases as base
       where base.snapshot_id = v_snapshot_id
         and base.base_id = v_record->>'base_id';
    end if;
    if v_guild_id is null then v_unresolved := v_unresolved + 1;
    else v_resolved := v_resolved + 1;
    end if;

    insert into public.item_inventory_stack_items (
      snapshot_id, world_id, guild_id, base_id, container_id, slot_index,
      item_id, quantity, container_type, resolution_status, captured_at
    ) values (
      v_snapshot_id, p_world_id, v_guild_id, v_base_id,
      v_record->>'container_id', (v_record->>'slot_index')::integer,
      coalesce(v_item_id, v_record->>'item_id'), (v_record->>'quantity')::bigint,
      v_record->>'container_type',
      case when v_guild_id is null then
        case when v_record->>'resolution_status' = 'unsupported' then 'unsupported' else 'unresolved' end
      else 'resolved' end,
      v_captured_at
    );
  end loop;

  insert into public.item_inventory_totals (
    snapshot_id, world_id, guild_id, item_id, quantity
  )
  select v_snapshot_id, p_world_id, stack.guild_id, stack.item_id, sum(stack.quantity)
    from public.item_inventory_stack_items as stack
   where stack.snapshot_id = v_snapshot_id and stack.resolution_status = 'resolved'
   group by stack.guild_id, stack.item_id;

  insert into public.item_inventory_totals (
    snapshot_id, world_id, guild_id, item_id, quantity
  )
  select v_snapshot_id, p_world_id, previous.guild_id, previous.item_id, 0
    from public.worlds as world
    join public.item_inventory_totals as previous
      on previous.snapshot_id = world.latest_item_inventory_snapshot_id
    join public.catalog_items as catalog_item
      on catalog_item.version_id = v_version_id and catalog_item.item_id = previous.item_id
   where world.id = p_world_id
     and exists (
       select 1 from public.item_inventory_bases as base
        where base.snapshot_id = v_snapshot_id and base.guild_id = previous.guild_id
     )
     and not exists (
       select 1 from public.item_inventory_totals as current
        where current.snapshot_id = v_snapshot_id
          and current.guild_id = previous.guild_id
          and current.item_id = previous.item_id
     );

  insert into public.item_inventory_base_totals (
    snapshot_id, world_id, guild_id, base_id, item_id, quantity
  )
  select v_snapshot_id, p_world_id, stack.guild_id, stack.base_id, stack.item_id, sum(stack.quantity)
    from public.item_inventory_stack_items as stack
   where stack.snapshot_id = v_snapshot_id and stack.resolution_status = 'resolved'
   group by stack.guild_id, stack.base_id, stack.item_id;

  insert into public.item_inventory_base_totals (
    snapshot_id, world_id, guild_id, base_id, item_id, quantity
  )
  select v_snapshot_id, p_world_id, previous.guild_id, previous.base_id, previous.item_id, 0
    from public.worlds as world
    join public.item_inventory_base_totals as previous
      on previous.snapshot_id = world.latest_item_inventory_snapshot_id
    join public.item_inventory_bases as base
      on base.snapshot_id = v_snapshot_id
     and base.guild_id = previous.guild_id
     and base.base_id = previous.base_id
    join public.catalog_items as catalog_item
      on catalog_item.version_id = v_version_id and catalog_item.item_id = previous.item_id
   where world.id = p_world_id
     and not exists (
       select 1 from public.item_inventory_base_totals as current
        where current.snapshot_id = v_snapshot_id
          and current.guild_id = previous.guild_id
          and current.base_id = previous.base_id
          and current.item_id = previous.item_id
     );

  if exists (
    select 1
      from jsonb_array_elements(
        coalesce(p_snapshot->'item_recipe_capacities', '[]'::jsonb)
      ) as capacity(value)
     group by value->>'guild_uid', value->>'item_id'
    having count(*) > 1
  ) then
    raise exception using errcode = 'P0001', message = 'ITEM_RECIPE_CAPACITY_DUPLICATE';
  end if;

  for v_record in select value from jsonb_array_elements(
    coalesce(p_snapshot->'item_recipe_capacities', '[]'::jsonb)
  )
  loop
    v_guild_id := null;
    select guild.id into v_guild_id
      from public.guilds as guild
     where guild.world_id = p_world_id and guild.game_guild_uid = v_record->>'guild_uid';
    if v_guild_id is null
       or not exists (
         select 1 from public.catalog_items as item
          where item.version_id = v_version_id and item.item_id = v_record->>'item_id'
       )
       or not exists (
         select 1 from public.catalog_item_recipes as recipe
          where recipe.version_id = v_version_id
            and recipe.product_item_id = v_record->>'item_id'
            and recipe.craft_kind in ('handcraft', 'cooking')
       )
       or (v_record->>'on_hand')::bigint <> coalesce((
         select total.quantity from public.item_inventory_totals as total
          where total.snapshot_id = v_snapshot_id and total.guild_id = v_guild_id
            and total.item_id = v_record->>'item_id'
       ), 0)
       or (v_record->>'obtainable_total')::bigint
          <> (v_record->>'on_hand')::bigint + (v_record->>'craftable_additional')::bigint
       or (
         v_record->>'selected_recipe_id' is not null and not exists (
           select 1 from public.catalog_item_recipes as recipe
            where recipe.version_id = v_version_id
              and recipe.recipe_id = v_record->>'selected_recipe_id'
              and recipe.product_item_id = v_record->>'item_id'
              and recipe.craft_kind in ('handcraft', 'cooking')
         )
       ) then
      raise exception using errcode = 'P0001', message = 'ITEM_RECIPE_CAPACITY_INVALID';
    end if;
    insert into public.item_inventory_recipe_capacities (
      snapshot_id, world_id, guild_id, game_data_version_id, item_id,
      on_hand, craftable_additional, obtainable_total, selected_recipe_id,
      status, recipe_plan, limiting_materials
    ) values (
      v_snapshot_id, p_world_id, v_guild_id, v_version_id, v_record->>'item_id',
      (v_record->>'on_hand')::bigint, (v_record->>'craftable_additional')::bigint,
      (v_record->>'obtainable_total')::bigint, v_record->>'selected_recipe_id',
      v_record->>'status', v_record->'recipe_plan', v_record->'limiting_materials'
    );
  end loop;

  update public.item_inventory_snapshots
     set resolved_stack_count = v_resolved,
         unresolved_stack_count = v_unresolved,
         quality_status = case
           when v_unresolved > 0 then 'partial'::public.item_inventory_quality_status
           else quality_status
         end
   where id = v_snapshot_id;

  insert into public.item_inventory_hourly_rollups (
    world_id, guild_id, bucket_at, base_key, item_id, quantity, sampled_at
  )
  select p_world_id, total.guild_id, date_trunc('hour', v_captured_at, 'UTC'), '$guild',
    total.item_id, total.quantity, v_captured_at
  from public.item_inventory_totals as total where total.snapshot_id = v_snapshot_id
  union all
  select p_world_id, total.guild_id, date_trunc('hour', v_captured_at, 'UTC'), total.base_id,
    total.item_id, total.quantity, v_captured_at
  from public.item_inventory_base_totals as total where total.snapshot_id = v_snapshot_id
  on conflict (world_id, guild_id, bucket_at, base_key, item_id) do update
    set quantity = excluded.quantity, sampled_at = excluded.sampled_at
    where excluded.sampled_at >= public.item_inventory_hourly_rollups.sampled_at;

  insert into public.item_inventory_daily_rollups (
    world_id, guild_id, bucket_at, base_key, item_id, quantity, sampled_at
  )
  select p_world_id, total.guild_id, date_trunc('day', v_captured_at, 'UTC'), '$guild',
    total.item_id, total.quantity, v_captured_at
  from public.item_inventory_totals as total where total.snapshot_id = v_snapshot_id
  union all
  select p_world_id, total.guild_id, date_trunc('day', v_captured_at, 'UTC'), total.base_id,
    total.item_id, total.quantity, v_captured_at
  from public.item_inventory_base_totals as total where total.snapshot_id = v_snapshot_id
  on conflict (world_id, guild_id, bucket_at, base_key, item_id) do update
    set quantity = excluded.quantity, sampled_at = excluded.sampled_at
    where excluded.sampled_at >= public.item_inventory_daily_rollups.sampled_at;

  update public.worlds set latest_item_inventory_snapshot_id = v_snapshot_id
   where id = p_world_id;
  return v_snapshot_id;
end;
$$;

create function private.publish_inventory_snapshot(p_world_id uuid, p_snapshot jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot_id uuid;
begin
  v_snapshot_id := private.publish_pal_inventory_snapshot(p_world_id, p_snapshot);
  perform private.publish_item_inventory_snapshot(p_world_id, v_snapshot_id, p_snapshot);
  return v_snapshot_id;
end;
$$;

create or replace function private.get_inventory_catalog_ids_for_agent(p_world_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version_id uuid;
begin
  select version.id into v_version_id
    from public.worlds as world
    join public.game_data_versions as version
      on version.id = world.active_game_data_version_id and version.status = 'published'
   where world.id = p_world_id;
  if v_version_id is null then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_CONFIGURATION_REQUIRED';
  end if;
  return jsonb_build_object(
    'game_data_version_id', v_version_id,
    'pal_ids', coalesce((select jsonb_agg(known.pal_id order by known.pal_id) from (
      select pal.pal_id from public.catalog_pals as pal where pal.version_id = v_version_id
      union
      select lower(substring(localization.text_key from char_length('pal_name.PAL_NAME_') + 1))
      from public.catalog_localizations as localization
      where localization.version_id = v_version_id
        and localization.text_key like 'pal_name.PAL_NAME_%'
        and lower(substring(localization.text_key from char_length('pal_name.PAL_NAME_') + 1))
          ~ '^[a-z0-9][a-z0-9._-]*$'
    ) as known), '[]'::jsonb),
    'passive_skill_ids', coalesce((select jsonb_agg(passive.passive_skill_id order by passive.passive_skill_id)
      from public.catalog_passive_skills as passive where passive.version_id = v_version_id), '[]'::jsonb),
    'item_ids', coalesce((select jsonb_agg(item.item_id order by item.item_id)
      from public.catalog_items as item where item.version_id = v_version_id), '[]'::jsonb),
    'item_aliases', coalesce((
      select jsonb_object_agg(alias.item_id, alias.canonical_item_id order by alias.item_id)
      from (
        select legacy.item_id, item.item_id as canonical_item_id
          from public.catalog_items as item
          cross join lateral unnest(item.legacy_item_ids) as legacy(item_id)
         where item.version_id = v_version_id
      ) as alias
    ), '{}'::jsonb),
    'item_recipes', coalesce((
      select jsonb_agg(
        (to_jsonb(recipe) - 'version_id') || jsonb_build_object(
          'ingredients', coalesce((
            select jsonb_agg(to_jsonb(ingredient) - 'version_id' - 'recipe_id' order by ingredient.slot)
              from public.catalog_item_recipe_ingredients as ingredient
             where ingredient.version_id = recipe.version_id
               and ingredient.recipe_id = recipe.recipe_id
          ), '[]'::jsonb)
        ) order by recipe.recipe_id
      ) from public.catalog_item_recipes as recipe where recipe.version_id = v_version_id
    ), '[]'::jsonb)
  );
end;
$$;

create function public.get_guild_item_inventory(p_locale text default 'zh-CN')
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_player public.players%rowtype;
  v_snapshot_id uuid;
  v_version_id uuid;
begin
  select player.* into v_player from public.players as player
   where player.id = public.current_player_id();
  if v_player.id is null or v_player.guild_id is null then
    raise exception using errcode = 'P0001', message = 'GUILD_MEMBERSHIP_REQUIRED';
  end if;
  select world.latest_item_inventory_snapshot_id, world.active_game_data_version_id
    into v_snapshot_id, v_version_id from public.worlds as world where world.id = v_player.world_id;
  if v_snapshot_id is null then
    return jsonb_build_object(
      'status', 'unavailable', 'snapshot_id', null, 'captured_at', null,
      'items', jsonb_build_array()
    );
  end if;
  return jsonb_build_object(
    'status', coalesce((
      select case when snapshot.quality_status = 'partial' then 'partial' else 'available' end
        from public.item_inventory_snapshots as snapshot where snapshot.id = v_snapshot_id
    ), 'unavailable'),
    'snapshot_id', v_snapshot_id,
    'captured_at', (select captured_at from public.item_inventory_snapshots where id = v_snapshot_id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', catalog_item.item_id,
        'name', coalesce(localized.text, english.text, catalog_item.item_id),
        'type_a', catalog_item.type_a,
        'type_b', catalog_item.type_b,
        'quantity', coalesce(total.quantity, 0),
        'bases', coalesce((select jsonb_agg(jsonb_build_object(
          'base_id', base_total.base_id,
          'name', base.name,
          'quantity', base_total.quantity
        ) order by base.name nulls last, base_total.base_id)
          from public.item_inventory_base_totals as base_total
          join public.item_inventory_bases as base
            on base.snapshot_id = base_total.snapshot_id and base.base_id = base_total.base_id
         where base_total.snapshot_id = v_snapshot_id
           and base_total.guild_id = v_player.guild_id
           and base_total.item_id = catalog_item.item_id), '[]'::jsonb),
        'recipes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'recipe_id', recipe.recipe_id,
            'product_count', recipe.product_count,
            'craft_kind', recipe.craft_kind,
            'ingredients', coalesce((
              select jsonb_agg(jsonb_build_object(
                'slot', ingredient.slot,
                'item_id', ingredient.item_id,
                'name', coalesce(
                  ingredient_localized.text, ingredient_english.text, ingredient.item_id
                ),
                'count', ingredient.count
              ) order by ingredient.slot)
                from public.catalog_item_recipe_ingredients as ingredient
                join public.catalog_items as ingredient_item
                  on ingredient_item.version_id = ingredient.version_id
                 and ingredient_item.item_id = ingredient.item_id
                left join public.catalog_localizations as ingredient_localized
                  on ingredient_localized.version_id = ingredient.version_id
                 and ingredient_localized.locale = p_locale
                 and ingredient_localized.text_key = ingredient_item.name_key
                left join public.catalog_localizations as ingredient_english
                  on ingredient_english.version_id = ingredient.version_id
                 and ingredient_english.locale = 'en-US'
                 and ingredient_english.text_key = ingredient_item.name_key
               where ingredient.version_id = recipe.version_id
                 and ingredient.recipe_id = recipe.recipe_id
            ), '[]'::jsonb)
          ) order by recipe.recipe_id)
            from public.catalog_item_recipes as recipe
           where recipe.version_id = v_version_id
             and recipe.product_item_id = catalog_item.item_id
             and recipe.craft_kind in ('handcraft', 'cooking')
        ), '[]'::jsonb),
        'capacity', case when capacity.item_id is null then null else jsonb_build_object(
          'on_hand', capacity.on_hand,
          'craftable_additional', capacity.craftable_additional,
          'obtainable_total', capacity.obtainable_total,
          'selected_recipe_id', capacity.selected_recipe_id,
          'status', capacity.status,
          'recipe_plan', capacity.recipe_plan,
          'limiting_materials', capacity.limiting_materials
        ) end
      ) order by coalesce(localized.text, english.text, catalog_item.item_id), catalog_item.item_id)
      from public.catalog_items as catalog_item
      left join public.item_inventory_totals as total
        on total.snapshot_id = v_snapshot_id and total.guild_id = v_player.guild_id
       and total.item_id = catalog_item.item_id
      left join public.item_inventory_recipe_capacities as capacity
        on capacity.snapshot_id = v_snapshot_id and capacity.guild_id = v_player.guild_id
       and capacity.item_id = catalog_item.item_id
      left join public.catalog_localizations as localized
        on localized.version_id = v_version_id and localized.locale = p_locale
       and localized.text_key = catalog_item.name_key
      left join public.catalog_localizations as english
        on english.version_id = v_version_id and english.locale = 'en-US'
       and english.text_key = catalog_item.name_key
     where catalog_item.version_id = v_version_id
       and (
         catalog_item.type_a in ('material', 'food')
         or catalog_item.type_b in ('material', 'food')
       )
       and (total.item_id is not null or capacity.craftable_additional > 0)
    ), '[]'::jsonb)
  );
end;
$$;

create function public.get_guild_item_inventory_trend(
  p_item_id text,
  p_base_id text default null,
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now(),
  p_bucket text default 'hour'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_player public.players%rowtype;
  v_base_key text := coalesce(p_base_id, '$guild');
  v_points jsonb;
begin
  select player.* into v_player from public.players as player
   where player.id = public.current_player_id();
  if v_player.id is null or v_player.guild_id is null then
    raise exception using errcode = 'P0001', message = 'GUILD_MEMBERSHIP_REQUIRED';
  end if;
  if p_bucket not in ('hour', 'day') or p_from >= p_to or p_to - p_from > interval '1 year' then
    raise exception using errcode = '22023', message = 'ITEM_INVENTORY_TREND_INVALID';
  end if;
  if p_bucket = 'hour' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'sampled_at', point.bucket_at, 'quantity', point.quantity,
      'delta', point.quantity - lag_quantity
    ) order by point.bucket_at), '[]'::jsonb) into v_points
    from (
      select rollup.bucket_at, rollup.quantity,
        lag(rollup.quantity) over (order by rollup.bucket_at) as lag_quantity
      from public.item_inventory_hourly_rollups as rollup
      where rollup.world_id = v_player.world_id and rollup.guild_id = v_player.guild_id
        and rollup.item_id = p_item_id and rollup.base_key = v_base_key
        and rollup.bucket_at between p_from and p_to
    ) as point;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'sampled_at', point.bucket_at, 'quantity', point.quantity,
      'delta', point.quantity - lag_quantity
    ) order by point.bucket_at), '[]'::jsonb) into v_points
    from (
      select rollup.bucket_at, rollup.quantity,
        lag(rollup.quantity) over (order by rollup.bucket_at) as lag_quantity
      from public.item_inventory_daily_rollups as rollup
      where rollup.world_id = v_player.world_id and rollup.guild_id = v_player.guild_id
        and rollup.item_id = p_item_id and rollup.base_key = v_base_key
        and rollup.bucket_at between p_from and p_to
    ) as point;
  end if;
  return jsonb_build_object(
    'item_id', p_item_id, 'base_id', p_base_id, 'bucket', p_bucket,
    'from_at', p_from, 'to_at', p_to, 'points', v_points
  );
end;
$$;

create function public.cleanup_item_inventory_history(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_stacks integer;
  v_totals integer;
  v_guild_totals integer;
  v_hourly integer;
  v_daily integer;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  delete from public.item_inventory_stack_items as stack
   where stack.captured_at < p_now - interval '24 hours'
     and not exists (
       select 1 from public.worlds as world
        where world.latest_item_inventory_snapshot_id = stack.snapshot_id
     );
  get diagnostics v_stacks = row_count;
  delete from public.item_inventory_base_totals as total
   where exists (select 1 from public.item_inventory_snapshots as snapshot
     where snapshot.id = total.snapshot_id and snapshot.captured_at < p_now - interval '24 hours')
     and not exists (select 1 from public.worlds as world
       where world.latest_item_inventory_snapshot_id = total.snapshot_id);
  get diagnostics v_totals = row_count;
  delete from public.item_inventory_totals as total
   where exists (select 1 from public.item_inventory_snapshots as snapshot
     where snapshot.id = total.snapshot_id and snapshot.captured_at < p_now - interval '24 hours')
     and not exists (select 1 from public.worlds as world
       where world.latest_item_inventory_snapshot_id = total.snapshot_id);
  get diagnostics v_guild_totals = row_count;
  v_totals := v_totals + v_guild_totals;
  delete from public.item_inventory_hourly_rollups where bucket_at < p_now - interval '90 days';
  get diagnostics v_hourly = row_count;
  delete from public.item_inventory_daily_rollups where bucket_at < p_now - interval '1 year';
  get diagnostics v_daily = row_count;
  return jsonb_build_object(
    'deleted_stack_count', v_stacks, 'deleted_snapshot_total_count', v_totals,
    'deleted_hourly_count', v_hourly, 'deleted_daily_count', v_daily
  );
end;
$$;

revoke all on function private.can_access_item_inventory_guild(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.publish_pal_inventory_snapshot(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.publish_item_inventory_snapshot(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.publish_inventory_snapshot(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.get_inventory_catalog_ids_for_agent(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_guild_item_inventory(text) from public, anon;
revoke all on function public.get_guild_item_inventory_trend(text, text, timestamptz, timestamptz, text)
  from public, anon;
revoke all on function public.cleanup_item_inventory_history(timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_guild_item_inventory(text) to authenticated;
grant execute on function public.get_guild_item_inventory_trend(text, text, timestamptz, timestamptz, text)
  to authenticated;
grant execute on function public.cleanup_item_inventory_history(timestamptz) to service_role;
