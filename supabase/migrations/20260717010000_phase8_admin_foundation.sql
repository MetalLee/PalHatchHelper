create type public.agent_command_status as enum (
  'pending',
  'processing',
  'succeeded',
  'failed',
  'rejected',
  'expired'
);

alter table public.player_bindings
  add column concurrency_version integer not null default 1,
  add constraint player_bindings_concurrency_version_check
    check (concurrency_version >= 1);

create table public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete restrict,
  event_type text not null,
  target_type text not null,
  target_id text,
  idempotency_key text,
  safe_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_event_type_check
    check (event_type ~ '^[a-z][a-z0-9_.]{0,99}$'),
  constraint admin_audit_target_type_check
    check (target_type ~ '^[a-z][a-z0-9_]{0,79}$'),
  constraint admin_audit_target_id_check
    check (target_id is null or char_length(target_id) <= 160),
  constraint admin_audit_idempotency_key_check
    check (
      idempotency_key is null
      or char_length(btrim(idempotency_key)) between 8 and 160
    ),
  constraint admin_audit_summary_check
    check (
      jsonb_typeof(safe_summary) = 'object'
      and octet_length(safe_summary::text) <= 8192
    )
);

create unique index admin_audit_actor_idempotency_idx
  on public.admin_audit_events(actor_user_id, idempotency_key)
  where actor_user_id is not null and idempotency_key is not null;
create index admin_audit_created_idx
  on public.admin_audit_events(created_at desc, id desc);

create table public.player_binding_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  player_id uuid references public.players(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  binding_version integer,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint player_binding_events_type_check check (
    event_type in ('binding_created', 'binding_updated', 'binding_deleted')
  ),
  constraint player_binding_events_version_check
    check (binding_version is null or binding_version >= 1),
  constraint player_binding_events_idempotency_check
    check (char_length(btrim(idempotency_key)) between 8 and 160),
  constraint player_binding_events_actor_idempotency_key
    unique (actor_user_id, idempotency_key)
);

create index player_binding_events_user_created_idx
  on public.player_binding_events(user_id, created_at desc, id desc);

create table public.agent_commands (
  id uuid primary key default gen_random_uuid(),
  command_type text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  status public.agent_command_status not null default 'pending',
  claimed_by text,
  claimed_at timestamptz,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_commands_type_check check (
    command_type in (
      'sync_save_once',
      'reparse_snapshot',
      'approve_inventory_snapshot',
      'reject_inventory_snapshot',
      'cleanup_expired_agent_snapshots',
      'retry_breeding_job',
      'cancel_breeding_job',
      'reap_stale_job_lock',
      'template_ai_healthcheck',
      'warm_catalog_cache'
    )
  ),
  constraint agent_commands_payload_check check (
    jsonb_typeof(payload) = 'object'
    and octet_length(payload::text) <= 8192
    and not (payload ?| array[
      'path', 'file_path', 'shell', 'process', 'docker', 'compose',
      'command', 'token', 'secret', 'service_role', 'password'
    ])
  ),
  constraint agent_commands_idempotency_check
    check (char_length(btrim(idempotency_key)) between 8 and 160),
  constraint agent_commands_expiration_check
    check (expires_at > created_at and expires_at <= created_at + interval '24 hours'),
  constraint agent_commands_claim_check check (
    (
      status = 'pending'
      and claimed_by is null
      and claimed_at is null
      and completed_at is null
      and error_code is null
    )
    or (
      status = 'processing'
      and claimed_by is not null
      and claimed_at is not null
      and completed_at is null
      and error_code is null
    )
    or (
      status in ('succeeded', 'failed', 'rejected')
      and claimed_by is not null
      and claimed_at is not null
      and completed_at is not null
    )
    or (
      status = 'expired'
      and claimed_by is null
      and claimed_at is null
      and completed_at is not null
      and error_code = 'AGENT_COMMAND_EXPIRED'
    )
  ),
  constraint agent_commands_claimed_by_check
    check (claimed_by is null or char_length(btrim(claimed_by)) between 1 and 128),
  constraint agent_commands_error_code_check check (
    error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{0,99}$'
  ),
  constraint agent_commands_creator_idempotency_key
    unique (created_by, idempotency_key)
);

create index agent_commands_claim_idx
  on public.agent_commands(status, created_at, id)
  where status in ('pending', 'processing');

create table public.agent_command_results (
  command_id uuid primary key references public.agent_commands(id) on delete restrict,
  status public.agent_command_status not null,
  worker_id text not null,
  error_code text,
  safe_summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  constraint agent_command_results_status_check
    check (status in ('succeeded', 'failed', 'rejected')),
  constraint agent_command_results_worker_check
    check (char_length(btrim(worker_id)) between 1 and 128),
  constraint agent_command_results_error_code_check check (
    error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{0,99}$'
  ),
  constraint agent_command_results_summary_check check (
    jsonb_typeof(safe_summary) = 'object'
    and octet_length(safe_summary::text) <= 8192
  ),
  constraint agent_command_results_time_check check (completed_at >= started_at)
);

create table public.agent_worker_heartbeats (
  worker_kind text primary key,
  worker_id text not null,
  deployment_version text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  heartbeat_at timestamptz not null,
  constraint agent_worker_heartbeats_kind_check check (
    worker_kind in ('agent', 'save_worker', 'job_worker', 'candidate_detector', 'command_worker')
  ),
  constraint agent_worker_heartbeats_worker_check
    check (char_length(btrim(worker_id)) between 1 and 128),
  constraint agent_worker_heartbeats_version_check
    check (char_length(btrim(deployment_version)) between 1 and 120),
  constraint agent_worker_heartbeats_metadata_check check (
    jsonb_typeof(safe_metadata) = 'object'
    and octet_length(safe_metadata::text) <= 8192
    and not (safe_metadata ?| array[
      'path', 'file_path', 'token', 'secret', 'service_role', 'password', 'public_ip'
    ])
  )
);

create table public.runtime_settings_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  settings jsonb not null,
  created_by uuid references auth.users(id) on delete restrict,
  rolled_back_from_version integer,
  idempotency_key text,
  created_at timestamptz not null default now(),
  constraint runtime_settings_version_check check (version >= 1),
  constraint runtime_settings_payload_check
    check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 4096),
  constraint runtime_settings_rollback_check
    check (rolled_back_from_version is null or rolled_back_from_version >= 1),
  constraint runtime_settings_idempotency_check
    check (
      idempotency_key is null
      or char_length(btrim(idempotency_key)) between 8 and 160
    )
);

create unique index runtime_settings_actor_idempotency_idx
  on public.runtime_settings_versions(created_by, idempotency_key)
  where created_by is not null and idempotency_key is not null;

create table public.deployment_records (
  id uuid primary key default gen_random_uuid(),
  git_sha text not null,
  agent_image text,
  vercel_deployment_id text,
  status text not null,
  safe_summary jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  constraint deployment_records_git_sha_check check (git_sha ~ '^[0-9a-f]{7,40}$'),
  constraint deployment_records_agent_image_check
    check (agent_image is null or char_length(agent_image) <= 500),
  constraint deployment_records_vercel_check
    check (vercel_deployment_id is null or char_length(vercel_deployment_id) <= 200),
  constraint deployment_records_status_check
    check (status in ('deploying', 'healthy', 'failed', 'rolled_back')),
  constraint deployment_records_summary_check check (
    jsonb_typeof(safe_summary) = 'object'
    and octet_length(safe_summary::text) <= 4096
  )
);

create function private.prevent_append_only_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = 'P0001', message = 'APPEND_ONLY_RECORD';
end;
$$;

create trigger admin_audit_events_append_only
  before update or delete on public.admin_audit_events
  for each row execute function private.prevent_append_only_mutation();
create trigger player_binding_events_append_only
  before update or delete on public.player_binding_events
  for each row execute function private.prevent_append_only_mutation();
create trigger agent_command_results_append_only
  before update or delete on public.agent_command_results
  for each row execute function private.prevent_append_only_mutation();
create trigger runtime_settings_versions_append_only
  before update or delete on public.runtime_settings_versions
  for each row execute function private.prevent_append_only_mutation();
create trigger deployment_records_append_only
  before update or delete on public.deployment_records
  for each row execute function private.prevent_append_only_mutation();

create function private.increment_player_binding_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.concurrency_version := old.concurrency_version + 1;
  new.bound_at := now();
  return new;
end;
$$;

create trigger player_bindings_increment_version
  before update on public.player_bindings
  for each row execute function private.increment_player_binding_version();

create function private.runtime_settings_valid(p_settings jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_provider_count integer;
begin
  if p_settings is null
    or jsonb_typeof(p_settings) <> 'object'
    or p_settings - array[
      'job_creation_enabled',
      'max_generations',
      'job_worker_concurrency',
      'ai_concurrency',
      'parser_timeout_seconds',
      'snapshot_retention_count',
      'data_stale_threshold_minutes',
      'ai_provider_order',
      'maintenance_announcement'
    ] <> '{}'::jsonb
    or not (p_settings ?& array[
      'job_creation_enabled',
      'max_generations',
      'job_worker_concurrency',
      'ai_concurrency',
      'parser_timeout_seconds',
      'snapshot_retention_count',
      'data_stale_threshold_minutes',
      'ai_provider_order',
      'maintenance_announcement'
    ])
    or jsonb_typeof(p_settings->'job_creation_enabled') <> 'boolean'
    or jsonb_typeof(p_settings->'max_generations') <> 'number'
    or jsonb_typeof(p_settings->'job_worker_concurrency') <> 'number'
    or jsonb_typeof(p_settings->'ai_concurrency') <> 'number'
    or jsonb_typeof(p_settings->'parser_timeout_seconds') <> 'number'
    or jsonb_typeof(p_settings->'snapshot_retention_count') <> 'number'
    or jsonb_typeof(p_settings->'data_stale_threshold_minutes') <> 'number'
    or jsonb_typeof(p_settings->'ai_provider_order') <> 'array'
    or jsonb_array_length(p_settings->'ai_provider_order') not between 1 and 3
    or jsonb_typeof(p_settings->'maintenance_announcement') not in ('string', 'null')
  then
    return false;
  end if;

  if (p_settings->>'max_generations')::integer not between 1 and 8
    or (p_settings->>'job_worker_concurrency')::integer not between 1 and 4
    or (p_settings->>'ai_concurrency')::integer not between 1 and 2
    or (p_settings->>'parser_timeout_seconds')::integer not between 30 and 1800
    or (p_settings->>'snapshot_retention_count')::integer not between 1 and 20
    or (p_settings->>'data_stale_threshold_minutes')::integer not between 5 and 1440
    or char_length(coalesce(p_settings->>'maintenance_announcement', '')) > 500
    or exists (
      select 1
      from jsonb_array_elements_text(p_settings->'ai_provider_order') as provider(value)
      where provider.value not in ('openai_compatible', 'codex_cli', 'template')
    )
  then
    return false;
  end if;

  select count(distinct provider.value)::integer
    into v_provider_count
    from jsonb_array_elements_text(p_settings->'ai_provider_order') as provider(value);
  return v_provider_count = jsonb_array_length(p_settings->'ai_provider_order');
exception when others then
  return false;
end;
$$;

alter table public.runtime_settings_versions
  add constraint runtime_settings_safe_payload_check
  check (private.runtime_settings_valid(settings));

insert into public.runtime_settings_versions (
  id,
  version,
  settings,
  created_by,
  created_at
) values (
  '88000000-0000-4000-8000-000000000001',
  1,
  jsonb_build_object(
    'job_creation_enabled', true,
    'max_generations', 5,
    'job_worker_concurrency', 1,
    'ai_concurrency', 1,
    'parser_timeout_seconds', 180,
    'snapshot_retention_count', 3,
    'data_stale_threshold_minutes', 15,
    'ai_provider_order', jsonb_build_array('openai_compatible', 'codex_cli', 'template'),
    'maintenance_announcement', null
  ),
  null,
  now()
);

create function private.write_admin_audit(
  p_actor_user_id uuid,
  p_event_type text,
  p_target_type text,
  p_target_id text,
  p_idempotency_key text,
  p_safe_summary jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  insert into public.admin_audit_events (
    actor_user_id,
    event_type,
    target_type,
    target_id,
    idempotency_key,
    safe_summary
  ) values (
    p_actor_user_id,
    p_event_type,
    p_target_type,
    p_target_id,
    p_idempotency_key,
    coalesce(p_safe_summary, '{}'::jsonb)
  )
  on conflict (actor_user_id, idempotency_key)
    where actor_user_id is not null and idempotency_key is not null
  do update set actor_user_id = excluded.actor_user_id
  returning id into v_id;
  return v_id;
end;
$$;

create function private.mask_auth_email(p_email text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then 'account'
    else left(p_email, 1) || '***@' || split_part(p_email, '@', 2)
  end;
$$;

create function public.list_admin_binding_candidates(
  p_search text default null,
  p_limit integer default 100
)
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
  if p_limit not between 1 and 200 or char_length(coalesce(p_search, '')) > 120 then
    raise exception using errcode = 'P0001', message = 'ADMIN_QUERY_INVALID';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', profile.id,
      'user_display', profile.display_name || ' · ' || private.mask_auth_email(account.email),
      'role', profile.role,
      'player_id', binding.player_id,
      'player_nickname', player.nickname,
      'world_name', world.name,
      'guild_name', guild.name,
      'binding_version', binding.concurrency_version,
      'bound_at', binding.bound_at,
      'conflict_code', null
    ) order by profile.display_name, profile.id)
    from (
      select candidate.*
      from public.profiles as candidate
      join auth.users as candidate_account on candidate_account.id = candidate.id
      where p_search is null
        or btrim(p_search) = ''
        or candidate.display_name ilike '%' || btrim(p_search) || '%'
        or candidate_account.email ilike '%' || btrim(p_search) || '%'
      order by candidate.display_name, candidate.id
      limit p_limit
    ) as profile
    join auth.users as account on account.id = profile.id
    left join public.player_bindings as binding on binding.user_id = profile.id
    left join public.players as player on player.id = binding.player_id
    left join public.worlds as world on world.id = player.world_id
    left join public.guilds as guild on guild.id = player.guild_id
  ), '[]'::jsonb);
end;
$$;

create function public.list_admin_game_players(
  p_search text default null,
  p_limit integer default 200
)
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
  if p_limit not between 1 and 500 or char_length(coalesce(p_search, '')) > 120 then
    raise exception using errcode = 'P0001', message = 'ADMIN_QUERY_INVALID';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'player_id', player.id,
      'nickname', player.nickname,
      'world_name', world.name,
      'guild_name', guild.name,
      'level', player.level,
      'bound_user_id', binding.user_id
    ) order by world.name, player.nickname, player.id)
    from (
      select candidate.*
      from public.players as candidate
      where p_search is null
        or btrim(p_search) = ''
        or candidate.nickname ilike '%' || btrim(p_search) || '%'
      order by candidate.nickname, candidate.id
      limit p_limit
    ) as player
    join public.worlds as world on world.id = player.world_id
    left join public.guilds as guild on guild.id = player.guild_id
    left join public.player_bindings as binding on binding.player_id = player.id
  ), '[]'::jsonb);
end;
$$;

create function public.create_player_binding(
  p_user_id uuid,
  p_player_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_binding public.player_bindings%rowtype;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  if p_user_id is null or p_player_id is null
    or char_length(coalesce(p_idempotency_key, '')) not between 8 and 160
  then
    raise exception using errcode = 'P0001', message = 'BINDING_INVALID';
  end if;

  select * into v_binding
    from public.player_bindings
    where user_id = p_user_id
    for update;
  if v_binding.user_id is not null then
    if v_binding.player_id = p_player_id then
      return jsonb_build_object(
        'user_id', v_binding.user_id,
        'player_id', v_binding.player_id,
        'binding_version', v_binding.concurrency_version,
        'bound_at', v_binding.bound_at,
        'reused', true
      );
    end if;
    raise exception using errcode = 'P0001', message = 'BINDING_CONFLICT';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id)
    or not exists (select 1 from public.players where id = p_player_id)
  then
    raise exception using errcode = 'P0001', message = 'BINDING_NOT_FOUND';
  end if;
  if exists (select 1 from public.player_bindings where player_id = p_player_id) then
    raise exception using errcode = 'P0001', message = 'BINDING_CONFLICT';
  end if;

  insert into public.player_bindings(user_id, player_id, bound_by, bound_at)
  values (p_user_id, p_player_id, auth.uid(), now())
  returning * into v_binding;
  insert into public.player_binding_events(
    event_type, user_id, player_id, actor_user_id, binding_version, idempotency_key
  ) values (
    'binding_created', p_user_id, p_player_id, auth.uid(),
    v_binding.concurrency_version, p_idempotency_key
  );
  perform private.write_admin_audit(
    auth.uid(), 'binding.created', 'player_binding', p_user_id::text,
    p_idempotency_key,
    jsonb_build_object('user_id', p_user_id, 'player_id', p_player_id,
      'binding_version', v_binding.concurrency_version)
  );
  return jsonb_build_object(
    'user_id', v_binding.user_id,
    'player_id', v_binding.player_id,
    'binding_version', v_binding.concurrency_version,
    'bound_at', v_binding.bound_at,
    'reused', false
  );
exception when unique_violation then
  if exists (
    select 1 from public.player_binding_events
    where actor_user_id = auth.uid() and idempotency_key = p_idempotency_key
      and user_id = p_user_id and player_id = p_player_id
  ) then
    select * into v_binding from public.player_bindings where user_id = p_user_id;
    return jsonb_build_object(
      'user_id', v_binding.user_id,
      'player_id', v_binding.player_id,
      'binding_version', v_binding.concurrency_version,
      'bound_at', v_binding.bound_at,
      'reused', true
    );
  end if;
  raise exception using errcode = 'P0001', message = 'BINDING_CONFLICT';
end;
$$;

create function public.update_player_binding(
  p_user_id uuid,
  p_player_id uuid,
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_binding public.player_bindings%rowtype;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  if p_user_id is null or p_player_id is null or p_expected_version < 1
    or char_length(coalesce(p_idempotency_key, '')) not between 8 and 160
  then
    raise exception using errcode = 'P0001', message = 'BINDING_INVALID';
  end if;
  if exists (
    select 1 from public.player_binding_events
    where actor_user_id = auth.uid() and idempotency_key = p_idempotency_key
      and event_type = 'binding_updated'
  ) then
    select * into v_binding from public.player_bindings where user_id = p_user_id;
    return jsonb_build_object(
      'user_id', v_binding.user_id, 'player_id', v_binding.player_id,
      'binding_version', v_binding.concurrency_version, 'bound_at', v_binding.bound_at,
      'reused', true
    );
  end if;

  select * into v_binding
    from public.player_bindings where user_id = p_user_id for update;
  if v_binding.user_id is null then
    raise exception using errcode = 'P0001', message = 'BINDING_NOT_FOUND';
  end if;
  if v_binding.concurrency_version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'BINDING_VERSION_CONFLICT';
  end if;
  if v_binding.player_id = p_player_id then
    return jsonb_build_object(
      'user_id', v_binding.user_id, 'player_id', v_binding.player_id,
      'binding_version', v_binding.concurrency_version, 'bound_at', v_binding.bound_at,
      'reused', true
    );
  end if;
  if not exists (select 1 from public.players where id = p_player_id)
    or exists (
      select 1 from public.player_bindings
      where player_id = p_player_id and user_id <> p_user_id
    )
  then
    raise exception using errcode = 'P0001', message = 'BINDING_CONFLICT';
  end if;

  update public.player_bindings
     set player_id = p_player_id,
         bound_by = auth.uid(),
         claim_code_hash = null
   where user_id = p_user_id
  returning * into v_binding;
  insert into public.player_binding_events(
    event_type, user_id, player_id, actor_user_id, binding_version, idempotency_key
  ) values (
    'binding_updated', p_user_id, p_player_id, auth.uid(),
    v_binding.concurrency_version, p_idempotency_key
  );
  perform private.write_admin_audit(
    auth.uid(), 'binding.updated', 'player_binding', p_user_id::text,
    p_idempotency_key,
    jsonb_build_object('user_id', p_user_id, 'player_id', p_player_id,
      'binding_version', v_binding.concurrency_version)
  );
  return jsonb_build_object(
    'user_id', v_binding.user_id, 'player_id', v_binding.player_id,
    'binding_version', v_binding.concurrency_version, 'bound_at', v_binding.bound_at,
    'reused', false
  );
end;
$$;

create function public.delete_player_binding(
  p_user_id uuid,
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_binding public.player_bindings%rowtype;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  if p_user_id is null or p_expected_version < 1
    or char_length(coalesce(p_idempotency_key, '')) not between 8 and 160
  then
    raise exception using errcode = 'P0001', message = 'BINDING_INVALID';
  end if;
  if exists (
    select 1 from public.player_binding_events
    where actor_user_id = auth.uid() and idempotency_key = p_idempotency_key
      and event_type = 'binding_deleted'
  ) then
    return jsonb_build_object('user_id', p_user_id, 'deleted', true, 'reused', true);
  end if;
  select * into v_binding
    from public.player_bindings where user_id = p_user_id for update;
  if v_binding.user_id is null then
    raise exception using errcode = 'P0001', message = 'BINDING_NOT_FOUND';
  end if;
  if v_binding.concurrency_version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'BINDING_VERSION_CONFLICT';
  end if;
  delete from public.player_bindings where user_id = p_user_id;
  insert into public.player_binding_events(
    event_type, user_id, player_id, actor_user_id, binding_version, idempotency_key
  ) values (
    'binding_deleted', p_user_id, v_binding.player_id, auth.uid(),
    v_binding.concurrency_version, p_idempotency_key
  );
  perform private.write_admin_audit(
    auth.uid(), 'binding.deleted', 'player_binding', p_user_id::text,
    p_idempotency_key,
    jsonb_build_object('user_id', p_user_id, 'player_id', v_binding.player_id,
      'binding_version', v_binding.concurrency_version)
  );
  return jsonb_build_object('user_id', p_user_id, 'deleted', true, 'reused', false);
end;
$$;

create function public.list_player_binding_events(
  p_user_id uuid default null,
  p_limit integer default 100
)
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
  if p_limit not between 1 and 200 then
    raise exception using errcode = 'P0001', message = 'ADMIN_QUERY_INVALID';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'event_id', event.id,
      'event_type', event.event_type,
      'user_id', event.user_id,
      'player_id', event.player_id,
      'actor_display', coalesce(actor.display_name, 'system'),
      'created_at', event.created_at
    ) order by event.created_at desc, event.id desc)
    from (
      select candidate.* from public.player_binding_events as candidate
      where p_user_id is null or candidate.user_id = p_user_id
      order by candidate.created_at desc, candidate.id desc
      limit p_limit
    ) as event
    left join public.profiles as actor on actor.id = event.actor_user_id
  ), '[]'::jsonb);
end;
$$;

create function public.create_agent_command(
  p_command_type text,
  p_payload jsonb,
  p_idempotency_key text,
  p_ttl_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_command public.agent_commands%rowtype;
  v_reused boolean := false;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  if p_command_type is null
    or p_command_type not in (
      'sync_save_once', 'reparse_snapshot', 'approve_inventory_snapshot',
      'reject_inventory_snapshot', 'cleanup_expired_agent_snapshots',
      'retry_breeding_job', 'cancel_breeding_job', 'reap_stale_job_lock',
      'template_ai_healthcheck', 'warm_catalog_cache'
    )
  then
    raise exception using errcode = 'P0001', message = 'AGENT_COMMAND_NOT_ALLOWED';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 8192
    or p_payload ?| array[
      'path', 'file_path', 'shell', 'process', 'docker', 'compose',
      'command', 'token', 'secret', 'service_role', 'password'
    ]
    or char_length(coalesce(p_idempotency_key, '')) not between 8 and 160
    or p_ttl_seconds not between 30 and 86400
  then
    raise exception using errcode = 'P0001', message = 'AGENT_COMMAND_INVALID';
  end if;

  select * into v_command
    from public.agent_commands
    where created_by = auth.uid() and idempotency_key = p_idempotency_key;
  if v_command.id is not null then
    if v_command.command_type <> p_command_type or v_command.payload <> p_payload then
      raise exception using errcode = 'P0001', message = 'AGENT_COMMAND_CONFLICT';
    end if;
    v_reused := true;
  else
    insert into public.agent_commands(
      command_type, payload, idempotency_key, created_by, expires_at
    ) values (
      p_command_type, p_payload, p_idempotency_key, auth.uid(),
      now() + make_interval(secs => p_ttl_seconds)
    ) returning * into v_command;
    perform private.write_admin_audit(
      auth.uid(), 'agent_command.created', 'agent_command', v_command.id::text,
      p_idempotency_key,
      jsonb_build_object('command_type', p_command_type, 'command_id', v_command.id)
    );
  end if;
  return jsonb_build_object(
    'command_id', v_command.id,
    'command_type', v_command.command_type,
    'status', v_command.status,
    'created_at', v_command.created_at,
    'expires_at', v_command.expires_at,
    'reused', v_reused
  );
end;
$$;

create function public.claim_agent_command(
  p_worker_id text,
  p_stale_before timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_command public.agent_commands%rowtype;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if char_length(coalesce(p_worker_id, '')) not between 1 and 128
    or p_stale_before is null or p_stale_before > now()
  then
    raise exception using errcode = 'P0001', message = 'INVALID_WORKER_ID';
  end if;

  update public.agent_commands
     set status = 'expired',
         completed_at = now(),
         error_code = 'AGENT_COMMAND_EXPIRED',
         updated_at = now()
   where status = 'pending' and expires_at <= now();

  with candidate as (
    select command.id
    from public.agent_commands as command
    where command.expires_at > now()
      and (
        command.status = 'pending'
        or (command.status = 'processing' and command.claimed_at < p_stale_before)
      )
    order by command.created_at, command.id
    for update skip locked
    limit 1
  )
  update public.agent_commands as command
     set status = 'processing',
         claimed_by = btrim(p_worker_id),
         claimed_at = now(),
         updated_at = now()
    from candidate
   where command.id = candidate.id
  returning command.* into v_command;
  if v_command.id is null then return null; end if;
  return jsonb_build_object(
    'command_id', v_command.id,
    'command_type', v_command.command_type,
    'payload', v_command.payload,
    'idempotency_key', v_command.idempotency_key,
    'created_at', v_command.created_at,
    'expires_at', v_command.expires_at
  );
end;
$$;

create function public.complete_agent_command(
  p_command_id uuid,
  p_worker_id text,
  p_safe_summary jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_command public.agent_commands%rowtype;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_command_id is null or char_length(coalesce(p_worker_id, '')) not between 1 and 128
    or p_safe_summary is null or jsonb_typeof(p_safe_summary) <> 'object'
    or octet_length(p_safe_summary::text) > 8192
  then
    raise exception using errcode = 'P0001', message = 'AGENT_COMMAND_RESULT_INVALID';
  end if;
  select * into v_command from public.agent_commands where id = p_command_id for update;
  if v_command.status = 'succeeded' then return true; end if;
  if v_command.status <> 'processing' or v_command.claimed_by <> btrim(p_worker_id) then
    raise exception using errcode = 'P0001', message = 'AGENT_COMMAND_LOCK_NOT_OWNED';
  end if;
  insert into public.agent_command_results(
    command_id, status, worker_id, safe_summary, started_at, completed_at
  ) values (
    v_command.id, 'succeeded', btrim(p_worker_id), p_safe_summary,
    v_command.claimed_at, now()
  );
  update public.agent_commands
     set status = 'succeeded', completed_at = now(), updated_at = now()
   where id = p_command_id;
  perform private.write_admin_audit(
    v_command.created_by, 'agent_command.succeeded', 'agent_command', v_command.id::text,
    null, jsonb_build_object('command_type', v_command.command_type, 'command_id', v_command.id)
  );
  return true;
end;
$$;

create function public.fail_agent_command(
  p_command_id uuid,
  p_worker_id text,
  p_error_code text,
  p_safe_summary jsonb,
  p_rejected boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_command public.agent_commands%rowtype;
  v_status public.agent_command_status;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_command_id is null or char_length(coalesce(p_worker_id, '')) not between 1 and 128
    or p_error_code !~ '^[A-Z][A-Z0-9_]{0,99}$'
    or p_safe_summary is null or jsonb_typeof(p_safe_summary) <> 'object'
    or octet_length(p_safe_summary::text) > 8192
  then
    raise exception using errcode = 'P0001', message = 'AGENT_COMMAND_RESULT_INVALID';
  end if;
  select * into v_command from public.agent_commands where id = p_command_id for update;
  v_status := case
    when p_rejected then 'rejected'::public.agent_command_status
    else 'failed'::public.agent_command_status
  end;
  if v_command.status = v_status then return true; end if;
  if v_command.status <> 'processing' or v_command.claimed_by <> btrim(p_worker_id) then
    raise exception using errcode = 'P0001', message = 'AGENT_COMMAND_LOCK_NOT_OWNED';
  end if;
  insert into public.agent_command_results(
    command_id, status, worker_id, error_code, safe_summary, started_at, completed_at
  ) values (
    v_command.id, v_status, btrim(p_worker_id), p_error_code, p_safe_summary,
    v_command.claimed_at, now()
  );
  update public.agent_commands
     set status = v_status, completed_at = now(), error_code = p_error_code, updated_at = now()
   where id = p_command_id;
  perform private.write_admin_audit(
    v_command.created_by,
    case when p_rejected then 'agent_command.rejected' else 'agent_command.failed' end,
    'agent_command', v_command.id::text, null,
    jsonb_build_object('command_type', v_command.command_type,
      'command_id', v_command.id, 'error_code', p_error_code)
  );
  return true;
end;
$$;

create function public.record_agent_worker_heartbeat(
  p_worker_kind text,
  p_worker_id text,
  p_deployment_version text,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  insert into public.agent_worker_heartbeats(
    worker_kind, worker_id, deployment_version, safe_metadata, heartbeat_at
  ) values (
    p_worker_kind, btrim(p_worker_id), btrim(p_deployment_version),
    coalesce(p_safe_metadata, '{}'::jsonb), now()
  ) on conflict (worker_kind) do update
    set worker_id = excluded.worker_id,
        deployment_version = excluded.deployment_version,
        safe_metadata = excluded.safe_metadata,
        heartbeat_at = excluded.heartbeat_at;
  return true;
exception when check_violation then
  raise exception using errcode = 'P0001', message = 'WORKER_HEARTBEAT_INVALID';
end;
$$;

create function public.get_runtime_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.runtime_settings_versions%rowtype;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  select * into v_row from public.runtime_settings_versions order by version desc limit 1;
  return jsonb_build_object(
    'version_id', v_row.id,
    'version', v_row.version,
    'settings', v_row.settings,
    'created_by_display', coalesce(
      (select profile.display_name from public.profiles as profile where profile.id = v_row.created_by),
      'system'
    ),
    'created_at', v_row.created_at,
    'rolled_back_from_version', v_row.rolled_back_from_version
  );
end;
$$;

create function public.update_runtime_settings(
  p_expected_version integer,
  p_settings jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current public.runtime_settings_versions%rowtype;
  v_new public.runtime_settings_versions%rowtype;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  if not private.runtime_settings_valid(p_settings)
    or p_expected_version < 1
    or char_length(coalesce(p_idempotency_key, '')) not between 8 and 160
  then
    raise exception using errcode = 'P0001', message = 'RUNTIME_SETTINGS_INVALID';
  end if;
  select * into v_new from public.runtime_settings_versions
   where created_by = auth.uid() and idempotency_key = p_idempotency_key;
  if v_new.id is not null then
    return public.get_runtime_settings();
  end if;
  select * into v_current from public.runtime_settings_versions
    order by version desc limit 1 for update;
  if v_current.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'RUNTIME_SETTINGS_VERSION_CONFLICT';
  end if;
  insert into public.runtime_settings_versions(
    version, settings, created_by, idempotency_key
  ) values (
    v_current.version + 1, p_settings, auth.uid(), p_idempotency_key
  ) returning * into v_new;
  perform private.write_admin_audit(
    auth.uid(), 'runtime_settings.updated', 'runtime_settings', v_new.id::text,
    p_idempotency_key,
    jsonb_build_object('version', v_new.version, 'previous_version', v_current.version)
  );
  return public.get_runtime_settings();
end;
$$;

create function public.rollback_runtime_settings(
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current public.runtime_settings_versions%rowtype;
  v_previous public.runtime_settings_versions%rowtype;
  v_new public.runtime_settings_versions%rowtype;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  if p_expected_version < 2
    or char_length(coalesce(p_idempotency_key, '')) not between 8 and 160
  then
    raise exception using errcode = 'P0001', message = 'RUNTIME_SETTINGS_INVALID';
  end if;
  select * into v_new from public.runtime_settings_versions
   where created_by = auth.uid() and idempotency_key = p_idempotency_key;
  if v_new.id is not null then return public.get_runtime_settings(); end if;
  select * into v_current from public.runtime_settings_versions
    order by version desc limit 1 for update;
  if v_current.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'RUNTIME_SETTINGS_VERSION_CONFLICT';
  end if;
  select * into v_previous from public.runtime_settings_versions
    where version < v_current.version order by version desc limit 1;
  if v_previous.id is null then
    raise exception using errcode = 'P0001', message = 'RUNTIME_SETTINGS_NOT_FOUND';
  end if;
  insert into public.runtime_settings_versions(
    version, settings, created_by, rolled_back_from_version, idempotency_key
  ) values (
    v_current.version + 1, v_previous.settings, auth.uid(),
    v_current.version, p_idempotency_key
  ) returning * into v_new;
  perform private.write_admin_audit(
    auth.uid(), 'runtime_settings.rolled_back', 'runtime_settings', v_new.id::text,
    p_idempotency_key,
    jsonb_build_object('version', v_new.version, 'rolled_back_from', v_current.version,
      'restored_version', v_previous.version)
  );
  return public.get_runtime_settings();
end;
$$;

create function private.enforce_runtime_job_settings()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_settings jsonb;
begin
  select settings into v_settings
  from public.runtime_settings_versions order by version desc limit 1;
  if coalesce(auth.jwt()->>'role', '') = 'authenticated'
    and not coalesce((v_settings->>'job_creation_enabled')::boolean, true)
  then
    raise exception using errcode = 'P0001', message = 'JOB_CREATION_DISABLED';
  end if;
  if new.max_generations > coalesce((v_settings->>'max_generations')::integer, 5) then
    raise exception using errcode = 'P0001', message = 'MAX_GENERATIONS_EXCEEDED';
  end if;
  return new;
end;
$$;

create trigger breeding_jobs_runtime_settings_guard
  before insert on public.breeding_jobs
  for each row execute function private.enforce_runtime_job_settings();

create function private.admin_worker_status(p_worker_kind text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_heartbeat public.agent_worker_heartbeats%rowtype;
  v_stale boolean;
  v_threshold_minutes integer;
begin
  select * into v_heartbeat from public.agent_worker_heartbeats
    where worker_kind = p_worker_kind;
  if v_heartbeat.worker_kind is null then
    return jsonb_build_object(
      'state', 'unknown', 'last_heartbeat_at', null, 'stale', true
    );
  end if;
  select coalesce((settings->>'data_stale_threshold_minutes')::integer, 15)
    into v_threshold_minutes
  from public.runtime_settings_versions order by version desc limit 1;
  v_stale := v_heartbeat.heartbeat_at < now() - make_interval(mins => v_threshold_minutes);
  return jsonb_build_object(
    'state', case when v_stale then 'offline' else 'healthy' end,
    'last_heartbeat_at', v_heartbeat.heartbeat_at,
    'stale', v_stale
  );
end;
$$;

create function private.admin_latest_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot public.inventory_snapshots%rowtype;
  v_count integer;
begin
  select snapshot.* into v_snapshot
  from public.inventory_snapshots as snapshot
  where snapshot.status = 'published'
  order by snapshot.captured_at desc, snapshot.id desc
  limit 1;
  if v_snapshot.id is null then return null; end if;
  select count(*)::integer into v_count
  from public.pal_snapshot_items where snapshot_id = v_snapshot.id;
  return jsonb_build_object(
    'snapshot_id', v_snapshot.id,
    'captured_at', v_snapshot.captured_at,
    'pal_count', v_count,
    'parser_name', v_snapshot.parser_name,
    'parser_version', v_snapshot.parser_version
  );
end;
$$;

create function private.admin_disk_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_heartbeat public.agent_worker_heartbeats%rowtype;
  v_available bigint;
begin
  select * into v_heartbeat from public.agent_worker_heartbeats
    where worker_kind = 'agent';
  if jsonb_typeof(v_heartbeat.safe_metadata->'disk_available_bytes') = 'number' then
    v_available := (v_heartbeat.safe_metadata->>'disk_available_bytes')::bigint;
  end if;
  return jsonb_build_object(
    'level', coalesce(v_heartbeat.safe_metadata->>'disk_level', 'unknown'),
    'available_bytes', v_available,
    'checked_at', v_heartbeat.heartbeat_at
  );
exception when others then
  return jsonb_build_object('level', 'unknown', 'available_bytes', null, 'checked_at', null);
end;
$$;

create function private.admin_recent_failure()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_error_code text;
  v_summary text;
  v_at timestamptz;
begin
  select failure.error_code, failure.error_summary, failure.occurred_at
    into v_error_code, v_summary, v_at
  from (
    select snapshot.error_code, snapshot.error_summary, snapshot.created_at as occurred_at
    from public.inventory_snapshots as snapshot
    where snapshot.status in ('failed', 'rejected') and snapshot.error_code is not null
    union all
    select job.error_code, job.error_summary, job.updated_at
    from public.breeding_jobs as job
    where job.status = 'failed' and job.error_code is not null
    union all
    select command.error_code, null::text, command.completed_at
    from public.agent_commands as command
    where command.status in ('failed', 'rejected', 'expired')
  ) as failure
  order by failure.occurred_at desc nulls last
  limit 1;
  if v_error_code is null then return null; end if;
  return jsonb_build_object(
    'error_code', v_error_code,
    'summary', coalesce(left(v_summary, 500), '安全摘要不可用'),
    'occurred_at', v_at
  );
end;
$$;

create function public.get_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot jsonb;
  v_catalog public.game_data_versions%rowtype;
  v_plan public.breeding_plans%rowtype;
  v_deployment_version text;
  v_agent public.agent_worker_heartbeats%rowtype;
  v_latest_heartbeat timestamptz;
  v_threshold_minutes integer;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'ADMIN_ACCESS_DENIED';
  end if;
  v_snapshot := private.admin_latest_snapshot();
  select version.* into v_catalog
  from public.worlds as world
  join public.game_data_versions as version on version.id = world.active_game_data_version_id
  order by world.updated_at desc limit 1;
  select plan.* into v_plan from public.breeding_plans as plan
    order by plan.generated_at desc limit 1;
  select * into v_agent from public.agent_worker_heartbeats where worker_kind = 'agent';
  select max(heartbeat_at) into v_latest_heartbeat from public.agent_worker_heartbeats;
  select record.git_sha into v_deployment_version
  from public.deployment_records as record
  where record.status in ('healthy', 'rolled_back')
  order by record.recorded_at desc limit 1;
  v_deployment_version := coalesce(v_deployment_version, v_agent.deployment_version, 'unreported');
  select coalesce((settings->>'data_stale_threshold_minutes')::integer, 15)
    into v_threshold_minutes
  from public.runtime_settings_versions order by version desc limit 1;

  return jsonb_build_object(
    'agent', private.admin_worker_status('agent'),
    'save_worker', private.admin_worker_status('save_worker'),
    'job_worker', private.admin_worker_status('job_worker'),
    'candidate_detector', private.admin_worker_status('candidate_detector'),
    'latest_successful_snapshot', v_snapshot,
    'parser', jsonb_build_object(
      'name', v_snapshot->>'parser_name',
      'version', v_snapshot->>'parser_version'
    ),
    'catalog', jsonb_build_object(
      'version_id', v_catalog.id,
      'build', v_catalog.game_build_id,
      'game_version', v_catalog.game_version,
      'content_hash', v_catalog.content_hash
    ),
    'job_counts', jsonb_build_object(
      'pending', (select count(*) from public.breeding_jobs where status = 'pending'),
      'processing', (select count(*) from public.breeding_jobs where status in ('processing', 'algorithm_completed', 'ai_enriching')),
      'retry', (select count(*) from public.breeding_jobs where status = 'retry_pending'),
      'failed', (select count(*) from public.breeding_jobs where status = 'failed')
    ),
    'ai_provider', jsonb_build_object(
      'provider', coalesce(v_plan.ai_provider, 'template'),
      'state', case when v_plan.id is null then 'unknown' when v_plan.ai_degraded then 'degraded' else 'healthy' end,
      'degraded', coalesce(v_plan.ai_degraded, false),
      'last_checked_at', v_plan.generated_at
    ),
    'recent_failure', private.admin_recent_failure(),
    'disk', private.admin_disk_status(),
    'deployment_version', v_deployment_version,
    'stale', v_latest_heartbeat is null
      or v_latest_heartbeat < now() - make_interval(mins => v_threshold_minutes)
  );
end;
$$;

create function public.get_admin_save_parser_status()
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
    'recent_failure', v_failure,
    'parser', jsonb_build_object('name', v_snapshot->>'parser_name', 'version', v_snapshot->>'parser_version'),
    'parse_duration_ms', case when v_snapshot is null then null else coalesce((v_heartbeat.safe_metadata->>'parse_duration_ms')::integer, null) end,
    'pal_count', case when v_snapshot is null then null else (v_snapshot->>'pal_count')::integer end,
    'inventory_drop_state', case when v_rejected.id is not null then 'review_required' else 'normal' end,
    'disk', private.admin_disk_status(),
    'snapshot_retention_count', (v_settings->>'snapshot_retention_count')::integer,
    'stale', v_heartbeat.heartbeat_at is null or v_heartbeat.heartbeat_at < now() - interval '5 minutes'
  );
exception when others then
  raise exception using errcode = 'P0001', message = 'ADMIN_DATA_UNAVAILABLE';
end;
$$;

create function public.list_admin_catalog_versions(p_limit integer default 50)
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
      'version_id', version.id,
      'source', source.name,
      'build', version.game_build_id,
      'game_version', version.game_version,
      'content_hash', version.content_hash,
      'package_hash', version.package_hash,
      'counts', jsonb_build_object(
        'pals', coalesce((version.manifest->'counts'->>'pals')::integer, 0),
        'passive_skills', coalesce((version.manifest->'counts'->>'passive_skills')::integer, 0),
        'active_skills', coalesce((version.manifest->'counts'->>'active_skills')::integer, 0),
        'pal_active_skills', coalesce((version.manifest->'counts'->>'pal_active_skills')::integer, 0),
        'partner_skills', coalesce((version.manifest->'counts'->>'partner_skills')::integer, 0),
        'breeding_recipes', coalesce((version.manifest->'counts'->>'breeding_recipes')::integer, 0),
        'localizations', coalesce((version.manifest->'counts'->>'localizations')::integer, 0)
      ),
      'validation_state', version.status,
      'published_world', world.name,
      'previous_version_id', version.previous_version_id,
      'diff_summary', coalesce(version.validation_report->'diff_summary', '{}'::jsonb),
      'provenance', coalesce(
        version.manifest->'source_provenance',
        version.manifest->'breeding_source_provenance',
        version.manifest->'provenance',
        '{}'::jsonb
      ),
      'imported_at', version.imported_at
    ) order by version.imported_at desc, version.id desc)
    from (
      select limited.*,
        lag(limited.id) over (order by limited.imported_at, limited.id) as previous_version_id
      from (
        select candidate.* from public.game_data_versions as candidate
        order by candidate.imported_at desc, candidate.id desc limit p_limit
      ) as limited
    ) as version
    left join public.game_data_sources as source on source.id = version.source_id
    left join public.worlds as world on world.active_game_data_version_id = version.id
  ), '[]'::jsonb);
end;
$$;

create function public.list_admin_jobs(p_limit integer default 100)
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
  if p_limit not between 1 and 200 then
    raise exception using errcode = 'P0001', message = 'ADMIN_QUERY_INVALID';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'job_id', job.id,
      'requester_display', coalesce(profile.display_name, 'user-' || left(job.requester_user_id::text, 8)),
      'status', job.status,
      'snapshot_id', job.inventory_snapshot_id,
      'catalog_version_id', job.game_data_version_id,
      'attempt_count', job.attempt_count,
      'heartbeat_at', job.heartbeat_at,
      'locked', job.locked_by is not null,
      'error_code', job.error_code,
      'route_count', coalesce(route_count.value, 0),
      'ai_provider', plan.ai_provider,
      'degraded', coalesce(plan.ai_degraded, false),
      'execution_plan_id', execution.id,
      'created_at', job.created_at
    ) order by job.created_at desc, job.id desc)
    from (
      select candidate.* from public.breeding_jobs as candidate
      order by candidate.created_at desc, candidate.id desc limit p_limit
    ) as job
    left join public.profiles as profile on profile.id = job.requester_user_id
    left join public.breeding_plans as plan on plan.job_id = job.id
    left join lateral (
      select count(*)::integer as value from public.breeding_routes where plan_id = plan.id
    ) as route_count on true
    left join public.execution_plans as execution on execution.source_job_id = job.id
  ), '[]'::jsonb);
end;
$$;

create function public.list_admin_audit_events(p_limit integer default 100)
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
  if p_limit not between 1 and 200 then
    raise exception using errcode = 'P0001', message = 'ADMIN_QUERY_INVALID';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'event_id', event.id,
      'event_type', event.event_type,
      'actor_display', coalesce(profile.display_name, 'system'),
      'target_type', event.target_type,
      'target_id', event.target_id,
      'safe_summary', event.safe_summary,
      'created_at', event.created_at
    ) order by event.created_at desc, event.id desc)
    from (
      select candidate.* from public.admin_audit_events as candidate
      order by candidate.created_at desc, candidate.id desc limit p_limit
    ) as event
    left join public.profiles as profile on profile.id = event.actor_user_id
  ), '[]'::jsonb);
end;
$$;

create function public.execute_agent_command_database_action(p_command_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_command public.agent_commands%rowtype;
  v_job public.breeding_jobs%rowtype;
  v_job_id uuid;
  v_snapshot_id uuid;
  v_count integer;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  select * into v_command from public.agent_commands where id = p_command_id;
  if v_command.id is null or v_command.status <> 'processing' then
    raise exception using errcode = 'P0001', message = 'AGENT_COMMAND_NOT_FOUND';
  end if;
  if v_command.command_type in ('retry_breeding_job', 'cancel_breeding_job', 'reap_stale_job_lock') then
    begin v_job_id := (v_command.payload->>'job_id')::uuid;
    exception when others then
      raise exception using errcode = 'P0001', message = 'AGENT_COMMAND_PAYLOAD_INVALID';
    end;
    select * into v_job from public.breeding_jobs where id = v_job_id for update;
    if v_job.id is null then
      raise exception using errcode = 'P0001', message = 'JOB_NOT_FOUND';
    end if;
    if v_command.command_type = 'retry_breeding_job' then
      if v_job.status not in ('failed', 'retry_pending') or v_job.attempt_count >= v_job.max_attempts then
        raise exception using errcode = 'P0001', message = 'JOB_NOT_RETRYABLE';
      end if;
      update public.breeding_jobs set
        status = 'retry_pending', completed_at = null, error_code = null,
        error_summary = null, updated_at = now()
      where id = v_job.id;
    elsif v_command.command_type = 'cancel_breeding_job' then
      if v_job.status in ('completed', 'failed', 'cancelled') then
        raise exception using errcode = 'P0001', message = 'JOB_NOT_CANCELLABLE';
      end if;
      update public.breeding_jobs set
        status = 'cancelled', locked_by = null, lease_token = null,
        locked_at = null, heartbeat_at = null, completed_at = now(),
        error_code = 'JOB_CANCELLED', error_summary = null, updated_at = now()
      where id = v_job.id;
    else
      if v_job.status not in ('processing', 'algorithm_completed', 'ai_enriching')
        or v_job.heartbeat_at is null
        or v_job.heartbeat_at >= now() - interval '2 minutes'
        or coalesce((v_command.payload->>'confirmed_stale')::boolean, false) is not true
      then
        raise exception using errcode = 'P0001', message = 'JOB_LOCK_NOT_CONFIRMED_STALE';
      end if;
      update public.breeding_jobs set
        status = case when attempt_count < max_attempts then 'retry_pending'::public.breeding_job_status else 'failed'::public.breeding_job_status end,
        locked_by = null, lease_token = null, locked_at = null, heartbeat_at = null,
        error_code = 'STALE_WORKER_LOCK', error_summary = null,
        completed_at = case when attempt_count < max_attempts then null else now() end,
        updated_at = now()
      where id = v_job.id;
    end if;
    return jsonb_build_object('job_id', v_job.id, 'action', v_command.command_type);
  end if;
  if v_command.command_type in ('approve_inventory_snapshot', 'reject_inventory_snapshot') then
    begin v_snapshot_id := (v_command.payload->>'snapshot_id')::uuid;
    exception when others then
      raise exception using errcode = 'P0001', message = 'AGENT_COMMAND_PAYLOAD_INVALID';
    end;
    if v_command.command_type = 'reject_inventory_snapshot' then
      update public.inventory_snapshots
         set error_code = 'INVENTORY_DROP_REJECTED',
             error_summary = '管理员拒绝异常库存下降。'
       where id = v_snapshot_id and status = 'rejected'
         and error_code = 'INVENTORY_DROP_REVIEW_REQUIRED';
      get diagnostics v_count = row_count;
      if v_count <> 1 then
        raise exception using errcode = 'P0001', message = 'INVENTORY_REVIEW_NOT_FOUND';
      end if;
      return jsonb_build_object('snapshot_id', v_snapshot_id, 'action', 'rejected');
    end if;
    return jsonb_build_object(
      'snapshot_id', v_snapshot_id,
      'action', 'approval_requires_safe_reparse'
    );
  end if;
  raise exception using errcode = 'P0001', message = 'AGENT_COMMAND_NOT_DATABASE_ACTION';
end;
$$;

create function public.record_deployment_record(
  p_git_sha text,
  p_agent_image text,
  p_vercel_deployment_id text,
  p_status text,
  p_safe_summary jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_id uuid;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  insert into public.deployment_records(
    git_sha, agent_image, vercel_deployment_id, status, safe_summary
  ) values (
    p_git_sha, p_agent_image, p_vercel_deployment_id, p_status,
    coalesce(p_safe_summary, '{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;

alter table public.admin_audit_events enable row level security;
alter table public.player_binding_events enable row level security;
alter table public.agent_commands enable row level security;
alter table public.agent_command_results enable row level security;
alter table public.agent_worker_heartbeats enable row level security;
alter table public.runtime_settings_versions enable row level security;
alter table public.deployment_records enable row level security;

revoke all on table
  public.admin_audit_events,
  public.player_binding_events,
  public.agent_commands,
  public.agent_command_results,
  public.agent_worker_heartbeats,
  public.runtime_settings_versions,
  public.deployment_records
from public, anon, authenticated, service_role;

revoke all on function private.prevent_append_only_mutation() from public, anon, authenticated;
revoke all on function private.increment_player_binding_version() from public, anon, authenticated;
revoke all on function private.runtime_settings_valid(jsonb) from public, anon, authenticated;
revoke all on function private.write_admin_audit(uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function private.mask_auth_email(text) from public, anon, authenticated;
revoke all on function private.enforce_runtime_job_settings() from public, anon, authenticated;
revoke all on function private.admin_worker_status(text) from public, anon, authenticated;
revoke all on function private.admin_latest_snapshot() from public, anon, authenticated;
revoke all on function private.admin_disk_status() from public, anon, authenticated;
revoke all on function private.admin_recent_failure() from public, anon, authenticated;

revoke all on function public.list_admin_binding_candidates(text, integer)
  from public, anon, authenticated;
revoke all on function public.list_admin_game_players(text, integer)
  from public, anon, authenticated;
revoke all on function public.create_player_binding(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.update_player_binding(uuid, uuid, integer, text)
  from public, anon, authenticated;
revoke all on function public.delete_player_binding(uuid, integer, text)
  from public, anon, authenticated;
revoke all on function public.list_player_binding_events(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.create_agent_command(text, jsonb, text, integer)
  from public, anon, authenticated;
revoke all on function public.get_runtime_settings() from public, anon, authenticated;
revoke all on function public.update_runtime_settings(integer, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.rollback_runtime_settings(integer, text)
  from public, anon, authenticated;
revoke all on function public.get_admin_overview() from public, anon, authenticated;
revoke all on function public.get_admin_save_parser_status() from public, anon, authenticated;
revoke all on function public.list_admin_catalog_versions(integer)
  from public, anon, authenticated;
revoke all on function public.list_admin_jobs(integer) from public, anon, authenticated;
revoke all on function public.list_admin_audit_events(integer)
  from public, anon, authenticated;

grant execute on function public.list_admin_binding_candidates(text, integer) to authenticated;
grant execute on function public.list_admin_game_players(text, integer) to authenticated;
grant execute on function public.create_player_binding(uuid, uuid, text) to authenticated;
grant execute on function public.update_player_binding(uuid, uuid, integer, text) to authenticated;
grant execute on function public.delete_player_binding(uuid, integer, text) to authenticated;
grant execute on function public.list_player_binding_events(uuid, integer) to authenticated;
grant execute on function public.create_agent_command(text, jsonb, text, integer) to authenticated;
grant execute on function public.get_runtime_settings() to authenticated;
grant execute on function public.update_runtime_settings(integer, jsonb, text) to authenticated;
grant execute on function public.rollback_runtime_settings(integer, text) to authenticated;
grant execute on function public.get_admin_overview() to authenticated;
grant execute on function public.get_admin_save_parser_status() to authenticated;
grant execute on function public.list_admin_catalog_versions(integer) to authenticated;
grant execute on function public.list_admin_jobs(integer) to authenticated;
grant execute on function public.list_admin_audit_events(integer) to authenticated;

revoke all on function public.claim_agent_command(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.complete_agent_command(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.fail_agent_command(uuid, text, text, jsonb, boolean)
  from public, anon, authenticated;
revoke all on function public.record_agent_worker_heartbeat(text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.execute_agent_command_database_action(uuid)
  from public, anon, authenticated;
revoke all on function public.record_deployment_record(text, text, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.claim_agent_command(text, timestamptz) to service_role;
grant execute on function public.complete_agent_command(uuid, text, jsonb) to service_role;
grant execute on function public.fail_agent_command(uuid, text, text, jsonb, boolean)
  to service_role;
grant execute on function public.record_agent_worker_heartbeat(text, text, text, jsonb)
  to service_role;
grant execute on function public.execute_agent_command_database_action(uuid) to service_role;
grant execute on function public.record_deployment_record(text, text, text, text, jsonb)
  to service_role;

comment on table public.admin_audit_events is
  'Append-only, browser-inaccessible safe summaries for Phase 8 administrator actions.';
comment on table public.agent_commands is
  'Private outbound-polled allowlisted Agent commands. Browser writes are RPC-only.';
comment on table public.runtime_settings_versions is
  'Append-only non-secret runtime settings with hard safety limits and optimistic versions.';
