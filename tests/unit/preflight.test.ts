import { describe, expect, it } from "vitest"

import { bytesToMb, formatDuration } from "@/features/media/preflight"

describe("preflight helpers", () => {
  it("formats byte counts as megabytes", () => {
    expect(bytesToMb(1536 * 1024)).toBe(1.5)
  })

  it("formats durations for display", () => {
    expect(formatDuration(null)).toBe("unknown")
    expect(formatDuration(65.4)).toBe("1:05")
  })
})
