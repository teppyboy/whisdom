# Whisdom Companion

Optional Windows tray companion for the hosted Whisdom web app. The web app remains the primary product; the Companion adds native Windows file picking and local native Whisper transcription.

## Prerequisites

- Windows 10/11.
- WebView2 runtime.
- Rust with the MSVC toolchain.
- CMake and a working Visual C++ build environment for `whisper-rs`.
- Optional Vulkan SDK and a Vulkan-capable driver for the Whisper Vulkan build.
- Optional custom sherpa-onnx DirectML build for Parakeet acceleration. The standard sherpa-onnx crates.io package is CPU-only.
- Node.js and pnpm from the repository requirements.

## Build

Build the Companion installer and portable ZIP locally from the repository root with Python:

```powershell
python scripts/build_companion.py
```

The default enables Vulkan for whisper.cpp. Add DirectML after building the custom sherpa-onnx bundle. Use `--cpu-only` when GPU tooling is unavailable:

```powershell
python scripts/build_companion.py --vulkan --directml --target-dir F:\w-tauri
python scripts/build_companion.py --cpu-only
```

On Windows, the combined build requires the Vulkan SDK, CMake, Ninja, and the custom DirectML bundle. On Linux and macOS, the script selects the native Tauri bundle for that host; DirectML remains Windows-only.

Artifacts are written to `dist\companion\`. The script restores `tauri.conf.json` after injecting the exact runtime library map required by the local bundle.

CPU/debug check:

```powershell
pnpm install --frozen-lockfile
pnpm --filter whisdom-companion exec tauri build --debug
```

Vulkan build for Whisper. A short target path avoids Windows CMake path-length failures:

```powershell
$env:VULKAN_SDK = "E:\VulkanSDK\1.4.357.0"
$env:CARGO_TARGET_DIR = "F:\w-tauri"

pnpm --filter whisdom-companion exec tauri build --features vulkan
```

DirectML Parakeet build. The repository pins sherpa-onnx `v1.13.6` at commit `1cb484af5e69d3c7803c1eb0b3b5ab8041e0e911`. From a Windows x64 Developer PowerShell with CMake and MSVC:

```powershell
.\scripts\build-sherpa-directml.ps1
$env:SHERPA_ONNX_LIB_DIR = (Resolve-Path .\native\sherpa-directml\lib)
pnpm --filter whisdom-companion exec tauri build --features directml
```

The script uses sherpa's pinned DirectML recipe (ONNX Runtime DirectML `1.14.1`, Microsoft.AI.DirectML `1.15.0`), builds shared libraries, disables unrelated components, installs the runtime, verifies the DLL set, and writes `native/sherpa-directml/manifest.json`. The Tauri bundle resource glob includes the generated `bin/*.dll` files beside the executable. Do not set `SHERPA_ONNX_LIB_DIR` to a system ONNX Runtime directory.

The packaged Windows installer is produced under `companion/src-tauri/target/release/bundle/` unless `CARGO_TARGET_DIR` is set. `scripts/build_companion.py --cpu-only` builds CPU-only; `scripts/build_companion.py --directml` requires the generated `native/sherpa-directml` bundle and packages its exact DLL set.

## Launch

Launch the executable produced by the build (for example, from the repository root):

```powershell
.\companion\src-tauri\target\debug\whisdom-companion.exe
```

If `CARGO_TARGET_DIR` is set, use the corresponding executable under that target directory. Verify the selected provider from the Companion log: `backend=directml` means the DirectML bundle was selected and recognizer construction succeeded; `Parakeet DirectML initialization failed; falling back to CPU` means CPU. Do not remove a directly imported DLL to test fallback: Windows may fail before Rust starts. Use a separate test bundle with the DirectML feature disabled, or a test-only native probe that returns initialization failure. The installer/real GPU transcription still requires Windows x64 validation with compatible DirectX 12 hardware. After downloading the pinned Parakeet archive, run `.\scripts\smoke-test-sherpa-directml.ps1 -ModelDir <extracted-model-directory> -WavPath <small-wav>`; success prints `directml_recognizer=create_ok` and `transcription=ok`.

The release executable is the same path under `release` after a non-debug build.

## Updates

When Desktop Companion is paired with Whisdom, the web app can check for a new signed release and start the update. The Companion downloads the signed NSIS updater, verifies its signature, installs it, then Windows relaunches the updated app. Updates require the release signing key configured in CI as `TAURI_SIGNING_PRIVATE_KEY`; never commit that key.

## Run and configuration

The Companion runs without a main window and exposes the loopback API at:

```text
GET http://127.0.0.1:8788/api/v1/health
```

Configure allowed browser origins before launch when needed:

```powershell
$env:WHISDOM_HELPER_ORIGINS = "https://whisdom.tretrauit.me,https://whisdom.app,http://localhost:5173"
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

Capabilities expose the Companion's native model catalog, including model ID, label, quality, size, engine, supported languages, active backend, and installed state. Parakeet first creates a sherpa-onnx recognizer with provider `directml` when the DirectML feature is compiled; if that recognizer returns null, the partial runtime is discarded and a fresh provider `cpu` recognizer is created. sherpa-onnx 1.13.6 exposes no active-provider query, so `directml` means the verified DirectML bundle was selected and recognizer construction succeeded; it is not a low-level execution-provider trace. sherpa-onnx configures DirectML with sequential execution and disabled memory patterns; the Companion's existing single-job gate serializes inference. The existing `vulkan` feature applies to Whisper only and does not make Parakeet Vulkan-capable. The browser can request only a catalog model ID; model URLs, filenames, and checksums are not caller-controlled. Missing models download on demand from pinned HTTPS assets. Every redirect hop is host-allowlisted and HTTPS-validated, the response is size-limited, SHA-256-verified, and atomically finalized before use. Redirects or checksums that fail verification abort the download.

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

Release packages must include notices for `whisper.cpp`/`whisper-rs`, sherpa-onnx/ONNX Runtime, the pinned Parakeet model (CC-BY-4.0), the pinned BtbN GPL FFmpeg asset, and Rust dependencies according to their licenses. Pinned URLs and checksums live in `server/src/helper/models.rs`. DirectML builds require a separately reviewed custom sherpa-onnx artifact; do not claim DirectML support for ordinary CPU packages.
