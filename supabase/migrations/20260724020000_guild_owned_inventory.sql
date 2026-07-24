alter table public.pal_snapshot_items
  add column ownership_scope text generated always as (
    case
      when owner_player_id is not null then 'player'
      when owner_player_id is null
        and guild_id is not null
        and location_type = 'base'
        and raw_metadata ->> 'ownership_scope' = 'guild'
        then 'guild'
      else 'unresolved'
    end
  ) stored,
  add constraint pal_snapshot_items_ownership_scope_check
    check (ownership_scope in ('player', 'guild', 'unresolved'));

comment on column public.pal_snapshot_items.ownership_scope is
  'Derived immutable ownership: player, resolved guild-owned base worker, or unresolved. Legacy ownerless rows remain unresolved unless their audited metadata explicitly identifies guild ownership.';

create or replace function private.attach_pal_snapshot_source_metadata()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_source_metadata jsonb;
  v_ownership_scope text;
begin
  v_source_metadata := coalesce(
    nullif(current_setting('palhatch.source_metadata', true), ''),
    '{}'
  )::jsonb -> new.pal_instance_uid;

  if jsonb_typeof(v_source_metadata) = 'object' then
    new.raw_metadata := coalesce(new.raw_metadata, '{}'::jsonb) || v_source_metadata;
  end if;

  v_ownership_scope := case
    when new.owner_player_id is not null then 'player'
    when new.owner_player_id is null
      and new.guild_id is not null
      and new.location_type = 'base'
      then 'guild'
    else 'unresolved'
  end;
  new.raw_metadata := coalesce(new.raw_metadata, '{}'::jsonb)
    || jsonb_build_object('ownership_scope', v_ownership_scope);
  if v_ownership_scope = 'guild' then
    new.raw_metadata := new.raw_metadata || jsonb_build_object(
      'resolution_status', 'resolved',
      'shared_eligible', true,
      'warning_codes',
        coalesce(new.raw_metadata -> 'warning_codes', '[]'::jsonb) - 'OWNER_UNRESOLVED'
    );
  end if;
  return new;
end;
$$;

revoke all on function private.attach_pal_snapshot_source_metadata()
  from public, anon, authenticated, service_role;

do $migration$
declare
  v_function regprocedure;
  v_definition text;
  v_original text;
begin
  foreach v_function in array array[
    'public.list_available_pals_page(text,text,text,public.pal_gender,text,public.pal_location_type,boolean,uuid,uuid,text,text,integer)'::regprocedure,
    'public.list_available_pals_page_v2(text,text,text,public.pal_gender,text,public.pal_location_type,boolean,uuid,uuid,integer,integer)'::regprocedure
  ]
  loop
    v_definition := pg_get_functiondef(v_function);
    v_original := v_definition;
    v_definition := replace(
      v_definition,
      $find$convert_to(item.world_id::text || ':' || item.owner_player_id::text, 'UTF8')$find$,
      $replace$convert_to(
            case
              when item.ownership_scope = 'guild'
                then item.world_id::text || ':guild:' || item.guild_id::text
              else item.world_id::text || ':' || item.owner_player_id::text
            end,
            'UTF8'
          )$replace$
    );
    v_definition := replace(
      v_definition,
      'owner.nickname as owner_display_name,',
      'coalesce(owner.nickname, owner_guild.name) as owner_display_name,'
    );
    v_definition := replace(
      v_definition,
      'item.location_name,' || chr(10) || '      coalesce(preference.share_enabled, true) as share_enabled,',
      'item.location_name,' || chr(10)
        || '      item.ownership_scope,' || chr(10)
        || '      case when item.ownership_scope = ''guild'' then true'
        || ' else coalesce(preference.share_enabled, true) end as share_enabled,'
    );
    v_definition := replace(
      v_definition,
      'item.owner_player_id = v_player_id as is_owned_by_requester',
      'coalesce(item.owner_player_id = v_player_id, false) as is_owned_by_requester'
    );
    v_definition := replace(
      v_definition,
      'join public.players as owner on owner.id = item.owner_player_id',
      'left join public.players as owner on owner.id = item.owner_player_id'
        || chr(10)
        || '    left join public.guilds as owner_guild on owner_guild.id = item.guild_id'
    );
    v_definition := replace(
      v_definition,
      'and preference.owner_player_id_at_set = item.owner_player_id',
      'and preference.owner_player_id_at_set is not distinct from item.owner_player_id'
    );
    v_definition := replace(
      v_definition,
      'and item.owner_player_id <> v_player_id',
      'and item.owner_player_id is distinct from v_player_id'
    );
    v_definition := replace(
      v_definition,
      'and coalesce(preference.share_enabled, true)',
      'and case when item.ownership_scope = ''guild'' then true'
        || ' else coalesce(preference.share_enabled, true) end'
    );
    v_definition := replace(
      v_definition,
      '''location_name'', page.location_name,',
      '''location_name'', page.location_name,'
        || chr(10) || '          ''ownership_scope'', page.ownership_scope,'
    );
    if v_definition = v_original
      or position('item.ownership_scope' in v_definition) = 0
      or position('owner_guild.name' in v_definition) = 0
      or position('''ownership_scope'', page.ownership_scope' in v_definition) = 0
    then
      raise exception using
        errcode = 'P0001',
        message = 'GUILD_OWNED_INVENTORY_PROJECTION_PATCH_FAILED',
        detail = v_function::text;
    end if;
    execute v_definition;
  end loop;
end;
$migration$;

create or replace function public.get_breeding_inventory_for_agent(p_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.breeding_jobs%rowtype;
  v_items jsonb;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  select * into v_job from public.breeding_jobs where id = p_job_id;
  if v_job.id is null then
    raise exception using errcode = 'P0001', message = 'JOB_NOT_FOUND';
  end if;
  if not exists (
    select 1 from public.inventory_snapshots as snapshot
     where snapshot.id = v_job.inventory_snapshot_id
       and snapshot.world_id = v_job.world_id
       and snapshot.status = 'published'
       and snapshot.payload_purged_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'BREEDING_INVENTORY_SNAPSHOT_MISMATCH';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'instance_uid', item.pal_instance_uid,
      'pal_id', item.pal_id,
      'owner_player_id', item.owner_player_id,
      'guild_id', item.guild_id,
      'gender', item.gender,
      'passive_skill_ids', item.passive_skill_ids,
      'location_type', item.location_type,
      'location_name', item.location_name,
      'ownership_scope', item.ownership_scope,
      'share_enabled', case
        when item.ownership_scope = 'guild' then true
        else coalesce(preference.share_enabled, true)
      end,
      'owner_resolved', item.ownership_scope <> 'unresolved',
      'guild_resolved',
        item.ownership_scope <> 'unresolved' and item.guild_id is not null,
      'present_in_snapshot', true,
      'breeding_enabled', coalesce((item.raw_metadata->>'breeding_enabled')::boolean, true),
      'plan_locked', false
    ) order by item.pal_instance_uid
  ), '[]'::jsonb) into v_items
    from public.pal_snapshot_items as item
    left join public.pal_share_preferences as preference
      on preference.world_id = item.world_id
     and preference.pal_instance_uid = item.pal_instance_uid
     and preference.owner_player_id_at_set
       is not distinct from item.owner_player_id
   where item.snapshot_id = v_job.inventory_snapshot_id
     and item.world_id = v_job.world_id;

  return jsonb_build_object(
    'snapshot_id', v_job.inventory_snapshot_id,
    'world_id', v_job.world_id,
    'items', v_items
  );
end;
$$;

revoke all on function public.get_breeding_inventory_for_agent(uuid)
  from public, anon, authenticated;
grant execute on function public.get_breeding_inventory_for_agent(uuid)
  to service_role;

create or replace function private.breeding_parent_view(p_parent jsonb)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (p_parent - 'owner_player_id' - 'guild_id') || jsonb_build_object(
    'owner_display_name',
    case p_parent->>'source_type'
      when 'intermediate' then '中间产物'
      when 'missing' then '缺少：需补充库存'
      else coalesce(
        (
          select player.nickname from public.players as player
           where player.id = nullif(p_parent->>'owner_player_id', '')::uuid
        ),
        (
          select guild.name from public.guilds as guild
           where guild.id = nullif(p_parent->>'guild_id', '')::uuid
        ),
        '未知所有者'
      )
    end,
    'required_passive_ids',
    case when p_parent->>'source_type' = 'missing'
      then '[]'::jsonb
      else coalesce(p_parent->'required_passive_ids', '[]'::jsonb)
    end
  );
$$;

revoke all on function private.breeding_parent_view(jsonb)
  from public, anon, authenticated, service_role;

do $migration$
declare
  v_function regprocedure :=
    'public.get_execution_snapshot_delta(uuid,uuid)'::regprocedure;
  v_definition text := pg_get_functiondef(v_function);
begin
  v_definition := replace(
    v_definition,
    'coalesce(player.nickname, ''未知所有者'')',
    'coalesce(player.nickname, owner_guild.name, ''未知所有者'')'
  );
  v_definition := replace(
    v_definition,
    'left join public.players as player on player.id = item.owner_player_id',
    'left join public.players as player on player.id = item.owner_player_id'
      || chr(10)
      || '      left join public.guilds as owner_guild on owner_guild.id = item.guild_id'
  );
  v_definition := replace(
    v_definition,
    $find$'accessible', (
          item.owner_player_id = v_plan.player_id
          or (
            v_plan.allow_guild_shared
            and item.guild_id = v_plan.guild_id
            and coalesce(preference.share_enabled, true)
          )
        )$find$,
    $replace$'accessible', coalesce(
          item.owner_player_id = v_plan.player_id
          or (
            v_plan.allow_guild_shared
            and item.guild_id = v_plan.guild_id
            and case when item.ownership_scope = 'guild'
              then true else coalesce(preference.share_enabled, true) end
          ),
          false
        )$replace$
  );
  if position('owner_guild.name' in v_definition) = 0 then
    raise exception using errcode = 'P0001',
      message = 'EXECUTION_DELTA_GUILD_OWNER_PATCH_FAILED';
  end if;
  execute v_definition;
end;
$migration$;

do $migration$
declare
  v_function regprocedure :=
    'public.record_execution_candidates(uuid,uuid,jsonb)'::regprocedure;
  v_definition text := pg_get_functiondef(v_function);
begin
  v_definition := replace(
    v_definition,
    'v_accessible := v_item.owner_player_id = v_plan.player_id',
    'v_accessible := coalesce(v_item.owner_player_id = v_plan.player_id'
  );
  v_definition := replace(
    v_definition,
    '      );' || chr(10) || '    if not v_accessible then',
    '      ), false);' || chr(10) || '    if not v_accessible then'
  );
  v_definition := replace(
    v_definition,
    $find$coalesce((
        select player.nickname
        from public.players as player
        where player.id = v_item.owner_player_id
      ), '未知所有者')$find$,
    $replace$coalesce(
        (
          select player.nickname
          from public.players as player
          where player.id = v_item.owner_player_id
        ),
        (
          select guild.name
          from public.guilds as guild
          where guild.id = v_item.guild_id
        ),
        '未知所有者'
      )$replace$
  );
  if position('select guild.name' in v_definition) = 0
    or position('v_accessible := coalesce' in v_definition) = 0
  then
    raise exception using errcode = 'P0001',
      message = 'EXECUTION_CANDIDATE_GUILD_OWNER_PATCH_FAILED';
  end if;
  execute v_definition;
end;
$migration$;

do $migration$
declare
  v_function regprocedure :=
    'public.invalidate_execution_plan_dependencies(uuid)'::regprocedure;
  v_definition text := pg_get_functiondef(v_function);
begin
  v_definition := replace(
    v_definition,
    'v_item.owner_player_id <> v_plan.player_id',
    'v_item.owner_player_id is distinct from v_plan.player_id'
  );
  if position('v_item.owner_player_id is distinct from v_plan.player_id' in v_definition) = 0 then
    raise exception using errcode = 'P0001',
      message = 'EXECUTION_INVALIDATION_NULL_OWNER_PATCH_FAILED';
  end if;
  execute v_definition;
end;
$migration$;

comment on function public.get_breeding_inventory_for_agent(uuid) is
  'Returns exact snapshot inventory facts for the Agent, including resolved guild-owned base workers and explicit ownership scope.';
