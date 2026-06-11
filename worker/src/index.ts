export interface Env {
  AI: Ai
  ALLOWED_ORIGIN: string
  ALLOWED_EMAILS: string
  ALLOWED_DOMAINS: string
}

const MODELS = ["@cf/openai/whisper-large-v3-turbo", "@cf/openai/whisper"]

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) })
    }

    const url = new URL(request.url)

    if (url.pathname === "/api/capabilities" && request.method === "GET") {
      return json(env, { available: true, models: MODELS, quota: "unknown" })
    }

    if (url.pathname === "/api/auth/check" && request.method === "POST") {
      const identity = await readIdentity(request)
      return json(env, { authorized: isAllowed(identity.email, env) })
    }

    if (url.pathname === "/api/transcribe-chunk" && request.method === "POST") {
      const identity = await readIdentity(request)
      if (!isAllowed(identity.email, env)) {
        return json(env, { error: "unauthorized" }, 403)
      }

      const form = await request.formData()
      const audio = form.get("audio")
      const language = form.get("language")
      if (!(audio instanceof File)) {
        return json(env, { error: "audio file missing" }, 400)
      }

      if (audio.size > 10 * 1024 * 1024) {
        return json(env, { error: "chunk too large" }, 413)
      }

      const audioBase64 = arrayBufferToBase64(await audio.arrayBuffer())
      const result = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
        audio: audioBase64,
        task: "transcribe",
        language: language === "en" || language === "vi" ? language : undefined,
        vad_filter: true,
      })

      return json(env, result)
    }

    return json(env, { error: "not found" }, 404)
  },
}

async function readIdentity(request: Request) {
  const header = request.headers.get("authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : ""
  if (!token) {
    return { email: "" }
  }

  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`
    )
    if (!response.ok) {
      return { email: "" }
    }

    const decoded = (await response.json()) as { email?: string; email_verified?: "true" | boolean }
    return decoded.email_verified === true || decoded.email_verified === "true"
      ? { email: decoded.email ?? "" }
      : { email: "" }
  } catch {
    return { email: "" }
  }
}

function isAllowed(email: string, env: Env) {
  if (!email) {
    return false
  }

  const allowedEmails = env.ALLOWED_EMAILS.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)
  const allowedDomains = env.ALLOWED_DOMAINS.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)
  const normalized = email.toLowerCase()
  const domain = normalized.split("@")[1] ?? ""

  return allowedEmails.includes(normalized) || allowedDomains.includes(domain)
}

function json(env: Env, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(env),
    },
  })
}

function corsHeaders(env: Env) {
  return {
    "access-control-allow-origin": env.ALLOWED_ORIGIN,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ""

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return btoa(binary)
}
