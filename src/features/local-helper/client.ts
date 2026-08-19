import type { LanguageCode } from "@/features/transcription/types"
import type { SseConnection } from "@/features/server-transcription/sse"
import type {
  HelperCacheClearResult,
  HelperCacheStatus,
  HelperCapabilities,
  HelperHealth,
  HelperPairResponse,
} from "./types"
import type { ServerJobStatus } from "@/features/server-transcription/types"

const TOKEN_KEY = "whisdom.local-helper.token.v1"
const PORTS = [8788, 8789, 8790]
const REQUEST_TIMEOUT_MS = 1200
const API_PREFIX = "/api/v1"

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export class LocalHelperClient {
  private baseUrl: string | null = null

  async discover(): Promise<HelperHealth | null> {
    for (const port of PORTS) {
      const baseUrl = `http://127.0.0.1:${port}`
      try {
        const health = await this.request<HelperHealth>(
          `${baseUrl}${API_PREFIX}/health`,
          { method: "GET" }
        )
        if (health.available) {
          this.baseUrl = baseUrl
          return health
        }
      } catch {
        // Try the next local port.
      }
    }
    return null
  }

  async connect(): Promise<HelperCapabilities> {
    await this.requireBaseUrl()
    if (localStorage.getItem(TOKEN_KEY)) {
      try {
        return await this.getCapabilities()
      } catch {
        localStorage.removeItem(TOKEN_KEY)
      }
    }
    return this.pair()
  }

  hasPairing() {
    return Boolean(localStorage.getItem(TOKEN_KEY))
  }

  async pair(): Promise<HelperCapabilities> {
    const baseUrl = await this.requireBaseUrl()
    const response = await fetch(`${baseUrl}${API_PREFIX}/pair`, {
      method: "POST",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok)
      throw new Error(`Helper pairing failed: ${response.status}`)
    const data = (await response.json()) as HelperPairResponse
    if (!data.token) throw new Error("Helper returned no pairing token.")
    localStorage.setItem(TOKEN_KEY, data.token)
    return this.getCapabilities()
  }

  async getCapabilities(): Promise<HelperCapabilities> {
    const baseUrl = await this.requireBaseUrl()
    return this.request<HelperCapabilities>(
      `${baseUrl}${API_PREFIX}/capabilities`,
      {
        method: "GET",
        headers: this.authHeaders(),
      }
    )
  }

  async pickAndSubmit(
    language: LanguageCode,
    modelId: string
  ): Promise<{ jobId: string; filename: string } | null> {
    const baseUrl = await this.requireBaseUrl()
    const response = await fetch(
      `${baseUrl}${API_PREFIX}/pick-and-transcribe`,
      {
        method: "POST",
        headers: {
          ...this.authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ language, model: modelId }),
        signal: AbortSignal.timeout(30_000),
      }
    )
    if (response.status === 204) return null
    if (!response.ok)
      throw new Error(`Helper picker failed: ${response.status}`)
    const data: unknown = await response.json()
    if (!isPlainObject(data))
      throw new Error("Helper returned an invalid picker job.")
    const jobId = data.job_id
    const filename = data.filename
    if (
      typeof jobId !== "string" ||
      jobId.length === 0 ||
      typeof filename !== "string" ||
      filename.length === 0 ||
      /[\\/]/.test(filename)
    ) {
      throw new Error("Helper returned an invalid picker job.")
    }
    return { jobId, filename }
  }

  subscribeProgress(
    jobId: string,
    onStatus: (status: ServerJobStatus) => void,
    onError?: (error: Error) => void
  ): SseConnection {
    const controller = new AbortController()
    const baseUrl = this.baseUrl
    if (!baseUrl) throw new Error("Helper is not connected.")
    void (async () => {
      try {
        const response = await fetch(
          `${baseUrl}${API_PREFIX}/progress/${encodeURIComponent(jobId)}`,
          {
            headers: { ...this.authHeaders(), Accept: "text/event-stream" },
            signal: controller.signal,
          }
        )
        if (!response.ok)
          throw new Error(`Helper progress failed: ${response.status}`)
        if (!response.body) throw new Error("Helper progress returned no body.")
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let terminal = false
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            if (!terminal) throw new Error("Helper progress stream ended early.")
            break
          }
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith("data: ")) continue
            try {
              const status = JSON.parse(trimmed.slice(6)) as ServerJobStatus
              terminal = ["complete", "error", "cancelled"].includes(
                status.phase
              )
              onStatus(status)
            } catch {
              /* skip malformed events */
            }
          }
        }
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") return
        onError?.(caught instanceof Error ? caught : new Error(String(caught)))
      }
    })()
    return { unsubscribe: () => controller.abort() }
  }

  async cancelJob(jobId: string): Promise<void> {
    const baseUrl = await this.requireBaseUrl()
    const response = await fetch(
      `${baseUrl}${API_PREFIX}/cancel/${encodeURIComponent(jobId)}`,
      {
        method: "POST",
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    )
    if (!response.ok)
      throw new Error(`Helper cancellation failed: ${response.status}`)
  }

  async getCacheStatus(): Promise<HelperCacheStatus> {
    const baseUrl = await this.requireBaseUrl()
    return this.request<HelperCacheStatus>(
      `${baseUrl}${API_PREFIX}/cache/status`,
      {
        method: "GET",
        headers: this.authHeaders(),
      }
    )
  }

  async clearCache(): Promise<HelperCacheClearResult> {
    const baseUrl = await this.requireBaseUrl()
    const response = await fetch(`${baseUrl}${API_PREFIX}/cache/clear`, {
      method: "POST",
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok)
      throw new Error(`Helper cache clear failed: ${response.status}`)
    return response.json() as Promise<HelperCacheClearResult>
  }

  private async requireBaseUrl() {
    if (this.baseUrl) return this.baseUrl
    const health = await this.discover()
    if (!health || !this.baseUrl)
      throw new Error("Whisdom helper is not running.")
    return this.baseUrl
  }

  private authHeaders(): Record<string, string> {
    const token = localStorage.getItem(TOKEN_KEY)
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok)
      throw new Error(`Helper request failed: ${response.status}`)
    return response.json() as Promise<T>
  }
}

export const localHelperClient = new LocalHelperClient()
