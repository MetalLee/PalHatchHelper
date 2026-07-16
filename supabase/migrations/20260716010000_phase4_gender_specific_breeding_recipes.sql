-- Preserve the audited parent-gender orientation in full catalog recipes.

alter table public.catalog_breeding_recipes
  add column parent_a_gender text not null default 'any',
  add column parent_b_gender text not null default 'any';

alter table public.catalog_breeding_recipes
  drop constraint catalog_breeding_recipes_pkey,
  add constraint catalog_breeding_parent_a_gender_check
    check (parent_a_gender in ('any', 'female', 'male')),
  add constraint catalog_breeding_parent_b_gender_check
    check (parent_b_gender in ('any', 'female', 'male')),
  add primary key (
    version_id,
    parent_a_pal_id,
    parent_a_gender,
    parent_b_pal_id,
    parent_b_gender,
    recipe_type
  );

alter table public.breeding_recipes
  add column parent_a_gender text not null default 'any',
  add column parent_b_gender text not null default 'any',
  add column normalized_parent_a_gender text generated always as (
    case
      when parent_a_pal_id <= parent_b_pal_id then parent_a_gender
      else parent_b_gender
    end
  ) stored,
  add column normalized_parent_b_gender text generated always as (
    case
      when parent_a_pal_id <= parent_b_pal_id then parent_b_gender
      else parent_a_gender
    end
  ) stored;

alter table public.breeding_recipes
  drop constraint breeding_recipes_parent_pair_key,
  add constraint breeding_recipes_parent_a_gender_check
    check (parent_a_gender in ('any', 'female', 'male')),
  add constraint breeding_recipes_parent_b_gender_check
    check (parent_b_gender in ('any', 'female', 'male')),
  add constraint breeding_recipes_parent_pair_key unique (
    version_id,
    normalized_parent_a_pal_id,
    normalized_parent_a_gender,
    normalized_parent_b_pal_id,
    normalized_parent_b_gender,
    recipe_type
  );

create or replace function public.finalize_catalog_import(p_import_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version_id uuid;
  v_status public.game_data_import_status;
  v_manifest jsonb;
  v_expected integer;
  v_actual integer;
  v_entity public.game_data_entity_type;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  select run.version_id, run.status, run.manifest
    into v_version_id, v_status, v_manifest
    from public.game_data_import_runs as run
   where run.id = p_import_run_id
   for update;
  if v_version_id is null then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_IMPORT_NOT_FOUND';
  end if;
  if v_status = 'finalized' then
    return v_version_id;
  end if;
  if not exists (
    select 1 from public.game_data_versions as version
     where version.id = v_version_id and version.status = 'staging'
     for update
  ) then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_VERSION_NOT_STAGING';
  end if;

  foreach v_entity in array enum_range(null::public.game_data_entity_type)
  loop
    v_expected := coalesce((v_manifest->'counts'->>v_entity::text)::integer, -1);
    select coalesce(sum(batch.record_count), 0)::integer
      into v_actual
      from public.game_data_import_batches as batch
     where batch.import_run_id = p_import_run_id
       and batch.entity_type = v_entity;
    if v_expected <= 0 or v_actual <> v_expected then
      raise exception using errcode = 'P0001', message = 'GAME_DATA_IMPORT_COUNT_MISMATCH';
    end if;
  end loop;

  delete from public.catalog_pal_active_skills where version_id = v_version_id;
  delete from public.catalog_partner_skills where version_id = v_version_id;
  delete from public.catalog_breeding_recipes where version_id = v_version_id;
  delete from public.catalog_localizations where version_id = v_version_id;
  delete from public.catalog_passive_skills where version_id = v_version_id;
  delete from public.catalog_active_skills where version_id = v_version_id;
  delete from public.catalog_pals where version_id = v_version_id;

  insert into public.catalog_pals (
    version_id, pal_id, encyclopedia_no, name_key, element_types, rarity, breeding_power, metadata
  )
  select
    v_version_id,
    record->>'pal_id',
    (record->>'encyclopedia_no')::integer,
    record->>'name_key',
    array(
      select value
        from jsonb_array_elements_text(record->'element_types') as element(value)
       order by value
    ),
    (record->>'rarity')::integer,
    (record->>'breeding_power')::integer,
    coalesce(record->'metadata', '{}'::jsonb)
  from public.game_data_import_batches as batch
  cross join lateral jsonb_array_elements(batch.records) as item(record)
  where batch.import_run_id = p_import_run_id and batch.entity_type = 'pals';

  insert into public.catalog_passive_skills (
    version_id, passive_skill_id, name_key, description_key, rank, is_negative, metadata
  )
  select
    v_version_id,
    record->>'passive_skill_id',
    record->>'name_key',
    record->>'description_key',
    (record->>'rank')::integer,
    (record->>'is_negative')::boolean,
    coalesce(record->'metadata', '{}'::jsonb)
  from public.game_data_import_batches as batch
  cross join lateral jsonb_array_elements(batch.records) as item(record)
  where batch.import_run_id = p_import_run_id and batch.entity_type = 'passive_skills';

  insert into public.catalog_active_skills (
    version_id, active_skill_id, name_key, element_type, power, cooldown_seconds, metadata
  )
  select
    v_version_id,
    record->>'active_skill_id',
    record->>'name_key',
    record->>'element_type',
    (record->>'power')::integer,
    (record->>'cooldown_seconds')::numeric,
    coalesce(record->'metadata', '{}'::jsonb)
  from public.game_data_import_batches as batch
  cross join lateral jsonb_array_elements(batch.records) as item(record)
  where batch.import_run_id = p_import_run_id and batch.entity_type = 'active_skills';

  insert into public.catalog_pal_active_skills (
    version_id, pal_id, active_skill_id, learn_level, is_exclusive, metadata
  )
  select
    v_version_id,
    record->>'pal_id',
    record->>'active_skill_id',
    (record->>'learn_level')::integer,
    (record->>'is_exclusive')::boolean,
    coalesce(record->'metadata', '{}'::jsonb)
  from public.game_data_import_batches as batch
  cross join lateral jsonb_array_elements(batch.records) as item(record)
  where batch.import_run_id = p_import_run_id and batch.entity_type = 'pal_active_skills';

  insert into public.catalog_partner_skills (
    version_id, partner_skill_id, pal_id, name_key, description_key, metadata
  )
  select
    v_version_id,
    record->>'partner_skill_id',
    record->>'pal_id',
    record->>'name_key',
    record->>'description_key',
    coalesce(record->'metadata', '{}'::jsonb)
  from public.game_data_import_batches as batch
  cross join lateral jsonb_array_elements(batch.records) as item(record)
  where batch.import_run_id = p_import_run_id and batch.entity_type = 'partner_skills';

  insert into public.catalog_localizations (version_id, locale, text_key, text)
  select
    v_version_id,
    record->>'locale',
    record->>'text_key',
    record->>'text'
  from public.game_data_import_batches as batch
  cross join lateral jsonb_array_elements(batch.records) as item(record)
  where batch.import_run_id = p_import_run_id and batch.entity_type = 'localizations';

  insert into public.catalog_breeding_recipes (
    version_id,
    parent_a_pal_id,
    parent_a_gender,
    parent_b_pal_id,
    parent_b_gender,
    child_pal_id,
    recipe_type,
    metadata
  )
  select
    v_version_id,
    least(record->>'parent_a_pal_id', record->>'parent_b_pal_id'),
    case
      when record->>'parent_a_pal_id' <= record->>'parent_b_pal_id'
        then coalesce(record->>'parent_a_gender', 'any')
      else coalesce(record->>'parent_b_gender', 'any')
    end,
    greatest(record->>'parent_a_pal_id', record->>'parent_b_pal_id'),
    case
      when record->>'parent_a_pal_id' <= record->>'parent_b_pal_id'
        then coalesce(record->>'parent_b_gender', 'any')
      else coalesce(record->>'parent_a_gender', 'any')
    end,
    record->>'child_pal_id',
    (record->>'recipe_type')::public.breeding_recipe_type,
    coalesce(record->'metadata', '{}'::jsonb)
  from public.game_data_import_batches as batch
  cross join lateral jsonb_array_elements(batch.records) as item(record)
  where batch.import_run_id = p_import_run_id and batch.entity_type = 'breeding_recipes';

  if exists (
    select 1
      from (
        select name_key as text_key from public.catalog_pals where version_id = v_version_id
        union
        select name_key from public.catalog_passive_skills where version_id = v_version_id
        union
        select description_key from public.catalog_passive_skills
          where version_id = v_version_id and description_key is not null
        union
        select name_key from public.catalog_active_skills where version_id = v_version_id
        union
        select name_key from public.catalog_partner_skills where version_id = v_version_id
        union
        select description_key from public.catalog_partner_skills
          where version_id = v_version_id and description_key is not null
      ) as required_key
     where not exists (
       select 1 from public.catalog_localizations as localization
        where localization.version_id = v_version_id
          and localization.text_key = required_key.text_key
     )
  ) then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_LOCALIZATION_REFERENCE_INVALID';
  end if;

  update public.game_data_versions
     set status = 'validated',
         validated_at = now(),
         validation_report = jsonb_build_object(
           'valid', true,
           'schema_version', v_manifest->>'schema_version',
           'content_hash', v_manifest->>'content_hash',
           'counts', v_manifest->'counts',
           'errors', jsonb_build_array(),
           'warnings', jsonb_build_array()
         )
   where id = v_version_id;

  update public.game_data_import_runs
     set status = 'finalized', finalized_at = now()
   where id = p_import_run_id;
  return v_version_id;
end;
$$;

create or replace function public.publish_game_data_version(p_world_id uuid, p_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status public.game_data_status;
  v_version public.game_data_versions%rowtype;
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

  select * into v_version
    from public.game_data_versions as version
   where version.id = p_version_id
   for update;
  v_status := v_version.status;
  if v_status is null then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_VERSION_NOT_FOUND';
  end if;
  if v_status not in ('validated', 'published') then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_VERSION_NOT_VALIDATED';
  end if;
  if not exists (select 1 from public.catalog_pals where version_id = p_version_id)
    or not exists (select 1 from public.catalog_passive_skills where version_id = p_version_id)
    or not exists (select 1 from public.catalog_active_skills where version_id = p_version_id)
    or not exists (select 1 from public.catalog_pal_active_skills where version_id = p_version_id)
    or not exists (select 1 from public.catalog_partner_skills where version_id = p_version_id)
    or not exists (select 1 from public.catalog_breeding_recipes where version_id = p_version_id)
    or not exists (select 1 from public.catalog_localizations where version_id = p_version_id)
  then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_CATALOG_EMPTY';
  end if;

  if v_status = 'validated' then
    update public.game_data_versions
       set status = 'published', published_at = now(), published_by = auth.uid()
     where id = p_version_id;
  end if;

  if not exists (select 1 from public.breeding_data_versions where id = p_version_id) then
    insert into public.breeding_data_versions (
      id, source_id, external_version, content_hash, status, validation_report, imported_at
    ) values (
      p_version_id,
      null,
      v_version.game_version,
      v_version.content_hash,
      'validated',
      v_version.validation_report,
      v_version.imported_at
    );
    insert into public.breeding_recipes (
      version_id,
      parent_a_pal_id,
      parent_a_gender,
      parent_b_pal_id,
      parent_b_gender,
      child_pal_id,
      recipe_type,
      metadata
    )
    select
      version_id,
      parent_a_pal_id,
      parent_a_gender,
      parent_b_pal_id,
      parent_b_gender,
      child_pal_id,
      recipe_type,
      metadata
      from public.catalog_breeding_recipes
     where version_id = p_version_id;
    update public.breeding_data_versions
       set status = 'published', published_at = now(), published_by = auth.uid()
     where id = p_version_id;
  end if;

  update public.worlds
     set active_game_data_version_id = p_version_id,
         active_breeding_version_id = p_version_id,
         updated_at = now()
   where id = p_world_id;
  return p_version_id;
end;
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
    'parent_a_gender', current.parent_a_gender,
    'parent_b_pal_id', current.parent_b_pal_id,
    'parent_b_gender', current.parent_b_gender,
    'child_pal_id', current.child_pal_id,
    'recipe_type', current.recipe_type,
    'metadata', current.metadata
  ) order by current.parent_a_pal_id, current.parent_a_gender,
             current.parent_b_pal_id, current.parent_b_gender, current.recipe_type), '[]')
  into v_added from public.catalog_breeding_recipes as current
  where current.version_id = p_to_version_id and not exists (
    select 1 from public.catalog_breeding_recipes as previous
     where previous.version_id = p_from_version_id
       and previous.parent_a_pal_id = current.parent_a_pal_id
       and previous.parent_a_gender = current.parent_a_gender
       and previous.parent_b_pal_id = current.parent_b_pal_id
       and previous.parent_b_gender = current.parent_b_gender
       and previous.recipe_type = current.recipe_type
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'parent_a_pal_id', previous.parent_a_pal_id,
    'parent_a_gender', previous.parent_a_gender,
    'parent_b_pal_id', previous.parent_b_pal_id,
    'parent_b_gender', previous.parent_b_gender,
    'child_pal_id', previous.child_pal_id,
    'recipe_type', previous.recipe_type,
    'metadata', previous.metadata
  ) order by previous.parent_a_pal_id, previous.parent_a_gender,
             previous.parent_b_pal_id, previous.parent_b_gender, previous.recipe_type), '[]')
  into v_removed from public.catalog_breeding_recipes as previous
  where previous.version_id = p_from_version_id and not exists (
    select 1 from public.catalog_breeding_recipes as current
     where current.version_id = p_to_version_id
       and current.parent_a_pal_id = previous.parent_a_pal_id
       and current.parent_a_gender = previous.parent_a_gender
       and current.parent_b_pal_id = previous.parent_b_pal_id
       and current.parent_b_gender = previous.parent_b_gender
       and current.recipe_type = previous.recipe_type
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'parent_a_pal_id', previous.parent_a_pal_id,
    'parent_a_gender', previous.parent_a_gender,
    'parent_b_pal_id', previous.parent_b_pal_id,
    'parent_b_gender', previous.parent_b_gender,
    'recipe_type', previous.recipe_type,
    'before_child_pal_id', previous.child_pal_id,
    'after_child_pal_id', current.child_pal_id,
    'metadata_changed', previous.metadata is distinct from current.metadata
  ) order by previous.parent_a_pal_id, previous.parent_a_gender,
             previous.parent_b_pal_id, previous.parent_b_gender, previous.recipe_type)
    filter (where previous.child_pal_id is distinct from current.child_pal_id
                  or previous.metadata is distinct from current.metadata), '[]'),
    count(*) filter (where previous.child_pal_id = current.child_pal_id
                           and previous.metadata = current.metadata)::integer
  into v_changed, v_unchanged
  from public.catalog_breeding_recipes as previous
  join public.catalog_breeding_recipes as current
    on current.version_id = p_to_version_id
   and current.parent_a_pal_id = previous.parent_a_pal_id
   and current.parent_a_gender = previous.parent_a_gender
   and current.parent_b_pal_id = previous.parent_b_pal_id
   and current.parent_b_gender = previous.parent_b_gender
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

create or replace function public.configure_game_data_source(
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
    or p_source_type not in ('game_package', 'github', 'url', 'upload')
    or (p_source_type in ('github', 'url') and p_source_url !~ '^https://')
    or (p_source_type in ('game_package', 'upload') and p_source_url is not null)
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

create or replace function private.validate_breeding_source_provenance(
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
  v_provenance jsonb := nullif(
    p_manifest->'breeding_source_provenance',
    'null'::jsonb
  );
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

alter table public.game_data_sources
  drop constraint game_data_sources_location_check;
alter table public.game_data_sources
  add constraint game_data_sources_location_check check (
    (source_type in ('game_package', 'upload')
      and source_path is null and source_url is null)
    or (source_type in ('github', 'url')
      and source_path is null and source_url ~ '^https://')
  );

alter table public.catalog_passive_skills
  drop constraint catalog_passives_rank_check;

comment on column public.catalog_breeding_recipes.parent_a_gender is
  'Audited gender constraint for the canonical parent A stable ID.';
comment on column public.catalog_breeding_recipes.parent_b_gender is
  'Audited gender constraint for the canonical parent B stable ID.';
