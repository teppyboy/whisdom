import { beforeEach, describe, expect, it, vi } from "vitest"

import { LocalHelperClient } from "../../src/features/local-helper/client"

const health = { available: true, protocol_version: 2, busy: false }
const capabilities = {
  available: true,
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
})
