create function public.get_inventory_catalog_ids_for_agent(p_world_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version_id uuid;
begin
  select version.id
    into v_version_id
    from public.worlds as world
    join public.game_data_versions as version
      on version.id = world.active_game_data_version_id
     and version.status = 'published'
   where world.id = p_world_id;
  if v_version_id is null then
    raise exception using errcode = 'P0001', message = 'GAME_DATA_CONFIGURATION_REQUIRED';
  end if;
  return jsonb_build_object(
    'pal_ids', coalesce(
      (
        select jsonb_agg(pal.pal_id order by pal.pal_id)
        from public.catalog_pals as pal
        where pal.version_id = v_version_id
      ),
      '[]'::jsonb
    ),
    'passive_skill_ids', coalesce(
      (
        select jsonb_agg(passive.passive_skill_id order by passive.passive_skill_id)
        from public.catalog_passive_skills as passive
        where passive.version_id = v_version_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.get_inventory_catalog_ids_for_agent(uuid)
  from public, anon, authenticated;
grant execute on function public.get_inventory_catalog_ids_for_agent(uuid)
  to service_role;
