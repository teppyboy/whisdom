import type { LanguageCode } from "@/features/transcription/types"
import type { SseConnection } from "@/features/server-transcription/sse"
import type {
  HelperCacheClearResult,
  HelperCacheStatus,
  HelperCapabilities,
  HelperDiagnostics,
  HelperDiagnosticsModel,
  HelperEventHandlers,
  HelperFeatureFlags,
  HelperHealth,
  HelperHelloEvent,
  HelperJobEvent,
  HelperLogEvent,
  HelperModel,
  HelperPairResponse,
  HelperProgressEvent,
  HelperSelection,
  HelperStreamJobStatus,
  HelperStreamPhase,
  HelperUpdate,
  HelperUpdateDependenciesResult,
  HelperUpdateScope,
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
const HELPER_BACKENDS = new Set([
  "cpu",
  "directml",
  "vulkan",
  "metal",
  "unavailable",
])
const HELPER_LOADED_BACKENDS = new Set(["cpu", "vulkan", "metal"])
const HELPER_OS = new Set(["macos", "windows", "linux"])
const HELPER_STREAM_PHASES = new Set<HelperStreamPhase>([
  "download_model",
  "ffmpeg",
  "convert",
  "transcribe",
  "deps",
  "other",
])
const HELPER_JOB_STATUSES = new Set<HelperStreamJobStatus>([
  "queued",
  "running",
  "complete",
  "failed",
  "cancelled",
])
const HELPER_LOG_LEVELS = new Set(["info", "warn", "error"])
const EVENTS_BACKOFF_START_MS = 500
const EVENTS_BACKOFF_MAX_MS = 10_000
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
    active_backend: rawActiveBackend = legacy?.activeBackend,
  } = value
  const activeBackend =
    rawActiveBackend === null ? "unavailable" : rawActiveBackend
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

function parseFeatureFlags(value: unknown): HelperFeatureFlags | null {
  if (!isPlainObject(value)) return null
  const { vulkan, metal, directml } = value
  if (
    typeof vulkan !== "boolean" ||
    typeof metal !== "boolean" ||
    typeof directml !== "boolean"
  )
    return null
  return { vulkan, metal, directml }
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
    active_backend: activeBackend,
    preferred_backend: preferredBackend,
  } = value
  if (
    typeof available !== "boolean" ||
    (experimentalVad !== undefined && typeof experimentalVad !== "boolean") ||
    typeof engine !== "string" ||
    typeof accelerator !== "string" ||
    !validOpaqueId(modelId) ||
    typeof modelReady !== "boolean" ||
    typeof ffmpegReady !== "boolean" ||
    typeof nativePicker !== "boolean" ||
    (activeBackend !== undefined &&
      activeBackend !== null &&
      (typeof activeBackend !== "string" || !HELPER_BACKENDS.has(activeBackend))) ||
    (preferredBackend !== undefined &&
      preferredBackend !== null &&
      typeof preferredBackend !== "string")
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
    active_backend:
      activeBackend === undefined
        ? undefined
        : (activeBackend as HelperCapabilities["active_backend"]),
    preferred_backend: preferredBackend as string | undefined,
    models: models as HelperModel[],
  }
}

function parseDiagnosticsModel(value: unknown): HelperDiagnosticsModel | null {
  if (!isPlainObject(value)) return null
  const {
    id,
    label,
    installed,
    engine,
    size_bytes: sizeBytes,
    active_backend: activeBackend,
  } = value
  if (
    !validOpaqueId(id) ||
    typeof label !== "string" ||
    label.length === 0 ||
    /[\\/]/.test(label) ||
    typeof installed !== "boolean" ||
    typeof engine !== "string" ||
    !HELPER_ENGINES.has(engine) ||
    typeof sizeBytes !== "number" ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 0 ||
    (activeBackend !== null &&
      (typeof activeBackend !== "string" ||
        !HELPER_LOADED_BACKENDS.has(activeBackend)))
  )
    return null
  return {
    id,
    label,
    installed,
    engine: engine as HelperDiagnosticsModel["engine"],
    size_bytes: sizeBytes,
    active_backend: activeBackend as HelperDiagnosticsModel["active_backend"],
  }
}

function parseDiagnostics(value: unknown): HelperDiagnostics {
  if (!isPlainObject(value))
    throw new Error("Helper returned invalid diagnostics.")
  const {
    protocol_version: protocolVersion,
    os,
    arch,
    features,
    active_backend: activeBackend,
    preferred_backend: preferredBackend,
    ffmpeg,
    models,
  } = value
  if (
    typeof protocolVersion !== "number" ||
    !Number.isSafeInteger(protocolVersion) ||
    typeof os !== "string" ||
    !HELPER_OS.has(os) ||
    typeof arch !== "string" ||
    arch.length === 0 ||
    arch.length > 64 ||
    (activeBackend !== null &&
      (typeof activeBackend !== "string" ||
        !HELPER_LOADED_BACKENDS.has(activeBackend))) ||
    typeof preferredBackend !== "string" ||
    preferredBackend.length === 0 ||
    !isPlainObject(ffmpeg) ||
    !Array.isArray(models)
  )
    throw new Error("Helper returned invalid diagnostics.")
  const parsedFeatures = parseFeatureFlags(features)
  if (!parsedFeatures)
    throw new Error("Helper returned invalid diagnostics.")
  const {
    installed,
    version,
    source_url: sourceUrl,
  } = ffmpeg as Record<string, unknown>
  if (
    typeof installed !== "boolean" ||
    (version !== null && typeof version !== "string") ||
    typeof sourceUrl !== "string"
  )
    throw new Error("Helper returned invalid diagnostics.")
  const parsedModels = models.map(parseDiagnosticsModel)
  if (parsedModels.some((model) => model === null))
    throw new Error("Helper returned invalid diagnostics.")
  return {
    protocol_version: protocolVersion,
    os: os as HelperDiagnostics["os"],
    arch,
    features: parsedFeatures,
    active_backend:
      activeBackend as HelperDiagnostics["active_backend"],
    preferred_backend: preferredBackend,
    ffmpeg: {
      installed,
      version: version as string | null,
      source_url: sourceUrl,
    },
    models: parsedModels as HelperDiagnosticsModel[],
  }
}

function parseHelloEvent(value: unknown): HelperHelloEvent | null {
  if (!isPlainObject(value)) return null
  const {
    protocol_version: protocolVersion,
    features,
    preferred_backend: preferredBackend,
  } = value
  const parsedFeatures = parseFeatureFlags(features)
  if (
    typeof protocolVersion !== "number" ||
    !Number.isSafeInteger(protocolVersion) ||
    !parsedFeatures ||
    typeof preferredBackend !== "string" ||
    preferredBackend.length === 0
  )
    return null
  return {
    kind: "hello",
    protocol_version: protocolVersion,
    features: parsedFeatures,
    preferred_backend: preferredBackend,
  }
}

function parseLogEvent(value: unknown): HelperLogEvent | null {
  if (!isPlainObject(value)) return null
  const {
    ts,
    level,
    target,
    message,
    job_id: jobId,
  } = value
  if (
    typeof ts !== "string" ||
    typeof level !== "string" ||
    !HELPER_LOG_LEVELS.has(level) ||
    typeof target !== "string" ||
    typeof message !== "string" ||
    (jobId !== undefined && !validOpaqueId(jobId))
  )
    return null
  return {
    kind: "log",
    ts,
    level: level as HelperLogEvent["level"],
    target,
    message,
    ...(jobId === undefined ? {} : { job_id: jobId }),
  }
}

function parseProgressEvent(value: unknown): HelperProgressEvent | null {
  if (!isPlainObject(value)) return null
  const {
    job_id: jobId,
    phase,
    percent,
    message,
    detail,
  } = value
  if (
    !validOpaqueId(jobId) ||
    typeof phase !== "string" ||
    !HELPER_STREAM_PHASES.has(phase as HelperStreamPhase) ||
    (percent !== null &&
      (typeof percent !== "number" ||
        !Number.isFinite(percent) ||
        percent < 0 ||
        percent > 1)) ||
    typeof message !== "string" ||
    (detail !== undefined && typeof detail !== "string")
  )
    return null
  return {
    kind: "progress",
    job_id: jobId,
    phase: phase as HelperStreamPhase,
    percent,
    message,
    ...(detail === undefined ? {} : { detail }),
  }
}

function parseJobEvent(value: unknown): HelperJobEvent | null {
  if (!isPlainObject(value)) return null
  const { job_id: jobId, status, error } = value
  if (
    !validOpaqueId(jobId) ||
    typeof status !== "string" ||
    !HELPER_JOB_STATUSES.has(status as HelperStreamJobStatus) ||
    (error !== undefined && typeof error !== "string")
  )
    return null
  return {
    kind: "job",
    job_id: jobId,
    status: status as HelperStreamJobStatus,
    ...(error === undefined ? {} : { error }),
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

  async getDiagnostics(): Promise<HelperDiagnostics> {
    const baseUrl = await this.requireBaseUrl()
    const data = await this.request<unknown>(
      `${baseUrl}${API_PREFIX}/diagnostics`,
      { method: "GET", headers: this.authHeaders() }
    )
    return parseDiagnostics(data)
  }

  async updateDependencies(
    scope: HelperUpdateScope
  ): Promise<HelperUpdateDependenciesResult> {
    const baseUrl = await this.requireBaseUrl()
    const response = await fetch(
      `${baseUrl}${API_PREFIX}/update-dependencies`,
      {
        method: "POST",
        headers: { ...this.authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    )
    if (!response.ok)
      throw new Error(`Helper dependency update failed: ${response.status}`)
    const data: unknown = await response.json()
    if (!isPlainObject(data) || !validOpaqueId(data.job_id))
      throw new Error("Helper returned an invalid dependency update job.")
    return { job_id: data.job_id }
  }

  async awaitJobResult(jobId: string): Promise<ServerJobStatus> {
    const baseUrl = await this.requireBaseUrl()
    const response = await fetch(
      `${baseUrl}${API_PREFIX}/progress/${encodeURIComponent(jobId)}`,
      {
        headers: { ...this.authHeaders(), Accept: "text/event-stream" },
      }
    )
    if (!response.ok)
      throw new Error(`Helper job result failed: ${response.status}`)
    if (!response.body) throw new Error("Helper job result returned no body.")
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith("data: ")) continue
          let parsed: unknown
          try {
            parsed = JSON.parse(trimmed.slice(6))
          } catch {
            continue
          }
          const status = parseProgressStatus(parsed)
          if (!status || status.id !== jobId) continue
          if (
            status.phase === "complete" ||
            status.phase === "error" ||
            status.phase === "cancelled"
          )
            return status
        }
      }
    } finally {
      reader.releaseLock()
    }
    throw new Error("Helper job stream ended before completion.")
  }

  subscribeEvents(
    handlers: HelperEventHandlers,
    onError?: (error: Error) => void
  ): SseConnection {
    const controller = new AbortController()
    void (async () => {
      let backoffMs = EVENTS_BACKOFF_START_MS
      while (!controller.signal.aborted) {
        let source: EventSource | null = null
        try {
          const baseUrl = await this.requireBaseUrl()
          const token = localStorage.getItem(TOKEN_KEY)
          const url = `${baseUrl}${API_PREFIX}/events${
            token ? `?token=${encodeURIComponent(token)}` : ""
          }`
          if (typeof EventSource === "undefined")
            throw new Error("EventSource is not supported in this environment.")
          source = new EventSource(url)
          const dispatch = (eventName: string, raw: unknown) => {
            if (typeof raw !== "string") return
            let value: unknown
            try {
              value = JSON.parse(raw)
            } catch {
              return
            }
            if (eventName === "hello") {
              const event = parseHelloEvent(value)
              if (event) handlers.onHello?.(event)
            } else if (eventName === "log") {
              const event = parseLogEvent(value)
              if (event) handlers.onLog?.(event)
            } else if (eventName === "progress") {
              const event = parseProgressEvent(value)
              if (event) handlers.onProgress?.(event)
            } else if (eventName === "job") {
              const event = parseJobEvent(value)
              if (event) handlers.onJob?.(event)
            }
          }
          source.addEventListener("hello", (event) =>
            dispatch("hello", (event as MessageEvent).data)
          )
          source.addEventListener("log", (event) =>
            dispatch("log", (event as MessageEvent).data)
          )
          source.addEventListener("progress", (event) =>
            dispatch("progress", (event as MessageEvent).data)
          )
          source.addEventListener("job", (event) =>
            dispatch("job", (event as MessageEvent).data)
          )
          await new Promise<never>((_resolve, reject) => {
            source!.onopen = () => {
              backoffMs = EVENTS_BACKOFF_START_MS
              handlers.onOpen?.()
            }
            source!.onerror = () =>
              reject(new Error("Helper event stream disconnected."))
            controller.signal.addEventListener(
              "abort",
              () => reject(new Error("Helper event stream unsubscribed.")),
              { once: true }
            )
          })
        } catch (caught) {
          source?.close()
          if (controller.signal.aborted) return
          onError?.(
            caught instanceof Error ? caught : new Error(String(caught))
          )
        }
        source?.close()
        if (controller.signal.aborted) return
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, backoffMs)
          controller.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer)
              resolve(undefined)
            },
            { once: true }
          )
        })
        backoffMs = Math.min(backoffMs * 2, EVENTS_BACKOFF_MAX_MS)
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
