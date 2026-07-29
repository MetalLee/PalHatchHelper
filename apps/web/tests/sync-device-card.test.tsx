import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppLocaleProvider } from "@/i18n/client";
import { SyncDeviceCard } from "@/features/sync/sync-device-card";

const pairing = {
  code: "ABCD-EFGH",
  expires_at: "2026-07-29T12:00:00.000Z",
};

describe("SyncDeviceCard installation guidance", () => {
  const copy = vi.fn(async () => undefined);

  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: copy },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    copy.mockClear();
  });

  it("shows install, pair and run as the default three-step flow", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ devices: [] }))
      .mockResolvedValueOnce(response(pairing));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AppLocaleProvider locale="zh">
        <SyncDeviceCard hasBinding />
      </AppLocaleProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "1. 安装同步工具" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "2. 完成设备配对" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "3. 启动同步" })).toBeTruthy();
    expect(screen.getByText("npm install -g palbeacon-sync")).toBeTruthy();
    expect(screen.getByText("palbeacon-sync init")).toBeTruthy();
    expect(screen.getByText("palbeacon-sync run")).toBeTruthy();
    expect(
      screen.getByText("程序会立即同步一次，之后每 5 分钟自动检查存档变化。"),
    ).toBeTruthy();
    expect(screen.getByText("保持命令运行即可持续同步。")).toBeTruthy();
    expect(
      screen.queryByText(/--url|--sync-now|npx palbeacon-sync/),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "添加同步设备" }));
    expect(await screen.findByText(pairing.code)).toBeTruthy();
    const copyButton = screen.getByRole("button", { name: "复制配对码" });
    fireEvent.click(copyButton);
    expect(copy).toHaveBeenCalledWith(pairing.code);

    const advanced = screen.getByRole("button", { name: "高级用法" });
    expect(advanced.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/--save-dir \/path\/to\/world/)).toBeNull();
    fireEvent.click(advanced);
    expect(advanced.getAttribute("aria-expanded")).toBe("true");
    expect(
      await screen.findByText(
        /--code ABCD-EFGH[\s\S]*--save-dir \/path\/to\/world/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/--url|--sync-now/)).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("renders the same three-step guidance in English", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response({ devices: [] })),
    );

    render(
      <AppLocaleProvider locale="en">
        <SyncDeviceCard hasBinding />
      </AppLocaleProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "1. Install the sync tool" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "2. Pair the device" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "3. Start syncing" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "The tool syncs immediately, then checks for save changes every 5 minutes.",
      ),
    ).toBeTruthy();
  });
});

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
