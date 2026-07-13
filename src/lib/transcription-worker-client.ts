import type {
  LanguageCode,
  TranscriptSegment,
  TranscriptionProgress,
} from "@/features/transcription/types"
import type { LocalModelDtype } from "@/features/transcription/models"
import { createId } from "@/lib/id"

type WorkerMessage =
  | { type: "progress"; id: string; progress: TranscriptionProgress }
  | {
      type: "complete"
      id: string
      result: { text?: string; chunks?: Array<{ timestamp?: [number, number]; text: string }> }
    }
  | { type: "error"; id: string; error: string }

type ActiveTranscription = {
  id: string
  onProgress: (progress: TranscriptionProgress) => void
  resolve: (result: { text: string; segments: TranscriptSegment[] }) => void
  reject: (error: Error) => void
}

let transcriptionWorker: Worker | null = null
let activeTranscription: ActiveTranscription | null = null
let ffmpegWorker: Worker | null = null
let activeConversion:
    | {
      id: string
      onProgress: (progress: TranscriptionProgress) => void
      resolve: (blob: Blob) => void
      reject: (error: Error) => void
    }
  | null = null

export function clearLocalWorkerState() {
  if (activeTranscription || activeConversion) {
    throw new Error("Cannot clear active local processing workers.")
  }

  transcriptionWorker?.terminate()
  ffmpegWorker?.terminate()
  transcriptionWorker = null
  ffmpegWorker = null
}

export function transcribeLocally(args: {
  file: File | Blob
  modelId: string
  language: LanguageCode
  device: "webgpu" | "wasm"
  dtype: LocalModelDtype
  onProgress: (progress: TranscriptionProgress) => void
}) {
  return new Promise<{ text: string; segments: TranscriptSegment[] }>((resolve, reject) => {
    if (activeTranscription) {
      reject(new Error("A local transcription is already running."))
      return
    }

    const worker = getTranscriptionWorker()
    const requestId = createId("transcription")

    activeTranscription = {
      id: requestId,
      onProgress: args.onProgress,
      resolve,
      reject,
    }

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.id !== activeTranscription?.id) {
        return
      }

      if (event.data.type === "progress") {
        activeTranscription.onProgress(event.data.progress)
        return
      }

      if (event.data.type === "error") {
        const current = activeTranscription
        activeTranscription = null
        current.reject(new Error(event.data.error))
        return
      }

      const rawText = cleanTranscriptText(event.data.result.text ?? "")
      const chunkSegments = event.data.result.chunks
        ?.map((chunk, index) => ({
          id: createId("segment"),
          start: chunk.timestamp?.[0] ?? index * 30,
          end: chunk.timestamp?.[1] ?? index * 30 + 30,
          text: cleanTranscriptText(chunk.text),
        }))
        .filter((segment) => segment.text.length > 1)
      const segments = chunkSegments?.length
        ? chunkSegments
        : [
            {
              id: createId("segment"),
              start: 0,
              end: 0,
              text: rawText,
            },
          ].filter((segment) => segment.text.length > 0)
      const text = segments.length > 0 ? segments.map((segment) => segment.text).join(" ") : rawText

      const current = activeTranscription
      activeTranscription = null
      current.resolve({ text, segments })
    }

    worker.onerror = (event) => {
      const current = activeTranscription

      transcriptionWorker?.terminate()
      transcriptionWorker = null
      activeTranscription = null
      current?.reject(new Error(event.message))
    }

    void decodeAudioForWhisper(args.file)
      .then((audio) => {
        args.onProgress({ phase: "preparing-media", message: "Decoded audio for Whisper", progress: 0.28 })
        worker.postMessage(
          {
            type: "transcribe",
            id: requestId,
            audio,
            modelId: args.modelId,
            language: args.language,
            device: args.device,
            dtype: args.dtype,
          },
          [audio.buffer]
        )
      })
      .catch((error: unknown) => {
        const details = error instanceof Error
          ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
          : String(error)
        console.error("[decodeAudioForWhisper]", details)
        activeTranscription = null
        const msg = error instanceof Error
          ? `${error.message} (audio decoding failed)`
          : "Unable to decode audio data"
        reject(new Error(msg, { cause: error }))
      })
  })
}

function getTranscriptionWorker() {
  if (!transcriptionWorker) {
    transcriptionWorker = new Worker(new URL("../workers/transcription.worker.ts", import.meta.url), {
      type: "module",
    })
  }

  return transcriptionWorker
}

async function decodeAudioForWhisper(file: File | Blob) {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

  if (!AudioContextConstructor) {
    throw new Error("Audio decoding is not supported in this browser.")
  }

  const context = new AudioContextConstructor()
  const decoded = await context.decodeAudioData(await file.arrayBuffer())
  await context.close()
  const resampled = decoded.sampleRate === 16_000 ? decoded : await resampleAudio(decoded, 16_000)

  return mixToMono(resampled)
}

async function resampleAudio(buffer: AudioBuffer, sampleRate: number) {
  const frameCount = Math.ceil(buffer.duration * sampleRate)
  const offlineContext = new OfflineAudioContext(buffer.numberOfChannels, frameCount, sampleRate)
  const source = offlineContext.createBufferSource()

  source.buffer = buffer
  source.connect(offlineContext.destination)
  source.start()

  return offlineContext.startRendering()
}

function mixToMono(buffer: AudioBuffer) {
  if (buffer.numberOfChannels === 1) {
    return new Float32Array(buffer.getChannelData(0))
  }

  const mono = new Float32Array(buffer.length)

  for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex)

    for (let sampleIndex = 0; sampleIndex < channel.length; sampleIndex += 1) {
      mono[sampleIndex] += channel[sampleIndex] / buffer.numberOfChannels
    }
  }

  return mono
}

function cleanTranscriptText(text: string) {
  return text
    .replace(/\uFFFD/g, "")
    .replace(/\s+/g, " ")
    .replace(/^([A-Za-zÀ-ỹ])\s+(?=\1)/iu, "")
    .trim()
}

export function convertWithFfmpeg(args: {
  file: File
  onProgress: (progress: TranscriptionProgress) => void
}) {
  return new Promise<Blob>((resolve, reject) => {
    if (activeConversion) {
      reject(new Error("A media conversion is already running."))
      return
    }

    const worker = getFfmpegWorker()
    const requestId = createId("ffmpeg")

    activeConversion = {
      id: requestId,
      onProgress: args.onProgress,
      resolve,
      reject,
    }

    worker.onmessage = (event) => {
      const current = activeConversion

      if (!current || event.data.id !== current.id) {
        return
      }

      if (event.data.type === "progress") {
        current.onProgress({
          phase: "preparing-media",
          message: event.data.message,
          progress: event.data.progress,
          detail: event.data.detail,
        })
        return
      }

      if (event.data.type === "error") {
        activeConversion = null
        current.reject(new Error(event.data.error))
        return
      }

      activeConversion = null
      current.resolve(event.data.blob as Blob)
    }

    worker.onerror = (event) => {
      const current = activeConversion

      ffmpegWorker?.terminate()
      ffmpegWorker = null
      activeConversion = null
      current?.reject(new Error(event.message))
    }

    worker.postMessage({ type: "convert", id: requestId, file: args.file })
  })
}

function getFfmpegWorker() {
  if (!ffmpegWorker) {
    ffmpegWorker = new Worker(new URL("../workers/ffmpeg.worker.ts", import.meta.url), {
      type: "module",
    })
  }

  return ffmpegWorker
}
