# Whisdom Companion

Optional Windows tray companion for the hosted Whisdom web app. The web app remains the primary product; the Companion adds native Windows file picking and local native Whisper transcription.

## Prerequisites

- Windows 10/11.
- WebView2 runtime.
- Rust with the MSVC toolchain.
- CMake and a working Visual C++ build environment for `whisper-rs`.
- Vulkan SDK and a Vulkan-capable driver for the Vulkan build. CPU fallback remains available.
- Node.js and pnpm from the repository requirements.

## Build

CPU/debug check:

```powershell
pnpm install --frozen-lockfile
pnpm --filter whisdom-companion exec tauri build --debug
```

Vulkan build. A short target path avoids Windows CMake path-length failures:

```powershell
$env:VULKAN_SDK = "E:\VulkanSDK\1.4.357.0"
$env:CARGO_TARGET_DIR = "F:\w-tauri"

pnpm --filter whisdom-companion exec tauri build --features vulkan
```

The packaged Windows installer is produced under `companion/src-tauri/target/release/bundle/` unless `CARGO_TARGET_DIR` is set.

## Launch

Launch the executable produced by the build (for example, from the repository root):

```powershell
.\companion\src-tauri\target\debug\whisdom-companion.exe
```

If `CARGO_TARGET_DIR` is set, use the corresponding executable under that target directory. An executable or installer was not manually verified in this session.

The release executable is the same path under `release` after a non-debug build.

## Run and configuration

The Companion runs without a main window and exposes the loopback API at:

```text
GET http://127.0.0.1:8788/api/v1/health
```

Configure allowed browser origins before launch when needed:

```powershell
$env:WHISDOM_HELPER_ORIGINS = "https://whisdom.app,http://localhost:5173"
```

Runtime data:

```text
%LOCALAPPDATA%\Whisdom\Companion\
  models\
  tools\
  temp\
  logs\
  auth\
```

## Protocol v2 and web flow

1. Start the Companion; its tray icon reports that it is running.
2. Select **Desktop Companion** in Whisdom and connect it.
3. Choose files opens the native Windows picker. Single selection and native Ctrl/Shift multi-select are supported. Repeated Choose files actions append rows to the browser queue; they do not replace existing rows.
4. The browser queue supports remove and move up/move down ordering. Removal calls the Companion before removing the row. Selection, removal, and reorder controls are frozen while a job is active.
5. Starting a row sends only its opaque selection ID, language, and catalog model ID. The Companion reads the native path locally and streams progress through SSE.
6. Whisdom receives only opaque job/selection IDs, sanitized filename metadata, transcript text, and native timestamped segments.

Protocol v2 endpoints:

```text
POST   /api/v1/select-files
DELETE /api/v1/selections/{id}
POST   /api/v1/transcribe-selection
GET    /api/v1/capabilities
GET    /api/v1/progress/{job_id}
POST   /api/v1/cancel/{job_id}
```

`select-files` returns display metadata only: opaque `id`, sanitized `filename`, `size_bytes`, and optional `extension`. Selection entries live in Companion memory for 30 minutes, are single-use when started, and can be deleted before starting. Canceling the native picker returns `204 No Content`, creates no queue row, and is not an error.

Capabilities expose the Companion's native GGML model catalog, including model ID, label, quality, size, and installed state. The browser can request only a catalog model ID; model URLs, filenames, and checksums are not caller-controlled. Missing models download on demand from pinned HTTPS assets. Every redirect hop is host-allowlisted and HTTPS-validated, the response is size-limited, SHA-256-verified, and atomically finalized before use. Redirects or checksums that fail verification abort the download.

Paths and source media never leave the Companion process. The browser sends no filesystem path, URL, multipart media, or media bytes.

## Tray and startup

The tray menu provides:

- Running status.
- **Start with Windows** toggle, scoped to the current Windows user.
- **Quit**.

The Companion does not run as a SYSTEM service and does not embed the hosted Whisdom website.

## Cache clearing

Whisdom clears browser model caches first, then requests Companion cache clearing when paired. Companion cache clearing removes model, FFmpeg, and temporary job data. It refuses with `409 Conflict` while a job is active. Logs remain intact.

## Privacy and logs

Source media stays on the Windows device. The browser does not upload the selected file, submit a filesystem path, or receive an absolute path. The Companion uses the native picker as the only source of a path.

Logs are stored under:

```text
%LOCALAPPDATA%\Whisdom\Companion\logs\
```

Logs may contain sanitized route, job, phase, basename, download, and backend events. They must not contain absolute paths, pairing/access tokens, Authorization headers, transcript text, or media content.

## Licensing

Release packages must include notices for `whisper.cpp`/`whisper-rs`, the pinned BtbN GPL FFmpeg asset, and Rust dependencies according to their licenses. Pinned URLs and checksums live in `server/src/helper/models.rs`.
