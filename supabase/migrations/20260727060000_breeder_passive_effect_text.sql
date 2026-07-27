create or replace function public.get_breeder_form_context(
  p_locale text default 'zh-CN'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_player_id uuid;
  v_world_id uuid;
  v_snapshot_id uuid;
  v_version_id uuid;
  v_content_hash text;
  v_game_build_id text;
  v_game_version text;
  v_status jsonb;
  v_algorithm_version text;
  v_algorithm_count integer;
  v_profiles jsonb;
  v_pals jsonb;
  v_passives jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error_code', 'AUTH_REQUIRED');
  end if;
  if p_locale is null or char_length(p_locale) not between 2 and 20 then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_CATALOG_QUERY');
  end if;
  v_player_id := public.current_player_id();
  if v_player_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'PLAYER_BINDING_REQUIRED');
  end if;
  select
    player.world_id,
    world.latest_snapshot_id,
    world.active_game_data_version_id,
    version.content_hash,
    version.game_build_id,
    version.game_version
  into
    v_world_id,
    v_snapshot_id,
    v_version_id,
    v_content_hash,
    v_game_build_id,
    v_game_version
  from public.players as player
  join public.worlds as world on world.id = player.world_id
  left join public.game_data_versions as version
    on version.id = world.active_game_data_version_id
   and version.status = 'published'
  where player.id = v_player_id;
  if v_world_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'PLAYER_BINDING_REQUIRED');
  end if;
  if v_snapshot_id is null or not exists (
    select 1 from public.inventory_snapshots as snapshot
     where snapshot.id = v_snapshot_id
       and snapshot.world_id = v_world_id
       and snapshot.status = 'published'
  ) then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ACTIVE_INVENTORY_SNAPSHOT_REQUIRED'
    );
  end if;
  if v_version_id is null or v_content_hash is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'PUBLISHED_GAME_DATA_VERSION_REQUIRED'
    );
  end if;

  select
    min(profile.algorithm_version),
    count(distinct profile.algorithm_version)::integer,
    jsonb_object_agg(profile.optimization_mode::text, profile.version)
  into v_algorithm_version, v_algorithm_count, v_profiles
  from public.scoring_profiles as profile
  where profile.is_active;
  if v_algorithm_count <> 1 or jsonb_object_length(coalesce(v_profiles, '{}'::jsonb)) <> 4 then
    return jsonb_build_object(
      'ok', false, 'error_code', 'ACTIVE_SCORING_PROFILE_REQUIRED'
    );
  end if;

  v_status := public.get_inventory_data_status();
  if coalesce((v_status->>'ok')::boolean, false) is not true then
    return v_status;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'pal_id', pal.pal_id,
    'encyclopedia_no', pal.encyclopedia_no,
    'display_name', coalesce(localization.text, pal.pal_id),
    'element_types', pal.element_types
  ) order by pal.encyclopedia_no nulls last, pal.pal_id), '[]'::jsonb)
  into v_pals
  from public.catalog_pals as pal
  left join public.catalog_localizations as localization
    on localization.version_id = pal.version_id
   and localization.locale = p_locale
   and localization.text_key = pal.name_key
  where pal.version_id = v_version_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'passive_skill_id', skill.passive_skill_id,
    'display_name', coalesce(name_localization.text, skill.passive_skill_id),
    'effect_text', effect_localization.text,
    'rank', skill.rank,
    'is_negative', skill.is_negative
  ) order by skill.rank desc, skill.passive_skill_id), '[]'::jsonb)
  into v_passives
  from public.catalog_passive_skills as skill
  left join public.catalog_localizations as name_localization
    on name_localization.version_id = skill.version_id
   and name_localization.locale = p_locale
   and name_localization.text_key = skill.name_key
  left join public.catalog_localizations as effect_localization
    on effect_localization.version_id = skill.version_id
   and effect_localization.locale = p_locale
   and effect_localization.text_key = skill.description_key
  where skill.version_id = v_version_id;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'data_state', v_status #>> '{data,state}',
      'inventory_snapshot_id', v_snapshot_id,
      'game_data_version_id', v_version_id,
      'game_data_content_hash', v_content_hash,
      'game_build_id', coalesce(v_game_build_id, 'unknown'),
      'game_version', coalesce(v_game_version, 'unknown'),
      'algorithm_version', v_algorithm_version,
      'scoring_profile_versions', v_profiles,
      'pals', v_pals,
      'passive_skills', v_passives
    )
  );
end;
$$;

revoke all on function public.get_breeder_form_context(text) from public, anon;
grant execute on function public.get_breeder_form_context(text) to authenticated;

comment on function public.get_breeder_form_context(text) is
  'Authenticated browser-safe breeder form context with localized passive effects and no inventory identities.';
