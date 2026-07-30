import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { PublicContentPage } from "@/features/public-content/public-page";
import {
  publicPageProfiles,
  publicPageSlugs,
  type PublicPageSlug,
} from "@/features/public-content/page-config";
import { getCopy } from "@/i18n/client";
import type { AppLocale } from "@/i18n/routing";

const titles: Record<AppLocale, Record<PublicPageSlug, string>> = {
  zh: {
    "palworld-save-sync": "帕鲁服务器存档同步",
    "save-breeding-planner": "基于存档的配种规划",
    "passive-breeding-route": "帕鲁被动继承路线",
    "guild-pal-inventory": "公会帕鲁库存协作",
  },
  en: {
    "palworld-save-sync": "Palworld Server Save Sync",
    "save-breeding-planner": "Save-Based Breeding Planner",
    "passive-breeding-route": "Passive Breeding Routes",
    "guild-pal-inventory": "Guild Pal Inventory",
  },
};

function copy(locale: AppLocale, namespace: "Landing" | "PublicContent") {
  return getCopy(locale, namespace) as unknown as (key: string) => string;
}

describe("localized public search-intent pages", () => {
  it.each(
    (["zh", "en"] as const).flatMap((locale) =>
      publicPageSlugs.map((slug) => [locale, slug] as const),
    ),
  )(
    "renders one complete %s page for %s in server HTML",
    async (locale, slug) => {
      const { container } = render(
        await PublicContentPage({
          locale,
          slug,
          translate: copy(locale, "PublicContent"),
          landingTranslate: copy(locale, "Landing"),
        }),
      );
      const main = within(container.querySelector("main")!);

      expect(main.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(main.getByRole("heading", { level: 1 }).textContent).toBe(
        titles[locale][slug],
      );
      expect(
        main.getAllByRole("heading", { level: 2 }).length,
      ).toBeGreaterThanOrEqual(7);
      expect(
        within(
          container.querySelector(
            `nav[aria-label="${locale === "zh" ? "面包屑导航" : "Breadcrumb"}"]`,
          )!,
        ).getByRole("link", {
          name: locale === "zh" ? "首页" : "Home",
        }),
      ).toBeTruthy();
      expect(
        container.querySelector(
          `a[href="${publicPageProfiles[slug].ctaHref}"]`,
        ),
      ).not.toBeNull();
      for (const publicSlug of publicPageSlugs) {
        expect(
          container.querySelector(`footer a[href$="/${publicSlug}"]`),
        ).not.toBeNull();
      }
      expect(container.textContent).toContain(
        locale === "zh"
          ? "PalBeacon 是独立开发的玩家工具，与 Pocketpair 无隶属关系。"
          : "PalBeacon is an independent community tool and is not affiliated with Pocketpair.",
      );
      expect(container.textContent).not.toContain("palbeacon-sync");
      expect(container.textContent).not.toContain(
        locale === "zh" ? "Palworld Server Save Sync" : "公会帕鲁库存协作",
      );

      const jsonLd = [
        ...container.querySelectorAll('script[type="application/ld+json"]'),
      ].map(
        (script) =>
          JSON.parse(script.textContent ?? "null") as Record<string, unknown>,
      );
      expect(jsonLd.map((value) => value["@type"])).toEqual([
        "WebPage",
        "BreadcrumbList",
        "FAQPage",
      ]);
      expect(jsonLd[0]).toMatchObject({
        url: `https://www.palbeacon.app/${locale}/${slug}`,
        inLanguage: locale === "zh" ? "zh-CN" : "en-US",
      });
      const faq = jsonLd[2]?.mainEntity as Array<{
        name: string;
        acceptedAnswer: { text: string };
      }>;
      for (const item of faq) {
        expect(container.textContent).toContain(item.name);
        expect(container.textContent).toContain(item.acceptedAnswer.text);
      }
    },
  );

  it("documents the real current CLI commands, platforms, timing and safety boundary", async () => {
    const { container } = render(
      await PublicContentPage({
        locale: "en",
        slug: "palworld-save-sync",
        translate: copy("en", "PublicContent"),
        landingTranslate: copy("en", "Landing"),
      }),
    );

    for (const command of [
      "npm install -g palbeacon-cli",
      "palbeacon init",
      "palbeacon run",
    ]) {
      expect(container.textContent).toContain(command);
    }
    expect(container.textContent).toContain("Linux x64");
    expect(container.textContent).toContain("Windows x64");
    expect(container.textContent).toContain("Node.js 22");
    expect(container.textContent).toContain("300 seconds");
    expect(container.textContent).toContain("never modifies the real save");
    expect(container.textContent).toContain("complete save is never uploaded");
  });

  it("states planning and guild limitations without fabricated rates or workflows", async () => {
    const planner = render(
      await PublicContentPage({
        locale: "en",
        slug: "save-breeding-planner",
        translate: copy("en", "PublicContent"),
        landingTranslate: copy("en", "Landing"),
      }),
    );
    expect(planner.container.textContent).not.toMatch(/\b\d{1,3}(?:\.\d+)?%/);
    expect(planner.container.textContent).toContain(
      "does not automatically detect or confirm new offspring",
    );
    planner.unmount();

    const guild = render(
      await PublicContentPage({
        locale: "en",
        slug: "guild-pal-inventory",
        translate: copy("en", "PublicContent"),
        landingTranslate: copy("en", "Landing"),
      }),
    );
    expect(guild.container.textContent).toContain(
      "no chat, approval, or automatic borrowing workflow",
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Guild Pal Inventory",
    );
  });
});
