import { DEFAULT_SETTINGS } from "@/features/transcription/models"
import type { AppSettings, TranscriptDocument } from "@/features/transcription/types"
import {
  inspectVersion2Schema,
  legacySecondsToCompatibilityMs,
  parseCompatibilityEpochMs,
  parseCompatibilityLegacyIso,
  parseCompatibilitySettings,
  parseRollbackV2Envelope,
  projectRollbackEnvelope,
  type CompatibilityResult,
  type RollbackV2Envelope,
  type RollbackV2Segment,
} from "@/features/storage/compatibility"
import { closeDatabase, openCompatibleDatabase } from "@/features/storage/database"

const SETTINGS_KEY = "settings"

export type StorageCompatibilityErrorCode =
  | "storage.unsupported-version"
  | "storage.malformed-v2"
  | "storage.incomplete-v2"
  | "storage.revision-exhausted"
  | "storage.time-conversion"

export class StorageCompatibilityError extends Error {
  readonly code: StorageCompatibilityErrorCode
  readonly foundVersion: number | null

  constructor(code: StorageCompatibilityErrorCode, foundVersion: number | null = null) {
    super(code)
    this.name = "StorageCompatibilityError"
    this.code = code
    this.foundVersion = foundVersion
  }
}

async function getDb() {
  const result = await openCompatibleDatabase()
  if (result.status === "unsupported") {
    throw new StorageCompatibilityError("storage.unsupported-version", result.foundVersion)
  }
  return result
}

function unwrapCompatibility<T>(result: CompatibilityResult<T>): T {
  if (result.ok) return result.value
  const code: StorageCompatibilityErrorCode =
    result.error === "compatibility.invalid-schema"
      ? "storage.incomplete-v2"
      : result.error === "compatibility.time-conversion"
        ? "storage.time-conversion"
        : "storage.malformed-v2"
  throw new StorageCompatibilityError(code)
}

async function requireVersion2Schema(db: Awaited<ReturnType<typeof getDb>>["db"]) {
  return unwrapCompatibility(await inspectVersion2Schema(db))
}

async function refuseOnCompatibilityFailure<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof StorageCompatibilityError) await closeDatabase()
    throw error
  }
}

function isCanonicalWhitespace(codePoint: number): boolean {
  return (codePoint >= 0x0009 && codePoint <= 0x000d) || codePoint === 0x0020 || codePoint === 0x0085 ||
    codePoint === 0x00a0 || codePoint === 0x1680 || (codePoint >= 0x2000 && codePoint <= 0x200a) ||
    codePoint === 0x2028 || codePoint === 0x2029 || codePoint === 0x202f || codePoint === 0x205f ||
    codePoint === 0x3000 || codePoint === 0xfeff
}

function canonicalizeSegmentText(value: string): string {
  let result = ""
  let pendingSpace = false
  for (const scalar of value) {
    if (isCanonicalWhitespace(scalar.codePointAt(0)!)) {
      if (result) pendingSpace = true
      continue
    }
    if (pendingSpace) result += " "
    result += scalar
    pendingSpace = false
  }
  return result
}

function canonicalizeTitle(value: string): string {
  const scalars = [...value]
  let start = 0
  let end = scalars.length
  while (start < end && isCanonicalWhitespace(scalars[start].codePointAt(0)!)) start += 1
  while (end > start && isCanonicalWhitespace(scalars[end - 1].codePointAt(0)!)) end -= 1
  return scalars.slice(start, end).join("")
}

function deriveText(segments: readonly RollbackV2Segment[]): string {
  return segments.map((segment) => segment.text).filter(Boolean).join(" ")
}

function createDeletionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `x_${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "")}`
}

function nextRevision(revision: number): number {
  const next = revision + 1
  if (!Number.isSafeInteger(next)) throw new StorageCompatibilityError("storage.revision-exhausted")
  return next
}

function currentEpochMs(): number {
  const now = parseCompatibilityEpochMs(Date.now())
  if (!now.ok) throw new StorageCompatibilityError("storage.time-conversion")
  return now.value
}

function toCanonicalSegments(document: TranscriptDocument): RollbackV2Segment[] {
  return document.segments.map((segment) => ({
    id: segment.id,
    startMs: unwrapCompatibility(legacySecondsToCompatibilityMs(segment.start)),
    endMs: unwrapCompatibility(legacySecondsToCompatibilityMs(segment.end)),
    text: canonicalizeSegmentText(segment.text),
  }))
}

function toLiveEnvelope(input: {
  transcriptId: string
  revision: number
  updatedAt: number
  deviceId: string
  restoredFromDeletionId: string | null
  createdAt: number
  title: string
  sourceName: string
  language: string
  modelId: string
  mode: TranscriptDocument["mode"]
  segments: RollbackV2Segment[]
}): RollbackV2Envelope {
  return unwrapCompatibility(
    parseRollbackV2Envelope({
      schemaVersion: 2,
      transcriptId: input.transcriptId,
      revision: input.revision,
      updatedAt: input.updatedAt,
      deletedAt: null,
      deviceId: input.deviceId,
      deletionId: null,
      restoredFromDeletionId: input.restoredFromDeletionId,
      transcript: {
        title: input.title,
        sourceName: input.sourceName,
        language: input.language,
        modelId: input.modelId,
        mode: input.mode,
        createdAt: input.createdAt,
        text: deriveText(input.segments),
        segments: input.segments,
      },
    }),
  )
}

function toTombstone(envelope: RollbackV2Envelope, deletedAt: number, deletionId: string): RollbackV2Envelope {
  return unwrapCompatibility(
    parseRollbackV2Envelope({
      schemaVersion: 2,
      transcriptId: envelope.transcriptId,
      revision: nextRevision(envelope.revision),
      updatedAt: deletedAt,
      deletedAt,
      deviceId: envelope.deviceId,
      deletionId,
      restoredFromDeletionId: null,
      transcript: null,
    }),
  )
}

export async function loadSettings(): Promise<AppSettings> {
  return refuseOnCompatibilityFailure(async () => {
    const { db, version } = await getDb()
    const stored = await db.get("settings", SETTINGS_KEY)

    if (version === 1) {
      return { ...DEFAULT_SETTINGS, ...(stored as Partial<AppSettings> | undefined) }
    }

    await requireVersion2Schema(db)
    return unwrapCompatibility(parseCompatibilitySettings(stored, DEFAULT_SETTINGS))
  })
}

export async function saveSettings(settings: AppSettings) {
  return refuseOnCompatibilityFailure(async () => {
    const { db, version } = await getDb()

    if (version === 1) {
      await db.put("settings", settings, SETTINGS_KEY)
      return
    }

    await requireVersion2Schema(db)
    const requested = unwrapCompatibility(parseCompatibilitySettings(settings, DEFAULT_SETTINGS))
    const transaction = db.transaction("settings", "readwrite")
    const store = transaction.objectStore("settings")
    const stored = unwrapCompatibility(
      parseCompatibilitySettings(await store.get(SETTINGS_KEY), DEFAULT_SETTINGS),
    )
    await store.put({ ...requested, explicitModelId: stored.explicitModelId }, SETTINGS_KEY)
    await transaction.done
  })
}

export async function saveTranscript(document: TranscriptDocument) {
  return refuseOnCompatibilityFailure(async () => {
    const { db, version } = await getDb()

    if (version === 1) {
      await db.put("transcripts", document)
      return
    }

    const schema = await requireVersion2Schema(db)
    const createdAt = unwrapCompatibility(parseCompatibilityLegacyIso(document.createdAt))
    const updatedAt = unwrapCompatibility(parseCompatibilityLegacyIso(document.updatedAt))
    const segments = toCanonicalSegments(document)

    const transaction = db.transaction("transcripts", "readwrite")
    const store = transaction.objectStore("transcripts")
    const stored = await store.get(document.id)
    const existing = stored === undefined ? null : unwrapCompatibility(parseRollbackV2Envelope(stored))

    await store.put(
      toLiveEnvelope({
        transcriptId: document.id,
        revision: existing === null ? 0 : nextRevision(existing.revision),
        updatedAt,
        deviceId: existing?.deviceId ?? schema.deviceId,
        restoredFromDeletionId: existing?.deletionId ?? existing?.restoredFromDeletionId ?? null,
        createdAt,
        title: canonicalizeTitle(document.title),
        sourceName: document.sourceName,
        language: document.language,
        modelId: document.modelId,
        mode: document.mode,
        segments,
      }),
    )
    await transaction.done
  })
}

export async function deleteTranscript(id: string) {
  return refuseOnCompatibilityFailure(async () => {
    const { db, version } = await getDb()

    if (version === 1) {
      await db.delete("transcripts", id)
      return
    }

    await requireVersion2Schema(db)
    const deletionId = createDeletionId()
    const deletedAt = currentEpochMs()

    const transaction = db.transaction("transcripts", "readwrite")
    const store = transaction.objectStore("transcripts")
    const stored = await store.get(id)

    if (stored !== undefined) {
      const existing = unwrapCompatibility(parseRollbackV2Envelope(stored))
      if (existing.transcript !== null) await store.put(toTombstone(existing, deletedAt, deletionId))
    }

    await transaction.done
  })
}

export async function clearTranscripts() {
  return refuseOnCompatibilityFailure(async () => {
    const { db, version } = await getDb()

    if (version === 1) {
      await db.clear("transcripts")
      return
    }

    await requireVersion2Schema(db)
    const deletedAt = currentEpochMs()
    const tombstones = (await db.getAll("transcripts"))
      .map((row) => unwrapCompatibility(parseRollbackV2Envelope(row)))
      .filter((envelope) => envelope.transcript !== null)
      .map((envelope) => toTombstone(envelope, deletedAt, createDeletionId()))

    if (tombstones.length === 0) return

    const transaction = db.transaction("transcripts", "readwrite")
    const store = transaction.objectStore("transcripts")
    await Promise.all(tombstones.map((tombstone) => store.put(tombstone)))
    await transaction.done
  })
}

export async function renameTranscript(id: string, title: string) {
  return refuseOnCompatibilityFailure(async () => {
    const { db, version } = await getDb()

    if (version === 1) {
      const document = await db.get("transcripts", id) as TranscriptDocument | undefined

      if (!document) {
        return null
      }

      const updated: TranscriptDocument = {
        ...document,
        title,
        updatedAt: new Date().toISOString(),
      }

      await db.put("transcripts", updated)
      return updated
    }

    await requireVersion2Schema(db)
    const updatedAt = currentEpochMs()

    const transaction = db.transaction("transcripts", "readwrite")
    const store = transaction.objectStore("transcripts")
    const stored = await store.get(id)

    if (stored === undefined) {
      await transaction.done
      return null
    }

    const existing = unwrapCompatibility(parseRollbackV2Envelope(stored))

    if (existing.transcript === null) {
      await transaction.done
      return null
    }

    const renamed = toLiveEnvelope({
      transcriptId: existing.transcriptId,
      revision: nextRevision(existing.revision),
      updatedAt,
      deviceId: existing.deviceId,
      restoredFromDeletionId: existing.restoredFromDeletionId,
      createdAt: existing.transcript.createdAt,
      title: canonicalizeTitle(title),
      sourceName: existing.transcript.sourceName,
      language: existing.transcript.language,
      modelId: existing.transcript.modelId,
      mode: existing.transcript.mode,
      segments: existing.transcript.segments,
    })

    await store.put(renamed)
    await transaction.done
    return unwrapCompatibility(projectRollbackEnvelope(renamed))
  })
}

export async function listTranscripts(): Promise<TranscriptDocument[]> {
  return refuseOnCompatibilityFailure(async () => {
    const { db, version } = await getDb()
    if (version === 2) await requireVersion2Schema(db)

    const rows = await db.getAll("transcripts")
    const documents: TranscriptDocument[] = version === 1
      ? rows as TranscriptDocument[]
      : rows
          .map((row) => unwrapCompatibility(parseRollbackV2Envelope(row)))
          .map((envelope) => unwrapCompatibility(projectRollbackEnvelope(envelope)))
          .filter((document): document is TranscriptDocument => document !== null)

    return documents.sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    )
  })
}
