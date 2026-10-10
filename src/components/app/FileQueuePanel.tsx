import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react"

import type { Copy } from "@/App"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { bytesToMb } from "@/features/media/preflight"
import {
  queueFileName,
  queueFileSize,
  type QueuedFile,
} from "@/features/transcription/queue"
import { cn } from "@/lib/utils"

export function FileQueuePanel({
  queue,
  selectedId,
  disabled,
  copy,
  onSelect,
  onRemove,
  onMove,
  onAddMore,
}: {
  queue: QueuedFile[]
  selectedId: string | null
  disabled: boolean
  copy: Copy
  onSelect: (item: QueuedFile) => void
  onRemove: (id: string) => void
  onMove: (id: string, direction: -1 | 1) => void
  onAddMore: () => void
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
                "min-w-0 rounded-md border px-3 py-2 text-sm transition-colors",
                selectedId === item.id
                  ? "border-ring bg-accent"
                  : "hover:bg-accent/60",
                disabled && "opacity-70"
              )}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <button
                  type="button"
                  className="min-w-0 flex-1 basis-44 rounded-sm py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                        : item.status === "active"
                          ? "default"
                          : "outline"
                  }
                >
                  {copy.queueStatusLabels[item.status]}
                </Badge>
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9"
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
                    className="size-9"
                    aria-label={`${copy.moveFileDown}: ${name}`}
                    disabled={disabled || index === queue.length - 1}
                    onClick={() => onMove(item.id, 1)}
                  >
                    <ChevronDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 text-muted-foreground hover:text-destructive"
                    aria-label={`${copy.removeFile}: ${name}`}
                    disabled={disabled}
                    onClick={() => onRemove(item.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          disabled={disabled}
          onClick={onAddMore}
        >
          <Plus />
          {copy.addMoreFiles}
        </Button>
      </CardContent>
    </Card>
  )
}
