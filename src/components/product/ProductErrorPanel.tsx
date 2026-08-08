import { AlertCircle } from "lucide-react"

import { formatProductError, type ProductError } from "@/app/copy"
import type { InterfaceLanguage } from "@/app/copy-types"
import { Button } from "@/components/ui/button"

export function ProductErrorPanel({
  language,
  error,
  onPrimaryAction,
  onSecondaryAction,
}: {
  language: InterfaceLanguage
  error: ProductError
  onPrimaryAction: () => void
  onSecondaryAction?: () => void
}) {
  const copy = formatProductError(language, error)
  return (
    <section
      role="alert"
      aria-labelledby={`error-${error.occurrenceId}`}
      className="border-destructive border-l-2 px-4 py-3"
    >
      <div className="flex gap-3">
        <AlertCircle
          className="text-destructive mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h2 id={`error-${error.occurrenceId}`} className="text-sm font-semibold">
            {copy.title}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">{copy.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={onPrimaryAction}>
              {copy.primaryLabel}
            </Button>
            {copy.secondaryLabel && onSecondaryAction ? (
              <Button size="sm" variant="outline" onClick={onSecondaryAction}>
                {copy.secondaryLabel}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
