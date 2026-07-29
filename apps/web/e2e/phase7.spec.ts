import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const fixturePassword = "palhatch-local-fixture";
const workerId = "phase7-e2e-worker";
const routeKey = "7".repeat(64);

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
  await page.goto("/zh/login");
  await page.getByLabel("邮箱").fill("player-a@palhatch.fixture.invalid");
  await page.getByLabel("密码").fill(fixturePassword);
  await page.getByRole("button", { name: "登录" }).click();
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
    balanced: "balanced-v6",
    fastest: "fastest-v6",
    highest_success: "highest-success-v6",
    least_borrowing: "least-borrowing-v6",
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
    scoring_profile_version: "balanced-v6",
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
      algorithm_version: "inventory-trait-aware-deterministic-v5",
      scoring_profile_version: "balanced-v6",
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

test.describe.serial("Phase 7 local My Plans workflow", () => {
  test("saves, displays and removes an immutable breeding route", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const jobId = await createCompletedPhase6Fixture();
    await login(page);
    await page.goto(`/breeder/jobs/${jobId}`);
    await expect(page.getByTestId("job-stage")).toContainText("completed");
    await page.getByRole("button", { name: "保存到我的计划" }).click();
    const savedLink = page.getByRole("link", { name: "查看我的计划" });
    await expect(savedLink).toBeVisible();
    await savedLink.click();
    await expect(page).toHaveURL(/\/zh\/plans\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("heading", { name: "幻色幼崽", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("配种路径", { exact: true })).toBeVisible();
    await expect(page.getByText("本次计算依据")).toBeVisible();
    await expect(page.getByTestId("overview-scenery")).toHaveCount(0);
    await expect(page.getByText(/当前步骤|候选子代|计划进度/)).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "移除收藏" }).click();
    await expect(page).toHaveURL(/\/zh\/plans$/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "暂无收藏计划" }),
    ).toBeVisible();
  });
});
