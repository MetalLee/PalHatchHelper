import type {
  InventoryDataStatus,
  OverviewSummary,
  PlanSummary,
} from "@palhatch/contracts";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  OverviewDashboard,
  type OverviewPlanFeed,
} from "../features/overview/overview-dashboard";

const dataStatus: InventoryDataStatus = {
  state: "healthy",
  snapshot_id: "11111111-1111-4111-8111-111111111111",
  captured_at: "2026-07-24T08:30:00.000Z",
  source_modified_at: "2026-07-24T08:29:00.000Z",
  parser_name: "fixture-parser",
  parser_version: "1.0.0",
  last_attempt_at: "2026-07-24T08:30:00.000Z",
  error_code: null,
  using_previous_snapshot: false,
  game_data_state: "published",
  game_data_version_id: "22222222-2222-4222-8222-222222222222",
  game_build_id: "fixture-build",
  game_version: "fixture-game",
  algorithm_version: "fixture-algorithm",
};

const summary: OverviewSummary = {
  all_count: 7,
  owned_count: 3,
  shared_count: 4,
  data_status: dataStatus,
};

function plan(
  status: PlanSummary["status"],
  overrides: Partial<PlanSummary> = {},
): PlanSummary {
  return {
    plan_id: "33333333-3333-4333-8333-333333333333",
    target_pal_id: "test_target",
    target_pal_display_name: "测试目标帕鲁",
    desired_passive_ids: ["swift"],
    desired_passive_display_names: ["神速"],
    status,
    current_step_index: 0,
    completed_step_count: 0,
    total_step_count: 2,
    pending_candidate_count: 0,
    version_pin: {
      inventory_snapshot_id: dataStatus.snapshot_id!,
      game_data_version_id: dataStatus.game_data_version_id!,
      content_hash: "fixture-content-hash",
      algorithm_version: "fixture-algorithm",
      scoring_profile_version: "fixture-scoring",
    },
    concurrency_version: 1,
    created_at: "2026-07-24T07:00:00.000Z",
    updated_at: "2026-07-24T08:00:00.000Z",
    ...overrides,
  };
}

const planFeed: OverviewPlanFeed = {
  active: [plan("active")],
  awaitingConfirmation: [
    plan("awaiting_confirmation", {
      plan_id: "44444444-4444-4444-8444-444444444444",
      target_pal_display_name: "待确认帕鲁",
      pending_candidate_count: 2,
    }),
  ],
  completed: [
    plan("completed", {
      plan_id: "55555555-5555-4555-8555-555555555555",
      target_pal_display_name: "已完成帕鲁",
      completed_step_count: 2,
    }),
  ],
  unavailable: false,
};

function renderOverview(feed: OverviewPlanFeed = planFeed) {
  return render(
    <OverviewDashboard
      playerNickname="Fixture Player"
      worldName="Fixture World"
      guildName="Fixture Guild"
      summary={summary}
      planFeed={feed}
    />,
  );
}

describe("overview dashboard", () => {
  it("renders only real summary values and primary workspace entrances", () => {
    renderOverview();

    const metrics = screen.getByRole("region", { name: "库存概览" });
    expect(within(metrics).getByText("7")).toBeTruthy();
    expect(within(metrics).getByText("3")).toBeTruthy();
    expect(within(metrics).getByText("4")).toBeTruthy();
    expect(screen.queryByText("1,248")).toBeNull();
    expect(screen.queryByText("+28")).toBeNull();

    expect(
      screen.getByRole("link", { name: "开始配种" }).getAttribute("href"),
    ).toBe("/breeder");
    expect(
      screen.getByRole("link", { name: "查看库存" }).getAttribute("href"),
    ).toBe("/pals");
  });

  it("uses CSS-only scenery and keeps the mobile dashboard width constrained", () => {
    renderOverview();

    const dashboard = screen.getByTestId("overview-dashboard");
    expect(dashboard.className).toContain("min-w-0");
    expect(dashboard.className).toContain("overflow-x-clip");
    expect(
      screen
        .getByTestId("overview-scenery")
        .getAttribute("data-visual-source"),
    ).toBe("css");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows real plan states and a stable partial-data error", () => {
    const { rerender } = renderOverview();

    expect(screen.getByText("待确认帕鲁")).toBeTruthy();
    expect(screen.getByText(/2 个候选子代/)).toBeTruthy();
    expect(screen.getByText("已完成帕鲁")).toBeTruthy();

    rerender(
      <OverviewDashboard
        playerNickname="Fixture Player"
        worldName="Fixture World"
        guildName="Fixture Guild"
        summary={summary}
        planFeed={{ ...planFeed, unavailable: true }}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("DATA_UNAVAILABLE");
    expect(screen.getByRole("alert").textContent).toContain(
      "部分计划数据暂不可用",
    );
    expect(screen.queryByText("暂无进行中的计划")).toBeNull();
  });
});
