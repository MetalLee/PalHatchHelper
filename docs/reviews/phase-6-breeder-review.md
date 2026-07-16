---
phase: 6
status: completed
implementation: completed
automated_gates: passed
local_integration: completed
production_deploy: not_started
branch: agent/phase-6-breeder
reviewed_at: 2026-07-16
---

# Phase 6 breeder review

## Decision boundary

Phase 6 now provides the local, private-internal breeder workflow: an authenticated
player selects a published Pal and up to four published passives, creates an
idempotent asynchronous job, refreshes or reopens the job page, and compares up to
three deterministic routes. Every job pins its inventory snapshot, published game
catalog version and content hash, algorithm version, scoring profile, optimization
mode, sharing choice, and generation bound.

No production Supabase or Vercel deployment was performed. No Palworld container,
Compose file, real save, or `/opt/palworld` file was modified. Phase 7 plans and
execution workflows remain out of scope.

## Implemented scope

- `/breeder` with published-catalog target lookup by localized name, encyclopedia
  number, or Stable ID; zero to four passives; four optimization modes; guild sharing;
  and a one-to-eight generation bound.
- `/breeder/jobs/[jobId]` with real job stages, refresh recovery, bounded polling,
  stable retry/failure states, fixed-version metadata, and at most three mobile-safe
  route tabs.
- Deterministic route cards with assigned inventory instances, safe owner display
  names, location, gender, passives, intermediates, generation count, borrowing,
  inventory coverage, heuristic attempt range, difficulty, and the complete
  `score_breakdown`.
- A Phase 2 Worker handler that loads only the pinned snapshot and pinned published
  catalog/hash, runs the Phase 4 deterministic engine, persists algorithm facts before
  AI enrichment, heartbeats its lease, and completes idempotently.
- OpenAI-compatible, Codex CLI, and local template explanation providers. Provider
  output is schema- and size-bounded and cannot modify route facts or scores.

Explicitly not implemented: `/plans`, route adoption, execution steps, offspring
detection or confirmation, save editing, automatic game actions, administrator data
publishing UI, IV optimization, active-skill inheritance optimization, Phase 7, or
production deployment.

## Contracts

`packages/contracts/schema/phase6-breeder.schema.json` is the shared source for:

- `CreateBreedingJobRequest` and `CreateBreedingJobResponse`;
- `JobProgress`, `BreedingPlan`, `BreedingRoute`, and `RouteComparison`;
- `RouteScoreBreakdown`, `AIExplanation`, and `BreedingError`;
- the browser-safe breeder form context and job-detail RPC projections.

The existing breeding-job contract was extended with
`game_data_content_hash`, `allow_guild_shared`, and `max_generations`. TypeScript and
Python representations are generated from the shared schemas; database types are
generated from the loopback local database. Generation and drift checks pass.

## Forward migrations

| Migration                                                  | Purpose                                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260716030000_phase6_breeder_workflow.sql`               | Adds fixed job fields, deterministic plan/route result fields, owner-bound create/detail RPCs, and service-only fenced algorithm/AI persistence. |
| `20260716031000_phase6_breeder_web_context.sql`            | Adds the browser-safe published-catalog form context without exposing inventory rows or internal player UUIDs.                                   |
| `20260716032000_phase6_jsonb_object_length_compat.sql`     | Adds a locked-down compatibility helper for the exact four-profile gate on the local PostgreSQL build.                                           |
| `20260716033000_phase6_breeding_job_content_pin_guard.sql` | Enforces that legacy and Phase 6 job writes pin the catalog version's exact content hash.                                                        |

No historical migration was edited. A from-zero local reset applied every migration
and seed successfully.

## RPC, RLS, and idempotency

`create_breeding_job_v2` derives the requester from `auth.uid()` and the player from
the existing binding. Callers cannot supply another player, snapshot, version, hash,
algorithm, or scoring profile. The function locks the player's world selection and
atomically pins the current published snapshot and matching published catalog pair.
Validated-but-unpublished catalog versions are rejected.

The request fingerprint includes requester, bound player, target, canonically sorted
passives, snapshot, catalog version/hash, algorithm, scoring profile, mode, sharing,
and maximum generations. Concurrent or repeated active requests reuse one job;
changed inputs produce a different fingerprint.

`persist_breeding_algorithm_result` and `persist_breeding_ai_result` require the
Service Role plus the current worker ID and lease token. They upsert one plan and its
route keys, so retries cannot create duplicate plans or routes. The browser can only
call the authenticated create, form-context, and detail RPCs. Existing owner/admin
RLS remains active, and job detail removes internal owner-player and guild UUIDs from
route parents.

## Worker state machine and exact pinning

The Worker reuses Phase 2 atomic claiming, heartbeat, stale-lock recovery, retry,
shutdown release, and completion fencing:

```text
pending -> processing -> algorithm_completed -> ai_enriching -> completed
                      \-> retry_pending -> processing
                      \-> failed | cancelled
```

Runtime catalog metadata, relational projection or exact artifact, inventory facts,
and job fields must agree on the pinned version and content hash. The Worker never
falls back to a world's newer active pointer. Publishing a later snapshot or catalog
therefore cannot change an existing job.

The deterministic result is persisted before AI is called. The AI request contains
only target/passive Stable IDs, optimization mode, the fixed hash/algorithm/scoring
summary, route aggregate metrics, Pal sequence, and score breakdown. It excludes
inventory instance IDs, complete inventory, user/player/world/snapshot UUIDs, save
data, host paths, Supabase credentials, and Service Role. The Codex CLI subprocess
receives an explicit minimal environment allowlist and cannot inherit the Supabase
Service Role; a timed-out child is terminated.

External failure falls through to Codex CLI and then `TemplateProvider`. If all
external explanation paths fail, the deterministic task still completes with
`ai_degraded=true`. Empty bounded-search results are described as “未返回路线”, not as
proof that no legal route exists.

## Local real-catalog integration

The local test world `10000000-0000-4000-8000-000024181105` points to published
catalog `f2718a96-5463-43ff-863e-225102bdfca2`, content hash
`872e4a79af5b5043ee97d9a4287a41bba407afc96ff3b0a6de56fff827d334b3`, and published
local-test snapshot `8e85f706-246c-459e-9f30-a690d2ce67a9` with 12 Stable-ID-mapped
instances.

Three jobs were created through the authenticated Phase 6 RPC and processed by the
real Worker:

| Target / bound                                       | Result                                                                                                         | Routes | Digest                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -----: | ------------------------------------------------------------------ |
| `chickenpal`, generation 5, desired `craftspeed_up1` | completed, complete no-route result                                                                            |      0 | `76420449c5dd35f70c1463617bb98d817ec42e3c0fc71e66be3798bdb1893023` |
| `bastet`, generation 3                               | completed, bounded search reached `max_expanded_nodes` / species-route cap and is explicitly marked incomplete |      0 | `a9f995e3696945d737655d0830bc035bd88893fdea73c52273446d53f3431c84` |
| `bastet`, generation 1                               | completed with all legal results returned                                                                      |      1 | `3ea56324e029b13d5fcbb82005f4d1c48f16b07bfa82a9887bd0dbd1907f3e32` |

The real route assigns owned instance `phase6-local-pal-004` (`carbunclo`, male) and
owned instance `phase6-local-pal-001` (`sheepball`, female), produces `bastet` in one
generation, borrows zero Pals, has 100% inventory coverage, and records the full four-
mode score breakdown. Template fallback was intentionally used in this local run;
algorithm facts remained unchanged.

## Web and mobile acceptance

The task page displays database stages rather than invented percentages. It polls at
two-second intervals for at most 60 attempts and then asks the player to refresh;
closing and reopening the URL restores the job from its durable ID. AI explanation
is visually separated and marked non-authoritative/degraded.

The iPhone Playwright flow logs in with a local fixture account, opens `/breeder`,
selects the target by Chinese published name, creates a job, verifies pending state,
reloads, invokes the local Worker, reloads the completed result, compares routes,
checks fixed versions and degraded AI, rejects private UUID/path leakage, and asserts
that document width does not overflow the viewport.

## Verification

| Gate                             | Result                                                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                          | Node `22.23.1`; Python `3.12.13`                                                                                                                            |
| `pnpm check`                     | passed: format, lint, strict TS, workspace tests/build, Agent checks, structure, forbidden assets, and secret scan                                          |
| Web unit tests                   | 28 passed, including name/number/Stable-ID target resolution, all stages, no-route vs incomplete search, route comparison, score breakdown, and degraded AI |
| Playwright                       | 6 passed on the iPhone project, including the full Phase 6 login-to-route flow                                                                              |
| Agent                            | 178 passed; 4 explicitly environment-gated tests skipped in the root run                                                                                    |
| Agent local Supabase lifecycle   | 1 passed with loopback-only credentials                                                                                                                     |
| Real catalog acceptance          | 3 passed; aggregate Phase 4 digest `656b27f1442b759cf78acd2d3197c094a28bafccfa878352a12318711de10082` reproduced                                            |
| AI provider tests                | 6 passed, including fallback order, bounded output, stdin-only Codex prompting, and Service Role environment isolation                                      |
| `supabase db lint --level error` | passed with no errors                                                                                                                                       |
| `supabase test db`               | 256 passed across 10 pgTAP files                                                                                                                            |
| Contracts / database types       | generation and drift passed against the loopback database                                                                                                   |
| Stable ID / package safety       | cross-language Stable ID, malicious package member, forbidden asset, and secret checks passed                                                               |

The Draft PR required checks remain the authoritative Windows extractor verification;
Linux does not claim a local Windows/.NET extractor pass.

## Known limits and rollback

- Full-catalog multi-generation searches can reach the fixed Phase 4 search budget.
  Such results retain `SEARCH_LIMIT_REACHED` / `SEARCH_INCOMPLETE` and the UI does not
  mislabel them as proof of no legal route. Lower generation bounds can produce a
  complete actionable result, as demonstrated above.
- The browser uses bounded polling rather than Realtime and pauses after two minutes.
- Local integration used the deterministic template fallback; no external AI service
  is required or asserted.
- The workflow is private-internal and local only. Production Supabase, Vercel, and
  Agent deployment remain `not_started` and unauthorized.

To roll back the application, stop exposing the Phase 6 navigation/routes, stop the
Worker so any active lease is safely released, and return Web/Agent to the previous
compatible commit. The additive database objects may remain for historical pinned
jobs; any database removal must be a new forward migration. Existing Phase 4 catalog
and snapshot pointers are not changed by Phase 6.
