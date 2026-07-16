import type { ServerCapabilities, ServerJobStatus, ServerModelInfo, TranscribeInput } from "./types"
import { subscribeProgress, type SseConnection } from "./sse"

function isServerModelInfo(value: unknown): value is ServerModelInfo {
  if (typeof value !== "object" || value === null) return false
  const model = value as Record<string, unknown>
  return (
    typeof model.id === "string" &&
    typeof model.label === "string" &&
    typeof model.size_mb === "number" &&
    Number.isFinite(model.size_mb) &&
    typeof model.quality === "string"
  )
}

function isServerCapabilities(value: unknown): value is ServerCapabilities {
  if (typeof value !== "object" || value === null) return false
  const capabilities = value as Record<string, unknown>
  return (
    typeof capabilities.available === "boolean" &&
    typeof capabilities.engine === "string" &&
    Array.isArray(capabilities.input_types) &&
    capabilities.input_types.every((inputType) => typeof inputType === "string") &&
    typeof capabilities.cpu_optimized === "boolean" &&
    Array.isArray(capabilities.models) &&
    capabilities.models.every(isServerModelInfo) &&
    typeof capabilities.default_model === "string"
  )
}

export class ServerTranscriptionApi {
  private baseUrl: string
  private getToken: () => string | null

  constructor(baseUrl: string, getToken: () => string | null) {
    this.baseUrl = baseUrl
    this.getToken = getToken
  }

  async getCapabilities(): Promise<ServerCapabilities | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/capabilities`)
      if (!response.ok) return null
      const capabilities: unknown = await response.json()
      return isServerCapabilities(capabilities) ? capabilities : null
    } catch {
      return null
    }
  }

  async submitJob(input: TranscribeInput, language?: string, modelId?: string): Promise<string> {
    const token = this.getToken()
    if (!token) throw new Error("Not authenticated")

    const form = new FormData()

    if (input.type === "file") {
      if (input.file.size === 0) {
        throw new Error("File is empty")
      }
      console.debug("[ServerTranscriptionApi] submitting file:", input.filename, input.file.size, input.file.type)
      form.append("audio", input.file, input.filename)
    } else {
      form.set("url", input.url)
    }

    if (language) {
      form.set("language", language)
    }

    if (modelId) {
      form.set("model", modelId)
    }

    const response = await fetch(`${this.baseUrl}/api/transcribe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "unknown" }))
      throw new Error((err as { error?: string }).error ?? `Server error: ${response.status}`)
    }

    const data = (await response.json()) as { job_id: string }
    return data.job_id
  }

  subscribeProgress(jobId: string, onStatus: (status: ServerJobStatus) => void): SseConnection {
    const token = this.getToken()
    if (!token) throw new Error("Not authenticated")

    return subscribeProgress(this.baseUrl, jobId, token, onStatus)
  }

  async cancelJob(jobId: string): Promise<void> {
    const token = this.getToken()
    if (!token) throw new Error("Not authenticated")

    const response = await fetch(
      `${this.baseUrl}/api/cancel/${encodeURIComponent(jobId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    if (!response.ok) {
      throw new Error(`Failed to cancel job: ${response.status}`)
    }
  }
}
