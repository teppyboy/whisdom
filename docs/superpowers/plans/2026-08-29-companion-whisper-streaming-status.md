# Desktop Companion Whisper Streaming Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Whisper.cpp on the complete converted WAV while streaming truthful, professional progress updates to the web frontend.

**Architecture:** Whisper jobs bypass the application’s FFmpeg chunk queue and invoke one native Whisper inference over the complete 16 kHz mono WAV. The blocking native call remains inside `spawn_blocking`; a lightweight async heartbeat publishes status while inference runs, with no fabricated percentage. Existing chunked retry remains available only when full-file inference fails with a retryable Whisper error. Frontend maps backend messages directly, while replacing technical fallback text with localized product copy.

**Tech Stack:** Rust, Tokio watch/broadcast, whisper-rs, Axum SSE, React, TypeScript, Vitest.

---

### Task 1: Add truthful status messages and full-file Whisper execution

**Files:**

- Modify: `server/src/helper/runtime.rs`
- Modify: `server/src/helper/transcribe.rs`
- Test: `server/src/helper/runtime.rs` unit tests where status behavior is pure

- [ ] **Step 1: Inspect the installed `whisper-rs` progress API**

Run:

```powershell
Get-ChildItem "$env:USERPROFILE\.cargo\registry\src" -Directory |
  ForEach-Object { Get-ChildItem $_.FullName -Directory -Filter 'whisper-rs-*' } |
  Select-Object -ExpandProperty FullName
rg -n "progress|set_.*progress|callback|FullParams" "$env:USERPROFILE\.cargo\registry\src" -g 'params.rs' -g '*.rs'
```

Expected: identify whether `whisper-rs 0.16` exposes a safe progress callback. If unavailable, use heartbeat-only status.

- [ ] **Step 2: Write a failing status-message test**

Add a pure helper test asserting the user-facing status vocabulary contains no chunk/debug wording and includes professional messages for loading, preparing, transcribing, and finalizing phases.

Run:

```powershell
cargo test --manifest-path server/Cargo.toml helper::runtime::tests --lib
```

Expected: FAIL until the helper exists.

- [ ] **Step 3: Implement the minimum runtime flow**

In `run_transcription()`:

1. Keep FFmpeg conversion into one 16 kHz mono WAV when needed.
2. For `AsrEngine::WhisperCpp`, call `engine::transcribe_wav()` once on that WAV with offset `0.0`.
3. Publish professional status messages such as `Preparing audio`, `Loading transcription model`, `Transcribing audio`, and `Finishing transcript`.
4. Run the blocking inference in the existing `spawn_blocking` path.
5. Keep a Tokio heartbeat task that republishes the current `transcribing` status at a bounded interval while the native call runs. Do not claim percentage completion unless a real native callback exists.
6. Retain the existing 30-second retry queue only for a retryable full-file Whisper failure.
7. Keep Parakeet’s path separate and unchanged.
8. Preserve cancellation and absolute timestamp behavior.

- [ ] **Step 4: Run backend tests**

```powershell
cargo test --manifest-path server/Cargo.toml --lib
```

Expected: PASS.

### Task 2: Stream and present localized Companion status

**Files:**

- Modify: `src/features/local-helper/progress.ts`
- Modify: `src/App.tsx`
- Modify: `src/features/server-transcription/types.ts` only if status typing requires it
- Test: `tests/unit/local-helper.test.ts`

- [ ] **Step 1: Add failing frontend status mapping tests**

Test that backend messages map to polished English and Vietnamese copy, and that raw strings such as `transcribed chunk 1 of 4` are never shown to users.

Run:

```powershell
pnpm exec vitest run tests/unit/local-helper.test.ts
```

Expected: FAIL until mapping is implemented.

- [ ] **Step 2: Implement localized status mapping**

Add a small mapping helper in the existing local-helper progress module or `App.tsx`. Map stable backend status keys/messages to product copy. Unknown messages fall back to the phase label and never expose internal identifiers, job IDs, retry details, or chunk counters.

Use professional copy:

- English: `Preparing audio`, `Loading transcription model`, `Transcribing audio`, `Finalizing transcript`, `Transcript ready`.
- Vietnamese: `Đang chuẩn bị âm thanh`, `Đang tải mô hình chuyển giọng nói thành văn bản`, `Đang chuyển giọng nói thành văn bản`, `Đang hoàn thiện bản chép lời`, `Đã sẵn sàng`.

- [ ] **Step 3: Ensure every SSE event reaches the existing progress log**

Keep `subscribeProgress()` unchanged unless parsing rejects the new optional status shape. Each valid non-terminal event must call `recordProgress()` and update `setJobState()`.

- [ ] **Step 4: Run frontend tests and checks**

```powershell
pnpm exec vitest run tests/unit/local-helper.test.ts
pnpm typecheck
pnpm lint
```

Expected: PASS.

### Task 3: Full validation

**Files:**

- No additional files.

- [ ] **Step 1: Run complete required validation**

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
cargo test --manifest-path server/Cargo.toml --lib
cargo build --manifest-path server/Cargo.toml --release --bin whisdom-helper --features vulkan
```

Expected: all commands exit 0.

- [ ] **Step 2: Inspect diff and diagnostics**

```powershell
git diff --check
git status --short
```

Expected: only intended source/plan files changed; no generated artifacts or unrelated user changes modified.
