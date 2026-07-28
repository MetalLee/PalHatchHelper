import type {
  BreederFormContext,
  BreedingJobDetailRpcSuccess,
  BreedingRoute,
  CreateBreedingJobRequest,
  RouteModeScore,
  RouteScoreComponent,
} from "@palhatch/contracts";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BreederForm } from "../features/breeder/breeder-form";
import { BreedingJobView } from "../features/breeder/breeding-job-view";

const { routerPush, routerRefresh } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

beforeEach(() => {
  routerPush.mockReset();
  routerRefresh.mockReset();
  vi.unstubAllGlobals();
});

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
    effect_text:
      index === 4 ? "工作速度降低 10%" : `工作速度提升 ${20 - index * 2}%`,
    rank: 5 - index,
    is_negative: index === 4,
  })),
};

function selectTarget(query: string): void {
  fireEvent.click(
    screen.getByRole("combobox", {
      name: "目标帕鲁",
    }),
  );
  const search = screen.getByRole("combobox", { name: "搜索目标帕鲁" });
  fireEvent.change(search, { target: { value: query } });
  fireEvent.click(screen.getByRole("option", { name: /幻色幼崽/ }));
}

const components: RouteScoreComponent[] = [
  "route_length",
  "inventory_coverage",
  "passive_concentration",
  "borrowing",
  "intermediate_cost",
  "attempt_cost",
  "stability",
  "acquisition_cost",
].map((component) => ({
  component: component as RouteScoreComponent["component"],
  raw_value: 1,
  normalized_score: 80,
  weight: 1 / 8,
  weighted_score: 10,
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
    route_id: `62000000-0000-4000-8000-${String(rank).padStart(12, "0")}`,
    saved_plan_at: null,
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
    inventory_passive_coverage: 1,
    inheritance_score: 0.9,
    existing_target_instance_uid: null,
    feasibility_status: "ready",
    adoptable: true,
    missing_pal_count: 0,
    missing_passive_ids: [],
    missing_requirements: [],
    passive_sources: [
      {
        passive_id: "test_passive_a",
        source_instance_uid: `fixture-parent-a-${rank}`,
        source_pal_id: "test_parent_a",
        first_required_step_index: 0,
      },
    ],
    score_breakdown: {
      scoring_profile_version: "balanced-v2",
      estimate_basis: "strategy_heuristic_no_verified_probability",
      raw_metrics: {
        generation_count: 1,
        step_count: 1,
        unique_starting_instance_count: 2,
        starting_requirement_count: 2,
        missing_pal_count: 0,
        missing_passive_requirement_count: 0,
        missing_passive_count: 0,
        borrowed_pal_count: rank - 1,
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
          location_slot_index: 7,
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
          location_type: "player_storage",
          location_name: null,
          location_slot_index: 64,
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
      localization: {
        locale: "zh-CN",
        pals: [
          { pal_id: "test_parent_a", display_name: "棉悠悠" },
          { pal_id: "test_parent_b", display_name: "捣蛋猫" },
          { pal_id: "test_child_pal", display_name: "幻色幼崽" },
        ],
        passive_skills: [
          {
            passive_skill_id: "test_passive_a",
            display_name: "认真",
            rank: 5,
            is_negative: false,
          },
        ],
      },
      attempt_count: 1,
      error_code: null,
      created_at: "2026-07-16T06:00:00Z",
      completed_at: "2026-07-16T06:00:05Z",
      plan: {
        plan_id: "61000000-0000-4000-8000-000000000066",
        result_digest: "d".repeat(64),
        route_count: 3,
        missing_passive_ids: [],
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
  it("keeps native submission disabled until the client has hydrated", () => {
    const markup = renderToString(<BreederForm context={context} />);

    expect(markup).toMatch(
      /<button[^>]*disabled=""[^>]*>[\s\S]*创建配种任务[\s\S]*<\/button>/,
    );
  });

  it("selects a target from the searchable combobox with the keyboard", () => {
    render(<BreederForm context={context} />);

    fireEvent.click(
      screen.getByRole("combobox", {
        name: "目标帕鲁",
      }),
    );
    const search = screen.getByRole("combobox", { name: "搜索目标帕鲁" });
    fireEvent.change(search, { target: { value: "幻色幼崽" } });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });

    const trigger = screen.getByRole("combobox", { name: "目标帕鲁" });
    expect(
      within(trigger).getByRole("img", { name: "幻色幼崽头像" }),
    ).toBeTruthy();
    expect(
      within(trigger)
        .getByRole("img", { name: "幻色幼崽头像" })
        .getAttribute("width"),
    ).toBe("72");
    expect(trigger.textContent).toContain("幻色幼崽");
    expect(trigger.textContent).toContain("#003");
    expect(trigger.textContent).not.toContain("test_child_pal");
    expect(screen.queryByRole("region", { name: "目标帕鲁摘要" })).toBeNull();
  });

  it("does not match target Pals by internal IDs", () => {
    const untranslatedContext = {
      ...context,
      pals: context.pals.map((pal) => ({
        ...pal,
        display_name: pal.pal_id,
      })),
    };
    render(<BreederForm context={untranslatedContext} />);

    fireEvent.click(
      screen.getByRole("combobox", {
        name: "目标帕鲁",
      }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "搜索目标帕鲁" }), {
      target: { value: "test_child_pal" },
    });

    expect(screen.queryByText("test_child_pal", { exact: true })).toBeNull();
    expect(screen.getByText("没有匹配的目标帕鲁")).toBeTruthy();
  });

  it("does not match passive skills by internal IDs", () => {
    const untranslatedContext = {
      ...context,
      passive_skills: context.passive_skills.map((skill) => ({
        ...skill,
        display_name: skill.passive_skill_id,
      })),
    };
    render(<BreederForm context={untranslatedContext} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索被动" }), {
      target: { value: "test_passive_a" },
    });

    expect(screen.queryByRole("button", { name: /选择被动 A/ })).toBeNull();
    expect(screen.getByText("没有匹配的被动")).toBeTruthy();
  });

  it("shows passive traits, enforces four selections and creates the fixed request", async () => {
    const createJob = vi.fn(async (request: CreateBreedingJobRequest) => {
      void request;
      return {
        job_id: "60000000-0000-4000-8000-000000000066",
        reused: false,
        status: "pending" as const,
      };
    });
    render(<BreederForm context={context} createJob={createJob} />);

    selectTarget("幻色幼崽");

    for (const id of ["A", "B", "C", "D", "E"]) {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(`选择被动 ${id}`) }),
      );
    }
    expect(screen.getByRole("alert").textContent).toContain("最多选择四个被动");
    expect(screen.queryByText(/Rank|R5/)).toBeNull();
    expect(screen.getByText("工作速度提升 20%")).toBeTruthy();
    expect(screen.getByText("工作速度降低 10%")).toBeTruthy();
    expect(screen.queryByText("正面", { exact: true })).toBeNull();
    expect(screen.queryByText("负面", { exact: true })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "最少借用" }));
    fireEvent.change(screen.getByLabelText("最大代数"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "允许使用公会共享" }));
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
      allow_guild_shared: false,
      max_generations: 5,
    });
    expect(routerPush).toHaveBeenCalledWith(
      "/breeder/jobs/60000000-0000-4000-8000-000000000066",
    );
  });

  it("keeps selected passives above the scrollable candidates, removes and clears them", () => {
    render(<BreederForm context={context} />);

    fireEvent.click(screen.getByRole("button", { name: /选择被动 A/ }));
    fireEvent.click(screen.getByRole("button", { name: /选择被动 B/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索被动" }), {
      target: { value: "被动 E" },
    });

    const selected = screen.getByRole("region", { name: "已选择的被动" });
    expect(screen.queryByText("期望被动（最多 4 个）")).toBeNull();
    expect(selected.getAttribute("data-passive-layout")).toBe("2x2");
    expect(
      Array.from(
        screen
          .getByTestId("breeder-create-form")
          .querySelectorAll(".passive-badge"),
      ).every((badge) => badge.classList.contains("breeder-passive-badge")),
    ).toBe(true);
    expect(selected.textContent).toContain("被动 A");
    fireEvent.click(screen.getByRole("button", { name: "移除被动 A" }));
    expect(selected.textContent).not.toContain("被动 A");
    fireEvent.click(within(selected).getByRole("button", { name: "清空" }));
    expect(selected.textContent).toContain("尚未选择被动");
    expect(screen.getByText("已选择 0 / 4")).toBeTruthy();
  });

  it("renders all four optimization modes as selectable cards", () => {
    render(<BreederForm context={context} />);

    const modes = screen.getByRole("radiogroup", { name: "优化模式" });
    expect(within(modes).getAllByRole("radio")).toHaveLength(4);
    expect(
      (
        within(modes).getByRole("radio", {
          name: "综合推荐",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    fireEvent.click(within(modes).getByRole("radio", { name: "最高成功率" }));
    expect(
      (
        within(modes).getByRole("radio", {
          name: "最高成功率",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it.each(["幻色幼崽", "3", "#3"])(
    "resolves a published target by name or encyclopedia number: %s",
    async (query) => {
      const createJob = vi.fn(async (request: CreateBreedingJobRequest) => {
        void request;
        return {
          job_id: "60000000-0000-4000-8000-000000000066",
          reused: false,
          status: "pending" as const,
        };
      });
      render(<BreederForm context={context} createJob={createJob} />);

      selectTarget(query);
      fireEvent.click(screen.getByRole("button", { name: "创建配种任务" }));

      await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));
      expect(createJob.mock.calls[0]?.[0].target_pal_id).toBe("test_child_pal");
    },
  );

  it("rejects an invalid internal target ID", async () => {
    const invalidContext: BreederFormContext = {
      ...context,
      pals: [{ ...context.pals[0]!, pal_id: "Invalid Target ID" }],
    };
    const createJob = vi.fn(async () => ({
      job_id: "60000000-0000-4000-8000-000000000066",
      reused: false,
      status: "pending" as const,
    }));
    render(<BreederForm context={invalidContext} createJob={createJob} />);

    fireEvent.click(
      screen.getByRole("combobox", {
        name: "目标帕鲁",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: /幻色幼崽/ }));
    fireEvent.click(screen.getByRole("button", { name: "创建配种任务" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "INVALID_BREEDING_REQUEST",
      ),
    );
    expect(createJob).not.toHaveBeenCalled();
  });

  it("requires a target from the fixed published catalog", async () => {
    const createJob = vi.fn(async () => ({
      job_id: "60000000-0000-4000-8000-000000000066",
      reused: false,
      status: "pending" as const,
    }));
    render(<BreederForm context={context} createJob={createJob} />);

    fireEvent.click(screen.getByRole("button", { name: "创建配种任务" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "INVALID_TARGET_PAL",
      ),
    );
    expect(createJob).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range maximum generation", async () => {
    const createJob = vi.fn(async () => ({
      job_id: "60000000-0000-4000-8000-000000000066",
      reused: false,
      status: "pending" as const,
    }));
    render(<BreederForm context={context} createJob={createJob} />);

    selectTarget("幻色幼崽");
    fireEvent.change(screen.getByLabelText("最大代数"), {
      target: { value: "6" },
    });
    fireEvent.submit(screen.getByTestId("breeder-create-form"));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "INVALID_BREEDING_REQUEST",
      ),
    );
    expect(createJob).not.toHaveBeenCalled();
  });

  it("shows the stable API error code without navigating", async () => {
    const createJob = vi.fn(async () => {
      throw new Error("JOB_CREATE_CONFLICT");
    });
    render(<BreederForm context={context} createJob={createJob} />);

    selectTarget("幻色幼崽");
    fireEvent.click(screen.getByRole("button", { name: "创建配种任务" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "JOB_CREATE_CONFLICT",
      ),
    );
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("does not repeat the global data-state warning", () => {
    render(<BreederForm context={{ ...context, data_state: "parse_error" }} />);

    expect(screen.queryByText(/当前库存状态/)).toBeNull();
    expect(screen.queryByText(/published 快照/)).toBeNull();
  });

  it("keeps the calculation details collapsed behind a readable summary", () => {
    render(<BreederForm context={context} />);

    const summary = screen.getByRole("complementary", {
      name: "本次计算依据",
    });
    expect(summary.textContent).not.toMatch(/目录|版本|边界/);
    expect(screen.queryByText(context.inventory_snapshot_id)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "查看详细信息" }));
    expect(screen.getByText(context.inventory_snapshot_id)).toBeTruthy();
    expect(screen.getByText(context.game_data_content_hash)).toBeTruthy();
    expect(screen.getByText("phase4b-deterministic-v1")).toBeTruthy();
  });

  it("keeps the creation form shrinkable without horizontal overflow at 390px", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const { container } = render(<BreederForm context={context} />);

    const form = container.querySelector('[data-testid="breeder-create-form"]');
    expect(form?.className).toContain("min-w-0");
    expect(form?.className).toContain("max-w-full");
    expect(form?.className).toContain("overflow-x-clip");
    expect(container.querySelectorAll('[class*="min-w-["]').length).toBe(0);
  });
});

describe("Phase 6 job comparison", () => {
  it("localizes every Pal, passive and score label with the pinned catalog", () => {
    const value = completedJob();

    render(<BreedingJobView initialResult={value} poll={false} />);

    expect(screen.getAllByText("幻色幼崽").length).toBeGreaterThan(0);
    expect(screen.getAllByText("棉悠悠").length).toBeGreaterThan(0);
    expect(screen.getAllByText("捣蛋猫").length).toBeGreaterThan(0);
    expect(screen.getAllByText("认真").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Rank/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "展开推荐依据" }));
    expect(screen.getByText("路线长度")).toBeTruthy();
    expect(screen.getByText(/综合推荐：80\.00/)).toBeTruthy();
    expect(screen.queryByText("test_parent_a")).toBeNull();
    expect(screen.queryByText(/被动 test_passive_a/)).toBeNull();
    expect(screen.queryByText("route_length")).toBeNull();
    expect(screen.queryByText(/balanced: 80\.00/)).toBeNull();
  });

  it("switches among three mobile-safe routes and separates facts from degraded AI", () => {
    render(<BreedingJobView initialResult={completedJob()} poll={false} />);

    expect(screen.queryByText("解释已降级")).toBeNull();
    const routeButtons = screen.getAllByRole("button", { name: /路线/ });
    expect(routeButtons).toHaveLength(3);
    expect(
      screen
        .getByRole("button", { name: "可执行路线 1" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("region", {
        name: "当前路线的配种路径树",
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "可执行路线 2" }));
    expect(
      screen
        .getByRole("button", { name: "可执行路线 2" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByText(/fixture-parent-a-2/)).toBeNull();
    expect(screen.getAllByText("Fixture Player B").length).toBeGreaterThan(0);
    expect(screen.queryByText("路线 2 模板解释")).toBeNull();
    expect(screen.queryByText("词条来源")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "展开推荐依据" }));
    expect(screen.getByText("各项得分")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "展开本次计算依据" }));
    expect(screen.getByText(context.game_data_version_id)).toBeTruthy();
  });

  it("renders real comparison metrics without inventing a success probability", () => {
    render(<BreedingJobView initialResult={completedJob()} poll={false} />);

    const firstRoute = screen.getByRole("button", {
      name: "可执行路线 1",
    });
    expect(firstRoute.textContent).toContain("总分");
    expect(firstRoute.textContent).toContain("89.00");
    expect(firstRoute.textContent).toContain("1 代");
    expect(firstRoute.textContent).toContain("1–3 次");
    expect(firstRoute.textContent).toContain("库存可执行");
    expect(firstRoute.textContent).toContain("库存覆盖");
    expect(firstRoute.textContent).toContain("词条覆盖");
    expect(firstRoute.textContent).not.toContain("排序第");
    expect(firstRoute.textContent).not.toMatch(/成功率\s*\d/);
    expect(firstRoute.dataset.density).toBe("compact");
  });

  it("keeps the tree text order understandable and draws lightweight SVG connections", () => {
    render(<BreedingJobView initialResult={completedJob()} poll={false} />);

    const tree = screen.getByRole("region", {
      name: "当前路线的配种路径树",
    });
    const mobileSteps = tree.querySelector("ol");
    const mobileText = mobileSteps?.textContent ?? "";
    expect(mobileText.indexOf("棉悠悠")).toBeGreaterThanOrEqual(0);
    expect(mobileText.indexOf("捣蛋猫")).toBeGreaterThan(
      mobileText.indexOf("棉悠悠"),
    );
    expect(mobileText.lastIndexOf("幻色幼崽")).toBeGreaterThan(
      mobileText.indexOf("捣蛋猫"),
    );
    expect(mobileText).toContain("Fixture Base · 工作位 8");
    expect(mobileText).toContain("终端 · 第 3 页 · 第 5 格");
    const branches = tree.querySelectorAll<SVGPathElement>(
      '[data-connector-role="branch"]',
    );
    const trunks = tree.querySelectorAll<SVGPathElement>(
      '[data-connector-role="trunk"]',
    );
    expect(branches).toHaveLength(2);
    expect(trunks).toHaveLength(1);
    expect(tree.querySelectorAll("path[marker-end]")).toHaveLength(1);
    for (const branch of branches) {
      expect(branch.dataset.endX).toBe(trunks[0]?.dataset.startX);
      expect(branch.dataset.endY).toBe(trunks[0]?.dataset.startY);
    }
    expect(
      tree.querySelectorAll('[data-passive-layout="2x2"]').length,
    ).toBeGreaterThan(0);
    for (const passiveGrid of tree.querySelectorAll(
      '[data-passive-layout="2x2"]',
    )) {
      expect(passiveGrid.className).toContain("items-start");
    }
    expect(screen.queryByText("本步骤需保留")).toBeNull();
    expect(screen.queryByText("Breeding route tree")).toBeNull();
    expect(screen.queryByText("Route comparison")).toBeNull();
    expect(screen.queryByText("Breeding target")).toBeNull();
    expect(screen.queryByText("Current job stage")).toBeNull();
    expect(
      screen
        .getAllByText("雄性")
        .some((label) =>
          label.parentElement
            ?.querySelector("svg")
            ?.className.baseVal.includes("text-sky-500"),
        ),
    ).toBe(true);
  });

  it("shows an existing target inventory node on both responsive tree renderers", () => {
    const value = completedJob();
    if (value.data.plan === null) throw new Error("fixture plan missing");
    const existingTarget = route(1);
    existingTarget.steps = [];
    existingTarget.step_count = 0;
    existingTarget.generation_count = 0;
    existingTarget.existing_target_instance_uid = "existing-target-instance";
    value.data.plan.routes = [existingTarget];
    value.data.plan.route_count = 1;

    const { container } = render(
      <BreedingJobView initialResult={value} poll={false} />,
    );

    expect(
      container.querySelectorAll('[data-tree-node="existing_target"]'),
    ).toHaveLength(2);
    expect(screen.getAllByText("现有目标").length).toBeGreaterThan(0);
  });

  it("separates ready and fallback routes and selects the first ready route", () => {
    const value = completedJob();
    if (value.data.plan === null) throw new Error("fixture plan missing");
    const fallback = route(1);
    fallback.feasibility_status = "needs_inventory";
    fallback.adoptable = false;
    fallback.missing_pal_count = 1;
    fallback.missing_requirements = [
      {
        pal_id: "test_parent_b",
        gender: "female",
        required_passive_ids: [],
        quantity: 1,
        step_indexes: [0],
      },
    ];
    value.data.plan.routes = [fallback, route(2)];
    value.data.plan.route_count = 2;

    const { container } = render(
      <BreedingJobView initialResult={value} poll={false} />,
    );

    expect(screen.getByText("库存可执行方案")).toBeTruthy();
    expect(screen.getByText(/需补充库存的备选方案/)).toBeTruthy();
    expect(screen.queryByText(/fixture-parent-a-2/)).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    expect(screen.getByRole("button", { name: "保存到我的计划" })).toBeTruthy();
  });

  it("shows inventory-wide missing passive sources independently", () => {
    const value = completedJob();
    if (value.data.plan === null) throw new Error("fixture plan missing");
    const fallback = route(1);
    fallback.feasibility_status = "needs_inventory";
    fallback.adoptable = false;
    fallback.inventory_passive_coverage = 0.5;
    fallback.missing_passive_ids = ["test_passive_b"];
    value.data.plan.missing_passive_ids = ["test_passive_b"];
    value.data.plan.routes = [fallback];
    value.data.plan.route_count = 1;

    render(<BreedingJobView initialResult={value} poll={false} />);

    expect(
      screen.getAllByText("库存缺少以下目标被动来源：").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("未翻译被动").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "保存到我的计划" })).toBeTruthy();
  });

  it("keeps route details shrinkable at a phone viewport", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
    });
    const { container } = render(
      <BreedingJobView initialResult={completedJob()} poll={false} />,
    );

    expect(container.firstElementChild?.className).toContain("min-w-0");
    expect(container.firstElementChild?.className).toContain("max-w-full");
    expect(
      screen.getByRole("region", { name: "当前路线的配种路径树" }).className,
    ).toContain("min-w-0");
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

  it.each(["SEARCH_LIMIT_REACHED", "SEARCH_TIMEOUT"])(
    "does not report %s as proof that no legal route exists",
    (limitCode) => {
      const value = completedJob();
      if (value.data.plan === null) throw new Error("fixture plan missing");
      value.data.plan.routes = [];
      value.data.plan.route_count = 0;
      value.data.plan.explanation_codes = [limitCode, "SEARCH_INCOMPLETE"];
      value.data.plan.diagnostics = { search_complete: false };

      render(<BreedingJobView initialResult={value} poll={false} />);

      expect(screen.getByText("搜索达到安全上限")).toBeTruthy();
      expect(screen.getByText(limitCode)).toBeTruthy();
      expect(screen.queryByText("当前没有合法路线")).toBeNull();
    },
  );

  it("does not label heuristic pruning as a hard safety limit", () => {
    const value = completedJob();
    if (value.data.plan === null) throw new Error("fixture plan missing");
    value.data.plan.routes = [];
    value.data.plan.route_count = 0;
    value.data.plan.explanation_codes = ["SEARCH_PRUNED", "SEARCH_INCOMPLETE"];
    value.data.plan.diagnostics = {
      search_complete: true,
      hit_limits: [],
      pruned_assignment_states: 128,
    };

    render(<BreedingJobView initialResult={value} poll={false} />);

    expect(screen.getByText("启发式搜索未找到候选")).toBeTruthy();
    expect(screen.queryByText("搜索达到安全上限")).toBeNull();
  });

  it("does not interrupt valid route comparison with heuristic pruning diagnostics", () => {
    const value = completedJob();
    if (value.data.plan === null) throw new Error("fixture plan missing");
    value.data.plan.explanation_codes = ["SEARCH_PRUNED"];
    value.data.plan.diagnostics = {
      search_complete: true,
      hit_limits: [],
      pruned_assignment_states: 128,
    };

    render(<BreedingJobView initialResult={value} poll={false} />);

    expect(screen.queryByText("已返回确定性剪枝后的候选")).toBeNull();
    expect(screen.getByText("方案比较")).toBeTruthy();
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

  it("saves a completed route idempotently without creating execution progress", async () => {
    let captured: { input: RequestInfo | URL; init?: RequestInit } | undefined;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = { input, init };
        return new Response(
          JSON.stringify({
            route_id: "62000000-0000-4000-8000-000000000001",
            saved_at: "2026-07-27T01:00:00Z",
            reused: true,
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<BreedingJobView initialResult={completedJob()} poll={false} />);

    fireEvent.click(screen.getByRole("button", { name: "保存到我的计划" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(captured?.input).toBe("/api/plans");
    expect(JSON.parse(String(captured?.init?.body))).toMatchObject({
      route_id: "62000000-0000-4000-8000-000000000001",
    });
    expect(
      screen.getByRole("link", { name: "查看我的计划" }).getAttribute("href"),
    ).toBe("/plans/62000000-0000-4000-8000-000000000001");
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("links directly to My Plans when the route was already saved", () => {
    const value = completedJob();
    if (value.data.plan === null) throw new Error("fixture plan missing");
    const saved = value.data.plan.routes.at(0);
    if (saved === undefined) throw new Error("fixture route missing");
    saved.saved_plan_at = "2026-07-27T01:00:00Z";

    render(<BreedingJobView initialResult={value} poll={false} />);

    expect(
      screen.getByRole("link", { name: "查看我的计划" }).getAttribute("href"),
    ).toBe("/plans/62000000-0000-4000-8000-000000000001");
    expect(screen.queryByRole("button", { name: "保存到我的计划" })).toBeNull();
  });

  it("shows missing father and mother requirements while allowing route saving", () => {
    const value = completedJob();
    if (value.data.plan === null) throw new Error("fixture plan missing");
    const missing = route(1);
    missing.feasibility_status = "needs_inventory";
    missing.adoptable = false;
    missing.missing_pal_count = 1;
    missing.inventory_coverage = 0.5;
    missing.missing_requirements = [
      {
        pal_id: "test_parent_b",
        gender: "female",
        required_passive_ids: [],
        quantity: 1,
        step_indexes: [0],
      },
    ];
    missing.steps[0]!.parent_b = {
      source_type: "missing",
      pal_id: "test_parent_b",
      instance_uid: null,
      owner_display_name: "缺少：需补充库存",
      gender: "female",
      passive_skill_ids: [],
      required_passive_ids: [],
      borrowed: false,
      produced_by_step_index: null,
      location_type: null,
      location_name: null,
      location_slot_index: null,
    };
    value.data.plan.routes = [missing];
    value.data.plan.route_count = 1;

    render(<BreedingJobView initialResult={value} poll={false} />);

    expect(screen.getByText("仍需准备 1 只帕鲁")).toBeTruthy();
    expect(screen.getAllByText("捣蛋猫").length).toBeGreaterThan(0);
    expect(screen.getAllByText("雌性").length).toBeGreaterThan(0);
    expect(screen.getAllByText("被动无要求").length).toBeGreaterThan(0);
    expect(screen.getAllByText("父本").length).toBeGreaterThan(0);
    expect(screen.getAllByText("母本").length).toBeGreaterThan(0);
    expect(screen.getByText(/收藏不会推进配种进度/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "保存到我的计划" })).toBeTruthy();
  });
});
