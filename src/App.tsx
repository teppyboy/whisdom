import * as React from "react"
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Check,
  ChevronsUpDown,
  Download,
  FileAudio,
  FileVideo,
  Gauge,
  HardDrive,
  Languages,
  Loader2,
  Moon,
  Play,
  Settings2,
  Search,
  Sparkles,
  Sun,
  Trash2,
  UploadCloud,
  User,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useTheme } from "@/components/theme-provider"
import { analyzeMediaFile, bytesToMb, formatDuration } from "@/features/media/preflight"
import {
  DEFAULT_SETTINGS,
  canRunModelLocally,
  findModel,
  getLocalModelDtype,
  WHISPER_MODELS,
} from "@/features/transcription/models"
import {
  getLanguageLabel,
  isEnglishOnlyLanguageMismatch,
  resolveTranscriptionLanguage,
  TRANSCRIPTION_LANGUAGES,
} from "@/features/transcription/language"
import { downloadTranscript, type ExportFormat } from "@/features/transcription/exports"
import {
  deleteTranscript,
  clearTranscripts,
  listTranscripts,
  loadSettings,
  renameTranscript,
  saveSettings,
  saveTranscript,
} from "@/features/storage/indexed-db"
import {
  isGoogleDriveConfigured,
  requestDriveAccess,
  uploadTranscriptMetadata,
} from "@/features/google-drive/drive"
import { clearModelCaches } from "@/features/storage/cleanup"
import { cn } from "@/lib/utils"
import { createId } from "@/lib/id"
import { clearLocalWorkerState, convertWithFfmpeg, transcribeLocally } from "@/lib/transcription-worker-client"
import { transcribeChunkWithServer } from "@/features/server-transcription/client"
import { ServerTranscriptionApi } from "@/features/server-transcription/api"
import type { ServerJobPhase, ServerJobStatus } from "@/features/server-transcription/types"
import type {
  AppSettings,
  JobState,
  LanguageCode,
  MediaAnalysis,
  ProcessingMode,
  TranscriptDocument,
  TranscriptionProgress,
  UiLanguage,
} from "@/features/transcription/types"

const MODES: Array<{ value: ProcessingMode; label: string; detail: string }> = [
  { value: "local-webgpu", label: "Local WebGPU", detail: "Default, fastest private path" },
  { value: "cloudflare-ai", label: "Manual server", detail: "Authorized users, free quota only" },
  { value: "local-wasm", label: "Local WASM", detail: "Fallback for unsupported browsers" },
  { value: "server", label: "Server (CPU)", detail: "Server-side whisper.cpp. Sign in required." },
]

const EXPORTS: ExportFormat[] = ["txt", "json", "srt", "vtt"]

type View = "home" | "settings"
type ProgressLogEntry = {
  id: string
  phase: JobState
  message: string
  progress?: number
  updatedAt: string
}
type QueuedFileStatus = "pending" | "active" | "complete" | "error"
type QueuedFile = {
  id: string
  file: File
  status: QueuedFileStatus
  transcriptId?: string
  error?: string
}
type ToastMessage = {
  id: string
  title: string
  description: string
  kind?: "success" | "error"
}
type DriveStatus =
  | { type: "idle" }
  | { type: "connected" }
  | { type: "opening-google" }
  | { type: "uploading-metadata" }
  | { type: "synced"; id: string }
  | { type: "error"; message: string }

const UI_LANGUAGES: Array<{ value: UiLanguage; label: string }> = [
  { value: "en", label: "English" },
  { value: "vi", label: "Tiếng Việt" },
]

const COPY = {
  en: {
    homeAria: "Go to home",
    tagline: "Private transcription workbench",
    accountMenu: "Account menu",
    guest: "Guest",
    signInGoogle: "Sign in with Google",
    settings: "Settings",
    theme: "Theme",
    toggleTheme: "Dark mode",
    openingGoogle: "Opening Google",
    uploadingMetadata: "Uploading metadata",
    driveSyncFailed: "Drive sync failed",
    googleConnected: "Google connected",
    synced: (id: string) => `Synced ${id}`,
    notConnected: "Not connected",
    waiting: "Waiting for audio or video",
    readingMetadata: "Reading media metadata",
    reviewPlan: "Review downloads and processing plan",
    couldNotAnalyze: "Could not analyze media",
    serverGuardrail: "Server mode is manual opt-in but chunk upload is not enabled yet. Use local mode for now.",
    serverRequiresAuth: "Server transcription requires Google sign-in. Please connect your account to continue.",
    serverUrl: "Enter video/audio URL",
    serverModeDesc: "Server-side transcription via whisper.cpp. Sign in required.",
    serverUnavailable: "Transcription server unavailable",
    quantizedLargeModel: (label: string) =>
      `${label} will run with q4 browser weights to avoid multi-gigabyte buffer allocation.`,
    largeModelNeedsWebGpu: (label: string) =>
      `${label} requires WebGPU in the browser. Use HTTPS/localhost with a supported GPU, or choose Whisper Small.`,
    untitledTranscript: "Untitled transcript",
    transcriptReady: "Transcript ready",
    transcriptionFailed: "Transcription failed",
    decodedAudio: "Decoded audio for Whisper",
    loadingWhisper: "Loading Whisper model",
    reusingWhisper: "Using loaded Whisper model",
    usingSavedModelAssets: "Using saved model assets",
    usingSavedModelAsset: (file: string) => `Using saved ${file}`,
    preparingModel: "Preparing model",
    downloadingModelAssets: "Downloading model assets",
    downloading: (file: string) => `Downloading ${file}`,
    transcribingAudio: "Transcribing audio",
    loadingFfmpeg: "Loading ffmpeg.wasm",
    reusingFfmpeg: "Using loaded ffmpeg.wasm",
    convertingMedia: "Converting media",
    backHome: "Back to home",
    quickSetup: "Transcription setup",
    quickSetupDescription: "Choose the model and spoken language before uploading or transcribing.",
    settingsDescription: "Processing mode, storage, and advanced options.",
    interfaceLanguage: "Interface language",
    interfaceLanguageDescription: "Language used by the website UI.",
    transcription: "Transcription",
    transcriptionDescription: "Model and language used for local transcription.",
    model: "Model",
    language: "Language",
    spokenLanguage: "Spoken language of the media.",
    searchLanguage: "Search language",
    noLanguages: "No languages found.",
    englishOnlyWarning: "Current model is English-only. Pick a multilingual model for this language.",
    englishOnlySidebar: "Current model is English-only. Switch to a multilingual Whisper model.",
    processing: "Processing",
    processingDescription: "Where transcription runs and how media is chunked.",
    mode: "Mode",
    chunkSeconds: "Chunk seconds",
    chunkSecondsDescription: "Audio length per transcription chunk.",
    overlapSeconds: "Overlap seconds",
    overlapSecondsDescription: "Overlap between chunks to avoid cut words.",
    storage: "Storage",
    storageDescription: "Local persistence options.",
    persistMediaBlobs: "Persist media blobs",
    persistMediaBlobsDescription: "Keep original media in this browser for quicker resume.",
    storageCleanup: "Storage cleanup",
    storageCleanupDescription: "Remove local browser data when you need disk space or a clean state.",
    clearDownloadedModels: "Clear downloaded models",
    clearDownloadedModelsDescription: "Deletes cached Whisper model files and resets loaded local workers.",
    clearSavedTranscripts: "Clear saved transcripts",
    clearSavedTranscriptsDescription: "Deletes transcript records stored in this browser. Export anything important first.",
    storageCleaned: "Storage cleaned",
    modelCachesCleared: (count: number) => count > 0 ? `${count} model cache cleared.` : "No model cache was found.",
    savedTranscriptsCleared: "Saved transcripts were deleted.",
    dropTitle: "Drop audio or video",
    dropDescription: "Preflight checks the file before any model or ffmpeg download. Video is converted locally, then transcribed in chunks.",
    chooseFile: "Choose file",
    filesSelected: (count: number) => `${count} files selected`,
    selectedFile: (name: string) => `Selected: ${name}`,
    fileQueue: "File queue",
    selectFile: "Select file",
    removeFile: "Remove file",
    transcribeSelected: "Transcribe selected file",
    transcribeAll: (count: number) => `Transcribe all ${count} files`,
    queueStatusLabels: {
      pending: "Pending",
      active: "Processing",
      complete: "Complete",
      error: "Error",
    } satisfies Record<QueuedFileStatus, string>,
    preflight: "Preflight",
    processingPlan: "Processing plan",
    duration: "Duration",
    size: "Size",
    chunks: "Chunks",
    emptyPreflight: "Select a file to calculate duration, chunks, downloads, and mode.",
    downloads: "Downloads",
    detailedLog: "Detailed log",
    showDetailedLog: "Show detailed log",
    hideDetailedLog: "Hide detailed log",
    unknownDuration: "Unknown",
    confirmTranscribe: "Confirm downloads and transcribe",
    transcript: "Transcript",
    timestamps: "Timestamps",
    transcriptDetails: "Model and processing details",
    rawText: "Raw text",
    textWithTimestamps: "Text with timestamps",
    downloadFiles: "Download files",
    closeResults: "Close results",
    renameTranscript: "Rename transcript",
    saveName: "Save name",
    batchComplete: (count: number) => `${count} transcripts saved to Recent.`,
    batchCompleteWithFailures: (completed: number, failed: number) =>
      `${completed} transcripts saved. ${failed} files need attention.`,
    dismissNotification: "Dismiss notification",
    readyForOutput: "Ready for output",
    emptyTranscript: "Your transcript appears here after local transcription. Export names include source, language, date, and time.",
    recent: "Recent",
    emptyHistory: "No transcripts saved yet.",
    openTranscript: "Open transcript",
    removeTranscript: "Remove transcript",
    downloadDescription: (notes: string, sizeMb: number) => `${notes} ~${sizeMb} MB download.`,
    modelDescriptions: {
      "onnx-community/whisper-base": "Default. Good English/Vietnamese balance for local browsers.",
      "onnx-community/whisper-tiny": "Fastest multilingual local option. Lower accuracy.",
      "onnx-community/whisper-small": "Better accuracy, heavier download and memory use.",
      "onnx-community/whisper-medium_timestamped": "High-accuracy multilingual model with timestamp-focused weights for high-end devices.",
      "onnx-community/whisper-large-v3-turbo": "Best high-end default: much higher accuracy than Small while staying faster than full Large v3.",
      "onnx-community/whisper-large-v3-ONNX": "Maximum accuracy option. Very large download and long initialization; intended for high-end devices.",
      "onnx-community/whisper-tiny.en": "English-only. Not suitable for Vietnamese.",
    } satisfies Record<string, string>,
    modeDetails: {
      "local-webgpu": "Default, fastest private path",
      "cloudflare-ai": "Authorized users, free quota only",
      "local-wasm": "Fallback for unsupported browsers",
      server: "Server-side transcription via whisper.cpp. Sign in required.",
    } satisfies Record<ProcessingMode, string>,
    modeLabels: {
      "local-webgpu": "Local WebGPU",
      "cloudflare-ai": "Manual server",
      "local-wasm": "Local WASM",
      server: "Server (CPU)",
    } satisfies Record<ProcessingMode, string>,
    languageLabels: {
      auto: "Auto",
      en: "English",
      vi: "Vietnamese",
    } satisfies Record<string, string>,
    jobStateLabels: {
      idle: "Idle",
      analyzing: "Analyzing",
      "awaiting-confirmation": "Awaiting confirmation",
      "downloading-assets": "Downloading assets",
      "preparing-media": "Preparing media",
      chunking: "Chunking",
      transcribing: "Transcribing",
      saving: "Saving",
      complete: "Complete",
      error: "Error",
      cancelled: "Cancelled",
    } satisfies Record<JobState, string>,
  },
  vi: {
    homeAria: "Về trang chính",
    tagline: "Chép lời riêng tư trên thiết bị",
    accountMenu: "Menu tài khoản",
    guest: "Tài khoản khách",
    signInGoogle: "Đăng nhập bằng Google",
    settings: "Cài đặt",
    theme: "Giao diện",
    toggleTheme: "Chế độ tối",
    openingGoogle: "Đang mở Google",
    uploadingMetadata: "Đang đồng bộ dữ liệu",
    driveSyncFailed: "Không thể đồng bộ Drive",
    googleConnected: "Đã kết nối Google",
    synced: (id: string) => `Đã đồng bộ ${id}`,
    notConnected: "Chưa kết nối",
    waiting: "Chọn tệp âm thanh hoặc video",
    readingMetadata: "Đang đọc thông tin tệp",
    reviewPlan: "Kiểm tra kế hoạch xử lý",
    couldNotAnalyze: "Không thể phân tích tệp",
    serverGuardrail: "Chế độ máy chủ chưa được bật. Vui lòng dùng xử lý cục bộ.",
    serverRequiresAuth: "Cần đăng nhập Google để dùng máy chủ. Vui lòng kết nối tài khoản để tiếp tục.",
    serverUrl: "Nhập URL video/âm thanh",
    serverModeDesc: "Chuyển ngữ trên máy chủ qua whisper.cpp. Cần đăng nhập.",
    serverUnavailable: "Máy chủ chuyển ngữ không khả dụng",
    quantizedLargeModel: (label: string) =>
      `${label} sẽ dùng trọng số q4 trong trình duyệt để tránh cấp phát bộ nhớ nhiều GB.`,
    largeModelNeedsWebGpu: (label: string) =>
      `${label} cần WebGPU trong trình duyệt. Hãy dùng HTTPS/localhost với GPU được hỗ trợ, hoặc chọn Whisper Small.`,
    untitledTranscript: "Bản chép chưa đặt tên",
    transcriptReady: "Bản chép đã sẵn sàng",
    transcriptionFailed: "Không thể tạo bản chép",
    decodedAudio: "Đã giải mã audio cho Whisper",
    loadingWhisper: "Đang tải mô hình Whisper",
    reusingWhisper: "Đang dùng mô hình Whisper đã tải",
    usingSavedModelAssets: "Đang dùng tài nguyên mô hình đã lưu",
    usingSavedModelAsset: (file: string) => `Đang dùng ${file} đã lưu`,
    preparingModel: "Đang chuẩn bị mô hình",
    downloadingModelAssets: "Đang tải tài nguyên mô hình",
    downloading: (file: string) => `Đang tải ${file}`,
    transcribingAudio: "Đang tạo bản chép",
    loadingFfmpeg: "Đang tải ffmpeg.wasm",
    reusingFfmpeg: "Đang dùng ffmpeg.wasm đã tải",
    convertingMedia: "Đang chuyển đổi tệp",
    backHome: "Quay lại trang chính",
    quickSetup: "Thiết lập chép lời",
    quickSetupDescription: "Chọn mô hình và ngôn ngữ nói trước khi tải tệp hoặc bắt đầu xử lý.",
    settingsDescription: "Chế độ xử lý, lưu trữ và tùy chọn nâng cao.",
    interfaceLanguage: "Ngôn ngữ giao diện",
    interfaceLanguageDescription: "Ngôn ngữ dùng cho website.",
    transcription: "Chép lời",
    transcriptionDescription: "Chọn mô hình và ngôn ngữ cho quá trình xử lý trên thiết bị.",
    model: "Mô hình",
    language: "Ngôn ngữ",
    spokenLanguage: "Ngôn ngữ trong tệp âm thanh hoặc video.",
    searchLanguage: "Tìm ngôn ngữ",
    noLanguages: "Không tìm thấy ngôn ngữ phù hợp.",
    englishOnlyWarning: "Mô hình hiện tại chỉ hỗ trợ tiếng Anh. Hãy chọn mô hình đa ngôn ngữ cho ngôn ngữ này.",
    englishOnlySidebar: "Mô hình hiện tại chỉ hỗ trợ tiếng Anh. Hãy chọn một mô hình Whisper đa ngôn ngữ.",
    processing: "Xử lý",
    processingDescription: "Chọn nơi xử lý và cách chia tệp thành đoạn.",
    mode: "Chế độ",
    chunkSeconds: "Thời lượng mỗi đoạn",
    chunkSecondsDescription: "Độ dài mỗi đoạn âm thanh khi xử lý.",
    overlapSeconds: "Thời gian chồng lấn",
    overlapSecondsDescription: "Phần lặp giữa các đoạn để tránh cắt mất từ.",
    storage: "Dữ liệu cục bộ",
    storageDescription: "Tùy chọn lưu dữ liệu trên thiết bị.",
    persistMediaBlobs: "Lưu tệp media",
    persistMediaBlobsDescription: "Giữ tệp gốc trên thiết bị này để tiếp tục nhanh hơn.",
    storageCleanup: "Dọn dẹp dữ liệu",
    storageCleanupDescription: "Xóa dữ liệu cục bộ khi cần thêm dung lượng hoặc muốn bắt đầu lại.",
    clearDownloadedModels: "Xóa mô hình đã tải",
    clearDownloadedModelsDescription: "Xóa các tệp mô hình Whisper đã lưu và đặt lại worker cục bộ.",
    clearSavedTranscripts: "Xóa bản chép đã lưu",
    clearSavedTranscriptsDescription: "Xóa các bản chép lưu trong trình duyệt này. Hãy xuất tệp quan trọng trước.",
    storageCleaned: "Đã dọn dẹp dữ liệu",
    modelCachesCleared: (count: number) => count > 0 ? `Đã xóa ${count} bộ nhớ đệm mô hình.` : "Không tìm thấy bộ nhớ đệm mô hình.",
    savedTranscriptsCleared: "Đã xóa các bản chép đã lưu.",
    dropTitle: "Thả âm thanh hoặc video",
    dropDescription: "Tệp được kiểm tra trước khi tải mô hình hoặc ffmpeg. Video sẽ được chuyển thành âm thanh trên thiết bị rồi xử lý theo đoạn.",
    chooseFile: "Chọn tệp",
    filesSelected: (count: number) => `Đã chọn ${count} tệp`,
    selectedFile: (name: string) => `Đang chọn: ${name}`,
    fileQueue: "Hàng đợi tệp",
    selectFile: "Chọn tệp",
    removeFile: "Xóa tệp",
    transcribeSelected: "Chép tệp đang chọn",
    transcribeAll: (count: number) => `Chép tất cả ${count} tệp`,
    queueStatusLabels: {
      pending: "Chờ xử lý",
      active: "Đang xử lý",
      complete: "Hoàn tất",
      error: "Lỗi",
    } satisfies Record<QueuedFileStatus, string>,
    preflight: "Kiểm tra tệp",
    processingPlan: "Kế hoạch xử lý",
    duration: "Thời lượng",
    size: "Dung lượng",
    chunks: "Đoạn",
    emptyPreflight: "Chọn tệp để xem thời lượng, số đoạn, tài nguyên cần tải và chế độ xử lý.",
    downloads: "Cần tải",
    detailedLog: "Nhật ký chi tiết",
    showDetailedLog: "Hiện nhật ký chi tiết",
    hideDetailedLog: "Ẩn nhật ký chi tiết",
    unknownDuration: "Không rõ",
    confirmTranscribe: "Tải và tạo bản chép",
    transcript: "Bản chép",
    timestamps: "Mốc thời gian",
    transcriptDetails: "Thông tin mô hình và xử lý",
    rawText: "Văn bản thuần",
    textWithTimestamps: "Văn bản kèm mốc thời gian",
    downloadFiles: "Tải tệp xuống",
    closeResults: "Đóng kết quả",
    renameTranscript: "Đổi tên bản chép",
    saveName: "Lưu tên",
    batchComplete: (count: number) => `Đã lưu ${count} bản chép vào Gần đây.`,
    batchCompleteWithFailures: (completed: number, failed: number) =>
      `Đã lưu ${completed} bản chép. ${failed} tệp cần kiểm tra lại.`,
    dismissNotification: "Đóng thông báo",
    readyForOutput: "Sẵn sàng xuất",
    emptyTranscript: "Bản chép sẽ xuất hiện ở đây sau khi xử lý. Tên tệp xuất gồm nguồn, ngôn ngữ, ngày và giờ.",
    recent: "Gần đây",
    emptyHistory: "Chưa có bản chép nào.",
    openTranscript: "Mở bản chép",
    removeTranscript: "Xóa bản chép",
    downloadDescription: (notes: string, sizeMb: number) => `${notes} Khoảng ${sizeMb} MB.`,
    modelDescriptions: {
      "onnx-community/whisper-base": "Mặc định. Cân bằng tốt giữa tốc độ và độ chính xác cho tiếng Anh/tiếng Việt.",
      "onnx-community/whisper-tiny": "Nhanh nhất trong các mô hình đa ngôn ngữ. Độ chính xác thấp hơn.",
      "onnx-community/whisper-small": "Độ chính xác cao hơn, cần tải xuống và bộ nhớ nhiều hơn.",
      "onnx-community/whisper-medium_timestamped": "Mô hình đa ngôn ngữ có độ chính xác cao, tối ưu cho mốc thời gian và thiết bị mạnh.",
      "onnx-community/whisper-large-v3-turbo": "Lựa chọn tốt cho thiết bị mạnh: chính xác hơn Small đáng kể nhưng nhanh hơn Large v3 đầy đủ.",
      "onnx-community/whisper-large-v3-ONNX": "Tùy chọn chính xác tối đa. Tệp tải xuống rất lớn và khởi tạo lâu; dành cho thiết bị cao cấp.",
      "onnx-community/whisper-tiny.en": "Chỉ hỗ trợ tiếng Anh, không phù hợp cho tiếng Việt.",
    } satisfies Record<string, string>,
    modeDetails: {
      "local-webgpu": "Xử lý cục bộ nhanh nhất khi trình duyệt hỗ trợ.",
      "cloudflare-ai": "Dành cho tài khoản được cấp quyền, chỉ dùng hạn mức miễn phí.",
      "local-wasm": "Dự phòng khi WebGPU không khả dụng.",
      server: "Chuyển ngữ trên máy chủ qua whisper.cpp. Cần đăng nhập.",
    } satisfies Record<ProcessingMode, string>,
    modeLabels: {
      "local-webgpu": "Local WebGPU",
      "cloudflare-ai": "Máy chủ",
      "local-wasm": "Local WASM",
      server: "Máy chủ (CPU)",
    } satisfies Record<ProcessingMode, string>,
    languageLabels: {
      auto: "Tự động",
      en: "Tiếng Anh",
      vi: "Tiếng Việt",
    } satisfies Record<string, string>,
    jobStateLabels: {
      idle: "Sẵn sàng",
      analyzing: "Đang phân tích",
      "awaiting-confirmation": "Chờ xác nhận",
      "downloading-assets": "Đang tải tài nguyên",
      "preparing-media": "Đang chuẩn bị media",
      chunking: "Đang chia chunk",
      transcribing: "Đang chép lời",
      saving: "Đang lưu",
      complete: "Hoàn tất",
      error: "Lỗi",
      cancelled: "Đã hủy",
    } satisfies Record<JobState, string>,
  },
} as const

type Copy = (typeof COPY)[UiLanguage]

function getDriveStatusText(status: DriveStatus, copy: Copy) {
  switch (status.type) {
    case "opening-google":
      return copy.openingGoogle
    case "uploading-metadata":
      return copy.uploadingMetadata
    case "synced":
      return copy.synced(status.id)
    case "connected":
      return copy.googleConnected
    case "error":
      return status.message || copy.driveSyncFailed
    case "idle":
      return copy.notConnected
  }
}

function getDriveStatusIcon(status: DriveStatus) {
  switch (status.type) {
    case "uploading-metadata":
      return <Loader2 className="size-3 animate-spin" aria-hidden="true" />
    case "synced":
      return <Check className="size-3" aria-hidden="true" />
    case "error":
      return <AlertCircle className="size-3" aria-hidden="true" />
    default:
      return null
  }
}

function localizeProgressMessage(message: string, copy: Copy) {
  if (message === "Decoded audio for Whisper") {
    return copy.decodedAudio
  }

  if (message === "Loading Whisper model") {
    return copy.loadingWhisper
  }

  if (message === "Reusing loaded Whisper model") {
    return copy.reusingWhisper
  }

  if (message === "Using saved model assets") {
    return copy.usingSavedModelAssets
  }

  if (message.startsWith("Using saved ")) {
    return copy.usingSavedModelAsset(message.slice("Using saved ".length))
  }

  if (message === "Preparing model") {
    return copy.preparingModel
  }

  if (message === "Downloading model assets") {
    return copy.downloadingModelAssets
  }

  if (message.startsWith("Downloading ")) {
    return copy.downloading(message.slice("Downloading ".length))
  }

  if (message === "Transcribing audio") {
    return copy.transcribingAudio
  }

  if (message === "Loading ffmpeg.wasm") {
    return copy.loadingFfmpeg
  }

  if (message === "Reusing ffmpeg.wasm") {
    return copy.reusingFfmpeg
  }

  if (message === "Converting media") {
    return copy.convertingMedia
  }

  return message
}

export function App() {
  const { resolvedTheme, setTheme } = useTheme()
  const [view, setView] = React.useState<View>("home")
  const [settings, setSettings] = React.useState<AppSettings>(DEFAULT_SETTINGS)
  const t = COPY[settings.uiLanguage]
  const [file, setFile] = React.useState<File | null>(null)
  const [queue, setQueue] = React.useState<QueuedFile[]>([])
  const [selectedQueueId, setSelectedQueueId] = React.useState<string | null>(null)
  const [analysis, setAnalysis] = React.useState<MediaAnalysis | null>(null)
  const [jobState, setJobState] = React.useState<JobState>("idle")
  const [progress, setProgress] = React.useState<TranscriptionProgress>({
    phase: "idle",
    message: COPY.en.waiting,
    progress: 0,
  })
  const [progressLog, setProgressLog] = React.useState<ProgressLogEntry[]>([])
  const [transcript, setTranscript] = React.useState<TranscriptDocument | null>(null)
  const [isResultOpen, setIsResultOpen] = React.useState(false)
  const [toastMessage, setToastMessage] = React.useState<ToastMessage | null>(null)
  const [history, setHistory] = React.useState<TranscriptDocument[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = React.useState(false)
  const [driveStatus, setDriveStatus] = React.useState<DriveStatus>({ type: "idle" })
  const [driveAccessToken, setDriveAccessToken] = React.useState<string | null>(null)
  const [urlInput, setUrlInput] = React.useState("")
  const serverApiRef = React.useRef<ServerTranscriptionApi | null>(null)
  const settingsRef = React.useRef(settings)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const driveStatusText = getDriveStatusText(driveStatus, t)
  const driveStatusIcon = getDriveStatusIcon(driveStatus)

  React.useEffect(() => {
    void loadSettings().then((storedSettings) => {
      settingsRef.current = storedSettings
      setSettings(storedSettings)
    })
    void listTranscripts().then(setHistory)
    void navigator.storage?.persist?.().catch(() => undefined)
  }, [])

  React.useEffect(() => {
    void saveSettings(settings)
  }, [settings])

  React.useEffect(() => {
    if (settings.mode !== "server") return
    const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined
    if (!serverUrl) return
    const api = new ServerTranscriptionApi(serverUrl, () => driveAccessToken ?? (import.meta.env.DEV ? "dev-mode" : null))
    serverApiRef.current = api
    void api.getCapabilities().then((cap) => {
      if (!cap?.available) {
        setToastMessage({
          id: createId("toast"),
          title: t.transcriptionFailed,
          description: t.serverUnavailable,
          kind: "error",
        })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.mode, driveAccessToken])

  const model = findModel(settings.modelId)
  const canStart = file && analysis && !isBusy(jobState)
  const canStartAll = queue.length > 1 && !isBusy(jobState)
  const isEnglishOnlyMismatch = isEnglishOnlyLanguageMismatch(settings.language, settings.uiLanguage) && !model.multilingual

  function recordProgress(nextProgress: TranscriptionProgress) {
    const localizedProgress: TranscriptionProgress = {
      ...nextProgress,
      message: localizeProgressMessage(nextProgress.message, t),
      detail: nextProgress.detail
        ? {
            ...nextProgress.detail,
            message: localizeProgressMessage(nextProgress.detail.message, t),
          }
        : undefined,
    }

    setProgress(localizedProgress)

    const detail = localizedProgress.detail ?? {
      id: `phase:${localizedProgress.phase}`,
      message: localizedProgress.message,
      progress: localizedProgress.progress,
    }
    const updatedAt = new Date().toLocaleTimeString()

    setProgressLog((current) => {
      const existingIndex = current.findIndex((entry) => entry.id === detail.id)
      const nextEntry: ProgressLogEntry = {
        id: detail.id,
        phase: localizedProgress.phase,
        message: detail.message,
        progress: detail.progress,
        updatedAt,
      }

      if (existingIndex === -1) {
        return [...current, nextEntry]
      }

      const nextLog = [...current]
      nextLog[existingIndex] = nextEntry
      return nextLog
    })
  }

  function updateQueueItem(id: string | null, patch: Partial<QueuedFile>) {
    if (!id) {
      return
    }

    setQueue((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    )
  }

  async function analyzeSelectedFile(
    nextFile: File,
    nextSettings: AppSettings,
    resetTranscript: boolean,
    queueId = selectedQueueId
  ) {
    setFile(nextFile)
    setSelectedQueueId(queueId)
    if (resetTranscript) {
      setTranscript(null)
    }
    setError(null)
    setProgressLog([])
    setJobState("analyzing")
    recordProgress({ phase: "analyzing", message: t.readingMetadata, progress: 0.08 })

    try {
      const result = await analyzeMediaFile(nextFile, nextSettings)
      setAnalysis(result)
      setJobState("awaiting-confirmation")
      recordProgress({
        phase: "awaiting-confirmation",
        message: t.reviewPlan,
        progress: 0.18,
      })
    } catch (caught) {
      setJobState("error")
      const message = caught instanceof Error ? caught.message : t.couldNotAnalyze
      setError(message)
      setToastMessage({
        id: createId("toast"),
        title: t.transcriptionFailed,
        description: message,
        kind: "error",
      })
    }
  }

  async function handleFiles(nextFiles: File[]) {
    if (nextFiles.length === 0) {
      return
    }

    const addedQueue = nextFiles.map((nextFile) => ({
      id: createId("file"),
      file: nextFile,
      status: "pending" as const,
    }))
    const shouldAnalyzeFirstAddedFile = queue.length === 0 || !file

    setQueue((current) => [...current, ...addedQueue])

    if (shouldAnalyzeFirstAddedFile) {
      await analyzeSelectedFile(addedQueue[0].file, settingsRef.current, true, addedQueue[0].id)
    }
  }

  async function removeQueuedFile(id: string) {
    const nextQueue = queue.filter((item) => item.id !== id)
    setQueue(nextQueue)

    if (selectedQueueId !== id) {
      return
    }

    const removedIndex = queue.findIndex((item) => item.id === id)
    const nextSelected = nextQueue[Math.min(Math.max(removedIndex, 0), nextQueue.length - 1)]

    if (nextSelected) {
      await analyzeSelectedFile(nextSelected.file, settingsRef.current, false, nextSelected.id)
      return
    }

    setSelectedQueueId(null)
    setFile(null)
    setAnalysis(null)
    setError(null)
    setProgressLog([])
    setJobState("idle")
    setProgress({ phase: "idle", message: t.waiting, progress: 0 })
  }

  function mapServerPhase(phase: ServerJobPhase): JobState {
    switch (phase) {
      case "queued": return "idle"
      case "downloading": return "downloading-assets"
      case "extracting": return "preparing-media"
      case "transcribing": return "transcribing"
      case "complete": return "complete"
      case "error": return "error"
      case "cancelled": return "cancelled"
    }
  }

  async function transcribeFile(targetFile: File, queueId: string | null, runSettings: AppSettings) {
    const runModel = findModel(runSettings.modelId)

    setFile(targetFile)
    setSelectedQueueId(queueId)
    updateQueueItem(queueId, { status: "active", error: undefined })
    setError(null)
    setProgressLog([])
    setJobState("analyzing")
    recordProgress({ phase: "analyzing", message: t.readingMetadata, progress: 0.08 })

    if (runSettings.mode === "cloudflare-ai") {
      if (!driveAccessToken && !import.meta.env.DEV) {
        setToastMessage({
          id: createId("toast"),
          title: t.transcriptionFailed,
          description: t.serverRequiresAuth,
          kind: "error",
        })
        throw new Error(t.serverRequiresAuth)
      }

      let audioBlob: File | Blob = targetFile
      const cfAnalysis = await analyzeMediaFile(targetFile, runSettings)
      setAnalysis(cfAnalysis)

      if (cfAnalysis.needsFfmpeg) {
        setJobState("preparing-media")
        audioBlob = await convertWithFfmpeg({
          file: targetFile,
          onProgress: (nextProgress) => {
            recordProgress({
              phase: "preparing-media",
              message: nextProgress.message,
              progress: nextProgress.progress * 0.35,
              detail: nextProgress.detail,
            })
          },
        })
      }

      setJobState("chunking")
      recordProgress({ phase: "chunking", message: t.readingMetadata, progress: 0.4 })
      const wavBytes = new Uint8Array(await audioBlob.arrayBuffer())
      const { default: initAP, split_wav_chunks } = (await import(
        "./wasm/audio-processor/audio_processor.js"
      )) as unknown as {
        default: () => Promise<void>
        split_wav_chunks: (data: Uint8Array, size: number) => Iterable<unknown>
      }
      await initAP()
      const rawChunks = split_wav_chunks(wavBytes, 9 * 1024 * 1024)
      const chunks = Array.from(rawChunks).map((c) => new Uint8Array(c as ArrayBuffer))

      setJobState("transcribing")
      const cfLanguage = resolveTranscriptionLanguage(runSettings.language, runSettings.uiLanguage)
      const texts: string[] = []
      for (let i = 0; i < chunks.length; i++) {
        recordProgress({
          phase: "transcribing",
          message: t.transcribingAudio,
          progress: 0.5 + (i / chunks.length) * 0.4,
          detail: {
            id: `chunk:${i}`,
            message: `Chunk ${i + 1} / ${chunks.length}`,
            progress: i / chunks.length,
          },
        })
        const audio = new Blob([chunks[i]], { type: "audio/wav" })
        const result = await transcribeChunkWithServer({ audio, language: cfLanguage, accessToken: driveAccessToken ?? "dev-mode" })
        texts.push(result.text)
      }

      const cfNow = new Date().toISOString()
      const doc: TranscriptDocument = {
        id: createId("tr"),
        title: targetFile.name.replace(/\.[^.]+$/, "") || t.untitledTranscript,
        sourceName: targetFile.name,
        language: cfLanguage,
        modelId: "cloudflare-whisper-large-v3-turbo",
        mode: "cloudflare-ai",
        createdAt: cfNow,
        updatedAt: cfNow,
        text: texts.join(" ").trim(),
        segments: [],
      }

      setJobState("saving")
      recordProgress({ phase: "saving", message: t.transcriptReady, progress: 0.95 })
      await saveTranscript(doc)
      updateQueueItem(queueId, { status: "complete", transcriptId: doc.id })
      setHistory(await listTranscripts())
      setJobState("complete")
      recordProgress({ phase: "complete", message: t.transcriptReady, progress: 1 })
      return doc
    }

    if (runSettings.mode === "server") {
      if (!driveAccessToken && !import.meta.env.DEV) {
        setToastMessage({
          id: createId("toast"),
          title: t.transcriptionFailed,
          description: t.serverRequiresAuth,
          kind: "error",
        })
        throw new Error(t.serverRequiresAuth)
      }

      const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined
      if (!serverUrl) throw new Error("Server URL not configured")

      const api = new ServerTranscriptionApi(serverUrl, () => driveAccessToken ?? (import.meta.env.DEV ? "dev-mode" : null))

      if (urlInput.trim()) {
        setJobState("downloading-assets")
        recordProgress({ phase: "downloading-assets", message: "Submitting URL...", progress: 0.1 })
        const jobId = await api.submitJob({ type: "url", url: urlInput.trim() }, runSettings.language)

        return new Promise<TranscriptDocument>((resolve, reject) => {
          api.subscribeProgress(jobId, (status: ServerJobStatus) => {
            const mapped = mapServerPhase(status.phase)
            recordProgress({ phase: mapped, message: status.message ?? "", progress: status.progress ?? 0 })

            if (status.phase === "complete" && status.segments) {
              const now = new Date().toISOString()
              const doc: TranscriptDocument = {
                id: createId("tr"),
                title: urlInput.trim().split("/").pop()?.replace(/[?#].*$/, "") || t.untitledTranscript,
                sourceName: urlInput.trim(),
                language: runSettings.language,
                modelId: "whisper.cpp",
                mode: "server",
                createdAt: now,
                updatedAt: now,
                text: status.text ?? status.segments.map(s => s.text).join(" "),
                segments: status.segments.map((s) => ({
                  id: createId("seg"),
                  start: s.start,
                  end: s.end,
                  text: s.text,
                })),
              }
              setJobState("saving")
              void saveTranscript(doc).then(() => {
                updateQueueItem(queueId, { status: "complete", transcriptId: doc.id })
                void listTranscripts().then(setHistory)
                setJobState("complete")
                recordProgress({ phase: "complete", message: t.transcriptReady, progress: 1 })
                resolve(doc)
              })
            } else if (status.phase === "error") {
              reject(new Error(status.error ?? "Server transcription failed"))
            } else if (status.phase === "cancelled") {
              reject(new Error("Transcription cancelled"))
            }
          })
        })
      }

      setJobState("preparing-media")
      recordProgress({ phase: "preparing-media", message: "Uploading...", progress: 0.1 })
      const jobId = await api.submitJob(
        { type: "file", file: targetFile, filename: targetFile.name },
        runSettings.language,
      )

      return new Promise<TranscriptDocument>((resolve, reject) => {
        api.subscribeProgress(jobId, (status: ServerJobStatus) => {
          const mapped = mapServerPhase(status.phase)
          recordProgress({ phase: mapped, message: status.message ?? "", progress: status.progress ?? 0 })

          if (status.phase === "complete" && status.segments) {
            const now = new Date().toISOString()
            const doc: TranscriptDocument = {
              id: createId("tr"),
              title: targetFile.name.replace(/\.[^.]+$/, "") || t.untitledTranscript,
              sourceName: targetFile.name,
              language: runSettings.language,
              modelId: "whisper.cpp",
              mode: "server",
              createdAt: now,
              updatedAt: now,
              text: status.text ?? status.segments.map(s => s.text).join(" "),
              segments: status.segments.map((s) => ({
                id: createId("seg"),
                start: s.start,
                end: s.end,
                text: s.text,
              })),
            }
            setJobState("saving")
            void saveTranscript(doc).then(() => {
              updateQueueItem(queueId, { status: "complete", transcriptId: doc.id })
              void listTranscripts().then(setHistory)
              setJobState("complete")
              recordProgress({ phase: "complete", message: t.transcriptReady, progress: 1 })
              resolve(doc)
            })
          } else if (status.phase === "error") {
            reject(new Error(status.error ?? "Server transcription failed"))
          } else if (status.phase === "cancelled") {
            reject(new Error("Transcription cancelled"))
          }
        })
      })
    }

    let input: File | Blob = targetFile

    const freshAnalysis = await analyzeMediaFile(targetFile, runSettings)
    setAnalysis(freshAnalysis)
    const effectiveMode = freshAnalysis.recommendedMode === "local-webgpu" ? "local-webgpu" : "local-wasm"
    const device = effectiveMode === "local-webgpu" ? "webgpu" : "wasm"

    if (!canRunModelLocally(runModel, device)) {
      setJobState("error")
      throw new Error(t.largeModelNeedsWebGpu(runModel.label))
    }

    if (freshAnalysis.needsFfmpeg) {
      setJobState("preparing-media")
      input = await convertWithFfmpeg({
        file: targetFile,
        onProgress: (nextProgress) => {
          recordProgress({
            phase: "preparing-media",
            message: nextProgress.message,
            progress: nextProgress.progress * 0.35,
            detail: nextProgress.detail,
          })
        },
      })
    }

    setJobState("transcribing")
    const effectiveLanguage = resolveTranscriptionLanguage(runSettings.language, runSettings.uiLanguage)
    const result = await transcribeLocally({
      file: input,
      modelId: runSettings.modelId,
      language: effectiveLanguage,
      device,
      dtype: getLocalModelDtype(runModel),
      onProgress: (nextProgress) => {
        recordProgress(nextProgress)
        setJobState(nextProgress.phase)
      },
    })
    const now = new Date().toISOString()
    const document: TranscriptDocument = {
      id: createId("transcript"),
      title: targetFile.name.replace(/\.[^.]+$/, "") || t.untitledTranscript,
      sourceName: targetFile.name,
      language: effectiveLanguage,
      modelId: runSettings.modelId,
      mode: effectiveMode,
      createdAt: now,
      updatedAt: now,
      text: result.text,
      segments: result.segments,
    }

    setJobState("saving")
    await saveTranscript(document)

    if (driveAccessToken) {
      // eslint-disable-next-line no-useless-assignment
      let activeToken = driveAccessToken
      try {
        const refreshed = await requestDriveAccess("")
        activeToken = refreshed
        setDriveAccessToken(refreshed)
      } catch {
        activeToken = driveAccessToken
      }
      setDriveStatus({ type: "uploading-metadata" })
      try {
        const uploaded = await uploadTranscriptMetadata(activeToken, document)
        setDriveStatus({ type: "synced", id: uploaded.id })
      } catch (caught) {
        setDriveStatus({
          type: "error",
          message: caught instanceof Error ? caught.message : t.driveSyncFailed,
        })
      }
    }

    updateQueueItem(queueId, { status: "complete", transcriptId: document.id })
    setHistory(await listTranscripts())
    setJobState("complete")
    recordProgress({ phase: "complete", message: t.transcriptReady, progress: 1 })
    return document
  }

  async function startTranscription() {
    if (!file || !analysis) {
      return
    }

    try {
      const document = await transcribeFile(file, selectedQueueId, settingsRef.current)
      setTranscript(document)
      setIsResultOpen(true)
    } catch (caught) {
      const detail = caught instanceof Error ? `${caught.name}: ${caught.message}\n${caught.stack ?? ""}` : String(caught)
      console.error("[transcription]", detail)
      setJobState("error")
      const message = caught instanceof Error ? caught.message : t.transcriptionFailed
      setError(message)
      setToastMessage({
        id: createId("toast"),
        title: t.transcriptionFailed,
        description: message,
        kind: "error",
      })
      updateQueueItem(selectedQueueId, { status: "error", error: message })
    }
  }

  async function startBatchTranscription() {
    const runSettings = settingsRef.current
    const queueSnapshot = queue.length > 0 ? queue : file ? [{ id: selectedQueueId ?? createId("file"), file, status: "pending" as const }] : []
    const completed: TranscriptDocument[] = []
    const failures: string[] = []

    setIsResultOpen(false)

    for (const item of queueSnapshot) {
      try {
        const document = await transcribeFile(item.file, item.id, runSettings)
        completed.push(document)
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : t.transcriptionFailed
        failures.push(`${item.file.name}: ${message}`)
        updateQueueItem(item.id, { status: "error", error: message })
      }
    }

    if (completed.length > 0) {
      setHistory(await listTranscripts())
      setJobState(failures.length > 0 ? "error" : "complete")
      setToastMessage({
        id: createId("toast"),
        title: t.transcriptReady,
        description:
          failures.length > 0
            ? t.batchCompleteWithFailures(completed.length, failures.length)
            : t.batchComplete(completed.length),
      })
    }

    if (failures.length > 0) {
      setError(failures.join("\n"))
      setToastMessage({
        id: createId("toast"),
        title: t.transcriptionFailed,
        description: failures.join("\n"),
        kind: "error",
      })
    }

    if (completed.length === 0 && failures.length === 0) {
      setJobState("idle")
    }
  }

  async function signInWithGoogle() {
    try {
      setDriveStatus({ type: "opening-google" })
      const token = await requestDriveAccess()
      setDriveAccessToken(token)
      setDriveStatus({ type: "connected" })
      setToastMessage({
        id: createId("toast"),
        title: t.googleConnected,
        description: t.googleConnected,
      })
      return token
    } catch (caught) {
      setDriveStatus({
        type: "error",
        message: caught instanceof Error ? caught.message : t.driveSyncFailed,
      })
      return null
    }
  }

  async function removeTranscript(id: string) {
    await deleteTranscript(id)
    setHistory((current) => current.filter((item) => item.id !== id))
    if (transcript?.id === id) {
      setIsResultOpen(false)
      setTranscript(null)
    }
  }

  async function clearDownloadedModels() {
    try {
      clearLocalWorkerState()
      const deletedCount = await clearModelCaches()

      setToastMessage({
        id: createId("toast"),
        title: t.storageCleaned,
        description: t.modelCachesCleared(deletedCount),
      })
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t.transcriptionFailed
      setError(message)
      setToastMessage({
        id: createId("toast"),
        title: t.transcriptionFailed,
        description: message,
        kind: "error",
      })
    }
  }

  async function clearSavedTranscripts() {
    await clearTranscripts()
    setHistory([])
    setTranscript(null)
    setIsResultOpen(false)
    setToastMessage({
      id: createId("toast"),
      title: t.storageCleaned,
      description: t.savedTranscriptsCleared,
    })
  }

  function openTranscriptResult(document: TranscriptDocument) {
    setTranscript(document)
    setIsResultOpen(true)
  }

  async function renameTranscriptTitle(id: string, title: string) {
    const nextTitle = title.trim() || t.untitledTranscript
    const updated = await renameTranscript(id, nextTitle)

    if (!updated) {
      return
    }

    setTranscript((current) => (current?.id === id ? updated : current))
    setHistory(await listTranscripts())
  }

  function updateSetting<T extends keyof AppSettings>(key: T, value: AppSettings[T]) {
    const nextSettings = { ...settings, [key]: value }

    settingsRef.current = nextSettings
    setSettings(nextSettings)

    if (file && analysis && jobState === "awaiting-confirmation") {
      void analyzeSelectedFile(file, nextSettings, false, selectedQueueId)
    }
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <button
            className="flex items-center gap-2.5"
            onClick={() => setView("home")}
            aria-label={t.homeAria}
          >
            <div className="flex size-8 items-center justify-center rounded-md bg-foreground text-background">
              <Sparkles className="size-4" />
            </div>
            <div className="flex items-baseline gap-2.5">
              <h1 className="text-sm font-semibold tracking-tight">Whisdom</h1>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {t.tagline}
              </span>
            </div>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" aria-label={t.accountMenu}>
                <Avatar className="size-8 border">
                  <AvatarFallback>
                    <User className="size-4 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <span className="block text-sm font-medium">{t.guest}</span>
                <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  {driveStatusIcon}
                  <span className="truncate">{driveStatusText}</span>
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5">
                <div className="mb-2 text-xs text-muted-foreground">{t.interfaceLanguage}</div>
                <div
                  className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
                  role="group"
                  aria-label={t.interfaceLanguage}
                >
                  {UI_LANGUAGES.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={cn(
                        "rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                        settings.uiLanguage === item.value
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      aria-pressed={settings.uiLanguage === item.value}
                      onClick={() => updateSetting("uiLanguage", item.value)}
                    >
                      {item.value.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!isGoogleDriveConfigured()}
                onClick={() => void signInWithGoogle()}
              >
                <HardDrive />
                {driveAccessToken ? t.googleConnected : t.signInGoogle}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setView("settings")}>
                <Settings2 />
                {t.settings}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="grid cursor-default grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2"
                onSelect={(event) => event.preventDefault()}
              >
                <span className="flex size-4 items-center justify-center">
                  {resolvedTheme === "dark" ? <Moon /> : <Sun />}
                </span>
                <span className="leading-5">{t.toggleTheme}</span>
                <Switch
                  aria-label={t.toggleTheme}
                  size="sm"
                  checked={resolvedTheme === "dark"}
                  onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-3 py-5 sm:gap-6 sm:px-6 sm:py-6 lg:px-8">
        {view === "settings" ? (
          <div
            key="settings"
            className="animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out"
          >
            <SettingsPage
              settings={settings}
              updateSetting={updateSetting}
              storageActionsDisabled={isBusy(jobState)}
              onClearDownloadedModels={() => void clearDownloadedModels()}
              onClearSavedTranscripts={() => void clearSavedTranscripts()}
              onBack={() => setView("home")}
              copy={t}
            />
          </div>
        ) : (
          <section
            key="home"
            className="grid flex-1 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out lg:grid-cols-[minmax(0,1fr)_360px]"
          >
            <div className="flex min-w-0 flex-col gap-6">
              <MainControls
                settings={settings}
                model={model}
                copy={t}
                isEnglishOnlyMismatch={isEnglishOnlyMismatch}
                updateSetting={updateSetting}
              />

              {settings.mode === "server" ? (
                !driveAccessToken && !import.meta.env.DEV ? (
                  <Card className="animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out">
                    <CardContent className="flex flex-col items-center gap-4 py-8">
                      <p className="text-sm text-muted-foreground">{t.serverModeDesc}</p>
                      <Button onClick={() => void signInWithGoogle()}>
                        <HardDrive className="mr-2 size-4" />
                        {driveAccessToken ? t.googleConnected : t.signInGoogle}
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out">
                    <CardContent className="pt-5">
                      <Label htmlFor="server-url-input" className="text-sm font-medium">
                        {t.serverUrl}
                      </Label>
                      <Input
                        id="server-url-input"
                        value={urlInput}
                        placeholder={t.serverUrl}
                        className="mt-2"
                        onChange={(event) => setUrlInput(event.target.value)}
                        disabled={isBusy(jobState)}
                      />
                    </CardContent>
                  </Card>
                )
              ) : null}

              <DropZone
                file={file}
                fileCount={queue.length}
                isBusy={isBusy(jobState)}
                copy={t}
                onPick={() => fileInputRef.current?.click()}
                onDropFiles={(nextFiles) => void handleFiles(nextFiles)}
              />

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="audio/*,video/*"
                className="hidden"
                onChange={(event) => {
                  const nextFiles = Array.from(event.target.files ?? [])
                  if (nextFiles.length > 0) {
                    void handleFiles(nextFiles)
                  }
                  event.currentTarget.value = ""
                }}
              />

              {queue.length > 1 ? (
                <FileQueuePanel
                  queue={queue}
                  selectedId={selectedQueueId}
                  disabled={isBusy(jobState)}
                  copy={t}
                  onSelect={(item) => void analyzeSelectedFile(item.file, settingsRef.current, false, item.id)}
                  onRemove={(id) => void removeQueuedFile(id)}
                />
              ) : null}

              <PreflightPanel
                analysis={analysis}
                model={model.label}
                copy={t}
                progress={progress}
                progressLog={progressLog}
                jobState={jobState}
                error={error}
                canStart={Boolean(canStart)}
                canStartAll={canStartAll}
                queueCount={queue.length}
                onStart={() => void startTranscription()}
                onStartAll={() => void startBatchTranscription()}
                onErrorClick={() => setErrorDialogOpen(true)}
              />
            </div>

            <aside className="flex min-w-0 flex-col gap-4">
              {isEnglishOnlyMismatch ? (
                <div className="animate-in fade-in slide-in-from-top-1 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive duration-200">
                  {t.englishOnlySidebar}
                </div>
              ) : null}

              <HistoryPanel
                history={history}
                onSelect={openTranscriptResult}
                onRemove={(id) => void removeTranscript(id)}
                copy={t}
              />
            </aside>
          </section>
        )}
      </div>
      <ResultDialog
        transcript={transcript}
        open={isResultOpen}
        onOpenChange={setIsResultOpen}
        onExport={downloadTranscript}
        onRename={(id, title) => void renameTranscriptTitle(id, title)}
        copy={t}
      />
      <AppToast
        message={toastMessage}
        onDismiss={() => setToastMessage(null)}
        copy={t}
      />
      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent className="max-w-lg border-destructive/30">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-5" />
              {t.transcriptionFailed}
            </DialogTitle>
            <DialogDescription className="sr-only">Error details</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-auto rounded-md border bg-muted/30 p-4">
            <pre className="whitespace-pre-wrap break-words text-sm font-mono text-foreground">
              {error}
            </pre>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">{t.closeResults}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function MainControls({
  settings,
  model,
  copy,
  isEnglishOnlyMismatch,
  updateSetting,
}: {
  settings: AppSettings
  model: ReturnType<typeof findModel>
  copy: Copy
  isEnglishOnlyMismatch: boolean
  updateSetting: <T extends keyof AppSettings>(key: T, value: AppSettings[T]) => void
}) {
  const modelDescription =
    copy.modelDescriptions[model.id as keyof typeof copy.modelDescriptions] ?? model.notes
  const usesQuantizedWeights = getLocalModelDtype(model) === "q4"

  return (
    <Card className="relative z-20 overflow-visible animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out">
      <CardHeader>
        <CardTitle className="text-base">{copy.quickSetup}</CardTitle>
        <CardDescription>{copy.quickSetupDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {settings.mode !== "server" ? (
          <div className="grid gap-2">
            <Label>{copy.model}</Label>
            <Select
              value={settings.modelId}
              onValueChange={(value) => updateSetting("modelId", value)}
            >
              <SelectTrigger aria-label={copy.model} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {WHISPER_MODELS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              {copy.downloadDescription(modelDescription, model.sizeMb)}
            </p>
          </div>
        ) : null}

        <div className="grid gap-2">
          <Label>{copy.language}</Label>
          <LanguageCombobox
            value={settings.language}
            copy={copy}
            onValueChange={(value) => updateSetting("language", value)}
          />
          <p className="text-xs leading-5 text-muted-foreground">{copy.spokenLanguage}</p>
        </div>

        {isEnglishOnlyMismatch ? (
          <p className="text-sm text-destructive md:col-span-2">{copy.englishOnlyWarning}</p>
        ) : null}

        {usesQuantizedWeights ? (
          <p className="text-sm text-muted-foreground md:col-span-2">
            {copy.quantizedLargeModel(model.label)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function LanguageCombobox({
  value,
  copy,
  onValueChange,
}: {
  value: LanguageCode
  copy: Copy
  onValueChange: (value: LanguageCode) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const containerRef = React.useRef<HTMLDivElement>(null)
  const selectedLabel = getLanguageLabel(value, copy.languageLabels.auto)
  const normalizedQuery = query.trim().toLowerCase()
  const options = React.useMemo(() => {
    const allOptions = [
      {
        code: "auto",
        name: copy.languageLabels.auto,
        nativeName: copy.languageLabels.auto,
        whisperName: "auto",
      },
      ...TRANSCRIPTION_LANGUAGES,
    ]

    if (!normalizedQuery) {
      return allOptions
    }

    return allOptions.filter((item) =>
      [item.code, item.name, item.nativeName, item.whisperName]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    )
  }, [copy.languageLabels.auto, normalizedQuery])

  React.useEffect(() => {
    if (!open) {
      return
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer)

    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        aria-label={copy.language}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="w-full justify-between"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronsUpDown className="size-4 text-muted-foreground" />
      </Button>

      {open ? (
        <div className="absolute z-50 mt-2 w-full min-w-[18rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Search className="size-4 text-muted-foreground" />
            <Input
              role="searchbox"
              aria-label={copy.searchLanguage}
              value={query}
              className="h-8 border-0 px-1 shadow-none focus-visible:ring-0"
              placeholder={copy.searchLanguage}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setOpen(false)
                }
              }}
            />
          </div>

          <div role="listbox" className="max-h-72 overflow-auto p-2">
            {options.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {copy.noLanguages}
              </p>
            ) : (
              options.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  role="option"
                  aria-selected={item.code === value}
                  className="flex w-full items-center gap-3 rounded-sm px-3 py-3 text-left text-sm hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent"
                  onClick={() => {
                    onValueChange(item.code)
                    setQuery("")
                    setOpen(false)
                  }}
                >
                  <Check className={cn("size-4", item.code === value ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.code === "auto" ? copy.spokenLanguage : item.nativeName}
                    </span>
                  </span>
                  <span className="shrink-0 pr-1 text-xs uppercase text-muted-foreground">{item.code}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SettingsPage({
  settings,
  updateSetting,
  storageActionsDisabled,
  onClearDownloadedModels,
  onClearSavedTranscripts,
  onBack,
  copy,
}: {
  settings: AppSettings
  updateSetting: <T extends keyof AppSettings>(key: T, value: AppSettings[T]) => void
  storageActionsDisabled: boolean
  onClearDownloadedModels: () => void
  onClearSavedTranscripts: () => void
  onBack: () => void
  copy: Copy
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 sm:gap-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={copy.backHome}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{copy.settings}</h2>
          <p className="text-sm text-muted-foreground">
            {copy.settingsDescription}
          </p>
        </div>
      </div>

      <Card className="animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out">
        <CardHeader>
          <CardTitle>{copy.processing}</CardTitle>
          <CardDescription>{copy.processingDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <SettingRow label={copy.mode} description={copy.modeDetails[settings.mode]}>
            <Select
              value={settings.mode}
              onValueChange={(value) => updateSetting("mode", value as ProcessingMode)}
            >
              <SelectTrigger aria-label={copy.mode} className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {MODES.filter((item) => item.value !== "server" || Boolean(import.meta.env.VITE_SERVER_URL)).map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {copy.modeLabels[item.value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
          <Separator />
          {settings.mode !== "server" ? (
            <>
              <SettingRow label={copy.chunkSeconds} description={copy.chunkSecondsDescription}>
                <Input
                  type="number"
                  min={15}
                  max={60}
                  value={settings.chunkSeconds}
                  aria-label={copy.chunkSeconds}
                  className="w-full sm:w-24"
                  onChange={(event) => updateSetting("chunkSeconds", Number(event.target.value))}
                />
              </SettingRow>
              <SettingRow label={copy.overlapSeconds} description={copy.overlapSecondsDescription}>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={settings.overlapSeconds}
                  aria-label={copy.overlapSeconds}
                  className="w-full sm:w-24"
                  onChange={(event) => updateSetting("overlapSeconds", Number(event.target.value))}
                />
              </SettingRow>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card className="animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out delay-75">
        <CardHeader>
          <CardTitle>{copy.storage}</CardTitle>
          <CardDescription>{copy.storageDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <SettingRow
            label={copy.persistMediaBlobs}
            description={copy.persistMediaBlobsDescription}
          >
            <Switch
              checked={settings.persistMediaBlobs}
              aria-label={copy.persistMediaBlobs}
              onCheckedChange={(checked) => updateSetting("persistMediaBlobs", checked)}
            />
          </SettingRow>
          <Separator />
          <div className="grid gap-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-medium">{copy.storageCleanup}</h3>
              <p className="text-xs text-muted-foreground">{copy.storageCleanupDescription}</p>
            </div>
            <SettingRow
              label={copy.clearDownloadedModels}
              description={copy.clearDownloadedModelsDescription}
            >
              <Button
                type="button"
                variant="outline"
                disabled={storageActionsDisabled}
                onClick={onClearDownloadedModels}
              >
                {copy.clearDownloadedModels}
              </Button>
            </SettingRow>
            <SettingRow
              label={copy.clearSavedTranscripts}
              description={copy.clearSavedTranscriptsDescription}
            >
              <Button
                type="button"
                variant="destructive"
                disabled={storageActionsDisabled}
                onClick={onClearSavedTranscripts}
              >
                {copy.clearSavedTranscripts}
              </Button>
            </SettingRow>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-3 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0 space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0 sm:shrink-0">{children}</div>
    </div>
  )
}

function DropZone({
  file,
  fileCount,
  isBusy,
  copy,
  onPick,
  onDropFiles,
}: {
  file: File | null
  fileCount: number
  isBusy: boolean
  copy: Copy
  onPick: () => void
  onDropFiles: (files: File[]) => void
}) {
  const title = file ? (fileCount > 1 ? copy.filesSelected(fileCount) : file.name) : copy.dropTitle
  const description = file && fileCount > 1 ? copy.selectedFile(file.name) : copy.dropDescription

  return (
    <div
      className={cn(
        "group relative grid min-h-[240px] place-items-center rounded-lg border border-dashed bg-card p-6 text-center transition-all duration-200 ease-out",
        !isBusy && "hover:border-ring hover:bg-accent/40"
      )}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const droppedFiles = Array.from(event.dataTransfer.files)
        if (droppedFiles.length > 0) {
          onDropFiles(droppedFiles)
        }
      }}
    >
      <div className="flex max-w-xl flex-col items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-md border bg-muted text-muted-foreground [&_svg]:size-5">
          {file?.type.startsWith("video/") ? <FileVideo /> : file ? <FileAudio /> : <UploadCloud />}
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight">
            {title}
          </h2>
          <p className="mx-auto max-w-[58ch] text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        <Button onClick={onPick} disabled={isBusy}>
          <UploadCloud /> {copy.chooseFile}
        </Button>
      </div>
    </div>
  )
}

function FileQueuePanel({
  queue,
  selectedId,
  disabled,
  copy,
  onSelect,
  onRemove,
}: {
  queue: QueuedFile[]
  selectedId: string | null
  disabled: boolean
  copy: Copy
  onSelect: (item: QueuedFile) => void
  onRemove: (id: string) => void
}) {
  return (
    <Card className="animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out">
      <CardHeader className="pb-3">
        <CardDescription>{copy.fileQueue}</CardDescription>
        <CardTitle className="text-base">{copy.filesSelected(queue.length)}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {queue.map((item) => (
          <div
            key={item.id}
            className={cn(
              "grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md border px-2 py-2 text-sm transition-colors",
              selectedId === item.id ? "border-ring bg-accent" : "hover:bg-accent/60",
              disabled && "cursor-not-allowed opacity-70"
            )}
          >
            <button
              type="button"
              className="min-w-0 text-left"
              aria-label={`${copy.selectFile}: ${item.file.name}`}
              disabled={disabled}
              onClick={() => onSelect(item)}
            >
              <span className="block truncate font-medium">{item.file.name}</span>
              <span className="block text-xs text-muted-foreground">{bytesToMb(item.file.size)} MB</span>
            </button>
            <Badge variant={item.status === "error" ? "destructive" : item.status === "complete" ? "secondary" : "outline"}>
              {copy.queueStatusLabels[item.status]}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              aria-label={`${copy.removeFile}: ${item.file.name}`}
              disabled={disabled}
              onClick={() => onRemove(item.id)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function PreflightPanel({
  analysis,
  model,
  copy,
  progress,
  progressLog,
  jobState,
  error,
  canStart,
  canStartAll,
  queueCount,
  onStart,
  onStartAll,
  onErrorClick,
}: {
  analysis: MediaAnalysis | null
  model: string
  copy: Copy
  progress: TranscriptionProgress
  progressLog: ProgressLogEntry[]
  jobState: JobState
  error: string | null
  canStart: boolean
  canStartAll: boolean
  queueCount: number
  onStart: () => void
  onStartAll: () => void
  onErrorClick: () => void
}) {
  const progressMessage = progress.phase === "idle" ? copy.waiting : progress.message
  const [showDetailedLog, setShowDetailedLog] = React.useState(false)

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardDescription>{copy.preflight}</CardDescription>
          <CardTitle className="text-base">{copy.processingPlan}</CardTitle>
        </div>
        <Badge variant="outline" className="capitalize">
          {copy.jobStateLabels[jobState]}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-5">
        {analysis ? (
          <div className="grid animate-in fade-in slide-in-from-bottom-1 gap-3 duration-300 sm:grid-cols-2">
            <Metric
              icon={<Gauge />}
              label={copy.duration}
              value={analysis.duration === null ? copy.unknownDuration : formatDuration(analysis.duration)}
            />
            <Metric icon={<Download />} label={copy.size} value={`${bytesToMb(analysis.fileSize)} MB`} />
            <Metric icon={<Languages />} label={copy.model} value={model} />
            <Metric
              icon={<CheckCircle2 />}
              label={copy.chunks}
              value={`${analysis.chunkPlan.estimatedChunks}`}
            />
          </div>
        ) : (
           <p className="animate-in fade-in text-sm text-muted-foreground duration-200">
            {copy.emptyPreflight}
          </p>
        )}

        {analysis ? (
          <div className="animate-in fade-in slide-in-from-bottom-1 space-y-3 duration-300">
            <div className="rounded-md border bg-muted/40 p-4 transition-colors duration-200">
              <p className="text-xs font-medium text-muted-foreground">{copy.downloads}</p>
              <div className="mt-3 grid gap-2">
                {analysis.requiredAssets.map((asset) => (
                  <div key={asset.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{asset.label}</span>
                    <span className="text-muted-foreground">~{asset.sizeMb} MB</span>
                  </div>
                ))}
              </div>
            </div>
            {analysis.warnings.map((warning) => (
              <p key={warning} className="animate-in fade-in text-xs leading-5 text-muted-foreground duration-200">
                {warning}
              </p>
            ))}
          </div>
        ) : null}

        <div className="space-y-3">
          <Progress value={Math.round(progress.progress * 100)} className="h-1.5" />
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground">{progressMessage}</span>
            <span className="font-medium">{Math.round(progress.progress * 100)}%</span>
          </div>
          {progressLog.length > 0 ? (
            <div className="rounded-md border bg-muted/20">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40"
                onClick={() => setShowDetailedLog((current) => !current)}
                aria-expanded={showDetailedLog}
              >
                <span className="font-medium">{copy.detailedLog}</span>
                <span className="text-xs text-muted-foreground">
                  {showDetailedLog ? copy.hideDetailedLog : copy.showDetailedLog}
                </span>
              </button>
              {showDetailedLog ? (
                <div className="max-h-52 overflow-auto border-t px-3 py-2">
                  <div className="grid gap-2">
                    {progressLog.map((entry) => (
                      <div key={entry.id} className="grid gap-1 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-muted-foreground">{entry.message}</span>
                          <span className="shrink-0 font-medium">
                            {entry.progress === undefined ? "--" : `${Math.round(entry.progress * 100)}%`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground/70">
                          <span>{copy.jobStateLabels[entry.phase]}</span>
                          <span>{entry.updatedAt}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <button
              type="button"
              className="animate-in fade-in slide-in-from-top-1 cursor-pointer text-left text-sm text-destructive underline decoration-destructive/30 underline-offset-2 duration-200 hover:decoration-destructive"
              onClick={() => onErrorClick()}
              title="Click for full error details"
            >
              {error}
            </button>
          ) : null}
          <div className={cn("grid gap-2", queueCount > 1 && "sm:grid-cols-2")}>
            <Button className="w-full" disabled={!canStart} onClick={onStart}>
              {isBusy(jobState) ? <Loader2 className="animate-spin" /> : <Play />}
              {queueCount > 1 ? copy.transcribeSelected : copy.confirmTranscribe}
            </Button>
            {queueCount > 1 ? (
              <Button className="w-full" variant="outline" disabled={!canStartAll} onClick={onStartAll}>
                {isBusy(jobState) ? <Loader2 className="animate-spin" /> : <Play />}
                {copy.transcribeAll(queueCount)}
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ResultDialog({
  transcript,
  open,
  onOpenChange,
  onExport,
  onRename,
  copy,
}: {
  transcript: TranscriptDocument | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onExport: (document: TranscriptDocument, format: ExportFormat) => void
  onRename: (id: string, title: string) => void
  copy: Copy
}) {
  const transcriptModel = transcript ? findModel(transcript.modelId) : null

  return (
    <Dialog open={open && Boolean(transcript)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] max-w-6xl overflow-hidden p-0">
        {transcript ? (
          <>
            <DialogHeader className="border-b px-5 py-4 sm:px-6">
              <DialogDescription>{copy.transcript}</DialogDescription>
              <DialogTitle className="sr-only">{transcript.title}</DialogTitle>
              <RenameTitleForm
                key={transcript.id}
                transcript={transcript}
                onRename={onRename}
                copy={copy}
              />
              <div className="flex flex-wrap gap-2 pt-1" aria-label={copy.transcriptDetails}>
                <Badge variant="secondary">{transcriptModel?.label ?? transcript.modelId}</Badge>
                <Badge variant="outline">{copy.modeLabels[transcript.mode]}</Badge>
                <Badge variant="outline">
                  {getLanguageLabel(transcript.language, copy.languageLabels.auto)}
                </Badge>
              </div>
            </DialogHeader>

            <div className="grid min-h-0 gap-0 overflow-hidden lg:grid-cols-2">
              <section className="min-h-0 border-b p-4 lg:border-r lg:border-b-0 sm:p-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">{copy.rawText}</h3>
                </div>
                <Textarea
                  key={transcript.id}
                  className="h-[32svh] min-h-72 resize-none text-sm leading-6 lg:h-[48svh]"
                  value={transcript.text}
                  onChange={() => undefined}
                  readOnly
                />
              </section>

              <section className="min-h-0 p-4 sm:p-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">{copy.textWithTimestamps}</h3>
                </div>
                <div className="h-[32svh] min-h-72 overflow-auto rounded-md border lg:h-[48svh]">
                  {transcript.segments.map((segment) => (
                    <div
                      key={segment.id}
                      className="grid gap-1 border-b px-3 py-2.5 last:border-b-0 sm:grid-cols-[7rem_1fr] sm:gap-3"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatSegmentTime(segment.start)} - {formatSegmentTime(segment.end)}
                      </span>
                      <span className="text-sm leading-6">{segment.text}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <DialogFooter className="items-center justify-between gap-3 border-t px-5 py-4 sm:flex-row sm:px-6">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="mr-1 text-sm text-muted-foreground">{copy.downloadFiles}</span>
                {EXPORTS.map((format) => (
                  <Button
                    key={format}
                    variant="outline"
                    size="sm"
                    onClick={() => onExport(transcript, format)}
                  >
                    <Download />
                    .{format}
                  </Button>
                ))}
              </div>
              <DialogClose asChild>
                <Button variant="secondary">{copy.closeResults}</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function RenameTitleForm({
  transcript,
  onRename,
  copy,
}: {
  transcript: TranscriptDocument
  onRename: (id: string, title: string) => void
  copy: Copy
}) {
  const [title, setTitle] = React.useState(transcript.title)

  function saveTitle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onRename(transcript.id, title)
  }

  return (
    <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={saveTitle}>
      <Input
        value={title}
        aria-label={copy.renameTranscript}
        className="h-9 text-base font-semibold sm:text-lg"
        onChange={(event) => setTitle(event.target.value)}
      />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={title.trim() === transcript.title}
      >
        {copy.saveName}
      </Button>
    </form>
  )
}

function HistoryPanel({
  history,
  onSelect,
  onRemove,
  copy,
}: {
  history: TranscriptDocument[]
  onSelect: (document: TranscriptDocument) => void
  onRemove: (id: string) => void
  copy: Copy
}) {
  return (
    <Card className="min-h-0 p-4">
      <p className="mb-4 text-xs font-medium text-muted-foreground">{copy.recent}</p>
      <div className="grid max-h-[330px] gap-2 overflow-auto pr-1">
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.emptyHistory}</p>
        ) : (
          history.map((item) => (
            <div
              key={item.id}
              className="group/history-item grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-md border p-2 text-sm transition-colors duration-200 hover:bg-accent animate-in fade-in slide-in-from-bottom-1"
            >
              <button
                type="button"
                className="min-w-0 text-left"
                aria-label={`${copy.openTranscript}: ${item.title}`}
                onClick={() => onSelect(item)}
              >
                <span className="block truncate font-medium">{item.title}</span>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="max-w-full truncate">
                    {findModel(item.modelId).label}
                  </Badge>
                  <Badge variant="outline" className="max-w-full truncate">
                    {getLanguageLabel(item.language, copy.languageLabels.auto)}
                  </Badge>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString()}
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground opacity-80 transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover/history-item:opacity-100 sm:focus-visible:opacity-100"
                aria-label={`${copy.removeTranscript}: ${item.title}`}
                onClick={() => onRemove(item.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

function AppToast({
  message,
  onDismiss,
  copy,
}: {
  message: ToastMessage | null
  onDismiss: () => void
  copy: Copy
}) {
  if (!message) {
    return null
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 w-[calc(100vw-2rem)] max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div role="status" aria-live="polite" className={cn(
        "rounded-lg border p-4 shadow-lg",
        message.kind === "error"
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "bg-popover text-popover-foreground"
      )}>
        <div className="flex items-start gap-3">
          {message.kind === "error" ? (
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{message.title}</p>
            <p className="mt-1 text-sm opacity-80">{message.description}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            aria-label={copy.dismissNotification}
            onClick={onDismiss}
          >
            ×
          </Button>
        </div>
      </div>
    </div>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border p-3 transition-colors duration-200 hover:bg-accent/40">
      <div className="mb-2 text-muted-foreground [&_svg]:size-4">{icon}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium">{value}</p>
    </div>
  )
}

function formatSegmentTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds)
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const wholeSeconds = Math.floor(safeSeconds % 60)

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${wholeSeconds
      .toString()
      .padStart(2, "0")}`
  }

  return `${minutes}:${wholeSeconds.toString().padStart(2, "0")}`
}

function isBusy(jobState: JobState) {
  return ["analyzing", "downloading-assets", "preparing-media", "chunking", "transcribing", "saving"].includes(jobState)
}

export default App
