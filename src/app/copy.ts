import {
  defineCopy,
  type CopyParams,
  type InterfaceLanguage,
} from "@/app/copy-types"

export type ProductSeverity = "info" | "warning" | "error"
export type ProductScope =
  | "navigation"
  | "source"
  | "queue-item"
  | "runtime"
  | "save"
  | "library-item"
  | "identity"
  | "sync"
  | "settings"
export type RecoveryActionCode =
  | "choose-file"
  | "choose-model"
  | "use-safe-model"
  | "retry"
  | "retry-save"
  | "discard-draft"
  | "reconnect-drive"
  | "inspect-details"
  | "back-to-library"
export interface RecoveryAction {
  code: RecoveryActionCode
  params: CopyParams
}
export interface ProductError {
  occurrenceId: string
  code: string
  severity: "error"
  scope: ProductScope
  scopeId: string
  params: CopyParams
  primaryAction: RecoveryAction
  secondaryAction: RecoveryAction | null
  retryable: boolean
  technicalCause: {
    providerStatus: number | null
    safeCode: string | null
    developmentStack: string | null
  } | null
}
export interface ProductIssue {
  code: string
  severity: ProductSeverity
  scope: ProductScope
  scopeId: string
  params: CopyParams
  blocking: boolean
  recoveryAction: RecoveryAction | null
}
export const SHELL_COPY = defineCopy({
  en: {
    skipToContent: "Skip to content",
    primaryNavigation: "Primary navigation",
    errors: {
      unsupportedVersionTitle: "Unsupported data version",
      unsupportedVersionMessage: ({ foundVersion, maximumVersion }: CopyParams) =>
        `This browser contains Whisdom data version ${foundVersion}. This build supports through version ${maximumVersion}. Use a newer Whisdom build; your data was not changed.`,
      genericTitle: "Something went wrong",
      genericMessage: "Whisdom could not complete this action.",
    },
    actions: {
      inspectDetails: "Inspect details",
      backToLibrary: "Back to Library",
      retry: "Retry",
    },
  },
  vi: {
    skipToContent: "Chuyển đến nội dung",
    primaryNavigation: "Điều hướng chính",
    errors: {
      unsupportedVersionTitle: "Phiên bản dữ liệu không được hỗ trợ",
      unsupportedVersionMessage: ({ foundVersion, maximumVersion }: CopyParams) =>
        `Trình duyệt này chứa dữ liệu Whisdom phiên bản ${foundVersion}. Bản dựng này hỗ trợ đến phiên bản ${maximumVersion}. Hãy dùng bản Whisdom mới hơn; dữ liệu của bạn chưa bị thay đổi.`,
      genericTitle: "Đã xảy ra lỗi",
      genericMessage: "Whisdom không thể hoàn tất thao tác này.",
    },
    actions: {
      inspectDetails: "Xem chi tiết",
      backToLibrary: "Quay lại Thư viện",
      retry: "Thử lại",
    },
  },
})

function actionLabel(language: InterfaceLanguage, code: RecoveryActionCode): string {
  const copy = SHELL_COPY[language].actions
  if (code === "inspect-details") return copy.inspectDetails
  if (code === "back-to-library") return copy.backToLibrary
  return copy.retry
}

export function formatProductError(language: InterfaceLanguage, error: ProductError) {
  const copy = SHELL_COPY[language]
  const unsupported = error.code === "storage.unsupported-version"
  return {
    title: unsupported ? copy.errors.unsupportedVersionTitle : copy.errors.genericTitle,
    message: unsupported
      ? copy.errors.unsupportedVersionMessage(error.params)
      : copy.errors.genericMessage,
    primaryLabel: actionLabel(language, error.primaryAction.code),
    secondaryLabel: error.secondaryAction
      ? actionLabel(language, error.secondaryAction.code)
      : null,
  }
}

export function formatProductIssue(
  language: InterfaceLanguage,
  issue: ProductIssue,
): string {
  return issue.code === "storage.unsupported-version"
    ? SHELL_COPY[language].errors.unsupportedVersionMessage(issue.params)
    : SHELL_COPY[language].errors.genericMessage
}

export const SETTINGS_COPY = defineCopy({
  en: {
    page: {
      title: "Settings",
      description: "Manage local processing and storage preferences.",
    },
  },
  vi: {
    page: {
      title: "Cài đặt",
      description: "Quản lý tùy chọn xử lý và lưu trữ cục bộ.",
    },
  },
})

export interface CopyRegistry {
  shell: typeof SHELL_COPY
  settings: typeof SETTINGS_COPY
}

export const COPY_REGISTRY: Readonly<CopyRegistry> = Object.freeze({
  shell: SHELL_COPY,
  settings: SETTINGS_COPY,
})
