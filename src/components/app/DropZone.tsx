import * as React from "react"
import { FileAudio, FileVideo, UploadCloud } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Copy } from "@/App"

export function DropZone({
  file,
  fileCount,
  isBusy,
  copy,
  stepLabel,
  onPick,
  onDropFiles,
  nativeOnly = false,
}: {
  file: File | null
  fileCount: number
  isBusy: boolean
  copy: Copy
  stepLabel?: string
  onPick: () => void
  onDropFiles: (files: File[]) => void
  nativeOnly?: boolean
}) {
  const [isDragging, setIsDragging] = React.useState(false)
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
    <section
      className={cn(
        "group relative grid min-h-[240px] place-items-center rounded-lg border border-dashed bg-card p-6 text-center transition-colors duration-200 ease-out",
        isDragging
          ? "border-ring bg-accent/40"
          : !isBusy && "hover:border-ring hover:bg-accent/40",
        "focus-within:border-ring"
      )}
      aria-label={stepLabel}
      onDragOver={(event) => {
        event.preventDefault()
        if (!nativeOnly && !isBusy) setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setIsDragging(false)
        if (nativeOnly) return
        const droppedFiles = Array.from(event.dataTransfer.files)
        if (droppedFiles.length > 0) onDropFiles(droppedFiles)
      }}
    >
      <div className="flex max-w-xl flex-col items-center gap-4">
        {stepLabel ? (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {stepLabel}
          </p>
        ) : null}
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
        <Button className="w-full sm:w-auto" onClick={onPick} disabled={isBusy}>
          <UploadCloud />
          {nativeOnly ? copy.companionChooseFiles : copy.chooseFile}
        </Button>
      </div>
    </section>
  )
}
