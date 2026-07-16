begin;
set local search_path = public, extensions;

select plan(9);

select has_table('public', 'execution_plans', 'execution plans have a durable identity');
select has_table('public', 'execution_plan_events', 'plan events are append-only audit history');
select has_table(
  'public', 'execution_candidate_detection_runs',
  'candidate detection records processed snapshot and step pairs'
);
select has_function(
  'public', 'adopt_breeding_route', array['uuid', 'text'],
  'completed deterministic routes can be adopted through an authenticated RPC'
);
select has_function(
  'public', 'start_breeding_step', array['uuid', 'bigint', 'text'],
  'the current step has an optimistic start RPC'
);
select has_function(
  'public', 'confirm_offspring_candidate', array['uuid', 'text', 'bigint', 'text'],
  'players confirm candidates through an optimistic RPC'
);
select has_function(
  'public', 'recalculate_execution_plan', array['uuid', 'bigint', 'text', 'text'],
  'recalculation preserves the old plan and creates a new Phase 6 job'
);
select col_is_pk(
  'public', 'execution_plan_events', 'id',
  'audit events have stable immutable identities'
);
select has_index(
  'public', 'step_offspring_candidates', 'step_candidates_one_confirmed_per_step',
  'each step can have at most one confirmed offspring candidate'
);

select * from finish();
rollback;
