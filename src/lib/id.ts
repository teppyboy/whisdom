export function createId(prefix = "id") {
  const cryptoObject = globalThis.crypto

  if (typeof cryptoObject?.randomUUID === "function") {
    return cryptoObject.randomUUID()
  }

  if (typeof cryptoObject?.getRandomValues === "function") {
    const bytes = new Uint8Array(16)
    cryptoObject.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
