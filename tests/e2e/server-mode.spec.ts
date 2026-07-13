import { test, expect } from "@playwright/test"

test.describe("server mode", () => {
  test("server mode option is hidden when VITE_SERVER_URL is not set", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Navigate to settings
    const settingsButton = page.getByLabel(/Settings/i)
    if (await settingsButton.isVisible()) {
      await settingsButton.click()
      await page.waitForLoadState("networkidle")
    }

    // Server mode should not appear in the mode selector
    const serverOption = page.getByText("Server (CPU)", { exact: true })
    await expect(serverOption).toHaveCount(0)
  })
})
