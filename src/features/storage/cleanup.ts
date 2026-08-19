export const MODEL_CACHE_KEY = "whisdom-transformers-models-v1"
export const LEGACY_MODEL_CACHE_KEY = "transformers-cache"
export const MODEL_CACHE_KEYS = [MODEL_CACHE_KEY, LEGACY_MODEL_CACHE_KEY]

export type HelperCacheClearer = () => Promise<unknown>

export async function clearModelCaches() {
  if (typeof caches === "undefined") {
    return 0
  }

  const results = await Promise.all(
    MODEL_CACHE_KEYS.map((key) => caches.delete(key))
  )
  return results.filter(Boolean).length
}

export async function clearAllModelCaches(clearHelper?: HelperCacheClearer) {
  const browserDeleted = await clearModelCaches()
  let helperCleared = false
  let helperError: string | null = null
  if (clearHelper) {
    try {
      await clearHelper()
      helperCleared = true
    } catch (error) {
      helperError = error instanceof Error ? error.message : String(error)
    }
  }
  return { browserDeleted, helperCleared, helperError }
}
