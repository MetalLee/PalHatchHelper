alter table public.inventory_snapshots
  add column payload_purged_at timestamptz,
  add constraint inventory_snapshots_payload_purge_check check (
    payload_purged_at is null
    or (
      status in ('parsed', 'published')
      and payload_purged_at >= created_at
    )
  );

drop index public.inventory_snapshots_world_success_parser_idx;
create unique index inventory_snapshots_world_success_parser_idx
  on public.inventory_snapshots(
    world_id,
    source_save_hash,
    parser_name,
    parser_version
  )
  where status in ('parsed', 'published') and payload_purged_at is null;

create index inventory_snapshots_retention_idx
  on public.inventory_snapshots(created_at, id)
  where payload_purged_at is null;

comment on column public.inventory_snapshots.payload_purged_at is
  'Database lifecycle marker. Non-null means normalized Pal rows were removed by the controlled 24-hour retention RPC.';
comment on index public.inventory_snapshots_world_success_parser_idx is
  'Identical source bytes and parser identity are idempotent only while their normalized payload remains retained.';

create table public.pal_instance_lifecycle (
  world_id uuid not null references public.worlds(id) on delete restrict,
  pal_instance_uid text not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (world_id, pal_instance_uid),
  constraint pal_instance_lifecycle_uid_check
    check (char_length(btrim(pal_instance_uid)) between 1 and 160),
  constraint pal_instance_lifecycle_time_check
    check (last_seen_at >= first_seen_at)
);

insert into public.pal_instance_lifecycle (
  world_id,
  pal_instance_uid,
  first_seen_at,
  last_seen_at,
  created_at,
  updated_at
)
select
  item.world_id,
  item.pal_instance_uid,
  min(snapshot.captured_at),
  max(snapshot.captured_at),
  now(),
  now()
from public.pal_snapshot_items as item
join public.inventory_snapshots as snapshot
  on snapshot.id = item.snapshot_id
 and snapshot.world_id = item.world_id
 and snapshot.status = 'published'
group by item.world_id, item.pal_instance_uid
on conflict (world_id, pal_instance_uid) do update
  set first_seen_at = least(
        public.pal_instance_lifecycle.first_seen_at,
        excluded.first_seen_at
      ),
      last_seen_at = greatest(
        public.pal_instance_lifecycle.last_seen_at,
        excluded.last_seen_at
      ),
      updated_at = now();

alter table public.pal_instance_lifecycle enable row level security;
revoke all on table public.pal_instance_lifecycle from public, anon, authenticated;
grant select on table public.pal_instance_lifecycle to service_role;

comment on table public.pal_instance_lifecycle is
  'Minimal world-scoped first/last-seen state used after full historical inventory payloads expire.';

create function private.record_pal_instance_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_captured_at timestamptz;
begin
  select snapshot.captured_at
    into v_captured_at
    from public.inventory_snapshots as snapshot
   where snapshot.id = new.snapshot_id
     and snapshot.world_id = new.world_id;
  if v_captured_at is null then
    raise exception using errcode = 'P0001', message = 'INVENTORY_SNAPSHOT_INVALID';
  end if;
  insert into public.pal_instance_lifecycle (
    world_id,
    pal_instance_uid,
    first_seen_at,
    last_seen_at
  ) values (
    new.world_id,
    new.pal_instance_uid,
    v_captured_at,
    v_captured_at
  )
  on conflict (world_id, pal_instance_uid) do update
    set first_seen_at = least(
          public.pal_instance_lifecycle.first_seen_at,
          excluded.first_seen_at
        ),
        last_seen_at = greatest(
          public.pal_instance_lifecycle.last_seen_at,
          excluded.last_seen_at
        ),
        updated_at = now();
  return new;
end;
$$;

create trigger pal_snapshot_items_record_lifecycle
  after insert on public.pal_snapshot_items
  for each row execute function private.record_pal_instance_lifecycle();

revoke all on function private.record_pal_instance_lifecycle()
  from public, anon, authenticated, service_role;

create table public.execution_plan_dependencies (
  plan_id uuid not null references public.execution_plans(id) on delete restrict,
  pal_instance_uid text not null,
  owner_player_id_at_adoption uuid references public.players(id) on delete restrict,
  guild_id_at_adoption uuid references public.guilds(id) on delete restrict,
  gender_at_adoption public.pal_gender not null,
  created_at timestamptz not null default now(),
  primary key (plan_id, pal_instance_uid),
  constraint execution_plan_dependencies_uid_check
    check (char_length(btrim(pal_instance_uid)) between 1 and 160)
);

insert into public.execution_plan_dependencies (
  plan_id,
  pal_instance_uid,
  owner_player_id_at_adoption,
  guild_id_at_adoption,
  gender_at_adoption
)
select distinct
  plan.id,
  dependency.pal_instance_uid,
  item.owner_player_id,
  item.guild_id,
  item.gender
from public.execution_plans as plan
join public.breeding_steps as step
  on step.execution_plan_id = plan.id
cross join lateral unnest(array[
  case when step.parent_a_source_kind = 'inventory' then step.parent_a_instance_uid end,
  case when step.parent_b_source_kind = 'inventory' then step.parent_b_instance_uid end
]) as dependency(pal_instance_uid)
join public.pal_snapshot_items as item
  on item.snapshot_id = plan.inventory_snapshot_id
 and item.world_id = plan.world_id
 and item.pal_instance_uid = dependency.pal_instance_uid
where dependency.pal_instance_uid is not null
on conflict (plan_id, pal_instance_uid) do nothing;

alter table public.execution_plan_dependencies enable row level security;
revoke all on table public.execution_plan_dependencies from public, anon, authenticated;
grant select on table public.execution_plan_dependencies to service_role;

comment on table public.execution_plan_dependencies is
  'Minimal adopted owner, guild, and gender facts needed to invalidate an execution plan after its source inventory payload expires.';

create function private.capture_execution_plan_dependencies()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan public.execution_plans%rowtype;
  v_item public.pal_snapshot_items%rowtype;
  v_instance_uid text;
begin
  if new.execution_plan_id is null then
    return new;
  end if;

  select *
    into v_plan
    from public.execution_plans
   where id = new.execution_plan_id;
  if v_plan.id is null then
    raise exception using errcode = 'P0001', message = 'PLAN_NOT_FOUND';
  end if;

  foreach v_instance_uid in array array[
    case when new.parent_a_source_kind = 'inventory' then new.parent_a_instance_uid end,
    case when new.parent_b_source_kind = 'inventory' then new.parent_b_instance_uid end
  ]
  loop
    if v_instance_uid is null then
      continue;
    end if;
    select *
      into v_item
      from public.pal_snapshot_items as item
     where item.snapshot_id = v_plan.inventory_snapshot_id
       and item.world_id = v_plan.world_id
       and item.pal_instance_uid = v_instance_uid;
    if v_item.id is null then
      raise exception using errcode = 'P0001', message = 'PLAN_DEPENDENCY_UNAVAILABLE';
    end if;
    insert into public.execution_plan_dependencies (
      plan_id,
      pal_instance_uid,
      owner_player_id_at_adoption,
      guild_id_at_adoption,
      gender_at_adoption
    ) values (
      v_plan.id,
      v_instance_uid,
      v_item.owner_player_id,
      v_item.guild_id,
      v_item.gender
    )
    on conflict (plan_id, pal_instance_uid) do nothing;
  end loop;
  return new;
end;
$$;

create trigger breeding_steps_capture_execution_dependencies
  after insert or update of execution_plan_id, parent_a_source_kind,
    parent_a_instance_uid, parent_b_source_kind, parent_b_instance_uid
  on public.breeding_steps
  for each row execute function private.capture_execution_plan_dependencies();

revoke all on function private.capture_execution_plan_dependencies()
  from public, anon, authenticated, service_role;

alter table public.step_offspring_candidates
  drop constraint step_candidates_snapshot_item_fkey,
  add constraint step_candidates_snapshot_fkey
    foreign key (detected_snapshot_id)
    references public.inventory_snapshots(id)
    on delete restrict;

create or replace function public.reject_inventory_snapshot_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_user = 'postgres'
    and current_setting('palhatch.inventory_retention_cleanup', true) = 'on'
  then
    if tg_op = 'UPDATE'
      and old.payload_purged_at is null
      and new.payload_purged_at is not null
      and (to_jsonb(new) - 'payload_purged_at')
        = (to_jsonb(old) - 'payload_purged_at')
    then
      return new;
    end if;
    if tg_op = 'DELETE' and old.status in ('failed', 'rejected') then
      return old;
    end if;
  end if;
  raise exception using
    errcode = 'P0001',
    message = 'INVENTORY_SNAPSHOT_IMMUTABLE';
end;
$$;

create or replace function public.reject_pal_snapshot_item_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE'
    and current_user = 'postgres'
    and current_setting('palhatch.inventory_retention_cleanup', true) = 'on'
  then
    return old;
  end if;
  raise exception using
    errcode = 'P0001',
    message = 'PAL_SNAPSHOT_ITEM_IMMUTABLE';
end;
$$;

create or replace function private.publish_inventory_snapshot(
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
  v_parser_name text;
  v_parser_version text;
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
  v_parser_name := p_snapshot ->> 'parser_name';
  v_parser_version := p_snapshot ->> 'parser_version';
  v_captured_at := (p_snapshot ->> 'captured_at')::timestamptz;
  v_source_modified_at := (p_snapshot ->> 'source_modified_at')::timestamptz;
  if v_source_hash is null
     or char_length(v_source_hash) not between 32 and 128
     or char_length(coalesce(v_parser_name, '')) not between 1 and 100
     or char_length(coalesce(v_parser_version, '')) not between 1 and 100
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
     and snapshot.parser_name = v_parser_name
     and snapshot.parser_version = v_parser_version
     and snapshot.status in ('parsed', 'published')
     and snapshot.payload_purged_at is null
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
    v_parser_name,
    v_parser_version,
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

revoke all on function private.publish_inventory_snapshot(uuid, jsonb)
  from public, anon, authenticated, service_role;

comment on function private.publish_inventory_snapshot(uuid, jsonb) is
  'Atomically publishes one retained canonical inventory occurrence and updates minimal Pal lifecycle state.';

create or replace function public.get_execution_snapshot_delta(
  p_step_id uuid,
  p_detected_snapshot_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_step public.breeding_steps%rowtype;
  v_plan public.execution_plans%rowtype;
  v_baseline public.inventory_snapshots%rowtype;
  v_detected public.inventory_snapshots%rowtype;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  select * into v_step from public.breeding_steps where id = p_step_id;
  select * into v_plan from public.execution_plans where id = v_step.execution_plan_id;
  select * into v_baseline
    from public.inventory_snapshots
   where id = v_step.baseline_snapshot_id
     and status = 'published';
  select * into v_detected
    from public.inventory_snapshots
   where id = p_detected_snapshot_id
     and status = 'published'
     and payload_purged_at is null;
  if v_step.id is null
    or v_plan.id is null
    or v_baseline.id is null
    or v_detected.id is null
    or v_detected.world_id <> v_plan.world_id
    or v_detected.captured_at <= v_baseline.captured_at
  then
    raise exception using errcode = 'P0001', message = 'SNAPSHOT_DELTA_UNAVAILABLE';
  end if;
  return jsonb_build_object(
    'baseline', '[]'::jsonb,
    'current', coalesce((
      select jsonb_agg(jsonb_build_object(
        'instance_uid', item.pal_instance_uid,
        'pal_id', item.pal_id,
        'gender', item.gender,
        'passive_skill_ids', item.passive_skill_ids,
        'level', item.level,
        'owner_display_name', coalesce(player.nickname, '未知所有者'),
        'location_type', item.location_type,
        'location_name', item.location_name,
        'accessible', (
          item.owner_player_id = v_plan.player_id
          or (
            v_plan.allow_guild_shared
            and item.guild_id = v_plan.guild_id
            and coalesce(preference.share_enabled, true)
          )
        )
      ) order by item.pal_instance_uid)
      from public.pal_snapshot_items as item
      left join public.players as player on player.id = item.owner_player_id
      left join public.pal_share_preferences as preference
        on preference.world_id = item.world_id
       and preference.pal_instance_uid = item.pal_instance_uid
      where item.snapshot_id = v_detected.id
    ), '[]'::jsonb),
    'seen_before_or_at_baseline', coalesce((
      select jsonb_agg(lifecycle.pal_instance_uid order by lifecycle.pal_instance_uid)
      from public.pal_instance_lifecycle as lifecycle
      where lifecycle.world_id = v_plan.world_id
        and lifecycle.first_seen_at <= v_baseline.captured_at
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.record_execution_candidates(
  p_step_id uuid,
  p_detected_snapshot_id uuid,
  p_candidates jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_step public.breeding_steps%rowtype;
  v_plan public.execution_plans%rowtype;
  v_snapshot public.inventory_snapshots%rowtype;
  v_baseline public.inventory_snapshots%rowtype;
  v_candidate jsonb;
  v_item public.pal_snapshot_items%rowtype;
  v_matched text[];
  v_accessible boolean;
  v_count integer := 0;
  v_key text;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_candidates is null
    or jsonb_typeof(p_candidates) <> 'array'
    or jsonb_array_length(p_candidates) > 500
  then
    raise exception using errcode = 'P0001', message = 'SNAPSHOT_DELTA_UNAVAILABLE';
  end if;
  select * into v_step from public.breeding_steps where id = p_step_id for update;
  if v_step.id is null
    or v_step.execution_plan_id is null
    or v_step.status not in ('breeding', 'retrying', 'candidate_detected')
  then
    raise exception using errcode = 'P0001', message = 'PLAN_INVALID_STATE_TRANSITION';
  end if;
  select * into v_plan
    from public.execution_plans
   where id = v_step.execution_plan_id
   for update;
  select * into v_snapshot
    from public.inventory_snapshots
   where id = p_detected_snapshot_id
     and status = 'published'
     and payload_purged_at is null;
  select * into v_baseline
    from public.inventory_snapshots
   where id = v_step.baseline_snapshot_id
     and status = 'published';
  if v_plan.id is null
    or v_snapshot.id is null
    or v_baseline.id is null
    or v_snapshot.world_id <> v_plan.world_id
    or v_snapshot.captured_at <= v_baseline.captured_at
  then
    raise exception using errcode = 'P0001', message = 'SNAPSHOT_DELTA_UNAVAILABLE';
  end if;
  if exists (
    select 1
    from public.execution_candidate_detection_runs
    where step_id = p_step_id
      and detected_snapshot_id = p_detected_snapshot_id
  ) then
    return (
      select candidate_count
      from public.execution_candidate_detection_runs
      where step_id = p_step_id
        and detected_snapshot_id = p_detected_snapshot_id
    );
  end if;

  for v_candidate in select value from jsonb_array_elements(p_candidates)
  loop
    if (v_candidate ->> 'match_score')::numeric not between 0 and 1
      or jsonb_typeof(v_candidate -> 'match_breakdown') <> 'object'
    then
      raise exception using errcode = 'P0001', message = 'SNAPSHOT_DELTA_UNAVAILABLE';
    end if;
    select * into v_item
      from public.pal_snapshot_items
     where snapshot_id = v_snapshot.id
       and pal_instance_uid = v_candidate ->> 'pal_instance_uid';
    if v_item.id is null or v_item.pal_id <> v_step.expected_child_pal_id then
      continue;
    end if;
    if not exists (
      select 1
      from public.pal_instance_lifecycle as lifecycle
      where lifecycle.world_id = v_plan.world_id
        and lifecycle.pal_instance_uid = v_item.pal_instance_uid
        and lifecycle.first_seen_at > v_baseline.captured_at
    ) then
      continue;
    end if;
    select coalesce(array_agg(required order by required), '{}'::text[])
      into v_matched
      from unnest(v_step.required_passive_ids) as required
     where required = any(v_item.passive_skill_ids);
    v_accessible := v_item.owner_player_id = v_plan.player_id
      or (
        v_plan.allow_guild_shared
        and v_plan.guild_id is not null
        and v_item.guild_id = v_plan.guild_id
        and coalesce((
          select preference.share_enabled
          from public.pal_share_preferences as preference
          where preference.world_id = v_item.world_id
            and preference.pal_instance_uid = v_item.pal_instance_uid
        ), true)
      );
    if not v_accessible then
      continue;
    end if;
    v_key := encode(extensions.digest(convert_to(concat_ws(
      '|',
      p_step_id::text,
      p_detected_snapshot_id::text,
      v_item.pal_instance_uid
    ), 'UTF8'), 'sha256'), 'hex');
    insert into public.step_offspring_candidates (
      step_id,
      pal_instance_uid,
      detected_snapshot_id,
      candidate_key,
      pal_id,
      species_match,
      match_score,
      matched_passive_ids,
      required_passive_count,
      gender,
      level,
      owner_display_name,
      location_type,
      location_name,
      accessible,
      match_breakdown,
      first_detected_at
    ) values (
      p_step_id,
      v_item.pal_instance_uid,
      v_snapshot.id,
      v_key,
      v_item.pal_id,
      true,
      (v_candidate ->> 'match_score')::numeric,
      v_matched,
      cardinality(v_step.required_passive_ids),
      v_item.gender,
      v_item.level,
      coalesce((
        select player.nickname
        from public.players as player
        where player.id = v_item.owner_player_id
      ), '未知所有者'),
      v_item.location_type,
      v_item.location_name,
      true,
      v_candidate -> 'match_breakdown',
      v_snapshot.captured_at
    )
    on conflict (step_id, pal_instance_uid) do nothing;
    if found then
      v_count := v_count + 1;
    end if;
  end loop;
  insert into public.execution_candidate_detection_runs (
    step_id,
    detected_snapshot_id,
    candidate_count
  ) values (
    p_step_id,
    p_detected_snapshot_id,
    v_count
  );
  if v_count > 0 and v_step.status in ('breeding', 'retrying') then
    update public.breeding_steps
       set status = 'candidate_detected',
           concurrency_version = concurrency_version + 1,
           updated_at = now()
     where id = v_step.id;
    update public.execution_plans
       set status = 'awaiting_confirmation',
           concurrency_version = concurrency_version + 1,
           updated_at = now()
     where id = v_plan.id;
    insert into public.execution_plan_events (
      plan_id,
      step_id,
      event_type,
      actor_kind,
      from_status,
      to_status,
      safe_metadata,
      idempotency_key
    ) values (
      v_plan.id,
      v_step.id,
      'OFFSPRING_CANDIDATES_DETECTED',
      'agent',
      v_step.status::text,
      'candidate_detected',
      jsonb_build_object('snapshot_id', v_snapshot.id, 'candidate_count', v_count),
      'agent:' || v_step.id::text || ':' || v_snapshot.id::text
    );
  end if;
  return v_count;
end;
$$;

create or replace function public.invalidate_execution_plan_dependencies(
  p_detected_snapshot_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot public.inventory_snapshots%rowtype;
  v_plan public.execution_plans%rowtype;
  v_step public.breeding_steps%rowtype;
  v_uid text;
  v_reason jsonb;
  v_count integer := 0;
  v_item public.pal_snapshot_items%rowtype;
  v_dependency public.execution_plan_dependencies%rowtype;
  v_share_enabled boolean;
  v_reason_code text;
  v_required_gender text;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  select * into v_snapshot
    from public.inventory_snapshots
   where id = p_detected_snapshot_id
     and status = 'published'
     and payload_purged_at is null;
  if v_snapshot.id is null then
    raise exception using errcode = 'P0001', message = 'SNAPSHOT_DELTA_UNAVAILABLE';
  end if;
  for v_plan in
    select *
    from public.execution_plans
    where world_id = v_snapshot.world_id
      and status in ('active', 'awaiting_confirmation', 'paused')
    for update
  loop
    v_reason := null;
    if not exists (
      select 1
      from public.game_data_versions
      where id = v_plan.game_data_version_id
        and content_hash = v_plan.content_hash
    ) then
      v_reason := jsonb_build_object(
        'code', 'FIXED_CONTENT_HASH_MISMATCH',
        'step_index', null,
        'instance_uid', null,
        'details', '{}'::jsonb
      );
    else
      for v_step in
        select *
        from public.breeding_steps
        where execution_plan_id = v_plan.id
          and status not in ('completed', 'skipped', 'invalidated')
        order by step_index
      loop
        foreach v_uid in array array[
          v_step.parent_a_instance_uid,
          v_step.parent_b_instance_uid
        ]
        loop
          if v_uid is null then
            continue;
          end if;
          v_reason_code := null;
          v_required_gender := case
            when v_uid is not distinct from v_step.parent_a_instance_uid
              then v_step.parent_a_required_gender
            else v_step.parent_b_required_gender
          end;
          select * into v_item
            from public.pal_snapshot_items as item
           where item.snapshot_id = v_snapshot.id
             and item.pal_instance_uid = v_uid;
          select * into v_dependency
            from public.execution_plan_dependencies as dependency
           where dependency.plan_id = v_plan.id
             and dependency.pal_instance_uid = v_uid;
          select coalesce(preference.share_enabled, true)
            into v_share_enabled
            from public.pal_share_preferences as preference
           where preference.world_id = v_plan.world_id
             and preference.pal_instance_uid = v_uid;
          if v_item.id is null then
            v_reason_code := 'DEPENDENCY_DISAPPEARED';
          elsif v_dependency.plan_id is null then
            v_reason_code := 'DEPENDENCY_DISAPPEARED';
          elsif v_item.owner_player_id
            is distinct from v_dependency.owner_player_id_at_adoption
          then
            v_reason_code := 'OWNER_CHANGED';
          elsif v_item.owner_player_id <> v_plan.player_id
            and v_item.guild_id is distinct from v_plan.guild_id
          then
            v_reason_code := 'GUILD_ACCESS_LOST';
          elsif v_item.owner_player_id <> v_plan.player_id
            and (
              not v_plan.allow_guild_shared
              or not coalesce(v_share_enabled, true)
            )
          then
            v_reason_code := 'SHARING_DISABLED';
          elsif v_required_gender is not null
            and v_item.gender::text <> v_required_gender
          then
            v_reason_code := 'GENDER_INCOMPATIBLE';
          end if;
          if v_reason_code is not null then
            v_reason := jsonb_build_object(
              'code', v_reason_code,
              'step_index', v_step.step_index,
              'instance_uid', v_uid,
              'details', jsonb_build_object('snapshot_id', v_snapshot.id)
            );
            exit;
          end if;
        end loop;
        exit when v_reason is not null;
      end loop;
    end if;
    if v_reason is not null then
      update public.breeding_steps
         set status = 'invalidated',
             invalidation_reasons = invalidation_reasons || jsonb_build_array(v_reason),
             concurrency_version = concurrency_version + 1,
             updated_at = now()
       where execution_plan_id = v_plan.id
         and status not in ('completed', 'skipped', 'invalidated');
      update public.execution_plans
         set status = 'invalidated',
             invalidation_reasons = invalidation_reasons || jsonb_build_array(v_reason),
             paused_at = null,
             concurrency_version = concurrency_version + 1,
             updated_at = now()
       where id = v_plan.id;
      insert into public.execution_plan_events (
        plan_id,
        event_type,
        actor_kind,
        from_status,
        to_status,
        safe_metadata,
        idempotency_key
      ) values (
        v_plan.id,
        'PLAN_INVALIDATED',
        'agent',
        v_plan.status::text,
        'invalidated',
        jsonb_build_object('reason', v_reason),
        'invalidate:' || v_snapshot.id::text || ':' || v_plan.id::text
      );
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create function public.cleanup_expired_inventory_snapshot_payloads(
  p_batch_size integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot_ids uuid[] := '{}'::uuid[];
  v_failure_ids uuid[] := '{}'::uuid[];
  v_deleted_item_count integer := 0;
  v_deleted_failure_count integer := 0;
  v_deleted_detection_run_count integer := 0;
  v_expired_job_count integer := 0;
  v_purged_snapshot_count integer := 0;
  v_remaining_eligible_count integer := 0;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_batch_size is null or p_batch_size not between 1 and 100 then
    raise exception using
      errcode = '22023',
      message = 'INVENTORY_RETENTION_BATCH_INVALID';
  end if;

  perform 1 from public.worlds order by id for update;

  select coalesce(array_agg(candidate.id order by candidate.created_at, candidate.id), '{}')
    into v_snapshot_ids
    from (
      select snapshot.id, snapshot.created_at
      from public.inventory_snapshots as snapshot
      join public.worlds as world on world.id = snapshot.world_id
      where snapshot.status in ('parsed', 'published')
        and snapshot.payload_purged_at is null
        and snapshot.created_at < statement_timestamp() - interval '24 hours'
        and snapshot.id is distinct from world.latest_snapshot_id
      order by snapshot.created_at, snapshot.id
      limit p_batch_size
      for update of snapshot skip locked
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
     set status = 'failed',
         locked_by = null,
         locked_at = null,
         heartbeat_at = null,
         lease_token = null,
         error_code = 'INVENTORY_SNAPSHOT_EXPIRED',
         error_summary = 'The fixed inventory payload expired after 24 hours.',
         completed_at = now(),
         updated_at = now()
   where inventory_snapshot_id = any(v_snapshot_ids)
     and status not in ('completed', 'failed', 'cancelled');
  get diagnostics v_expired_job_count = row_count;

  delete from public.execution_candidate_detection_runs
   where detected_snapshot_id = any(v_snapshot_ids);
  get diagnostics v_deleted_detection_run_count = row_count;

  delete from public.pal_snapshot_items
   where snapshot_id = any(v_snapshot_ids);
  get diagnostics v_deleted_item_count = row_count;

  update public.inventory_snapshots
     set payload_purged_at = statement_timestamp()
   where id = any(v_snapshot_ids);
  get diagnostics v_purged_snapshot_count = row_count;

  delete from public.inventory_snapshots
   where id = any(v_failure_ids);
  get diagnostics v_deleted_failure_count = row_count;

  select count(*)::integer
    into v_remaining_eligible_count
    from public.inventory_snapshots as snapshot
    join public.worlds as world on world.id = snapshot.world_id
   where snapshot.status in ('parsed', 'published')
     and snapshot.payload_purged_at is null
     and snapshot.created_at < statement_timestamp() - interval '24 hours'
     and snapshot.id is distinct from world.latest_snapshot_id;

  return jsonb_build_object(
    'purged_snapshot_count', v_purged_snapshot_count,
    'deleted_item_count', v_deleted_item_count,
    'deleted_failure_count', v_deleted_failure_count,
    'deleted_detection_run_count', v_deleted_detection_run_count,
    'expired_job_count', v_expired_job_count,
    'remaining_eligible_count', v_remaining_eligible_count
  );
end;
$$;

revoke all on function public.cleanup_expired_inventory_snapshot_payloads(integer)
  from public, anon, authenticated;
grant execute on function public.cleanup_expired_inventory_snapshot_payloads(integer)
  to service_role;

comment on function public.cleanup_expired_inventory_snapshot_payloads(integer) is
  'Service-only bounded cleanup for superseded normalized inventory payloads older than 24 hours; latest snapshots and materialized plan history are preserved.';
