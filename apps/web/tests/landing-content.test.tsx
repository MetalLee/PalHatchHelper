import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { LandingPage } from "@/features/landing/landing-page";
import { getCopy } from "@/i18n/client";
import type { AppLocale } from "@/i18n/routing";

function landingCopy(locale: AppLocale): (key: string) => string {
  return getCopy(locale, "Landing") as unknown as (key: string) => string;
}

describe("localized public landing content", () => {
  it("reveals a glass header on scroll and reuses icon-only shared controls", async () => {
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 0,
      writable: true,
    });
    const { container } = render(
      await LandingPage({ locale: "zh", translate: landingCopy("zh") }),
    );

    const header = container.querySelector<HTMLElement>(
      "[data-landing-header]",
    );
    expect(header).not.toBeNull();
    expect(header?.dataset.glass).toBe("false");
    expect(header?.style.backgroundColor).toBe("rgba(255, 255, 255, 0)");
    expect(header?.textContent).not.toContain("GitHub");
    expect(
      within(header!).getAllByRole("link", {
        name: "在 GitHub 上查看 PalHatchHelper",
      }),
    ).not.toHaveLength(0);

    const language = within(header!).getAllByRole("button", {
      name: "当前语言：中文",
    })[0];
    expect(language).toBeTruthy();
    fireEvent.keyDown(language!, { key: "Enter", code: "Enter" });
    expect(screen.getByRole("menuitemradio", { name: "English" })).toBeTruthy();

    window.scrollY = 48;
    fireEvent.scroll(window);
    await waitFor(() => expect(header?.dataset.glass).toBe("true"));
    await waitFor(() => expect(header?.dataset.scrollProgress).toBe("0.216"));
    expect(header?.style.backgroundColor).toBe("rgba(255, 255, 255, 0.186)");
    expect(header?.style.backdropFilter).toBe(
      "blur(4.752px) saturate(103.888%)",
    );

    window.scrollY = 96;
    fireEvent.scroll(window);
    await waitFor(() => expect(header?.dataset.scrollProgress).toBe("0.648"));
    expect(header?.style.backgroundColor).toBe("rgba(255, 255, 255, 0.557)");
    expect(header?.style.backdropFilter).toBe(
      "blur(14.256px) saturate(111.664%)",
    );

    window.scrollY = 160;
    fireEvent.scroll(window);
    await waitFor(() => expect(header?.dataset.scrollProgress).toBe("1.000"));
    expect(header?.style.backgroundColor).toBe("rgba(255, 255, 255, 0.86)");
    expect(header?.style.backdropFilter).toBe("blur(22px) saturate(118%)");
  });

  it("renders the complete Chinese product and sync story in initial HTML", async () => {
    const { container } = render(
      await LandingPage({ locale: "zh", translate: landingCopy("zh") }),
    );

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Keep your Palworld visible",
    );
    expect(container.textContent).toContain("服务器存档同步到清晰的控制台");
    const hero = container.querySelector("main section");
    expect(hero).not.toBeNull();
    expect(hero!.querySelector('a[href*="github.com"]')).toBeNull();
    expect(hero!.querySelectorAll("a")).toHaveLength(2);
    expect(container.querySelectorAll("[data-carousel-slide]")).toHaveLength(3);
    expect(container.textContent).toContain("公会库存");
    expect(container.textContent).toContain("配种路线树");
    expect(container.textContent).toContain("收藏计划");
    expect(container.textContent).toContain("npm install -g palbeacon-cli");
    expect(container.textContent).toContain("palbeacon init");
    expect(container.textContent).toContain("palbeacon run");
    expect(container.textContent).toContain("只读检查源存档");
    expect(container.textContent).toContain("本地创建安全副本");
    expect(container.textContent).toContain("脱敏数据");
    expect(container.textContent).toContain("不会上传完整存档");
    expect(container.textContent).toContain("规划多代路线");
    expect(container.textContent).toContain("收藏常用方案");
    expect(container.querySelector("[data-system-flow]")).not.toBeNull();
    expect(container.querySelectorAll("[data-system-node]")).toHaveLength(4);
    expect(container.textContent).toContain("Palworld 服务器");
    expect(container.textContent).toContain("PalBeacon 云端");
    expect(container.textContent).toContain("玩家浏览器");
    expect(
      within(container.querySelector("footer")!).getByText(
        "Keep your Palworld Visible.",
      ),
    ).toBeTruthy();
    expect(container.textContent).not.toContain("产品界面示意");
    expect(container.textContent).not.toContain(
      "下面的答案与当前 palbeacon-cli 和网页实现保持一致",
    );
    expect(container.textContent).not.toContain("此公开页面不会生成真实配对码");
    expect(container.textContent).not.toContain("palbeacon-sync");
    expect(container.querySelector('a[href="/en"]')).not.toBeNull();
  });

  it("renders a fully localized English main story with the same structure", async () => {
    const { container } = render(
      await LandingPage({ locale: "en", translate: landingCopy("en") }),
    );
    const main = within(container.querySelector("main")!);

    expect(main.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(main.getByRole("heading", { level: 1 }).textContent).toBe(
      "Keep your Palworld visible",
    );
    expect(container.textContent).toContain("one clear server console");
    expect(container.querySelectorAll("[data-carousel-slide]")).toHaveLength(3);
    expect(container.textContent).toContain("Guild inventory");
    expect(container.textContent).toContain("Breeding route tree");
    expect(container.textContent).toContain("Saved plans");
    expect(main.getAllByText("palbeacon init").length).toBeGreaterThan(0);
    expect(main.getAllByText("palbeacon run").length).toBeGreaterThan(0);
    expect(main.getByText(/The complete save is not uploaded/)).toBeTruthy();
    expect(main.getByText(/Plan multi-generation routes/)).toBeTruthy();
    expect(main.getByText(/Save useful routes/)).toBeTruthy();
    expect(container.textContent).not.toContain("Product preview");
    expect(container.textContent).not.toContain(
      "These answers match the current palbeacon-cli and web implementation",
    );
    expect(main.queryByText(/幻兽帕鲁|存档同步|帕鲁库存/)).toBeNull();
    expect(container.textContent).not.toContain("palbeacon-sync");
    expect(container.querySelector('a[href="/zh"]')).not.toBeNull();
  });

  it("publishes parseable WebSite, SoftwareApplication and visible FAQ data", async () => {
    const { container } = render(
      await LandingPage({ locale: "en", translate: landingCopy("en") }),
    );
    const values = [
      ...container.querySelectorAll('script[type="application/ld+json"]'),
    ].map(
      (script) =>
        JSON.parse(script.textContent ?? "null") as Record<string, unknown>,
    );

    expect(values.map((value) => value["@type"])).toEqual([
      "WebSite",
      "SoftwareApplication",
      "FAQPage",
    ]);
    expect(values[0]).toMatchObject({
      url: "https://www.palbeacon.app/en",
      inLanguage: "en-US",
    });
    expect(values[1]).toMatchObject({
      operatingSystem:
        "Web application: any modern browser; save sync CLI: Linux x64",
    });
    expect(values[1]).not.toHaveProperty("aggregateRating");
    expect(values[1]).not.toHaveProperty("offers");
    const faq = values[2]?.mainEntity as Array<{
      name: string;
      acceptedAnswer: { text: string };
    }>;
    expect(faq).toHaveLength(9);
    for (const item of faq) {
      expect(container.textContent).toContain(item.name);
      expect(container.textContent).toContain(item.acceptedAnswer.text);
    }
  });
});
