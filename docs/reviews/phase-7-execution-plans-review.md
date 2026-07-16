---
phase: 7
status: completed
implementation: completed
automated_gates: passed
local_integration: completed
production_deploy: not_started
branch: agent/phase-7-execution-plans
reviewed_at: 2026-07-16
---

# Phase 7 execution plans review

## Decision boundary

Phase 7 completes the local/test execution-plan workflow. A player can adopt a
completed deterministic Phase 6 route, manually advance its ordered breeding steps,
inspect offspring candidates detected from later immutable normalized snapshots,
confirm the real instance, preserve an auditable history, and start a new Phase 6 job
from the latest safe inventory when dependencies become invalid.

The system never reads a raw save for candidate detection, never chooses or confirms
an offspring for the player, and never operates the game or edits a save. No
production Supabase, Vercel, or Agent deployment was performed. No Palworld or mihomo
container, `/opt/palworld` file, production credential, or public port was accessed or
changed. Phase 8 was not started.

## Implemented and excluded scope

Implemented:

- `/plans` with owner-scoped stable-cursor pagination, status filters, pinned version
  facts, progress, candidate counts, empty/error states, and mobile cards;
- `/plans/[planId]` with the current step first, completed/future step disclosure,
  candidate ranking details, manual actions, event history, invalidation reasons, and
  recalculation;
- idempotent adoption from `/breeder/jobs/[jobId]`, including an existing-plan link;
- manual start, continue attempt, select existing Pal, reject/confirm candidate, skip,
  pause, resume, and latest-inventory recalculation operations;
- Agent-side candidate detection after successful normalized snapshot publication,
  including duplicate-publication crash recovery;
- immutable plan/version pins and append-only event history.

Explicitly excluded: automatic step completion, automatic candidate selection,
automatic ranch/game actions, save modification, production deployment, catalog
administration, IV/shiny/Boss-size optimization, active-skill inheritance
optimization, and all Phase 8 work.

## Forward migration

`supabase/migrations/20260716040000_phase7_execution_plans.sql` is the only Phase 7
migration. It creates `execution_plans`, `execution_plan_events`, and
`execution_candidate_detection_runs`; extends existing `breeding_steps`,
`step_offspring_candidates`, and `breeding_jobs`; adds immutable-pin/history guards,
uniqueness constraints, RLS, grants, and all Phase 7 RPCs. No historical migration
was edited.

The plan has a unique adopted route. Steps are unique by plan and topological index;
candidates are unique by step/instance and by deterministic candidate key; each step
has at most one confirmed candidate; and an output instance cannot be selected twice
within one plan. Plan pin fields cannot be updated, event rows cannot be updated or
deleted, and concurrency versions cannot decrease.

A from-zero local database reset applied all migrations and the formal seed path
successfully.

## Shared contracts

`packages/contracts/schema/phase7-execution-plans.schema.json` is the single
application contract source for plan and step statuses, stable Phase 7 error codes,
version pins, invalidation reasons, summaries/details, steps, candidates, score
breakdowns, events, all player mutation requests, recalculation responses, optimistic
conflicts, Agent detection contexts, and candidate batches.

It covers `AdoptRouteRequest/Response`, `PlanSummary`, `PlanDetail`, `PlanVersionPin`,
`PlanStep`, `OffspringCandidate`, `CandidateMatchBreakdown`, the start/continue/select/
confirm/reject/pause/resume/skip/recalculate requests, `InvalidationReason`,
`PlanEventSummary`, and `OptimisticConcurrencyConflict`. Generated TypeScript and
Pydantic representations are exported from the shared package and Agent generated
module. Phase 6 route responses now carry `route_id` and optional
`execution_plan_id`, allowing the result page to expose adoption without inventing a
second DTO. Generated contract and database-type drift checks pass.

## RPC, RLS, and audit boundary

Authenticated player RPCs are:

- `adopt_breeding_route`;
- `start_breeding_step`, `continue_breeding_attempt`, and `skip_breeding_step`;
- `select_existing_pal_for_step`;
- `pause_execution_plan` and `resume_execution_plan`;
- `confirm_offspring_candidate` and `reject_offspring_candidate`;
- `recalculate_execution_plan`;
- `list_execution_plans` and `get_execution_plan_detail`.

Service-only RPCs are `get_execution_detection_context`,
`get_execution_snapshot_delta`, `record_execution_candidates`, and
`invalidate_execution_plan_dependencies`. Authenticated users cannot call them. The
Agent can detect/write candidates and invalidations but cannot call player
confirmation RPCs. Browser operations use only the user's JWT; the Service Role is
limited to the local Agent and Node-side E2E fixture runner and is never sent to a
browser context.

RLS exposes plan, step, candidate, and event projections only to the owning requester
or an administrator. Internal tables have no browser write grants. Existing legacy
step mutation RPCs are fenced away from execution-plan steps, preventing them from
bypassing the Phase 7 state machine. Every successful transition appends a safe event
with actor kind, status transition, idempotency key, and bounded metadata.

## Adoption and fixed versions

Adoption accepts only a completed job owned by the caller (or an administrator), a
route belonging to that job with a valid deterministic payload, an existing published
snapshot, and the exact published catalog version/content hash pinned by Phase 6. The
caller's current binding and every inventory parent/access projection are rechecked.

The route's deterministic topological order becomes execution steps with inventory or
prior-step parent references, expected species, required passives, and gender
requirements. The plan copies—not recomputes—the route's snapshot, catalog version,
content hash, algorithm, and scoring profile. The adopted-route uniqueness guard and
event idempotency make concurrent/repeated adoption return the same plan.

Publishing a newer catalog or snapshot does not rewrite an adopted or historical
plan. The Phase 6 job detail reports `execution_plan_id` so an adopted route changes
from “采用此方案” to “查看执行计划”.

## State machine and optimistic concurrency

Plan states are `active`, `awaiting_confirmation`, `paused`, `completed`,
`invalidated`, and `cancelled`. Execution steps use the existing statuses
`not_started`, `breeding`, `candidate_detected`, `completed`, `retrying`, `skipped`,
and `invalidated`.

Only the current step can start. Prior steps must be completed or explicitly skipped.
Candidate detection never completes a step; only an authenticated player confirmation
or an explicitly confirmed existing-Pal selection can do so. Completed outputs cannot
return to breeding or be replaced. Continue-attempt retains old candidates, increments
the attempt/window, and returns the step to detection. Skip requires a reason. Paused
plans reject execution until resumed.

Every mutation takes `expected_concurrency_version`, locks the plan/step, checks owner
and current state, increments versions monotonically, and returns
`PLAN_VERSION_CONFLICT` on stale input. A previously recorded idempotency key returns
the durable result instead of applying the action twice.

## Snapshot delta and candidate detector

`SnapshotDeltaReader` compares only two already-published normalized snapshots in the
same world. Identity is `world_id + pal_instance_uid`, and the service also checks an
instance's first appearance across all successful snapshots. Moving an instance or
changing its owner cannot turn an old UID into a new child; a disappeared and later
reappearing UID is not new.

After a successful snapshot publication, `CandidateDetectionProcessor` loads active
breeding/retrying steps, obtains the service-side snapshot delta, filters by expected
species and safe accessibility, and deterministically ranks every matching candidate
by required-passive overlap and gender feasibility. Owner display and location are
safe projections. The score is presentation priority only.

Detection writes use a hash derived from step, detected snapshot, and instance UID.
The `(step_id, detected_snapshot_id)` run record and candidate uniqueness constraints
make worker restart/replay safe. A candidate changes the step to
`candidate_detected` and the plan to `awaiting_confirmation`; no automatic choice or
confirmation occurs.

## Manual confirmation and downstream revalidation

Confirmation rechecks ownership, candidate/step association, rejection state,
species, source snapshot, current accessibility, single-use constraints, current
step state, and optimistic version. It then marks exactly that candidate confirmed,
stores the real instance UID on the completed step, records completion time and the
event, advances `current_step_index`, and unlocks the next step (or completes the
plan).

The confirmed instance's real gender, passive IDs, owner/guild projection, and
availability are used to revalidate prior-step dependencies. Completed history is
never rolled back. Incompatible downstream steps are invalidated with structured
reasons, and the plan becomes invalidated. Rejection only records the player's choice;
the detector never silently promotes another candidate.

Selecting an existing Pal reads the latest safe published inventory and requires the
expected species. A missing passive match is rejected unless the player sends the
explicit mismatch confirmation flag. The same selected-output and downstream rules
then apply.

## Invalidation and recalculation

Service-side invalidation detects disappeared dependencies, owner changes, closed
sharing, guild-access loss, gender incompatibility, and fixed catalog/hash
unavailability. Reasons are structured and append-only; completed steps remain
unchanged. New catalog publication alone is not an invalidation and never changes the
historical pins.

`recalculate_execution_plan` does not edit or delete the old plan. It creates a new
Phase 6 job with the old target, desired passives, optimization mode, sharing choice,
and generation bound, while pinning the latest safe inventory and current published
catalog/hash/algorithm/scoring versions. The new job records `source_plan_id` and a
bounded reason, and the UI navigates to `/breeder/jobs/[jobId]`.

## Web and mobile acceptance

`/plans` is server-rendered and owner-scoped. Its stable cursor fixes a query boundary
and paginates by creation time and ID without cross-user caching. Status filters map
to all, active, awaiting confirmation, completed, paused, and invalidated views.

`/plans/[planId]` prioritizes the current step and confirmation controls, shows
candidate species/Stable ID, gender, passives, level, safe owner/location, first
detection time, and match breakdown, and provides all legal manual actions. It also
shows the fixed version block, event timeline, invalidation reasons, and recalculation
entry. The page explicitly states that detection requires player confirmation and
does not modify the game or save.

The mobile bottom navigation retains Phase 5 data status while adding plans. iPhone
acceptance verifies no critical horizontal overflow, visible confirmation controls,
refresh persistence, and the complete adopt/detect/confirm and invalidate/recalculate
flows without hover-only interaction.

## Verification

| Gate                             | Result                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Runtime                          | Node `22.23.1`; Python `3.12.13`                                                                       |
| `pnpm check`                     | passed: format, lint, strict TS, unit tests/build, Agent, structure, forbidden assets, and secret scan |
| Contracts                        | 23 passed; generation and generated drift passed                                                       |
| Web unit/component               | 37 passed; final Web lint, typecheck, format, and production build passed                              |
| Agent                            | 186 passed; 4 environment-gated tests skipped in the aggregate run                                     |
| Agent local Supabase lifecycle   | 1 passed separately with loopback-only credentials                                                     |
| Agent Phase 7                    | delta, ranking, idempotency, publish hook, and CLI detector tests passed within the 186-test suite     |
| Playwright                       | 8 passed on the iPhone project, including two Phase 7 full local workflows                             |
| `supabase db lint --level error` | passed with no errors                                                                                  |
| `supabase test db`               | 311 passed across 12 pgTAP files                                                                       |
| Database reset/types             | from-zero reset passed; loopback database types regenerated without drift                              |
| Repository safety                | forbidden asset scan, secret scan, structure check, and `git diff --check` passed                      |

The four aggregate Agent skips are the three opt-in private real-catalog acceptance
tests and the loopback Supabase lifecycle test; the latter was then run explicitly
and passed. Parser sandbox tests ran successfully on this host, so no Landlock
`ENOSYS` result was treated as success.

At review creation, Draft PR CI had not started. The repository CI will independently
run Web/workspace, local Supabase database and Agent lifecycle, full browser
acceptance, Python Agent (including fail-closed sandbox tests), and repository safety
jobs. Its reported result remains authoritative for the pushed commit.

## Known limits

- Candidate detection is snapshot-publication driven and intentionally has no game
  automation or real-time save watcher beyond the existing safe sync workflow.
- Candidate score is deterministic presentation ordering, not a probability or an
  authorization to confirm.
- Existing-Pal passive mismatch requires one explicit confirmation flag; there is no
  passive optimization beyond the Phase 6 route facts.
- Production Supabase, Vercel, and Agent deployment remain unauthorized and
  `not_started`. Phase 8 administration is absent.

## Rollback

Disable the route-adoption entry and stop the candidate detector, then return Web and
Agent to the previous compatible version. Keep all plan, step, candidate, event, and
version-pin rows. Use only a new compensating migration or audited RPC for state
repair; never delete plan history, edit completed steps, or repoint a historical
catalog/snapshot. No production rollback is required because production deployment
did not start.
