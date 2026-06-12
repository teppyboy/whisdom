import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"

import { expect, test, type Page } from "@playwright/test"

type Fixture = {
  name: string
  mimeType: string
  buffer: Buffer
}

const realAsrEnabled = process.env.WHISDOM_REAL_ASR === "1"
const realWebGpuEnabled = process.env.WHISDOM_REAL_WEBGPU === "1"
const vietnameseExpectedPattern = /mat.*troi|bong.*dai|canh.*dong/i

async function getFixture(args: {
  envPath?: string
  name: string
  url: string
  mimeType: string
}): Promise<Fixture> {
  if (args.envPath) {
    if (!existsSync(args.envPath)) {
      throw new Error(`Audio fixture not found: ${args.envPath}`)
    }

    return {
      name: args.name,
      mimeType: args.mimeType,
      buffer: await readFile(args.envPath),
    }
  }

  const response = await fetch(args.url)

  if (!response.ok) {
    throw new Error(`Failed to download ${args.url}: ${response.status} ${response.statusText}`)
  }

  return {
    name: args.name,
    mimeType: args.mimeType,
    buffer: Buffer.from(await response.arrayBuffer()),
  }
}

function normalizeTranscript(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click()
  await page.getByRole("menuitem", { name: "Settings" }).click()
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
}

async function selectOption(page: Page, label: string | RegExp, option: string | RegExp) {
  await page.getByLabel(label, { exact: typeof label === "string" }).click()
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).click()
}

async function selectLanguage(page: Page, query: string, option: string | RegExp) {
  await page.getByLabel("Language", { exact: true }).click()
  await page.getByRole("searchbox", { name: "Search language" }).fill(query)
  await page.getByRole("option", { name: option }).click()
}

async function transcribeFixture(page: Page, fixture: Fixture) {
  const backButton = page.getByRole("button", { name: "Back to home" })

  if (await backButton.isVisible().catch(() => false)) {
    await backButton.click()
  }

  await page.locator('input[type="file"]').setInputFiles({
    name: fixture.name,
    mimeType: fixture.mimeType,
    buffer: fixture.buffer,
  })
  await page.getByRole("button", { name: /Confirm downloads and transcribe/i }).click()
  await expect(page.getByText("Transcript ready")).toBeVisible({ timeout: 300_000 })
  await expect(page.getByText("Text with timestamps")).toBeVisible()
  await expect(page.getByText(/0:00 -/).first()).toBeVisible()
  return page.locator("textarea").inputValue({ timeout: 10_000 })
}

async function transcribeVietnameseFixture(page: Page, mode: "Local WASM" | "Local WebGPU") {
  const fixture = await getFixture({
    envPath: process.env.WHISDOM_VI_AUDIO,
    name: "vi-VN-HoaiMyNeural.mp3",
    url: "https://raw.githubusercontent.com/yaph/tts-samples/main/mp3/Vietnamese/vi-VN-HoaiMyNeural.mp3",
    mimeType: "audio/mpeg",
  })

  await page.goto("/")
  await openSettings(page)
  await selectOption(page, "Mode", mode)
  await page.getByRole("button", { name: "Back to home" }).click()
  await selectOption(page, "Model", "Whisper Tiny")
  await selectLanguage(page, "vietnamese", /Vietnamese/)

  return normalizeTranscript(await transcribeFixture(page, fixture))
}

test.describe("real local transcription", () => {
  test.skip(!realAsrEnabled, "Set WHISDOM_REAL_ASR=1 to run real browser Whisper tests.")

  test("transcribes English sample speech with Whisper Tiny English", async ({ page }) => {
    test.setTimeout(360_000)
    const fixture = await getFixture({
      envPath: process.env.WHISDOM_EN_AUDIO,
      name: "en-US-JennyNeural.mp3",
      url: "https://raw.githubusercontent.com/yaph/tts-samples/main/mp3/English/en-US-JennyNeural.mp3",
      mimeType: "audio/mpeg",
    })

    await page.goto("/")
    await openSettings(page)
    await selectOption(page, "Mode", "Local WASM")
    await page.getByRole("button", { name: "Back to home" }).click()
    await selectOption(page, "Model", /Tiny English/i)

    const transcript = normalizeTranscript(await transcribeFixture(page, fixture))
    expect(transcript).toContain("sun")
    expect(transcript).toMatch(/setting|shadows|field/)
  })

  test("transcribes Vietnamese sample speech with multilingual Whisper Tiny", async ({ page }) => {
    test.setTimeout(420_000)
    const transcript = await transcribeVietnameseFixture(page, "Local WASM")
    const expectedPattern = process.env.WHISDOM_VI_EXPECTED
      ? new RegExp(process.env.WHISDOM_VI_EXPECTED, "i")
      : vietnameseExpectedPattern

    expect(transcript).toMatch(expectedPattern)
    expect(transcript.trim()).not.toHaveLength(1)
  })

  test("transcribes Vietnamese sample speech with WebGPU when enabled", async ({ page }) => {
    test.skip(!realWebGpuEnabled, "Set WHISDOM_REAL_WEBGPU=1 to run real browser WebGPU ASR.")
    test.setTimeout(420_000)
    const transcript = await transcribeVietnameseFixture(page, "Local WebGPU")

    expect(transcript).toMatch(vietnameseExpectedPattern)
    expect(transcript.trim()).not.toHaveLength(1)
  })
})
