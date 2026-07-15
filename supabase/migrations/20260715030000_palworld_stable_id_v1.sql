create function private.attach_pal_snapshot_source_metadata()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_source_metadata jsonb;
begin
  v_source_metadata := coalesce(
    nullif(current_setting('palhatch.source_metadata', true), ''),
    '{}'
  )::jsonb -> new.pal_instance_uid;

  if jsonb_typeof(v_source_metadata) = 'object' then
    new.raw_metadata := coalesce(new.raw_metadata, '{}'::jsonb) || v_source_metadata;
  end if;
  return new;
end;
$$;

create trigger pal_snapshot_items_attach_source_metadata
  before insert on public.pal_snapshot_items
  for each row execute function private.attach_pal_snapshot_source_metadata();

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
        'source_internal_name', left(record.value #>> '{metadata,source_internal_name}', 120),
        'source_passive_skill_internal_names', case
          when jsonb_typeof(record.value #> '{metadata,source_passive_skill_internal_names}') = 'array'
            then coalesce((
              select jsonb_agg(left(source_name.value, 120) order by source_name.ordinality)
              from jsonb_array_elements_text(
                record.value #> '{metadata,source_passive_skill_internal_names}'
              ) with ordinality as source_name(value, ordinality)
              where source_name.ordinality <= 64
            ), '[]'::jsonb)
          else '[]'::jsonb
        end
      )
    ),
    '{}'::jsonb
  )
  into v_source_metadata
  from jsonb_array_elements(p_snapshot -> 'pals') as record(value)
  where jsonb_typeof(record.value -> 'metadata') = 'object'
    and nullif(record.value ->> 'instance_uid', '') is not null
    and nullif(record.value #>> '{metadata,source_internal_name}', '') is not null;

  perform set_config('palhatch.source_metadata', v_source_metadata::text, true);
  v_snapshot_id := private.publish_inventory_snapshot(p_world_id, p_snapshot);
  perform set_config('palhatch.source_metadata', '{}', true);
  return v_snapshot_id;
end;
$$;

revoke all on function public.publish_inventory_snapshot(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_inventory_snapshot(uuid, jsonb)
  to service_role;

comment on function public.publish_inventory_snapshot(uuid, jsonb) is
  'Publishes a canonical snapshot and preserves only audited stable-ID reverse-trace metadata at immutable row insertion.';
