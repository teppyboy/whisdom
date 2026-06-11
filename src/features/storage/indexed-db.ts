import { openDB } from "idb"

import { DEFAULT_SETTINGS } from "@/features/transcription/models"
import type { AppSettings, TranscriptDocument } from "@/features/transcription/types"

const DB_NAME = "whisdom"
const DB_VERSION = 1
const SETTINGS_KEY = "settings"

async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings")
      }

      if (!db.objectStoreNames.contains("transcripts")) {
        db.createObjectStore("transcripts", { keyPath: "id" })
      }
    },
  })
}

export async function loadSettings(): Promise<AppSettings> {
  const db = await getDb()
  const stored = await db.get("settings", SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...(stored as Partial<AppSettings> | undefined) }
}

export async function saveSettings(settings: AppSettings) {
  const db = await getDb()
  await db.put("settings", settings, SETTINGS_KEY)
}

export async function saveTranscript(document: TranscriptDocument) {
  const db = await getDb()
  await db.put("transcripts", document)
}

export async function listTranscripts(): Promise<TranscriptDocument[]> {
  const db = await getDb()
  const documents = await db.getAll("transcripts")
  return documents.sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  ) as TranscriptDocument[]
}
