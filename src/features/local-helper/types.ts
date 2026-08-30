import type { ServerJobStatus } from "@/features/server-transcription/types"

export type HelperHealth = {
  available: boolean
  protocol_version: number
  busy: boolean
}

export type HelperEngine = "whisper.cpp" | "sherpa-onnx" | "nemo-speech.cpp"
export type HelperBackend = "cpu" | "directml" | "vulkan" | "unavailable"

export type HelperUpdate = {
  version: string
  body: string | null
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
  active_backend: HelperBackend
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
  models: HelperModel[]
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
