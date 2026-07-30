import { expect, test } from "@playwright/test";

test("serves localized public landing pages and search assets", async ({
  page,
  request,
}) => {
  for (const locale of ["zh", "en"] as const) {
    const response = await page.goto(`/${locale}`);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText(
      locale === "zh" ? "幻兽帕鲁服务器控制台" : "Palworld Server Console",
    );
    await expect(page.getByText("Keep your world visible.")).toBeVisible();
    await expect(
      page.locator("main > section").first().locator("a"),
    ).toHaveCount(3);
    await expect(
      page.locator("main > section").first().locator('a[href*="github.com"]'),
    ).toHaveCount(0);
    await expect(page.locator("[data-carousel-slide]")).toHaveCount(3);
    await expect(
      page.getByText("palbeacon init", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("palbeacon run", { exact: true }).first(),
    ).toBeVisible();
    const html = await page.content();
    expect(html).toContain(
      `rel="canonical" href="https://www.palbeacon.app/${locale}"`,
    );
    expect(html).toContain('hreflang="zh-CN"');
    expect(html).toContain('hreflang="en"');
    expect(html).toContain('hreflang="x-default"');
    expect(html).toContain('type="application/ld+json"');
  }

  await page.goto("/zh");
  const landingHeader = page.locator("[data-landing-header]");
  await expect(landingHeader).toHaveAttribute("data-glass", "false");
  expect(
    await landingHeader.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).toBe("rgba(255, 255, 255, 0)");
  await expect(
    landingHeader
      .getByRole("link", {
        name: "在 GitHub 上查看 PalHatchHelper",
      })
      .first(),
  ).toBeVisible();
  expect(await landingHeader.textContent()).not.toContain("GitHub");
  await landingHeader
    .getByRole("button", { name: "当前语言：中文" })
    .first()
    .click();
  await expect(
    page.getByRole("menuitemradio", { name: "English" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  for (const [scrollTop, progress] of [
    [48, "0.216"],
    [96, "0.648"],
    [160, "1.000"],
  ] as const) {
    await page.evaluate((top) => scrollTo(0, top), scrollTop);
    await expect(landingHeader).toHaveAttribute(
      "data-scroll-progress",
      progress,
    );
  }
  await expect(landingHeader).toHaveCSS(
    "background-color",
    "rgba(255, 255, 255, 0.86)",
  );
  expect(
    await landingHeader.evaluate((element) => element.style.backdropFilter),
  ).toBe("blur(22px) saturate(118%)");

  await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole("button", { name: "第 2 张：配种路线树" }).click();
  await expect(
    page.locator('[data-carousel-slide][data-active="true"]'),
  ).toContainText("海月灵");
  await expect(page.locator("[data-route-tree]")).toBeVisible();
  await page.getByRole("button", { name: "下一张" }).click();
  await expect(
    page.locator('[data-carousel-slide][data-active="true"]'),
  ).toContainText("刚刚收藏");

  const robotsResponse = await request.get("/robots.txt");
  expect(robotsResponse.status()).toBe(200);
  expect(await robotsResponse.text()).toContain(
    "Sitemap: https://www.palbeacon.app/sitemap.xml",
  );

  const sitemapResponse = await request.get("/sitemap.xml");
  expect(sitemapResponse.status()).toBe(200);
  const sitemapBody = await sitemapResponse.text();
  expect(sitemapBody).toContain("https://www.palbeacon.app/zh");
  expect(sitemapBody).toContain("https://www.palbeacon.app/en");
  expect(sitemapBody.match(/<loc>/g)).toHaveLength(10);
  expect(sitemapBody).not.toContain("/overview");

  for (const locale of ["zh", "en"] as const) {
    const imageResponse = await request.get(`/${locale}/opengraph-image`);
    expect(imageResponse.status()).toBe(200);
    expect(imageResponse.headers()["content-type"]).toContain("image/png");
  }
});

test("keeps the localized landing content readable on narrow screens", async ({
  page,
}) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/zh");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("[data-carousel-slide]").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("navigates every public guide, preserves its slug across languages, and exposes the existing CTA flow", async ({
  page,
}) => {
  const guides = [
    [
      "palworld-save-sync",
      "帕鲁服务器存档同步",
      "Palworld Server Save Sync",
      "/en/login",
    ],
    [
      "save-breeding-planner",
      "基于存档的配种规划",
      "Save-Based Breeding Planner",
      "/en/breeder",
    ],
    [
      "passive-breeding-route",
      "帕鲁被动继承路线",
      "Passive Breeding Routes",
      "/en/breeder",
    ],
    [
      "guild-pal-inventory",
      "公会帕鲁库存协作",
      "Guild Pal Inventory",
      "/en/login",
    ],
  ] as const;

  for (const [slug, chineseTitle, englishTitle, ctaHref] of guides) {
    await page.goto("/zh");
    const card = page.locator(`#explore a[href="/zh/${slug}"]`);
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/zh/${slug}$`));
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveText(chineseTitle);
    await expect(
      page.getByRole("navigation", { name: "面包屑导航" }),
    ).toBeVisible();
    await expect(page.locator(`footer a[href="/zh/${slug}"]`)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page
      .locator("[data-landing-header]")
      .getByRole("button", { name: "当前语言：中文" })
      .first()
      .click();
    await page.getByRole("menuitemradio", { name: "English" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/${slug}$`));
    await expect(page.locator("h1")).toHaveText(englishTitle);
    await expect(
      page.locator(`main a[href="${ctaHref}"]`).first(),
    ).toBeVisible();
    await expect(
      page.locator('script[type="application/ld+json"]'),
    ).toHaveCount(3);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://www.palbeacon.app/en/${slug}`,
    );
    for (const language of ["zh-CN", "en", "x-default"] as const) {
      await expect(
        page.locator(`link[rel="alternate"][hreflang="${language}"]`),
      ).toHaveCount(1);
    }
  }
});

test("keeps the English breeding preview on one compact visual rhythm", async ({
  page,
}) => {
  await page.setViewportSize({ width: 620, height: 1000 });
  await page.goto("/en");
  await page
    .getByRole("button", { name: "Slide 2: Breeding route tree" })
    .click();

  const statusRows = page.locator("[data-route-status-row]");
  await expect(statusRows).toHaveCount(5);
  for (const row of await statusRows.all()) {
    const children = row.locator(":scope > *");
    const statusBox = await children.nth(0).boundingBox();
    const genderBox = await children.nth(1).boundingBox();
    expect(statusBox).not.toBeNull();
    expect(genderBox).not.toBeNull();
    const statusCenter = statusBox!.y + statusBox!.height / 2;
    const genderCenter = genderBox!.y + genderBox!.height / 2;
    expect(Math.abs(statusCenter - genderCenter)).toBeLessThanOrEqual(1);
  }

  for (const node of await page.locator("[data-route-node]").all()) {
    const nodeBox = await node.boundingBox();
    const badges = node.locator(".passive-badge");
    for (const badge of await badges.all()) {
      const badgeBox = await badge.boundingBox();
      expect(badgeBox!.y + badgeBox!.height).toBeLessThanOrEqual(
        nodeBox!.y + nodeBox!.height + 1,
      );
    }
  }

  const hint = page.locator("[data-route-hint]");
  await expect(hint).toHaveText("Combine passives across generations.");
  expect(
    await hint.evaluate(
      (element) =>
        element.getBoundingClientRect().height <=
        Number.parseFloat(getComputedStyle(element).lineHeight) + 1,
    ),
  ).toBe(true);
});

test("keeps locale negotiation at the root", async ({ request }) => {
  const english = await request.get("/", {
    headers: { "Accept-Language": "en-US" },
    maxRedirects: 0,
  });
  expect(english.status()).toBeGreaterThanOrEqual(300);
  expect(english.status()).toBeLessThan(400);
  expect(english.headers().location).toContain("/en");

  const chinese = await request.get("/", {
    headers: { "Accept-Language": "zh-CN" },
    maxRedirects: 0,
  });
  expect(chinese.status()).toBeGreaterThanOrEqual(300);
  expect(chinese.status()).toBeLessThan(400);
  expect(chinese.headers().location).toContain("/zh");
});
