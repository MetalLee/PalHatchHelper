alter table public.item_inventory_snapshots
  add column payload_purged_at timestamptz,
  add constraint item_inventory_snapshots_payload_purge_check check (
    payload_purged_at is null or payload_purged_at >= created_at
  );

alter table public.item_inventory_snapshots
  drop constraint item_inventory_snapshots_source_key;

create unique index item_inventory_snapshots_active_source_key
  on public.item_inventory_snapshots (
    world_id, source_save_hash, parser_name, parser_version, game_data_version_id
  )
  where payload_purged_at is null;

create index item_inventory_snapshots_retention_idx
  on public.item_inventory_snapshots(created_at, id)
  where payload_purged_at is null;

comment on column public.inventory_snapshots.payload_purged_at is
  'Database lifecycle marker. Non-null means normalized Pal rows were removed by the controlled 30-minute retention RPC.';
comment on column public.item_inventory_snapshots.payload_purged_at is
  'Database lifecycle marker. Non-null means normalized item rows were removed by the controlled 30-minute retention RPC.';

alter table public.item_inventory_stack_items
  drop constraint item_inventory_stack_items_container_type_check,
  drop constraint item_inventory_stack_items_resolution_check;

alter table public.item_inventory_stack_items
  add constraint item_inventory_stack_items_container_type_check check (
    container_type in (
      'storage_box', 'refrigerator', 'feed_box', 'production_output',
      'guild_chest', 'unknown'
    )
  ),
  add constraint item_inventory_stack_items_resolution_check check (
    resolution_status in ('resolved', 'unresolved', 'unsupported')
    and (
      resolution_status <> 'resolved'
      or (
        guild_id is not null
        and (
          (container_type = 'guild_chest' and base_id is null)
          or (container_type <> 'guild_chest' and base_id is not null)
        )
      )
    )
  );

create table public.item_inventory_five_minute_samples (
  world_id uuid not null references public.worlds(id) on delete restrict,
  guild_id uuid not null,
  bucket_at timestamptz not null,
  snapshot_id uuid not null,
  sampled_at timestamptz not null,
  primary key (world_id, guild_id, bucket_at),
  constraint item_inventory_five_minute_samples_guild_fkey
    foreign key (guild_id, world_id)
    references public.guilds(id, world_id) on delete restrict,
  constraint item_inventory_five_minute_samples_snapshot_fkey
    foreign key (snapshot_id, world_id)
    references public.item_inventory_snapshots(id, world_id) on delete restrict,
  constraint item_inventory_five_minute_samples_bucket_check
    check ((extract(epoch from bucket_at)::bigint % 300) = 0)
);

create table public.item_inventory_five_minute_totals (
  world_id uuid not null,
  guild_id uuid not null,
  bucket_at timestamptz not null,
  item_id text not null,
  quantity bigint not null,
  primary key (world_id, guild_id, bucket_at, item_id),
  constraint item_inventory_five_minute_totals_sample_fkey
    foreign key (world_id, guild_id, bucket_at)
    references public.item_inventory_five_minute_samples(world_id, guild_id, bucket_at)
    on delete cascade,
  constraint item_inventory_five_minute_totals_quantity_check check (quantity > 0)
);

revoke all on table
  public.item_inventory_five_minute_samples,
  public.item_inventory_five_minute_totals
from public, anon, authenticated, service_role;
grant select, insert, update, delete on table
  public.item_inventory_five_minute_samples,
  public.item_inventory_five_minute_totals
to service_role;
alter table public.item_inventory_five_minute_samples enable row level security;
alter table public.item_inventory_five_minute_totals enable row level security;

create function private.sample_latest_item_inventory(
  p_world_id uuid,
  p_sampled_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot_id uuid;
  v_sampled_at timestamptz := coalesce(p_sampled_at, statement_timestamp());
  v_bucket_at timestamptz;
  v_guild_id uuid;
  v_sample_written boolean;
begin
  select world.latest_item_inventory_snapshot_id
    into v_snapshot_id
    from public.worlds as world
   where world.id = p_world_id;
  if v_snapshot_id is null then
    return;
  end if;
  v_bucket_at := to_timestamp(
    floor(extract(epoch from v_sampled_at) / 300) * 300
  );
  for v_guild_id in
    select total.guild_id
      from public.item_inventory_totals as total
     where total.snapshot_id = v_snapshot_id
    union
    select base.guild_id
      from public.item_inventory_bases as base
     where base.snapshot_id = v_snapshot_id
  loop
    v_sample_written := false;
    insert into public.item_inventory_five_minute_samples (
      world_id, guild_id, bucket_at, snapshot_id, sampled_at
    ) values (
      p_world_id, v_guild_id, v_bucket_at, v_snapshot_id, v_sampled_at
    )
    on conflict (world_id, guild_id, bucket_at) do update
      set snapshot_id = excluded.snapshot_id,
          sampled_at = excluded.sampled_at
      where excluded.sampled_at >= public.item_inventory_five_minute_samples.sampled_at
    returning true into v_sample_written;

    if not v_sample_written then
      continue;
    end if;

    delete from public.item_inventory_five_minute_totals as total
     where total.world_id = p_world_id
       and total.guild_id = v_guild_id
       and total.bucket_at = v_bucket_at;
    insert into public.item_inventory_five_minute_totals (
      world_id, guild_id, bucket_at, item_id, quantity
    )
    select p_world_id, v_guild_id, v_bucket_at, total.item_id, total.quantity
      from public.item_inventory_totals as total
     where total.snapshot_id = v_snapshot_id
       and total.guild_id = v_guild_id
       and total.quantity > 0;
  end loop;
end;
$$;

create function public.sample_latest_item_inventory(
  p_world_id uuid,
  p_sampled_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  perform private.sample_latest_item_inventory(p_world_id, p_sampled_at);
end;
$$;

revoke all on function private.sample_latest_item_inventory(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.sample_latest_item_inventory(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.sample_latest_item_inventory(uuid, timestamptz)
  to service_role;

create or replace function private.publish_item_inventory_snapshot(
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
  v_version_id uuid;
  v_snapshot_id uuid;
  v_publish_snapshot jsonb := p_snapshot;
  v_original_hash text := p_snapshot->>'source_save_hash';
  v_resolved integer;
  v_unresolved integer;
begin
  select world.latest_item_inventory_snapshot_id, world.active_game_data_version_id
    into v_latest_snapshot_id, v_version_id
    from public.worlds as world
   where world.id = p_world_id
   for update;
  if v_status = 'unavailable' then
    return v_latest_snapshot_id;
  end if;

  if v_status = 'partial'
     and jsonb_typeof(p_snapshot->'bases') = 'array'
     and jsonb_typeof(p_snapshot->'item_stacks') = 'array'
     and not exists (
       select 1
         from jsonb_array_elements(p_snapshot->'item_stacks') as stack(value)
        where stack.value->>'resolution_status' = 'resolved'
          and stack.value->>'container_type' in (
            'storage_box', 'refrigerator', 'feed_box', 'production_output', 'guild_chest'
          )
          and exists (
            select 1 from public.catalog_items as item
             where item.version_id = v_version_id
               and (
                 item.item_id = stack.value->>'item_id'
                 or stack.value->>'item_id' = any(item.legacy_item_ids)
               )
          )
          and (
            (
              stack.value->>'container_type' = 'guild_chest'
              and stack.value->>'base_id' is null
              and exists (
                select 1 from public.guilds as guild
                 where guild.world_id = p_world_id
                   and guild.game_guild_uid = stack.value->>'guild_uid'
              )
            )
            or (
              stack.value->>'container_type' <> 'guild_chest'
              and exists (
                select 1
                  from jsonb_array_elements(p_snapshot->'bases') as base(value)
                  join public.guilds as guild
                    on guild.world_id = p_world_id
                   and guild.game_guild_uid = base.value->>'guild_uid'
                 where base.value->>'base_id' = stack.value->>'base_id'
              )
            )
          )
     ) then
    return v_latest_snapshot_id;
  end if;

  select snapshot.id
    into v_snapshot_id
    from public.item_inventory_snapshots as snapshot
   where snapshot.world_id = p_world_id
     and snapshot.source_save_hash = v_original_hash
     and snapshot.parser_name = p_snapshot->>'parser_name'
     and snapshot.parser_version = p_snapshot->>'parser_version'
     and snapshot.game_data_version_id = v_version_id
     and snapshot.payload_purged_at is null;
  if v_snapshot_id is not null then
    update public.worlds set latest_item_inventory_snapshot_id = v_snapshot_id
     where id = p_world_id;
    perform private.sample_latest_item_inventory(p_world_id, statement_timestamp());
    return v_snapshot_id;
  end if;

  if exists (
    select 1 from public.item_inventory_snapshots as snapshot
     where snapshot.world_id = p_world_id
       and snapshot.source_save_hash = v_original_hash
       and snapshot.parser_name = p_snapshot->>'parser_name'
       and snapshot.parser_version = p_snapshot->>'parser_version'
       and snapshot.game_data_version_id = v_version_id
       and snapshot.payload_purged_at is not null
  ) then
    v_publish_snapshot := jsonb_set(
      v_publish_snapshot,
      '{source_save_hash}',
      to_jsonb(v_original_hash || ':' || replace(gen_random_uuid()::text, '-', ''))
    );
  end if;

  select jsonb_set(
    v_publish_snapshot,
    '{item_stacks}',
    coalesce(jsonb_agg(
      case when stack.value->>'container_type' = 'guild_chest'
        then stack.value || jsonb_build_object(
          'container_type', 'unknown', 'resolution_status', 'unresolved'
        )
        else stack.value
      end
    ), '[]'::jsonb)
  ) into v_publish_snapshot
  from jsonb_array_elements(p_snapshot->'item_stacks') as stack(value);

  v_snapshot_id := private.publish_item_inventory_snapshot_unchecked_v1(
    p_world_id, p_source_inventory_snapshot_id, v_publish_snapshot
  );
  update public.item_inventory_snapshots
     set source_save_hash = v_original_hash
   where id = v_snapshot_id
     and source_save_hash is distinct from v_original_hash;

  update public.item_inventory_stack_items as stored
     set guild_id = guild.id,
         base_id = null,
         container_type = 'guild_chest',
         resolution_status = 'resolved'
    from jsonb_array_elements(p_snapshot->'item_stacks') as source(value)
    join public.guilds as guild
      on guild.world_id = p_world_id
     and guild.game_guild_uid = source.value->>'guild_uid'
   where stored.snapshot_id = v_snapshot_id
     and stored.container_id = source.value->>'container_id'
     and stored.slot_index = (source.value->>'slot_index')::integer
     and source.value->>'container_type' = 'guild_chest'
     and source.value->>'resolution_status' = 'resolved'
     and source.value->>'base_id' is null
     and exists (
       select 1 from public.catalog_items as item
        where item.version_id = v_version_id and item.item_id = stored.item_id
     );

  delete from public.item_inventory_recipe_capacities where snapshot_id = v_snapshot_id;
  delete from public.item_inventory_base_totals where snapshot_id = v_snapshot_id;
  delete from public.item_inventory_totals where snapshot_id = v_snapshot_id;

  insert into public.item_inventory_totals (
    snapshot_id, world_id, guild_id, item_id, quantity
  )
  select v_snapshot_id, p_world_id, stack.guild_id, stack.item_id, sum(stack.quantity)
    from public.item_inventory_stack_items as stack
   where stack.snapshot_id = v_snapshot_id
     and stack.resolution_status = 'resolved'
   group by stack.guild_id, stack.item_id;

  insert into public.item_inventory_base_totals (
    snapshot_id, world_id, guild_id, base_id, item_id, quantity
  )
  select v_snapshot_id, p_world_id, stack.guild_id, stack.base_id, stack.item_id,
         sum(stack.quantity)
    from public.item_inventory_stack_items as stack
   where stack.snapshot_id = v_snapshot_id
     and stack.resolution_status = 'resolved'
     and stack.base_id is not null
   group by stack.guild_id, stack.base_id, stack.item_id;

  select
    count(*) filter (where resolution_status = 'resolved')::integer,
    count(*) filter (where resolution_status <> 'resolved')::integer
    into v_resolved, v_unresolved
    from public.item_inventory_stack_items
   where snapshot_id = v_snapshot_id;
  update public.item_inventory_snapshots
     set resolved_stack_count = v_resolved,
         unresolved_stack_count = v_unresolved,
         quality_status = case when v_unresolved > 0
           then 'partial'::public.item_inventory_quality_status
           else quality_status end
   where id = v_snapshot_id;

  insert into public.item_inventory_hourly_rollups (
    world_id, guild_id, bucket_at, base_key, item_id, quantity, sampled_at
  )
  select p_world_id, total.guild_id, date_trunc('hour', snapshot.captured_at, 'UTC'),
         '$guild', total.item_id, total.quantity, snapshot.captured_at
    from public.item_inventory_totals as total
    join public.item_inventory_snapshots as snapshot on snapshot.id = total.snapshot_id
   where total.snapshot_id = v_snapshot_id
  on conflict (world_id, guild_id, bucket_at, base_key, item_id) do update
    set quantity = excluded.quantity, sampled_at = excluded.sampled_at
    where excluded.sampled_at >= public.item_inventory_hourly_rollups.sampled_at;

  insert into public.item_inventory_daily_rollups (
    world_id, guild_id, bucket_at, base_key, item_id, quantity, sampled_at
  )
  select p_world_id, total.guild_id, date_trunc('day', snapshot.captured_at, 'UTC'),
         '$guild', total.item_id, total.quantity, snapshot.captured_at
    from public.item_inventory_totals as total
    join public.item_inventory_snapshots as snapshot on snapshot.id = total.snapshot_id
   where total.snapshot_id = v_snapshot_id
  on conflict (world_id, guild_id, bucket_at, base_key, item_id) do update
    set quantity = excluded.quantity, sampled_at = excluded.sampled_at
    where excluded.sampled_at >= public.item_inventory_daily_rollups.sampled_at;

  update public.worlds set latest_item_inventory_snapshot_id = v_snapshot_id
   where id = p_world_id;
  perform private.sample_latest_item_inventory(p_world_id, statement_timestamp());
  return v_snapshot_id;
end;
$$;

revoke all on function private.publish_item_inventory_snapshot(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

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
    'item_recipes', '[]'::jsonb
  );
end;
$$;

create or replace function public.get_guild_item_inventory(p_locale text default 'zh-CN')
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
  v_axis_to timestamptz := to_timestamp(
    floor(extract(epoch from statement_timestamp()) / 300) * 300
  );
  v_axis_from timestamptz := v_axis_to - interval '1 hour';
begin
  select player.* into v_player from public.players as player
   where player.id = public.current_player_id();
  if v_player.id is null or v_player.guild_id is null then
    raise exception using errcode = 'P0001', message = 'GUILD_MEMBERSHIP_REQUIRED';
  end if;
  select world.latest_item_inventory_snapshot_id, world.active_game_data_version_id
    into v_snapshot_id, v_version_id
    from public.worlds as world where world.id = v_player.world_id;
  if v_snapshot_id is null then
    return jsonb_build_object(
      'status', 'unavailable', 'snapshot_id', null, 'captured_at', null,
      'game_data_version_id', null, 'trend_from_at', null,
      'trend_interval_seconds', 300, 'inventory_quantities', jsonb_build_array(),
      'capacity_recipes', jsonb_build_array(), 'items', jsonb_build_array()
    );
  end if;
  return jsonb_build_object(
    'status', coalesce((select case when snapshot.quality_status = 'partial'
      then 'partial' else 'available' end
      from public.item_inventory_snapshots as snapshot where snapshot.id = v_snapshot_id),
      'unavailable'),
    'snapshot_id', v_snapshot_id,
    'captured_at', (select captured_at from public.item_inventory_snapshots where id = v_snapshot_id),
    'game_data_version_id', v_version_id,
    'trend_from_at', v_axis_from,
    'trend_interval_seconds', 300,
    'inventory_quantities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', total.item_id, 'quantity', total.quantity
      ) order by total.item_id)
      from public.item_inventory_totals as total
      where total.snapshot_id = v_snapshot_id and total.guild_id = v_player.guild_id
    ), '[]'::jsonb),
    'capacity_recipes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'recipe_id', recipe.recipe_id,
        'product_item_id', recipe.product_item_id,
        'product_count', recipe.product_count,
        'craft_kind', recipe.craft_kind,
        'deny_recipe_chain', to_jsonb(recipe.deny_recipe_chain),
        'ingredients', coalesce((select jsonb_agg(jsonb_build_object(
          'slot', ingredient.slot, 'item_id', ingredient.item_id, 'count', ingredient.count
        ) order by ingredient.slot)
          from public.catalog_item_recipe_ingredients as ingredient
         where ingredient.version_id = recipe.version_id
           and ingredient.recipe_id = recipe.recipe_id), '[]'::jsonb)
      ) order by recipe.recipe_id)
      from public.catalog_item_recipes as recipe
      where recipe.version_id = v_version_id
        and recipe.craft_kind in ('handcraft', 'cooking')
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', candidate.item_id,
        'name', candidate.display_name,
        'type_a', candidate.type_a,
        'type_b', candidate.type_b,
        'quantity', candidate.quantity,
        'guild_chest_quantity', coalesce((
          select sum(stack.quantity)
            from public.item_inventory_stack_items as stack
           where stack.snapshot_id = v_snapshot_id
             and stack.guild_id = v_player.guild_id
             and stack.item_id = candidate.item_id
             and stack.container_type = 'guild_chest'
             and stack.resolution_status = 'resolved'
        ), 0),
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
           and base_total.item_id = candidate.item_id), '[]'::jsonb),
        'recipes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'recipe_id', recipe.recipe_id,
            'product_count', recipe.product_count,
            'craft_kind', recipe.craft_kind,
            'ingredients', coalesce((
              select jsonb_agg(jsonb_build_object(
                'slot', ingredient.slot,
                'item_id', ingredient.item_id,
                'name', coalesce(ingredient_localized.text, ingredient_english.text, ingredient.item_id),
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
            and recipe.product_item_id = candidate.item_id
            and recipe.craft_kind in ('handcraft', 'cooking')
        ), '[]'::jsonb),
        'capacity', null,
        'trend_1h', coalesce((
          select jsonb_agg(
            case when sample.snapshot_id is null then null
                 else coalesce(trend_total.quantity, 0) end
            order by axis.bucket_at
          )
          from generate_series(v_axis_from, v_axis_to, interval '5 minutes')
            as axis(bucket_at)
          left join public.item_inventory_five_minute_samples as sample
            on sample.world_id = v_player.world_id
           and sample.guild_id = v_player.guild_id
           and sample.bucket_at = axis.bucket_at
          left join public.item_inventory_five_minute_totals as trend_total
            on trend_total.world_id = sample.world_id
           and trend_total.guild_id = sample.guild_id
           and trend_total.bucket_at = sample.bucket_at
           and trend_total.item_id = candidate.item_id
        ), jsonb_build_array(null, null, null, null, null, null, null,
                             null, null, null, null, null, null))
      ) order by candidate.display_name, candidate.item_id)
      from (
        select catalog_item.item_id, catalog_item.type_a, catalog_item.type_b,
               coalesce(localized.text, english.text, catalog_item.item_id) as display_name,
               coalesce(total.quantity, 0) as quantity
          from public.catalog_items as catalog_item
          left join public.item_inventory_totals as total
            on total.snapshot_id = v_snapshot_id
           and total.guild_id = v_player.guild_id
           and total.item_id = catalog_item.item_id
          left join public.catalog_localizations as localized
            on localized.version_id = v_version_id and localized.locale = p_locale
           and localized.text_key = catalog_item.name_key
          left join public.catalog_localizations as english
            on english.version_id = v_version_id and english.locale = 'en-US'
           and english.text_key = catalog_item.name_key
         where catalog_item.version_id = v_version_id
           and (catalog_item.type_a in ('material', 'food')
             or catalog_item.type_b in ('material', 'food'))
           and (total.item_id is not null or exists (
             select 1 from public.catalog_item_recipes as recipe
              where recipe.version_id = v_version_id
                and recipe.product_item_id = catalog_item.item_id
                and recipe.craft_kind in ('handcraft', 'cooking')
           ))
         order by coalesce(localized.text, english.text, catalog_item.item_id), catalog_item.item_id
         limit 300
      ) as candidate
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.heartbeat_sync_device(
  p_token_hash text,
  p_app_version text,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_device_id uuid;
  v_world_id uuid;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$'
     or p_status not in ('ok', 'unchanged', 'idle', 'error')
     or (p_app_version is not null and char_length(p_app_version) not between 1 and 40) then
    raise exception using errcode = '22023', message = 'SYNC_HEARTBEAT_INVALID';
  end if;
  update public.sync_devices
     set last_seen_at = now(), app_version = coalesce(p_app_version, app_version)
   where token_hash = p_token_hash and revoked_at is null
  returning id, world_id into v_device_id, v_world_id;
  if v_device_id is null then
    raise exception using errcode = 'P0001', message = 'SYNC_DEVICE_UNAUTHORIZED';
  end if;
  if v_world_id is not null and p_status in ('ok', 'unchanged') then
    perform private.sample_latest_item_inventory(v_world_id, statement_timestamp());
  end if;
  return v_device_id;
end;
$$;

create or replace function public.cleanup_expired_inventory_snapshot_payloads(
  p_batch_size integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot_ids uuid[] := '{}'::uuid[];
  v_item_snapshot_ids uuid[] := '{}'::uuid[];
  v_failure_ids uuid[] := '{}'::uuid[];
  v_deleted_item_count integer := 0;
  v_deleted_item_stack_count integer := 0;
  v_purged_item_snapshot_count integer := 0;
  v_deleted_failure_count integer := 0;
  v_deleted_detection_run_count integer := 0;
  v_expired_job_count integer := 0;
  v_purged_snapshot_count integer := 0;
  v_deleted_five_minute_count integer := 0;
  v_deleted_hourly_count integer := 0;
  v_deleted_daily_count integer := 0;
  v_remaining_eligible_count integer := 0;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_batch_size is null or p_batch_size not between 1 and 100 then
    raise exception using errcode = '22023', message = 'INVENTORY_RETENTION_BATCH_INVALID';
  end if;

  select coalesce(array_agg(candidate.id order by candidate.created_at, candidate.id), '{}')
    into v_snapshot_ids
    from (
      select snapshot.id, snapshot.created_at
        from public.inventory_snapshots as snapshot
        join public.worlds as world on world.id = snapshot.world_id
       where snapshot.status in ('parsed', 'published')
         and snapshot.payload_purged_at is null
         and snapshot.created_at < statement_timestamp() - interval '30 minutes'
         and snapshot.id is distinct from world.latest_snapshot_id
       order by snapshot.created_at, snapshot.id
       limit p_batch_size
       for update of snapshot, world skip locked
    ) as candidate;

  select coalesce(array_agg(candidate.id order by candidate.created_at, candidate.id), '{}')
    into v_item_snapshot_ids
    from (
      select snapshot.id, snapshot.created_at
        from public.item_inventory_snapshots as snapshot
        join public.worlds as world on world.id = snapshot.world_id
       where snapshot.payload_purged_at is null
         and snapshot.created_at < statement_timestamp() - interval '30 minutes'
         and snapshot.id is distinct from world.latest_item_inventory_snapshot_id
       order by snapshot.created_at, snapshot.id
       limit p_batch_size
       for update of snapshot, world skip locked
    ) as candidate;

  select coalesce(array_agg(candidate.id order by candidate.created_at, candidate.id), '{}')
    into v_failure_ids
    from (
      select snapshot.id, snapshot.created_at
        from public.inventory_snapshots as snapshot
       where snapshot.status in ('failed', 'rejected')
         and snapshot.created_at < statement_timestamp() - interval '24 hours'
       order by snapshot.created_at, snapshot.id
       limit p_batch_size
       for update of snapshot skip locked
    ) as candidate;

  perform set_config('palhatch.inventory_retention_cleanup', 'on', true);
  update public.breeding_jobs
     set status = 'failed', locked_by = null, locked_at = null, heartbeat_at = null,
         lease_token = null, error_code = 'INVENTORY_SNAPSHOT_EXPIRED',
         error_summary = 'The fixed inventory payload expired after 30 minutes.',
         completed_at = now(), updated_at = now()
   where inventory_snapshot_id = any(v_snapshot_ids)
     and status not in ('completed', 'failed', 'cancelled');
  get diagnostics v_expired_job_count = row_count;

  delete from public.execution_candidate_detection_runs
   where detected_snapshot_id = any(v_snapshot_ids);
  get diagnostics v_deleted_detection_run_count = row_count;
  delete from public.pal_snapshot_items where snapshot_id = any(v_snapshot_ids);
  get diagnostics v_deleted_item_count = row_count;
  update public.inventory_snapshots set payload_purged_at = statement_timestamp()
   where id = any(v_snapshot_ids);
  get diagnostics v_purged_snapshot_count = row_count;
  delete from public.inventory_snapshots where id = any(v_failure_ids);
  get diagnostics v_deleted_failure_count = row_count;

  delete from public.item_inventory_recipe_capacities
   where snapshot_id = any(v_item_snapshot_ids);
  delete from public.item_inventory_base_totals
   where snapshot_id = any(v_item_snapshot_ids);
  delete from public.item_inventory_totals
   where snapshot_id = any(v_item_snapshot_ids);
  delete from public.item_inventory_stack_items
   where snapshot_id = any(v_item_snapshot_ids);
  get diagnostics v_deleted_item_stack_count = row_count;
  delete from public.item_inventory_bases
   where snapshot_id = any(v_item_snapshot_ids);
  update public.item_inventory_snapshots set payload_purged_at = statement_timestamp()
   where id = any(v_item_snapshot_ids);
  get diagnostics v_purged_item_snapshot_count = row_count;

  delete from public.item_inventory_five_minute_samples
   where bucket_at < statement_timestamp() - interval '2 hours';
  get diagnostics v_deleted_five_minute_count = row_count;
  delete from public.item_inventory_hourly_rollups
   where bucket_at < statement_timestamp() - interval '90 days';
  get diagnostics v_deleted_hourly_count = row_count;
  delete from public.item_inventory_daily_rollups
   where bucket_at < statement_timestamp() - interval '1 year';
  get diagnostics v_deleted_daily_count = row_count;

  select count(*)::integer into v_remaining_eligible_count
    from public.inventory_snapshots as snapshot
    join public.worlds as world on world.id = snapshot.world_id
   where snapshot.status in ('parsed', 'published')
     and snapshot.payload_purged_at is null
     and snapshot.created_at < statement_timestamp() - interval '30 minutes'
     and snapshot.id is distinct from world.latest_snapshot_id;

  return jsonb_build_object(
    'purged_snapshot_count', v_purged_snapshot_count,
    'deleted_item_count', v_deleted_item_count,
    'deleted_failure_count', v_deleted_failure_count,
    'deleted_detection_run_count', v_deleted_detection_run_count,
    'expired_job_count', v_expired_job_count,
    'remaining_eligible_count', v_remaining_eligible_count,
    'purged_item_snapshot_count', v_purged_item_snapshot_count,
    'deleted_item_stack_count', v_deleted_item_stack_count,
    'deleted_five_minute_count', v_deleted_five_minute_count,
    'deleted_hourly_count', v_deleted_hourly_count,
    'deleted_daily_count', v_deleted_daily_count
  );
end;
$$;

comment on function public.cleanup_expired_inventory_snapshot_payloads(integer) is
  'Service-only bounded cleanup for superseded Pal and item payloads older than 30 minutes; latest snapshots, audit headers and longer aggregate history are preserved.';
