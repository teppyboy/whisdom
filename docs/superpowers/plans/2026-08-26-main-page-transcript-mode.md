# Main-page transcript mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make processing mode selectable in the home-page transcription setup and show an accurate Desktop Companion availability/download state.

**Architecture:** `App` will perform a non-pairing local-helper health probe on initial load and when Desktop Companion mode is selected. `MainControls` will own the relocated mode select and render a Companion-only status row; Settings retains only advanced local chunk controls. The status row uses the existing helper client and a stable GitHub Releases listing URL because the repository currently has no published release or release asset.

**Tech Stack:** React 19, TypeScript 6, shadcn-style controls, Vitest + Testing Library, existing local-helper HTTP client.

---

## File structure

- Modify: `src/App.tsx` — state/effects for helper discovery; main-page mode selector and Companion availability row; remove duplicated settings mode selector; EN/VI copy.
- Modify: `tests/components/harness.test.tsx` — assert main-page mode selection and unavailable Companion status/download behavior.
- No new dependencies, backend endpoints, or release assets.

### Task 1: Expose helper health as UI state

**Files:**

- Modify: `src/App.tsx:120-180,760-1020`
- Test: `tests/components/harness.test.tsx`

- [ ] **Step 1: Write failing tests for available and unavailable Companion status**

Add a shared health fixture beside the current `capabilities` fixture and add these tests:

```tsx
const health = { available: true, protocol_version: 1, busy: false }

it("shows that Desktop Companion is available on the main page", async () => {
  vi.spyOn(localHelperClient, "discover").mockResolvedValue(health)
  renderCompanion()
  await userEvent.selectOptions(
    await screen.findByLabelText("Mode"),
    "local-helper"
  )
  expect(await screen.findByText("Desktop Companion available")).toBeVisible()
})

it("links to Releases when Desktop Companion is unavailable", async () => {
  vi.spyOn(localHelperClient, "discover").mockResolvedValue(null)
  renderCompanion()
  await userEvent.selectOptions(
    await screen.findByLabelText("Mode"),
    "local-helper"
  )
  expect(await screen.findByText("Desktop Companion not found")).toBeVisible()
  expect(
    screen.getByRole("link", { name: "Download Desktop Companion" })
  ).toHaveAttribute("href", "https://github.com/teppyboy/whisdom/releases")
})
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
pnpm test -- tests/components/harness.test.tsx
```

Expected: FAIL because the main page has neither a mode control nor Companion availability text.

- [ ] **Step 3: Add explicit health state and discovery effect**

Import `HelperHealth` with `HelperCapabilities`, add a state type:

```tsx
type CompanionHealthState = HelperHealth | "checking" | null

const [companionHealth, setCompanionHealth] =
  React.useState<CompanionHealthState>("checking")
```

Use one effect that starts on mount and reruns when `settings.mode` becomes `"local-helper"`:

```tsx
React.useEffect(() => {
  let cancelled = false
  setCompanionHealth("checking")
  void localHelperClient.discover().then((health) => {
    if (!cancelled) setCompanionHealth(health)
  })
  return () => {
    cancelled = true
  }
}, [settings.mode])
```

Keep the existing `connect()` effect only for `local-helper`; on success retain capabilities/model selection behavior and set `companionHealth` to a non-busy available health value only when discovery had not already resolved. Do not show a toast for probe failures.

- [ ] **Step 4: Run focused tests and verify they pass**

Run:

```bash
pnpm test -- tests/components/harness.test.tsx
```

Expected: PASS, including existing native-picker tests.

### Task 2: Move transcript mode to Quick setup

**Files:**

- Modify: `src/App.tsx:2389-2562,2701-2872`
- Test: `tests/components/harness.test.tsx`

- [ ] **Step 1: Write a failing test for main-page mode selection**

Add this test:

```tsx
it("selects Desktop Companion from the main transcription setup", async () => {
  vi.spyOn(localHelperClient, "discover").mockResolvedValue(null)
  const user = userEvent.setup()
  renderCompanion()

  await user.selectOptions(await screen.findByLabelText("Mode"), "local-helper")

  expect(
    await screen.findByRole("heading", { name: "Desktop Companion" })
  ).toBeVisible()
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm test -- tests/components/harness.test.tsx
```

Expected: FAIL because `Mode` is currently only rendered in `SettingsPage`.

- [ ] **Step 3: Add the select to `MainControls`**

Extend `MainControls` props with `storageActionsDisabled` and pass it from `App`. Insert a full-width mode field before Model and Language:

```tsx
<div className="grid gap-2 md:col-span-2">
  <Label>{copy.mode}</Label>
  <Select
    value={settings.mode}
    disabled={storageActionsDisabled}
    onValueChange={(value) => updateSetting("mode", value as ProcessingMode)}
  >
    <SelectTrigger aria-label={copy.mode} className="w-full">
      <SelectValue />
    </SelectTrigger>
    <SelectContent align="start">
      {MODES.filter(
        (item) =>
          item.value !== "server" || Boolean(import.meta.env.VITE_SERVER_URL)
      ).map((item) => (
        <SelectItem key={item.value} value={item.value}>
          {copy.modeLabels[item.value]}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
  <p className="text-xs leading-5 text-muted-foreground">
    {copy.modeDetails[settings.mode]}
  </p>
</div>
```

Remove the `SettingRow` containing the duplicate mode select from `SettingsPage`. Keep the Processing card for chunk and overlap controls, and revise its description to describe advanced local controls.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm test -- tests/components/harness.test.tsx
```

Expected: PASS; mode selection changes the main-page file-input flow without opening Settings.

### Task 3: Render the Companion status and Releases link

**Files:**

- Modify: `src/App.tsx:160-600,2389-2562`
- Test: `tests/components/harness.test.tsx`

- [ ] **Step 1: Add localized Companion status copy**

Add exact EN strings:

```tsx
companionChecking: "Checking Desktop Companion…",
companionAvailable: "Desktop Companion available",
companionBusy: "Desktop Companion is busy",
companionUnavailable: "Desktop Companion not found",
companionUnavailableDescription:
  "Start the Windows app, or download it from the latest release.",
downloadCompanion: "Download Desktop Companion",
advancedProcessingDescription: "Advanced local chunk settings.",
```

Add Vietnamese equivalents:

```tsx
companionChecking: "Đang kiểm tra Desktop Companion…",
companionAvailable: "Desktop Companion đã sẵn sàng",
companionBusy: "Desktop Companion đang bận",
companionUnavailable: "Không tìm thấy Desktop Companion",
companionUnavailableDescription:
  "Hãy mở ứng dụng Windows hoặc tải từ bản phát hành mới nhất.",
downloadCompanion: "Tải Desktop Companion",
advancedProcessingDescription: "Thiết lập nâng cao cho đoạn xử lý cục bộ.",
```

- [ ] **Step 2: Render a Companion-only status row beneath the mode select**

Define:

```tsx
const COMPANION_RELEASES_URL = "https://github.com/teppyboy/whisdom/releases"
```

Pass `companionHealth` to `MainControls`. For `settings.mode === "local-helper"`, render a bordered inline row below mode details. Use `Badge` for checking/available/busy/unavailable. For `null`, include:

```tsx
<a
  href={COMPANION_RELEASES_URL}
  target="_blank"
  rel="noreferrer"
  className="text-xs font-medium underline underline-offset-4"
>
  {copy.downloadCompanion}
</a>
```

Map `health.busy` to busy; map a non-null non-busy response to available. Do not infer availability from capabilities alone.

- [ ] **Step 3: Gate Companion picker/model controls on confirmed connection**

Keep existing `helperCapabilities` checks. On `null` health, retain the explanatory Companion card and disabled model select; do not invoke native file selection. Ensure the download link does not imply that a release asset currently exists.

- [ ] **Step 4: Run component tests**

Run:

```bash
pnpm test -- tests/components/harness.test.tsx
```

Expected: PASS, including the new available/unavailable/main-page mode tests.

### Task 4: Validate all affected delivery paths

**Files:**

- Modify only files from Tasks 1–3.

- [ ] **Step 1: Run static checks and unit tests**

Run:

```bash
pnpm typecheck
pnpm --filter whisdom-worker typecheck
pnpm lint
pnpm test
```

Expected: all commands exit 0.

- [ ] **Step 2: Run browser and production checks**

Run:

```bash
pnpm build:wasm
pnpm build
pnpm test:e2e
```

Expected: build commands exit 0; Playwright completes except intentionally environment-gated real-ASR tests.

- [ ] **Step 3: Run native validation**

Run:

```bash
cd server && cargo test && cargo build --release
cd ../audio-processor && cargo fmt --check && cargo test
cd .. && pnpm build:companion
```

Expected: all commands exit 0.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only planned source, test, and copy changes are present.
