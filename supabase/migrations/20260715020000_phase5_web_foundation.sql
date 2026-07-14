create function public.list_available_pals_page(
  p_scope text default 'all',
  p_query text default null,
  p_owner_filter_key text default null,
  p_gender public.pal_gender default null,
  p_passive_skill_id text default null,
  p_location_type public.pal_location_type default null,
  p_share_enabled boolean default null,
  p_snapshot_id uuid default null,
  p_game_data_version_id uuid default null,
  p_after_pal_id text default null,
  p_after_instance_uid text default null,
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
  v_has_more boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error_code', 'AUTH_REQUIRED');
  end if;
  if p_scope is null or p_scope not in ('all', 'mine', 'shared') then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_PAL_SCOPE');
  end if;
  if p_page_size is null or p_page_size not between 1 and 50
    or num_nulls(p_snapshot_id, p_after_pal_id, p_after_instance_uid) not in (0, 3)
    or (p_game_data_version_id is not null and p_after_pal_id is null)
    or (p_after_pal_id is not null and char_length(p_after_pal_id) not between 1 and 120)
    or (p_after_instance_uid is not null and char_length(p_after_instance_uid) not between 1 and 160)
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
  if p_after_pal_id is not null
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
        'has_more', false
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
      item.owner_player_id,
      encode(
        extensions.digest(
          convert_to(item.world_id::text || ':' || item.owner_player_id::text, 'UTF8'),
          'sha256'
        ),
        'hex'
      ) as owner_filter_key,
      coalesce(owner_profile.display_name, owner.nickname) as owner_display_name,
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
    left join public.player_bindings as owner_binding
      on owner_binding.player_id = owner.id
    left join public.profiles as owner_profile
      on owner_profile.id = owner_binding.user_id
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
  remaining as materialized (
    select filtered.*
    from filtered
    where p_after_pal_id is null
       or (filtered.pal_id, filtered.pal_instance_uid)
          > (p_after_pal_id, p_after_instance_uid)
  ),
  page as (
    select remaining.*
    from remaining
    order by remaining.pal_id, remaining.pal_instance_uid
    limit p_page_size
  )
  select
    coalesce(
      (
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
      ),
      '[]'::jsonb
    ),
    (select count(*) from filtered),
    (select count(*) > p_page_size from remaining)
  into v_items, v_total_count, v_has_more;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'snapshot_id', v_snapshot_id,
      'game_data_version_id', v_game_data_version_id,
      'catalog_state', v_catalog_state,
      'items', v_items,
      'total_count', v_total_count,
      'has_more', v_has_more
    )
  );
end;
$$;

create function public.get_inventory_data_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_player_id uuid;
  v_world_id uuid;
  v_latest_snapshot_id uuid;
  v_published_captured_at timestamptz;
  v_source_modified_at timestamptz;
  v_parser_name text;
  v_parser_version text;
  v_attempt_id uuid;
  v_attempt_status public.inventory_snapshot_status;
  v_attempt_at timestamptz;
  v_attempt_error_code text;
  v_state text;
  v_game_data_state text;
  v_game_data_version_id uuid;
  v_game_data_status public.game_data_status;
  v_game_data_source_id uuid;
  v_game_data_imported_at timestamptz;
  v_game_build_id text;
  v_game_version text;
  v_candidate_status public.game_data_status;
  v_algorithm_version text;
  v_algorithm_count integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error_code', 'AUTH_REQUIRED');
  end if;

  v_player_id := public.current_player_id();
  if v_player_id is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'PLAYER_BINDING_REQUIRED'
    );
  end if;

  select
    player.world_id,
    world.latest_snapshot_id,
    world.active_game_data_version_id,
    version.status,
    version.source_id,
    version.imported_at,
    version.game_build_id,
    version.game_version
  into
    v_world_id,
    v_latest_snapshot_id,
    v_game_data_version_id,
    v_game_data_status,
    v_game_data_source_id,
    v_game_data_imported_at,
    v_game_build_id,
    v_game_version
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

  select
    snapshot.captured_at,
    snapshot.source_modified_at,
    snapshot.parser_name,
    snapshot.parser_version
  into
    v_published_captured_at,
    v_source_modified_at,
    v_parser_name,
    v_parser_version
  from public.inventory_snapshots as snapshot
  where snapshot.id = v_latest_snapshot_id
    and snapshot.world_id = v_world_id
    and snapshot.status = 'published';

  select snapshot.id, snapshot.status, snapshot.captured_at, snapshot.error_code
    into v_attempt_id, v_attempt_status, v_attempt_at, v_attempt_error_code
    from public.inventory_snapshots as snapshot
   where snapshot.world_id = v_world_id
   order by snapshot.captured_at desc, snapshot.created_at desc, snapshot.id desc
   limit 1;

  if v_latest_snapshot_id is null or v_published_captured_at is null then
    v_state := 'empty';
  elsif v_attempt_status in ('failed', 'rejected')
    and v_attempt_id <> v_latest_snapshot_id
    and v_attempt_at >= v_published_captured_at
  then
    v_state := 'parse_error';
  elsif v_source_modified_at < now() - interval '15 minutes' then
    v_state := 'stale';
  else
    v_state := 'healthy';
  end if;

  if v_game_data_version_id is null then
    v_game_data_state := 'not_configured';
  elsif v_game_data_status is distinct from 'published' then
    v_game_data_state := 'blocked';
  else
    select version.status
      into v_candidate_status
      from public.game_data_versions as version
     where version.id <> v_game_data_version_id
       and version.source_id is not distinct from v_game_data_source_id
       and version.imported_at > v_game_data_imported_at
       and version.status <> 'published'
     order by version.imported_at desc, version.id desc
     limit 1;
    if v_candidate_status in ('extracting', 'staging', 'validated') then
      v_game_data_state := 'review_pending';
    elsif v_candidate_status = 'rejected' then
      v_game_data_state := 'blocked';
    else
      v_game_data_state := 'published';
    end if;
  end if;

  select min(profile.algorithm_version), count(distinct profile.algorithm_version)::integer
    into v_algorithm_version, v_algorithm_count
    from public.scoring_profiles as profile
   where profile.is_active;
  if v_algorithm_count <> 1 then
    v_algorithm_version := null;
    if v_game_data_state = 'published' then
      v_game_data_state := 'blocked';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'state', v_state,
      'snapshot_id', v_latest_snapshot_id,
      'captured_at', v_published_captured_at,
      'source_modified_at', v_source_modified_at,
      'parser_name', v_parser_name,
      'parser_version', v_parser_version,
      'last_attempt_at', v_attempt_at,
      'error_code', case
        when v_state = 'parse_error' then v_attempt_error_code else null
      end,
      'using_previous_snapshot',
        v_state = 'parse_error' and v_latest_snapshot_id is not null,
      'game_data_state', v_game_data_state,
      'game_data_version_id', v_game_data_version_id,
      'game_build_id', v_game_build_id,
      'game_version', v_game_version,
      'algorithm_version', v_algorithm_version
    )
  );
end;
$$;

create function public.set_pal_share_enabled_for_web(
  p_pal_instance_uid text,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_player_id uuid;
  v_owned boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error_code', 'AUTH_REQUIRED');
  end if;
  if p_pal_instance_uid is null
    or char_length(btrim(p_pal_instance_uid)) not between 1 and 160
    or p_enabled is null
  then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_PAL_FILTER');
  end if;

  v_player_id := public.current_player_id();
  if v_player_id is null then
    return jsonb_build_object(
      'ok', false, 'error_code', 'PLAYER_BINDING_REQUIRED'
    );
  end if;

  select true into v_owned
    from public.pal_snapshot_items as item
    join public.worlds as world
      on world.id = item.world_id
     and world.latest_snapshot_id = item.snapshot_id
    join public.inventory_snapshots as snapshot
      on snapshot.id = item.snapshot_id
     and snapshot.status = 'published'
   where item.pal_instance_uid = btrim(p_pal_instance_uid)
     and item.owner_player_id = v_player_id;
  if not coalesce(v_owned, false) then
    return jsonb_build_object('ok', false, 'error_code', 'PAL_NOT_OWNED');
  end if;

  perform public.set_pal_share_enabled(btrim(p_pal_instance_uid), p_enabled);
  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'pal_instance_uid', btrim(p_pal_instance_uid),
      'share_enabled', p_enabled
    )
  );
end;
$$;

revoke all on function public.list_available_pals_page(
  text,
  text,
  text,
  public.pal_gender,
  text,
  public.pal_location_type,
  boolean,
  uuid,
  uuid,
  text,
  text,
  integer
) from public, anon, authenticated;
revoke all on function public.get_inventory_data_status()
  from public, anon, authenticated;
revoke all on function public.set_pal_share_enabled_for_web(text, boolean)
  from public, anon, authenticated;

grant execute on function public.list_available_pals_page(
  text,
  text,
  text,
  public.pal_gender,
  text,
  public.pal_location_type,
  boolean,
  uuid,
  uuid,
  text,
  text,
  integer
) to authenticated;
grant execute on function public.get_inventory_data_status()
  to authenticated;
grant execute on function public.set_pal_share_enabled_for_web(text, boolean)
  to authenticated;

comment on function public.list_available_pals_page(
  text,
  text,
  text,
  public.pal_gender,
  text,
  public.pal_location_type,
  boolean,
  uuid,
  uuid,
  text,
  text,
  integer
) is
  'Phase 5 structured browser-safe inventory projection resolved against one active published game-data version, with snapshot/catalog cursor checks, opaque owner facets and no internal owner/guild/per-row snapshot UUIDs.';
comment on function public.get_inventory_data_status() is
  'Phase 5 structured browser-safe inventory, active game-data and deterministic algorithm summary; paths, source hashes and error details are excluded.';
comment on function public.set_pal_share_enabled_for_web(text, boolean) is
  'Phase 5 structured browser mutation wrapper; current latest-snapshot ownership is rechecked before delegating to the canonical sharing RPC.';
