# Server Multi-Model Support with GPU Acceleration — Design

## Goal

The Rust/whisper.cpp server (`server/`) currently supports exactly one Whisper model, loaded fresh from disk on every transcription request, configured via a single `[model] path` setting. This design adds:

1. A dynamic, config-driven catalog of multiple models.
2. Startup preloading of every available model (parallel), eliminating per-request load cost.
3. Per-request model selection from the client, validated against what's actually loaded.
4. Optional GPU acceleration (CUDA, Vulkan, ROCm/hipblas) with per-model opt-in.
5. Client-side wiring: capabilities-driven model dropdown in server mode, and a fix for a pre-existing history-display bug where server-mode transcripts always mislabel as "Whisper Base".

## Background

- `whisper-rs = "0.16"` wraps whisper.cpp. `WhisperContext::create_state()` takes `&self`, so one loaded context can safely serve many concurrent inference states — the correct primitive for "load once, use many times."
- `server/src/pipeline/transcribe.rs` previously called `WhisperContext::new_with_params(model_path, ...)` inside every `transcribe_wav()` invocation — reloading the model from disk on every request. This is the core inefficiency being removed.
- `server/src/pipeline/run.rs::execute()` already runs inference inside `tokio::task::spawn_blocking`, so CPU-bound work is already off the async runtime thread.
- `server/src/queue.rs` has no global concurrency limiter; multiple jobs can run concurrently today, which is why per-model serialization (Section 3) is needed once contexts become shared.
- `whisper-rs` feature flags `cuda`, `vulkan`, `hipblas` (ROCm) each link a different native GPU backend and are selected at **compile time**, not runtime. `WhisperContextParameters` exposes `use_gpu: bool` and `gpu_device: c_int` as the only runtime knobs — these operate on whichever backend was compiled in.
- Client-side: `src/features/transcription/models.ts` defines a **local-only** model catalog (`WHISPER_MODELS`, HF repo-path ids like `onnx-community/whisper-base`) used for local WebGPU/WASM transcription. Server mode currently hides the model dropdown entirely (`App.tsx:1534`) and hardcodes `modelId: "whisper.cpp"` on saved transcripts (`App.tsx:920,968`), which fails `findModel()` lookup and silently mislabels history entries as "Whisper Base" (`App.tsx:2152,2169,2305`). This bug must be fixed, not worsened, by this design.

## 1. Config & Model Catalog

Catalog is data-driven in `config.toml`, not hardcoded in Rust.

```rust
pub struct ModelConfig {
    pub dir: String,            // default "./models"
    pub default_model: String,  // default "base" — must match a *derived* id
    pub catalog: Vec<ModelCatalogEntry>,
}

pub struct ModelCatalogEntry {
    pub filename: String,        // e.g. "ggml-tiny-q5_1.bin"
    pub quality: String,         // e.g. "fast" — operator-authored, not derivable from filename
    #[serde(default)]
    pub gpu: bool,                // default false — per-model GPU opt-in, see Section 5
}
```

`config.toml` ships 5 `[[model.catalog]]` entries as the source of truth:

```toml
[model]
dir = "./models"
default_model = "base"

[[model.catalog]]
filename = "ggml-tiny-q5_1.bin"
quality = "fast"

[[model.catalog]]
filename = "ggml-base-q5_1.bin"
quality = "balanced"

[[model.catalog]]
filename = "ggml-small-q5_1.bin"
quality = "high"

[[model.catalog]]
filename = "ggml-medium-q5_0.bin"
quality = "high"

[[model.catalog]]
filename = "ggml-large-v3-q5_0.bin"
quality = "best"
```

If a `config.toml` supplies zero `[[model.catalog]]` entries, `Config::default()` falls back to these same 5 entries in Rust (safety net for minimal configs), but the checked-in repo config always lists them explicitly.

**id/label derivation** (new `server/src/models.rs`, pure functions, unit-tested):

- Strip `ggml-` prefix and `.bin` suffix from `filename`.
- Strip a trailing quantization suffix matching `-q<digit>...` or `-f<digit>...` (case-insensitive) if present. E.g. `tiny-q5_1` → id `tiny`; `large-v3-q5_0` → id `large-v3` (this two-segment case is a required test). If no recognizable quant suffix is found, use the full stripped string as-is — must not panic.
- `id` = derived string; used as both the wire/API identifier and the runtime registry key. **Duplicate derived ids across the catalog is a required startup fail-fast error.**
- `label` = `id` with hyphens replaced by spaces, each word capitalized (`large-v3` → `Large V3`).

`size_mb` is **not** config-authored. It's computed via `std::fs::metadata(path).len()` during startup preload (not a separate scan), rounded to the nearest MB.

Env overrides: `WHISDOM_MODEL_DIR`, `WHISDOM_MODEL_DEFAULT` (mirrors the existing `WHISDOM_MODEL_PATH` pattern). The `catalog` array itself has no env override — TOML-only, since arrays of structs don't fit the existing scalar-only `apply_env_string/u16/usize/bool/vec` helpers, and operators editing the catalog are already editing `config.toml` directly.

Runtime `ModelInfo { id, label, filename, size_mb, quality, gpu }` is built once at startup from catalog + derivation + file metadata + GPU decision (Section 5), reused for both the preloaded-context registry and the `/api/capabilities` response.

## 2. Startup Preload & AppState

**Missing default or zero models loaded:** fail startup with a clear error and non-zero exit. Avoids confusing request-time 400s from a misconfigured default and forces operators to fix config/downloads before serving traffic.

**Preload strategy:** parallel. Faster startup, at the cost of higher peak memory/CPU/disk IO during load — an explicit tradeoff accepted for this deployment profile.

```rust
pub struct ModelInfo {
    pub id: String,
    pub label: String,
    pub filename: String,
    pub size_mb: u64,
    pub quality: String,
    pub gpu: bool,
}

pub fn derive_id(filename: &str) -> String { ... }   // unit-tested
pub fn derive_label(id: &str) -> String { ... }        // unit-tested
```

**Startup sequence** (in `main.rs`, before binding the listener):

1. Resolve `model.dir` to an absolute path (reuse the existing `resolve_paths()` pattern from `config.rs`).
2. For each catalog entry: derive `id`/`label`, check `dir.join(filename).exists()`.
3. For every entry whose file exists, spawn a `tokio::task::spawn_blocking` task to load `WhisperContext::new_with_params(...)` (with GPU params per Section 5) and read file size — all in parallel.
4. `join_all` the spawned tasks; collect successes into the registry. A load failure for one model (corrupt file, OOM, etc.) logs an error and excludes just that model — does not abort startup by itself.
5. Validate: if the derived `default_model` id is not among successfully loaded models, or zero models loaded at all → fail startup (log + non-zero exit). Duplicate derived ids across the catalog is also a fail-fast startup error.
6. Log at info level which models loaded successfully, with size, GPU/CPU + device, and load duration per model, plus total startup preload time.

`ModelRegistry` (wrapped in `Arc`) is added to `AppState` alongside the existing `config`/`queue` fields, accessible via the existing `axum::extract::State` pattern from both `routes/transcribe.rs` and `routes/capabilities.rs`.

**Memory note** (README-documented, not code-enforced): preloading all 5 default models on CPU uses roughly 40+140+460+1100+1080 ≈ 2.8 GB resident for weights alone, before per-request state buffers. Operators with limited RAM (or VRAM, see Section 5) should trim `[[model.catalog]]`.

## 3. Request Flow & Per-Model Serialization

Preloading introduces a new risk: since `queue.rs` has no global concurrency limiter, concurrent requests targeting the *same* model could race against a shared `WhisperContext`. To address this, each loaded model gets its own 1-permit semaphore, serializing only requests against that specific model — different models still run fully concurrently.

```rust
struct ModelEntry {
    info: ModelInfo,
    context: Arc<WhisperContext>,
    semaphore: Arc<Semaphore>,   // 1 permit — serializes requests against THIS model only
}

impl ModelRegistry {
    pub fn get(&self, id: &str) -> Option<(Arc<WhisperContext>, Arc<Semaphore>)>;
    pub fn info(&self, id: &str) -> Option<&ModelInfo>;
    pub fn default_id(&self) -> &str;
    pub fn available(&self) -> impl Iterator<Item = &ModelInfo>;
}
```

**`routes/transcribe.rs`**: parse a new optional `"model"` multipart text field alongside the existing `"language"` field (identical pattern — `.text()` call mapped through the existing `multipart_error` helper). Resolve:
- If `model` field present: look up via `registry.info(id)`. Not found → `AppError::BadRequest(format!("model '{id}' is not available on this server"))` → HTTP 400.
- If omitted: use `registry.default_id().to_string()`.

Store the resolved `model_id: String` on `Job` (new field in `server/src/job.rs`, alongside the existing `language` field).

**`pipeline/run.rs::execute()`** replaces the old `model_path: config.model_path().to_string()` construction with:

```rust
let (context, semaphore) = state.model_registry.get(&job.model_id)
    .ok_or_else(|| AppError::Internal(format!("model '{}' not loaded", job.model_id)))?;

let permit = semaphore.acquire_owned().await
    .map_err(|e| AppError::Internal(format!("model semaphore closed: {e}")))?;

let segments = tokio::task::spawn_blocking(move || {
    let result = transcribe::transcribe_wav(&audio_clone, &context, &options, flag);
    drop(permit);   // release only after inference finishes, inside the blocking closure
    result
})
.await
.map_err(|e| AppError::Internal(format!("spawn_blocking join error: {e}")))??;
```

This requires `execute()` to gain access to `state: &AppState` (or specifically `&ModelRegistry`) as a new parameter, since it currently receives only `config: &Config`.

`TranscribeOptions` drops `model_path` entirely:

```rust
pub struct TranscribeOptions {
    pub threads: usize,
    pub language: Option<String>,
}

pub fn transcribe_wav(
    wav_path: &Path,
    context: &WhisperContext,
    options: &TranscribeOptions,
    cancel_flag: Arc<AtomicBool>,
) -> Result<Vec<TranscriptSegment>, AppError>
```

Body is otherwise unchanged from the original except the `WhisperContext::new_with_params` load line is removed (caller passes an already-loaded context); `context.create_state()` still happens per-call — cheap, gives each request an isolated inference state (the intended whisper.cpp pattern: one shared context = model weights, one state per call = mutable inference buffers).

Debug logging gets `model_id` added alongside/replacing the old `model_path`-style field.

**Required test coverage:** unit tests for `derive_id`/`derive_label` edge cases (quant suffix present/absent, the `large-v3` two-segment case specifically); a semaphore-permit test proving a second `acquire_owned()` blocks until the first permit is dropped; router-level tests submitting an unknown `model` multipart field (expect 400) and an omitted field (expect default model used).

## 4. Capabilities Endpoint

`server/src/routes/capabilities.rs` gains state access:

```rust
pub async fn capabilities(State(state): State<AppState>) -> Json<Value> {
    let models: Vec<Value> = state.model_registry.available()
        .map(|m| json!({
            "id": m.id,
            "label": m.label,
            "size_mb": m.size_mb,
            "quality": m.quality,
        }))
        .collect();

    Json(json!({
        "available": true,
        "engine": "whisper.cpp",
        "input_types": ["file", "url"],
        "cpu_optimized": true,
        "models": models,
        "default_model": state.model_registry.default_id(),
    }))
}
```

Since only successfully preloaded models exist in the registry at all, `available()` naturally returns exactly the "downloaded and ready" set — availability = presence in the in-memory registry, no extra request-time disk scan needed. `gpu` is intentionally **not** included in this response — no client UI need was identified for surfacing it, keeping client scope unchanged (YAGNI).

## 5. GPU Acceleration (CUDA, Vulkan, ROCm)

**Build-time backend selection** — `server/Cargo.toml` gains optional features forwarding to `whisper-rs`:

```toml
[features]
cuda = ["whisper-rs/cuda"]
vulkan = ["whisper-rs/vulkan"]
hipblas = ["whisper-rs/hipblas"]   # ROCm
```

Default build (no features) stays CPU-only, unchanged from today. Operators build a GPU-enabled binary explicitly:

```
cargo build --release --features cuda
cargo build --release --features vulkan
cargo build --release --features hipblas
```

Only one GPU feature should be enabled per build — the native backends conflict at link time. This is documented as an operator caveat in README; not enforced by Cargo (no compile-time mutual-exclusion check, to avoid unnecessary build-script complexity).

**Runtime config** — new `[gpu]` section, a global master switch:

```rust
pub struct GpuConfig {
    pub enabled: bool,  // default false
    pub device: i32,    // default 0
}
```

```toml
[gpu]
enabled = false
device = 0
```

`WHISDOM_GPU_ENABLED` / `WHISDOM_GPU_DEVICE` env overrides, mirroring the existing `apply_env_bool`/scalar helper pattern. If `enabled = false`, no model loads on GPU regardless of per-entry settings.

**Per-model opt-in** — `ModelCatalogEntry.gpu: bool` (default `false`, shown in Section 1). Effective GPU use per model = `config.gpu.enabled && entry.gpu`. This lets an operator with limited VRAM put only the heaviest model(s) on GPU (e.g. `large-v3`) while keeping smaller models on CPU, directly addressing the VRAM-budget concern (VRAM is far more constrained than system RAM, so "preload everything on GPU" is not safe by default).

**Preload integration** (extends Section 2): for each model, build context params with the effective GPU decision:

```rust
let mut params = WhisperContextParameters::new();
params.use_gpu(effective_gpu);
params.gpu_device(config.gpu.device);
let ctx = WhisperContext::new_with_params(&path, params)?;
```

Startup log per model includes whether it loaded on GPU or CPU and the device index. If a binary wasn't compiled with the matching feature but `gpu.enabled = true`, whisper.cpp silently falls back to CPU for that model — there is no reliable way to detect this at the whisper-rs API level. This is documented as a caveat in README, not treated as a startup error.

`ModelInfo` gains a `gpu: bool` field (the effective per-model decision) for internal startup logging only; not exposed via `/api/capabilities` (see Section 4).

## 6. Client-Side Changes

**Types — `src/features/server-transcription/types.ts`:**

```ts
export interface ServerModelInfo {
  id: string
  label: string
  size_mb: number
  quality: string
}

export interface ServerCapabilities {
  available: boolean
  engine: string
  input_types: string[]
  cpu_optimized: boolean
  models?: ServerModelInfo[]
  default_model?: string
}
```

**API — `src/features/server-transcription/api.ts`:** `submitJob(input, language?, modelId?)` appends an optional `model` form field, mirroring the existing `language` append.

**Settings:** add `serverModelId: string | null` to the settings type (default `null`, meaning "use server default until capabilities load or user selects"). Persisted via existing settings persistence (IndexedDB), same as `modelId`.

**Capabilities fetch & gating in `App.tsx`:**
- Add `serverCapabilities: ServerCapabilities | "loading" | "error" | null` state, fetched when entering server mode.
- **Blocking behavior:** if the fetch fails, returns `available: false`, or returns zero `models`, the "Start transcription" action for server mode is disabled and a localized error message is shown in both `COPY.en`/`COPY.vi` (e.g. "Could not load available models from the server. Check server status and try again."). No silent fallback to submitting without a model field.
- On successful fetch: if `settings.serverModelId` is `null` or not present in `models`, auto-select `capabilities.default_model`.

**Server-mode model dropdown:** `App.tsx:1534`'s condition changes from hiding the dropdown in server mode to always showing a dropdown, sourced differently per mode:
- Local modes: `WHISPER_MODELS` (unchanged).
- Server mode: `serverCapabilities.models` (short ids), bound to `settings.serverModelId`, disabled while capabilities are `"loading"`.

Description text under the dropdown in server mode uses `ServerModelInfo.label` + `quality` (e.g. "Small — high quality") instead of the local `modelDescriptions` copy map, since server models have no matching localized notes.

**Fixing the history/results mislabel bug:** replace the hardcoded `modelId: "whisper.cpp"` (`App.tsx:920,968`) with the actual resolved server model id used for that request (`settings.serverModelId` at submit time, e.g. `"base"`). Add a small `SERVER_MODEL_LABELS` lookup (built at render time from the last-fetched `serverCapabilities.models`, with a minimal static fallback map of known ids → labels for viewing old history when capabilities aren't currently loaded), used at the three display sites (`App.tsx:2152,2169,2305`) **before** falling back to `findModel`. This ensures old and new server transcripts show real labels ("Base", "Small") instead of uniformly mislabeling as "Whisper Base".

## Out of Scope

- Auto-downloading models the server doesn't have — rejecting with a clear 400 keeps the server predictable and offline-friendly.
- Detecting at runtime whether a binary was compiled with GPU support — not exposed by whisper-rs; documented as an operator caveat instead.
- Surfacing GPU status in the client UI — no identified user need.
- A whole-server concurrency limiter — out of scope; only per-model serialization is added, matching the specific new risk introduced by shared preloaded contexts.
