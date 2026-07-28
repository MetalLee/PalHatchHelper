create function private.enforce_breeding_job_generation_limit()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.max_generations not between 1 and 5 then
    raise exception using errcode = 'P0001', message = 'INVALID_MAX_GENERATIONS';
  end if;
  return new;
end;
$$;

create trigger breeding_jobs_five_generation_limit
  before insert or update of max_generations on public.breeding_jobs
  for each row execute function private.enforce_breeding_job_generation_limit();

create or replace function private.runtime_settings_valid(p_settings jsonb)
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

  if (p_settings->>'max_generations')::integer not between 1 and 5
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

comment on function private.enforce_breeding_job_generation_limit() is
  'Keeps new and updated breeding jobs within the five-generation product limit while preserving historical rows.';
