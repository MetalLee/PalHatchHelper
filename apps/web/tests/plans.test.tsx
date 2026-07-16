import type { PlanDetail, PlanListPage } from "@palhatch/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlanDetail as PlanDetailView } from "../features/plans/plan-detail";
import { PlanError } from "../features/plans/plan-error";
import { PlanList } from "../features/plans/plan-list";

const routerPush = vi.fn();
const routerRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

const planId = "71000000-0000-4000-8000-000000000001";
const stepId = "72000000-0000-4000-8000-000000000001";

function summary(
  status: PlanDetail["summary"]["status"] = "awaiting_confirmation",
) {
  return {
    plan_id: planId,
    target_pal_id: "test_child_pal",
    target_pal_display_name: "幻色幼崽",
    desired_passive_ids: ["test_passive_a", "test_passive_b"],
    desired_passive_display_names: ["稀有", "工匠精神"],
    status,
    current_step_index: 0,
    completed_step_count: 0,
    total_step_count: 2,
    pending_candidate_count: 1,
    version_pin: {
      inventory_snapshot_id: "40000000-0000-4000-8000-000000000002",
      game_data_version_id: "51000000-0000-4000-8000-000000000001",
      content_hash: "c".repeat(64),
      algorithm_version: "phase4b-deterministic-v1",
      scoring_profile_version: "balanced-v2",
    },
    concurrency_version: 5,
    created_at: "2026-07-16T04:00:00Z",
    updated_at: "2026-07-16T04:10:00Z",
  } satisfies PlanDetail["summary"];
}

function detail(
  status: PlanDetail["summary"]["status"] = "awaiting_confirmation",
): PlanDetail {
  return {
    summary: summary(status),
    adopted_route_id: "62000000-0000-4000-8000-000000000001",
    invalidation_reasons:
      status === "invalidated"
        ? [
            {
              code: "DEPENDENCY_DISAPPEARED",
              step_index: 1,
              instance_uid: "fixture-parent-a",
              details: { snapshot_id: "fixture-next" },
            },
          ]
        : [],
    steps: [
      {
        step_id: stepId,
        step_index: 0,
        parent_a_source_kind: "inventory",
        parent_a_instance_uid: "fixture-parent-a",
        parent_a_step_index: null,
        parent_b_source_kind: "inventory",
        parent_b_instance_uid: "fixture-parent-b",
        parent_b_step_index: null,
        expected_child_pal_id: "test_child_pal",
        required_passive_ids: ["test_passive_a", "test_passive_b"],
        preferred_gender: "female",
        selected_child_instance_uid: null,
        baseline_snapshot_id: "40000000-0000-4000-8000-000000000002",
        candidate_detection_started_at: "2026-07-16T04:01:00Z",
        attempt_number: 1,
        status: "candidate_detected",
        concurrency_version: 3,
        skip_reason: null,
        invalidation_reasons: [],
        completed_at: null,
      },
      {
        step_id: "72000000-0000-4000-8000-000000000002",
        step_index: 1,
        parent_a_source_kind: "prior_step",
        parent_a_instance_uid: null,
        parent_a_step_index: 0,
        parent_b_source_kind: "inventory",
        parent_b_instance_uid: "fixture-parent-c",
        parent_b_step_index: null,
        expected_child_pal_id: "test_child_pal",
        required_passive_ids: ["test_passive_a"],
        preferred_gender: null,
        selected_child_instance_uid: null,
        baseline_snapshot_id: null,
        candidate_detection_started_at: null,
        attempt_number: 0,
        status: status === "invalidated" ? "invalidated" : "not_started",
        concurrency_version: 1,
        skip_reason: null,
        invalidation_reasons: [],
        completed_at: null,
      },
    ],
    candidates: [
      {
        candidate_key: "d".repeat(64),
        step_id: stepId,
        pal_instance_uid: "phase7-child-best",
        detected_snapshot_id: "40000000-0000-4000-8000-000000000003",
        pal_id: "test_child_pal",
        pal_display_name: "幻色幼崽",
        species_match: true,
        matched_passive_ids: ["test_passive_a", "test_passive_b"],
        required_passive_count: 2,
        gender: "female",
        level: 1,
        owner_display_name: "Fixture Player A",
        location_type: "base",
        location_name: "Fixture Breeding Base",
        accessible: true,
        match_score: 1,
        match_breakdown: {
          species: 1,
          passive_overlap: 1,
          gender: 1,
          accessibility: 1,
          first_appearance: 1,
        },
        first_detected_at: "2026-07-16T04:05:00Z",
        confirmed: false,
        rejected_at: null,
        rejection_reason: null,
      },
    ],
    events: [
      {
        event_id: "73000000-0000-4000-8000-000000000001",
        step_id: stepId,
        event_type: "OFFSPRING_CANDIDATES_DETECTED",
        actor_kind: "agent",
        actor_display_name: "Agent",
        from_status: "breeding",
        to_status: "candidate_detected",
        safe_metadata: { candidate_count: 1 },
        created_at: "2026-07-16T04:05:00Z",
      },
    ],
  };
}

beforeEach(() => {
  routerPush.mockReset();
  routerRefresh.mockReset();
  vi.unstubAllGlobals();
});

describe("Phase 7 plan list", () => {
  it("renders status filters, pinned versions, progress and candidate count", () => {
    const page: PlanListPage = {
      items: [summary()],
      next_cursor: "fixture-cursor",
      query_boundary: "2026-07-16T04:10:00Z",
    };
    render(<PlanList page={page} status="awaiting_confirmation" />);

    expect(
      screen.getByRole("navigation", { name: "计划状态筛选" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "待确认" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByText("幻色幼崽")).toBeTruthy();
    expect(screen.getByText("1 个候选")).toBeTruthy();
    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(screen.getByRole("link", { name: "下一页" })).toBeTruthy();
  });

  it("has an actionable empty state", () => {
    render(
      <PlanList
        page={{
          items: [],
          next_cursor: null,
          query_boundary: "2026-07-16T04:10:00Z",
        }}
        status="all"
      />,
    );
    expect(screen.getByRole("heading", { name: "暂无执行计划" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "打开配种器" })).toBeTruthy();
  });
});

describe("Phase 7 plan detail", () => {
  it("prioritizes the current step, candidate facts, manual warning and audit history", () => {
    render(<PlanDetailView detail={detail()} />);

    expect(screen.getByText(/系统只检测候选，必须由玩家确认/)).toBeTruthy();
    expect(screen.getByTestId("offspring-candidate")).toBeTruthy();
    expect(screen.getByText(/所有者：Fixture Player A/)).toBeTruthy();
    expect(screen.getByText(/位置：Fixture Breeding Base/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "确认真实子代" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "继续尝试" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "选择已有 Pal" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "跳过步骤" })).toBeTruthy();
    expect(screen.getByText("OFFSPRING_CANDIDATES_DETECTED")).toBeTruthy();
  });

  it("confirms only through the action endpoint with the displayed optimistic version", async () => {
    let captured: { input: RequestInfo | URL; init?: RequestInit } | undefined;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = { input, init };
        return new Response(
          JSON.stringify({
            plan_id: planId,
            status: "active",
            current_step_index: 1,
            concurrency_version: 6,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<PlanDetailView detail={detail()} />);

    fireEvent.click(screen.getByRole("button", { name: "确认真实子代" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(captured?.input).toBe(`/api/plans/${planId}/actions`);
    expect(JSON.parse(String(captured?.init?.body))).toMatchObject({
      action: "confirm",
      step_id: stepId,
      candidate_key: "d".repeat(64),
      expected_concurrency_version: 5,
    });
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows optimistic conflicts without changing the visible plan", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error_code: "PLAN_VERSION_CONFLICT" }),
            {
              status: 409,
              headers: { "content-type": "application/json" },
            },
          ),
      ),
    );
    render(<PlanDetailView detail={detail()} />);

    fireEvent.click(screen.getByRole("button", { name: "暂停计划" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "PLAN_VERSION_CONFLICT",
    );
    expect(screen.getByRole("button", { name: "暂停计划" })).toBeTruthy();
  });

  it("keeps structured invalidation history and offers recalculation", () => {
    render(<PlanDetailView detail={detail("invalidated")} />);
    expect(screen.getByText("DEPENDENCY_DISAPPEARED")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "基于最新库存重新计算" }),
    ).toBeTruthy();
  });

  it("renders stable permission and fixed-version failures", () => {
    const { rerender } = render(<PlanError code="PLAN_ACCESS_DENIED" />);
    expect(screen.getByText("权限不足")).toBeTruthy();
    rerender(<PlanError code="PLAN_FIXED_VERSION_UNAVAILABLE" />);
    expect(screen.getByText("固定版本不可用")).toBeTruthy();
  });
});
