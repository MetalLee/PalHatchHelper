import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { expect, test, type Page } from "@playwright/test";

const executeFile = promisify(execFile);
const fixturePassword = "palhatch-local-fixture";
const agentDirectory = resolve(process.cwd(), "../agent");

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill("player-a@palhatch.fixture.invalid");
  await page.getByLabel("密码").fill(fixturePassword);
  await page.getByRole("button", { name: "登录工作台" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

async function runOneWorker(): Promise<void> {
  const supabaseUrl = process.env.PALHATCH_E2E_SUPABASE_URL;
  const serviceRole = process.env.PALHATCH_E2E_SERVICE_ROLE_KEY;
  const dataDirectory = process.env.PALHATCH_E2E_AGENT_DATA_DIR;
  if (!supabaseUrl || !serviceRole || !dataDirectory) {
    throw new Error(
      "Phase 6 E2E requires local Agent credentials from the test runner",
    );
  }
  await executeFile(
    process.env.PALHATCH_E2E_UV_BIN ?? "uv",
    ["run", "pal-hatch-helper", "job-worker", "--once"],
    {
      cwd: agentDirectory,
      env: {
        ...process.env,
        APP_ENV: "test",
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: serviceRole,
        PALHATCH_DATA_DIR: dataDirectory,
        AI_CODEX_CLI_ENABLED: "false",
      },
      timeout: 45_000,
      maxBuffer: 1_000_000,
    },
  );
}

test("iPhone breeder creates, resumes, processes and compares fixed deterministic routes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await login(page);
  await page.getByRole("link", { name: "配种器" }).last().click();
  await expect(page.getByRole("heading", { name: "配种器" })).toBeVisible();
  await page.waitForFunction(
    () => {
      const button = [...document.querySelectorAll("button")].find(
        (element) => element.textContent?.trim() === "创建配种任务",
      );
      return (
        button !== undefined &&
        Object.keys(button).some((key) => key.startsWith("__reactProps$"))
      );
    },
    undefined,
    { timeout: 30_000 },
  );

  await page
    .getByRole("combobox", {
      name: "目标 Pal（名称、编号或 Stable ID）",
    })
    .click();
  const targetSearch = page.getByRole("combobox", {
    name: "搜索目标 Pal",
  });
  await targetSearch.fill("幻色幼崽");
  await targetSearch.press("ArrowDown");
  await targetSearch.press("Enter");
  await page.getByRole("button", { name: /选择认真/ }).click();
  await page.getByRole("radio", { name: "综合推荐" }).check();
  await page.getByLabel("最大代数").fill("5");
  const createButton = page.getByRole("button", { name: "创建配种任务" });
  await expect(createButton).toBeEnabled();
  await createButton.click();
  await expect(page).toHaveURL(/\/breeder\/jobs\/[0-9a-f-]{36}$/, {
    timeout: 30_000,
  });
  await expect(page.getByTestId("job-stage")).toContainText("pending");

  const jobId = page.url().split("/").at(-1);
  expect(jobId).toMatch(/^[0-9a-f-]{36}$/);
  await page.reload();
  await expect(page.getByTestId("job-stage")).toContainText("pending");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await runOneWorker();
    const response = await page.request.get(`/api/breeder/jobs/${jobId}`);
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as {
      data?: { status?: string };
    };
    if (payload.data?.status === "completed") break;
  }

  await page.reload();
  await expect(page.getByTestId("job-stage")).toContainText("completed");
  const routeTabs = page.getByRole("button", { name: /^可执行路线 \d+$/ });
  const routeCount = await routeTabs.count();
  expect(routeCount).toBeGreaterThan(0);
  expect(routeCount).toBeLessThanOrEqual(3);
  await routeTabs.first().click();
  await expect(page.getByText("完整评分明细")).toBeVisible();
  await expect(page.getByText("解释已降级")).toBeVisible();
  await expect(
    page.getByText("inventory-trait-aware-deterministic-v4"),
  ).toBeVisible();

  const response = await page.request.get(`/api/breeder/jobs/${jobId}`);
  const responseText = await response.text();
  expect(responseText).not.toContain("requester_user_id");
  expect(responseText).not.toContain("owner_player_id");
  expect(responseText).not.toContain("guild_id");
  expect(responseText).not.toContain("/opt/palworld");

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});
