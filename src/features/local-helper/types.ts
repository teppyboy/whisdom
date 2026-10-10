import type { ServerJobStatus } from "@/features/server-transcription/types"

export type HelperHealth = {
  available: boolean
  protocol_version: number
  busy: boolean
}

export type HelperEngine = "whisper.cpp" | "sherpa-onnx" | "nemo-speech.cpp"
export type HelperBackend =
  | "cpu"
  | "directml"
  | "vulkan"
  | "metal"
  | "unavailable"
export type HelperLoadedBackend = "cpu" | "vulkan" | "metal"
export type HelperOs = "macos" | "windows" | "linux"
export type HelperFeatureFlags = {
  vulkan: boolean
  metal: boolean
  directml: boolean
}

export type HelperModel = {
  id: string
  label: string
  quality: string
  size_bytes: number
  installed: boolean
  engine: HelperEngine
  supported_languages: string[]
  supports_auto_language: boolean
  // null means nothing (or a different model) is loaded; the helper must not
  // claim "cpu" before inference starts.
  active_backend: HelperBackend | null
}

export type HelperCapabilities = {
  available: boolean
  experimental_vad: boolean
  engine: string
  accelerator: string
  model_id: string
  model_ready: boolean
  ffmpeg_ready: boolean
  native_picker: boolean
  active_backend?: HelperBackend | null
  preferred_backend?: string
  models: HelperModel[]
}

export type HelperDiagnosticsModel = {
  id: string
  label: string
  installed: boolean
  engine: HelperEngine
  size_bytes: number
  active_backend: HelperLoadedBackend | null
}

export type HelperDiagnostics = {
  protocol_version: number
  os: HelperOs
  arch: string
  features: HelperFeatureFlags
  active_backend: HelperLoadedBackend | null
  preferred_backend: string
  ffmpeg: { installed: boolean; version: string | null; source_url: string }
  models: HelperDiagnosticsModel[]
}

export type HelperUpdateScope = "ffmpeg" | "models" | "all"

export type HelperUpdateDependenciesResult = {
  job_id: string
}

export type HelperStreamPhase =
  | "download_model"
  | "ffmpeg"
  | "convert"
  | "transcribe"
  | "deps"
  | "other"

export type HelperStreamJobStatus =
  | "queued"
  | "running"
  | "complete"
  | "failed"
  | "cancelled"

export type HelperHelloEvent = {
  kind: "hello"
  protocol_version: number
  features: HelperFeatureFlags
  preferred_backend: string
}

export type HelperLogEvent = {
  kind: "log"
  ts: string
  level: "info" | "warn" | "error"
  target: string
  message: string
  job_id?: string
}

export type HelperProgressEvent = {
  kind: "progress"
  job_id: string
  phase: HelperStreamPhase
  percent: number | null
  message: string
  detail?: string
}

export type HelperJobEvent = {
  kind: "job"
  job_id: string
  status: HelperStreamJobStatus
  error?: string
}

export type HelperStreamEvent =
  | HelperHelloEvent
  | HelperLogEvent
  | HelperProgressEvent
  | HelperJobEvent

export type HelperEventHandlers = {
  onOpen?: () => void
  onHello?: (event: HelperHelloEvent) => void
  onLog?: (event: HelperLogEvent) => void
  onProgress?: (event: HelperProgressEvent) => void
  onJob?: (event: HelperJobEvent) => void
}

export type HelperPairResponse = {
  token: string
  protocol_version: number
}

export type HelperSelection = {
  id: string
  filename: string
  size_bytes: number
  extension: string | null
}

export type HelperCacheStatus = {
  model: { installed: boolean; bytes: number }
  ffmpeg: { installed: boolean; bytes: number }
  temp_bytes: number
  busy: boolean
}

export type HelperCacheClearResult = {
  model_deleted: boolean
  ffmpeg_deleted: boolean
  temp_deleted: boolean
}

export type HelperTranscriptionStatus = ServerJobStatus
