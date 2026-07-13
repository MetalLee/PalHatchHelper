create type public.breeding_source_type as enum ('github', 'url', 'upload');
create type public.breeding_data_status as enum (
  'staging',
  'validated',
  'published',
  'rejected'
);
create type public.breeding_recipe_type as enum ('normal', 'special');

create table public.breeding_data_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  source_type public.breeding_source_type not null,
  source_url text,
  enabled boolean not null default true,
  fetch_schedule text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint breeding_data_sources_name_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint breeding_data_sources_url_check check (
    (source_type = 'upload' and source_url is null)
    or (
      source_type in ('github', 'url')
      and source_url is not null
      and source_url ~ '^https://'
    )
  ),
  constraint breeding_data_sources_schedule_check
    check (fetch_schedule is null or char_length(fetch_schedule) <= 120)
);

create table public.breeding_data_versions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.breeding_data_sources(id) on delete restrict,
  external_version text,
  content_hash text not null unique,
  status public.breeding_data_status not null default 'staging',
  validation_report jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete restrict,
  constraint breeding_data_versions_external_version_check
    check (external_version is null or char_length(external_version) <= 120),
  constraint breeding_data_versions_hash_check
    check (char_length(btrim(content_hash)) between 32 and 128),
  constraint breeding_data_versions_report_check
    check (jsonb_typeof(validation_report) = 'object'),
  constraint breeding_data_versions_publication_check check (
    (
      status = 'published'
      and published_at is not null
      and published_by is not null
    )
    or (
      status <> 'published'
      and published_at is null
      and published_by is null
    )
  )
);

create index breeding_data_versions_source_imported_idx
  on public.breeding_data_versions(source_id, imported_at desc);
create index breeding_data_versions_status_idx
  on public.breeding_data_versions(status, imported_at desc);

alter table public.worlds
  add constraint worlds_active_breeding_version_fkey
  foreign key (active_breeding_version_id)
  references public.breeding_data_versions(id)
  on delete restrict
  deferrable initially immediate;

create table public.breeding_recipes (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.breeding_data_versions(id) on delete restrict,
  parent_a_pal_id text not null,
  parent_b_pal_id text not null,
  normalized_parent_a_pal_id text generated always as (
    least(parent_a_pal_id, parent_b_pal_id)
  ) stored,
  normalized_parent_b_pal_id text generated always as (
    greatest(parent_a_pal_id, parent_b_pal_id)
  ) stored,
  child_pal_id text not null,
  recipe_type public.breeding_recipe_type not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint breeding_recipes_parent_a_check
    check (char_length(btrim(parent_a_pal_id)) between 1 and 120),
  constraint breeding_recipes_parent_b_check
    check (char_length(btrim(parent_b_pal_id)) between 1 and 120),
  constraint breeding_recipes_child_check
    check (char_length(btrim(child_pal_id)) between 1 and 120),
  constraint breeding_recipes_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint breeding_recipes_parent_pair_key unique (
    version_id,
    normalized_parent_a_pal_id,
    normalized_parent_b_pal_id,
    recipe_type
  )
);

create index breeding_recipes_child_idx
  on public.breeding_recipes(version_id, child_pal_id);

create table public.scoring_profiles (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  optimization_mode public.optimization_mode not null,
  algorithm_version text not null,
  weights jsonb not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  constraint scoring_profiles_version_check
    check (char_length(btrim(version)) between 1 and 100),
  constraint scoring_profiles_algorithm_version_check
    check (char_length(btrim(algorithm_version)) between 1 and 100),
  constraint scoring_profiles_weights_check
    check (jsonb_typeof(weights) = 'object')
);

create unique index scoring_profiles_one_active_per_mode_idx
  on public.scoring_profiles(optimization_mode)
  where is_active;

create function public.protect_scoring_profile_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = 'P0001',
      message = 'SCORING_PROFILE_VERSION_IMMUTABLE';
  end if;

  if new.id is distinct from old.id
    or new.version is distinct from old.version
    or new.optimization_mode is distinct from old.optimization_mode
    or new.algorithm_version is distinct from old.algorithm_version
    or new.weights is distinct from old.weights
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = 'P0001',
      message = 'SCORING_PROFILE_VERSION_IMMUTABLE';
  end if;

  return new;
end;
$$;

create trigger scoring_profiles_protect_version
  before update or delete on public.scoring_profiles
  for each row execute function public.protect_scoring_profile_version();

create function public.validate_world_active_references()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.latest_snapshot_id is not null and not exists (
    select 1
    from public.inventory_snapshots as snapshot
    where snapshot.id = new.latest_snapshot_id
      and snapshot.world_id = new.id
      and snapshot.status = 'published'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LATEST_SNAPSHOT_NOT_PUBLISHED';
  end if;

  if new.active_breeding_version_id is not null and not exists (
    select 1
    from public.breeding_data_versions as version
    where version.id = new.active_breeding_version_id
      and version.status = 'published'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'BREEDING_VERSION_NOT_PUBLISHED';
  end if;

  return new;
end;
$$;

create trigger worlds_validate_active_references
  before insert or update of latest_snapshot_id, active_breeding_version_id
  on public.worlds
  for each row execute function public.validate_world_active_references();

create function public.protect_published_breeding_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'published' then
    raise exception using
      errcode = 'P0001',
      message = 'PUBLISHED_BREEDING_VERSION_IMMUTABLE';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger breeding_data_versions_protect_published
  before update or delete on public.breeding_data_versions
  for each row execute function public.protect_published_breeding_version();

create function public.protect_published_breeding_recipe()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_version_id uuid;
begin
  v_version_id := case when tg_op = 'DELETE' then old.version_id else new.version_id end;

  if exists (
    select 1
    from public.breeding_data_versions as version
    where version.id = v_version_id
      and version.status = 'published'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PUBLISHED_BREEDING_RECIPE_IMMUTABLE';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger breeding_recipes_protect_published
  before insert or update or delete on public.breeding_recipes
  for each row execute function public.protect_published_breeding_recipe();

comment on table public.breeding_data_versions is
  'Versioned, validated breeding facts. Publishing never deletes an older version.';
comment on table public.scoring_profiles is
  'Versioned deterministic scoring weights; AI cannot alter these values.';
