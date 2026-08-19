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

Debug executable with the validated short target path:

```powershell
& "F:\w-tauri\debug\whisdom-companion.exe"
```

From the repository root without `CARGO_TARGET_DIR`, launch:

```powershell
.\companion\src-tauri\target\debug\whisdom-companion.exe
```

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

## Web flow

1. Start the Companion; its tray icon reports that it is running.
2. Select **Desktop Companion** in Whisdom.
3. Press Start. The Companion opens the native Windows media picker.
4. Pick a file. The Companion transcribes its local path and streams progress through SSE.
5. Whisdom receives only the opaque job ID, selected basename, transcript text, and native timestamped segments.

The web request is:

```text
POST /api/v1/pick-and-transcribe
GET  /api/v1/progress/{job_id}
POST /api/v1/cancel/{job_id}
```

Picker cancellation returns `204 No Content`, creates no job, and is not an error.

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

Release packages must include notices for `whisper.cpp`/`whisper-rs`, the pinned BtbN GPL FFmpeg asset, and Rust dependencies according to their licenses. Pinned URLs and checksums live in `server/src/helper/config.rs`.
