import "fake-indexeddb/auto"
import { openDB, type IDBPDatabase } from "idb"
import { afterEach, describe, expect, it } from "vitest"

import {
  compatibilityMsToLegacySeconds,
  inspectVersion2Schema,
  legacySecondsToCompatibilityMs,
  parseCompatibilityDeletionId,
  parseCompatibilityDeviceId,
  parseCompatibilityEpochMs,
  parseCompatibilityLegacyIso,
  parseCompatibilitySettings,
  parseRollbackV2Envelope,
  parseRollbackV2Payload,
  parseRollbackV2Segment,
  projectRollbackEnvelope,
  type CompatibilityResult,
  type RollbackV2Envelope,
  type Version2SchemaDescription,
} from "@/features/storage/compatibility"
import { DEFAULT_SETTINGS } from "@/features/transcription/models"

async function createV2(extraStore = false): Promise<IDBPDatabase> {
  return openDB(`compat-${extraStore ? "extra" : "exact"}`, 2, {
    upgrade(db, oldVersion, newVersion, transaction) {
      void oldVersion
      void newVersion
      void transaction
      const settings = db.createObjectStore("settings")
      const transcripts = db.createObjectStore("transcripts", {
        keyPath: "transcriptId",
      })
      transcripts.createIndex("by-deletedAt", "deletedAt")
      transcripts.createIndex("by-updatedAt", "updatedAt")
      const quarantine = db.createObjectStore("migrationQuarantine", {
        keyPath: "quarantineId",
      })
      quarantine.createIndex("by-originalV1Key", "originalV1Key")
      quarantine.createIndex("by-reasonCode", "reasonCode")
      db.createObjectStore("drafts", { keyPath: "transcriptId" })
      const conflicts = db.createObjectStore("conflictCandidates", {
        keyPath: "candidateId",
      })
      conflicts.createIndex("by-receivedAt", "receivedAt")
      conflicts.createIndex("by-transcriptId", "transcriptId")
      const metadata = db.createObjectStore("syncMetadata", {
        keyPath: ["accountKey", "transcriptId"],
      })
      metadata.createIndex("by-accountKey", "accountKey")
      metadata.createIndex("by-transcriptId", "transcriptId")
      const pending = db.createObjectStore("pendingOperations", {
        keyPath: ["accountKey", "transcriptId"],
      })
      pending.createIndex("by-accountKey", "accountKey")
      pending.createIndex("by-nextAttemptAt", "nextAttemptAt")
      pending.createIndex("by-transcriptId", "transcriptId")
      db.createObjectStore("syncState", { keyPath: "accountKey" })
      const meta = db.createObjectStore("meta")
      settings.put(DEFAULT_SETTINGS, "settings")
      meta.put("d_AAAAAAAAAAAAAAAAAAAAAA", "deviceId")
      if (extraStore) db.createObjectStore("unexpected")
    },
  })
}

afterEach(async () => {
  for (const name of ["compat-exact", "compat-extra"]) {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })
  }
})

describe("COMPAT-01 schema and scalar boundary", () => {
  it("describes the exact nine-store v2 schema without mutation", async () => {
    const db = await createV2()
    const result = await inspectVersion2Schema(db)
    expect(result).toEqual({
      ok: true,
      value: {
        stores: [
          "conflictCandidates",
          "drafts",
          "meta",
          "migrationQuarantine",
          "pendingOperations",
          "settings",
          "syncMetadata",
          "syncState",
          "transcripts",
        ],
        keyPaths: {
          settings: null,
          transcripts: "transcriptId",
          migrationQuarantine: "quarantineId",
          drafts: "transcriptId",
          conflictCandidates: "candidateId",
          syncMetadata: ["accountKey", "transcriptId"],
          pendingOperations: ["accountKey", "transcriptId"],
          syncState: "accountKey",
          meta: null,
        },
        indexes: {
          transcripts: ["by-deletedAt", "by-updatedAt"],
          migrationQuarantine: ["by-originalV1Key", "by-reasonCode"],
          conflictCandidates: ["by-receivedAt", "by-transcriptId"],
          syncMetadata: ["by-accountKey", "by-transcriptId"],
          pendingOperations: [
            "by-accountKey",
            "by-nextAttemptAt",
            "by-transcriptId",
          ],
          drafts: [],
          settings: [],
          syncState: [],
          meta: [],
        },
        deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA",
      },
    })
    expect(Array.from(db.objectStoreNames)).toHaveLength(9)
    db.close()
  })

  it("rejects an extra store as invalid schema", async () => {
    const db = await createV2(true)
    await expect(inspectVersion2Schema(db)).resolves.toEqual({
      ok: false,
      error: "compatibility.invalid-schema",
      path: "$.stores",
    })
    db.close()
  })

  it("accepts only canonical 16-byte identifiers", () => {
    expect(parseCompatibilityDeviceId("d_AAAAAAAAAAAAAAAAAAAAAA")).toEqual({
      ok: true,
      value: "d_AAAAAAAAAAAAAAAAAAAAAA",
    })
    expect(parseCompatibilityDeletionId("x_AAAAAAAAAAAAAAAAAAAAAA")).toEqual({
      ok: true,
      value: "x_AAAAAAAAAAAAAAAAAAAAAA",
    })
    expect(
      parseCompatibilityDeviceId("d_AAAAAAAAAAAAAAAAAAAAA=")
    ).toMatchObject({ ok: false, error: "compatibility.invalid-scalar" })
    expect(parseCompatibilityDeletionId(null)).toMatchObject({
      ok: false,
      error: "compatibility.invalid-shape",
    })
  })

  it("checks epoch and legacy ISO bounds and round trips", () => {
    expect(parseCompatibilityEpochMs(946684800000)).toEqual({
      ok: true,
      value: 946684800000,
    })
    expect(parseCompatibilityEpochMs(4102444800000)).toEqual({
      ok: true,
      value: 4102444800000,
    })
    expect(parseCompatibilityEpochMs(0)).toMatchObject({
      ok: false,
      error: "compatibility.out-of-bounds",
    })
    expect(parseCompatibilityLegacyIso("2026-07-29T00:00:00.000Z")).toEqual({
      ok: true,
      value: 1785283200000,
    })
    expect(parseCompatibilityLegacyIso("2026-07-29")).toMatchObject({
      ok: false,
      error: "compatibility.invalid-scalar",
    })
  })

  it("performs checked seconds and millisecond conversions without clamping", () => {
    expect(legacySecondsToCompatibilityMs(1.2345)).toEqual({
      ok: true,
      value: 1235,
    })
    expect(legacySecondsToCompatibilityMs(604800)).toEqual({
      ok: true,
      value: 604800000,
    })
    expect(legacySecondsToCompatibilityMs(-1)).toMatchObject({
      ok: false,
      error: "compatibility.time-conversion",
    })
    expect(legacySecondsToCompatibilityMs(604800.001)).toMatchObject({
      ok: false,
      error: "compatibility.time-conversion",
    })
    expect(compatibilityMsToLegacySeconds(1250)).toEqual({
      ok: true,
      value: 1.25,
    })
    expect(compatibilityMsToLegacySeconds(604800001)).toMatchObject({
      ok: false,
      error: "compatibility.time-conversion",
    })
  })

  it("projects pre-Phase-2 settings and accepts the complete later settings record", () => {
    const v1 = { ...DEFAULT_SETTINGS }
    const v2 = { ...v1, explicitModelId: "onnx-community/whisper-small" }
    expect(parseCompatibilitySettings(undefined, DEFAULT_SETTINGS)).toEqual({
      ok: true,
      value: { ...DEFAULT_SETTINGS, explicitModelId: null },
    })
    expect(parseCompatibilitySettings(v1, DEFAULT_SETTINGS)).toEqual({
      ok: true,
      value: { ...DEFAULT_SETTINGS, explicitModelId: null },
    })
    expect(parseCompatibilitySettings(v2, DEFAULT_SETTINGS)).toMatchObject({
      ok: true,
      value: {
        ...DEFAULT_SETTINGS,
        explicitModelId: "onnx-community/whisper-small",
      },
    })
    expect(
      parseCompatibilitySettings({ ...v2, extra: true }, DEFAULT_SETTINGS)
    ).toMatchObject({
      ok: false,
      error: "compatibility.invalid-shape",
    })
    expect(
      parseCompatibilitySettings(
        { ...v2, explicitModelId: 42 },
        DEFAULT_SETTINGS
      )
    ).toMatchObject({
      ok: false,
      error: "compatibility.invalid-shape",
      path: "$.explicitModelId",
    })
    expect(
      parseCompatibilitySettings(
        { ...v2, explicitModelId: "" },
        DEFAULT_SETTINGS
      )
    ).toMatchObject({
      ok: false,
      error: "compatibility.out-of-bounds",
      path: "$.explicitModelId",
    })
    expect(
      parseCompatibilitySettings(
        { ...v2, explicitModelId: "\ud800" },
        DEFAULT_SETTINGS
      )
    ).toMatchObject({
      ok: false,
      error: "compatibility.invalid-scalar",
      path: "$.explicitModelId",
    })
    expect(
      parseCompatibilitySettings(
        { ...v2, serverModelId: "server/model" },
        DEFAULT_SETTINGS
      )
    ).toMatchObject({
      ok: true,
      value: { serverModelId: "server/model" },
    })
    expect(
      parseCompatibilitySettings(
        { ...v2, serverModelId: null },
        DEFAULT_SETTINGS
      )
    ).toMatchObject({
      ok: true,
      value: { serverModelId: null },
    })
    expect(
      parseCompatibilitySettings(
        { ...v2, serverModelId: "🙂".repeat(128) },
        DEFAULT_SETTINGS
      )
    ).toMatchObject({
      ok: true,
      value: { serverModelId: "🙂".repeat(128) },
    })
    expect(
      parseCompatibilitySettings({ ...v2, serverModelId: "" }, DEFAULT_SETTINGS)
    ).toMatchObject({
      ok: false,
      error: "compatibility.out-of-bounds",
      path: "$.serverModelId",
    })
    expect(
      parseCompatibilitySettings(
        { ...v2, serverModelId: "x".repeat(129) },
        DEFAULT_SETTINGS
      )
    ).toMatchObject({
      ok: false,
      error: "compatibility.out-of-bounds",
      path: "$.serverModelId",
    })
    expect(
      parseCompatibilitySettings(
        { ...v2, serverModelId: "🙂".repeat(129) },
        DEFAULT_SETTINGS
      )
    ).toMatchObject({
      ok: false,
      error: "compatibility.out-of-bounds",
      path: "$.serverModelId",
    })
    expect(
      parseCompatibilitySettings(
        { ...v2, serverModelId: "\ud800" },
        DEFAULT_SETTINGS
      )
    ).toMatchObject({
      ok: false,
      error: "compatibility.invalid-scalar",
      path: "$.serverModelId",
    })
    expect(
      parseCompatibilitySettings({ ...v1, mode: "other" }, DEFAULT_SETTINGS)
    ).toMatchObject({
      ok: false,
      error: "compatibility.invalid-scalar",
      path: "$.mode",
    })
  })

  it("parses exact canonical segments and rejects shape, scalar, timing, and normalization defects", () => {
    const valid = {
      id: "seg_001",
      startMs: 0,
      endMs: 1250,
      text: "Hello world.",
    }
    expect(parseRollbackV2Segment(valid)).toEqual({ ok: true, value: valid })
    expect(parseRollbackV2Segment({ ...valid, extra: true })).toMatchObject({
      ok: false,
      error: "compatibility.invalid-shape",
    })
    expect(parseRollbackV2Segment({ ...valid, id: "\ud800" })).toMatchObject({
      ok: false,
      error: "compatibility.invalid-scalar",
    })
    expect(
      parseRollbackV2Segment({ ...valid, endMs: 604800001 })
    ).toMatchObject({ ok: false, error: "compatibility.out-of-bounds" })
    expect(
      parseRollbackV2Segment({ ...valid, startMs: 2, endMs: 1 })
    ).toMatchObject({ ok: false, error: "compatibility.invalid-lineage" })
    expect(
      parseRollbackV2Segment({ ...valid, text: " Hello  world. " })
    ).toMatchObject({ ok: false, error: "compatibility.invalid-derived-text" })
  })

  it("parses the exact payload and rejects duplicate, overlap, bounds, and derived-text defects", () => {
    const segment = {
      id: "seg_001",
      startMs: 0,
      endMs: 1250,
      text: "Hello world.",
    }
    const payload = {
      title: "Sample transcript",
      sourceName: "sample.wav",
      language: "en",
      modelId: "Xenova/whisper-base",
      mode: "local-webgpu",
      createdAt: 1785283200000,
      text: "Hello world.",
      segments: [segment],
    }
    expect(parseRollbackV2Payload(payload)).toEqual({
      ok: true,
      value: payload,
    })
    expect(
      parseRollbackV2Payload({ ...payload, id: "payload-id" })
    ).toMatchObject({ ok: false, error: "compatibility.invalid-shape" })
    expect(
      parseRollbackV2Payload({ ...payload, title: " Sample transcript" })
    ).toMatchObject({ ok: false, error: "compatibility.invalid-scalar" })
    expect(
      parseRollbackV2Payload({
        ...payload,
        segments: [segment, { ...segment }],
      })
    ).toMatchObject({ ok: false, error: "compatibility.invalid-lineage" })
    expect(
      parseRollbackV2Payload({
        ...payload,
        segments: [
          segment,
          { id: "seg_002", startMs: 1000, endMs: 2000, text: "Next" },
        ],
        text: "Hello world. Next",
      })
    ).toMatchObject({ ok: false, error: "compatibility.invalid-lineage" })
    expect(parseRollbackV2Payload({ ...payload, text: "stale" })).toMatchObject(
      { ok: false, error: "compatibility.invalid-derived-text" }
    )
  })

  it("keeps the exact public result and schema-description types", () => {
    const result: CompatibilityResult<Version2SchemaDescription> = {
      ok: false,
      error: "compatibility.invalid-schema",
      path: "$.stores",
    }
    expect(result.ok).toBe(false)
  })

  it("parses ordinary live, restored live, and compact tombstone envelopes", () => {
    const transcript = {
      title: "Sample transcript",
      sourceName: "sample.wav",
      language: "en",
      modelId: "Xenova/whisper-base",
      mode: "local-webgpu" as const,
      createdAt: 1785283200000,
      text: "Hello world.",
      segments: [
        { id: "seg_001", startMs: 0, endMs: 1250, text: "Hello world." },
      ],
    }
    const live: RollbackV2Envelope = {
      schemaVersion: 2,
      transcriptId: "tr_sample_001",
      revision: 3,
      updatedAt: 1785283201000,
      deletedAt: null,
      deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA",
      deletionId: null,
      restoredFromDeletionId: null,
      transcript,
    }
    expect(parseRollbackV2Envelope(live)).toEqual({ ok: true, value: live })
    expect(
      parseRollbackV2Envelope({
        ...live,
        restoredFromDeletionId: "x_AAAAAAAAAAAAAAAAAAAAAA",
      })
    ).toMatchObject({ ok: true })
    expect(
      parseRollbackV2Envelope({ ...live, revision: Number.MAX_SAFE_INTEGER })
    ).toMatchObject({ ok: true })
    const tombstone = {
      ...live,
      revision: 4,
      updatedAt: 1785283202000,
      deletedAt: 1785283202000,
      deletionId: "x_AAAAAAAAAAAAAAAAAAAAAA",
      transcript: null,
    }
    expect(parseRollbackV2Envelope(tombstone)).toEqual({
      ok: true,
      value: tombstone,
    })
    expect(
      parseRollbackV2Envelope({ ...live, schemaVersion: 1 })
    ).toMatchObject({
      ok: false,
      error: "compatibility.out-of-bounds",
      path: "$.schemaVersion",
    })
    expect(
      parseRollbackV2Envelope({ ...live, transcriptId: "\ud800" })
    ).toMatchObject({ ok: false, error: "compatibility.invalid-scalar" })
    expect(
      parseRollbackV2Envelope({ ...live, deletedAt: 1785283202000 })
    ).toMatchObject({ ok: false, error: "compatibility.invalid-lineage" })
    expect(
      parseRollbackV2Envelope({
        ...tombstone,
        restoredFromDeletionId: "x_AAAAAAAAAAAAAAAAAAAAAA",
      })
    ).toMatchObject({ ok: false, error: "compatibility.invalid-lineage" })
    expect(parseRollbackV2Envelope({ ...live, unknown: true })).toMatchObject({
      ok: false,
      error: "compatibility.invalid-shape",
    })
  })

  it("projects live data exactly and omits tombstones", () => {
    const live = parseRollbackV2Envelope({
      schemaVersion: 2,
      transcriptId: "tr_sample_001",
      revision: 3,
      updatedAt: 1785283201000,
      deletedAt: null,
      deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA",
      deletionId: null,
      restoredFromDeletionId: null,
      transcript: {
        title: "Sample transcript",
        sourceName: "sample.wav",
        language: "en",
        modelId: "Xenova/whisper-base",
        mode: "local-webgpu",
        createdAt: 1785283200000,
        text: "Hello world.",
        segments: [
          { id: "seg_001", startMs: 0, endMs: 1250, text: "Hello world." },
        ],
      },
    })
    if (!live.ok) throw new Error(live.error)
    expect(projectRollbackEnvelope(live.value)).toEqual({
      ok: true,
      value: {
        id: "tr_sample_001",
        title: "Sample transcript",
        sourceName: "sample.wav",
        language: "en",
        modelId: "Xenova/whisper-base",
        mode: "local-webgpu",
        createdAt: "2026-07-29T00:00:00.000Z",
        updatedAt: "2026-07-29T00:00:01.000Z",
        text: "Hello world.",
        segments: [
          { id: "seg_001", start: 0, end: 1.25, text: "Hello world." },
        ],
      },
    })
    expect(
      projectRollbackEnvelope({
        ...live.value,
        revision: 4,
        deletedAt: 1785283202000,
        deletionId: "x_AAAAAAAAAAAAAAAAAAAAAA",
        restoredFromDeletionId: null,
        transcript: null,
      })
    ).toEqual({ ok: true, value: null })
  })
})
