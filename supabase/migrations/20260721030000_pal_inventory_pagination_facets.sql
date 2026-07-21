create function public.list_available_pals_page_v2(
  p_scope text default 'all',
  p_query text default null,
  p_owner_filter_key text default null,
  p_gender public.pal_gender default null,
  p_passive_skill_id text default null,
  p_location_type public.pal_location_type default null,
  p_share_enabled boolean default null,
  p_snapshot_id uuid default null,
  p_game_data_version_id uuid default null,
  p_page_number integer default 1,
  p_page_size integer default 24
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
  v_guild_id uuid;
  v_latest_snapshot_id uuid;
  v_snapshot_id uuid;
  v_game_data_version_id uuid;
  v_catalog_state text;
  v_query text := nullif(lower(btrim(p_query)), '');
  v_passive_skill_id text := nullif(btrim(p_passive_skill_id), '');
  v_owner_filter_key text := nullif(btrim(p_owner_filter_key), '');
  v_items jsonb;
  v_total_count bigint;
  v_page_number integer;
  v_total_pages integer;
  v_filter_options jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error_code', 'AUTH_REQUIRED');
  end if;
  if p_scope is null or p_scope not in ('all', 'mine', 'shared') then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_PAL_SCOPE');
  end if;
  if p_page_size is null or p_page_size not between 1 and 50
    or p_page_number is null or p_page_number not between 1 and 1000000
    or (p_snapshot_id is null and p_game_data_version_id is not null)
  then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_PAGINATION');
  end if;
  if (p_query is not null and char_length(btrim(p_query)) > 160)
    or (p_passive_skill_id is not null and (
      v_passive_skill_id is null or char_length(v_passive_skill_id) > 120
    ))
    or (p_owner_filter_key is not null and (
      v_owner_filter_key is null or v_owner_filter_key !~ '^[0-9a-f]{64}$'
    ))
  then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_PAL_FILTER');
  end if;

  v_player_id := public.current_player_id();
  if v_player_id is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'PLAYER_BINDING_REQUIRED'
    );
  end if;

  select
    player.world_id,
    player.guild_id,
    world.latest_snapshot_id,
    case when version.status = 'published' then version.id else null end
    into
      v_world_id,
      v_guild_id,
      v_latest_snapshot_id,
      v_game_data_version_id
    from public.players as player
    join public.worlds as world on world.id = player.world_id
    left join public.game_data_versions as version
      on version.id = world.active_game_data_version_id
   where player.id = v_player_id;

  if v_world_id is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'PLAYER_BINDING_REQUIRED'
    );
  end if;
  if p_snapshot_id is not null
    and p_snapshot_id is distinct from v_latest_snapshot_id
  then
    return jsonb_build_object(
      'ok', false, 'error_code', 'INVENTORY_SNAPSHOT_CHANGED'
    );
  end if;
  if p_snapshot_id is not null
    and p_game_data_version_id is distinct from v_game_data_version_id
  then
    return jsonb_build_object(
      'ok', false, 'error_code', 'GAME_DATA_VERSION_CHANGED'
    );
  end if;

  v_snapshot_id := coalesce(p_snapshot_id, v_latest_snapshot_id);
  v_catalog_state := case
    when v_game_data_version_id is null then 'not_configured'
    else 'published'
  end;
  if v_snapshot_id is null then
    return jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
        'snapshot_id', null,
        'game_data_version_id', v_game_data_version_id,
        'catalog_state', v_catalog_state,
        'items', '[]'::jsonb,
        'total_count', 0,
        'page_number', 1,
        'total_pages', 1,
        'filter_options', jsonb_build_object(
          'owners', '[]'::jsonb,
          'genders', '[]'::jsonb,
          'passives', '[]'::jsonb,
          'locations', '[]'::jsonb
        )
      )
    );
  end if;

  with candidates as materialized (
    select
      item.pal_instance_uid,
      item.pal_id,
      pal.encyclopedia_no,
      coalesce(pal_localization.text, item.pal_id) as pal_display_name,
      case
        when v_game_data_version_id is null then 'not_configured'
        when pal.pal_id is null then 'unknown'
        else 'resolved'
      end as catalog_entry_state,
      encode(
        extensions.digest(
          convert_to(item.world_id::text || ':' || item.owner_player_id::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      ) as owner_filter_key,
      owner.nickname as owner_display_name,
      item.gender,
      item.level,
      item.passive_skill_ids,
      passive_names.display_names as passive_display_names,
      passive_names.unknown_ids as unknown_passive_skill_ids,
      item.location_type,
      item.location_name,
      coalesce(preference.share_enabled, true) as share_enabled,
      item.owner_player_id = v_player_id as is_owned_by_requester
    from public.pal_snapshot_items as item
    join public.players as owner on owner.id = item.owner_player_id
    left join public.catalog_pals as pal
      on pal.version_id = v_game_data_version_id
     and pal.pal_id = item.pal_id
    left join public.catalog_localizations as pal_localization
      on pal_localization.version_id = pal.version_id
     and pal_localization.locale = 'zh-CN'
     and pal_localization.text_key = pal.name_key
    left join lateral (
      select
        coalesce(
          array_agg(
            coalesce(passive_localization.text, passive_id.value)
            order by passive_id.ordinality
          ),
          array[]::text[]
        ) as display_names,
        coalesce(
          array_agg(passive_id.value order by passive_id.ordinality)
            filter (where passive.passive_skill_id is null),
          array[]::text[]
        ) as unknown_ids
      from unnest(item.passive_skill_ids) with ordinality
        as passive_id(value, ordinality)
      left join public.catalog_passive_skills as passive
        on passive.version_id = v_game_data_version_id
       and passive.passive_skill_id = passive_id.value
      left join public.catalog_localizations as passive_localization
        on passive_localization.version_id = passive.version_id
       and passive_localization.locale = 'zh-CN'
       and passive_localization.text_key = passive.name_key
    ) as passive_names on true
    left join public.pal_share_preferences as preference
      on preference.world_id = item.world_id
     and preference.pal_instance_uid = item.pal_instance_uid
     and preference.owner_player_id_at_set = item.owner_player_id
    where item.snapshot_id = v_snapshot_id
      and item.world_id = v_world_id
      and (
        (
          p_scope in ('all', 'mine')
          and item.owner_player_id = v_player_id
        )
        or (
          p_scope in ('all', 'shared')
          and item.owner_player_id <> v_player_id
          and item.guild_id is not null
          and item.guild_id = v_guild_id
          and coalesce(preference.share_enabled, true)
        )
      )
  ),
  filtered as materialized (
    select candidate.*
    from candidates as candidate
    where (
        v_query is null
        or lower(candidate.pal_id) like '%' || v_query || '%'
        or lower(candidate.pal_display_name) like '%' || v_query || '%'
        or candidate.encyclopedia_no::text = btrim(p_query)
      )
      and (
        v_owner_filter_key is null
        or candidate.owner_filter_key = v_owner_filter_key
      )
      and (p_gender is null or candidate.gender = p_gender)
      and (
        v_passive_skill_id is null
        or v_passive_skill_id = any(candidate.passive_skill_ids)
      )
      and (p_location_type is null or candidate.location_type = p_location_type)
      and (p_share_enabled is null or candidate.share_enabled = p_share_enabled)
  ),
  pagination as (
    select
      count(*) as total_count,
      greatest(1, ceil(count(*)::numeric / p_page_size)::integer) as total_pages
    from filtered
  ),
  effective_pagination as (
    select
      least(p_page_number, pagination.total_pages) as page_number,
      pagination.total_count,
      pagination.total_pages
    from pagination
  ),
  page as (
    select filtered.*
    from filtered
    order by filtered.pal_id, filtered.pal_instance_uid
    limit p_page_size
    offset (
      select (effective_pagination.page_number - 1) * p_page_size
      from effective_pagination
    )
  ),
  owner_options as (
    select distinct candidate.owner_filter_key as value,
      candidate.owner_display_name as label
    from candidates as candidate
  ),
  gender_options as (
    select distinct candidate.gender as value
    from candidates as candidate
    where candidate.gender <> 'unknown'
  ),
  passive_options as (
    select distinct
      passive_id.value,
      coalesce(localization.text, passive_id.value) as label
    from candidates as candidate
    cross join lateral unnest(candidate.passive_skill_ids) as passive_id(value)
    join public.catalog_passive_skills as passive
      on passive.version_id = v_game_data_version_id
     and passive.passive_skill_id = passive_id.value
    left join public.catalog_localizations as localization
      on localization.version_id = passive.version_id
     and localization.locale = 'zh-CN'
     and localization.text_key = passive.name_key
  ),
  location_options as (
    select distinct candidate.location_type as value
    from candidates as candidate
    where candidate.location_type <> 'unknown'
  )
  select
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'pal_instance_uid', page.pal_instance_uid,
          'pal_id', page.pal_id,
          'encyclopedia_no', page.encyclopedia_no,
          'pal_display_name', page.pal_display_name,
          'catalog_entry_state', page.catalog_entry_state,
          'owner_filter_key', page.owner_filter_key,
          'owner_display_name', page.owner_display_name,
          'gender', page.gender,
          'level', page.level,
          'passive_skill_ids', page.passive_skill_ids,
          'passive_display_names', page.passive_display_names,
          'unknown_passive_skill_ids', page.unknown_passive_skill_ids,
          'location_type', page.location_type,
          'location_name', page.location_name,
          'share_enabled', page.share_enabled,
          'is_owned_by_requester', page.is_owned_by_requester
        ) order by page.pal_id, page.pal_instance_uid
      )
      from page
    ), '[]'::jsonb),
    effective_pagination.total_count,
    effective_pagination.page_number,
    effective_pagination.total_pages,
    jsonb_build_object(
      'owners', coalesce((
        select jsonb_agg(
          jsonb_build_object('value', option.value, 'label', option.label)
          order by option.label, option.value
        )
        from owner_options as option
      ), '[]'::jsonb),
      'genders', coalesce((
        select jsonb_agg(option.value order by option.value::text)
        from gender_options as option
      ), '[]'::jsonb),
      'passives', coalesce((
        select jsonb_agg(
          jsonb_build_object('value', option.value, 'label', option.label)
          order by option.label, option.value
        )
        from passive_options as option
      ), '[]'::jsonb),
      'locations', coalesce((
        select jsonb_agg(option.value order by option.value::text)
        from location_options as option
      ), '[]'::jsonb)
    )
  into
    v_items,
    v_total_count,
    v_page_number,
    v_total_pages,
    v_filter_options
  from effective_pagination;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'snapshot_id', v_snapshot_id,
      'game_data_version_id', v_game_data_version_id,
      'catalog_state', v_catalog_state,
      'items', v_items,
      'total_count', v_total_count,
      'page_number', v_page_number,
      'total_pages', v_total_pages,
      'filter_options', v_filter_options
    )
  );
end;
$$;

revoke all on function public.list_available_pals_page_v2(
  text,
  text,
  text,
  public.pal_gender,
  text,
  public.pal_location_type,
  boolean,
  uuid,
  uuid,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.list_available_pals_page_v2(
  text,
  text,
  text,
  public.pal_gender,
  text,
  public.pal_location_type,
  boolean,
  uuid,
  uuid,
  integer,
  integer
) to authenticated;

comment on function public.list_available_pals_page_v2(
  text,
  text,
  text,
  public.pal_gender,
  text,
  public.pal_location_type,
  boolean,
  uuid,
  uuid,
  integer,
  integer
) is
  'Returns random-access inventory pages and valid full-pool filter facets, bound to one authorized snapshot and published catalog version.';
