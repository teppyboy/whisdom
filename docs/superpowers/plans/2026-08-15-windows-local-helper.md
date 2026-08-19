# Windows Local Rust Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional Windows-local Rust helper that runs native `whisper.cpp` with Vulkan-first/CPU fallback, downloads the GGML model and BtbN FFmpeg on demand, streams native timestamped results, and participates in website cache clearing.

**Architecture:** Extend the existing Rust transcription server with a separate helper binary target and helper-only modules. Keep cloud auth out of the helper; use loopback binding, Origin validation, and a per-user pairing token. Add a frontend `local-helper` mode that reuses the existing server job/SSE result contract and falls back explicitly to browser-local processing.

**Tech Stack:** Rust 2021, Axum, Tokio, `whisper-rs`, reqwest, SHA-256 hashing, zip extraction, Vite/React/TypeScript, existing SSE and transcript segment contracts.

---

## File Map

- Create `server/src/bin/whisdom-helper.rs`: helper process entrypoint, loopback server, local config, startup mode.
- Create `server/src/helper/mod.rs`: helper state and module exports.
- Create `server/src/helper/config.rs`: per-user paths, port, origin, pinned asset metadata.
- Create `server/src/helper/auth.rs`: pairing token generation, persistence, constant-time comparison, Origin checks.
- Create `server/src/helper/cache.rs`: cache status, busy guard, safe deletion.
- Create `server/src/helper/download.rs`: bounded streaming downloads and SHA-256 verification.
- Create `server/src/helper/ffmpeg.rs`: pinned BtbN archive download, safe extraction, executable verification.
- Create `server/src/helper/protocol.rs`: health, capabilities, pairing, cache JSON types.
- Create `server/src/routes/helper.rs`: local-only pairing, health, capabilities, cache endpoints.
- Modify `server/Cargo.toml`: helper binary dependencies/features.
- Modify `server/src/routes/mod.rs`: helper route exports.
- Modify `server/src/pipeline/run.rs`: ensure helper can run local file input without cloud-only assumptions.
- Modify `src/features/transcription/types.ts`: add `local-helper` processing mode.
- Create `src/features/local-helper/types.ts`: helper protocol types.
- Create `src/features/local-helper/client.ts`: discovery, pairing, transcription, SSE, cache operations.
- Modify `src/features/storage/cleanup.ts`: browser + helper cache coordination.
- Modify `src/App.tsx`: mode option, helper status, helper transcription branch, bilingual copy, cache result.
- Modify `src/features/media/preflight.ts`: helper mode avoids browser model/ffmpeg assets.
- Modify `src/features/storage/compatibility.ts`: accept the new mode in the compatibility allowlist.
- Create/modify `tests/unit/local-helper.test.ts`: protocol and cache client behavior.
- Create/modify `server/tests/helper.rs` or helper module tests: token, path, checksum, cache behavior.
- Modify `tests/e2e/whisdom.spec.ts`: helper unavailable and cache-clear fallback coverage.
- Add release documentation under `server/README.md` for Windows helper build/install, asset pins, and licenses.

---

### Task 1: Add helper crate target and configuration boundary

**Files:**

- Modify: `server/Cargo.toml`
- Create: `server/src/helper/mod.rs`
- Create: `server/src/helper/config.rs`
- Create: `server/src/bin/whisdom-helper.rs`

- [ ] **Step 1: Add required dependencies and binary target.**

Add `sha2`, `hex`, `zip`, and `url` dependencies. Keep the existing server binary unchanged. Add a `[[bin]]` entry named `whisdom-helper` pointing at `src/bin/whisdom-helper.rs`. Keep Vulkan behind the existing `vulkan` feature and document that Windows helper release builds use `--features vulkan`.

- [ ] **Step 2: Implement deterministic per-user paths.**

`HelperConfig::from_env()` must resolve:

```text
WHISDOM_HELPER_PORT       default 8788
WHISDOM_HELPER_ORIGINS    default https://whisdom.app,http://localhost:5173
WHISDOM_HELPER_ROOT       default %LOCALAPPDATA%/Whisdom/Helper
WHISDOM_HELPER_MODEL_URL  pinned Hugging Face resolve URL
WHISDOM_HELPER_MODEL_SHA256 required compile-time/config value
WHISDOM_HELPER_FFMPEG_URL pinned BtbN release asset URL
WHISDOM_HELPER_FFMPEG_SHA256 required compile-time/config value
```

Create `models`, `tools`, `temp`, `logs`, and `auth` directories before binding. Reject relative or traversal-containing overrides for the root.

- [ ] **Step 3: Implement the helper entrypoint.**

Bind `127.0.0.1:port`, create `AppState` containing helper config, queue, model registry/cache handles, and auth state, then mount public health plus authenticated helper routes. Do not call cloud `verify_token`, Turnstile, or Google auth.

- [ ] **Step 4: Run the helper compile check.**

Run:

```bash
cd server && cargo check --bin whisdom-helper
```

Expected: PASS or only errors for the still-unimplemented route modules; do not proceed with broken module declarations.

---

### Task 2: Implement local pairing and authenticated protocol

**Files:**

- Create: `server/src/helper/auth.rs`
- Create: `server/src/helper/protocol.rs`
- Create: `server/src/routes/helper.rs`
- Modify: `server/src/routes/mod.rs`
- Modify: `server/src/bin/whisdom-helper.rs`

- [ ] **Step 1: Write tests for Origin and token rules.**

Cover accepted configured origins, rejected origins, token rotation, missing token, wrong token, and constant-time comparison. Tests must not print token values.

- [ ] **Step 2: Implement auth state.**

Generate 32 random bytes with `getrandom`/`rand` already available through UUID support or add the smallest direct dependency. Store the token with restrictive user permissions where Windows supports them. Pairing requires an accepted Origin and rotates the token. Authenticate state-changing/media routes with `Authorization: Bearer <local-token>` plus Origin validation.

- [ ] **Step 3: Implement protocol routes.**

Implement:

```text
GET  /api/health
POST /api/pair
GET  /api/capabilities
```

Health returns only `{available, protocol_version, busy}`. Pair returns `{token, protocol_version}` only after Origin validation. Capabilities returns helper engine, Vulkan availability, model metadata, and FFmpeg readiness.

- [ ] **Step 4: Run focused Rust tests.**

```bash
cd server && cargo test helper::auth helper::protocol
```

Expected: all pairing and protocol tests pass.

---

### Task 3: Implement safe downloads and cache management

**Files:**

- Create: `server/src/helper/download.rs`
- Create: `server/src/helper/cache.rs`
- Modify: `server/src/helper/mod.rs`
- Modify: `server/src/routes/helper.rs`

- [ ] **Step 1: Write failing tests.**

Test SHA-256 success/failure, maximum byte enforcement, `.partial` cleanup on failure, cache clear refusal while busy, safe deletion under the configured root, and preservation of logs.

- [ ] **Step 2: Implement bounded download.**

Use `reqwest` streaming response chunks. Write only under the configured cache root. Enforce the expected maximum size, calculate SHA-256 while writing, compare the lower-case digest, flush, then atomically rename. Delete partial files on every error.

- [ ] **Step 3: Implement cache status and clear.**

Track active jobs with an atomic busy counter or shared guard. Return `409 Conflict` when nonzero. Before deleting model files, drop the loaded model registry/context. Delete model, FFmpeg, manifests, and temp directories; preserve logs. Return per-category `{deleted, error}` results.

- [ ] **Step 4: Add routes.**

Implement authenticated:

```text
GET /api/cache/status
POST /api/cache/clear
```

- [ ] **Step 5: Run focused tests.**

```bash
cd server && cargo test helper::download helper::cache
```

Expected: all safe-download and cache tests pass.

---

### Task 4: Add on-demand BtbN FFmpeg management

**Files:**

- Create: `server/src/helper/ffmpeg.rs`
- Modify: `server/src/helper/cache.rs`
- Modify: `server/src/helper/protocol.rs`

- [ ] **Step 1: Write archive safety tests.**

Cover rejection of absolute paths, `..` traversal, unexpected executable names, checksum mismatch, and successful extraction into a versioned directory.

- [ ] **Step 2: Implement pinned archive download.**

Download the configured BtbN `win64-gpl` ZIP with the generic downloader. Extract only the expected `ffmpeg.exe` path. Verify the extracted executable hash and run `ffmpeg.exe -version` with a bounded timeout. Store only a versioned active directory.

- [ ] **Step 3: Implement media conversion command.**

Run FFmpeg with argument-array APIs, never a shell string:

```text
-hide_banner -loglevel error -i <input>
-f s16le -ac 1 -ar 16000 <output.wav>
```

Use a timeout and cancellation polling. Keep input/output paths under the job directory.

- [ ] **Step 4: Run tests.**

```bash
cd server && cargo test helper::ffmpeg
```

Expected: archive/path/version tests pass. Live download tests remain opt-in and are not required for normal unit runs.

---

### Task 5: Wire helper transcription with native timestamps and SSE

**Files:**

- Modify: `server/src/job.rs`
- Modify: `server/src/queue.rs`
- Modify: `server/src/pipeline/run.rs`
- Create: `server/src/routes/helper_transcribe.rs` or extend `server/src/routes/helper.rs`
- Modify: `server/src/bin/whisdom-helper.rs`

- [ ] **Step 1: Write integration tests.**

Cover authenticated multipart submission, rejected unauthenticated submission, initial SSE status, terminal complete status with segments, cancellation, and cleanup of the job directory.

- [ ] **Step 2: Add helper model loading.**

Download and verify `ggml-large-v3-turbo-q5_0.bin` on first use. Build the `WhisperContext` with Vulkan enabled when compiled/configured. If Vulkan initialization fails, load CPU mode and publish a warning message. Use the existing `pipeline::transcribe::transcribe_wav` so segment timestamps remain native.

- [ ] **Step 3: Add helper transcription endpoint.**

Implement authenticated:

```text
POST /api/transcribe
GET  /api/progress/{job_id}
POST /api/cancel/{job_id}
```

Accept `audio`, `language`, and `model`. Sanitize the filename, create a random work directory, convert unsupported media through FFmpeg, run transcription, publish status, and remove work files on every terminal path.

- [ ] **Step 4: Run Rust validation.**

```bash
cd server && cargo fmt --check && cargo clippy --all-targets --all-features -- -D warnings && cargo test
```

Expected: zero formatting, clippy, or test failures.

---

### Task 6: Add frontend helper protocol client

**Files:**

- Modify: `src/features/transcription/types.ts`
- Create: `src/features/local-helper/types.ts`
- Create: `src/features/local-helper/client.ts`
- Create: `tests/unit/local-helper.test.ts`
- Modify: `src/features/storage/compatibility.ts`

- [ ] **Step 1: Add mode and protocol types.**

Add `"local-helper"` to `ProcessingMode`. Define `HelperHealth`, `HelperCapabilities`, `HelperPairResponse`, `HelperCacheStatus`, and reuse `ServerJobStatus` for transcription events.

Update the compatibility `MODES` allowlist so old data remains valid and new helper-mode settings round-trip.

- [ ] **Step 2: Implement discovery and pairing.**

Probe the configured local port range with `AbortController` timeouts. Pair only when Origin is accepted. Store the helper token in app-managed local storage under a versioned key. Never send cloud tokens.

- [ ] **Step 3: Implement client methods.**

Provide:

```ts
health(): Promise<HelperHealth | null>
pair(): Promise<HelperCapabilities>
getCapabilities(): Promise<HelperCapabilities | null>
submitJob(file: File, language: string, modelId: string): Promise<string>
subscribeProgress(jobId: string, onStatus: (status: ServerJobStatus) => void): SseConnection
cancelJob(jobId: string): Promise<void>
clearCache(): Promise<HelperCacheClearResult>
```

Reuse the existing SSE parser shape, including abort/unsubscribe behavior.

- [ ] **Step 4: Test the client.**

Mock fetch for health, pairing, authenticated submit, SSE parsing, cancel, and cache-clear `409`. Assert no cloud token is added to helper requests.

- [ ] **Step 5: Run frontend tests.**

```bash
pnpm exec vitest run tests/unit/local-helper.test.ts tests/unit/compatibility.test.ts
```

Expected: PASS.

---

### Task 7: Integrate helper mode and synchronized cache clear

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/features/media/preflight.ts`
- Modify: `src/features/storage/cleanup.ts`
- Modify: `src/app/copy.ts` or the existing App copy block
- Modify: `tests/e2e/whisdom.spec.ts`

- [ ] **Step 1: Add mode copy and settings option.**

Add English/Vietnamese labels and details for `local-helper`, including unavailable/manual-start guidance. Render the helper mode in the existing settings selector.

- [ ] **Step 2: Add helper transcription branch.**

In the existing file transcription flow, branch on `settings.mode === "local-helper"`: submit the original file to the helper, subscribe to SSE, map complete `segments` to `TranscriptDocument`, and preserve native timestamps. Do not pass Google/cloud auth.

- [ ] **Step 3: Update preflight.**

For helper mode, do not require browser Whisper model or `ffmpeg.wasm` assets. Keep media analysis for duration/warnings, but describe helper-side FFmpeg/model downloads instead.

- [ ] **Step 4: Coordinate cache clearing.**

Change `clearModelCaches()` to clear browser caches and, when a paired helper client is available, request helper cache clear. Return structured browser/helper results. Keep browser clear successful when helper is offline, but expose a partial-result message.

- [ ] **Step 5: Add UI tests.**

Cover helper mode presence, unavailable helper guidance, successful helper result mapping, helper offline fallback message, successful synchronized clear, and partial clear reporting.

- [ ] **Step 6: Run frontend validation.**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: zero failures.

---

### Task 8: Add Windows release documentation and acceptance gates

**Files:**

- Modify: `server/README.md`
- Create: `server/README-helper-windows.md`
- Modify: `AGENTS.md` only if the helper commands become repository-standard

- [ ] **Step 1: Document build and run.**

Document Windows Rust prerequisites, Vulkan-enabled release build, manual launch, startup registration, per-user/machine-wide install, model/FFmpeg pins, cache location, and uninstall.

- [ ] **Step 2: Document licenses.**

Include `whisper.cpp`/`whisper-rs` license references and the exact BtbN GPL asset version/source/license notice.

- [ ] **Step 3: Run required project checks.**

```bash
pnpm typecheck
rtk lint
pnpm test
pnpm build
pnpm test:e2e
cd server && cargo build
```

Expected: all required repository checks pass. Run Windows helper smoke tests separately on a Windows machine with Vulkan hardware.

- [ ] **Step 4: Record acceptance evidence.**

Record cold/warm model load, Vulkan and CPU transcription time, audio duration, real-time factor, peak memory, first-download sizes, and cache-clear results. Do not claim the helper is faster until the same fixture shows a material warm-path improvement over browser Turbo.
