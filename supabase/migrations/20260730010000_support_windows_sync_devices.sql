alter table public.sync_devices
  drop constraint sync_devices_platform_check;

alter table public.sync_devices
  add constraint sync_devices_platform_check
  check (platform in ('linux-x64', 'win32-x64'));

create or replace function public.consume_sync_pairing_code(
  p_code_hash text,
  p_device_name text,
  p_platform text,
  p_app_version text,
  p_token_hash text,
  p_token_prefix text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code public.sync_pairing_codes%rowtype;
  v_device_id uuid;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_code_hash !~ '^[0-9a-f]{64}$'
     or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_token_prefix !~ '^pbs_[-_A-Za-z0-9]{8}$'
     or char_length(btrim(coalesce(p_device_name, ''))) not between 1 and 80
     or p_platform is null
     or p_platform not in ('linux-x64', 'win32-x64')
     or (p_app_version is not null and char_length(p_app_version) not between 1 and 40) then
    raise exception using errcode = '22023', message = 'SYNC_PAIRING_REQUEST_INVALID';
  end if;

  select code.* into v_code
    from public.sync_pairing_codes as code
   where code.code_hash = p_code_hash
   for update;
  if v_code.id is null or v_code.consumed_at is not null then
    raise exception using errcode = 'P0001', message = 'SYNC_PAIRING_CODE_INVALID';
  end if;
  if v_code.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'SYNC_PAIRING_CODE_EXPIRED';
  end if;

  update public.sync_pairing_codes
     set consumed_at = now()
   where id = v_code.id;
  insert into public.sync_devices (
    owner_user_id,
    name,
    platform,
    token_hash,
    token_prefix,
    app_version,
    last_seen_at
  ) values (
    v_code.owner_user_id,
    btrim(p_device_name),
    p_platform,
    p_token_hash,
    p_token_prefix,
    p_app_version,
    now()
  ) returning id into v_device_id;
  return v_device_id;
end;
$$;

revoke all on function public.consume_sync_pairing_code(
  text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.consume_sync_pairing_code(
  text, text, text, text, text, text
) to service_role;
