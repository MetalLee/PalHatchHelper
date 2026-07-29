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
    await expect(page.locator("h1")).toHaveText("Keep your Palworld visible");
    await expect(
      page.locator("main > section").first().locator("a"),
    ).toHaveCount(2);
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
  ).toContainText("目标帕鲁");
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
