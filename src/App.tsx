import * as React from "react"
import {
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
  CardFooter,
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
import { DEFAULT_SETTINGS, findModel, WHISPER_MODELS } from "@/features/transcription/models"
import {
  getLanguageLabel,
  isEnglishOnlyLanguageMismatch,
  resolveTranscriptionLanguage,
  TRANSCRIPTION_LANGUAGES,
} from "@/features/transcription/language"
import { downloadTranscript, type ExportFormat } from "@/features/transcription/exports"
import {
  listTranscripts,
  loadSettings,
  saveSettings,
  saveTranscript,
} from "@/features/storage/indexed-db"
import {
  isGoogleDriveConfigured,
  requestDriveAccess,
  uploadTranscriptMetadata,
} from "@/features/google-drive/drive"
import { cn } from "@/lib/utils"
import { createId } from "@/lib/id"
import { convertWithFfmpeg, transcribeLocally } from "@/lib/transcription-worker-client"
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
]

const EXPORTS: ExportFormat[] = ["txt", "json", "srt", "vtt"]

type View = "home" | "settings"
type DriveStatus =
  | { type: "idle" }
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
    synced: (id: string) => `Synced ${id}`,
    notConnected: "Not connected",
    waiting: "Waiting for audio or video",
    readingMetadata: "Reading media metadata",
    reviewPlan: "Review downloads and processing plan",
    couldNotAnalyze: "Could not analyze media",
    serverGuardrail: "Server mode is manual opt-in but chunk upload is not enabled yet. Use local mode for now.",
    untitledTranscript: "Untitled transcript",
    transcriptReady: "Transcript ready",
    transcriptionFailed: "Transcription failed",
    decodedAudio: "Decoded audio for Whisper",
    loadingWhisper: "Loading Whisper model",
    reusingWhisper: "Using loaded Whisper model",
    preparingModel: "Preparing model",
    downloading: (file: string) => `Downloading ${file}`,
    transcribingAudio: "Transcribing audio",
    loadingFfmpeg: "Loading ffmpeg.wasm",
    reusingFfmpeg: "Using loaded ffmpeg.wasm",
    convertingMedia: "Converting media",
    backHome: "Back to home",
    quickSetup: "Transcription setup",
    quickSetupDescription: "Choose the model and spoken language before uploading or transcribing.",
    settingsDescription: "Interface language, processing mode, and advanced options.",
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
    englishOnlySidebar: "Current model is English-only. Switch to Base, Tiny, or Small multilingual.",
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
    dropTitle: "Drop audio or video",
    dropDescription: "Preflight checks the file before any model or ffmpeg download. Video is converted locally, then transcribed in chunks.",
    chooseFile: "Choose file",
    preflight: "Preflight",
    processingPlan: "Processing plan",
    duration: "Duration",
    size: "Size",
    chunks: "Chunks",
    emptyPreflight: "Select a file to calculate duration, chunks, downloads, and mode.",
    downloads: "Downloads",
    unknownDuration: "Unknown",
    confirmTranscribe: "Confirm downloads and transcribe",
    transcript: "Transcript",
    timestamps: "Timestamps",
    transcriptDetails: "Model and processing details",
    readyForOutput: "Ready for output",
    emptyTranscript: "Your transcript appears here after local transcription. Export names include source, language, date, and time.",
    recent: "Recent",
    emptyHistory: "No transcripts saved yet.",
    downloadDescription: (notes: string, sizeMb: number) => `${notes} ~${sizeMb} MB download.`,
    modelDescriptions: {
      "onnx-community/whisper-base": "Default. Good English/Vietnamese balance for local browsers.",
      "onnx-community/whisper-tiny": "Fastest multilingual local option. Lower accuracy.",
      "onnx-community/whisper-small": "Better accuracy, heavier download and memory use.",
      "onnx-community/whisper-tiny.en": "English-only. Not suitable for Vietnamese.",
    } satisfies Record<string, string>,
    modeDetails: {
      "local-webgpu": "Default, fastest private path",
      "cloudflare-ai": "Authorized users, free quota only",
      "local-wasm": "Fallback for unsupported browsers",
    } satisfies Record<ProcessingMode, string>,
    modeLabels: {
      "local-webgpu": "Local WebGPU",
      "cloudflare-ai": "Manual server",
      "local-wasm": "Local WASM",
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
    synced: (id: string) => `Đã đồng bộ ${id}`,
    notConnected: "Chưa kết nối",
    waiting: "Chọn tệp âm thanh hoặc video",
    readingMetadata: "Đang đọc thông tin tệp",
    reviewPlan: "Kiểm tra kế hoạch xử lý",
    couldNotAnalyze: "Không thể phân tích tệp",
    serverGuardrail: "Chế độ máy chủ chưa được bật. Vui lòng dùng xử lý cục bộ.",
    untitledTranscript: "Bản chép chưa đặt tên",
    transcriptReady: "Bản chép đã sẵn sàng",
    transcriptionFailed: "Không thể tạo bản chép",
    decodedAudio: "Đã giải mã audio cho Whisper",
    loadingWhisper: "Đang tải mô hình Whisper",
    reusingWhisper: "Đang dùng mô hình Whisper đã tải",
    preparingModel: "Đang chuẩn bị mô hình",
    downloading: (file: string) => `Đang tải ${file}`,
    transcribingAudio: "Đang tạo bản chép",
    loadingFfmpeg: "Đang tải ffmpeg.wasm",
    reusingFfmpeg: "Đang dùng ffmpeg.wasm đã tải",
    convertingMedia: "Đang chuyển đổi tệp",
    backHome: "Quay lại trang chính",
    quickSetup: "Thiết lập chép lời",
    quickSetupDescription: "Chọn mô hình và ngôn ngữ nói trước khi tải tệp hoặc bắt đầu xử lý.",
    settingsDescription: "Ngôn ngữ giao diện, chế độ xử lý và tùy chọn nâng cao.",
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
    englishOnlySidebar: "Mô hình hiện tại chỉ hỗ trợ tiếng Anh. Hãy chọn Base, Tiny hoặc Small đa ngôn ngữ.",
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
    dropTitle: "Thả âm thanh hoặc video",
    dropDescription: "Tệp được kiểm tra trước khi tải mô hình hoặc ffmpeg. Video sẽ được chuyển thành âm thanh trên thiết bị rồi xử lý theo đoạn.",
    chooseFile: "Chọn tệp",
    preflight: "Kiểm tra tệp",
    processingPlan: "Kế hoạch xử lý",
    duration: "Thời lượng",
    size: "Dung lượng",
    chunks: "Đoạn",
    emptyPreflight: "Chọn tệp để xem thời lượng, số đoạn, tài nguyên cần tải và chế độ xử lý.",
    downloads: "Cần tải",
    unknownDuration: "Không rõ",
    confirmTranscribe: "Tải và tạo bản chép",
    transcript: "Bản chép",
    timestamps: "Mốc thời gian",
    transcriptDetails: "Thông tin mô hình và xử lý",
    readyForOutput: "Sẵn sàng xuất",
    emptyTranscript: "Bản chép sẽ xuất hiện ở đây sau khi xử lý. Tên tệp xuất gồm nguồn, ngôn ngữ, ngày và giờ.",
    recent: "Gần đây",
    emptyHistory: "Chưa có bản chép nào.",
    downloadDescription: (notes: string, sizeMb: number) => `${notes} Khoảng ${sizeMb} MB.`,
    modelDescriptions: {
      "onnx-community/whisper-base": "Mặc định. Cân bằng tốt giữa tốc độ và độ chính xác cho tiếng Anh/tiếng Việt.",
      "onnx-community/whisper-tiny": "Nhanh nhất trong các mô hình đa ngôn ngữ. Độ chính xác thấp hơn.",
      "onnx-community/whisper-small": "Độ chính xác cao hơn, cần tải xuống và bộ nhớ nhiều hơn.",
      "onnx-community/whisper-tiny.en": "Chỉ hỗ trợ tiếng Anh, không phù hợp cho tiếng Việt.",
    } satisfies Record<string, string>,
    modeDetails: {
      "local-webgpu": "Xử lý cục bộ nhanh nhất khi trình duyệt hỗ trợ.",
      "cloudflare-ai": "Dành cho tài khoản được cấp quyền, chỉ dùng hạn mức miễn phí.",
      "local-wasm": "Dự phòng khi WebGPU không khả dụng.",
    } satisfies Record<ProcessingMode, string>,
    modeLabels: {
      "local-webgpu": "Local WebGPU",
      "cloudflare-ai": "Máy chủ",
      "local-wasm": "Local WASM",
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
    case "error":
      return status.message
    case "idle":
      return copy.notConnected
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

  if (message === "Preparing model") {
    return copy.preparingModel
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
  const [analysis, setAnalysis] = React.useState<MediaAnalysis | null>(null)
  const [jobState, setJobState] = React.useState<JobState>("idle")
  const [progress, setProgress] = React.useState<TranscriptionProgress>({
    phase: "idle",
    message: COPY.en.waiting,
    progress: 0,
  })
  const [transcript, setTranscript] = React.useState<TranscriptDocument | null>(null)
  const [history, setHistory] = React.useState<TranscriptDocument[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [driveStatus, setDriveStatus] = React.useState<DriveStatus>({ type: "idle" })
  const settingsRef = React.useRef(settings)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const driveStatusText = getDriveStatusText(driveStatus, t)

  React.useEffect(() => {
    void loadSettings().then((storedSettings) => {
      settingsRef.current = storedSettings
      setSettings(storedSettings)
    })
    void listTranscripts().then(setHistory)
  }, [])

  React.useEffect(() => {
    void saveSettings(settings)
  }, [settings])

  const model = findModel(settings.modelId)
  const canStart = file && analysis && !isBusy(jobState)
  const isEnglishOnlyMismatch = isEnglishOnlyLanguageMismatch(settings.language, settings.uiLanguage) && !model.multilingual

  async function analyzeSelectedFile(nextFile: File, nextSettings: AppSettings, resetTranscript: boolean) {
    setFile(nextFile)
    if (resetTranscript) {
      setTranscript(null)
    }
    setError(null)
    setJobState("analyzing")
    setProgress({ phase: "analyzing", message: t.readingMetadata, progress: 0.08 })

    try {
      const result = await analyzeMediaFile(nextFile, nextSettings)
      setAnalysis(result)
      setJobState("awaiting-confirmation")
      setProgress({
        phase: "awaiting-confirmation",
        message: t.reviewPlan,
        progress: 0.18,
      })
    } catch (caught) {
      setJobState("error")
      setError(caught instanceof Error ? caught.message : t.couldNotAnalyze)
    }
  }

  async function handleFile(nextFile: File) {
    await analyzeSelectedFile(nextFile, settings, true)
  }

  async function startTranscription() {
    if (!file || !analysis) {
      return
    }

    if (settings.mode === "cloudflare-ai") {
      setError(t.serverGuardrail)
      return
    }

    setError(null)
    let input: File | Blob = file

    try {
      const runSettings = settingsRef.current
      const freshAnalysis = await analyzeMediaFile(file, runSettings)
      setAnalysis(freshAnalysis)

      if (freshAnalysis.needsFfmpeg) {
        setJobState("preparing-media")
        input = await convertWithFfmpeg({
          file,
        onProgress: (message, nextProgress) => {
            setProgress({
              phase: "preparing-media",
              message: localizeProgressMessage(message, t),
              progress: nextProgress * 0.35,
            })
          },
        })
      }

      setJobState("transcribing")
      const effectiveMode = freshAnalysis.recommendedMode === "local-webgpu" ? "local-webgpu" : "local-wasm"
      const effectiveLanguage = resolveTranscriptionLanguage(runSettings.language, runSettings.uiLanguage)
      const result = await transcribeLocally({
        file: input,
        modelId: runSettings.modelId,
        language: effectiveLanguage,
        device: effectiveMode === "local-webgpu" ? "webgpu" : "wasm",
        onProgress: (nextProgress) => {
          setProgress({
            ...nextProgress,
            message: localizeProgressMessage(nextProgress.message, t),
          })
          setJobState(nextProgress.phase)
        },
      })
      const now = new Date().toISOString()
      const document: TranscriptDocument = {
        id: createId("transcript"),
        title: file.name.replace(/\.[^.]+$/, "") || t.untitledTranscript,
        sourceName: file.name,
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
      setTranscript(document)
      setHistory(await listTranscripts())
      setJobState("complete")
      setProgress({ phase: "complete", message: t.transcriptReady, progress: 1 })
    } catch (caught) {
      setJobState("error")
      setError(caught instanceof Error ? caught.message : t.transcriptionFailed)
    }
  }

  async function syncTranscriptToDrive() {
    if (!transcript) {
      return
    }

    try {
      setDriveStatus({ type: "opening-google" })
      const token = await requestDriveAccess()
      setDriveStatus({ type: "uploading-metadata" })
      const result = await uploadTranscriptMetadata(token, transcript)
      setDriveStatus({ type: "synced", id: result.id.slice(0, 8) })
    } catch (caught) {
      setDriveStatus({
        type: "error",
        message: caught instanceof Error ? caught.message : t.driveSyncFailed,
      })
    }
  }

  function updateSetting<T extends keyof AppSettings>(key: T, value: AppSettings[T]) {
    const nextSettings = { ...settings, [key]: value }

    settingsRef.current = nextSettings
    setSettings(nextSettings)

    if (file && analysis && jobState === "awaiting-confirmation") {
      void analyzeSelectedFile(file, nextSettings, false)
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
                <span className="block text-xs font-normal text-muted-foreground">{driveStatusText}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!isGoogleDriveConfigured()}
                onClick={() => void syncTranscriptToDrive()}
              >
                <HardDrive />
                {t.signInGoogle}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setView("settings")}>
                <Settings2 />
                {t.settings}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-default gap-3"
                onSelect={(event) => event.preventDefault()}
              >
                {resolvedTheme === "dark" ? <Moon /> : <Sun />}
                <span className="flex-1">{t.toggleTheme}</span>
                <Switch
                  aria-label={t.toggleTheme}
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

              <DropZone
                file={file}
                isBusy={isBusy(jobState)}
                copy={t}
                onPick={() => fileInputRef.current?.click()}
                onDropFile={(nextFile) => void handleFile(nextFile)}
              />

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*"
                className="hidden"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0]
                  if (nextFile) {
                    void handleFile(nextFile)
                  }
                }}
              />

              <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.58fr)]">
                <PreflightPanel
                  analysis={analysis}
                  model={model.label}
                  copy={t}
                  progress={progress}
                  jobState={jobState}
                  error={error}
                  canStart={Boolean(canStart)}
                  onStart={() => void startTranscription()}
                />
                <TranscriptPanel transcript={transcript} onExport={downloadTranscript} copy={t} />
              </div>
            </div>

            <aside className="flex min-w-0 flex-col gap-4">
              {isEnglishOnlyMismatch ? (
                <div className="animate-in fade-in slide-in-from-top-1 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive duration-200">
                  {t.englishOnlySidebar}
                </div>
              ) : null}

              <HistoryPanel history={history} onSelect={setTranscript} copy={t} />
            </aside>
          </section>
        )}
      </div>
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

  return (
    <Card className="relative z-20 overflow-visible animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out">
      <CardHeader>
        <CardTitle className="text-base">{copy.quickSetup}</CardTitle>
        <CardDescription>{copy.quickSetupDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
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
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <Input
              role="searchbox"
              aria-label={copy.searchLanguage}
              value={query}
              className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
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

          <div role="listbox" className="max-h-72 overflow-auto p-1">
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
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent"
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
                  <span className="text-xs uppercase text-muted-foreground">{item.code}</span>
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
  onBack,
  copy,
}: {
  settings: AppSettings
  updateSetting: <T extends keyof AppSettings>(key: T, value: AppSettings[T]) => void
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
          <CardTitle>{copy.transcription}</CardTitle>
          <CardDescription>{copy.transcriptionDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <SettingRow
            label={copy.interfaceLanguage}
            description={copy.interfaceLanguageDescription}
          >
            <Select
              value={settings.uiLanguage}
              onValueChange={(value) => updateSetting("uiLanguage", value as UiLanguage)}
            >
              <SelectTrigger aria-label={copy.interfaceLanguage} className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {UI_LANGUAGES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        </CardContent>
      </Card>

      <Card className="animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out delay-75">
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
                {MODES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {copy.modeLabels[item.value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
          <Separator />
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
        </CardContent>
      </Card>

      <Card className="animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out delay-150">
        <CardHeader>
          <CardTitle>{copy.storage}</CardTitle>
          <CardDescription>{copy.storageDescription}</CardDescription>
        </CardHeader>
        <CardContent>
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
  isBusy,
  copy,
  onPick,
  onDropFile,
}: {
  file: File | null
  isBusy: boolean
  copy: Copy
  onPick: () => void
  onDropFile: (file: File) => void
}) {
  return (
    <div
      className={cn(
        "group relative grid min-h-[240px] place-items-center rounded-lg border border-dashed bg-card p-6 text-center transition-all duration-200 ease-out",
        !isBusy && "hover:border-ring hover:bg-accent/40"
      )}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const droppedFile = event.dataTransfer.files[0]
        if (droppedFile) {
          onDropFile(droppedFile)
        }
      }}
    >
      <div className="flex max-w-xl flex-col items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-md border bg-muted text-muted-foreground [&_svg]:size-5">
          {file?.type.startsWith("video/") ? <FileVideo /> : file ? <FileAudio /> : <UploadCloud />}
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight">
            {file ? file.name : copy.dropTitle}
          </h2>
          <p className="mx-auto max-w-[58ch] text-sm leading-6 text-muted-foreground">
            {copy.dropDescription}
          </p>
        </div>
        <Button onClick={onPick} disabled={isBusy}>
          <UploadCloud /> {copy.chooseFile}
        </Button>
      </div>
    </div>
  )
}

function PreflightPanel({
  analysis,
  model,
  copy,
  progress,
  jobState,
  error,
  canStart,
  onStart,
}: {
  analysis: MediaAnalysis | null
  model: string
  copy: Copy
  progress: TranscriptionProgress
  jobState: JobState
  error: string | null
  canStart: boolean
  onStart: () => void
}) {
  const progressMessage = progress.phase === "idle" ? copy.waiting : progress.message

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
          {error ? (
            <p className="animate-in fade-in slide-in-from-top-1 text-sm text-destructive duration-200">
              {error}
            </p>
          ) : null}
          <Button className="w-full" disabled={!canStart} onClick={onStart}>
            {isBusy(jobState) ? <Loader2 className="animate-spin" /> : <Play />}
            {copy.confirmTranscribe}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function TranscriptPanel({
  transcript,
  onExport,
  copy,
}: {
  transcript: TranscriptDocument | null
  onExport: (document: TranscriptDocument, format: ExportFormat) => void
  copy: Copy
}) {
  const transcriptModel = transcript ? findModel(transcript.modelId) : null

  return (
    <Card className="flex min-h-[420px] flex-col">
      <CardHeader className="border-b">
        <CardDescription>{copy.transcript}</CardDescription>
        <CardTitle className="truncate text-base">
          {transcript?.title ?? copy.readyForOutput}
        </CardTitle>
        {transcript ? (
          <div className="flex flex-wrap gap-2 pt-2" aria-label={copy.transcriptDetails}>
            <Badge variant="secondary">{transcriptModel?.label ?? transcript.modelId}</Badge>
            <Badge variant="outline">{copy.modeLabels[transcript.mode]}</Badge>
            <Badge variant="outline">
              {getLanguageLabel(transcript.language, copy.languageLabels.auto)}
            </Badge>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-5 pt-5">
        {transcript ? (
          <>
            <Textarea
              key={transcript.id}
              className="min-h-[220px] w-full resize-none animate-in fade-in slide-in-from-bottom-1 text-sm leading-6 duration-300"
              value={transcript.text}
              onChange={() => undefined}
              readOnly
            />
            <div className="animate-in fade-in slide-in-from-bottom-1 rounded-md border duration-300">
              <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                {copy.timestamps}
              </div>
              <div className="max-h-56 overflow-auto">
                {transcript.segments.map((segment) => (
                  <div
                    key={segment.id}
                    className="grid gap-1 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[7rem_1fr] sm:gap-3"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatSegmentTime(segment.start)} - {formatSegmentTime(segment.end)}
                    </span>
                    <span className="text-sm leading-6">{segment.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="grid h-full min-h-[280px] animate-in place-items-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground fade-in duration-200">
            {copy.emptyTranscript}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex-wrap gap-2 border-t pt-5">
        {EXPORTS.map((format) => (
          <Button
            key={format}
            variant="outline"
            size="sm"
            disabled={!transcript}
            onClick={() => transcript && onExport(transcript, format)}
          >
            .{format}
          </Button>
        ))}
      </CardFooter>
    </Card>
  )
}

function HistoryPanel({
  history,
  onSelect,
  copy,
}: {
  history: TranscriptDocument[]
  onSelect: (document: TranscriptDocument) => void
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
            <button
              key={item.id}
              className="animate-in fade-in slide-in-from-bottom-1 rounded-md border px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-accent"
              onClick={() => onSelect(item)}
            >
              <span className="block truncate font-medium">{item.title}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleString()}
              </span>
            </button>
          ))
        )}
      </div>
    </Card>
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
