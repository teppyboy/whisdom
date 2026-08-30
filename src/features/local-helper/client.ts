import type { LanguageCode } from "@/features/transcription/types"
import type { SseConnection } from "@/features/server-transcription/sse"
import type {
  HelperCacheClearResult,
  HelperCacheStatus,
  HelperCapabilities,
  HelperHealth,
  HelperModel,
  HelperPairResponse,
  HelperSelection,
  HelperUpdate,
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

function validOpaqueId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !/[\\/]/.test(value)
}

const HELPER_ENGINES = new Set([
  "whisper.cpp",
  "sherpa-onnx",
  "nemo-speech.cpp",
])
const HELPER_BACKENDS = new Set(["cpu", "directml", "vulkan", "unavailable"])
const LANGUAGE_CODE = /^[a-z]{2,3}$/

type LegacyWhisperDefaults = {
  engine: "whisper.cpp"
  activeBackend: HelperModel["active_backend"]
}

function parseModel(
  value: unknown,
  legacy: LegacyWhisperDefaults | null
): HelperModel | null {
  if (!isPlainObject(value)) return null
  const {
    id,
    label,
    quality,
    size_bytes: sizeBytes,
    installed,
    engine = legacy?.engine,
    supported_languages: supportedLanguages = legacy ? ["*"] : undefined,
    supports_auto_language: supportsAutoLanguage = legacy ? true : undefined,
    active_backend: activeBackend = legacy?.activeBackend,
  } = value
  if (
    !validOpaqueId(id) ||
    typeof label !== "string" ||
    label.length === 0 ||
    /[\\/]/.test(label) ||
    typeof quality !== "string" ||
    quality.length === 0 ||
    typeof sizeBytes !== "number" ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 0 ||
    typeof installed !== "boolean" ||
    typeof engine !== "string" ||
    !HELPER_ENGINES.has(engine) ||
    !Array.isArray(supportedLanguages) ||
    supportedLanguages.length === 0 ||
    supportedLanguages.length > 32 ||
    supportedLanguages.some((language) => typeof language !== "string") ||
    supportedLanguages.some(
      (language) => language !== "*" && !LANGUAGE_CODE.test(language)
    ) ||
    new Set(supportedLanguages).size !== supportedLanguages.length ||
    typeof supportsAutoLanguage !== "boolean" ||
    typeof activeBackend !== "string" ||
    !HELPER_BACKENDS.has(activeBackend)
  )
    return null
  return {
    id,
    label,
    quality,
    size_bytes: sizeBytes,
    installed,
    engine: engine as HelperModel["engine"],
    supported_languages: supportedLanguages as string[],
    supports_auto_language: supportsAutoLanguage,
    active_backend: activeBackend as HelperModel["active_backend"],
  }
}

function parseUpdate(value: unknown): HelperUpdate | null {
  if (
    !isPlainObject(value) ||
    (value.update !== null && !isPlainObject(value.update))
  )
    throw new Error("Helper returned invalid update information.")
  if (value.update === null) return null
  if (
    typeof value.update.version !== "string" ||
    (value.update.body !== null && typeof value.update.body !== "string")
  )
    throw new Error("Helper returned invalid update information.")
  // SAFETY: update.version/body are validated immediately above.
  return value.update as unknown as HelperUpdate
}

function parseCapabilities(value: unknown): HelperCapabilities {
  if (!isPlainObject(value) || !Array.isArray(value.models))
    throw new Error("Helper returned invalid capabilities.")
  const {
    available,
    experimental_vad: experimentalVad,
    engine,
    accelerator,
    model_id: modelId,
    model_ready: modelReady,
    ffmpeg_ready: ffmpegReady,
    native_picker: nativePicker,
  } = value
  if (
    typeof available !== "boolean" ||
    (experimentalVad !== undefined && typeof experimentalVad !== "boolean") ||
    typeof engine !== "string" ||
    typeof accelerator !== "string" ||
    !validOpaqueId(modelId) ||
    typeof modelReady !== "boolean" ||
    typeof ffmpegReady !== "boolean" ||
    typeof nativePicker !== "boolean"
  )
    throw new Error("Helper returned invalid capabilities.")
  const legacy =
    engine === "whisper.cpp" &&
    (accelerator === "cpu" || accelerator === "vulkan-or-cpu")
      ? {
          engine: "whisper.cpp" as const,
          activeBackend:
            accelerator === "cpu" ? ("cpu" as const) : ("unavailable" as const),
        }
      : null
  const models = value.models.map((model) => parseModel(model, legacy))
  if (models.some((model) => model === null))
    throw new Error("Helper returned invalid capabilities.")
  return {
    available,
    experimental_vad: experimentalVad === true,
    engine,
    accelerator,
    model_id: modelId,
    model_ready: modelReady,
    ffmpeg_ready: ffmpegReady,
    native_picker: nativePicker,
    models: models as HelperModel[],
  }
}

const HELPER_PHASES = new Set([
  "queued",
  "downloading",
  "extracting",
  "transcribing",
  "complete",
  "error",
  "cancelled",
])

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function parseProgressStatus(value: unknown): ServerJobStatus | null {
  if (!isPlainObject(value)) return null
  if (!validOpaqueId(value.id) || typeof value.phase !== "string") return null
  if (!HELPER_PHASES.has(value.phase)) return null
  if (value.phase === "complete" && !hasOwn(value, "segments")) return null
  if (
    hasOwn(value, "progress") &&
    (typeof value.progress !== "number" ||
      !Number.isFinite(value.progress) ||
      value.progress < 0 ||
      value.progress > 100)
  )
    return null
  for (const key of ["message", "text", "error"]) {
    if (hasOwn(value, key) && typeof value[key] !== "string") return null
  }
  if (hasOwn(value, "segments")) {
    if (!Array.isArray(value.segments)) return null
    if (
      value.segments.some(
        (segment) =>
          !isPlainObject(segment) ||
          typeof segment.start !== "number" ||
          !Number.isFinite(segment.start) ||
          typeof segment.end !== "number" ||
          !Number.isFinite(segment.end) ||
          typeof segment.text !== "string"
      )
    )
      return null
  }
  // SAFETY: every accepted field was structurally validated above.
  return value as unknown as ServerJobStatus
}

function parseSelection(value: unknown): HelperSelection | null {
  if (!isPlainObject(value)) return null
  const { id, filename, size_bytes: sizeBytes, extension } = value
  if (
    !validOpaqueId(id) ||
    typeof filename !== "string" ||
    filename.length === 0 ||
    /[\\/]/.test(filename) ||
    typeof sizeBytes !== "number" ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 0 ||
    (extension !== null &&
      (typeof extension !== "string" ||
        extension.length === 0 ||
        /[^a-zA-Z0-9]/.test(extension)))
  )
    return null
  return { id, filename, size_bytes: sizeBytes, extension }
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
    const data = await this.request<unknown>(
      `${baseUrl}${API_PREFIX}/capabilities`,
      { method: "GET", headers: this.authHeaders() }
    )
    return parseCapabilities(data)
  }

  async checkForUpdate(): Promise<HelperUpdate | null> {
    const baseUrl = await this.requireBaseUrl()
    const data = await this.request<unknown>(`${baseUrl}${API_PREFIX}/update`, {
      method: "GET",
      headers: this.authHeaders(),
    })
    return parseUpdate(data)
  }

  async installUpdate(): Promise<HelperUpdate | null> {
    const baseUrl = await this.requireBaseUrl()
    const data = await this.request<unknown>(
      `${baseUrl}${API_PREFIX}/update/install`,
      { method: "POST", headers: this.authHeaders() }
    )
    return parseUpdate(data)
  }

  async selectFiles(): Promise<HelperSelection[]> {
    const baseUrl = await this.requireBaseUrl()
    const response = await fetch(`${baseUrl}${API_PREFIX}/select-files`, {
      method: "POST",
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(30_000),
    })
    if (response.status === 204) return []
    if (!response.ok)
      throw new Error(`Helper file selection failed: ${response.status}`)
    const data: unknown = await response.json()
    if (!isPlainObject(data) || !Array.isArray(data.selections))
      throw new Error("Helper returned invalid file selections.")
    const selections = data.selections.map(parseSelection)
    if (selections.some((selection) => selection === null))
      throw new Error("Helper returned invalid file selections.")
    return selections as HelperSelection[]
  }

  async deleteSelection(id: string): Promise<void> {
    const baseUrl = await this.requireBaseUrl()
    const response = await fetch(
      `${baseUrl}${API_PREFIX}/selections/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    )
    if (!response.ok)
      throw new Error(`Helper selection removal failed: ${response.status}`)
  }

  async startSelection(
    id: string,
    language: LanguageCode,
    modelId: string,
    experimentalVad = false
  ): Promise<{ jobId: string }> {
    const baseUrl = await this.requireBaseUrl()
    const response = await fetch(
      `${baseUrl}${API_PREFIX}/transcribe-selection`,
      {
        method: "POST",
        headers: { ...this.authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          selection_id: id,
          language,
          model: modelId,
          experimental_vad: experimentalVad,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    )
    if (!response.ok)
      throw new Error(`Helper transcription start failed: ${response.status}`)
    const data: unknown = await response.json()
    if (!isPlainObject(data) || !validOpaqueId(data.job_id))
      throw new Error("Helper returned an invalid transcription job.")
    return { jobId: data.job_id }
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
            if (!terminal)
              throw new Error("Helper progress stream ended early.")
            break
          }
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith("data: ")) continue
            try {
              const value = JSON.parse(trimmed.slice(6))
              const status = parseProgressStatus(value)
              if (!status) {
                if (isPlainObject(value) && value.phase === "complete")
                  throw new Error(
                    "Helper progress complete status has invalid segments."
                  )
                continue
              }
              if (status.id !== jobId) continue
              terminal = ["complete", "error", "cancelled"].includes(
                status.phase
              )
              onStatus(status)
            } catch (caught) {
              if (
                caught instanceof Error &&
                caught.message ===
                  "Helper progress complete status has invalid segments."
              )
                throw caught
              /* skip malformed non-terminal events */
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
      { method: "GET", headers: this.authHeaders() }
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
