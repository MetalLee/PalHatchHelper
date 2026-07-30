import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductCarousel } from "@/features/landing/product-carousel";

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function activeSlide(container: HTMLElement): string | null {
  return (
    container.querySelector('[data-carousel-slide][data-active="true"]')
      ?.textContent ?? null
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("landing product carousel", () => {
  it("uses the catalog-localized name that matches every Pal portrait", () => {
    mockReducedMotion(true);
    const expectedByLocale = {
      en: {
        sheepball: "Lamball",
        naughtycat: "Grintale",
        chickenpal: "Chikipi",
        cutefox: "Vixy",
        carbunclo: "Lifmunk",
        bastet: "Mau",
        jellyfishghost: "Jellroy",
      },
      zh: {
        sheepball: "棉悠悠",
        naughtycat: "笑魇猫",
        chickenpal: "皮皮鸡",
        cutefox: "玉藻狐",
        carbunclo: "翠叶鼠",
        bastet: "喵丝特",
        jellyfishghost: "海月灵",
      },
    } as const;

    for (const locale of ["en", "zh"] as const) {
      const { container, unmount } = render(
        <ProductCarousel locale={locale} />,
      );
      const cards = container.querySelectorAll(
        "[data-inventory-card], [data-route-node], [data-plan-card]",
      );

      for (const card of cards) {
        const palId = card.getAttribute("data-pal-id");
        expect(palId).not.toBeNull();
        expect(card.textContent).toContain(
          expectedByLocale[locale][
            palId as keyof (typeof expectedByLocale)[typeof locale]
          ],
        );
      }

      expect(container.textContent).not.toMatch(
        locale === "en"
          ? /Parent [ABC]|Intermediate parent|Target Pal(?: [AB])?/
          : /亲本 [ABC]|中间亲本|目标帕鲁(?: [AB])?/,
      );
      unmount();
    }
  });

  it("keeps the fixed route on two verified catalog recipes", () => {
    mockReducedMotion(true);
    const { container } = render(<ProductCarousel locale="zh" />);
    const routeTree = container.querySelector("[data-route-tree]");

    expect(routeTree?.getAttribute("data-route-recipe-one")).toBe(
      "carbunclo+sheepball->bastet",
    );
    expect(routeTree?.getAttribute("data-route-recipe-two")).toBe(
      "bastet+naughtycat->jellyfishghost",
    );
    expect(
      Array.from(routeTree?.querySelectorAll("[data-route-node]") ?? []).map(
        (node) => node.getAttribute("data-pal-id"),
      ),
    ).toEqual([
      "carbunclo",
      "sheepball",
      "bastet",
      "naughtycat",
      "jellyfishghost",
    ]);
    expect(routeTree?.textContent).toContain("翠叶鼠");
    expect(routeTree?.textContent).toContain("棉悠悠");
    expect(routeTree?.textContent).toContain("喵丝特");
    expect(routeTree?.textContent).toContain("笑魇猫");
    expect(routeTree?.textContent).toContain("海月灵");
  });

  it("cycles through the three workspace views and supports manual controls", () => {
    vi.useFakeTimers();
    mockReducedMotion(false);
    const { container, getAllByText, getByRole, queryByText } = render(
      <ProductCarousel locale="zh" />,
    );

    expect(container.querySelectorAll("[data-carousel-slide]")).toHaveLength(3);
    expect(container.querySelectorAll("[data-inventory-owner]")).toHaveLength(
      4,
    );
    expect(
      container.querySelectorAll("[data-inventory-location]"),
    ).toHaveLength(4);
    for (const card of container.querySelectorAll("[data-inventory-card]")) {
      const details = card.querySelector("[data-inventory-details]");
      expect(details?.querySelector("[data-inventory-owner]")).not.toBeNull();
      expect(
        details?.querySelector("[data-inventory-location]"),
      ).not.toBeNull();
      expect(details?.className).not.toContain("border-t");
      expect(
        details?.nextElementSibling?.hasAttribute("data-inventory-passives"),
      ).toBe(true);
    }
    const chikipiCard = Array.from(
      container.querySelectorAll("[data-inventory-card]"),
    ).find((card) => card.textContent?.includes("皮皮鸡"));
    expect(chikipiCard?.textContent).toContain("稀有");
    expect(
      chikipiCard?.querySelector(".passive-badge")?.getAttribute("data-rank"),
    ).toBe("4");
    expect(container.querySelectorAll("[data-plan-card]")).toHaveLength(2);
    expect(getAllByText("公会库存")).toHaveLength(1);
    expect(getAllByText("配种路线树")).toHaveLength(1);
    expect(getAllByText("收藏计划")).toHaveLength(1);
    expect(queryByText("PalBeacon 控制台")).toBeNull();
    expect(activeSlide(container)).toContain("棉悠悠");

    act(() => vi.advanceTimersByTime(6000));
    expect(activeSlide(container)).toContain("海月灵");
    expect(
      container
        .querySelector("[data-route-tree]")
        ?.getAttribute("data-route-layout"),
    ).toBe("generations");
    expect(container.querySelectorAll("[data-route-node]")).toHaveLength(5);
    expect(container.querySelectorAll("[data-route-edge]")).toHaveLength(4);
    expect(
      container
        .querySelector("[data-route-tree]")
        ?.getAttribute("data-route-generations"),
    ).toBe("2");
    expect(
      container
        .querySelector("[data-route-tree]")
        ?.getAttribute("data-route-passive-count"),
    ).toBe("4");
    expect(
      container.querySelectorAll("[data-route-target] .passive-badge"),
    ).toHaveLength(4);
    expect(container.textContent).toContain("初始亲本");
    expect(container.textContent).toContain("第 1 代");
    expect(container.textContent).toContain("第 2 代");
    expect(activeSlide(container)).toContain("我的库存");
    expect(activeSlide(container)).toContain("公会伙伴");
    expect(activeSlide(container)).toContain("终端 · 第 26 页");
    expect(activeSlide(container)).not.toContain("位置已记录");

    for (const badge of getAllByText("认真")) {
      expect(badge.getAttribute("data-rank")).toBe("1");
    }
    for (const badge of getAllByText("工匠精神")) {
      expect(badge.getAttribute("data-rank")).toBe("3");
    }
    for (const badge of getAllByText("稀有")) {
      expect(badge.getAttribute("data-rank")).toBe("4");
    }
    for (const badge of getAllByText("灵活")) {
      expect(badge.getAttribute("data-rank")).toBe("1");
    }

    fireEvent.click(getByRole("button", { name: "暂停自动播放" }));
    act(() => vi.advanceTimersByTime(12000));
    expect(activeSlide(container)).toContain("海月灵");

    fireEvent.click(getByRole("button", { name: "下一张" }));
    expect(activeSlide(container)).toContain("刚刚收藏");
  });

  it("does not autoplay when reduced motion is requested", () => {
    vi.useFakeTimers();
    mockReducedMotion(true);
    const { container } = render(<ProductCarousel locale="en" />);

    act(() => vi.advanceTimersByTime(12000));
    expect(activeSlide(container)).toContain("Lamball");
  });

  it("keeps English route status, gender, passives and hint compact", () => {
    mockReducedMotion(true);
    const { container, getByRole } = render(<ProductCarousel locale="en" />);

    fireEvent.click(
      getByRole("button", { name: "Slide 2: Breeding route tree" }),
    );

    const statusRows = container.querySelectorAll("[data-route-status-row]");
    expect(statusRows).toHaveLength(5);
    for (const row of statusRows) {
      expect(row.className).toContain("flex-nowrap");
    }
    expect(container.querySelector("[data-route-hint]")?.textContent).toBe(
      "Combine passives across generations.",
    );
    expect(container.querySelector("[data-route-hint]")?.className).toContain(
      "whitespace-nowrap",
    );
  });
});
