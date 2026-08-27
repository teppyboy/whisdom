# Product copy and Companion picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all visible EN/VI product copy with clear, connected UI language; remove redundant Companion framing; focus the Companion before its native picker opens.

**Architecture:** Keep existing copy dictionaries and all key shapes in `src/App.tsx` and `src/app/copy.ts`; replace values only, preserving all behavior. Remove the Companion explanatory card from the main-page branch. The Tauri `NativeFilePicker` closure will activate the main Companion window before invoking its existing file dialog.

**Tech Stack:** React 19, TypeScript 6, Tauri 2, Rust, Vitest, existing shadcn-style UI.

---

## File structure

- Modify: `src/App.tsx` — rewrite visible EN/VI app copy and remove redundant Desktop Companion card.
- Modify: `src/app/copy.ts` — rewrite typed EN/VI fatal storage error and recovery copy.
- Modify: `companion/src-tauri/src/main.rs` — restore/show/focus Companion before native picker.
- Modify: `tests/components/harness.test.tsx` — replace removed-card expectations with chooser/status expectations.
- Modify: `tests/components/product-errors.test.tsx` — update intentional exact Vietnamese assertion.
- Modify: `tests/e2e/whisdom.spec.ts` — update intentional exact visible text assertions.

### Task 1: Lock the revised user-facing behavior in tests

**Files:**

- Modify: `tests/components/harness.test.tsx`
- Modify: `tests/components/product-errors.test.tsx`
- Modify: `tests/e2e/whisdom.spec.ts`

- [ ] **Step 1: Replace the redundant Companion-card assertion**

In `tests/components/harness.test.tsx`, change the Desktop Companion selection test so it proves the primary chooser remains visible without a duplicate heading card:

```tsx
expect(
  await screen.findByRole("button", { name: "Choose files in Windows" })
).toBeVisible()
expect(screen.queryByRole("heading", { name: "Desktop Companion" })).toBeNull()
```

Keep the existing unavailable link assertion.

- [ ] **Step 2: Update exact copy expectations**

Change only expectations whose copy text is intentionally rewritten. For example, if the Vietnamese fatal title becomes `Phiên bản dữ liệu này không được hỗ trợ`, update:

```tsx
expect(
  screen.getByText("Phiên bản dữ liệu này không được hỗ trợ")
).toBeVisible()
```

Update E2E exact headings/labels to their rewritten forms; do not change selector mechanics or test coverage.

- [ ] **Step 3: Run focused component tests and verify expected failures**

Run:

```bash
pnpm test -- tests/components/harness.test.tsx tests/components/product-errors.test.tsx
```

Expected: FAIL until the card removal and revised copy values are implemented.

### Task 2: Rewrite all visible product copy

**Files:**

- Modify: `src/App.tsx:230-670`
- Modify: `src/app/copy.ts:59-135`

- [ ] **Step 1: Rewrite both `COPY` dictionaries by value only**

Preserve every key, nested `Record`, interpolation function signature, and technical identifier. Replace every visible English and Vietnamese string with concise action-oriented copy.

Apply these representative wording choices consistently:

```tsx
// English
quickSetup: "Set up transcription",
quickSetupDescription: "Choose where transcription runs, then select a model and language.",
settingsDescription: "Manage local storage and advanced processing options.",
dropTitle: "Add audio or video",
dropDescription: "Files are checked before processing starts.",
confirmTranscribe: "Start transcription",
companionPickerTitle: "Choose files in Windows",
companionPickerDescription: "Use the Windows file picker to add one or more files.",

// Vietnamese
quickSetup: "Thiết lập chuyển ngữ",
quickSetupDescription: "Chọn nơi xử lý, sau đó chọn mô hình và ngôn ngữ.",
settingsDescription: "Quản lý dữ liệu cục bộ và tùy chọn xử lý nâng cao.",
dropTitle: "Thêm âm thanh hoặc video",
dropDescription: "Tệp sẽ được kiểm tra trước khi bắt đầu xử lý.",
confirmTranscribe: "Bắt đầu chuyển ngữ",
companionPickerTitle: "Chọn tệp trong Windows",
companionPickerDescription: "Dùng hộp chọn tệp Windows để thêm một hoặc nhiều tệp.",
```

Keep explicit warnings (model language limitations, storage deletion, no network transfer) factually equivalent.

- [ ] **Step 2: Rewrite typed storage error copy**

In `src/app/copy.ts`, retain every `RecoveryActionCode` and error format shape. Make titles, messages, and action labels direct and specific in both languages. Do not alter `unsupportedVersionMessage` interpolation values.

- [ ] **Step 3: Run focused tests and static checks**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test -- tests/components/harness.test.tsx tests/components/product-errors.test.tsx
```

Expected: all exit 0.

### Task 3: Remove redundant Companion framing

**Files:**

- Modify: `src/App.tsx:2300-2340`
- Test: `tests/components/harness.test.tsx`

- [ ] **Step 1: Delete the Companion information card**

Delete this entire conditional card from the `settings.mode === "local-helper"` branch:

```tsx
<Card className="animate-in duration-300 ease-out fade-in slide-in-from-bottom-1">
  <CardContent className="py-8 text-center">
    <CardTitle className="text-base">{t.companionTitle}</CardTitle>
    <CardDescription className="mx-auto mt-2 max-w-md">
      {t.companionDescription}
    </CardDescription>
  </CardContent>
</Card>
```

Leave `DropZone` and its Windows-picker title/description intact. Do not remove status availability or the Releases link.

- [ ] **Step 2: Run the Companion harness test**

Run:

```bash
pnpm test -- tests/components/harness.test.tsx
```

Expected: PASS; no Desktop Companion heading appears while the chooser is available.

### Task 4: Activate Companion before opening native picker

**Files:**

- Modify: `companion/src-tauri/src/main.rs:88-118`

- [ ] **Step 1: Activate the Tauri window in the picker closure**

Before `app_handle.dialog().file()`, obtain the main window and run:

```rust
if let Some(window) = app_handle.get_webview_window("main") {
    if let Err(error) = window.show().and_then(|_| window.unminimize()).and_then(|_| window.set_focus()) {
        tracing::warn!(error = %error, "failed to activate Companion before opening native picker");
    }
}
```

Use Tauri’s existing `Manager` trait import. Treat activation failure as non-fatal so the picker still opens.

- [ ] **Step 2: Format and compile Companion**

Run:

```bash
cargo fmt --manifest-path companion/src-tauri/Cargo.toml --check
CARGO_TARGET_DIR=/f/w-copy-companion cargo build --release --features vulkan --manifest-path companion/src-tauri/Cargo.toml
```

Expected: both exit 0.

### Task 5: Run required non-browser validation

**Files:**

- Modify only files from Tasks 1–4.

- [ ] **Step 1: Run frontend, Worker, and WASM checks**

Run:

```bash
pnpm typecheck
pnpm --filter whisdom-worker typecheck
pnpm lint
pnpm test
pnpm build:wasm
pnpm build
```

Expected: all exit 0.

- [ ] **Step 2: Run Rust checks**

Run:

```bash
cd server && CARGO_TARGET_DIR=/f/w-copy-server cargo test && CARGO_TARGET_DIR=/f/w-copy-server cargo build --release
cd ../audio-processor && cargo fmt --check && cargo test
cd .. && CARGO_TARGET_DIR=/f/w-copy-companion cargo build --release --features vulkan --manifest-path companion/src-tauri/Cargo.toml
```

Expected: all exit 0.

- [ ] **Step 3: Do not run Playwright**

The user explicitly excluded Playwright because it does not complete locally. CI remains responsible for browser E2E verification.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only intended source/copy/test changes.
