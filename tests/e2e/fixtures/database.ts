import type { Page } from "@playwright/test"

export type Mig01Fixture = "fresh" | "v1" | "v2" | "unsupported-v3"

declare global {
  interface Window {
    __WHISDOM_STORAGE_COMPATIBILITY__: {
      loadSettings: typeof import("../../../src/features/storage/indexed-db").loadSettings
      saveSettings: typeof import("../../../src/features/storage/indexed-db").saveSettings
      saveTranscript: typeof import("../../../src/features/storage/indexed-db").saveTranscript
      deleteTranscript: typeof import("../../../src/features/storage/indexed-db").deleteTranscript
      clearTranscripts: typeof import("../../../src/features/storage/indexed-db").clearTranscripts
      renameTranscript: typeof import("../../../src/features/storage/indexed-db").renameTranscript
      listTranscripts: typeof import("../../../src/features/storage/indexed-db").listTranscripts
    }
  }
}

const LEGACY_SETTINGS = {
  uiLanguage: "en", modelId: "onnx-community/whisper-base", language: "auto",
  mode: "local-webgpu", chunkSeconds: 30, overlapSeconds: 1,
  persistMediaBlobs: false, serverModelId: null,
}

const LATER_V2_SETTINGS = { ...LEGACY_SETTINGS, explicitModelId: null }

const LEGACY_ROWS = [
  {
    id: "tr_legacy_001", title: "Legacy transcript", sourceName: "legacy.wav",
    language: "en", modelId: "onnx-community/whisper-base", mode: "local-webgpu",
    createdAt: "2026-07-29T00:00:00.000Z", updatedAt: "2026-07-29T00:00:01.000Z",
    text: "Legacy text",
    segments: [{ id: "seg_legacy_001", start: 0, end: 1.25, text: "Legacy text" }],
  },
]

const V2_ROWS = [
  {
    schemaVersion: 2, transcriptId: "tr_sample_001", revision: 3,
    updatedAt: 1785283201000, deletedAt: null,
    deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA", deletionId: null, restoredFromDeletionId: null,
    transcript: {
      title: "Sample transcript", sourceName: "sample.wav", language: "en",
      modelId: "Xenova/whisper-base", mode: "local-webgpu", createdAt: 1785283200000,
      text: "Hello world.",
      segments: [{ id: "seg_001", startMs: 0, endMs: 1250, text: "Hello world." }],
    },
  },
  {
    schemaVersion: 2, transcriptId: "tr_survivor_002", revision: 0,
    updatedAt: 1785283101000, deletedAt: null,
    deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA", deletionId: null, restoredFromDeletionId: null,
    transcript: {
      title: "Canonical survivor", sourceName: "survivor.wav", language: "en",
      modelId: "Xenova/whisper-base", mode: "local-webgpu", createdAt: 1785283100000,
      text: "Canonical survivor text.",
      segments: [{ id: "seg_002", startMs: 0, endMs: 1000, text: "Canonical survivor text." }],
    },
  },
]

export interface BrowserDatabaseSnapshot {
  version: number
  stores: string[]
  indexes: Record<string, string[]>
  settings: unknown
  transcripts: Array<Record<string, unknown>>
  pendingOperations: Array<Record<string, unknown>>
}

export async function seedMig01Fixture(page: Page, fixture: Mig01Fixture) {
  await page.goto("/vite.svg")
  await page.evaluate(async ({ fixture, legacySettings, laterSettings, legacyRows, v2Rows }) => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase("whisdom")
      deletion.onsuccess = () => resolve()
      deletion.onerror = () => reject(deletion.error)
      deletion.onblocked = () => reject(new Error("fixture database deletion blocked"))
    })
    if (fixture === "fresh") return
    const targetVersion = fixture === "v1" ? 1 : fixture === "v2" ? 2 : 3
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("whisdom", targetVersion)
      request.onupgradeneeded = () => {
        const db = request.result
        const transaction = request.transaction!
        if (fixture === "v1" || fixture === "unsupported-v3") {
          const settingsStore = db.createObjectStore("settings")
          const transcriptStore = db.createObjectStore("transcripts", { keyPath: "id" })
          settingsStore.put(fixture === "unsupported-v3" ? { sentinel: "settings-v3" } : legacySettings, "settings")
          for (const row of fixture === "unsupported-v3" ? [{ ...legacyRows[0], id: "unsupported-sentinel", title: "Do not mutate" }] : legacyRows) transcriptStore.put(row)
          return
        }
        const settingsStore = db.createObjectStore("settings")
        const transcripts = db.createObjectStore("transcripts", { keyPath: "transcriptId" })
        transcripts.createIndex("by-deletedAt", "deletedAt")
        transcripts.createIndex("by-updatedAt", "updatedAt")
        const quarantine = db.createObjectStore("migrationQuarantine", { keyPath: "quarantineId" })
        quarantine.createIndex("by-originalV1Key", "originalV1Key")
        quarantine.createIndex("by-reasonCode", "reasonCode")
        db.createObjectStore("drafts", { keyPath: "transcriptId" })
        const conflicts = db.createObjectStore("conflictCandidates", { keyPath: "candidateId" })
        conflicts.createIndex("by-receivedAt", "receivedAt")
        conflicts.createIndex("by-transcriptId", "transcriptId")
        const metadata = db.createObjectStore("syncMetadata", { keyPath: ["accountKey", "transcriptId"] })
        metadata.createIndex("by-accountKey", "accountKey")
        metadata.createIndex("by-transcriptId", "transcriptId")
        const pending = db.createObjectStore("pendingOperations", { keyPath: ["accountKey", "transcriptId"] })
        pending.createIndex("by-accountKey", "accountKey")
        pending.createIndex("by-nextAttemptAt", "nextAttemptAt")
        pending.createIndex("by-transcriptId", "transcriptId")
        db.createObjectStore("syncState", { keyPath: "accountKey" })
        const meta = db.createObjectStore("meta")
        settingsStore.put(laterSettings, "settings")
        meta.put("d_AAAAAAAAAAAAAAAAAAAAAA", "deviceId")
        for (const row of v2Rows) transcripts.put(row)
        void transaction
      }
      request.onsuccess = () => { request.result.close(); resolve() }
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error("fixture database open blocked"))
    })
  }, { fixture, legacySettings: LEGACY_SETTINGS, laterSettings: LATER_V2_SETTINGS, legacyRows: LEGACY_ROWS, v2Rows: V2_ROWS })
}

export async function readDatabaseSnapshot(page: Page): Promise<BrowserDatabaseSnapshot> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("whisdom")
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const stores = Array.from(db.objectStoreNames).sort()
      const transaction = db.transaction(stores, "readonly")
      const indexes = Object.fromEntries(stores.map((name) => [name, Array.from(transaction.objectStore(name).indexNames).sort()]))
      const readAll = (name: string) => stores.includes(name)
        ? new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
            const request = transaction.objectStore(name).getAll()
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })
        : Promise.resolve([])
      const readSettings = stores.includes("settings")
        ? new Promise<unknown>((resolve, reject) => {
            const request = transaction.objectStore("settings").get("settings")
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })
        : Promise.resolve(undefined)
      const [settings, transcripts, pendingOperations] = await Promise.all([
        readSettings, readAll("transcripts"), readAll("pendingOperations"),
      ])
      return { version: db.version, stores, indexes, settings, transcripts, pendingOperations }
    } finally {
      db.close()
    }
  })
}
