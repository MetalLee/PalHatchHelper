import { expect, test, type Page } from "@playwright/test";

const fixturePassword = "palhatch-local-fixture";

async function login(page: Page, email = "player-a@palhatch.fixture.invalid") {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(fixturePassword);
  await page.getByRole("button", { name: "登录工作台" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.afterEach(async ({ page }) => {
  await page.request
    .patch("/api/pals/fixture-pal-a-owned-001/share", {
      data: { enabled: true },
    })
    .catch(() => undefined);
});

test("login reports failed credentials and then succeeds", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill("player-a@palhatch.fixture.invalid");
  await page.getByLabel("密码").fill("definitely-wrong");
  await page.getByRole("button", { name: "登录工作台" }).click();
  await expect(page.getByText("邮箱或密码不正确。")).toBeVisible();

  await page.getByLabel("密码").fill(fixturePassword);
  await page.getByRole("button", { name: "登录工作台" }).click();
  await expect(page).toHaveURL(/\/overview$/);
});

test("unbound test account receives the binding state", async ({ page }) => {
  await login(page, "unbound@palhatch.fixture.invalid");
  await expect(page.getByText("尚未绑定游戏角色")).toBeVisible();
});

test("inventory scope and pagination links refresh the visible list", async ({
  page,
}) => {
  await login(page);
  await page.goto("/pals?scope=all&page_size=1");

  await page.getByRole("link", { name: "公会共享" }).click();
  await expect(page).toHaveURL(/\/pals\?scope=shared$/);
  await expect(page.getByText("共 1 只可见帕鲁")).toBeVisible();
  await expect(
    page.getByRole("article").getByText("Fixture Player B"),
  ).toBeVisible();

  await page.getByRole("link", { name: "全部", exact: true }).click();
  await expect(page).toHaveURL(/\/pals\?scope=all$/);
  await expect(page.getByText("共 3 只可见帕鲁")).toBeVisible();

  await page.goto("/pals?scope=all&page_size=1");
  const firstPalId = await page
    .locator(".pal-card .eyebrow span")
    .last()
    .textContent();
  await page.getByRole("link", { name: "下一页" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/context=/);
  await expect
    .poll(async () =>
      page.locator(".pal-card .eyebrow span").last().textContent(),
    )
    .not.toBe(firstPalId);
});

test("iPhone flow filters inventory, pages deterministically and toggles owned sharing", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "帕鲁" }).last().click();
  await expect(page.getByRole("heading", { name: "帕鲁列表" })).toBeVisible();

  await page.getByLabel("名称、图鉴编号或稳定 ID").fill("棉");
  await page.getByRole("button", { name: "应用筛选" }).click();
  await expect(page.getByRole("heading", { name: "棉悠悠" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "棉绒兽" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  await page.getByLabel("名称、图鉴编号或稳定 ID").fill("2");
  await page.getByRole("button", { name: "应用筛选" }).click();
  await expect(page.getByRole("heading", { name: "棉绒兽" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "棉悠悠" })).toHaveCount(0);

  await page.getByLabel("名称、图鉴编号或稳定 ID").fill("棉悠悠");
  await page.getByRole("button", { name: "应用筛选" }).click();
  await page.waitForLoadState("networkidle");

  const sharing = page.getByRole("switch", { name: "棉悠悠 公会共享" });
  await expect(sharing).toHaveAttribute("aria-checked", "true");
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

  await page.goto("/pals?scope=all&page_size=1");
  await expect(page.getByText("共 3 只可见帕鲁")).toBeVisible();
  const nextHref = await page
    .getByRole("link", { name: "下一页" })
    .getAttribute("href");
  expect(nextHref).toContain("page=2");
  expect(nextHref).toContain("context=");
  await page.goto(nextHref!);
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/context=/);
  await expect(
    page.getByText("test_parent_a", { exact: true }).first(),
  ).toBeVisible({
    timeout: 15_000,
  });

  await page.goto("/pals?scope=shared");
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

  const pageResponse = await page.goto("/pals?scope=all");
  const html = await pageResponse?.text();
  expect(html).not.toContain("fixture-pal-b-private-001");
  expect(html).not.toContain("fixture-pal-c-shared-001");
  expect(html).not.toContain("raw_metadata");
  expect(html).not.toContain("/opt/palworld");
});

test("stale data status stays explicit on iPhone width", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "数据状态" }).last().click();
  await expect(page.getByRole("heading", { name: "数据状态" })).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "数据已过期" }),
  ).toBeVisible();
  await expect(page.getByText("确定性算法版本")).toBeVisible();
  await expect(
    page.getByText("inventory-trait-aware-deterministic-v3"),
  ).toBeVisible();
});
