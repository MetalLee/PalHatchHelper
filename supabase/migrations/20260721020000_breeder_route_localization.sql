create or replace function public.get_breeding_job_detail(p_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.breeding_jobs%rowtype;
  v_plan jsonb;
  v_localization jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error_code', 'AUTH_REQUIRED');
  end if;

  select * into v_job
  from public.breeding_jobs as job
  where job.id = p_job_id
    and (job.requester_user_id = auth.uid() or public.is_admin());

  if v_job.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'JOB_NOT_FOUND');
  end if;

  select jsonb_build_object(
    'locale', 'zh-CN',
    'pals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pal_id', pal.pal_id,
        'display_name', coalesce(localization.text, pal.pal_id)
      ) order by pal.encyclopedia_no nulls last, pal.pal_id)
      from public.catalog_pals as pal
      left join public.catalog_localizations as localization
        on localization.version_id = pal.version_id
       and localization.locale = 'zh-CN'
       and localization.text_key = pal.name_key
      where pal.version_id = v_job.game_data_version_id
    ), '[]'::jsonb),
    'passive_skills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'passive_skill_id', skill.passive_skill_id,
        'display_name', coalesce(localization.text, skill.passive_skill_id)
      ) order by skill.rank desc, skill.passive_skill_id)
      from public.catalog_passive_skills as skill
      left join public.catalog_localizations as localization
        on localization.version_id = skill.version_id
       and localization.locale = 'zh-CN'
       and localization.text_key = skill.name_key
      where skill.version_id = v_job.game_data_version_id
    ), '[]'::jsonb)
  ) into v_localization;

  select jsonb_build_object(
    'plan_id', plan.id,
    'result_digest', plan.result_digest,
    'route_count', plan.route_count,
    'explanation_codes', plan.explanation_codes,
    'diagnostics', plan.diagnostics,
    'ai', jsonb_build_object(
      'provider', plan.ai_provider,
      'model', plan.ai_model,
      'explanation', plan.ai_explanation,
      'degraded', plan.ai_degraded
    ),
    'routes', coalesce((
      select jsonb_agg(
        private.breeding_route_view(route.route_payload) || jsonb_build_object(
          'route_id', route.id,
          'execution_plan_id', execution.id,
          'ai_explanation', route.ai_explanation,
          'ai_labels', route.ai_labels
        ) order by route.rank
      )
      from public.breeding_routes as route
      left join public.execution_plans as execution
        on execution.adopted_route_id = route.id
      where route.plan_id = plan.id
    ), '[]'::jsonb)
  ) into v_plan
  from public.breeding_plans as plan
  where plan.job_id = v_job.id;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'job_id', v_job.id,
      'status', v_job.status,
      'target_pal_id', v_job.target_pal_id,
      'desired_passive_ids', v_job.desired_passive_ids,
      'optimization_mode', v_job.optimization_mode,
      'allow_guild_shared', v_job.allow_guild_shared,
      'max_generations', v_job.max_generations,
      'inventory_snapshot_id', v_job.inventory_snapshot_id,
      'game_data_version_id', v_job.game_data_version_id,
      'game_data_content_hash', v_job.game_data_content_hash,
      'algorithm_version', v_job.algorithm_version,
      'scoring_profile_version', v_job.scoring_profile_version,
      'localization', v_localization,
      'attempt_count', v_job.attempt_count,
      'error_code', v_job.error_code,
      'created_at', v_job.created_at,
      'completed_at', v_job.completed_at,
      'plan', v_plan
    )
  );
end;
$$;

revoke all on function public.get_breeding_job_detail(uuid) from public, anon;
grant execute on function public.get_breeding_job_detail(uuid) to authenticated;

comment on function public.get_breeding_job_detail(uuid) is
  'Owner-filtered route comparison with zh-CN names from the job-pinned catalog version.';
