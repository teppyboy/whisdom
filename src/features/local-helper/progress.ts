import type { ServerJobPhase } from "@/features/server-transcription/types"

const STATUS_MESSAGES = {
  en: {
    queued: "Waiting to start",
    downloading: "Downloading model files",
    extracting: "Preparing audio",
    transcribing: "Transcribing audio",
    complete: "Transcript ready",
    error: "Transcription could not be completed",
    cancelled: "Transcription cancelled",
  },
  vi: {
    queued: "Đang chờ bắt đầu",
    downloading: "Đang tải tệp mô hình",
    extracting: "Đang chuẩn bị âm thanh",
    transcribing: "Đang chuyển giọng nói thành văn bản",
    complete: "Bản chép lời đã sẵn sàng",
    error: "Không thể hoàn tất chuyển giọng nói thành văn bản",
    cancelled: "Đã hủy chuyển giọng nói thành văn bản",
  },
} satisfies Record<"en" | "vi", Record<ServerJobPhase, string>>

export function normalizeHelperProgress(progress: number | undefined) {
  return Math.min(1, Math.max(0, (progress ?? 0) / 100))
}

export function helperStatusMessage(
  phase: ServerJobPhase,
  language: "en" | "vi",
  message?: string
) {
  if (message === "Preparing audio") {
    return language === "en" ? message : "Đang chuẩn bị âm thanh"
  }
  if (message === "Loading transcription model") {
    return language === "en"
      ? message
      : "Đang tải mô hình chuyển giọng nói thành văn bản"
  }
  if (message === "Transcribing audio") {
    return language === "en" ? message : "Đang chuyển giọng nói thành văn bản"
  }
  if (message === "Finalizing transcript") {
    return language === "en" ? message : "Đang hoàn thiện bản chép lời"
  }
  return STATUS_MESSAGES[language][phase]
}

export function helperErrorMessage(language: "en" | "vi") {
  return language === "en"
    ? "Transcription could not be completed"
    : "Không thể hoàn tất chuyển giọng nói thành văn bản"
}
