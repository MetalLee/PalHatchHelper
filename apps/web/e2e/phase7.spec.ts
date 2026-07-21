import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const executeFile = promisify(execFile);
const fixturePassword = "palhatch-local-fixture";
const agentDirectory = resolve(process.cwd(), "../agent");
const workerId = "phase7-e2e-worker";
const routeKey = "7".repeat(64);

let planId: string;
let originalSnapshotId: string;
let originalCatalogId: string;

function localEnvironment() {
  const url = process.env.PALHATCH_E2E_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.PALHATCH_E2E_SERVICE_ROLE_KEY;
  if (url !== "http://127.0.0.1:54321" || !anonKey || !serviceRole) {
    throw new Error("Phase 7 E2E requires the repository-local Supabase stack");
  }
  return { url, anonKey, serviceRole };
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill("player-a@palhatch.fixture.invalid");
  await page.getByLabel("密码").fill(fixturePassword);
  await page.getByRole("button", { name: "登录工作台" }).click();
  await expect(page).toHaveURL(/\/overview$/, { timeout: 30_000 });
}

function parent(
  palId: string,
  instanceUid: string | null,
  gender: "male" | "female",
  producedByStepIndex: number | null = null,
) {
  return {
    source_type: instanceUid === null ? "intermediate" : "inventory",
    pal_id: palId,
    instance_uid: instanceUid,
    owner_display_name: instanceUid === null ? "中间产物" : "Fixture Player A",
    gender,
    passive_skill_ids: ["test_passive_a", "test_passive_b"],
    required_passive_ids: ["test_passive_a"],
    borrowed: false,
    produced_by_step_index: producedByStepIndex,
    location_type: instanceUid === null ? null : "base",
    location_name: instanceUid === null ? null : "Fixture Base Alpha",
  };
}

function scoreBreakdown() {
  const profileVersions = {
    balanced: "balanced-v5",
    fastest: "fastest-v5",
    highest_success: "highest-success-v5",
    least_borrowing: "least-borrowing-v5",
  } as const;
  const components = [
    "route_length",
    "inventory_coverage",
    "passive_concentration",
    "borrowing",
    "intermediate_cost",
    "attempt_cost",
    "stability",
    "acquisition_cost",
  ].map((component) => ({
    component,
    raw_value: 1,
    normalized_score: 80,
    weight: 1 / 8,
    weighted_score: 10,
  }));
  return {
    scoring_profile_version: "balanced-v5",
    estimate_basis: "strategy_heuristic_no_verified_probability",
    raw_metrics: {
      generation_count: 2,
      step_count: 2,
      unique_starting_instance_count: 2,
      starting_requirement_count: 2,
      missing_pal_count: 0,
      missing_passive_requirement_count: 0,
      missing_passive_count: 0,
      borrowed_pal_count: 0,
      inventory_coverage: 1,
      inventory_passive_coverage: 1,
      passive_carrier_count: 2,
      passive_concentration: 1,
      extra_passive_count: 0,
      intermediate_pal_count: 1,
      intermediate_passive_checkpoint_count: 1,
      required_gender_checkpoint_count: 1,
      estimated_attempts_min: 2,
      estimated_attempts_max: 6,
      difficulty: "medium",
    },
    mode_scores: [
      "balanced",
      "fastest",
      "highest_success",
      "least_borrowing",
    ].map((optimization_mode) => ({
      optimization_mode,
      scoring_profile_version:
        profileVersions[optimization_mode as keyof typeof profileVersions],
      total_score: 80,
      components,
    })),
  };
}

async function call<T>(
  client: SupabaseClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(functionName, args);
  if (error) throw new Error(`${functionName}:${error.message}`);
  return data as T;
}

async function createCompletedPhase6Fixture(): Promise<string> {
  const { url, anonKey, serviceRole } = localEnvironment();
  const user = createClient(url, anonKey, { auth: { persistSession: false } });
  const service = createClient(url, serviceRole, {
    auth: { persistSession: false },
  });
  const signedIn = await user.auth.signInWithPassword({
    email: "player-a@palhatch.fixture.invalid",
    password: fixturePassword,
  });
  if (signedIn.error) throw signedIn.error;
  const created = await call<Array<{ job_id: string }>>(
    user,
    "create_breeding_job_v2",
    {
      p_target_pal_id: "test_child_pal",
      p_desired_passive_ids: ["test_passive_a", "test_passive_b"],
      p_optimization_mode: "balanced",
      p_allow_guild_shared: false,
      p_max_generations: 4,
    },
  );
  const jobId = created[0]?.job_id;
  if (!jobId) throw new Error("Phase 7 fixture job was not created");
  const existing = await service
    .from("breeding_jobs")
    .select("status")
    .eq("id", jobId)
    .single();
  if (existing.error) throw existing.error;
  if (existing.data.status === "completed") {
    await user.auth.signOut();
    return jobId;
  }

  let leaseToken: string | undefined;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const claimed = await call<Array<{ id: string; lease_token: string }>>(
      service,
      "claim_breeding_job",
      { p_worker_id: workerId },
    );
    const job = claimed[0];
    if (!job) throw new Error("Phase 7 fixture job could not be claimed");
    if (job.id === jobId) {
      leaseToken = job.lease_token;
      break;
    }
    await call(service, "cancel_breeding_job", {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_lease_token: job.lease_token,
      p_error_code: "PHASE7_E2E_QUEUE_ADVANCE",
    });
  }
  if (!leaseToken) throw new Error("Phase 7 fixture lease was not acquired");

  const steps = [
    {
      step_index: 0,
      generation: 1,
      recipe_type: "normal",
      parent_a: parent("test_parent_a", "fixture-pal-a-owned-001", "male"),
      parent_b: parent("test_child_pal", "fixture-pal-a-owned-002", "female"),
      child_pal_id: "test_child_pal",
      child_required_gender: "female",
      required_passive_ids: ["test_passive_a", "test_passive_b"],
    },
    {
      step_index: 1,
      generation: 2,
      recipe_type: "normal",
      parent_a: parent("test_child_pal", null, "female", 0),
      parent_b: parent("test_parent_a", "fixture-pal-a-owned-001", "male"),
      child_pal_id: "test_child_pal",
      child_required_gender: null,
      required_passive_ids: ["test_passive_a"],
    },
  ];
  const route = {
    route_key: routeKey,
    rank: 1,
    optimization_mode: "balanced",
    total_score: 80,
    generation_count: 2,
    step_count: 2,
    estimated_attempts_min: 2,
    estimated_attempts_max: 6,
    difficulty: "medium",
    borrowed_pal_count: 0,
    inventory_coverage: 1,
    inventory_passive_coverage: 1,
    inheritance_score: 1,
    existing_target_instance_uid: null,
    feasibility_status: "ready",
    adoptable: true,
    missing_pal_count: 0,
    missing_passive_ids: [],
    missing_requirements: [],
    passive_sources: [
      {
        passive_id: "test_passive_a",
        source_instance_uid: "fixture-pal-a-owned-001",
        source_pal_id: "test_parent_a",
        first_required_step_index: 0,
      },
      {
        passive_id: "test_passive_b",
        source_instance_uid: "fixture-pal-a-owned-002",
        source_pal_id: "test_child_pal",
        first_required_step_index: 0,
      },
    ],
    score_breakdown: scoreBreakdown(),
    steps,
  };
  await call(service, "persist_breeding_algorithm_result", {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_lease_token: leaseToken,
    p_result: {
      target_pal_id: "test_child_pal",
      desired_passive_ids: ["test_passive_a", "test_passive_b"],
      inventory_snapshot_id: "40000000-0000-4000-8000-000000000002",
      game_data_version_id: "51000000-0000-4000-8000-000000000001",
      game_data_content_hash: "c".repeat(64),
      algorithm_version: "inventory-trait-aware-deterministic-v4",
      scoring_profile_version: "balanced-v5",
      optimization_mode: "balanced",
      missing_passive_ids: [],
      routes: [route],
      explanation_codes: [],
      diagnostics: { search_complete: true },
      result_digest: "a".repeat(64),
    },
  });
  await call(service, "persist_breeding_ai_result", {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_lease_token: leaseToken,
    p_provider: "template",
    p_model: null,
    p_explanation: "本地 Phase 7 E2E 模板解释。",
    p_degraded: true,
    p_route_explanations: [
      {
        route_key: routeKey,
        explanation: "仅解释既有确定性路线。",
        labels: ["解释已降级"],
      },
    ],
  });
  await call(service, "complete_breeding_job", {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_lease_token: leaseToken,
  });
  await user.auth.signOut();
  return jobId;
}

function snapshotPal(
  instanceUid: string,
  palId: string,
  gender: "male" | "female",
  passiveSkillIds: string[],
) {
  return {
    instance_uid: instanceUid,
    owner_player_uid: "fixture-player-a-uid",
    guild_uid: "fixture-guild-alpha",
    pal_id: palId,
    gender,
    level: 1,
    passive_skill_ids: passiveSkillIds,
    location_type: "base",
    location_name: "Fixture Breeding Base",
    owner_resolved: true,
    guild_resolved: true,
    shared_eligible: true,
    warning_codes: [],
    metadata: {},
  };
}

async function publishSnapshot(version: "next" | "later"): Promise<string> {
  const { url, serviceRole } = localEnvironment();
  const service = createClient(url, serviceRole, {
    auth: { persistSession: false },
  });
  const next = version === "next";
  return call<string>(service, "publish_inventory_snapshot", {
    p_world_id: "10000000-0000-4000-8000-000000000001",
    p_snapshot: {
      source_save_hash: (next ? "7" : "8").repeat(64),
      source_modified_at: next
        ? "2026-07-16T06:00:00Z"
        : "2026-07-16T07:00:00Z",
      save_version: `phase7-e2e-${version}`,
      captured_at: next ? "2026-07-16T06:00:00Z" : "2026-07-16T07:00:00Z",
      parser_name: "phase7-e2e-parser",
      parser_version: "1.0.0",
      server: { world_uid: "fixture-world-local" },
      guilds: [
        { guild_uid: "fixture-guild-alpha", name: "Fixture Guild Alpha" },
      ],
      players: [
        {
          player_uid: "fixture-player-a-uid",
          nickname: "Fixture Player A",
          level: 36,
          guild_uid: "fixture-guild-alpha",
        },
      ],
      pals: next
        ? [
            snapshotPal("fixture-pal-a-owned-001", "test_parent_a", "male", [
              "test_passive_a",
            ]),
            snapshotPal("fixture-pal-a-owned-002", "test_child_pal", "female", [
              "test_passive_a",
              "test_passive_b",
            ]),
            snapshotPal("phase7-e2e-child-best", "test_child_pal", "female", [
              "test_passive_a",
              "test_passive_b",
            ]),
            snapshotPal("phase7-e2e-child-weaker", "test_child_pal", "male", [
              "test_passive_a",
            ]),
            snapshotPal("phase7-e2e-wrong", "test_parent_b", "female", []),
          ]
        : [
            snapshotPal("phase7-e2e-child-best", "test_child_pal", "female", [
              "test_passive_a",
              "test_passive_b",
            ]),
          ],
      warnings: [],
    },
  });
}

async function detectCandidates(snapshotId: string): Promise<void> {
  const { url, serviceRole } = localEnvironment();
  await executeFile(
    process.env.PALHATCH_E2E_UV_BIN ?? "uv",
    [
      "run",
      "pal-hatch-helper",
      "candidate-detector",
      "--snapshot-id",
      snapshotId,
    ],
    {
      cwd: agentDirectory,
      env: {
        ...process.env,
        APP_ENV: "test",
        SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: serviceRole,
      },
      timeout: 45_000,
      maxBuffer: 1_000_000,
    },
  );
}

test.describe.serial("Phase 7 local execution workflow", () => {
  test("adopts a formal Phase 6 route, detects candidates and requires player confirmation", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const jobId = await createCompletedPhase6Fixture();
    await login(page);
    await page.goto(`/breeder/jobs/${jobId}`);
    await expect(page.getByTestId("job-stage")).toContainText("completed");
    originalSnapshotId = await page
      .locator("dd")
      .filter({ hasText: "40000000" })
      .first()
      .innerText();
    originalCatalogId = "51000000-0000-4000-8000-000000000001";

    await page.getByRole("button", { name: "采用此方案" }).click();
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/, {
      timeout: 30_000,
    });
    planId = page.url().split("/").at(-1) ?? "";
    expect(planId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(
      page.getByText(/系统只检测候选，必须由玩家确认/),
    ).toBeVisible();

    await page.getByRole("button", { name: "标记为配种中" }).click();
    await expect(page.getByRole("button", { name: "继续尝试" })).toBeVisible();
    const nextSnapshotId = await publishSnapshot("next");
    await detectCandidates(nextSnapshotId);
    await page.reload();

    const bestCandidate = page
      .getByTestId("offspring-candidate")
      .filter({ hasText: "phase7-e2e-child-best" });
    await expect(bestCandidate).toBeVisible();
    await expect(page.getByTestId("offspring-candidate")).toHaveCount(2);
    await page.reload();
    await expect(bestCandidate).toBeVisible();
    await bestCandidate.getByRole("button", { name: "确认真实子代" }).click();
    await expect(
      page.getByText(/已选真实实例：phase7-e2e-child-best/),
    ).toHaveText(/phase7-e2e-child-best/);
    await expect(page.getByText("步骤 2")).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("invalidates a missing dependency and recalculates without rewriting history", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await login(page);
    await page.goto(`/plans/${planId}`);
    const laterSnapshotId = await publishSnapshot("later");
    await detectCandidates(laterSnapshotId);
    await page.reload();

    await expect(page.getByText("DEPENDENCY_DISAPPEARED")).toBeVisible();
    await page.getByRole("button", { name: "基于最新库存重新计算" }).click();
    await expect(page).toHaveURL(/\/breeder\/jobs\/[0-9a-f-]{36}$/);

    await page.goto(`/plans/${planId}`);
    await expect(page.getByText("DEPENDENCY_DISAPPEARED")).toBeVisible();
    await expect(page.getByText(originalSnapshotId)).toBeVisible();
    await expect(page.getByText(originalCatalogId)).toBeVisible();
  });
});
