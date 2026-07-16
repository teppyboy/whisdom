export type ServerJobPhase =
  | "queued"
  | "downloading"
  | "extracting"
  | "transcribing"
  | "complete"
  | "error"
  | "cancelled"

export interface ServerSegment {
  start: number
  end: number
  text: string
}

export interface ServerJobStatus {
  id: string
  phase: ServerJobPhase
  progress?: number
  message?: string
  text?: string
  segments?: ServerSegment[]
  error?: string
  filename?: string
}

export interface ServerModelInfo {
  id: string
  label: string
  size_mb: number
  quality: string
}

export interface ServerCapabilities {
  available: boolean
  engine: string
  input_types: string[]
  cpu_optimized: boolean
  models?: ServerModelInfo[]
  default_model?: string
}

export type TranscribeInput =
  | { type: "file"; file: Blob; filename: string }
  | { type: "url"; url: string }
