# Server-Side Transcription Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a high-performance server-side transcription backend in Rust that accepts file uploads and URLs (downloaded via yt-dlp, extracted via system ffmpeg), runs Whisper CPU-optimized via whisper.cpp, and integrates with the existing frontend behind Google OAuth authentication.

**Architecture:** A standalone Rust binary (server/) using Axum + Tokio exposes REST endpoints for job submission and SSE progress streaming. It shells out to yt-dlp for URL downloads and ffmpeg for audio extraction, then runs whisper.cpp (via whisper-rs) for CPU-optimized transcription with quantized GGML models. The frontend gains a new "server" ProcessingMode gated behind Google sign-in, with an API client that uploads files or submits URLs and streams progress via fetch-based SSE.

**Tech Stack:**
- **Backend:** Rust, Axum 0.8, Tokio, whisper-rs (whisper.cpp bindings), reqwest, serde, hound (WAV reader)
- **External tools:** yt-dlp (system binary), ffmpeg + ffprobe (system binaries)
- **Auth:** Google OAuth2 token validation (same pattern as existing Cloudflare worker at worker/src/index.ts)
- **Frontend additions:** New ProcessingMode = "server", fetch-based SSE client, server-mode API client, auth-gated UI
- **Deployment:** Docker multi-stage build or bare-metal static binary + systemd

---

## File Structure

### Backend (server/)

server/
  Cargo.toml
  Cargo.lock
  rust-toolchain.toml
  .env.example
  Dockerfile
  README.md
  scripts/download-model.sh
  src/
    main.rs          - Entry point, Axum router, config loading, AppState
    config.rs        - Environment-based config
    auth.rs          - Google OAuth2 token validation, AuthenticatedUser extractor
    error.rs         - AppError enum with Axum IntoResponse
    job.rs           - JobId, JobInput, JobPhase, Job, JobStatus, TranscriptSegment
    queue.rs         - In-memory job queue with broadcast channels
    routes/
      mod.rs
      health.rs      - GET /api/health
      capabilities.rs - GET /api/capabilities
      transcribe.rs  - POST /api/transcribe (multipart: file or URL)
      progress.rs    - GET /api/progress/:job_id (SSE stream)
      cancel.rs      - POST /api/cancel/:job_id
    pipeline/
      mod.rs
      download.rs    - yt-dlp subprocess for URL downloads
      extract.rs     - ffmpeg subprocess for audio extraction (16kHz mono WAV)
      transcribe.rs  - whisper.cpp transcription via whisper-rs
      run.rs         - Pipeline orchestrator (download -> extract -> transcribe)

### Frontend additions (src/)

src/features/server-transcription/
  types.ts   - ServerJobPhase, ServerJobStatus, ServerSegment, TranscribeInput
  api.ts     - ServerTranscriptionApi class (submit, subscribe, cancel)
  sse.ts     - Fetch-based SSE stream consumer

Modified: src/features/transcription/types.ts (add "server" to ProcessingMode), src/App.tsx (server mode UI, auth gate, URL input).
---

## Phase 1: Rust Backend Foundation

### Task 1: Scaffold Rust project with Cargo

**Files:**
- Create: server/Cargo.toml
- Create: server/rust-toolchain.toml
- Create: server/.env.example
- Create: server/src/main.rs

- [ ] **Step 1: Create server/Cargo.toml**

[package]
name = "whisdom-server"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = { version = "0.8", features = ["multipart", "macros"] }
tokio = { version = "1", features = ["full"] }
tokio-stream = { version = "0.1", features = ["sync"] }
tower-http = { version = "0.6", features = ["cors", "trace", "limit"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", features = ["json"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
uuid = { version = "1", features = ["v4"] }
thiserror = "2"
tempfile = "3"
futures = "0.3"
dotenvy = "0.15"
whisper-rs = "0.13"
hound = "3"

[profile.release]
opt-level = 3
lto = "fat"
codegen-units = 1
strip = true

- [ ] **Step 2: Create server/rust-toolchain.toml**

[toolchain]
channel = "stable"

- [ ] **Step 3: Create server/.env.example**

WHISDOM_SERVER_PORT=8788
WHISDOM_ALLOWED_ORIGIN=http://localhost:5173
WHISDOM_ALLOWED_EMAILS=
WHISDOM_ALLOWED_DOMAINS=
WHISDOM_MODEL_PATH=./models/ggml-base-q5_1.bin
WHISDOM_TEMP_DIR=./tmp
WHISDOM_MAX_UPLOAD_MB=500
WHISDOM_YTDLP_PATH=yt-dlp
WHISDOM_FFMPEG_PATH=ffmpeg
WHISDOM_THREADS=0

- [ ] **Step 4: Create server/src/main.rs**

use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "whisdom_server=info,tower_http=info".into()),
        )
        .json()
        .init();

    let port: u16 = std::env::var("WHISDOM_SERVER_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(8788);

    let app = axum::Router::new()
        .route("/api/health", axum::routing::get(|| async { "ok" }));

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "whisdom-server starting");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

- [ ] **Step 5: Verify it compiles and runs**

Run: cd server && cargo build && cargo run
Expected: Server starts on port 8788. curl http://localhost:8788/api/health returns ok.

- [ ] **Step 6: Commit**

git add server/
git commit -m "feat(server): scaffold Rust project with Axum and health endpoint"
---

### Task 2: Configuration and environment loading

**Files:**
- Create: server/src/config.rs
- Modify: server/src/main.rs

- [ ] **Step 1: Create server/src/config.rs** - Config struct with: port, allowed_origin, allowed_emails, allowed_domains, model_path, temp_dir, max_upload_bytes, ytdlp_path, ffmpeg_path, threads. from_env() loads from dotenv. threads defaults to available_parallelism(). is_allowed() checks email/domain allowlist (same logic as worker/src/index.ts).

- [ ] **Step 2: Update server/src/main.rs** - Add mod config; at top, replace port loading with let config = config::Config::from_env();

- [ ] **Step 3: Commit**

git add server/src/config.rs server/src/main.rs
git commit -m "feat(server): add environment-based configuration"

---

### Task 3: Error types and CORS setup

**Files:**
- Create: server/src/error.rs
- Modify: server/src/main.rs

- [ ] **Step 1: Create server/src/error.rs** - AppError enum (Unauthorized, BadRequest, NotFound, PayloadTooLarge, Internal, Io) with IntoResponse. Maps to appropriate HTTP status codes. Internal/Io errors return generic "internal error" message.

- [ ] **Step 2: Add CORS to main.rs** - tower_http::cors::CorsLayer with config.allowed_origin, allow_methods(Any), allow_headers(Any)

- [ ] **Step 3: Commit**

git add server/src/error.rs server/src/main.rs
git commit -m "feat(server): add error types and CORS middleware"

---

### Task 4: Google OAuth2 authentication middleware

**Files:**
- Create: server/src/auth.rs
- Modify: server/src/main.rs

- [ ] **Step 1: Create server/src/auth.rs** - AuthenticatedUser extractor using FromRequestParts<AppState>. Extracts Bearer token from Authorization header, verifies via https://oauth2.googleapis.com/tokeninfo, checks email_verified, validates against config.is_allowed(). Same pattern as worker/src/index.ts.

- [ ] **Step 2: Add AppState to main.rs** - pub struct AppState { pub config: Config }, pass via .with_state(state)

- [ ] **Step 3: Commit**

git add server/src/auth.rs server/src/main.rs
git commit -m "feat(server): add Google OAuth2 token validation middleware"

---

## Phase 2: Job Queue and Progress Streaming

### Task 5: Job state machine and in-memory queue

**Files:**
- Create: server/src/job.rs
- Create: server/src/queue.rs
- Modify: server/src/main.rs

- [ ] **Step 1: Create server/src/job.rs** - JobId (String), JobInput (File{filename}/Url{url}), JobPhase (Queued/Downloading/Extracting/Transcribing/Complete/Error/Cancelled), JobStatus (serializable), TranscriptSegment (start/end/text), Job struct with work_dir, cancel_tx/cancel_rx watch channels, status() method, is_cancelled() method.

- [ ] **Step 2: Create server/src/queue.rs** - Queue with Arc<Mutex<HashMap>> for jobs and broadcast channels (128 capacity). Methods: insert(job) -> (id, Arc<Mutex<Job>>), get(id), subscribe(id) -> broadcast::Receiver, publish(id, status), cancel(id), remove(id).

- [ ] **Step 3: Add Queue to AppState** in main.rs

- [ ] **Step 4: Commit**

git add server/src/job.rs server/src/queue.rs server/src/main.rs
git commit -m "feat(server): add job state machine and in-memory broadcast queue"

---

### Task 6: SSE progress endpoint and cancel route

**Files:**
- Create: server/src/routes/mod.rs, health.rs, capabilities.rs, progress.rs, cancel.rs
- Modify: server/src/main.rs

- [ ] **Step 1: Create route modules:**
- health: returns {"status":"ok"}
- capabilities: returns {"available":true,"engine":"whisper.cpp","input_types":["file","url"],"cpu_optimized":true}
- progress: SSE stream using tokio_stream::wrappers::BroadcastStream merged with 15s heartbeat. Auth-gated, checks job.email == user.email.
- cancel: sends cancel signal via watch channel. Auth-gated.

- [ ] **Step 2: Wire routes into main.rs** using axum::routing::{get, post}

- [ ] **Step 3: Commit**

git add server/src/routes/ server/src/main.rs
git commit -m "feat(server): add SSE progress streaming and cancel endpoint"
---

## Phase 3: Media Pipeline

### Task 7: URL download via yt-dlp

**Files:**
- Create: server/src/pipeline/mod.rs
- Create: server/src/pipeline/download.rs

- [ ] **Step 1: Create pipeline/download.rs** - download_url() function: spawns yt-dlp with --no-playlist --no-warnings --newline -o source.%(ext)s --write-info-json. Reads stdout line-by-line for progress (parses N% pattern). Supports cancellation via watch::Receiver. find_downloaded_file() finds the media file by excluding .json/.part extensions.

- [ ] **Step 2: Commit**

git add server/src/pipeline/
git commit -m "feat(server): add yt-dlp URL download pipeline stage"

---

### Task 8: Audio extraction via ffmpeg

**Files:**
- Create: server/src/pipeline/extract.rs

- [ ] **Step 1: Create pipeline/extract.rs** - extract_audio() function: probes duration via ffprobe (format=duration), spawns ffmpeg with -vn -acodec pcm_s16le -ar 16000 -ac 1 -y. Reads stderr for progress (parses time=HH:MM:SS.mmm). Outputs to work_dir/audio.wav. Supports cancellation.

- [ ] **Step 2: Commit**

git add server/src/pipeline/
git commit -m "feat(server): add ffmpeg audio extraction to 16kHz mono WAV"

---

### Task 9: Whisper.cpp transcription via whisper-rs

**Files:**
- Create: server/src/pipeline/transcribe.rs

- [ ] **Step 1: Create pipeline/transcribe.rs** - TranscribeOptions struct (model_path, threads, language). transcribe_wav() function: loads GGML model via WhisperContext::new_from_file, creates state, configures FullParams with Greedy{best_of:1} sampling, sets thread count, language (if not "auto"), disables print_progress. Reads WAV via hound crate (expects 16kHz mono pcm_s16le, converts i16 to f32). Runs state.full(), extracts n_segments with timestamps (centiseconds/100). Uses Arc<AtomicBool> for cancellation.

- [ ] **Step 2: Commit**

git add server/src/pipeline/
git commit -m "feat(server): add whisper.cpp CPU transcription via whisper-rs"

---

### Task 10: Pipeline orchestrator

**Files:**
- Create: server/src/pipeline/run.rs
- Modify: server/src/pipeline/mod.rs

- [ ] **Step 1: Create pipeline/run.rs** - run_pipeline() async function: takes Arc<Mutex<Job>>, Config, Queue. Calls execute() which runs: download (if URL) -> extract -> transcribe. Uses tokio::task::spawn_blocking for whisper inference (CPU-bound). Publishes phase updates via queue.publish(). Handles cancellation between phases and via AtomicBool bridge from watch channel. Cleans up temp dir on completion. Maps results to JobPhase::Complete/Error/Cancelled.

- [ ] **Step 2: Update pipeline/mod.rs** - add pub mod run;

- [ ] **Step 3: Commit**

git add server/src/pipeline/
git commit -m "feat(server): add pipeline orchestrator"

---

### Task 11: Transcribe endpoint

**Files:**
- Create: server/src/routes/transcribe.rs
- Modify: server/src/routes/mod.rs
- Modify: server/src/main.rs

- [ ] **Step 1: Create routes/transcribe.rs** - Parses Multipart form: "audio" field (file bytes, checked against max_upload_bytes), "url" field (string), "language" field (optional). For file uploads: creates Job, writes bytes to work_dir/filename. For URL: creates Job with Url input. Inserts into queue, spawns run_pipeline in tokio::spawn. Returns {"job_id": id}.

- [ ] **Step 2: Wire route into main.rs** - Add mod pipeline; at top, route /api/transcribe with post handler, add DefaultBodyLimit::max(config.max_upload_bytes) layer.

- [ ] **Step 3: Commit**

git add server/
git commit -m "feat(server): add transcribe endpoint supporting file upload and URL"
---

## Phase 4: Deployment

### Task 12: Dockerfile, model download script, README

**Files:**
- Create: server/Dockerfile
- Create: server/scripts/download-model.sh
- Create: server/README.md

- [ ] **Step 1: Create Dockerfile** - Multi-stage build:
  - Builder: rust:1.82-bookworm, install cmake + build-essential, build with LTO
  - Runtime: debian:bookworm-slim, install ffmpeg + python3 + yt-dlp (via pip), copy binary
  - Create /data/models and /data/tmp directories
  - Expose 8788, CMD ["whisdom-server"]

- [ ] **Step 2: Create scripts/download-model.sh** - Downloads GGML models from huggingface.co/ggerganov/whisper.cpp. Usage: ./download-model.sh ./models ggml-base-q5_1.bin

- [ ] **Step 3: Create README.md** - Quick start guide, Docker usage, API table (health, capabilities, transcribe, progress, cancel), auth header format, recommended CPU models:
  - ggml-tiny-q5_1.bin (~40MB) - Fastest
  - ggml-base-q5_1.bin (~140MB) - Balanced
  - ggml-small-q5_1.bin (~460MB) - High quality
  - ggml-medium-q5_0.bin (~1.1GB) - Best quality

- [ ] **Step 4: Commit**

git add server/Dockerfile server/scripts/ server/README.md
git commit -m "feat(server): add Dockerfile, model download script, and README"

---

## Phase 5: Frontend Integration

### Task 13: Server API client, SSE consumer, and types

**Files:**
- Modify: src/features/transcription/types.ts
- Create: src/features/server-transcription/types.ts
- Create: src/features/server-transcription/sse.ts
- Create: src/features/server-transcription/api.ts

- [ ] **Step 1: Add "server" to ProcessingMode** in types.ts:
  export type ProcessingMode = "local-webgpu" | "cloudflare-ai" | "local-wasm" | "server"

- [ ] **Step 2: Create types.ts** - ServerJobPhase (queued/downloading/extracting/transcribing/complete/error/cancelled), ServerJobStatus (id/phase/progress/message/text/segments/error/created_at), ServerSegment (start/end/text), ServerCapabilities (available/engine/input_types/cpu_optimized), TranscribeInput (File or Url variant)

- [ ] **Step 3: Create sse.ts** - Fetch-based SSE consumer. Sets Authorization: Bearer header. Reads response body as ReadableStream, decodes with TextDecoder, buffers and splits by newlines, parses "data:" lines as JSON, calls onMessage callback. Returns abort function using AbortController.

- [ ] **Step 4: Create api.ts** - ServerTranscriptionApi class:
  - constructor(baseUrl, getToken)
  - getCapabilities() - GET /api/capabilities, returns ServerCapabilities | null
  - submitJob(input) - POST /api/transcribe with FormData (audio file or url string + optional language), returns job_id
  - subscribeProgress(jobId, onStatus) - GET /api/progress/:id via SSE, returns unsubscribe function
  - cancelJob(jobId) - POST /api/cancel/:id

- [ ] **Step 5: Verify typecheck** - pnpm typecheck

- [ ] **Step 6: Commit**

git add src/features/server-transcription/ src/features/transcription/types.ts
git commit -m "feat(client): add server transcription API client and SSE consumer"

---

### Task 14: Integrate server mode into App.tsx

**Files:**
- Modify: src/App.tsx
- Modify: .env.example

- [ ] **Step 1: Add VITE_SERVER_URL to .env.example**

- [ ] **Step 2: Add server mode copy** to COPY.en and COPY.vi:
  - serverMode: "Server (CPU)" / "Máy chủ (CPU)"
  - serverUrl: "Enter video/audio URL" / "Nhập URL video/âm thanh"
  - serverModeDesc: "Server-side transcription via whisper.cpp. Sign in required." / "Chuyển ngữ trên máy chủ qua whisper.cpp. Cần đăng nhập."
  - serverUnavailable: "Transcription server unavailable" / "Máy chủ chuyển ngữ không khả dụng"

- [ ] **Step 3: Add URL input state** - const [urlInput, setUrlInput] = useState("")

- [ ] **Step 4: Add "server" to mode selector** - Only show SelectItem when import.meta.env.VITE_SERVER_URL is set

- [ ] **Step 5: Auth gate** - When settings.mode === "server" and !driveAccessToken: show serverModeDesc text and signInWithGoogle button instead of transcription controls

- [ ] **Step 6: URL input** - When settings.mode === "server" and driveAccessToken: show Input with serverUrl placeholder

- [ ] **Step 7: Server availability check** - useEffect on [settings.mode, driveAccessToken]: create ServerTranscriptionApi, call getCapabilities(), show destructive toast if null

- [ ] **Step 8: Server transcription handler** - mapServerPhase() helper maps ServerJobPhase to JobState (queued->idle, downloading->downloading-assets, extracting->preparing-media, transcribing->transcribing, complete->complete, error->error, cancelled->cancelled). Dispatch: create ServerTranscriptionApi, submitJob with file or URL, subscribeProgress maps to setProgress and handles complete/error phases.

- [ ] **Step 9: Hide local-only settings** - When settings.mode === "server": hide model selector, chunkSeconds, overlapSeconds settings

- [ ] **Step 10: Verify** - pnpm typecheck && rtk lint && pnpm build

- [ ] **Step 11: Commit**

git add src/App.tsx .env.example
git commit -m "feat(client): integrate server transcription mode with auth gate"
---

### Task 15: Tests

**Files:**
- Create: tests/unit/server-api.test.ts
- Create: tests/e2e/server-mode.spec.ts

- [ ] **Step 1: Create unit tests** - tests/unit/server-api.test.ts:
  - Test ServerJobStatus type parsing (phase, progress)
  - Test complete status with ServerSegment array
  - Test TranscribeInput type variants (file vs url)

- [ ] **Step 2: Create Playwright e2e tests** - tests/e2e/server-mode.spec.ts:
  - Test server mode option hidden when VITE_SERVER_URL not set
  - Test server mode shows sign-in prompt when not authenticated
  - Test server mode shows URL input when authenticated

- [ ] **Step 3: Run all tests** - pnpm test && pnpm test:e2e

- [ ] **Step 4: Commit**

git add tests/
git commit -m "test: add server mode unit and e2e tests"

---

## Phase 6: CI

### Task 16: Add server build to CI

**Files:**
- Modify: .github/workflows/ci.yml

- [ ] **Step 1: Add Rust server job** to CI pipeline:
  - runs-on: ubuntu-latest
  - actions/checkout@v4
  - dtolnay/rust-toolchain@stable
  - Swatinem/rust-cache@v2 with workspaces: server
  - Install system deps: sudo apt-get update && sudo apt-get install -y cmake ffmpeg
  - working-directory: server, cargo build --release
  - working-directory: server, cargo test

- [ ] **Step 2: Commit**

git add .github/workflows/ci.yml
git commit -m "ci: add Rust server build and test to CI"

---

## Summary

| Phase | Tasks | Produces |
|-------|-------|----------|
| 1: Foundation | 1-4 | Rust/Axum project, config, CORS, Google OAuth |
| 2: Queue + SSE | 5-6 | Job queue, broadcast, SSE streaming, cancel |
| 3: Pipeline | 7-11 | yt-dlp, ffmpeg, whisper.cpp, orchestrator, transcribe endpoint |
| 4: Deployment | 12 | Dockerfile, model download, README |
| 5: Frontend | 13-15 | API client, SSE, auth-gated UI, tests |
| 6: CI | 16 | GitHub Actions server build |

**Key architectural decisions:**

- **Rust + whisper-rs** - whisper.cpp under the hood, GGML quantized models, best CPU performance, memory-safe
- **Sequential job execution** - avoids CPU contention between concurrent transcriptions; extensible to configurable N later
- **SSE over WebSocket** - simpler, works with HTTP infrastructure, fetch-based on frontend since native EventSource cannot set Authorization headers
- **Google OAuth token validation** - same pattern as existing Cloudflare worker (worker/src/index.ts), consistent auth across all backends
- **Server mode gated behind sign-in** - unauthenticated users only see local modes (local-webgpu, cloudflare-ai, local-wasm)
- **VITE_SERVER_URL controls visibility** - server mode option hidden entirely from dropdown when env var not configured
- **tokio::task::spawn_blocking** for whisper inference - keeps CPU-bound work off the async runtime
- **watch channel + AtomicBool bridge** for cancellation - watch channel for async cancellation, AtomicBool for sync cancellation in spawn_blocking
- **DefaultBodyLimit** on transcribe endpoint - prevents memory exhaustion from oversized uploads
- **broadcast channel per job** - allows multiple SSE subscribers per job, 128 message buffer
- **Temp dir cleanup** after successful transcription, preserved on error for debugging

**Server API:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/health | No | Health check |
| GET | /api/capabilities | No | Server capabilities |
| POST | /api/transcribe | Yes | Submit file or URL (multipart) |
| GET | /api/progress/:id | Yes | SSE progress stream |
| POST | /api/cancel/:id | Yes | Cancel running job |

Auth header: Authorization: Bearer <google-oauth-token>

**Frontend integration flow:**

1. User selects "Server (CPU)" mode (only visible when VITE_SERVER_URL configured)
2. If not signed in: show sign-in prompt with Google button
3. If signed in: show file queue (existing) + URL input field
4. On transcribe: ServerTranscriptionApi.submitJob() sends file or URL to server
5. Server returns job_id, client subscribes to SSE progress stream
6. Progress updates mapped to existing JobState enum and displayed via existing progress UI
7. On complete: result displayed in existing result dialog with segments and export options
8. On error: toast notification with error message