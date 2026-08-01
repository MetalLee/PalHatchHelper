create or replace function public.get_inventory_data_status()
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
  v_last_heartbeat_at timestamptz;
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

  select max(device.last_seen_at)
    into v_last_heartbeat_at
    from public.sync_devices as device
   where device.world_id = v_world_id
     and device.revoked_at is null;

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
  elsif coalesce(
    v_last_heartbeat_at,
    v_source_modified_at,
    v_published_captured_at
  ) < now() - interval '15 minutes' then
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
      'last_heartbeat_at', v_last_heartbeat_at,
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

comment on function public.get_inventory_data_status() is
  'Returns browser-safe inventory freshness based on the latest active Sync device heartbeat, while preserving snapshot and parse facts separately.';
