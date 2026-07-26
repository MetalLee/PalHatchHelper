drop function public.adopt_breeding_route(uuid, text);
drop function public.start_breeding_step(uuid, bigint, text);
drop function public.continue_breeding_attempt(uuid, bigint, text);
drop function public.skip_breeding_step(uuid, text, bigint, text);
drop function public.pause_execution_plan(uuid, bigint, text);
drop function public.resume_execution_plan(uuid, bigint, text);
drop function public.select_existing_pal_for_step(uuid, text, boolean, bigint, text);
drop function public.confirm_offspring_candidate(uuid, text, bigint, text);
drop function public.reject_offspring_candidate(text, text, bigint, text);
drop function public.recalculate_execution_plan(uuid, bigint, text, text);
drop function public.list_execution_plans(text, integer, timestamptz, uuid, timestamptz);
drop function public.get_execution_plan_detail(uuid);
drop function public.update_breeding_step_status(uuid, public.breeding_step_status);
drop function public.confirm_step_offspring(uuid, text, uuid);

comment on table public.execution_plans is
  'Legacy schema retained only for snapshot-retention referential compatibility; user execution RPCs are removed.';
