import { expect, test, type Page } from "@playwright/test";

const fixturePassword = "palhatch-local-fixture";
const adminRoutes = [
  "/zh/admin",
  "/zh/admin/bindings",
  "/zh/admin/save-parser",
  "/zh/admin/breeding-data",
  "/zh/admin/jobs",
  "/zh/admin/settings",
] as const;

test.beforeAll(async ({ request }) => {
  for (const route of adminRoutes) await request.get(route);
});

async function login(page: Page, email: string) {
  await page.goto("/zh/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(fixturePassword);
  await page.waitForFunction(
    () => {
      const button = document.querySelector('button[type="submit"]');
      return (
        button !== null &&
        Object.keys(button).some((key) => key.startsWith("__reactProps$"))
      );
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "登录工作台" }).click();
  await expect(page).toHaveURL(/\/overview$/, { timeout: 30_000 });
}

test("ordinary player receives stable server-side admin denial", async ({
  page,
}) => {
  await login(page, "player-a@palhatch.fixture.invalid");
  const response = await page.goto("/zh/admin");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(
    page.getByRole("alert", { name: "没有管理员权限" }),
  ).toContainText("ADMIN_ACCESS_DENIED");
  await expect(page.getByRole("heading", { name: "管理员概览" })).toHaveCount(
    0,
  );
});

test("iPhone admin completes binding, status, catalog, jobs, settings and audit flow", async ({
  page,
}) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(30_000);
  const responseBodies: string[] = [];
  page.on("response", async (response) => {
    if (response.url().startsWith("http://127.0.0.1:3000")) {
      const contentType = response.headers()["content-type"] ?? "";
      if (contentType.includes("text") || contentType.includes("json")) {
        responseBodies.push(await response.text().catch(() => ""));
      }
    }
  });

  await login(page, "admin@palhatch.fixture.invalid");
  await page.goto("/zh/admin");
  await expect(page.getByRole("heading", { name: "管理员概览" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("heading", { name: "Save Worker" }),
  ).toBeVisible();

  await page.goto("/zh/admin/bindings");
  await page.getByRole("button", { name: "解除绑定" }).last().click();
  const deleteDialog = page.getByRole("alertdialog", {
    name: "确认执行受审计操作",
  });
  await deleteDialog.getByLabel("确认文字").fill("解除绑定");
  await deleteDialog.getByRole("button", { name: "确认执行" }).click();
  await expect(page.getByText("binding_deleted").first()).toBeVisible();

  const createBindingForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "创建绑定" }) });
  await createBindingForm
    .locator('select[name="user_id"]')
    .selectOption("00000000-0000-4000-8000-000000000005");
  await createBindingForm
    .locator('select[name="player_id"]')
    .selectOption("30000000-0000-4000-8000-000000000003");
  await createBindingForm.getByRole("button", { name: "创建绑定" }).click();
  await expect(page.getByText("binding_created").first()).toBeVisible();

  await page.goto("/zh/admin/save-parser");
  await expect(
    page.getByRole("heading", { name: "存档与 Parser" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("只读挂载")).toBeVisible();

  await page.goto("/zh/admin/breeding-data");
  await expect(page.getByRole("heading", { name: "配种数据" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("七类计数")).toBeVisible();

  await page.goto("/zh/admin/jobs");
  await expect(page.getByRole("heading", { name: "任务与 AI" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("button", { name: "Template Provider 自检" }),
  ).toBeVisible();

  await page.goto("/zh/admin/settings");
  await expect(page.getByRole("heading", { name: "系统设置" })).toBeVisible({
    timeout: 30_000,
  });
  const settingsVersion = page.getByRole("heading", {
    name: /当前版本 v\d+/,
  });
  const previousSettingsVersion = await settingsVersion.textContent();
  await page.getByLabel("维护公告").fill("Phase 8 E2E maintenance notice");
  await page.getByRole("button", { name: "保存新版本" }).click();
  await expect(settingsVersion).not.toHaveText(previousSettingsVersion ?? "", {
    timeout: 30_000,
  });

  await page.goto("/zh/admin");
  await expect(page.getByRole("heading", { name: "管理员概览" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("binding.created").first()).toBeVisible();
  await expect(
    page.getByText("runtime_settings.updated").first(),
  ).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  const browserSafeText = `${await page.content()}\n${responseBodies.join("\n")}`;
  expect(browserSafeText).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  expect(browserSafeText).not.toContain(
    "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
  );
  expect(browserSafeText).not.toContain("service-role-key");
});
