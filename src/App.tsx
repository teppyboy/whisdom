import * as React from "react"
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Check,
  ChevronDown,
  ChevronUp,
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
import {
  analyzeMediaFile,
  bytesToMb,
  formatDuration,
} from "@/features/media/preflight"
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
import { formatProductError, type ProductError } from "@/app/copy"
import { ProductErrorPanel } from "@/components/product/ProductErrorPanel"
import {
  downloadTranscript,
  type ExportFormat,
} from "@/features/transcription/exports"
import "@/features/storage/compatibility-api"
import {
  deleteTranscript,
  clearTranscripts,
  listTranscripts,
  loadSettings,
  renameTranscript,
  saveSettings,
  saveTranscript,
  StorageCompatibilityError,
} from "@/features/storage/indexed-db"
import {
  isGoogleDriveConfigured,
  requestDriveAccess,
  uploadTranscriptMetadata,
} from "@/features/google-drive/drive"
import { clearAllModelCaches } from "@/features/storage/cleanup"
import { cn } from "@/lib/utils"
import { createId } from "@/lib/id"
import {
  clearLocalWorkerState,
  convertWithFfmpeg,
  transcribeLocally,
} from "@/lib/transcription-worker-client"
import { transcribeChunkWithServer } from "@/features/server-transcription/client"
import { localHelperClient } from "@/features/local-helper/client"
import { normalizeHelperProgress } from "@/features/local-helper/progress"
import type {
  HelperCapabilities,
  HelperHealth,
  HelperModel,
} from "@/features/local-helper/types"
import { ServerTranscriptionApi } from "@/features/server-transcription/api"
import type {
  ServerCapabilities,
  ServerJobPhase,
  ServerJobStatus,
} from "@/features/server-transcription/types"
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
  {
    value: "local-webgpu",
    label: "Local WebGPU",
    detail: "Default, fastest private path",
  },
  {
    value: "cloudflare-ai",
    label: "Manual server",
    detail: "Authorized users, free quota only",
  },
  {
    value: "local-wasm",
    label: "Local WASM",
    detail: "Fallback for unsupported browsers",
  },
  {
    value: "local-helper",
    label: "Local Helper",
    detail: "Native Vulkan/CPU helper on this Windows device",
  },
  {
    value: "server",
    label: "Server (CPU)",
    detail: "Server-side whisper.cpp. Sign in required.",
  },
]

const EXPORTS: ExportFormat[] = ["txt", "json", "srt", "vtt"]
const COMPANION_RELEASES_URL = "https://github.com/teppyboy/whisdom/releases"

type View = "home" | "settings"
type CompanionHealthState = HelperHealth | "checking" | null
type ProgressLogEntry = {
  id: string
  phase: JobState
  message: string
  progress?: number
  updatedAt: string
}
type QueuedFileStatus = "pending" | "active" | "complete" | "error"
type QueueSource =
  | { kind: "browser"; file: File }
  | { kind: "companion"; selectionId: string; name: string; sizeBytes: number }
type QueuedFile = {
  id: string
  source: QueueSource
  status: QueuedFileStatus
  transcriptId?: string
  error?: string
}

function queueFileName(item: QueuedFile) {
  return item.source.kind === "browser"
    ? item.source.file.name
    : item.source.name
}

function queueFileSize(item: QueuedFile) {
  return item.source.kind === "browser"
    ? item.source.file.size
    : item.source.sizeBytes
}

function resolveTranscriptModelLabel(
  transcript: TranscriptDocument,
  serverCapabilities: ServerCapabilitiesState,
  helperCapabilities: HelperCapabilities | null
) {
  if (transcript.mode === "server")
    return resolveServerModelLabel(transcript.modelId, serverCapabilities)
  if (transcript.mode === "local-helper")
    return (
      helperCapabilities?.models.find(
        (model) => model.id === transcript.modelId
      )?.label ?? transcript.modelId
    )
  return findModel(transcript.modelId).label
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
type ServerCapabilitiesState = ServerCapabilities | "loading" | "error" | null

const UI_LANGUAGES: Array<{ value: UiLanguage; label: string }> = [
  { value: "en", label: "English" },
  { value: "vi", label: "Tiếng Việt" },
]

const COPY = {
  en: {
    homeAria: "Go to home",
    tagline: "Private transcription, on your terms",
    accountMenu: "Account menu",
    guest: "Not signed in",
    signInGoogle: "Sign in with Google",
    settings: "Settings",
    theme: "Theme",
    toggleTheme: "Dark mode",
    openingGoogle: "Connecting to Google",
    uploadingMetadata: "Saving transcript metadata",
    driveSyncFailed: "Could not sync with Google Drive",
    googleConnected: "Google Drive connected",
    synced: (id: string) => `Synced ${id}`,
    notConnected: "Google Drive not connected",
    waiting: "Choose a file to begin",
    readingMetadata: "Checking file details",
    reviewPlan: "Review the transcription plan",
    couldNotAnalyze: "Could not read this file",
    serverGuardrail:
      "Chunk uploads are not available in this server mode. Choose a local mode instead.",
    serverRequiresAuth:
      "Sign in with Google before starting server transcription.",
    serverUrl: "Enter an audio or video URL",
    serverModeDesc:
      "Transcribe through the server with whisper.cpp. Google sign-in required.",
    companionTitle: "Desktop Companion",
    companionChecking: "Checking Desktop Companion…",
    companionAvailable: "Desktop Companion is ready",
    companionBusy: "Desktop Companion is working",
    companionUnavailable: "Desktop Companion is not running",
    companionUnavailableDescription:
      "Open the Windows app, or get it from the latest release.",
    downloadCompanion: "Get Desktop Companion",
    companionPreflight:
      "Windows files show their name and size. Duration and chunk estimates appear after transcription starts.",
    companionPickerTitle: "Choose files in Windows",
    companionPickerDescription:
      "Use the Windows file picker to add one or more files. Drag and drop is not available in Desktop Companion mode.",
    companionChooseFiles: "Choose files in Windows",
    moveFileUp: "Move up",
    moveFileDown: "Move down",
    companionModelDescription:
      "Choose a model to see its speed, accuracy, and download size.",
    companionModelDescriptions: {
      "ggml-tiny-q5_1": "Fastest option for quick drafts.",
      "ggml-base-q5_1": "Good balance of speed and accuracy.",
      "ggml-small-q5_1": "More accurate, with a slower download.",
      "ggml-large-v3-turbo-q5_0":
        "High accuracy with faster processing than full Large v3.",
      "ggml-large-v3-q5_0":
        "Best accuracy. Largest download and slowest processing.",
    } satisfies Record<string, string>,
    serverUnavailable: "Server is unavailable",
    serverModelsUnavailable:
      "Available server models could not be loaded. Check the server, then try again.",
    quantizedLargeModel: (label: string) =>
      `${label} uses q4 browser weights to keep memory use within browser limits.`,
    largeModelNeedsWebGpu: (label: string) =>
      `${label} needs WebGPU in this browser. Use HTTPS or localhost on a supported GPU, or choose Whisper Small.`,
    untitledTranscript: "Untitled transcription",
    transcriptReady: "Transcription ready",
    transcriptionFailed: "Transcription could not be completed",
    decodedAudio: "Audio is ready",
    loadingWhisper: "Loading transcription model",
    reusingWhisper: "Using loaded model",
    usingSavedModelAssets: "Using downloaded model files",
    usingSavedModelAsset: (file: string) => `Using ${file}`,
    preparingModel: "Preparing model",
    downloadingModelAssets: "Downloading model files",
    downloading: (file: string) => `Downloading ${file}`,
    transcribingAudio: "Transcribing",
    loadingFfmpeg: "Loading media converter",
    reusingFfmpeg: "Using loaded media converter",
    convertingMedia: "Preparing media",
    backHome: "Back",
    quickSetup: "Set up transcription",
    quickSetupDescription:
      "Choose where transcription runs, then select a model and language.",
    settingsDescription:
      "Manage local storage and advanced processing options.",
    interfaceLanguage: "App language",
    interfaceLanguageDescription: "Used for menus, labels, and messages.",
    transcription: "Transcription",
    transcriptionDescription: "Choose the model and spoken language.",
    model: "Model",
    language: "Language",
    spokenLanguage: "Choose Auto if you are unsure.",
    searchLanguage: "Find a language",
    noLanguages: "No matching languages.",
    englishOnlyWarning:
      "This model only transcribes English. Choose a multilingual model for this language.",
    englishOnlySidebar:
      "This model only transcribes English. Choose a multilingual Whisper model.",
    processing: "Advanced processing",
    processingDescription: "Adjust local audio chunking.",
    mode: "Mode",
    chunkSeconds: "Chunk length",
    chunkSecondsDescription: "Length of each local audio chunk.",
    overlapSeconds: "Chunk overlap",
    overlapSecondsDescription:
      "Repeated audio at each boundary to avoid clipped words.",
    storage: "Local data",
    storageDescription: "Manage data stored in this browser.",
    persistMediaBlobs: "Keep media after refresh",
    persistMediaBlobsDescription:
      "This preference is saved. Original media is not currently restored after reload.",
    storageCleanup: "Clear local data",
    storageCleanupDescription: "Remove saved browser data when you need space.",
    clearDownloadedModels: "Remove downloaded models",
    clearDownloadedModelsDescription:
      "Deletes cached model files and resets idle local workers.",
    clearSavedTranscripts: "Delete saved transcriptions",
    clearSavedTranscriptsDescription:
      "Permanently deletes transcriptions saved in this browser. Export anything you need first.",
    storageCleaned: "Local data cleared",
    modelCachesCleared: (count: number) =>
      count > 0
        ? `${count} model cache cleared.`
        : "No downloaded model files were found.",
    savedTranscriptsCleared: "Saved transcriptions were deleted.",
    dropTitle: "Add audio or video",
    dropDescription:
      "Files are checked before processing starts. Video is converted locally, then transcribed in chunks.",
    chooseFile: "Choose files",
    filesSelected: (count: number) => `${count} files selected`,
    selectedFile: (name: string) => `Selected: ${name}`,
    fileQueue: "Files",
    selectFile: "Open file",
    removeFile: "Remove",
    transcribeSelected: "Transcribe selected file",
    transcribeAll: (count: number) => `Transcribe all ${count} files`,
    queueStatusLabels: {
      pending: "Waiting",
      active: "Processing",
      complete: "Complete",
      error: "Needs attention",
    } satisfies Record<QueuedFileStatus, string>,
    preflight: "File check",
    processingPlan: "Transcription plan",
    duration: "Duration",
    size: "Size",
    chunks: "Chunks",
    emptyPreflight:
      "Choose a file to see its duration, chunk plan, and required downloads.",
    downloads: "Required downloads",
    detailedLog: "Progress details",
    showDetailedLog: "Show progress details",
    hideDetailedLog: "Hide progress details",
    unknownDuration: "Not available",
    confirmTranscribe: "Start transcription",
    transcript: "Transcription",
    timestamps: "Timecodes",
    transcriptDetails: "Model and processing",
    rawText: "Text",
    textWithTimestamps: "Text with timecodes",
    downloadFiles: "Export files",
    closeResults: "Close",
    renameTranscript: "Rename transcription",
    saveName: "Save",
    batchComplete: (count: number) =>
      `${count} transcriptions saved to Recent.`,
    batchCompleteWithFailures: (completed: number, failed: number) =>
      `${completed} transcriptions saved. ${failed} files need attention.`,
    dismissNotification: "Dismiss",
    readyForOutput: "Ready to export",
    emptyTranscript:
      "Your transcription appears here when processing finishes. Exported filenames include the source, language, date, and time.",
    recent: "Recent transcriptions",
    emptyHistory: "No saved transcriptions yet.",
    openTranscript: "Open transcription",
    removeTranscript: "Delete transcription",
    downloadDescription: (notes: string, sizeMb: number) =>
      `${notes} Download: about ${sizeMb} MB.`,
    modelDescriptions: {
      "onnx-community/whisper-base":
        "The default local model for English and Vietnamese.",
      "onnx-community/whisper-tiny":
        "The fastest multilingual option. Accuracy is lower.",
      "onnx-community/whisper-small":
        "Improves accuracy, with a larger download and more memory use.",
      "onnx-community/whisper-medium_timestamped":
        "High-accuracy multilingual model with detailed timecodes. Best on powerful devices.",
      "onnx-community/whisper-large-v3-turbo":
        "High accuracy on powerful devices, without the full Large v3 startup cost.",
      "onnx-community/whisper-large-v3-ONNX":
        "Highest accuracy. Requires a very large download and a powerful device.",
      "onnx-community/whisper-tiny.en":
        "English only. Do not use for Vietnamese.",
    } satisfies Record<string, string>,
    modeDetails: {
      "local-webgpu": "Private browser processing with WebGPU.",
      "cloudflare-ai":
        "For authorized accounts using the available free quota.",
      "local-wasm": "Private browser fallback when WebGPU is unavailable.",
      "local-helper":
        "Use the optional Windows Companion for Vulkan or CPU processing.",
      server: "Server processing with whisper.cpp. Google sign-in required.",
    } satisfies Record<ProcessingMode, string>,
    modeLabels: {
      "local-webgpu": "Local WebGPU",
      "cloudflare-ai": "Manual server",
      "local-wasm": "Local WASM",
      "local-helper": "Desktop Companion",
      server: "Server (CPU)",
    } satisfies Record<ProcessingMode, string>,
    languageLabels: {
      auto: "Auto",
      en: "English",
      vi: "Vietnamese",
    } satisfies Record<string, string>,
    jobStateLabels: {
      idle: "Idle",
      queued: "Queued",
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
    tagline: "Chuyển ngữ riêng tư trên thiết bị",
    accountMenu: "Menu tài khoản",
    guest: "Chưa đăng nhập",
    signInGoogle: "Đăng nhập bằng Google",
    settings: "Cài đặt",
    theme: "Giao diện",
    toggleTheme: "Chế độ tối",
    openingGoogle: "Đang kết nối Google",
    uploadingMetadata: "Đang lưu dữ liệu bản chép",
    driveSyncFailed: "Không thể đồng bộ với Google Drive",
    googleConnected: "Đã kết nối Google Drive",
    synced: (id: string) => `Đã đồng bộ ${id}`,
    notConnected: "Chưa kết nối Google Drive",
    waiting: "Chọn tệp để bắt đầu",
    readingMetadata: "Đang kiểm tra thông tin tệp",
    reviewPlan: "Xem kế hoạch chuyển ngữ",
    couldNotAnalyze: "Không thể đọc tệp này",
    serverGuardrail:
      "Chưa thể tải từng đoạn lên máy chủ ở chế độ này. Hãy chọn một chế độ cục bộ.",
    serverRequiresAuth:
      "Hãy đăng nhập Google trước khi bắt đầu chuyển ngữ trên máy chủ.",
    serverUrl: "Nhập URL âm thanh hoặc video",
    serverModeDesc:
      "Chuyển ngữ qua máy chủ bằng whisper.cpp. Cần đăng nhập Google.",
    companionTitle: "Desktop Companion",
    companionChecking: "Đang kiểm tra Desktop Companion…",
    companionAvailable: "Desktop Companion đã sẵn sàng",
    companionBusy: "Desktop Companion đang xử lý",
    companionUnavailable: "Desktop Companion chưa chạy",
    companionUnavailableDescription:
      "Mở ứng dụng Windows hoặc tải từ bản phát hành mới nhất.",
    downloadCompanion: "Tải Desktop Companion",
    companionPreflight:
      "Tệp từ Windows hiển thị tên và dung lượng. Thời lượng và số đoạn sẽ có khi bắt đầu chuyển ngữ.",
    companionPickerTitle: "Chọn tệp trong Windows",
    companionPickerDescription:
      "Dùng hộp chọn tệp Windows để thêm một hoặc nhiều tệp. Không hỗ trợ kéo thả trong chế độ Desktop Companion.",
    companionChooseFiles: "Chọn tệp trong Windows",
    moveFileUp: "Di chuyển lên",
    moveFileDown: "Di chuyển xuống",
    companionModelDescription:
      "Chọn mô hình để xem tốc độ, độ chính xác và dung lượng cần tải.",
    companionModelDescriptions: {
      "ggml-tiny-q5_1": "Nhanh nhất, phù hợp bản nháp nhanh.",
      "ggml-base-q5_1": "Cân bằng tốt giữa tốc độ và độ chính xác.",
      "ggml-small-q5_1": "Chính xác hơn, nhưng tải xuống chậm hơn.",
      "ggml-large-v3-turbo-q5_0":
        "Độ chính xác cao, xử lý nhanh hơn Large v3 đầy đủ.",
      "ggml-large-v3-q5_0":
        "Độ chính xác cao nhất. Cần tải nhiều nhất và xử lý chậm nhất.",
    } satisfies Record<string, string>,
    serverUnavailable: "Máy chủ hiện không khả dụng",
    serverModelsUnavailable:
      "Không tải được các mô hình trên máy chủ. Kiểm tra máy chủ rồi thử lại.",
    quantizedLargeModel: (label: string) =>
      `${label} dùng trọng số q4 để giữ mức dùng bộ nhớ trong giới hạn của trình duyệt.`,
    largeModelNeedsWebGpu: (label: string) =>
      `${label} cần WebGPU trong trình duyệt này. Hãy dùng HTTPS hoặc localhost với GPU được hỗ trợ, hoặc chọn Whisper Small.`,
    untitledTranscript: "Bản chuyển ngữ chưa đặt tên",
    transcriptReady: "Bản chuyển ngữ đã sẵn sàng",
    transcriptionFailed: "Không thể hoàn tất chuyển ngữ",
    decodedAudio: "Âm thanh đã sẵn sàng",
    loadingWhisper: "Đang tải mô hình chuyển ngữ",
    reusingWhisper: "Đang dùng mô hình đã tải",
    usingSavedModelAssets: "Đang dùng tệp mô hình đã tải",
    usingSavedModelAsset: (file: string) => `Đang dùng ${file}`,
    preparingModel: "Đang chuẩn bị mô hình",
    downloadingModelAssets: "Đang tải tệp mô hình",
    downloading: (file: string) => `Đang tải ${file}`,
    transcribingAudio: "Đang chuyển ngữ",
    loadingFfmpeg: "Đang tải công cụ xử lý tệp",
    reusingFfmpeg: "Đang dùng công cụ xử lý tệp đã tải",
    convertingMedia: "Đang chuẩn bị tệp",
    backHome: "Quay lại",
    quickSetup: "Thiết lập chuyển ngữ",
    quickSetupDescription: "Chọn nơi xử lý, sau đó chọn mô hình và ngôn ngữ.",
    settingsDescription: "Quản lý dữ liệu cục bộ và tùy chọn xử lý nâng cao.",
    interfaceLanguage: "Ngôn ngữ ứng dụng",
    interfaceLanguageDescription: "Dùng cho menu, nhãn và thông báo.",
    transcription: "Chuyển ngữ",
    transcriptionDescription: "Chọn mô hình và ngôn ngữ trong tệp.",
    model: "Mô hình",
    language: "Ngôn ngữ",
    spokenLanguage: "Chọn Tự động nếu bạn không chắc.",
    searchLanguage: "Tìm ngôn ngữ",
    noLanguages: "Không có ngôn ngữ phù hợp.",
    englishOnlyWarning:
      "Mô hình này chỉ chuyển ngữ tiếng Anh. Hãy chọn mô hình đa ngôn ngữ cho ngôn ngữ này.",
    englishOnlySidebar:
      "Mô hình này chỉ chuyển ngữ tiếng Anh. Hãy chọn một mô hình Whisper đa ngôn ngữ.",
    processing: "Xử lý nâng cao",
    processingDescription: "Điều chỉnh cách chia âm thanh khi xử lý cục bộ.",
    mode: "Chế độ",
    chunkSeconds: "Độ dài đoạn",
    chunkSecondsDescription: "Độ dài của từng đoạn âm thanh cục bộ.",
    overlapSeconds: "Phần âm thanh lặp",
    overlapSecondsDescription: "Phần âm thanh lặp ở ranh giới để tránh mất từ.",
    storage: "Dữ liệu trên thiết bị",
    storageDescription: "Quản lý dữ liệu đã lưu trong trình duyệt này.",
    persistMediaBlobs: "Giữ tệp sau khi tải lại",
    persistMediaBlobsDescription:
      "Tùy chọn này được lưu. Tệp gốc hiện chưa được khôi phục sau khi tải lại.",
    storageCleanup: "Xóa dữ liệu cục bộ",
    storageCleanupDescription:
      "Xóa dữ liệu đã lưu trong trình duyệt khi cần thêm dung lượng.",
    clearDownloadedModels: "Xóa mô hình đã tải xuống",
    clearDownloadedModelsDescription:
      "Xóa tệp mô hình đã lưu và đặt lại worker cục bộ đang rảnh.",
    clearSavedTranscripts: "Xóa bản chuyển ngữ đã lưu",
    clearSavedTranscriptsDescription:
      "Xóa vĩnh viễn các bản chuyển ngữ trong trình duyệt này. Hãy xuất tệp cần giữ trước.",
    storageCleaned: "Đã xóa dữ liệu cục bộ",
    modelCachesCleared: (count: number) =>
      count > 0
        ? `Đã xóa ${count} bộ nhớ đệm mô hình.`
        : "Không có tệp mô hình đã tải xuống.",
    savedTranscriptsCleared: "Đã xóa các bản chuyển ngữ đã lưu.",
    dropTitle: "Thêm âm thanh hoặc video",
    dropDescription:
      "Tệp sẽ được kiểm tra trước khi bắt đầu xử lý. Video được chuyển đổi trên thiết bị rồi chuyển ngữ theo đoạn.",
    chooseFile: "Chọn tệp",
    filesSelected: (count: number) => `Đã chọn ${count} tệp`,
    selectedFile: (name: string) => `Đang chọn: ${name}`,
    fileQueue: "Tệp đã chọn",
    selectFile: "Mở tệp",
    removeFile: "Xóa",
    transcribeSelected: "Chuyển ngữ tệp đang chọn",
    transcribeAll: (count: number) => `Chuyển ngữ tất cả ${count} tệp`,
    queueStatusLabels: {
      pending: "Đang chờ",
      active: "Đang xử lý",
      complete: "Hoàn tất",
      error: "Cần kiểm tra",
    } satisfies Record<QueuedFileStatus, string>,
    preflight: "Kiểm tra tệp",
    processingPlan: "Kế hoạch chuyển ngữ",
    duration: "Thời lượng",
    size: "Dung lượng",
    chunks: "Đoạn",
    emptyPreflight:
      "Chọn tệp để xem thời lượng, kế hoạch chia đoạn và các tệp cần tải.",
    downloads: "Tệp cần tải",
    detailedLog: "Chi tiết tiến trình",
    showDetailedLog: "Hiện chi tiết tiến trình",
    hideDetailedLog: "Ẩn chi tiết tiến trình",
    unknownDuration: "Chưa có dữ liệu",
    confirmTranscribe: "Bắt đầu chuyển ngữ",
    transcript: "Bản chuyển ngữ",
    timestamps: "Mốc thời gian",
    transcriptDetails: "Mô hình và cách xử lý",
    rawText: "Văn bản",
    textWithTimestamps: "Văn bản có mốc thời gian",
    downloadFiles: "Xuất tệp",
    closeResults: "Đóng",
    renameTranscript: "Đổi tên bản chuyển ngữ",
    saveName: "Lưu",
    batchComplete: (count: number) =>
      `Đã lưu ${count} bản chuyển ngữ vào mục Gần đây.`,
    batchCompleteWithFailures: (completed: number, failed: number) =>
      `Đã lưu ${completed} bản chuyển ngữ. ${failed} tệp cần kiểm tra.`,
    dismissNotification: "Đóng",
    readyForOutput: "Sẵn sàng để xuất",
    emptyTranscript:
      "Bản chuyển ngữ sẽ xuất hiện ở đây khi xử lý xong. Tên tệp xuất có nguồn, ngôn ngữ, ngày và giờ.",
    recent: "Bản chuyển ngữ gần đây",
    emptyHistory: "Chưa có bản chuyển ngữ nào được lưu.",
    openTranscript: "Mở bản chuyển ngữ",
    removeTranscript: "Xóa bản chuyển ngữ",
    downloadDescription: (notes: string, sizeMb: number) =>
      `${notes} Cần tải khoảng ${sizeMb} MB.`,
    modelDescriptions: {
      "onnx-community/whisper-base":
        "Mô hình cục bộ mặc định cho tiếng Anh và tiếng Việt.",
      "onnx-community/whisper-tiny":
        "Lựa chọn đa ngôn ngữ nhanh nhất, nhưng độ chính xác thấp hơn.",
      "onnx-community/whisper-small":
        "Chính xác hơn, nhưng cần tải xuống và dùng nhiều bộ nhớ hơn.",
      "onnx-community/whisper-medium_timestamped":
        "Mô hình đa ngôn ngữ chính xác cao, có mốc thời gian chi tiết. Phù hợp với thiết bị mạnh.",
      "onnx-community/whisper-large-v3-turbo":
        "Độ chính xác cao trên thiết bị mạnh, với thời gian khởi tạo thấp hơn Large v3 đầy đủ.",
      "onnx-community/whisper-large-v3-ONNX":
        "Độ chính xác cao nhất. Cần tải xuống rất lớn và thiết bị mạnh.",
      "onnx-community/whisper-tiny.en":
        "Chỉ dùng cho tiếng Anh. Không dùng cho tiếng Việt.",
    } satisfies Record<string, string>,
    modeDetails: {
      "local-webgpu": "Xử lý riêng tư trong trình duyệt bằng WebGPU.",
      "cloudflare-ai":
        "Dành cho tài khoản được cấp quyền trong hạn mức hiện có.",
      "local-wasm": "Xử lý riêng tư trong trình duyệt khi không có WebGPU.",
      "local-helper":
        "Dùng Companion Windows tùy chọn để xử lý bằng Vulkan hoặc CPU.",
      server: "Xử lý trên máy chủ bằng whisper.cpp. Cần đăng nhập Google.",
    } satisfies Record<ProcessingMode, string>,
    modeLabels: {
      "local-webgpu": "Local WebGPU",
      "cloudflare-ai": "Máy chủ",
      "local-wasm": "Local WASM",
      "local-helper": "Desktop Companion",
      server: "Máy chủ (CPU)",
    } satisfies Record<ProcessingMode, string>,
    languageLabels: {
      auto: "Tự động",
      en: "Tiếng Anh",
      vi: "Tiếng Việt",
    } satisfies Record<string, string>,
    jobStateLabels: {
      idle: "Sẵn sàng",
      queued: "Đã xếp hàng",
      analyzing: "Đang kiểm tra",
      "awaiting-confirmation": "Chờ xác nhận",
      "downloading-assets": "Đang tải tài nguyên",
      "preparing-media": "Đang chuẩn bị tệp",
      chunking: "Đang chia đoạn",
      transcribing: "Đang chuyển ngữ",
      saving: "Đang lưu",
      complete: "Hoàn tất",
      error: "Cần kiểm tra",
      cancelled: "Đã hủy",
    } satisfies Record<JobState, string>,
  },
} as const

type Copy = (typeof COPY)[UiLanguage]

function companionModelDetails(model: HelperModel, copy: Copy) {
  const description =
    (copy.companionModelDescriptions as Record<string, string>)[model.id] ??
    model.label
  return copy.downloadDescription(
    description,
    Math.ceil(model.size_bytes / (1024 * 1024))
  )
}

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

const SERVER_MODEL_STATIC_FALLBACK: Record<string, string> = {
  tiny: "Tiny",
  base: "Base",
  small: "Small",
  medium: "Medium",
  "large-v3": "Large V3",
}

function resolveServerModelLabel(
  modelId: string,
  capabilities: ServerCapabilitiesState
): string {
  if (typeof capabilities === "object" && capabilities?.models) {
    const found = capabilities.models.find((m) => m.id === modelId)
    if (found) return found.label
  }
  return SERVER_MODEL_STATIC_FALLBACK[modelId] ?? modelId
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
  const [helperCapabilities, setHelperCapabilities] =
    React.useState<HelperCapabilities | null>(null)
  const [companionHealth, setCompanionHealth] =
    React.useState<CompanionHealthState>("checking")
  const [companionModelId, setCompanionModelId] = React.useState("")
  const [selectedQueueId, setSelectedQueueId] = React.useState<string | null>(
    null
  )
  const [analysis, setAnalysis] = React.useState<MediaAnalysis | null>(null)
  const [jobState, setJobState] = React.useState<JobState>("idle")
  const [progress, setProgress] = React.useState<TranscriptionProgress>({
    phase: "idle",
    message: COPY.en.waiting,
    progress: 0,
  })
  const [progressLog, setProgressLog] = React.useState<ProgressLogEntry[]>([])
  const [transcript, setTranscript] = React.useState<TranscriptDocument | null>(
    null
  )
  const [isResultOpen, setIsResultOpen] = React.useState(false)
  const [toastMessage, setToastMessage] = React.useState<ToastMessage | null>(
    null
  )
  const [history, setHistory] = React.useState<TranscriptDocument[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = React.useState(false)
  const [fatalStorageError, setFatalStorageError] =
    React.useState<ProductError | null>(null)
  const [driveStatus, setDriveStatus] = React.useState<DriveStatus>({
    type: "idle",
  })
  const [driveAccessToken, setDriveAccessToken] = React.useState<string | null>(
    null
  )
  const [urlInput, setUrlInput] = React.useState("")
  const serverApiRef = React.useRef<ServerTranscriptionApi | null>(null)
  const [serverCapabilities, setServerCapabilities] =
    React.useState<ServerCapabilitiesState>(null)
  const [serverCapabilitiesKey, setServerCapabilitiesKey] = React.useState<
    string | null
  >(null)
  const settingsRef = React.useRef(settings)
  const companionPickerGeneration = React.useRef(0)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const driveStatusText = getDriveStatusText(driveStatus, t)
  const driveStatusIcon = getDriveStatusIcon(driveStatus)
  const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined
  const serverAuthIdentity =
    driveAccessToken ?? (import.meta.env.DEV ? "dev-mode" : "signed-out")
  const serverRequestKey = `${serverUrl ?? "missing"}\0${serverAuthIdentity}`
  const activeServerCapabilities: ServerCapabilitiesState =
    settings.mode === "server" && serverCapabilitiesKey !== serverRequestKey
      ? "loading"
      : serverCapabilities

  React.useEffect(() => {
    return () => {
      companionPickerGeneration.current += 1
    }
  }, [])

  React.useEffect(() => {
    async function hydrate() {
      try {
        const [storedSettings, storedHistory] = await Promise.all([
          loadSettings(),
          listTranscripts(),
        ])
        settingsRef.current = storedSettings
        setSettings(storedSettings)
        setHistory(storedHistory)
      } catch (caught) {
        if (!(caught instanceof StorageCompatibilityError)) throw caught
        setFatalStorageError({
          occurrenceId: createId("storage-version"),
          code: caught.code,
          severity: "error",
          scope: "navigation",
          scopeId: "database",
          params: { foundVersion: caught.foundVersion, maximumVersion: 2 },
          primaryAction: { code: "inspect-details", params: {} },
          secondaryAction: null,
          retryable: false,
          technicalCause: null,
        })
      }
    }
    void hydrate()
    void navigator.storage?.persist?.().catch(() => undefined)
  }, [])

  React.useEffect(() => {
    void saveSettings(settings).catch((caught: unknown) => {
      if (!(caught instanceof StorageCompatibilityError)) throw caught
    })
  }, [settings])

  React.useEffect(() => {
    if (settings.mode !== "server") return
    if (!serverUrl) {
      let cancelled = false
      queueMicrotask(() => {
        if (!cancelled) {
          setServerCapabilitiesKey(serverRequestKey)
          setServerCapabilities("error")
        }
      })
      return () => {
        cancelled = true
      }
    }
    if (
      serverCapabilitiesKey === serverRequestKey &&
      typeof serverCapabilities === "object" &&
      serverCapabilities
    ) {
      return
    }
    let cancelled = false
    const api = new ServerTranscriptionApi(
      serverUrl,
      () => driveAccessToken ?? (import.meta.env.DEV ? "dev-mode" : null)
    )
    serverApiRef.current = api
    queueMicrotask(() => {
      if (!cancelled) {
        setServerCapabilitiesKey(serverRequestKey)
        setServerCapabilities("loading")
      }
    })
    void api.getCapabilities().then((cap) => {
      if (cancelled) return
      const models = cap?.models ?? []
      const hasValidDefault = Boolean(
        cap?.default_model &&
        models.some((model) => model.id === cap.default_model)
      )
      if (!cap?.available || models.length === 0 || !hasValidDefault) {
        setServerCapabilitiesKey(serverRequestKey)
        setServerCapabilities("error")
        setToastMessage({
          id: createId("toast"),
          title: t.transcriptionFailed,
          description: t.serverModelsUnavailable,
          kind: "error",
        })
        return
      }
      setServerCapabilitiesKey(serverRequestKey)
      setServerCapabilities(cap)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.mode, driveAccessToken])

  React.useEffect(() => {
    if (
      typeof activeServerCapabilities !== "object" ||
      !activeServerCapabilities?.models
    )
      return
    const validIds = new Set(activeServerCapabilities.models.map((m) => m.id))
    if (!settings.serverModelId || !validIds.has(settings.serverModelId)) {
      if (activeServerCapabilities.default_model) {
        updateSetting("serverModelId", activeServerCapabilities.default_model)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServerCapabilities])

  React.useEffect(() => {
    if (settings.mode !== "local-helper") return
    let cancelled = false
    const refresh = () => {
      void localHelperClient.discover().then((health) => {
        if (!cancelled) setCompanionHealth(health)
      })
    }
    refresh()
    const interval = window.setInterval(refresh, 1000)
    window.addEventListener("focus", refresh)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener("focus", refresh)
    }
  }, [settings.mode])

  React.useEffect(() => {
    if (settings.mode !== "local-helper") return
    let cancelled = false
    void localHelperClient
      .connect()
      .then((capabilities) => {
        if (cancelled) return
        setHelperCapabilities(capabilities)
        setCompanionHealth((current) =>
          current === "checking"
            ? { available: true, protocol_version: 1, busy: false }
            : current
        )
        setCompanionModelId((current) =>
          capabilities.models.some((model) => model.id === current)
            ? current
            : (capabilities.models.find(
                (model) => model.id === "ggml-large-v3-turbo-q5_0"
              )?.id ??
              capabilities.models[0]?.id ??
              "")
        )
      })
      .catch(() => {
        if (!cancelled) setHelperCapabilities(null)
      })
    return () => {
      cancelled = true
    }
  }, [settings.mode])

  const model = findModel(settings.modelId)
  const selectedServerModel =
    typeof activeServerCapabilities === "object" &&
    activeServerCapabilities?.models
      ? activeServerCapabilities.models.find(
          (item) => item.id === settings.serverModelId
        )
      : undefined
  const serverSelectionReady = Boolean(selectedServerModel)
  const selectedCompanionModel = helperCapabilities?.models.find(
    (item) => item.id === companionModelId
  )
  const selectedQueueItem = queue.find((item) => item.id === selectedQueueId)
  const companionSelectionReady =
    selectedQueueItem?.source.kind === "companion" &&
    Boolean(selectedCompanionModel)
  const canStart =
    !isBusy(jobState) &&
    (settings.mode === "local-helper"
      ? companionSelectionReady
      : Boolean(file) &&
        Boolean(analysis) &&
        (settings.mode !== "server" || serverSelectionReady))
  const canStartAll =
    queue.length > 1 &&
    !isBusy(jobState) &&
    (settings.mode === "local-helper"
      ? Boolean(selectedCompanionModel) &&
        queue.every((item) => item.source.kind === "companion")
      : settings.mode !== "server" || serverSelectionReady)
  const isEnglishOnlyMismatch =
    isEnglishOnlyLanguageMismatch(settings.language, settings.uiLanguage) &&
    !model.multilingual

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
    recordProgress({
      phase: "analyzing",
      message: t.readingMetadata,
      progress: 0.08,
    })

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
      const message =
        caught instanceof Error ? caught.message : t.couldNotAnalyze
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
      source: { kind: "browser" as const, file: nextFile },
      status: "pending" as const,
    }))
    const shouldAnalyzeFirstAddedFile = queue.length === 0 || !file

    setQueue((current) => [...current, ...addedQueue])

    if (shouldAnalyzeFirstAddedFile) {
      await analyzeSelectedFile(
        nextFiles[0],
        settingsRef.current,
        true,
        addedQueue[0].id
      )
    }
  }

  async function selectCompanionFiles() {
    const generation = ++companionPickerGeneration.current
    try {
      const capabilities = await localHelperClient.connect()
      if (
        generation !== companionPickerGeneration.current ||
        settingsRef.current.mode !== "local-helper"
      )
        return
      setHelperCapabilities(capabilities)
      setCompanionModelId((current) =>
        capabilities.models.some((model) => model.id === current)
          ? current
          : (capabilities.models.find(
              (model) => model.id === "ggml-large-v3-turbo-q5_0"
            )?.id ??
            capabilities.models[0]?.id ??
            "")
      )
      const selections = await localHelperClient.selectFiles()
      if (
        generation !== companionPickerGeneration.current ||
        settingsRef.current.mode !== "local-helper"
      ) {
        await Promise.all(
          selections.map((selection) =>
            localHelperClient
              .deleteSelection(selection.id)
              .catch(() => undefined)
          )
        )
        return
      }
      if (selections.length === 0) return
      const added = selections.map((selection) => ({
        id: createId("file"),
        source: {
          kind: "companion" as const,
          selectionId: selection.id,
          name: selection.filename,
          sizeBytes: selection.size_bytes,
        },
        status: "pending" as const,
      }))
      setQueue((current) => [...current, ...added])
      if (queue.length === 0) selectCompanionQueueItem(added[0])
    } catch (caught) {
      if (
        generation !== companionPickerGeneration.current ||
        settingsRef.current.mode !== "local-helper"
      )
        return
      const message =
        caught instanceof Error ? caught.message : t.transcriptionFailed
      setError(message)
      setToastMessage({
        id: createId("toast"),
        title: t.transcriptionFailed,
        description: message,
        kind: "error",
      })
    }
  }

  function selectCompanionQueueItem(item: QueuedFile) {
    if (item.source.kind !== "companion") return
    setSelectedQueueId(item.id)
    setFile(null)
    setAnalysis(null)
    setTranscript(null)
    setError(null)
    setProgressLog([])
    setJobState("awaiting-confirmation")
    recordProgress({
      phase: "awaiting-confirmation",
      message: t.reviewPlan,
      progress: 0.18,
    })
  }

  async function selectQueueItem(item: QueuedFile) {
    if (item.source.kind === "companion") {
      selectCompanionQueueItem(item)
      return
    }
    await analyzeSelectedFile(
      item.source.file,
      settingsRef.current,
      false,
      item.id
    )
  }

  async function removeQueuedFile(id: string) {
    const currentItem = queue.find((item) => item.id === id)
    if (!currentItem) return
    if (currentItem.source.kind === "companion") {
      try {
        await localHelperClient.deleteSelection(currentItem.source.selectionId)
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : t.transcriptionFailed
        setError(message)
        return
      }
    }
    const nextQueue = queue.filter((item) => item.id !== id)
    setQueue(nextQueue)
    if (selectedQueueId !== id) return
    const removedIndex = queue.findIndex((item) => item.id === id)
    const nextSelected =
      nextQueue[Math.min(Math.max(removedIndex, 0), nextQueue.length - 1)]
    if (nextSelected) {
      await selectQueueItem(nextSelected)
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

  function moveQueueItem(id: string, direction: -1 | 1) {
    setQueue((current) => {
      const index = current.findIndex((item) => item.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function mapServerPhase(phase: ServerJobPhase): JobState {
    switch (phase) {
      case "queued":
        return "queued"
      case "downloading":
        return "downloading-assets"
      case "extracting":
        return "preparing-media"
      case "transcribing":
        return "transcribing"
      case "complete":
        return "complete"
      case "error":
        return "error"
      case "cancelled":
        return "cancelled"
    }
  }

  async function transcribeFile(
    targetFile: File,
    queueId: string | null,
    runSettings: AppSettings
  ) {
    const runModel = findModel(runSettings.modelId)

    setFile(targetFile)
    setSelectedQueueId(queueId)
    updateQueueItem(queueId, { status: "active", error: undefined })
    setError(null)
    setProgressLog([])
    setJobState("analyzing")
    recordProgress({
      phase: "analyzing",
      message: t.readingMetadata,
      progress: 0.08,
    })

    if (runSettings.mode === "cloudflare-ai") {
      if (!driveAccessToken && !import.meta.env.DEV) {
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
      recordProgress({
        phase: "chunking",
        message: t.readingMetadata,
        progress: 0.4,
      })
      const wavBytes = new Uint8Array(await audioBlob.arrayBuffer())
      const { default: initAP, split_wav_chunks } =
        (await import("./wasm/audio-processor/audio_processor.js")) as unknown as {
          default: () => Promise<void>
          split_wav_chunks: (
            data: Uint8Array,
            size: number
          ) => Iterable<unknown>
        }
      await initAP()
      const rawChunks = split_wav_chunks(wavBytes, 9 * 1024 * 1024)
      const chunks = Array.from(rawChunks).map(
        (c) => new Uint8Array(c as ArrayBuffer)
      )

      setJobState("transcribing")
      const cfLanguage = resolveTranscriptionLanguage(
        runSettings.language,
        runSettings.uiLanguage
      )
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
        const result = await transcribeChunkWithServer({
          audio,
          language: cfLanguage,
          accessToken: driveAccessToken ?? "dev-mode",
        })
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
      recordProgress({
        phase: "saving",
        message: t.transcriptReady,
        progress: 0.95,
      })
      await saveTranscript(doc)
      updateQueueItem(queueId, { status: "complete", transcriptId: doc.id })
      setHistory(await listTranscripts())
      setJobState("complete")
      recordProgress({
        phase: "complete",
        message: t.transcriptReady,
        progress: 1,
      })
      return doc
    }

    if (runSettings.mode === "server") {
      if (!driveAccessToken && !import.meta.env.DEV) {
        throw new Error(t.serverRequiresAuth)
      }

      const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined
      if (!serverUrl) throw new Error("Server URL not configured")
      const serverModelId = runSettings.serverModelId
      const modelIsAvailable =
        typeof activeServerCapabilities === "object" &&
        activeServerCapabilities?.models?.some(
          (item) => item.id === serverModelId
        )
      if (!serverModelId || !modelIsAvailable) {
        throw new Error(t.serverModelsUnavailable)
      }

      const api = new ServerTranscriptionApi(
        serverUrl,
        () => driveAccessToken ?? (import.meta.env.DEV ? "dev-mode" : null)
      )

      if (urlInput.trim()) {
        setJobState("downloading-assets")
        recordProgress({
          phase: "downloading-assets",
          message: "Submitting URL...",
          progress: 0.1,
        })
        const jobId = await api.submitJob(
          { type: "url", url: urlInput.trim() },
          runSettings.language,
          serverModelId
        )

        return new Promise<TranscriptDocument>((resolve, reject) => {
          api.subscribeProgress(jobId, (status: ServerJobStatus) => {
            const mapped = mapServerPhase(status.phase)
            recordProgress({
              phase: mapped,
              message: status.message ?? "",
              progress: status.progress ?? 0,
            })

            if (status.phase === "complete" && status.segments) {
              const now = new Date().toISOString()
              const doc: TranscriptDocument = {
                id: createId("tr"),
                title:
                  urlInput
                    .trim()
                    .split("/")
                    .pop()
                    ?.replace(/[?#].*$/, "") || t.untitledTranscript,
                sourceName: urlInput.trim(),
                language: runSettings.language,
                modelId: serverModelId,
                mode: "server",
                createdAt: now,
                updatedAt: now,
                text:
                  status.text ?? status.segments.map((s) => s.text).join(" "),
                segments: status.segments.map((s) => ({
                  id: createId("seg"),
                  start: s.start,
                  end: s.end,
                  text: s.text,
                })),
              }
              setJobState("saving")
              void saveTranscript(doc).then(() => {
                updateQueueItem(queueId, {
                  status: "complete",
                  transcriptId: doc.id,
                })
                void listTranscripts().then(setHistory)
                setJobState("complete")
                recordProgress({
                  phase: "complete",
                  message: t.transcriptReady,
                  progress: 1,
                })
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
      recordProgress({
        phase: "preparing-media",
        message: "Uploading...",
        progress: 0.1,
      })
      const jobId = await api.submitJob(
        { type: "file", file: targetFile, filename: targetFile.name },
        runSettings.language,
        serverModelId
      )

      return new Promise<TranscriptDocument>((resolve, reject) => {
        api.subscribeProgress(jobId, (status: ServerJobStatus) => {
          const mapped = mapServerPhase(status.phase)
          recordProgress({
            phase: mapped,
            message: status.message ?? "",
            progress: status.progress ?? 0,
          })

          if (status.phase === "complete" && status.segments) {
            const now = new Date().toISOString()
            const doc: TranscriptDocument = {
              id: createId("tr"),
              title:
                targetFile.name.replace(/\.[^.]+$/, "") || t.untitledTranscript,
              sourceName: targetFile.name,
              language: runSettings.language,
              modelId: serverModelId,
              mode: "server",
              createdAt: now,
              updatedAt: now,
              text: status.text ?? status.segments.map((s) => s.text).join(" "),
              segments: status.segments.map((s) => ({
                id: createId("seg"),
                start: s.start,
                end: s.end,
                text: s.text,
              })),
            }
            setJobState("saving")
            void saveTranscript(doc).then(() => {
              updateQueueItem(queueId, {
                status: "complete",
                transcriptId: doc.id,
              })
              void listTranscripts().then(setHistory)
              setJobState("complete")
              recordProgress({
                phase: "complete",
                message: t.transcriptReady,
                progress: 1,
              })
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
    const effectiveMode =
      freshAnalysis.recommendedMode === "local-webgpu"
        ? "local-webgpu"
        : "local-wasm"
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
    const effectiveLanguage = resolveTranscriptionLanguage(
      runSettings.language,
      runSettings.uiLanguage
    )
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
    recordProgress({
      phase: "complete",
      message: t.transcriptReady,
      progress: 1,
    })
    return document
  }

  async function transcribeCompanionSelection(
    item: QueuedFile,
    runSettings: AppSettings
  ): Promise<TranscriptDocument> {
    if (item.source.kind !== "companion")
      throw new Error("Invalid companion queue item.")
    const selection = item.source
    if (!companionModelId) throw new Error("No companion model is available.")
    const language = resolveTranscriptionLanguage(
      runSettings.language,
      runSettings.uiLanguage
    )
    setSelectedQueueId(item.id)
    updateQueueItem(item.id, { status: "active", error: undefined })
    setError(null)
    setProgressLog([])
    setJobState("downloading-assets")
    recordProgress({
      phase: "downloading-assets",
      message: t.downloadingModelAssets,
      progress: 0.1,
    })
    const { jobId } = await localHelperClient.startSelection(
      selection.selectionId,
      language,
      companionModelId
    )
    return new Promise<TranscriptDocument>((resolve, reject) => {
      let settled = false
      const connection = localHelperClient.subscribeProgress(
        jobId,
        (status) => {
          const mapped = mapServerPhase(status.phase)
          recordProgress({
            phase: mapped,
            message: status.message ?? t.transcribingAudio,
            progress: normalizeHelperProgress(status.progress),
          })
          setJobState(mapped)
          if (status.phase === "complete" && status.segments) {
            if (settled) return
            settled = true
            connection.unsubscribe()
            const now = new Date().toISOString()
            const document: TranscriptDocument = {
              id: createId("transcript"),
              title:
                selection.name.replace(/\.[^.]+$/, "") || t.untitledTranscript,
              sourceName: selection.name,
              language,
              modelId: companionModelId,
              mode: "local-helper",
              createdAt: now,
              updatedAt: now,
              text:
                status.text ??
                status.segments.map((segment) => segment.text).join(" "),
              segments: status.segments.map((segment) => ({
                ...segment,
                id: createId("segment"),
              })),
            }
            setJobState("saving")
            void saveTranscript(document)
              .then(async () => {
                updateQueueItem(item.id, {
                  status: "complete",
                  transcriptId: document.id,
                })
                setHistory(await listTranscripts())
                setJobState("complete")
                recordProgress({
                  phase: "complete",
                  message: t.transcriptReady,
                  progress: 1,
                })
                resolve(document)
              })
              .catch(reject)
          } else if (status.phase === "complete") {
            if (settled) return
            settled = true
            connection.unsubscribe()
            reject(
              new Error("Helper progress complete status has invalid segments.")
            )
          } else if (status.phase === "error" || status.phase === "cancelled") {
            if (settled) return
            settled = true
            connection.unsubscribe()
            reject(new Error(status.error ?? "Transcription cancelled"))
          }
        },
        (caught) => {
          if (settled) return
          settled = true
          connection.unsubscribe()
          reject(caught)
        }
      )
    })
  }

  async function startTranscription() {
    if (settingsRef.current.mode === "local-helper") {
      if (!selectedQueueItem || selectedQueueItem.source.kind !== "companion")
        return
      try {
        const document = await transcribeCompanionSelection(
          selectedQueueItem,
          settingsRef.current
        )
        setTranscript(document)
        setIsResultOpen(true)
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : t.transcriptionFailed
        updateQueueItem(selectedQueueItem.id, {
          status: "error",
          error: message,
        })
        setJobState("error")
        setError(message)
      }
      return
    }
    if (!file || !analysis) return
    try {
      const document = await transcribeFile(
        file,
        selectedQueueId,
        settingsRef.current
      )
      setTranscript(document)
      setIsResultOpen(true)
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : t.transcriptionFailed
      setJobState("error")
      setError(message)
      updateQueueItem(selectedQueueId, { status: "error", error: message })
    }
  }

  async function startBatchTranscription() {
    const runSettings = settingsRef.current
    const queueSnapshot =
      queue.length > 0
        ? queue
        : file
          ? [
              {
                id: selectedQueueId ?? createId("file"),
                source: { kind: "browser" as const, file },
                status: "pending" as const,
              },
            ]
          : []
    const completed: TranscriptDocument[] = []
    const failures: string[] = []

    setIsResultOpen(false)

    for (const item of queueSnapshot) {
      try {
        const document =
          runSettings.mode === "local-helper"
            ? await transcribeCompanionSelection(item, runSettings)
            : item.source.kind === "browser"
              ? await transcribeFile(item.source.file, item.id, runSettings)
              : (() => {
                  throw new Error("Invalid browser queue item.")
                })()
        completed.push(document)
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : t.transcriptionFailed
        failures.push(`${queueFileName(item)}: ${message}`)
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
      const cacheResult = await clearAllModelCaches(
        localHelperClient.hasPairing()
          ? () => localHelperClient.clearCache()
          : undefined
      )

      setToastMessage({
        id: createId("toast"),
        title: t.storageCleaned,
        description: cacheResult.helperError
          ? `${t.modelCachesCleared(cacheResult.browserDeleted)} Helper cache: ${cacheResult.helperError}`
          : t.modelCachesCleared(cacheResult.browserDeleted),
      })
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : t.transcriptionFailed
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

  function resetQueueForModeChange() {
    companionPickerGeneration.current += 1
    const companionSelections = queue
      .filter(
        (
          item
        ): item is QueuedFile & {
          source: Extract<QueueSource, { kind: "companion" }>
        } => item.source.kind === "companion"
      )
      .map((item) => item.source.selectionId)
    for (const selectionId of companionSelections) {
      void localHelperClient.deleteSelection(selectionId).catch(() => undefined)
    }
    setQueue([])
    setSelectedQueueId(null)
    setFile(null)
    setAnalysis(null)
    setError(null)
    setProgressLog([])
    setJobState("idle")
    setProgress({ phase: "idle", message: t.waiting, progress: 0 })
    setHelperCapabilities(null)
    setCompanionModelId("")
  }

  function updateSetting<T extends keyof AppSettings>(
    key: T,
    value: AppSettings[T]
  ) {
    if (key === "mode" && value !== settings.mode && isBusy(jobState)) return
    const nextSettings = { ...settings, [key]: value }

    if (key === "mode" && value !== settings.mode) resetQueueForModeChange()
    settingsRef.current = nextSettings
    setSettings(nextSettings)

    if (
      key !== "mode" &&
      file &&
      analysis &&
      jobState === "awaiting-confirmation"
    ) {
      void analyzeSelectedFile(file, nextSettings, false, selectedQueueId)
    }
  }

  if (fatalStorageError) {
    const fatalStorageCopy = formatProductError(
      settings.uiLanguage,
      fatalStorageError
    )
    return (
      <main className="min-h-svh bg-background px-4 py-16 text-foreground">
        <div className="mx-auto max-w-xl">
          <div
            className="mb-6 flex gap-2"
            role="group"
            aria-label="Interface language"
          >
            <Button
              variant="outline"
              onClick={() =>
                setSettings((current) => ({ ...current, uiLanguage: "en" }))
              }
            >
              English
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                setSettings((current) => ({ ...current, uiLanguage: "vi" }))
              }
            >
              Tiếng Việt
            </Button>
          </div>
          <ProductErrorPanel
            language={settings.uiLanguage}
            error={fatalStorageError}
            onPrimaryAction={() => setErrorDialogOpen(true)}
          />
          <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
            <DialogContent className="max-w-lg border-destructive/30">
              <DialogHeader>
                <DialogTitle>{fatalStorageCopy.title}</DialogTitle>
                <DialogDescription>
                  {fatalStorageCopy.message}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-80 overflow-auto rounded-md border bg-muted/30 p-4">
                <pre className="font-mono text-sm break-words whitespace-pre-wrap text-foreground">
                  {JSON.stringify(
                    {
                      occurrenceId: fatalStorageError.occurrenceId,
                      code: fatalStorageError.code,
                      params: fatalStorageError.params,
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">{t.closeResults}</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    )
  }

  return (
    <main
      className="min-h-svh bg-background text-foreground"
      data-testid="compatibility-product-ready"
    >
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
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label={t.accountMenu}
              >
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
                <div className="mb-2 text-xs text-muted-foreground">
                  {t.interfaceLanguage}
                </div>
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
                  onCheckedChange={(checked) =>
                    setTheme(checked ? "dark" : "light")
                  }
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
            className="animate-in duration-300 ease-out fade-in slide-in-from-bottom-2"
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
            className="grid flex-1 animate-in gap-6 duration-300 ease-out fade-in slide-in-from-bottom-2 lg:grid-cols-[minmax(0,1fr)_360px]"
          >
            <div className="flex min-w-0 flex-col gap-6">
              <MainControls
                settings={settings}
                model={model}
                copy={t}
                isEnglishOnlyMismatch={isEnglishOnlyMismatch}
                updateSetting={updateSetting}
                serverCapabilities={activeServerCapabilities}
                helperCapabilities={helperCapabilities}
                companionHealth={companionHealth}
                storageActionsDisabled={isBusy(jobState)}
                companionModelId={companionModelId}
                onCompanionModelChange={setCompanionModelId}
              />

              {settings.mode === "server" ? (
                !driveAccessToken && !import.meta.env.DEV ? (
                  <Card className="animate-in duration-300 ease-out fade-in slide-in-from-bottom-1">
                    <CardContent className="flex flex-col items-center gap-4 py-8">
                      <p className="text-sm text-muted-foreground">
                        {t.serverModeDesc}
                      </p>
                      <Button onClick={() => void signInWithGoogle()}>
                        <HardDrive className="mr-2 size-4" />
                        {driveAccessToken ? t.googleConnected : t.signInGoogle}
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="animate-in duration-300 ease-out fade-in slide-in-from-bottom-1">
                    <CardContent className="pt-5">
                      <Label
                        htmlFor="server-url-input"
                        className="text-sm font-medium"
                      >
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

              {settings.mode === "local-helper" ? (
                <>
                  <DropZone
                    file={null}
                    fileCount={queue.length}
                    isBusy={isBusy(jobState)}
                    copy={t}
                    onPick={() => void selectCompanionFiles()}
                    onDropFiles={() => undefined}
                    nativeOnly
                  />
                  {queue.length > 0 ? (
                    <FileQueuePanel
                      queue={queue}
                      selectedId={selectedQueueId}
                      disabled={isBusy(jobState)}
                      copy={t}
                      onSelect={(item) => void selectQueueItem(item)}
                      onRemove={(id) => void removeQueuedFile(id)}
                      onMove={moveQueueItem}
                    />
                  ) : null}
                </>
              ) : (
                <>
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
                      if (nextFiles.length > 0) void handleFiles(nextFiles)
                      event.currentTarget.value = ""
                    }}
                  />
                  {queue.length > 1 ? (
                    <FileQueuePanel
                      queue={queue}
                      selectedId={selectedQueueId}
                      disabled={isBusy(jobState)}
                      copy={t}
                      onSelect={(item) => void selectQueueItem(item)}
                      onRemove={(id) => void removeQueuedFile(id)}
                      onMove={moveQueueItem}
                    />
                  ) : null}
                </>
              )}

              <PreflightPanel
                analysis={analysis}
                model={
                  settings.mode === "server"
                    ? (selectedServerModel?.label ??
                      settings.serverModelId ??
                      "-")
                    : settings.mode === "local-helper"
                      ? (selectedCompanionModel?.label ?? "-")
                      : model.label
                }
                copy={t}
                progress={progress}
                progressLog={progressLog}
                jobState={jobState}
                error={error}
                canStart={Boolean(canStart)}
                canStartAll={canStartAll}
                queueCount={queue.length}
                nativeNote={
                  settings.mode === "local-helper"
                    ? t.companionPreflight
                    : undefined
                }
                onStart={() => void startTranscription()}
                onStartAll={() => void startBatchTranscription()}
                onErrorClick={() => setErrorDialogOpen(true)}
              />
            </div>

            <aside className="flex min-w-0 flex-col gap-4">
              {isEnglishOnlyMismatch &&
              (settings.mode === "local-webgpu" ||
                settings.mode === "local-wasm") ? (
                <div className="animate-in rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive duration-200 fade-in slide-in-from-top-1">
                  {t.englishOnlySidebar}
                </div>
              ) : null}

              <HistoryPanel
                history={history}
                onSelect={openTranscriptResult}
                onRemove={(id) => void removeTranscript(id)}
                copy={t}
                serverCapabilities={serverCapabilities}
                helperCapabilities={helperCapabilities}
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
        serverCapabilities={serverCapabilities}
        helperCapabilities={helperCapabilities}
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
            <DialogDescription className="sr-only">
              Error details
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-auto rounded-md border bg-muted/30 p-4">
            <pre className="font-mono text-sm break-words whitespace-pre-wrap text-foreground">
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
  serverCapabilities,
  helperCapabilities,
  companionHealth,
  storageActionsDisabled,
  companionModelId,
  onCompanionModelChange,
}: {
  settings: AppSettings
  model: ReturnType<typeof findModel>
  copy: Copy
  isEnglishOnlyMismatch: boolean
  updateSetting: <T extends keyof AppSettings>(
    key: T,
    value: AppSettings[T]
  ) => void
  serverCapabilities: ServerCapabilitiesState
  helperCapabilities: HelperCapabilities | null
  companionHealth: CompanionHealthState
  storageActionsDisabled: boolean
  companionModelId: string
  onCompanionModelChange: (id: string) => void
}) {
  const modelDescription =
    copy.modelDescriptions[model.id as keyof typeof copy.modelDescriptions] ??
    model.notes
  const usesQuantizedWeights = getLocalModelDtype(model) === "q4"
  const selectedServerModel =
    typeof serverCapabilities === "object" && serverCapabilities?.models
      ? serverCapabilities.models.find(
          (item) => item.id === settings.serverModelId
        )
      : undefined

  return (
    <Card className="relative z-20 animate-in overflow-visible duration-300 ease-out fade-in slide-in-from-bottom-1">
      <CardHeader>
        <CardTitle className="text-base">{copy.quickSetup}</CardTitle>
        <CardDescription>{copy.quickSetupDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2 md:col-span-2">
          <Label>{copy.mode}</Label>
          <Select
            value={settings.mode}
            disabled={storageActionsDisabled}
            onValueChange={(value) =>
              updateSetting("mode", value as ProcessingMode)
            }
          >
            <SelectTrigger aria-label={copy.mode} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {MODES.filter(
                (item) =>
                  item.value !== "server" ||
                  Boolean(import.meta.env.VITE_SERVER_URL)
              ).map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {copy.modeLabels[item.value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs leading-5 text-muted-foreground">
            {copy.modeDetails[settings.mode]}
          </p>
          {settings.mode === "local-helper" ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <Badge
                variant={
                  companionHealth && companionHealth !== "checking"
                    ? companionHealth.busy
                      ? "secondary"
                      : "default"
                    : "outline"
                }
              >
                {companionHealth === "checking"
                  ? copy.companionChecking
                  : companionHealth?.busy
                    ? copy.companionBusy
                    : companionHealth
                      ? copy.companionAvailable
                      : copy.companionUnavailable}
              </Badge>
              {companionHealth === null ? (
                <>
                  <span className="text-muted-foreground">
                    {copy.companionUnavailableDescription}
                  </span>
                  <a
                    href={COMPANION_RELEASES_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline underline-offset-4"
                  >
                    {copy.downloadCompanion}
                  </a>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label>{copy.model}</Label>
          {settings.mode === "local-helper" ? (
            <>
              <Select
                value={companionModelId || undefined}
                onValueChange={onCompanionModelChange}
                disabled={!helperCapabilities?.models.length}
              >
                <SelectTrigger aria-label={copy.model} className="w-full">
                  <SelectValue placeholder={copy.companionTitle} />
                </SelectTrigger>
                <SelectContent align="start">
                  {helperCapabilities?.models.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {helperCapabilities?.models.find(
                (item) => item.id === companionModelId
              ) ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  {companionModelDetails(
                    helperCapabilities.models.find(
                      (item) => item.id === companionModelId
                    )!,
                    copy
                  )}
                </p>
              ) : (
                <p className="text-xs leading-5 text-muted-foreground">
                  {copy.companionModelDescription}
                </p>
              )}
            </>
          ) : settings.mode !== "server" ? (
            <>
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
            </>
          ) : (
            <>
              <Select
                value={settings.serverModelId ?? undefined}
                onValueChange={(value) => updateSetting("serverModelId", value)}
                disabled={
                  serverCapabilities === "loading" ||
                  serverCapabilities === "error" ||
                  serverCapabilities === null
                }
              >
                <SelectTrigger aria-label={copy.model} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {typeof serverCapabilities === "object" &&
                  serverCapabilities?.models
                    ? serverCapabilities.models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))
                    : null}
                </SelectContent>
              </Select>
              {serverCapabilities === "error" ? (
                <p className="text-xs leading-5 text-destructive">
                  {copy.serverModelsUnavailable}
                </p>
              ) : selectedServerModel ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  {selectedServerModel.label} - {selectedServerModel.quality}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="grid gap-2">
          <Label>{copy.language}</Label>
          <LanguageCombobox
            value={settings.language}
            copy={copy}
            onValueChange={(value) => updateSetting("language", value)}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {copy.spokenLanguage}
          </p>
        </div>

        {isEnglishOnlyMismatch &&
        (settings.mode === "local-webgpu" || settings.mode === "local-wasm") ? (
          <p className="text-sm text-destructive md:col-span-2">
            {copy.englishOnlyWarning}
          </p>
        ) : null}

        {usesQuantizedWeights &&
        (settings.mode === "local-webgpu" || settings.mode === "local-wasm") ? (
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

    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer)
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
        <div className="absolute z-50 mt-2 w-full min-w-[18rem] animate-in overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg duration-150 fade-in-0 zoom-in-95">
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
                  <Check
                    className={cn(
                      "size-4",
                      item.code === value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {item.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.code === "auto"
                        ? copy.spokenLanguage
                        : item.nativeName}
                    </span>
                  </span>
                  <span className="shrink-0 pr-1 text-xs text-muted-foreground uppercase">
                    {item.code}
                  </span>
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
  updateSetting: <T extends keyof AppSettings>(
    key: T,
    value: AppSettings[T]
  ) => void
  storageActionsDisabled: boolean
  onClearDownloadedModels: () => void
  onClearSavedTranscripts: () => void
  onBack: () => void
  copy: Copy
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 sm:gap-6">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label={copy.backHome}
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">
            {copy.settings}
          </h2>
          <p className="text-sm text-muted-foreground">
            {copy.settingsDescription}
          </p>
        </div>
      </div>

      <Card className="animate-in duration-300 ease-out fade-in slide-in-from-bottom-1">
        <CardHeader>
          <CardTitle>{copy.processing}</CardTitle>
          <CardDescription>{copy.processingDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {settings.mode !== "server" ? (
            <>
              <SettingRow
                label={copy.chunkSeconds}
                description={copy.chunkSecondsDescription}
              >
                <Input
                  type="number"
                  min={15}
                  max={60}
                  value={settings.chunkSeconds}
                  aria-label={copy.chunkSeconds}
                  className="w-full sm:w-24"
                  onChange={(event) =>
                    updateSetting("chunkSeconds", Number(event.target.value))
                  }
                />
              </SettingRow>
              <SettingRow
                label={copy.overlapSeconds}
                description={copy.overlapSecondsDescription}
              >
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={settings.overlapSeconds}
                  aria-label={copy.overlapSeconds}
                  className="w-full sm:w-24"
                  onChange={(event) =>
                    updateSetting("overlapSeconds", Number(event.target.value))
                  }
                />
              </SettingRow>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card className="animate-in delay-75 duration-300 ease-out fade-in slide-in-from-bottom-1">
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
              onCheckedChange={(checked) =>
                updateSetting("persistMediaBlobs", checked)
              }
            />
          </SettingRow>
          <Separator />
          <div className="grid gap-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-medium">{copy.storageCleanup}</h3>
              <p className="text-xs text-muted-foreground">
                {copy.storageCleanupDescription}
              </p>
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
  nativeOnly = false,
}: {
  file: File | null
  fileCount: number
  isBusy: boolean
  copy: Copy
  onPick: () => void
  onDropFiles: (files: File[]) => void
  nativeOnly?: boolean
}) {
  const title = nativeOnly
    ? copy.companionPickerTitle
    : file
      ? fileCount > 1
        ? copy.filesSelected(fileCount)
        : file.name
      : copy.dropTitle
  const description = nativeOnly
    ? copy.companionPickerDescription
    : file && fileCount > 1
      ? copy.selectedFile(file.name)
      : copy.dropDescription

  return (
    <div
      className={cn(
        "group relative grid min-h-[240px] place-items-center rounded-lg border border-dashed bg-card p-6 text-center transition-all duration-200 ease-out",
        !isBusy && "hover:border-ring hover:bg-accent/40"
      )}
      onDragOver={(event) => {
        event.preventDefault()
      }}
      onDrop={(event) => {
        event.preventDefault()
        if (nativeOnly) return
        const droppedFiles = Array.from(event.dataTransfer.files)
        if (droppedFiles.length > 0) onDropFiles(droppedFiles)
      }}
    >
      <div className="flex max-w-xl flex-col items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-md border bg-muted text-muted-foreground [&_svg]:size-5">
          {file?.type.startsWith("video/") ? (
            <FileVideo />
          ) : file ? (
            <FileAudio />
          ) : (
            <UploadCloud />
          )}
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mx-auto max-w-[58ch] text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        <Button onClick={onPick} disabled={isBusy}>
          <UploadCloud />{" "}
          {nativeOnly ? copy.companionChooseFiles : copy.chooseFile}
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
  onMove,
}: {
  queue: QueuedFile[]
  selectedId: string | null
  disabled: boolean
  copy: Copy
  onSelect: (item: QueuedFile) => void
  onRemove: (id: string) => void
  onMove: (id: string, direction: -1 | 1) => void
}) {
  return (
    <Card className="animate-in duration-300 ease-out fade-in slide-in-from-bottom-1">
      <CardHeader className="pb-3">
        <CardDescription>{copy.fileQueue}</CardDescription>
        <CardTitle className="text-base">
          {copy.filesSelected(queue.length)}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {queue.map((item, index) => {
          const name = queueFileName(item)
          return (
            <div
              key={item.id}
              className={cn(
                "grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 rounded-md border px-2 py-2 text-sm transition-colors",
                selectedId === item.id
                  ? "border-ring bg-accent"
                  : "hover:bg-accent/60",
                disabled && "cursor-not-allowed opacity-70"
              )}
            >
              <button
                type="button"
                className="min-w-0 text-left"
                aria-label={`${copy.selectFile}: ${name}`}
                disabled={disabled}
                onClick={() => onSelect(item)}
              >
                <span className="block truncate font-medium">{name}</span>
                <span className="block text-xs text-muted-foreground">
                  {bytesToMb(queueFileSize(item))} MB
                </span>
              </button>
              <Badge
                variant={
                  item.status === "error"
                    ? "destructive"
                    : item.status === "complete"
                      ? "secondary"
                      : "outline"
                }
              >
                {copy.queueStatusLabels[item.status]}
              </Badge>
              <div className="flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`${copy.moveFileUp}: ${name}`}
                  disabled={disabled || index === 0}
                  onClick={() => onMove(item.id, -1)}
                >
                  <ChevronUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`${copy.moveFileDown}: ${name}`}
                  disabled={disabled || index === queue.length - 1}
                  onClick={() => onMove(item.id, 1)}
                >
                  <ChevronDown />
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                aria-label={`${copy.removeFile}: ${name}`}
                disabled={disabled}
                onClick={() => onRemove(item.id)}
              >
                <Trash2 />
              </Button>
            </div>
          )
        })}
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
  nativeNote,
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
  nativeNote?: string
  onStart: () => void
  onStartAll: () => void
  onErrorClick: () => void
}) {
  const progressMessage =
    progress.phase === "idle" ? copy.waiting : progress.message
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
          <div className="grid animate-in gap-3 duration-300 fade-in slide-in-from-bottom-1 sm:grid-cols-2">
            <Metric
              icon={<Gauge />}
              label={copy.duration}
              value={
                analysis.duration === null
                  ? copy.unknownDuration
                  : formatDuration(analysis.duration)
              }
            />
            <Metric
              icon={<Download />}
              label={copy.size}
              value={`${bytesToMb(analysis.fileSize)} MB`}
            />
            <Metric icon={<Languages />} label={copy.model} value={model} />
            <Metric
              icon={<CheckCircle2 />}
              label={copy.chunks}
              value={`${analysis.chunkPlan.estimatedChunks}`}
            />
          </div>
        ) : (
          <p className="animate-in text-sm text-muted-foreground duration-200 fade-in">
            {nativeNote ?? copy.emptyPreflight}
          </p>
        )}

        {analysis ? (
          <div className="animate-in space-y-3 duration-300 fade-in slide-in-from-bottom-1">
            <div className="rounded-md border bg-muted/40 p-4 transition-colors duration-200">
              <p className="text-xs font-medium text-muted-foreground">
                {copy.downloads}
              </p>
              <div className="mt-3 grid gap-2">
                {analysis.requiredAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>{asset.label}</span>
                    <span className="text-muted-foreground">
                      ~{asset.sizeMb} MB
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {analysis.warnings.map((warning) => (
              <p
                key={warning}
                className="animate-in text-xs leading-5 text-muted-foreground duration-200 fade-in"
              >
                {warning}
              </p>
            ))}
          </div>
        ) : null}

        <div className="space-y-3">
          <Progress
            value={Math.round(progress.progress * 100)}
            className="h-1.5"
          />
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground">{progressMessage}</span>
            <span className="font-medium">
              {Math.round(progress.progress * 100)}%
            </span>
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
                  {showDetailedLog
                    ? copy.hideDetailedLog
                    : copy.showDetailedLog}
                </span>
              </button>
              {showDetailedLog ? (
                <div className="max-h-52 overflow-auto border-t px-3 py-2">
                  <div className="grid gap-2">
                    {progressLog.map((entry) => (
                      <div key={entry.id} className="grid gap-1 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-muted-foreground">
                            {entry.message}
                          </span>
                          <span className="shrink-0 font-medium">
                            {entry.progress === undefined
                              ? "--"
                              : `${Math.round(entry.progress * 100)}%`}
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
              className="animate-in cursor-pointer text-left text-sm text-destructive underline decoration-destructive/30 underline-offset-2 duration-200 fade-in slide-in-from-top-1 hover:decoration-destructive"
              onClick={() => onErrorClick()}
              title="Open error details"
            >
              {error}
            </button>
          ) : null}
          <div className={cn("grid gap-2", queueCount > 1 && "sm:grid-cols-2")}>
            <Button className="w-full" disabled={!canStart} onClick={onStart}>
              {isBusy(jobState) ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Play />
              )}
              {queueCount > 1
                ? copy.transcribeSelected
                : copy.confirmTranscribe}
            </Button>
            {queueCount > 1 ? (
              <Button
                className="w-full"
                variant="outline"
                disabled={!canStartAll}
                onClick={onStartAll}
              >
                {isBusy(jobState) ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Play />
                )}
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
  serverCapabilities,
  helperCapabilities,
}: {
  transcript: TranscriptDocument | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onExport: (document: TranscriptDocument, format: ExportFormat) => void
  onRename: (id: string, title: string) => void
  copy: Copy
  serverCapabilities: ServerCapabilitiesState
  helperCapabilities: HelperCapabilities | null
}) {
  const transcriptModelLabel = transcript
    ? resolveTranscriptModelLabel(
        transcript,
        serverCapabilities,
        helperCapabilities
      )
    : ""

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
              <div
                className="flex flex-wrap gap-2 pt-1"
                aria-label={copy.transcriptDetails}
              >
                <Badge variant="secondary">{transcriptModelLabel}</Badge>
                <Badge variant="outline">
                  {copy.modeLabels[transcript.mode]}
                </Badge>
                <Badge variant="outline">
                  {getLanguageLabel(
                    transcript.language,
                    copy.languageLabels.auto
                  )}
                </Badge>
              </div>
            </DialogHeader>

            <div className="grid min-h-0 gap-0 overflow-hidden lg:grid-cols-2">
              <section className="min-h-0 border-b p-4 sm:p-6 lg:border-r lg:border-b-0">
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
                  <h3 className="text-sm font-medium">
                    {copy.textWithTimestamps}
                  </h3>
                </div>
                <div className="h-[32svh] min-h-72 overflow-auto rounded-md border lg:h-[48svh]">
                  {transcript.segments.map((segment) => (
                    <div
                      key={segment.id}
                      className="grid gap-1 border-b px-3 py-2.5 last:border-b-0 sm:grid-cols-[7rem_1fr] sm:gap-3"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatSegmentTime(segment.start)} -{" "}
                        {formatSegmentTime(segment.end)}
                      </span>
                      <span className="text-sm leading-6">{segment.text}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <DialogFooter className="items-center justify-between gap-3 border-t px-5 py-4 sm:flex-row sm:px-6">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="mr-1 text-sm text-muted-foreground">
                  {copy.downloadFiles}
                </span>
                {EXPORTS.map((format) => (
                  <Button
                    key={format}
                    variant="outline"
                    size="sm"
                    onClick={() => onExport(transcript, format)}
                  >
                    <Download />.{format}
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
    <form
      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
      onSubmit={saveTitle}
    >
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
  serverCapabilities,
  helperCapabilities,
}: {
  history: TranscriptDocument[]
  onSelect: (document: TranscriptDocument) => void
  onRemove: (id: string) => void
  copy: Copy
  serverCapabilities: ServerCapabilitiesState
  helperCapabilities: HelperCapabilities | null
}) {
  return (
    <Card className="min-h-0 p-4">
      <p className="mb-4 text-xs font-medium text-muted-foreground">
        {copy.recent}
      </p>
      <div className="grid max-h-[330px] gap-2 overflow-auto pr-1">
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.emptyHistory}</p>
        ) : (
          history.map((item) => (
            <div
              key={item.id}
              className="group/history-item grid animate-in grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-md border p-2 text-sm transition-colors duration-200 fade-in slide-in-from-bottom-1 hover:bg-accent"
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
                    {resolveTranscriptModelLabel(
                      item,
                      serverCapabilities,
                      helperCapabilities
                    )}
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
    <div className="fixed right-4 bottom-4 z-50 w-[calc(100vw-2rem)] max-w-sm animate-in duration-200 fade-in slide-in-from-bottom-2">
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "rounded-lg border p-4 shadow-lg",
          message.kind === "error"
            ? "border-destructive/30 bg-destructive/5 text-destructive"
            : "bg-popover text-popover-foreground"
        )}
      >
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

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
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
  return [
    "queued",
    "analyzing",
    "downloading-assets",
    "preparing-media",
    "chunking",
    "transcribing",
    "saving",
  ].includes(jobState)
}

export default App
