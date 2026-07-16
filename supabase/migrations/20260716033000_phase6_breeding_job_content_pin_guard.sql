create function public.enforce_breeding_job_content_pin()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_version_id uuid := coalesce(new.game_data_version_id, new.breeding_data_version_id);
  v_expected_content_hash text;
begin
  if v_version_id is null then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_VERSION_REQUIRED';
  end if;
  if new.game_data_version_id is not null
    and new.breeding_data_version_id is not null
    and new.game_data_version_id is distinct from new.breeding_data_version_id
  then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_JOB_VERSION_MISMATCH';
  end if;

  select version.content_hash
    into v_expected_content_hash
    from public.game_data_versions as version
   where version.id = v_version_id;
  if v_expected_content_hash is null then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_VERSION_NOT_FOUND';
  end if;

  new.game_data_version_id := v_version_id;
  if new.game_data_content_hash is null then
    new.game_data_content_hash := v_expected_content_hash;
  elsif new.game_data_content_hash is distinct from v_expected_content_hash then
    raise exception using errcode = 'P0001', message = 'BREEDING_GAME_DATA_CONTENT_MISMATCH';
  end if;
  return new;
end;
$$;

create trigger breeding_jobs_content_pin_guard
  before insert or update of breeding_data_version_id, game_data_version_id,
    game_data_content_hash
  on public.breeding_jobs
  for each row execute function public.enforce_breeding_job_content_pin();

revoke all on function public.enforce_breeding_job_content_pin() from public;
revoke all on function public.enforce_breeding_job_content_pin() from anon;
revoke all on function public.enforce_breeding_job_content_pin() from authenticated;
