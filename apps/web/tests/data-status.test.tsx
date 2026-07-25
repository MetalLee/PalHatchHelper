import type { InventoryDataStatus } from "@palhatch/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataStatusDashboard } from "../features/data-status/data-status-dashboard";

const baseStatus: InventoryDataStatus = {
  state: "healthy",
  snapshot_id: "10000000-0000-4000-8000-000000000001",
  captured_at: "2026-07-25T01:08:00Z",
  source_modified_at: "2026-07-25T01:07:30Z",
  parser_name: "palworld-save-tools",
  parser_version: "2.4.1",
  last_attempt_at: "2026-07-25T01:08:10Z",
  error_code: null,
  using_previous_snapshot: false,
  game_data_state: "published",
  game_data_version_id: "20000000-0000-4000-8000-000000000002",
  game_build_id: "24181105",
  game_version: "v0.6.4",
  algorithm_version: "deterministic-v3",
};

describe("data status dashboard", () => {
  it("shows stale, Parser failure and previous snapshot states without hiding stable facts", () => {
    render(
      <DataStatusDashboard
        data={{
          ...baseStatus,
          state: "parse_error",
          error_code: "PARSER_INVALID_JSON",
          using_previous_snapshot: true,
        }}
      />,
    );

    expect(screen.getAllByText("存档解析异常").length).toBeGreaterThan(0);
    expect(screen.getByText("PARSER_INVALID_JSON")).toBeTruthy();
    expect(screen.getByText(/上一份有效快照/)).toBeTruthy();
    expect(screen.getByText("deterministic-v3")).toBeTruthy();
  });

  it("shows stale inventory and every game catalog state honestly", () => {
    const { rerender } = render(
      <DataStatusDashboard
        data={{
          ...baseStatus,
          state: "stale",
          game_data_state: "not_configured",
          game_data_version_id: null,
        }}
      />,
    );

    expect(screen.getAllByText("数据已过期").length).toBeGreaterThan(0);
    expect(screen.getAllByText("游戏数据未配置").length).toBeGreaterThan(0);

    rerender(
      <DataStatusDashboard
        data={{ ...baseStatus, game_data_state: "review_pending" }}
      />,
    );
    expect(screen.getAllByText("游戏数据待审核").length).toBeGreaterThan(0);

    rerender(
      <DataStatusDashboard
        data={{ ...baseStatus, game_data_state: "blocked" }}
      />,
    );
    expect(screen.getAllByText("游戏数据受阻").length).toBeGreaterThan(0);
  });

  it("renders only the safe projection and never leaks raw or server-only fields", () => {
    const unsafeFixture = {
      ...baseStatus,
      source_save_hash: "never-render-source-hash",
      server_path: "/opt/palworld/Pal/Saved/SaveGames",
      raw_save: "raw-save-payload",
      service_role: "service-role-secret",
      parser_stack: "Traceback: internal parser path",
      other_player_email: "other-player@example.invalid",
    } as InventoryDataStatus;

    const { container } = render(<DataStatusDashboard data={unsafeFixture} />);
    expect(container.textContent).toContain("palworld-save-tools");
    expect(container.textContent).toContain("24181105");
    expect(container.textContent).not.toContain("/opt/palworld");
    expect(container.textContent).not.toContain("never-render-source-hash");
    expect(container.textContent).not.toContain("raw-save-payload");
    expect(container.textContent).not.toContain("service-role-secret");
    expect(container.textContent).not.toContain("Traceback");
    expect(container.textContent).not.toContain("other-player@example.invalid");
  });

  it("uses four real status cards and no invented chart surfaces", () => {
    render(<DataStatusDashboard data={baseStatus} />);
    expect(screen.getAllByTestId("data-status-card")).toHaveLength(4);
    expect(screen.queryByText(/属性分布|库存趋势|计划趋势|热度图/)).toBeNull();
  });
});
