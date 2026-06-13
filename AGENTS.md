# AGENTS.md

Guidance for AI agents working in this repository.

## Project

Whisdom is a local-first speech-to-text web app. It runs Whisper models in the browser with Transformers.js and ONNX Runtime Web, uses WebGPU when available, falls back to WASM when needed, and can convert video/audio with ffmpeg.wasm. It is built for static hosting on GitHub Pages with optional Google Drive sync and an optional Cloudflare Worker transcription path.

Primary goals:

- Keep core transcription client-side and serverless by default.
- Preserve privacy-first behavior: do not upload user media unless an explicit optional integration requires it.
- Keep the UI in a shadcn/Vercel-style visual language: neutral, flat, precise, restrained.
- Support English and Vietnamese UI copy, and broad searchable transcription-language selection.

## Stack

- Package manager: `pnpm@11.5.2`.
- App: Vite, React 19, TypeScript 6, Tailwind CSS 4, shadcn/ui, Radix primitives.
- Local ASR: `@huggingface/transformers` with browser Cache Storage persistence.
- Media conversion: `@ffmpeg/ffmpeg` and `@ffmpeg/util` in a dedicated worker.
- Local storage: IndexedDB via `idb`.
- Tests: Vitest unit tests and Playwright e2e tests.
- Optional server: Cloudflare Worker in `worker/` with Workers AI binding.

## Important Paths

- `src/App.tsx`: main app shell, UI copy, queue flow, settings, dialog, toast, progress log.
- `src/features/transcription/types.ts`: shared app/domain types.
- `src/features/transcription/models.ts`: Whisper model catalog, local dtype rules, WebGPU constraints.
- `src/features/transcription/language.ts`: searchable Whisper language catalog and mapping.
- `src/features/transcription/exports.ts`: `.txt`, `.json`, `.srt`, `.vtt` export serialization.
- `src/features/media/preflight.ts`: file analysis, duration reads, WebGPU detection, warnings.
- `src/features/storage/indexed-db.ts`: settings, transcript history, rename/delete/clear APIs.
- `src/features/storage/cleanup.ts`: model cache cleanup constants and helpers.
- `src/lib/transcription-worker-client.ts`: singleton browser worker clients for ASR and ffmpeg.
- `src/workers/transcription.worker.ts`: Transformers.js pipeline setup, model caching, ASR execution.
- `src/workers/ffmpeg.worker.ts`: ffmpeg.wasm setup and media conversion.
- `src/components/ui/`: shadcn-style components.
- `tests/unit/`: Vitest coverage for pure logic.
- `tests/e2e/`: Playwright browser tests.
- `worker/`: optional Cloudflare Worker API surface.

## Commands

Run from repo root unless noted.

- Install: `pnpm install --frozen-lockfile`.
- Dev server: `pnpm dev`.
- Typecheck app: `pnpm typecheck`.
- Lint: `rtk lint` preferred in this environment, otherwise `pnpm lint`.
- Unit tests: `pnpm test`.
- Build: `pnpm build`.
- E2E tests: `pnpm test:e2e`.
- Worker typecheck: `pnpm --filter whisdom-worker typecheck`.
- Real ASR smoke: `WHISDOM_REAL_ASR=1 rtk playwright test tests/e2e/real-transcription.spec.ts --reporter=list`.
- Real WebGPU smoke: `WHISDOM_REAL_ASR=1; WHISDOM_REAL_WEBGPU=1; rtk playwright test tests/e2e/real-transcription.spec.ts --grep "WebGPU" --reporter=list`.

Before claiming completion for code changes, run at least:

- `pnpm typecheck`
- `rtk lint`
- `pnpm test`
- `pnpm build`

Run `pnpm test:e2e` when UI flows, storage, workers, routing, or browser behavior changed. Run worker typecheck when `worker/` or shared worker-facing types changed.

## Architecture Rules

- Keep browser work local-first. Do not introduce backend dependencies for core transcription.
- Keep long-running CPU/GPU work out of React render code. Use `src/workers/` and `src/lib/transcription-worker-client.ts`.
- Preserve singleton ASR and ffmpeg workers unless there is a concrete reason to reset them. Terminating workers loses in-memory model/ffmpeg state.
- Cache downloaded model assets in Cache Storage using `MODEL_CACHE_KEY` from `src/features/storage/cleanup.ts`.
- If changing model-cache behavior, update both worker cache setup and cleanup settings/tests.
- Large Whisper models use q4 browser weights and require WebGPU. Do not allow large local models to fall through to WASM and crash on huge buffer allocation.
- WebGPU requires HTTPS or localhost. Non-secure LAN IPs should fall back gracefully.
- Treat Chromium Windows `powerPreference` warnings from ONNX Runtime as vendor noise unless behavior is broken.
- ffmpeg.wasm should stay single-threaded for GitHub Pages compatibility. Multi-threaded ffmpeg requires COOP/COEP and SharedArrayBuffer.
- Batch transcription should remain sequential to avoid worker/model concurrency issues.

## UI Rules

- Keep visual style aligned with shadcn/Vercel: neutral palette, clean cards, small radii, precise spacing, no decorative gradients.
- Use existing shadcn components from `src/components/ui/` before creating custom controls.
- If adding shadcn components via CLI, avoid overwriting local component customizations.
- Preserve mobile behavior. Settings rows should stack on small screens, controls should be full width on mobile and fixed width only on larger screens.
- Keep dropdown/popover containers `overflow-visible` where custom absolute panels need to escape cards.
- Keep UI copy concise and professional in both English and Vietnamese.
- If adding copy, update both `COPY.en` and `COPY.vi` in `src/App.tsx`.
- For app language, use the account-menu EN/VI toggle. Transcription language is a separate searchable picker on the main page.
- Result display should stay in the centered dialog with raw text on the left, timestamped text on the right, and export buttons.
- Batch completion should show a toast, not automatically open the result dialog.

## Storage Rules

- Settings and transcripts live in IndexedDB through `src/features/storage/indexed-db.ts`.
- Downloaded model assets live in Cache Storage through Transformers.js custom cache.
- Settings cleanup can clear saved transcripts and downloaded model caches. It must disable actions while transcription/conversion is active.
- If clearing model caches, call `clearLocalWorkerState()` first so in-memory workers do not keep stale loaded model state.
- Do not persist media blobs by default unless the user enabled that setting.

## Testing Notes

- `pnpm typecheck` runs `tsc --noEmit`; `pnpm build` runs `tsc -b && vite build`. Build can catch project-reference errors typecheck misses.
- Playwright starts a built preview server through `playwright.config.ts`.
- Real ASR tests are gated and skipped unless env vars are set.
- `tests/e2e/real-transcription.spec.ts` uses yaph TTS sample fixtures by default for real ASR.
- Remove generated `test-results/.last-run.json` if it appears after local Playwright runs.
- Some `rtk lint` failures involving missing `test-results` after Playwright cleanup have been transient; rerun once before editing unrelated code.

## Git And Deployment

- Main branch is `master`.
- GitHub Actions workflow is `.github/workflows/ci.yml`.
- Vite `base` is `/` because the app deploys to custom domain root.
- `public/CNAME` contains the custom Pages domain.
- Do not commit generated build output, test output, caches, or local env files.
- Make commits only when explicitly asked.

## Environment

- `.env.example` documents optional client env vars.
- `VITE_GOOGLE_CLIENT_ID` enables Google Identity Services / Drive behavior.
- `VITE_CF_WORKER_URL` points to the optional Cloudflare Worker.
- Worker config lives in `worker/wrangler.jsonc`; set allowed origin and identity allowlists there for deployment.

## Common Pitfalls

- Do not replace the file queue when adding more files; append new selections unless explicitly clearing queue.
- Do not open the result dialog automatically after batch completion.
- Do not use raw `crypto.randomUUID()` without fallback; use `createId()` from `src/lib/id.ts`.
- Do not rely on media metadata events without timeout; `readMediaDuration()` must keep timeout/cleanup behavior.
- Do not assume cached model files mean no progress events; cached files can still emit progress-like callbacks.
- Do not broaden Drive scopes beyond `drive.file` and `drive.appdata` without explicit user approval.
