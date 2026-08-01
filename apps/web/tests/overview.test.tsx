import type { InventoryDataStatus, PlanSummary } from "@palhatch/contracts";
import { render, screen } from "@testing-library/react";
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
  last_heartbeat_at: "2026-07-24T08:35:00.000Z",
  last_attempt_at: "2026-07-24T08:30:00.000Z",
  error_code: null,
  using_previous_snapshot: false,
  game_data_state: "published",
  game_data_version_id: "22222222-2222-4222-8222-222222222222",
  game_build_id: "fixture-build",
  game_version: "fixture-game",
  algorithm_version: "fixture-algorithm",
};
const savedPlan: PlanSummary = {
  route_id: "33333333-3333-4333-8333-333333333333",
  source_job_id: "44444444-4444-4444-8444-444444444444",
  target_pal_id: "test_target",
  target_pal_display_name: "测试目标帕鲁",
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
  generation_count: 2,
  step_count: 2,
  borrowed_pal_count: 0,
  missing_pal_count: 0,
  estimated_attempts_min: 2,
  estimated_attempts_max: 6,
  difficulty: "medium",
  total_score: 88,
  saved_at: "2026-07-24T08:00:00.000Z",
};
const feed: OverviewPlanFeed = { items: [savedPlan], unavailable: false };

function renderOverview(planFeed: OverviewPlanFeed = feed) {
  return render(
    <OverviewDashboard
      playerNickname="Fixture Player"
      worldName="Fixture World"
      guildName="Fixture Guild"
      dataStatus={dataStatus}
      planFeed={planFeed}
    />,
  );
}

describe("overview dashboard", () => {
  it("renders the focused overview and saved routes", () => {
    renderOverview();
    expect(screen.getByText("帕鲁服务器工作台")).toBeTruthy();
    expect(screen.getByText(/Fixture World · Fixture Guild/)).toBeTruthy();
    expect(screen.queryByText(/整个帕鲁世界保持清晰可见/)).toBeNull();
    expect(screen.getByRole("link", { name: "查看帕鲁" })).toBeTruthy();
    expect(screen.getByText("测试目标帕鲁")).toBeTruthy();
    expect(screen.getByRole("img", { name: "测试目标帕鲁头像" })).toBeTruthy();
    expect(screen.getByText("2 代 · 2 步", { exact: false })).toBeTruthy();
    expect(screen.queryByText(/候选子代|当前步骤/)).toBeNull();
  });

  it("keeps stale details out of the overview", () => {
    render(
      <OverviewDashboard
        playerNickname="Fixture Player"
        worldName="Fixture World"
        guildName="Fixture Guild"
        dataStatus={{ ...dataStatus, state: "stale" }}
        planFeed={feed}
      />,
    );

    expect(screen.queryByText("数据已过期")).toBeNull();
    expect(screen.getByRole("heading", { name: "当前数据基线" })).toBeTruthy();
  });

  it("uses CSS-only scenery and constrains mobile width", () => {
    renderOverview();
    expect(screen.getByTestId("overview-dashboard").className).toContain(
      "overflow-x-clip",
    );
    expect(
      screen.getByTestId("overview-scenery").getAttribute("data-visual-source"),
    ).toBe("css");
    expect(
      screen.getByTestId("overview-scenery").querySelector("img"),
    ).toBeNull();
  });

  it("shows a stable partial-data error", () => {
    renderOverview({ items: [], unavailable: true });
    expect(screen.getByRole("alert").textContent).toContain("DATA_UNAVAILABLE");
    expect(screen.getByRole("alert").textContent).toContain("计划数据暂不可用");
    expect(screen.queryByText("暂无收藏计划")).toBeNull();
  });
});
