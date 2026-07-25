import { expect, test, type Page } from "@playwright/test";

const fixturePassword = "palhatch-local-fixture";

async function login(page: Page, email = "player-a@palhatch.fixture.invalid") {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(fixturePassword);
  await page.getByRole("button", { name: "登录工作台" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

async function navigateFromMobileMenu(page: Page, label: string) {
  await page.getByRole("button", { name: "打开导航菜单" }).click();
  const menu = page.getByRole("dialog", { name: "导航菜单" });
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

test("overview stays within a 390px viewport and uses CSS-only hero scenery", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  await expect(
    page.getByRole("link", { name: "开始配种" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "查看库存" })).toBeVisible();
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

test("inventory scope and pagination links refresh the visible list", async ({
  page,
}) => {
  await login(page);
  await page.goto("/pals?scope=all&page_size=1");

  await page.getByRole("link", { name: "公会共享" }).click();
  await expect(page).toHaveURL(/\/pals\?scope=shared&page_size=1$/);
  await expect(page.getByText("共 1 只可见帕鲁")).toBeVisible();
  await expect(
    page.getByRole("article").getByText("Fixture Player B"),
  ).toBeVisible();

  await page.getByRole("link", { name: "全部", exact: true }).click();
  await expect(page).toHaveURL(/\/pals\?scope=all&page_size=1$/);
  await expect(page.getByText("共 3 只可见帕鲁")).toBeVisible();

  await page.goto("/pals?scope=all&page_size=1");
  await page.getByRole("link", { name: "表格视图" }).click();
  await expect(page).toHaveURL(/view=table/);
  const inventoryTable = page.getByRole("table", { name: "帕鲁库存表格" });
  await expect(inventoryTable).toBeVisible();
  await expect(
    inventoryTable.getByRole("img", { name: "棉悠悠头像" }),
  ).toBeVisible();

  const firstPalId = await page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "棉悠悠头像" }) })
    .getAttribute("data-pal-id");
  await page.getByRole("link", { name: "下一页" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/context=/);
  await expect(page).toHaveURL(/view=table/);
  await expect
    .poll(async () =>
      page
        .getByRole("row")
        .filter({ has: page.getByRole("img", { name: "棉绒兽头像" }) })
        .getAttribute("data-pal-id"),
    )
    .not.toBe(firstPalId);
});

test("inventory filter styles use semantic border colors", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto("/pals");

  const semanticColors = await page
    .getByRole("link", { name: "清除" })
    .evaluate((element) => {
      const resolveColor = (variable: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${variable})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };

      return {
        border: getComputedStyle(element).borderTopColor,
        foreground: resolveColor("--foreground"),
        semanticBorder: resolveColor("--border"),
        semanticInput: resolveColor("--input"),
      };
    });

  expect(semanticColors.border).toBe(semanticColors.semanticInput);
  expect(semanticColors.border).not.toBe(semanticColors.foreground);

  await page.getByRole("combobox", { name: "所有者" }).click();
  const selectContent = page.locator('[data-slot="select-content"]');
  await expect(selectContent).toBeVisible();
  const selectBorder = await selectContent.evaluate(
    (element) => getComputedStyle(element).borderTopColor,
  );
  expect(selectBorder).toBe(semanticColors.semanticBorder);
});

test("inventory filter styles keep a single search focus indicator", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto("/pals");

  await page.getByRole("combobox", { name: "被动" }).click();
  const commandInput = page.locator('[data-slot="command-input"]');
  await expect(commandInput).toBeFocused();

  const inputFocus = await commandInput.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.outlineStyle;
  });
  expect(inputFocus).toBe("none");

  const wrapperShadow = await page
    .locator('[data-slot="command-input-wrapper"]')
    .evaluate((element) => getComputedStyle(element).boxShadow);
  expect(wrapperShadow).not.toBe("none");
});

test("iPhone flow filters inventory, pages deterministically and toggles owned sharing", async ({
  page,
}) => {
  await login(page);
  await navigateFromMobileMenu(page, "帕鲁");
  await expect(page.getByRole("heading", { name: "帕鲁库存" })).toBeVisible();

  await page.getByRole("button", { name: "筛选" }).click();
  let filterSheet = page.getByRole("dialog", { name: "筛选库存" });
  await filterSheet.getByLabel("名称、图鉴编号或稳定 ID").fill("棉");
  await filterSheet.getByRole("button", { name: "应用筛选" }).click();
  await expect(page.getByRole("heading", { name: "棉悠悠" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "棉绒兽" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "筛选" }).click();
  filterSheet = page.getByRole("dialog", { name: "筛选库存" });
  await filterSheet.getByLabel("名称、图鉴编号或稳定 ID").fill("2");
  await filterSheet.getByRole("button", { name: "应用筛选" }).click();
  await expect(page.getByRole("heading", { name: "棉绒兽" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "棉悠悠" })).toHaveCount(0);

  await page.getByRole("button", { name: "筛选" }).click();
  filterSheet = page.getByRole("dialog", { name: "筛选库存" });
  await filterSheet.getByLabel("名称、图鉴编号或稳定 ID").fill("棉悠悠");
  await filterSheet.getByRole("button", { name: "应用筛选" }).click();
  await page.waitForLoadState("networkidle");

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
  await expect(page.getByRole("heading", { name: "棉绒兽" })).toBeVisible({
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
  await navigateFromMobileMenu(page, "数据状态");
  await expect(page.getByRole("heading", { name: "数据状态" })).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "数据已过期" }),
  ).toBeVisible();
  await expect(page.getByText("确定性算法版本")).toBeVisible();
  await expect(
    page.getByText("inventory-trait-aware-deterministic-v4"),
  ).toBeVisible();
});
