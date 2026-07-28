import type {
  BreedingJobDetailRpcSuccess,
  BreedingRoute,
  PlanListPage,
  PlanSummary,
} from "@palhatch/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlanDetail } from "../features/plans/plan-detail";
import { PlanList } from "../features/plans/plan-list";
import type { SavedPlanDetail } from "../features/plans/server";

const routeId = "62000000-0000-4000-8000-000000000001";
const jobId = "60000000-0000-4000-8000-000000000001";
const scoreComponents = [
  "route_length",
  "inventory_coverage",
  "passive_concentration",
  "borrowing",
  "intermediate_cost",
  "attempt_cost",
  "stability",
  "acquisition_cost",
] as const;

function route(): BreedingRoute {
  return {
    route_id: routeId,
    saved_plan_at: "2026-07-27T08:00:00Z",
    route_key: "a".repeat(64),
    rank: 1,
    optimization_mode: "balanced",
    total_score: 88,
    generation_count: 1,
    step_count: 1,
    estimated_attempts_min: 1,
    estimated_attempts_max: 3,
    difficulty: "low",
    borrowed_pal_count: 0,
    inventory_coverage: 1,
    inventory_passive_coverage: 1,
    inheritance_score: 0.9,
    feasibility_status: "ready",
    adoptable: true,
    missing_pal_count: 0,
    missing_passive_ids: [],
    missing_requirements: [],
    passive_sources: [
      {
        passive_id: "swift",
        source_instance_uid: "parent-a",
        source_pal_id: "parent_a",
        first_required_step_index: 0,
      },
    ],
    existing_target_instance_uid: null,
    score_breakdown: {
      scoring_profile_version: "balanced-v6",
      estimate_basis: "strategy_heuristic_no_verified_probability",
      raw_metrics: {
        generation_count: 1,
        step_count: 1,
        unique_starting_instance_count: 2,
        starting_requirement_count: 2,
        missing_pal_count: 0,
        missing_passive_requirement_count: 0,
        missing_passive_count: 0,
        borrowed_pal_count: 0,
        inventory_coverage: 1,
        inventory_passive_coverage: 1,
        passive_carrier_count: 1,
        passive_concentration: 1,
        extra_passive_count: 0,
        intermediate_pal_count: 0,
        intermediate_passive_checkpoint_count: 0,
        required_gender_checkpoint_count: 0,
        estimated_attempts_min: 1,
        estimated_attempts_max: 3,
        difficulty: "low",
      },
      mode_scores: [
        "balanced",
        "fastest",
        "highest_success",
        "least_borrowing",
      ].map((optimization_mode) => ({
        optimization_mode,
        scoring_profile_version: `${optimization_mode}-v6`,
        total_score: 88,
        components: scoreComponents.map((component) => ({
          component,
          raw_value: 1,
          normalized_score: 88,
          weight: 0.125,
          weighted_score: 11,
        })),
      })) as BreedingRoute["score_breakdown"]["mode_scores"],
    },
    steps: [
      {
        step_index: 0,
        generation: 1,
        recipe_type: "normal",
        parent_a: {
          source_type: "inventory",
          pal_id: "parent_a",
          instance_uid: "parent-a",
          owner_display_name: "玩家 A",
          gender: "male",
          passive_skill_ids: ["swift"],
          required_passive_ids: ["swift"],
          borrowed: false,
          produced_by_step_index: null,
          location_type: "base",
          location_name: "第一据点",
          location_slot_index: 1,
        },
        parent_b: {
          source_type: "inventory",
          pal_id: "parent_b",
          instance_uid: "parent-b",
          owner_display_name: "玩家 A",
          gender: "female",
          passive_skill_ids: [],
          required_passive_ids: [],
          borrowed: false,
          produced_by_step_index: null,
          location_type: "player_storage",
          location_name: null,
          location_slot_index: 2,
        },
        child_pal_id: "target_pal",
        child_required_gender: null,
        required_passive_ids: ["swift"],
      },
    ],
    ai_explanation: null,
    ai_labels: [],
  };
}

function job(): BreedingJobDetailRpcSuccess["data"] {
  const savedRoute = route();
  return {
    job_id: jobId,
    status: "completed",
    target_pal_id: "target_pal",
    desired_passive_ids: ["swift"],
    optimization_mode: "balanced",
    allow_guild_shared: false,
    max_generations: 5,
    inventory_snapshot_id: "40000000-0000-4000-8000-000000000001",
    game_data_version_id: "51000000-0000-4000-8000-000000000001",
    game_data_content_hash: "c".repeat(64),
    algorithm_version: "inventory-trait-aware-deterministic-v5",
    scoring_profile_version: "balanced-v6",
    localization: {
      locale: "zh-CN",
      pals: [
        { pal_id: "parent_a", display_name: "棉悠悠" },
        { pal_id: "parent_b", display_name: "捣蛋猫" },
        { pal_id: "target_pal", display_name: "幻色幼崽" },
      ],
      passive_skills: [
        {
          passive_skill_id: "swift",
          display_name: "神速",
          rank: 3,
          is_negative: false,
        },
      ],
    },
    attempt_count: 1,
    error_code: null,
    created_at: "2026-07-27T07:59:00Z",
    completed_at: "2026-07-27T08:00:00Z",
    plan: {
      plan_id: "61000000-0000-4000-8000-000000000001",
      result_digest: "d".repeat(64),
      route_count: 1,
      missing_passive_ids: [],
      explanation_codes: [],
      diagnostics: { search_complete: true },
      ai: {
        provider: "template",
        model: null,
        explanation: "",
        degraded: true,
      },
      routes: [savedRoute],
    },
  };
}

function listPage(items = [summary()]): PlanListPage {
  return { items, next_cursor: null, query_boundary: "2026-07-27T08:10:00Z" };
}

function summary(): PlanListPage["items"][number] {
  return {
    route_id: routeId,
    source_job_id: jobId,
    target_pal_id: "target_pal",
    target_pal_display_name: "幻色幼崽",
    desired_passive_ids: ["swift"],
    desired_passive_display_names: ["神速"],
    desired_passives: [
      {
        passive_skill_id: "swift",
        display_name: "神速",
        rank: 3,
        is_negative: false,
      },
    ],
    optimization_mode: "balanced",
    feasibility_status: "ready",
    generation_count: 1,
    step_count: 1,
    borrowed_pal_count: 0,
    missing_pal_count: 0,
    estimated_attempts_min: 1,
    estimated_attempts_max: 3,
    difficulty: "low",
    total_score: 88,
    saved_at: "2026-07-27T08:00:00Z",
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("My Plans route saves", () => {
  it("renders saved route facts without execution progress", () => {
    const { container } = render(<PlanList page={listPage()} />);
    expect(screen.getByText("幻色幼崽")).toBeTruthy();
    expect(screen.getByText("库存可执行")).toBeTruthy();
    expect(screen.getByText("神速")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "收藏计划摘要" })).toBeNull();
    expect(screen.getByText("想要的被动")).toBeTruthy();
    expect(screen.queryByText("目标被动")).toBeNull();
    const card = container.querySelector<HTMLElement>("[data-plan-card]");
    expect(card).not.toBeNull();
    expect(card?.className).toContain("max-w-[32rem]");
    const planGrid = screen.getByRole("region", { name: "计划列表" });
    expect(planGrid.className).toContain(
      "grid-cols-[repeat(auto-fit,minmax(min(100%,32rem),32rem))]",
    );
    expect(planGrid.className).toContain("justify-start");
    expect(planGrid.className).toContain("gap-3");
    expect(planGrid.className).not.toContain("justify-center");
    expect(planGrid.className).not.toContain("lg:grid-cols-2");
    const passiveGrid = container.querySelector<HTMLElement>(
      '[data-passive-layout="2x2"]',
    );
    expect(passiveGrid?.className).toContain("auto-rows-min");
    expect(passiveGrid?.className).toContain("items-start");
    expect(passiveGrid?.className).toContain("min-h-[3.875rem]");
    expect(card?.className).toContain("h-full");
    const cardContent = card?.firstElementChild as HTMLElement | null;
    expect(cardContent?.className).toContain("h-full");
    expect(screen.getByRole("link", { name: /查看计划/ }).className).toContain(
      "mt-auto",
    );
    expect(
      screen.getByRole("link", { name: /查看计划/ }).getAttribute("href"),
    ).toBe(`/plans/${routeId}`);
    expect(screen.queryByText(/当前步骤|候选子代|计划进度/)).toBeNull();
  });

  it("keeps an actionable empty state", () => {
    render(<PlanList page={listPage([])} />);
    expect(screen.getByRole("heading", { name: "暂无收藏计划" })).toBeTruthy();
    expect(
      screen.getAllByRole("link", { name: "开始规划" }).length,
    ).toBeGreaterThan(0);
  });

  it("reserves two passive rows for plans with zero to two desired passives", () => {
    const base = summary();
    const noPassives: PlanSummary = {
      ...base,
      route_id: "62000000-0000-4000-8000-000000000002",
      desired_passive_ids: [],
      desired_passive_display_names: [],
      desired_passives: [],
    };
    const twoPassives: PlanSummary = {
      ...base,
      route_id: "62000000-0000-4000-8000-000000000003",
      desired_passive_ids: ["swift", "artisan"],
      desired_passive_display_names: ["神速", "工匠精神"],
      desired_passives: [
        base.desired_passives[0]!,
        {
          passive_skill_id: "artisan",
          display_name: "工匠精神",
          rank: 2,
          is_negative: false,
        },
      ],
    };

    const { container } = render(
      <PlanList page={listPage([noPassives, base, twoPassives])} />,
    );

    expect(screen.getByText("无指定被动").className).toContain(
      "min-h-[3.875rem]",
    );
    const passiveGrids = container.querySelectorAll<HTMLElement>(
      '[data-passive-layout="2x2"]',
    );
    expect(passiveGrids).toHaveLength(2);
    expect(
      Array.from(passiveGrids).every((grid) =>
        grid.classList.contains("min-h-[3.875rem]"),
      ),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("link", { name: /查看计划/ })
        .every((link) => link.classList.contains("mt-auto")),
    ).toBe(true);
  });

  it("shows the immutable route and removes only the save", async () => {
    const savedRoute = route();
    const detail: SavedPlanDetail = {
      reference: {
        route_id: routeId,
        source_job_id: jobId,
        saved_at: "2026-07-27T08:00:00Z",
      },
      job: job(),
      route: savedRoute,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ route_id: routeId, removed: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PlanDetail detail={detail} />);

    expect(
      screen.getByRole("heading", { name: "幻色幼崽", level: 1 }),
    ).toBeTruthy();
    expect(screen.queryByTestId("overview-scenery")).toBeNull();
    expect(
      screen.getByRole("region", { name: "收藏路线的完整配种路径树" }),
    ).toBeTruthy();
    expect(screen.getByText("配种路径")).toBeTruthy();
    expect(screen.queryByText("本步骤需保留")).toBeNull();
    expect(screen.getByText("本次计算依据")).toBeTruthy();
    expect(screen.getByRole("link", { name: "查看原配种结果" })).toBeTruthy();
    expect(
      screen.getByText(
        "移除后，这条路线将不再出现在“我的计划”中，原配种结果仍会保留。",
      ),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(
      /需求|固定版本|目录版本|算法版本|评分版本|原任务/,
    );
    expect(screen.queryByText(/当前步骤|候选子代|计划进度/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "移除收藏" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(`/api/plans/${routeId}`, {
        method: "DELETE",
        cache: "no-store",
      }),
    );
  });
});
