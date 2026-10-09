import { beforeEach, describe, expect, it, vi } from "vitest"

import { LocalHelperClient } from "../../src/features/local-helper/client"
import {
  helperStatusMessage,
  normalizeHelperProgress,
} from "../../src/features/local-helper/progress"

const health = { available: true, protocol_version: 2, busy: false }
const capabilities = {
  available: true,
  experimental_vad: false,
  engine: "whisper.cpp",
  accelerator: "cpu",
  model_id: "ggml-large-v3-turbo-q5_0",
  model_ready: true,
  ffmpeg_ready: true,
  native_picker: true,
  models: [
    {
      id: "ggml-large-v3-turbo-q5_0",
      label: "Whisper Large v3 Turbo",
      quality: "high",
      size_bytes: 574041195,
      installed: true,
      engine: "whisper.cpp",
      supported_languages: ["*"],
      supports_auto_language: true,
      active_backend: "cpu",
    },
  ],
}

function mockHealth() {
  return new Response(JSON.stringify(health), { status: 200 })
}

describe("LocalHelperClient", () => {
  it("uses professional localized Companion status messages", () => {
    expect(helperStatusMessage("transcribing", "en")).toBe("Transcribing audio")
    expect(helperStatusMessage("transcribing", "vi")).toBe(
      "Đang chuyển giọng nói thành văn bản"
    )
    expect(helperStatusMessage("transcribing", "en")).not.toContain("chunk")
    expect(normalizeHelperProgress(undefined)).toBe(0)
    expect(normalizeHelperProgress(45)).toBe(0.45)
  })
  beforeEach(() => {
    const storage = new Map<string, string>()
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        clear: () => storage.clear(),
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    })
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it("discovers the helper on the configured loopback port", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(mockHealth())
    const client = new LocalHelperClient()

    expect((await client.discover())?.available).toBe(true)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://127.0.0.1:8789/api/v1/health"
    )
  })

  it("pairs locally and validates native models", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ token: "local-token", protocol_version: 2 })
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(capabilities)))
    const client = new LocalHelperClient()
    await client.discover()

    await expect(client.pair()).resolves.toMatchObject({
      models: expect.arrayContaining([
        expect.objectContaining({ id: "ggml-large-v3-turbo-q5_0" }),
      ]),
    })
    expect(localStorage.getItem("whisdom.local-helper.token.v1")).toBe(
      "local-token"
    )
  })

  it("preserves legacy Whisper-only capability records", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...capabilities,
            experimental_vad: undefined,
            models: capabilities.models.map((model) => ({
              id: model.id,
              label: model.label,
              quality: model.quality,
              size_bytes: model.size_bytes,
              installed: model.installed,
            })),
          })
        )
      )
    const client = new LocalHelperClient()
    await client.discover()
    await expect(client.getCapabilities()).resolves.toMatchObject({
      models: [
        expect.objectContaining({
          engine: "whisper.cpp",
          supported_languages: ["*"],
          supports_auto_language: true,
          active_backend: "cpu",
        }),
      ],
    })
  })

  it("parses a mixed companion catalog and rejects malformed capability metadata", async () => {
    const parakeet = {
      id: "sherpa-parakeet-tdt-v3-int8",
      label: "Parakeet TDT v3",
      quality: "high",
      size_bytes: 487170055,
      installed: false,
      engine: "sherpa-onnx",
      supported_languages: ["en", "de", "fr", "es"],
      supports_auto_language: false,
      active_backend: "cpu",
    }
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...capabilities,
            models: [...capabilities.models, parakeet],
          })
        )
      )
    const client = new LocalHelperClient()
    await client.discover()
    await expect(client.getCapabilities()).resolves.toMatchObject({
      models: expect.arrayContaining([
        expect.objectContaining({
          id: parakeet.id,
          active_backend: "cpu",
        }),
      ]),
    })

    for (const model of [
      { ...parakeet, engine: "python" },
      { ...parakeet, supported_languages: ["C:\\\\secret"] },
      { ...parakeet, supported_languages: ["en", "en"] },
      { ...parakeet, supported_languages: [] },
      { ...parakeet, supports_auto_language: "yes" },
      { ...parakeet, active_backend: "claimed-gpu" },
    ]) {
      vi.restoreAllMocks()
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockHealth())
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ...capabilities, models: [model] }))
        )
      const invalidClient = new LocalHelperClient()
      await invalidClient.discover()
      await expect(invalidClient.getCapabilities()).rejects.toThrow(
        "invalid capabilities"
      )
    }
  })

  it("rejects malformed native model capabilities", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...capabilities, models: [{ id: "x" }] }))
      )
    const client = new LocalHelperClient()
    await client.discover()
    await expect(client.getCapabilities()).rejects.toThrow(
      "invalid capabilities"
    )
  })

  it("selects opaque native files without a request body", async () => {
    localStorage.setItem("whisdom.local-helper.token.v1", "local-token")
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            selections: [
              {
                id: "selection-1",
                filename: "meeting.mkv",
                size_bytes: 42,
                extension: "mkv",
              },
            ],
          })
        )
      )
    const client = new LocalHelperClient()
    await client.discover()

    await expect(client.selectFiles()).resolves.toEqual([
      {
        id: "selection-1",
        filename: "meeting.mkv",
        size_bytes: 42,
        extension: "mkv",
      },
    ])
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://127.0.0.1:8788/api/v1/select-files"
    )
    const init = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(init).toMatchObject({
      method: "POST",
      headers: { Authorization: "Bearer local-token" },
    })
    expect(init.body).toBeUndefined()
  })

  it("treats picker cancellation as no selections", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const client = new LocalHelperClient()
    await client.discover()
    await expect(client.selectFiles()).resolves.toEqual([])
  })

  it("rejects malformed selections and path-shaped display data", async () => {
    for (const selections of [
      [{ id: "selection-1" }],
      [
        {
          id: "selection-1",
          filename: "C:\\secret.wav",
          size_bytes: 1,
          extension: "wav",
        },
      ],
    ]) {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(mockHealth())
        .mockResolvedValueOnce(new Response(JSON.stringify({ selections })))
      const client = new LocalHelperClient()
      await client.discover()
      await expect(client.selectFiles()).rejects.toThrow(
        "invalid file selections"
      )
      vi.restoreAllMocks()
    }
  })

  it("deletes a companion selection before local queue removal", async () => {
    localStorage.setItem("whisdom.local-helper.token.v1", "local-token")
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const client = new LocalHelperClient()
    await client.discover()
    await client.deleteSelection("selection-1")
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://127.0.0.1:8788/api/v1/selections/selection-1"
    )
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "DELETE" })
  })

  it("starts an opaque selection with only its id, language, and model", async () => {
    localStorage.setItem("whisdom.local-helper.token.v1", "local-token")
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ job_id: "job-123" }))
      )
    const client = new LocalHelperClient()
    await client.discover()
    await expect(
      client.startSelection("selection-1", "vi", "ggml-base-q5_1")
    ).resolves.toEqual({ jobId: "job-123" })
    const init = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(init).toMatchObject({ method: "POST" })
    expect(JSON.parse(String(init.body))).toEqual({
      selection_id: "selection-1",
      language: "vi",
      model: "ggml-base-q5_1",
      experimental_vad: false,
    })
  })

  it("reports selection start failures", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
    const client = new LocalHelperClient()
    await client.discover()
    await expect(
      client.startSelection("missing", "en", "ggml-base-q5_1")
    ).rejects.toThrow("404")
  })

  it("skips malformed SSE statuses and delivers valid 0..100 progress", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(
        new Response(
          [
            'data: {"id":"job-123","phase":"transcribing","progress":101}\n\n',
            'data: {"id":"job-123","phase":"complete","progress":100,"segments":[{"start":0,"end":1,"text":"done"}]}\n\n',
          ].join(""),
          { status: 200 }
        )
      )
    const client = new LocalHelperClient()
    await client.discover()
    const onStatus = vi.fn()
    const onError = vi.fn()
    client.subscribeProgress("job-123", onStatus, onError)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onStatus).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "complete", progress: 100 })
    )
    expect(onError).not.toHaveBeenCalled()
  })

  it("reports SSE connection errors without treating unsubscribe as an error", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockRejectedValueOnce(new Error("connection lost"))
    const client = new LocalHelperClient()
    await client.discover()
    const onError = vi.fn()
    const connection = client.subscribeProgress("job-123", vi.fn(), onError)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "connection lost" })
    )
    connection.unsubscribe()
  })

  it("ignores progress statuses for other jobs until the subscribed job completes", async () => {
    let enqueueSubscribedStatus!: () => void
    const progress = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"id":"other-job","phase":"complete","progress":100,"segments":[{"start":0,"end":1,"text":"other"}]}\n\n'
          )
        )
        enqueueSubscribedStatus = () => {
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"id":"job-123","phase":"complete","progress":100,"segments":[{"start":0,"end":1,"text":"done"}]}\n\n'
            )
          )
          controller.close()
        }
      },
    })
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(new Response(progress, { status: 200 }))
    const client = new LocalHelperClient()
    await client.discover()
    const onStatus = vi.fn()
    const onError = vi.fn()
    client.subscribeProgress("job-123", onStatus, onError)
    await new Promise((resolve) => setTimeout(resolve, 0))
    enqueueSubscribedStatus()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onStatus).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-123", phase: "complete" })
    )
    expect(onError).not.toHaveBeenCalled()
  })

  it("reports terminal complete statuses without valid segments", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(
        new Response(
          [
            'data: {"id":"job-123","phase":"complete","progress":100}',
            "",
            "",
          ].join(String.fromCharCode(10)),
          { status: 200 }
        )
      )
    const client = new LocalHelperClient()
    await client.discover()
    const onStatus = vi.fn()
    const onError = vi.fn()
    client.subscribeProgress("job-123", onStatus, onError)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onStatus).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Helper progress complete status has invalid segments.",
      })
    )
  })

  it("accepts null capabilities active_backend and reports preferred_backend", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...capabilities,
            active_backend: null,
            preferred_backend: "metal",
            models: [
              {
                ...capabilities.models[0],
                active_backend: null,
              },
            ],
          }),
          { status: 200 }
        )
      )
    const client = new LocalHelperClient()
    await client.discover()
    const caps = await client.getCapabilities()

    expect(caps.active_backend).toBeNull()
    expect(caps.preferred_backend).toBe("metal")
    expect(caps.models[0].active_backend).toBe("unavailable")
  })

  it("rejects malformed capabilities active_backend values", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...capabilities, active_backend: "gpu" }),
          { status: 200 }
        )
      )
    const client = new LocalHelperClient()
    await client.discover()

    await expect(client.getCapabilities()).rejects.toThrow(
      "Helper returned invalid capabilities."
    )
  })

  it("parses strict diagnostics payloads", async () => {
    const diagnostics = {
      protocol_version: 2,
      os: "macos",
      arch: "arm64",
      features: { vulkan: false, metal: true, directml: false },
      active_backend: null,
      preferred_backend: "metal",
      ffmpeg: { installed: true, version: "ffmpeg version 7.1", source_url: "https://example.com" },
      models: [
        {
          id: "ggml-large-v3-turbo-q5_0",
          label: "Whisper Large v3 Turbo",
          installed: true,
          engine: "whisper.cpp",
          size_bytes: 574041195,
          active_backend: null,
        },
      ],
    }
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(
        new Response(JSON.stringify(diagnostics), { status: 200 })
      )
    const client = new LocalHelperClient()
    await client.discover()

    expect(await client.getDiagnostics()).toEqual(diagnostics)
  })

  it("rejects malformed diagnostics payloads", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            protocol_version: 2,
            os: "templeos",
            arch: "arm64",
            features: { vulkan: false, metal: true, directml: false },
            active_backend: null,
            preferred_backend: "metal",
            ffmpeg: { installed: true, version: null, source_url: "x" },
            models: [],
          }),
          { status: 200 }
        )
      )
    const client = new LocalHelperClient()
    await client.discover()

    await expect(client.getDiagnostics()).rejects.toThrow(
      "Helper returned invalid diagnostics."
    )
  })

  it("posts update-dependencies with the requested scope and validates the job id", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ job_id: "deps-1" }), { status: 200 })
      )
    const client = new LocalHelperClient()
    await client.discover()

    expect(await client.updateDependencies("all")).toEqual({
      job_id: "deps-1",
    })
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8788/api/v1/update-dependencies",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ scope: "all" }),
      })
    )

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ job_id: "../escape" }), { status: 200 })
    )
    await expect(client.updateDependencies("ffmpeg")).rejects.toThrow(
      "Helper returned an invalid dependency update job."
    )
  })

  it("awaits a job result from the legacy progress stream", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockHealth())
      .mockResolvedValueOnce(
        new Response(
          [
            'data: {"id":"other","phase":"transcribing","progress":50}\n\n',
            'data: {"id":"job-123","phase":"transcribing","progress":50}\n\n',
            'data: {"id":"job-123","phase":"complete","progress":100,"segments":[{"start":0,"end":1,"text":"done"}]}\n\n',
          ].join(""),
          { status: 200 }
        )
      )
    const client = new LocalHelperClient()
    await client.discover()

    expect(await client.awaitJobResult("job-123")).toEqual(
      expect.objectContaining({
        id: "job-123",
        phase: "complete",
        segments: [{ start: 0, end: 1, text: "done" }],
      })
    )
  })

  it("streams hello, progress, and job events with the token query parameter", async () => {
    class MockEventSource {
      static instances: MockEventSource[] = []
      url: string
      onopen: (() => void) | null = null
      onerror: (() => void) | null = null
      closed = false
      private listeners = new Map<
        string,
        Array<(event: { data: string }) => void>
      >()
      constructor(url: string) {
        this.url = url
        MockEventSource.instances.push(this)
      }
      addEventListener(name: string, cb: (event: { data: string }) => void) {
        const list = this.listeners.get(name) ?? []
        list.push(cb)
        this.listeners.set(name, list)
      }
      emit(name: string, data: string) {
        for (const cb of this.listeners.get(name) ?? []) cb({ data })
      }
      open() {
        this.onopen?.()
      }
      fail() {
        this.onerror?.()
      }
      close() {
        this.closed = true
      }
    }
    vi.stubGlobal("EventSource", MockEventSource)
    localStorage.setItem("whisdom.local-helper.token.v1", "secret-token")
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockHealth())
    const client = new LocalHelperClient()
    await client.discover()

    const onHello = vi.fn()
    const onProgress = vi.fn()
    const onJob = vi.fn()
    const onLog = vi.fn()
    const connection = client.subscribeEvents({
      onHello,
      onProgress,
      onJob,
      onLog,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const source = MockEventSource.instances.at(-1)!
    expect(source.url).toBe(
      "http://127.0.0.1:8788/api/v1/events?token=secret-token"
    )

    source.open()
    source.emit(
      "hello",
      JSON.stringify({
        protocol_version: 2,
        features: { vulkan: false, metal: true, directml: false },
        preferred_backend: "metal",
      })
    )
    source.emit(
      "progress",
      JSON.stringify({
        job_id: "job-123",
        phase: "transcribe",
        percent: 0.5,
        message: "Working",
      })
    )
    source.emit(
      "log",
      JSON.stringify({
        ts: "2026-01-01T00:00:00Z",
        level: "info",
        target: "engine",
        message: "ready",
      })
    )
    source.emit(
      "job",
      JSON.stringify({ job_id: "job-123", status: "running" })
    )
    source.emit("progress", "not-json")
    source.emit(
      "progress",
      JSON.stringify({ job_id: "job-123", phase: "warp", percent: 2 })
    )

    expect(onHello).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: "job-123", percent: 0.5 })
    )
    expect(onLog).toHaveBeenCalledTimes(1)
    expect(onJob).toHaveBeenCalledWith(
      expect.objectContaining({ job_id: "job-123", status: "running" })
    )

    connection.unsubscribe()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(source.closed).toBe(true)
    vi.unstubAllGlobals()
  })

  it("reports event stream errors and stops after unsubscribe", async () => {
    class MockEventSource {
      static instances: MockEventSource[] = []
      onopen: (() => void) | null = null
      onerror: (() => void) | null = null
      closed = false
      private listeners = new Map<
        string,
        Array<(event: { data: string }) => void>
      >()
      constructor(public url: string) {
        MockEventSource.instances.push(this)
      }
      addEventListener() {}
      fail() {
        this.onerror?.()
      }
      close() {
        this.closed = true
      }
    }
    vi.stubGlobal("EventSource", MockEventSource)
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockHealth())
    const client = new LocalHelperClient()
    await client.discover()
    const onError = vi.fn()
    const connection = client.subscribeEvents({}, onError)
    await new Promise((resolve) => setTimeout(resolve, 0))
    MockEventSource.instances.at(-1)!.fail()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Helper event stream disconnected.",
      })
    )
    connection.unsubscribe()
    vi.unstubAllGlobals()
  })
})
