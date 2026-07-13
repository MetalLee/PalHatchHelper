alter table public.breeding_jobs
  add column lease_token uuid;

update public.breeding_jobs
   set lease_token = gen_random_uuid()
 where status in ('processing', 'algorithm_completed', 'ai_enriching');

alter table public.breeding_jobs
  add constraint breeding_jobs_lease_token_check check (
    (
      status in ('processing', 'algorithm_completed', 'ai_enriching')
      and lease_token is not null
    )
    or (
      status not in ('processing', 'algorithm_completed', 'ai_enriching')
      and lease_token is null
    )
  );

create or replace function public.claim_breeding_job(p_worker_id text)
returns setof public.breeding_jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_worker_id is null or char_length(btrim(p_worker_id)) not between 1 and 128 then
    raise exception using errcode = 'P0001', message = 'INVALID_WORKER_ID';
  end if;

  return query
  with candidate as (
    select job.id
    from public.breeding_jobs as job
    where job.status in ('pending', 'retry_pending')
      and job.attempt_count < job.max_attempts
    order by job.created_at, job.id
    for update skip locked
    limit 1
  )
  update public.breeding_jobs as job
     set status = 'processing',
         locked_by = btrim(p_worker_id),
         lease_token = gen_random_uuid(),
         locked_at = now(),
         heartbeat_at = now(),
         attempt_count = job.attempt_count + 1,
         error_code = null,
         error_summary = null,
         updated_at = now()
    from candidate
   where job.id = candidate.id
  returning job.*;
end;
$$;

drop function public.heartbeat_breeding_job(uuid, text);

create function public.heartbeat_breeding_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated integer;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_job_id is null
    or p_worker_id is null
    or char_length(btrim(p_worker_id)) not between 1 and 128
    or p_lease_token is null
  then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_LEASE';
  end if;

  update public.breeding_jobs
     set heartbeat_at = now(),
         updated_at = now()
   where id = p_job_id
     and locked_by = btrim(p_worker_id)
     and lease_token = p_lease_token
     and status in ('processing', 'algorithm_completed', 'ai_enriching');
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception using errcode = 'P0001', message = 'JOB_LOCK_NOT_OWNED';
  end if;
  return true;
end;
$$;

drop function public.complete_breeding_job(uuid, text);

create function public.complete_breeding_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated integer;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_job_id is null
    or p_worker_id is null
    or char_length(btrim(p_worker_id)) not between 1 and 128
    or p_lease_token is null
  then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_LEASE';
  end if;

  update public.breeding_jobs
     set status = 'completed',
         locked_by = null,
         lease_token = null,
         locked_at = null,
         heartbeat_at = null,
         error_code = null,
         error_summary = null,
         completed_at = now(),
         updated_at = now()
   where id = p_job_id
     and locked_by = btrim(p_worker_id)
     and lease_token = p_lease_token
     and status in ('processing', 'algorithm_completed', 'ai_enriching');
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    if exists (
      select 1
      from public.breeding_jobs as job
      where job.id = p_job_id
        and job.status = 'completed'
    ) then
      return true;
    end if;
    raise exception using errcode = 'P0001', message = 'JOB_LOCK_NOT_OWNED';
  end if;
  return true;
end;
$$;

drop function public.fail_breeding_job(uuid, text, text, boolean, text);

create function public.fail_breeding_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_error_code text,
  p_retryable boolean,
  p_error_summary text default null
)
returns public.breeding_job_status
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status public.breeding_job_status;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_job_id is null
    or p_worker_id is null
    or char_length(btrim(p_worker_id)) not between 1 and 128
    or p_lease_token is null
    or p_error_code is null
    or char_length(btrim(p_error_code)) not between 1 and 100
    or p_error_code !~ '^[A-Z][A-Z0-9_]*$'
    or p_retryable is null
    or (p_error_summary is not null and char_length(p_error_summary) > 500)
  then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_FAILURE';
  end if;

  update public.breeding_jobs as job
     set status = case
           when p_retryable and job.attempt_count < job.max_attempts
             then 'retry_pending'::public.breeding_job_status
           else 'failed'::public.breeding_job_status
         end,
         locked_by = null,
         lease_token = null,
         locked_at = null,
         heartbeat_at = null,
         error_code = btrim(p_error_code),
         error_summary = p_error_summary,
         completed_at = case
           when p_retryable and job.attempt_count < job.max_attempts then null
           else now()
         end,
         updated_at = now()
   where job.id = p_job_id
     and job.locked_by = btrim(p_worker_id)
     and job.lease_token = p_lease_token
     and job.status in ('processing', 'algorithm_completed', 'ai_enriching')
  returning job.status into v_status;

  if v_status is null then
    raise exception using errcode = 'P0001', message = 'JOB_LOCK_NOT_OWNED';
  end if;
  return v_status;
end;
$$;

create or replace function public.release_stale_breeding_jobs(p_stale_before timestamptz)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_released integer;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_stale_before is null or p_stale_before > now() then
    raise exception using errcode = 'P0001', message = 'INVALID_STALE_BEFORE';
  end if;

  update public.breeding_jobs
     set status = case
           when attempt_count < max_attempts
             then 'retry_pending'::public.breeding_job_status
           else 'failed'::public.breeding_job_status
         end,
         locked_by = null,
         lease_token = null,
         locked_at = null,
         heartbeat_at = null,
         error_code = 'STALE_WORKER_LOCK',
         error_summary = null,
         completed_at = case when attempt_count < max_attempts then null else now() end,
         updated_at = now()
   where status in ('processing', 'algorithm_completed', 'ai_enriching')
     and heartbeat_at < p_stale_before;
  get diagnostics v_released = row_count;
  return v_released;
end;
$$;

create function public.cancel_breeding_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_error_code text default 'JOB_CANCELLED'
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated integer;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_job_id is null
    or p_worker_id is null
    or char_length(btrim(p_worker_id)) not between 1 and 128
    or p_lease_token is null
    or p_error_code is null
    or char_length(btrim(p_error_code)) not between 1 and 100
    or p_error_code !~ '^[A-Z][A-Z0-9_]*$'
  then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_CANCELLATION';
  end if;

  update public.breeding_jobs
     set status = 'cancelled',
         locked_by = null,
         lease_token = null,
         locked_at = null,
         heartbeat_at = null,
         error_code = btrim(p_error_code),
         error_summary = null,
         completed_at = now(),
         updated_at = now()
   where id = p_job_id
     and locked_by = btrim(p_worker_id)
     and lease_token = p_lease_token
     and status in ('processing', 'algorithm_completed', 'ai_enriching');
  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    if exists (
      select 1
      from public.breeding_jobs as job
      where job.id = p_job_id
        and job.status = 'cancelled'
        and job.error_code = btrim(p_error_code)
    ) then
      return true;
    end if;
    raise exception using errcode = 'P0001', message = 'JOB_LOCK_NOT_OWNED';
  end if;
  return true;
end;
$$;

create function public.release_breeding_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_error_code text default 'WORKER_SHUTDOWN'
)
returns public.breeding_job_status
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status public.breeding_job_status;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_job_id is null
    or p_worker_id is null
    or char_length(btrim(p_worker_id)) not between 1 and 128
    or p_lease_token is null
    or p_error_code is null
    or char_length(btrim(p_error_code)) not between 1 and 100
    or p_error_code !~ '^[A-Z][A-Z0-9_]*$'
  then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_RELEASE';
  end if;

  update public.breeding_jobs as job
     set status = 'retry_pending',
         locked_by = null,
         lease_token = null,
         locked_at = null,
         heartbeat_at = null,
         attempt_count = greatest(job.attempt_count - 1, 0),
         error_code = btrim(p_error_code),
         error_summary = null,
         completed_at = null,
         updated_at = now()
   where job.id = p_job_id
     and job.locked_by = btrim(p_worker_id)
     and job.lease_token = p_lease_token
     and job.status in ('processing', 'algorithm_completed', 'ai_enriching')
  returning job.status into v_status;

  if v_status is null then
    raise exception using errcode = 'P0001', message = 'JOB_LOCK_NOT_OWNED';
  end if;
  return v_status;
end;
$$;

revoke all on function public.claim_breeding_job(text)
  from public, anon, authenticated;
revoke all on function public.heartbeat_breeding_job(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.complete_breeding_job(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.fail_breeding_job(uuid, text, uuid, text, boolean, text)
  from public, anon, authenticated;
revoke all on function public.release_stale_breeding_jobs(timestamptz)
  from public, anon, authenticated;
revoke all on function public.cancel_breeding_job(uuid, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.release_breeding_job(uuid, text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.claim_breeding_job(text) to service_role;
grant execute on function public.heartbeat_breeding_job(uuid, text, uuid) to service_role;
grant execute on function public.complete_breeding_job(uuid, text, uuid) to service_role;
grant execute on function public.fail_breeding_job(uuid, text, uuid, text, boolean, text)
  to service_role;
grant execute on function public.release_stale_breeding_jobs(timestamptz) to service_role;
grant execute on function public.cancel_breeding_job(uuid, text, uuid, text) to service_role;
grant execute on function public.release_breeding_job(uuid, text, uuid, text) to service_role;

comment on function public.claim_breeding_job(text) is
  'Service Role only. Atomically leases one eligible job with a fresh fencing token.';
comment on function public.heartbeat_breeding_job(uuid, text, uuid) is
  'Service Role only. Renews only the active lease identified by its fencing token.';
comment on function public.complete_breeding_job(uuid, text, uuid) is
  'Service Role only. Completes only the active lease identified by its fencing token.';
comment on function public.fail_breeding_job(uuid, text, uuid, text, boolean, text) is
  'Service Role only. Fails only the active lease identified by its fencing token.';
comment on function public.release_stale_breeding_jobs(timestamptz) is
  'Service Role only. Recovers expired leases and clears their fencing tokens.';
comment on function public.cancel_breeding_job(uuid, text, uuid, text) is
  'Service Role only. Cancels only the active lease identified by its fencing token.';
comment on function public.release_breeding_job(uuid, text, uuid, text) is
  'Service Role only. Gracefully releases only the active lease identified by its fencing token.';
