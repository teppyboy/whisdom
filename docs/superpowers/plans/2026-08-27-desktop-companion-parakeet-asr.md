# Desktop Companion Parakeet ASR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Parakeet TDT v3 to Desktop Companion using Windows DirectML first, NeMo-Speech.cpp Vulkan second, then sherpa-onnx CPU, while retaining Whisper, opaque picker paths, verified assets, timestamped exports, and IndexedDB compatibility.

**Architecture:** Keep the browser/API selection contract model-ID-only. Replace the Rust inference assumption with a small internal dispatcher selected by catalog data; retain `runtime.rs` as owner of FFmpeg, sequential jobs, cancellation, progress, cleanup, and SSE. For Parakeet, try sherpa-onnx DirectML; on initialization failure try NeMo-Speech.cpp C-ABI Vulkan with its separate GGUF; on failure run sherpa-onnx CPU. Report actual backend; never call DirectML/WebGPU Vulkan.

**Tech Stack:** Rust 2021, Axum, Tokio, whisper-rs/whisper.cpp, sherpa-onnx/ONNX Runtime DirectML, NeMo-Speech.cpp C ABI/ggml Vulkan, Tauri 2, React 19, TypeScript 6, Vitest, Playwright.

---

## Preconditions

- Treat `docs/superpowers/specs/2026-08-27-desktop-companion-multi-engine-asr-design.md` as the approved scope.
- Use the inspected immutable sherpa-onnx release archive: `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2`, 487,170,055 bytes, SHA-256 `5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf`. Obtain operator-reviewed extracted-file SHA-256 values, a supported crate/runtime package version, Windows DLL list, and attribution text **before changing the catalog**. Do not substitute guessed pins.
- Windows order is exact: sherpa-onnx DirectML, NeMo-Speech.cpp Vulkan, then sherpa-onnx CPU. DirectML is DirectX 12, not Vulkan. Do not forward existing whisper `vulkan` to sherpa. Vulkan may run only after it proves an actual Vulkan backend with no CPU graph fallback.
- Preserve all existing Whisper entries, IDs, assets, download behavior, and Vietnamese capability.

## File Map

- Modify: `server/Cargo.toml` — add locked sherpa-onnx/ONNX Runtime DirectML dependency plus CPU runtime fallback; add NeMo-Speech C ABI feature only after its Vulkan contract passes.
- Modify: `companion/src-tauri/Cargo.toml` — package chosen CPU/Vulkan runtime DLLs; preserve Whisper Vulkan forwarding.
- Modify: `companion/src-tauri/tauri.conf.json` and build scripts as required — bundle all tested native DLLs.
- Modify: `server/src/helper/models.rs` — catalog engine, immutable asset manifests, language metadata, default lookup.
- Modify: `server/src/helper/download.rs` — reuse safe stream verifier for bundle assets; add atomic directory installer if not placed in cache.
- Modify: `server/src/helper/cache.rs` — install verified model bundles, status, cache clear, loaded-runtime reset.
- Create: `server/src/helper/engine.rs` — tagged runtime dispatcher, engine-specific loading/inference interface.
- Modify: `server/src/helper/transcribe.rs` — keep Whisper adapter only; remove the cross-engine `SharedModel` ownership.
- Create: `server/src/helper/parakeet.rs` — sherpa-onnx DirectML/CPU adapter and token-to-segment normalization.
- Create: `server/src/helper/nemo_speech.rs` — C-ABI Vulkan spike adapter; only compiled behind its experimental feature.
- Modify: `server/src/helper/runtime.rs` — call engine dispatcher, use engine-neutral progress/retry behavior.
- Modify: `server/src/helper/state.rs` — tagged single loaded runtime state.
- Modify: `server/src/helper/api.rs` — catalog capability serialization and authoritative language validation.
- Modify: `server/src/helper/protocol.rs` — per-model engine/language capability fields; strict selection request unchanged.
- Modify: `server/src/helper/mod.rs`, `server/src/bin/whisdom-helper.rs`, `companion/src-tauri/src/main.rs` — expose/build new shared state.
- Modify: `src/features/local-helper/types.ts`, `src/features/local-helper/client.ts` — strict mixed-catalog parsing and actual backend parsing.
- Modify: `src/App.tsx` — capability default selection, actual backend display, language availability, EN/VI model details.
- Modify: `tests/unit/local-helper.test.ts`, `tests/components/harness.test.tsx`, `tests/unit/compatibility.test.ts`, `tests/unit/indexed-db-compat.test.ts`, `tests/e2e/whisdom.spec.ts` — regression coverage.
- Modify: `companion/README.md`, `server/README-helper-windows.md` — truthful runtime/model/license/hardware documentation.
- Create: `benchmarks/desktop-companion/README.md` plus checked-in manifest/scripts only — repeatable release evidence, no source media.

### Task 1: Lock catalog and protocol behavior with failing tests

**Files:**

- Modify: `server/src/helper/models.rs`
- Modify: `server/src/helper/protocol.rs`
- Modify: `server/src/helper/api.rs`
- Modify: `tests/unit/local-helper.test.ts`

- [ ] **Step 1: Add a failing Rust catalog test for mixed engines.**

Add assertions around a planned `AsrEngine` and `NativeModel` shape:

```rust
#[test]
fn catalog_models_declare_safe_engine_language_and_asset_metadata() {
    let ids = native_models().iter().map(|model| model.id).collect::<std::collections::HashSet<_>>();
    assert_eq!(ids.len(), native_models().len());

    let parakeet = find_native_model("sherpa-parakeet-tdt-v3-int8").expect("Parakeet catalog entry");
    assert_eq!(parakeet.engine, AsrEngine::SherpaOnnx);
    assert!(parakeet.supported_languages.contains(&"en"));
    assert!(!parakeet.supported_languages.contains(&"vi"));
    assert_eq!(parakeet.assets.len(), 4);
    assert!(parakeet.assets.iter().all(|asset| asset.sha256.len() == 64));
}
```

Run:

```bash
cd server && cargo test helper::models::tests::catalog_models_declare_safe_engine_language_and_asset_metadata
```

Expected: FAIL because `AsrEngine`, the Parakeet model, and its asset manifest do not exist.

- [ ] **Step 2: Add failing strict protocol tests.**

Extend `server/src/helper/protocol.rs` tests to assert a capability response has engine/language metadata but selection requests still reject extra authority:

```rust
#[test]
fn selection_request_rejects_engine_language_asset_and_path_overrides() {
    for field in ["engine", "asset_url", "model_path", "checksum", "path"] {
        let json = format!(
            r#"{{"selection_id":"selection-1","model":"sherpa-parakeet-tdt-v3-int8","{field}":"x"}}"#
        );
        assert!(serde_json::from_str::<StartSelectionRequest>(&json).is_err());
    }
}
```

Run:

```bash
cd server && cargo test helper::protocol::tests::selection_request_rejects_engine_language_asset_and_path_overrides
```

Expected: PASS now if existing strict deserialization remains intact; keep it as a permanent regression test.

- [ ] **Step 3: Add failing TypeScript capability parser tests.**

In `tests/unit/local-helper.test.ts`, make a valid mixed-catalog fixture:

```ts
const parakeetModel = {
  id: "sherpa-parakeet-tdt-v3-int8",
  label: "Parakeet TDT v3",
  quality: "high",
  size_bytes: 671088640,
  installed: false,
  engine: "sherpa-onnx",
  supported_languages: ["en", "de", "fr", "es"],
  supports_auto_language: true,
}
```

Add a test that accepts this fixture and rejects `engine: "python"`, `supported_languages: ["C:\\secret"]`, duplicate language codes, an empty language array, or a non-boolean auto flag.

Run:

```bash
pnpm exec vitest run tests/unit/local-helper.test.ts
```

Expected: FAIL until client types/parser are changed.

- [ ] **Step 4: Commit the contract tests.**

```bash
git add server/src/helper/models.rs server/src/helper/protocol.rs tests/unit/local-helper.test.ts
git commit -m "test: define companion multi-engine catalog contract"
```

### Task 2: Represent fixed engines and assets in the native catalog

**Files:**

- Modify: `server/src/helper/models.rs`
- Modify: `server/src/helper/config.rs`
- Test: `server/src/helper/models.rs`
- Test: `server/src/helper/config.rs`

- [ ] **Step 1: Define the smallest model metadata types.**

In `server/src/helper/models.rs`, replace the implicit GGML-only record with closed catalog metadata:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AsrEngine {
    WhisperCpp,
    SherpaOnnx,
}

#[derive(Debug, Clone, Copy)]
pub struct NativeAsset {
    pub filename: &'static str,
    pub url: &'static str,
    pub size_bytes: u64,
    pub sha256: &'static str,
}

#[derive(Debug, Clone, Copy)]
pub struct NativeModel {
    pub id: &'static str,
    pub label: &'static str,
    pub quality: &'static str,
    pub size_bytes: u64,
    pub engine: AsrEngine,
    pub supported_languages: &'static [&'static str],
    pub supports_auto_language: bool,
    pub assets: &'static [NativeAsset],
}
```

Keep `DEFAULT_NATIVE_MODEL_ID` on Whisper Turbo. Convert every existing GGML row into one `NativeAsset`; retain exact current URLs, SHA-256 values, sizes, and filenames.

- [ ] **Step 2: Add Parakeet only after pins are approved.**

Declare the known immutable release archive and an extracted-file manifest:

```rust
const PARAKEET_TDT_V3_ARCHIVE: NativeAsset = NativeAsset {
    filename: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2",
    size_bytes: 487_170_055,
    sha256: "5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf",
};
const PARAKEET_TDT_V3_FILES: [&str; 4] = [
    "encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt",
];
```

Before implementation, obtain and commit the exact extracted-file SHA-256 and size manifest; do not fake values. Set the model's language list to all 25 documented codes; include `en`, `de`, `fr`, `es`, `ru`, `uk`; exclude `vi`; set `supports_auto_language: true` only after validating the chosen sherpa model/API recognizes it.

- [ ] **Step 3: Limit asset URLs to the selected immutable release host.**

Extend the exact allowlist in `server/src/helper/config.rs` only if the approved Parakeet release host is not already safe. Add a test for the exact approved URL and a rejected lookalike. Do not allow an entire new wildcard host.

- [ ] **Step 4: Run focused catalog/config tests.**

```bash
cd server && cargo test helper::models::tests helper::config::tests
```

Expected: PASS. Existing Whisper catalog pins remain byte-for-byte valid.

- [ ] **Step 5: Commit.**

```bash
git add server/src/helper/models.rs server/src/helper/config.rs
git commit -m "feat: catalog Parakeet companion assets"
```

### Task 3: Install verified multi-file model bundles atomically

**Files:**

- Modify: `server/src/helper/cache.rs`
- Modify: `server/src/helper/download.rs`
- Test: `server/src/helper/cache.rs`
- Test: `server/src/helper/download.rs`

- [ ] **Step 1: Add failing installer tests.**

Cover a test-only four-file local manifest through the existing redirect-validating test server. Assert:

```rust
assert!(installed.join("encoder.int8.onnx").is_file());
assert!(installed.join("tokens.txt").is_file());
assert!(!installed.with_extension("partial").exists());
```

Then make one checksum fail and assert the final directory is absent, the partial directory is removed, and no existing installed model is altered.

- [ ] **Step 2: Add one model-directory API.**

Keep the existing verified stream function. Add this `HelperCache` operation:

```rust
pub async fn ensure_model_assets(
    &self,
    model: &'static NativeModel,
) -> Result<std::path::PathBuf, HelperError>
```

Target path:

```text
%LOCALAPPDATA%\Whisdom\Companion\models\<engine-id>\<catalog-model-id>\
```

For a fully installed directory, verify each declared extracted-asset hash before reuse. For an incomplete/corrupt directory, remove only that model directory. Download the pinned archive into `<model-dir>.partial`, verify its hash/size, extract only listed safe entries, reject symlinks, unexpected files, missing assets, mismatched hashes, or over-limit streams, then rename only after all extracted files validate. Hold the existing model lock over the full install.

- [ ] **Step 3: Keep legacy helper upload behavior explicit.**

Replace direct `ensure_model(model)` use with `ensure_model_assets(model)` in engine callers. Do not change the legacy multipart route's request boundary; it still accepts only a catalog ID. Verify it can select the added catalog model only after Parakeet inference is ready, otherwise return a precise unsupported-in-legacy-mode error.

- [ ] **Step 4: Run tests.**

```bash
cd server && cargo test helper::cache::tests helper::download::tests
```

Expected: PASS, including hash-failure cleanup and existing redirect protections.

- [ ] **Step 5: Commit.**

```bash
git add server/src/helper/cache.rs server/src/helper/download.rs
git commit -m "feat: verify companion model bundles atomically"
```

### Task 4: Isolate existing Whisper inference behind an engine dispatcher

**Files:**

- Create: `server/src/helper/engine.rs`
- Modify: `server/src/helper/transcribe.rs`
- Modify: `server/src/helper/state.rs`
- Modify: `server/src/helper/mod.rs`
- Modify: `server/src/helper/runtime.rs`
- Modify: `server/src/bin/whisdom-helper.rs`
- Modify: `companion/src-tauri/src/main.rs`
- Test: `server/src/helper/engine.rs`

- [ ] **Step 1: Write dispatcher selection tests.**

Create tests with model IDs from both engines and no actual model loading:

```rust
#[test]
fn model_engine_dispatch_is_closed_and_exact() {
    assert_eq!(engine_for(find_native_model("ggml-base-q5_1").unwrap()), AsrEngine::WhisperCpp);
    assert_eq!(engine_for(find_native_model("sherpa-parakeet-tdt-v3-int8").unwrap()), AsrEngine::SherpaOnnx);
}
```

Run:

```bash
cd server && cargo test helper::engine::tests::model_engine_dispatch_is_closed_and_exact
```

Expected: FAIL before the module exists.

- [ ] **Step 2: Move engine-neutral runtime state into a tagged enum.**

In `server/src/helper/engine.rs`:

```rust
pub enum LoadedRuntime {
    Whisper(Arc<transcribe::LoadedModel>),
    Parakeet(Arc<parakeet::LoadedParakeet>),
}

pub type SharedRuntime = Arc<tokio::sync::RwLock<Option<Arc<LoadedRuntime>>>>;
```

Change `HelperState.model` to `runtime: SharedRuntime`. Update both helper-state constructors. The existing job admission gate is global/sequential, so retain exactly one loaded runtime; overwrite it only after the selected runtime is ready.

- [ ] **Step 3: Add engine-neutral public functions.**

`engine.rs` owns:

```rust
pub async fn load_runtime(
    cache: &HelperCache,
    runtime: &SharedRuntime,
    model: &'static NativeModel,
) -> Result<Arc<LoadedRuntime>, HelperError>;

pub async fn transcribe_wav(
    wav_path: &Path,
    runtime: Arc<LoadedRuntime>,
    model: &'static NativeModel,
    language: Option<String>,
    cancel_rx: watch::Receiver<bool>,
    guard: &JobGuard,
) -> Result<Vec<TranscriptSegment>, HelperError>;
```

Match `model.engine` exhaustively. For Parakeet, orchestrate one closed order: sherpa DirectML, NeMo Vulkan, then sherpa CPU. A mismatched tagged loaded runtime must reload rather than reinterpret a runtime. Preserve Whisper's existing cancellation callback, timestamps, and Vulkan behavior unchanged.

- [ ] **Step 4: Reduce `runtime.rs` to engine-neutral orchestration.**

Replace:

```rust
let model = load_model(&state.cache, &state.model, model_spec).await?;
match transcribe_chunk(&chunk, model, language.clone(), cancel_rx.clone(), &guard).await {
```

with:

```rust
let runtime = engine::load_runtime(&state.cache, &state.runtime, model_spec).await?;
match engine::transcribe_wav(&chunk, runtime, model_spec, language.clone(), cancel_rx.clone(), &guard).await {
```

Replace Whisper/Vulkan progress and retry strings with engine-neutral text. Replace `error.to_string().contains("Whisper transcription failed")` with a typed `is_retryable_inference_error(model.engine, &error)` that returns `true` only for documented Whisper chunk failures. For Parakeet, only typed DirectML/Vulkan initialization failures advance to the next backend; transcription/timestamp failures are terminal and never trigger fallback.

- [ ] **Step 5: Run focused Rust tests.**

```bash
cd server && cargo test helper::engine::tests helper::runtime::tests helper::transcribe::tests
```

Expected: PASS. Whisper behavior stays covered.

- [ ] **Step 6: Commit.**

```bash
git add server/src/helper/engine.rs server/src/helper/transcribe.rs server/src/helper/state.rs server/src/helper/mod.rs server/src/helper/runtime.rs server/src/bin/whisdom-helper.rs companion/src-tauri/src/main.rs
git commit -m "refactor: dispatch companion inference by catalog engine"
```

### Task 5: Implement Parakeet DirectML and CPU inference with timestamp normalization

**Files:**

- Create: `server/src/helper/parakeet.rs`
- Modify: `server/Cargo.toml`
- Modify: `server/src/helper/engine.rs`
- Test: `server/src/helper/parakeet.rs`

- [ ] **Step 1: Add pure timestamp grouping tests first.**

Use a small internal token type and test only the normalization logic:

```rust
#[test]
fn groups_token_pieces_and_punctuation_without_inventing_time() {
    let segments = normalize_tokens(&[
        token(" Hel", 0.0), token("lo", 0.2), token(",", 0.4),
        token(" world", 0.5), token("!", 0.8),
    ], 1.0).unwrap();
    assert_eq!(segments, vec![TranscriptSegment {
        start: 0.0, end: 0.8, text: "Hello, world!".into(),
    }]);
}

#[test]
fn rejects_non_monotonic_or_empty_timestamped_output() {
    assert!(normalize_tokens(&[token(" hello", 1.0), token(" there", 0.9)], 2.0).is_err());
    assert!(normalize_tokens(&[], 2.0).is_err());
}
```

Also test: finite times, non-negative start, end bounded by WAV duration plus a small documented epsilon, non-empty final text, maximum 12 words or 12 seconds per display segment, exact source timestamps only.

Run:

```bash
cd server && cargo test helper::parakeet::tests
```

Expected: FAIL before implementation.

- [ ] **Step 2: Add the reviewed sherpa DirectML runtime.**

Pin the exact reviewed sherpa-onnx DirectML Windows build/package in `server/Cargo.toml`. If it requires `build.rs`, bindgen, static libraries, or environment-specific downloads, stop and use the upstream documented Windows DLL package instead; do not introduce Python or Conda.

Configure DirectML with disabled memory patterns, `ORT_SEQUENTIAL`, and one `Run` caller. Add pure policy tests:

```rust
#[test]
fn parakeet_backend_order_is_directml_then_vulkan_then_cpu() {
    assert_eq!(select_backend(true, true), ParakeetBackend::DirectMl);
    assert_eq!(select_backend(false, true), ParakeetBackend::Vulkan);
    assert_eq!(select_backend(false, false), ParakeetBackend::Cpu);
}
```

The existing global Companion job gate supplies run serialization. Do not add CUDA, WebGPU, or Vulkan to sherpa.

- [ ] **Step 3: Load the fixed bundle.**

Implement:

```rust
pub struct LoadedParakeet {
    recognizer: sherpa_onnx::OfflineRecognizer,
    model_id: &'static str,
}

pub async fn load_model(
    cache: &HelperCache,
    model: &'static NativeModel,
) -> Result<Arc<LoadedParakeet>, HelperError>
```

Call `cache.ensure_model_assets(model)`. Configure the crate with only the installed `encoder.int8.onnx`, `decoder.int8.onnx`, `joiner.int8.onnx`, and `tokens.txt` under that returned directory; use its documented NeMo transducer model type. Attempt the DirectML provider first with the required sequential/memory-pattern configuration. On DirectML adapter/device/session/model initialization failure, destroy that attempt and return a typed `DirectMlUnavailable` result—not a false GPU success. A later dispatcher branch tries NeMo Vulkan; CPU initialization is the final fallback. Never accept configuration paths from API input. Validate all expected files before creating any recognizer.

- [ ] **Step 4: Transcribe an existing WAV chunk.**

Read the existing 16 kHz mono PCM WAV with `hound`, validate the format as the Whisper adapter does, run recognition in `spawn_blocking`, obtain tokens/timestamps from the chosen crate API, and pass them to the pure normalizer. Check cancellation before load, before work, and after return. If DirectML emits a typed initialization/device/model error, drop that recognizer before returning `DirectMlUnavailable`; dispatcher then attempts Vulkan. If the API cannot abort a running inference, document the bounded interruption latency as the current 30-second chunk.

Return a sanitized error for native runtime/model failures. Never synthesize empty segments.

- [ ] **Step 5: Run focused tests and format.**

```bash
cd server && cargo fmt --check && cargo test helper::parakeet::tests helper::engine::tests
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add server/Cargo.toml server/Cargo.lock server/src/helper/parakeet.rs server/src/helper/engine.rs
git commit -m "feat: transcribe companion audio with Parakeet"
```

### Task 6: Publish model capabilities and enforce language on both sides

**Files:**

- Modify: `server/src/helper/protocol.rs`
- Modify: `server/src/helper/api.rs`
- Modify: `src/features/local-helper/types.ts`
- Modify: `src/features/local-helper/client.ts`
- Modify: `src/App.tsx`
- Test: `server/src/helper/api.rs`
- Test: `tests/unit/local-helper.test.ts`
- Test: `tests/components/harness.test.tsx`

- [ ] **Step 1: Extend per-model capability responses.**

Add these fields to Rust and TypeScript model response types:

```text
engine
supported_languages
supports_auto_language
```

`engine` is exactly `"whisper.cpp"`, `"sherpa-onnx"`, or `"nemo-speech.cpp"`; `active_backend` is exactly `"cpu"`, `"directml"`, or `"vulkan"`. `supported_languages` uses BCP-47 base codes from the existing picker; unique nonempty values only. Do not add asset paths, URLs, hashes, filenames, model directories, or device controls to the wire response.

Update `parseModel()` so it rejects invalid/unknown engines, path-shaped strings, duplicate languages, more than a modest bounded number of codes, and malformed booleans. Keep old global `engine` only as informational compatibility data.

- [ ] **Step 2: Validate language before consuming a selection.**

In `server/src/helper/api.rs`, resolve the catalog model and requested language before `state.selections.take()`. Implement:

```rust
fn validate_model_language(
    model: &'static NativeModel,
    language: Option<&str>,
) -> Result<(), HelperError>
```

Rules:

```text
missing language or "auto" requires supports_auto_language
specific language must be in supported_languages
otherwise 400 "selected Companion model does not support this language"
```

Test that Parakeet rejects `vi` without consuming its opaque selection and that Whisper Turbo still accepts `vi`.

- [ ] **Step 3: Remove universal Whisper default assumptions in `App.tsx`.**

Where the app currently falls back to `ggml-large-v3-turbo-q5_0`, retain it as first preference only if it is supplied; otherwise select the first capability item. Never assume its metadata applies to other models.

Add helpers near existing Companion model rendering:

```ts
function companionModelSupportsLanguage(
  model: HelperModel,
  language: LanguageCode
) {
  return language === "auto"
    ? model.supports_auto_language
    : model.supported_languages.includes(language)
}
```

Disable companion start when the selected model/language pair is invalid. Show concise localized copy naming the selected language/model limitation. Server validation remains required; UI is only guidance.

- [ ] **Step 4: Extend focused UI/client tests.**

Test valid mixed catalog parse, invalid metadata rejection, Parakeet visible engine/language detail, Vietnamese selected with Parakeet blocks Start, switching to Whisper restores Start, and submission remains exactly `{ selection_id, language, model }` with no engine/path/assets.

Run:

```bash
pnpm exec vitest run tests/unit/local-helper.test.ts tests/components/harness.test.tsx
cd server && cargo test helper::api::tests helper::protocol::tests
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add server/src/helper/protocol.rs server/src/helper/api.rs src/features/local-helper/types.ts src/features/local-helper/client.ts src/App.tsx tests/unit/local-helper.test.ts tests/components/harness.test.tsx
git commit -m "feat: expose companion model capabilities safely"
```

### Task 7: Preserve compatibility and add browser regression coverage

**Files:**

- Modify: `tests/unit/compatibility.test.ts`
- Modify: `tests/unit/indexed-db-compat.test.ts`
- Modify: `tests/e2e/whisdom.spec.ts`

- [ ] **Step 1: Add storage round-trip tests.**

Use an explicit opaque Parakeet ID with the existing mode:

```ts
const document = {
  ...validTranscript,
  mode: "local-helper" as const,
  modelId: "sherpa-parakeet-tdt-v3-int8",
}
```

Assert it parses and persists in existing v1/v2 compatibility tests. Do not change storage schema, allowed modes, or database version.

- [ ] **Step 2: Add the smallest E2E capability UI test.**

Mock or seed the Companion capability response using the project’s current companion test seam. Assert Desktop Companion shows Parakeet in its model chooser and disables transcription for Vietnamese while retaining the native-only picker (no browser file input). Do not attempt native inference in Playwright.

- [ ] **Step 3: Run focused tests.**

```bash
pnpm exec vitest run tests/unit/compatibility.test.ts tests/unit/indexed-db-compat.test.ts
pnpm exec playwright test tests/e2e/whisdom.spec.ts --grep "Desktop Companion" --reporter=list
```

Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add tests/unit/compatibility.test.ts tests/unit/indexed-db-compat.test.ts tests/e2e/whisdom.spec.ts
git commit -m "test: preserve Parakeet companion transcript compatibility"
```

### Task 8: Run the bounded NeMo-Speech.cpp Vulkan fallback spike

**Files:**

- Create: `server/src/helper/nemo_speech.rs`
- Modify: `server/src/helper/engine.rs`
- Modify: `server/src/helper/models.rs`
- Modify: `server/Cargo.toml`
- Modify: `companion/src-tauri/Cargo.toml`
- Modify: `companion/src-tauri/tauri.conf.json`
- Test: `server/src/helper/nemo_speech.rs`

- [ ] **Step 1: Pin the C ABI before writing a wrapper.**

Record the exact NeMo-Speech.cpp source commit, Parakeet Q8 GGUF URL/SHA-256/size, SDK header version, Windows build command, output DLL list, and license notices in `server/src/helper/models.rs` tests. Do not use an unpinned CLI download, a floating branch, or an HTTP server subprocess.

- [ ] **Step 2: Build the Windows Vulkan SDK artifact.**

Run the upstream documented Windows build for HTTP-disabled C ABI output:

```powershell
scripts\windows\build.ps1 -Backend vulkan
```

Record the exact produced C ABI/`ggml-vulkan` DLL names. Package only those files explicitly in Tauri. The packaged Companion must launch with no developer `PATH`, Vulkan SDK, or external service.

- [ ] **Step 3: Write failing backend-truth tests.**

Add a parser test for the pinned SDK backend diagnostic and a mocked C-ABI result test:

```rust
#[test]
fn rejects_parakeet_result_when_vulkan_was_requested_but_cpu_nodes_ran() {
    let status = BackendStatus { requested: "vulkan", active: "vulkan", cpu_nodes: 1 };
    assert!(validate_vulkan_status(&status).is_err());
}

#[test]
fn accepts_timestamped_vulkan_result_without_cpu_nodes() {
    let status = BackendStatus { requested: "vulkan", active: "vulkan", cpu_nodes: 0 };
    assert!(validate_vulkan_status(&status).is_ok());
}
```

Run:

```bash
cd server && cargo test helper::nemo_speech::tests
```

Expected: FAIL before the adapter exists.

- [ ] **Step 4: Implement one feature-gated C-ABI adapter.**

Behind `nemo-speech-vulkan`, bind only the pinned SDK functions needed to create a recognizer from the server-owned GGUF, submit existing mono PCM samples, request word offsets, retrieve backend diagnostics, and free handles. Wrap all raw handles in one `LoadedNemoSpeech` owner with `Drop`. Inference receives no browser-controlled runtime/model fields.

Require `active == "vulkan"` and zero CPU graph nodes before accepting output. Require nonempty monotonic word offsets, normalize them with the same segment validator, then return current `TranscriptSegment[]`. Any unavailable driver, Vulkan initialization failure, missing DLL, CPU fallback, invalid timestamps, or C-ABI error is a terminal model error. Do not retry on CPU.

- [ ] **Step 5: Wire capability truth, not a false promise.**

Do not add a separate user-selectable catalog entry. Wire NeMo behind the Parakeet dispatcher only after feature build/package acceptance passes. When DirectML fails, it reports `engine: "nemo-speech.cpp"` and `active_backend: "vulkan"` only after initialization validates it. Otherwise continue to sherpa CPU; do not show a disabled Vulkan model.

- [ ] **Step 6: Run real-device gates before committing catalog exposure.**

On each target Windows GPU class, run:

```powershell
$env:WHISDOM_NEMO_SPEECH_VULKAN=1
cargo test --features nemo-speech-vulkan --manifest-path server/Cargo.toml
pnpm exec tauri build --debug --features vulkan
```

Then transcribe 5-, 30-, and 60-minute EN/DE/FR/ES files. Capture active backend, zero CPU graph nodes, cold/warm RTF, peak working set, WER, valid SRT/VTT, cancellation latency, GPU reset recovery, and offline second run. Any failure ships CPU sherpa Parakeet only.

- [ ] **Step 7: Commit only a passing spike.**

```bash
git add server/src/helper/nemo_speech.rs server/src/helper/engine.rs server/src/helper/models.rs server/Cargo.toml server/Cargo.lock companion/src-tauri/Cargo.toml companion/src-tauri/tauri.conf.json
git commit -m "feat: add experimental Vulkan Parakeet runtime"
```

### Task 9: Package, document, and produce benchmark evidence

**Files:**

- Modify: `companion/src-tauri/Cargo.toml`
- Modify: `companion/src-tauri/tauri.conf.json`
- Modify: `companion/README.md`
- Modify: `server/README-helper-windows.md`
- Create: `benchmarks/desktop-companion/README.md`
- Create: `benchmarks/desktop-companion/manifest.example.json`

- [ ] **Step 1: Package only known native runtime DLLs.**

Follow the selected sherpa-onnx CPU and, if spike gates pass, NeMo-Speech Vulkan package instructions. Add explicit bundle resources for the required DLLs and test from the packaged installation, not a development `PATH`. Do not include a Python runtime, model weights, user source files, or arbitrary directories in the installer.

- [ ] **Step 2: Update operational docs.**

In both README files:

```text
- Whisper remains multilingual and is the Companion choice for Vietnamese.
- Parakeet tries DirectML (DirectX 12), then verified NeMo-Speech Vulkan, then CPU; it supports its stated 25 European languages, not Vietnamese.
- Vulkan runs only when live diagnostics confirm Vulkan with zero CPU graph nodes; otherwise Parakeet continues to CPU.
- DirectML/D3D12 and WebGPU are not Vulkan.
- Parakeet downloads its pinned model bundle and uses the same local cache/privacy path boundary.
- Package notices include CC-BY-4.0 Parakeet attribution plus selected sherpa-onnx/ONNX Runtime and NeMo-Speech/ggml notices.
- No speed/accuracy comparison is a product claim until benchmark evidence is approved.
```

Correct the existing doc statement that a Vulkan Whisper build silently falls back to CPU if implementation verification still shows it fails instead.

- [ ] **Step 3: Add a reproducible evidence template.**

`benchmarks/desktop-companion/README.md` describes the exact target Windows machine, model revision, app build SHA, media duration/language/reference, warm/cold wall time, RTF, peak working set, WER command, segment/SRT/VTT validation, and cancellation latency. `manifest.example.json` contains no audio or user content.

- [ ] **Step 4: Run release-equivalent checks.**

```bash
pnpm typecheck
pnpm --filter whisdom-worker typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
cd server && cargo fmt --check && cargo test && cargo build --release
cd ../companion && pnpm exec tauri build --debug
cd .. && git diff --check
```

Expected: every command exits 0. Also run the target-machine packaged manual checklist below.

- [ ] **Step 5: Perform Windows packaged acceptance.**

Verify on clean Windows x64:

```text
1. Installer launches Companion and resolves sherpa/ORT DirectML/CPU and NeMo-Speech/ggml Vulkan DLLs without developer PATH.
2. Pairing/native picker rejects unlisted origins and never exposes source paths.
3. First Parakeet run verifies every asset; second offline run succeeds from cache.
4. English, German, French, Spanish 5-minute media complete with nonempty monotonic segments.
5. Vietnamese Parakeet start is rejected before consuming selection; Whisper Vietnamese works.
6. SRT/VTT output has valid ordered cues.
7. Cancel reaches a terminal state; record worst observed cancellation latency.
8. Cache clear refuses active job, later unloads both engine runtimes and removes model bundles.
9. Logs contain no source path, transcript text, or token.
10. Existing Whisper Vulkan/CPU behavior remains correct and documented truthfully; Parakeet reports actual DirectML, Vulkan, or CPU backend, with Vulkan showing no CPU graph fallback.
```

- [ ] **Step 6: Record benchmark gate results before copy changes.**

Populate an operator-owned benchmark manifest for EN/DE/FR/ES 5/30/60-minute reference audio. Only after results meet the approved threshold may a later copy-only change claim relative speed or accuracy.

- [ ] **Step 7: Commit documentation and evidence template.**

```bash
git add companion/src-tauri/Cargo.toml companion/src-tauri/tauri.conf.json companion/README.md server/README-helper-windows.md benchmarks/desktop-companion
git commit -m "docs: document Parakeet companion runtime"
```
