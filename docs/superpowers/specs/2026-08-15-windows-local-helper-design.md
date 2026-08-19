# Windows Local Rust Helper — Design Specification

**Status:** Approved design; implementation not started.

**Date:** 2026-08-15

## Goal

Provide an optional Windows-local transcription helper that is faster than browser Transformers.js Whisper Turbo by running native `whisper.cpp` with Vulkan first, while preserving Vietnamese support, native timestamps, SRT/VTT exports, privacy, and synchronized cache clearing.

## User Decisions

- Windows first.
- Helper is installed and run separately from the website.
- Helper may be started manually or enabled at Windows startup.
- Models download on demand directly from Hugging Face.
- FFmpeg downloads on demand from a pinned BtbN GitHub release.
- CPU plus Vulkan is the target; CUDA is not a priority.
- Both per-user and machine-wide installation are supported.
- Website cache clearing also requests helper cache clearing.

## Non-Goals

- No Qwen3-ASR integration in this release.
- No approximate or fabricated timestamps.
- No cloud upload for helper transcription.
- No Windows Service running as `SYSTEM`.
- No embedded FFmpeg build inside the Rust executable.
- No CUDA-specific installer or runtime requirement.
- No replacement of the existing browser-local path.

## Architecture

```text
Browser app
  │
  │ loopback HTTP, Origin + per-user helper token
  ▼
whisdom-helper.exe
  ├── local auth / pairing
  ├── job queue + SSE progress
  ├── media staging
  ├── on-demand FFmpeg manager
  ├── on-demand Hugging Face model manager
  └── whisper.cpp / whisper-rs
       ├── Vulkan execution provider when available
       └── native CPU fallback
```

The website continues to support browser WebGPU/WASM. When the helper is available and selected, it becomes another processing mode. The helper returns the same logical job status shape already used by the server transcription client: phase, progress, message, text, segments, and error.

The helper binds only to loopback. Audio and video remain on the user's machine. The website sends media to `127.0.0.1`; no Google, Cloudflare, or server token is forwarded to the helper.

## Runtime and Model

Use the existing Rust `server/` stack as the starting point:

- `whisper-rs` / `whisper.cpp` for native Whisper inference.
- `axum` for loopback HTTP.
- `tokio` for async job orchestration.
- `tokio-stream` and existing broadcast queue for SSE.
- `hound` for validated 16 kHz mono PCM WAV input.

Build `whisper.cpp` with Vulkan support. The helper attempts Vulkan first and falls back to native CPU if the Vulkan backend cannot initialize or inference fails before producing a result.

Initial model:

```text
Repository: ggerganov/whisper.cpp
File:       ggml-large-v3-turbo-q5_0.bin
Revision:   pinned commit/revision selected during implementation
```

The model is downloaded on demand from Hugging Face. The helper must verify the pinned size and SHA-256 before loading it. Downloads use a temporary `.partial` file and an atomic rename after verification.

The existing `large-v3-turbo` model remains available in the browser catalog. The helper does not alter browser model cache behavior.

## Windows Installation

### Per-user installation

Default install location:

```text
%LOCALAPPDATA%\\Programs\\Whisdom Helper\\
  whisdom-helper.exe
  uninstall.exe
```

Characteristics:

- No Administrator permission.
- Startup registration under the current user:
  `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`.
- Cache and auth state belong to the current Windows user.

### Machine-wide installation

Default install location:

```text
C:\\Program Files\\Whisdom Helper\\
  whisdom-helper.exe
```

Characteristics:

- Administrator permission required during install/uninstall.
- Binary is shared, but runtime cache remains per user.
- Startup registration is per selected user, not a SYSTEM service.
- Uninstall does not silently delete another user's cache.

The first implementation should keep installer technology minimal: package the signed Rust executable and installer metadata; do not add a desktop shell or embedded browser.

## Runtime Files

Per-user runtime data:

```text
%LOCALAPPDATA%\\Whisdom\\Helper\\
  models\\
    ggml-large-v3-turbo-q5_0.bin
  tools\\
    ffmpeg\\<pinned-version>\\ffmpeg.exe
  temp\\
  logs\\
  auth\\helper-token
  endpoint.json
  cache-manifest.json
```

Rules:

- Resolve all paths under the known per-user root.
- Reject path traversal and symlink escapes for managed files.
- Use a versioned FFmpeg directory so updates are atomic.
- Keep logs when clearing model/tool/temp cache unless the user explicitly chooses a full reset.
- Never execute an unverified or partially downloaded binary.

## Local Discovery and Pairing

The website discovers the helper by probing a small configured port range on `127.0.0.1`. The helper writes its selected port and protocol version to `endpoint.json` for diagnostics, but the website does not read that file directly.

Endpoints:

```text
GET  /api/health
POST /api/pair
GET  /api/capabilities
```

Pairing requirements:

- `/api/health` exposes only availability, protocol version, and whether a job is active.
- Pairing checks the website `Origin` against an allowlist containing the production Whisdom origin and configured local development origin.
- Pairing creates or rotates a random per-user token stored under the helper auth directory.
- The browser stores the paired token only in app-managed local storage.
- All state-changing and media routes require the paired token.
- The helper rejects requests without the expected `Origin` and token.
- The helper never accepts a Google OAuth, Cloudflare, or server bearer token as its local credential.
- The helper does not bind to LAN, create firewall rules, or use UPnP.

Threat model: another website on the same machine must not be able to submit private media, read transcripts, cancel jobs, or clear the helper cache without pairing. Loopback binding alone is insufficient protection.

## HTTP API

```text
GET  /api/health
POST /api/pair
GET  /api/capabilities
POST /api/transcribe
GET  /api/progress/{job_id}
POST /api/cancel/{job_id}
GET  /api/cache/status
POST /api/cache/clear
POST /api/shutdown
```

### Transcription

`POST /api/transcribe` accepts authenticated multipart input:

- `audio`: file upload, including video containers.
- `language`: Whisper language code or `auto`.
- `model`: helper model id; default is the installed Turbo model.

The helper:

1. Validates the request size and filename.
2. Creates a random job directory under the per-user temp root.
3. Writes the input without trusting the client filename as a path.
4. Uses FFmpeg when the input is not already validated 16 kHz mono PCM 16-bit WAV.
5. Runs native Whisper inference.
6. Publishes progress through the existing job queue and SSE route.
7. Returns native Whisper segments with `start`, `end`, and `text`.
8. Removes the job directory on success, cancellation, or failure.

The helper returns the existing `ServerJobStatus`-compatible JSON shape. Segment timestamps are native Whisper timestamps, not fixed chunk offsets.

### Progress and cancellation

`GET /api/progress/{job_id}` sends an initial status and subsequent SSE JSON events. Existing keep-alive behavior is retained.

`POST /api/cancel/{job_id}` sets the job cancellation flag. The inference loop checks cancellation between segments and the media pipeline checks it before and after FFmpeg execution.

### Cache status and clear

`GET /api/cache/status` returns:

```json
{
  "model": { "installed": true, "bytes": 601234567 },
  "ffmpeg": { "installed": true, "version": "pinned-version" },
  "temp_bytes": 0,
  "busy": false
}
```

`POST /api/cache/clear`:

- Returns `409 Conflict` while a transcription or conversion job is active.
- Unloads/release model state before deleting model files.
- Deletes Whisper model files, FFmpeg versions, download manifests, and temp files.
- Preserves logs by default.
- Returns per-category deletion results and errors.
- Never reports full success if a category failed to delete.

The website's clear-cache action first clears browser Transformers.js caches, then calls helper cache clear when paired. If the helper is unavailable, browser cache clearing still succeeds but the UI reports that helper cache clearing did not occur. The UI must not claim synchronized clearing without a successful helper response.

## FFmpeg Download

Use a pinned BtbN GitHub release from `BtbN/FFmpeg-Builds` for Windows `win64-gpl`.

Required metadata in the helper release/configuration:

- Exact GitHub release tag.
- Exact asset filename.
- Expected archive size range.
- SHA-256 digest.
- FFmpeg license/source notice.

Download rules:

1. Fetch only the pinned HTTPS release asset.
2. Stream to a `.partial` file.
3. Enforce a maximum size before writing further.
4. Verify SHA-256.
5. Extract only expected paths, rejecting traversal and absolute paths.
6. Verify the extracted `ffmpeg.exe` hash.
7. Atomically rename the version directory into the active tool path.
8. Run `ffmpeg.exe -version` with a bounded timeout and verify the expected version string.

The implementation must not use a floating `latest` URL. BtbN `win64-gpl` licensing must be included in the installer and About/License documentation, with version and source link.

## Hugging Face Model Download

Use a pinned Hugging Face revision and direct resolve URL for the GGML model. The helper must not rely on a mutable branch at runtime.

Download rules match FFmpeg:

- HTTPS only.
- Maximum size.
- `.partial` file.
- Resume only when the partial file matches the pinned URL and expected metadata.
- SHA-256 verification.
- Atomic rename.
- Load only after successful verification.

The UI exposes model download progress as a helper job/setup phase, separate from transcription progress.

## Website Integration

Add a distinct helper processing mode rather than overloading `server` mode. The browser client needs a small local-helper API wrapper that reuses the existing server job status/SSE parser where practical.

Expected frontend seams:

- `src/features/local-helper/`: health, pairing, capabilities, transcription, cache API, and protocol types.
- `src/features/storage/cleanup.ts`: coordinate browser cache deletion with helper cache deletion.
- `src/App.tsx`: helper availability, mode selection, setup/start guidance, progress, and clear-cache result copy in English and Vietnamese.
- `src/features/transcription/types.ts`: add the helper mode only if the existing processing-mode union requires it.
- Existing result and export code: unchanged; helper returns the same segment contract.

Fallback order when helper mode is selected:

1. Use paired helper.
2. If unavailable, show explicit helper-offline state and offer browser local mode.
3. Do not silently upload to cloud or server.

The helper mode must preserve the user's selected language and model, and must not reuse cloud authentication tokens.

## Rust Code Boundaries

Start from the existing Rust server modules but make helper-specific concerns explicit:

```text
server/src/helper_main.rs
server/src/helper/
  auth.rs
  cache.rs
  config.rs
  download.rs
  ffmpeg.rs
  pairing.rs
  protocol.rs
  startup.rs
```

Reuse where contracts already match:

- `job.rs`
- `queue.rs`
- `pipeline/transcribe.rs`
- `models.rs`
- SSE progress implementation
- `whisper-rs` model loading and segment extraction

Do not reuse cloud auth, Turnstile, Google identity, or server deployment configuration in the helper binary.

A separate helper binary target is preferred over making the cloud/server binary infer its role from environment variables. Shared modules may be extracted only where the type/API boundary is genuinely identical.

## Error Handling

User-visible errors must distinguish:

- helper not running;
- pairing rejected;
- Vulkan unavailable, CPU fallback active;
- model download failed;
- FFmpeg download failed;
- checksum mismatch;
- unsupported/corrupt media;
- helper busy during cache clear;
- helper crashed or disconnected;
- cache deletion partially failed.

Security-sensitive details such as auth tokens, full local paths, and raw URLs containing credentials must not appear in UI errors or normal logs.

## Testing and Acceptance

### Rust unit tests

Cover:

- deterministic cache-root resolution;
- rejection of path traversal and symlink escapes;
- pinned URL and checksum metadata;
- checksum mismatch;
- atomic partial-file download behavior;
- archive extraction allowlist;
- cache clear refusal while a job is active;
- cache clear result when one category fails;
- pairing token generation and constant-time token comparison;
- origin allowlist;
- protocol JSON compatibility.

### Rust integration tests

Cover:

- health endpoint without auth;
- pairing with accepted/rejected origins;
- authenticated capabilities;
- unauthenticated media rejection;
- upload plus SSE completion;
- cancellation;
- cache status and clear;
- clear returns conflict while processing.

### Windows smoke tests

Run on a clean Windows machine:

1. Per-user install without Administrator.
2. Machine-wide install with Administrator.
3. Manual helper start.
4. Startup disabled/enabled.
5. Pairing from production origin and local development origin.
6. First model download from pinned Hugging Face revision.
7. First FFmpeg download from pinned BtbN release.
8. Video input conversion.
9. Vulkan inference.
10. CPU fallback after Vulkan is unavailable.
11. Vietnamese transcript with native timestamps.
12. Website cache clear deletes helper model, FFmpeg, and temp cache.
13. Cache clear while busy returns conflict and preserves active job.
14. Uninstall behavior for both installation modes.

### Browser tests

Add Playwright coverage for:

- helper unavailable;
- helper available and paired;
- helper transcription progress and completion;
- helper cancellation;
- helper offline during cache clear;
- successful synchronized cache clear;
- failed/partial helper cache clear message;
- Vietnamese segments rendered and exported unchanged.

### Performance gate

Compare the helper with browser Turbo on the same Windows machine, same fixture, and same model quality target. Record:

- cold model-load time;
- warm transcription time;
- audio duration;
- real-time factor;
- peak resident memory;
- Vulkan versus CPU path.

The helper is accepted only if Vulkan materially improves warm transcription time over the browser Turbo path on supported hardware and CPU fallback remains functional.

## Release and Licensing

The helper release must include:

- Windows per-user and machine-wide installer paths;
- uninstall behavior;
- Vulkan/CPU runtime notes;
- model download source and pinned revision;
- BtbN FFmpeg version, GPL notice, source link, and license text;
- `whisper.cpp`/`whisper-rs` license notices;
- privacy statement: media stays on the local machine when helper mode is used.

## Rollback

The browser app remains functional if the helper feature is removed or unavailable. Rollback consists of:

1. Hide helper mode and setup UI.
2. Stop advertising helper capability from the website.
3. Keep browser WebGPU/WASM and existing server modes unchanged.
4. Leave installed helper harmlessly stopped; provide a separate uninstall path.

No transcript schema migration is needed because helper output uses the existing segment and document contracts.
