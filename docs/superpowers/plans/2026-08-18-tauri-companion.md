# Optional Tauri Desktop Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional Windows Tauri tray companion that opens a native media picker for the hosted Whisdom site, transcribes the selected local path with native Whisper, and streams the existing SSE result contract without uploading media or exposing paths to the browser.

**Architecture:** Promote the current helper modules to the `whisdom-server` library and move its Axum routes into one reusable helper API module. The Tauri binary hosts that loopback API and injects one native-picker callback; `POST /api/v1/pick-and-transcribe` gets its path only from the Tauri dialog. The web app replaces multipart helper upload with this JSON endpoint, while all browser modes remain unchanged.

**Tech Stack:** Tauri 2, Rust 2021, Axum, Tokio, `tauri-plugin-dialog`, `tauri-plugin-autostart`, `whisper-rs`, FFmpeg, Vite, React 19, TypeScript 6, Vitest, Playwright.

---

## File Map

- Create `companion/package.json`: independent Tauri CLI package scripts.
- Create `companion/ui/index.html`: inert bundled frontend required by Tauri; no Whisdom product UI.
- Create `companion/src-tauri/Cargo.toml`: tray companion crate, helper library dependency, Tauri plugins, Vulkan feature forwarding.
- Create `companion/src-tauri/build.rs`: Tauri build script.
- Create `companion/src-tauri/tauri.conf.json`: tray-only Windows bundle configuration; no application window.
- Create `companion/src-tauri/capabilities/default.json`: least-privilege local capability file.
- Create `companion/src-tauri/src/main.rs`: tray, native-dialog picker callback, helper API startup, orderly quit, file logging setup.
- Create `companion/src-tauri/icons/whisdom.svg`: source icon; generate required Windows icon assets from it.
- Create `server/src/lib.rs`: exposes only reusable helper modules to the companion crate.
- Create `server/src/helper/api.rs`: versioned loopback routes, strict CORS, SSE, upload compatibility route, native-picker route, sanitized HTTP logging.
- Create `server/src/helper/runtime.rs`: creates and runs jobs from an in-process `PathBuf`; never accepts a browser path.
- Create `server/src/helper/logging.rs`: companion-safe file/terminal tracing initialization and guard ownership.
- Modify `server/src/helper/mod.rs`: export the API, runtime, and logging modules.
- Modify `server/src/helper/config.rs`: companion cache root and remove the helper upload setting only after upload compatibility is deliberately retired; this slice retains the standalone helper setting.
- Modify `server/src/helper/protocol.rs`: native-picker capability/request/response types and no-content picker-cancel response handling.
- Modify `server/src/helper/state.rs`: optional native-picker callback type held in helper state.
- Modify `server/src/bin/whisdom-helper.rs`: replace inline handlers with reusable API router; preserve legacy standalone multipart routes.
- Modify `server/Cargo.toml`: library target, route/log dependencies, public Vulkan feature reusable by the companion.
- Modify `pnpm-workspace.yaml`: add `companion` package.
- Modify `src/features/local-helper/types.ts`: picker submission result type.
- Modify `src/features/local-helper/client.ts`: replace multipart `submitJob(File, ...)` with JSON `pickAndSubmit(...)`.
- Modify `src/App.tsx`: rename mode copy to Desktop Companion, hide browser drop zone in that mode, start picker-backed single job, retain SSE/document/export flow.
- Modify `src/features/media/preflight.ts`: local-helper has no browser-selected media or browser asset requirements.
- Modify `tests/unit/local-helper.test.ts`: picker request/cancel/auth tests.
- Create `server/tests/helper_api.rs`: versioned picker endpoint contract, rejection of browser-supplied paths, CORS/auth checks using a fake picker.
- Modify `tests/e2e/whisdom.spec.ts`: companion-mode unavailable and no-browser-file UI coverage.
- Modify `server/README-helper-windows.md`: supersession/migration notes and direct companion build/run instructions.
- Create `companion/README.md`: Windows prerequisites, Vulkan short-target build commands, tray behavior, allowed origin, logging/cache location, and manual smoke-test checklist.

## Task 1: Make helper code a reusable Rust library

**Files:**

- Create: `server/src/lib.rs`
- Modify: `server/Cargo.toml`
- Modify: `server/src/helper/mod.rs`
- Modify: `server/src/bin/whisdom-helper.rs`

- [ ] **Step 1: Add a failing library compile reference.**

Create `server/src/lib.rs`:

```rust
pub mod helper;
```

Temporarily replace the binary-local module declaration:

```rust
#[path = "../helper/mod.rs"]
mod helper;
```

with:

```rust
use whisdom_server::helper;
```

Run:

```powershell
Set-Location server
cargo check --bin whisdom-helper
```

Expected: compile failure until helper modules are public enough for the binary import.

- [ ] **Step 2: Expose helper modules and the package library.**

Keep `server/src/helper/mod.rs` as explicit public exports:

```rust
pub mod api;
pub mod auth;
pub mod cache;
pub mod config;
pub mod download;
pub mod ffmpeg;
pub mod logging;
pub mod protocol;
pub mod runtime;
pub mod state;
pub mod transcribe;
```

In `server/Cargo.toml`, retain both binary targets and add a library section only if Cargo does not infer it:

```toml
[lib]
name = "whisdom_server"
path = "src/lib.rs"
```

Do not expose cloud routes, cloud configuration, or server auth through the library.

- [ ] **Step 3: Run the library and legacy helper checks.**

Run:

```powershell
Set-Location server
cargo check --lib
cargo check --bin whisdom-helper
```

Expected: both pass. No behavior change yet.

## Task 2: Extract path-backed transcription runtime

**Files:**

- Create: `server/src/helper/runtime.rs`
- Modify: `server/src/helper/state.rs`
- Modify: `server/src/bin/whisdom-helper.rs`
- Test: `server/tests/helper_api.rs`

- [ ] **Step 1: Write the focused request-shape test.**

Create `server/tests/helper_api.rs` with a serialization test that will use the request type added in Task 3:

```rust
#[test]
fn picker_request_rejects_a_browser_supplied_path() {
    let parsed = serde_json::from_str::<PickAndTranscribeRequest>(
        r#"{"language":"vi","model":"ggml-large-v3-turbo-q5_0","path":"C:\\secret.wav"}"#,
    );
    assert!(parsed.is_err());
}
```

Run:

```powershell
Set-Location server
cargo test --test helper_api picker_request_rejects_a_browser_supplied_path
```

Expected: fails because the request type does not exist.

- [ ] **Step 2: Add a picker callback boundary to `HelperState`.**

Use the already-installed `futures` crate rather than adding `async-trait`:

```rust
pub type NativeFilePicker = Arc<dyn Fn() -> futures::future::BoxFuture<'static, Result<Option<std::path::PathBuf>, HelperError>> + Send + Sync>;

pub struct HelperState {
    pub config: HelperConfig,
    pub auth: HelperAuth,
    pub cache: HelperCache,
    pub queue: HelperQueue,
    pub model: SharedModel,
    pub native_file_picker: Option<NativeFilePicker>,
}
```

Set `native_file_picker: None` in the standalone helper binary. The browser never supplies a path; only a companion process can set this callback.

- [ ] **Step 3: Move job creation to a path-only runtime function.**

Create `server/src/helper/runtime.rs` with these public functions:

```rust
pub async fn start_path_job(
    state: Arc<HelperState>,
    input: PathBuf,
    filename: String,
    language: Option<String>,
) -> Result<String, HelperError>;

pub async fn run_transcription(
    state: &Arc<HelperState>,
    job: &Arc<tokio::sync::Mutex<HelperJob>>,
    id: &str,
    input: &Path,
    language: Option<String>,
    cancel_rx: tokio::sync::watch::Receiver<bool>,
    guard: JobGuard,
) -> Result<(), HelperError>;
```

`start_path_job` must:

1. call `tokio::fs::metadata(&input)` and reject missing/non-file input;
2. derive `filename` with `Path::file_name`, replace no path data in status;
3. create an opaque UUID job, queue/publish it, acquire the existing busy guard inside the spawned task;
4. run FFmpeg against the selected original path and write only output WAV under `%LOCALAPPDATA%\Whisdom\Companion\temp\<job-id>`;
5. delete only the companion temp job directory on terminal paths;
6. never copy, rename, delete, or log the selected original file.

Refactor the existing multipart route to stage upload bytes under its temp directory then call `start_path_job`. Preserve the legacy endpoint only for `whisdom-helper.exe` compatibility.

- [ ] **Step 4: Make the focused test pass.**

Add `#[serde(deny_unknown_fields)]` to the future picker request type. Then run:

```powershell
Set-Location server
cargo test --test helper_api picker_request_rejects_a_browser_supplied_path
```

Expected: PASS.

## Task 3: Build one versioned helper API with native picker support

**Files:**

- Create: `server/src/helper/api.rs`
- Modify: `server/src/helper/protocol.rs`
- Modify: `server/src/helper/mod.rs`
- Modify: `server/src/bin/whisdom-helper.rs`
- Test: `server/tests/helper_api.rs`

- [ ] **Step 1: Add protocol types and test their exact JSON shape.**

In `server/src/helper/protocol.rs`, add:

```rust
#[derive(Debug, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PickAndTranscribeRequest {
    pub language: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct PickAndTranscribeResponse {
    pub job_id: String,
    pub filename: String,
}
```

Extend `CapabilitiesResponse` with:

```rust
pub native_picker: bool,
```

Add tests asserting:

```rust
assert_eq!(response["job_id"], "job-123");
assert_eq!(response["filename"], "meeting.mkv");
assert!(response.get("path").is_none());
```

- [ ] **Step 2: Move the shared routes from the binary into `api.rs`.**

Create:

```rust
pub fn router(state: Arc<HelperState>) -> axum::Router
```

Move health, pair, capabilities, cache status/clear, progress, cancel, multipart transcribe, phase/error helpers, and strict CORS into this module. Mount all aliases:

```text
/api/*       legacy standalone compatibility
/api/v1/*    preferred web API
/v1/*        REST alias
```

Add the picker route to all versioned prefixes only:

```text
POST /api/v1/pick-and-transcribe
POST /v1/pick-and-transcribe
```

Keep the legacy multipart `POST /api/transcribe` and its `/api/v1`/`/v1` aliases while the standalone binary is shipped.

- [ ] **Step 3: Implement picker endpoint semantics.**

The handler must follow this exact outline:

```rust
state.auth.authorize(&headers).await?;
let request: PickAndTranscribeRequest = payload.0;
validate_model(request.model.as_deref())?;
let picker = state.native_file_picker.as_ref().ok_or(HelperError::NotFound)?;
let Some(path) = picker().await? else {
    return Ok(StatusCode::NO_CONTENT.into_response());
};
let filename = path.file_name()
    .and_then(|name| name.to_str())
    .filter(|name| !name.is_empty())
    .ok_or_else(|| HelperError::BadRequest("selected media has no valid filename".into()))?
    .to_owned();
let job_id = runtime::start_path_job(state.clone(), path, filename.clone(), request.language).await?;
Ok(Json(PickAndTranscribeResponse { job_id, filename }).into_response())
```

Do not deserialize `PathBuf`, `file`, `url`, multipart fields, or any user-chosen directory. A cancelled picker returns `204 No Content`; it must not create a queue entry.

- [ ] **Step 4: Add CORS and API contract tests.**

Use a fake picker callback returning a temporary `meeting.mkv` path. Test:

```text
OPTIONS /api/v1/pick-and-transcribe
  Origin: http://localhost:5173
  Access-Control-Request-Headers: authorization,content-type
=> 200 plus exact allowed origin, credentials, POST, Authorization, Content-Type

POST picker endpoint without token/origin => 401
POST valid request with "path" key => 400
POST valid request and picker cancellation => 204
POST valid request and fake selection => 200, job_id + basename only
GET /api/v1/capabilities => native_picker true/false matches state
```

Use a temporary file and cancel its returned job immediately. Do not trigger model/FFmpeg downloads in tests.

- [ ] **Step 5: Replace the standalone binary body with the reusable router.**

`server/src/bin/whisdom-helper.rs` should only construct `HelperConfig`, `HelperAuth`, `HelperCache`, `HelperState { native_file_picker: None }`, initialize logs, bind loopback, and call:

```rust
axum::serve(listener, helper::api::router(state)).await?;
```

Run:

```powershell
Set-Location server
cargo test --test helper_api
cargo check --bin whisdom-helper
```

Expected: PASS.

## Task 4: Add safe companion logging

**Files:**

- Create: `server/src/helper/logging.rs`
- Modify: `server/Cargo.toml`
- Modify: `server/src/bin/whisdom-helper.rs`
- Create: `companion/src-tauri/src/main.rs` (initial scaffold only)

- [ ] **Step 1: Add a log initialization test.**

Add a test in `server/src/helper/logging.rs` that creates a temporary root, initializes a test writer rather than the global subscriber, writes a sanitized event, and asserts the output file contains the event message but not a token/path fixture.

- [ ] **Step 2: Implement a daily file writer.**

Add `tracing-appender` to `server/Cargo.toml`. Implement:

```rust
pub struct HelperLogGuard(tracing_appender::non_blocking::WorkerGuard);

pub fn init(config: &HelperConfig) -> Result<HelperLogGuard, HelperError>;
```

Write UTF-8 JSON tracing output to `config.logs_dir()` and terminal output when one exists. Use an `EnvFilter` default that includes `whisdom_server::helper=info,tower_http=info`; honor `RUST_LOG` for diagnostics. Hold `HelperLogGuard` for the full process lifetime.

- [ ] **Step 3: Add sanitized lifecycle events.**

Log only:

```text
helper started / bound port
request status and route template
picker opened / cancelled / selection accepted
job id + basename + lifecycle phase
model download state
FFmpeg exit status
Vulkan selected or CPU fallback
sanitized error kind
```

Never log absolute source path, request bodies, transcript content, pairing token, bearer token, or HTTP Authorization header. Configure `TraceLayer::new_for_http()` without request-header/body inclusion.

- [ ] **Step 4: Verify.**

Run:

```powershell
Set-Location server
cargo test helper::logging
cargo check --lib --bin whisdom-helper
```

Expected: PASS.

## Task 5: Scaffold the optional Tauri tray companion

**Files:**

- Modify: `pnpm-workspace.yaml`
- Create: `companion/package.json`
- Create: `companion/ui/index.html`
- Create: `companion/src-tauri/Cargo.toml`
- Create: `companion/src-tauri/build.rs`
- Create: `companion/src-tauri/tauri.conf.json`
- Create: `companion/src-tauri/capabilities/default.json`
- Create: `companion/src-tauri/icons/whisdom.svg`
- Create: `companion/src-tauri/src/main.rs`

- [ ] **Step 1: Add the workspace and package scripts.**

Update `pnpm-workspace.yaml`:

```yaml
packages:
  - worker
  - companion
```

Create `companion/package.json`:

```json
{
  "name": "whisdom-companion",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build",
    "build:debug": "tauri build --debug"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.11.0"
  }
}
```

Create `companion/ui/index.html` with only a static `Whisdom Companion is running.` document. It is a packaging requirement, not an embedded web product.

- [ ] **Step 2: Configure the Windows-only tray app.**

Create `companion/src-tauri/Cargo.toml`:

```toml
[package]
name = "whisdom-companion"
version = "0.0.1"
edition = "2021"

[build-dependencies]
tauri-build = "2"

[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-dialog = "2"
tauri-plugin-autostart = "2"
whisdom-server = { path = "../../server" }
tokio = { version = "1", features = ["sync"] }
futures = "0.3"

[features]
default = []
vulkan = ["whisdom-server/vulkan"]
```

Create `build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

Create `tauri.conf.json` with an empty `app.windows` array, `build.frontendDist` set to `../ui`, Windows NSIS as the only bundle target, and generated icon paths. Do not configure remote capability URLs, `withGlobalTauri`, shell, filesystem, or an updater.

- [ ] **Step 3: Add only required capabilities.**

Create `capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "desktop-local-only",
  "windows": [],
  "permissions": [
    "core:default",
    "dialog:default",
    "autostart:allow-enable",
    "autostart:allow-disable",
    "autostart:allow-is-enabled"
  ]
}
```

This capability has no `remote` entry. The hosted page communicates only with Axum loopback endpoints, never Tauri IPC.

- [ ] **Step 4: Add the tray-only app and callback.**

In `main.rs`, install dialog/autostart plugins, initialize logging, construct the same `HelperState` as the standalone binary, and set `native_file_picker` with a closure that:

```rust
let (send, receive) = tokio::sync::oneshot::channel();
app_handle.dialog()
    .file()
    .add_filter("Media", &["mp3", "m4a", "wav", "flac", "ogg", "mp4", "mkv", "mov", "webm"])
    .pick_file(move |picked| {
        let path = match picked {
            Some(tauri_plugin_dialog::FilePath::Path(path)) => Some(path),
            _ => None,
        };
        let _ = send.send(path);
    });
receive.await.map_err(|_| HelperError::BadRequest("native picker closed unexpectedly".into()))
```

Use `tauri_plugin_dialog::DialogExt`. The callback runs on Tauri's main event loop; it must not use `blocking_pick_file`.

Build a `Menu` with status (disabled), `Open Whisdom`, `Start with Windows`, and `Quit`. `Open Whisdom` calls `tauri_plugin_opener::open_url` only after adding that single plugin/dependency; otherwise omit the menu item in this first code pass. The startup item toggles `app.autolaunch().enable()/disable()` and refreshes its checked state. `Quit` calls `app.exit(0)`.

Start the Axum listener through `tauri::async_runtime::spawn`. Bind exactly `Ipv4Addr::LOCALHOST` and configured port. On bind failure, emit a sanitized error, show a native error dialog, then exit rather than quietly running a broken companion.

- [ ] **Step 5: Generate package icons and verify the scaffold.**

Create an original monochrome `whisdom.svg` with the wordmark-free `W` glyph. Generate Windows icon assets:

```powershell
Set-Location companion
pnpm exec tauri icon .\src-tauri\icons\whisdom.svg
pnpm exec tauri build --debug --features vulkan
```

Use the short target path for Vulkan:

```powershell
$env:VULKAN_SDK = "E:\VulkanSDK\1.4.357.0"
$env:CARGO_TARGET_DIR = "F:\w-tauri"
pnpm exec tauri build --debug --features vulkan
```

Expected: a Windows debug companion package/binary is built. It opens no main window and displays one tray icon.

## Task 6: Move the website to native-picker submission

**Files:**

- Modify: `src/features/local-helper/types.ts`
- Modify: `src/features/local-helper/client.ts`
- Modify: `src/App.tsx`
- Modify: `src/features/media/preflight.ts`
- Test: `tests/unit/local-helper.test.ts`
- Test: `tests/e2e/whisdom.spec.ts`

- [ ] **Step 1: Replace multipart types and client method.**

Add:

```ts
export type HelperPickAndTranscribeResponse = {
  job_id: string
  filename: string
}
```

Delete `submitJob(file: File, language, modelId)` and add:

```ts
async pickAndSubmit(
  language: LanguageCode,
  modelId: string
): Promise<{ jobId: string; filename: string } | null> {
  const baseUrl = await this.requireBaseUrl()
  const response = await fetch(`${baseUrl}${API_PREFIX}/pick-and-transcribe`, {
    method: "POST",
    headers: { ...this.authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ language, model: modelId }),
    signal: AbortSignal.timeout(30_000),
  })
  if (response.status === 204) return null
  if (!response.ok) throw new Error(`Helper picker failed: ${response.status}`)
  const data = (await response.json()) as HelperPickAndTranscribeResponse
  if (!data.job_id || !data.filename) throw new Error("Helper returned an invalid picker job.")
  return { jobId: data.job_id, filename: data.filename }
}
```

Do not send a `File`, `FormData`, MIME type, local path, or cloud token.

- [ ] **Step 2: Write client tests before running the app integration.**

Add tests that assert:

```text
POST http://127.0.0.1:8788/api/v1/pick-and-transcribe
Authorization: Bearer local-token
Content-Type: application/json
Body exactly: {"language":"vi","model":"ggml-large-v3-turbo-q5_0"}
```

Also assert `204` resolves `null`, a malformed response rejects, and no test request contains `FormData`, a file name, a local path, or a Google token.

Run:

```powershell
pnpm exec vitest run tests/unit/local-helper.test.ts
```

Expected: PASS.

- [ ] **Step 3: Replace the local-helper `App.tsx` branch.**

Create a `transcribeWithCompanion(runSettings): Promise<TranscriptDocument | null>` helper near the existing server/helper work. It must:

1. call `localHelperClient.connect()`;
2. call `pickAndSubmit(resolveTranscriptionLanguage(...), "ggml-large-v3-turbo-q5_0")` from the user click path;
3. return `null` immediately on `204` and reset state to `idle` without an error toast;
4. subscribe through the existing `subscribeProgress` parser;
5. make a `TranscriptDocument` from `submission.filename`, returned `text`, and returned native `segments`;
6. use `mode: "local-helper"`, preserve SRT/VTT segments, save/history/result-dialog behavior, and never call `analyzeMediaFile`, `convertWithFfmpeg`, or `transcribeLocally`;
7. unsubscribe on every terminal state.

Change `startTranscription` to route companion mode before its `if (!file || !analysis)` guard:

```ts
if (settingsRef.current.mode === "local-helper") {
  await transcribeWithCompanion(settingsRef.current)
  return
}
if (!file || !analysis) return
```

Set `canStart` to permit the companion action without a browser-selected file:

```ts
const canStart =
  !isBusy(jobState) &&
  (settings.mode === "local-helper" ||
    (file && analysis && (settings.mode !== "server" || serverSelectionReady)))
```

Set `canStartAll` false in companion mode. One picker request selects one source file, so batch companion selection is explicitly out of scope.

- [ ] **Step 4: Remove browser-file UI from companion mode.**

When `settings.mode === "local-helper"`, do not render `DropZone`, hidden `<input type="file">`, or `FileQueuePanel`. Render a restrained existing `Card` instead, using EN/VI copy:

```text
Desktop Companion
Choose a media file in the Windows dialog when transcription starts. The file stays on this device.
```

Change visible processing-mode labels/details in both `COPY.en` and `COPY.vi` from Local Helper to Desktop Companion. Keep stored mode value `local-helper` unchanged for storage compatibility.

- [ ] **Step 5: Make preflight truthful.**

In `analyzeMediaFile`, when the selected processing mode is `local-helper`, return no browser model/FFmpeg assets. This only preserves correct behavior for legacy saved UI state; the normal companion UI no longer calls preflight.

- [ ] **Step 6: Add browser tests.**

In `tests/e2e/whisdom.spec.ts`, cover:

```text
Desktop Companion mode shows privacy/native-dialog guidance.
Browser drop zone/input are absent in Desktop Companion mode.
Start is enabled without an uploaded browser file in Desktop Companion mode.
Companion unavailable produces a localized recoverable error.
```

In component/unit tests, mock a completed SSE event and assert `sourceName` equals only `filename`, with no path data written to transcript storage.

Run:

```powershell
pnpm typecheck
pnpm exec vitest run tests/unit/local-helper.test.ts tests/unit/compatibility.test.ts
pnpm test:e2e
```

Expected: PASS.

## Task 7: Document migration and validate production boundaries

**Files:**

- Modify: `server/README-helper-windows.md`
- Create: `companion/README.md`
- Modify: `docs/superpowers/specs/2026-08-18-tauri-companion-design.md` only to add the final build command and status after validation

- [ ] **Step 1: Update helper documentation.**

State that `whisdom-helper.exe` remains a compatibility upload helper, while the recommended Windows installation is `Whisdom Companion`. Document that companion mode has no file-upload endpoint from the web app and uses only `POST /api/v1/pick-and-transcribe` plus SSE.

- [ ] **Step 2: Document companion operations.**

`companion/README.md` must include:

```text
Windows: WebView2, Rust/MSVC, CMake, Vulkan SDK/driver for Vulkan build
Build target workaround: CARGO_TARGET_DIR=F:\w-tauri
Runtime root: %LOCALAPPDATA%\Whisdom\Companion
Allowed origins: WHISDOM_HELPER_ORIGINS
Health: GET /api/v1/health
Logs: %LOCALAPPDATA%\Whisdom\Companion\logs
```

Include native picker cancel behavior, tray startup toggle, cache clear behavior, source media privacy boundary, and the statement that paths/tokens/transcript text are not written to logs.

- [ ] **Step 3: Run all required checks.**

Run from repository root:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Run Rust checks:

```powershell
Set-Location server
cargo fmt --check
cargo test --lib --bin whisdom-helper --test helper_api -j 1
cargo check --bin whisdom-helper --features vulkan

Set-Location ..\companion
$env:VULKAN_SDK = "E:\VulkanSDK\1.4.357.0"
$env:CARGO_TARGET_DIR = "F:\w-tauri"
pnpm exec tauri build --debug --features vulkan
```

Finally:

```powershell
Set-Location ..
git diff --check
```

Expected: every command passes. Remove generated `test-results/.last-run.json` if present. Do not commit, sign, package for release, or modify release evidence unless explicitly requested.

- [ ] **Step 4: Run Windows manual acceptance checks.**

From a clean test root set by `WHISDOM_HELPER_ROOT`, verify:

```text
1. Companion starts with no visible main window and one tray icon.
2. /api/v1/health returns available; unlisted Origin cannot pair or invoke picker.
3. Pair once; a valid web click opens a native file dialog.
4. Picker cancel returns 204, no job, no error toast.
5. Selecting an MKV never uploads media or exposes C:\ paths in DevTools/transcript/log files.
6. First run downloads pinned model and FFmpeg; second run reuses both.
7. Vietnamese result has native segments and exports valid SRT/VTT cues.
8. Vulkan model initialization runs when available; unavailable Vulkan falls back to CPU.
9. SSE reaches complete/error/cancelled without an unresolved UI state.
10. Browser cache clear calls paired companion cache clear; busy work returns a visible partial result.
11. Tray startup toggle survives restart; Quit releases port 8788.
12. Browser local WebGPU/WASM and server modes still work after companion installation.
```

Record observed commands/outcomes in the release notes only if the user later requests release packaging.
