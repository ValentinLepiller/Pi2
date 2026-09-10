import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "*.e2e.ts",
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: "list",
  use: { trace: "retain-on-failure", actionTimeout: 15000 },
  webServer: {
    command: "bun scripts/fixture.ts",
    url: "http://127.0.0.1:4319",
    reuseExistingServer: false,
  },
});
