import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppNavigation } from "../components/app-navigation";
import { EmptyState, ErrorState, LoadingState } from "../components/page-state";
import {
  dataStatusPresentation,
  gameDataStatusPresentation,
} from "../features/data-status/presentation";
import { getCopy } from "../i18n/client";

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

    const t = getCopy("zh", "DataStatus");
    expect(dataStatusPresentation("stale", t).title).toMatch(/过期/);
    expect(dataStatusPresentation("parse_error", t).title).toMatch(/解析异常/);
    expect(gameDataStatusPresentation("review_pending", t).title).toMatch(
      /待审核/,
    );
    expect(gameDataStatusPresentation("blocked", t).title).toMatch(/受阻/);
  });

  it("exposes every workspace destination in top navigation", () => {
    render(<AppNavigation activePath="/pals" />);

    expect(
      screen.getAllByRole("link", { name: "首页" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "帕鲁库存" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "配种工作台" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "我的计划" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "数据状态" }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("navigation", { name: "底部导航" })).toBeNull();
  });
});
