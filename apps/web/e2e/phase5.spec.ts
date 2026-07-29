import { expect, test, type Page } from "@playwright/test";

const fixturePassword = "palhatch-local-fixture";

async function login(page: Page, email = "player-a@palhatch.fixture.invalid") {
  await page.goto("/zh/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(fixturePassword);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/overview$/, { timeout: 15_000 });
}

async function navigateFromMobileMenu(page: Page, label: string | RegExp) {
  await page.getByRole("button", { name: "打开导航菜单" }).click();
  const menu = page.getByRole("dialog", { name: "PalBeacon" });
  await menu.getByRole("link", { name: label }).click();
}

test.afterEach(async ({ page }) => {
  await page.request
    .patch("/api/pals/fixture-pal-a-owned-001/share", {
      data: { enabled: true },
    })
    .catch(() => undefined);
});

test("login reports failed credentials and then succeeds", async ({ page }) => {
  await page.goto("/zh/login");
  await page.getByLabel("邮箱").fill("player-a@palhatch.fixture.invalid");
  await page.getByLabel("密码").fill("definitely-wrong");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByText("邮箱或密码不正确。")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByLabel("密码").fill(fixturePassword);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/overview$/, { timeout: 15_000 });
});

test("unbound test account receives the binding state", async ({ page }) => {
  await login(page, "unbound@palhatch.fixture.invalid");
  await expect(page.getByText("尚未绑定游戏角色")).toBeVisible();
});

test("overview stays within a 390px viewport and uses CSS-only hero scenery", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  await expect(
    page.getByRole("link", { name: "开始配种" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "查看帕鲁" })).toBeVisible();
  const scenery = page.getByTestId("overview-scenery");
  await expect(scenery).toHaveAttribute("data-visual-source", "css");
  await expect(scenery.locator("img")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("iPhone inventory flow combines passive filtering, sharing, pagination and scope", async ({
  page,
}) => {
  await login(page);
  await navigateFromMobileMenu(page, /^帕鲁库存$/);
  await expect(page.getByRole("heading", { name: "帕鲁库存" })).toBeVisible({
    timeout: 15_000,
  });

  const passivePicker = page.getByRole("combobox", { name: "被动技能" });
  await passivePicker.click();
  await page.getByRole("option", { name: /认真/ }).click();
  await page.getByRole("option", { name: /工匠精神/ }).click();
  await page.getByRole("button", { name: "应用筛选" }).click();
  await expect(page).toHaveURL(/passive=test_passive_a/);
  await expect(page).toHaveURL(/passive=test_passive_b/);
  await expect(page.getByText("筛选结果 1 只")).toBeVisible();

  await page.goto("/zh/pals?scope=all");
  const sharing = page.getByRole("switch", { name: "棉悠悠 公会共享" });
  await expect(sharing).toHaveAttribute("aria-checked", "true");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const shareResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/pals/fixture-pal-a-owned-001/share"),
    { timeout: 30_000 },
  );
  await sharing.click();
  const shareResponse = await shareResponsePromise;
  expect(shareResponse.status()).toBe(200);
  await expect(sharing).toHaveAttribute("aria-checked", "false");
  const restoreResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/pals/fixture-pal-a-owned-001/share"),
    { timeout: 30_000 },
  );
  await sharing.click();
  expect((await restoreResponsePromise).status()).toBe(200);
  await expect(sharing).toHaveAttribute("aria-checked", "true");

  await page.goto("/zh/pals?scope=all&page_size=1");
  await expect(page.getByText("筛选结果 3 只")).toBeVisible();
  const nextHref = await page
    .getByRole("link", { name: "下一页" })
    .getAttribute("href");
  expect(nextHref).toContain("page=2");
  expect(nextHref).toContain("context=");
  await page.goto(nextHref!);
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/context=/);
  await expect(page.getByRole("heading", { name: "棉绒兽" })).toBeVisible({
    timeout: 15_000,
  });

  await page.goto("/zh/pals?scope=shared");
  await expect(
    page.getByRole("article").getByText("Fixture Player B"),
  ).toBeVisible();
  await expect(
    page.getByRole("article").getByText("Fixture Player A"),
  ).toHaveCount(0);
});

test("player responses never contain private, cross-guild, raw-save or path data", async ({
  page,
}) => {
  await login(page);
  const inventoryResponse = await page.request.get(
    "/api/pals?scope=all&page_size=50",
  );
  expect(inventoryResponse.ok()).toBeTruthy();
  const inventoryText = await inventoryResponse.text();
  const inventoryPayload = JSON.parse(inventoryText) as {
    items: Array<Record<string, unknown>>;
  };
  for (const item of inventoryPayload.items) {
    expect(item).not.toHaveProperty("owner_player_id");
    expect(item).not.toHaveProperty("guild_id");
    expect(item).not.toHaveProperty("snapshot_id");
  }
  expect(inventoryText).not.toContain("fixture-pal-b-private-001");
  expect(inventoryText).not.toContain("fixture-pal-c-shared-001");
  expect(inventoryText).not.toContain("raw_metadata");
  expect(inventoryText).not.toContain("source_save_hash");
  expect(inventoryText).not.toContain("/opt/palworld");

  const forbidden = await page.request.patch(
    "/api/pals/fixture-pal-b-shared-001/share",
    { data: { enabled: false } },
  );
  expect(forbidden.status()).toBe(403);
  expect(await forbidden.json()).toEqual({ error_code: "PAL_NOT_OWNED" });

  const pageResponse = await page.goto("/zh/pals?scope=all");
  const html = await pageResponse?.text();
  expect(html).not.toContain("fixture-pal-b-private-001");
  expect(html).not.toContain("fixture-pal-c-shared-001");
  expect(html).not.toContain("raw_metadata");
  expect(html).not.toContain("/opt/palworld");
});

test("stale data status stays explicit on iPhone width", async ({ page }) => {
  await login(page);
  await navigateFromMobileMenu(page, /^数据状态/);
  await expect(
    page.getByRole("heading", { name: "服务器数据状态" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "数据状态摘要" })
      .getByText("数据已过期", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("确定性算法版本")).toBeVisible();
  await expect(
    page.getByText("inventory-trait-aware-deterministic-v5"),
  ).toBeVisible();
});
