import type { ServerCapabilities, ServerJobStatus, TranscribeInput } from "./types"
import { subscribeProgress, type SseConnection } from "./sse"

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
      return (await response.json()) as ServerCapabilities
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
