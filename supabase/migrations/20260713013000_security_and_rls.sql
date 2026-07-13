create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = auth.uid()
      and profile.role = 'admin'
  );
$$;

create function public.current_player_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select binding.player_id
  from public.player_bindings as binding
  where binding.user_id = auth.uid();
$$;

create function public.current_guild_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select player.guild_id
  from public.player_bindings as binding
  join public.players as player on player.id = binding.player_id
  where binding.user_id = auth.uid();
$$;

create function private.is_service_role()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;

create function private.owns_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.breeding_jobs as job
    where job.id = p_job_id
      and job.requester_user_id = auth.uid()
  );
$$;

create function private.owns_plan(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.breeding_plans as plan
    join public.breeding_jobs as job on job.id = plan.job_id
    where plan.id = p_plan_id
      and job.requester_user_id = auth.uid()
  );
$$;

create function private.owns_route(p_route_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.breeding_routes as route
    join public.breeding_plans as plan on plan.id = route.plan_id
    join public.breeding_jobs as job on job.id = plan.job_id
    where route.id = p_route_id
      and job.requester_user_id = auth.uid()
  );
$$;

create function private.owns_step(p_step_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.breeding_steps as step
    join public.breeding_routes as route on route.id = step.route_id
    join public.breeding_plans as plan on plan.id = route.plan_id
    join public.breeding_jobs as job on job.id = plan.job_id
    where step.id = p_step_id
      and job.requester_user_id = auth.uid()
  );
$$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from service_role;
grant select on all tables in schema public to service_role;
grant insert, update on table
  public.worlds,
  public.guilds,
  public.players,
  public.inventory_snapshots,
  public.pal_snapshot_items,
  public.pal_share_preferences,
  public.breeding_data_sources,
  public.breeding_data_versions,
  public.breeding_recipes,
  public.scoring_profiles,
  public.breeding_plans,
  public.breeding_routes,
  public.breeding_steps,
  public.step_offspring_candidates
to service_role;

grant select on table
  public.profiles,
  public.player_bindings,
  public.worlds,
  public.guilds,
  public.players,
  public.inventory_snapshots,
  public.pal_snapshot_items,
  public.pal_share_preferences,
  public.breeding_data_sources,
  public.breeding_data_versions,
  public.breeding_recipes,
  public.scoring_profiles,
  public.breeding_jobs,
  public.breeding_plans,
  public.breeding_routes,
  public.breeding_steps,
  public.step_offspring_candidates
to authenticated;

grant insert, update on table
  public.breeding_data_sources,
  public.breeding_recipes,
  public.scoring_profiles
to authenticated;

grant insert on table public.breeding_data_versions to authenticated;

alter table public.profiles enable row level security;
alter table public.player_bindings enable row level security;
alter table public.worlds enable row level security;
alter table public.guilds enable row level security;
alter table public.players enable row level security;
alter table public.inventory_snapshots enable row level security;
alter table public.pal_snapshot_items enable row level security;
alter table public.pal_share_preferences enable row level security;
alter table public.breeding_data_sources enable row level security;
alter table public.breeding_data_versions enable row level security;
alter table public.breeding_recipes enable row level security;
alter table public.scoring_profiles enable row level security;
alter table public.breeding_jobs enable row level security;
alter table public.breeding_plans enable row level security;
alter table public.breeding_routes enable row level security;
alter table public.breeding_steps enable row level security;
alter table public.step_offspring_candidates enable row level security;

create policy profiles_select_self_or_admin
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or (select public.is_admin()));

create policy player_bindings_select_self_or_admin
  on public.player_bindings
  for select
  to authenticated
  using (user_id = auth.uid() or (select public.is_admin()));

create policy worlds_select_bound_world_or_admin
  on public.worlds
  for select
  to authenticated
  using (
    (select public.is_admin())
    or id = (
      select player.world_id
      from public.players as player
      where player.id = (select public.current_player_id())
    )
  );

create policy guilds_select_current_or_admin
  on public.guilds
  for select
  to authenticated
  using ((select public.is_admin()) or id = (select public.current_guild_id()));

create policy players_select_self_or_admin
  on public.players
  for select
  to authenticated
  using ((select public.is_admin()) or id = (select public.current_player_id()));

create policy inventory_snapshots_select_authorized
  on public.inventory_snapshots
  for select
  to authenticated
  using (
    (select public.is_admin())
    or (
      world_id = (
        select player.world_id
        from public.players as player
        where player.id = (select public.current_player_id())
      )
      and (
        id = (
          select world.latest_snapshot_id
          from public.worlds as world
          where world.id = world_id
        )
        or exists (
          select 1
          from public.breeding_jobs as job
          where job.inventory_snapshot_id = inventory_snapshots.id
            and job.requester_user_id = auth.uid()
        )
      )
    )
  );

create policy pal_snapshot_items_select_owned_or_admin
  on public.pal_snapshot_items
  for select
  to authenticated
  using (
    (select public.is_admin())
    or (
      owner_player_id = (select public.current_player_id())
      and snapshot_id = (
        select world.latest_snapshot_id
        from public.worlds as world
        where world.id = pal_snapshot_items.world_id
      )
    )
  );

create policy pal_share_preferences_select_owned_or_admin
  on public.pal_share_preferences
  for select
  to authenticated
  using (
    (select public.is_admin())
    or owner_player_id_at_set = (select public.current_player_id())
  );

create policy breeding_data_sources_admin_select
  on public.breeding_data_sources
  for select
  to authenticated
  using ((select public.is_admin()));

create policy breeding_data_sources_admin_insert
  on public.breeding_data_sources
  for insert
  to authenticated
  with check ((select public.is_admin()));

create policy breeding_data_sources_admin_update
  on public.breeding_data_sources
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy breeding_data_versions_select_authorized
  on public.breeding_data_versions
  for select
  to authenticated
  using (
    (select public.is_admin())
    or id in (
      select world.active_breeding_version_id
      from public.worlds as world
      join public.players as player on player.world_id = world.id
      where player.id = (select public.current_player_id())
    )
    or exists (
      select 1
      from public.breeding_jobs as job
      where job.breeding_data_version_id = breeding_data_versions.id
        and job.requester_user_id = auth.uid()
    )
  );

create policy breeding_data_versions_admin_insert
  on public.breeding_data_versions
  for insert
  to authenticated
  with check (
    (select public.is_admin())
    and status = 'staging'
    and published_at is null
    and published_by is null
  );

create policy breeding_recipes_select_authorized
  on public.breeding_recipes
  for select
  to authenticated
  using (
    (select public.is_admin())
    or version_id in (
      select world.active_breeding_version_id
      from public.worlds as world
      join public.players as player on player.world_id = world.id
      where player.id = (select public.current_player_id())
    )
    or exists (
      select 1
      from public.breeding_jobs as job
      where job.breeding_data_version_id = breeding_recipes.version_id
        and job.requester_user_id = auth.uid()
    )
  );

create policy breeding_recipes_admin_insert
  on public.breeding_recipes
  for insert
  to authenticated
  with check (
    (select public.is_admin())
    and exists (
      select 1
      from public.breeding_data_versions as version
      where version.id = breeding_recipes.version_id
        and version.status = 'staging'
    )
  );

create policy breeding_recipes_admin_update
  on public.breeding_recipes
  for update
  to authenticated
  using (
    (select public.is_admin())
    and exists (
      select 1
      from public.breeding_data_versions as version
      where version.id = breeding_recipes.version_id
        and version.status = 'staging'
    )
  )
  with check (
    (select public.is_admin())
    and exists (
      select 1
      from public.breeding_data_versions as version
      where version.id = breeding_recipes.version_id
        and version.status = 'staging'
    )
  );

create policy scoring_profiles_select_authorized
  on public.scoring_profiles
  for select
  to authenticated
  using (
    (select public.is_admin())
    or is_active
    or exists (
      select 1
      from public.breeding_jobs as job
      where job.scoring_profile_version = scoring_profiles.version
        and job.requester_user_id = auth.uid()
    )
  );

create policy scoring_profiles_admin_insert
  on public.scoring_profiles
  for insert
  to authenticated
  with check ((select public.is_admin()));

create policy scoring_profiles_admin_update
  on public.scoring_profiles
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy breeding_jobs_select_owner_or_admin
  on public.breeding_jobs
  for select
  to authenticated
  using (requester_user_id = auth.uid() or (select public.is_admin()));

create policy breeding_plans_select_owner_or_admin
  on public.breeding_plans
  for select
  to authenticated
  using ((select public.is_admin()) or private.owns_job(job_id));

create policy breeding_routes_select_owner_or_admin
  on public.breeding_routes
  for select
  to authenticated
  using ((select public.is_admin()) or private.owns_plan(plan_id));

create policy breeding_steps_select_owner_or_admin
  on public.breeding_steps
  for select
  to authenticated
  using ((select public.is_admin()) or private.owns_route(route_id));

create policy step_candidates_select_owner_or_admin
  on public.step_offspring_candidates
  for select
  to authenticated
  using ((select public.is_admin()) or private.owns_step(step_id));

revoke all on function public.is_valid_id_array(text[]) from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.reject_inventory_snapshot_mutation() from public, anon, authenticated;
revoke all on function public.reject_pal_snapshot_item_mutation() from public, anon, authenticated;
revoke all on function public.validate_world_active_references() from public, anon, authenticated;
revoke all on function public.protect_published_breeding_version() from public, anon, authenticated;
revoke all on function public.protect_published_breeding_recipe() from public, anon, authenticated;
revoke all on function public.protect_scoring_profile_version() from public, anon, authenticated;
revoke all on function public.validate_recommended_route() from public, anon, authenticated;
revoke all on function public.validate_offspring_candidate_world() from public, anon, authenticated;

revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.current_player_id() from public, anon, authenticated;
revoke all on function public.current_guild_id() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.current_player_id() to authenticated, service_role;
grant execute on function public.current_guild_id() to authenticated, service_role;
grant execute on function public.is_valid_id_array(text[]) to service_role;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
grant execute on function private.owns_job(uuid) to authenticated;
grant execute on function private.owns_plan(uuid) to authenticated;
grant execute on function private.owns_route(uuid) to authenticated;
grant execute on function private.owns_step(uuid) to authenticated;

comment on schema private is
  'Non-exposed authorization helpers used by RLS and SECURITY DEFINER RPCs.';
