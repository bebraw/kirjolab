import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["src/**/*.e2e.ts"],
  testIgnore: ["**/.stryker-tmp/**"],
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8788",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1600, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run e2e:server",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: "http://127.0.0.1:8788",
    },
    {
      command: "KIRJOLAB_E2E_PORT=8789 KIRJOLAB_E2E_INSPECTOR_PORT=9231 KIRJOLAB_E2E_GITHUB=disabled npm run e2e:server",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: "http://127.0.0.1:8789",
    },
  ],
});
