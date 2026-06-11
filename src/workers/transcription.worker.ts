import type { LanguageCode, TranscriptionProgress } from "@/features/transcription/types"
import type { LocalModelDtype } from "@/features/transcription/models"
import { toWhisperLanguageName } from "@/features/transcription/language"

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

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== "transcribe") {
    return
  }

  try {
    postProgress(event.data.id, { phase: "downloading-assets", message: "Loading Whisper model", progress: 0.05 })
    const { pipeline } = await import("@huggingface/transformers")
    const key = `${event.data.modelId}:${event.data.device}:${event.data.dtype}`

    if (!transcriber || loadedKey !== key) {
      transcriber = (await pipeline("automatic-speech-recognition", event.data.modelId, {
        device: event.data.device === "webgpu" ? "webgpu" : "wasm",
        dtype: event.data.dtype,
        progress_callback: (progress: { progress?: number; status?: string; file?: string }) => {
          postProgress(event.data.id, {
            phase: "downloading-assets",
            message: progress.file ? `Downloading ${progress.file}` : progress.status ?? "Preparing model",
            progress: progress.progress ? Math.min(progress.progress / 100, 0.95) : 0.15,
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
