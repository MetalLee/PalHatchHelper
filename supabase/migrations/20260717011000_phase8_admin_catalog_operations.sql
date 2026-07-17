-- Phase 8 browser-to-Agent catalog administration bridge.
-- Browser sessions only receive an upload path scoped to their admin user. The
-- service-role Agent validates bytes and performs the existing deterministic
-- catalog import RPC pipeline.

create table public.admin_catalog_uploads (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  source_id uuid references public.game_data_sources(id) on delete restrict,
  original_filename text not null,
  object_path text not null unique,
  size_bytes bigint not null,
  package_sha256 text not null,
  status text not null default 'pending_upload',
  validation_summary jsonb not null default '{}'::jsonb,
  staged_version_id uuid references public.game_data_versions(id) on delete restrict,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint admin_catalog_upload_filename_check check (
    char_length(original_filename) between 9 and 180
    and original_filename ~ '^[A-Za-z0-9][A-Za-z0-9._-]*[.]tar[.]zst$'
    and lower(original_filename) !~ '[.](pak|utoc|ucas|usmap|sav|dll|exe|png|jpg|jpeg|gif|webp|mp3|wav|ogg)([.]|$)'
  ),
  constraint admin_catalog_upload_path_check check (
    object_path = 'admin-uploads/' || created_by::text || '/' || id::text || '.tar.zst'
  ),
  constraint admin_catalog_upload_size_check check (size_bytes between 1 and 67108864),
  constraint admin_catalog_upload_hash_check check (package_sha256 ~ '^[0-9a-f]{64}$'),
  constraint admin_catalog_upload_status_check check (
    status in ('pending_upload', 'uploaded', 'validating', 'validated', 'staging', 'staged', 'failed', 'rejected')
  ),
  constraint admin_catalog_upload_summary_check check (
    jsonb_typeof(validation_summary) = 'object'
    and octet_length(validation_summary::text) <= 16384
  ),
  constraint admin_catalog_upload_idempotency_check check (
    char_length(btrim(idempotency_key)) between 8 and 160
  ),
  constraint admin_catalog_upload_actor_idempotency_key unique (created_by, idempotency_key)
);

create index admin_catalog_upload_status_idx
  on public.admin_catalog_uploads(status, created_at, id);

create table public.admin_catalog_operations (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null,
  upload_id uuid not null references public.admin_catalog_uploads(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  status text not null default 'pending',
  claimed_by text,
  claimed_at timestamptz,
  completed_at timestamptz,
  result_summary jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  constraint admin_catalog_operation_type_check check (operation_type in ('validate', 'stage')),
  constraint admin_catalog_operation_idempotency_check check (
    char_length(btrim(idempotency_key)) between 8 and 160
  ),
  constraint admin_catalog_operation_status_check check (
    status in ('pending', 'processing', 'succeeded', 'failed')
  ),
  constraint admin_catalog_operation_claim_check check (
    (status = 'pending' and claimed_by is null and claimed_at is null and completed_at is null and error_code is null)
    or (status = 'processing' and claimed_by is not null and claimed_at is not null and completed_at is null and error_code is null)
    or (status = 'succeeded' and claimed_by is not null and claimed_at is not null and completed_at is not null and error_code is null)
    or (status = 'failed' and claimed_by is not null and claimed_at is not null and completed_at is not null and error_code is not null)
  ),
  constraint admin_catalog_operation_worker_check check (
    claimed_by is null or char_length(btrim(claimed_by)) between 1 and 128
  ),
  constraint admin_catalog_operation_summary_check check (
    jsonb_typeof(result_summary) = 'object'
    and octet_length(result_summary::text) <= 16384
  ),
  constraint admin_catalog_operation_error_check check (
    error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{0,99}$'
  ),
  constraint admin_catalog_operation_actor_idempotency_key unique (created_by, idempotency_key)
);

create index admin_catalog_operation_claim_idx
  on public.admin_catalog_operations(status, created_at, id)
  where status in ('pending', 'processing');

update storage.buckets
set file_size_limit = 67108864,
    allowed_mime_types = array[
      'application/zstd',
      'application/octet-stream',
      'application/gzip',
      'application/json'
    ]
where id = 'game-catalog-artifacts';

alter table public.admin_catalog_uploads enable row level security;
alter table public.admin_catalog_operations enable row level security;

revoke all on table public.admin_catalog_uploads, public.admin_catalog_operations
  from public, anon, authenticated, service_role;

create policy admin_catalog_upload_object_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'game-catalog-artifacts'
    and exists (
      select 1
      from public.admin_catalog_uploads as upload
      where upload.object_path = name
        and upload.created_by = (select auth.uid())
        and upload.status = 'pending_upload'
        and upload.created_at > now() - interval '1 hour'
    )
  );

create function public.list_admin_catalog_sources()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'source_id', source.id,
      'name', source.name,
      'source_type', source.source_type,
      'enabled', source.enabled
    ) order by source.name, source.id)
    from public.game_data_sources as source
    where source.enabled
  ), '[]'::jsonb);
end;
$$;

create function public.list_admin_catalog_worlds()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'world_id', world.id,
      'name', world.name,
      'active_version_id', world.active_game_data_version_id
    ) order by world.name, world.id)
    from public.worlds as world
  ), '[]'::jsonb);
end;
$$;

create function public.list_admin_catalog_uploads(p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  if p_limit not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'ADMIN_QUERY_INVALID';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'upload_id', upload.id,
      'filename', upload.original_filename,
      'size_bytes', upload.size_bytes,
      'package_sha256', upload.package_sha256,
      'status', upload.status,
      'source', source.name,
      'validation_summary', upload.validation_summary,
      'staged_version_id', upload.staged_version_id,
      'created_at', upload.created_at,
      'updated_at', upload.updated_at
    ) order by upload.created_at desc, upload.id desc)
    from (
      select candidate.*
      from public.admin_catalog_uploads as candidate
      order by candidate.created_at desc, candidate.id desc
      limit p_limit
    ) as upload
    left join public.game_data_sources as source on source.id = upload.source_id
  ), '[]'::jsonb);
end;
$$;

create function public.create_admin_catalog_upload(
  p_filename text,
  p_size_bytes bigint,
  p_package_sha256 text,
  p_source_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_upload public.admin_catalog_uploads%rowtype;
  v_id uuid := gen_random_uuid();
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  if p_filename is null
    or p_filename !~ '^[A-Za-z0-9][A-Za-z0-9._-]*[.]tar[.]zst$'
    or lower(p_filename) ~ '[.](pak|utoc|ucas|usmap|sav|dll|exe|png|jpg|jpeg|gif|webp|mp3|wav|ogg)([.]|$)'
    or p_size_bytes not between 1 and 67108864
    or p_package_sha256 !~ '^[0-9a-f]{64}$'
    or char_length(coalesce(p_idempotency_key, '')) not between 8 and 160
    or p_source_id is null
    or not exists (
      select 1 from public.game_data_sources where id = p_source_id and enabled
    )
  then
    raise exception using errcode = 'P0001', message = 'CATALOG_UPLOAD_INVALID';
  end if;

  select * into v_upload
  from public.admin_catalog_uploads
  where created_by = auth.uid() and idempotency_key = p_idempotency_key;
  if v_upload.id is not null then
    if v_upload.original_filename <> p_filename
      or v_upload.size_bytes <> p_size_bytes
      or v_upload.package_sha256 <> p_package_sha256
      or v_upload.source_id <> p_source_id
    then
      raise exception using errcode = 'P0001', message = 'CATALOG_UPLOAD_CONFLICT';
    end if;
    return jsonb_build_object(
      'upload_id', v_upload.id,
      'bucket', 'game-catalog-artifacts',
      'object_path', v_upload.object_path,
      'status', v_upload.status,
      'reused', true
    );
  end if;

  insert into public.admin_catalog_uploads(
    id, created_by, source_id, original_filename, object_path,
    size_bytes, package_sha256, idempotency_key
  ) values (
    v_id, auth.uid(), p_source_id, p_filename,
    'admin-uploads/' || auth.uid()::text || '/' || v_id::text || '.tar.zst',
    p_size_bytes, p_package_sha256, p_idempotency_key
  ) returning * into v_upload;
  perform private.write_admin_audit(
    auth.uid(), 'catalog.upload_created', 'catalog_upload', v_upload.id::text,
    p_idempotency_key,
    jsonb_build_object('upload_id', v_upload.id, 'size_bytes', v_upload.size_bytes,
      'package_sha256', v_upload.package_sha256, 'source_id', v_upload.source_id)
  );
  return jsonb_build_object(
    'upload_id', v_upload.id,
    'bucket', 'game-catalog-artifacts',
    'object_path', v_upload.object_path,
    'status', v_upload.status,
    'reused', false
  );
end;
$$;

create function public.mark_admin_catalog_upload_ready(
  p_upload_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  v_upload public.admin_catalog_uploads%rowtype;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  select * into v_upload
  from public.admin_catalog_uploads
  where id = p_upload_id and created_by = auth.uid()
  for update;
  if v_upload.id is null then
    raise exception using errcode = 'P0001', message = 'CATALOG_UPLOAD_NOT_FOUND';
  end if;
  if v_upload.status <> 'pending_upload' then
    return jsonb_build_object('upload_id', v_upload.id, 'status', v_upload.status, 'reused', true);
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'game-catalog-artifacts' and name = v_upload.object_path
  ) then
    raise exception using errcode = 'P0001', message = 'CATALOG_UPLOAD_INCOMPLETE';
  end if;
  update public.admin_catalog_uploads
  set status = 'uploaded', uploaded_at = now(), updated_at = now()
  where id = v_upload.id
  returning * into v_upload;
  perform private.write_admin_audit(
    auth.uid(), 'catalog.upload_completed', 'catalog_upload', v_upload.id::text,
    p_idempotency_key,
    jsonb_build_object('upload_id', v_upload.id, 'size_bytes', v_upload.size_bytes,
      'package_sha256', v_upload.package_sha256)
  );
  return jsonb_build_object('upload_id', v_upload.id, 'status', v_upload.status, 'reused', false);
end;
$$;

create function public.create_admin_catalog_operation(
  p_operation_type text,
  p_upload_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_upload public.admin_catalog_uploads%rowtype;
  v_operation public.admin_catalog_operations%rowtype;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  if p_operation_type not in ('validate', 'stage')
    or p_upload_id is null
    or char_length(coalesce(p_idempotency_key, '')) not between 8 and 160
  then
    raise exception using errcode = 'P0001', message = 'CATALOG_ACTION_INVALID';
  end if;
  select * into v_operation
  from public.admin_catalog_operations
  where created_by = auth.uid() and idempotency_key = p_idempotency_key;
  if v_operation.id is not null then
    if v_operation.operation_type <> p_operation_type or v_operation.upload_id <> p_upload_id then
      raise exception using errcode = 'P0001', message = 'CATALOG_ACTION_CONFLICT';
    end if;
    return jsonb_build_object(
      'operation_id', v_operation.id, 'status', v_operation.status, 'reused', true
    );
  end if;
  select * into v_upload from public.admin_catalog_uploads where id = p_upload_id for update;
  if v_upload.id is null then
    raise exception using errcode = 'P0001', message = 'CATALOG_UPLOAD_NOT_FOUND';
  end if;
  if p_operation_type = 'validate' and v_upload.status not in ('uploaded', 'failed') then
    raise exception using errcode = 'P0001', message = 'CATALOG_UPLOAD_NOT_READY';
  end if;
  if p_operation_type = 'stage' and v_upload.status <> 'validated' then
    raise exception using errcode = 'P0001', message = 'CATALOG_UPLOAD_NOT_VALIDATED';
  end if;
  if exists (
    select 1 from public.admin_catalog_operations
    where upload_id = p_upload_id and status in ('pending', 'processing')
  ) then
    raise exception using errcode = 'P0001', message = 'CATALOG_ACTION_CONFLICT';
  end if;
  insert into public.admin_catalog_operations(
    operation_type, upload_id, created_by, idempotency_key
  ) values (
    p_operation_type, p_upload_id, auth.uid(), p_idempotency_key
  ) returning * into v_operation;
  update public.admin_catalog_uploads
  set status = case when p_operation_type = 'validate' then 'validating' else 'staging' end,
      updated_at = now()
  where id = p_upload_id;
  perform private.write_admin_audit(
    auth.uid(), 'catalog.' || p_operation_type || '_requested',
    'catalog_upload', p_upload_id::text, p_idempotency_key,
    jsonb_build_object('upload_id', p_upload_id, 'operation_id', v_operation.id)
  );
  return jsonb_build_object(
    'operation_id', v_operation.id, 'status', v_operation.status, 'reused', false
  );
end;
$$;

create function public.admin_catalog_version_action(
  p_action text,
  p_world_id uuid default null,
  p_version_id uuid default null,
  p_confirmation text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version public.game_data_versions%rowtype;
  v_result uuid;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  if p_action not in ('publish', 'rollback', 'inspect', 'reject')
    or p_version_id is null
    or char_length(coalesce(p_idempotency_key, '')) not between 8 and 160
  then
    raise exception using errcode = 'P0001', message = 'CATALOG_ACTION_INVALID';
  end if;
  if exists (
    select 1 from public.admin_audit_events
    where actor_user_id = auth.uid() and idempotency_key = p_idempotency_key
  ) then
    return jsonb_build_object('action', p_action, 'version_id', p_version_id, 'reused', true);
  end if;
  select * into v_version from public.game_data_versions where id = p_version_id for update;
  if v_version.id is null then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_VERSION_NOT_FOUND';
  end if;

  if p_action = 'publish' then
    if p_world_id is null or p_confirmation <> 'PUBLISH ' || p_version_id::text then
      raise exception using errcode = 'P0001', message = 'CATALOG_CONFIRMATION_REQUIRED';
    end if;
    v_result := public.publish_game_data_version(p_world_id, p_version_id);
  elsif p_action = 'rollback' then
    if p_world_id is null or p_confirmation <> 'ROLLBACK ' || p_version_id::text then
      raise exception using errcode = 'P0001', message = 'CATALOG_CONFIRMATION_REQUIRED';
    end if;
    v_result := public.rollback_game_data_version(p_world_id, p_version_id);
  elsif p_action = 'reject' then
    if p_confirmation <> 'REJECT ' || p_version_id::text
      or v_version.status not in ('staging', 'validated')
      or exists (
        select 1 from public.worlds where active_game_data_version_id = p_version_id
      )
    then
      raise exception using errcode = 'P0001', message = 'CATALOG_ACTION_INVALID';
    end if;
    update public.game_data_versions set status = 'rejected' where id = p_version_id;
    v_result := p_version_id;
  else
    v_result := p_version_id;
  end if;

  perform private.write_admin_audit(
    auth.uid(), 'catalog.' || p_action, 'game_data_version', p_version_id::text,
    p_idempotency_key,
    jsonb_build_object('version_id', p_version_id, 'world_id', p_world_id,
      'content_hash', v_version.content_hash, 'status', v_version.status)
  );
  return jsonb_build_object(
    'action', p_action,
    'version_id', v_result,
    'world_id', p_world_id,
    'status', case when p_action = 'inspect' then v_version.status::text else p_action end,
    'build', v_version.game_build_id,
    'game_version', v_version.game_version,
    'content_hash', v_version.content_hash,
    'package_hash', v_version.package_hash,
    'counts', coalesce(v_version.manifest->'counts', '{}'::jsonb),
    'provenance', coalesce(
      v_version.manifest->'source_provenance',
      v_version.manifest->'breeding_source_provenance',
      '{}'::jsonb
    ),
    'reused', false
  );
end;
$$;

create function public.reject_admin_catalog_upload(
  p_upload_id uuid,
  p_confirmation text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_upload public.admin_catalog_uploads%rowtype;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  select * into v_upload from public.admin_catalog_uploads where id = p_upload_id for update;
  if v_upload.id is null
    or p_confirmation <> 'REJECT ' || p_upload_id::text
    or v_upload.status in ('staging', 'staged')
  then
    raise exception using errcode = 'P0001', message = 'CATALOG_ACTION_INVALID';
  end if;
  update public.admin_catalog_uploads
  set status = 'rejected', updated_at = now()
  where id = p_upload_id;
  perform private.write_admin_audit(
    auth.uid(), 'catalog.upload_rejected', 'catalog_upload', p_upload_id::text,
    p_idempotency_key, jsonb_build_object('upload_id', p_upload_id)
  );
  return jsonb_build_object('upload_id', p_upload_id, 'status', 'rejected');
end;
$$;

create function public.claim_admin_catalog_operation(
  p_worker_id text,
  p_stale_before timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_operation public.admin_catalog_operations%rowtype;
  v_upload public.admin_catalog_uploads%rowtype;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if char_length(coalesce(p_worker_id, '')) not between 1 and 128
    or p_stale_before is null or p_stale_before > now()
  then
    raise exception using errcode = 'P0001', message = 'CATALOG_WORKER_INVALID';
  end if;
  select * into v_operation
  from public.admin_catalog_operations
  where status = 'pending'
    or (status = 'processing' and claimed_at < p_stale_before)
  order by created_at, id
  for update skip locked
  limit 1;
  if v_operation.id is null then return null; end if;
  update public.admin_catalog_operations
  set status = 'processing', claimed_by = p_worker_id, claimed_at = now(),
      completed_at = null, error_code = null
  where id = v_operation.id
  returning * into v_operation;
  select * into v_upload from public.admin_catalog_uploads where id = v_operation.upload_id;
  return jsonb_build_object(
    'operation_id', v_operation.id,
    'operation_type', v_operation.operation_type,
    'upload_id', v_upload.id,
    'source_id', v_upload.source_id,
    'object_path', v_upload.object_path,
    'size_bytes', v_upload.size_bytes,
    'package_sha256', v_upload.package_sha256,
    'created_at', v_operation.created_at
  );
end;
$$;

create function public.complete_admin_catalog_operation(
  p_operation_id uuid,
  p_worker_id text,
  p_result_summary jsonb,
  p_staged_version_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_operation public.admin_catalog_operations%rowtype;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if jsonb_typeof(p_result_summary) <> 'object'
    or octet_length(p_result_summary::text) > 16384
  then
    raise exception using errcode = 'P0001', message = 'CATALOG_RESULT_INVALID';
  end if;
  select * into v_operation from public.admin_catalog_operations
  where id = p_operation_id for update;
  if v_operation.id is null or v_operation.status <> 'processing'
    or v_operation.claimed_by <> p_worker_id
    or (v_operation.operation_type = 'stage' and p_staged_version_id is null)
  then
    raise exception using errcode = 'P0001', message = 'CATALOG_OPERATION_CONFLICT';
  end if;
  update public.admin_catalog_operations
  set status = 'succeeded', result_summary = p_result_summary,
      completed_at = now(), error_code = null
  where id = p_operation_id;
  update public.admin_catalog_uploads
  set status = case when v_operation.operation_type = 'validate' then 'validated' else 'staged' end,
      validation_summary = p_result_summary,
      staged_version_id = coalesce(p_staged_version_id, staged_version_id),
      updated_at = now()
  where id = v_operation.upload_id;
  perform private.write_admin_audit(
    null, 'catalog.' || v_operation.operation_type || '_completed',
    'catalog_upload', v_operation.upload_id::text, null,
    jsonb_build_object('operation_id', v_operation.id,
      'staged_version_id', p_staged_version_id, 'result', p_result_summary)
  );
  return true;
end;
$$;

create function public.fail_admin_catalog_operation(
  p_operation_id uuid,
  p_worker_id text,
  p_error_code text,
  p_result_summary jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_operation public.admin_catalog_operations%rowtype;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_error_code !~ '^[A-Z][A-Z0-9_]{0,99}$'
    or jsonb_typeof(p_result_summary) <> 'object'
    or octet_length(p_result_summary::text) > 16384
  then
    raise exception using errcode = 'P0001', message = 'CATALOG_RESULT_INVALID';
  end if;
  select * into v_operation from public.admin_catalog_operations
  where id = p_operation_id for update;
  if v_operation.id is null or v_operation.status <> 'processing'
    or v_operation.claimed_by <> p_worker_id
  then
    raise exception using errcode = 'P0001', message = 'CATALOG_OPERATION_CONFLICT';
  end if;
  update public.admin_catalog_operations
  set status = 'failed', result_summary = p_result_summary,
      completed_at = now(), error_code = p_error_code
  where id = p_operation_id;
  update public.admin_catalog_uploads
  set status = case when v_operation.operation_type = 'stage' then 'validated' else 'failed' end,
      validation_summary = p_result_summary,
      updated_at = now()
  where id = v_operation.upload_id;
  perform private.write_admin_audit(
    null, 'catalog.' || v_operation.operation_type || '_failed',
    'catalog_upload', v_operation.upload_id::text, null,
    jsonb_build_object('operation_id', v_operation.id, 'error_code', p_error_code)
  );
  return true;
end;
$$;

create function public.get_admin_secret_statuses()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_heartbeat public.agent_worker_heartbeats%rowtype;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  select * into v_heartbeat from public.agent_worker_heartbeats where worker_kind = 'agent';
  return jsonb_build_array(
    jsonb_build_object(
      'name', 'supabase_service_role',
      'status', case when coalesce((v_heartbeat.safe_metadata->>'database_configured')::boolean, false)
        then 'configured' else 'not_configured' end,
      'last_checked_at', v_heartbeat.heartbeat_at
    ),
    jsonb_build_object(
      'name', 'ai_provider',
      'status', case when coalesce((v_heartbeat.safe_metadata->>'ai_provider_configured')::boolean, false)
        then 'configured' else 'not_configured' end,
      'last_checked_at', v_heartbeat.heartbeat_at
    )
  );
end;
$$;

create function public.bootstrap_first_admin(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_role text;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_email is null or char_length(btrim(p_email)) not between 3 and 320 then
    raise exception using errcode = 'P0001', message = 'BOOTSTRAP_ADMIN_EMAIL_INVALID';
  end if;
  select account.id into v_user_id
  from auth.users as account
  where lower(account.email) = lower(btrim(p_email));
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'BOOTSTRAP_ADMIN_USER_NOT_FOUND';
  end if;
  select profile.role::text into v_role from public.profiles as profile where profile.id = v_user_id for update;
  if v_role is null then
    raise exception using errcode = 'P0001', message = 'BOOTSTRAP_ADMIN_USER_NOT_FOUND';
  end if;
  if v_role = 'admin' then
    return jsonb_build_object('user_id', v_user_id, 'role', 'admin', 'reused', true);
  end if;
  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception using errcode = 'P0001', message = 'BOOTSTRAP_ADMIN_ALREADY_COMPLETED';
  end if;
  update public.profiles set role = 'admin', updated_at = now() where id = v_user_id;
  perform private.write_admin_audit(
    null, 'admin.bootstrap', 'profile', v_user_id::text, null,
    jsonb_build_object('user_id', v_user_id, 'role', 'admin')
  );
  return jsonb_build_object('user_id', v_user_id, 'role', 'admin', 'reused', false);
end;
$$;

create function public.get_runtime_settings_for_agent()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_settings public.runtime_settings_versions%rowtype;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  select * into v_settings from public.runtime_settings_versions order by version desc limit 1;
  return jsonb_build_object('version', v_settings.version, 'settings', v_settings.settings);
end;
$$;

create or replace function public.get_admin_save_parser_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_heartbeat public.agent_worker_heartbeats%rowtype;
  v_snapshot jsonb;
  v_failure jsonb;
  v_rejected public.inventory_snapshots%rowtype;
  v_settings jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  select * into v_heartbeat from public.agent_worker_heartbeats where worker_kind = 'save_worker';
  v_snapshot := private.admin_latest_snapshot();
  v_failure := private.admin_recent_failure();
  select * into v_rejected from public.inventory_snapshots
    where status = 'rejected' and error_code = 'INVENTORY_DROP_REVIEW_REQUIRED'
    order by created_at desc limit 1;
  select settings into v_settings from public.runtime_settings_versions order by version desc limit 1;
  return jsonb_build_object(
    'worker', private.admin_worker_status('save_worker'),
    'save_root_configured', coalesce((v_heartbeat.safe_metadata->>'save_root_configured')::boolean, false),
    'read_only_mount', coalesce(v_heartbeat.safe_metadata->>'read_only_mount', 'unverified'),
    'latest_snapshot', v_snapshot,
    'review_snapshot_id', v_rejected.id,
    'recent_failure', v_failure,
    'parser', jsonb_build_object('name', v_snapshot->>'parser_name', 'version', v_snapshot->>'parser_version'),
    'parse_duration_ms', case when v_snapshot is null then null else coalesce((v_heartbeat.safe_metadata->>'parse_duration_ms')::integer, null) end,
    'pal_count', case when v_snapshot is null then null else (v_snapshot->>'pal_count')::integer end,
    'inventory_drop_state', case when v_rejected.id is not null then 'review_required' else 'normal' end,
    'disk', private.admin_disk_status(),
    'snapshot_retention_count', (v_settings->>'snapshot_retention_count')::integer,
    'stale', v_heartbeat.heartbeat_at is null
      or v_heartbeat.heartbeat_at < now() - make_interval(
        mins => coalesce((v_settings->>'data_stale_threshold_minutes')::integer, 15)
      )
  );
end;
$$;

revoke all on function public.list_admin_catalog_sources() from public, anon, authenticated;
revoke all on function public.list_admin_catalog_worlds() from public, anon, authenticated;
revoke all on function public.list_admin_catalog_uploads(integer) from public, anon, authenticated;
revoke all on function public.create_admin_catalog_upload(text, bigint, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.mark_admin_catalog_upload_ready(uuid, text)
  from public, anon, authenticated;
revoke all on function public.create_admin_catalog_operation(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.admin_catalog_version_action(text, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.reject_admin_catalog_upload(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.get_admin_secret_statuses() from public, anon, authenticated;

grant execute on function public.list_admin_catalog_sources() to authenticated;
grant execute on function public.list_admin_catalog_worlds() to authenticated;
grant execute on function public.list_admin_catalog_uploads(integer) to authenticated;
grant execute on function public.create_admin_catalog_upload(text, bigint, text, uuid, text)
  to authenticated;
grant execute on function public.mark_admin_catalog_upload_ready(uuid, text) to authenticated;
grant execute on function public.create_admin_catalog_operation(text, uuid, text) to authenticated;
grant execute on function public.admin_catalog_version_action(text, uuid, uuid, text, text)
  to authenticated;
grant execute on function public.reject_admin_catalog_upload(uuid, text, text) to authenticated;
grant execute on function public.get_admin_secret_statuses() to authenticated;

revoke all on function public.claim_admin_catalog_operation(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.complete_admin_catalog_operation(uuid, text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.fail_admin_catalog_operation(uuid, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.claim_admin_catalog_operation(text, timestamptz) to service_role;
grant execute on function public.complete_admin_catalog_operation(uuid, text, jsonb, uuid)
  to service_role;
grant execute on function public.fail_admin_catalog_operation(uuid, text, text, jsonb)
  to service_role;

revoke all on function public.bootstrap_first_admin(text) from public, anon, authenticated;
grant execute on function public.bootstrap_first_admin(text) to service_role;
revoke all on function public.get_runtime_settings_for_agent() from public, anon, authenticated;
grant execute on function public.get_runtime_settings_for_agent() to service_role;

comment on table public.admin_catalog_uploads is
  'Private admin-upload metadata. Browser object writes are limited to an exact per-admin path.';
comment on table public.admin_catalog_operations is
  'Service-role Agent queue for deterministic validate/stage actions; no shell or user paths.';
