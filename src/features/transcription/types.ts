export type LanguageCode = "auto" | (string & {})

export type UiLanguage = "en" | "vi"

export type ProcessingMode = "local-webgpu" | "cloudflare-ai" | "local-wasm" | "server"

export type JobState =
  | "idle"
  | "analyzing"
  | "awaiting-confirmation"
  | "downloading-assets"
  | "preparing-media"
  | "chunking"
  | "transcribing"
  | "saving"
  | "complete"
  | "error"
  | "cancelled"

export type WhisperModel = {
  id: string
  label: string
  sizeMb: number
  quality: "fast" | "balanced" | "high"
  multilingual: boolean
  notes: string
}

export type MediaAnalysis = {
  fileName: string
  fileType: string
  fileSize: number
  duration: number | null
  isVideo: boolean
  needsFfmpeg: boolean
  recommendedMode: ProcessingMode
  memoryRisk: "low" | "medium" | "high"
  estimatedDecodedMb: number | null
  chunkPlan: ChunkPlan
  requiredAssets: DownloadAsset[]
  warnings: string[]
}

export type ChunkPlan = {
  chunkSeconds: number
  overlapSeconds: number
  estimatedChunks: number
  serverChunkLimitMb: number
}

export type DownloadAsset = {
  id: string
  label: string
  sizeMb: number
  required: boolean
  status?: "unknown" | "cached" | "pending" | "downloading" | "ready" | "error"
  progress?: number
}

export type TranscriptSegment = {
  id: string
  start: number
  end: number
  text: string
}

export type TranscriptDocument = {
  id: string
  title: string
  sourceName: string
  language: LanguageCode
  modelId: string
  mode: ProcessingMode
  createdAt: string
  updatedAt: string
  text: string
  segments: TranscriptSegment[]
}

export type TranscriptionProgress = {
  phase: JobState
  message: string
  progress: number
  detail?: {
    id: string
    message: string
    progress?: number
  }
}

export type AppSettings = {
  uiLanguage: UiLanguage
  modelId: string
  language: LanguageCode
  mode: ProcessingMode
  chunkSeconds: number
  overlapSeconds: number
  persistMediaBlobs: boolean
}
