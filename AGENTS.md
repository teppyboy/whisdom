# AGENTS.md

Guidance for AI agents working in this repository.

## Project

Whisdom is a privacy-first speech-to-text web app. Its default transcription path is fully browser-side. Optional integrations add Google Drive metadata sync, Cloudflare Workers AI chunk transcription, and a Rust/whisper.cpp server.

Core product constraints:

- Keep local transcription usable without an application server.
- Never upload user media unless the user selected an explicit network-backed mode.
- Keep long-running media and inference work outside React rendering.
- Preserve English and Vietnamese UI copy.
- Preserve static GitHub Pages deployment at the custom-domain root.
- Treat IndexedDB compatibility and rollback safety as data-loss boundaries.

## Stack

- Package manager: `pnpm@11.5.2`.
- Node: `>=22.22.2`; `.node-version` selects Node 24.
- Frontend: Vite 8, React 19, TypeScript 6, Tailwind CSS 4, shadcn/ui, Radix.
- Local ASR: `@huggingface/transformers`, ONNX Runtime Web, WebGPU/WASM.
- Media conversion: single-threaded `ffmpeg.wasm` in a dedicated worker.
- Browser storage: IndexedDB through `idb`; model assets through Cache Storage.
- Tests: Vitest, Testing Library, Playwright, axe-core.
- Optional backends: Cloudflare Worker with Workers AI; Rust/Axum server with whisper.cpp.

## Architecture

`src/main.tsx` mounts `ThemeProvider` and `App`. `src/App.tsx` is the current orchestration boundary: settings hydration, file queue, preflight, processing-mode dispatch, progress, history, dialogs, toasts, Drive state, and server capabilities. Most page-level components remain in that file.

Feature modules contain domain and integration logic:

- `src/features/transcription/types.ts`: shared app/domain contracts.
- `src/features/transcription/models.ts`: model catalog, defaults, dtype, local-device constraints.
- `src/features/transcription/language.ts`: searchable Whisper language catalog and mapping.
- `src/features/transcription/exports.ts`: `.txt`, `.json`, `.srt`, `.vtt` serialization.
- `src/features/media/preflight.ts`: metadata, duration timeout, memory estimate, WebGPU checks, warnings.
- `src/lib/transcription-worker-client.ts`: singleton ASR and ffmpeg worker clients.
- `src/workers/transcription.worker.ts`: Transformers.js pipeline, custom cache, timestamped ASR.
- `src/workers/ffmpeg.worker.ts`: conversion to 16 kHz mono WAV.
- `src/features/storage/database.ts`: version-compatible IndexedDB open/close behavior.
- `src/features/storage/compatibility.ts`: strict v2 schema and data validators/projections.
- `src/features/storage/indexed-db.ts`: settings/transcript CRUD across v1 and v2 storage.
- `src/features/storage/compatibility-api.ts`: browser migration-test adapter exposed on `window`.
- `src/features/storage/cleanup.ts`: current and legacy model-cache keys.
- `src/features/google-drive/drive.ts`: Google Identity Services and Drive app-data upload.
- `src/features/server-transcription/client.ts`: Cloudflare chunk endpoint client.
- `src/features/server-transcription/api.ts`: Rust server job API client.
- `src/features/server-transcription/sse.ts`: Rust server SSE stream parser.
- `src/app/copy.ts`: typed product error/issue copy primitives.
- `src/components/product/ProductErrorPanel.tsx`: fatal/recoverable product error presentation.
- `src/components/ui/`: shared shadcn-style primitives.

## Processing Modes

### Local WebGPU and Local WASM

1. `analyzeMediaFile()` reads metadata and recommends a device.
2. Unsupported/video input is converted by the singleton ffmpeg worker.
3. The client decodes, mixes to mono, and resamples to 16 kHz.
4. The singleton transcription worker loads/reuses the requested pipeline.
5. The resulting text and timestamped segments are saved locally.

Rules:

- Large local models use q4 weights and require WebGPU. Never allow them to fall through to WASM.
- WebGPU requires a secure context or localhost plus a usable adapter.
- The loaded pipeline key is model + device + dtype. Worker reset discards that in-memory state.
- The local worker currently uses fixed 30-second chunks and 1-second stride. Do not assume the settings-page chunk values alter local ASR without wiring them through.

### Cloudflare Workers AI

- Selected through `cloudflare-ai` mode and `VITE_CF_WORKER_URL`.
- Input is converted when needed, split by the committed WASM audio processor into 9 MiB chunks, and uploaded sequentially to `/api/transcribe-chunk`.
- The current result is text-only: stored segments are empty, so SRT/VTT exports contain no cues.
- `worker/` is a separate pnpm workspace and manual deployment target.
- The Worker and Rust server are different APIs. Do not share capability types or assume equivalent auth/model behavior.

### Rust Server

- Selected through `server` mode and `VITE_SERVER_URL`.
- `ServerTranscriptionApi` submits either a file or URL plus optional language/model.
- The server creates an in-memory job, runs download/extract/transcribe stages, and streams status over authenticated SSE.
- Returned segments are converted to local `TranscriptDocument` records.
- Models are preloaded at startup. Same-model requests are serialized; different models may run concurrently.
- Jobs and progress are ephemeral. Server restart loses them.
- Cancellation exists in the API/server but is not currently wired to the UI. Do not claim UI cancellation works without implementing and testing it.

## Concurrency And Workers

- Batch transcription is intentionally sequential.
- Only one local transcription and one ffmpeg conversion may be active.
- Preserve singleton workers unless a reset is explicitly required.
- `clearLocalWorkerState()` refuses reset while work is active.
- Before deleting model caches, clear idle worker state so a worker cannot retain stale loaded assets.
- Keep CPU/GPU-heavy work in workers or the Rust server, never in React render/effect loops.
- Keep ffmpeg.wasm single-threaded. Multithreaded ffmpeg needs COOP/COEP and `SharedArrayBuffer`, incompatible with the current Pages setup.

## Storage Compatibility

Storage changes are release-critical.

- Database name: `whisdom`.
- `openCompatibleDatabase()` intentionally opens without requesting a numeric version.
- A fresh profile creates the v1-compatible two-store layout: `settings` and `transcripts`.
- Existing v1 and v2 databases open without upgrade or downgrade.
- Versions newer than 2 are closed and reported as unsupported. The app must show the localized fatal product error and refuse every public storage mutation.
- v1 stores direct settings and `TranscriptDocument` rows.
- v2 requires the exact nine-store schema defined in `compatibility.ts`.
- v2 transcripts use canonical millisecond segments, revisioned live envelopes, and tombstones. Listing projects only valid live records.
- Compatibility parsing is strict and fail-closed: exact keys, scalar validity, bounds, lineage, derived text, and time conversion.
- `window.__WHISDOM_STORAGE_COMPATIBILITY__` exists for migration/browser verification. Keep it aligned with public storage operations.
- `persistMediaBlobs` is currently only a saved preference/warning. Media blobs do not survive reload; do not claim resumable jobs.

When changing storage schema, canonicalization, CRUD, or migration behavior:

- Update `database.ts`, `compatibility.ts`, `indexed-db.ts`, and relevant fixtures together.
- Run unit compatibility/database tests and `tests/e2e/migration.spec.ts`.
- Preserve unsupported-newer-version no-mutation behavior.
- Review `docs/runbooks/precision-studio-rollback.md`.
- `scripts/check-rollback-floor.mjs` requires `docs/releases/precision-studio-slice-1a.json`. That evidence is currently absent, so no rollback floor is established and the checker must fail closed. Never invent or bypass evidence.

## UI And Copy

- Keep the shadcn/Vercel visual language: neutral, flat, precise, restrained; no decorative gradients.
- Reuse `src/components/ui/` before creating controls. Do not overwrite local shadcn customizations.
- Preserve mobile stacking, full-width mobile controls, and touch targets.
- App language is the account-menu EN/VI toggle. Transcription language is a separate searchable picker.
- Most current app copy remains in `COPY.en` and `COPY.vi` inside `src/App.tsx`; typed product-foundation copy lives in `src/app/copy.ts`. Update both languages for every user-facing string.
- Result display remains a centered dialog: raw text, timestamped text, rename, exports.
- A single-file success opens the result dialog. Batch completion shows a toast and must not auto-open it.
- New file selections append to the queue. Do not replace existing queued files unless explicitly clearing.
- Use `createId()` from `src/lib/id.ts`; do not use unguarded `crypto.randomUUID()`.

## Google Drive And Authentication

- Google OAuth tokens are held in memory, not persisted.
- Keep scopes limited to `drive.file` and `drive.appdata` unless the user explicitly approves broader access.
- Current Drive sync uploads transcript JSON into `appDataFolder`; it does not upload source media.
- Production network-backed transcription requires Google sign-in; development may use explicit bypass paths.
- Production Cloudflare transcription is currently broken: GIS returns an OAuth access token and the frontend forwards it, but `worker/src/index.ts` validates it through Google tokeninfo's `id_token` parameter. Align that contract before claiming Cloudflare mode works.
- Rust correctly validates the same frontend token through tokeninfo's `access_token` parameter. Trace any auth change end-to-end through both backends.
- Empty Rust allowlists permit any verified Google account; empty Cloudflare Worker allowlists deny everyone.

## Backend Security Rules

### Cloudflare Worker

- Configure `ALLOWED_ORIGIN`, `ALLOWED_EMAILS`, and/or `ALLOWED_DOMAINS` before deployment. The committed origin is a placeholder.
- Keep the 10 MiB chunk limit unless the browser chunking contract changes with it.
- Do not broaden CORS or identity allowlists casually.
- Run `pnpm --filter whisdom-worker typecheck` after changes.

### Rust Server

- `server/config.toml` is development-oriented and currently enables `dev_auth_bypass`. Disable it for production.
- Production requires TLS through a reverse proxy, explicit origin/identity policy, bounded uploads, and a non-root service user.
- URL ingestion invokes `yt-dlp`. Treat URL validation and egress policy as SSRF/security boundaries.
- Turnstile support exists server-side, but the current frontend does not send `turnstile_token`. Enabling it without frontend work blocks submissions.
- Invalid or missing production configuration should fail closed; do not add permissive fallbacks.
- GPU backend is compile-time: use exactly one of `cuda`, `vulkan`, or `hipblas`.
- Model files and temp data are runtime artifacts. Do not commit them.

## Commands

Run from repository root unless noted.

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm --filter whisdom-worker typecheck
pnpm build:wasm
pnpm release:check-rollback-floor -- <candidate-full-sha>
```

Environment preference: `rtk lint` may be used locally for concise output; CI runs `pnpm lint`.

Rust server:

```bash
cd server
cargo test
cargo build --release
```

Real browser ASR:

```bash
WHISDOM_REAL_ASR=1 pnpm exec playwright test tests/e2e/real-transcription.spec.ts --reporter=list
WHISDOM_REAL_ASR=1 WHISDOM_REAL_WEBGPU=1 pnpm exec playwright test tests/e2e/real-transcription.spec.ts --grep WebGPU --reporter=list
```

Optional fixture variables: `WHISDOM_EN_AUDIO`, `WHISDOM_VI_AUDIO`, `WHISDOM_VI_EXPECTED`.

## Required Validation

Before claiming code changes complete, run at least:

1. `pnpm typecheck`
2. `pnpm lint` or `rtk lint`
3. `pnpm test`
4. `pnpm build`

Also run:

- `pnpm test:e2e` for UI, storage, workers, routing, or browser behavior.
- `pnpm --filter whisdom-worker typecheck` for `worker/` changes.
- `cargo test` and `cargo build --release` in `server/` for Rust server changes.
- `pnpm build:wasm` after changing the audio-processor source; commit regenerated `src/wasm/audio-processor/` outputs.
- The deployed `MIG-01` flow with `WHISDOM_E2E_BASE_URL` for storage/release compatibility work.

`pnpm typecheck` and `pnpm build` are not redundant: the build uses project references and can catch errors the root no-emit check misses.

## Tests

- Vitest discovers `tests/unit/**/*.test.ts` and `tests/components/**/*.test.tsx`.
- Component tests use jsdom, Testing Library, jest-dom, and fake IndexedDB.
- Playwright runs Chromium against a freshly built preview by default.
- `WHISDOM_E2E_BASE_URL` targets an existing deployment and disables the local preview server.
- Real ASR/WebGPU tests are skipped unless their environment gates are set.
- Default E2E does not prove real model download, hardware WebGPU, deployed server, or Workers AI behavior.
- Remove generated `test-results/.last-run.json` if it appears.

## CI And Deployment

- Main branch: `master`.
- `.github/workflows/ci.yml` runs on pushes/PRs to `master` and manual dispatch.
- Frontend job installs Chromium, then runs app typecheck, Worker typecheck, lint, tests, build, and E2E.
- A separate job builds the Rust server in release mode with CMake and ffmpeg installed.
- Pages deployment occurs only on a push to `master` and depends on the frontend test job.
- Vite `base` is `/`; `public/CNAME` supplies the custom domain.
- Cloudflare Worker deployment is manual through `pnpm --filter whisdom-worker deploy`.
- Manual workflow dispatch validates/builds but does not deploy Pages.
- Never add a competing Pages deployment path without explicit approval.
- Make commits, push, deploy, or modify release evidence only when explicitly asked.

## Environment

Frontend build variables in `.env.example`:

- `VITE_GOOGLE_CLIENT_ID`: Google Identity Services and Drive behavior.
- `VITE_CF_WORKER_URL`: optional Cloudflare Workers AI base URL.
- `VITE_SERVER_URL`: optional Rust server base URL; also controls server-mode visibility.

Cloudflare config: `worker/wrangler.jsonc`.

Rust config: `server/config.toml`, optional `server/.env`, or `$WHISDOM_CONFIG`; environment overrides win. See `server/README.md` and `server/src/config.rs` for the authoritative set.

## Generated And Local Files

Do not commit:

- `dist/`, coverage, Playwright output, `test-results/`.
- `node_modules/`, tool caches, `.wrangler/`.
- `.env` files or secrets.
- Rust `target/`, downloaded models, server temp jobs.
- Local agent/tool directories.

`src/wasm/audio-processor/` is generated browser output and is intentionally committed. Rebuild it with `pnpm build:wasm`; do not hand-edit generated JS/declaration/WASM files.

## Common Pitfalls

- `README.md` is still generic template text; inspect code and this file instead of treating it as architecture documentation.
- Do not conflate Cloudflare `client.ts` with Rust `api.ts`.
- Do not assume cached model callbacks mean network downloads; cached assets still emit progress-like events.
- Keep `readMediaDuration()` timeout and object-URL cleanup.
- Chromium Windows `powerPreference` warnings are vendor noise; do not suppress unrelated warnings.
- Server SSE failures are currently quiet, and returned unsubscribe handles are not retained. Handle terminal/error paths explicitly when modifying server flow.
- Saving server results occurs after terminal SSE events; ensure storage failures reject/resolve the owning operation rather than leaving it pending.
- Cloudflare results currently have no timestamp segments.
- Storage compatibility failures must never be converted into best-effort mutation.
- No rollback floor is established until the required deployed evidence file exists. Once established, roll forward; never reset or force-move `master` below it.
