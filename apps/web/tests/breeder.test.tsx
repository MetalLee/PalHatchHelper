import type {
  BreederFormContext,
  BreedingJobDetailRpcSuccess,
  BreedingRoute,
  CreateBreedingJobRequest,
  RouteModeScore,
  RouteScoreComponent,
} from "@palhatch/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BreederForm } from "../features/breeder/breeder-form";
import { BreedingJobView } from "../features/breeder/breeding-job-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const context: BreederFormContext = {
  data_state: "healthy",
  inventory_snapshot_id: "40000000-0000-4000-8000-000000000002",
  game_data_version_id: "51000000-0000-4000-8000-000000000001",
  game_data_content_hash: "c".repeat(64),
  game_build_id: "24181105",
  game_version: "v1.0.1.100619",
  algorithm_version: "phase4b-deterministic-v1",
  scoring_profile_versions: {
    balanced: "balanced-v2",
    fastest: "fastest-v2",
    highest_success: "highest-success-v2",
    least_borrowing: "least-borrowing-v2",
  },
  pals: [
    {
      pal_id: "test_child_pal",
      encyclopedia_no: 3,
      display_name: "幻色幼崽",
      element_types: ["neutral"],
    },
    {
      pal_id: "test_parent_a",
      encyclopedia_no: 1,
      display_name: "棉悠悠",
      element_types: ["neutral"],
    },
  ],
  passive_skills: ["a", "b", "c", "d", "e"].map((id, index) => ({
    passive_skill_id: `test_passive_${id}`,
    display_name: `被动 ${id.toUpperCase()}`,
    rank: 5 - index,
    is_negative: false,
  })),
};

const components: RouteScoreComponent[] = [
  "route_length",
  "inventory_coverage",
  "passive_concentration",
  "borrowing",
  "intermediate_cost",
  "attempt_cost",
  "stability",
].map((component) => ({
  component: component as RouteScoreComponent["component"],
  raw_value: 1,
  normalized_score: 80,
  weight: 1 / 7,
  weighted_score: 80 / 7,
}));

const modeScores: RouteModeScore[] = [
  "balanced",
  "fastest",
  "highest_success",
  "least_borrowing",
].map((optimization_mode) => ({
  optimization_mode: optimization_mode as RouteModeScore["optimization_mode"],
  scoring_profile_version: `${optimization_mode}-v2`,
  total_score: 80,
  components: components as RouteModeScore["components"],
}));

function route(rank: number): BreedingRoute {
  return {
    route_key: String(rank).repeat(64),
    rank,
    optimization_mode: "balanced",
    total_score: 90 - rank,
    generation_count: 1,
    step_count: 1,
    estimated_attempts_min: 1,
    estimated_attempts_max: 3,
    difficulty: "low",
    borrowed_pal_count: rank - 1,
    inventory_coverage: 1,
    inheritance_score: 0.9,
    existing_target_instance_uid: null,
    score_breakdown: {
      scoring_profile_version: "balanced-v2",
      estimate_basis: "strategy_heuristic_no_verified_probability",
      raw_metrics: {
        generation_count: 1,
        step_count: 1,
        unique_starting_instance_count: 2,
        borrowed_pal_count: rank - 1,
        inventory_coverage: 1,
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
      mode_scores:
        modeScores as BreedingRoute["score_breakdown"]["mode_scores"],
    },
    steps: [
      {
        step_index: 0,
        generation: 1,
        recipe_type: "normal",
        parent_a: {
          source_type: "inventory",
          pal_id: "test_parent_a",
          instance_uid: `fixture-parent-a-${rank}`,
          owner_display_name: "Fixture Player A",
          gender: "male",
          passive_skill_ids: ["test_passive_a"],
          required_passive_ids: ["test_passive_a"],
          borrowed: false,
          produced_by_step_index: null,
          location_type: "base",
          location_name: "Fixture Base",
        },
        parent_b: {
          source_type: "inventory",
          pal_id: "test_parent_b",
          instance_uid: `fixture-parent-b-${rank}`,
          owner_display_name: "Fixture Player B",
          gender: "female",
          passive_skill_ids: [],
          required_passive_ids: [],
          borrowed: rank > 1,
          produced_by_step_index: null,
          location_type: "base",
          location_name: "Fixture Base",
        },
        child_pal_id: "test_child_pal",
        child_required_gender: null,
        required_passive_ids: ["test_passive_a"],
      },
    ],
    ai_explanation: `路线 ${rank} 模板解释`,
    ai_labels: ["解释已降级"],
  };
}

function completedJob(): BreedingJobDetailRpcSuccess {
  return {
    ok: true,
    data: {
      job_id: "60000000-0000-4000-8000-000000000066",
      status: "completed",
      target_pal_id: "test_child_pal",
      desired_passive_ids: ["test_passive_a"],
      optimization_mode: "balanced",
      allow_guild_shared: true,
      max_generations: 5,
      inventory_snapshot_id: context.inventory_snapshot_id,
      game_data_version_id: context.game_data_version_id,
      game_data_content_hash: context.game_data_content_hash,
      algorithm_version: context.algorithm_version,
      scoring_profile_version: "balanced-v2",
      attempt_count: 1,
      error_code: null,
      created_at: "2026-07-16T06:00:00Z",
      completed_at: "2026-07-16T06:00:05Z",
      plan: {
        plan_id: "61000000-0000-4000-8000-000000000066",
        result_digest: "d".repeat(64),
        route_count: 3,
        explanation_codes: [],
        diagnostics: { search_complete: true },
        ai: {
          provider: "template",
          model: null,
          explanation: "本地模板解释。",
          degraded: true,
        },
        routes: [route(1), route(2), route(3)],
      },
    },
  };
}

describe("Phase 6 breeder form", () => {
  it("searches stable catalog options, enforces four passives and creates a fixed request", async () => {
    const createJob = vi.fn(async (request: CreateBreedingJobRequest) => {
      void request;
      return {
        job_id: "60000000-0000-4000-8000-000000000066",
        reused: false,
        status: "pending" as const,
      };
    });
    render(<BreederForm context={context} createJob={createJob} />);

    fireEvent.change(
      screen.getByLabelText("目标 Pal（名称、编号或 Stable ID）"),
      {
        target: { value: "test_child_pal" },
      },
    );
    for (const id of ["A", "B", "C", "D", "E"]) {
      fireEvent.click(
        screen.getByRole("checkbox", { name: new RegExp(`被动 ${id}`) }),
      );
    }
    expect(screen.getByRole("alert").textContent).toContain("最多选择四个被动");
    fireEvent.change(screen.getByLabelText("优化模式"), {
      target: { value: "least_borrowing" },
    });
    fireEvent.change(screen.getByLabelText("最大代数"), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建配种任务" }));

    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));
    expect(createJob.mock.calls[0]?.[0]).toMatchObject({
      target_pal_id: "test_child_pal",
      desired_passive_ids: [
        "test_passive_a",
        "test_passive_b",
        "test_passive_c",
        "test_passive_d",
      ],
      optimization_mode: "least_borrowing",
      max_generations: 6,
    });
    expect(screen.getByText("24181105")).toBeTruthy();
    expect(screen.getByText("phase4b-deterministic-v1")).toBeTruthy();
  });

  it.each(["幻色幼崽", "3", "#3"])(
    "resolves the target from the published name or encyclopedia number: %s",
    async (targetQuery) => {
      const createJob = vi.fn(async (request: CreateBreedingJobRequest) => {
        void request;
        return {
          job_id: "60000000-0000-4000-8000-000000000066",
          reused: false,
          status: "pending" as const,
        };
      });
      render(<BreederForm context={context} createJob={createJob} />);

      fireEvent.change(
        screen.getByLabelText("目标 Pal（名称、编号或 Stable ID）"),
        { target: { value: targetQuery } },
      );
      fireEvent.click(screen.getByRole("button", { name: "创建配种任务" }));

      await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));
      expect(createJob.mock.calls[0]?.[0].target_pal_id).toBe("test_child_pal");
    },
  );
});

describe("Phase 6 job comparison", () => {
  it("switches among three mobile-safe routes and separates facts from degraded AI", () => {
    render(<BreedingJobView initialResult={completedJob()} poll={false} />);

    expect(screen.getByText("解释已降级")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /路线/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "路线 2" }));
    expect(screen.getByText("fixture-parent-a-2")).toBeTruthy();
    expect(screen.getByText("Fixture Player B")).toBeTruthy();
    expect(screen.getByText("路线 2 模板解释")).toBeTruthy();
    expect(screen.getByText("完整评分明细")).toBeTruthy();
    expect(screen.getByText(context.game_data_version_id)).toBeTruthy();
  });

  it.each([
    "pending",
    "processing",
    "algorithm_completed",
    "ai_enriching",
    "retry_pending",
    "failed",
    "cancelled",
  ] as const)("shows the real %s stage without a fake percentage", (status) => {
    const value = completedJob();
    value.data.status = status;
    value.data.plan = null;
    value.data.completed_at =
      status === "failed" || status === "cancelled"
        ? value.data.completed_at
        : null;
    render(<BreedingJobView initialResult={value} poll={false} />);

    expect(screen.getByTestId("job-stage").textContent).toContain(status);
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("does not report an incomplete bounded search as proof that no legal route exists", () => {
    const value = completedJob();
    if (value.data.plan === null) throw new Error("fixture plan missing");
    value.data.plan.routes = [];
    value.data.plan.route_count = 0;
    value.data.plan.explanation_codes = [
      "SEARCH_LIMIT_REACHED",
      "SEARCH_INCOMPLETE",
    ];
    value.data.plan.diagnostics = { search_complete: false };

    render(<BreedingJobView initialResult={value} poll={false} />);

    expect(screen.getByText("搜索达到安全上限")).toBeTruthy();
    expect(screen.queryByText("当前没有合法路线")).toBeNull();
  });

  it("shows actionable advice when a complete search proves there is no legal route", () => {
    const value = completedJob();
    if (value.data.plan === null) throw new Error("fixture plan missing");
    value.data.plan.routes = [];
    value.data.plan.route_count = 0;
    value.data.plan.explanation_codes = ["NO_LEGAL_ROUTE"];
    value.data.plan.diagnostics = { search_complete: true };

    render(<BreedingJobView initialResult={value} poll={false} />);

    expect(screen.getByText("当前没有合法路线")).toBeTruthy();
    expect(screen.getByText(/可减少期望被动/)).toBeTruthy();
  });
});
