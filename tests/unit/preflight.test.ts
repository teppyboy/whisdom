import { afterEach, describe, expect, it, vi } from "vitest"

import { analyzeMediaFile, bytesToMb, formatDuration, readMediaDuration } from "@/features/media/preflight"
import { DEFAULT_SETTINGS } from "@/features/transcription/models"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("preflight helpers", () => {
  it("formats byte counts as megabytes", () => {
    expect(bytesToMb(1536 * 1024)).toBe(1.5)
  })

  it("formats durations for display", () => {
    expect(formatDuration(null)).toBe("unknown")
    expect(formatDuration(65.4)).toBe("1:05")
  })

  it("times out when media metadata never loads", async () => {
    const element = {
      preload: "",
      duration: Number.NaN,
      onloadedmetadata: null,
      onerror: null,
      src: "",
      removeAttribute: vi.fn(),
      load: vi.fn(),
    }
    const revokeObjectURL = vi.fn()

    vi.stubGlobal("document", {
      createElement: vi.fn(() => element),
    })
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL,
    })
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
    })

    await expect(readMediaDuration(new File(["data"], "stuck.mp4", { type: "video/mp4" }), 1))
      .resolves.toBeNull()
    expect(element.removeAttribute).toHaveBeenCalledWith("src")
    expect(element.load).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test")
  })
})

describe("analyzeMediaFile warnings in server mode", () => {
  it("does not include quantized-weight or webgpu warnings when mode is server", async () => {
    const element = {
      preload: "",
      duration: 12,
      onloadedmetadata: null as (() => void) | null,
      onerror: null,
      src: "",
      removeAttribute: vi.fn(),
      load: vi.fn(),
    }

    vi.stubGlobal("document", {
      createElement: vi.fn(() => element),
    })
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    })
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
    })

    Object.defineProperty(element, "src", {
      set() {
        queueMicrotask(() => element.onloadedmetadata?.())
      },
    })

    const settings = {
      ...DEFAULT_SETTINGS,
      mode: "server" as const,
      modelId: "onnx-community/whisper-large-v3-turbo",
    }
    const file = new File([new Uint8Array(10)], "test.mp3", { type: "audio/mpeg" })
    const result = await analyzeMediaFile(file, settings)
    const warningTexts = result.warnings.map((w) => w.toLowerCase())
    expect(warningTexts.some((w) => w.includes("q4 onnx weights"))).toBe(false)
    expect(warningTexts.some((w) => w.includes("webgpu"))).toBe(false)
  })

  it("still includes quantized/webgpu warnings for local-webgpu mode", async () => {
    const element = {
      preload: "",
      duration: 12,
      onloadedmetadata: null as (() => void) | null,
      onerror: null,
      src: "",
      removeAttribute: vi.fn(),
      load: vi.fn(),
    }

    vi.stubGlobal("document", {
      createElement: vi.fn(() => element),
    })
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    })
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
    })

    Object.defineProperty(element, "src", {
      set() {
        queueMicrotask(() => element.onloadedmetadata?.())
      },
    })

    const settings = {
      ...DEFAULT_SETTINGS,
      mode: "local-webgpu" as const,
      modelId: "onnx-community/whisper-large-v3-turbo",
    }
    const file = new File([new Uint8Array(10)], "test.mp3", { type: "audio/mpeg" })
    const result = await analyzeMediaFile(file, settings)
    const warningTexts = result.warnings.map((w) => w.toLowerCase())
    expect(warningTexts.some((w) => w.includes("q4 onnx weights"))).toBe(true)
    expect(warningTexts.some((w) => w.includes("webgpu"))).toBe(true)
  })
})
