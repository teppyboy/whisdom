import { AlertCircle, CheckCircle2 } from "lucide-react"

import type { Copy } from "@/App"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ToastMessage = {
  id: string
  title: string
  description: string
  kind?: "success" | "error"
}

export function AppToast({
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
            size="icon"
            className="size-9 shrink-0"
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
