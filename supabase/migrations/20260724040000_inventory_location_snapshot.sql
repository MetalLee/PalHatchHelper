alter type public.pal_location_type
  add value if not exists 'dimensional_storage' before 'viewing_cage';

alter table public.pal_snapshot_items
  add column is_boss boolean,
  add column location_id text,
  add column location_slot_index integer,
  add column location_access_scope text not null default 'unresolved',
  add constraint pal_snapshot_items_location_id_check
    check (
      location_id is null
      or char_length(btrim(location_id)) between 1 and 160
    ),
  add constraint pal_snapshot_items_location_slot_index_check
    check (
      location_slot_index is null
      or location_slot_index between 0 and 100000
    ),
  add constraint pal_snapshot_items_location_access_scope_check
    check (location_access_scope in ('player', 'guild', 'unresolved'));

comment on column public.pal_snapshot_items.is_boss is
  'Authoritative boss marker. Null is reserved for rows published by parser versions that predate this field.';
comment on column public.pal_snapshot_items.location_id is
  'Stable logical base or dimensional-storage identifier; never a raw container GUID.';
comment on column public.pal_snapshot_items.location_slot_index is
  'Zero-based absolute slot. Player and dimensional storage pages use floor(slot/30)+1.';
comment on column public.pal_snapshot_items.location_access_scope is
  'Independent access fact. Unresolved dimensional storage is excluded from guild sharing.';

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
    if jsonb_typeof(v_source_metadata -> 'is_boss') = 'boolean' then
      new.is_boss := (v_source_metadata ->> 'is_boss')::boolean;
    end if;
    if jsonb_typeof(v_source_metadata -> 'location_id') = 'string' then
      new.location_id := nullif(v_source_metadata ->> 'location_id', '');
    end if;
    if jsonb_typeof(v_source_metadata -> 'location_slot_index') = 'number' then
      new.location_slot_index :=
        (v_source_metadata ->> 'location_slot_index')::integer;
    end if;
    if jsonb_typeof(v_source_metadata -> 'location_access_scope') = 'string' then
      new.location_access_scope :=
        v_source_metadata ->> 'location_access_scope';
    end if;
    new.raw_metadata := coalesce(new.raw_metadata, '{}'::jsonb)
      || (
        v_source_metadata
        - 'is_boss'
        - 'location_id'
        - 'location_slot_index'
        - 'location_access_scope'
      );
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
        coalesce(new.raw_metadata -> 'warning_codes', '[]'::jsonb)
          - 'OWNER_UNRESOLVED'
    );
  end if;
  return new;
end;
$$;

revoke all on function private.attach_pal_snapshot_source_metadata()
  from public, anon, authenticated, service_role;

create or replace function public.publish_inventory_snapshot(
  p_world_id uuid,
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot_id uuid;
  v_source_metadata jsonb;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  select coalesce(
    jsonb_object_agg(
      record.value ->> 'instance_uid',
      jsonb_build_object(
        'is_boss', record.value -> 'is_boss',
        'location_id', record.value -> 'location_id',
        'location_slot_index', record.value -> 'location_slot_index',
        'location_access_scope', record.value -> 'location_access_scope'
      )
      || case
        when jsonb_typeof(record.value -> 'metadata') = 'object'
          and nullif(
            record.value #>> '{metadata,source_internal_name}',
            ''
          ) is not null
        then jsonb_build_object(
          'source_internal_name',
            left(
              record.value #>> '{metadata,source_internal_name}',
              120
            ),
          'source_passive_skill_internal_names', case
            when jsonb_typeof(
              record.value
                #> '{metadata,source_passive_skill_internal_names}'
            ) = 'array'
              then coalesce((
                select jsonb_agg(
                  left(source_name.value, 120)
                  order by source_name.ordinality
                )
                from jsonb_array_elements_text(
                  record.value
                    #> '{metadata,source_passive_skill_internal_names}'
                ) with ordinality as source_name(value, ordinality)
                where source_name.ordinality <= 64
              ), '[]'::jsonb)
            else '[]'::jsonb
          end
        )
        else '{}'::jsonb
      end
    ),
    '{}'::jsonb
  )
  into v_source_metadata
  from jsonb_array_elements(p_snapshot -> 'pals') as record(value)
  where nullif(record.value ->> 'instance_uid', '') is not null;

  perform set_config(
    'palhatch.source_metadata',
    v_source_metadata::text,
    true
  );
  v_snapshot_id := private.publish_inventory_snapshot(p_world_id, p_snapshot);
  perform set_config('palhatch.source_metadata', '{}', true);
  return v_snapshot_id;
end;
$$;

revoke all on function public.publish_inventory_snapshot(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_inventory_snapshot(uuid, jsonb)
  to service_role;

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
      '      item.pal_id,' || chr(10) || '      pal.encyclopedia_no,',
      '      item.pal_id,' || chr(10)
        || '      item.is_boss,' || chr(10)
        || '      pal.encyclopedia_no,'
    );
    v_definition := replace(
      v_definition,
      '      item.location_name,' || chr(10)
        || '      item.ownership_scope,',
      '      item.location_name,' || chr(10)
        || '      item.location_id,' || chr(10)
        || '      item.location_slot_index,' || chr(10)
        || '      item.location_access_scope,' || chr(10)
        || '      item.ownership_scope,'
    );
    v_definition := replace(
      v_definition,
      $find$case when item.ownership_scope = 'guild' then true else coalesce(preference.share_enabled, true) end as share_enabled$find$,
      $replace$(
        coalesce((item.raw_metadata ->> 'shared_eligible')::boolean, true)
        and case when item.ownership_scope = 'guild'
          then true else coalesce(preference.share_enabled, true) end
      ) as share_enabled$replace$
    );
    v_definition := replace(
      v_definition,
      $find$and case when item.ownership_scope = 'guild' then true else coalesce(preference.share_enabled, true) end$find$,
      $replace$and coalesce(
            (item.raw_metadata ->> 'shared_eligible')::boolean,
            true
          )
          and case when item.ownership_scope = 'guild'
            then true else coalesce(preference.share_enabled, true) end$replace$
    );
    v_definition := replace(
      v_definition,
      '          ''pal_id'', page.pal_id,',
      '          ''pal_id'', page.pal_id,' || chr(10)
        || '          ''is_boss'', page.is_boss,'
    );
    v_definition := replace(
      v_definition,
      '          ''location_name'', page.location_name,' || chr(10)
        || '          ''ownership_scope'', page.ownership_scope,',
      '          ''location_name'', page.location_name,' || chr(10)
        || '          ''location_id'', page.location_id,' || chr(10)
        || '          ''location_slot_index'', page.location_slot_index,'
        || chr(10)
        || '          ''location_access_scope'','
        || ' page.location_access_scope,' || chr(10)
        || '          ''ownership_scope'', page.ownership_scope,'
    );
    if v_definition = v_original
      or position('item.is_boss' in v_definition) = 0
      or position('item.location_access_scope' in v_definition) = 0
      or position('''location_slot_index'', page.location_slot_index' in v_definition) = 0
      or position('item.raw_metadata ->> ''shared_eligible''' in v_definition) = 0
    then
      raise exception using
        errcode = 'P0001',
        message = 'INVENTORY_LOCATION_PROJECTION_PATCH_FAILED',
        detail = v_function::text;
    end if;
    execute v_definition;
  end loop;
end;
$migration$;

create or replace function public.get_breeding_inventory_for_agent(
  p_job_id uuid
)
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
    raise exception using
      errcode = 'P0001',
      message = 'BREEDING_INVENTORY_SNAPSHOT_MISMATCH';
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
      'share_enabled',
        coalesce(
          (item.raw_metadata ->> 'shared_eligible')::boolean,
          true
        )
        and case
          when item.ownership_scope = 'guild' then true
          else coalesce(preference.share_enabled, true)
        end,
      'owner_resolved', item.ownership_scope <> 'unresolved',
      'guild_resolved',
        item.ownership_scope <> 'unresolved' and item.guild_id is not null,
      'present_in_snapshot', true,
      'breeding_enabled',
        coalesce((item.raw_metadata->>'breeding_enabled')::boolean, true),
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

comment on function public.get_breeding_inventory_for_agent(uuid) is
  'Returns exact snapshot inventory facts; unresolved dimensional-storage access is never offered as shared inventory.';
