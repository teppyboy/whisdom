# Server Multi-Model + GPU Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dynamic, config-driven whisper.cpp model catalog to the Rust server, preload all available models in parallel at startup, support per-request model selection with per-model concurrency serialization, add optional compile-time GPU acceleration (CUDA/Vulkan/ROCm) with per-model opt-in, and wire the client to select a server model, display it correctly, and fix a pre-existing history-mislabel bug.

**Architecture:** A new `server/src/models.rs` module derives `ModelInfo{id,label,filename,size_mb,quality,gpu}` from TOML-configured catalog entries and preloads a `WhisperContext` + 1-permit `Semaphore` per model into a `ModelRegistry` at startup (parallel `spawn_blocking` tasks), stored in `AppState`. Routes resolve/validate a per-request `model` field against the registry (400 if unknown), thread the resolved `model_id` through `Job` → `run_pipeline` → `execute` → `transcribe_wav`, which now receives a preloaded `&WhisperContext` instead of loading one per call. `/api/capabilities` reports only successfully loaded models. Client gains a `serverModelId` setting, a capabilities-driven dropdown in server mode, and fixes the `App.tsx:920,968` hardcoded `"whisper.cpp"` modelId bug plus 3 history-display sites and 2 warning-leak gates.

**Tech Stack:** Rust/Axum/whisper-rs 0.16/tokio (server); React/TypeScript (client). Full approved spec: `docs/superpowers/specs/2026-07-15-server-multi-model-gpu-design.md`.

---

## Task 1: Model ID/Label Derivation (`server/src/models.rs`)

**Files:**
- Create: `server/src/models.rs`
- Modify: `server/src/main.rs:1-9` (add `mod models;`)

- [ ] **Step 1: Write failing tests**

Create `server/src/models.rs` with only the test module first:

```rust
//! Model catalog derivation: turns a ggml filename into a stable id/label pair.

/// Strip the leading `ggml-` prefix and trailing `.bin` suffix, then strip a
/// trailing quantization suffix matching `-q<digits>...` or `-f<digits>...`
/// (case-insensitive). If no quantization suffix is found, the stripped
/// string is returned as-is. Never panics.
pub fn derive_id(filename: &str) -> String {
    todo!()
}

/// Convert a derived id into a human label: hyphens become spaces, each
/// word is capitalized. E.g. "large-v3" -> "Large V3".
pub fn derive_label(id: &str) -> String {
    todo!()
}

#[derive(Debug, Clone, PartialEq)]
pub struct ModelInfo {
    pub id: String,
    pub label: String,
    pub filename: String,
    pub size_mb: u64,
    pub quality: String,
    pub gpu: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_id_strips_prefix_suffix_and_quant() {
        assert_eq!(derive_id("ggml-tiny-q5_1.bin"), "tiny");
        assert_eq!(derive_id("ggml-base-q5_1.bin"), "base");
        assert_eq!(derive_id("ggml-small-q5_1.bin"), "small");
        assert_eq!(derive_id("ggml-medium-q5_0.bin"), "medium");
    }

    #[test]
    fn derive_id_handles_two_segment_name_with_quant() {
        assert_eq!(derive_id("ggml-large-v3-q5_0.bin"), "large-v3");
    }

    #[test]
    fn derive_id_handles_missing_quant_suffix() {
        assert_eq!(derive_id("ggml-tiny.bin"), "tiny");
    }

    #[test]
    fn derive_id_handles_f_type_quant_suffix() {
        assert_eq!(derive_id("ggml-medium-f16.bin"), "medium");
    }

    #[test]
    fn derive_id_never_panics_on_unexpected_filename() {
        assert_eq!(derive_id("weird-file-name.bin"), "weird-file-name");
        assert_eq!(derive_id(""), "");
        assert_eq!(derive_id("ggml-.bin"), "");
    }

    #[test]
    fn derive_label_capitalizes_and_replaces_hyphens() {
        assert_eq!(derive_label("large-v3"), "Large V3");
        assert_eq!(derive_label("base"), "Base");
        assert_eq!(derive_label("tiny"), "Tiny");
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `server/`): `cargo test --locked models::tests`
Expected: compile error/panic (functions use `todo!()`).

- [ ] **Step 3: Implement `derive_id` and `derive_label`**

Replace the `todo!()` bodies:

```rust
pub fn derive_id(filename: &str) -> String {
    let stripped = filename
        .strip_prefix("ggml-")
        .unwrap_or(filename)
        .strip_suffix(".bin")
        .unwrap_or(filename.strip_prefix("ggml-").unwrap_or(filename));

    match stripped.rfind('-') {
        Some(idx) => {
            let (head, tail) = stripped.split_at(idx);
            let quant = &tail[1..]; // skip the '-'
            let is_quant = quant.len() > 1
                && (quant.starts_with('q') || quant.starts_with('Q') || quant.starts_with('f') || quant.starts_with('F'))
                && quant.chars().skip(1).next().map(|c| c.is_ascii_digit()).unwrap_or(false);
            if is_quant {
                head.to_string()
            } else {
                stripped.to_string()
            }
        }
        None => stripped.to_string(),
    }
}

pub fn derive_label(id: &str) -> String {
    id.split('-')
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --locked models::tests`
Expected: all 7 tests PASS.

- [ ] **Step 5: Register module and commit**

In `server/src/main.rs`, add `mod models;` alongside the existing `mod` declarations (after `mod logging;`).

Run: `cargo build --locked` — expected PASS (unused-code warnings are fine, `ModelInfo` will be used in Task 5).

```bash
git add server/src/models.rs server/src/main.rs
git commit -m "feat(server): add model id/label derivation"
```

---

## Task 2: Config — `ModelConfig`, `ModelCatalogEntry`, `GpuConfig`

**Files:**
- Modify: `server/src/config.rs`

- [ ] **Step 1: Write failing tests**

Add to the `#[cfg(test)] mod tests` block at the end of `server/src/config.rs`:

```rust
    #[test]
    fn model_config_defaults_to_five_catalog_entries() {
        let cfg = ModelConfig::default();
        assert_eq!(cfg.dir, "./models");
        assert_eq!(cfg.default_model, "base");
        assert_eq!(cfg.catalog.len(), 5);
        assert_eq!(cfg.catalog[0].filename, "ggml-tiny-q5_1.bin");
        assert_eq!(cfg.catalog[0].quality, "fast");
        assert!(!cfg.catalog[0].gpu);
    }

    #[test]
    fn model_catalog_entry_deserializes_from_toml_with_gpu_default_false() {
        let toml_str = r#"
            filename = "ggml-large-v3-q5_0.bin"
            quality = "best"
        "#;
        let entry: ModelCatalogEntry = toml::from_str(toml_str).unwrap();
        assert_eq!(entry.filename, "ggml-large-v3-q5_0.bin");
        assert_eq!(entry.quality, "best");
        assert!(!entry.gpu);
    }

    #[test]
    fn model_catalog_entry_deserializes_gpu_true_when_present() {
        let toml_str = r#"
            filename = "ggml-large-v3-q5_0.bin"
            quality = "best"
            gpu = true
        "#;
        let entry: ModelCatalogEntry = toml::from_str(toml_str).unwrap();
        assert!(entry.gpu);
    }

    #[test]
    fn gpu_config_defaults_disabled_device_zero() {
        let cfg = GpuConfig::default();
        assert!(!cfg.enabled);
        assert_eq!(cfg.device, 0);
    }

    #[test]
    fn gpu_config_deserializes_from_toml() {
        let toml_str = r#"
            enabled = true
            device = 1
        "#;
        let cfg: GpuConfig = toml::from_str(toml_str).unwrap();
        assert!(cfg.enabled);
        assert_eq!(cfg.device, 1);
    }

    #[test]
    fn env_overrides_model_dir_and_default() {
        let mut cfg = Config::default();
        std::env::set_var("WHISDOM_MODEL_DIR", "/tmp/custom-models");
        std::env::set_var("WHISDOM_MODEL_DEFAULT", "small");
        cfg.apply_env_overrides();
        assert_eq!(cfg.model.dir, "/tmp/custom-models");
        assert_eq!(cfg.model.default_model, "small");
        std::env::remove_var("WHISDOM_MODEL_DIR");
        std::env::remove_var("WHISDOM_MODEL_DEFAULT");
    }

    #[test]
    fn env_overrides_gpu_enabled_and_device() {
        let mut cfg = Config::default();
        std::env::set_var("WHISDOM_GPU_ENABLED", "true");
        std::env::set_var("WHISDOM_GPU_DEVICE", "2");
        cfg.apply_env_overrides();
        assert!(cfg.gpu.enabled);
        assert_eq!(cfg.gpu.device, 2);
        std::env::remove_var("WHISDOM_GPU_ENABLED");
        std::env::remove_var("WHISDOM_GPU_DEVICE");
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --locked config::tests`
Expected: compile errors (`ModelConfig`/`ModelCatalogEntry`/`GpuConfig` don't have these shapes yet, `apply_env_overrides` isn't a public/testable method the way tests call it, `Config` has no `gpu` field).

First check the existing `apply_env_overrides` visibility/signature in `server/src/config.rs` (it is a `Config` method taking `&mut self`, called from `Config::load()`); tests above assume `cfg.apply_env_overrides()` is directly callable — confirm it is `pub(crate)` or `pub fn apply_env_overrides(&mut self)`; if it's private module-level, keep it as an inherent method on `Config` (it already is, per existing code) so the test in the same file can call it directly.

- [ ] **Step 3: Implement config changes**

Replace the existing `ModelConfig` struct and its `Default` impl with:

```rust
pub struct ModelConfig {
    #[serde(default = "default_model_dir")]
    pub dir: String,
    #[serde(default = "default_model_default")]
    pub default_model: String,
    #[serde(default = "default_model_catalog")]
    pub catalog: Vec<ModelCatalogEntry>,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, PartialEq)]
pub struct ModelCatalogEntry {
    pub filename: String,
    pub quality: String,
    #[serde(default)]
    pub gpu: bool,
}

fn default_model_dir() -> String {
    "./models".to_string()
}

fn default_model_default() -> String {
    "base".to_string()
}

fn default_model_catalog() -> Vec<ModelCatalogEntry> {
    vec![
        ModelCatalogEntry { filename: "ggml-tiny-q5_1.bin".to_string(), quality: "fast".to_string(), gpu: false },
        ModelCatalogEntry { filename: "ggml-base-q5_1.bin".to_string(), quality: "balanced".to_string(), gpu: false },
        ModelCatalogEntry { filename: "ggml-small-q5_1.bin".to_string(), quality: "high".to_string(), gpu: false },
        ModelCatalogEntry { filename: "ggml-medium-q5_0.bin".to_string(), quality: "high".to_string(), gpu: false },
        ModelCatalogEntry { filename: "ggml-large-v3-q5_0.bin".to_string(), quality: "best".to_string(), gpu: false },
    ]
}

impl Default for ModelConfig {
    fn default() -> Self {
        ModelConfig {
            dir: default_model_dir(),
            default_model: default_model_default(),
            catalog: default_model_catalog(),
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, PartialEq)]
pub struct GpuConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub device: i32,
}

impl Default for GpuConfig {
    fn default() -> Self {
        GpuConfig { enabled: false, device: 0 }
    }
}
```

Remove the old single-field `ModelConfig{path}` struct, its `Default` impl, and `default_model_path()` fn (they are being replaced). Remove the `model_path(&self) -> &str` accessor (line ~300-302) — it will be replaced by registry-based lookups in Task 5.

Add `gpu: GpuConfig` field to the `Config` struct and its `Default` impl (alongside the other 7 sub-configs, `#[serde(default)]`).

In `apply_env_overrides()`, replace the `apply_env_string("WHISDOM_MODEL_PATH", &mut cfg.model.path)` line with:

```rust
apply_env_string("WHISDOM_MODEL_DIR", &mut self.model.dir);
apply_env_string("WHISDOM_MODEL_DEFAULT", &mut self.model.default_model);
apply_env_bool("WHISDOM_GPU_ENABLED", &mut self.gpu.enabled);
apply_env_i32("WHISDOM_GPU_DEVICE", &mut self.gpu.device);
```

`apply_env_i32` doesn't exist yet — add it next to `apply_env_usize` following the identical pattern:

```rust
fn apply_env_i32(key: &str, target: &mut i32) {
    if let Ok(value) = std::env::var(key) {
        if let Ok(parsed) = value.parse::<i32>() {
            *target = parsed;
        }
    }
}
```

In `resolve_paths(&mut self)`, replace the `resolve(&mut self.model.path)` call with `resolve(&mut self.model.dir)` (the existing single-path `resolve()` helper works unchanged on a directory string).

In `server/src/main.rs`, replace the model-parent-dir-creation block (`Path::new(config.model_path()).parent()...`) with directly ensuring `config.model.dir` exists:

```rust
std::fs::create_dir_all(&config.model.dir)
    .unwrap_or_else(|e| panic!("failed to create model directory '{}': {e}", config.model.dir));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --locked config::tests`
Expected: all new tests PASS plus the 4 pre-existing config tests still PASS.

Run: `cargo build --locked`
Expected: PASS (Task 5+ will consume `ModelInfo`/registry; `model_path()` accessor removal will cause compile errors in `pipeline/run.rs` and `main.rs` until Tasks 5/8 are done — if `cargo build` fails here due to those downstream references, that's expected and acceptable at this intermediate step; run `cargo check --locked -p whisdom-server --lib 2>&1 | head -50` to confirm the only errors are in `pipeline/run.rs`/`main.rs` referencing the removed `model_path()`, not in `config.rs` itself).

- [ ] **Step 5: Commit**

```bash
git add server/src/config.rs server/src/main.rs
git commit -m "feat(server): add dynamic model catalog and GPU config"
```

---

## Task 3: `config.toml` and `.env.example` Updates

**Files:**
- Modify: `server/config.toml`
- Modify: `server/.env.example`

- [ ] **Step 1: Update `server/config.toml`**

Replace the current `[model]` section:
```toml
[model]
path = "./models/ggml-base-q5_1.bin"
```
with:
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

[gpu]
enabled = false
device = 0
```

- [ ] **Step 2: Update `server/.env.example`**

Replace the `WHISDOM_MODEL_PATH=./models/ggml-base-q5_1.bin` line with:
```
WHISDOM_MODEL_DIR=./models
WHISDOM_MODEL_DEFAULT=base
```

Add a new GPU section (after the model lines):
```
# GPU (requires a GPU-enabled build via `cargo build --features cuda|vulkan|hipblas`)
WHISDOM_GPU_ENABLED=false
WHISDOM_GPU_DEVICE=0
```

- [ ] **Step 3: Verify TOML parses**

Run (from `server/`): `cargo run --locked -- --help 2>&1 | head -5` is not applicable (no `--help` flag); instead verify via a quick focused test — add a temporary assertion is unnecessary since Task 2's tests already cover parsing shape. Instead run:

`cargo test --locked config::tests` (should still pass, confirming `ModelConfig`/`GpuConfig` Default matches what's now in `config.toml`).

Also manually check file validity: `Get-Content server/config.toml` (visually confirm 5 `[[model.catalog]]` blocks and `[gpu]` section present, no syntax errors).

- [ ] **Step 4: Commit**

```bash
git add server/config.toml server/.env.example
git commit -m "docs(server): document dynamic model catalog and GPU config"
```

---

## Task 4: `Cargo.toml` GPU Feature Flags

**Files:**
- Modify: `server/Cargo.toml`

- [ ] **Step 1: Add features section**

Add after the `[dependencies]` block (before `[dev-dependencies]`):

```toml
[features]
cuda = ["whisper-rs/cuda"]
vulkan = ["whisper-rs/vulkan"]
hipblas = ["whisper-rs/hipblas"]
```

- [ ] **Step 2: Verify default (CPU-only) build still works**

Run: `cargo build --locked`
Expected: PASS, unchanged behavior (no features enabled by default).

- [ ] **Step 3: Commit**

```bash
git add server/Cargo.toml
git commit -m "feat(server): add optional cuda/vulkan/hipblas GPU features"
```

Note: GPU feature builds (`cargo build --features cuda`) are NOT run in this plan's verification steps — they require GPU toolchains not assumed present in the dev/CI environment. Only the default CPU-only build is verified end-to-end.

---

## Task 5: `ModelRegistry` and Startup Preload

**Files:**
- Modify: `server/src/models.rs` (add `ModelRegistry`, `ModelEntry`, preload function)
- Modify: `server/src/main.rs` (wire preload into startup, update `AppState`, update `build_app` signature)

- [ ] **Step 1: Write failing tests for `ModelRegistry` construction and semaphore behavior**

Add to `server/src/models.rs`, above the existing `mod tests`:

```rust
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Semaphore;
use whisper_rs::WhisperContext;

struct ModelEntry {
    info: ModelInfo,
    context: Arc<WhisperContext>,
    semaphore: Arc<Semaphore>,
}

pub struct ModelRegistry {
    entries: HashMap<String, ModelEntry>,
    default_id: String,
}

impl ModelRegistry {
    pub fn get(&self, id: &str) -> Option<(Arc<WhisperContext>, Arc<Semaphore>)> {
        self.entries
            .get(id)
            .map(|e| (Arc::clone(&e.context), Arc::clone(&e.semaphore)))
    }

    pub fn info(&self, id: &str) -> Option<&ModelInfo> {
        self.entries.get(id).map(|e| &e.info)
    }

    pub fn default_id(&self) -> &str {
        &self.default_id
    }

    pub fn available(&self) -> impl Iterator<Item = &ModelInfo> {
        self.entries.values().map(|e| &e.info)
    }
}
```

Add tests (in the existing `#[cfg(test)] mod tests` block, extend `use super::*;`):

```rust
    fn make_test_registry(models: Vec<(&str, u64)>, default_id: &str) -> ModelRegistry {
        // Builds a ModelRegistry backed by dummy contexts loaded from a tiny
        // real ggml file is impractical in unit tests; instead this helper
        // is only used to test the semaphore/lookup logic in isolation via
        // a registry constructed directly from a HashMap, bypassing preload.
        unimplemented!("replaced by semaphore_blocks_second_concurrent_acquire below")
    }

    #[tokio::test]
    async fn semaphore_blocks_second_concurrent_acquire_until_first_drops() {
        let sem = Arc::new(Semaphore::new(1));
        let permit1 = sem.clone().acquire_owned().await.unwrap();

        let sem2 = Arc::clone(&sem);
        let mut second = tokio::spawn(async move { sem2.acquire_owned().await });

        // Give the spawned task a chance to run; it must NOT complete yet.
        tokio::select! {
            _ = &mut second => panic!("second acquire completed before first permit was dropped"),
            _ = tokio::time::sleep(std::time::Duration::from_millis(50)) => {}
        }

        drop(permit1);
        let permit2 = second.await.unwrap().unwrap();
        drop(permit2);
    }
```

Remove the unused `make_test_registry`/`unimplemented!` helper — it was scaffolding only; delete it before running tests (it is not referenced by any test and would trigger a dead-code warning, not a compile failure, but should not be left in).

- [ ] **Step 2: Run tests to verify they fail (compile-check first)**

Run: `cargo test --locked models::tests`
Expected: fails to compile initially because `whisper-rs`/`tokio::sync::Semaphore` imports and `ModelRegistry` are new — after adding the code in Step 1 exactly as shown it should actually compile and the semaphore test should PASS immediately (this is testing tokio/Semaphore's own documented behavior, not new logic). Confirm it passes: this test's purpose is regression protection for Task 5's later use of the same 1-permit-semaphore pattern in `pipeline/run.rs` (Task 8).

- [ ] **Step 3: Implement `preload_models` async function**

Add to `server/src/models.rs`:

```rust
use crate::config::Config;
use std::path::Path;
use tracing::{error, info};
use whisper_rs::{WhisperContextParameters, WhisperError};

#[derive(Debug)]
pub enum PreloadError {
    NoModelsLoaded,
    DefaultModelNotLoaded { requested: String },
    DuplicateModelId { id: String },
}

impl std::fmt::Display for PreloadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PreloadError::NoModelsLoaded => write!(f, "no models could be loaded from the configured catalog"),
            PreloadError::DefaultModelNotLoaded { requested } => {
                write!(f, "configured default model '{requested}' was not successfully loaded")
            }
            PreloadError::DuplicateModelId { id } => {
                write!(f, "duplicate derived model id '{id}' in catalog; filenames must produce unique ids")
            }
        }
    }
}

impl std::error::Error for PreloadError {}

/// Preloads every catalog entry whose file exists under `config.model.dir`,
/// in parallel, building a `ModelRegistry`. Fails fast if the configured
/// default model isn't loaded, if zero models load, or if two catalog
/// entries derive the same id.
pub async fn preload_models(config: &Config) -> Result<ModelRegistry, PreloadError> {
    let dir = Path::new(&config.model.dir);

    // Derive ids up front and check for duplicates before spawning any work.
    let mut seen_ids = std::collections::HashSet::new();
    let mut candidates = Vec::new();
    for entry in &config.model.catalog {
        let id = derive_id(&entry.filename);
        if !seen_ids.insert(id.clone()) {
            return Err(PreloadError::DuplicateModelId { id });
        }
        let path = dir.join(&entry.filename);
        if path.exists() {
            candidates.push((id, entry.clone(), path));
        } else {
            info!(filename = %entry.filename, "model file not found, skipping");
        }
    }

    let gpu_enabled = config.gpu.enabled;
    let gpu_device = config.gpu.device;

    let mut tasks = Vec::new();
    for (id, entry, path) in candidates {
        let effective_gpu = gpu_enabled && entry.gpu;
        tasks.push(tokio::task::spawn_blocking(move || {
            let started = std::time::Instant::now();
            let size_bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            let size_mb = size_bytes / (1024 * 1024);

            let mut params = WhisperContextParameters::default();
            params.use_gpu(effective_gpu);
            if effective_gpu {
                params.gpu_device(gpu_device);
            }

            let load_result: Result<WhisperContext, WhisperError> =
                WhisperContext::new_with_params(&path.to_string_lossy(), params);

            (id, entry, size_mb, effective_gpu, gpu_device, started.elapsed(), load_result)
        }));
    }

    let results = futures::future::join_all(tasks).await;

    let mut entries = HashMap::new();
    for joined in results {
        let (id, entry, size_mb, gpu, device, elapsed, load_result) = match joined {
            Ok(v) => v,
            Err(e) => {
                error!(error = %e, "model preload task panicked");
                continue;
            }
        };
        match load_result {
            Ok(context) => {
                info!(
                    model_id = %id,
                    size_mb,
                    gpu,
                    device,
                    duration_ms = elapsed.as_millis() as u64,
                    "model loaded"
                );
                let label = derive_label(&id);
                entries.insert(
                    id.clone(),
                    ModelEntry {
                        info: ModelInfo { id, label, filename: entry.filename, size_mb, quality: entry.quality, gpu },
                        context: Arc::new(context),
                        semaphore: Arc::new(Semaphore::new(1)),
                    },
                );
            }
            Err(e) => {
                error!(model_id = %id, error = %e, "failed to load model, excluding from registry");
            }
        }
    }

    if entries.is_empty() {
        return Err(PreloadError::NoModelsLoaded);
    }

    let default_id = config.model.default_model.clone();
    if !entries.contains_key(&default_id) {
        return Err(PreloadError::DefaultModelNotLoaded { requested: default_id });
    }

    Ok(ModelRegistry { entries, default_id })
}
```

Add `futures = "0.3"` usage note: it's already a dependency in `Cargo.toml` (confirmed in Task-context), so no `Cargo.toml` change needed for `futures::future::join_all`.

- [ ] **Step 4: Wire into `main.rs`**

In `server/src/main.rs`, update `AppState`:

```rust
#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub queue: Queue,
    pub model_registry: Arc<models::ModelRegistry>,
}
```

Add `use std::sync::Arc;` if not already imported.

Update `build_app` signature to accept the registry:

```rust
pub fn build_app(config: Config, queue: Queue, model_registry: Arc<models::ModelRegistry>) -> axum::Router {
    // ...existing body...
    let state = AppState { config, queue, model_registry };
    // ...rest unchanged...
}
```

In `main()`, after `config.resolve_paths()` and `logging::init(&config)` and directory creation, insert:

```rust
let model_registry = match models::preload_models(&config).await {
    Ok(registry) => Arc::new(registry),
    Err(e) => {
        tracing::error!(error = %e, "failed to preload models, server cannot start");
        std::process::exit(1);
    }
};
```

Update the `build_app(config, Queue::new())` call to `build_app(config, Queue::new(), model_registry)`.

- [ ] **Step 5: Update existing 6 multipart tests in `main.rs`**

The existing test module's 6 tests call `build_app(test_config(...), Queue::new())` directly. Add a test-only helper that builds a minimal fake registry so these unrelated multipart tests keep compiling and passing without requiring real ggml files on disk:

```rust
    fn test_model_registry() -> Arc<models::ModelRegistry> {
        // Empty registry is fine for multipart-body-limit tests — they never
        // reach model resolution logic (audio parsing fails/succeeds before
        // model lookup in routes/transcribe.rs, per Task 9's ordering).
        Arc::new(models::ModelRegistry::empty_for_tests())
    }
```

This requires adding a test-only constructor to `ModelRegistry` in `server/src/models.rs`:

```rust
impl ModelRegistry {
    #[cfg(test)]
    pub fn empty_for_tests() -> Self {
        ModelRegistry { entries: HashMap::new(), default_id: String::new() }
    }
}
```

Update each of the 6 existing test call sites from `build_app(test_config(...), Queue::new())` to `build_app(test_config(...), Queue::new(), test_model_registry())`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cargo test --locked`
Expected: all existing tests (config: ~10, models: ~9, main: 6) PASS. Note: `preload_models` itself is not directly unit-tested here (it requires real ggml files); its sub-behaviors (`derive_id`/`derive_label`, semaphore) are covered. This is an acceptable gap — flag it in the plan's self-review as a residual manual/integration-only verification item.

Run: `cargo build --locked`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/models.rs server/src/main.rs
git commit -m "feat(server): preload whisper models in parallel at startup"
```

---

## Task 6: `Job` Gains `model_id` Field

**Files:**
- Modify: `server/src/job.rs`

- [ ] **Step 1: Add field**

In `server/src/job.rs`, add `model_id: String` to the `Job` struct, immediately after the existing `language: Option<String>` field:

```rust
pub struct Job {
    pub id: JobId,
    pub email: String,
    pub input: JobInput,
    pub language: Option<String>,
    pub model_id: String,
    // ...existing fields unchanged...
}
```

- [ ] **Step 2: Run build to find all call sites needing the new field**

Run: `cargo build --locked 2>&1 | Select-String "missing field"`
Expected: compile errors at every `Job { ... }` construction site missing `model_id` — primarily `server/src/routes/transcribe.rs` (fixed in Task 9) and the test helper(s) in `server/src/main.rs` if any construct `Job` directly (unlikely based on prior exploration — tests use HTTP requests, not direct `Job` construction). Confirm no other construction sites exist via: `rg "Job \{" server/src --type rust`.

This step is diagnostic only — do not fix `routes/transcribe.rs` here, that's Task 9's job. Expect the build to remain broken until Task 9 completes; this is acceptable mid-plan state.

- [ ] **Step 3: Commit**

```bash
git add server/src/job.rs
git commit -m "feat(server): add model_id field to Job"
```

---

## Task 7: `transcribe_wav` Accepts Preloaded Context

**Files:**
- Modify: `server/src/pipeline/transcribe.rs`

- [ ] **Step 1: Update `TranscribeOptions` and `transcribe_wav` signature**

Remove `model_path: String` from `TranscribeOptions`:

```rust
pub struct TranscribeOptions {
    pub threads: usize,
    pub language: Option<String>,
}
```

Change `transcribe_wav` signature and remove the internal context-loading lines:

```rust
pub fn transcribe_wav(
    wav_path: &Path,
    context: &WhisperContext,
    options: &TranscribeOptions,
    cancel_flag: Arc<AtomicBool>,
) -> Result<Vec<TranscriptSegment>, AppError> {
    let mut state = context.create_state().map_err(|e| AppError::Internal(format!("failed to create whisper state: {e}")))?;
    // ...rest of function body UNCHANGED from here down (FullParams, language,
    // WAV validation, sample conversion, cancel checks, segment extraction)...
}
```

Delete the old lines that built `model_path`/`ctx_params`/`WhisperContext::new_with_params` (the removed context-loading block).

- [ ] **Step 2: Run build to confirm this file compiles standalone**

Run: `cargo check --locked -p whisdom-server --lib 2>&1 | Select-String "pipeline/transcribe.rs"`
Expected: no errors originating from `transcribe.rs` itself (errors in `run.rs` calling this function with the old signature are expected and fixed in Task 8).

- [ ] **Step 3: Commit**

```bash
git add server/src/pipeline/transcribe.rs
git commit -m "feat(server): transcribe_wav accepts preloaded WhisperContext"
```

---

## Task 8: `pipeline/run.rs` — Thread Model Registry, Add Semaphore

**Files:**
- Modify: `server/src/pipeline/run.rs`

- [ ] **Step 1: Update `run_pipeline` signature and destructure**

Change:
```rust
pub async fn run_pipeline(job: &Arc<Mutex<Job>>, config: &Config, queue: &Queue) {
```
to:
```rust
pub async fn run_pipeline(
    job: &Arc<Mutex<Job>>,
    config: &Config,
    queue: &Queue,
    model_registry: &Arc<crate::models::ModelRegistry>,
) {
```

Update the initial destructure (lines ~18-26) to also extract `model_id`:
```rust
let (id, input, language, model_id, work_dir) = {
    let locked = job.lock().await;
    (
        locked.id.clone(),
        locked.input.clone(),
        locked.language.clone(),
        locked.model_id.clone(),
        locked.work_dir.clone(),
    )
};
```

Update the `execute(...)` call to pass `&model_id` and `model_registry`:
```rust
let result = execute(&id, &input, &language, &model_id, &work_dir, config, queue, model_registry, &cancel_flag).await;
```

- [ ] **Step 2: Update `execute` signature and model resolution**

Change signature:
```rust
async fn execute(
    id: &str,
    input: &JobInput,
    language: &Option<String>,
    model_id: &str,
    work_dir: &PathBuf,
    config: &Config,
    queue: &Queue,
    model_registry: &Arc<crate::models::ModelRegistry>,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<Vec<TranscriptSegment>, AppError> {
```

Replace the `TranscribeOptions` construction block (the old `model_path: config.model_path().to_string()` line) with:

```rust
let (context, semaphore) = model_registry
    .get(model_id)
    .ok_or_else(|| AppError::Internal(format!("model '{model_id}' not loaded")))?;

let options = TranscribeOptions {
    threads: config.threads(),
    language: language.as_ref().and_then(|l| if l != "auto" { Some(l.clone()) } else { None }),
};

tracing::debug!(model_id, threads = options.threads, ?options.language, "transcribe options resolved");

let permit = semaphore
    .acquire_owned()
    .await
    .map_err(|e| AppError::Internal(format!("model semaphore closed: {e}")))?;
```

Update the `spawn_blocking` call:
```rust
let audio_clone = audio_path.clone();
let flag = Arc::clone(cancel_flag);
let context_clone = Arc::clone(&context);
let segments = tokio::task::spawn_blocking(move || {
    let result = transcribe::transcribe_wav(&audio_clone, &context_clone, &options, flag);
    drop(permit);
    result
})
.await
.map_err(|e| AppError::Internal(format!("spawn_blocking join error: {e}")))??;
```

- [ ] **Step 3: Run build to confirm compile errors are now isolated to the call site**

Run: `cargo check --locked -p whisdom-server --lib 2>&1 | Select-String "error"`
Expected: remaining errors only in `routes/transcribe.rs` (Task 9's `run_pipeline(...)` call site needs the new `model_registry` arg, and `Job` construction needs `model_id`).

- [ ] **Step 4: Commit**

```bash
git add server/src/pipeline/run.rs
git commit -m "feat(server): resolve model from registry with per-model semaphore"
```

---

## Task 9: `routes/transcribe.rs` — Parse `model` Field, Resolve, Validate

**Files:**
- Modify: `server/src/routes/transcribe.rs`

- [ ] **Step 1: Write a failing router test for unknown model (expect 400) and omitted model (expect default)**

Add to `server/src/main.rs`'s test module (or a new `#[cfg(test)]` block in `routes/transcribe.rs` if router-level testing is more naturally colocated there — follow existing convention: prior multipart tests live in `main.rs`, so add there):

```rust
    #[tokio::test]
    async fn transcribe_rejects_unknown_model_with_400() {
        let config = test_config(1);
        let temp = tempfile::tempdir().unwrap();
        let app = build_app(config, Queue::new(), test_model_registry());

        let body = multipart_request(&[
            ("audio", Some("test.wav"), &vec![0u8; 100]),
            ("model", None, b"nonexistent-model"),
        ]);

        let response = app
            .oneshot(
                axum::http::Request::builder()
                    .method("POST")
                    .uri("/api/transcribe")
                    .header("content-type", "multipart/form-data; boundary=X-BOUNDARY")
                    .header("authorization", "Bearer dev-mode")
                    .body(axum::body::Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), axum::http::StatusCode::BAD_REQUEST);
    }
```

Note: exact `multipart_request` helper signature/boundary string must match the existing helper in `main.rs` precisely (it already exists per prior exploration at lines ~124-144) — adapt the test body construction to call the EXISTING helper's actual signature rather than inventing a new one; if the helper only supports file fields (not arbitrary text fields like `model`), extend `multipart_request` to accept an optional list of `(name, value)` text fields, or hand-construct the multipart body bytes directly for this test using the same boundary convention as the existing helper.

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --locked transcribe_rejects_unknown_model_with_400`
Expected: FAIL — either compile error (no `model` field parsed yet, so it's silently ignored and the request proceeds to 200) or a wrong-status assertion failure.

- [ ] **Step 3: Implement model field parsing and resolution**

In `server/src/routes/transcribe.rs`, add to the mutable-locals declaration block:
```rust
let mut model: Option<String> = None;
```

Add a new match arm in the multipart loop, mirroring the existing `"language"` arm exactly:
```rust
"model" => {
    let value = field.text().await.map_err(multipart_error)?;
    if !value.is_empty() {
        model = Some(value);
    }
}
```

After the multipart loop (near the existing debug-log of parsed input), add model resolution:
```rust
let resolved_model_id = match model {
    Some(requested) => {
        if state.model_registry.info(&requested).is_none() {
            return Err(AppError::BadRequest(format!("model '{requested}' is not available on this server")));
        }
        requested
    }
    None => state.model_registry.default_id().to_string(),
};

tracing::debug!(model_id = %resolved_model_id, "resolved model for job");
```

Update the `Job { ... }` construction to include the new field:
```rust
let job = Job {
    id: job_id.clone(),
    email,
    input,
    language,
    model_id: resolved_model_id,
    phase: JobPhase::Queued,
    // ...rest unchanged...
};
```

Update the `tokio::spawn` block to thread the registry through:
```rust
let model_registry_clone = Arc::clone(&state.model_registry);
tokio::spawn(async move {
    run::run_pipeline(&job_clone, &config_clone, &queue_clone, &model_registry_clone).await;
    queue_clone.remove(&id).await;
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --locked`
Expected: `transcribe_rejects_unknown_model_with_400` PASSES; all prior tests still PASS (multipart size/limit tests, config tests, models tests).

Add a second quick test confirming omitted-model falls back to default (extend the same test module):
```rust
    #[tokio::test]
    async fn transcribe_uses_default_model_when_omitted() {
        // Build app with a registry containing one fake-but-registered model
        // as default, submit without a "model" field, and assert 200 + that
        // the job was accepted (status endpoint reachable), OR at minimum
        // assert the request is NOT rejected with 400 (since a fully fake
        // context can't actually run inference without a real ggml file).
        // Use test_model_registry() (empty) is insufficient here since it
        // has no default_id — this test requires a registry with at least
        // one real entry, which requires a real ggml file. Mark this test
        // #[ignore] with a comment explaining the real-model requirement,
        // and cover the omitted-model default-fallback logic via a focused
        // unit test on the resolution branch alone (extract resolution
        // logic into a small pure function if needed for testability).
    }
```

Given the registry requires either empty (no default) or real files, extract the resolution logic into a small pure helper for isolated unit testing:

```rust
fn resolve_model_id(requested: Option<String>, registry: &crate::models::ModelRegistry) -> Result<String, AppError> {
    match requested {
        Some(id) => {
            if registry.info(&id).is_none() {
                return Err(AppError::BadRequest(format!("model '{id}' is not available on this server")));
            }
            Ok(id)
        }
        None => Ok(registry.default_id().to_string()),
    }
}
```

Use this helper in the handler instead of the inline logic from Step 3, and add tests exercising it directly with `ModelRegistry::empty_for_tests()` plus a registry-with-default test constructor (add `#[cfg(test)] pub fn with_default_for_tests(id: &str) -> Self` to `ModelRegistry` in `server/src/models.rs`, inserting a fake `ModelEntry` — note `ModelEntry.context` requires a real `WhisperContext`, which cannot be constructed without a file; instead change `resolve_model_id`'s tests to only exercise the `None`-registry-empty-default-id case, i.e. `registry.default_id()` returning `""` for the empty test registry, asserting the omitted-model path returns `Ok("".to_string())` — this proves the omitted branch calls `default_id()` correctly without needing a loaded context):

```rust
    #[test]
    fn resolve_model_id_returns_default_when_omitted() {
        let registry = crate::models::ModelRegistry::empty_for_tests();
        let result = resolve_model_id(None, &registry);
        assert_eq!(result.unwrap(), ""); // empty_for_tests() has empty default_id
    }

    #[test]
    fn resolve_model_id_rejects_unknown_requested_id() {
        let registry = crate::models::ModelRegistry::empty_for_tests();
        let result = resolve_model_id(Some("nonexistent".to_string()), &registry);
        assert!(result.is_err());
    }
```

Run: `cargo test --locked resolve_model_id`
Expected: both PASS.

- [ ] **Step 5: Full server test suite**

Run: `cargo test --locked`
Expected: all tests pass (baseline ~29 + new model/config/router tests).

Run: `cargo build --locked`
Expected: PASS with zero errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/transcribe.rs server/src/models.rs
git commit -m "feat(server): validate and resolve per-request model selection"
```

---

## Task 10: `/api/capabilities` Returns Loaded Models

**Files:**
- Modify: `server/src/routes/capabilities.rs`

- [ ] **Step 1: Write failing test**

Add a router test (in `server/src/main.rs`'s test module, following existing conventions) — since `test_model_registry()` is empty, assert the shape rather than specific model content:

```rust
    #[tokio::test]
    async fn capabilities_includes_models_and_default_model_fields() {
        let config = test_config(1);
        let app = build_app(config, Queue::new(), test_model_registry());

        let response = app
            .oneshot(
                axum::http::Request::builder()
                    .method("GET")
                    .uri("/api/capabilities")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), axum::http::StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert!(json.get("models").is_some());
        assert!(json.get("default_model").is_some());
        assert_eq!(json["models"].as_array().unwrap().len(), 0); // empty test registry
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --locked capabilities_includes_models_and_default_model_fields`
Expected: FAIL (current handler has no `State` param, returns static JSON without `models`/`default_model` keys — also likely a compile error since the route currently takes no extractor and this test doesn't need changing router wiring, just the handler body).

- [ ] **Step 3: Implement**

Replace `server/src/routes/capabilities.rs` entirely:

```rust
use axum::extract::State;
use axum::Json;
use serde_json::{json, Value};

use crate::main::AppState; // adjust import path to match actual AppState location

pub async fn capabilities(State(state): State<AppState>) -> Json<Value> {
    let models: Vec<Value> = state
        .model_registry
        .available()
        .map(|m| json!({"id": m.id, "label": m.label, "size_mb": m.size_mb, "quality": m.quality}))
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

Note: verify the actual import path for `AppState` (it's defined in `server/src/main.rs`; since Rust binary crates can't be imported as `crate::main::AppState` from a submodule the way a library crate would, check whether `server/src/lib.rs` exists or if `AppState` needs to move to a shared module, e.g. `server/src/state.rs`, imported by both `main.rs` and `routes/`. If no `lib.rs` exists and `main.rs` currently exposes `AppState` to `routes/capabilities.rs` via `pub(crate)`/`crate::AppState` already (since other route handlers like `transcribe.rs` already use `State<AppState>` successfully per existing code), mirror the EXACT import statement already used in `server/src/routes/transcribe.rs` for `AppState` rather than guessing — copy that import line directly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --locked`
Expected: all pass including the new capabilities test.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/capabilities.rs
git commit -m "feat(server): expose loaded models via /api/capabilities"
```

---

## Task 11: Full Server Verification Checkpoint

**Files:** None (verification only).

- [ ] **Step 1: Run full server test suite**

Run: `cargo test --locked` (from `server/`)
Expected: all tests PASS (baseline 32 + new tests from Tasks 1,2,5,9,10 — expect roughly 45-50 total).

- [ ] **Step 2: Run build**

Run: `cargo build --locked`
Expected: PASS, zero errors.

- [ ] **Step 3: Run strict Clippy, compare against known baseline**

Run: `cargo clippy --all-targets --all-features --locked -- -D warnings`
Expected: only the 3 known pre-existing baseline warnings (derivable `Default` at `config.rs`, `ok_or_else` at `queue.rs:61`, single-match at `routes/progress.rs:47`) — note `config.rs`'s derivable-Default warning may shift line numbers after Task 2's edits; if new warnings appear in `models.rs`, `run.rs`, `transcribe.rs`, or `routes/transcribe.rs`/`capabilities.rs`, fix them (do not suppress) before proceeding.

- [ ] **Step 4: Manual smoke test (requires a real downloaded model)**

This step requires at least one real ggml file present at `server/models/`. If `server/models/ggml-base-q5_1.bin` is still missing (per earlier session diagnosis), download it first:
```bash
bash server/scripts/download-model.sh ./server/models ggml-base-q5_1.bin
```
Then run the server manually and confirm startup logs show the model loaded:
```bash
cd server; cargo run --locked
```
Expected log output includes a line like `model loaded model_id="base" size_mb=... gpu=false duration_ms=...` and the server binds successfully. Stop the server (Ctrl+C) once confirmed — do not leave it running.

If no model file is available and downloading is not desired at this point, skip this step and note it as a deferred manual verification item in the final summary.

- [ ] **Step 5: Do not commit** (this task is verification-only; no files changed).

---

## Task 12: Client — Types, API, Settings

**Files:**
- Modify: `src/features/server-transcription/types.ts`
- Modify: `src/features/server-transcription/api.ts`
- Modify: `src/features/transcription/types.ts`
- Modify: `src/features/transcription/models.ts`
- Test: `tests/unit/server-api.test.ts`

- [ ] **Step 1: Write failing unit test for `submitJob` model field**

In `tests/unit/server-api.test.ts`, add (this file currently only tests status types per prior exploration — add real `ServerTranscriptionApi` coverage):

```ts
import { describe, expect, it, vi } from "vitest"
import { ServerTranscriptionApi } from "../../src/features/server-transcription/api"

describe("ServerTranscriptionApi.submitJob", () => {
  it("appends model field to form data when modelId is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job_id: "job-1" }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const api = new ServerTranscriptionApi("https://example.test", () => "token")
    await api.submitJob({ type: "url", url: "https://media.test/a.mp3" }, "en", "small")

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    const formData = requestInit.body as FormData
    expect(formData.get("model")).toBe("small")
  })

  it("omits model field when modelId is not provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job_id: "job-2" }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const api = new ServerTranscriptionApi("https://example.test", () => "token")
    await api.submitJob({ type: "url", url: "https://media.test/a.mp3" }, "en")

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    const formData = requestInit.body as FormData
    expect(formData.get("model")).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/server-api.test.ts`
Expected: FAIL (TypeError — `submitJob` doesn't accept a 3rd argument yet, `formData.get("model")` never gets set).

- [ ] **Step 3: Implement type and API changes**

In `src/features/server-transcription/types.ts`, add `ServerModelInfo` and extend `ServerCapabilities`:
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

In `src/features/server-transcription/api.ts`, change `submitJob` signature and add the mirrored append:
```ts
async submitJob(input: TranscribeInput, language?: string, modelId?: string): Promise<string> {
  const form = new FormData()
  // ...existing file/url branches unchanged...
  if (language) {
    form.set("language", language)
  }
  if (modelId) {
    form.set("model", modelId)
  }
  // ...rest of method unchanged...
}
```

In `src/features/transcription/types.ts`, add to `AppSettings`:
```ts
export interface AppSettings {
  // ...existing fields...
  serverModelId: string | null
}
```

In `src/features/transcription/models.ts`, add to `DEFAULT_SETTINGS`:
```ts
export const DEFAULT_SETTINGS: AppSettings = {
  // ...existing fields...
  serverModelId: null,
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/server-api.test.ts`
Expected: both new tests PASS.

Run: `pnpm typecheck`
Expected: PASS (confirms `AppSettings`/`ServerCapabilities` extensions don't break existing usages — if `App.tsx` or IndexedDB settings code has exhaustive object literals missing `serverModelId`, fix those call sites now; Task 13 covers the main `App.tsx` settings usage but any OTHER file constructing a full `AppSettings` literal, e.g. settings-migration code in `src/features/storage/indexed-db.ts`, must also be updated here — search via `rg "AppSettings" src --type ts` and add `serverModelId: null` (or migrate existing persisted settings) wherever a full literal is constructed).

- [ ] **Step 5: Run full unit test suite**

Run: `pnpm test`
Expected: all tests pass (baseline 26 + 2 new = 28).

- [ ] **Step 6: Commit**

```bash
git add src/features/server-transcription/types.ts src/features/server-transcription/api.ts src/features/transcription/types.ts src/features/transcription/models.ts tests/unit/server-api.test.ts
git commit -m "feat(client): add server model selection to types and API"
```

---

## Task 13: Client — `preflight.ts` Warning Gating Fix

**Files:**
- Modify: `src/features/media/preflight.ts`

- [ ] **Step 1: Update the two mode-gate conditions**

In `buildWarnings()`, change:
```ts
if (getLocalModelDtype(model) === "q4" && settings.mode !== "cloudflare-ai") {
```
to:
```ts
if (getLocalModelDtype(model) === "q4" && settings.mode !== "cloudflare-ai" && settings.mode !== "server") {
```

And change:
```ts
if (settings.mode !== "cloudflare-ai" && requiresWebGpuForLocalModel(model) && recommendedModeFromStatus(...) !== "local-webgpu") {
```
to:
```ts
if (settings.mode !== "cloudflare-ai" && settings.mode !== "server" && requiresWebGpuForLocalModel(model) && recommendedModeFromStatus(...) !== "local-webgpu") {
```

(Preserve the exact existing `recommendedModeFromStatus(...)` argument list unchanged — only add the `&& settings.mode !== "server"` clause.)

- [ ] **Step 2: Run existing preflight tests to confirm no regression**

Run: `pnpm test` (there may not be dedicated preflight unit tests per prior exploration — if `tests/unit/` has no preflight-specific test file, this step just confirms the full suite still passes with no new failures; if a preflight test file is found via `rg -l "buildWarnings|analyzeMediaFile" tests/unit`, run it specifically first).

Expected: PASS, no regressions.

- [ ] **Step 3: Add a focused test proving server mode suppresses these warnings, if no existing preflight test file exists**

If `tests/unit/preflight.test.ts` (or similar) does not exist, create one minimal test:

```ts
import { describe, expect, it } from "vitest"
import { analyzeMediaFile } from "../../src/features/media/preflight"
import { DEFAULT_SETTINGS } from "../../src/features/transcription/models"

describe("analyzeMediaFile warnings in server mode", () => {
  it("does not include quantized-weight or webgpu warnings when mode is server", async () => {
    const settings = { ...DEFAULT_SETTINGS, mode: "server" as const, modelId: "onnx-community/whisper-large-v3-turbo" }
    const file = new File([new Uint8Array(10)], "test.mp3", { type: "audio/mpeg" })
    const result = await analyzeMediaFile(file, settings)
    const warningTexts = result.warnings.map((w) => w.toLowerCase())
    expect(warningTexts.some((w) => w.includes("quantiz"))).toBe(false)
    expect(warningTexts.some((w) => w.includes("webgpu"))).toBe(false)
  })
})
```

Adjust the exact shape of `result.warnings` (string array vs. object array) to match `MediaAnalysis`'s actual real type from `src/features/transcription/types.ts:29-42` — if warnings are objects with a `message`/`text` field rather than plain strings, adapt `.map()` accordingly.

Run: `pnpm test tests/unit/preflight.test.ts` (or wherever created)
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/media/preflight.ts tests/unit/preflight.test.ts
git commit -m "fix(client): suppress local-model warnings in server mode"
```

(Omit `tests/unit/preflight.test.ts` from the `git add` if Step 3 determined an existing test file already covered this and no new file was created.)

---

## Task 14: Client — `App.tsx` Capabilities Wiring, Dropdown, Bug Fixes

**Files:**
- Modify: `src/App.tsx`

This task is the largest and touches multiple non-adjacent regions of `App.tsx`. Because `App.tsx` is a single large component file without existing unit-test infrastructure for its internals (confirmed via prior exploration — only e2e Playwright tests exercise this file), verification for this task relies on `pnpm typecheck`, `pnpm build`, and targeted Playwright e2e coverage rather than new unit tests. Sub-steps are ordered to keep the file compiling at each checkpoint.

- [ ] **Step 1: Extend the capabilities effect (lines ~621-638) to store full response**

Add new state near other `React.useState` declarations (find the cluster of existing `toastMessage`/similar state, follow existing naming conventions):
```tsx
const [serverCapabilities, setServerCapabilities] = React.useState<
  ServerCapabilities | "loading" | "error" | null
>(null)
```

Import `ServerCapabilities` type at the top of `App.tsx` alongside other server-transcription imports.

Replace the existing effect body:
```tsx
React.useEffect(() => {
  if (settings.mode !== "server") return
  const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined
  if (!serverUrl) return
  const api = new ServerTranscriptionApi(serverUrl, () => driveAccessToken ?? (import.meta.env.DEV ? "dev-mode" : null))
  serverApiRef.current = api
  setServerCapabilities("loading")
  void api.getCapabilities().then((cap) => {
    if (!cap?.available) {
      setServerCapabilities("error")
      setToastMessage({
        id: createId("toast"),
        title: t.transcriptionFailed,
        description: t.serverUnavailable,
        kind: "error",
      })
      return
    }
    setServerCapabilities(cap)
  })
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [settings.mode, driveAccessToken])
```

- [ ] **Step 2: Auto-select default model and add capabilities-error copy**

Add a second effect (near the first) that auto-selects the default model once capabilities load:
```tsx
React.useEffect(() => {
  if (typeof serverCapabilities !== "object" || !serverCapabilities?.models) return
  const validIds = new Set(serverCapabilities.models.map((m) => m.id))
  if (!settings.serverModelId || !validIds.has(settings.serverModelId)) {
    if (serverCapabilities.default_model) {
      updateSetting("serverModelId", serverCapabilities.default_model)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [serverCapabilities])
```

Add localized copy keys to both `COPY.en` and `COPY.vi` (find the object literal, add alongside existing similar keys like `serverUnavailable`):
```ts
// COPY.en
serverModelsUnavailable: "Could not load available models from the server. Check server status and try again.",
// COPY.vi
serverModelsUnavailable: "Không thể tải danh sách mô hình từ máy chủ. Kiểm tra trạng thái máy chủ và thử lại.",
```

- [ ] **Step 3: Run typecheck to confirm Steps 1-2 compile**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Fix hardcoded `modelId` at submission (lines ~920, ~968)**

At line ~906 (URL submit call): change
```tsx
const jobId = await api.submitJob({ type: "url", url: urlInput.trim() }, runSettings.language)
```
to
```tsx
const jobId = await api.submitJob({ type: "url", url: urlInput.trim() }, runSettings.language, runSettings.serverModelId ?? undefined)
```

At line ~920 (URL-path `TranscriptDocument` construction): change
```tsx
modelId: "whisper.cpp",
```
to
```tsx
modelId: runSettings.serverModelId ?? "base",
```

At line ~951-954 (file submit call): change
```tsx
const jobId = await api.submitJob({ type: "file", file: targetFile, filename: targetFile.name }, runSettings.language)
```
to
```tsx
const jobId = await api.submitJob({ type: "file", file: targetFile, filename: targetFile.name }, runSettings.language, runSettings.serverModelId ?? undefined)
```

At line ~968 (file-path `TranscriptDocument` construction): change
```tsx
modelId: "whisper.cpp",
```
to
```tsx
modelId: runSettings.serverModelId ?? "base",
```

- [ ] **Step 5: Add `SERVER_MODEL_LABELS` fallback lookup**

Near the top-level module scope (alongside other constants like `WHISPER_MODELS` import), add a minimal static fallback map for viewing history when capabilities aren't currently loaded:
```tsx
const SERVER_MODEL_STATIC_FALLBACK: Record<string, string> = {
  tiny: "Tiny",
  base: "Base",
  small: "Small",
  medium: "Medium",
  "large-v3": "Large V3",
}

function resolveServerModelLabel(
  modelId: string,
  capabilities: ServerCapabilities | "loading" | "error" | null,
): string {
  if (typeof capabilities === "object" && capabilities?.models) {
    const found = capabilities.models.find((m) => m.id === modelId)
    if (found) return found.label
  }
  return SERVER_MODEL_STATIC_FALLBACK[modelId] ?? modelId
}
```

- [ ] **Step 6: Fix the 3 history-mislabel display sites**

At line ~2152 (`ResultDialog`, `transcriptModel` computation) — this component needs access to `serverCapabilities`; add a new prop `serverCapabilities: ServerCapabilities | "loading" | "error" | null` to `ResultDialog`'s props and pass it from the call site. Change:
```tsx
const transcriptModel = transcript ? findModel(transcript.modelId) : null
```
to:
```tsx
const transcriptModel = transcript
  ? transcript.mode === "server"
    ? null // handled separately via resolveServerModelLabel at render site
    : findModel(transcript.modelId)
  : null
const transcriptModelLabel = transcript
  ? transcript.mode === "server"
    ? resolveServerModelLabel(transcript.modelId, serverCapabilities)
    : (transcriptModel?.label ?? transcript.modelId)
  : ""
```

At line ~2169, change:
```tsx
<Badge variant="secondary">{transcriptModel?.label ?? transcript.modelId}</Badge>
```
to:
```tsx
<Badge variant="secondary">{transcriptModelLabel}</Badge>
```

At the `ResultDialog` call site (wherever `<ResultDialog transcript={...} .../>` is rendered), add `serverCapabilities={serverCapabilities}` prop.

At line ~2305 (`HistoryPanel`), add `serverCapabilities` prop to `HistoryPanel` similarly, and change:
```tsx
{findModel(item.modelId).label}
```
to:
```tsx
{item.mode === "server" ? resolveServerModelLabel(item.modelId, serverCapabilities) : findModel(item.modelId).label}
```

At the `HistoryPanel` call site, add `serverCapabilities={serverCapabilities}` prop.

Note: `TranscriptDocument` must have a `mode` field to distinguish server-origin transcripts for this check — confirm `TranscriptDocument` (in `src/features/transcription/types.ts:67-78`) already includes a `mode: ProcessingMode` field; per prior exploration it's not explicitly confirmed in the earlier field list. If `mode` is NOT already a field on `TranscriptDocument`, add it:
```ts
export interface TranscriptDocument {
  // ...existing fields...
  mode: ProcessingMode
}
```
and set `mode: "server"` in both `TranscriptDocument` construction sites in Step 4 (alongside `modelId`), and set the appropriate mode value in the cloudflare-ai and local-mode construction sites too (to avoid leaving those without a `mode` field, causing a TS error). Search all `TranscriptDocument` literal construction sites via `rg "modelId:" src/App.tsx` before finalizing this sub-step, since this touches every save-transcript call site, not just the two server-mode ones.

- [ ] **Step 7: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS. Fix any remaining literal-construction-site errors surfaced by the `mode` field addition (if applicable).

- [ ] **Step 8: Gate the local-model warning render sites**

At line ~1456 (sidebar banner) and line ~1568 (inline in `MainControls`), wrap both `isEnglishOnlyMismatch` render conditions:
```tsx
{isEnglishOnlyMismatch && settings.mode !== "server" ? (...) : null}
```

At lines ~1572-1576 (`usesQuantizedWeights` render):
```tsx
{usesQuantizedWeights && settings.mode !== "server" ? (...) : null}
```

- [ ] **Step 9: Redesign the model dropdown (lines ~1534-1556)**

Add new props to `MainControls`: `serverCapabilities: ServerCapabilities | "loading" | "error" | null` and use the existing `updateSetting` prop for `serverModelId` (no new callback prop needed — `updateSetting("serverModelId", value)` follows the existing `updateSetting("modelId", value)` pattern).

Replace the ternary block:
```tsx
{settings.mode !== "server" ? (
  <div className="grid gap-2">
    {/* existing local WHISPER_MODELS select + description, UNCHANGED */}
  </div>
) : null}
```
with an always-rendered block branching internally:
```tsx
<div className="grid gap-2">
  {settings.mode !== "server" ? (
    <>
      <Select value={settings.modelId} onValueChange={(value) => updateSetting("modelId", value)}>
        {/* existing WHISPER_MODELS.map(...) options, UNCHANGED */}
      </Select>
      <p>{copy.downloadDescription(modelDescription, model.sizeMb)}</p>
    </>
  ) : (
    <>
      <Select
        value={settings.serverModelId ?? undefined}
        onValueChange={(value) => updateSetting("serverModelId", value)}
        disabled={serverCapabilities === "loading" || serverCapabilities === "error" || serverCapabilities === null}
      >
        <SelectTrigger>
          <SelectValue placeholder={copy.selectModel ?? "Select a model"} />
        </SelectTrigger>
        <SelectContent>
          {typeof serverCapabilities === "object" && serverCapabilities?.models
            ? serverCapabilities.models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))
            : null}
        </SelectContent>
      </Select>
      {serverCapabilities === "error" ? (
        <p className="text-sm text-destructive">{copy.serverModelsUnavailable}</p>
      ) : null}
    </>
  )}
</div>
```

Adjust `<Select>`/`<SelectTrigger>`/`<SelectValue>`/`<SelectContent>`/`<SelectItem>` usage to exactly match the existing shadcn `<Select>` composition already used in the local-mode branch immediately above (copy the exact existing JSX structure/import names rather than inventing new sub-component usage — the local-mode `<Select>` block already demonstrates the correct composition for this codebase).

Pass `serverCapabilities` prop at `<MainControls .../>`'s call site.

- [ ] **Step 10: Disable Start button when capabilities unavailable in server mode**

Find the "Start transcription" button's `disabled` prop/condition (search `rg "disabled" src/App.tsx` near the start-button JSX) and add a clause:
```tsx
disabled={
  // ...existing conditions...
  || (settings.mode === "server" && (serverCapabilities === "loading" || serverCapabilities === "error" || serverCapabilities === null || !settings.serverModelId))
}
```

- [ ] **Step 11: Run full verification**

Run: `pnpm typecheck`
Expected: PASS.

Run: `rtk lint`
Expected: zero errors, zero warnings.

Run: `pnpm test`
Expected: all unit tests pass (28 from Task 12 + Task 13's addition).

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/App.tsx
git commit -m "feat(client): wire server model selection, dropdown, and fix history-label bug"
```

---

## Task 15: Full-Stack Final Verification

**Files:** None (verification only).

- [ ] **Step 1: Server checks**

Run (from `server/`): `cargo test --locked`
Expected: PASS.

Run: `cargo build --locked`
Expected: PASS.

Run: `cargo clippy --all-targets --all-features --locked -- -D warnings`
Expected: only the 3 known pre-existing baseline warnings remain (no new warnings introduced by this feature).

- [ ] **Step 2: App checks**

Run (from repo root): `pnpm typecheck`
Expected: PASS.

Run: `rtk lint`
Expected: zero errors, zero warnings.

Run: `pnpm test`
Expected: all pass.

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: E2E checks (if server-mode UI flows are exercised by existing Playwright specs)**

Check `tests/e2e/server-mode.spec.ts` for any assertions that assume the model dropdown is hidden in server mode (per prior exploration, current spec only asserts server option hidden when env absent — unlikely to directly assert dropdown visibility, but verify). If any existing e2e assertion contradicts the new always-visible dropdown behavior, update it to match the new behavior (dropdown now visible in server mode, sourced from capabilities).

Run: `pnpm test:e2e`
Expected: PASS. This is required per AGENTS.md since UI flows, routing, and storage (new `serverModelId` setting) all changed.

- [ ] **Step 4: git diff check and status review**

Run: `git diff --check`
Expected: PASS (no whitespace errors).

Run: `git status --short`
Expected: only files touched by this plan's tasks are modified/new; protected unrelated dirty files (`vite.config.ts`, `worker/src/index.ts`) and untracked directories (`.omo/`, `audio-processor/`, `docs/` other than this feature's spec/plan, `server/Cargo.lock`, `server/target/`, `server/tmp/`) remain untouched.

- [ ] **Step 5: No commit at this step** (verification only — do not commit unless explicitly requested by the user for final wrap-up).

---

## Self-Review Notes (completed during plan authoring)

**Spec coverage:** All 6 spec sections have corresponding tasks — Section 1 (Task 1, 2, 3), Section 2 (Task 5), Section 3 (Task 6, 7, 8, 9), Section 4 (Task 10), Section 5 (Task 4, folded into Task 2's `GpuConfig` + Task 5's preload GPU params), Section 6 (Task 12, 13, 14). The "local-model-derived warnings must not leak into server mode" spec addendum is covered by Task 13 (`preflight.ts`) and Task 14 Step 8 (`App.tsx` render sites). The "pipeline function signature threading" spec addendum is covered by Task 8 (both `run_pipeline` and `execute`) and Task 9 (the `routes/transcribe.rs` call site).

**Known residual gaps (acceptable, flagged explicitly rather than hidden):** `preload_models()` itself has no direct unit test (requires real ggml files) — mitigated by Task 11 Step 4's manual smoke test and by thorough unit coverage of its sub-components (`derive_id`/`derive_label` in Task 1, semaphore behavior in Task 5, resolution logic in Task 9). GPU feature builds are not compiled/tested in this plan (no GPU toolchain assumed available) — Task 4 only verifies the default CPU-only build.

**Type consistency check:** `ModelInfo{id,label,filename,size_mb,quality,gpu}` (Task 1) is consumed unchanged by `ModelRegistry`/`preload_models` (Task 5) and `/api/capabilities` (Task 10, which correctly excludes `gpu` from the JSON response per spec). `ServerModelInfo{id,label,size_mb,quality}` (Task 12, client) matches the exact JSON shape emitted by Task 10's handler. `Job.model_id: String` (Task 6) flows unchanged through `run_pipeline`/`execute` (Task 8) to `model_registry.get(model_id)`. `TranscribeOptions{threads,language}` (Task 7) matches its construction in Task 8. `AppSettings.serverModelId: string | null` (Task 12) is read via `settings.serverModelId ?? undefined` at both `submitJob` call sites and `settings.serverModelId ?? "base"` at both `TranscriptDocument` construction sites (Task 14) — consistent null-handling throughout.
