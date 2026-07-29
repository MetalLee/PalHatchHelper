import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const fixturePassword = "palhatch-local-fixture";
const screenshotDirectory = resolve(
  process.cwd(),
  "../../artifacts/palbeacon-brand",
);

async function login(page: Page) {
  await page.getByLabel("邮箱").fill("player-a@palhatch.fixture.invalid");
  await page.getByLabel("密码").fill(fixturePassword);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/overview$/, { timeout: 15_000 });
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test.beforeAll(() => {
  mkdirSync(screenshotDirectory, { recursive: true });
});

test("PalBeacon login and workspace branding stay responsive", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/zh/login");
  await expect(page).toHaveTitle("登录 | PalBeacon");
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  await expect(page.getByText("登录你的 PalBeacon 账号")).toBeVisible();
  await expect(page.getByText("忘记密码？")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.getByText("注册账号")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(
    page.getByRole("img", { name: "PalBeacon" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "在 GitHub 上查看 PalHatchHelper" }),
  ).toHaveAttribute("href", "https://github.com/MetalLee/PalHatchHelper");
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: resolve(screenshotDirectory, "login-desktop-1440.png"),
    fullPage: true,
  });

  await login(page);
  const header = page.getByRole("banner");
  const headerLogo = header.getByRole("img", {
    name: "PalBeacon",
  });
  await expect(header.getByText("帕鲁配种协作工作台")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  expect(Math.round((await headerLogo.boundingBox())?.width ?? 0)).toBe(40);
  await page.screenshot({
    path: resolve(screenshotDirectory, "overview-desktop-1440.png"),
    fullPage: true,
  });

  await header.getByRole("button", { name: /打开用户菜单/ }).click();
  await expect(page.getByRole("menuitem", { name: "账号" })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: /数据状态.*已过期/ }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(screenshotDirectory, "overview-desktop-1440-user-menu.png"),
  });
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 1024, height: 768 });
  await expectNoHorizontalOverflow(page);
  expect(Math.round((await headerLogo.boundingBox())?.width ?? 0)).toBe(40);
  await page.screenshot({
    path: resolve(screenshotDirectory, "overview-laptop-1024.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  expect(Math.round((await headerLogo.boundingBox())?.width ?? 0)).toBe(34);
  await expect(header.getByText("帕鲁配种协作工作台")).toHaveCount(0);
  await page.screenshot({
    path: resolve(screenshotDirectory, "overview-mobile-390.png"),
    fullPage: true,
  });

  await header.getByRole("button", { name: "打开导航菜单" }).click();
  const mobileMenu = page.getByRole("dialog", { name: "PalBeacon" });
  await expect(mobileMenu).toBeVisible();
  await page.screenshot({
    path: resolve(screenshotDirectory, "overview-mobile-390-navigation.png"),
  });
  await mobileMenu.getByRole("link", { name: "数据状态" }).click();
  await expect(
    page.getByRole("heading", { name: "服务器数据状态" }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByText("数据已过期").first(),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: resolve(screenshotDirectory, "data-status-stale-mobile-390.png"),
    fullPage: true,
  });
});

test("healthy local sync state stays explicit", async ({ page }) => {
  test.skip(
    process.env.PALBEACON_E2E_HEALTHY !== "1",
    "requires the temporary healthy local fixture",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh/login");
  await login(page);
  await page.goto("/zh/data-status");
  await expect(
    page.getByRole("main").getByText("数据同步正常").first(),
  ).toBeVisible();
  await expect(page.getByText("服务器运行正常")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: resolve(screenshotDirectory, "data-status-healthy-mobile-390.png"),
    fullPage: true,
  });
});
