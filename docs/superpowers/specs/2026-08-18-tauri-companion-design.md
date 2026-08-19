# Optional Tauri Desktop Companion — Design Specification

**Status:** Approved design

**Date:** 2026-08-18

## Goal

Ship an optional Windows Tauri companion that lets the hosted Whisdom web app select and transcribe local media by path. It preserves Whisdom's web-first product: the companion adds native file access and local native inference but does not replace the Vite web application.

## Decisions

- The main product remains the deployed browser app.
- The desktop companion is optional and Windows-first.
- The companion has no main application UI; it runs in the system tray and opens a native file dialog only after a request from the paired web app.
- The companion runs the existing native Whisper/FFmpeg/cache logic inside its process.
- The website receives job identifiers, SSE progress, text, and native timestamp segments. It never receives a local filesystem path or media bytes.
- The existing browser WebGPU/WASM path stays available as the fallback.
- The standalone `whisdom-helper.exe` loopback upload path is superseded for desktop-companion users. Existing helper API routes stay compatible until a release removes them deliberately.

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

The companion binds only to `127.0.0.1`. Its Axum server is started from the Tauri process. Tauri owns the selected path and passes it only to the in-process transcription job. The browser calls the companion API but cannot read or submit arbitrary Windows paths.

## Companion UX

The tray menu includes:

- **Whisdom Companion is running** (disabled status label)
- **Open Whisdom** (opens the configured public web URL)
- **Quit**

The companion starts on sign-in when the user enables startup at installation. It does not show a persistent window.

When the web user chooses the companion mode and starts transcription:

1. The website calls the paired `POST /api/v1/pick-and-transcribe` endpoint from a click-driven action.
2. The companion validates Origin and token, opens a native file picker, and waits for selection.
3. Cancellation/dismissal returns a normal cancellation response; no job is created.
4. On selection, the companion creates a job, returns its opaque `job_id`, and starts processing the native path.
5. The website subscribes to the existing SSE progress endpoint and renders the existing progress/result experience.

The website supplies optional transcription language and the fixed companion model identifier. The companion returns the selected filename only as display metadata. It never returns a local path, folder name, or drive letter.

## Loopback API

All normal endpoints use both `/api/v1/*` and `/v1/*`. Legacy `/api/*` aliases remain during migration.

| Method | Endpoint                      | Auth           | Purpose                                                                 |
| ------ | ----------------------------- | -------------- | ----------------------------------------------------------------------- |
| `GET`  | `/api/v1/health`              | no             | Discovery, protocol version, busy state                                 |
| `POST` | `/api/v1/pair`                | Origin         | Creates/rotates a per-user pairing token                                |
| `GET`  | `/api/v1/capabilities`        | token + Origin | Companion availability, engine, Vulkan/CPU capability, model/tool state |
| `POST` | `/api/v1/pick-and-transcribe` | token + Origin | Opens native picker and starts a path-backed job                        |
| `GET`  | `/api/v1/progress/{id}`       | token + Origin | Server-sent job status events                                           |
| `POST` | `/api/v1/cancel/{id}`         | token + Origin | Cancels the job                                                         |
| `GET`  | `/api/v1/cache/status`        | token + Origin | Reports cache state                                                     |
| `POST` | `/api/v1/cache/clear`         | token + Origin | Clears idle companion cache                                             |

`POST /api/v1/pick-and-transcribe` JSON request:

```json
{
  "language": "vi",
  "model": "ggml-large-v3-turbo-q5_0"
}
```

Successful response:

```json
{
  "job_id": "opaque-uuid",
  "filename": "recording.mkv"
}
```

The API has no `path`, `file`, `multipart`, or URL input. This removes browser upload size limits and prevents a hostile allowed-origin page from choosing arbitrary files without the explicit native dialog.

## Security

- Bind exclusively to IPv4 loopback.
- Continue strict Origin equality checks, including the deployed Whisdom origin and explicit local development origin.
- Pairing and every privileged action require the per-user bearer token.
- The picker is the only source of a native path. The frontend cannot submit one.
- The picker must be initiated by the `pick-and-transcribe` request, not a tray timer/background action.
- Do not log token values, absolute paths, media content, transcript text, or Authorization headers.
- Do not enable Tauri remote API access, shell execution, filesystem plugin access, or arbitrary webview navigation for the hosted page.
- The tray app's webview is not the product UI; it does not embed the remote Whisdom site.

## Native Runtime

Reuse the helper's current modules for:

- On-demand pinned model download with SHA-256 verification and atomic finalization.
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

The client changes from multipart `submitJob(file, language, model)` to JSON `pickAndSubmit(language, model)`. The existing SSE parser, result mapping, transcript storage, exports, queue rendering, and cache synchronization are reused. Browser-selected queue entries are retained for browser modes; companion mode starts from its own native picker instead.

The website detects the companion with `/api/v1/health`, then pairs and checks capabilities as it does today. If unavailable, show an installation/start message and leave browser transcription selectable.

## Errors and Logging

The companion emits structured terminal/file logs for startup, API status, picker opened/cancelled, job lifecycle, download state, FFmpeg failures, native model backend selection, and sanitized errors. HTTP request logging must redact `Authorization` and must not log request bodies or file paths.

User-facing errors remain localized EN/VI. A cancelled picker is not an error toast. A helper download/transcription failure appears through the existing terminal job error path and SSE status.

## Validation

1. Unit-test the path-backed job request: valid language/model schedules a job; picker cancellation creates no job; no request type accepts a client-supplied path.
2. Run the existing helper module tests, frontend local-helper tests, typecheck, lint, unit tests, build, and E2E suite.
3. Build the companion with Vulkan using the Windows short target path and run it from a clean `%LOCALAPPDATA%` test root.
4. Manually verify pairing, tray startup, native picker cancellation, MKV selection, FFmpeg/model first download, Vietnamese transcription, native timestamp SRT/VTT export, SSE progress, cancellation, cache clear, browser fallback, and uninstall.
5. Verify a localhost page with an unlisted Origin cannot pair, invoke picker, read progress, cancel, or clear cache.

## Non-Goals

- No Tauri replacement for the hosted web product.
- No uploaded-media fallback in companion mode.
- No arbitrary path, URL, drag-drop path, or shell-command API.
- No remote browser webview shell.
- No macOS/Linux package in this slice.
- No code signing, auto-update, or CI release packaging until separately approved.
