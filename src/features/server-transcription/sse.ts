import type { ServerJobStatus } from "./types"

export interface SseConnection {
  unsubscribe: () => void
}

export function subscribeProgress(
  url: string,
  jobId: string,
  accessToken: string,
  onStatus: (status: ServerJobStatus) => void,
): SseConnection {
  const controller = new AbortController()

  void (async () => {
    try {
      const response = await fetch(`${url}/api/progress/${encodeURIComponent(jobId)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "text/event-stream",
        },
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith("data: ")) {
            const json = trimmed.slice(6)
            try {
              const status: ServerJobStatus = JSON.parse(json)
              onStatus(status)
            } catch {
              // skip malformed lines
            }
          }
        }
      }
    } catch {
      // connection closed or aborted
    }
  })()

  return {
    unsubscribe: () => controller.abort(),
  }
}
