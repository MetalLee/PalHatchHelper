alter table public.worlds
  add column inventory_source_modified_at timestamptz;

update public.worlds as world
   set inventory_source_modified_at = snapshot.source_modified_at
  from public.inventory_snapshots as snapshot
 where snapshot.id = world.latest_snapshot_id
   and snapshot.world_id = world.id
   and snapshot.status = 'published';

comment on column public.worlds.inventory_source_modified_at is
  'Newest accepted save-file observation time; prevents out-of-order inventory publication.';

create function public.get_latest_inventory_snapshot_for_agent(p_world_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'snapshot_id', snapshot.id,
    'source_save_hash', snapshot.source_save_hash,
    'pal_count', (
      select count(*)::integer
      from public.pal_snapshot_items as item
      where item.snapshot_id = snapshot.id
    )
  )
  from public.worlds as world
  join public.inventory_snapshots as snapshot
    on snapshot.id = world.latest_snapshot_id
   and snapshot.world_id = world.id
   and snapshot.status = 'published'
  where world.id = p_world_id;
$$;

create function public.publish_inventory_snapshot(
  p_world_id uuid,
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_world_uid text;
  v_latest_snapshot_id uuid;
  v_inventory_source_modified_at timestamptz;
  v_existing_snapshot_id uuid;
  v_existing_snapshot_status public.inventory_snapshot_status;
  v_snapshot_id uuid := gen_random_uuid();
  v_source_hash text;
  v_captured_at timestamptz;
  v_source_modified_at timestamptz;
  v_previous_count integer := 0;
  v_new_count integer;
  v_record jsonb;
  v_guild_id uuid;
  v_owner_player_id uuid;
  v_shared_eligible boolean;
begin
  if p_world_id is null or p_snapshot is null then
    raise exception using errcode = '22023', message = 'INVENTORY_SNAPSHOT_INVALID';
  end if;

  select
      world.world_uid,
      world.latest_snapshot_id,
      world.inventory_source_modified_at
    into
      v_world_uid,
      v_latest_snapshot_id,
      v_inventory_source_modified_at
    from public.worlds as world
   where world.id = p_world_id
   for update;
  if v_world_uid is null then
    raise exception using errcode = 'P0001', message = 'WORLD_NOT_FOUND';
  end if;
  if coalesce(p_snapshot #>> '{server,world_uid}', '') <> v_world_uid then
    raise exception using errcode = 'P0001', message = 'CANONICAL_WORLD_UID_MISMATCH';
  end if;
  if jsonb_typeof(p_snapshot -> 'guilds') <> 'array'
     or jsonb_typeof(p_snapshot -> 'players') <> 'array'
     or jsonb_typeof(p_snapshot -> 'pals') <> 'array'
     or jsonb_typeof(p_snapshot -> 'warnings') <> 'array' then
    raise exception using errcode = '22023', message = 'INVENTORY_SNAPSHOT_INVALID';
  end if;

  v_source_hash := p_snapshot ->> 'source_save_hash';
  v_captured_at := (p_snapshot ->> 'captured_at')::timestamptz;
  v_source_modified_at := (p_snapshot ->> 'source_modified_at')::timestamptz;
  if v_source_hash is null
     or char_length(v_source_hash) not between 32 and 128
     or v_captured_at is null
     or v_source_modified_at is null then
    raise exception using errcode = '22023', message = 'INVENTORY_SNAPSHOT_INVALID';
  end if;
  if v_inventory_source_modified_at is not null
     and v_source_modified_at < v_inventory_source_modified_at then
    raise exception using errcode = 'P0001', message = 'INVENTORY_SNAPSHOT_STALE';
  end if;

  select snapshot.id, snapshot.status
    into v_existing_snapshot_id, v_existing_snapshot_status
    from public.inventory_snapshots as snapshot
   where snapshot.world_id = p_world_id
     and snapshot.source_save_hash = v_source_hash
     and snapshot.status in ('parsed', 'published')
  limit 1;
  if v_existing_snapshot_id is not null then
    if v_existing_snapshot_status <> 'published' then
      raise exception using
        errcode = 'P0001',
        message = 'INVENTORY_SNAPSHOT_NOT_PUBLISHED';
    end if;
    update public.worlds as world
       set latest_snapshot_id = v_existing_snapshot_id,
           inventory_source_modified_at = greatest(
             world.inventory_source_modified_at,
             v_source_modified_at
           ),
           updated_at = now()
     where world.id = p_world_id;
    return v_existing_snapshot_id;
  end if;

  v_new_count := jsonb_array_length(p_snapshot -> 'pals');
  if v_latest_snapshot_id is not null then
    select count(*)::integer
      into v_previous_count
      from public.pal_snapshot_items as item
     where item.snapshot_id = v_latest_snapshot_id;
  end if;
  if v_new_count * 2 < v_previous_count and v_previous_count - v_new_count > 50 then
    raise exception using errcode = 'P0001', message = 'INVENTORY_DROP_REVIEW_REQUIRED';
  end if;

  for v_record in select value from jsonb_array_elements(p_snapshot -> 'guilds')
  loop
    insert into public.guilds (
      world_id,
      game_guild_uid,
      name,
      last_seen_at
    ) values (
      p_world_id,
      v_record ->> 'guild_uid',
      v_record ->> 'name',
      v_captured_at
    )
    on conflict (world_id, game_guild_uid) do update
      set name = excluded.name,
          last_seen_at = greatest(public.guilds.last_seen_at, excluded.last_seen_at);
  end loop;

  for v_record in select value from jsonb_array_elements(p_snapshot -> 'players')
  loop
    select guild.id
      into v_guild_id
      from public.guilds as guild
     where guild.world_id = p_world_id
       and guild.game_guild_uid = v_record ->> 'guild_uid';

    insert into public.players (
      world_id,
      guild_id,
      game_player_uid,
      nickname,
      level,
      last_seen_at
    ) values (
      p_world_id,
      v_guild_id,
      v_record ->> 'player_uid',
      v_record ->> 'nickname',
      (v_record ->> 'level')::integer,
      v_captured_at
    )
    on conflict (world_id, game_player_uid) do update
      set guild_id = excluded.guild_id,
          nickname = excluded.nickname,
          level = excluded.level,
          last_seen_at = greatest(public.players.last_seen_at, excluded.last_seen_at);
  end loop;

  insert into public.inventory_snapshots (
    id,
    world_id,
    source_save_hash,
    source_modified_at,
    save_version,
    parser_name,
    parser_version,
    status,
    captured_at,
    parsed_at
  ) values (
    v_snapshot_id,
    p_world_id,
    v_source_hash,
    v_source_modified_at,
    p_snapshot ->> 'save_version',
    p_snapshot ->> 'parser_name',
    p_snapshot ->> 'parser_version',
    'published',
    v_captured_at,
    now()
  );

  for v_record in select value from jsonb_array_elements(p_snapshot -> 'pals')
  loop
    v_owner_player_id := null;
    v_guild_id := null;
    if coalesce((v_record ->> 'owner_resolved')::boolean, false) then
      select player.id
        into v_owner_player_id
        from public.players as player
       where player.world_id = p_world_id
         and player.game_player_uid = v_record ->> 'owner_player_uid';
    end if;
    if coalesce((v_record ->> 'guild_resolved')::boolean, false) then
      select guild.id
        into v_guild_id
        from public.guilds as guild
       where guild.world_id = p_world_id
         and guild.game_guild_uid = v_record ->> 'guild_uid';
    end if;
    v_shared_eligible := coalesce((v_record ->> 'shared_eligible')::boolean, false)
      and v_owner_player_id is not null
      and v_guild_id is not null;

    insert into public.pal_snapshot_items (
      snapshot_id,
      world_id,
      pal_instance_uid,
      pal_id,
      owner_player_id,
      guild_id,
      gender,
      level,
      passive_skill_ids,
      location_type,
      location_name,
      raw_metadata
    ) values (
      v_snapshot_id,
      p_world_id,
      v_record ->> 'instance_uid',
      v_record ->> 'pal_id',
      v_owner_player_id,
      v_guild_id,
      (v_record ->> 'gender')::public.pal_gender,
      (v_record ->> 'level')::integer,
      array(
        select value
        from jsonb_array_elements_text(v_record -> 'passive_skill_ids') as value
      ),
      (v_record ->> 'location_type')::public.pal_location_type,
      v_record ->> 'location_name',
      jsonb_build_object(
        'resolution_status', case when v_shared_eligible then 'resolved' else 'unresolved' end,
        'shared_eligible', v_shared_eligible,
        'warning_codes', coalesce(v_record -> 'warning_codes', '[]'::jsonb)
      )
    );

    insert into public.pal_share_preferences (
      world_id,
      pal_instance_uid,
      owner_player_id_at_set,
      share_enabled,
      updated_at
    ) values (
      p_world_id,
      v_record ->> 'instance_uid',
      v_owner_player_id,
      true,
      v_captured_at
    )
    on conflict (world_id, pal_instance_uid) do update
      set share_enabled = case
            when excluded.owner_player_id_at_set is not null
                 and public.pal_share_preferences.owner_player_id_at_set
                       is distinct from excluded.owner_player_id_at_set
              then true
            else public.pal_share_preferences.share_enabled
          end,
          owner_player_id_at_set = coalesce(
            excluded.owner_player_id_at_set,
            public.pal_share_preferences.owner_player_id_at_set
          ),
          updated_by = case
            when excluded.owner_player_id_at_set is not null
                 and public.pal_share_preferences.owner_player_id_at_set
                       is distinct from excluded.owner_player_id_at_set
              then null
            else public.pal_share_preferences.updated_by
          end,
          updated_at = case
            when excluded.owner_player_id_at_set is not null
                 and public.pal_share_preferences.owner_player_id_at_set
                       is distinct from excluded.owner_player_id_at_set
              then excluded.updated_at
            else public.pal_share_preferences.updated_at
          end;
  end loop;

  update public.worlds
     set latest_snapshot_id = v_snapshot_id,
         inventory_source_modified_at = v_source_modified_at,
         updated_at = now()
   where id = p_world_id;
  return v_snapshot_id;
end;
$$;

revoke all on function public.get_latest_inventory_snapshot_for_agent(uuid)
  from public, anon, authenticated;
revoke all on function public.publish_inventory_snapshot(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.get_latest_inventory_snapshot_for_agent(uuid)
  to service_role;
grant execute on function public.publish_inventory_snapshot(uuid, jsonb)
  to service_role;

comment on function public.publish_inventory_snapshot(uuid, jsonb) is
  'Atomically publishes validated canonical inventory metadata; never accepts raw save bytes or paths.';
