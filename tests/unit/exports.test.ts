import { describe, expect, it } from "vitest"

import {
  buildExportFileName,
  serializeTranscript,
  type ExportFormat,
} from "@/features/transcription/exports"
import type { TranscriptDocument } from "@/features/transcription/types"

const transcript: TranscriptDocument = {
  id: "doc-1",
  title: "Demo",
  sourceName: "Meeting Notes.mov",
  language: "vi",
  modelId: "onnx-community/whisper-base",
  mode: "local-webgpu",
  createdAt: "2026-06-11T10:15:30.456Z",
  updatedAt: "2026-06-11T10:15:30.456Z",
  text: "Xin chao\nHello",
  segments: [
    { start: 0, end: 1.25, text: "Xin chao" },
    { start: 61.5, end: 63, text: "Hello" },
  ],
}

describe("transcript exports", () => {
  it.each<ExportFormat>(["txt", "json", "srt", "vtt"])(
    "builds safe dated %s filenames",
    (format) => {
      expect(buildExportFileName(transcript, format)).toBe(
        `Meeting-Notes.vi.2026-06-11_10-15-30-456.${format}`
      )
    }
  )

  it("serializes plain text", () => {
    expect(serializeTranscript(transcript, "txt")).toBe("Xin chao\nHello")
  })

  it("serializes subtitle formats with expected timestamps", () => {
    expect(serializeTranscript(transcript, "srt")).toContain(
      "1\n00:00:00,000 --> 00:00:01,250\nXin chao"
    )
    expect(serializeTranscript(transcript, "vtt")).toContain(
      "00:01:01.500 --> 00:01:03.000\nHello"
    )
  })
})
