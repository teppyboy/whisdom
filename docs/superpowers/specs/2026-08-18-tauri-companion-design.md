# Optional Tauri Desktop Companion — Design Specification

**Status:** Approved design

**Date:** 2026-08-18

## Goal

Ship an optional Windows Tauri companion that lets the hosted Whisdom web app add local media to its normal reorderable queue without exposing paths or media to the browser. The companion owns native file access and local native inference; it does not replace the Vite web application.

## Decisions

- The main product remains the deployed browser app.
- The desktop companion is optional and Windows-first.
- The companion has no main application UI; it runs in the system tray and opens a native file dialog only after an authenticated request from the paired web app.
- The companion runs native Whisper/FFmpeg/cache logic inside its process.
- Native single-select and Ctrl/Shift multi-select are supported. Repeated picker actions append selections to the browser queue.
- The browser queue supports removal and move up/move down ordering. Queue order is used for sequential batch processing.
- The website receives opaque selection/job IDs, sanitized display metadata, SSE progress, text, and native timestamp segments. It never receives a local filesystem path or media bytes.
- The existing browser WebGPU/WASM path stays available as the fallback.
- The standalone `whisdom-helper.exe` multipart loopback upload path remains a legacy compatibility API. New Companion flows use protocol v2 selection/start endpoints.

## Architecture

```text
Hosted Whisdom web app
  │
  │ loopback HTTP: paired token + strict Origin allowlist
  ▼
Optional Whisdom Companion (Tauri tray application)
  ├── native Windows file dialog
  ├── Axum loopback API + SSE
  ├── native whisper.cpp / whisper-rs (Vulkan-first, CPU fallback)
  ├── FFmpeg/model download and cache manager
  └── per-user runtime data
```

The companion binds only to `127.0.0.1`. Its Axum server is started from the Tauri process. Tauri owns each selected `PathBuf` in a bounded in-memory selection store. The browser calls the companion API but cannot read or submit arbitrary Windows paths.

## Companion UX

The tray menu includes:

- **Whisdom Companion is running** (disabled status label)
- **Start with Windows** toggle, scoped to the current Windows user.
- **Quit**

The companion starts on sign-in when the user enables startup at installation. It does not show a persistent window.

When the web user chooses the companion mode:

1. The website connects to the paired Companion and reads its capabilities.
2. Choose files calls `POST /api/v1/select-files`; the Companion validates Origin and token, opens the native picker, and waits for selection.
3. Cancellation/dismissal returns `204 No Content`; no selection or queue row is created.
4. A single or multi-file result returns opaque selection IDs plus sanitized filename, size, and extension metadata. Repeated Choose files actions append rows without replacing existing rows.
5. The user can remove a row or move it up/down. Removal calls the Companion's delete endpoint first. These controls are disabled while a job is active.
6. Starting a row calls `POST /api/v1/transcribe-selection` with only the selection ID, language, and a model ID from the capability catalog. The Companion consumes the selection, reads its local path, and starts the job.
7. The website subscribes to SSE progress and renders the existing progress/result experience. Batch processing follows the visual queue order sequentially.

Selections are opaque, in-memory Companion records. They expire after 30 minutes, are single-use on start, and contain only native path state plus sanitized display metadata inside the Companion process.

## Loopback API

All normal endpoints use both `/api/v1/*` and `/v1/*`. Legacy `/api/*` aliases remain during migration.

| Method   | Endpoint                       | Auth           | Purpose                                                                           |
| -------- | ------------------------------ | -------------- | --------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/health`               | no             | Discovery, protocol version, busy state                                           |
| `POST`   | `/api/v1/pair`                 | Origin         | Creates/rotates a per-user pairing token                                          |
| `GET`    | `/api/v1/capabilities`         | token + Origin | Companion engine, accelerator, native picker, GGML model catalog, installed state |
| `POST`   | `/api/v1/select-files`         | token + Origin | Opens native picker and returns opaque selection metadata                         |
| `DELETE` | `/api/v1/selections/{id}`      | token + Origin | Removes a pending 30-minute selection                                             |
| `POST`   | `/api/v1/transcribe-selection` | token + Origin | Starts a selected path-backed job using a catalog model                           |
| `GET`    | `/api/v1/progress/{id}`        | token + Origin | Server-sent job status events                                                     |
| `POST`   | `/api/v1/cancel/{id}`          | token + Origin | Cancels the job                                                                   |
| `GET`    | `/api/v1/cache/status`         | token + Origin | Reports cache state                                                               |
| `POST`   | `/api/v1/cache/clear`          | token + Origin | Clears idle companion cache                                                       |

`POST /api/v1/select-files` has no request body. A successful response contains only display metadata:

```json
{
  "selections": [
    {
      "id": "opaque-selection-id",
      "filename": "recording.mkv",
      "size_bytes": 123456,
      "extension": "mkv"
    }
  ]
}
```

Empty native selection returns `204 No Content`. The response never contains a path, folder, drive letter, URL, media bytes, or token.

`POST /api/v1/transcribe-selection` accepts only:

```json
{
  "selection_id": "opaque-selection-id",
  "language": "vi",
  "model": "ggml-base-q5_1"
}
```

The response contains only an opaque `job_id`. A selection cannot be started twice.

The legacy multipart `POST /api/v1/transcribe` remains available for standalone helper compatibility. It accepts browser-uploaded media and optional language/model fields; a missing model defaults to `ggml-large-v3-turbo-q5_0`, while a supplied model must be in the native catalog. This legacy route is separate from Companion selection and does not accept browser filesystem paths through the v2 API.

## Security and privacy

- Bind exclusively to IPv4 loopback.
- Continue strict Origin equality checks, including the deployed Whisdom origin and explicit local development origin.
- Pairing and every privileged action require the per-user bearer token.
- The native picker is the only source of a native path. The frontend cannot submit one.
- Selection records stay in Companion memory for 30 minutes and are bounded; expired or deleted IDs cannot be used.
- Do not log token values, absolute paths, media content, transcript text, or Authorization headers.
- Do not enable Tauri remote API access, shell execution, filesystem plugin access, or arbitrary webview navigation for the hosted page.
- The tray app's webview is not the product UI; it does not embed the remote Whisdom site.
- Paths and source media never leave the Companion process. The browser sends no multipart media or media path in Companion mode.

## Native Runtime

Reuse the helper's current modules for:

- Capability-backed pinned GGML model catalog with model ID, label, quality, size, filename, URL, and SHA-256 metadata kept server-side.
- On-demand selected-model download with SHA-256 verification and atomic finalization.
- Manual bounded redirect traversal. Every hop requires HTTPS and an exact allowlisted asset-delivery host; redirects to unlisted hosts fail before their response body is read.
- On-demand pinned BtbN FFmpeg download, verification, safe extraction, and native conversion.
- `whisper-rs` native segments with native timestamps.
- Vulkan-first model initialization with CPU fallback.
- Sequential job queue, cancellation, and cache-clear busy protection.

For selected media, FFmpeg reads the original path and writes a temporary 16 kHz mono PCM WAV under the companion temp directory. The original source media is never copied into the browser or sent over the network.

Per-user files remain under:

```text
%LOCALAPPDATA%\Whisdom\Companion\
  models\
  tools\
  temp\
  logs\
  auth\
```

## Tauri Packaging

Add an independent Tauri workspace/package for the companion. It owns:

- Tauri configuration, Windows installer metadata, tray icon, startup option, and companion executable.
- A Rust library boundary that reuses the transcription modules without importing the production server's cloud routes/configuration.
- Vulkan build selection and Windows build documentation.

The website remains a normal Vite Pages deployment. Its package does not gain a Tauri dependency. The companion build is manual/release-specific until CI packaging and signing are explicitly added.

## Frontend Integration

Keep `local-helper` as the user-facing mode label only if copy reflects the companion accurately; otherwise rename it to **Desktop Companion** in both English and Vietnamese copy.

The client uses typed v2 operations: `selectFiles()`, `deleteSelection(id)`, and `startSelection(id, language, modelId)`. It never creates browser `File` objects for native selections and never forwards media or paths. The existing SSE parser, result mapping, transcript storage, exports, queue rendering, and cache synchronization are reused. Browser-selected queue entries are retained for browser modes; companion entries retain opaque selection metadata until explicit start.

Companion model choices come only from `/api/v1/capabilities`. The UI shows native size/quality and keeps the ephemeral selected model ID out of IndexedDB settings. Browser ONNX model IDs are not sent to the Companion.

## Errors and Logging

The companion emits structured terminal/file logs for startup, API status, picker opened/cancelled, selection lifecycle, job lifecycle, download state, FFmpeg failures, native model backend selection, and sanitized errors. HTTP request logging must redact `Authorization` and must not log request bodies or file paths.

User-facing errors remain localized EN/VI. A cancelled picker is not an error toast. A helper download/transcription failure appears through the existing terminal job error path and SSE status. Expired, deleted, or already-consumed selection IDs return an error and do not start a job.

## Validation

1. Unit-test the v2 selection lifecycle: valid single/multi-select metadata, picker cancellation, 30-minute expiry, deletion, single-use start, unknown model rejection, and absence of client-supplied path/asset fields.
2. Run the helper module tests, frontend local-helper tests, typecheck, lint, unit tests, build, and E2E suite.
3. Build the companion with Vulkan using the Windows short target path and run it from a clean `%LOCALAPPDATA%` test root.
4. Manually verify pairing, tray startup, native picker cancellation, single and multi-file append, reorder/remove, MKV selection, FFmpeg/model first download, Vietnamese transcription, native timestamp SRT/VTT export, SSE progress, cancellation, cache clear, browser fallback, and uninstall.
5. Verify a localhost page with an unlisted Origin cannot pair, invoke picker, read progress, cancel, or clear cache.

## Non-Goals

- No Tauri replacement for the hosted web product.
- No uploaded-media fallback in Companion mode.
- No arbitrary path, URL, drag-drop path, or shell-command API.
- No remote browser webview shell.
- No macOS/Linux package in this slice.
- No code signing, auto-update, or CI release packaging until separately approved.
