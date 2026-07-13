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

async function chooseNamedAudio(page: Page, name: string) {
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "audio/wav",
    buffer: createSilentWav(1),
  })
}

async function chooseAudioFiles(page: Page) {
  await page.locator('input[type="file"]').setInputFiles([
    {
      name: "first.wav",
      mimeType: "audio/wav",
      buffer: createSilentWav(1),
    },
    {
      name: "second.wav",
      mimeType: "audio/wav",
      buffer: createSilentWav(1),
    },
  ])
}

async function searchLanguage(page: Page, query: string, option: string | RegExp) {
  await page.getByLabel("Language", { exact: true }).click()
  await page.getByRole("searchbox", { name: "Search language" }).fill(query)
  await page.getByRole("option", { name: option }).click()
}

async function seedRecentTranscript(page: Page) {
  await page.evaluate(async () => {
    const request = indexedDB.open("whisdom", 1)

    await new Promise<void>((resolve, reject) => {
      request.onupgradeneeded = () => {
        const db = request.result

        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings")
        }

        if (!db.objectStoreNames.contains("transcripts")) {
          db.createObjectStore("transcripts", { keyPath: "id" })
        }
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const transaction = db.transaction("transcripts", "readwrite")

        transaction.objectStore("transcripts").put({
          id: "history-1",
          title: "Research call",
          sourceName: "research-call.mp3",
          language: "ko",
          modelId: "onnx-community/whisper-large-v3-turbo",
          mode: "local-webgpu",
          createdAt: "2026-06-11T10:15:30.456Z",
          updatedAt: "2026-06-11T10:15:30.456Z",
          text: "Seeded transcript",
          segments: [],
        })
        transaction.oncomplete = () => {
          db.close()
          resolve()
        }
        transaction.onerror = () => reject(transaction.error)
      }
    })
  })
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
    await page.getByRole("button", { name: /Detailed log/ }).click()
    await expect(page.getByText("Reading media metadata")).toBeVisible()
    await expect(page.getByText("Review downloads and processing plan").last()).toBeVisible()
    await expect(page.getByRole("button", { name: /Confirm downloads and transcribe/i })).toBeEnabled()
  })

  test("queues multiple files and switches selected preflight", async ({ page }) => {
    await chooseAudioFiles(page)

    await expect(page.getByRole("heading", { name: "2 files selected" })).toBeVisible()
    await expect(page.getByText("Selected: first.wav")).toBeVisible()
    await expect(page.getByText("File queue")).toBeVisible()
    await expect(page.getByRole("button", { name: "Select file: first.wav" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Select file: second.wav" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Transcribe all 2 files" })).toBeEnabled()

    await page.getByRole("button", { name: "Select file: second.wav" }).click()

    await expect(page.getByText("Selected: second.wav")).toBeVisible()
    await expect(page.getByText("Review downloads and processing plan")).toBeVisible()
    await expect(page.getByRole("button", { name: "Transcribe selected file" })).toBeEnabled()
  })

  test("appends files picked in separate selections", async ({ page }) => {
    await chooseNamedAudio(page, "first.wav")
    await expect(page.getByRole("heading", { name: "first.wav" })).toBeVisible()

    await chooseNamedAudio(page, "second.wav")

    await expect(page.getByRole("heading", { name: "2 files selected" })).toBeVisible()
    await expect(page.getByText("Selected: first.wav")).toBeVisible()
    await expect(page.getByRole("button", { name: "Select file: first.wav" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Select file: second.wav" })).toBeVisible()

    await page.getByRole("button", { name: "Remove file: first.wav" }).click()

    await expect(page.getByRole("heading", { name: "second.wav" })).toBeVisible()
    await expect(page.getByText("2 files selected")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Select file: first.wav" })).toHaveCount(0)
  })

  test("updates preflight model after settings change", async ({ page }) => {
    await chooseAudio(page)
    await expect(page.getByText("Whisper Base").nth(1)).toBeVisible()

    await page.getByLabel("Model").click()
    await page.getByRole("option", { name: "Whisper Tiny", exact: true }).click()

    await expect(page.getByText("Whisper Tiny").nth(1)).toBeVisible()
  })

  test("uses q4 guidance and blocks large models without WebGPU", async ({ page }) => {
    await page.getByLabel("Model").click()
    await page.getByRole("option", { name: "Whisper Large v3", exact: true }).click()

    await expect(page.getByText("q4 browser weights")).toBeVisible()

    await chooseAudio(page)
    await expect(page.getByText("Large local models use q4 ONNX weights")).toBeVisible()
    await page.getByRole("button", { name: /Confirm downloads and transcribe/i }).click()

    await expect(page.getByText("requires WebGPU in the browser")).toBeVisible()
  })

  test("searches and selects many transcription languages on the main page", async ({ page }) => {
    await searchLanguage(page, "korean", /Korean/)

    await expect(page.getByLabel("Language", { exact: true })).toContainText("Korean")

    await chooseAudio(page)
    await expect(page.getByText("Selected model is English-only")).toHaveCount(0)
  })

  test("switches website copy to Vietnamese", async ({ page }) => {
    await page.getByRole("button", { name: "Account menu" }).click()
    await page.getByRole("button", { name: "VI" }).click()

    await expect(page.getByRole("button", { name: "VI" })).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByRole("menuitem", { name: "Cài đặt" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("heading", { name: "Thả âm thanh hoặc video" })).toBeVisible()
  })

  test("settings page fits mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/")
    await page.getByRole("button", { name: "Account menu" }).click()
    await page.getByRole("button", { name: "VI" }).click()
    await page.getByRole("menuitem", { name: "Cài đặt" }).click()

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

  test("shows auth prompt when manual server mode is selected without sign-in", async ({ page }) => {
    await openSettings(page)
    await page.getByLabel("Mode", { exact: true }).click()
    await page.getByRole("option", { name: "Manual server" }).click()
    await page.getByRole("button", { name: "Back to home" }).click()
    await chooseAudio(page)
    await page.getByRole("button", { name: /Confirm downloads and transcribe/i }).click()

    await expect(page.locator(".text-destructive").getByText(/Server transcription requires Google sign-in/i)).toBeVisible()
  })

  test("shows recent transcript metadata and removes items", async ({ page }) => {
    await seedRecentTranscript(page)
    await page.reload()

    await expect(page.getByText("Research call")).toBeVisible()
    await expect(page.getByText("Whisper Large v3 Turbo")).toBeVisible()
    await expect(page.getByText("Korean / 한국어")).toBeVisible()

    await page.getByRole("button", { name: "Open transcript: Research call" }).click()
    await expect(page.getByRole("dialog", { name: "Research call" })).toBeVisible()
    await expect(page.getByText("Raw text")).toBeVisible()
    await expect(page.getByText("Text with timestamps")).toBeVisible()
    await expect(page.getByText("Download files")).toBeVisible()
    await expect(page.locator("textarea")).toHaveValue("Seeded transcript")
    await page.getByLabel("Rename transcript").fill("Renamed call")
    await page.getByRole("button", { name: "Save name" }).click()
    await expect(page.getByRole("dialog", { name: "Renamed call" })).toBeVisible()
    await page.getByRole("button", { name: "Close results" }).click()

    await expect(page.getByRole("button", { name: "Open transcript: Renamed call" })).toBeVisible()
    await expect(page.getByText("Research call")).toHaveCount(0)

    await page.getByRole("button", { name: "Remove transcript: Renamed call" }).click()

    await expect(page.getByText("Renamed call")).toHaveCount(0)
    await expect(page.getByText("No transcripts saved yet.")).toBeVisible()
  })

  test("clears saved transcripts from settings", async ({ page }) => {
    await seedRecentTranscript(page)
    await page.reload()

    await expect(page.getByText("Research call")).toBeVisible()
    await openSettings(page)
    await page.getByRole("button", { name: "Clear saved transcripts" }).click()

    await expect(page.getByText("Saved transcripts were deleted.")).toBeVisible()
    await page.getByRole("button", { name: "Back to home" }).click()
    await expect(page.getByText("No transcripts saved yet.")).toBeVisible()
    await expect(page.getByText("Research call")).toHaveCount(0)
  })

  test("clears downloaded model caches from settings", async ({ page }) => {
    await page.evaluate(async () => {
      const cache = await caches.open("whisdom-transformers-models-v1")
      await cache.put("https://example.test/model.onnx", new Response("model"))
    })

    await openSettings(page)
    await page.getByRole("button", { name: "Clear downloaded models" }).click()

    await expect(page.getByText("1 model cache cleared.")).toBeVisible()
    await expect.poll(() => page.evaluate(() => caches.has("whisdom-transformers-models-v1"))).toBe(false)
  })

})
