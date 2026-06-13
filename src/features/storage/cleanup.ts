export const MODEL_CACHE_KEY = "whisdom-transformers-models-v1"
export const LEGACY_MODEL_CACHE_KEY = "transformers-cache"
export const MODEL_CACHE_KEYS = [MODEL_CACHE_KEY, LEGACY_MODEL_CACHE_KEY]

export async function clearModelCaches() {
  if (typeof caches === "undefined") {
    return 0
  }

  const results = await Promise.all(MODEL_CACHE_KEYS.map((key) => caches.delete(key)))
  return results.filter(Boolean).length
}
