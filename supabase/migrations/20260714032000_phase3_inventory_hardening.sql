alter function public.get_latest_inventory_snapshot_for_agent(uuid) set schema private;
alter function public.publish_inventory_snapshot(uuid, jsonb) set schema private;
alter function public.get_inventory_catalog_ids_for_agent(uuid) set schema private;

revoke all on function private.get_latest_inventory_snapshot_for_agent(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.publish_inventory_snapshot(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.get_inventory_catalog_ids_for_agent(uuid)
  from public, anon, authenticated, service_role;

create function public.get_latest_inventory_snapshot_for_agent(p_world_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  return private.get_latest_inventory_snapshot_for_agent(p_world_id);
end;
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
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  return private.publish_inventory_snapshot(p_world_id, p_snapshot);
end;
$$;

create function public.get_inventory_catalog_ids_for_agent(p_world_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  return private.get_inventory_catalog_ids_for_agent(p_world_id);
end;
$$;

create function public.record_inventory_snapshot_failure(
  p_world_id uuid,
  p_failure jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot_id uuid := gen_random_uuid();
  v_status public.inventory_snapshot_status;
  v_source_hash text;
  v_source_modified_at timestamptz;
  v_captured_at timestamptz;
  v_parser_name text;
  v_parser_version text;
  v_error_code text;
  v_error_summary text;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_world_id is null or p_failure is null then
    raise exception using errcode = '22023', message = 'INVENTORY_FAILURE_INVALID';
  end if;
  if not exists (select 1 from public.worlds where id = p_world_id) then
    raise exception using errcode = 'P0001', message = 'WORLD_NOT_FOUND';
  end if;

  v_status := (p_failure ->> 'status')::public.inventory_snapshot_status;
  v_source_hash := p_failure ->> 'source_save_hash';
  v_source_modified_at := (p_failure ->> 'source_modified_at')::timestamptz;
  v_captured_at := (p_failure ->> 'captured_at')::timestamptz;
  v_parser_name := p_failure ->> 'parser_name';
  v_parser_version := p_failure ->> 'parser_version';
  v_error_code := p_failure ->> 'error_code';
  v_error_summary := left(coalesce(p_failure ->> 'error_summary', ''), 500);
  if v_status is null
     or v_status not in ('failed', 'rejected')
     or v_source_hash is null
     or char_length(v_source_hash) not between 32 and 128
     or v_source_modified_at is null
     or v_captured_at is null
     or char_length(coalesce(v_parser_name, '')) not between 1 and 100
     or char_length(coalesce(v_parser_version, '')) not between 1 and 100
     or v_error_code is null
     or v_error_code !~ '^[A-Z][A-Z0-9_]*$'
     or char_length(v_error_code) > 100 then
    raise exception using errcode = '22023', message = 'INVENTORY_FAILURE_INVALID';
  end if;

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
    error_code,
    error_summary
  ) values (
    v_snapshot_id,
    p_world_id,
    v_source_hash,
    v_source_modified_at,
    nullif(p_failure ->> 'save_version', ''),
    v_parser_name,
    v_parser_version,
    v_status,
    v_captured_at,
    v_error_code,
    v_error_summary
  );
  return v_snapshot_id;
exception
  when invalid_text_representation or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'INVENTORY_FAILURE_INVALID';
end;
$$;

revoke all on function public.get_latest_inventory_snapshot_for_agent(uuid)
  from public, anon, authenticated;
revoke all on function public.publish_inventory_snapshot(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.get_inventory_catalog_ids_for_agent(uuid)
  from public, anon, authenticated;
revoke all on function public.record_inventory_snapshot_failure(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.get_latest_inventory_snapshot_for_agent(uuid)
  to service_role;
grant execute on function public.publish_inventory_snapshot(uuid, jsonb)
  to service_role;
grant execute on function public.get_inventory_catalog_ids_for_agent(uuid)
  to service_role;
grant execute on function public.record_inventory_snapshot_failure(uuid, jsonb)
  to service_role;

comment on function public.record_inventory_snapshot_failure(uuid, jsonb) is
  'Records sanitized failed/rejected inventory metadata without changing latest inventory.';
