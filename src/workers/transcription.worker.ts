import type { LanguageCode, TranscriptionProgress } from "@/features/transcription/types"
import type { LocalModelDtype } from "@/features/transcription/models"
import { toWhisperLanguageName } from "@/features/transcription/language"
import { MODEL_CACHE_KEY } from "@/features/storage/cleanup"

const ignoredWarnings = [
  "The powerPreference option is currently ignored when calling requestAdapter() on Windows",
]

const originalWarn = console.warn.bind(console)

console.warn = (...args: unknown[]) => {
  const message = args.map(String).join(" ")

  if (ignoredWarnings.some((warning) => message.includes(warning))) {
    return
  }

  originalWarn(...args)
}

type WorkerRequest = {
  type: "transcribe"
  id: string
  audio: Float32Array
  modelId: string
  language: LanguageCode
  device: "webgpu" | "wasm"
  dtype: LocalModelDtype
}

type PipelineResult = {
  text?: string
  chunks?: Array<{ timestamp?: [number, number]; text: string }>
}

let transcriber:
  | ((input: string | Blob | Float32Array, options?: Record<string, unknown>) => Promise<PipelineResult>)
  | null = null
let loadedKey = ""
let downloadProgress = new Map<string, number>()
let lastDownloadProgress = 0.05
let cacheConfigured = false
const cachedModelFiles = new Set<string>()

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== "transcribe") {
    return
  }

  try {
    postProgress(event.data.id, { phase: "downloading-assets", message: "Loading Whisper model", progress: 0.05 })
    const { pipeline, env } = await import("@huggingface/transformers")
    await configureTransformersCache(env)
    const key = `${event.data.modelId}:${event.data.device}:${event.data.dtype}`

    if (!transcriber || loadedKey !== key) {
      downloadProgress = new Map()
      lastDownloadProgress = 0.05
      transcriber = (await pipeline("automatic-speech-recognition", event.data.modelId, {
        device: event.data.device === "webgpu" ? "webgpu" : "wasm",
        dtype: event.data.dtype,
        progress_callback: (progress: { progress?: number; status?: string; file?: string }) => {
          const fileProgress = typeof progress.progress === "number" ? progress.progress / 100 : undefined

          if (progress.file && fileProgress !== undefined) {
            downloadProgress.set(progress.file, Math.min(1, Math.max(0, fileProgress)))
          }

          const averageProgress = downloadProgress.size > 0
            ? [...downloadProgress.values()].reduce((total, value) => total + value, 0) / downloadProgress.size
            : 0
          lastDownloadProgress = Math.max(
            lastDownloadProgress,
            Math.min(0.32, 0.05 + averageProgress * 0.27)
          )

          const fileIsCached = progress.file ? cachedModelFiles.has(progress.file) : false

          postProgress(event.data.id, {
            phase: "downloading-assets",
            message: progress.file
              ? fileIsCached
                ? "Using saved model assets"
                : "Downloading model assets"
              : progress.status ?? "Preparing model",
            progress: lastDownloadProgress,
            detail: progress.file
              ? {
                  id: `model:${progress.file}`,
                  message: fileIsCached ? `Using saved ${progress.file}` : `Downloading ${progress.file}`,
                  progress: fileProgress,
                }
              : {
                  id: "model:prepare",
                  message: progress.status ?? "Preparing model",
                },
          })
        },
      })) as typeof transcriber
      loadedKey = key
    } else {
      postProgress(event.data.id, {
        phase: "downloading-assets",
        message: "Reusing loaded Whisper model",
        progress: 0.32,
      })
    }

    if (!transcriber) {
      throw new Error("Whisper pipeline did not initialize.")
    }

    postProgress(event.data.id, { phase: "transcribing", message: "Transcribing audio", progress: 0.35 })
    const options: Record<string, unknown> = {
      chunk_length_s: 30,
      stride_length_s: 1,
      return_timestamps: true,
    }

    if (event.data.language !== "auto" && !event.data.modelId.endsWith(".en")) {
      options.language = toWhisperLanguageName(event.data.language)
      options.task = "transcribe"
    }

    const result = await transcriber(event.data.audio, options)

    self.postMessage({
      type: "complete",
      id: event.data.id,
      result,
    })
  } catch (error) {
    self.postMessage({
      type: "error",
      id: event.data.id,
      error: formatTranscriptionError(error),
    })
  }
}

async function configureTransformersCache(env: {
  allowLocalModels: boolean
  useBrowserCache: boolean
  useCustomCache: boolean
  useWasmCache: boolean
  cacheKey: string
  customCache: unknown
}) {
  if (cacheConfigured) {
    return
  }

  env.allowLocalModels = false
  env.useBrowserCache = true
  env.useWasmCache = true
  env.cacheKey = MODEL_CACHE_KEY

  if (typeof caches !== "undefined") {
    const cache = await caches.open(MODEL_CACHE_KEY)

    env.useCustomCache = true
    env.customCache = {
      async match(request: string) {
        const response = await cache.match(request)

        if (response) {
          const fileName = getModelFileName(request)

          if (fileName) {
            cachedModelFiles.add(fileName)
          }
        }

        return response
      },
      async put(request: string, response: Response) {
        await cache.put(request, response)
        const fileName = getModelFileName(request)

        if (fileName) {
          cachedModelFiles.add(fileName)
        }
      },
    }
  }

  void navigator.storage?.persist?.().catch(() => undefined)
  cacheConfigured = true
}

function getModelFileName(request: string) {
  try {
    const pathname = new URL(request).pathname
    const marker = "/resolve/"
    const resolveIndex = pathname.indexOf(marker)

    if (resolveIndex !== -1) {
      const parts = pathname.slice(resolveIndex + marker.length).split("/")
      return decodeURIComponent(parts.slice(1).join("/"))
    }

    return decodeURIComponent(pathname.split("/").pop() ?? "")
  } catch {
    return request.split("/").slice(-2).join("/")
  }
}

function postProgress(id: string, progress: TranscriptionProgress) {
  self.postMessage({ type: "progress", id, progress })
}

function formatTranscriptionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (
    message.includes("Array buffer allocation failed") ||
    message.includes("failed to allocate a buffer") ||
    message.includes("Can't create a session") ||
    error instanceof RangeError
  ) {
    return "Browser could not allocate enough memory for this Whisper model. Large models need WebGPU with quantized q4 weights; if this still fails, choose Whisper Small or use server-side transcription."
  }

  return message || "Transcription failed"
}
