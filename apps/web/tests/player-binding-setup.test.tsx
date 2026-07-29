import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlayerBindingSetup } from "@/features/sync/player-binding-setup";
import { AppLocaleProvider } from "@/i18n/client";

const webRoot = resolve(import.meta.dirname, "..");

describe("unbound player setup", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("places a save-sync FAQ directly after the synchronization card", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ devices: [], players: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const { container } = render(
      <AppLocaleProvider locale="zh">
        <PlayerBindingSetup />
      </AppLocaleProvider>,
    );

    expect(screen.getByRole("heading", { name: "存档同步" })).toBeTruthy();
    const faq = screen.getByRole("heading", { name: "常见问题" });
    expect(screen.getByText("角色匹配是怎么完成的？")).toBeTruthy();
    expect(screen.getByText("Palworld 存档目录怎么选？")).toBeTruthy();
    expect(screen.getByText("存档数据安全吗？")).toBeTruthy();
    const cards = container.querySelectorAll('[data-slot="card"]');
    expect(cards).toHaveLength(2);
    expect(cards[1]?.contains(faq)).toBe(true);
  });

  it("replaces every unbound workspace error with the shared setup", () => {
    const pages = [
      "app/[locale]/(workspace)/overview/page.tsx",
      "app/[locale]/(workspace)/pals/page.tsx",
      "app/[locale]/(workspace)/breeder/page.tsx",
      "app/[locale]/(workspace)/breeder/jobs/[jobId]/page.tsx",
      "app/[locale]/(workspace)/plans/page.tsx",
      "app/[locale]/(workspace)/plans/[planId]/page.tsx",
      "app/[locale]/(workspace)/data-status/page.tsx",
    ];

    for (const page of pages) {
      const source = readFileSync(resolve(webRoot, page), "utf8");
      expect(source, page).toContain("<PlayerBindingSetup");
      expect(source, page).not.toContain('code="PLAYER_BINDING_REQUIRED"');
    }
  });
});
