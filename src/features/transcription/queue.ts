import type { TranscriptDocument } from "./types"

export type QueuedFileStatus = "pending" | "active" | "complete" | "error"
export type QueueSource =
  | { kind: "browser"; file: File }
  | { kind: "companion"; selectionId: string; name: string; sizeBytes: number }
export type QueuedFile = {
  id: string
  source: QueueSource
  status: QueuedFileStatus
  transcriptId?: string
  error?: string
}

export function queueFileName(item: QueuedFile) {
  return item.source.kind === "browser"
    ? item.source.file.name
    : item.source.name
}

export function queueFileSize(item: QueuedFile) {
  return item.source.kind === "browser"
    ? item.source.file.size
    : item.source.sizeBytes
}

export type { TranscriptDocument }
