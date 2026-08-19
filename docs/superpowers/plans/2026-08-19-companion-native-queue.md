# Companion Native Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Windows companion pick one or many local files into the hosted app’s normal, reorderable queue without sending paths/media to the browser; let users choose a pinned native Whisper model.

**Architecture:** Split native selection from transcription. The Tauri picker retains each selected `PathBuf` in a bounded in-memory selection store and returns opaque display metadata. The browser queue holds either a browser `File` or companion selection metadata; it asks the companion to start each selected item sequentially. The companion owns a pinned GGML model catalog and returns it through capabilities.

**Tech Stack:** React 19, TypeScript, Vitest, Axum 0.8, Tokio, Tauri 2, whisper-rs, reqwest, SHA-256.

---

## File map

| File                                                                | Responsibility                                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `server/src/helper/models.rs`                                       | Pinned native model metadata, lookup, cache filename/path rules.                          |
| `server/src/helper/selection.rs`                                    | Opaque in-memory picker selections: create, take, delete, expiry, bounds.                 |
| `server/src/helper/config.rs`                                       | HTTPS redirect-host policy.                                                               |
| `server/src/helper/download.rs`                                     | Manual bounded redirect traversal with per-hop validation.                                |
| `server/src/helper/cache.rs`                                        | Download/cache a selected GGML model rather than one fixed filename.                      |
| `server/src/helper/state.rs`                                        | Multi-file picker callback and selection store ownership.                                 |
| `server/src/helper/protocol.rs`                                     | Version-2 picker/start/model capability request and response DTOs.                        |
| `server/src/helper/api.rs`                                          | `select-files`, `selections/{id}`, and `transcribe-selection` routes.                     |
| `server/src/helper/runtime.rs`                                      | Start a selected path with a requested model specification.                               |
| `server/src/helper/transcribe.rs`                                   | Cache loaded Whisper context by model ID; Vulkan/CPU fallback per model.                  |
| `companion/src-tauri/src/main.rs`                                   | Native multi-file picker callback.                                                        |
| `src/features/local-helper/types.ts`                                | Browser-safe selection/model/capability types.                                            |
| `src/features/local-helper/client.ts`                               | Selection, deletion, explicit start requests; no media/path.                              |
| `src/App.tsx`                                                       | Queue-source union, native selection UI, selected/all sequencing, companion model picker. |
| `tests/unit/local-helper.test.ts`                                   | Loopback client request/response tests.                                                   |
| `server/src/helper/{api,config,download,selection,models}.rs` tests | Rust regression coverage.                                                                 |

### Task 1: Define pinned models and selection storage

**Files:**

- Create: `server/src/helper/models.rs`
- Create: `server/src/helper/selection.rs`
- Modify: `server/src/helper/mod.rs`
- Modify: `server/src/helper/state.rs`
- Test: `server/src/helper/models.rs`
- Test: `server/src/helper/selection.rs`

- [ ] **Step 1: Write the failing native-model tests**

```rust
#[test]
fn native_catalog_has_only_pinned_ggml_models() {
    for model in native_models() {
        assert!(model.url.starts_with("https://huggingface.co/ggerganov/whisper.cpp/resolve/"));
        assert_eq!(model.sha256.len(), 64);
        assert!(model.filename.ends_with(".bin"));
    }
    assert_eq!(find_native_model("ggml-large-v3-turbo-q5_0").unwrap().filename,
               "ggml-large-v3-turbo-q5_0.bin");
}
```

- [ ] **Step 2: Write the failing selection lifecycle tests**

```rust
#[tokio::test]
async fn selection_is_opaque_single_use_and_deletable() {
    let store = SelectionStore::new(Duration::from_secs(30), 2);
    let id = store.insert(test_path("meeting.mkv")).await.unwrap().id;
    assert!(store.delete(&id).await);
    assert!(matches!(store.take(&id).await, Err(HelperError::NotFound)));
}

#[tokio::test]
async fn selection_store_rejects_overflow_and_expired_entries() {
    let store = SelectionStore::new(Duration::ZERO, 1);
    let id = store.insert(test_path("one.wav")).await.unwrap().id;
    assert!(matches!(store.take(&id).await, Err(HelperError::NotFound)));
}
```

- [ ] **Step 3: Add the minimal native catalog**

Create `NativeModel` with `id`, `label`, `quality`, `size_bytes`, `filename`, `url`, and `sha256`. Include only verified GGML assets from `ggerganov/whisper.cpp` at the pinned revision:

```rust
("ggml-tiny-q5_1", "Whisper Tiny", 32_152_673,
 "ggml-tiny-q5_1.bin", "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7"),
("ggml-base-q5_1", "Whisper Base", 59_707_625,
 "ggml-base-q5_1.bin", "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898"),
("ggml-small-q5_1", "Whisper Small", 190_085_487,
 "ggml-small-q5_1.bin", "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb"),
("ggml-large-v3-turbo-q5_0", "Whisper Large v3 Turbo", 574_041_195,
 "ggml-large-v3-turbo-q5_0.bin", "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"),
```

Use the same 40-hex revision already used by the existing model URL. Do not accept caller URLs, filenames, checksums, or model metadata.

- [ ] **Step 4: Add a bounded in-memory `SelectionStore`**

Use `Arc<Mutex<HashMap<String, NativeSelection>>>`. Store only `PathBuf`, sanitized filename, `size_bytes`, extension, and `Instant`. On insertion: prune expired entries; reject when 100 live entries exist; use `Uuid::new_v4()` as the opaque ID. On `take`: prune, remove the entry, re-stat its path, require `metadata.is_file()`, and return the path plus display metadata. On `delete`: remove the ID after pruning. TTL: 30 minutes. No selected path is serialized or logged.

Change:

```rust
pub type NativeFilePicker = Arc<dyn Fn() -> BoxFuture<'static, Result<Vec<PathBuf>, HelperError>> + Send + Sync>;
```

Add `selections: SelectionStore` to `HelperState`. Initialize it in both `whisdom-helper.rs` and Tauri setup; standalone helper gets an empty store and no picker.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
cd server
cargo test --lib helper::models helper::selection -j 1
```

Expected: all new catalog and selection tests pass.

### Task 2: Fix signed asset redirects and selected-model cache

**Files:**

- Modify: `server/src/helper/config.rs`
- Modify: `server/src/helper/download.rs`
- Modify: `server/src/helper/cache.rs`
- Test: `server/src/helper/config.rs`
- Test: `server/src/helper/download.rs`

- [ ] **Step 1: Write redirect-policy failures**

```rust
#[test]
fn accepts_known_https_asset_delivery_hosts_only() {
    assert!(validate_asset_url("https://huggingface.co/a/b").is_ok());
    assert!(validate_asset_url("https://cas-bridge.xethub.hf.co/reconstruction/x").is_ok());
    assert!(validate_asset_url("https://objects.githubusercontent.com/a").is_ok());
    assert!(validate_asset_url("http://huggingface.co/a").is_err());
    assert!(validate_asset_url("https://evil.example/a").is_err());
}
```

Add an async local Axum redirect-chain test: allowed origin redirects to an allowed CDN host and completes; a hop to `https://evil.example/` is rejected before any body read; more than five redirects is rejected.

- [ ] **Step 2: Implement per-hop redirect validation**

Build the helper reqwest client with `reqwest::redirect::Policy::none()`. In `download_verified`, loop at most five times:

```rust
validate_asset_url(current.as_str())?;
let response = client.get(current.clone()).send().await?;
if response.status().is_redirection() {
    let location = response.headers().get(LOCATION).ok_or(...)?;
    current = current.join(location.to_str()?).map_err(...)?;
    continue;
}
```

Require an HTTPS URL and an exact allowlisted host for every destination. Permit `huggingface.co`, `cdn-lfs.hf.co`, `cas-bridge.xethub.hf.co`, `transfer.xethub.hf.co`, `github.com`, `objects.githubusercontent.com`, and `release-assets.githubusercontent.com`. Preserve byte ceilings, streaming SHA-256 validation, atomic partial-file rename, and no URL logging.

- [ ] **Step 3: Cache models by model spec**

Replace fixed `ensure_model()` with:

```rust
pub async fn ensure_model(&self, model: &NativeModel) -> Result<PathBuf, HelperError>
```

Use `models_dir().join(model.filename)`. Verify that exact file against `model.sha256`; remove only the invalid selected model; download only the selected model URL. Keep the existing cache-clear admission lock and symlink-safe deletion unchanged.

- [ ] **Step 4: Run focused Rust tests**

Run:

```powershell
cd server
cargo test --lib helper::config helper::download helper::cache -j 1
```

Expected: redirect tests, checksum behavior, and cache-clear safety pass.

### Task 3: Replace auto-start picker API with selection/start API

**Files:**

- Modify: `server/src/helper/protocol.rs`
- Modify: `server/src/helper/api.rs`
- Modify: `server/src/helper/runtime.rs`
- Modify: `server/src/helper/transcribe.rs`
- Test: `server/src/helper/api.rs`

- [ ] **Step 1: Write HTTP behavior tests**

Test the router with an authenticated allowed Origin and injected picker:

```rust
POST /api/v1/select-files  => 200 { "selections": [{ "id", "filename", "size_bytes", "extension" }] }
POST /api/v1/select-files  => 204 when picker returns []
POST /api/v1/transcribe-selection { "selection_id", "model", "language" } => 200 { "job_id" }
DELETE /api/v1/selections/{id} => 204
```

Assert malformed JSON with `path`, `file`, `url`, asset URL/checksum, or unknown model returns 400. Assert every successful selection/start response has no path key. Assert selection cannot start twice.

- [ ] **Step 2: Define protocol v2 DTOs**

Increment `PROTOCOL_VERSION` to 2. Add:

```rust
#[derive(Serialize)]
pub struct NativeSelectionResponse { pub id: String, pub filename: String, pub size_bytes: u64, pub extension: Option<String> }
#[derive(Serialize)]
pub struct SelectFilesResponse { pub selections: Vec<NativeSelectionResponse> }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartSelectionRequest { pub selection_id: String, pub language: Option<String>, pub model: String }
#[derive(Serialize)]
pub struct NativeModelResponse { pub id: String, pub label: String, pub quality: String, pub size_bytes: u64, pub installed: bool }
```

Extend `CapabilitiesResponse` with `models: Vec<NativeModelResponse>`. The caller sends only a known model ID, a language, and a selection ID.

- [ ] **Step 3: Route explicit selection lifecycle**

Replace `pick-and-transcribe` with these v2 routes and aliases:

```rust
POST   /api/v1/select-files
DELETE /api/v1/selections/{id}
POST   /api/v1/transcribe-selection
```

`select-files` authorizes, invokes the injected picker, stores each selection, and returns metadata; empty selection is `204`. `transcribe-selection` authorizes, resolves `find_native_model(&request.model)`, atomically takes/re-stats the selection, then calls `runtime::start_path_job(..., model)`. Do not keep an endpoint that opens the picker and starts work in one call.

Capabilities reports every catalog model and its installed state using `models_dir/filename`; it must not expose paths.

- [ ] **Step 4: Thread model specification into runtime/transcription**

Extend `start_path_job`, `start_staged_job`, and `run_transcription` with `&'static NativeModel`. `LoadedModel` gains `model_id: &'static str`; reuse only a context with the same model ID and requested backend. `load_model`/`load_cpu_model` call `cache.ensure_model(model)`. Preserve one active job globally, native timestamp conversion, cancellation behavior, and Vulkan-to-CPU retry.

For legacy multipart `/api/v1/transcribe`, use `ggml-large-v3-turbo-q5_0` as its default when model is absent; a supplied model must use the native catalog. This keeps the old helper usable without accepting browser file paths from the companion picker API.

- [ ] **Step 5: Run helper API tests**

Run:

```powershell
cd server
cargo test --lib helper -j 1
cargo test --bin whisdom-helper -j 1
```

Expected: helper unit tests and legacy binary tests pass.

### Task 4: Make the Tauri picker support single and multi-select

**Files:**

- Modify: `companion/src-tauri/src/main.rs`
- Test: manual Windows smoke test

- [ ] **Step 1: Change the dialog callback to collect all selected files**

Use the dialog plugin multi-selection callback and map only `FilePath::Path` values:

```rust
.pick_files(move |picked| {
    let paths = picked
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| match entry { FilePath::Path(path) => Some(path), _ => None })
        .collect();
    let _ = sender.send(paths);
})
```

Keep the existing media extension filter. Cancelling yields an empty vector, which API maps to 204. Ctrl/Shift selection is native Windows behavior; repeated frontend clicks append new selections.

- [ ] **Step 2: Check formatting and build check**

Run:

```powershell
cd companion/src-tauri
cargo fmt --check
cargo check --features vulkan
```

Expected: format and Vulkan check exit 0.

### Task 5: Replace frontend auto-start with queue sources

**Files:**

- Modify: `src/features/local-helper/types.ts`
- Modify: `src/features/local-helper/client.ts`
- Modify: `tests/unit/local-helper.test.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write local-helper client failures**

Replace picker tests with assertions that no body contains media/path/token data except the Authorization header:

```ts
await client.selectFiles()
expect(request[0]).toBe("http://127.0.0.1:8788/api/v1/select-files")
expect(request[1]).toMatchObject({ method: "POST" })
expect(request[1]?.body).toBeUndefined()

await client.startSelection("selection-1", "vi", "ggml-base-q5_1")
expect(JSON.parse(String(request[1]?.body))).toEqual({
  selection_id: "selection-1",
  language: "vi",
  model: "ggml-base-q5_1",
})
```

Cover 204 cancellation, malformed selection response rejection, malformed capability model rejection, `DELETE /selections/{id}`, and start request rejection propagation.

- [ ] **Step 2: Implement typed client operations**

Replace `pickAndSubmit` with:

```ts
selectFiles(): Promise<HelperSelection[]>
deleteSelection(id: string): Promise<void>
startSelection(id: string, language: LanguageCode, modelId: string): Promise<{ jobId: string }>
```

Extend `HelperCapabilities` with validated `models: HelperModel[]`. Enforce opaque ID/name/size/extension shapes. Do not create browser `File` objects and never expose native path data.

- [ ] **Step 3: Convert App queue to a discriminated source union**

Replace `QueuedFile.file: File` with:

```ts
type QueueSource =
  | { kind: "browser"; file: File }
  | { kind: "companion"; selectionId: string; name: string; sizeBytes: number }
type QueuedFile = {
  id: string
  source: QueueSource
  status: QueuedFileStatus
  transcriptId?: string
  error?: string
}
```

Add small helpers `queueFileName(item)` and `queueFileSize(item)`. Browser selection keeps `analyzeSelectedFile`. Companion selection sets selected queue ID, clears browser `file`/`analysis`, sets `awaiting-confirmation`, and displays its known filename/size without claiming duration/chunks. Existing local browser and server flows must receive a real `File` only after asserting `source.kind === "browser"`.

- [ ] **Step 4: Restore queue UI in companion mode**

Show `DropZone` in all modes. In companion mode its button calls `localHelperClient.connect()` then `selectFiles()`; append all returned selection rows. Disable drag/drop with a companion-specific native picker description. On remove, call `deleteSelection` first; only remove the local row after 204. While any job is active, disable selection, removal, and reordering.

Update EN/VI copy for “Choose files in Windows”, native-file metadata/preflight limitation, move up/down labels, and unavailable native selection errors.

- [ ] **Step 5: Add accessible ordering controls**

Add Move up / Move down icon buttons to `FileQueuePanel`:

```ts
function moveQueueItem(id: string, direction: -1 | 1) {
  setQueue((current) => {
    const index = current.findIndex((item) => item.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= current.length) return current
    const next = [...current]
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  })
}
```

Pass boundary-disabled buttons with localized `aria-label`s. Ordering applies to both source kinds and is frozen while running.

- [ ] **Step 6: Implement explicit companion start and batch reuse**

Replace `transcribeWithCompanion(settings)` with `transcribeCompanionSelection(item, settings)`. It asserts `source.kind === "companion"`, marks that item active, calls `startSelection`, subscribes to SSE, saves the returned transcript using `settings` language and the selected companion model ID, then marks the item complete/error. `startTranscription` dispatches the selected item. `startBatchTranscription` captures `queue` order and calls the same per-item function in a `for...of`, exactly as browser batches do. Do not auto-open result dialog after batch completion.

- [ ] **Step 7: Render companion models from capabilities**

Hold capabilities in component state after companion-mode connect. Use a non-persisted `companionModelId` initialized to the capability default (`ggml-large-v3-turbo-q5_0`) or first returned model. Render the existing `Select` only from `capabilities.models`; label each option with its native size/quality. Never render browser ONNX model IDs as companion choices. Use the selected native label in `PreflightPanel` and store the native model ID in the saved transcript.

No IndexedDB settings schema change: this avoids a storage migration for an ephemeral companion-only UI choice.

- [ ] **Step 8: Run frontend checks**

Run:

```powershell
pnpm test -- tests/unit/local-helper.test.ts
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: test commands exit 0; no TypeScript/lint/build errors.

### Task 6: Documentation and complete validation

**Files:**

- Modify: `companion/README.md`
- Modify: `server/README-helper-windows.md`
- Modify: `docs/superpowers/specs/2026-08-18-tauri-companion-design.md`

- [ ] **Step 1: Replace the obsolete endpoint and fixed-model documentation**

Document protocol v2 endpoints, native multi-select/repeated append behavior, opaque 30-minute selection IDs, queue removal/reordering semantics, companion model catalog capability response, and model download behavior. Remove all claims that selection immediately starts transcription or model is fixed. State that paths/media never leave the companion process.

- [ ] **Step 2: Run final automated verification**

Run:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm --filter whisdom-worker typecheck
cd server; cargo test -j 1; cargo build --release
cd ..\companion\src-tauri; cargo fmt --check; cargo check --features vulkan
cd ..\..; git diff --check
```

Expected: every applicable command exits 0. Record unrelated existing failures separately; do not claim suite-wide success if one remains.

- [ ] **Step 3: Perform manual companion smoke test**

From a clean test `WHISDOM_HELPER_ROOT`, launch the Vulkan companion and verify:

1. Tray icon/API health/pairing.
2. Picker cancel creates no queue row.
3. Single selection appends one native row.
4. Ctrl/Shift multi-selection appends multiple rows.
5. Repeated Choose files appends without replacing rows.
6. Reorder and remove update frontend only; no path appears in DevTools/API responses/logs.
7. Selected job downloads a model through Hugging Face redirect and completes.
8. Batch follows visual queue order.
9. Vulkan failure retries CPU; cancel emits `cancelled`.
10. SRT/VTT export contains native timestamp cues.
11. Unlisted Origin cannot select, start, inspect, cancel, delete selection, or clear cache.

- [ ] **Step 4: Check working tree without committing**

Run:

```powershell
git status --short
git diff --check
```

Do not commit, push, sign, or package. User approval is required for those actions.
