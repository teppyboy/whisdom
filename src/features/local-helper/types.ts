import type { ServerJobStatus } from "@/features/server-transcription/types"

export type HelperHealth = {
  available: boolean
  protocol_version: number
  busy: boolean
}

export type HelperCapabilities = {
  available: boolean
  engine: string
  accelerator: string
  model_id: string
  model_ready: boolean
  ffmpeg_ready: boolean
}

export type HelperPairResponse = {
  token: string
  protocol_version: number
}

export type HelperPickAndTranscribeResponse = {
  job_id: string
  filename: string
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
