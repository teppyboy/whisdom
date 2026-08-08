import { defineConfig, devices } from "@playwright/test"

const deployedBaseUrl = process.env.WHISDOM_E2E_BASE_URL?.trim()

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: deployedBaseUrl || "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: deployedBaseUrl ? undefined : {
    command: "pnpm build && pnpm preview --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
