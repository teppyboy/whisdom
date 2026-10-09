import * as React from "react"

import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  X,
} from "lucide-react"

import type {
  JobState,
  TranscriptionProgress,
} from "@/features/transcription/types"
import { cn } from "@/lib/utils"

export type ProgressPanelLogLine = {
  id: string
  timestamp: string
  level?: "info" | "warn" | "error"
  message: string
}

export type TranscriptionProgressCopy = {
  phasePrepare: string
  phaseModel: string
  phaseTranscribe: string
  technicalDetails: string
  copyDiagnostics: string
  diagnosticsCopied: string
  diagnosticsCopyFailed: string
  noLogEvents: string
  etaRemaining: (text: string) => string
  etaSeconds: (seconds: number) => string
  etaMinutes: (minutes: number, seconds: number) => string
  cancelTranscription: string
  cancelling: string
  errorDetailsTitle: string
}

type PhaseStepId = "prepare" | "model" | "transcribe"

const PHASE_STEPS: PhaseStepId[] = ["prepare", "model", "transcribe"]

const PHASE_STEP_LABELS: Record<PhaseStepId, (copy: TranscriptionProgressCopy) => string> = {
  prepare: (copy) => copy.phasePrepare,
  model: (copy) => copy.phaseModel,
  transcribe: (copy) => copy.phaseTranscribe,
}

const TERMINAL_JOB_STATES: JobState[] = [
  "idle",
  "awaiting-confirmation",
  "complete",
  "error",
  "cancelled",
]

function activeStepIndex(jobState: JobState): number {
  switch (jobState) {
    case "analyzing":
    case "preparing-media":
    case "chunking":
      return PHASE_STEPS.indexOf("prepare")
    case "queued":
    case "downloading-assets":
      return PHASE_STEPS.indexOf("model")
    case "transcribing":
    case "saving":
      return PHASE_STEPS.indexOf("transcribe")
    default:
      return -1
  }
}

function formatEtaText(
  seconds: number,
  copy: TranscriptionProgressCopy
): string {
  const safeSeconds = Math.max(0, Math.round(seconds))
  if (safeSeconds < 60) return copy.etaSeconds(safeSeconds)
  const minutes = Math.floor(safeSeconds / 60)
  const rest = safeSeconds % 60
  return copy.etaMinutes(minutes, rest)
}

type PhaseTrackerState = { seenJobState: JobState; furthest: number }

export function TranscriptionProgressPanel({
  copy,
  progress,
  jobState,
  error,
  logs,
  canCancel,
  cancelling,
  onCancel,
  onCopyDiagnostics,
  onErrorClick,
  etaSeconds,
}: {
  copy: TranscriptionProgressCopy
  progress: TranscriptionProgress
  jobState: JobState
  error: string | null
  logs: ProgressPanelLogLine[]
  canCancel: boolean
  /** Client-side ETA in seconds, estimated by the caller from elapsed time. */
  etaSeconds: number | null
  cancelling: boolean
  onCancel: () => void
  onCopyDiagnostics: () => Promise<boolean>
  onErrorClick: () => void
}) {
  // Collapsed by default; opens automatically (and stays open) whenever an
  // error is shown, until the user explicitly toggles it.
  const [detailsOverride, setDetailsOverride] = React.useState<boolean | null>(
    null
  )
  const [diagnosticsState, setDiagnosticsState] = React.useState<
    "idle" | "copied" | "failed"
  >("idle")
  const detailsOpen = detailsOverride ?? error !== null

  const [phaseTracker, setPhaseTracker] = React.useState<PhaseTrackerState>({
    seenJobState: jobState,
    furthest: activeStepIndex(jobState),
  })

  // Adjust phase tracking during render, following the documented "adjusting
  // state when props change" pattern. Completed steps come from the furthest
  // step reached during this run so mode-specific order differences (model
  // download before convert) still read clearly.
  if (phaseTracker.seenJobState !== jobState) {
    const nextTracker = {
      seenJobState: jobState,
      furthest: phaseTracker.furthest,
    }
    if (
      TERMINAL_JOB_STATES.includes(phaseTracker.seenJobState) &&
      !TERMINAL_JOB_STATES.includes(jobState)
    ) {
      nextTracker.furthest = -1
    }
    const step = activeStepIndex(jobState)
    if (step >= 0) nextTracker.furthest = Math.max(nextTracker.furthest, step)
    setPhaseTracker(nextTracker)
  }

  const isRun =
    !TERMINAL_JOB_STATES.includes(jobState) || jobState === "complete"
  const isFailed =
    jobState === "error" || (error !== null && jobState !== "complete")
  const indeterminate = progress.indeterminate === true && isRun
  const showPercent =
    !indeterminate && isRun && progress.progress > 0 && jobState !== "complete"
  const currentStep = jobState === "complete" ? -2 : activeStepIndex(jobState)

  const diagnosticsCopyPending = React.useRef(false)
  async function handleCopyDiagnostics() {
    if (diagnosticsCopyPending.current) return
    diagnosticsCopyPending.current = true
    const succeeded = await onCopyDiagnostics()
    diagnosticsCopyPending.current = false
    setDiagnosticsState(succeeded ? "copied" : "failed")
  }

  return (
    <div className="space-y-3">
      <ol className="flex items-center gap-2">
        {PHASE_STEPS.map((step, index) => {
          const isComplete =
            jobState === "complete" || phaseTracker.furthest > index
          const isActive = currentStep === index
          const isLast = index === PHASE_STEPS.length - 1
          return (
            <li
              key={step}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2",
                isLast && "flex-none"
              )}
            >
              <span
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
                  isComplete && !isActive &&
                    "border-primary bg-primary text-primary-foreground",
                  isActive &&
                    (isFailed
                      ? "border-destructive bg-destructive text-destructive-foreground"
                      : "border-primary text-primary"),
                  !isComplete &&
                    !isActive &&
                    "border-border text-muted-foreground"
                )}
              >
                {isActive ? (
                  isFailed ? (
                    <AlertCircle className="size-3" />
                  ) : (
                    <Loader2 className="size-3 animate-spin" />
                  )
                ) : isComplete ? (
                  <Check className="size-3" />
                ) : (
                  <span className="size-1.5 rounded-full bg-current opacity-50" />
                )}
              </span>
              <span
                className={cn(
                  "truncate text-xs transition-colors duration-200",
                  isActive
                    ? isFailed
                      ? "font-medium text-destructive"
                      : "font-medium text-foreground"
                    : isComplete
                      ? "text-foreground"
                      : "text-muted-foreground"
                )}
              >
                {PHASE_STEP_LABELS[step](copy)}
              </span>
              {!isLast ? (
                <span
                  className={cn(
                    "h-px flex-1 transition-colors duration-200",
                    isComplete && !isActive ? "bg-primary/50" : "bg-border"
                  )}
                />
              ) : null}
            </li>
          )
        })}
      </ol>

      {indeterminate ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
          <div className="h-full w-1/3 rounded-full bg-primary motion-safe:animate-[whisdom-indeterminate_1.4s_ease-in-out_infinite]" />
        </div>
      ) : (
        <div
          className={cn(
            "h-1.5 w-full overflow-hidden rounded-full bg-primary/15",
            isFailed && "bg-destructive/15"
          )}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-out",
              isFailed ? "bg-destructive" : "bg-primary"
            )}
            style={{
              width: `${Math.round(
                (jobState === "complete" ? 1 : progress.progress) * 100
              )}%`,
            }}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="min-w-0 truncate text-muted-foreground">
          {progress.message}
        </span>
        <span className="flex shrink-0 items-center gap-2 font-medium">
          {etaSeconds !== null ? (
            <span className="text-muted-foreground">
              {copy.etaRemaining(formatEtaText(etaSeconds, copy))}
            </span>
          ) : null}
          {showPercent ? `${Math.round(progress.progress * 100)}%` : null}
          {indeterminate ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : null}
        </span>
      </div>

      {progress.detail?.message ? (
        <p className="text-xs text-muted-foreground">
          {progress.detail.message}
        </p>
      ) : null}

      {error ? (
        <button
          type="button"
          className="flex w-full animate-in cursor-pointer items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-left text-sm text-destructive duration-200 fade-in slide-in-from-top-1 hover:border-destructive/60"
          onClick={onErrorClick}
          title={copy.errorDetailsTitle}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </button>
      ) : null}

      {canCancel ? (
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          disabled={cancelling}
          onClick={onCancel}
        >
          {cancelling ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <X className="size-3.5" />
          )}
          {cancelling ? copy.cancelling : copy.cancelTranscription}
        </button>
      ) : null}

      <div className="rounded-md border bg-muted/20">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40"
          onClick={() => setDetailsOverride(!detailsOpen)}
          aria-expanded={detailsOpen}
        >
          <span className="font-medium">{copy.technicalDetails}</span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              detailsOpen && "rotate-180"
            )}
          />
        </button>
        {detailsOpen ? (
          <div className="border-t">
            <div className="max-h-52 overflow-auto px-3 py-2">
              {logs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {copy.noLogEvents}
                </p>
              ) : (
                <div className="grid gap-1">
                  {logs.map((line) => (
                    <p
                      key={line.id}
                      className={cn(
                        "break-words font-mono text-[11px] leading-4 text-muted-foreground",
                        line.level === "error" && "text-destructive",
                        line.level === "warn" &&
                          "text-amber-600 dark:text-amber-400"
                      )}
                    >
                      <span className="opacity-60">[{line.timestamp}]</span>{" "}
                      {line.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end border-t px-3 py-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                onClick={() => void handleCopyDiagnostics()}
              >
                {diagnosticsState === "copied" ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {diagnosticsState === "copied"
                  ? copy.diagnosticsCopied
                  : diagnosticsState === "failed"
                    ? copy.diagnosticsCopyFailed
                    : copy.copyDiagnostics}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
