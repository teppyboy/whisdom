# drive-and-server-transcription - Work Plan

## TL;DR (For humans)

**What you'll get:** Google Drive automatically backs up each transcript to your private app folder after transcription finishes. The Cloudflare server transcription mode is fully activated — it converts your audio to WAV, splits it into safe chunks, uploads them to your Cloudflare Worker, and assembles the results. A new Rust/WebAssembly module replaces the hand-rolled JavaScript resampling code with a fast, accurate implementation.

**Why this approach:** Drive upload reuses the existing sign-in flow — no second login. Server auth reuses the same Drive access token as a Bearer credential. The Rust WASM is scoped narrowly (resample + WAV chunking only) so it ships fast without reimplementing audio format decoding.

**What it will NOT do:** Drive will not list or restore transcripts (write-only backup). Chunks will not be uploaded in parallel (intentional: avoids worker/model concurrency issues). Rust will not decode mp3/m4a/etc. — the browser's built-in decoder still handles that.

**Effort:** Large
**Risk:** Medium — WASM toolchain (wasm-pack, Vite WASM plugin) and Cloudflare Worker auth change are the two load-bearing risks; both have proven solutions.
**Decisions to sanity-check:** (1) Worker switches from `id_token` to `access_token` tokeninfo — verify your Cloudflare Worker env vars still match. (2) Rust WASM ships as `web` target loaded inside browser worker via dynamic import.

Your next move: run `$start-work` to begin execution. Full detail follows.

---

> TL;DR (machine): Large/Medium — three streams (Drive upload wiring, server transcription activation, Rust WASM audio-processor) converging in 4 waves; all verified by agent-executed tests.

## Scope

### Must have
- `uploadTranscriptMetadata()` called after each successful transcription when Drive is connected; silent token refresh beforehand; Drive status updates (uploading → synced / error)
- Cloudflare Worker: accept `access_token` (not `id_token`) in Bearer header; pass all non-empty language strings to Workers AI
- `transcribeFile()` cloudflare-ai branch: remove guardrail, add ffmpeg → WAV conversion, WASM chunk-split (≤9 MB), sequential `transcribeChunkWithServer()` calls, assemble `TranscriptDocument`, save to IndexedDB
- Rust/WASM `audio-processor` crate: `resample_to_mono_16k()` + `split_wav_chunks()` + `f32_to_16k_wav()`
- Vite configured to load `.wasm` in browser workers (`vite-plugin-wasm`)
- `transcribeLocally()` JS resample replaced with WASM `resample_to_mono_16k()`
- Unit tests: Drive upload trigger, WASM functions (Vitest + wasm-pack test)
- E2e: existing guardrail test updated; server mode smoke test (mocked fetch)
- `pnpm typecheck`, `pnpm build`, `pnpm test` all pass

### Must NOT have (guardrails, anti-slop, scope boundaries)
- No Drive read / list / restore — appDataFolder is write-only in this plan
- No parallel chunk uploads to server
- No Rust audio format decoder — `AudioContext.decodeAudioData()` stays for compressed-format decode
- No Durable Objects, KV, R2, Queues added to `worker/`
- No change to Drive OAuth scopes (stay `drive.file drive.appdata`)
- No multi-threaded ffmpeg
- No touches to local-webgpu or local-wasm model selection logic
- No React renders triggered from inside WASM or worker hot paths
- No raw `crypto.randomUUID()` — always use `createId()` from `src/lib/id.ts`

## Verification strategy
> Zero human intervention — all verification is agent-executed.

- Test decision: **tests-after** — Vitest for units, Playwright for e2e, `wasm-pack test --headless --chrome` for Rust
- Evidence: `.omo/evidence/task-<N>-drive-and-server-transcription.<ext>`
- Gate commands (run in order, all must exit 0):
  1. `pnpm typecheck`
  2. `pnpm --filter whisdom-worker typecheck`
  3. `rtk lint` (or `pnpm lint`)
  4. `pnpm test`
  5. `pnpm build`
  6. `pnpm test:e2e` (UI/storage/worker flows changed)

## Execution strategy

### Parallel execution waves

**Wave 1 (parallel — no cross-deps):**
T1 Worker auth + language fix | T2 Drive upload wiring | T3 Rust crate scaffold + Vite WASM config

**Wave 2 (parallel — T1 must complete before T5/T6; T3 must complete before T4):**
T4 Rust WASM implementation | T5 Server transcription pipeline | T6 Drive UI states

**Wave 3 (after T4 and T5 complete):**
T7 Replace JS resample with WASM in local path

**Wave 4 (after all code complete):**
T8 Tests (unit + e2e)

**Final (after T8):**
F1–F4 review wave

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
|------|------------|--------|----------------------|
| 1 Worker auth + language | — | 5 | 2, 3 |
| 2 Drive upload wiring | — | 6 | 1, 3 |
| 3 Rust crate scaffold | — | 4 | 1, 2 |
| 4 Rust WASM impl | 3 | 7 | 5, 6 |
| 5 Server pipeline path | 1 | 8 | 4, 6 |
| 6 Drive UI states | 2 | 8 | 4, 5 |
| 7 Replace JS resample | 4 | 8 | — |
| 8 Tests | 5, 6, 7 | F1–F4 | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. `worker/src/index.ts`: fix auth to accept access_token + pass all languages
  What to do:
    1. In `/api/auth/check` and `/api/transcribe-chunk` auth guard: change tokeninfo URL from
       `https://www.googleapis.com/oauth2/v1/tokeninfo?id_token=${token}` to
       `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`.
    2. Remove the `if (language !== 'en' && language !== 'vi')` guard (or equivalent) that
       restricts which language string reaches Workers AI. Pass any non-empty `language` string
       directly to the `@cf/openai/whisper-large-v3-turbo` binding. Keep existing empty/missing
       language fallback (default to 'en' or let Workers AI decide — whichever the current code
       does for missing values).
  Must NOT do: do not change CORS, rate-limit logic, or any other auth field. Do not rename env
    vars. Do not add new endpoints.
  Parallelization: Wave 1 | Blocked by: — | Blocks: T5
  References:
    - `worker/src/index.ts`: full file (~124 lines); tokeninfo call ~lines 45-70; language filter
      ~lines 90-100
    - `worker/wrangler.jsonc`: env var names (ALLOWED_EMAILS, ALLOWED_DOMAINS, ALLOWED_ORIGIN)
  Acceptance criteria (agent-executable):
    - `pnpm --filter whisdom-worker typecheck` exits 0
    - Manual curl to a locally-started worker with an access_token returns 200 (or verify by
      reading code: tokeninfo URL uses `access_token=` param)
    - `grep "id_token" worker/src/index.ts` returns 0 matches
    - `grep "access_token" worker/src/index.ts` returns ≥1 match in tokeninfo URL
  QA scenarios:
    - Happy: tokeninfo URL contains `access_token=`; language `"fr"` passes through to AI binding.
    - Failure: if old `id_token` param still present, grep catches it.
    - Evidence: `.omo/evidence/task-T1-worker-auth.txt` — paste grep outputs + typecheck result.
  Commit: Y | `fix(worker): accept access_token bearer and pass all whisper languages`

- [ ] 2. `src/App.tsx` + `src/features/google-drive/drive.ts`: wire Drive upload after transcription
  What to do:
    1. In `transcribeFile()` (App.tsx:716-791), after the `saveTranscript(doc)` / IndexedDB save
       succeeds, add a Drive upload block:
       ```ts
       if (driveAccessToken) {
         setDriveStatus('uploading');
         try {
           // silent token refresh — if GIS token expired, re-request silently
           let token = driveAccessToken;
           try {
             token = await requestDriveAccess(); // requestDriveAccess already handles prompt:''
           } catch { /* keep existing token */ }
           await uploadTranscriptMetadata(token, doc);
           setDriveStatus('synced');
         } catch (err) {
           console.error('Drive upload failed', err);
           setDriveStatus('error');
         }
       }
       ```
    2. In `src/features/google-drive/drive.ts`, confirm `requestDriveAccess()` uses
       `prompt: ''` on the token client (silent refresh). If it currently omits `prompt`, add
       `prompt: ''` to the `initTokenClient` config so re-requesting does not show a popup.
    3. Add `'error'` to the DriveStatus union type (or whatever the type is called) if not already
       present. Update COPY keys if a new status string needs display text — check COPY.en/vi at
       App.tsx:157-166 / 317-326 and add an `'error'` key if missing.
  Must NOT do: do not call uploadTranscriptMetadata in any other path. Do not block the
    transcription result from being shown to the user if Drive upload fails. Do not widen Drive
    scopes. Do not add Drive read/list calls.
  Parallelization: Wave 1 | Blocked by: — | Blocks: T6
  References:
    - `src/App.tsx`: transcribeFile() :716-791; driveStatus/driveAccessToken state ~line 300;
      COPY.en/vi keys :157-166 / :317-326
    - `src/features/google-drive/drive.ts`: full file (102 lines) — requestDriveAccess(),
      uploadTranscriptMetadata()
    - `src/features/transcription/types.ts`: TranscriptDocument :66-77
  Acceptance criteria (agent-executable):
    - `pnpm typecheck` exits 0
    - `grep -n "uploadTranscriptMetadata" src/App.tsx` shows exactly 1 call site inside
      transcribeFile()
    - DriveStatus type includes `'uploading' | 'synced' | 'error'` (or equivalent)
  QA scenarios:
    - Happy: mock `uploadTranscriptMetadata` in unit test; verify it is called once with the saved
      doc after transcription completes; driveStatus transitions uploading → synced.
    - Failure: mock `uploadTranscriptMetadata` to throw; verify driveStatus → error; transcription
      result still returned to user (no re-throw).
    - Evidence: `.omo/evidence/task-T2-drive-upload.txt` — typecheck output + grep result.
  Commit: Y | `feat(drive): upload transcript to appDataFolder after each transcription`

- [ ] 3. Scaffold Rust `audio-processor` crate + Vite WASM config
  What to do:
    1. Create `audio-processor/` directory at repo root with:
       - `Cargo.toml`:
         ```toml
         [package]
         name = "audio-processor"
         version = "0.1.0"
         edition = "2021"
         
         [lib]
         crate-type = ["cdylib", "rlib"]
         
         [dependencies]
         wasm-bindgen = "0.2"
         rubato = "0.14"
         hound = "3.5"
         
         [dev-dependencies]
         wasm-bindgen-test = "0.3"
         
         [profile.release]
         opt-level = 3
         lto = true
         ```
       - `src/lib.rs`: empty stubs with `#[wasm_bindgen]` exports (filled in T4):
         ```rust
         use wasm_bindgen::prelude::*;
         
         #[wasm_bindgen]
         pub fn resample_to_mono_16k(samples: &[f32], src_rate: u32, channels: u16) -> Vec<f32> { vec![] }
         
         #[wasm_bindgen]
         pub fn f32_to_16k_wav(samples: &[f32]) -> Vec<u8> { vec![] }
         
         #[wasm_bindgen]
         pub fn split_wav_chunks(wav: &[u8], max_bytes: usize) -> js_sys::Array { js_sys::Array::new() }
         ```
    2. Add `wasm-pack` to build process. Add to `package.json` scripts:
       ```json
       "build:wasm": "wasm-pack build audio-processor --target web --out-dir src/wasm/audio-processor"
       ```
       Output directory: `src/wasm/audio-processor/` (gitignored — generated artifact).
    3. Install `vite-plugin-wasm` and `vite-plugin-top-level-await`:
       `pnpm add -D vite-plugin-wasm vite-plugin-top-level-await`
    4. In `vite.config.ts`, add:
       ```ts
       import wasm from 'vite-plugin-wasm';
       import topLevelAwait from 'vite-plugin-top-level-await';
       // inside plugins array:
       wasm(),
       topLevelAwait(),
       ```
    5. Add `src/wasm/` to `.gitignore` if not already present.
  Must NOT do: do not implement the Rust logic here (that is T4). Do not change any existing
    Vite plugin configuration. Do not commit generated `src/wasm/` artifacts.
  Parallelization: Wave 1 | Blocked by: — | Blocks: T4
  References:
    - `vite.config.ts`: existing plugin list
    - `package.json`: scripts section
    - `.gitignore`: check existing ignores
  Acceptance criteria (agent-executable):
    - `pnpm run build:wasm` exits 0 and produces `src/wasm/audio-processor/audio_processor_bg.wasm`
    - `pnpm typecheck` exits 0 (stub lib.rs compiles)
    - `pnpm build` exits 0 (Vite handles WASM imports)
  QA scenarios:
    - Happy: build:wasm succeeds; wasm file present; `ls src/wasm/audio-processor/*.wasm` non-empty.
    - Failure: if wasm-pack missing globally, install via `cargo install wasm-pack` then retry.
    - Evidence: `.omo/evidence/task-T3-wasm-scaffold.txt` — ls output of src/wasm/audio-processor/.
  Commit: Y | `build: add Rust audio-processor WASM crate scaffold and vite-plugin-wasm`

- [ ] 4. Implement Rust WASM audio functions in `audio-processor/src/lib.rs`
  What to do:
    Implement three exported functions (replacing the stubs from T3):

    **`resample_to_mono_16k(samples: &[f32], src_rate: u32, channels: u16) -> Vec<f32>`**
    - Downmix to mono: average every `channels` adjacent samples.
    - If `src_rate == 16000` and `channels == 1`, return input unchanged.
    - Use rubato `SincFixedIn` resampler with `SincInterpolationParameters { sinc_len: 256,
      f_cutoff: 0.95, interpolation: SincInterpolationType::Linear, oversampling_factor: 128,
      window: WindowFunction::BlackmanHarris2 }` to resample mono signal to 16000 Hz.
    - Return the resampled `Vec<f32>`.

    **`f32_to_16k_wav(samples: &[f32]) -> Vec<u8>`**
    - Write a 16-bit PCM WAV (hound WavWriter to a `Cursor<Vec<u8>>`), sample rate 16000, mono.
    - Clamp f32 to [-1.0, 1.0], multiply by i16::MAX, cast to i16.
    - Return the raw WAV bytes.

    **`split_wav_chunks(wav: &[u8], max_bytes: usize) -> js_sys::Array`**
    - Parse WAV header with hound to get `spec` (channels, sample_rate, bits_per_sample).
    - Compute samples_per_chunk = floor((max_bytes - 44) * 8 / (spec.channels * spec.bits_per_sample)).
    - Split PCM data at `samples_per_chunk` sample boundaries. For each slice, write a new
      self-contained WAV (header + PCM slice) using hound.
    - Return a `js_sys::Array` of `js_sys::Uint8Array` objects (one per chunk).
    - If the input WAV is already ≤ max_bytes, return an array with a single item (the full input).

    Add Rust unit tests in `#[cfg(test)]` module:
    - Test `resample_to_mono_16k` with a 48000 Hz stereo sine wave → verify output length ≈ input/6.
    - Test `f32_to_16k_wav` → parse output with hound, verify sample_rate=16000, channels=1.
    - Test `split_wav_chunks` with a synthetic WAV > max_bytes → verify each chunk ≤ max_bytes and
      hound can parse each chunk header.

    Run `wasm-pack build audio-processor --target web --out-dir src/wasm/audio-processor`.
    Run `wasm-pack test audio-processor --headless --chrome` (Rust tests in browser).
  Must NOT do: do not use unsafe, do not use threads (WASM is single-threaded), do not pull in
    FFT-based resamplers that require SIMD (not universally available in WASM), do not add
    `AudioContext` calls in Rust.
  Parallelization: Wave 2 | Blocked by: T3 | Blocks: T7
  References:
    - `audio-processor/Cargo.toml` (from T3)
    - `audio-processor/src/lib.rs` stubs (from T3)
    - rubato docs: SincFixedIn API — https://docs.rs/rubato/latest/rubato/struct.SincFixedIn.html
    - hound docs: WavWriter, WavReader — https://docs.rs/hound/latest/hound/
    - wasm-bindgen js_sys::Array, Uint8Array — https://rustwasm.github.io/wasm-bindgen/api/js_sys/
  Acceptance criteria (agent-executable):
    - `wasm-pack build audio-processor --target web --out-dir src/wasm/audio-processor` exits 0
    - `wasm-pack test audio-processor --headless --chrome` exits 0 (all 3 Rust unit tests pass)
    - `src/wasm/audio-processor/audio_processor_bg.wasm` present and > 0 bytes
  QA scenarios:
    - Happy: all three Rust tests pass; wasm file generated.
    - Failure: rubato compile error → check rubato version in Cargo.toml matches API used.
      split_wav_chunks returns wrong chunk count → add debug assert in test.
    - Evidence: `.omo/evidence/task-T4-wasm-impl.txt` — wasm-pack test output.
  Commit: Y | `feat(wasm): implement resample_to_mono_16k, f32_to_16k_wav, split_wav_chunks`

- [ ] 5. `src/App.tsx` + `src/features/server-transcription/client.ts`: activate server transcription pipeline
  What to do:
    **In `src/features/server-transcription/client.ts`:**
    1. In `transcribeChunkWithServer()`, change the Authorization header from
       `Bearer ${params.idToken}` to `Bearer ${params.accessToken}` (rename the param field from
       `idToken` to `accessToken` throughout this file and its call sites).

    **In `src/App.tsx`, `transcribeFile()` (lines 716-791):**
    2. Remove the guardrail block at lines 719-721 that returns early with an error for
       `cloudflare-ai` mode.
    3. Implement the `cloudflare-ai` branch (after the guardrail removal):
       ```
       a. Run analyzeMediaFile(file, { mode: 'cloudflare-ai' }) to get mediaInfo.
       b. Determine audio blob:
          - If file is video (mediaInfo.needsConversion or mediaInfo.isVideo):
              convert via existing ffmpeg worker → get WAV Blob.
          - Else: use file directly (already audio).
       c. Convert blob to Uint8Array: const wavBytes = new Uint8Array(await blob.arrayBuffer()).
       d. Import WASM: const { split_wav_chunks } = await import('../wasm/audio-processor/audio_processor.js').
          Call init() if the generated WASM module exports one.
       e. const chunks: Uint8Array[] = split_wav_chunks(wavBytes, 9 * 1024 * 1024).
          (split_wav_chunks returns js_sys::Array of Uint8Array; convert to Array<Uint8Array>.)
       f. Ensure driveAccessToken is set (user must be signed in for server mode — if not, show
          toast COPY.en.serverRequiresAuth and return).
       g. const texts: string[] = [];
          for (const chunk of chunks) {
            const audio = new Blob([chunk], { type: 'audio/wav' });
            const result = await transcribeChunkWithServer({
              audio, language: runSettings.language, accessToken: driveAccessToken
            });
            texts.push(result.text.trim());
          }
       h. Assemble TranscriptDocument:
          const doc: TranscriptDocument = {
            id: createId('tr'),
            title: file.name,
            sourceName: file.name,
            language: runSettings.language,
            modelId: 'cloudflare-whisper-large-v3-turbo',
            mode: 'cloudflare-ai',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            text: texts.join(' '),
            segments: [],
          };
       i. Save to IndexedDB via saveTranscript(doc).
       j. Dispatch result to queue state (same as local path does after transcribeLocally()).
       ```
    4. Add COPY key `serverRequiresAuth` to COPY.en and COPY.vi if it does not exist.
    5. Add progress updates during chunk uploads (set queue item status, update progress log
       using the same pattern as the local path).
  Must NOT do: do not use raw crypto.randomUUID() — use createId(). Do not upload chunks in
    parallel. Do not auto-open result dialog (batch completion shows toast, not dialog —
    AGENTS.md UI rule). Do not modify local-webgpu or local-wasm branches.
  Parallelization: Wave 2 | Blocked by: T1 | Blocks: T8
  References:
    - `src/App.tsx`: transcribeFile() :716-791; QueuedFile type :125-132; saveTranscript calls;
      driveAccessToken state; createId import; progress log pattern; COPY.en/vi :157-166/:317-326
    - `src/features/server-transcription/client.ts`: full file (54 lines)
    - `src/features/transcription/types.ts`: TranscriptDocument :66-77; ProcessingMode
    - `src/features/media/preflight.ts`: analyzeMediaFile(), SERVER_CHUNK_LIMIT_MB
    - `src/lib/transcription-worker-client.ts`: ffmpeg conversion pattern (how local path calls it)
    - `src/lib/id.ts`: createId()
    - `src/wasm/audio-processor/audio_processor.js` (generated by T4 — import path)
  Acceptance criteria (agent-executable):
    - `grep "719\|guardrail\|cloudflare-ai.*return\|Server transcription.*not" src/App.tsx` → 0 matches
    - `pnpm typecheck` exits 0
    - `pnpm build` exits 0
  QA scenarios:
    - Happy: with mocked `transcribeChunkWithServer`, a WAV file triggers N chunk uploads and
      assembles text correctly (unit test in T8).
    - Failure: missing driveAccessToken → toast shown, no crash. ffmpeg failure → propagates
      as queue item error (same as local path).
    - Evidence: `.omo/evidence/task-T5-server-pipeline.txt` — typecheck + grep output.
  Commit: Y | `feat(server): activate cloudflare-ai transcription pipeline with WAV chunking`

- [ ] 6. `src/App.tsx`: Drive upload status UI states (uploading → synced / error)
  What to do:
    1. Ensure `driveStatus` state includes `'uploading'` and `'synced'` and `'error'` values
       (union type must cover all three).
    2. In the account menu section of App.tsx, update the Drive status display:
       - `'uploading'` → show a spinner icon (use existing shadcn Loader2 or similar) + COPY
         key `uploadingMetadata` (already exists at :157-166).
       - `'synced'` → show a checkmark icon + COPY key `synced`.
       - `'error'` → show an error icon + COPY key `driveSyncFailed`.
       - `'connected'` / `'not-connected'` → existing behavior unchanged.
    3. Confirm COPY.en/vi already has all required keys (`uploadingMetadata`, `synced`,
       `driveSyncFailed`, `googleConnected`, `notConnected`). Add any missing key to BOTH
       COPY.en and COPY.vi.
  Must NOT do: do not change the sign-in button behavior. Do not add new Drive scopes. Do not
    show the Drive status in any location other than the existing account menu.
  Parallelization: Wave 2 | Blocked by: T2 | Blocks: T8
  References:
    - `src/App.tsx`: driveStatus state; account menu JSX; COPY.en :157-166; COPY.vi :317-326
    - `src/components/ui/`: shadcn icons available (Loader2, Check, AlertCircle from lucide-react)
  Acceptance criteria (agent-executable):
    - `pnpm typecheck` exits 0
    - `grep -n "uploading\|synced\|error" src/App.tsx` shows icon+copy assignments for each status
  QA scenarios:
    - Happy: set driveStatus = 'uploading' in browser devtools → spinner visible. 'synced' →
      checkmark. 'error' → error icon.
    - Failure: missing COPY key → TS error caught by typecheck.
    - Evidence: `.omo/evidence/task-T6-drive-ui.txt` — typecheck output + grep.
  Commit: Y | `feat(ui): show Drive upload status in account menu (uploading/synced/error)`

- [ ] 7. `src/lib/transcription-worker-client.ts`: replace JS resample with Rust WASM
  What to do:
    In `transcribeLocally()` (lines 48-145 of transcription-worker-client.ts):
    1. Locate the section that:
       a. Creates an `OfflineAudioContext` (or `AudioContext`) to decode audio and get a raw
          `AudioBuffer` / `Float32Array`.
       b. Performs JS-based resampling (manual loop or OfflineAudioContext playback-rate trick).
    2. Keep step (a) — `AudioContext.decodeAudioData()` for format-agnostic decode stays.
    3. Extract the decoded samples as a `Float32Array` (channel data) and the source sample rate.
    4. Replace step (b) with:
       ```ts
       import initAudioProcessor, { resample_to_mono_16k } from '../wasm/audio-processor/audio_processor.js';
       await initAudioProcessor(); // idempotent after first call
       const resampled = resample_to_mono_16k(
         decodedSamples,        // Float32Array from AudioBuffer
         sourceRate,            // AudioBuffer.sampleRate
         audioBuffer.numberOfChannels
       );
       ```
       Pass `resampled` (Float32Array) to the browser ASR worker instead of the old resampled data.
    5. The WASM module init must be called once; guard with a module-level `let initialized = false`
       promise-based singleton so repeated calls to `transcribeLocally()` do not re-init.
  Must NOT do: do not remove AudioContext.decodeAudioData() — it handles compressed formats (mp3,
    m4a, ogg) that Rust cannot decode. Do not post the raw compressed bytes to the ASR worker. Do
    not add WASM init inside the browser ASR worker (src/workers/transcription.worker.ts) — WASM
    loads in the client (main thread side of the worker client).
  Parallelization: Wave 3 | Blocked by: T4 | Blocks: T8
  References:
    - `src/lib/transcription-worker-client.ts`: transcribeLocally() :48-145 — full decode+resample section
    - `src/wasm/audio-processor/audio_processor.js` (generated — export surface)
    - `src/workers/transcription.worker.ts`: what format the worker expects (Float32Array at 16kHz)
  Acceptance criteria (agent-executable):
    - `pnpm typecheck` exits 0
    - `pnpm build` exits 0
    - `grep "OfflineAudioContext\|resampleBuffer\|playbackRate" src/lib/transcription-worker-client.ts`
      returns 0 matches (old JS resample removed)
  QA scenarios:
    - Happy: `pnpm test:e2e` (or real ASR smoke with WHISDOM_REAL_ASR=1) — transcription still
      produces correct text.
    - Failure: WASM init fails at runtime → add try/catch that falls back to old JS resample path
      and logs a warning, so ASR is not broken if WASM fails to load.
    - Evidence: `.omo/evidence/task-T7-wasm-integration.txt` — typecheck + grep output.
  Commit: Y | `perf(worker): replace JS resample with Rust WASM resample_to_mono_16k`

- [ ] 8. Tests: unit + e2e coverage for all three features
  What to do:
    **Unit tests** (add to `tests/unit/`):

    A. `tests/unit/drive-upload.test.ts`:
       - Mock `uploadTranscriptMetadata` and `requestDriveAccess`.
       - Render App (or isolate the upload logic into a testable helper) with driveAccessToken set.
       - Trigger a fake transcription completion.
       - Assert: `uploadTranscriptMetadata` called once with the saved TranscriptDocument.
       - Assert: `driveStatus` transitions → `'uploading'` → `'synced'`.
       - Assert: when `uploadTranscriptMetadata` throws, `driveStatus` → `'error'` and no exception
         propagates to the caller.

    B. `tests/unit/server-transcription.test.ts`:
       - Mock `transcribeChunkWithServer` returning `{ text: 'hello' }`.
       - Mock WASM `split_wav_chunks` returning 2 chunks.
       - Call the server transcription branch of `transcribeFile()` with a WAV Blob.
       - Assert: `transcribeChunkWithServer` called twice (once per chunk).
       - Assert: resulting `TranscriptDocument.text` = `'hello hello'` (joined).
       - Assert: `createId` used (not crypto.randomUUID).

    **E2e tests** (`tests/e2e/whisdom.spec.ts`):
    C. Update the existing guardrail test at lines 240-248:
       - The test currently asserts that selecting cloudflare-ai mode shows a "not available" /
         guardrail message. Remove or replace this assertion.
       - New assertion: in cloudflare-ai mode, if no VITE_CF_WORKER_URL is set, show an appropriate
         "worker URL not configured" message instead (check what loadServerCapabilities returns when
         URL is absent).

    D. Add a new e2e test `tests/e2e/server-transcription.spec.ts`:
       - Use Playwright `page.route()` to mock `**/api/transcribe-chunk` → `{ text: 'mocked text' }`
         and `**/api/auth/check` → `{ authorized: true }`.
       - Set drive access token via devtools / app state hook.
       - Upload a small WAV file, select cloudflare-ai mode.
       - Assert: transcript result shows 'mocked text'.
       - Assert: Drive upload attempted (mock `**/drive/v3/files` and verify fetch call made).

    Run `pnpm test` (unit) and `pnpm test:e2e` (e2e) after writing tests.
  Must NOT do: do not write tests that require real network calls or real Drive auth. Do not add
    tests that auto-open the result dialog (verify toast instead per AGENTS.md UI rule).
  Parallelization: Wave 4 | Blocked by: T5, T6, T7 | Blocks: F1–F4
  References:
    - `tests/unit/`: existing test patterns
    - `tests/e2e/whisdom.spec.ts`: :240-248 (guardrail test to update)
    - `src/App.tsx`: transcribeFile() shape for mocking
    - `src/features/server-transcription/client.ts`: transcribeChunkWithServer signature
    - `src/features/google-drive/drive.ts`: uploadTranscriptMetadata signature
    - Playwright docs: page.route() for mocking
  Acceptance criteria (agent-executable):
    - `pnpm test` exits 0 (all unit tests pass including new A + B)
    - `pnpm test:e2e` exits 0 (all e2e pass including updated C + new D)
    - No test uses `crypto.randomUUID()` directly
  QA scenarios:
    - Happy: all tests green, no flakiness.
    - Failure: Drive upload test fails → check mock import path matches actual drive.ts export.
      E2e server test fails → verify page.route() pattern matches actual fetch URL in client.ts.
    - Evidence: `.omo/evidence/task-T8-tests.txt` — `pnpm test` output + `pnpm test:e2e` output.
  Commit: Y | `test: add Drive upload, server transcription, and guardrail update tests`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
  Agent: oracle — read-only.
  Task: verify every Must-have is implemented; every Must-NOT-have is absent.
  Check: grep for removed guardrail, drive upload call site, WASM imports, no raw randomUUID,
    no parallel chunk uploads, no Drive read calls, no new Drive scopes.
  Evidence: `.omo/evidence/F1-compliance.txt`

- [ ] F2. Code quality review
  Agent: oracle — read-only.
  Task: review all changed files (App.tsx, drive.ts, client.ts, worker/src/index.ts,
    transcription-worker-client.ts, audio-processor/src/lib.rs) for correctness, type safety,
    error handling completeness, and AGENTS.md architecture rules.
  Evidence: `.omo/evidence/F2-quality.txt`

- [ ] F3. Real manual QA (agent-executed gate commands)
  Agent: build — run commands, capture output.
  Commands (all must exit 0):
    1. `pnpm typecheck`
    2. `pnpm --filter whisdom-worker typecheck`
    3. `rtk lint`
    4. `pnpm test`
    5. `pnpm build`
    6. `pnpm test:e2e`
  Evidence: `.omo/evidence/F3-qa.txt` — full output of each command.

- [ ] F4. Scope fidelity
  Agent: oracle — read-only.
  Task: confirm no accidental scope creep — no new UI routes, no new Drive endpoints, no new
    worker routes, no changes to local-webgpu/local-wasm model selection, no multi-threaded ffmpeg.
  Evidence: `.omo/evidence/F4-scope.txt`

## Commit strategy

All commits are per-todo (Y above). Suggested merge order after all todos pass:
1. T3 (scaffold — no runtime effect)
2. T1, T2 in parallel (independent features)
3. T4 (WASM impl)
4. T5, T6 in parallel
5. T7
6. T8

Do not create a merge commit or squash unless explicitly asked.

## Success criteria

- `pnpm typecheck` exits 0
- `pnpm --filter whisdom-worker typecheck` exits 0
- `rtk lint` exits 0
- `pnpm test` exits 0 (all unit tests including T8-A, T8-B)
- `pnpm build` exits 0
- `pnpm test:e2e` exits 0 (including T8-C, T8-D)
- `wasm-pack build audio-processor --target web --out-dir src/wasm/audio-processor` exits 0
- Drive upload fires exactly once after each successful transcription when `driveAccessToken` is set
- Server mode (cloudflare-ai) no longer blocked by guardrail; processes chunks sequentially
- Rust WASM resample path active in local transcription; old OfflineAudioContext resample removed
- No raw `crypto.randomUUID()` calls in new code
