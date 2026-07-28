alter table public.breeding_jobs
  add column locale text not null default 'zh-CN',
  add constraint breeding_jobs_locale_check
    check (locale in ('zh-CN', 'en-US'));

create function public.create_breeding_job_v3(
  p_target_pal_id text,
  p_desired_passive_ids text[] default '{}',
  p_optimization_mode public.optimization_mode default 'balanced',
  p_allow_guild_shared boolean default true,
  p_max_generations integer default 5,
  p_locale text default 'zh-CN'
)
returns table (job_id uuid, reused boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job_id uuid;
  v_reused boolean;
begin
  if p_locale not in ('zh-CN', 'en-US') then
    raise exception using errcode = 'P0001', message = 'INVALID_LOCALE';
  end if;

  select created.job_id, created.reused
    into v_job_id, v_reused
    from public.create_breeding_job_v2(
      p_target_pal_id,
      p_desired_passive_ids,
      p_optimization_mode,
      p_allow_guild_shared,
      p_max_generations
    ) as created;

  update public.breeding_jobs as job
     set locale = p_locale
   where job.id = v_job_id
     and job.requester_user_id = auth.uid()
     and not v_reused;
  job_id := v_job_id;
  reused := v_reused;
  return next;
end;
$$;

create function public.list_available_pals_page_v4(
  p_scope text default 'all',
  p_query text default null,
  p_owner_filter_key text default null,
  p_gender public.pal_gender default null,
  p_passive_skill_ids text[] default '{}',
  p_location_type public.pal_location_type default null,
  p_share_enabled boolean default null,
  p_snapshot_id uuid default null,
  p_game_data_version_id uuid default null,
  p_page_number integer default 1,
  p_page_size integer default 24,
  p_locale text default 'zh-CN'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_version_id uuid;
  v_fallback text;
  v_items jsonb;
  v_passives jsonb;
begin
  if p_locale not in ('zh-CN', 'en-US') then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_LOCALE');
  end if;
  v_fallback := case when p_locale = 'en-US' then 'Name unavailable' else '名称暂不可用' end;
  v_result := public.list_available_pals_page_v3(
    p_scope,
    p_query,
    p_owner_filter_key,
    p_gender,
    p_passive_skill_ids,
    p_location_type,
    p_share_enabled,
    p_snapshot_id,
    p_game_data_version_id,
    p_page_number,
    p_page_size
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    return v_result;
  end if;
  v_version_id := (v_result #>> '{data,game_data_version_id}')::uuid;

  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'pal_display_name', coalesce((
        select localization.text
          from public.catalog_pals pal
          join public.catalog_localizations localization
            on localization.version_id = pal.version_id
           and localization.locale = p_locale
           and localization.text_key = pal.name_key
         where pal.version_id = v_version_id
           and pal.pal_id = item->>'pal_id'
      ), v_fallback),
      'passive_display_names', coalesce((
        select jsonb_agg(coalesce(localization.text, v_fallback) order by passive.ordinality)
          from jsonb_array_elements_text(coalesce(item->'passive_skill_ids', '[]'::jsonb))
            with ordinality passive(passive_id, ordinality)
          left join public.catalog_passive_skills skill
            on skill.version_id = v_version_id
           and skill.passive_skill_id = passive.passive_id
          left join public.catalog_localizations localization
            on localization.version_id = skill.version_id
           and localization.locale = p_locale
           and localization.text_key = skill.name_key
      ), '[]'::jsonb)
    ) order by item_index
  ), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(coalesce(v_result #> '{data,items}', '[]'::jsonb))
      with ordinality page_item(item, item_index);

  select coalesce(jsonb_agg(
    option || jsonb_build_object(
      'label', coalesce((
        select localization.text
          from public.catalog_passive_skills skill
          join public.catalog_localizations localization
            on localization.version_id = skill.version_id
           and localization.locale = p_locale
           and localization.text_key = skill.name_key
         where skill.version_id = v_version_id
           and skill.passive_skill_id = option->>'value'
      ), v_fallback)
    ) order by option_index
  ), '[]'::jsonb)
    into v_passives
    from jsonb_array_elements(coalesce(
      v_result #> '{data,filter_options,passives}', '[]'::jsonb
    )) with ordinality passive_option(option, option_index);

  v_result := jsonb_set(v_result, '{data,items}', v_items, false);
  v_result := jsonb_set(v_result, '{data,filter_options,passives}', v_passives, false);
  return v_result;
end;
$$;

create function public.get_breeder_form_context_v2(
  p_locale text default 'zh-CN'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_fallback text;
  v_effect_fallback text;
  v_pals jsonb;
  v_passives jsonb;
begin
  if p_locale not in ('zh-CN', 'en-US') then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_LOCALE');
  end if;
  v_fallback := case when p_locale = 'en-US' then 'Name unavailable' else '名称暂不可用' end;
  v_effect_fallback := case when p_locale = 'en-US' then 'Effect unavailable' else '效果暂不可用' end;
  v_result := public.get_breeder_form_context(p_locale);
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    return v_result;
  end if;

  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'display_name', case
        when nullif(btrim(item->>'display_name'), '') is null
          or item->>'display_name' = item->>'pal_id'
        then v_fallback else item->>'display_name' end
    ) order by item_index
  ), '[]'::jsonb)
    into v_pals
    from jsonb_array_elements(coalesce(v_result #> '{data,pals}', '[]'::jsonb))
      with ordinality pal_item(item, item_index);

  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'display_name', case
        when nullif(btrim(item->>'display_name'), '') is null
          or item->>'display_name' = item->>'passive_skill_id'
        then v_fallback else item->>'display_name' end,
      'effect_text', coalesce(nullif(btrim(item->>'effect_text'), ''), v_effect_fallback)
    ) order by item_index
  ), '[]'::jsonb)
    into v_passives
    from jsonb_array_elements(coalesce(v_result #> '{data,passive_skills}', '[]'::jsonb))
      with ordinality passive_item(item, item_index);

  v_result := jsonb_set(v_result, '{data,pals}', v_pals, false);
  return jsonb_set(v_result, '{data,passive_skills}', v_passives, false);
end;
$$;

create function public.get_breeding_job_detail_v2(
  p_job_id uuid,
  p_locale text default 'zh-CN'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_version_id uuid;
  v_job_locale text;
  v_fallback text;
  v_localization jsonb;
  v_routes jsonb;
  v_overall text;
begin
  if p_locale not in ('zh-CN', 'en-US') then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_LOCALE');
  end if;
  v_result := public.get_breeding_job_detail(p_job_id);
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    return v_result;
  end if;
  v_version_id := (v_result #>> '{data,game_data_version_id}')::uuid;
  select job.locale into v_job_locale
    from public.breeding_jobs job where job.id = p_job_id;
  v_fallback := case when p_locale = 'en-US' then 'Name unavailable' else '名称暂不可用' end;

  select jsonb_build_object(
    'locale', p_locale,
    'pals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pal_id', pal.pal_id,
        'display_name', coalesce(localization.text, v_fallback)
      ) order by pal.encyclopedia_no nulls last, pal.pal_id)
      from public.catalog_pals pal
      left join public.catalog_localizations localization
        on localization.version_id = pal.version_id
       and localization.locale = p_locale
       and localization.text_key = pal.name_key
      where pal.version_id = v_version_id
    ), '[]'::jsonb),
    'passive_skills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'passive_skill_id', skill.passive_skill_id,
        'display_name', coalesce(localization.text, v_fallback),
        'rank', skill.rank,
        'is_negative', skill.is_negative
      ) order by skill.rank desc, skill.passive_skill_id)
      from public.catalog_passive_skills skill
      left join public.catalog_localizations localization
        on localization.version_id = skill.version_id
       and localization.locale = p_locale
       and localization.text_key = skill.name_key
      where skill.version_id = v_version_id
    ), '[]'::jsonb)
  ) into v_localization;
  v_result := jsonb_set(v_result, '{data,localization}', v_localization, false);

  if v_job_locale is distinct from p_locale
     and jsonb_typeof(v_result #> '{data,plan}') = 'object' then
    v_overall := case when p_locale = 'en-US' then
      'This is a localized deterministic summary. Recipes, scores and instance assignments are unchanged.'
    else
      '这是本地化的确定性结果摘要；配方、分数和实例分配均未改变。'
    end;
    v_result := jsonb_set(v_result, '{data,plan,ai,explanation}', to_jsonb(v_overall), true);
    select coalesce(jsonb_agg(
      route || jsonb_build_object(
        'ai_explanation', case when p_locale = 'en-US' then
          format('Route %s takes %s generations and borrows %s Pals.',
            route->>'rank', route->>'generation_count', route->>'borrowed_pal_count')
        else
          format('第 %s 条路线需要 %s 代，借用 %s 只帕鲁。',
            route->>'rank', route->>'generation_count', route->>'borrowed_pal_count')
        end,
        'ai_labels', jsonb_build_array(
          case when p_locale = 'en-US' then 'Deterministic route' else '确定性路线' end,
          case
            when coalesce((route->>'borrowed_pal_count')::integer, 0) = 0
              then case when p_locale = 'en-US' then 'No borrowing' else '无需借用' end
            else case when p_locale = 'en-US' then 'Guild borrowing' else '包含公会借用' end
          end
        )
      ) order by route_index
    ), '[]'::jsonb)
      into v_routes
      from jsonb_array_elements(coalesce(v_result #> '{data,plan,routes}', '[]'::jsonb))
        with ordinality plan_route(route, route_index);
    v_result := jsonb_set(v_result, '{data,plan,routes}', v_routes, false);
  end if;
  return v_result;
end;
$$;

create function public.list_saved_breeding_plans_v2(
  p_limit integer default 20,
  p_cursor_saved_at timestamptz default null,
  p_cursor_route_id uuid default null,
  p_query_boundary timestamptz default null,
  p_locale text default 'zh-CN'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_items jsonb;
  v_fallback text;
begin
  if p_locale not in ('zh-CN', 'en-US') then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_LOCALE');
  end if;
  v_fallback := case when p_locale = 'en-US' then 'Name unavailable' else '名称暂不可用' end;
  v_result := public.list_saved_breeding_plans(
    p_limit,
    p_cursor_saved_at,
    p_cursor_route_id,
    p_query_boundary
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    return v_result;
  end if;

  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'target_pal_display_name', coalesce((
        select localization.text
          from public.breeding_routes route
          join public.breeding_plans plan on plan.id = route.plan_id
          join public.breeding_jobs job on job.id = plan.job_id
          join public.catalog_pals pal
            on pal.version_id = job.game_data_version_id
           and pal.pal_id = item->>'target_pal_id'
          join public.catalog_localizations localization
            on localization.version_id = pal.version_id
           and localization.locale = p_locale
           and localization.text_key = pal.name_key
         where route.id = (item->>'route_id')::uuid
      ), v_fallback),
      'desired_passive_display_names', coalesce((
        select jsonb_agg(coalesce(localization.text, v_fallback) order by passive.ordinality)
          from jsonb_array_elements_text(coalesce(item->'desired_passive_ids', '[]'::jsonb))
            with ordinality passive(passive_id, ordinality)
          join public.breeding_routes route on route.id = (item->>'route_id')::uuid
          join public.breeding_plans plan on plan.id = route.plan_id
          join public.breeding_jobs job on job.id = plan.job_id
          left join public.catalog_passive_skills skill
            on skill.version_id = job.game_data_version_id
           and skill.passive_skill_id = passive.passive_id
          left join public.catalog_localizations localization
            on localization.version_id = skill.version_id
           and localization.locale = p_locale
           and localization.text_key = skill.name_key
      ), '[]'::jsonb),
      'desired_passives', coalesce((
        select jsonb_agg(jsonb_build_object(
          'passive_skill_id', passive.passive_id,
          'display_name', coalesce(localization.text, v_fallback),
          'rank', skill.rank,
          'is_negative', skill.is_negative
        ) order by passive.ordinality)
          from jsonb_array_elements_text(coalesce(item->'desired_passive_ids', '[]'::jsonb))
            with ordinality passive(passive_id, ordinality)
          join public.breeding_routes route on route.id = (item->>'route_id')::uuid
          join public.breeding_plans plan on plan.id = route.plan_id
          join public.breeding_jobs job on job.id = plan.job_id
          left join public.catalog_passive_skills skill
            on skill.version_id = job.game_data_version_id
           and skill.passive_skill_id = passive.passive_id
          left join public.catalog_localizations localization
            on localization.version_id = skill.version_id
           and localization.locale = p_locale
           and localization.text_key = skill.name_key
      ), '[]'::jsonb)
    ) order by item_index
  ), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(coalesce(v_result #> '{data,items}', '[]'::jsonb))
      with ordinality saved_item(item, item_index);
  return jsonb_set(v_result, '{data,items}', v_items, false);
end;
$$;

revoke all on function public.create_breeding_job_v3(
  text, text[], public.optimization_mode, boolean, integer, text
) from public, anon;
revoke all on function public.list_available_pals_page_v4(
  text, text, text, public.pal_gender, text[], public.pal_location_type,
  boolean, uuid, uuid, integer, integer, text
) from public, anon;
revoke all on function public.get_breeding_job_detail_v2(uuid, text)
  from public, anon;
revoke all on function public.get_breeder_form_context_v2(text)
  from public, anon;
revoke all on function public.list_saved_breeding_plans_v2(
  integer, timestamptz, uuid, timestamptz, text
) from public, anon;

grant execute on function public.create_breeding_job_v3(
  text, text[], public.optimization_mode, boolean, integer, text
) to authenticated;
grant execute on function public.list_available_pals_page_v4(
  text, text, text, public.pal_gender, text[], public.pal_location_type,
  boolean, uuid, uuid, integer, integer, text
) to authenticated;
grant execute on function public.get_breeding_job_detail_v2(uuid, text)
  to authenticated;
grant execute on function public.get_breeder_form_context_v2(text)
  to authenticated;
grant execute on function public.list_saved_breeding_plans_v2(
  integer, timestamptz, uuid, timestamptz, text
) to authenticated;

comment on column public.breeding_jobs.locale is
  'BCP 47 locale requested for bounded AI and deterministic template explanations.';
comment on function public.list_available_pals_page_v4(
  text, text, text, public.pal_gender, text[], public.pal_location_type,
  boolean, uuid, uuid, integer, integer, text
) is 'Locale-aware inventory page; missing display text uses a neutral localized fallback.';
comment on function public.get_breeding_job_detail_v2(uuid, text) is
  'Locale-aware immutable job detail with deterministic fallback for historical AI text.';
comment on function public.get_breeder_form_context_v2(text) is
  'Locale-aware breeder form context with neutral localized fallbacks for missing names and effects.';
comment on function public.list_saved_breeding_plans_v2(
  integer, timestamptz, uuid, timestamptz, text
) is 'Locale-aware saved route list over immutable game catalog versions.';
