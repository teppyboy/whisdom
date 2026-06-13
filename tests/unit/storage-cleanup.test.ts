import { afterEach, describe, expect, it, vi } from "vitest"

import { clearModelCaches, MODEL_CACHE_KEYS } from "@/features/storage/cleanup"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("storage cleanup", () => {
  it("deletes known model cache buckets", async () => {
    const deleteCache = vi.fn(async (key: string) => key === MODEL_CACHE_KEYS[0])

    vi.stubGlobal("caches", { delete: deleteCache })

    await expect(clearModelCaches()).resolves.toBe(1)
    expect(deleteCache).toHaveBeenCalledTimes(MODEL_CACHE_KEYS.length)
    expect(deleteCache).toHaveBeenCalledWith(MODEL_CACHE_KEYS[0])
  })

  it("is safe when Cache Storage is unavailable", async () => {
    vi.stubGlobal("caches", undefined)

    await expect(clearModelCaches()).resolves.toBe(0)
  })
})
