// @vitest-environment jsdom
import "fake-indexeddb/auto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { openDB } from "idb"

import * as adapter from "@/features/storage/indexed-db"
import {
  clearTranscripts,
  deleteTranscript,
  listTranscripts,
  loadSettings,
  renameTranscript,
  saveSettings,
  saveTranscript,
  StorageCompatibilityError,
} from "@/features/storage/indexed-db"
import { closeDatabase } from "@/features/storage/database"
import { DEFAULT_SETTINGS } from "@/features/transcription/models"
import type { AppSettings, TranscriptDocument } from "@/features/transcription/types"

const DEVICE_ID = "d_AAAAAAAAAAAAAAAAAAAAAA"
const LEGACY_SETTINGS: AppSettings = {
  uiLanguage: "en", modelId: "onnx-community/whisper-base", language: "auto",
  mode: "local-webgpu", chunkSeconds: 30, overlapSeconds: 1,
  persistMediaBlobs: false, serverModelId: null,
}
const CANONICAL_ROW = {
  schemaVersion: 2, transcriptId: "tr_sample_001", revision: 3,
  updatedAt: 1785283201000, deletedAt: null, deviceId: DEVICE_ID,
  deletionId: null, restoredFromDeletionId: null,
  transcript: {
    title: "Sample transcript", sourceName: "sample.wav", language: "en",
    modelId: "Xenova/whisper-base", mode: "local-webgpu", createdAt: 1785283200000,
    text: "Hello world.",
    segments: [{ id: "seg_001", startMs: 0, endMs: 1250, text: "Hello world." }],
  },
}
const LEGACY_DOCUMENT: TranscriptDocument = {
  id: "tr_legacy_001", title: "Legacy transcript", sourceName: "legacy.wav",
  language: "en", modelId: "onnx-community/whisper-base", mode: "local-webgpu",
  createdAt: "2026-07-29T00:00:00.000Z", updatedAt: "2026-07-29T00:00:01.000Z",
  text: "Legacy text",
  segments: [{ id: "seg-legacy", start: 0, end: 1.25, text: "Legacy text" }],
}

type V2Overrides = { settings?: unknown; deviceId?: unknown; rows?: unknown[]; omitStore?: string; brokenIndex?: boolean }

async function createV1(settings: unknown = LEGACY_SETTINGS, rows: unknown[] = [LEGACY_DOCUMENT]) {
  const db = await openDB("whisdom", 1, {
    upgrade(database) {
      database.createObjectStore("settings")
      database.createObjectStore("transcripts", { keyPath: "id" })
    },
  })
  if (settings !== undefined) await db.put("settings", settings, "settings")
  for (const row of rows) await db.put("transcripts", row)
  db.close()
}

async function createV2(overrides: V2Overrides = {}) {
  const db = await openDB("whisdom", 2, {
    upgrade(database) {
      database.createObjectStore("settings")
      const transcripts = database.createObjectStore("transcripts", { keyPath: "transcriptId" })
      transcripts.createIndex("by-deletedAt", "deletedAt")
      if (!overrides.brokenIndex) transcripts.createIndex("by-updatedAt", "updatedAt")
      const quarantine = database.createObjectStore("migrationQuarantine", { keyPath: "quarantineId" })
      quarantine.createIndex("by-originalV1Key", "originalV1Key")
      quarantine.createIndex("by-reasonCode", "reasonCode")
      database.createObjectStore("drafts", { keyPath: "transcriptId" })
      const conflicts = database.createObjectStore("conflictCandidates", { keyPath: "candidateId" })
      conflicts.createIndex("by-receivedAt", "receivedAt")
      conflicts.createIndex("by-transcriptId", "transcriptId")
      const metadata = database.createObjectStore("syncMetadata", { keyPath: ["accountKey", "transcriptId"] })
      metadata.createIndex("by-accountKey", "accountKey")
      metadata.createIndex("by-transcriptId", "transcriptId")
      const pending = database.createObjectStore("pendingOperations", { keyPath: ["accountKey", "transcriptId"] })
      pending.createIndex("by-accountKey", "accountKey")
      pending.createIndex("by-nextAttemptAt", "nextAttemptAt")
      pending.createIndex("by-transcriptId", "transcriptId")
      database.createObjectStore("syncState", { keyPath: "accountKey" })
      if (overrides.omitStore !== "meta") database.createObjectStore("meta")
    },
  })
  if (overrides.settings !== undefined) await db.put("settings", overrides.settings, "settings")
  if (overrides.omitStore !== "meta") await db.put("meta", overrides.deviceId ?? DEVICE_ID, "deviceId")
  for (const row of overrides.rows ?? [CANONICAL_ROW]) await db.put("transcripts", row)
  db.close()
}

async function snapshot() {
  const db = await openDB("whisdom")
  const stores = Array.from(db.objectStoreNames).sort()
  const entries = await Promise.all(stores.map(async (name) => [name, await db.getAll(name)] as const))
  const result = { version: db.version, stores, data: Object.fromEntries(entries) }
  db.close()
  return result
}

async function readTranscriptRows() {
  const db = await openDB("whisdom")
  const rows = await db.getAll("transcripts")
  db.close()
  return rows as Array<Record<string, unknown>>
}

async function expectRefusal(call: () => Promise<unknown>, code: string) {
  const before = await snapshot()
  await expect(call()).rejects.toMatchObject({ name: "StorageCompatibilityError", code })
  expect(await snapshot()).toEqual(before)
}

afterEach(async () => {
  vi.restoreAllMocks()
  await closeDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("whisdom")
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
})

describe("MIG-01 compatibility adapter", () => {
  it("preserves exact legacy behavior on fresh and v1 databases", async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS)
    expect(await listTranscripts()).toEqual([])

    await saveSettings({ ...LEGACY_SETTINGS, uiLanguage: "vi" })
    expect(await loadSettings()).toEqual({ ...LEGACY_SETTINGS, uiLanguage: "vi" })

    const older: TranscriptDocument = { ...LEGACY_DOCUMENT, id: "tr_older", updatedAt: "2026-07-28T00:00:00.000Z" }
    await saveTranscript(LEGACY_DOCUMENT)
    await saveTranscript(older)
    expect((await listTranscripts()).map((row) => row.id)).toEqual(["tr_legacy_001", "tr_older"])

    const renamed = await renameTranscript(LEGACY_DOCUMENT.id, "Renamed")
    expect(renamed).toMatchObject({ id: LEGACY_DOCUMENT.id, title: "Renamed", text: "Legacy text" })
    expect(await renameTranscript("missing", "None")).toBeNull()

    await deleteTranscript("tr_older")
    expect((await listTranscripts()).map((row) => row.id)).toEqual(["tr_legacy_001"])
    await clearTranscripts()
    expect(await listTranscripts()).toEqual([])
    expect((await snapshot()).version).toBe(1)
  })

  it("preserves exact legacy behavior on a seeded v1 database", async () => {
    await createV1()
    expect(await loadSettings()).toEqual(LEGACY_SETTINGS)
    expect(await listTranscripts()).toEqual([LEGACY_DOCUMENT])

    await saveSettings({ ...LEGACY_SETTINGS, chunkSeconds: 45 })
    const db = await openDB("whisdom")
    expect(await db.get("settings", "settings")).toEqual({ ...LEGACY_SETTINGS, chunkSeconds: 45 })
    db.close()

    await deleteTranscript(LEGACY_DOCUMENT.id)
    expect(await readTranscriptRows()).toEqual([])
    expect((await snapshot()).version).toBe(1)
  })

  it("projects a real v2 row with exact millisecond round-trip", async () => {
    await createV2()
    expect(await listTranscripts()).toEqual([{
      id: "tr_sample_001", title: "Sample transcript", sourceName: "sample.wav", language: "en",
      modelId: "Xenova/whisper-base", mode: "local-webgpu",
      createdAt: "2026-07-29T00:00:00.000Z", updatedAt: "2026-07-29T00:00:01.000Z",
      text: "Hello world.",
      segments: [{ id: "seg_001", start: 0, end: 1.25, text: "Hello world." }],
    }])
  })

  it("increments revision on v2 rename and preserves lineage", async () => {
    await createV2()
    const renamed = await renameTranscript("tr_sample_001", "Renamed transcript")
    expect(renamed).toMatchObject({ id: "tr_sample_001", title: "Renamed transcript", text: "Hello world." })

    const [row] = await readTranscriptRows()
    expect(row).toMatchObject({ revision: 4, deviceId: DEVICE_ID, deletedAt: null, deletionId: null, restoredFromDeletionId: null })
    expect(row.transcript).toMatchObject({ createdAt: 1785283200000, sourceName: "sample.wav", segments: CANONICAL_ROW.transcript.segments })
    expect((row.transcript as { title: string }).title).toBe("Renamed transcript")
  })

  it("creates a v2 live envelope at revision 0 without pending operations", async () => {
    await createV2()
    await saveTranscript({ ...LEGACY_DOCUMENT, id: "tr_new_001" })

    const created = (await readTranscriptRows()).find((row) => row.transcriptId === "tr_new_001")
    expect(created).toMatchObject({
      schemaVersion: 2, revision: 0, deletedAt: null, deletionId: null,
      restoredFromDeletionId: null, deviceId: DEVICE_ID, updatedAt: 1785283201000,
    })
    expect(created!.transcript).toMatchObject({
      title: "Legacy transcript", createdAt: 1785283200000, text: "Legacy text",
      segments: [{ id: "seg-legacy", startMs: 0, endMs: 1250, text: "Legacy text" }],
    })
    expect((await snapshot()).data.pendingOperations).toEqual([])
  })

  it("writes a canonical tombstone on v2 delete and omits it from the list", async () => {
    await createV2()
    await saveTranscript({ ...LEGACY_DOCUMENT, id: "tr_new_001" })
    await deleteTranscript("tr_sample_001")

    const tombstone = (await readTranscriptRows()).find((row) => row.transcriptId === "tr_sample_001")!
    expect(tombstone).toMatchObject({
      revision: 4, transcript: null, restoredFromDeletionId: null, deviceId: DEVICE_ID,
    })
    expect(tombstone.updatedAt).toBe(tombstone.deletedAt)
    expect(tombstone.deletionId).toMatch(/^x_[A-Za-z0-9_-]{22}$/)

    await closeDatabase()
    expect((await listTranscripts()).map((row) => row.id)).toEqual(["tr_new_001"])
    expect((await snapshot()).version).toBe(2)
  })

  it("restores an observed tombstone through explicit lineage", async () => {
    await createV2()
    await deleteTranscript("tr_sample_001")
    const deletionId = (await readTranscriptRows())[0].deletionId
    await saveTranscript({ ...LEGACY_DOCUMENT, id: "tr_sample_001" })

    expect((await readTranscriptRows())[0]).toMatchObject({
      revision: 5, deletedAt: null, deletionId: null, restoredFromDeletionId: deletionId,
    })
  })

  it("clears v2 rows as tombstones and leaves existing tombstones unchanged", async () => {
    await createV2()
    await saveTranscript({ ...LEGACY_DOCUMENT, id: "tr_new_001" })
    await deleteTranscript("tr_new_001")
    const before = (await readTranscriptRows()).find((row) => row.transcriptId === "tr_new_001")

    await clearTranscripts()
    const rows = await readTranscriptRows()
    expect(rows.find((row) => row.transcriptId === "tr_new_001")).toEqual(before)
    expect(rows.find((row) => row.transcriptId === "tr_sample_001")).toMatchObject({ revision: 4, transcript: null })
    expect(await listTranscripts()).toEqual([])
  })

  it.each([
    ["missing meta store", { omitStore: "meta" }, "storage.incomplete-v2"],
    ["missing required index", { brokenIndex: true }, "storage.incomplete-v2"],
    ["malformed device id", { deviceId: "not-a-device" }, "storage.incomplete-v2"],
    ["malformed row", { rows: [{ ...CANONICAL_ROW, revision: -1 }] }, "storage.malformed-v2"],
    ["exhausted revision", { rows: [{ ...CANONICAL_ROW, revision: Number.MAX_SAFE_INTEGER }] }, "storage.revision-exhausted"],
  ] as const)("refuses the complete mutation for %s", async (_label, overrides, code) => {
    await createV2(overrides)
    await expectRefusal(() => renameTranscript("tr_sample_001", "Attempt"), code)
  })

  it("refuses conversion of out-of-range legacy segment times", async () => {
    await createV2()
    await expectRefusal(
      () => saveTranscript({ ...LEGACY_DOCUMENT, id: "tr_new_001", segments: [{ id: "seg", start: 0, end: 604801, text: "Legacy text" }] }),
      "storage.time-conversion",
    )
  })

  it.each([3, 17])("closes and refuses every public call on unsupported version %s", async (version) => {
    const db = await openDB("whisdom", version, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("settings")) database.createObjectStore("settings")
        if (!database.objectStoreNames.contains("transcripts")) database.createObjectStore("transcripts", { keyPath: "id" })
      },
    })
    db.close()

    const before = await snapshot()
    const calls: Array<() => Promise<unknown>> = [
      () => loadSettings(),
      () => listTranscripts(),
      () => saveSettings(LEGACY_SETTINGS),
      () => saveTranscript(LEGACY_DOCUMENT),
      () => renameTranscript(LEGACY_DOCUMENT.id, "Attempt"),
      () => deleteTranscript(LEGACY_DOCUMENT.id),
      () => clearTranscripts(),
    ]
    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({
        name: "StorageCompatibilityError",
        code: "storage.unsupported-version",
        foundVersion: version,
      })
    }
    expect(await snapshot()).toEqual(before)
  })

  it("never requests a numeric database version", async () => {
    const open = vi.spyOn(indexedDB, "open")
    await listTranscripts()
    expect(open).toHaveBeenCalled()
    for (const call of open.mock.calls) expect(call[1]).toBeUndefined()
    expect((await snapshot()).version).toBe(1)
  })

  it("projects both settings key sets and preserves stored explicitModelId", async () => {
    await createV2({ settings: LEGACY_SETTINGS })
    expect(await loadSettings()).toMatchObject({ ...LEGACY_SETTINGS, explicitModelId: null })

    await closeDatabase()
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("whisdom")
      request.onsuccess = () => resolve()
    })
    await createV2({ settings: { ...LEGACY_SETTINGS, explicitModelId: "onnx-community/whisper-small" } })
    expect(await loadSettings()).toMatchObject({ explicitModelId: "onnx-community/whisper-small" })

    await saveSettings({ ...LEGACY_SETTINGS, uiLanguage: "vi", chunkSeconds: 45 })
    const db = await openDB("whisdom")
    const stored = await db.get("settings", "settings")
    db.close()
    expect(stored).toEqual({
      ...LEGACY_SETTINGS, uiLanguage: "vi", chunkSeconds: 45,
      explicitModelId: "onnx-community/whisper-small",
    })
  })

  it.each([
    ["unknown key", { ...LEGACY_SETTINGS, unknown: true }],
    ["missing required key", { ...LEGACY_SETTINGS, mode: undefined }],
    ["empty explicit model", { ...LEGACY_SETTINGS, explicitModelId: "" }],
    ["lone surrogate explicit model", { ...LEGACY_SETTINGS, explicitModelId: "\ud800" }],
  ])("fails closed for %s settings", async (_label, settings) => {
    await createV2({ settings })
    await expect(loadSettings()).rejects.toBeInstanceOf(StorageCompatibilityError)
  })
})

describe("storage compatibility API bootstrap", () => {
  it("installs exactly the seven frozen adapter references", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "__WHISDOM_STORAGE_COMPATIBILITY__")
    try {
      const { STORAGE_COMPATIBILITY_API } = await import("@/features/storage/compatibility-api")
      expect(Object.isFrozen(STORAGE_COMPATIBILITY_API)).toBe(true)
      expect(Object.keys(STORAGE_COMPATIBILITY_API).sort()).toEqual([
        "clearTranscripts", "deleteTranscript", "listTranscripts", "loadSettings",
        "renameTranscript", "saveSettings", "saveTranscript",
      ])
      expect(STORAGE_COMPATIBILITY_API).toEqual({
        loadSettings: adapter.loadSettings,
        saveSettings: adapter.saveSettings,
        saveTranscript: adapter.saveTranscript,
        deleteTranscript: adapter.deleteTranscript,
        clearTranscripts: adapter.clearTranscripts,
        renameTranscript: adapter.renameTranscript,
        listTranscripts: adapter.listTranscripts,
      })
      expect(window.__WHISDOM_STORAGE_COMPATIBILITY__).toBe(STORAGE_COMPATIBILITY_API)
    } finally {
      if (original) Object.defineProperty(globalThis, "__WHISDOM_STORAGE_COMPATIBILITY__", original)
      else Reflect.deleteProperty(globalThis, "__WHISDOM_STORAGE_COMPATIBILITY__")
    }
  })
})
