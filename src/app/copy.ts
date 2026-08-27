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
      unsupportedVersionTitle: "This data version is not supported",
      unsupportedVersionMessage: ({
        foundVersion,
        maximumVersion,
      }: CopyParams) =>
        `This browser has Whisdom data version ${foundVersion}. This version of Whisdom supports data through version ${maximumVersion}. Open a newer version of Whisdom. Your data has not been changed.`,
      genericTitle: "This action could not be completed",
      genericMessage: "Try again. If the problem continues, check the details.",
    },
    actions: {
      inspectDetails: "View details",
      backToLibrary: "Back to recent transcriptions",
      retry: "Try again",
    },
  },
  vi: {
    skipToContent: "Chuyển đến nội dung",
    primaryNavigation: "Điều hướng chính",
    errors: {
      unsupportedVersionTitle: "Phiên bản dữ liệu này không được hỗ trợ",
      unsupportedVersionMessage: ({
        foundVersion,
        maximumVersion,
      }: CopyParams) =>
        `Trình duyệt này có dữ liệu Whisdom phiên bản ${foundVersion}. Phiên bản Whisdom hiện tại hỗ trợ dữ liệu đến phiên bản ${maximumVersion}. Hãy mở phiên bản Whisdom mới hơn. Dữ liệu của bạn chưa bị thay đổi.`,
      genericTitle: "Không thể hoàn tất thao tác này",
      genericMessage:
        "Hãy thử lại. Nếu lỗi vẫn tiếp diễn, xem chi tiết để kiểm tra.",
    },
    actions: {
      inspectDetails: "Xem chi tiết",
      backToLibrary: "Quay lại bản chuyển ngữ gần đây",
      retry: "Thử lại",
    },
  },
})

function actionLabel(
  language: InterfaceLanguage,
  code: RecoveryActionCode
): string {
  const copy = SHELL_COPY[language].actions
  if (code === "inspect-details") return copy.inspectDetails
  if (code === "back-to-library") return copy.backToLibrary
  return copy.retry
}

export function formatProductError(
  language: InterfaceLanguage,
  error: ProductError
) {
  const copy = SHELL_COPY[language]
  const unsupported = error.code === "storage.unsupported-version"
  return {
    title: unsupported
      ? copy.errors.unsupportedVersionTitle
      : copy.errors.genericTitle,
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
  issue: ProductIssue
): string {
  return issue.code === "storage.unsupported-version"
    ? SHELL_COPY[language].errors.unsupportedVersionMessage(issue.params)
    : SHELL_COPY[language].errors.genericMessage
}

export const SETTINGS_COPY = defineCopy({
  en: {
    page: {
      title: "Settings",
      description: "Manage local data and advanced processing options.",
    },
  },
  vi: {
    page: {
      title: "Cài đặt",
      description: "Quản lý dữ liệu cục bộ và tùy chọn xử lý nâng cao.",
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
