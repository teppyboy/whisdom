import type { LanguageCode } from "@/features/transcription/types"

export type ServerCapabilities = {
  available: boolean
  models: string[]
  quota: "unknown" | "ok" | "exhausted"
}

export async function loadServerCapabilities(): Promise<ServerCapabilities> {
  const baseUrl = import.meta.env.VITE_CF_WORKER_URL
  if (!baseUrl) {
    return { available: false, models: [], quota: "unknown" }
  }

  try {
    const response = await fetch(`${baseUrl}/api/capabilities`)
    if (!response.ok) {
      return { available: false, models: [], quota: "unknown" }
    }

    return response.json() as Promise<ServerCapabilities>
  } catch {
    return { available: false, models: [], quota: "unknown" }
  }
}

export async function transcribeChunkWithServer(args: {
  audio: Blob
  language: LanguageCode
  accessToken: string
}) {
  const baseUrl = import.meta.env.VITE_CF_WORKER_URL
  if (!baseUrl) {
    throw new Error("Server transcription is not configured.")
  }

  const form = new FormData()
  form.set("audio", args.audio)
  form.set("language", args.language)

  const response = await fetch(`${baseUrl}/api/transcribe-chunk`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
    },
    body: form,
  })

  if (!response.ok) {
    throw new Error(`Server transcription failed: ${response.status}`)
  }

  return response.json() as Promise<{ text: string; vtt?: string }>
}
