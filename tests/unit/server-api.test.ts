import { describe, it, expect, vi } from "vitest"
import type { ServerJobStatus, ServerJobPhase, ServerSegment } from "@/features/server-transcription/types"
import { ServerTranscriptionApi } from "@/features/server-transcription/api"

describe("ServerJobStatus", () => {
  it("parses a queued status", () => {
    const status: ServerJobStatus = {
      id: "abc-123",
      phase: "queued",
    }
    expect(status.phase).toBe("queued")
    expect(status.progress).toBeUndefined()
  })

  it("parses a complete status with segments", () => {
    const segments: ServerSegment[] = [
      { start: 0.0, end: 2.5, text: "Hello world" },
      { start: 3.0, end: 5.0, text: "How are you" },
    ]
    const status: ServerJobStatus = {
      id: "def-456",
      phase: "complete",
      progress: 100,
      text: "Hello world How are you",
      segments,
    }
    expect(status.phase).toBe("complete")
    expect(status.segments).toHaveLength(2)
    expect(status.segments![0].text).toBe("Hello world")
    expect(status.text).toBe("Hello world How are you")
  })

  it("handles error status", () => {
    const status: ServerJobStatus = {
      id: "err-789",
      phase: "error",
      error: "Something went wrong",
    }
    expect(status.phase).toBe("error")
    expect(status.error).toBe("Something went wrong")
  })

  it("handles all phases", () => {
    const phases: ServerJobPhase[] = [
      "queued",
      "downloading",
      "extracting",
      "transcribing",
      "complete",
      "error",
      "cancelled",
    ]
    for (const phase of phases) {
      const status: ServerJobStatus = { id: "test", phase }
      expect(status.phase).toBe(phase)
    }
  })
})

describe("TranscribeInput", () => {
  it("distinguishes file and url inputs", () => {
    const fileInput = { type: "file" as const, file: new Blob(), filename: "test.mp3" }
    const urlInput = { type: "url" as const, url: "https://example.com/video" }

    expect(fileInput.type).toBe("file")
    expect(urlInput.type).toBe("url")
    expect("url" in urlInput).toBe(true)
    expect("file" in fileInput).toBe(true)
  })
})

describe("ServerTranscriptionApi.submitJob", () => {
  it("appends model field to form data when modelId is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job_id: "job-1" }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const api = new ServerTranscriptionApi("https://example.test", () => "token")
    await api.submitJob({ type: "url", url: "https://media.test/a.mp3" }, "en", "small")

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    const formData = requestInit.body as FormData
    expect(formData.get("model")).toBe("small")
  })

  it("omits model field when modelId is not provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job_id: "job-2" }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const api = new ServerTranscriptionApi("https://example.test", () => "token")
    await api.submitJob({ type: "url", url: "https://media.test/a.mp3" }, "en")

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    const formData = requestInit.body as FormData
    expect(formData.get("model")).toBeNull()
  })
})
