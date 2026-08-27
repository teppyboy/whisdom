# Companion health and model catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh Desktop Companion status every second, clarify native model choices, add full Whisper Large v3, and provide an operator-run pin update script.

**Architecture:** `App` owns a Companion-only polling effect using the existing discovery endpoint. The native catalog remains the single source of model metadata; a small UI helper converts its capability entries into localized descriptions. A Bash wrapper uses Node's built-in `fetch` and filesystem APIs to query Hugging Face, preview new immutable model pins, and change the Rust catalog only with `--apply`.

**Tech Stack:** React 19, TypeScript 6, Rust, Bash, Node 24, Vitest, Cargo.

---

## File structure

- Modify: `src/App.tsx` — one-second Companion health polling and localized model-detail rendering.
- Modify: `tests/components/harness.test.tsx` — fake-timer coverage for status refresh and clear model detail.
- Modify: `server/src/helper/models.rs` — add full Large v3 fixed metadata and keep catalog pin checks.
- Create: `scripts/update-helper-model-pins.sh` — explicit dry-run/apply metadata refresher.

### Task 1: Refresh health while Companion mode is active

**Files:**

- Modify: `src/App.tsx:957-977`
- Test: `tests/components/harness.test.tsx`

- [ ] Write a fake-timer test that selects `local-helper`, mocks `discover`, advances 1,000 ms, and asserts a second discovery call. Unmount and advance again; assert no extra call.
- [ ] Change `window.setInterval(refresh, 5000)` to `window.setInterval(refresh, 1000)`.
- [ ] Keep initial refresh, window-focus refresh, cancellation guard, timer cleanup, and listener cleanup unchanged.
- [ ] Run `pnpm test -- tests/components/harness.test.tsx`.

### Task 2: Make native model choices understandable

**Files:**

- Modify: `src/App.tsx:2557-2587`
- Test: `tests/components/harness.test.tsx`

- [ ] Add a local function mapping known native IDs to EN/VI descriptions: Tiny “Fastest; best for quick drafts”, Base “Good balance of speed and accuracy”, Small “More accurate; slower download”, Large Turbo “High accuracy with faster processing”, Large v3 “Best accuracy; largest download and slowest processing”.
- [ ] Render the chosen model description plus formatted download size; do not render raw quality tokens such as `high` or hyphen-separated metadata.
- [ ] Fall back to `item.label` and formatted size for future unknown capability entries.
- [ ] Add a test asserting the Turbo description and size are visible without `high -`.
- [ ] Run focused component tests and `pnpm typecheck`.

### Task 3: Add full Whisper Large v3

**Files:**

- Modify: `server/src/helper/models.rs`

- [ ] Obtain the resolved Git revision plus LFS size and SHA-256 for `ggml-large-v3-q5_0.bin` from Hugging Face.
- [ ] Add one `NativeModel` entry with ID `ggml-large-v3-q5_0`, label `Whisper Large v3`, quality `best`, the immutable resolved URL, reported byte size, and SHA-256.
- [ ] Extend the catalog expectation test with the same exact values and update catalog length.
- [ ] Preserve `ggml-large-v3-turbo-q5_0` as default.
- [ ] Run `cargo test` in `server`.

### Task 4: Provide deliberate pin maintenance

**Files:**

- Create: `scripts/update-helper-model-pins.sh`

- [ ] Implement an executable Bash script accepting `--apply` only; any other argument exits with usage.
- [ ] Use `node` to fetch Hugging Face model metadata and immutable tree entries for every catalog filename. Require a 40-hex revision, LFS size, and SHA-256; reject missing or malformed metadata.
- [ ] Default behavior prints proposed Rust catalog changes. `--apply` makes exact replacements for each catalog entry; fail if an expected source fragment is not found exactly once.
- [ ] Run `bash -n scripts/update-helper-model-pins.sh` and dry-run it. Do not run `--apply` during normal validation.

### Task 5: Validate

**Files:**

- Modify only Task 1–4 files.

- [ ] Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
- [ ] Run `cargo test` and `cargo build --release` in `server`.
- [ ] Run `cargo fmt --manifest-path companion/src-tauri/Cargo.toml --check` and a Vulkan Companion release build.
- [ ] Run `git diff --check`.
