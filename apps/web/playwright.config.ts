import { defineConfig, devices } from "@playwright/test";

const testPort = process.env.PALHATCH_E2E_PORT ?? "3000";
if (!/^\d{4,5}$/.test(testPort)) {
  throw new Error("PALHATCH_E2E_PORT must be a four or five digit port");
}
const testBaseUrl = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  timeout: 60_000,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: testBaseUrl,
    trace: "retain-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "iphone",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
  ],
  webServer: {
    command:
      testPort === "3000"
        ? "pnpm dev"
        : `pnpm exec next dev --port ${testPort}`,
    url: `${testBaseUrl}/login`,
    reuseExistingServer: process.env.PALHATCH_E2E_REUSE_SERVER === "1",
    timeout: 120_000,
  },
});
