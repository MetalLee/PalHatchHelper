import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AdminError from "../app/admin/error";
import AdminLoading from "../app/admin/loading";
import { AdminAccessDenied, hasAdminRole } from "../features/admin/access";
import { AdminNavigation } from "../features/admin/admin-navigation";
import { AdminEmpty } from "../features/admin/presentation";

describe("Phase 8 admin access", () => {
  it("rejects an authenticated player with a stable server-side role decision", () => {
    expect(hasAdminRole({ role: "player" })).toBe(false);
    render(<AdminAccessDenied />);
    expect(screen.getByRole("alert").textContent).toContain(
      "ADMIN_ACCESS_DENIED",
    );
  });

  it("exposes every required admin route without hover-only controls", () => {
    render(<AdminNavigation activePath="/admin" />);
    for (const label of [
      "管理员概览",
      "玩家绑定",
      "存档与 Parser",
      "配种数据",
      "任务与 AI",
      "系统设置",
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }
  });

  it("renders stable loading, empty and error states with a retry action", () => {
    const reset = vi.fn();
    const { rerender } = render(<AdminLoading />);
    expect(screen.getByText("正在读取管理员安全摘要")).toBeTruthy();
    rerender(<AdminEmpty>暂无管理员记录。</AdminEmpty>);
    expect(screen.getByText("暂无管理员记录。")).toBeTruthy();
    rerender(<AdminError reset={reset} />);
    expect(screen.getByRole("alert").textContent).toContain(
      "ADMIN_DATA_UNAVAILABLE",
    );
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("keeps admin data private and iPhone layouts scroll inside their table container", () => {
    const actions = readFileSync(
      resolve(process.cwd(), "app/api/admin/actions/route.ts"),
      "utf8",
    );
    const styles = readFileSync(
      resolve(process.cwd(), "app/globals.css"),
      "utf8",
    );
    expect(actions).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
    expect(actions).not.toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(actions).toContain(
      '"Cache-Control": "private, no-store, max-age=0"',
    );
    expect(styles).toContain(".admin-table-wrap");
    expect(styles).toMatch(/\.admin-table-wrap\s*\{[^}]*overflow-x:\s*auto/s);
    expect(styles).not.toMatch(/\.admin-nav-link:hover/);
  });
});
