create type public.game_data_source_type as enum ('game_package', 'github', 'url', 'upload');
create type public.game_data_status as enum (
  'extracting',
  'staging',
  'validated',
  'published',
  'rejected'
);
create type public.game_data_entity_type as enum (
  'pals',
  'passive_skills',
  'active_skills',
  'pal_active_skills',
  'partner_skills',
  'breeding_recipes',
  'localizations'
);
create type public.game_data_import_status as enum ('staging', 'finalized');

create table public.game_data_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  source_type public.game_data_source_type not null,
  source_path text,
  source_url text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint game_data_sources_name_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint game_data_sources_location_check check (
    (source_type = 'game_package' and source_path is not null and source_url is null)
    or (source_type in ('github', 'url') and source_path is null and source_url ~ '^https://')
    or (source_type = 'upload' and source_path is null and source_url is null)
  ),
  constraint game_data_sources_path_check
    check (source_path is null or char_length(source_path) between 1 and 1000),
  constraint game_data_sources_url_check
    check (source_url is null or char_length(source_url) between 1 and 1000)
);

create table public.game_data_versions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.game_data_sources(id) on delete restrict,
  game_build_id text,
  game_version text,
  package_hash text not null,
  content_hash text not null unique,
  schema_version text not null,
  extractor_name text not null,
  extractor_version text not null,
  artifact_bucket text,
  artifact_path text,
  status public.game_data_status not null default 'staging',
  manifest jsonb not null default '{}'::jsonb,
  validation_report jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  validated_at timestamptz,
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete restrict,
  constraint game_data_versions_package_hash_check check (package_hash ~ '^[0-9a-f]{64}$'),
  constraint game_data_versions_content_hash_check check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint game_data_versions_schema_check
    check (char_length(btrim(schema_version)) between 1 and 40),
  constraint game_data_versions_extractor_check check (
    char_length(btrim(extractor_name)) between 1 and 120
    and char_length(btrim(extractor_version)) between 1 and 120
  ),
  constraint game_data_versions_manifest_check check (jsonb_typeof(manifest) = 'object'),
  constraint game_data_versions_report_check check (jsonb_typeof(validation_report) = 'object'),
  constraint game_data_versions_validation_check check (
    (status in ('validated', 'published') and validated_at is not null)
    or (status not in ('validated', 'published') and validated_at is null)
  ),
  constraint game_data_versions_publication_check check (
    (status = 'published' and published_at is not null)
    or (status <> 'published' and published_at is null and published_by is null)
  )
);

create index game_data_versions_source_imported_idx
  on public.game_data_versions(source_id, imported_at desc);
create index game_data_versions_status_imported_idx
  on public.game_data_versions(status, imported_at desc);

alter table public.worlds
  add column active_game_data_version_id uuid
  references public.game_data_versions(id) on delete restrict;

alter table public.breeding_jobs
  add column game_data_version_id uuid
  references public.game_data_versions(id) on delete restrict;

insert into public.game_data_sources (
  id, name, source_type, source_url, enabled, created_at
)
select
  source.id,
  source.name,
  source.source_type::text::public.game_data_source_type,
  source.source_url,
  source.enabled,
  source.created_at
from public.breeding_data_sources as source
on conflict (id) do nothing;

insert into public.game_data_versions (
  id,
  source_id,
  game_version,
  package_hash,
  content_hash,
  schema_version,
  extractor_name,
  extractor_version,
  status,
  manifest,
  validation_report,
  imported_at,
  validated_at,
  published_at,
  published_by
)
select
  version.id,
  version.source_id,
  version.external_version,
  version.content_hash,
  version.content_hash,
  '0.legacy.0',
  'legacy-breeding-data',
  'phase2',
  version.status::text::public.game_data_status,
  jsonb_build_object('legacy_breeding_version', true),
  version.validation_report,
  version.imported_at,
  case when version.status in ('validated', 'published') then version.imported_at end,
  version.published_at,
  version.published_by
from public.breeding_data_versions as version
on conflict (id) do nothing;

update public.worlds
   set active_game_data_version_id = active_breeding_version_id
 where active_game_data_version_id is null
   and active_breeding_version_id is not null;

update public.breeding_jobs
   set game_data_version_id = breeding_data_version_id
 where game_data_version_id is null;

do $$
begin
  if exists (
    select 1 from public.worlds
     where active_breeding_version_id is not null
       and active_game_data_version_id is distinct from active_breeding_version_id
  ) then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_WORLD_BACKFILL_MISMATCH';
  end if;
  if exists (
    select 1 from public.breeding_jobs
     where breeding_data_version_id is not null
       and game_data_version_id is distinct from breeding_data_version_id
  ) then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_JOB_BACKFILL_MISMATCH';
  end if;
end;
$$;

alter table public.breeding_jobs alter column game_data_version_id set not null;

create function public.sync_legacy_breeding_source_to_game_data()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  insert into public.game_data_sources (
    id, name, source_type, source_url, enabled, created_at
  ) values (
    new.id,
    new.name,
    new.source_type::text::public.game_data_source_type,
    new.source_url,
    new.enabled,
    new.created_at
  )
  on conflict (id) do update
    set name = excluded.name,
        source_url = excluded.source_url,
        enabled = excluded.enabled;
  return new;
end;
$$;

create trigger breeding_sources_sync_game_data
  after insert or update on public.breeding_data_sources
  for each row execute function public.sync_legacy_breeding_source_to_game_data();

create function public.sync_legacy_breeding_version_to_game_data()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  insert into public.game_data_versions (
    id,
    source_id,
    game_version,
    package_hash,
    content_hash,
    schema_version,
    extractor_name,
    extractor_version,
    status,
    manifest,
    validation_report,
    imported_at,
    validated_at,
    published_at,
    published_by
  ) values (
    new.id,
    new.source_id,
    new.external_version,
    new.content_hash,
    new.content_hash,
    '0.legacy.0',
    'legacy-breeding-data',
    'phase2',
    new.status::text::public.game_data_status,
    jsonb_build_object('legacy_breeding_version', true),
    new.validation_report,
    new.imported_at,
    case when new.status in ('validated', 'published') then new.imported_at end,
    new.published_at,
    new.published_by
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

create trigger breeding_versions_sync_game_data
  after insert or update on public.breeding_data_versions
  for each row execute function public.sync_legacy_breeding_version_to_game_data();

create function public.sync_legacy_world_game_data_reference()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.active_game_data_version_id is null and new.active_breeding_version_id is not null then
    new.active_game_data_version_id := new.active_breeding_version_id;
  end if;
  return new;
end;
$$;

create trigger worlds_sync_legacy_game_data
  before insert or update of active_breeding_version_id, active_game_data_version_id
  on public.worlds
  for each row execute function public.sync_legacy_world_game_data_reference();

create function public.sync_legacy_job_game_data_reference()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.game_data_version_id is null then
    new.game_data_version_id := new.breeding_data_version_id;
  end if;
  return new;
end;
$$;

create trigger breeding_jobs_sync_legacy_game_data
  before insert or update of breeding_data_version_id, game_data_version_id
  on public.breeding_jobs
  for each row execute function public.sync_legacy_job_game_data_reference();

create table public.catalog_pals (
  version_id uuid not null references public.game_data_versions(id) on delete restrict,
  pal_id text not null,
  encyclopedia_no integer,
  name_key text not null,
  element_types text[] not null,
  rarity integer not null,
  breeding_power integer not null,
  metadata jsonb not null default '{}'::jsonb,
  primary key (version_id, pal_id),
  constraint catalog_pals_id_check check (pal_id ~ '^[a-z0-9][a-z0-9._-]*$'),
  constraint catalog_pals_encyclopedia_check check (encyclopedia_no is null or encyclopedia_no > 0),
  constraint catalog_pals_element_check check (cardinality(element_types) > 0),
  constraint catalog_pals_values_check check (rarity >= 0 and breeding_power >= 0),
  constraint catalog_pals_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index catalog_pals_encyclopedia_idx
  on public.catalog_pals(version_id, encyclopedia_no);
create index catalog_pals_elements_idx
  on public.catalog_pals using gin(element_types);

create table public.catalog_passive_skills (
  version_id uuid not null references public.game_data_versions(id) on delete restrict,
  passive_skill_id text not null,
  name_key text not null,
  description_key text,
  rank integer not null,
  is_negative boolean not null,
  metadata jsonb not null default '{}'::jsonb,
  primary key (version_id, passive_skill_id),
  constraint catalog_passives_id_check
    check (passive_skill_id ~ '^[a-z0-9][a-z0-9._-]*$'),
  constraint catalog_passives_rank_check check (rank >= 0),
  constraint catalog_passives_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index catalog_passive_rank_idx
  on public.catalog_passive_skills(version_id, rank, passive_skill_id);

create table public.catalog_active_skills (
  version_id uuid not null references public.game_data_versions(id) on delete restrict,
  active_skill_id text not null,
  name_key text not null,
  element_type text not null,
  power integer,
  cooldown_seconds numeric,
  metadata jsonb not null default '{}'::jsonb,
  primary key (version_id, active_skill_id),
  constraint catalog_active_id_check
    check (active_skill_id ~ '^[a-z0-9][a-z0-9._-]*$'),
  constraint catalog_active_values_check check (
    (power is null or power >= 0) and (cooldown_seconds is null or cooldown_seconds >= 0)
  ),
  constraint catalog_active_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index catalog_active_element_idx
  on public.catalog_active_skills(version_id, element_type, active_skill_id);

create table public.catalog_pal_active_skills (
  version_id uuid not null,
  pal_id text not null,
  active_skill_id text not null,
  learn_level integer not null,
  is_exclusive boolean not null,
  metadata jsonb not null default '{}'::jsonb,
  primary key (version_id, pal_id, active_skill_id, learn_level),
  constraint catalog_pal_active_pal_fkey
    foreign key (version_id, pal_id)
    references public.catalog_pals(version_id, pal_id) on delete restrict,
  constraint catalog_pal_active_skill_fkey
    foreign key (version_id, active_skill_id)
    references public.catalog_active_skills(version_id, active_skill_id) on delete restrict,
  constraint catalog_pal_active_level_check check (learn_level >= 0),
  constraint catalog_pal_active_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index catalog_pal_active_skill_idx
  on public.catalog_pal_active_skills(version_id, active_skill_id, pal_id);

create table public.catalog_partner_skills (
  version_id uuid not null,
  partner_skill_id text not null,
  pal_id text not null,
  name_key text not null,
  description_key text,
  metadata jsonb not null default '{}'::jsonb,
  primary key (version_id, partner_skill_id),
  constraint catalog_partner_pal_fkey
    foreign key (version_id, pal_id)
    references public.catalog_pals(version_id, pal_id) on delete restrict,
  constraint catalog_partner_id_check
    check (partner_skill_id ~ '^[a-z0-9][a-z0-9._-]*$'),
  constraint catalog_partner_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index catalog_partner_pal_idx on public.catalog_partner_skills(version_id, pal_id);

create table public.catalog_localizations (
  version_id uuid not null references public.game_data_versions(id) on delete restrict,
  locale text not null,
  text_key text not null,
  text text not null,
  primary key (version_id, locale, text_key),
  constraint catalog_locales_locale_check
    check (locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  constraint catalog_locales_key_check
    check (text_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
  constraint catalog_locales_text_check check (char_length(text) <= 10000)
);

create index catalog_localization_search_idx
  on public.catalog_localizations(version_id, locale, text_key);

create table public.catalog_breeding_recipes (
  version_id uuid not null,
  parent_a_pal_id text not null,
  parent_b_pal_id text not null,
  child_pal_id text not null,
  recipe_type public.breeding_recipe_type not null,
  metadata jsonb not null default '{}'::jsonb,
  primary key (version_id, parent_a_pal_id, parent_b_pal_id, recipe_type),
  constraint catalog_breeding_parent_a_fkey
    foreign key (version_id, parent_a_pal_id)
    references public.catalog_pals(version_id, pal_id) on delete restrict,
  constraint catalog_breeding_parent_b_fkey
    foreign key (version_id, parent_b_pal_id)
    references public.catalog_pals(version_id, pal_id) on delete restrict,
  constraint catalog_breeding_child_fkey
    foreign key (version_id, child_pal_id)
    references public.catalog_pals(version_id, pal_id) on delete restrict,
  constraint catalog_breeding_parent_order_check check (parent_a_pal_id <= parent_b_pal_id),
  constraint catalog_breeding_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index catalog_breeding_child_idx
  on public.catalog_breeding_recipes(version_id, child_pal_id);
create index catalog_breeding_parent_pair_idx
  on public.catalog_breeding_recipes(version_id, parent_a_pal_id, parent_b_pal_id);

create function public.validate_world_active_game_data_reference()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.active_game_data_version_id is not null and not exists (
    select 1 from public.game_data_versions as version
     where version.id = new.active_game_data_version_id
       and version.status = 'published'
  ) then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_VERSION_NOT_PUBLISHED';
  end if;
  return new;
end;
$$;

create trigger worlds_validate_active_game_data
  before insert or update of active_game_data_version_id on public.worlds
  for each row execute function public.validate_world_active_game_data_reference();

create function public.protect_published_game_data_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'published' then
    raise exception using errcode = 'P0001', message = 'PUBLISHED_GAME_DATA_VERSION_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger game_data_versions_protect_published
  before update or delete on public.game_data_versions
  for each row execute function public.protect_published_game_data_version();

create function public.protect_published_catalog_projection()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_version_id uuid := case when tg_op = 'DELETE' then old.version_id else new.version_id end;
begin
  if exists (
    select 1 from public.game_data_versions as version
     where version.id = v_version_id and version.status = 'published'
  ) then
    raise exception using errcode = 'P0001', message = 'PUBLISHED_GAME_CATALOG_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger catalog_pals_protect_published
  before insert or update or delete on public.catalog_pals
  for each row execute function public.protect_published_catalog_projection();
create trigger catalog_passives_protect_published
  before insert or update or delete on public.catalog_passive_skills
  for each row execute function public.protect_published_catalog_projection();
create trigger catalog_active_protect_published
  before insert or update or delete on public.catalog_active_skills
  for each row execute function public.protect_published_catalog_projection();
create trigger catalog_pal_active_protect_published
  before insert or update or delete on public.catalog_pal_active_skills
  for each row execute function public.protect_published_catalog_projection();
create trigger catalog_partner_protect_published
  before insert or update or delete on public.catalog_partner_skills
  for each row execute function public.protect_published_catalog_projection();
create trigger catalog_localizations_protect_published
  before insert or update or delete on public.catalog_localizations
  for each row execute function public.protect_published_catalog_projection();
create trigger catalog_breeding_protect_published
  before insert or update or delete on public.catalog_breeding_recipes
  for each row execute function public.protect_published_catalog_projection();

create table public.game_data_import_runs (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.game_data_versions(id) on delete restrict,
  status public.game_data_import_status not null default 'staging',
  manifest jsonb not null,
  started_at timestamptz not null default now(),
  finalized_at timestamptz,
  constraint game_data_import_runs_manifest_check check (jsonb_typeof(manifest) = 'object'),
  constraint game_data_import_runs_finalized_check check (
    (status = 'finalized' and finalized_at is not null)
    or (status = 'staging' and finalized_at is null)
  )
);

create unique index game_data_one_staging_run_idx
  on public.game_data_import_runs(version_id) where status = 'staging';

create table public.game_data_import_batches (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references public.game_data_import_runs(id) on delete restrict,
  entity_type public.game_data_entity_type not null,
  idempotency_key text not null,
  records jsonb not null,
  record_count integer generated always as (jsonb_array_length(records)) stored,
  batch_digest text not null,
  created_at timestamptz not null default now(),
  constraint game_data_batches_key_check
    check (char_length(btrim(idempotency_key)) between 1 and 160),
  constraint game_data_batches_records_check
    check (jsonb_typeof(records) = 'array' and jsonb_array_length(records) between 1 and 1000),
  constraint game_data_batches_digest_check check (batch_digest ~ '^[0-9a-f]{64}$'),
  constraint game_data_batches_idempotency_key
    unique (import_run_id, entity_type, idempotency_key)
);

create index game_data_batches_run_entity_idx
  on public.game_data_import_batches(import_run_id, entity_type);

insert into storage.buckets (id, name, public)
values ('game-catalog-artifacts', 'game-catalog-artifacts', false)
on conflict (id) do update set public = false;

comment on table public.game_data_versions is
  'Immutable unified version for catalog, localization, skills, and breeding facts.';
comment on table public.game_data_import_batches is
  'Service-only retryable JSON batches; complete facts are projected into relational tables.';
comment on column public.breeding_jobs.game_data_version_id is
  'Authoritative exact static game data version. breeding_data_version_id remains compatibility-only.';

create function public.begin_game_data_import(
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

  select version.id, version.status
    into v_version_id, v_status
    from public.game_data_versions as version
   where version.content_hash = p_manifest->>'content_hash'
   for update;

  if v_version_id is null then
    insert into public.game_data_versions (
      source_id,
      game_build_id,
      game_version,
      package_hash,
      content_hash,
      schema_version,
      extractor_name,
      extractor_version,
      artifact_bucket,
      artifact_path,
      status,
      manifest,
      validation_report
    ) values (
      p_source_id,
      nullif(p_manifest->>'game_build_id', ''),
      nullif(p_manifest->>'game_version', ''),
      p_manifest->>'package_hash',
      p_manifest->>'content_hash',
      p_manifest->>'schema_version',
      p_manifest->>'extractor_name',
      p_manifest->>'extractor_version',
      btrim(p_artifact_bucket),
      btrim(p_artifact_path),
      'staging',
      p_manifest,
      jsonb_build_object('valid', false)
    ) returning id into v_version_id;
    v_status := 'staging';
    reused := false;
  else
    if v_status = 'rejected' then
      raise exception using errcode = 'P0001', message = 'GAME_DATA_VERSION_REJECTED';
    end if;
    reused := true;
  end if;

  select run.id
    into v_import_run_id
    from public.game_data_import_runs as run
   where run.version_id = v_version_id
   order by run.started_at desc
   limit 1;

  if v_import_run_id is null then
    insert into public.game_data_import_runs (
      version_id, status, manifest, finalized_at
    ) values (
      v_version_id,
      case when v_status in ('validated', 'published')
        then 'finalized'::public.game_data_import_status
        else 'staging'::public.game_data_import_status
      end,
      p_manifest,
      case when v_status in ('validated', 'published') then now() end
    ) returning id into v_import_run_id;
  end if;

  version_id := v_version_id;
  import_run_id := v_import_run_id;
  return next;
end;
$$;

create function public.stage_catalog_batch(
  p_import_run_id uuid,
  p_entity_type public.game_data_entity_type,
  p_idempotency_key text,
  p_records jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status public.game_data_import_status;
  v_digest text;
  v_existing_digest text;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_import_run_id is null
    or p_entity_type is null
    or p_idempotency_key is null
    or char_length(btrim(p_idempotency_key)) not between 1 and 160
    or p_records is null
    or jsonb_typeof(p_records) <> 'array'
    or jsonb_array_length(p_records) not between 1 and 1000
  then
    raise exception using errcode = 'P0001', message = 'INVALID_GAME_DATA_BATCH';
  end if;

  select run.status into v_status
    from public.game_data_import_runs as run
   where run.id = p_import_run_id
   for update;
  if v_status is null then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_IMPORT_NOT_FOUND';
  end if;
  if v_status = 'finalized' then
    return true;
  end if;

  v_digest := encode(
    extensions.digest(convert_to(p_records::text, 'UTF8'), 'sha256'),
    'hex'
  );
  insert into public.game_data_import_batches (
    import_run_id, entity_type, idempotency_key, records, batch_digest
  ) values (
    p_import_run_id, p_entity_type, btrim(p_idempotency_key), p_records, v_digest
  )
  on conflict (import_run_id, entity_type, idempotency_key) do nothing;

  select batch.batch_digest into v_existing_digest
    from public.game_data_import_batches as batch
   where batch.import_run_id = p_import_run_id
     and batch.entity_type = p_entity_type
     and batch.idempotency_key = btrim(p_idempotency_key);
  if v_existing_digest is distinct from v_digest then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_BATCH_CONFLICT';
  end if;
  return true;
end;
$$;

create function public.finalize_catalog_import(p_import_run_id uuid)
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
    version_id, parent_a_pal_id, parent_b_pal_id, child_pal_id, recipe_type, metadata
  )
  select
    v_version_id,
    least(record->>'parent_a_pal_id', record->>'parent_b_pal_id'),
    greatest(record->>'parent_a_pal_id', record->>'parent_b_pal_id'),
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

alter table public.breeding_data_versions
  drop constraint breeding_data_versions_publication_check;
alter table public.breeding_data_versions
  add constraint breeding_data_versions_publication_check check (
    (status = 'published' and published_at is not null)
    or (status <> 'published' and published_at is null and published_by is null)
  );

create function public.publish_game_data_version(p_world_id uuid, p_version_id uuid)
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
      version_id, parent_a_pal_id, parent_b_pal_id, child_pal_id, recipe_type, metadata
    )
    select
      version_id, parent_a_pal_id, parent_b_pal_id, child_pal_id, recipe_type, metadata
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

create function public.rollback_game_data_version(p_world_id uuid, p_version_id uuid)
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
  update public.worlds
     set active_game_data_version_id = p_version_id,
         active_breeding_version_id = p_version_id,
         updated_at = now()
   where id = p_world_id;
  return p_version_id;
end;
$$;

create function private.can_access_game_data_world(p_world_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_admin() or exists (
    select 1
      from public.player_bindings as binding
      join public.players as player on player.id = binding.player_id
     where binding.user_id = auth.uid() and player.world_id = p_world_id
  );
$$;

create function public.search_catalog_pals(
  p_world_id uuid,
  p_query text default '',
  p_locale text default 'en-US',
  p_limit integer default 50
)
returns table (
  version_id uuid,
  pal_id text,
  encyclopedia_no integer,
  display_name text,
  element_types text[],
  rarity integer,
  breeding_power integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version_id uuid;
begin
  if not private.can_access_game_data_world(p_world_id) then
    raise exception using errcode = 'P0001', message = 'WORLD_ACCESS_DENIED';
  end if;
  if p_locale is null or p_limit not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'INVALID_CATALOG_QUERY';
  end if;
  select world.active_game_data_version_id into v_version_id
    from public.worlds as world where world.id = p_world_id;
  if v_version_id is null or not exists (
    select 1 from public.game_data_versions
     where id = v_version_id and status = 'published'
  ) then
    raise exception using errcode = 'P0001', message = 'PUBLISHED_GAME_DATA_VERSION_REQUIRED';
  end if;
  return query
  select
    pal.version_id,
    pal.pal_id,
    pal.encyclopedia_no,
    coalesce(localization.text, pal.pal_id),
    pal.element_types,
    pal.rarity,
    pal.breeding_power
  from public.catalog_pals as pal
  left join public.catalog_localizations as localization
    on localization.version_id = pal.version_id
   and localization.locale = p_locale
   and localization.text_key = pal.name_key
  where pal.version_id = v_version_id
    and (
      coalesce(btrim(p_query), '') = ''
      or pal.pal_id ilike '%' || btrim(p_query) || '%'
      or localization.text ilike '%' || btrim(p_query) || '%'
      or pal.encyclopedia_no::text = btrim(p_query)
    )
  order by pal.encyclopedia_no nulls last, pal.pal_id
  limit p_limit;
end;
$$;

create function public.search_catalog_passive_skills(
  p_world_id uuid,
  p_query text default '',
  p_locale text default 'en-US',
  p_limit integer default 50
)
returns table (
  version_id uuid,
  passive_skill_id text,
  display_name text,
  rank integer,
  is_negative boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version_id uuid;
begin
  if not private.can_access_game_data_world(p_world_id) then
    raise exception using errcode = 'P0001', message = 'WORLD_ACCESS_DENIED';
  end if;
  if p_locale is null or p_limit not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'INVALID_CATALOG_QUERY';
  end if;
  select world.active_game_data_version_id into v_version_id
    from public.worlds as world where world.id = p_world_id;
  if v_version_id is null or not exists (
    select 1 from public.game_data_versions
     where id = v_version_id and status = 'published'
  ) then
    raise exception using errcode = 'P0001', message = 'PUBLISHED_GAME_DATA_VERSION_REQUIRED';
  end if;
  return query
  select
    skill.version_id,
    skill.passive_skill_id,
    coalesce(localization.text, skill.passive_skill_id),
    skill.rank,
    skill.is_negative
  from public.catalog_passive_skills as skill
  left join public.catalog_localizations as localization
    on localization.version_id = skill.version_id
   and localization.locale = p_locale
   and localization.text_key = skill.name_key
  where skill.version_id = v_version_id
    and (
      coalesce(btrim(p_query), '') = ''
      or skill.passive_skill_id ilike '%' || btrim(p_query) || '%'
      or localization.text ilike '%' || btrim(p_query) || '%'
    )
  order by skill.rank desc, skill.passive_skill_id
  limit p_limit;
end;
$$;

create function public.get_game_data_status(p_world_id uuid)
returns table (
  active_version_id uuid,
  status public.game_data_status,
  schema_version text,
  game_build_id text,
  game_version text,
  content_hash text,
  validated_at timestamptz,
  published_at timestamptz,
  counts jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.can_access_game_data_world(p_world_id) then
    raise exception using errcode = 'P0001', message = 'WORLD_ACCESS_DENIED';
  end if;
  return query
  select
    version.id,
    version.status,
    version.schema_version,
    version.game_build_id,
    version.game_version,
    version.content_hash,
    version.validated_at,
    version.published_at,
    coalesce(version.manifest->'counts', '{}'::jsonb)
  from public.worlds as world
  join public.game_data_versions as version
    on version.id = world.active_game_data_version_id and version.status = 'published'
  where world.id = p_world_id;
end;
$$;

create function public.get_game_data_version_for_agent(p_version_id uuid)
returns table (
  id uuid,
  game_build_id text,
  game_version text,
  package_hash text,
  content_hash text,
  schema_version text,
  extractor_name text,
  extractor_version text,
  artifact_bucket text,
  artifact_path text,
  status public.game_data_status,
  imported_at timestamptz,
  validated_at timestamptz,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  return query
  select
    version.id,
    version.game_build_id,
    version.game_version,
    version.package_hash,
    version.content_hash,
    version.schema_version,
    version.extractor_name,
    version.extractor_version,
    version.artifact_bucket,
    version.artifact_path,
    version.status,
    version.imported_at,
    version.validated_at,
    version.published_at
  from public.game_data_versions as version
  where version.id = p_version_id;
end;
$$;

create function public.load_game_catalog_projection(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_manifest jsonb;
begin
  if not private.is_service_role() then
    raise exception using errcode = 'P0001', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  select version.manifest into v_manifest
    from public.game_data_versions as version
   where version.id = p_version_id
     and version.status in ('validated', 'published');
  if v_manifest is null then return null; end if;
  return jsonb_build_object(
    'manifest', v_manifest,
    'pals', coalesce((select jsonb_agg(to_jsonb(row_value) - 'version_id' order by pal_id)
      from public.catalog_pals as row_value where version_id = p_version_id), '[]'::jsonb),
    'passive_skills', coalesce((select jsonb_agg(to_jsonb(row_value) - 'version_id' order by passive_skill_id)
      from public.catalog_passive_skills as row_value where version_id = p_version_id), '[]'::jsonb),
    'active_skills', coalesce((select jsonb_agg(to_jsonb(row_value) - 'version_id' order by active_skill_id)
      from public.catalog_active_skills as row_value where version_id = p_version_id), '[]'::jsonb),
    'pal_active_skills', coalesce((select jsonb_agg(to_jsonb(row_value) - 'version_id' order by pal_id, active_skill_id, learn_level)
      from public.catalog_pal_active_skills as row_value where version_id = p_version_id), '[]'::jsonb),
    'partner_skills', coalesce((select jsonb_agg(to_jsonb(row_value) - 'version_id' order by partner_skill_id)
      from public.catalog_partner_skills as row_value where version_id = p_version_id), '[]'::jsonb),
    'breeding_recipes', coalesce((select jsonb_agg(to_jsonb(row_value) - 'version_id' order by parent_a_pal_id, parent_b_pal_id, recipe_type)
      from public.catalog_breeding_recipes as row_value where version_id = p_version_id), '[]'::jsonb),
    'localizations', coalesce((select jsonb_agg(to_jsonb(row_value) - 'version_id' order by locale, text_key)
      from public.catalog_localizations as row_value where version_id = p_version_id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.create_breeding_job(
  p_target_pal_id text,
  p_desired_passive_ids text[] default '{}',
  p_optimization_mode public.optimization_mode default 'balanced',
  p_idempotency_key text default null
)
returns table (job_id uuid, reused boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requester_user_id uuid := auth.uid();
  v_player_id uuid;
  v_world_id uuid;
  v_guild_id uuid;
  v_snapshot_id uuid;
  v_game_version_id uuid;
  v_breeding_version_id uuid;
  v_algorithm_version text;
  v_scoring_profile_version text;
  v_passive_ids text[];
  v_fingerprint text;
  v_idempotency_key text;
  v_job_id uuid;
  v_existing_fingerprint text;
begin
  if v_requester_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_target_pal_id is null or char_length(btrim(p_target_pal_id)) not between 1 and 120 then
    raise exception using errcode = 'P0001', message = 'INVALID_TARGET_PAL';
  end if;
  if p_desired_passive_ids is null
    or cardinality(p_desired_passive_ids) not between 0 and 4
    or not public.is_valid_id_array(p_desired_passive_ids)
  then
    raise exception using errcode = 'P0001', message = 'INVALID_DESIRED_PASSIVES';
  end if;
  if p_idempotency_key is not null
    and char_length(btrim(p_idempotency_key)) not between 1 and 128
  then
    raise exception using errcode = 'P0001', message = 'INVALID_IDEMPOTENCY_KEY';
  end if;

  select coalesce(array_agg(passive_id order by passive_id), '{}'::text[])
    into v_passive_ids from unnest(p_desired_passive_ids) as passive_id;
  v_player_id := public.current_player_id();
  if v_player_id is null then
    raise exception using errcode = 'P0001', message = 'PLAYER_BINDING_REQUIRED';
  end if;

  select
    player.world_id,
    player.guild_id,
    world.latest_snapshot_id,
    world.active_game_data_version_id,
    world.active_breeding_version_id
  into
    v_world_id,
    v_guild_id,
    v_snapshot_id,
    v_game_version_id,
    v_breeding_version_id
  from public.players as player
  join public.worlds as world on world.id = player.world_id
  where player.id = v_player_id
  for share of world;

  if v_world_id is null then
    raise exception using errcode = 'P0001', message = 'PLAYER_BINDING_INVALID';
  end if;
  if v_snapshot_id is null or not exists (
    select 1 from public.inventory_snapshots
     where id = v_snapshot_id and world_id = v_world_id and status = 'published'
  ) then
    raise exception using errcode = 'P0001', message = 'ACTIVE_INVENTORY_SNAPSHOT_REQUIRED';
  end if;
  if v_game_version_id is null or not exists (
    select 1 from public.game_data_versions
     where id = v_game_version_id and status = 'published'
  ) then
    raise exception using errcode = 'P0001', message = 'PUBLISHED_GAME_DATA_VERSION_REQUIRED';
  end if;
  if v_breeding_version_id is null or v_breeding_version_id <> v_game_version_id then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_COMPATIBILITY_VERSION_REQUIRED';
  end if;

  select profile.algorithm_version, profile.version
    into v_algorithm_version, v_scoring_profile_version
    from public.scoring_profiles as profile
   where profile.optimization_mode = p_optimization_mode and profile.is_active;
  if v_algorithm_version is null then
    raise exception using errcode = 'P0001', message = 'ACTIVE_SCORING_PROFILE_REQUIRED';
  end if;

  v_fingerprint := encode(
    extensions.digest(
      convert_to(concat_ws(
        '|',
        v_requester_user_id::text,
        v_player_id::text,
        btrim(p_target_pal_id),
        array_to_string(v_passive_ids, ','),
        v_snapshot_id::text,
        v_game_version_id::text,
        p_optimization_mode::text
      ), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_idempotency_key := coalesce(nullif(btrim(p_idempotency_key), ''), 'auto:' || v_fingerprint);

  select job.id, job.request_fingerprint into v_job_id, v_existing_fingerprint
    from public.breeding_jobs as job
   where job.requester_user_id = v_requester_user_id
     and job.idempotency_key = v_idempotency_key;
  if found then
    if v_existing_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    job_id := v_job_id; reused := true; return next; return;
  end if;

  select job.id into v_job_id
    from public.breeding_jobs as job
   where job.requester_user_id = v_requester_user_id
     and job.request_fingerprint = v_fingerprint
     and job.status not in ('completed', 'failed', 'cancelled')
   order by job.created_at limit 1;
  if found then
    job_id := v_job_id; reused := true; return next; return;
  end if;

  insert into public.breeding_jobs (
    requester_user_id,
    world_id,
    player_id,
    guild_id,
    target_pal_id,
    desired_passive_ids,
    optimization_mode,
    inventory_snapshot_id,
    breeding_data_version_id,
    game_data_version_id,
    algorithm_version,
    scoring_profile_version,
    request_fingerprint,
    idempotency_key
  ) values (
    v_requester_user_id,
    v_world_id,
    v_player_id,
    v_guild_id,
    btrim(p_target_pal_id),
    v_passive_ids,
    p_optimization_mode,
    v_snapshot_id,
    v_breeding_version_id,
    v_game_version_id,
    v_algorithm_version,
    v_scoring_profile_version,
    v_fingerprint,
    v_idempotency_key
  )
  on conflict do nothing
  returning id into v_job_id;

  if v_job_id is null then
    select job.id, job.request_fingerprint into v_job_id, v_existing_fingerprint
      from public.breeding_jobs as job
     where job.requester_user_id = v_requester_user_id
       and job.idempotency_key = v_idempotency_key
     order by job.created_at limit 1;
    if v_job_id is not null and v_existing_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    if v_job_id is null then
      select job.id into v_job_id
        from public.breeding_jobs as job
       where job.requester_user_id = v_requester_user_id
         and job.request_fingerprint = v_fingerprint
         and job.status not in ('completed', 'failed', 'cancelled')
       order by job.created_at limit 1;
    end if;
    if v_job_id is null then
      raise exception using errcode = 'P0001', message = 'JOB_CREATE_CONFLICT';
    end if;
    reused := true;
  else
    reused := false;
  end if;
  job_id := v_job_id;
  return next;
end;
$$;

revoke all on table
  public.game_data_sources,
  public.game_data_versions,
  public.catalog_pals,
  public.catalog_passive_skills,
  public.catalog_active_skills,
  public.catalog_pal_active_skills,
  public.catalog_partner_skills,
  public.catalog_localizations,
  public.catalog_breeding_recipes,
  public.game_data_import_runs,
  public.game_data_import_batches
from public, anon, authenticated, service_role;

grant select on table
  public.game_data_sources,
  public.game_data_versions,
  public.catalog_pals,
  public.catalog_passive_skills,
  public.catalog_active_skills,
  public.catalog_pal_active_skills,
  public.catalog_partner_skills,
  public.catalog_localizations,
  public.catalog_breeding_recipes
to authenticated, service_role;

grant select on table
  public.game_data_import_runs,
  public.game_data_import_batches
to service_role;

alter table public.game_data_sources enable row level security;
alter table public.game_data_versions enable row level security;
alter table public.catalog_pals enable row level security;
alter table public.catalog_passive_skills enable row level security;
alter table public.catalog_active_skills enable row level security;
alter table public.catalog_pal_active_skills enable row level security;
alter table public.catalog_partner_skills enable row level security;
alter table public.catalog_localizations enable row level security;
alter table public.catalog_breeding_recipes enable row level security;
alter table public.game_data_import_runs enable row level security;
alter table public.game_data_import_batches enable row level security;

create policy game_data_sources_admin_select
  on public.game_data_sources for select to authenticated
  using ((select public.is_admin()));

create policy game_data_versions_current_select
  on public.game_data_versions for select to authenticated
  using (
    (select public.is_admin())
    or (
      status = 'published'
      and id in (
        select world.active_game_data_version_id
          from public.worlds as world
          join public.players as player on player.world_id = world.id
         where player.id = (select public.current_player_id())
      )
    )
  );

create policy catalog_pals_current_select
  on public.catalog_pals for select to authenticated
  using (
    (select public.is_admin())
    or version_id in (
      select world.active_game_data_version_id
        from public.worlds as world
        join public.players as player on player.world_id = world.id
        join public.game_data_versions as version
          on version.id = world.active_game_data_version_id and version.status = 'published'
       where player.id = (select public.current_player_id())
    )
  );

create policy catalog_passives_current_select
  on public.catalog_passive_skills for select to authenticated
  using (
    (select public.is_admin())
    or version_id in (
      select world.active_game_data_version_id
        from public.worlds as world
        join public.players as player on player.world_id = world.id
        join public.game_data_versions as version
          on version.id = world.active_game_data_version_id and version.status = 'published'
       where player.id = (select public.current_player_id())
    )
  );

create policy catalog_active_current_select
  on public.catalog_active_skills for select to authenticated
  using (
    (select public.is_admin())
    or version_id in (
      select world.active_game_data_version_id
        from public.worlds as world
        join public.players as player on player.world_id = world.id
        join public.game_data_versions as version
          on version.id = world.active_game_data_version_id and version.status = 'published'
       where player.id = (select public.current_player_id())
    )
  );

create policy catalog_pal_active_current_select
  on public.catalog_pal_active_skills for select to authenticated
  using (
    (select public.is_admin())
    or version_id in (
      select world.active_game_data_version_id
        from public.worlds as world
        join public.players as player on player.world_id = world.id
        join public.game_data_versions as version
          on version.id = world.active_game_data_version_id and version.status = 'published'
       where player.id = (select public.current_player_id())
    )
  );

create policy catalog_partner_current_select
  on public.catalog_partner_skills for select to authenticated
  using (
    (select public.is_admin())
    or version_id in (
      select world.active_game_data_version_id
        from public.worlds as world
        join public.players as player on player.world_id = world.id
        join public.game_data_versions as version
          on version.id = world.active_game_data_version_id and version.status = 'published'
       where player.id = (select public.current_player_id())
    )
  );

create policy catalog_localizations_current_select
  on public.catalog_localizations for select to authenticated
  using (
    (select public.is_admin())
    or version_id in (
      select world.active_game_data_version_id
        from public.worlds as world
        join public.players as player on player.world_id = world.id
        join public.game_data_versions as version
          on version.id = world.active_game_data_version_id and version.status = 'published'
       where player.id = (select public.current_player_id())
    )
  );

create policy catalog_breeding_current_select
  on public.catalog_breeding_recipes for select to authenticated
  using (
    (select public.is_admin())
    or version_id in (
      select world.active_game_data_version_id
        from public.worlds as world
        join public.players as player on player.world_id = world.id
        join public.game_data_versions as version
          on version.id = world.active_game_data_version_id and version.status = 'published'
       where player.id = (select public.current_player_id())
    )
  );

revoke all on function public.sync_legacy_breeding_source_to_game_data()
  from public, anon, authenticated;
revoke all on function public.sync_legacy_breeding_version_to_game_data()
  from public, anon, authenticated;
revoke all on function public.sync_legacy_world_game_data_reference()
  from public, anon, authenticated;
revoke all on function public.sync_legacy_job_game_data_reference()
  from public, anon, authenticated;
revoke all on function public.validate_world_active_game_data_reference()
  from public, anon, authenticated;
revoke all on function public.protect_published_game_data_version()
  from public, anon, authenticated;
revoke all on function public.protect_published_catalog_projection()
  from public, anon, authenticated;
revoke all on function private.can_access_game_data_world(uuid)
  from public, anon, authenticated;

revoke all on function public.begin_game_data_import(uuid, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function public.stage_catalog_batch(
  uuid, public.game_data_entity_type, text, jsonb
) from public, anon, authenticated;
revoke all on function public.finalize_catalog_import(uuid)
  from public, anon, authenticated;
revoke all on function public.publish_game_data_version(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.rollback_game_data_version(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.search_catalog_pals(uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.search_catalog_passive_skills(uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.get_game_data_status(uuid)
  from public, anon, authenticated;
revoke all on function public.get_game_data_version_for_agent(uuid)
  from public, anon, authenticated;
revoke all on function public.load_game_catalog_projection(uuid)
  from public, anon, authenticated;
revoke all on function public.create_breeding_job(
  text, text[], public.optimization_mode, text
) from public, anon, authenticated;

grant execute on function public.begin_game_data_import(uuid, jsonb, text, text)
  to service_role;
grant execute on function public.stage_catalog_batch(
  uuid, public.game_data_entity_type, text, jsonb
) to service_role;
grant execute on function public.finalize_catalog_import(uuid) to service_role;
grant execute on function public.publish_game_data_version(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.rollback_game_data_version(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.search_catalog_pals(uuid, text, text, integer)
  to authenticated;
grant execute on function public.search_catalog_passive_skills(uuid, text, text, integer)
  to authenticated;
grant execute on function public.get_game_data_status(uuid) to authenticated;
grant execute on function public.get_game_data_version_for_agent(uuid) to service_role;
grant execute on function public.load_game_catalog_projection(uuid) to service_role;
grant execute on function public.create_breeding_job(
  text, text[], public.optimization_mode, text
) to authenticated;

comment on function public.begin_game_data_import(uuid, jsonb, text, text) is
  'Service Role only. Idempotently creates or reuses a staged immutable content hash.';
comment on function public.finalize_catalog_import(uuid) is
  'Service Role only. Atomically validates staged counts and builds relational projections.';
comment on function public.publish_game_data_version(uuid, uuid) is
  'Admin or Service Role only. Atomically switches one world and preserves legacy pointers.';
comment on function public.rollback_game_data_version(uuid, uuid) is
  'Admin or Service Role only. Switches exact published pointers without deleting versions.';
