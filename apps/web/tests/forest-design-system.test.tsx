import { fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SiteHeader } from "../components/layout/site-header";
import { PalElementIcons } from "../components/pals/pal-element-icons";
import { PalPortrait } from "../components/pals/pal-portrait";
import { PassiveBadge } from "../components/pals/passive-badge";
import { PageError } from "../components/states/page-error";
import { ForestScenery } from "../components/surfaces/forest-scenery";

describe("Forest Healing design system", () => {
  it("keeps login and hero scenery free of white cloud shapes", () => {
    const { container } = render(
      <div>
        <ForestScenery variant="page" />
        <ForestScenery variant="hero" />
      </div>,
    );

    expect(
      container.querySelectorAll(
        '[class*="bg-white/75"], [class*="bg-white/55"]',
      ),
    ).toHaveLength(0);
  });

  it("marks the current top navigation destination", () => {
    render(
      <SiteHeader
        activePath="/pals/fixture"
        displayName="Fixture Player A"
        role="player"
      />,
    );

    const palLinks = screen.getAllByRole("link", { name: "帕鲁库存" });
    expect(palLinks.length).toBeGreaterThan(0);
    for (const link of palLinks) {
      expect(link.getAttribute("aria-current")).toBe("page");
    }
    expect(
      screen
        .getAllByRole("link", { name: "首页" })[0]
        ?.hasAttribute("aria-current"),
    ).toBe(false);
    expect(screen.getByRole("link", { name: "PalBeacon 首页" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "PalBeacon" })).toBeTruthy();
    expect(screen.queryByText("帕鲁配种协作工作台")).toBeNull();
    const wordmarks = screen.getAllByLabelText("PalBeacon");
    expect(wordmarks.length).toBeGreaterThan(0);
    for (const wordmark of wordmarks) {
      expect(
        wordmark.querySelector('[data-brand-part="pal"]')?.className,
      ).toContain("text-primary");
      expect(
        wordmark.querySelector('[data-brand-part="beacon"]')?.className,
      ).toContain("text-sky-700");
    }
  });

  it("uses the Steam avatar before the display-name initial", () => {
    vi.stubGlobal(
      "Image",
      class {
        complete = true;
        naturalWidth = 32;
        crossOrigin: string | null = null;
        referrerPolicy = "";
        src = "";
        addEventListener() {}
        removeEventListener() {}
      },
    );
    const { rerender } = render(
      <SiteHeader
        activePath="/overview"
        displayName="Fixture Player A"
        role="player"
        avatarUrl="https://avatars.steamstatic.com/fixture.jpg"
      />,
    );

    expect(
      screen.getByRole("img", { name: "Fixture Player A" }).getAttribute("src"),
    ).toBe("https://avatars.steamstatic.com/fixture.jpg");

    rerender(
      <SiteHeader
        activePath="/overview"
        displayName="Fixture Player A"
        role="player"
        avatarUrl={null}
      />,
    );
    expect(screen.queryByRole("img", { name: "Fixture Player A" })).toBeNull();
    expect(screen.getByText("F")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("only exposes the admin center to administrators", () => {
    const { rerender } = render(
      <SiteHeader
        activePath="/overview"
        displayName="Fixture Player A"
        role="player"
      />,
    );

    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "打开用户菜单，Fixture Player A",
      }),
      { key: "Enter", code: "Enter" },
    );
    expect(screen.queryByRole("menuitem", { name: "管理中心" })).toBeNull();

    rerender(
      <SiteHeader
        activePath="/overview"
        displayName="Fixture Admin"
        role="admin"
      />,
    );
    expect(screen.getByRole("menuitem", { name: "管理中心" })).toBeTruthy();
  });

  it.each([
    { dataStatus: undefined, label: "未绑定" },
    { dataStatus: "latest" as const, label: "最新" },
    { dataStatus: "expired" as const, label: "已过期" },
  ])(
    "keeps the $label data badge inside the user menu",
    ({ dataStatus, label }) => {
      render(
        <SiteHeader
          activePath="/overview"
          displayName="Fixture Player A"
          role="player"
          dataStatus={dataStatus}
        />,
      );

      expect(screen.queryByText(label)).toBeNull();
      fireEvent.keyDown(
        screen.getByRole("button", {
          name: "打开用户菜单，Fixture Player A",
        }),
        { key: "Enter", code: "Enter" },
      );
      const statusItem = screen.getByRole("menuitem", { name: /数据状态/ });
      expect(within(statusItem).getByText(label).className).toContain(
        "ml-auto",
      );
    },
  );

  it("places the GitHub link before the language switcher", () => {
    render(
      <SiteHeader
        activePath="/overview"
        displayName="Fixture Player A"
        role="player"
      />,
    );

    const github = screen.getAllByRole("link", {
      name: "在 GitHub 上查看 PalHatchHelper",
    })[0];
    const language = screen.getAllByRole("button", {
      name: "当前语言：中文",
    })[0];
    if (!github || !language) throw new Error("Header controls are missing");
    expect(github.getAttribute("href")).toBe(
      "https://github.com/MetalLee/PalHatchHelper",
    );
    expect(github.getAttribute("target")).toBe("_blank");
    expect(
      github.compareDocumentPosition(language) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens the mobile navigation sheet", () => {
    render(
      <SiteHeader
        activePath="/plans"
        displayName="Fixture Player A"
        role="player"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开导航菜单" }));
    const sheet = screen.getByRole("dialog", { name: "PalBeacon" });
    expect(within(sheet).getByRole("link", { name: "我的计划" })).toBeTruthy();
    expect(within(sheet).getByText(/当前页面：我的计划/)).toBeTruthy();
  });

  it("keeps the mobile navigation trigger disabled until hydration", () => {
    const markup = renderToString(
      <SiteHeader
        activePath="/overview"
        displayName="Fixture Player A"
        role="player"
      />,
    );

    expect(markup).toMatch(
      /<button(?=[^>]*aria-label="打开导航菜单")(?=[^>]*disabled="")[^>]*>/,
    );
  });

  it("keeps passive rank styling without rendering rank text", () => {
    const { rerender } = render(<PassiveBadge name="任意名称" rank={1} />);
    expect(screen.getByText("任意名称").dataset.rank).toBe("1");
    expect(screen.getByText("任意名称").className).toContain("passive-badge");
    expect(screen.queryByText(/Rank|R1/)).toBeNull();

    for (const rank of [2, 3, 4, 5] as const) {
      rerender(<PassiveBadge name={`被动 ${rank}`} rank={rank} />);
      expect(screen.getByText(`被动 ${rank}`).dataset.rank).toBe(String(rank));
      expect(screen.queryByText(/Rank/)).toBeNull();
    }

    rerender(<PassiveBadge name="负面被动" rank={-1} />);
    expect(screen.getByText("负面被动").dataset.rank).toBe("negative");
    expect(screen.getByText("负面被动").getAttribute("aria-label")).toContain(
      "负面",
    );

    rerender(<PassiveBadge name="目录负面被动" rank={1} isNegative={true} />);
    expect(
      screen
        .getByText("目录负面被动")
        .closest("[data-rank]")
        ?.getAttribute("data-rank"),
    ).toBe("1");
    expect(screen.queryByText(/Rank 1/)).toBeNull();
    expect(
      screen.getByText("目录负面被动").getAttribute("aria-label"),
    ).not.toContain("Rank");

    rerender(<PassiveBadge name="未知品级" rank={null} />);
    expect(screen.getByText("未知品级").dataset.rank).toBe("unknown");

    rerender(<PassiveBadge name="零品级" rank={0} />);
    expect(screen.getByText("零品级").dataset.rank).toBe("unknown");
  });

  it("replaces a missing local pal icon with a stable portrait fallback", () => {
    render(
      <PalPortrait
        palId="Missing-Pal"
        name="幻悦蝶"
        catalogNumber="103"
        size={72}
      />,
    );

    const image = screen.getByRole("img", { name: "幻悦蝶头像" });
    expect(decodeURIComponent(image.getAttribute("src") ?? "")).toContain(
      "/pal-assets/pals/missing-pal.webp",
    );
    fireEvent.error(image);

    expect(
      screen.getByRole("img", { name: "幻悦蝶头像（暂无本地图标）" }),
    ).toBeTruthy();
    expect(screen.getByText("#103")).toBeTruthy();
    expect(screen.queryByRole("img", { name: "幻悦蝶头像" })).toBeNull();
  });

  it("uses the stable element ID to load the local element icon", () => {
    render(<PalElementIcons elementTypes={["Fire"]} />);

    const elementIcon = screen.getByRole("img", { name: "火属性" });
    expect(
      decodeURIComponent(elementIcon.querySelector("img")?.src ?? ""),
    ).toContain("/pal-assets/elements/fire.webp");
  });

  it("renders an accessible page error with a recovery action", () => {
    render(
      <PageError
        code="DATA_UNAVAILABLE"
        title="数据暂不可用"
        description="请稍后重试。"
        action={<button type="button">重新加载</button>}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(
      within(alert).getByRole("heading", { name: "数据暂不可用" }),
    ).toBeTruthy();
    expect(
      within(alert).getByRole("button", { name: "重新加载" }),
    ).toBeTruthy();
    expect(alert.getAttribute("aria-labelledby")).toBeTruthy();
  });
});
