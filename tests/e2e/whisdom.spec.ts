import { expect, test, type Page } from "@playwright/test"

function createSilentWav(seconds: number) {
  const sampleRate = 16_000
  const sampleCount = sampleRate * seconds
  const dataSize = sampleCount * 2
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write("RIFF", 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write("WAVE", 8)
  buffer.write("fmt ", 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write("data", 36)
  buffer.writeUInt32LE(dataSize, 40)

  return buffer
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click()
  await page.getByRole("menuitem", { name: "Settings" }).click()
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
}

async function chooseAudio(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "sample.wav",
    mimeType: "audio/wav",
    buffer: createSilentWav(1),
  })
}

async function searchLanguage(page: Page, query: string, option: string | RegExp) {
  await page.getByLabel("Language", { exact: true }).click()
  await page.getByRole("searchbox", { name: "Search language" }).fill(query)
  await page.getByRole("option", { name: option }).click()
}

test.describe("Whisdom", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
  })

  test("renders app shell and default settings", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Whisdom" })).toBeVisible()
    await expect(page.getByText("Transcription setup")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Drop audio or video" })).toBeVisible()
    await expect(page.getByLabel("Model")).toContainText("Whisper Base")
    await expect(page.getByLabel("Language", { exact: true })).toContainText("Auto")

    await openSettings(page)
    await expect(page.getByLabel("Mode", { exact: true })).toContainText("Local WebGPU")
  })

  test("analyzes selected audio before transcription", async ({ page }) => {
    await chooseAudio(page)

    await expect(page.getByRole("heading", { name: "sample.wav" })).toBeVisible()
    await expect(page.getByText("Review downloads and processing plan")).toBeVisible()
    await expect(page.getByText("Whisper Base").nth(1)).toBeVisible()
    await expect(page.getByText("Resume after tab close will require re-picking the original file.")).toBeVisible()
    await expect(page.getByRole("button", { name: /Confirm downloads and transcribe/i })).toBeEnabled()
  })

  test("updates preflight model after settings change", async ({ page }) => {
    await chooseAudio(page)
    await expect(page.getByText("Whisper Base").nth(1)).toBeVisible()

    await page.getByLabel("Model").click()
    await page.getByRole("option", { name: "Whisper Tiny", exact: true }).click()

    await expect(page.getByText("Whisper Tiny").nth(1)).toBeVisible()
  })

  test("searches and selects many transcription languages on the main page", async ({ page }) => {
    await searchLanguage(page, "korean", /Korean/)

    await expect(page.getByLabel("Language", { exact: true })).toContainText("Korean")

    await chooseAudio(page)
    await expect(page.getByText("Selected model is English-only")).toHaveCount(0)
  })

  test("switches website copy to Vietnamese", async ({ page }) => {
    await openSettings(page)
    await page.getByLabel("Interface language").click()
    await page.getByRole("option", { name: "Tiếng Việt" }).click()

    await expect(page.getByRole("heading", { name: "Cài đặt" })).toBeVisible()
    await expect(page.getByText("Ngôn ngữ giao diện", { exact: true })).toBeVisible()

    await page.getByRole("button", { name: "Quay lại trang chính" }).click()
    await expect(page.getByRole("heading", { name: "Thả âm thanh hoặc video" })).toBeVisible()
    await page.getByRole("button", { name: "Menu tài khoản" }).click()
    await expect(page.getByRole("menuitem", { name: "Cài đặt" })).toBeVisible()
  })

  test("settings page fits mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/")
    await openSettings(page)
    await page.getByLabel("Interface language").click()
    await page.getByRole("option", { name: "Tiếng Việt" }).click()

    await expect(page.getByRole("heading", { name: "Cài đặt" })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

    const overflowingControls = await page
      .locator('[data-slot="select-trigger"], input[type="number"]')
      .evaluateAll((controls) =>
        controls.filter((control) => {
          const rect = control.getBoundingClientRect()
          return rect.left < 0 || rect.right > window.innerWidth
        }).length
      )

    expect(overflowingControls).toBe(0)
  })

  test("shows guardrail when manual server mode is selected", async ({ page }) => {
    await openSettings(page)
    await page.getByLabel("Mode", { exact: true }).click()
    await page.getByRole("option", { name: "Manual server" }).click()
    await page.getByRole("button", { name: "Back to home" }).click()
    await chooseAudio(page)
    await page.getByRole("button", { name: /Confirm downloads and transcribe/i }).click()

    await expect(page.getByText("Server mode is manual opt-in but chunk upload is not enabled yet.")).toBeVisible()
  })

})
