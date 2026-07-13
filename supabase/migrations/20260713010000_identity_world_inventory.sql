create extension if not exists pgcrypto with schema extensions;

create type public.profile_role as enum ('admin', 'player');
create type public.inventory_snapshot_status as enum (
  'pending',
  'parsed',
  'published',
  'failed',
  'rejected'
);
create type public.pal_gender as enum ('male', 'female', 'genderless', 'unknown');
create type public.pal_location_type as enum (
  'player_party',
  'player_storage',
  'base',
  'viewing_cage',
  'unknown'
);
create type public.optimization_mode as enum (
  'balanced',
  'fastest',
  'highest_success',
  'least_borrowing'
);

create function public.is_valid_id_array(p_values text[])
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select
    array_position(p_values, null) is null
    and not exists (
      select 1
      from unnest(p_values) as value
      where btrim(value) = ''
    )
    and cardinality(p_values) = (
      select count(distinct value)::integer
      from unnest(p_values) as value
    );
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.profile_role not null default 'player',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_check
    check (char_length(btrim(display_name)) between 1 and 80)
);

create table public.worlds (
  id uuid primary key default gen_random_uuid(),
  world_uid text not null unique,
  name text not null,
  latest_snapshot_id uuid,
  active_breeding_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worlds_world_uid_check
    check (char_length(btrim(world_uid)) between 1 and 128),
  constraint worlds_name_check
    check (char_length(btrim(name)) between 1 and 120)
);

create table public.guilds (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete restrict,
  game_guild_uid text not null,
  name text not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint guilds_game_uid_check
    check (char_length(btrim(game_guild_uid)) between 1 and 128),
  constraint guilds_name_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint guilds_world_game_uid_key unique (world_id, game_guild_uid),
  constraint guilds_id_world_key unique (id, world_id)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete restrict,
  guild_id uuid,
  game_player_uid text not null,
  nickname text not null,
  level integer,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint players_game_uid_check
    check (char_length(btrim(game_player_uid)) between 1 and 128),
  constraint players_nickname_check
    check (char_length(btrim(nickname)) between 1 and 120),
  constraint players_level_check check (level is null or level between 1 and 100),
  constraint players_world_game_uid_key unique (world_id, game_player_uid),
  constraint players_id_world_key unique (id, world_id),
  constraint players_guild_world_fkey
    foreign key (guild_id, world_id)
    references public.guilds(id, world_id)
    on delete restrict
);

create index players_guild_id_idx on public.players(guild_id);

create table public.player_bindings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  player_id uuid not null unique references public.players(id) on delete restrict,
  bound_by uuid not null references public.profiles(id) on delete restrict,
  bound_at timestamptz not null default now(),
  claim_code_hash text,
  constraint player_bindings_claim_code_hash_check
    check (claim_code_hash is null or char_length(claim_code_hash) between 32 and 255)
);

create table public.inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds(id) on delete restrict,
  source_save_hash text not null,
  source_modified_at timestamptz not null,
  save_version text,
  parser_name text not null,
  parser_version text not null,
  status public.inventory_snapshot_status not null,
  captured_at timestamptz not null,
  parsed_at timestamptz,
  error_code text,
  error_summary text,
  created_at timestamptz not null default now(),
  constraint inventory_snapshots_hash_check
    check (char_length(btrim(source_save_hash)) between 32 and 128),
  constraint inventory_snapshots_parser_name_check
    check (char_length(btrim(parser_name)) between 1 and 100),
  constraint inventory_snapshots_parser_version_check
    check (char_length(btrim(parser_version)) between 1 and 100),
  constraint inventory_snapshots_error_code_check
    check (
      error_code is null
      or (
        char_length(error_code) between 1 and 100
        and error_code ~ '^[A-Z][A-Z0-9_]*$'
      )
    ),
  constraint inventory_snapshots_error_summary_check
    check (error_summary is null or char_length(error_summary) <= 500),
  constraint inventory_snapshots_status_details_check check (
    (status in ('parsed', 'published') and parsed_at is not null and error_code is null)
    or (status in ('failed', 'rejected') and error_code is not null)
    or (status = 'pending' and parsed_at is null and error_code is null)
  ),
  constraint inventory_snapshots_id_world_key unique (id, world_id)
);

create index inventory_snapshots_world_hash_idx
  on public.inventory_snapshots(world_id, source_save_hash);
create unique index inventory_snapshots_world_success_hash_idx
  on public.inventory_snapshots(world_id, source_save_hash)
  where status in ('parsed', 'published');
create index inventory_snapshots_world_captured_idx
  on public.inventory_snapshots(world_id, captured_at desc);
create index inventory_snapshots_world_status_idx
  on public.inventory_snapshots(world_id, status, captured_at desc);

alter table public.worlds
  add constraint worlds_latest_snapshot_fkey
  foreign key (latest_snapshot_id, id)
  references public.inventory_snapshots(id, world_id)
  on delete restrict
  deferrable initially immediate;

create table public.pal_snapshot_items (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null,
  world_id uuid not null,
  pal_instance_uid text not null,
  pal_id text not null,
  owner_player_id uuid,
  guild_id uuid,
  gender public.pal_gender not null,
  level integer,
  passive_skill_ids text[] not null default '{}',
  location_type public.pal_location_type not null,
  location_name text,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pal_snapshot_items_snapshot_world_fkey
    foreign key (snapshot_id, world_id)
    references public.inventory_snapshots(id, world_id)
    on delete restrict,
  constraint pal_snapshot_items_owner_world_fkey
    foreign key (owner_player_id, world_id)
    references public.players(id, world_id)
    on delete restrict,
  constraint pal_snapshot_items_guild_world_fkey
    foreign key (guild_id, world_id)
    references public.guilds(id, world_id)
    on delete restrict,
  constraint pal_snapshot_items_instance_uid_check
    check (char_length(btrim(pal_instance_uid)) between 1 and 160),
  constraint pal_snapshot_items_pal_id_check
    check (char_length(btrim(pal_id)) between 1 and 120),
  constraint pal_snapshot_items_level_check
    check (level is null or level between 1 and 100),
  constraint pal_snapshot_items_passives_check
    check (
      cardinality(passive_skill_ids) <= 64
      and public.is_valid_id_array(passive_skill_ids)
    ),
  constraint pal_snapshot_items_location_name_check
    check (location_name is null or char_length(location_name) <= 160),
  constraint pal_snapshot_items_raw_metadata_check
    check (jsonb_typeof(raw_metadata) = 'object'),
  constraint pal_snapshot_items_snapshot_instance_key
    unique (snapshot_id, pal_instance_uid)
);

create index pal_snapshot_items_owner_snapshot_idx
  on public.pal_snapshot_items(owner_player_id, snapshot_id);
create index pal_snapshot_items_guild_snapshot_idx
  on public.pal_snapshot_items(guild_id, snapshot_id);
create index pal_snapshot_items_pal_snapshot_idx
  on public.pal_snapshot_items(pal_id, snapshot_id);
create index pal_snapshot_items_passives_gin_idx
  on public.pal_snapshot_items using gin(passive_skill_ids);

create table public.pal_share_preferences (
  world_id uuid not null references public.worlds(id) on delete restrict,
  pal_instance_uid text not null,
  owner_player_id_at_set uuid,
  share_enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (world_id, pal_instance_uid),
  constraint pal_share_preferences_owner_world_fkey
    foreign key (owner_player_id_at_set, world_id)
    references public.players(id, world_id)
    on delete restrict,
  constraint pal_share_preferences_instance_uid_check
    check (char_length(btrim(pal_instance_uid)) between 1 and 160)
);

create index pal_share_preferences_owner_idx
  on public.pal_share_preferences(owner_player_id_at_set, world_id);

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_display_name text;
begin
  v_display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Player'
  );

  insert into public.profiles (id, display_name, role)
  values (new.id, left(v_display_name, 80), 'player')
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create function public.reject_inventory_snapshot_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'INVENTORY_SNAPSHOT_IMMUTABLE';
end;
$$;

create trigger inventory_snapshots_immutable
  before update or delete on public.inventory_snapshots
  for each row execute function public.reject_inventory_snapshot_mutation();

create function public.reject_pal_snapshot_item_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'PAL_SNAPSHOT_ITEM_IMMUTABLE';
end;
$$;

create trigger pal_snapshot_items_immutable
  before update or delete on public.pal_snapshot_items
  for each row execute function public.reject_pal_snapshot_item_mutation();

comment on table public.inventory_snapshots is
  'Immutable normalized inventory snapshot metadata; source saves are never stored here.';
comment on column public.pal_snapshot_items.raw_metadata is
  'Filtered extension metadata only; never a source for identity, authorization, or core queries.';
comment on table public.pal_share_preferences is
  'Persistent per-instance preference. Missing rows are interpreted as share enabled.';
