import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const fixturePassword = "palhatch-local-fixture";
const invitationPlayerId = "30000000-0000-4000-8000-000000000090";
const invitationDeviceId = "90000000-0000-4000-8000-000000000090";

async function createBindingInvitationFixture() {
  const url = process.env.PALHATCH_E2E_SUPABASE_URL;
  const serviceRole = process.env.PALHATCH_E2E_SERVICE_ROLE_KEY;
  if (url !== "http://127.0.0.1:54321" || !serviceRole) {
    throw new Error("Binding invitation E2E requires local Supabase");
  }
  const service = createClient(url, serviceRole, {
    auth: { persistSession: false },
  });
  const player = await service.from("players").insert({
    id: invitationPlayerId,
    world_id: "10000000-0000-4000-8000-000000000001",
    guild_id: "20000000-0000-4000-8000-000000000001",
    game_player_uid: "fixture-invitation-player",
    nickname: "邀请测试成员",
    level: 41,
    last_seen_at: "2026-07-13T09:00:00Z",
  });
  if (player.error) throw player.error;
  const device = await service.from("sync_devices").insert({
    id: invitationDeviceId,
    owner_user_id: "00000000-0000-4000-8000-000000000002",
    world_id: "10000000-0000-4000-8000-000000000001",
    name: "邀请测试服务器",
    platform: "linux-x64",
    token_hash: "c".repeat(64),
    token_prefix: "pbs_e2etest1",
    last_seen_at: "2026-07-13T09:00:00Z",
    last_snapshot_at: "2026-07-13T09:00:00Z",
  });
  if (device.error) throw device.error;
}

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

test("unbound test account receives the sync setup", async ({ page }) => {
  await login(page, "unbound@palhatch.fixture.invalid");
  await expect(page.getByRole("heading", { name: "存档同步" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "常见问题" })).toBeVisible();

  await page.getByRole("button", { name: "打开导航菜单" }).click();
  const menu = page.getByRole("dialog", { name: "PalBeacon" });
  await expect(
    menu.getByRole("link", { name: /数据状态.*未绑定/ }),
  ).toBeVisible();
});

test("an invited user returns from login and explicitly accepts the member binding", async ({
  page,
  context,
}) => {
  const testPort = process.env.PALHATCH_E2E_PORT ?? "3000";
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: `http://127.0.0.1:${testPort}`,
  });
  await createBindingInvitationFixture();
  await login(page);
  await page.goto("/zh/account");

  await expect(page.getByText("邀请测试服务器")).toBeVisible();
  await expect(page.getByText("邀请测试成员")).toBeVisible();
  const memberRow = page
    .locator("div")
    .filter({ has: page.getByText("邀请测试成员", { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "邀请绑定" }) })
    .last();
  await expect(memberRow.getByRole("button", { name: "这是我" })).toBeEnabled();
  const invitationResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/sync/binding-invitations") &&
      response.request().method() === "POST",
  );
  await memberRow.getByRole("button", { name: "邀请绑定" }).click();
  const invitationResponse = await invitationResponsePromise;
  expect(invitationResponse.status()).toBe(201);
  const invitation = (await invitationResponse.json()) as {
    invitation_path: string;
  };
  await expect(page.getByText("邀请链接已复制")).toBeVisible();

  const logout = await page.request.post("/api/auth/logout");
  expect(logout.ok()).toBeTruthy();
  await page.goto(invitation.invitation_path);
  await expect(page).toHaveURL(/\/zh\/login\?next=/);
  await page.getByLabel("邮箱").fill("unbound@palhatch.fixture.invalid");
  await page.getByLabel("密码").fill(fixturePassword);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(invitation.invitation_path, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: /邀请测试成员/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "确认绑定" }).click();
  await expect(page.getByText("角色绑定成功")).toBeVisible();
  await page.goto("/zh/account");
  await expect(page.getByText("邀请测试成员", { exact: true })).toBeVisible();
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
