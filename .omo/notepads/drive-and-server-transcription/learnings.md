# Learnings — drive-and-server-transcription

## Stack conventions
- Package manager: pnpm 11.5.2
- IDs: always use createId(prefix) from src/lib/id.ts, never crypto.randomUUID()
- COPY: both COPY.en and COPY.vi in src/App.tsx (en: ~157-166, vi: ~317-326)
- shadcn components in src/components/ui/; use existing before creating custom
- Batch completion: toast only, never auto-open result dialog

## Architecture
- Long-running work stays in src/workers/ + src/lib/transcription-worker-client.ts
- ASR and ffmpeg workers are singletons — never terminate them
- TranscriptDocument type at src/features/transcription/types.ts:66-77
- ProcessingMode = 'local-webgpu' | 'cloudflare-ai' | 'local-wasm'

## Drive integration
- requestDriveAccess() uses GIS token client; silent refresh via prompt: ''
- Upload target: appDataFolder (write-only, no read/list)
- Scopes: drive.file drive.appdata — do NOT widen
- uploadTranscriptMetadata() in drive.ts was never called before this plan

## Server transcription
- Worker auth: switching from id_token to access_token in tokeninfo URL
- Language: remove en/vi filter, pass all non-empty strings through
- Chunks: <=9 MB, sequential (never parallel)
- WASM import path after build: src/wasm/audio-processor/audio_processor.js

## WASM
- Rust crate: audio-processor/ at repo root
- Output: src/wasm/audio-processor/ (gitignored)
- Target: web (loaded in transcription-worker-client.ts, not inside ASR worker)
- AudioContext.decodeAudioData() stays for compressed format decode
- Vite: vite-plugin-wasm + vite-plugin-top-level-await
