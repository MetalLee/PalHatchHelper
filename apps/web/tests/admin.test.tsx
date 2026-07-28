import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AdminError from "../app/[locale]/admin/error";
import AdminLoading from "../app/[locale]/admin/loading";
import { AdminAccessDenied, hasAdminRole } from "../features/admin/access";
import { AdminActionButton } from "../features/admin/admin-actions";
import { AdminNavigation } from "../features/admin/admin-navigation";
import {
  AdminEmpty,
  adminTableFrameClasses,
} from "../features/admin/presentation";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: "a",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) =>
    key === "adminLoading" ? "正在读取管理员安全摘要" : key,
}));

describe("Phase 8 admin access", () => {
  it("rejects an authenticated player with a stable server-side role decision", () => {
    const layout = readFileSync(
      resolve(process.cwd(), "app/[locale]/admin/layout.tsx"),
      "utf8",
    );
    expect(hasAdminRole({ role: "player" })).toBe(false);
    expect(hasAdminRole({ role: "admin" })).toBe(true);
    expect(layout).toContain("requireAdminPageAccess");
    render(<AdminAccessDenied />);
    expect(screen.getByRole("alert").textContent).toContain(
      "ADMIN_ACCESS_DENIED",
    );
  });

  it("exposes every required admin route without hover-only controls", () => {
    render(<AdminNavigation activePath="/admin" />);
    expect(screen.getByRole("navigation", { name: "管理员导航" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "选择管理页面" })).toBeTruthy();
    for (const label of [
      "管理员概览",
      "玩家绑定",
      "存档与 Parser",
      "配种数据",
      "任务与 AI",
      "系统设置",
    ]) {
      expect(screen.getByRole("tab", { name: label })).toBeTruthy();
    }
    expect(
      screen
        .getByRole("tab", { name: "管理员概览" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("keeps existing writes connected to the audited action route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { queued: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(
      <AdminActionButton action="sync_save_once">
        请求安全同步
      </AdminActionButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "请求安全同步" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/admin/actions");
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain(
      '"action":"sync_save_once"',
    );
    fetchMock.mockRestore();
  });

  it("requires typed confirmation before a dangerous write", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(
      <AdminActionButton
        action="cleanup_expired_agent_snapshots"
        confirmText="清理 Agent 旧快照"
      >
        清理超过保留期快照
      </AdminActionButton>,
    );

    fireEvent.click(screen.getByRole("button", { name: "清理超过保留期快照" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    const confirm = screen.getByRole("button", {
      name: "确认执行",
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("确认文字"), {
      target: { value: "清理 Agent 旧快照" },
    });
    expect(confirm.disabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("renders stable loading, empty and error states with a retry action", async () => {
    const reset = vi.fn();
    const { rerender } = render(await AdminLoading());
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
    const appShell = readFileSync(
      resolve(process.cwd(), "components/app-shell.tsx"),
      "utf8",
    );
    expect(actions).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
    expect(actions).not.toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(actions).toContain(
      '"Cache-Control": "private, no-store, max-age=0"',
    );
    expect(adminTableFrameClasses).toContain("overflow-x-auto");
    expect(appShell).toContain("overflow-x-clip");
    expect(styles).not.toContain(".admin-table-wrap");
    expect(styles).not.toContain(".app-frame");
    expect(styles).not.toMatch(/\.admin-nav-link:hover/);
  });
});
