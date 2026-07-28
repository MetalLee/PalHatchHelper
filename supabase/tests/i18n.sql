begin;
set local search_path = public, extensions;

select plan(31);

select has_column(
  'public', 'breeding_jobs', 'locale',
  'breeding jobs persist the requested explanation locale'
);
select ok(
  exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.breeding_jobs'::regclass
       and conname = 'breeding_jobs_locale_check'
  ),
  'breeding job locale is constrained to supported catalog locales'
);
select has_function(
  'public', 'create_breeding_job_v3',
  array['text', 'text[]', 'optimization_mode', 'boolean', 'integer', 'text'],
  'locale-aware breeding job creation exists'
);
select has_function(
  'public', 'list_available_pals_page_v4',
  array[
    'text', 'text', 'text', 'pal_gender', 'text[]', 'pal_location_type',
    'boolean', 'uuid', 'uuid', 'integer', 'integer', 'text'
  ],
  'locale-aware inventory projection exists'
);
select has_function(
  'public', 'get_breeder_form_context_v2', array['text'],
  'locale-aware breeder form projection exists'
);
select has_function(
  'public', 'get_breeding_job_detail_v2', array['uuid', 'text'],
  'locale-aware job detail projection exists'
);
select has_function(
  'public', 'list_saved_breeding_plans_v2',
  array['integer', 'timestamptz', 'uuid', 'timestamptz', 'text'],
  'locale-aware saved plan projection exists'
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

select is(
  public.list_available_pals_page_v4(p_locale => 'fr-FR') ->> 'error_code',
  'INVALID_LOCALE',
  'inventory rejects unsupported locales'
);
select is(
  public.get_breeder_form_context_v2('fr-FR') ->> 'error_code',
  'INVALID_LOCALE',
  'breeder form rejects unsupported locales'
);
select throws_ok(
  $$
    select * from public.create_breeding_job_v3(
      'test_child_pal', '{}'::text[], 'balanced', true, 3, 'fr-FR'
    )
  $$,
  'P0001',
  'INVALID_LOCALE',
  'job creation rejects unsupported locales'
);
select is(
  (
    select item->>'display_name'
      from jsonb_array_elements(
        public.get_breeder_form_context_v2('en-US') #> '{data,pals}'
      ) item
     where item->>'pal_id' = 'test_parent_a'
  ),
  'Lamball',
  'breeder form returns English Pal names'
);
select is(
  (
    select item->>'display_name'
      from jsonb_array_elements(
        public.get_breeder_form_context_v2('en-US') #> '{data,passive_skills}'
      ) item
     where item->>'passive_skill_id' = 'test_passive_a'
  ),
  'Serious',
  'breeder form returns English passive names'
);
select is(
  (
    select item->>'effect_text'
      from jsonb_array_elements(
        public.get_breeder_form_context_v2('en-US') #> '{data,passive_skills}'
      ) item
     where item->>'passive_skill_id' = 'test_passive_a'
  ),
  'Work speed +20%',
  'breeder form returns English passive effects'
);
select is(
  (
    select item->>'pal_display_name'
      from jsonb_array_elements(
        public.list_available_pals_page_v4(
          p_scope => 'mine', p_locale => 'en-US'
        ) #> '{data,items}'
      ) item
     where item->>'pal_id' = 'test_parent_a'
  ),
  'Lamball',
  'inventory returns English Pal names'
);
select is(
  (
    select item->'passive_display_names'->>0
      from jsonb_array_elements(
        public.list_available_pals_page_v4(
          p_scope => 'mine', p_locale => 'en-US'
        ) #> '{data,items}'
      ) item
     where item->>'pal_id' = 'test_parent_a'
  ),
  'Serious',
  'inventory returns English passive names'
);

select lives_ok(
  $$
    select * from public.create_breeding_job_v3(
      'test_child_pal', '{}'::text[], 'balanced', true, 3, 'en-US'
    )
  $$,
  'a bound player can create an English breeding job'
);
select is(
  (
    select locale
      from public.breeding_jobs
     where requester_user_id = auth.uid()
       and target_pal_id = 'test_child_pal'
       and desired_passive_ids = '{}'::text[]
       and max_generations = 3
     order by created_at desc
     limit 1
  ),
  'en-US',
  'new jobs persist the requested locale'
);
select is(
  (
    select reused from public.create_breeding_job_v3(
      'test_child_pal', '{}'::text[], 'balanced', true, 3, 'zh-CN'
    )
  ),
  true,
  'identical active input reuses the existing job across display locales'
);
select is(
  (
    select locale
      from public.breeding_jobs
     where requester_user_id = auth.uid()
       and target_pal_id = 'test_child_pal'
       and desired_passive_ids = '{}'::text[]
       and max_generations = 3
     order by created_at desc
     limit 1
  ),
  'en-US',
  'reusing an active job does not mutate its pinned explanation locale'
);

select is(
  public.get_breeding_job_detail_v2(
    '60000000-0000-4000-8000-000000000003', 'en-US'
  ) #>> '{data,localization,locale}',
  'en-US',
  'job detail identifies its response locale'
);
select is(
  public.get_breeding_job_detail_v2(
    '60000000-0000-4000-8000-000000000003', 'en-US'
  ) #>> '{data,localization,pals,0,display_name}',
  'Lamball',
  'job detail rebuilds catalog localization in English'
);
select is(
  public.get_breeding_job_detail_v2(
    '60000000-0000-4000-8000-000000000003', 'en-US'
  ) #>> '{data,plan,ai,explanation}',
  'This is a localized deterministic summary. Recipes, scores and instance assignments are unchanged.',
  'historical AI text is replaced with an English deterministic summary'
);
select ok(
  public.get_breeding_job_detail_v2(
    '60000000-0000-4000-8000-000000000003', 'en-US'
  ) #>> '{data,plan,routes,0,ai_explanation}' not like '%第%',
  'historical route explanations do not leak the original language'
);

select is(
  (public.save_breeding_plan('62000000-0000-4000-8000-000000000001') ->> 'reused')::boolean,
  false,
  'the fixture route can be saved for localized plan assertions'
);
select is(
  public.list_saved_breeding_plans_v2(p_locale => 'en-US')
    #>> '{data,items,0,target_pal_display_name}',
  'Name unavailable',
  'missing saved-plan target localization uses a neutral English fallback'
);
select is(
  public.list_saved_breeding_plans_v2(p_locale => 'en-US')
    #>> '{data,items,0,desired_passives,0,display_name}',
  'Serious',
  'saved plans return English passive names'
);
select is(
  public.list_saved_breeding_plans_v2(p_locale => 'fr-FR') ->> 'error_code',
  'INVALID_LOCALE',
  'saved plans reject unsupported locales'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.list_available_pals_page_v4(text,text,text,pal_gender,text[],pal_location_type,boolean,uuid,uuid,integer,integer,text)',
    'execute'
  ),
  'authenticated users may execute the localized inventory projection'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.list_available_pals_page_v4(text,text,text,pal_gender,text[],pal_location_type,boolean,uuid,uuid,integer,integer,text)',
    'execute'
  ),
  'anonymous users may not execute the localized inventory projection'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_breeding_job_detail_v2(uuid,text)',
    'execute'
  ),
  'authenticated users may execute localized job detail'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_breeding_job_detail_v2(uuid,text)',
    'execute'
  ),
  'anonymous users may not execute localized job detail'
);

reset role;
select * from finish();
rollback;
