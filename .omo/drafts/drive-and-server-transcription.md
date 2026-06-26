---
slug: drive-and-server-transcription
status: approved
intent: clear
pending-action: write .omo/plans/drive-and-server-transcription.md
approach: >
  Three parallel implementation streams:
  (A) Wire Drive upload after IndexedDB save using existing uploadTranscriptMetadata();
  (B) Activate server transcription path — fix worker auth, remove guardrail, add WAV-chunk pipeline;
  (C) Rust/WASM audio-processor crate that resamples to 16 kHz mono and splits WAV into ≤9 MB chunks;
  streams converge in wave 3 (WASM integrated into both local resample and server chunking paths).
---

# Draft: drive-and-server-transcription

## Components (topology ledger)

| id | outcome | status | evidence path |
|----|---------|--------|--------------|
| A  | Drive upload fires after each successful transcription | active | .omo/evidence/task-2-drive-upload.txt |
| B  | Server transcription mode works end-to-end (auth → chunk → assemble) | active | .omo/evidence/task-5-server-e2e.txt |
| C  | Rust WASM audio-processor crate builds and integrates in browser worker | active | .omo/evidence/task-4-wasm-build.txt |

## Open assumptions (announced defaults)

| assumption | adopted default | rationale | reversible? |
|------------|----------------|-----------|-------------|
| Worker auth token type | Switch worker tokeninfo from id_token to access_token; no second sign-in needed | GIS token client already gives access token for Drive; asking for a separate Google Sign-In token would fragment UX | yes |
| Silent token refresh | Call requestAccessToken({ prompt:'' }) before Drive upload | prevents token expiry failures silently; GIS supports this | yes |
| Server chunking limit | ≤9 MB per chunk (worker limit is 10 MB; headroom for headers) | direct from SERVER_CHUNK_LIMIT_MB=10 in preflight.ts | yes |
| Language passthrough | Worker passes any non-empty language string to Workers AI | existing en/vi filter arbitrarily narrows capabilities | yes |
| Video → WAV | Existing ffmpeg worker converts video before server upload | server needs raw WAV; ffmpeg path already exists in local flow | yes |
| WASM scope | Rust WASM handles resample + WAV chunking only; AudioContext.decodeAudioData() still decodes compressed formats | implementing a full audio decoder in Rust is out-of-scope and redundant | yes |

## Findings (cited - path:lines)

- `uploadTranscriptMetadata()` never called: drive.ts:1-102, App.tsx (no call site exists)
- Guardrail block: App.tsx:719-721
- `transcribeChunkWithServer()` never called: client.ts:1-54
- Worker auth checks id_token: worker/src/index.ts:~45-70
- Worker language filter allows only en/vi: worker/src/index.ts:~90-100
- `transcribeLocally()` resample via AudioContext: transcription-worker-client.ts:48-145
- `analyzeMediaFile()` + `SERVER_CHUNK_LIMIT_MB=10`: preflight.ts
- `driveStatus` + `driveAccessToken` state: App.tsx (~line 300 area)
- COPY keys for drive states: App.tsx:157-166 / 317-326
- TranscriptDocument shape: types.ts:66-77
- createId(): src/lib/id.ts

## Decisions (with rationale)

1. Drive upload appDataFolder only (one-way, no list/restore) — user confirmed
2. Sequential chunk uploads (not parallel) — consistent with architecture rule: batch transcription sequential
3. Rust WASM target `web` — browser workers can use ES module WASM via dynamic import or blob URL
4. rubato crate for resampling (SincFixedIn) — high quality, no_std-compatible, widely used in audio WASM
5. hound crate for WAV parse/write — pure Rust, no native deps
6. vite-plugin-wasm for WASM loading in Vite 8 — handles WASM in workers and main thread cleanly

## Scope IN

- Call uploadTranscriptMetadata() after each transcription if Drive connected; silent refresh first
- Drive status UI: uploading spinner → synced checkmark or error
- Worker: accept access_token (not id_token) in Bearer header; pass all language strings
- Remove App.tsx:719-721 guardrail; implement full cloudflare-ai branch
- WAV conversion via ffmpeg before server upload
- WASM split_wav_chunks() for server path
- WASM resample_to_mono_16k() replaces JS resample in transcription-worker-client.ts
- Unit tests: Drive upload integration, WASM functions
- E2e: remove guardrail test, add server mode test (mocked fetch)

## Scope OUT (Must NOT have)

- No Drive read/list/restore (appDataFolder write-only)
- No parallel chunk uploads
- No Durable Objects, KV, R2, Queues in worker
- No Rust audio format decoder (keep AudioContext for decode)
- No React re-render inside the WASM hot path
- No changes to Drive OAuth scopes (stay drive.file + drive.appdata)
- No multi-threaded ffmpeg (breaks GitHub Pages)
- No change to local-webgpu or local-wasm code paths beyond the resample replacement

## Open questions
(none — all resolved)

## Approval gate
status: approved
approved-by: user ("Yes, stick to your recommended, after that write the full plan.")
