import { expect, test, type Page } from "@playwright/test"
import { readDatabaseSnapshot, seedMig01Fixture } from "./fixtures/database"

async function readAndAssert(page: Page, title: string, text: string) {
  const record = await page.evaluate(async (expectedTitle) => {
    const rows =
      await window.__WHISDOM_STORAGE_COMPATIBILITY__.listTranscripts()
    return rows.find((row) => row.title === expectedTitle) ?? null
  }, title)
  expect(record).toMatchObject({ title, text })
}

test.describe("Phase 1 migration gates", () => {
  for (const fixture of ["fresh", "v1", "v2"] as const) {
    test(`MIG-01 ${fixture} public adapter and product CRUD survive reopen`, async ({
      page,
    }) => {
      const browserErrors: string[] = []
      page.on("pageerror", (error) =>
        browserErrors.push(`${error.name}: ${error.message}`)
      )
      page.on("console", (message) => {
        if (message.type() === "error") browserErrors.push(message.text())
      })
      await seedMig01Fixture(page, fixture)
      await page.goto("/")
      await expect(
        page.getByTestId("compatibility-product-ready")
      ).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Choose files" })
      ).toBeEnabled()

      if (fixture === "v1" || fixture === "v2") {
        const title =
          fixture === "v2" ? "Sample transcript" : "Legacy transcript"
        await readAndAssert(
          page,
          title,
          fixture === "v2" ? "Hello world." : "Legacy text"
        )
        await page.evaluate(
          async ({ title: oldTitle }) => {
            const row = (
              await window.__WHISDOM_STORAGE_COMPATIBILITY__.listTranscripts()
            ).find((item) => item.title === oldTitle)
            if (!row) throw new Error("MIG-01 source row missing")
            await window.__WHISDOM_STORAGE_COMPATIBILITY__.renameTranscript(
              row.id,
              "MIG-01 renamed"
            )
          },
          { title }
        )
      }

      await page.evaluate(
        async () =>
          await window.__WHISDOM_STORAGE_COMPATIBILITY__.saveTranscript({
            id: "mig01-new",
            title: "MIG-01 new",
            sourceName: "new.wav",
            language: "en",
            modelId: "onnx-community/whisper-base",
            mode: "local-webgpu",
            createdAt: "2026-07-29T12:00:00.000Z",
            updatedAt: "2026-07-29T12:00:00.000Z",
            text: "New transcript",
            segments: [
              { id: "seg-new", start: 0, end: 1.25, text: "New transcript" },
            ],
          })
      )
      await page.reload()
      await readAndAssert(page, "MIG-01 new", "New transcript")
      await page.evaluate(async () => {
        const api = window.__WHISDOM_STORAGE_COMPATIBILITY__
        const row = (await api.listTranscripts()).find(
          (item) => item.title === "MIG-01 new"
        )
        if (!row) throw new Error("MIG-01 new row missing")
        const renamed = await api.renameTranscript(
          row.id,
          "MIG-01 saved and renamed"
        )
        if (!renamed) throw new Error("MIG-01 rename returned no row")
        await api.deleteTranscript(row.id)
      })
      await page.reload()
      await expect(
        page.getByTestId("compatibility-product-ready")
      ).toBeVisible()

      const beforeReopen = await readDatabaseSnapshot(page)
      await page.reload()
      await expect(
        page.getByTestId("compatibility-product-ready")
      ).toBeVisible()
      const after = await readDatabaseSnapshot(page)
      expect(after.version).toBe(fixture === "v2" ? 2 : 1)
      expect(after.stores).toEqual(beforeReopen.stores)
      expect(after.indexes).toEqual(beforeReopen.indexes)
      if (fixture === "v2") {
        expect(
          after.transcripts.find((row) => row.transcriptId === "mig01-new")
        ).toMatchObject({
          revision: 2,
          transcript: null,
          restoredFromDeletionId: null,
        })
        expect(after.pendingOperations).toEqual([])
      } else {
        expect(after.transcripts.some((row) => row.id === "mig01-new")).toBe(
          false
        )
      }
      expect(
        browserErrors.filter((message) => /VersionError/i.test(message))
      ).toEqual([])
    })
  }

  test("MIG-01 unsupported >2 closes, localizes, refuses every public mutation, and preserves schema", async ({
    page,
  }) => {
    const browserErrors: string[] = []
    page.on("pageerror", (error) =>
      browserErrors.push(`${error.name}: ${error.message}`)
    )
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text())
    })
    await seedMig01Fixture(page, "unsupported-v3")
    const before = await readDatabaseSnapshot(page)
    await page.goto("/")
    await expect(
      page.getByRole("heading", { name: "This data version is not supported" })
    ).toBeVisible()
    await page.getByRole("button", { name: "Tiếng Việt" }).click()
    await expect(
      page.getByRole("heading", {
        name: "Phiên bản dữ liệu này không được hỗ trợ",
      })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Choose files" })
    ).toHaveCount(0)
    const inspectDetails = page.getByRole("button", { name: "Xem chi tiết" })
    await expect(inspectDetails).toBeVisible()
    await inspectDetails.click()
    await expect(
      page.getByRole("dialog", {
        name: "Phiên bản dữ liệu này không được hỗ trợ",
      })
    ).toBeVisible()
    await expect(page.getByRole("dialog")).toContainText(
      "storage.unsupported-version"
    )
    const mutation = await page.evaluate(async () => {
      const api = window.__WHISDOM_STORAGE_COMPATIBILITY__
      const calls = [
        () => api.loadSettings(),
        () => api.listTranscripts(),
        () => api.saveSettings({ ...({ sentinel: "attempt" } as never) }),
        () => api.saveTranscript({} as never),
        () => api.renameTranscript("unsupported-sentinel", "attempt"),
        () => api.deleteTranscript("unsupported-sentinel"),
        () => api.clearTranscripts(),
      ]
      const results: string[] = []
      for (const call of calls) {
        try {
          await call()
          results.push("unexpected-success")
        } catch (error) {
          results.push(error instanceof Error ? error.name : String(error))
        }
      }
      return results
    })
    expect(mutation.every((result) => result !== "unexpected-success")).toBe(
      true
    )
    await page.reload()
    expect(await readDatabaseSnapshot(page)).toEqual(before)
    expect(
      browserErrors.filter((message) => /VersionError/i.test(message))
    ).toEqual([])
  })
})
