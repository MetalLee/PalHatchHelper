do $migration$
declare
  v_function regprocedure;
  v_definition text;
  v_original text;
begin
  v_function := 'public.get_admin_overview()'::regprocedure;
  v_definition := pg_get_functiondef(v_function);
  v_original := v_definition;
  v_definition := replace(
    v_definition,
    E'    ''candidate_detector'', private.admin_worker_status(''candidate_detector''),\n',
    ''
  );
  if v_definition = v_original or position('candidate_detector' in v_definition) > 0 then
    raise exception using errcode = 'P0001', message = 'ADMIN_OVERVIEW_PLAN_SURFACE_PATCH_FAILED';
  end if;
  execute v_definition;

  v_function := 'public.list_admin_jobs(integer)'::regprocedure;
  v_definition := pg_get_functiondef(v_function);
  v_original := v_definition;
  v_definition := replace(
    v_definition,
    E'      ''execution_plan_id'', execution.id,\n',
    ''
  );
  v_definition := replace(
    v_definition,
    E'    LEFT JOIN public.execution_plans execution ON execution.source_job_id = job.id\n',
    ''
  );
  v_definition := replace(
    v_definition,
    E'    left join public.execution_plans execution on execution.source_job_id = job.id\n',
    ''
  );
  if v_definition = v_original or position('execution_plan_id' in v_definition) > 0 then
    raise exception using errcode = 'P0001', message = 'ADMIN_JOBS_PLAN_SURFACE_PATCH_FAILED';
  end if;
  execute v_definition;
end;
$migration$;

revoke execute on function public.adopt_breeding_route(uuid,text) from authenticated;
revoke execute on function public.start_breeding_step(uuid,bigint,text) from authenticated;
revoke execute on function public.continue_breeding_attempt(uuid,bigint,text) from authenticated;
revoke execute on function public.skip_breeding_step(uuid,text,bigint,text) from authenticated;
revoke execute on function public.pause_execution_plan(uuid,bigint,text) from authenticated;
revoke execute on function public.resume_execution_plan(uuid,bigint,text) from authenticated;
revoke execute on function public.confirm_offspring_candidate(uuid,text,bigint,text) from authenticated;
revoke execute on function public.reject_offspring_candidate(text,text,bigint,text) from authenticated;
revoke execute on function public.recalculate_execution_plan(uuid,bigint,text,text) from authenticated;
revoke execute on function public.list_execution_plans(text,integer,timestamptz,uuid,timestamptz) from authenticated;
revoke execute on function public.get_execution_plan_detail(uuid) from authenticated;

comment on function public.get_admin_overview() is
  'Browser-safe administration overview without removed execution-plan workers.';
comment on function public.list_admin_jobs(integer) is
  'Browser-safe breeding job list without execution-plan state.';
