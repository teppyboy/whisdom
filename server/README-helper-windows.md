# Whisdom Windows Local Helper and Companion

`Whisdom Companion` is the recommended Windows integration. It runs as an optional Tauri tray app, opens the native Windows media picker, and transcribes the selected path locally with native Whisper or Parakeet through sherpa-onnx.

`whisdom-helper.exe` remains a legacy standalone compatibility binary. Its multipart loopback API still accepts browser-uploaded media, but new web flows should use the Companion picker API instead. Companion mode sends no media upload and no filesystem path from the browser.

## Companion protocol v2

The hosted web app uses the paired Companion through:

```text
POST   /api/v1/select-files
DELETE /api/v1/selections/{id}
POST   /api/v1/transcribe-selection
GET    /api/v1/capabilities
GET    /api/v1/progress/{job_id}
POST   /api/v1/cancel/{job_id}
```

`select-files` opens the native Windows picker and returns sanitized display metadata for one or many selected files. Native single-select and Ctrl/Shift multi-select are supported. Repeated requests append to the browser queue. Canceling returns `204 No Content`.

Each selection is represented by an opaque in-memory ID. Entries expire after 30 minutes, are consumed on start, and can be removed with `DELETE /api/v1/selections/{id}`. The browser queue can remove entries or reorder them; it sends only the selected ID when starting a row. Selection, removal, and reorder controls are disabled while a job is active.

`POST /api/v1/transcribe-selection` accepts only a selection ID, optional language, and known native model ID:

```json
{
  "selection_id": "opaque-selection-id",
  "language": "vi",
  "model": "ggml-base-q5_1"
}
```

Capabilities return the native model catalog and installed state. Parakeet uses sherpa-onnx 1.13.6. Ordinary builds use its CPU runtime. A Windows build with the `directml` feature attempts DirectML first, but only when `SHERPA_ONNX_LIB_DIR` points to a separately built sherpa-onnx library compiled with `SHERPA_ONNX_ENABLE_DIRECTML`; the standard crates.io prebuilt archive is not DirectML-capable. If DirectML recognizer creation fails, Parakeet falls back to CPU. Because sherpa-onnx 1.13.6 can silently fall back to CPU when its DirectML provider is unavailable, capabilities report `cpu` for Parakeet until a runtime provider query can prove DirectML. The existing `vulkan` feature applies to Whisper only; no Parakeet Vulkan runtime is currently linked. The catalog is pinned in the helper; callers cannot provide model URLs, filenames, checksums, or paths. A selected model downloads on demand from its pinned HTTPS asset. Redirects are traversed manually with per-hop host allowlisting, HTTPS checks, bounded size, SHA-256 verification, and atomic cache finalization.

Paths and source media never leave the Companion process. The browser sends no filesystem path, URL, multipart media, or media bytes.

The legacy multipart `POST /api/v1/transcribe` (and `/v1/transcribe`, `/api/transcribe`) remains available for standalone `whisdom-helper.exe` compatibility. It accepts browser-uploaded media, defaults to `ggml-large-v3-turbo-q5_0` when no model is supplied, and accepts only model IDs from the same native catalog. New Companion flows must use protocol v2 selection/start endpoints.

## Standalone helper build

CPU-only development build:

```powershell
cd server
cargo build --release --bin whisdom-helper
```

Vulkan build:

1. Install the Vulkan SDK.
2. Set `VULKAN_SDK` to the SDK installation directory.
3. Ensure the Vulkan loader/driver is installed.
4. Build:

```powershell
cd server
cargo build --release --bin whisdom-helper --features vulkan
```

A Vulkan-enabled helper attempts Whisper Vulkan model initialization. If it fails, the job errors; it does not silently fall back to CPU. CPU behavior requires a CPU-built helper.

## Run

```powershell
$env:WHISDOM_HELPER_ORIGINS = "https://whisdom.tretrauit.me,https://whisdom.app,http://localhost:5173"
.\target\release\whisdom-helper.exe
```

Default endpoint: `http://127.0.0.1:8788`.

Versioned REST endpoints are available under both `/v1/*` and `/api/v1/*`. Health checks:

```text
GET /v1/health
GET /api/v1/health
```

The legacy `/api/*` routes remain available for compatibility. The helper never binds LAN interfaces. Pairing requires a request Origin in the configured allowlist and produces a per-user local token.

## Runtime cache

```text
%LOCALAPPDATA%\Whisdom\Helper\
  models\
  tools\
  temp\
  logs\
  auth\
```

The selected GGML model downloads from its pinned Hugging Face revision on first use. Companion mode chooses from the capability-backed native catalog; legacy multipart transcription defaults to `ggml-large-v3-turbo-q5_0` when no model is supplied. BtbN FFmpeg downloads only when the input requires conversion. Downloads are checksum-verified before use.

## Standalone helper installation modes

These scripts apply to the legacy `whisdom-helper.exe` only. The Companion is packaged separately as a Tauri Windows application.

- Per-user: install under `%LOCALAPPDATA%\Programs\Whisdom Helper\`; no Administrator required.
- Machine-wide: install under `C:\Program Files\Whisdom Helper\`; Administrator required.
- Startup is optional and user-scoped. The helper is not installed as a SYSTEM Windows Service.
- Manual launch remains supported.

Install scripts:

```powershell
.\scripts\install-whisdom-helper.ps1 -BinaryPath .\whisdom-helper.exe
.\scripts\install-whisdom-helper.ps1 -BinaryPath .\whisdom-helper.exe -EnableStartup
.\scripts\install-whisdom-helper.ps1 -BinaryPath .\whisdom-helper.exe -MachineWide
.\scripts\uninstall-whisdom-helper.ps1
```

Installer work must preserve the per-user cache boundary even for machine-wide binaries.

## Cache clearing

The website clears browser model caches first, then calls the paired helper's `/api/cache/clear`. The helper refuses with `409 Conflict` while a job is active, deletes model/FFmpeg/temp caches, and keeps logs.

## Licenses

The release must ship license/source notices for:

- `whisper.cpp` / `whisper-rs`.
- BtbN FFmpeg `win64-gpl` asset and the applicable GPL license/source offer.
- Rust dependencies as required by their licenses.

Pinned assets are defined in `server/src/helper/models.rs`. Do not replace them with floating `latest` URLs without updating the checksum and release documentation. DirectML builds must document the exact custom sherpa-onnx commit, library directory, DirectML/ONNX Runtime package, and Windows driver test matrix.
