import type { LanguageCode } from "@/features/transcription/types"

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
