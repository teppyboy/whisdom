import type { IDBPDatabase } from "idb"

import type { AppSettings, ProcessingMode, TranscriptDocument } from "@/features/transcription/types"

export type CompatibilityFailureCode =
  | "compatibility.invalid-schema"
  | "compatibility.invalid-shape"
  | "compatibility.invalid-scalar"
  | "compatibility.out-of-bounds"
  | "compatibility.invalid-lineage"
  | "compatibility.invalid-derived-text"
  | "compatibility.time-conversion"

export type CompatibilityResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CompatibilityFailureCode; path: string }

export interface RollbackV2Segment { id: string; startMs: number; endMs: number; text: string }
export interface RollbackV2Payload {
  title: string; sourceName: string; language: string; modelId: string
  mode: ProcessingMode; createdAt: number; text: string; segments: RollbackV2Segment[]
}
export interface RollbackV2Envelope {
  schemaVersion: 2; transcriptId: string; revision: number; updatedAt: number
  deletedAt: number | null; deviceId: string; deletionId: string | null
  restoredFromDeletionId: string | null; transcript: RollbackV2Payload | null
}
export type CompatibilitySettingsProjection = Omit<AppSettings, "explicitModelId"> & {
  explicitModelId: string | null
}
export interface Version2SchemaDescription {
  stores: readonly ["conflictCandidates", "drafts", "meta", "migrationQuarantine", "pendingOperations", "settings", "syncMetadata", "syncState", "transcripts"]
  keyPaths: Readonly<{
    settings: null; transcripts: "transcriptId"; migrationQuarantine: "quarantineId"
    drafts: "transcriptId"; conflictCandidates: "candidateId"
    syncMetadata: readonly ["accountKey", "transcriptId"]
    pendingOperations: readonly ["accountKey", "transcriptId"]
    syncState: "accountKey"; meta: null
  }>
  indexes: Readonly<{
    transcripts: readonly ["by-deletedAt", "by-updatedAt"]
    migrationQuarantine: readonly ["by-originalV1Key", "by-reasonCode"]
    conflictCandidates: readonly ["by-receivedAt", "by-transcriptId"]
    syncMetadata: readonly ["by-accountKey", "by-transcriptId"]
    pendingOperations: readonly ["by-accountKey", "by-nextAttemptAt", "by-transcriptId"]
    drafts: readonly []; settings: readonly []; syncState: readonly []; meta: readonly []
  }>
  deviceId: string
}

const MIN_EPOCH_MS = 946684800000
const MAX_EPOCH_MS = 4102444800000
const MAX_RELATIVE_MS = 604800000
const MODES = ["local-webgpu", "cloudflare-ai", "local-wasm", "server"] as const
const SETTINGS_V1_KEYS = ["chunkSeconds", "language", "mode", "modelId", "overlapSeconds", "persistMediaBlobs", "serverModelId", "uiLanguage"] as const
const SETTINGS_V2_KEYS = [...SETTINGS_V1_KEYS, "explicitModelId"] as const
const SCHEMA = {
  stores: ["conflictCandidates", "drafts", "meta", "migrationQuarantine", "pendingOperations", "settings", "syncMetadata", "syncState", "transcripts"],
  keyPaths: {
    settings: null, transcripts: "transcriptId", migrationQuarantine: "quarantineId",
    drafts: "transcriptId", conflictCandidates: "candidateId",
    syncMetadata: ["accountKey", "transcriptId"], pendingOperations: ["accountKey", "transcriptId"],
    syncState: "accountKey", meta: null,
  },
  indexes: {
    transcripts: ["by-deletedAt", "by-updatedAt"],
    migrationQuarantine: ["by-originalV1Key", "by-reasonCode"],
    conflictCandidates: ["by-receivedAt", "by-transcriptId"],
    syncMetadata: ["by-accountKey", "by-transcriptId"],
    pendingOperations: ["by-accountKey", "by-nextAttemptAt", "by-transcriptId"],
    drafts: [], settings: [], syncState: [], meta: [],
  },
} as const satisfies Omit<Version2SchemaDescription, "deviceId">

function ok<T>(value: T): CompatibilityResult<T> { return { ok: true, value } }
function fail<T>(error: CompatibilityFailureCode, path: string): CompatibilityResult<T> { return { ok: false, error, path } }
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}
function sameKeyPath(actual: IDBObjectStore["keyPath"], expected: string | readonly string[] | null): boolean {
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && actual.every((part, index) => part === expected[index])
  return actual === expected
}
function isScalarString(value: unknown): value is string {
  if (typeof value !== "string") return false
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false
  }
  return true
}
function byteLength(value: string): number { return new TextEncoder().encode(value).byteLength }
function scalarLength(value: string): number { return [...value].length }
function isCanonicalWhitespace(codePoint: number): boolean {
  return (codePoint >= 0x0009 && codePoint <= 0x000d) || codePoint === 0x0020 || codePoint === 0x0085 ||
    codePoint === 0x00a0 || codePoint === 0x1680 || (codePoint >= 0x2000 && codePoint <= 0x200a) ||
    codePoint === 0x2028 || codePoint === 0x2029 || codePoint === 0x202f || codePoint === 0x205f ||
    codePoint === 0x3000 || codePoint === 0xfeff
}
function hasNonWhitespace(value: string): boolean { return [...value].some((part) => !isCanonicalWhitespace(part.codePointAt(0)!)) }
function boundedString(value: unknown, path: string, minScalars: number, maxScalars: number, maxBytes: number, requireVisible: boolean): CompatibilityResult<string> {
  if (typeof value !== "string") return fail("compatibility.invalid-shape", path)
  if (!isScalarString(value)) return fail("compatibility.invalid-scalar", path)
  const scalars = scalarLength(value)
  if (scalars < minScalars || scalars > maxScalars || byteLength(value) > maxBytes || (requireVisible && !hasNonWhitespace(value))) return fail("compatibility.out-of-bounds", path)
  return ok(value)
}
function canonicalId(value: unknown, prefix: "d_" | "x_", path: string): CompatibilityResult<string> {
  if (typeof value !== "string") return fail("compatibility.invalid-shape", path)
  if (!isScalarString(value) || !new RegExp(`^${prefix}[A-Za-z0-9_-]{22}$`).test(value)) return fail("compatibility.invalid-scalar", path)
  try {
    const suffix = value.slice(2)
    const bytes = Uint8Array.from(atob(suffix.replace(/-/g, "+").replace(/_/g, "/") + "=="), (character) => character.charCodeAt(0))
    const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "")
    return bytes.length === 16 && encoded === suffix ? ok(value) : fail("compatibility.invalid-scalar", path)
  } catch { return fail("compatibility.invalid-scalar", path) }
}

export async function inspectVersion2Schema(db: IDBPDatabase): Promise<CompatibilityResult<Version2SchemaDescription>> {
  const stores = Array.from(db.objectStoreNames).sort()
  if (stores.length !== SCHEMA.stores.length || stores.some((store, index) => store !== SCHEMA.stores[index])) return fail("compatibility.invalid-schema", "$.stores")
  const transaction = db.transaction([...SCHEMA.stores], "readonly")
  for (const storeName of SCHEMA.stores) {
    const store = transaction.objectStore(storeName)
    if (!sameKeyPath(store.keyPath, SCHEMA.keyPaths[storeName])) return fail("compatibility.invalid-schema", `$.keyPaths.${storeName}`)
    const indexes = Array.from(store.indexNames).sort()
    const expected = [...SCHEMA.indexes[storeName]]
    if (indexes.length !== expected.length || indexes.some((name, index) => name !== expected[index])) return fail("compatibility.invalid-schema", `$.indexes.${storeName}`)
  }
  const deviceId = parseCompatibilityDeviceId(await transaction.objectStore("meta").get("deviceId"))
  if (!deviceId.ok) return fail("compatibility.invalid-schema", "$.meta.deviceId")
  await transaction.done
  return ok({ ...SCHEMA, deviceId: deviceId.value })
}

export function parseCompatibilityDeviceId(value: unknown): CompatibilityResult<string> { return canonicalId(value, "d_", "$") }
export function parseCompatibilityDeletionId(value: unknown): CompatibilityResult<string> { return canonicalId(value, "x_", "$") }
export function parseCompatibilityEpochMs(value: unknown): CompatibilityResult<number> {
  if (typeof value !== "number") return fail("compatibility.invalid-shape", "$")
  return Number.isSafeInteger(value) && value >= MIN_EPOCH_MS && value <= MAX_EPOCH_MS ? ok(value) : fail("compatibility.out-of-bounds", "$")
}
export function parseCompatibilityLegacyIso(value: unknown): CompatibilityResult<number> {
  if (typeof value !== "string") return fail("compatibility.invalid-shape", "$")
  if (!isScalarString(value)) return fail("compatibility.invalid-scalar", "$")
  const epoch = Date.parse(value)
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) return fail("compatibility.invalid-scalar", "$")
  const bounded = parseCompatibilityEpochMs(epoch)
  return bounded.ok ? bounded : fail(bounded.error, "$")
}
export function legacySecondsToCompatibilityMs(value: unknown): CompatibilityResult<number> {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return fail("compatibility.time-conversion", "$")
  const product = value * 1000
  const rounded = Math.round(product)
  return Number.isFinite(product) && Number.isSafeInteger(rounded) && rounded <= MAX_RELATIVE_MS ? ok(rounded) : fail("compatibility.time-conversion", "$")
}
export function compatibilityMsToLegacySeconds(value: unknown): CompatibilityResult<number> {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > MAX_RELATIVE_MS) return fail("compatibility.time-conversion", "$")
  const seconds = value / 1000
  return Math.round(seconds * 1000) === value ? ok(seconds) : fail("compatibility.time-conversion", "$")
}
const SEGMENT_KEYS = ["endMs", "id", "startMs", "text"] as const
const PAYLOAD_KEYS = ["createdAt", "language", "mode", "modelId", "segments", "sourceName", "text", "title"] as const

function normalizeSegmentText(value: string): string {
  let result = ""
  let pendingSpace = false
  for (const scalar of value) {
    if (isCanonicalWhitespace(scalar.codePointAt(0)!)) {
      if (result) pendingSpace = true
    } else {
      if (pendingSpace) result += " "
      result += scalar
      pendingSpace = false
    }
  }
  return result
}
function trimCanonicalOuterWhitespace(value: string): string {
  const scalars = [...value]
  let start = 0; let end = scalars.length
  while (start < end && isCanonicalWhitespace(scalars[start].codePointAt(0)!)) start += 1
  while (end > start && isCanonicalWhitespace(scalars[end - 1].codePointAt(0)!)) end -= 1
  return scalars.slice(start, end).join("")
}
function relativeMs(value: unknown, path: string): CompatibilityResult<number> {
  if (typeof value !== "number") return fail("compatibility.invalid-shape", path)
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_RELATIVE_MS ? ok(value) : fail("compatibility.out-of-bounds", path)
}
function parseSegment(value: unknown, path: string): CompatibilityResult<RollbackV2Segment> {
  if (!isPlainObject(value) || !hasExactKeys(value, SEGMENT_KEYS)) return fail("compatibility.invalid-shape", path)
  const id = boundedString(value.id, `${path}.id`, 1, 255, 1024, true); if (!id.ok) return id
  const startMs = relativeMs(value.startMs, `${path}.startMs`); if (!startMs.ok) return startMs
  const endMs = relativeMs(value.endMs, `${path}.endMs`); if (!endMs.ok) return endMs
  if (endMs.value < startMs.value) return fail("compatibility.invalid-lineage", `${path}.endMs`)
  if (typeof value.text !== "string") return fail("compatibility.invalid-shape", `${path}.text`)
  if (!isScalarString(value.text)) return fail("compatibility.invalid-scalar", `${path}.text`)
  if (normalizeSegmentText(value.text) !== value.text) return fail("compatibility.invalid-derived-text", `${path}.text`)
  if (byteLength(value.text) > 1024 * 1024) return fail("compatibility.out-of-bounds", `${path}.text`)
  return ok({ id: id.value, startMs: startMs.value, endMs: endMs.value, text: value.text })
}
export function parseRollbackV2Segment(value: unknown): CompatibilityResult<RollbackV2Segment> { return parseSegment(value, "$") }

function parsePayload(value: unknown, path: string): CompatibilityResult<RollbackV2Payload> {
  if (!isPlainObject(value) || !hasExactKeys(value, PAYLOAD_KEYS)) return fail("compatibility.invalid-shape", path)
  const title = boundedString(value.title, `${path}.title`, 1, 512, 2048, true); if (!title.ok) return title
  if (trimCanonicalOuterWhitespace(title.value) !== title.value) return fail("compatibility.invalid-scalar", `${path}.title`)
  const sourceName = boundedString(value.sourceName, `${path}.sourceName`, 0, 2048, 8192, false); if (!sourceName.ok) return sourceName
  const language = boundedString(value.language, `${path}.language`, 1, 128, 512, true); if (!language.ok) return language
  const modelId = boundedString(value.modelId, `${path}.modelId`, 1, 128, 512, true); if (!modelId.ok) return modelId
  if (typeof value.mode !== "string") return fail("compatibility.invalid-shape", `${path}.mode`)
  if (!isScalarString(value.mode) || !MODES.includes(value.mode as ProcessingMode)) return fail("compatibility.invalid-scalar", `${path}.mode`)
  const createdAt = parseCompatibilityEpochMs(value.createdAt); if (!createdAt.ok) return fail(createdAt.error, `${path}.createdAt`)
  if (typeof value.text !== "string") return fail("compatibility.invalid-shape", `${path}.text`)
  if (!isScalarString(value.text)) return fail("compatibility.invalid-scalar", `${path}.text`)
  if (byteLength(value.text) > 16 * 1024 * 1024) return fail("compatibility.out-of-bounds", `${path}.text`)
  if (!Array.isArray(value.segments)) return fail("compatibility.invalid-shape", `${path}.segments`)
  if (value.segments.length < 1 || value.segments.length > 100000) return fail("compatibility.out-of-bounds", `${path}.segments`)
  const segments: RollbackV2Segment[] = []; const ids = new Set<string>(); let previousEnd = 0
  for (let index = 0; index < value.segments.length; index += 1) {
    const segment = parseSegment(value.segments[index], `${path}.segments[${index}]`); if (!segment.ok) return segment
    if (ids.has(segment.value.id) || (index > 0 && segment.value.startMs < previousEnd)) return fail("compatibility.invalid-lineage", `${path}.segments[${index}]`)
    ids.add(segment.value.id); previousEnd = segment.value.endMs; segments.push(segment.value)
  }
  const derived = segments.map((segment) => segment.text).filter(Boolean).join(" ")
  if (byteLength(derived) > 16 * 1024 * 1024) return fail("compatibility.out-of-bounds", `${path}.text`)
  if (value.text !== derived) return fail("compatibility.invalid-derived-text", `${path}.text`)
  return ok({ title: title.value, sourceName: sourceName.value, language: language.value, modelId: modelId.value, mode: value.mode as ProcessingMode, createdAt: createdAt.value, text: derived, segments })
}
export function parseRollbackV2Payload(value: unknown): CompatibilityResult<RollbackV2Payload> { return parsePayload(value, "$") }

const ENVELOPE_KEYS = ["deletedAt", "deletionId", "deviceId", "restoredFromDeletionId", "revision", "schemaVersion", "transcript", "transcriptId", "updatedAt"] as const

export function parseRollbackV2Envelope(value: unknown): CompatibilityResult<RollbackV2Envelope> {
  if (!isPlainObject(value) || !hasExactKeys(value, ENVELOPE_KEYS)) return fail("compatibility.invalid-shape", "$")
  if (typeof value.schemaVersion !== "number") return fail("compatibility.invalid-shape", "$.schemaVersion")
  if (!Number.isSafeInteger(value.schemaVersion) || value.schemaVersion !== 2) return fail("compatibility.out-of-bounds", "$.schemaVersion")
  const transcriptId = boundedString(value.transcriptId, "$.transcriptId", 1, 512, 512, true); if (!transcriptId.ok) return transcriptId
  if (typeof value.revision !== "number") return fail("compatibility.invalid-shape", "$.revision")
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) return fail("compatibility.out-of-bounds", "$.revision")
  const updatedAt = parseCompatibilityEpochMs(value.updatedAt); if (!updatedAt.ok) return fail(updatedAt.error, "$.updatedAt")
  const deviceId = canonicalId(value.deviceId, "d_", "$.deviceId"); if (!deviceId.ok) return deviceId
  const deletedAt = value.deletedAt === null ? ok<number | null>(null) : parseCompatibilityEpochMs(value.deletedAt)
  if (!deletedAt.ok) return fail(deletedAt.error, "$.deletedAt")
  const deletionId = value.deletionId === null ? ok<string | null>(null) : canonicalId(value.deletionId, "x_", "$.deletionId")
  if (!deletionId.ok) return deletionId
  const restored = value.restoredFromDeletionId === null ? ok<string | null>(null) : canonicalId(value.restoredFromDeletionId, "x_", "$.restoredFromDeletionId")
  if (!restored.ok) return restored
  const transcript = value.transcript === null ? ok<RollbackV2Payload | null>(null) : parsePayload(value.transcript, "$.transcript")
  if (!transcript.ok) return transcript
  const tombstone = deletedAt.value !== null && deletionId.value !== null && restored.value === null && transcript.value === null
  const live = deletedAt.value === null && deletionId.value === null && transcript.value !== null
  if (!tombstone && !live) return fail("compatibility.invalid-lineage", "$")
  return ok({ schemaVersion: 2, transcriptId: transcriptId.value, revision: value.revision, updatedAt: updatedAt.value, deletedAt: deletedAt.value, deviceId: deviceId.value, deletionId: deletionId.value, restoredFromDeletionId: restored.value, transcript: transcript.value })
}

export function projectRollbackEnvelope(envelope: RollbackV2Envelope): CompatibilityResult<TranscriptDocument | null> {
  const parsed = parseRollbackV2Envelope(envelope)
  if (!parsed.ok) return parsed
  if (parsed.value.transcript === null) return ok(null)
  const segments: TranscriptDocument["segments"] = []
  for (let index = 0; index < parsed.value.transcript.segments.length; index += 1) {
    const segment = parsed.value.transcript.segments[index]
    const start = compatibilityMsToLegacySeconds(segment.startMs)
    if (!start.ok) return fail(start.error, `$.transcript.segments[${index}].startMs`)
    const end = compatibilityMsToLegacySeconds(segment.endMs)
    if (!end.ok) return fail(end.error, `$.transcript.segments[${index}].endMs`)
    segments.push({ id: segment.id, start: start.value, end: end.value, text: segment.text })
  }
  const text = parsed.value.transcript.segments.map((segment) => segment.text).filter(Boolean).join(" ")
  return ok({
    id: parsed.value.transcriptId, title: parsed.value.transcript.title,
    sourceName: parsed.value.transcript.sourceName, language: parsed.value.transcript.language,
    modelId: parsed.value.transcript.modelId, mode: parsed.value.transcript.mode,
    createdAt: new Date(parsed.value.transcript.createdAt).toISOString(),
    updatedAt: new Date(parsed.value.updatedAt).toISOString(), text, segments,
  })
}

export function parseCompatibilitySettings(value: unknown, defaults: AppSettings): CompatibilityResult<CompatibilitySettingsProjection> {
  if (value === undefined) return ok({ ...defaults, explicitModelId: null })
  if (!isPlainObject(value)) return fail("compatibility.invalid-shape", "$")
  const version = hasExactKeys(value, SETTINGS_V1_KEYS) ? 1 : hasExactKeys(value, SETTINGS_V2_KEYS) ? 2 : null
  if (version === null) return fail("compatibility.invalid-shape", "$")
  if (typeof value.uiLanguage !== "string") return fail("compatibility.invalid-shape", "$.uiLanguage")
  if (!isScalarString(value.uiLanguage) || (value.uiLanguage !== "en" && value.uiLanguage !== "vi")) return fail("compatibility.invalid-scalar", "$.uiLanguage")
  const modelId = boundedString(value.modelId, "$.modelId", 1, 128, 512, true); if (!modelId.ok) return modelId
  const language = boundedString(value.language, "$.language", 1, 128, 512, true); if (!language.ok) return language
  if (typeof value.mode !== "string") return fail("compatibility.invalid-shape", "$.mode")
  if (!isScalarString(value.mode) || !MODES.includes(value.mode as ProcessingMode)) return fail("compatibility.invalid-scalar", "$.mode")
  if (typeof value.chunkSeconds !== "number" || !Number.isFinite(value.chunkSeconds) || value.chunkSeconds <= 0) return fail("compatibility.out-of-bounds", "$.chunkSeconds")
  if (typeof value.overlapSeconds !== "number" || !Number.isFinite(value.overlapSeconds) || value.overlapSeconds < 0) return fail("compatibility.out-of-bounds", "$.overlapSeconds")
  if (typeof value.persistMediaBlobs !== "boolean") return fail("compatibility.invalid-shape", "$.persistMediaBlobs")
  const serverModelId = value.serverModelId === null
    ? ok<string | null>(null)
    : boundedString(value.serverModelId, "$.serverModelId", 1, 128, 512, true)
  if (!serverModelId.ok) return serverModelId
  const explicitModelId = version === 2
    ? value.explicitModelId === null
      ? ok<string | null>(null)
      : boundedString(value.explicitModelId, "$.explicitModelId", 1, 128, 512, true)
    : ok<string | null>(null)
  if (!explicitModelId.ok) return explicitModelId
  return ok({ uiLanguage: value.uiLanguage, modelId: modelId.value, explicitModelId: explicitModelId.value, language: language.value, mode: value.mode as ProcessingMode, chunkSeconds: value.chunkSeconds, overlapSeconds: value.overlapSeconds, persistMediaBlobs: value.persistMediaBlobs, serverModelId: serverModelId.value })
}
