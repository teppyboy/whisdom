import { beforeEach, describe, expect, it, vi } from "vitest"

import { LocalHelperClient } from "../../src/features/local-helper/client"

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
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ available: true, protocol_version: 1, busy: false }),
          { status: 200 }
        )
      )

    const client = new LocalHelperClient()
    const health = await client.discover()

    expect(health?.available).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://127.0.0.1:8789/api/v1/health"
    )
  })

  it("stores the pairing token and never uses a cloud token", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ available: true, protocol_version: 1, busy: false }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ token: "local-token", protocol_version: 1 }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            available: true,
            engine: "whisper.cpp",
            accelerator: "cpu",
            model_id: "turbo",
            model_ready: true,
            ffmpeg_ready: true,
          }),
          { status: 200 }
        )
      )

    const client = new LocalHelperClient()
    await client.discover()
    const capabilities = await client.pair()

    expect(capabilities.engine).toBe("whisper.cpp")
    expect(localStorage.getItem("whisdom.local-helper.token.v1")).toBe(
      "local-token"
    )
  })

  it("submits a native picker request without browser media or cloud tokens", async () => {
    localStorage.setItem("whisdom.local-helper.token.v1", "local-token")
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ available: true, protocol_version: 1, busy: false }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ job_id: "job-123", filename: "meeting.mkv" }),
          { status: 200 }
        )
      )

    const client = new LocalHelperClient()
    await client.discover()
    const result = await client.pickAndSubmit("vi", "ggml-large-v3-turbo-q5_0")

    expect(result).toEqual({ jobId: "job-123", filename: "meeting.mkv" })
    const request = fetchMock.mock.calls[1]
    expect(request?.[0]).toBe(
      "http://127.0.0.1:8788/api/v1/pick-and-transcribe"
    )
    const init = request?.[1] as RequestInit
    expect(init.headers).toEqual({
      Authorization: "Bearer local-token",
      "Content-Type": "application/json",
    })
    expect(init.body).toBe(
      JSON.stringify({ language: "vi", model: "ggml-large-v3-turbo-q5_0" })
    )
    expect(init.body).not.toContain("audio")
    expect(init.body).not.toContain("path")
    expect(init.body).not.toContain("google")
  })

  it("treats a cancelled native picker as no job", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ available: true, protocol_version: 1, busy: false }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    const client = new LocalHelperClient()
    await client.discover()
    await expect(
      client.pickAndSubmit("en", "ggml-large-v3-turbo-q5_0")
    ).resolves.toBeNull()
  })

  it("rejects malformed native picker responses", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ available: true, protocol_version: 1, busy: false }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ job_id: "job-123" }), { status: 200 })
      )

    const client = new LocalHelperClient()
    await client.discover()
    await expect(
      client.pickAndSubmit("en", "ggml-large-v3-turbo-q5_0")
    ).rejects.toThrow("invalid picker job")
  })

  it("rejects picker responses with invalid fields or path data", async () => {
    for (const payload of [
      { job_id: 42, filename: "meeting.mkv" },
      { job_id: "job-123", filename: "C:\\secret\\meeting.mkv" },
    ]) {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ available: true, protocol_version: 1, busy: false }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(payload), { status: 200 })
        )
      const client = new LocalHelperClient()
      await client.discover()
      await expect(
        client.pickAndSubmit("en", "ggml-large-v3-turbo-q5_0")
      ).rejects.toThrow("invalid picker job")
      vi.restoreAllMocks()
    }
  })

  it("reports SSE connection errors without treating unsubscribe as an error", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ available: true, protocol_version: 1, busy: false }),
          { status: 200 }
        )
      )
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

  it("reports an SSE stream that ends before a terminal status", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ available: true, protocol_version: 1, busy: false }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream({ start(controller) { controller.close() } }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        )
      )
    const client = new LocalHelperClient()
    await client.discover()
    const onError = vi.fn()
    client.subscribeProgress("job-123", vi.fn(), onError)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Helper progress stream ended early." })
    )
  })

  it("reports cache clear failures instead of hiding them", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ available: true, protocol_version: 1, busy: false }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ token: "local-token", protocol_version: 1 }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            available: true,
            engine: "whisper.cpp",
            accelerator: "cpu",
            model_id: "turbo",
            model_ready: true,
            ffmpeg_ready: true,
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "helper resource is busy" }), {
          status: 409,
        })
      )

    const client = new LocalHelperClient()
    await client.discover()
    await client.pair()
    await expect(client.clearCache()).rejects.toThrow("409")
  })
})
