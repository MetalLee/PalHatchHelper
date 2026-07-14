-- Close the Phase 4A/4B review blockers without rewriting applied migrations.

create function public.is_stable_id_array(p_values text[])
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select array_position(p_values, null) is null
    and cardinality(p_values) = (
      select count(distinct value)::integer from unnest(p_values) as value
    )
    and not exists (
      select 1 from unnest(p_values) as value
       where char_length(value) not between 1 and 120
          or value !~ '^[a-z0-9][a-z0-9._-]*$'
    );
$$;

alter table public.breeding_jobs
  add constraint breeding_jobs_target_stable_id_check
  check (
    char_length(target_pal_id) between 1 and 120
    and target_pal_id ~ '^[a-z0-9][a-z0-9._-]*$'
  ) not valid;
alter table public.breeding_jobs
  add constraint breeding_jobs_passives_stable_id_check
  check (public.is_stable_id_array(desired_passive_ids)) not valid;
alter table public.breeding_jobs validate constraint breeding_jobs_target_stable_id_check;
alter table public.breeding_jobs validate constraint breeding_jobs_passives_stable_id_check;

-- Legacy breeding versions used a non-SemVer marker that the shared
-- GameDataVersion contract correctly rejects. Preserve its meaning with a
-- valid compatibility version and ensure future legacy mirrors use it too.
update public.game_data_versions
   set schema_version = '0.0.0'
 where schema_version = '0.legacy.0';

create or replace function public.sync_legacy_breeding_version_to_game_data()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  insert into public.game_data_versions (
    id, source_id, game_version, package_hash, content_hash, schema_version,
    extractor_name, extractor_version, status, manifest, validation_report,
    imported_at, validated_at, published_at, published_by
  ) values (
    new.id, new.source_id, new.external_version, new.content_hash, new.content_hash,
    '0.0.0', 'legacy-breeding-data', 'phase2',
    new.status::text::public.game_data_status,
    jsonb_build_object('legacy_breeding_version', true), new.validation_report,
    new.imported_at,
    case when new.status in ('validated', 'published') then new.imported_at end,
    new.published_at, new.published_by
  )
  on conflict (id) do update
    set status = excluded.status,
        validation_report = excluded.validation_report,
        validated_at = excluded.validated_at,
        published_at = excluded.published_at,
        published_by = excluded.published_by
  where game_data_versions.status <> 'published';
  return new;
end;
$$;

update public.scoring_profiles set is_active = false where is_active;

insert into public.scoring_profiles (
  id, version, optimization_mode, algorithm_version, weights, is_active, created_at
) values
  (
    '52000000-0000-4000-8000-000000000011',
    'balanced-v2',
    'balanced',
    'phase4b-deterministic-v1',
    '{"route_length":0.2,"inventory_coverage":0.15,"passive_concentration":0.18,"borrowing":0.1,"intermediate_cost":0.1,"attempt_cost":0.17,"stability":0.1}',
    true,
    '2026-07-15T00:00:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000012',
    'fastest-v2',
    'fastest',
    'phase4b-deterministic-v1',
    '{"route_length":0.45,"inventory_coverage":0.1,"passive_concentration":0.05,"borrowing":0.02,"intermediate_cost":0.12,"attempt_cost":0.22,"stability":0.04}',
    true,
    '2026-07-15T00:00:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000013',
    'highest-success-v2',
    'highest_success',
    'phase4b-deterministic-v1',
    '{"route_length":0.05,"inventory_coverage":0.08,"passive_concentration":0.3,"borrowing":0.02,"intermediate_cost":0.15,"attempt_cost":0.3,"stability":0.1}',
    true,
    '2026-07-15T00:00:00Z'
  ),
  (
    '52000000-0000-4000-8000-000000000014',
    'least-borrowing-v2',
    'least_borrowing',
    'phase4b-deterministic-v1',
    '{"route_length":0.05,"inventory_coverage":0.05,"passive_concentration":0.08,"borrowing":0.6,"intermediate_cost":0.07,"attempt_cost":0.08,"stability":0.07}',
    true,
    '2026-07-15T00:00:00Z'
  )
on conflict (version) do nothing;

do $$
begin
  if (select count(*) from public.scoring_profiles
       where is_active
         and algorithm_version = 'phase4b-deterministic-v1'
         and version in (
           'balanced-v2', 'fastest-v2', 'highest-success-v2', 'least-borrowing-v2'
         )) <> 4
  then
    raise exception using errcode = 'P0001', message = 'BREEDING_SCORING_PROFILE_REGISTRY_MISMATCH';
  end if;
end;
$$;

create function public.configure_game_data_source(
  p_source_id uuid,
  p_name text,
  p_source_type public.game_data_source_type,
  p_source_url text default null,
  p_enabled boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not (public.is_admin() or private.is_service_role()) then
    raise exception using errcode = 'P0001', message = 'ADMIN_REQUIRED';
  end if;
  if p_source_id is null
    or p_name is null
    or char_length(btrim(p_name)) not between 1 and 120
    or p_source_type not in ('github', 'url', 'upload')
    or (p_source_type in ('github', 'url') and p_source_url !~ '^https://')
    or (p_source_type = 'upload' and p_source_url is not null)
  then
    raise exception using errcode = 'P0001', message = 'BREEDING_SOURCE_INVALID';
  end if;

  insert into public.game_data_sources (
    id, name, source_type, source_path, source_url, enabled
  ) values (
    p_source_id, btrim(p_name), p_source_type, null, p_source_url, p_enabled
  )
  on conflict (id) do update
    set name = excluded.name,
        source_type = excluded.source_type,
        source_path = null,
        source_url = excluded.source_url,
        enabled = excluded.enabled;
  return p_source_id;
end;
$$;

create function public.get_game_data_source_for_agent(p_source_id uuid)
returns table (
  id uuid,
  name text,
  source_type public.game_data_source_type,
  source_path text,
  source_url text,
  enabled boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  return query
  select source.id, source.name, source.source_type, source.source_path,
         source.source_url, source.enabled
    from public.game_data_sources as source
   where source.id = p_source_id;
end;
$$;

create function public.get_active_scoring_profiles_for_agent()
returns table (
  version text,
  optimization_mode public.optimization_mode,
  algorithm_version text,
  weights jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  return query
  select profile.version, profile.optimization_mode, profile.algorithm_version, profile.weights
    from public.scoring_profiles as profile
   where profile.is_active
   order by profile.optimization_mode;
end;
$$;

create function public.get_breeding_inventory_for_agent(p_job_id uuid)
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
      'share_enabled', coalesce(preference.share_enabled, true),
      'owner_resolved', item.owner_player_id is not null,
      'guild_resolved', item.guild_id is not null,
      'present_in_snapshot', true,
      'breeding_enabled', coalesce((item.raw_metadata->>'breeding_enabled')::boolean, true),
      'plan_locked', false
    ) order by item.pal_instance_uid
  ), '[]'::jsonb) into v_items
    from public.pal_snapshot_items as item
    left join public.pal_share_preferences as preference
      on preference.world_id = item.world_id
     and preference.pal_instance_uid = item.pal_instance_uid
   where item.snapshot_id = v_job.inventory_snapshot_id
     and item.world_id = v_job.world_id;

  return jsonb_build_object(
    'snapshot_id', v_job.inventory_snapshot_id,
    'world_id', v_job.world_id,
    'items', v_items
  );
end;
$$;

create function private.validate_breeding_source_provenance(
  p_source_id uuid,
  p_manifest jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provenance jsonb := p_manifest->'breeding_source_provenance';
begin
  if p_manifest->>'extractor_name' = 'breeding-source-transformer'
    and (v_provenance is null or jsonb_typeof(v_provenance) <> 'object')
  then
    raise exception using errcode = 'P0001', message = 'BREEDING_SOURCE_PROVENANCE_REQUIRED';
  end if;
  if v_provenance is null then return; end if;
  if p_source_id is null
    or v_provenance->>'source_id' <> p_source_id::text
    or v_provenance->>'base_content_hash' !~ '^[0-9a-f]{64}$'
    or not exists (
      select 1 from public.game_data_sources as source
       where source.id = p_source_id
         and source.enabled
         and source.name = v_provenance->>'source_name'
         and source.source_type::text = v_provenance->>'source_type'
    )
  then
    raise exception using errcode = 'P0001', message = 'BREEDING_SOURCE_PROVENANCE_MISMATCH';
  end if;
end;
$$;

create or replace function public.begin_game_data_import(
  p_source_id uuid,
  p_manifest jsonb,
  p_artifact_bucket text,
  p_artifact_path text
)
returns table (version_id uuid, import_run_id uuid, reused boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version_id uuid;
  v_import_run_id uuid;
  v_status public.game_data_status;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_manifest is null
    or jsonb_typeof(p_manifest) <> 'object'
    or p_manifest->>'schema_version' is null
    or p_manifest->>'content_hash' !~ '^[0-9a-f]{64}$'
    or p_manifest->>'package_hash' !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_manifest->'counts') <> 'object'
    or jsonb_typeof(p_manifest->'files') <> 'array'
    or p_artifact_bucket is null
    or char_length(btrim(p_artifact_bucket)) not between 1 and 120
    or p_artifact_path is null
    or char_length(btrim(p_artifact_path)) not between 1 and 500
  then
    raise exception using errcode = 'P0001', message = 'INVALID_GAME_DATA_MANIFEST';
  end if;
  if p_source_id is not null and not exists (
    select 1 from public.game_data_sources where id = p_source_id and enabled
  ) then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_SOURCE_NOT_FOUND';
  end if;
  perform private.validate_breeding_source_provenance(p_source_id, p_manifest);

  select version.id, version.status into v_version_id, v_status
    from public.game_data_versions as version
   where version.content_hash = p_manifest->>'content_hash'
   for update;
  if v_version_id is null then
    insert into public.game_data_versions (
      source_id, game_build_id, game_version, package_hash, content_hash,
      schema_version, extractor_name, extractor_version, artifact_bucket,
      artifact_path, status, manifest, validation_report
    ) values (
      p_source_id, nullif(p_manifest->>'game_build_id', ''),
      nullif(p_manifest->>'game_version', ''), p_manifest->>'package_hash',
      p_manifest->>'content_hash', p_manifest->>'schema_version',
      p_manifest->>'extractor_name', p_manifest->>'extractor_version',
      btrim(p_artifact_bucket), btrim(p_artifact_path), 'staging', p_manifest,
      jsonb_build_object('valid', false)
    ) returning id into v_version_id;
    v_status := 'staging';
    reused := false;
  else
    if v_status = 'rejected' then
      raise exception using errcode = 'P0001', message = 'GAME_DATA_VERSION_REJECTED';
    end if;
    if exists (
      select 1 from public.game_data_versions
       where id = v_version_id and source_id is distinct from p_source_id
    ) then
      raise exception using errcode = 'P0001', message = 'BREEDING_SOURCE_PROVENANCE_MISMATCH';
    end if;
    reused := true;
  end if;

  select run.id into v_import_run_id
    from public.game_data_import_runs as run
   where run.version_id = v_version_id
   order by run.started_at desc limit 1;
  if v_import_run_id is null then
    insert into public.game_data_import_runs (version_id, status, manifest, finalized_at)
    values (
      v_version_id,
      case when v_status in ('validated', 'published')
        then 'finalized'::public.game_data_import_status
        else 'staging'::public.game_data_import_status end,
      p_manifest,
      case when v_status in ('validated', 'published') then now() end
    ) returning id into v_import_run_id;
  end if;
  version_id := v_version_id;
  import_run_id := v_import_run_id;
  return next;
end;
$$;

create function private.breeding_base_catalog_matches(
  p_from_version_id uuid,
  p_to_version_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    (select coalesce(jsonb_agg(to_jsonb(value) - 'version_id' order by value.pal_id), '[]')
       from public.catalog_pals as value where value.version_id = p_from_version_id)
    =
    (select coalesce(jsonb_agg(to_jsonb(value) - 'version_id' order by value.pal_id), '[]')
       from public.catalog_pals as value where value.version_id = p_to_version_id)
    and
    (select coalesce(jsonb_agg(to_jsonb(value) - 'version_id' order by value.passive_skill_id), '[]')
       from public.catalog_passive_skills as value where value.version_id = p_from_version_id)
    =
    (select coalesce(jsonb_agg(to_jsonb(value) - 'version_id' order by value.passive_skill_id), '[]')
       from public.catalog_passive_skills as value where value.version_id = p_to_version_id)
    and
    (select coalesce(jsonb_agg(to_jsonb(value) - 'version_id' order by value.active_skill_id), '[]')
       from public.catalog_active_skills as value where value.version_id = p_from_version_id)
    =
    (select coalesce(jsonb_agg(to_jsonb(value) - 'version_id' order by value.active_skill_id), '[]')
       from public.catalog_active_skills as value where value.version_id = p_to_version_id)
    and
    (select coalesce(jsonb_agg(to_jsonb(value) - 'version_id' order by value.pal_id, value.active_skill_id, value.learn_level), '[]')
       from public.catalog_pal_active_skills as value where value.version_id = p_from_version_id)
    =
    (select coalesce(jsonb_agg(to_jsonb(value) - 'version_id' order by value.pal_id, value.active_skill_id, value.learn_level), '[]')
       from public.catalog_pal_active_skills as value where value.version_id = p_to_version_id)
    and
    (select coalesce(jsonb_agg(to_jsonb(value) - 'version_id' order by value.partner_skill_id), '[]')
       from public.catalog_partner_skills as value where value.version_id = p_from_version_id)
    =
    (select coalesce(jsonb_agg(to_jsonb(value) - 'version_id' order by value.partner_skill_id), '[]')
       from public.catalog_partner_skills as value where value.version_id = p_to_version_id)
    and
    (select coalesce(jsonb_agg(to_jsonb(value) - 'version_id' order by value.locale, value.text_key), '[]')
       from public.catalog_localizations as value where value.version_id = p_from_version_id)
    =
    (select coalesce(jsonb_agg(to_jsonb(value) - 'version_id' order by value.locale, value.text_key), '[]')
       from public.catalog_localizations as value where value.version_id = p_to_version_id);
$$;

create or replace function public.get_breeding_data_diff(
  p_from_version_id uuid,
  p_to_version_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_from_hash text;
  v_to_hash text;
  v_added jsonb;
  v_removed jsonb;
  v_changed jsonb;
  v_unchanged integer;
begin
  if not (public.is_admin() or private.is_service_role()) then
    raise exception using errcode = 'P0001', message = 'ADMIN_REQUIRED';
  end if;
  select content_hash into v_from_hash from public.game_data_versions
   where id = p_from_version_id and status in ('validated', 'published');
  select content_hash into v_to_hash from public.game_data_versions
   where id = p_to_version_id and status in ('validated', 'published');
  if v_from_hash is null or v_to_hash is null then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_VERSION_NOT_VALIDATED';
  end if;
  if not private.breeding_base_catalog_matches(p_from_version_id, p_to_version_id) then
    raise exception using errcode = 'P0001', message = 'BREEDING_BASE_CATALOG_MISMATCH';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'parent_a_pal_id', current.parent_a_pal_id,
    'parent_b_pal_id', current.parent_b_pal_id,
    'child_pal_id', current.child_pal_id,
    'recipe_type', current.recipe_type,
    'metadata', current.metadata
  ) order by current.parent_a_pal_id, current.parent_b_pal_id, current.recipe_type), '[]')
  into v_added from public.catalog_breeding_recipes as current
  where current.version_id = p_to_version_id and not exists (
    select 1 from public.catalog_breeding_recipes as previous
     where previous.version_id = p_from_version_id
       and previous.parent_a_pal_id = current.parent_a_pal_id
       and previous.parent_b_pal_id = current.parent_b_pal_id
       and previous.recipe_type = current.recipe_type
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'parent_a_pal_id', previous.parent_a_pal_id,
    'parent_b_pal_id', previous.parent_b_pal_id,
    'child_pal_id', previous.child_pal_id,
    'recipe_type', previous.recipe_type,
    'metadata', previous.metadata
  ) order by previous.parent_a_pal_id, previous.parent_b_pal_id, previous.recipe_type), '[]')
  into v_removed from public.catalog_breeding_recipes as previous
  where previous.version_id = p_from_version_id and not exists (
    select 1 from public.catalog_breeding_recipes as current
     where current.version_id = p_to_version_id
       and current.parent_a_pal_id = previous.parent_a_pal_id
       and current.parent_b_pal_id = previous.parent_b_pal_id
       and current.recipe_type = previous.recipe_type
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'parent_a_pal_id', previous.parent_a_pal_id,
    'parent_b_pal_id', previous.parent_b_pal_id,
    'recipe_type', previous.recipe_type,
    'before_child_pal_id', previous.child_pal_id,
    'after_child_pal_id', current.child_pal_id,
    'metadata_changed', previous.metadata is distinct from current.metadata
  ) order by previous.parent_a_pal_id, previous.parent_b_pal_id, previous.recipe_type)
    filter (where previous.child_pal_id is distinct from current.child_pal_id
                  or previous.metadata is distinct from current.metadata), '[]'),
    count(*) filter (where previous.child_pal_id = current.child_pal_id
                           and previous.metadata = current.metadata)::integer
  into v_changed, v_unchanged
  from public.catalog_breeding_recipes as previous
  join public.catalog_breeding_recipes as current
    on current.version_id = p_to_version_id
   and current.parent_a_pal_id = previous.parent_a_pal_id
   and current.parent_b_pal_id = previous.parent_b_pal_id
   and current.recipe_type = previous.recipe_type
  where previous.version_id = p_from_version_id;

  return jsonb_build_object(
    'schema_version', '1.0.0', 'from_content_hash', v_from_hash,
    'to_content_hash', v_to_hash, 'added', v_added, 'removed', v_removed,
    'changed', v_changed, 'counts', jsonb_build_object(
      'added', jsonb_array_length(v_added), 'removed', jsonb_array_length(v_removed),
      'changed', jsonb_array_length(v_changed), 'unchanged', v_unchanged
    )
  );
end;
$$;

create function private.validate_breeding_job_catalog_input()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then return new; end if;
  if new.target_pal_id !~ '^[a-z0-9][a-z0-9._-]*$'
    or char_length(new.target_pal_id) not between 1 and 120
  then
    raise exception using errcode = 'P0001', message = 'INVALID_TARGET_PAL';
  end if;
  if not public.is_stable_id_array(new.desired_passive_ids) then
    raise exception using errcode = 'P0001', message = 'INVALID_DESIRED_PASSIVES';
  end if;
  if not exists (
    select 1 from public.catalog_pals
     where version_id = new.game_data_version_id and pal_id = new.target_pal_id
  ) then
    raise exception using errcode = 'P0001', message = 'TARGET_PAL_NOT_IN_GAME_DATA_VERSION';
  end if;
  if exists (
    select 1 from unnest(new.desired_passive_ids) as passive_id
     where not exists (
       select 1 from public.catalog_passive_skills
        where version_id = new.game_data_version_id
          and catalog_passive_skills.passive_skill_id = passive_id
     )
  ) then
    raise exception using errcode = 'P0001', message = 'DESIRED_PASSIVE_NOT_IN_GAME_DATA_VERSION';
  end if;
  return new;
end;
$$;

create trigger breeding_jobs_validate_catalog_input
  before insert on public.breeding_jobs
  for each row execute function private.validate_breeding_job_catalog_input();

create function private.validate_breeding_candidate_publish()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_base_hash text;
  v_provenance jsonb;
begin
  if new.active_game_data_version_id is not distinct from old.active_game_data_version_id then
    return new;
  end if;
  -- A rollback selects a previously published, complete catalog version. It must
  -- not be interpreted as publishing a breeding-only candidate onto the current
  -- catalog base.
  if current_setting('app.game_data_rollback', true) = 'true' then
    return new;
  end if;
  select manifest->'breeding_source_provenance' into v_provenance
    from public.game_data_versions where id = new.active_game_data_version_id;
  if v_provenance is null then return new; end if;
  select content_hash into v_base_hash from public.game_data_versions
   where id = old.active_game_data_version_id;
  if v_base_hash is null
    or v_provenance->>'base_content_hash' <> v_base_hash
    or not private.breeding_base_catalog_matches(
      old.active_game_data_version_id,
      new.active_game_data_version_id
    )
  then
    raise exception using errcode = 'P0001', message = 'BREEDING_BASE_CATALOG_MISMATCH';
  end if;
  return new;
end;
$$;

create trigger worlds_validate_breeding_candidate_publish
  before update of active_game_data_version_id on public.worlds
  for each row execute function private.validate_breeding_candidate_publish();

create or replace function public.rollback_game_data_version(
  p_world_id uuid,
  p_version_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not (public.is_admin() or private.is_service_role()) then
    raise exception using errcode = 'P0001', message = 'ADMIN_REQUIRED';
  end if;
  if p_world_id is null or p_version_id is null then
    raise exception using errcode = 'P0001', message = 'INVALID_GAME_DATA_VERSION';
  end if;
  if not exists (select 1 from public.worlds where id = p_world_id) then
    raise exception using errcode = 'P0001', message = 'WORLD_NOT_FOUND';
  end if;
  if not exists (
    select 1 from public.game_data_versions
     where id = p_version_id and status = 'published'
  ) then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_VERSION_NOT_PUBLISHED';
  end if;
  if not exists (
    select 1 from public.breeding_data_versions
     where id = p_version_id and status = 'published'
  ) then
    raise exception using errcode = 'P0001', message = 'BREEDING_VERSION_NOT_FOUND';
  end if;

  perform set_config('app.game_data_rollback', 'true', true);
  update public.worlds
     set active_game_data_version_id = p_version_id,
         active_breeding_version_id = p_version_id,
         updated_at = now()
   where id = p_world_id;
  perform set_config('app.game_data_rollback', 'false', true);
  return p_version_id;
end;
$$;

revoke all on function public.is_stable_id_array(text[]) from public, anon, authenticated;
grant execute on function public.is_stable_id_array(text[]) to service_role;
revoke all on function public.configure_game_data_source(
  uuid, text, public.game_data_source_type, text, boolean
) from public, anon;
grant execute on function public.configure_game_data_source(
  uuid, text, public.game_data_source_type, text, boolean
) to authenticated, service_role;
revoke all on function public.get_game_data_source_for_agent(uuid) from public, anon, authenticated;
grant execute on function public.get_game_data_source_for_agent(uuid) to service_role;
revoke all on function public.get_active_scoring_profiles_for_agent() from public, anon, authenticated;
grant execute on function public.get_active_scoring_profiles_for_agent() to service_role;
revoke all on function public.get_breeding_inventory_for_agent(uuid) from public, anon, authenticated;
grant execute on function public.get_breeding_inventory_for_agent(uuid) to service_role;

comment on function public.configure_game_data_source(
  uuid, text, public.game_data_source_type, text, boolean
) is 'Admin/service-role audited configuration boundary for disabled-by-default breeding sources.';
comment on function public.get_active_scoring_profiles_for_agent() is
  'Service-only startup registry used to fail closed on engine/database scoring drift.';
comment on function public.get_breeding_inventory_for_agent(uuid) is
  'Service-only exact immutable inventory envelope for one version-fixed breeding job.';
