import { getLocalModelDtype, requiresWebGpuForLocalModel, findModel } from "@/features/transcription/models"
import { isEnglishOnlyLanguageMismatch } from "@/features/transcription/language"
import type {
  AppSettings,
  DownloadAsset,
  MediaAnalysis,
  ProcessingMode,
} from "@/features/transcription/types"

const VIDEO_TYPE_PATTERN = /^video\//
const AUDIO_TYPE_PATTERN = /^audio\//
const SERVER_CHUNK_LIMIT_MB = 10
const MEDIA_METADATA_TIMEOUT_MS = 5000

export async function analyzeMediaFile(
  file: File,
  settings: AppSettings
): Promise<MediaAnalysis> {
  const duration = await readMediaDuration(file)
  const isVideo = VIDEO_TYPE_PATTERN.test(file.type)
  const isAudio = AUDIO_TYPE_PATTERN.test(file.type)
  const model = findModel(settings.modelId)
  const isLocalMode = settings.mode === "local-webgpu" || settings.mode === "local-wasm"
  const needsFfmpeg = isVideo || (!isAudio && file.type !== "")
  const estimatedChunks = duration
    ? Math.max(1, Math.ceil(duration / settings.chunkSeconds))
    : 1
  const fileSizeMb = bytesToMb(file.size)
  const memoryRisk = fileSizeMb > 1500 ? "high" : fileSizeMb > 500 ? "medium" : "low"
  const estimatedDecodedMb = estimateDecodedMb(file, duration)
  const webGpuStatus = await getWebGpuStatus()
  const recommendedMode = recommendMode(settings.mode, needsFfmpeg, memoryRisk, webGpuStatus.available)
  const requiredAssets: DownloadAsset[] = isLocalMode
    ? [{
      id: model.id,
      label: model.label,
      sizeMb: model.sizeMb,
      required: true,
      status: "unknown",
    }]
    : []

  if (needsFfmpeg && settings.mode !== "server") {
    requiredAssets.push({
      id: "@ffmpeg/core",
      label: "ffmpeg.wasm core",
      sizeMb: 31,
      required: true,
      status: "unknown",
    })
  }

  const warnings = buildWarnings(file, settings, model.multilingual, needsFfmpeg, webGpuStatus)

  return {
    fileName: file.name,
    fileType: file.type || "unknown",
    fileSize: file.size,
    duration,
    isVideo,
    needsFfmpeg,
    recommendedMode,
    memoryRisk,
    estimatedDecodedMb,
    chunkPlan: {
      chunkSeconds: settings.chunkSeconds,
      overlapSeconds: settings.overlapSeconds,
      estimatedChunks,
      serverChunkLimitMb: SERVER_CHUNK_LIMIT_MB,
    },
    requiredAssets,
    warnings,
  }
}

function recommendMode(
  requestedMode: ProcessingMode,
  needsFfmpeg: boolean,
  memoryRisk: MediaAnalysis["memoryRisk"],
  webGpuAvailable: boolean
): ProcessingMode {
  if (requestedMode === "server") {
    return "server"
  }

  if (requestedMode === "local-wasm") {
    return "local-wasm"
  }

  if (requestedMode === "cloudflare-ai" && !needsFfmpeg && memoryRisk !== "high") {
    return "cloudflare-ai"
  }

  if (webGpuAvailable) {
    return "local-webgpu"
  }

  return "local-wasm"
}

function buildWarnings(
  file: File,
  settings: AppSettings,
  modelMultilingual: boolean,
  needsFfmpeg: boolean,
  webGpuStatus: WebGpuStatus
) {
  const warnings: string[] = []
  const copy = WARNING_COPY[settings.uiLanguage]

  if (
    (settings.mode === "local-webgpu" || settings.mode === "local-wasm") &&
    isEnglishOnlyLanguageMismatch(settings.language, settings.uiLanguage) &&
    !modelMultilingual
  ) {
    warnings.push(copy.englishOnly)
  }

  const model = findModel(settings.modelId)

  if (getLocalModelDtype(model) === "q4" && settings.mode !== "cloudflare-ai" && settings.mode !== "server") {
    warnings.push(copy.quantizedLargeModel)
  }

  if (
    settings.mode !== "cloudflare-ai" &&
    settings.mode !== "server" &&
    requiresWebGpuForLocalModel(model) &&
    recommendedModeFromStatus(settings.mode, needsFfmpeg, webGpuStatus.available) !== "local-webgpu"
  ) {
    warnings.push(copy.largeModelNeedsWebGpu)
  }

  if (settings.mode === "local-webgpu" && !webGpuStatus.available) {
    warnings.push(copy.webGpuUnavailable(webGpuStatus.reason))
  }

  if (needsFfmpeg && settings.mode !== "server") {
    warnings.push(copy.needsFfmpeg)
  }

  if (bytesToMb(file.size) > 100 && settings.mode === "cloudflare-ai") {
    warnings.push(copy.serverChunksOnly)
  }

  if (!settings.persistMediaBlobs) {
    warnings.push(copy.resumeRequiresFile)
  }

  return warnings
}

const WARNING_COPY = {
  en: {
    englishOnly: "Selected model is English-only. Choose a multilingual model for this language.",
    quantizedLargeModel: "Large local models use q4 ONNX weights in the browser to avoid multi-gigabyte buffer allocation.",
    largeModelNeedsWebGpu: "This large model requires WebGPU. Choose Whisper Small or use a secure WebGPU-capable browser.",
    webGpuUnavailable: (reason: string) => `WebGPU is unavailable (${reason}). Whisdom will use local WASM instead.`,
    needsFfmpeg: "Video or unsupported media needs ffmpeg.wasm before transcription.",
    serverChunksOnly: "Server mode sends audio chunks only. Full media stays in the browser.",
    resumeRequiresFile: "Resume after tab close will require re-picking the original file.",
  },
  vi: {
    englishOnly: "Mô hình đã chọn chỉ hỗ trợ tiếng Anh. Hãy chọn mô hình đa ngôn ngữ cho ngôn ngữ này.",
    quantizedLargeModel: "Mô hình lớn sẽ dùng trọng số ONNX q4 trong trình duyệt để tránh cấp phát bộ nhớ nhiều GB.",
    largeModelNeedsWebGpu: "Mô hình lớn này cần WebGPU. Hãy chọn Whisper Small hoặc dùng trình duyệt hỗ trợ WebGPU qua HTTPS/localhost.",
    webGpuUnavailable: (reason: string) => `Không thể dùng WebGPU (${reason}). Whisdom sẽ tự chuyển sang WASM cục bộ.`,
    needsFfmpeg: "Video hoặc định dạng chưa hỗ trợ cần ffmpeg.wasm trước khi chép lời.",
    serverChunksOnly: "Chế độ máy chủ chỉ gửi từng đoạn âm thanh. Tệp gốc vẫn ở trong trình duyệt.",
    resumeRequiresFile: "Sau khi đóng tab, bạn cần chọn lại tệp gốc để tiếp tục.",
  },
} as const

function recommendedModeFromStatus(
  requestedMode: ProcessingMode,
  needsFfmpeg: boolean,
  webGpuAvailable: boolean
) {
  return recommendMode(requestedMode, needsFfmpeg, "low", webGpuAvailable)
}

type NavigatorWithGpu = Navigator & {
  gpu?: {
    requestAdapter: () => Promise<unknown | null>
  }
}

export async function canUseWebGpu() {
  return (await getWebGpuStatus()).available
}

type WebGpuStatus = {
  available: boolean
  reason: string
}

export async function getWebGpuStatus(): Promise<WebGpuStatus> {
  if (typeof navigator === "undefined") {
    return { available: false, reason: "browser APIs are unavailable" }
  }

  if (typeof window !== "undefined" && !window.isSecureContext) {
    return {
      available: false,
      reason: "WebGPU requires HTTPS or localhost; this page is not a secure context",
    }
  }

  const gpu = (navigator as NavigatorWithGpu).gpu
  if (!gpu) {
    return { available: false, reason: "navigator.gpu is missing" }
  }

  try {
    const adapter = await gpu.requestAdapter()
    return adapter
      ? { available: true, reason: "available" }
      : { available: false, reason: "Chrome did not return a WebGPU adapter" }
  } catch {
    return { available: false, reason: "requestAdapter failed" }
  }
}

export function readMediaDuration(
  file: File,
  timeoutMs = MEDIA_METADATA_TIMEOUT_MS
): Promise<number | null> {
  return new Promise((resolve) => {
    const element = document.createElement(file.type.startsWith("video/") ? "video" : "audio")
    const url = URL.createObjectURL(file)
    let settled = false

    const finish = (duration: number | null) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeout)
      element.removeAttribute("src")
      element.load()
      URL.revokeObjectURL(url)
      resolve(duration)
    }

    const timeout = window.setTimeout(() => finish(null), timeoutMs)

    element.preload = "metadata"
    element.onloadedmetadata = () => {
      const duration = Number.isFinite(element.duration) ? element.duration : null
      finish(duration)
    }
    element.onerror = () => {
      finish(null)
    }
    element.src = url
  })
}

export function bytesToMb(bytes: number) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10
}

export function formatDuration(seconds: number | null) {
  if (seconds === null) {
    return "unknown"
  }

  const rounded = Math.round(seconds)
  const minutes = Math.floor(rounded / 60)
  const rest = rounded % 60
  return `${minutes}:${rest.toString().padStart(2, "0")}`
}

function estimateDecodedMb(file: File, duration: number | null): number | null {
  if (duration === null) return null

  const isCompressed =
    file.type.includes("mp4") ||
    file.type.includes("m4a") ||
    file.type.includes("aac") ||
    file.type.includes("mp3") ||
    file.type.includes("mpeg") ||
    file.type.includes("ogg") ||
    file.type.includes("opus") ||
    file.type.includes("webm") ||
    file.type.includes("flac")

  if (!isCompressed) {
    // PCM-like: file size approximately equals decoded size
    return bytesToMb(file.size)
  }

  // Compressed formats: estimate from duration
  // Assume stereo decoded at source sample rate (assume 44.1kHz worst case)
  // Each sample = 4 bytes (float32), 2 channels
  const bytesPerSecond = 44100 * 4 * 2
  return Math.round((duration * bytesPerSecond / (1024 * 1024)) * 10) / 10
}
