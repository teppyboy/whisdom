import type { TranscriptDocument } from "@/features/transcription/types"

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata"

type TokenResponse = {
  access_token?: string
  error?: string
}

type TokenClient = {
  requestAccessToken: (overrideConfig?: { scope?: string; prompt?: string }) => void
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: TokenResponse) => void
          }) => TokenClient
        }
      }
    }
  }
}

export function isGoogleDriveConfigured() {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)
}

export async function requestDriveAccess(prompt = "consent"): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) {
    throw new Error("Google Drive is not configured. Add VITE_GOOGLE_CLIENT_ID.")
  }

  if (!window.google?.accounts?.oauth2) {
    throw new Error("Google Identity Services script is not loaded.")
  }

  return new Promise((resolve, reject) => {
    const client = window.google!.accounts!.oauth2!.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? "Google sign-in failed."))
          return
        }

        resolve(response.access_token)
      },
    })

    client.requestAccessToken({ scope: DRIVE_SCOPE, prompt })
  })
}

export async function uploadTranscriptMetadata(
  accessToken: string,
  document: TranscriptDocument
) {
  const metadata = {
    name: `${document.id}.json`,
    parents: ["appDataFolder"],
    mimeType: "application/json",
  }
  const body = new Blob(
    [
      new TextEncoder().encode(
        `--whisdom\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
          metadata
        )}\r\n--whisdom\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(
          document,
          null,
          2
        )}\r\n--whisdom--`
      ),
    ],
    { type: "multipart/related; boundary=whisdom" }
  )

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body,
    }
  )

  if (!response.ok) {
    throw new Error(`Drive upload failed: ${response.status}`)
  }

  return response.json() as Promise<{ id: string }>
}
