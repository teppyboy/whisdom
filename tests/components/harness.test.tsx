// @vitest-environment jsdom
import "fake-indexeddb/auto"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test"

import { App } from "../../src/App"
import { ThemeProvider } from "../../src/components/theme-provider"
import { DEFAULT_SETTINGS } from "../../src/features/transcription/models"
import { localHelperClient } from "../../src/features/local-helper/client"
import { normalizeHelperProgress } from "../../src/features/local-helper/progress"
import { saveSettings } from "../../src/features/storage/indexed-db"

const health = { available: true, protocol_version: 1, busy: false }

const capabilities = {
  available: true,
  engine: "whisper.cpp",
  accelerator: "cpu",
  model_id: "ggml-large-v3-turbo-q5_0",
  model_ready: true,
  ffmpeg_ready: true,
  native_picker: true,
  models: [
    {
      id: "ggml-large-v3-turbo-q5_0",
      label: "Whisper Large v3 Turbo",
      quality: "high",
      size_bytes: 574041195,
      installed: true,
      engine: "whisper.cpp" as const,
      supported_languages: ["*"],
      supports_auto_language: true,
      active_backend: "unavailable" as const,
    },
  ],
}

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderCompanion() {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>
  )
}

function nativeSelection(id = "selection-1", filename = "meeting.mkv") {
  return {
    id,
    filename,
    size_bytes: 42,
    extension: "mkv",
  }
}

describe("component harness", () => {
  it("provides DOM matchers and isolated IndexedDB", () => {
    render(<main aria-label="Harness">Ready</main>)
    expect(screen.getByRole("main", { name: "Harness" })).toBeInTheDocument()
    expect(indexedDB).toBeDefined()
  })

  it("shows Desktop Companion availability and a clear model description", async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, mode: "local-helper" })
    vi.spyOn(localHelperClient, "discover").mockResolvedValue(health)
    vi.spyOn(localHelperClient, "connect").mockResolvedValue(capabilities)
    vi.spyOn(localHelperClient, "subscribeEvents").mockImplementation(
      (handlers) => {
        handlers.onOpen?.()
        return { unsubscribe: vi.fn() }
      }
    )

    renderCompanion()

    expect(await screen.findByText("Desktop Companion is ready")).toBeVisible()
    expect(
      await screen.findByText(
        "High accuracy with faster processing than full Large v3. Download: about 548 MB."
      )
    ).toBeVisible()
    expect(screen.queryByText(/high -/i)).not.toBeInTheDocument()
  })

  it("subscribes to helper events while mounted and unsubscribes after unmount", async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, mode: "local-helper" })
    const unsubscribe = vi.fn()
    const subscribeEvents = vi
      .spyOn(localHelperClient, "subscribeEvents")
      .mockImplementation(() => ({ unsubscribe }))

    const { unmount } = renderCompanion()
    await waitFor(() => expect(subscribeEvents).toHaveBeenCalledTimes(1))

    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it("links to Releases when Desktop Companion is unavailable", async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, mode: "local-helper" })
    vi.spyOn(localHelperClient, "discover").mockResolvedValue(null)
    vi.spyOn(localHelperClient, "connect").mockRejectedValue(
      new Error("Whisdom helper is not running.")
    )

    renderCompanion()

    expect(
      await screen.findByText("Desktop Companion is not running")
    ).toBeVisible()
    expect(
      screen.getByRole("link", { name: "Get Desktop Companion" })
    ).toHaveAttribute(
      "href",
      "https://github.com/teppyboy/whisdom/releases/latest"
    )
  })

  it("renders the native picker labels instead of browser drop copy", async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, mode: "local-helper" })
    vi.spyOn(localHelperClient, "discover").mockResolvedValue(health)
    vi.spyOn(localHelperClient, "connect").mockResolvedValue(capabilities)
    vi.spyOn(localHelperClient, "selectFiles").mockResolvedValue([])
    const user = userEvent.setup()

    renderCompanion()

    const choose = await screen.findByRole("button", {
      name: "Choose files on your computer",
    })
    expect(
      screen.getByRole("heading", { name: "Choose files on your computer" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: "Desktop Companion" })
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        /Drag and drop is not available in Desktop Companion mode/
      )
    ).toBeInTheDocument()
    expect(screen.queryByText("Add audio or video")).not.toBeInTheDocument()

    await user.click(choose)
    expect(localHelperClient.selectFiles).toHaveBeenCalledTimes(1)
  })

  it("removes selections returned after the companion picker resolves post-unmount", async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, mode: "local-helper" })
    vi.spyOn(localHelperClient, "connect").mockResolvedValue(capabilities)
    const selectFiles = vi.spyOn(localHelperClient, "selectFiles")
    let resolveSelections: (value: ReturnType<typeof nativeSelection>[]) => void
    selectFiles.mockReturnValue(
      new Promise((resolve) => {
        resolveSelections = resolve
      })
    )
    const deleteSelection = vi
      .spyOn(localHelperClient, "deleteSelection")
      .mockResolvedValue()
    const user = userEvent.setup()
    const { unmount } = renderCompanion()

    await user.click(
      await screen.findByRole("button", { name: "Choose files on your computer" })
    )
    expect(selectFiles).toHaveBeenCalledTimes(1)
    expect(screen.queryByText("meeting.mkv")).not.toBeInTheDocument()

    unmount()
    resolveSelections!([nativeSelection("selection-after-unmount")])

    await waitFor(() =>
      expect(deleteSelection).toHaveBeenCalledWith("selection-after-unmount")
    )
    expect(screen.queryByText("meeting.mkv")).not.toBeInTheDocument()
  })

  it("locks companion queue controls while the helper reports queued", async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, mode: "local-helper" })
    vi.spyOn(localHelperClient, "connect").mockResolvedValue(capabilities)
    vi.spyOn(localHelperClient, "selectFiles").mockResolvedValue([
      nativeSelection(),
      nativeSelection("selection-2", "agenda.mkv"),
    ])
    vi.spyOn(localHelperClient, "startSelection").mockResolvedValue({
      jobId: "job-queued",
    })
    vi.spyOn(localHelperClient, "subscribeEvents").mockImplementation(
      (handlers) => {
        handlers.onProgress?.({
          kind: "progress",
          job_id: "job-queued",
          phase: "other",
          percent: 0,
          message: "Waiting to start",
        })
        return { unsubscribe: vi.fn() }
      }
    )
    const user = userEvent.setup()
    renderCompanion()

    await user.click(
      await screen.findByRole("button", { name: "Choose files on your computer" })
    )
    await screen.findByText("meeting.mkv")
    await user.click(
      screen.getByRole("button", { name: "Transcribe selected file" })
    )

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Choose files on your computer" })
      ).toBeDisabled()
      expect(
        screen.getByRole("button", { name: "Remove: meeting.mkv" })
      ).toBeDisabled()
      expect(
        screen.getByRole("button", { name: "Move down: meeting.mkv" })
      ).toBeDisabled()
      expect(
        screen.getByRole("button", { name: "Move up: agenda.mkv" })
      ).toBeDisabled()
    })
  })

  it("sends the current VAD toggle value when starting Companion transcription", async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      mode: "local-helper",
      experimentalVad: true,
    })
    vi.spyOn(localHelperClient, "connect").mockResolvedValue(capabilities)
    vi.spyOn(localHelperClient, "selectFiles").mockResolvedValue([
      nativeSelection(),
    ])
    vi.spyOn(localHelperClient, "startSelection").mockResolvedValue({
      jobId: "job-vad-toggle",
    })
    vi.spyOn(localHelperClient, "subscribeEvents").mockImplementation(() => ({
      unsubscribe: vi.fn(),
    }))
    const user = userEvent.setup()
    renderCompanion()

    await user.click(
      await screen.findByRole("button", { name: "Choose files on your computer" })
    )
    await screen.findByText("meeting.mkv")
    await user.click(screen.getByRole("button", { name: "Account menu" }))
    await user.click(screen.getByText("Settings"))
    const vad = screen.getByRole("switch", {
      name: "Experimental voice activity detection",
    })
    expect(vad).toBeChecked()
    await user.click(vad)
    expect(vad).not.toBeChecked()
    expect(
      screen.queryByText("Experimental voice activity detection is enabled.")
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Go to home" }))
    await user.click(
      screen.getByRole("button", { name: "Start transcription" })
    )

    await waitFor(() =>
      expect(localHelperClient.startSelection).toHaveBeenCalledWith(
        "selection-1",
        "auto",
        "ggml-large-v3-turbo-q5_0",
        false
      )
    )
  })

  it("marks a companion queue row as Error when the job result is invalid after completion", async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, mode: "local-helper" })
    vi.spyOn(localHelperClient, "connect").mockResolvedValue(capabilities)
    vi.spyOn(localHelperClient, "selectFiles").mockResolvedValue([
      nativeSelection(),
    ])
    vi.spyOn(localHelperClient, "startSelection").mockResolvedValue({
      jobId: "job-invalid-complete",
    })
    vi.spyOn(localHelperClient, "subscribeEvents").mockImplementation(
      (handlers) => {
        queueMicrotask(() => {
          handlers.onJob?.({
            kind: "job",
            job_id: "job-invalid-complete",
            status: "complete",
          })
        })
        return { unsubscribe: vi.fn() }
      }
    )
    vi.spyOn(localHelperClient, "awaitJobResult").mockRejectedValue(
      new Error("Helper progress complete status has invalid segments.")
    )
    const user = userEvent.setup()
    renderCompanion()

    await user.click(
      await screen.findByRole("button", { name: "Choose files on your computer" })
    )
    await screen.findByText("meeting.mkv")
    await user.click(
      screen.getByRole("button", { name: "Start transcription" })
    )

    expect(
      await screen.findByText(
        "Helper progress complete status has invalid segments."
      )
    ).toBeTruthy()
    const activeRow = screen.getByText("meeting.mkv").closest("div")
    expect(activeRow).not.toBeNull()
    expect(within(activeRow!).getByText("Needs attention")).toBeTruthy()
  })

  it("normalizes native 100-point progress for the browser progress bar", () => {
    expect(normalizeHelperProgress(100)).toBe(1)
    expect(normalizeHelperProgress(50)).toBe(0.5)
    expect(normalizeHelperProgress(101)).toBe(1)
  })
})
