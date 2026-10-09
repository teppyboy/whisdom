import * as React from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"

import type { Copy } from "@/App"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getLanguageLabel,
  TRANSCRIPTION_LANGUAGES,
} from "@/features/transcription/language"
import type { LanguageCode } from "@/features/transcription/types"
import { cn } from "@/lib/utils"

export function LanguageCombobox({
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
  const [activeIndex, setActiveIndex] = React.useState(-1)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
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

  function openListbox() {
    setOpen(true)
    setActiveIndex(
      Math.max(
        0,
        options.findIndex((item) => item.code === value)
      )
    )
  }

  function chooseOption(index: number) {
    const option = options[index]
    if (!option) return
    onValueChange(option.code as LanguageCode)
    setQuery("")
    setOpen(false)
  }

  function moveActive(delta: -1 | 1) {
    setActiveIndex((current) => {
      const next = current + delta
      if (next < 0) return 0
      if (next > options.length - 1) return options.length - 1
      return next
    })
  }

  React.useEffect(() => {
    if (!open || activeIndex < 0) return
    const active = options[activeIndex]
    if (!active) return
    listRef.current
      ?.querySelector(`[data-option-code="${active.code}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, open, options])

  function handleTriggerKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (!open) {
        openListbox()
        return
      }
      moveActive(event.key === "ArrowDown" ? 1 : -1)
    }
  }

  function handleListKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      moveActive(1)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      moveActive(-1)
    } else if (event.key === "Home") {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === "End") {
      event.preventDefault()
      setActiveIndex(options.length - 1)
    } else if (event.key === "Enter" || event.key === " ") {
      if (activeIndex >= 0) {
        event.preventDefault()
        chooseOption(activeIndex)
      }
    }
  }

  const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        aria-label={copy.language}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? "language-listbox" : undefined}
        aria-activedescendant={
          open && activeOption
            ? `language-option-${activeOption.code}`
            : undefined
        }
        className="w-full justify-between"
        onClick={() => (open ? setOpen(false) : openListbox())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronsUpDown className="size-4 text-muted-foreground" />
      </Button>

      {open ? (
        <div
          className="absolute z-50 mt-2 w-full min-w-[18rem] animate-in overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg duration-150 fade-in-0 zoom-in-95"
          onKeyDown={handleListKeyDown}
        >
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Search className="size-4 text-muted-foreground" />
            <Input
              role="searchbox"
              aria-label={copy.searchLanguage}
              value={query}
              className="h-8 border-0 shadow-none focus-visible:ring-0"
              placeholder={copy.searchLanguage}
              autoFocus
              onChange={(event) => {
                setQuery(event.target.value)
                setActiveIndex(-1)
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setOpen(false)
                }
              }}
            />
          </div>

          <div
            ref={listRef}
            id="language-listbox"
            role="listbox"
            className="max-h-72 overflow-auto p-2"
          >
            {options.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {copy.noLanguages}
              </p>
            ) : (
              options.map((item, index) => (
                <button
                  key={item.code}
                  type="button"
                  role="option"
                  id={`language-option-${item.code}`}
                  data-option-code={item.code}
                  aria-selected={item.code === value}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-sm px-3 py-3 text-left text-sm hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent",
                    index === activeIndex && "bg-accent text-accent-foreground"
                  )}
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
