create function private.breeding_parent_view(
  p_parent jsonb,
  p_snapshot_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (p_parent - 'owner_player_id' - 'guild_id') || jsonb_build_object(
    'owner_display_name',
    case p_parent->>'source_type'
      when 'intermediate' then '中间产物'
      when 'missing' then '缺少：需补充库存'
      else coalesce(
        (
          select player.nickname
          from public.players as player
          where player.id = nullif(p_parent->>'owner_player_id', '')::uuid
        ),
        (
          select guild.name
          from public.guilds as guild
          where guild.id = nullif(p_parent->>'guild_id', '')::uuid
        ),
        '未知所有者'
      )
    end,
    'required_passive_ids',
    case when p_parent->>'source_type' = 'missing'
      then '[]'::jsonb
      else coalesce(p_parent->'required_passive_ids', '[]'::jsonb)
    end,
    'location_type',
    case when p_parent->>'source_type' = 'inventory'
      then (
        select item.location_type::text
        from public.pal_snapshot_items as item
        where item.snapshot_id = p_snapshot_id
          and item.pal_instance_uid = p_parent->>'instance_uid'
      )
      else nullif(p_parent->>'location_type', '')
    end,
    'location_name',
    case when p_parent->>'source_type' = 'inventory'
      then (
        select item.location_name
        from public.pal_snapshot_items as item
        where item.snapshot_id = p_snapshot_id
          and item.pal_instance_uid = p_parent->>'instance_uid'
      )
      else nullif(p_parent->>'location_name', '')
    end,
    'location_slot_index',
    case when p_parent->>'source_type' = 'inventory'
      then (
        select item.location_slot_index
        from public.pal_snapshot_items as item
        where item.snapshot_id = p_snapshot_id
          and item.pal_instance_uid = p_parent->>'instance_uid'
      )
      else nullif(p_parent->>'location_slot_index', '')::integer
    end
  );
$$;

create function private.breeding_route_view(
  p_route jsonb,
  p_snapshot_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_step jsonb;
  v_steps jsonb := '[]'::jsonb;
begin
  for v_step in
    select value
    from jsonb_array_elements(coalesce(p_route->'steps', '[]'::jsonb))
  loop
    v_step := jsonb_set(
      jsonb_set(
        v_step,
        '{parent_a}',
        private.breeding_parent_view(v_step->'parent_a', p_snapshot_id)
      ),
      '{parent_b}',
      private.breeding_parent_view(v_step->'parent_b', p_snapshot_id)
    );
    v_steps := v_steps || jsonb_build_array(v_step);
  end loop;

  return jsonb_set(p_route, '{steps}', v_steps) || jsonb_build_object(
    'feasibility_status', coalesce(p_route->>'feasibility_status', 'ready'),
    'adoptable', coalesce((p_route->>'adoptable')::boolean, true),
    'missing_pal_count', coalesce((p_route->>'missing_pal_count')::integer, 0),
    'missing_requirements', coalesce(p_route->'missing_requirements', '[]'::jsonb),
    'missing_passive_ids', coalesce(p_route->'missing_passive_ids', '[]'::jsonb),
    'passive_sources', coalesce(p_route->'passive_sources', '[]'::jsonb),
    'inventory_passive_coverage',
      coalesce((p_route->>'inventory_passive_coverage')::numeric, 1)
  );
end;
$$;

do $migration$
declare
  v_function regprocedure :=
    'public.get_breeding_job_detail(uuid)'::regprocedure;
  v_definition text := pg_get_functiondef(v_function);
  v_original text := v_definition;
begin
  v_definition := replace(
    v_definition,
    'private.breeding_route_view(route.route_payload)',
    'private.breeding_route_view(route.route_payload, v_job.inventory_snapshot_id)'
  );
  if v_definition = v_original then
    raise exception using
      errcode = 'P0001',
      message = 'BREEDING_LOCATION_PROJECTION_PATCH_FAILED';
  end if;
  execute v_definition;
end;
$migration$;

create or replace function public.get_execution_plan_detail(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan public.execution_plans%rowtype;
  v_steps jsonb;
  v_candidates jsonb;
  v_events jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error_code', 'AUTH_REQUIRED');
  end if;

  select *
  into v_plan
  from public.execution_plans
  where id = p_plan_id
    and (requester_user_id = auth.uid() or public.is_admin());

  if v_plan.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'PLAN_NOT_FOUND');
  end if;
  if not exists (
    select 1
    from public.game_data_versions
    where id = v_plan.game_data_version_id
      and content_hash = v_plan.content_hash
  ) then
    return jsonb_build_object(
      'ok',
      false,
      'error_code',
      'PLAN_FIXED_VERSION_UNAVAILABLE'
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'step_id', step.id,
    'step_index', step.step_index,
    'parent_a_source_kind', step.parent_a_source_kind,
    'parent_a_instance_uid', step.parent_a_instance_uid,
    'parent_a_step_index', step.parent_a_step_index,
    'parent_a_location_type', parent_a_item.location_type,
    'parent_a_location_name', parent_a_item.location_name,
    'parent_a_location_slot_index', parent_a_item.location_slot_index,
    'parent_b_source_kind', step.parent_b_source_kind,
    'parent_b_instance_uid', step.parent_b_instance_uid,
    'parent_b_step_index', step.parent_b_step_index,
    'parent_b_location_type', parent_b_item.location_type,
    'parent_b_location_name', parent_b_item.location_name,
    'parent_b_location_slot_index', parent_b_item.location_slot_index,
    'expected_child_pal_id', step.expected_child_pal_id,
    'required_passive_ids', step.required_passive_ids,
    'preferred_gender', step.preferred_gender,
    'selected_child_instance_uid', step.selected_child_instance_uid,
    'baseline_snapshot_id', step.baseline_snapshot_id,
    'candidate_detection_started_at', step.candidate_detection_started_at,
    'attempt_number', step.attempt_number,
    'status', step.status,
    'concurrency_version', step.concurrency_version,
    'skip_reason', step.skip_reason,
    'invalidation_reasons', step.invalidation_reasons,
    'completed_at', step.completed_at
  ) order by step.step_index), '[]'::jsonb)
  into v_steps
  from public.breeding_steps as step
  left join public.pal_snapshot_items as parent_a_item
    on step.parent_a_source_kind = 'inventory'
   and parent_a_item.snapshot_id = v_plan.inventory_snapshot_id
   and parent_a_item.pal_instance_uid = step.parent_a_instance_uid
  left join public.pal_snapshot_items as parent_b_item
    on step.parent_b_source_kind = 'inventory'
   and parent_b_item.snapshot_id = v_plan.inventory_snapshot_id
   and parent_b_item.pal_instance_uid = step.parent_b_instance_uid
  where step.execution_plan_id = v_plan.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'candidate_key', candidate.candidate_key,
    'step_id', candidate.step_id,
    'pal_instance_uid', candidate.pal_instance_uid,
    'detected_snapshot_id', candidate.detected_snapshot_id,
    'pal_id', candidate.pal_id,
    'pal_display_name', coalesce((
      select localization.text
      from public.catalog_pals pal
      left join public.catalog_localizations localization
        on localization.version_id = pal.version_id
       and localization.locale = 'zh-CN'
       and localization.text_key = pal.name_key
      where pal.version_id = v_plan.game_data_version_id
        and pal.pal_id = candidate.pal_id
    ), candidate.pal_id),
    'species_match', candidate.species_match,
    'matched_passive_ids', candidate.matched_passive_ids,
    'required_passive_count', candidate.required_passive_count,
    'gender', candidate.gender,
    'level', candidate.level,
    'owner_display_name', candidate.owner_display_name,
    'location_type',
      coalesce(candidate_item.location_type::text, candidate.location_type),
    'location_name', candidate_item.location_name,
    'location_slot_index', candidate_item.location_slot_index,
    'accessible', candidate.accessible,
    'match_score', candidate.match_score::float8,
    'match_breakdown', candidate.match_breakdown,
    'first_detected_at', candidate.first_detected_at,
    'confirmed', candidate.confirmed,
    'rejected_at', candidate.rejected_at,
    'rejection_reason', candidate.rejection_reason
  ) order by
    candidate.match_score desc,
    candidate.first_detected_at,
    candidate.pal_instance_uid
  ), '[]'::jsonb)
  into v_candidates
  from public.step_offspring_candidates as candidate
  join public.breeding_steps as step on step.id = candidate.step_id
  left join public.pal_snapshot_items as candidate_item
    on candidate_item.snapshot_id = candidate.detected_snapshot_id
   and candidate_item.pal_instance_uid = candidate.pal_instance_uid
  where step.execution_plan_id = v_plan.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', event.id,
    'step_id', event.step_id,
    'event_type', event.event_type,
    'actor_kind', event.actor_kind,
    'actor_display_name', coalesce(
      profile.display_name,
      case event.actor_kind
        when 'agent' then 'Agent'
        when 'system' then '系统'
        else '未知操作人'
      end
    ),
    'from_status', event.from_status,
    'to_status', event.to_status,
    'safe_metadata', event.safe_metadata,
    'created_at', event.created_at
  ) order by event.created_at, event.id), '[]'::jsonb)
  into v_events
  from public.execution_plan_events as event
  left join public.profiles as profile on profile.id = event.actor_user_id
  where event.plan_id = v_plan.id;

  return jsonb_build_object(
    'ok',
    true,
    'data',
    jsonb_build_object(
      'summary', private.execution_plan_summary(v_plan),
      'adopted_route_id', v_plan.adopted_route_id,
      'invalidation_reasons', v_plan.invalidation_reasons,
      'steps', v_steps,
      'candidates', v_candidates,
      'events', v_events
    )
  );
end;
$$;

revoke all on function private.breeding_parent_view(jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.breeding_route_view(jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_execution_plan_detail(uuid)
  from public, anon;
grant execute on function public.get_execution_plan_detail(uuid)
  to authenticated;

comment on function private.breeding_parent_view(jsonb, uuid) is
  'Projects route parents with location facts from the route-pinned inventory snapshot.';
comment on function public.get_execution_plan_detail(uuid) is
  'Returns plan parents and candidates with snapshot-pinned location slot facts.';
