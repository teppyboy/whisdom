import { afterEach, describe, expect, it, vi } from "vitest"

import { bytesToMb, formatDuration, readMediaDuration } from "@/features/media/preflight"

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
