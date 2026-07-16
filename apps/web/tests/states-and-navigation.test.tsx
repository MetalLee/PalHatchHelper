import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppNavigation } from "../components/app-navigation";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import {
  dataStatusPresentation,
  gameDataStatusPresentation,
} from "../features/data-status/presentation";

describe("Phase 5 states and navigation", () => {
  it("renders loading, empty, unbound, forbidden, stale and parse error states", () => {
    const { rerender } = render(<LoadingState label="正在加载库存" />);
    expect(screen.getByRole("status").textContent).toContain("正在加载库存");

    rerender(
      <EmptyState title="暂无帕鲁" description="调整筛选条件后重试。" />,
    );
    expect(screen.getByRole("heading", { name: "暂无帕鲁" })).toBeTruthy();

    rerender(<ErrorState code="PLAYER_BINDING_REQUIRED" />);
    expect(screen.getByText(/尚未绑定游戏角色/)).toBeTruthy();

    rerender(<ErrorState code="FORBIDDEN" />);
    expect(screen.getByText(/没有权限/)).toBeTruthy();

    expect(dataStatusPresentation("stale").title).toMatch(/过期/);
    expect(dataStatusPresentation("parse_error").title).toMatch(/解析异常/);
    expect(gameDataStatusPresentation("review_pending").title).toMatch(
      /待审核/,
    );
    expect(gameDataStatusPresentation("blocked").title).toMatch(/受阻/);
  });

  it("adds the Phase 6 breeder without exposing Phase 7 plans", () => {
    render(<AppNavigation activePath="/pals" displayName="Fixture Player A" />);

    expect(
      screen.getAllByRole("link", { name: "概览" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "帕鲁" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "数据状态" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /账号/ })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "配种器" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "计划" })).toBeNull();
  });
});
