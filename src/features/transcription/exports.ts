import type { TranscriptDocument, TranscriptSegment } from "./types"

export type ExportFormat = "txt" | "json" | "srt" | "vtt"

export function buildExportFileName(document: TranscriptDocument, format: ExportFormat) {
  const stem = document.sourceName.replace(/\.[^.]+$/, "") || "transcript"
  const safeStem = stem.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "")
  const dateTime = new Date(document.createdAt)
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "")

  return `${safeStem}.${document.language}.${dateTime}.${format}`
}

export function serializeTranscript(document: TranscriptDocument, format: ExportFormat) {
  if (format === "json") {
    return JSON.stringify(document, null, 2)
  }

  if (format === "srt") {
    return document.segments.map(formatSrtSegment).join("\n\n")
  }

  if (format === "vtt") {
    return `WEBVTT\n\n${document.segments.map(formatVttSegment).join("\n\n")}`
  }

  return document.text
}

export function downloadTranscript(transcript: TranscriptDocument, format: ExportFormat) {
  const blob = new Blob([serializeTranscript(transcript, format)], {
    type: format === "json" ? "application/json" : "text/plain;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = buildExportFileName(transcript, format)
  anchor.click()
  URL.revokeObjectURL(url)
}

function formatSrtSegment(segment: TranscriptSegment, index: number) {
  return `${index + 1}\n${formatTimestamp(segment.start, ",")} --> ${formatTimestamp(
    segment.end,
    ","
  )}\n${segment.text}`
}

function formatVttSegment(segment: TranscriptSegment) {
  return `${formatTimestamp(segment.start, ".")} --> ${formatTimestamp(
    segment.end,
    "."
  )}\n${segment.text}`
}

function formatTimestamp(seconds: number, separator: "," | ".") {
  const safeSeconds = Math.max(0, seconds)
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const wholeSeconds = Math.floor(safeSeconds % 60)
  const millis = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 1000)

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${wholeSeconds.toString().padStart(2, "0")}${separator}${millis
    .toString()
    .padStart(3, "0")}`
}
