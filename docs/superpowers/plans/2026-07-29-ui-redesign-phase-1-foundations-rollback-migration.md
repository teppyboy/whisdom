# Precision Studio Phase 1 Foundations, Rollback, and Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish tested Precision Studio foundations, deploy a permanent versionless IndexedDB rollback floor, then—only after recorded approval—migrate data transactionally to schema 2 and ship the addressable lazy application shell.

**Architecture:** Work proceeds in hard order: Foundation, independently deployable Slice 1A, production evidence and approval, then gated Slice 1B. Slice 1B moves the complete legacy product implementation into exact owner `src/app/LegacyProduct.tsx`; `src/App.tsx` becomes a thin adapter that renders `AppShell`, and `AppShell` renders `LegacyProduct` only for the interim Workbench route. `AppShell` never imports `App`, preventing recursion. `AppShell` is the application-lifetime service boundary: later Phase 3 runtime provider state lives above every query-route outlet, not inside Workbench. Focused canonical, storage, repository, navigation, copy, Settings, and shell modules surround the extracted implementation without moving worker orchestration or implementing Drive protocol behavior. Phase 7 removes `LegacyProduct` after final Workbench replacement and updates only shell route composition; `App` remains thin.

**Tech Stack:** Node 24, pnpm 11.5.2, Vite 8, React 19, TypeScript 6, Tailwind CSS 4, idb 8, RFC 8785 `canonicalize`, Vitest 4, Testing Library, jsdom 30, fake-indexeddb 6, Playwright 1.60, axe-core 4.12.

---

## Authority, hard order, and stop conditions

Read before changing code:

- Approved corrected specification: `docs/superpowers/specs/2026-07-29-ui-redesign-design.md`, all lines, commit `4098fe355588ae1331a1f574a72a42e022bcfaae`.
- Master rollout: `docs/superpowers/plans/2026-07-29-ui-redesign-master-rollout.md`, all lines.
- Repository rules: `AGENTS.md`, all lines.
- Current bridge: `src/App.tsx:1-2563`.
- Current storage/types/entry/styles: `src/features/storage/indexed-db.ts:1-75`, `src/features/transcription/types.ts:1-100`, `src/lib/id.ts:1-15`, `src/main.tsx:1-14`, `src/index.css:1-160`.
- Current tests/config: `tests/e2e/whisdom.spec.ts:1-306`, `tests/unit/*.test.ts`, `vitest.config.ts:1-15`, `playwright.config.ts:1-25`, `vite.config.ts:1-15`, `tsconfig.app.json:1-29`, `package.json:1-57`.

Hard release order:

1. Foundation fixes both baseline duplicate-error defects before any new flow.
2. Slice 1A opens `whisdom` without an explicit version, supports fresh/v1/v2, rejects `>2`, and does not request, create, migrate, or expose v2.
3. Slice 1A deploys independently. Production evidence records commit, URL, UTC time, fresh/v1/v2 smoke results, and rollback-floor guard result.
4. **STOP. Do not begin Slice 1B until a release approver records approval beside complete Slice 1A evidence.**
5. Slice 1B requests v2, performs one transactional migration, and adds the shell/contracts.
6. After any production v2 exposure, rollback targets must equal or descend from the recorded Slice 1A floor. Pre-1A deployment is prohibited.

Each implementation checkbox is one 2–5 minute action. When a contract needs more code than fits one action, stop at the named exported function or fixture row, run its focused test, then continue; never batch multiple red/green cycles into one unverified edit.

Out of scope: runtime adapters, cancellation rewrite, guided recommendation, editor implementation, Library implementation, Drive authentication/transport/reconciliation, media/settings upload, server changes, worker changes, old `App` removal, and v2-triggered pending Drive operations. V2 stores and durable Drive-facing record types exist now only because schema 2 requires them.

## File ownership map

**Foundation modifies/creates**

- `.node-version` — Node major contract.
- `package.json`, `pnpm-lock.yaml` — exact runtime/test dependencies.
- `vitest.config.ts`, `tests/setup.ts` — Node-by-default tests and opt-in jsdom support.
- `src/App.tsx`, `tests/e2e/whisdom.spec.ts` — singular baseline contextual errors; no `.first()` workarounds.
- `src/app/copy-types.ts`, `src/app/copy.ts`, `src/components/product/ProductErrorPanel.tsx`, `tests/components/product-errors.test.tsx` — acyclic typed EN/VI error/copy primitive required before storage-version UI.

**Slice 1A modifies/creates**

- `src/features/storage/database.ts` — versionless compatibility opener and unsupported-version error.
- `src/features/storage/compatibility.ts` — permanent minimal schema-2 inspection, parsing, checked conversion, settings, and legacy projection contract. Slice 1A owns every export from master Section 5.3A; Slice 1B may consume this file but must not move, rename, delete, or redefine it.
- `src/features/storage/compatibility-api.ts` — permanent seven-function public compatibility API installation. Imported for side effects by the Slice 1A legacy shell and later by the new shell bootstrap; Phase 7 preserves it.
- `src/features/storage/indexed-db.ts` — legacy API bridge over compatible v1/v2 databases.
- `src/App.tsx` — localized unsupported-data state and preserved legacy product surface; imports `compatibility-api.ts` but does not install the global itself.
- `tests/unit/database.test.ts`, `tests/unit/compatibility.test.ts`, `tests/unit/indexed-db-compat.test.ts`, `tests/e2e/fixtures/database.ts`, `tests/e2e/migration.spec.ts` — COMPAT-01 parser conformance plus complete local and deployed MIG-01 adapter/product CRUD, close/reopen, schema-preservation, and `VersionError` evidence.
- `playwright.config.ts` — optional deployed-base URL while preserving built-preview defaults.
- `tests/unit/rollback-floor.test.ts` — strict evidence-schema, usage, and ancestry checker contract.
- `scripts/check-rollback-floor.mjs`, `docs/releases/precision-studio-slice-1a.json`, `docs/runbooks/precision-studio-rollback.md` — permanent machine-readable floor and operator procedure.

**Slice 1B modifies/creates**

- `src/features/transcription/types.ts` — legacy bridge types, Slice 1B canonical schema-2 contracts, bounded editor-draft payload, and sole canonical commit result; it does not take ownership of the Slice 1A rollback contract.
- `src/features/transcription/language.ts` and all Slice 1B app/feature consumers — replace the legacy `UiLanguage` alias with the sole `InterfaceLanguage` import from `src/app/copy-types.ts`; persisted `uiLanguage` field name remains unchanged.
- `src/features/transcription/canonical.ts` — scalar checks, exact `CANONICAL_WS`, byte/scalar/timing bounds.
- `src/features/transcription/schema.ts` — exact schema-2 allowlist parser/serializer.
- `src/features/transcription/hashes.ts` — four explicitly separated digest domains.
- `src/features/transcription/legacy.ts` — strict remote and repair-limited local-v1 conversion.
- `tests/fixtures/transcripts.ts`, `tests/unit/canonical.test.ts`, `tests/unit/schema-hashes.test.ts`, `tests/unit/legacy-migration.test.ts` — canonical fixtures and boundary generators.
- `tests/unit/compatibility-conformance.test.ts` — Slice 1B fixture parity proving the permanent rollback parser and canonical parser accept and reject the same schema-2 envelopes without replacing either implementation.
- `src/features/storage/schema.ts`, `src/features/storage/migration.ts`, `src/features/storage/database.ts` — exact v2 stores/indexes and transactional upgrade.
- `src/features/storage/remote-types.ts` — storage-neutral sole owner of `RemoteQuarantineMetadata`, `RemoteQuarantineRecord`, and remote-quarantine write inputs; imports no Drive feature module.
- `src/features/storage/sync-types.ts` — storage-neutral sole owner of durable publication operations plus candidate, sync-state, and sync-metadata records used by repositories; imports no Drive feature module.
- `src/features/google-drive/types.ts` — Phase 1B-created owner for Drive-only candidate-observation, resolver, snapshot, and service contracts; Phase 5 adds identity, `AccountSwitchGuard` and its result types, transport, parser, and verifier contracts in place. It imports/re-exports storage sync contracts only where a Drive consumer needs them; no storage module imports it, and `identity.ts` owns no duplicate public contract.
- `src/features/storage/repositories.ts`, `src/features/storage/transcript-repository.ts`, `src/features/storage/sync-repository.ts`, `src/features/storage/quarantine-repository.ts` — focused repositories, atomic transaction boundaries, and permanent optional `RepositoryFailurePort` factory injection consumed by Phase 4 tests.
- `src/app/LegacyProduct.tsx` — exact extracted legacy product implementation and interim Workbench owner through Phase 6; never imports `App` or `AppShell`.
- `src/app/navigation.ts`, `src/app/use-app-route.ts`, `tests/components/navigation.test.tsx` — query route/history/focus and baseline dirty guard.
- `src/App.tsx`, `src/app/AppShell.tsx`, `src/app/work-activity-store.ts`, `src/components/product/AppHeader.tsx`, `src/components/product/MobileNavigation.tsx`, `src/components/product/RoutePending.tsx`, `src/features/library/LibraryPage.tsx`, `src/features/transcript-editor/TranscriptPage.tsx`, `src/features/settings/validation.ts`, `src/features/settings/SettingsPage.tsx`, `src/main.tsx`, `src/index.css` — thin nonrecursive App adapter, Precision Studio route shell, final Settings implementation, active-work cleanup guard, and lazy boundaries. Library and Transcript are route placeholders owned for later replacement; Settings is not a placeholder.
- `tests/unit/settings-validation.test.ts`, `tests/components/navigation.test.tsx`, `tests/e2e/fixtures/settings.ts`, `tests/e2e/navigation-i18n.spec.ts`, `tests/e2e/performance.spec.ts`, `tests/e2e/migration.spec.ts` — bounded Settings parsing/component/browser states, NAV-01, changed-shell a11y assertions, I18N baseline, PERF-01, MIG-02/03. Phase 1 does not reference or modify Phase 6 consolidated accessibility/profiler/visual files.

## Foundation

### Task 1: Repair baseline duplicate error rendering before new flow

**Files:**
- Modify: `src/App.tsx:884-892, 970-979, 1178-1200`
- Modify: `tests/e2e/whisdom.spec.ts:186-197, 240-249`

- [ ] **Step 1: Tighten both E2E assertions and prove the defects**

Replace the two assertions exactly:

```ts
await expect(page.getByText("requires WebGPU in the browser")).toBeVisible()
await expect(
  page.getByText(/Server transcription requires Google sign-in/i),
).toBeVisible()
```

Run:

```bash
pnpm playwright test tests/e2e/whisdom.spec.ts --grep "q4 guidance|auth prompt" --reporter=list
```

Expected: FAIL. Playwright strict mode reports two matching elements for each selected scenario. Failure must be locator multiplicity, not build, fixture, or navigation failure.

- [ ] **Step 2: Remove failure toasts and retain one contextual channel**

Delete the two pre-throw `setToastMessage` blocks at `src/App.tsx:884-891` and `src/App.tsx:971-977`. Replace `startTranscription` catch at `src/App.tsx:1187-1200` with:

```ts
    } catch (caught) {
      const detail =
        caught instanceof Error
          ? `${caught.name}: ${caught.message}\n${caught.stack ?? ""}`
          : String(caught)
      console.error("[transcription]", detail)
      setJobState("error")
      const message = caught instanceof Error ? caught.message : t.transcriptionFailed
      setError(message)
      updateQueueItem(selectedQueueId, { status: "error", error: message })
    }
```

This leaves `PreflightPanel` as the sole visible operation-scoped error. The closed detail dialog remains disclosure content reached from that same occurrence; no error toast exists.

- [ ] **Step 3: Verify focused green and adjacent baseline**

Run:

```bash
pnpm playwright test tests/e2e/whisdom.spec.ts --grep "q4 guidance|auth prompt" --reporter=list
pnpm playwright test tests/e2e/whisdom.spec.ts --reporter=list
```

Expected: first command reports 2 passed. Second reports all 12 nongated tests passed. `tests/e2e/whisdom.spec.ts` contains no `expect(...).first()`.

- [ ] **Step 4: Stage exact files and commit**

```bash
git add src/App.tsx tests/e2e/whisdom.spec.ts
git diff --cached --name-only
git diff --cached
git commit -m "test: stabilize baseline error assertions"
```

Expected staged paths: only `src/App.tsx` and `tests/e2e/whisdom.spec.ts`. Commit only during authorized plan execution.

### Task 2: Pin Node, dependencies, and the DOM/IndexedDB/axe harness

**Files:**
- Create: `.node-version`
- Modify: `package.json:1-57`
- Modify: `pnpm-lock.yaml` (pnpm-generated exact resolution)
- Modify: `vitest.config.ts:1-15`
- Create: `tests/setup.ts`
- Create: `tests/components/harness.test.tsx`

- [ ] **Step 1: Add a failing harness smoke test**

Create `tests/components/harness.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

afterEach(cleanup)

describe("component harness", () => {
  it("provides DOM matchers and isolated IndexedDB", async () => {
    render(<main aria-label="Harness">Ready</main>)
    expect(screen.getByRole("main", { name: "Harness" })).toBeInTheDocument()
    expect(indexedDB).toBeDefined()
  })
})
```

Run: `pnpm vitest run tests/components/harness.test.tsx`.

Expected: FAIL because the component file is outside current include and setup does not install jest-dom or fake IndexedDB.

- [ ] **Step 2: Pin the runtime and dependencies**

Create `.node-version` with exactly:

```text
24
```

Add `"engines": { "node": ">=22.22.2" }` after `packageManager`. Add exactly these manifest entries:

```json
"@tanstack/react-virtual": "^3.14.9",
"canonicalize": "^3.0.0"
```

under `dependencies`, and:

```json
"@axe-core/playwright": "~4.12.1",
"@testing-library/dom": "^10.4.1",
"@testing-library/jest-dom": "^7.0.0",
"@testing-library/react": "^16.3.2",
"@testing-library/user-event": "^14.6.1",
"axe-core": "~4.12.1",
"fake-indexeddb": "^6.2.5",
"jsdom": "^30.0.1"
```

under `devDependencies`. Keep `@playwright/test@^1.60.0`. Do not add router, toast, command-menu, drag, axe-wrapper, or polyfill packages.

Run:

```bash
pnpm install
```

Expected: exit 0; `pnpm-lock.yaml` records these ranges/resolutions and `packageManager` remains `pnpm@11.5.2`.

- [ ] **Step 3: Modify the existing Vitest config and install deterministic test setup**

Modify the current `vitest.config.ts`; do not replace it wholesale. Preserve the current `resolve.alias`, existing unit-test include, and any current `exclude`, `coverage`, `projects`, or other Vitest defaults. Against the current master file (`environment`, `include`, and `@` alias only), apply this exact diff:

```diff
 export default defineConfig({
   test: {
     environment: "node",
-    include: ["tests/unit/**/*.test.ts"],
+    include: ["tests/unit/**/*.test.ts", "tests/components/**/*.test.tsx"],
+    setupFiles: ["tests/setup.ts"],
+    restoreMocks: true,
+    clearMocks: true,
   },
```

If the current config has `exclude`, `coverage`, `projects`, or additional test defaults not shown above, retain those entries unchanged and apply only the additive `include`/`setupFiles`/mock-lifecycle lines. Retain existing imports and the complete `resolve.alias` object unchanged. Do not add a second config, reset coverage, replace projects with a default project, or discard inherited defaults.
Create `tests/setup.ts` with Testing Library cleanup only:

```ts
import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

afterEach(() => {
  cleanup()
})
```

Remove the local `afterEach(cleanup)` imports/call from `tests/components/harness.test.tsx`, leaving:

```tsx
// @vitest-environment jsdom
import "fake-indexeddb/auto"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

describe("component harness", () => {
  it("provides DOM matchers and isolated IndexedDB", () => {
    render(<main aria-label="Harness">Ready</main>)
    expect(screen.getByRole("main", { name: "Harness" })).toBeInTheDocument()
    expect(indexedDB).toBeDefined()
  })
})
```

- [ ] **Step 4: Verify harness and adjacent unit tests**

Run:

```bash
pnpm vitest run tests/components/harness.test.tsx
pnpm test
```

Expected: harness reports 1 passed; full suite exits 0 with all existing unit tests plus harness passing.

- [ ] **Step 5: Stage exact files and commit**

```bash
git add .node-version package.json pnpm-lock.yaml vitest.config.ts tests/setup.ts tests/components/harness.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "chore: establish precision studio foundations"
```

Expected: exactly the six paths listed in this task. Commit only during authorized execution.

### Task 3: Establish acyclic typed copy and singular product-error primitives

**Files:**
- Create: `src/app/copy-types.ts`
- Create: `src/app/copy.ts`
- Create: `src/components/product/ProductErrorPanel.tsx`
- Create: `tests/components/product-errors.test.tsx`

- [ ] **Step 1: Write the failing component contract**

Create `tests/components/product-errors.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ProductErrorPanel } from "@/components/product/ProductErrorPanel"
import type { ProductError } from "@/app/copy"

const error: ProductError = {
  occurrenceId: "occ-1",
  code: "storage.unsupported-version",
  severity: "error",
  scope: "navigation",
  scopeId: "database",
  params: { foundVersion: 3, maximumVersion: 2 },
  primaryAction: { code: "inspect-details", params: {} },
  secondaryAction: null,
  retryable: false,
  technicalCause: null,
}

describe("ProductErrorPanel", () => {
  it("renders one localized scoped occurrence and invokes recovery", async () => {
    const recover = vi.fn()
    render(
      <ProductErrorPanel language="vi" error={error} onPrimaryAction={recover} />,
    )
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(screen.getByText("Phiên bản dữ liệu không được hỗ trợ")).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "Xem chi tiết" }))
    expect(recover).toHaveBeenCalledOnce()
  })
})
```

Run: `pnpm vitest run tests/components/product-errors.test.tsx`.

Expected: FAIL with unresolved `ProductErrorPanel`/`copy` modules.

- [ ] **Step 2: Implement complete typed copy primitives**

Create `src/app/copy-types.ts` as the dependency-free copy foundation. It imports no app registry or feature copy module and exports only `InterfaceLanguage`, copy value/shape types, `LocalizedCopy`, and `defineCopy`:

```ts
export type InterfaceLanguage = "en" | "vi"
export type CopyPrimitive = string | number | boolean | null
export type CopyParams = Readonly<Record<string, CopyPrimitive>>
export type CopyLeaf = string | ((params: CopyParams) => string)
export type CopyShape = { readonly [key: string]: CopyLeaf | CopyShape }
export type LocalizedCopy<T extends CopyShape> = Readonly<{ en: T; vi: T }>
export function defineCopy<const T extends CopyShape>(copy: { en: T; vi: T }): LocalizedCopy<T> { return copy }
```

Create `src/app/copy.ts` as the composition root. It imports `defineCopy` and copy types from `@/app/copy-types`, owns product issue/error contracts, formatting, `SHELL_COPY`, and `SETTINGS_COPY`, and builds/exports `CopyRegistry` and `COPY_REGISTRY`. It never exports a second `InterfaceLanguage` declaration. At this Foundation point the registry contains shell and Settings; later phases add feature-module imports and entries without reversing the dependency:

```ts
import { defineCopy, type CopyParams, type InterfaceLanguage } from "@/app/copy-types"

export type ProductSeverity = "info" | "warning" | "error"
export type ProductScope =
  | "navigation" | "source" | "queue-item" | "runtime" | "save"
  | "library-item" | "identity" | "sync" | "settings"
export type RecoveryActionCode =
  | "choose-file" | "choose-model" | "use-safe-model" | "retry"
  | "retry-save" | "discard-draft" | "reconnect-drive"
  | "inspect-details" | "back-to-library"
export interface RecoveryAction { code: RecoveryActionCode; params: CopyParams }
export interface ProductError {
  occurrenceId: string; code: string; severity: "error"; scope: ProductScope
  scopeId: string; params: CopyParams; primaryAction: RecoveryAction
  secondaryAction: RecoveryAction | null; retryable: boolean
  technicalCause: { providerStatus: number | null; safeCode: string | null; developmentStack: string | null } | null
}
export interface ProductIssue {
  code: string; severity: ProductSeverity; scope: ProductScope; scopeId: string
  params: CopyParams; blocking: boolean; recoveryAction: RecoveryAction | null
}
export const SHELL_COPY = defineCopy({
  en: {
    skipToContent: "Skip to content",
    primaryNavigation: "Primary navigation",
    errors: {
      unsupportedVersionTitle: "Unsupported data version",
      unsupportedVersionMessage: ({ foundVersion, maximumVersion }: CopyParams) =>
        `This browser contains Whisdom data version ${foundVersion}. This build supports through version ${maximumVersion}. Use a newer Whisdom build; your data was not changed.`,
      genericTitle: "Something went wrong",
      genericMessage: "Whisdom could not complete this action.",
    },
    actions: { inspectDetails: "Inspect details", backToLibrary: "Back to Library", retry: "Retry" },
  },
  vi: {
    skipToContent: "Chuyển đến nội dung",
    primaryNavigation: "Điều hướng chính",
    errors: {
      unsupportedVersionTitle: "Phiên bản dữ liệu không được hỗ trợ",
      unsupportedVersionMessage: ({ foundVersion, maximumVersion }: CopyParams) =>
        `Trình duyệt này chứa dữ liệu Whisdom phiên bản ${foundVersion}. Bản dựng này hỗ trợ đến phiên bản ${maximumVersion}. Hãy dùng bản Whisdom mới hơn; dữ liệu của bạn chưa bị thay đổi.`,
      genericTitle: "Đã xảy ra lỗi",
      genericMessage: "Whisdom không thể hoàn tất thao tác này.",
    },
    actions: { inspectDetails: "Xem chi tiết", backToLibrary: "Quay lại Thư viện", retry: "Thử lại" },
  },
})

function actionLabel(language: InterfaceLanguage, code: RecoveryActionCode): string {
  const copy = SHELL_COPY[language].actions
  if (code === "inspect-details") return copy.inspectDetails
  if (code === "back-to-library") return copy.backToLibrary
  return copy.retry
}

export function formatProductError(language: InterfaceLanguage, error: ProductError) {
  const copy = SHELL_COPY[language]
  const unsupported = error.code === "storage.unsupported-version"
  return {
    title: unsupported ? copy.errors.unsupportedVersionTitle : copy.errors.genericTitle,
    message: unsupported ? copy.errors.unsupportedVersionMessage(error.params) : copy.errors.genericMessage,
    primaryLabel: actionLabel(language, error.primaryAction.code),
    secondaryLabel: error.secondaryAction ? actionLabel(language, error.secondaryAction.code) : null,
  }
}

export function formatProductIssue(language: InterfaceLanguage, issue: ProductIssue): string {
  return issue.code === "storage.unsupported-version"
    ? SHELL_COPY[language].errors.unsupportedVersionMessage(issue.params)
    : SHELL_COPY[language].errors.genericMessage
}

export const SETTINGS_COPY = defineCopy({
  en: { page: { title: "Settings", description: "Manage local processing and storage preferences." } },
  vi: { page: { title: "Cài đặt", description: "Quản lý tùy chọn xử lý và lưu trữ cục bộ." } },
})

export interface CopyRegistry {
  shell: typeof SHELL_COPY
  settings: typeof SETTINGS_COPY
}

export const COPY_REGISTRY: Readonly<CopyRegistry> = Object.freeze({
  shell: SHELL_COPY,
  settings: SETTINGS_COPY,
})
```

`src/app/copy-types.ts` is the sole owner of `InterfaceLanguage`, `defineCopy`, and copy helper/types. Every feature copy module imports only those foundations from `@/app/copy-types`; it never imports `@/app/copy`. `src/app/copy.ts` is the sole settings-copy and registry owner: `src/features/settings/SettingsPage.tsx` imports `SETTINGS_COPY`; no Settings-local copy object exists. Later phases make `src/app/copy.ts` import `WORKBENCH_COPY`, `EDITOR_COPY`, `LIBRARY_COPY`, and `DRIVE_COPY`, then extend its one registry. This one-way graph—`copy-types.ts` → feature copy modules → `copy.ts`—is mandatory. Phase 6 consumes the final registry and imports `InterfaceLanguage` only from `copy-types.ts`.

- [ ] **Step 3: Implement the scoped renderer**

Create `src/components/product/ProductErrorPanel.tsx`:

```tsx
import { AlertCircle } from "lucide-react"

import { formatProductError, type ProductError } from "@/app/copy"
import type { InterfaceLanguage } from "@/app/copy-types"
import { Button } from "@/components/ui/button"

export function ProductErrorPanel({ language, error, onPrimaryAction, onSecondaryAction }: {
  language: InterfaceLanguage
  error: ProductError
  onPrimaryAction: () => void
  onSecondaryAction?: () => void
}) {
  const copy = formatProductError(language, error)
  return (
    <section role="alert" aria-labelledby={`error-${error.occurrenceId}`} className="border-l-2 border-destructive px-4 py-3">
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id={`error-${error.occurrenceId}`} className="text-sm font-semibold">{copy.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{copy.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={onPrimaryAction}>{copy.primaryLabel}</Button>
            {copy.secondaryLabel && onSecondaryAction ? (
              <Button size="sm" variant="outline" onClick={onSecondaryAction}>{copy.secondaryLabel}</Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Verify focused and adjacent suites**

Run:

```bash
pnpm vitest run tests/components/product-errors.test.tsx
pnpm test
```

Expected: focused 1 passed; adjacent suite exits 0.

- [ ] **Step 5: Stage exact files and commit**

```bash
git add src/app/copy-types.ts src/app/copy.ts src/components/product/ProductErrorPanel.tsx tests/components/product-errors.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "feat(app): add typed product error primitives"
```

## Slice 1A — independently deployable rollback floor

### Task 4: Add MIG-01 database fixtures and versionless compatibility opener

**Files:**
- Create: `src/features/storage/database.ts`
- Create: `tests/e2e/fixtures/database.ts`
- Create/Modify: `tests/unit/database.test.ts`
- Modify: `src/features/storage/indexed-db.ts:1-75`

- [ ] **Step 1: Write failing versionless opener tests**

Create `tests/unit/database.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest"
import { openDB } from "idb"

import { closeDatabase, openCompatibleDatabase } from "@/features/storage/database"

async function createVersion(version: number) {
  const db = await openDB("whisdom", version, {
    upgrade(database, oldVersion, newVersion, transaction) {
      void oldVersion;
      void newVersion;
      void transaction;
      if (!database.objectStoreNames.contains("settings")) database.createObjectStore("settings")
      if (!database.objectStoreNames.contains("transcripts")) database.createObjectStore("transcripts", { keyPath: "id" })
    },
  })
  db.close()
}

afterEach(async () => {
  await closeDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("whisdom")
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
})

describe("MIG-01 compatible database open", () => {
  it("uses the idb@8 versionless callback signature", async () => {
    const source = await import("@/features/storage/database?raw")
    expect(source.default).toContain("openDB(WHISDOM_DB_NAME, undefined,")
    expect(source.default).not.toMatch(/openDB\(WHISDOM_DB_NAME,\s*\d/)
  })

  it("creates only the v1-compatible fresh layout", async () => {
    const result = await openCompatibleDatabase()
    expect(result.status).toBe("ready")
    if (result.status !== "ready") throw new Error("expected ready")
    expect(result.version).toBe(1)
    expect(Array.from(result.db.objectStoreNames)).toEqual(["settings", "transcripts"])
  })

  it.each([1, 2] as const)("opens existing v%s without downgrade", async (version) => {
    await createVersion(version)
    const result = await openCompatibleDatabase()
    expect(result.status).toBe("ready")
    if (result.status !== "ready") throw new Error("expected ready")
    expect(result.version).toBe(version)
  })

  it("closes and reports unsupported newer data", async () => {
    await createVersion(3)
    const result = await openCompatibleDatabase()
    expect(result).toEqual({ status: "unsupported", foundVersion: 3, maximumVersion: 2 })
  })
})
```

Run: `pnpm vitest run tests/unit/database.test.ts`.

Expected: FAIL with unresolved `@/features/storage/database`.

- [ ] **Step 2: Implement the versionless opener**

Create `src/features/storage/database.ts`:

```ts
import { openDB, type IDBPDatabase } from "idb"

export const WHISDOM_DB_NAME = "whisdom"
export const WHISDOM_DB_VERSION = 2
export type SupportedDatabaseVersion = 1 | 2
export type DatabaseOpenResult =
  | { status: "ready"; version: SupportedDatabaseVersion; db: IDBPDatabase }
  | { status: "unsupported"; foundVersion: number; maximumVersion: 2 }

let compatibleOpen: Promise<DatabaseOpenResult> | null = null

function isSupported(version: number): version is SupportedDatabaseVersion {
  return version === 1 || version === 2
}

export function openCompatibleDatabase(): Promise<DatabaseOpenResult> {
  compatibleOpen ??= openDB(WHISDOM_DB_NAME, undefined, {
    upgrade(database, oldVersion, newVersion, transaction) {
      void newVersion;
      void transaction;
      if (oldVersion !== 0) throw new Error("storage.unexpected-versionless-upgrade")
      database.createObjectStore("settings")
      database.createObjectStore("transcripts", { keyPath: "id" })
    },
    blocking(_currentVersion, _blockedVersion, event) {
      ;(event.target as IDBDatabase).close()
      compatibleOpen = null
    },
    terminated() {
      compatibleOpen = null
    },
  }).then((db): DatabaseOpenResult => {
    if (!isSupported(db.version)) {
      const foundVersion = db.version
      db.close()
      compatibleOpen = null
      return { status: "unsupported", foundVersion, maximumVersion: 2 }
    }
    return { status: "ready", version: db.version, db }
  }).catch((error) => {
    compatibleOpen = null
    throw error
  })
  return compatibleOpen
}

export async function closeDatabase(): Promise<void> {
  const current = compatibleOpen
  compatibleOpen = null
  if (!current) return
  const result = await current
  if (result.status === "ready") result.db.close()
}
```

Slice 1A intentionally has no `openVersion2Database` and no `version: 2` open call. Every `idb@8` versionless open uses the exact three-argument signature `openDB(WHISDOM_DB_NAME, undefined, callbacks)`; the fresh-database `upgrade` callback remains installed, and no numeric version is supplied.

### Task 5: Establish the permanent COMPAT-01 rollback contract

**Files:**
- Create: `src/features/storage/compatibility.ts`
- Create: `tests/unit/compatibility.test.ts`

This module belongs to Slice 1A. It is the permanent rollback boundary consumed by `src/features/storage/indexed-db.ts`, not a temporary copy of Slice 1B canonical code. Keep it free of RFC 8785, hashing, migration, quarantine, repositories, Drive, editor drafts, and numeric-version database opens. Slice 1B may add parity tests against it but may not move, rename, delete, or redefine any export below.

- [ ] **Step 1: Write failing schema, identifier, conversion, epoch, and settings tests**

Create `tests/unit/compatibility.test.ts`:

```ts
import { openDB, type IDBPDatabase } from "idb"
import { afterEach, describe, expect, it } from "vitest"

import {
  compatibilityMsToLegacySeconds,
  inspectVersion2Schema,
  legacySecondsToCompatibilityMs,
  parseCompatibilityDeletionId,
  parseCompatibilityDeviceId,
  parseCompatibilityEpochMs,
  parseCompatibilityLegacyIso,
  parseCompatibilitySettings,
} from "@/features/storage/compatibility"
import { DEFAULT_SETTINGS } from "@/features/transcription/models"

async function createV2(extraStore = false): Promise<IDBPDatabase> {
  return openDB(`compat-${extraStore ? "extra" : "exact"}`, 2, {
    upgrade(db, oldVersion, newVersion, transaction) {
      void oldVersion;
      void newVersion;
      void transaction;
      const settings = db.createObjectStore("settings")
      const transcripts = db.createObjectStore("transcripts", { keyPath: "transcriptId" })
      transcripts.createIndex("by-deletedAt", "deletedAt")
      transcripts.createIndex("by-updatedAt", "updatedAt")
      const quarantine = db.createObjectStore("migrationQuarantine", { keyPath: "quarantineId" })
      quarantine.createIndex("by-originalV1Key", "originalV1Key")
      quarantine.createIndex("by-reasonCode", "reasonCode")
      db.createObjectStore("drafts", { keyPath: "transcriptId" })
      const conflicts = db.createObjectStore("conflictCandidates", { keyPath: "candidateId" })
      conflicts.createIndex("by-receivedAt", "receivedAt")
      conflicts.createIndex("by-transcriptId", "transcriptId")
      const metadata = db.createObjectStore("syncMetadata", { keyPath: ["accountKey", "transcriptId"] })
      metadata.createIndex("by-accountKey", "accountKey")
      metadata.createIndex("by-transcriptId", "transcriptId")
      const pending = db.createObjectStore("pendingOperations", { keyPath: ["accountKey", "transcriptId"] })
      pending.createIndex("by-accountKey", "accountKey")
      pending.createIndex("by-nextAttemptAt", "nextAttemptAt")
      pending.createIndex("by-transcriptId", "transcriptId")
      db.createObjectStore("syncState", { keyPath: "accountKey" })
      const meta = db.createObjectStore("meta")
      settings.put(DEFAULT_SETTINGS, "settings")
      meta.put("d_AAAAAAAAAAAAAAAAAAAAAA", "deviceId")
      if (extraStore) db.createObjectStore("unexpected")
    },
  })
}

afterEach(async () => {
  for (const name of ["compat-exact", "compat-extra"]) {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })
  }
})

describe("COMPAT-01 schema and scalar boundary", () => {
  it("describes the exact nine-store v2 schema without mutation", async () => {
    const db = await createV2()
    const result = await inspectVersion2Schema(db)
    expect(result).toEqual({
      ok: true,
      value: {
        stores: ["conflictCandidates", "drafts", "meta", "migrationQuarantine", "pendingOperations", "settings", "syncMetadata", "syncState", "transcripts"],
        keyPaths: {
          settings: null, transcripts: "transcriptId", migrationQuarantine: "quarantineId",
          drafts: "transcriptId", conflictCandidates: "candidateId",
          syncMetadata: ["accountKey", "transcriptId"], pendingOperations: ["accountKey", "transcriptId"],
          syncState: "accountKey", meta: null,
        },
        indexes: {
          transcripts: ["by-deletedAt", "by-updatedAt"],
          migrationQuarantine: ["by-originalV1Key", "by-reasonCode"],
          conflictCandidates: ["by-receivedAt", "by-transcriptId"],
          syncMetadata: ["by-accountKey", "by-transcriptId"],
          pendingOperations: ["by-accountKey", "by-nextAttemptAt", "by-transcriptId"],
          drafts: [], settings: [], syncState: [], meta: [],
        },
        deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA",
      },
    })
    expect(Array.from(db.objectStoreNames)).toHaveLength(9)
    db.close()
  })

  it("rejects an extra store as invalid schema", async () => {
    const db = await createV2(true)
    await expect(inspectVersion2Schema(db)).resolves.toEqual({
      ok: false, error: "compatibility.invalid-schema", path: "$.stores",
    })
    db.close()
  })

  it("accepts only canonical 16-byte identifiers", () => {
    expect(parseCompatibilityDeviceId("d_AAAAAAAAAAAAAAAAAAAAAA")).toEqual({ ok: true, value: "d_AAAAAAAAAAAAAAAAAAAAAA" })
    expect(parseCompatibilityDeletionId("x_AAAAAAAAAAAAAAAAAAAAAA")).toEqual({ ok: true, value: "x_AAAAAAAAAAAAAAAAAAAAAA" })
    expect(parseCompatibilityDeviceId("d_AAAAAAAAAAAAAAAAAAAAA=")).toMatchObject({ ok: false, error: "compatibility.invalid-scalar" })
    expect(parseCompatibilityDeletionId(null)).toMatchObject({ ok: false, error: "compatibility.invalid-shape" })
  })

  it("checks epoch and legacy ISO bounds and round trips", () => {
    expect(parseCompatibilityEpochMs(946684800000)).toEqual({ ok: true, value: 946684800000 })
    expect(parseCompatibilityEpochMs(4102444800000)).toEqual({ ok: true, value: 4102444800000 })
    expect(parseCompatibilityEpochMs(0)).toMatchObject({ ok: false, error: "compatibility.out-of-bounds" })
    expect(parseCompatibilityLegacyIso("2026-07-29T00:00:00.000Z")).toEqual({ ok: true, value: 1785283200000 })
    expect(parseCompatibilityLegacyIso("2026-07-29")).toMatchObject({ ok: false, error: "compatibility.invalid-scalar" })
  })

  it("performs checked seconds and millisecond conversions without clamping", () => {
    expect(legacySecondsToCompatibilityMs(1.2345)).toEqual({ ok: true, value: 1235 })
    expect(legacySecondsToCompatibilityMs(604800)).toEqual({ ok: true, value: 604800000 })
    expect(legacySecondsToCompatibilityMs(-1)).toMatchObject({ ok: false, error: "compatibility.time-conversion" })
    expect(legacySecondsToCompatibilityMs(604800.001)).toMatchObject({ ok: false, error: "compatibility.time-conversion" })
    expect(compatibilityMsToLegacySeconds(1250)).toEqual({ ok: true, value: 1.25 })
    expect(compatibilityMsToLegacySeconds(604800001)).toMatchObject({ ok: false, error: "compatibility.time-conversion" })
  })

  it("projects pre-Phase-2 settings and accepts the complete later settings record", () => {
    const v1 = { ...DEFAULT_SETTINGS }
    const v2 = { ...v1, explicitModelId: "onnx-community/whisper-small" }
    expect(parseCompatibilitySettings(undefined, DEFAULT_SETTINGS)).toEqual({
      ok: true, value: { ...DEFAULT_SETTINGS, explicitModelId: null },
    })
    expect(parseCompatibilitySettings(v1, DEFAULT_SETTINGS)).toEqual({
      ok: true, value: { ...DEFAULT_SETTINGS, explicitModelId: null },
    })
    expect(parseCompatibilitySettings(v2, DEFAULT_SETTINGS)).toMatchObject({
      ok: true, value: { ...DEFAULT_SETTINGS, explicitModelId: "onnx-community/whisper-small" },
    })
    expect(parseCompatibilitySettings({ ...v2, extra: true }, DEFAULT_SETTINGS)).toMatchObject({
      ok: false, error: "compatibility.invalid-shape",
    })
    expect(parseCompatibilitySettings({ ...v2, explicitModelId: 42 }, DEFAULT_SETTINGS)).toMatchObject({
      ok: false, error: "compatibility.invalid-shape", path: "$.explicitModelId",
    })
    expect(parseCompatibilitySettings({ ...v2, explicitModelId: "" }, DEFAULT_SETTINGS)).toMatchObject({
      ok: false, error: "compatibility.out-of-bounds", path: "$.explicitModelId",
    })
    expect(parseCompatibilitySettings({ ...v2, explicitModelId: "\ud800" }, DEFAULT_SETTINGS)).toMatchObject({
      ok: false, error: "compatibility.invalid-scalar", path: "$.explicitModelId",
    })
    expect(parseCompatibilitySettings({ ...v2, serverModelId: "server/model" }, DEFAULT_SETTINGS)).toMatchObject({
      ok: true, value: { serverModelId: "server/model" },
    })
    expect(parseCompatibilitySettings({ ...v2, serverModelId: null }, DEFAULT_SETTINGS)).toMatchObject({
      ok: true, value: { serverModelId: null },
    })
    expect(parseCompatibilitySettings({ ...v2, serverModelId: "🙂".repeat(128) }, DEFAULT_SETTINGS)).toMatchObject({
      ok: true, value: { serverModelId: "🙂".repeat(128) },
    })
    expect(parseCompatibilitySettings({ ...v2, serverModelId: "" }, DEFAULT_SETTINGS)).toMatchObject({
      ok: false, error: "compatibility.out-of-bounds", path: "$.serverModelId",
    })
    expect(parseCompatibilitySettings({ ...v2, serverModelId: "x".repeat(129) }, DEFAULT_SETTINGS)).toMatchObject({
      ok: false, error: "compatibility.out-of-bounds", path: "$.serverModelId",
    })
    expect(parseCompatibilitySettings({ ...v2, serverModelId: "🙂".repeat(129) }, DEFAULT_SETTINGS)).toMatchObject({
      ok: false, error: "compatibility.out-of-bounds", path: "$.serverModelId",
    })
    expect(parseCompatibilitySettings({ ...v2, serverModelId: "\ud800" }, DEFAULT_SETTINGS)).toMatchObject({
      ok: false, error: "compatibility.invalid-scalar", path: "$.serverModelId",
    })
    expect(parseCompatibilitySettings({ ...v1, mode: "other" }, DEFAULT_SETTINGS)).toMatchObject({
      ok: false, error: "compatibility.invalid-scalar", path: "$.mode",
    })
  })
})
```

Run: `pnpm vitest run tests/unit/compatibility.test.ts`.

Expected: FAIL because `@/features/storage/compatibility` does not exist.

- [ ] **Step 2: Implement exact public types, schema inspection, checked primitives, and settings parsing**

Create `src/features/storage/compatibility.ts`:

```ts
import type { IDBPDatabase } from "idb"

import type { AppSettings, ProcessingMode, TranscriptDocument } from "@/features/transcription/types"

export type CompatibilityFailureCode =
  | "compatibility.invalid-schema"
  | "compatibility.invalid-shape"
  | "compatibility.invalid-scalar"
  | "compatibility.out-of-bounds"
  | "compatibility.invalid-lineage"
  | "compatibility.invalid-derived-text"
  | "compatibility.time-conversion"

export type CompatibilityResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CompatibilityFailureCode; path: string }

export interface RollbackV2Segment { id: string; startMs: number; endMs: number; text: string }
export interface RollbackV2Payload {
  title: string; sourceName: string; language: string; modelId: string
  mode: ProcessingMode; createdAt: number; text: string; segments: RollbackV2Segment[]
}
export interface RollbackV2Envelope {
  schemaVersion: 2; transcriptId: string; revision: number; updatedAt: number
  deletedAt: number | null; deviceId: string; deletionId: string | null
  restoredFromDeletionId: string | null; transcript: RollbackV2Payload | null
}
export type CompatibilitySettingsProjection = Omit<AppSettings, "explicitModelId"> & {
  explicitModelId: string | null
}
export interface Version2SchemaDescription {
  stores: readonly ["conflictCandidates", "drafts", "meta", "migrationQuarantine", "pendingOperations", "settings", "syncMetadata", "syncState", "transcripts"]
  keyPaths: Readonly<{
    settings: null; transcripts: "transcriptId"; migrationQuarantine: "quarantineId"
    drafts: "transcriptId"; conflictCandidates: "candidateId"
    syncMetadata: readonly ["accountKey", "transcriptId"]
    pendingOperations: readonly ["accountKey", "transcriptId"]
    syncState: "accountKey"; meta: null
  }>
  indexes: Readonly<{
    transcripts: readonly ["by-deletedAt", "by-updatedAt"]
    migrationQuarantine: readonly ["by-originalV1Key", "by-reasonCode"]
    conflictCandidates: readonly ["by-receivedAt", "by-transcriptId"]
    syncMetadata: readonly ["by-accountKey", "by-transcriptId"]
    pendingOperations: readonly ["by-accountKey", "by-nextAttemptAt", "by-transcriptId"]
    drafts: readonly []; settings: readonly []; syncState: readonly []; meta: readonly []
  }>
  deviceId: string
}

const MIN_EPOCH_MS = 946684800000
const MAX_EPOCH_MS = 4102444800000
const MAX_RELATIVE_MS = 604800000
const MODES = ["local-webgpu", "cloudflare-ai", "local-wasm", "server"] as const
const SETTINGS_V1_KEYS = ["chunkSeconds", "language", "mode", "modelId", "overlapSeconds", "persistMediaBlobs", "serverModelId", "uiLanguage"] as const
const SETTINGS_V2_KEYS = [...SETTINGS_V1_KEYS, "explicitModelId"] as const
const SCHEMA = {
  stores: ["conflictCandidates", "drafts", "meta", "migrationQuarantine", "pendingOperations", "settings", "syncMetadata", "syncState", "transcripts"],
  keyPaths: {
    settings: null, transcripts: "transcriptId", migrationQuarantine: "quarantineId",
    drafts: "transcriptId", conflictCandidates: "candidateId",
    syncMetadata: ["accountKey", "transcriptId"], pendingOperations: ["accountKey", "transcriptId"],
    syncState: "accountKey", meta: null,
  },
  indexes: {
    transcripts: ["by-deletedAt", "by-updatedAt"],
    migrationQuarantine: ["by-originalV1Key", "by-reasonCode"],
    conflictCandidates: ["by-receivedAt", "by-transcriptId"],
    syncMetadata: ["by-accountKey", "by-transcriptId"],
    pendingOperations: ["by-accountKey", "by-nextAttemptAt", "by-transcriptId"],
    drafts: [], settings: [], syncState: [], meta: [],
  },
} as const satisfies Omit<Version2SchemaDescription, "deviceId">

function ok<T>(value: T): CompatibilityResult<T> { return { ok: true, value } }
function fail<T>(error: CompatibilityFailureCode, path: string): CompatibilityResult<T> { return { ok: false, error, path } }
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}
function sameKeyPath(actual: IDBObjectStore["keyPath"], expected: string | readonly string[] | null): boolean {
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && actual.every((part, index) => part === expected[index])
  return actual === expected
}
function isScalarString(value: unknown): value is string {
  if (typeof value !== "string") return false
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false
  }
  return true
}
function byteLength(value: string): number { return new TextEncoder().encode(value).byteLength }
function scalarLength(value: string): number { return [...value].length }
function isCanonicalWhitespace(codePoint: number): boolean {
  return (codePoint >= 0x0009 && codePoint <= 0x000d) || codePoint === 0x0020 || codePoint === 0x0085 ||
    codePoint === 0x00a0 || codePoint === 0x1680 || (codePoint >= 0x2000 && codePoint <= 0x200a) ||
    codePoint === 0x2028 || codePoint === 0x2029 || codePoint === 0x202f || codePoint === 0x205f ||
    codePoint === 0x3000 || codePoint === 0xfeff
}
function hasNonWhitespace(value: string): boolean { return [...value].some((part) => !isCanonicalWhitespace(part.codePointAt(0)!)) }
function boundedString(value: unknown, path: string, minScalars: number, maxScalars: number, maxBytes: number, requireVisible: boolean): CompatibilityResult<string> {
  if (typeof value !== "string") return fail("compatibility.invalid-shape", path)
  if (!isScalarString(value)) return fail("compatibility.invalid-scalar", path)
  const scalars = scalarLength(value)
  if (scalars < minScalars || scalars > maxScalars || byteLength(value) > maxBytes || (requireVisible && !hasNonWhitespace(value))) return fail("compatibility.out-of-bounds", path)
  return ok(value)
}
function canonicalId(value: unknown, prefix: "d_" | "x_", path: string): CompatibilityResult<string> {
  if (typeof value !== "string") return fail("compatibility.invalid-shape", path)
  if (!isScalarString(value) || !new RegExp(`^${prefix}[A-Za-z0-9_-]{22}$`).test(value)) return fail("compatibility.invalid-scalar", path)
  try {
    const suffix = value.slice(2)
    const bytes = Uint8Array.from(atob(suffix.replace(/-/g, "+").replace(/_/g, "/") + "=="), (character) => character.charCodeAt(0))
    const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "")
    return bytes.length === 16 && encoded === suffix ? ok(value) : fail("compatibility.invalid-scalar", path)
  } catch { return fail("compatibility.invalid-scalar", path) }
}

export async function inspectVersion2Schema(db: IDBPDatabase): Promise<CompatibilityResult<Version2SchemaDescription>> {
  const stores = Array.from(db.objectStoreNames).sort()
  if (stores.length !== SCHEMA.stores.length || stores.some((store, index) => store !== SCHEMA.stores[index])) return fail("compatibility.invalid-schema", "$.stores")
  const transaction = db.transaction([...SCHEMA.stores], "readonly")
  for (const storeName of SCHEMA.stores) {
    const store = transaction.objectStore(storeName)
    if (!sameKeyPath(store.keyPath, SCHEMA.keyPaths[storeName])) return fail("compatibility.invalid-schema", `$.keyPaths.${storeName}`)
    const indexes = Array.from(store.indexNames).sort()
    const expected = [...SCHEMA.indexes[storeName]]
    if (indexes.length !== expected.length || indexes.some((name, index) => name !== expected[index])) return fail("compatibility.invalid-schema", `$.indexes.${storeName}`)
  }
  const deviceId = parseCompatibilityDeviceId(await transaction.objectStore("meta").get("deviceId"))
  if (!deviceId.ok) return fail("compatibility.invalid-schema", "$.meta.deviceId")
  await transaction.done
  return ok({ ...SCHEMA, deviceId: deviceId.value })
}

export function parseCompatibilityDeviceId(value: unknown): CompatibilityResult<string> { return canonicalId(value, "d_", "$") }
export function parseCompatibilityDeletionId(value: unknown): CompatibilityResult<string> { return canonicalId(value, "x_", "$") }
export function parseCompatibilityEpochMs(value: unknown): CompatibilityResult<number> {
  if (typeof value !== "number") return fail("compatibility.invalid-shape", "$")
  return Number.isSafeInteger(value) && value >= MIN_EPOCH_MS && value <= MAX_EPOCH_MS ? ok(value) : fail("compatibility.out-of-bounds", "$")
}
export function parseCompatibilityLegacyIso(value: unknown): CompatibilityResult<number> {
  if (typeof value !== "string") return fail("compatibility.invalid-shape", "$")
  if (!isScalarString(value)) return fail("compatibility.invalid-scalar", "$")
  const epoch = Date.parse(value)
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) return fail("compatibility.invalid-scalar", "$")
  const bounded = parseCompatibilityEpochMs(epoch)
  return bounded.ok ? bounded : fail(bounded.error, "$")
}
export function legacySecondsToCompatibilityMs(value: unknown): CompatibilityResult<number> {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return fail("compatibility.time-conversion", "$")
  const product = value * 1000
  const rounded = Math.round(product)
  return Number.isFinite(product) && Number.isSafeInteger(rounded) && rounded <= MAX_RELATIVE_MS ? ok(rounded) : fail("compatibility.time-conversion", "$")
}
export function compatibilityMsToLegacySeconds(value: unknown): CompatibilityResult<number> {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > MAX_RELATIVE_MS) return fail("compatibility.time-conversion", "$")
  const seconds = value / 1000
  return Math.round(seconds * 1000) === value ? ok(seconds) : fail("compatibility.time-conversion", "$")
}
export function parseCompatibilitySettings(value: unknown, defaults: AppSettings): CompatibilityResult<CompatibilitySettingsProjection> {
  if (value === undefined) return ok({ ...defaults, explicitModelId: null })
  if (!isPlainObject(value)) return fail("compatibility.invalid-shape", "$")
  const version = hasExactKeys(value, SETTINGS_V1_KEYS) ? 1 : hasExactKeys(value, SETTINGS_V2_KEYS) ? 2 : null
  if (version === null) return fail("compatibility.invalid-shape", "$")
  if (typeof value.uiLanguage !== "string") return fail("compatibility.invalid-shape", "$.uiLanguage")
  if (!isScalarString(value.uiLanguage) || (value.uiLanguage !== "en" && value.uiLanguage !== "vi")) return fail("compatibility.invalid-scalar", "$.uiLanguage")
  const modelId = boundedString(value.modelId, "$.modelId", 1, 128, 512, true); if (!modelId.ok) return modelId
  const language = boundedString(value.language, "$.language", 1, 128, 512, true); if (!language.ok) return language
  if (typeof value.mode !== "string") return fail("compatibility.invalid-shape", "$.mode")
  if (!isScalarString(value.mode) || !MODES.includes(value.mode as ProcessingMode)) return fail("compatibility.invalid-scalar", "$.mode")
  if (typeof value.chunkSeconds !== "number" || !Number.isFinite(value.chunkSeconds) || value.chunkSeconds <= 0) return fail("compatibility.out-of-bounds", "$.chunkSeconds")
  if (typeof value.overlapSeconds !== "number" || !Number.isFinite(value.overlapSeconds) || value.overlapSeconds < 0) return fail("compatibility.out-of-bounds", "$.overlapSeconds")
  if (typeof value.persistMediaBlobs !== "boolean") return fail("compatibility.invalid-shape", "$.persistMediaBlobs")
  const serverModelId = value.serverModelId === null
    ? ok<string | null>(null)
    : boundedString(value.serverModelId, "$.serverModelId", 1, 128, 512, true)
  if (!serverModelId.ok) return serverModelId
  const explicitModelId = version === 2
    ? value.explicitModelId === null
      ? ok<string | null>(null)
      : boundedString(value.explicitModelId, "$.explicitModelId", 1, 128, 512, true)
    : ok<string | null>(null)
  if (!explicitModelId.ok) return explicitModelId
  return ok({ uiLanguage: value.uiLanguage, modelId: modelId.value, explicitModelId: explicitModelId.value, language: language.value, mode: value.mode as ProcessingMode, chunkSeconds: value.chunkSeconds, overlapSeconds: value.overlapSeconds, persistMediaBlobs: value.persistMediaBlobs, serverModelId: serverModelId.value })
}
```

Settings compatibility is a closed two-shape contract, independent of IndexedDB database version. `SettingsRecordV1` has exactly the eight current keys in `SETTINGS_V1_KEYS`; `SettingsRecordV2` has exactly those keys plus `explicitModelId`, whose only valid values are a scalar non-empty model ID or `null`. `serverModelId` in both shapes is exactly `null` or a non-empty scalar-valid string bounded to 128 Unicode scalars and 512 UTF-8 bytes; empty, oversized, and lone-surrogate values fail. There is no persisted `settingsSchemaVersion` field: projection version is determined only by the exact key set, so old v1 records remain readable and later Phase-2 records cannot be mistaken for arbitrary extensions. All final-product persisted settings are represented by `SettingsRecordV2`: `uiLanguage`, `modelId`, `explicitModelId`, `language`, `mode`, `chunkSeconds`, `overlapSeconds`, `persistMediaBlobs`, and `serverModelId`.

`parseCompatibilitySettings` is the master-compatible projection boundary and always returns `CompatibilitySettingsProjection` with `explicitModelId` present. Missing settings and exact v1 records return `explicitModelId: null`; exact v2 records preserve a scalar string or `null`. The Slice 1A artifact may still accept the pre-Phase-2 eight-field input type, but its parser output never omits the later field and it must never write a reduced projection over a stored v2 record. Before any v2 settings write, validate through this parser, read the existing exact record in the same settings transaction, and write a nine-key v2 record that preserves `explicitModelId` when the rollback-floor caller cannot express it. Fresh/migrated Phase-2 data writes `explicitModelId: null` or the explicit choice. v1 storage keeps its existing key/value behavior until Phase 2 writes the additive field; after that write, the floor accepts the nine-key record without rejecting, dropping, or rewriting the field unless an intentional Phase-2 settings action changes it.

Run: `pnpm vitest run tests/unit/compatibility.test.ts`.

Expected: 6 passed. Schema inspection uses one readonly transaction and leaves all nine stores unchanged.

- [ ] **Step 3: Add failing segment and payload conformance rows**

Extend the import from `@/features/storage/compatibility` with `parseRollbackV2Payload` and `parseRollbackV2Segment`. Append inside the existing `describe`:

```ts
  it("parses exact canonical segments and rejects shape, scalar, timing, and normalization defects", () => {
    const valid = { id: "seg_001", startMs: 0, endMs: 1250, text: "Hello world." }
    expect(parseRollbackV2Segment(valid)).toEqual({ ok: true, value: valid })
    expect(parseRollbackV2Segment({ ...valid, extra: true })).toMatchObject({ ok: false, error: "compatibility.invalid-shape" })
    expect(parseRollbackV2Segment({ ...valid, id: "\ud800" })).toMatchObject({ ok: false, error: "compatibility.invalid-scalar" })
    expect(parseRollbackV2Segment({ ...valid, endMs: 604800001 })).toMatchObject({ ok: false, error: "compatibility.out-of-bounds" })
    expect(parseRollbackV2Segment({ ...valid, startMs: 2, endMs: 1 })).toMatchObject({ ok: false, error: "compatibility.invalid-lineage" })
    expect(parseRollbackV2Segment({ ...valid, text: " Hello  world. " })).toMatchObject({ ok: false, error: "compatibility.invalid-derived-text" })
  })

  it("parses the exact payload and rejects duplicate, overlap, bounds, and derived-text defects", () => {
    const segment = { id: "seg_001", startMs: 0, endMs: 1250, text: "Hello world." }
    const payload = {
      title: "Sample transcript", sourceName: "sample.wav", language: "en",
      modelId: "Xenova/whisper-base", mode: "local-webgpu", createdAt: 1785283200000,
      text: "Hello world.", segments: [segment],
    }
    expect(parseRollbackV2Payload(payload)).toEqual({ ok: true, value: payload })
    expect(parseRollbackV2Payload({ ...payload, id: "payload-id" })).toMatchObject({ ok: false, error: "compatibility.invalid-shape" })
    expect(parseRollbackV2Payload({ ...payload, title: " Sample transcript" })).toMatchObject({ ok: false, error: "compatibility.invalid-scalar" })
    expect(parseRollbackV2Payload({ ...payload, segments: [segment, { ...segment }] })).toMatchObject({ ok: false, error: "compatibility.invalid-lineage" })
    expect(parseRollbackV2Payload({ ...payload, segments: [segment, { id: "seg_002", startMs: 1000, endMs: 2000, text: "Next" }], text: "Hello world. Next" })).toMatchObject({ ok: false, error: "compatibility.invalid-lineage" })
    expect(parseRollbackV2Payload({ ...payload, text: "stale" })).toMatchObject({ ok: false, error: "compatibility.invalid-derived-text" })
  })
```

Run: `pnpm vitest run tests/unit/compatibility.test.ts`.

Expected: FAIL because both parser exports are absent.

- [ ] **Step 4: Implement exact segment and payload parsers**

Insert before `parseCompatibilitySettings` in `src/features/storage/compatibility.ts`:

```ts
const SEGMENT_KEYS = ["endMs", "id", "startMs", "text"] as const
const PAYLOAD_KEYS = ["createdAt", "language", "mode", "modelId", "segments", "sourceName", "text", "title"] as const

function normalizeSegmentText(value: string): string {
  let result = ""
  let pendingSpace = false
  for (const scalar of value) {
    if (isCanonicalWhitespace(scalar.codePointAt(0)!)) {
      if (result) pendingSpace = true
    } else {
      if (pendingSpace) result += " "
      result += scalar
      pendingSpace = false
    }
  }
  return result
}
function trimCanonicalOuterWhitespace(value: string): string {
  const scalars = [...value]
  let start = 0; let end = scalars.length
  while (start < end && isCanonicalWhitespace(scalars[start].codePointAt(0)!)) start += 1
  while (end > start && isCanonicalWhitespace(scalars[end - 1].codePointAt(0)!)) end -= 1
  return scalars.slice(start, end).join("")
}
function relativeMs(value: unknown, path: string): CompatibilityResult<number> {
  if (typeof value !== "number") return fail("compatibility.invalid-shape", path)
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_RELATIVE_MS ? ok(value) : fail("compatibility.out-of-bounds", path)
}
function parseSegment(value: unknown, path: string): CompatibilityResult<RollbackV2Segment> {
  if (!isPlainObject(value) || !hasExactKeys(value, SEGMENT_KEYS)) return fail("compatibility.invalid-shape", path)
  const id = boundedString(value.id, `${path}.id`, 1, 255, 1024, true); if (!id.ok) return id
  const startMs = relativeMs(value.startMs, `${path}.startMs`); if (!startMs.ok) return startMs
  const endMs = relativeMs(value.endMs, `${path}.endMs`); if (!endMs.ok) return endMs
  if (endMs.value < startMs.value) return fail("compatibility.invalid-lineage", `${path}.endMs`)
  if (typeof value.text !== "string") return fail("compatibility.invalid-shape", `${path}.text`)
  if (!isScalarString(value.text)) return fail("compatibility.invalid-scalar", `${path}.text`)
  if (normalizeSegmentText(value.text) !== value.text) return fail("compatibility.invalid-derived-text", `${path}.text`)
  if (byteLength(value.text) > 1024 * 1024) return fail("compatibility.out-of-bounds", `${path}.text`)
  return ok({ id: id.value, startMs: startMs.value, endMs: endMs.value, text: value.text })
}
export function parseRollbackV2Segment(value: unknown): CompatibilityResult<RollbackV2Segment> { return parseSegment(value, "$") }

function parsePayload(value: unknown, path: string): CompatibilityResult<RollbackV2Payload> {
  if (!isPlainObject(value) || !hasExactKeys(value, PAYLOAD_KEYS)) return fail("compatibility.invalid-shape", path)
  const title = boundedString(value.title, `${path}.title`, 1, 512, 2048, true); if (!title.ok) return title
  if (trimCanonicalOuterWhitespace(title.value) !== title.value) return fail("compatibility.invalid-scalar", `${path}.title`)
  const sourceName = boundedString(value.sourceName, `${path}.sourceName`, 0, 2048, 8192, false); if (!sourceName.ok) return sourceName
  const language = boundedString(value.language, `${path}.language`, 1, 128, 512, true); if (!language.ok) return language
  const modelId = boundedString(value.modelId, `${path}.modelId`, 1, 128, 512, true); if (!modelId.ok) return modelId
  if (typeof value.mode !== "string") return fail("compatibility.invalid-shape", `${path}.mode`)
  if (!isScalarString(value.mode) || !MODES.includes(value.mode as ProcessingMode)) return fail("compatibility.invalid-scalar", `${path}.mode`)
  const createdAt = parseCompatibilityEpochMs(value.createdAt); if (!createdAt.ok) return fail(createdAt.error, `${path}.createdAt`)
  if (typeof value.text !== "string") return fail("compatibility.invalid-shape", `${path}.text`)
  if (!isScalarString(value.text)) return fail("compatibility.invalid-scalar", `${path}.text`)
  if (byteLength(value.text) > 16 * 1024 * 1024) return fail("compatibility.out-of-bounds", `${path}.text`)
  if (!Array.isArray(value.segments)) return fail("compatibility.invalid-shape", `${path}.segments`)
  if (value.segments.length < 1 || value.segments.length > 100000) return fail("compatibility.out-of-bounds", `${path}.segments`)
  const segments: RollbackV2Segment[] = []; const ids = new Set<string>(); let previousEnd = 0
  for (let index = 0; index < value.segments.length; index += 1) {
    const segment = parseSegment(value.segments[index], `${path}.segments[${index}]`); if (!segment.ok) return segment
    if (ids.has(segment.value.id) || (index > 0 && segment.value.startMs < previousEnd)) return fail("compatibility.invalid-lineage", `${path}.segments[${index}]`)
    ids.add(segment.value.id); previousEnd = segment.value.endMs; segments.push(segment.value)
  }
  const derived = segments.map((segment) => segment.text).filter(Boolean).join(" ")
  if (byteLength(derived) > 16 * 1024 * 1024) return fail("compatibility.out-of-bounds", `${path}.text`)
  if (value.text !== derived) return fail("compatibility.invalid-derived-text", `${path}.text`)
  return ok({ title: title.value, sourceName: sourceName.value, language: language.value, modelId: modelId.value, mode: value.mode as ProcessingMode, createdAt: createdAt.value, text: derived, segments })
}
export function parseRollbackV2Payload(value: unknown): CompatibilityResult<RollbackV2Payload> { return parsePayload(value, "$") }
```

Run: `pnpm vitest run tests/unit/compatibility.test.ts`.

Expected: 8 passed. Exact own keys, scalar preconditions, pinned whitespace, byte/scalar caps, unique IDs, timing order, and derived text all pass.

- [ ] **Step 5: Add failing envelope, projection, and failure-path conformance rows**

Extend the compatibility import with `parseRollbackV2Envelope`, `projectRollbackEnvelope`, and type-only `CompatibilityResult`, `RollbackV2Envelope`, `Version2SchemaDescription`. Append inside the existing `describe`:

```ts
  it("keeps the exact public result and schema-description types", () => {
    const result: CompatibilityResult<Version2SchemaDescription> = {
      ok: false, error: "compatibility.invalid-schema", path: "$.stores",
    }
    expect(result.ok).toBe(false)
  })

  it("parses ordinary live, restored live, and compact tombstone envelopes", () => {
    const transcript = {
      title: "Sample transcript", sourceName: "sample.wav", language: "en",
      modelId: "Xenova/whisper-base", mode: "local-webgpu" as const, createdAt: 1785283200000,
      text: "Hello world.", segments: [{ id: "seg_001", startMs: 0, endMs: 1250, text: "Hello world." }],
    }
    const live: RollbackV2Envelope = {
      schemaVersion: 2, transcriptId: "tr_sample_001", revision: 3, updatedAt: 1785283201000,
      deletedAt: null, deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA", deletionId: null,
      restoredFromDeletionId: null, transcript,
    }
    expect(parseRollbackV2Envelope(live)).toEqual({ ok: true, value: live })
    expect(parseRollbackV2Envelope({ ...live, restoredFromDeletionId: "x_AAAAAAAAAAAAAAAAAAAAAA" })).toMatchObject({ ok: true })
    expect(parseRollbackV2Envelope({ ...live, revision: Number.MAX_SAFE_INTEGER })).toMatchObject({ ok: true })
    const tombstone = {
      ...live, revision: 4, updatedAt: 1785283202000, deletedAt: 1785283202000,
      deletionId: "x_AAAAAAAAAAAAAAAAAAAAAA", transcript: null,
    }
    expect(parseRollbackV2Envelope(tombstone)).toEqual({ ok: true, value: tombstone })
    expect(parseRollbackV2Envelope({ ...live, schemaVersion: 1 })).toMatchObject({ ok: false, error: "compatibility.out-of-bounds", path: "$.schemaVersion" })
    expect(parseRollbackV2Envelope({ ...live, transcriptId: "\ud800" })).toMatchObject({ ok: false, error: "compatibility.invalid-scalar" })
    expect(parseRollbackV2Envelope({ ...live, deletedAt: 1785283202000 })).toMatchObject({ ok: false, error: "compatibility.invalid-lineage" })
    expect(parseRollbackV2Envelope({ ...tombstone, restoredFromDeletionId: "x_AAAAAAAAAAAAAAAAAAAAAA" })).toMatchObject({ ok: false, error: "compatibility.invalid-lineage" })
    expect(parseRollbackV2Envelope({ ...live, unknown: true })).toMatchObject({ ok: false, error: "compatibility.invalid-shape" })
  })

  it("projects live data exactly and omits tombstones", () => {
    const live = parseRollbackV2Envelope({
      schemaVersion: 2, transcriptId: "tr_sample_001", revision: 3, updatedAt: 1785283201000,
      deletedAt: null, deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA", deletionId: null,
      restoredFromDeletionId: null,
      transcript: {
        title: "Sample transcript", sourceName: "sample.wav", language: "en",
        modelId: "Xenova/whisper-base", mode: "local-webgpu", createdAt: 1785283200000,
        text: "Hello world.", segments: [{ id: "seg_001", startMs: 0, endMs: 1250, text: "Hello world." }],
      },
    })
    if (!live.ok) throw new Error(live.error)
    expect(projectRollbackEnvelope(live.value)).toEqual({ ok: true, value: {
      id: "tr_sample_001", title: "Sample transcript", sourceName: "sample.wav", language: "en",
      modelId: "Xenova/whisper-base", mode: "local-webgpu", createdAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:01.000Z", text: "Hello world.",
      segments: [{ id: "seg_001", start: 0, end: 1.25, text: "Hello world." }],
    } })
    expect(projectRollbackEnvelope({ ...live.value, revision: 4, deletedAt: 1785283202000, deletionId: "x_AAAAAAAAAAAAAAAAAAAAAA", restoredFromDeletionId: null, transcript: null })).toEqual({ ok: true, value: null })
  })
```

Run: `pnpm vitest run tests/unit/compatibility.test.ts`.

Expected: FAIL because the envelope parser and projector are absent.

- [ ] **Step 6: Implement exact envelope parsing and checked legacy projection**

Insert before `parseCompatibilitySettings` in `src/features/storage/compatibility.ts`:

```ts
const ENVELOPE_KEYS = ["deletedAt", "deletionId", "deviceId", "restoredFromDeletionId", "revision", "schemaVersion", "transcript", "transcriptId", "updatedAt"] as const

export function parseRollbackV2Envelope(value: unknown): CompatibilityResult<RollbackV2Envelope> {
  if (!isPlainObject(value) || !hasExactKeys(value, ENVELOPE_KEYS)) return fail("compatibility.invalid-shape", "$")
  if (typeof value.schemaVersion !== "number") return fail("compatibility.invalid-shape", "$.schemaVersion")
  if (!Number.isSafeInteger(value.schemaVersion) || value.schemaVersion !== 2) return fail("compatibility.out-of-bounds", "$.schemaVersion")
  const transcriptId = boundedString(value.transcriptId, "$.transcriptId", 1, 512, 512, true); if (!transcriptId.ok) return transcriptId
  if (typeof value.revision !== "number") return fail("compatibility.invalid-shape", "$.revision")
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) return fail("compatibility.out-of-bounds", "$.revision")
  const updatedAt = parseCompatibilityEpochMs(value.updatedAt); if (!updatedAt.ok) return fail(updatedAt.error, "$.updatedAt")
  const deviceId = canonicalId(value.deviceId, "d_", "$.deviceId"); if (!deviceId.ok) return deviceId
  const deletedAt = value.deletedAt === null ? ok<number | null>(null) : parseCompatibilityEpochMs(value.deletedAt)
  if (!deletedAt.ok) return fail(deletedAt.error, "$.deletedAt")
  const deletionId = value.deletionId === null ? ok<string | null>(null) : canonicalId(value.deletionId, "x_", "$.deletionId")
  if (!deletionId.ok) return deletionId
  const restored = value.restoredFromDeletionId === null ? ok<string | null>(null) : canonicalId(value.restoredFromDeletionId, "x_", "$.restoredFromDeletionId")
  if (!restored.ok) return restored
  const transcript = value.transcript === null ? ok<RollbackV2Payload | null>(null) : parsePayload(value.transcript, "$.transcript")
  if (!transcript.ok) return transcript
  const tombstone = deletedAt.value !== null && deletionId.value !== null && restored.value === null && transcript.value === null
  const live = deletedAt.value === null && deletionId.value === null && transcript.value !== null
  if (!tombstone && !live) return fail("compatibility.invalid-lineage", "$")
  return ok({ schemaVersion: 2, transcriptId: transcriptId.value, revision: value.revision, updatedAt: updatedAt.value, deletedAt: deletedAt.value, deviceId: deviceId.value, deletionId: deletionId.value, restoredFromDeletionId: restored.value, transcript: transcript.value })
}

export function projectRollbackEnvelope(envelope: RollbackV2Envelope): CompatibilityResult<TranscriptDocument | null> {
  const parsed = parseRollbackV2Envelope(envelope)
  if (!parsed.ok) return parsed
  if (parsed.value.transcript === null) return ok(null)
  const segments: TranscriptDocument["segments"] = []
  for (let index = 0; index < parsed.value.transcript.segments.length; index += 1) {
    const segment = parsed.value.transcript.segments[index]
    const start = compatibilityMsToLegacySeconds(segment.startMs)
    if (!start.ok) return fail(start.error, `$.transcript.segments[${index}].startMs`)
    const end = compatibilityMsToLegacySeconds(segment.endMs)
    if (!end.ok) return fail(end.error, `$.transcript.segments[${index}].endMs`)
    segments.push({ id: segment.id, start: start.value, end: end.value, text: segment.text })
  }
  const text = parsed.value.transcript.segments.map((segment) => segment.text).filter(Boolean).join(" ")
  return ok({
    id: parsed.value.transcriptId, title: parsed.value.transcript.title,
    sourceName: parsed.value.transcript.sourceName, language: parsed.value.transcript.language,
    modelId: parsed.value.transcript.modelId, mode: parsed.value.transcript.mode,
    createdAt: new Date(parsed.value.transcript.createdAt).toISOString(),
    updatedAt: new Date(parsed.value.updatedAt).toISOString(), text, segments,
  })
}
```

Run:

```bash
pnpm vitest run tests/unit/compatibility.test.ts
pnpm typecheck
```

Expected: COMPAT-01 reports 11 passed; typecheck exits 0. Every exact master Section 5.3A export now exists. No test or implementation imports a Slice 1B canonical module.

- [ ] **Step 7: Prove the permanent parser is non-mutating and complete**

Run:

```bash
pnpm vitest run tests/unit/compatibility.test.ts tests/unit/database.test.ts
```

Expected: both files pass. `compatibility.test.ts` covers exact schema description, `CompatibilityFailureCode`/`CompatibilityResult`, all three rollback types/parsers, device/deletion IDs, epoch/ISO parsing, both checked conversions, projection, and settings. Database snapshots before and after inspection match; no v2 open, store creation, repair, hash, migration, or persistence occurs in `compatibility.ts`.

- [ ] **Step 8: Bridge the current storage API to supported versions**

In `src/features/storage/indexed-db.ts`, replace imports/constants/getDb with:

```ts
import { DEFAULT_SETTINGS } from "@/features/transcription/models"
import type { AppSettings, TranscriptDocument } from "@/features/transcription/types"
import {
  inspectVersion2Schema,
  legacySecondsToCompatibilityMs,
  parseCompatibilityLegacyIso,
  parseCompatibilitySettings,
  parseRollbackV2Envelope,
  projectRollbackEnvelope,
  type CompatibilityResult,
} from "@/features/storage/compatibility"
import { openCompatibleDatabase } from "@/features/storage/database"

const SETTINGS_KEY = "settings"

export type StorageCompatibilityErrorCode =
  | "storage.unsupported-version"
  | "storage.malformed-v2"
  | "storage.incomplete-v2"
  | "storage.revision-exhausted"
  | "storage.time-conversion"

export class StorageCompatibilityError extends Error {
  readonly code: StorageCompatibilityErrorCode
  readonly foundVersion: number | null

  constructor(code: StorageCompatibilityErrorCode, foundVersion: number | null = null) {
    super(code)
    this.name = "StorageCompatibilityError"
    this.code = code
    this.foundVersion = foundVersion
  }
}

async function getDb() {
  const result = await openCompatibleDatabase()
  if (result.status === "unsupported") {
    throw new StorageCompatibilityError("storage.unsupported-version", result.foundVersion)
  }
  return result
}

function unwrapCompatibility<T>(result: CompatibilityResult<T>): T {
  if (result.ok) return result.value
  const code: StorageCompatibilityErrorCode =
    result.error === "compatibility.invalid-schema"
      ? "storage.incomplete-v2"
      : result.error === "compatibility.time-conversion"
        ? "storage.time-conversion"
        : "storage.malformed-v2"
  throw new StorageCompatibilityError(code)
}

async function requireVersion2Schema(db: Awaited<ReturnType<typeof getDb>>["db"]) {
  return unwrapCompatibility(await inspectVersion2Schema(db))
}
```

Keep the master Section 5.4 public signatures exactly. Every public call first branches on the `version` returned by `getDb()`. Every v2 branch calls `requireVersion2Schema(result.db)` before reading or opening a write transaction. `loadSettings` passes the stored value and `DEFAULT_SETTINGS` to `parseCompatibilitySettings`. `listTranscripts` passes every row to `parseRollbackV2Envelope`, then passes every accepted envelope to `projectRollbackEnvelope`; it filters only successful `null` tombstone projections. Save/rename/delete/clear pass each observed row and each complete candidate envelope through `parseRollbackV2Envelope` before mutation. Legacy ISO fields call `parseCompatibilityLegacyIso`; legacy segment seconds call `legacySecondsToCompatibilityMs`. All calls unwrap through `unwrapCompatibility`, close the database when it throws, and refuse the whole operation. No v2 branch may duplicate schema, scalar, lineage, derived-text, or checked-time validation inside `indexed-db.ts`.

V1 behavior remains exact. V2 list parses each complete envelope, omits tombstones, rederives text, and projects exact legacy seconds only when `Math.round(seconds * 1000)` round-trips to the stored safe integer. V2 save validates the complete input before opening its transaction, enforces the checked seven-day bound without clamping, writes revision `0` for a new ID, increments a valid existing revision with overflow refusal, preserves device/restore lineage, and explicitly restores an observed tombstone. Rename preserves identity, creation metadata, segments, device, and restore lineage. Delete writes one compact tombstone with a pre-generated canonical `x_` deletion ID; clear validates all live rows and pre-generates one unique deletion ID per row before one atomic transaction. Slice 1A enqueues no Drive operation and creates no v2 store or metadata.

- [ ] **Step 9: Write the complete compatibility-adapter red matrix**

Create `tests/unit/indexed-db-compat.test.ts`. Use the normative master live envelope and exact v2 stores/indexes. Call only `loadSettings`, `saveSettings`, `listTranscripts`, `saveTranscript`, `renameTranscript`, `deleteTranscript`, and `clearTranscripts`. Assert:

1. Fresh/v1 preserve exact legacy read, save, rename, physical delete, clear, and updated-desc ordering.
2. Real v2 list returns the normative canonical row; opening data through the returned `TranscriptDocument` preserves `text` and exact millisecond round-trip.
3. V2 rename increments revision and changes only title/updatedAt/rederived text fields allowed by master.
4. V2 `saveTranscript` creates a second canonical live envelope with revision `0`, existing `meta/deviceId`, null lineage, and no pending operation.
5. V2 delete writes a parser-valid tombstone with revision `+1`, `updatedAt === deletedAt`, preserved device ID, null transcript/restore lineage, and the injected deletion ID. Reopen versionlessly; list omits the tombstone and retains the new live transcript.
6. V2 clear is all-or-nothing and leaves existing tombstones unchanged.
7. Missing/extra required schema, wrong key path/indexes, malformed device ID, malformed row, exhausted revision, and failed time conversion close/refuse the complete mutation with the exact `StorageCompatibilityError.code`; snapshots of every store remain byte-for-byte unchanged.
8. Unsupported `3` and `17` close/refuse every public call. Instrument `openDB` and `indexedDB.open`; assert Slice 1A calls `openDB(WHISDOM_DB_NAME, undefined, callbacks)` exactly, native open receives no numeric version, fresh creation still runs the upgrade callback and remains version 1, and every v1/v2 schema snapshot is unchanged by open/reopen.
9. Settings compatibility is tested across both exact key sets: a pre-Phase-2 eight-key record loads with `explicitModelId` projected to `null`; a later nine-key record with `explicitModelId: "onnx-community/whisper-small"` loads without rejection; malformed, empty, lone-surrogate, and unknown `explicitModelId` values fail closed, while missing `explicitModelId` is accepted only as the complete legacy eight-key shape. Missing any other required key fails closed. On a v2 database, call the rollback-floor `saveSettings` with the old eight-field shape and assert the stored nine-key record retains the original `explicitModelId` byte-for-byte while the requested legacy fields change. On a v1 database, assert the original eight-key read/write/delete/clear behavior remains unchanged.

Run: `pnpm vitest run tests/unit/compatibility.test.ts tests/unit/database.test.ts tests/unit/indexed-db-compat.test.ts`.

Expected: FAIL until the complete adapter exists; then all rows pass with no `VersionError`, numeric v2 open, partial mutation, or `pendingOperations` write.

- [ ] **Step 10: Verify MIG-01 unit green and storage adjacency**

Run:

```bash
pnpm vitest run tests/unit/database.test.ts tests/unit/indexed-db-compat.test.ts
pnpm vitest run tests/unit/compatibility.test.ts
pnpm vitest run tests/unit/storage-cleanup.test.ts tests/unit/exports.test.ts
```

Expected: all opener and compatibility-adapter cases pass; adjacent files pass.

- [ ] **Step 11: Create reusable browser database fixture**

Create `tests/e2e/fixtures/database.ts`:

```ts
import type { Page } from "@playwright/test"

export type Mig01Fixture = "fresh" | "v1" | "v2" | "unsupported-v3"

declare global {
  interface Window {
    __WHISDOM_STORAGE_COMPATIBILITY__: {
      loadSettings: typeof import("../../../src/features/storage/indexed-db").loadSettings
      saveSettings: typeof import("../../../src/features/storage/indexed-db").saveSettings
      saveTranscript: typeof import("../../../src/features/storage/indexed-db").saveTranscript
      deleteTranscript: typeof import("../../../src/features/storage/indexed-db").deleteTranscript
      clearTranscripts: typeof import("../../../src/features/storage/indexed-db").clearTranscripts
      renameTranscript: typeof import("../../../src/features/storage/indexed-db").renameTranscript
      listTranscripts: typeof import("../../../src/features/storage/indexed-db").listTranscripts
    }
  }
}

const LEGACY_SETTINGS = {
  uiLanguage: "en", modelId: "onnx-community/whisper-base", language: "auto",
  mode: "local-webgpu", chunkSeconds: 30, overlapSeconds: 1,
  persistMediaBlobs: false, serverModelId: null,
}

const LATER_V2_SETTINGS = {
  ...LEGACY_SETTINGS,
  explicitModelId: "onnx-community/whisper-small",
}

const LEGACY_ROWS = [
  {
    id: "legacy-1", title: "Legacy transcript", sourceName: "legacy.wav",
    language: "en", modelId: "onnx-community/whisper-base", mode: "local-webgpu",
    createdAt: "2026-07-29T12:00:00.000Z", updatedAt: "2026-07-29T12:00:01.000Z",
    text: "Legacy text", segments: [{ id: "legacy-seg-1", start: 0, end: 1.25, text: "Legacy text" }],
  },
  {
    id: "legacy-survivor", title: "Legacy survivor", sourceName: "survivor.wav",
    language: "en", modelId: "onnx-community/whisper-base", mode: "local-webgpu",
    createdAt: "2026-07-29T11:00:00.000Z", updatedAt: "2026-07-29T11:00:01.000Z",
    text: "Surviving legacy text", segments: [{ id: "legacy-seg-2", start: 0, end: 1, text: "Surviving legacy text" }],
  },
]

const V2_ROWS = [
  {
    schemaVersion: 2, transcriptId: "tr_sample_001", revision: 3,
    updatedAt: 1785283201000, deletedAt: null,
    deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA", deletionId: null, restoredFromDeletionId: null,
    transcript: {
      title: "Sample transcript", sourceName: "sample.wav", language: "en",
      modelId: "Xenova/whisper-base", mode: "local-webgpu", createdAt: 1785283200000,
      text: "Hello world.",
      segments: [{ id: "seg_001", startMs: 0, endMs: 1250, text: "Hello world." }],
    },
  },
  {
    schemaVersion: 2, transcriptId: "tr_survivor_002", revision: 0,
    updatedAt: 1785283101000, deletedAt: null,
    deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA", deletionId: null, restoredFromDeletionId: null,
    transcript: {
      title: "Canonical survivor", sourceName: "survivor.wav", language: "en",
      modelId: "Xenova/whisper-base", mode: "local-webgpu", createdAt: 1785283100000,
      text: "Canonical survivor text.",
      segments: [{ id: "seg_002", startMs: 0, endMs: 1000, text: "Canonical survivor text." }],
    },
  },
]

export interface BrowserDatabaseSnapshot {
  version: number
  stores: string[]
  indexes: Record<string, string[]>
  settings: unknown
  transcripts: Array<Record<string, unknown>>
  pendingOperations: Array<Record<string, unknown>>
}

export async function seedMig01Fixture(page: Page, fixture: Mig01Fixture) {
  await page.goto("/favicon.svg")
  await page.evaluate(async ({ fixture, legacySettings, laterSettings, legacyRows, v2Rows }) => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase("whisdom")
      deletion.onsuccess = () => resolve()
      deletion.onerror = () => reject(deletion.error)
      deletion.onblocked = () => reject(new Error("fixture database deletion blocked"))
    })
    if (fixture === "fresh") return
    const targetVersion = fixture === "v1" ? 1 : fixture === "v2" ? 2 : 3
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("whisdom", targetVersion)
      request.onupgradeneeded = () => {
        const db = request.result
        const transaction = request.transaction!
        if (fixture === "v1" || fixture === "unsupported-v3") {
          const settingsStore = db.createObjectStore("settings")
          const transcriptStore = db.createObjectStore("transcripts", { keyPath: "id" })
          settingsStore.put(fixture === "unsupported-v3" ? { sentinel: "settings-v3" } : legacySettings, "settings")
          for (const row of fixture === "unsupported-v3" ? [{ ...legacyRows[0], id: "unsupported-sentinel", title: "Do not mutate" }] : legacyRows) transcriptStore.put(row)
          return
        }
        const settingsStore = db.createObjectStore("settings")
        const transcripts = db.createObjectStore("transcripts", { keyPath: "transcriptId" })
        transcripts.createIndex("by-deletedAt", "deletedAt")
        transcripts.createIndex("by-updatedAt", "updatedAt")
        const quarantine = db.createObjectStore("migrationQuarantine", { keyPath: "quarantineId" })
        quarantine.createIndex("by-originalV1Key", "originalV1Key")
        quarantine.createIndex("by-reasonCode", "reasonCode")
        db.createObjectStore("drafts", { keyPath: "transcriptId" })
        const conflicts = db.createObjectStore("conflictCandidates", { keyPath: "candidateId" })
        conflicts.createIndex("by-receivedAt", "receivedAt")
        conflicts.createIndex("by-transcriptId", "transcriptId")
        const metadata = db.createObjectStore("syncMetadata", { keyPath: ["accountKey", "transcriptId"] })
        metadata.createIndex("by-accountKey", "accountKey")
        metadata.createIndex("by-transcriptId", "transcriptId")
        const pending = db.createObjectStore("pendingOperations", { keyPath: ["accountKey", "transcriptId"] })
        pending.createIndex("by-accountKey", "accountKey")
        pending.createIndex("by-nextAttemptAt", "nextAttemptAt")
        pending.createIndex("by-transcriptId", "transcriptId")
        db.createObjectStore("syncState", { keyPath: "accountKey" })
        const meta = db.createObjectStore("meta")
        settingsStore.put(laterSettings, "settings")
        meta.put("d_AAAAAAAAAAAAAAAAAAAAAA", "deviceId")
        for (const row of v2Rows) transcripts.put(row)
        void transaction
      }
      request.onsuccess = () => { request.result.close(); resolve() }
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error("fixture database open blocked"))
    })
  }, { fixture, legacySettings: LEGACY_SETTINGS, laterSettings: LATER_V2_SETTINGS, legacyRows: LEGACY_ROWS, v2Rows: V2_ROWS })
}

export async function readDatabaseSnapshot(page: Page): Promise<BrowserDatabaseSnapshot> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("whisdom")
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const stores = Array.from(db.objectStoreNames).sort()
      const transaction = db.transaction(stores, "readonly")
      const indexes = Object.fromEntries(stores.map((name) => [name, Array.from(transaction.objectStore(name).indexNames).sort()]))
      const readAll = (name: string) => stores.includes(name)
        ? new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
            const request = transaction.objectStore(name).getAll()
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })
        : Promise.resolve([])
      const readSettings = stores.includes("settings")
        ? new Promise<unknown>((resolve, reject) => {
            const request = transaction.objectStore("settings").get("settings")
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })
        : Promise.resolve(undefined)
      const [settings, transcripts, pendingOperations] = await Promise.all([
        readSettings, readAll("transcripts"), readAll("pendingOperations"),
      ])
      return { version: db.version, stores, indexes, settings, transcripts, pendingOperations }
    } finally {
      db.close()
    }
  })
}
```

Fixture navigation uses a same-origin static asset so no application code opens the database before seeding. No fixture imports production conversion logic or mutates the database after product navigation begins.

Do not stage the fixture until Task 6 adds its consuming E2E test.

### Task 6: Localize compatibility failures and prove complete browser/deployed MIG-01 behavior

**Files:**
- Create from Task 4, staged here: `src/features/storage/database.ts`
- Create from Task 5, staged here: `src/features/storage/compatibility.ts`
- Create: `src/features/storage/compatibility-api.ts`
- Modify across Tasks 4–6: `src/features/storage/indexed-db.ts:1-end`
- Modify: `src/App.tsx:81-112, 599-646, 1342-1610`
- Modify: `playwright.config.ts:1-25`
- Create from Task 4, staged here: `tests/unit/database.test.ts`
- Create from Task 5, staged here: `tests/unit/compatibility.test.ts`
- Create: `tests/unit/indexed-db-compat.test.ts`
- Create from Task 4, staged here: `tests/e2e/fixtures/database.ts`
- Create: `tests/e2e/migration.spec.ts`

This is the exact 11-path aggregate manifest for the Slice 1A commit. Tasks 4 and 5 deliberately defer staging and commit to this task; Step 4 stages no path outside this manifest.

- [ ] **Step 1: Write failing MIG-01 browser cases**

Slice 1A adds `data-testid="compatibility-product-ready"` to one visible, copy-independent product-readiness container on the usable legacy surface. Slice 1B's interim `LegacyProduct` and final `WorkbenchPage` preserve that exact marker. MIG-01 never selects the legacy `Drop audio or video` heading, so its fresh/v1/v2 cases run unchanged against Slice 1A and the final candidate.

Create `tests/e2e/migration.spec.ts` with these complete observable actions:

```ts
import { expect, test, type Page } from "@playwright/test"
import { readDatabaseSnapshot, seedMig01Fixture } from "./fixtures/database"

async function readAndAssert(page: Page, title: string, text: string) {
  const record = await page.evaluate(async (expectedTitle) => {
    const rows = await window.__WHISDOM_STORAGE_COMPATIBILITY__.listTranscripts()
    return rows.find((row) => row.title === expectedTitle) ?? null
  }, title)
  expect(record).toMatchObject({ title, text })
}

test.describe("Phase 1 migration gates", () => {
  for (const fixture of ["fresh", "v1", "v2"] as const) {
    test(`MIG-01 ${fixture} public adapter and product CRUD survive reopen`, async ({ page }) => {
      const browserErrors: string[] = []
      page.on("pageerror", (error) => browserErrors.push(`${error.name}: ${error.message}`))
      page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()) })
      await seedMig01Fixture(page, fixture)
      await page.goto("/")
      await expect(page.getByTestId("compatibility-product-ready")).toBeVisible()
      await expect(page.getByRole("button", { name: "Choose file" })).toBeEnabled()

      if (fixture === "v1" || fixture === "v2") {
        const title = fixture === "v2" ? "Sample transcript" : "Legacy transcript"
        await readAndAssert(page, title, fixture === "v2" ? "Hello world." : "Legacy text")
        await page.evaluate(async ({ title: oldTitle }) => {
          const row = (await window.__WHISDOM_STORAGE_COMPATIBILITY__.listTranscripts()).find((item) => item.title === oldTitle)
          if (!row) throw new Error("MIG-01 source row missing")
          await window.__WHISDOM_STORAGE_COMPATIBILITY__.renameTranscript(row.id, "MIG-01 renamed")
        }, { title })
      }

      await page.evaluate(async () => await window.__WHISDOM_STORAGE_COMPATIBILITY__.saveTranscript({
           id: "mig01-new", title: "MIG-01 new", sourceName: "new.wav",
           language: "en", modelId: "onnx-community/whisper-base", mode: "local-webgpu",
           createdAt: "2026-07-29T12:00:00.000Z", updatedAt: "2026-07-29T12:00:00.000Z",
           text: "New transcript", segments: [{ id: "seg-new", start: 0, end: 1.25, text: "New transcript" }],
      }))
       await page.reload()
       await readAndAssert(page, "MIG-01 new", "New transcript")
       await page.evaluate(async () => {
         const api = window.__WHISDOM_STORAGE_COMPATIBILITY__
         const row = (await api.listTranscripts()).find((item) => item.title === "MIG-01 new")
         if (!row) throw new Error("MIG-01 new row missing")
         const renamed = await api.renameTranscript(row.id, "MIG-01 saved and renamed")
         if (!renamed) throw new Error("MIG-01 rename returned no row")
         await api.deleteTranscript(row.id)
       })
       await page.reload()
       await expect(page.getByTestId("compatibility-product-ready")).toBeVisible()

      const beforeReopen = await readDatabaseSnapshot(page)
      await page.reload()
      await expect(page.getByTestId("compatibility-product-ready")).toBeVisible()
      const after = await readDatabaseSnapshot(page)
      expect(after.version).toBe(fixture === "v2" ? 2 : 1)
      expect(after.stores).toEqual(beforeReopen.stores)
      expect(after.indexes).toEqual(beforeReopen.indexes)
      if (fixture === "v2") {
        expect(after.transcripts.find((row) => row.transcriptId === "mig01-new")).toMatchObject({
          revision: 1, transcript: null, restoredFromDeletionId: null,
        })
        expect(after.pendingOperations).toEqual([])
      } else {
        expect(after.transcripts.some((row) => row.id === "mig01-new")).toBe(false)
      }
      expect(browserErrors.filter((message) => /VersionError/i.test(message))).toEqual([])
    })
  }

  test("MIG-01 unsupported >2 closes, localizes, refuses every public mutation, and preserves schema", async ({ page }) => {
    const browserErrors: string[] = []
    page.on("pageerror", (error) => browserErrors.push(`${error.name}: ${error.message}`))
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()) })
    await seedMig01Fixture(page, "unsupported-v3")
    const before = await readDatabaseSnapshot(page)
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Unsupported data version" })).toBeVisible()
    await page.getByRole("button", { name: "Tiếng Việt" }).click()
    await expect(page.getByRole("heading", { name: "Phiên bản dữ liệu không được hỗ trợ" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Choose file" })).toHaveCount(0)
    const inspectDetails = page.getByRole("button", { name: "Xem chi tiết" })
    await expect(inspectDetails).toBeVisible()
    await inspectDetails.click()
    await expect(page.getByRole("dialog", { name: "Phiên bản dữ liệu không được hỗ trợ" })).toBeVisible()
    await expect(page.getByRole("dialog")).toContainText("storage.unsupported-version")
    const mutation = await page.evaluate(async () => {
      const api = window.__WHISDOM_STORAGE_COMPATIBILITY__
      const calls = [
        () => api.loadSettings(),
        () => api.listTranscripts(),
        () => api.saveSettings({ ...({ sentinel: "attempt" } as never) }),
        () => api.saveTranscript({} as never),
        () => api.renameTranscript("unsupported-sentinel", "attempt"),
        () => api.deleteTranscript("unsupported-sentinel"),
        () => api.clearTranscripts(),
      ]
      const results: string[] = []
      for (const call of calls) {
        try { await call(); results.push("unexpected-success") }
        catch (error) { results.push(error instanceof Error ? error.name : String(error)) }
      }
      return results
    })
    expect(mutation.every((result) => result !== "unexpected-success")).toBe(true)
    await page.reload()
    expect(await readDatabaseSnapshot(page)).toEqual(before)
    expect(browserErrors.filter((message) => /VersionError/i.test(message))).toEqual([])
  })
})
```

The deployed `window.__WHISDOM_STORAGE_COMPATIBILITY__` object is the same seven current public adapter function references, not an alternate implementation or test-only code path. Permanent `src/features/storage/compatibility-api.ts` owns its declaration and unconditional installation. `src/App.tsx` imports that module for side effects before rendering; Slice 1B's `src/main.tsx`/new shell bootstrap imports the same module, and Phase 7 keeps that module/import when replacing `App.tsx`. The deployed smoke therefore exercises the shipped compatibility adapter for save-new while list/open/rename/delete/reopen assertions cross the legacy product surface. Do not add a Vite build flag, tree-shaking exception, or second storage API.

Run locally: `pnpm playwright test tests/e2e/migration.spec.ts --grep MIG-01 --reporter=list`.
Run deployed against the exact Pages URL from the push-triggered existing CI workflow:

```powershell
$deploymentUrl = Read-Host "Deployed HTTPS URL"
$env:WHISDOM_E2E_BASE_URL = $deploymentUrl
try { pnpm playwright test tests/e2e/migration.spec.ts --grep "MIG-01" --reporter=list }
finally { Remove-Item Env:WHISDOM_E2E_BASE_URL -ErrorAction SilentlyContinue }
```

Expected red: FAIL before implementation because the complete adapter, fixture, public bridge, and localized failure state are absent. Expected green: exactly 4 passed locally and against deployment; no `VersionError` console/page error, no numeric-version open, no model/ffmpeg request, and no schema mutation in fresh/v1/v2/unsupported-v3 snapshots.

- [ ] **Step 2: Add permanent compatibility API bootstrap and exact bridge-level unsupported state**

Create `src/features/storage/compatibility-api.ts` with the sole production installation and exact public type:

```ts
import {
  clearTranscripts,
  deleteTranscript,
  listTranscripts,
  loadSettings,
  renameTranscript,
  saveSettings,
  saveTranscript,
} from "@/features/storage/indexed-db"

export interface StorageCompatibilityApi {
  loadSettings: typeof loadSettings
  saveSettings: typeof saveSettings
  saveTranscript: typeof saveTranscript
  deleteTranscript: typeof deleteTranscript
  clearTranscripts: typeof clearTranscripts
  renameTranscript: typeof renameTranscript
  listTranscripts: typeof listTranscripts
}

declare global {
  interface Window {
    __WHISDOM_STORAGE_COMPATIBILITY__: StorageCompatibilityApi
  }
}

export const STORAGE_COMPATIBILITY_API: StorageCompatibilityApi = Object.freeze({
  loadSettings,
  saveSettings,
  saveTranscript,
  deleteTranscript,
  clearTranscripts,
  renameTranscript,
  listTranscripts,
})

window.__WHISDOM_STORAGE_COMPATIBILITY__ = STORAGE_COMPATIBILITY_API
```

Add `import "@/features/storage/compatibility-api"` to Slice 1A `src/App.tsx` before product imports. Do not redeclare the `Window` shape or assign the property in `App.tsx`. Add a focused `tests/unit/indexed-db-compat.test.ts` assertion that imports `compatibility-api.ts`, verifies the frozen object exposes exactly seven own function keys and exact adapter references, then restores the test global. MIG-01 verifies installation after normal bootstrap. This surface exists in the independently deployed Slice 1A artifact so deployed MIG-01 and Phase 7 floor drill invoke the actual shipped adapter.

Import `formatProductError`, `ProductErrorPanel`, `ProductError`, and `StorageCompatibilityError`. Add state beside `errorDialogOpen`:

```ts
const [fatalStorageError, setFatalStorageError] = React.useState<ProductError | null>(null)
```

Replace mount storage calls at `src/App.tsx:639-645` with:

```ts
  React.useEffect(() => {
    async function hydrate() {
      try {
        const [storedSettings, storedHistory] = await Promise.all([loadSettings(), listTranscripts()])
        settingsRef.current = storedSettings
        setSettings(storedSettings)
        setHistory(storedHistory)
      } catch (caught) {
        if (!(caught instanceof StorageCompatibilityError)) throw caught
        setFatalStorageError({
          occurrenceId: createId("storage-version"),
           code: caught.code,
          severity: "error",
          scope: "navigation",
          scopeId: "database",
           params: { foundVersion: caught.foundVersion, maximumVersion: 2 },
          primaryAction: { code: "inspect-details", params: {} },
          secondaryAction: null,
          retryable: false,
          technicalCause: null,
        })
      }
    }
    void hydrate()
    void navigator.storage?.persist?.().catch(() => undefined)
  }, [])
```

Before the normal return, add:

```tsx
  if (fatalStorageError) {
    const fatalStorageCopy = formatProductError(settings.uiLanguage, fatalStorageError)
    return (
      <main className="min-h-svh bg-background px-4 py-16 text-foreground">
        <div className="mx-auto max-w-xl">
          <div className="mb-6 flex gap-2" role="group" aria-label="Interface language">
            <Button variant="outline" onClick={() => setSettings((current) => ({ ...current, uiLanguage: "en" }))}>English</Button>
            <Button variant="outline" onClick={() => setSettings((current) => ({ ...current, uiLanguage: "vi" }))}>Tiếng Việt</Button>
          </div>
          <ProductErrorPanel
            language={settings.uiLanguage}
            error={fatalStorageError}
            onPrimaryAction={() => setErrorDialogOpen(true)}
          />
          <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
            <DialogContent className="max-w-lg border-destructive/30">
              <DialogHeader>
                <DialogTitle>{fatalStorageCopy.title}</DialogTitle>
                <DialogDescription>{fatalStorageCopy.message}</DialogDescription>
              </DialogHeader>
              <div className="max-h-80 overflow-auto rounded-md border bg-muted/30 p-4">
                <pre className="whitespace-pre-wrap break-words font-mono text-sm text-foreground">
                  {JSON.stringify({
                    occurrenceId: fatalStorageError.occurrenceId,
                    code: fatalStorageError.code,
                    params: fatalStorageError.params,
                  }, null, 2)}
                </pre>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">{t.closeResults}</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </main>
    )
  }
```

The fatal state owns this bounded language switch because unsupported/malformed/incomplete databases are closed and cannot be read safely. Supported fixture creation writes the complete current defaults:

```ts
transaction.objectStore("settings").put({
  uiLanguage, modelId: "onnx-community/whisper-base", language: "auto",
  mode: "local-webgpu", chunkSeconds: 30, overlapSeconds: 1,
  persistMediaBlobs: false, serverModelId: null,
}, "settings")
```

The unsupported test starts in English, selects `Tiếng Việt`, asserts the VI title/message and exact localized `Xem chi tiết` action, opens the fatal tree's details dialog, and observes `storage.unsupported-version`. The fatal early return renders both `ProductErrorPanel` and its controlled `Dialog`; it never relies on the normal return's later error dialog. This changes in-memory UI language only and never reopens or mutates the unsupported database.

Modify `playwright.config.ts` without changing any other setting:

```ts
const deployedBaseUrl = process.env.WHISDOM_E2E_BASE_URL?.trim()

export default defineConfig({
  // retain current testDir, timeout, expect, and projects exactly
  use: {
    baseURL: deployedBaseUrl || "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: deployedBaseUrl ? undefined : {
    command: "pnpm build && pnpm preview --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  // retain current projects exactly
})
```

An empty variable preserves built-preview behavior. A non-empty deployed URL starts no local server. No Vite constant or smoke-only build is permitted; deployed and local tests use the same shipped adapter and product bundle.

- [ ] **Step 3: Verify MIG-01 and complete current E2E bridge**

Run:

```bash
pnpm playwright test tests/e2e/migration.spec.ts --grep "MIG-01" --reporter=list
pnpm playwright test tests/e2e/whisdom.spec.ts tests/e2e/server-mode.spec.ts --reporter=list
```

Expected: local MIG-01 reports 4 passed. Each fresh/v1/v2 run proves list/open, rename, shipped-adapter save-new, product delete semantics (v2 tombstone; v1 physical delete), close/reopen, stable schema/version, no pending write, and no `VersionError`. Unsupported-v3 proves localized refusal of every public read/write and byte-for-byte preservation. Existing suites pass. No model/ffmpeg request occurs. Task 8 repeats the same file unchanged against the deployed URL.

- [ ] **Step 4: Stage exact Slice 1A code and commit**

```bash
git add src/features/storage/database.ts src/features/storage/compatibility.ts src/features/storage/compatibility-api.ts src/features/storage/indexed-db.ts src/App.tsx playwright.config.ts tests/unit/database.test.ts tests/unit/compatibility.test.ts tests/unit/indexed-db-compat.test.ts tests/e2e/fixtures/database.ts tests/e2e/migration.spec.ts
git diff --cached --name-only
git diff --cached
git commit -m "fix(storage): open supported database versions"
```

Expected: exactly the 11 paths in this task's aggregate `Files` manifest. Commit body must state: `Open without a requested version so this build remains a safe rollback target after schema 2 exposure.`

### Task 7: Establish permanent rollback-floor record, guard, and operator runbook

**Files:**
- Create: `docs/releases/precision-studio-slice-1a.json`
- Create: `scripts/check-rollback-floor.mjs`
- Create: `docs/runbooks/precision-studio-rollback.md`
- Create: `tests/unit/rollback-floor.test.ts`
- Modify: `package.json:7-17`

- [ ] **Step 1: Write strict checker red tests and package invocation**

Add script:

```json
"release:check-rollback-floor": "node scripts/check-rollback-floor.mjs"
```

Create `tests/unit/rollback-floor.test.ts`. Spawn `node scripts/check-rollback-floor.mjs <args>` in a temporary Git repository and inject an evidence path through the checker module's exported `run({ argv, evidencePath, cwd })` test seam; direct CLI execution always uses `docs/releases/precision-studio-slice-1a.json`. Cover exact closed-key validation and exit codes: equal full SHA and descendant return `0`; pre-floor and divergent full SHA return `1`; awaiting status, missing/unreadable JSON, unknown/missing key, wrong type, abbreviated/uppercase SHA, empty or syntactically invalid GitHub login, noncanonical UTC, non-HTTPS deployed URL, wrong status-specific smoke value, and unavailable Git evidence return `1`; zero or two candidate arguments return `2`. Assert date, branch, tag, status text, network status, and workflow success never substitute for `git merge-base --is-ancestor`.

Run: `pnpm vitest run tests/unit/rollback-floor.test.ts`.

Expected: FAIL because checker implementation and evidence file do not exist.

- [ ] **Step 2: Implement complete ancestry guard**

Create `scripts/check-rollback-floor.mjs`. It accepts exactly one positional full SHA: `pnpm release:check-rollback-floor -- <candidateSha>`. Implement and export `run({ argv, evidencePath, cwd })`; direct execution passes `process.argv.slice(2)`, repository-root `docs/releases/precision-studio-slice-1a.json`, and repository root. Validate plain objects and exact key sets at every level. Use `^[0-9a-f]{40}$`, GitHub-login syntax `^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$`, canonical UTC `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$` plus round-trip, HTTPS URL parsing, and exact status-dependent values from this union. The automated checker validates syntax and evidence consistency only; it cannot prove that an approver is human:

```ts
export type Slice1AReleaseEvidence =
  | {
      schemaVersion: 1; status: "awaiting-deployment"; lowerCommitSha: string
      deploymentUrl: ""; deployedAtUtc: ""; verifiedAtUtc: ""
      approvedBy: string; approvedAtUtc: string
      smoke: { fresh: "pending"; v1: "pending"; v2: "pending"; unsupportedV3: "pending" }
    }
  | {
      schemaVersion: 1; status: "deployed"; lowerCommitSha: string
      deploymentUrl: string; deployedAtUtc: string; verifiedAtUtc: string
      approvedBy: string; approvedAtUtc: string
      smoke: { fresh: "passed"; v1: "passed"; v2: "passed"; unsupportedV3: "passed" }
    }
```

Usage errors print `Usage: pnpm release:check-rollback-floor -- <candidate-full-sha>` and return `2`. Every evidence/Git/ancestry failure prints one bounded reason and returns `1`. Only deployed, valid evidence plus equal/descendant ancestry returns `0`. Call `git merge-base --is-ancestor <lowerCommitSha> <candidate>` with `cwd`; any spawn error/nonzero status is fail-closed. The CLI assigns `process.exitCode = await run(...)`.

- [ ] **Step 3: Create exact awaiting-deployment evidence from observed approval**

After the Foundation+Slice-1A code commit exists, obtain explicit human release approval. Manual release review records an attestation that the named GitHub login belongs to the approving human, the approver reviewed the candidate/evidence, and approval occurred outside automation. Set `$env:SLICE_1A_APPROVER` to that exact GitHub login and `$env:SLICE_1A_APPROVED_AT` from that approval, then generate the exact file—no handwritten/template values. Checker success never substitutes for this manual attestation:

```powershell
$lower = (git rev-parse HEAD).Trim()
$approvedAt = [DateTimeOffset]::ParseExact($env:SLICE_1A_APPROVED_AT, 'yyyy-MM-ddTHH:mm:ss.fffZ', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
if ($lower -notmatch '^[0-9a-f]{40}$') { throw 'lowerCommitSha must be a full lowercase SHA' }
if ($env:SLICE_1A_APPROVER -notmatch '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$') { throw 'approvedBy must be an explicit GitHub login' }
[ordered]@{
  schemaVersion = 1; status = 'awaiting-deployment'; lowerCommitSha = $lower
  deploymentUrl = ''; deployedAtUtc = ''; verifiedAtUtc = ''
  approvedBy = $env:SLICE_1A_APPROVER; approvedAtUtc = $approvedAt
  smoke = [ordered]@{ fresh = 'pending'; v1 = 'pending'; v2 = 'pending'; unsupportedV3 = 'pending' }
} | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 docs/releases/precision-studio-slice-1a.json
```

Run `pnpm release:check-rollback-floor -- $lower`. Expected: exit `1` because awaiting evidence blocks v2 exposure. Run `pnpm vitest run tests/unit/rollback-floor.test.ts`; expected: all checker cases pass.

- [ ] **Step 4: Create exact rollback/roll-forward runbook**

Create `docs/runbooks/precision-studio-rollback.md`:

```md
# Precision Studio rollback floor

After schema 2 exposure, Whisdom may roll back only to the deployed Slice 1A commit recorded in `docs/releases/precision-studio-slice-1a.json` or a descendant. Older builds explicitly request IndexedDB version 1 and can fail against version 2 data.

## Record Slice 1A

1. Obtain explicit human approval. In manual release review, attest that `approvedBy` is the approving human's exact GitHub login, that this person reviewed the candidate/evidence, and that approval occurred outside automation. Commit awaiting evidence, land only Foundation+Slice 1A on `master`, and push. No Slice 1B file or numeric-v2 open may be present; checker success alone is insufficient.
2. Observe the existing `.github/workflows/ci.yml` push-to-`master` CI and Pages deployment. `workflow_dispatch` validates/builds only and does not deploy. Never create or invoke a competing deployment workflow.
3. Run deployed `MIG-01` with `WHISDOM_E2E_BASE_URL`; fresh/v1/v2 must list/open, rename seeded data, save a new transcript through the shipped adapter, delete with v2 tombstone/v1 physical semantics, close/reopen, preserve schema/version, and emit no `VersionError`. Unsupported-v3 must localize, refuse mutation, and remain byte-for-byte unchanged.
4. Preserve Playwright output, exact deployed URL, push-to-master workflow run URL, exact UTC deployment/verification times, all four passing cases, and absence of `VersionError` in release review evidence.
5. Transition only `status`, deployment/verification fields, and smoke values to deployed; keep `lowerCommitSha`, `approvedBy`, and `approvedAtUtc` unchanged.
6. Run `pnpm release:check-rollback-floor -- $lowerCommitSha`; require exit 0. Run the same positional command against every proposed rollback descendant; reject nonzero.

## Roll back

1. Stop rollout and preserve production evidence.
2. Select the recorded floor commit or a descendant.
3. Create a revert/repair commit on `master`; never reset or force-move `master`.
4. Run the guard against that exact descendant SHA and all repository gates.
5. Push the descendant to `master`; observe existing `.github/workflows/ci.yml` CI and Pages jobs. Never use `workflow_dispatch` to deploy and never add a second deployment workflow.
6. Smoke an existing v2 profile through list/open/rename/save/tombstone-delete/reopen; confirm no downgrade request and intact v2 stores.
7. Record target SHA, workflow run URL, deployment URL, UTC time, operator, and smoke result in the release incident record.

Never edit the floor SHA to permit an older target. Roll forward with a fixed descendant instead.
```

- [ ] **Step 5: Verify predeployment rejection and stage tooling**

Run: `pnpm release:check-rollback-floor -- 4098fe355588ae1331a1f574a72a42e022bcfaae`.

Expected: exit 1 because awaiting status fails closed.

```bash
git add package.json docs/releases/precision-studio-slice-1a.json docs/runbooks/precision-studio-rollback.md scripts/check-rollback-floor.mjs tests/unit/rollback-floor.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "chore(release): enforce precision studio rollback floor"
```

Expected: exactly five paths. Commit only during authorized execution. Do not create or modify `.github/workflows/*`.

### Task 8: Slice 1A full gate, deployment, evidence, and mandatory approval stop

**Files:**
- Modify after deployment: `docs/releases/precision-studio-slice-1a.json:1-16`

- [ ] **Step 1: Run the complete predeployment gate**

```bash
pnpm typecheck
rtk lint
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Expected: every command exits 0; both lint commands report zero warnings; Playwright reports all nongated scenarios passed and only documented real-ASR/WebGPU skips. No `.first()` workaround remains.

- [ ] **Step 2: Deploy Slice 1A independently**

Land only the human-approved Foundation+Slice-1A descendant on `master`; no Slice 1B file and no numeric-version-2 IndexedDB open may be present. Push that commit to `master`. Observe the existing `.github/workflows/ci.yml` push-triggered CI and Pages deployment and record its run URL. Do not use `workflow_dispatch` to deploy and do not create, modify, or invoke a competing deployment workflow. Record immutable deployment output: unchanged full `lowerCommitSha`, exact HTTPS production URL, and canonical UTC deployment time.

- [ ] **Step 3: Execute production smoke matrix**

Run the exact deployed command; do not substitute manual landing-page inspection:

```powershell
$deploymentUrl = Read-Host "Deployed HTTPS URL"
$env:WHISDOM_E2E_BASE_URL = $deploymentUrl
try {
  pnpm playwright test tests/e2e/migration.spec.ts --grep "MIG-01" --reporter=list
} finally {
  Remove-Item Env:WHISDOM_E2E_BASE_URL -ErrorAction SilentlyContinue
}
```

Expected: exit 0 and exactly 4 passed. Fresh/v1/v2 each use the shipped adapter plus the legacy product surface to list/open the available canonical/legacy projection, rename, save a new canonical transcript, open it, tombstone-delete it in v2 or physically delete it in v1, close/reload/reopen, and verify surviving data. Every case asserts unchanged store/index topology, unchanged fresh/v1 version 1 or existing v2 version 2, no pending-operation write, no numeric version request, and no page/console `VersionError`. Unsupported-v3 localizes, disables product controls, rejects every public mutation, closes/reopens, and preserves the full schema/content snapshot byte-for-byte. Preserve complete Playwright output and set smoke values to `passed` only from this observed run.

- [ ] **Step 4: Write observed release evidence without template values**

Set `SLICE_1A_URL`, `SLICE_1A_DEPLOYED_AT`, and `SLICE_1A_VERIFIED_AT` from observed Pages and smoke evidence. Load the committed awaiting record; do not replace its immutable `lowerCommitSha`, `approvedBy`, or `approvedAtUtc`. Run:

```powershell
$path = 'docs/releases/precision-studio-slice-1a.json'
$before = Get-Content $path -Raw | ConvertFrom-Json
if ($before.status -ne 'awaiting-deployment') { throw 'release evidence must transition from awaiting-deployment' }
if ($before.lowerCommitSha -notmatch '^[0-9a-f]{40}$') { throw 'lowerCommitSha must remain a full lowercase SHA' }
if ($before.approvedBy -notmatch '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$') { throw 'approvedBy GitHub login must remain unchanged' }
$canonical = 'yyyy-MM-ddTHH:mm:ss.fffZ'
$deployedAt = [DateTimeOffset]::ParseExact($env:SLICE_1A_DEPLOYED_AT, $canonical, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal).ToUniversalTime().ToString($canonical)
$verifiedAt = [DateTimeOffset]::ParseExact($env:SLICE_1A_VERIFIED_AT, $canonical, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal).ToUniversalTime().ToString($canonical)
$url = [Uri]$env:SLICE_1A_URL
if ($url.Scheme -ne 'https' -or -not $url.IsAbsoluteUri) { throw 'SLICE_1A_URL must be absolute HTTPS' }
$record = [ordered]@{
  schemaVersion = 1; status = 'deployed'; lowerCommitSha = $before.lowerCommitSha
  deploymentUrl = $url.AbsoluteUri; deployedAtUtc = $deployedAt; verifiedAtUtc = $verifiedAt
  approvedBy = $before.approvedBy; approvedAtUtc = $before.approvedAtUtc
  smoke = [ordered]@{ fresh = 'passed'; v1 = 'passed'; v2 = 'passed'; unsupportedV3 = 'passed' }
}
$record | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 $path
```

Expected: exact closed deployed schema, no unknown/null/template/invented values, canonical UTC fields, exact HTTPS URL, and unchanged lower SHA/approver/approval time from awaiting evidence.

- [ ] **Step 5: Verify permanent floor behavior**

```bash
$floorSha = (Get-Content docs/releases/precision-studio-slice-1a.json -Raw | ConvertFrom-Json).lowerCommitSha
pnpm release:check-rollback-floor -- $floorSha
pnpm release:check-rollback-floor -- 4098fe355588ae1331a1f574a72a42e022bcfaae
```

Expected: floor target exits 0. Approved-spec/pre-1A target exits 1. Checker tests separately prove descendant 0, divergent 1, malformed/awaiting/Git-unavailable 1, and zero/two-argument usage 2.

- [ ] **Step 6: Commit deployment evidence only after human approval**

```bash
git add docs/releases/precision-studio-slice-1a.json
git diff --cached --name-only
git diff --cached
git commit -m "chore(release): record precision studio rollback floor"
```

Expected: exactly one staged path with complete observed values.

Land this evidence-only descendant on `master` and push `master`. Observe existing `.github/workflows/ci.yml`; do not add another workflow or use `workflow_dispatch` as deployment. Re-read the JSON from `master`, then run:

```powershell
$evidenceSha = (git rev-parse HEAD).Trim()
pnpm release:check-rollback-floor -- $evidenceSha
```

Expected: exit 0 before checkpoint approval.

> **MANDATORY HARD STOP / APPROVAL CHECKPOINT:** Stop execution here. Do not create, stage, merge, push, deploy, or begin any Slice 1B code. Slice 1B remains blocked until the evidence-only deployed record is committed on `master`, all four deployed MIG-01 cases pass with retained output, the guard exits 0 for current full `master` HEAD and rejects `4098fe355588ae1331a1f574a72a42e022bcfaae`, and the recorded human release approver explicitly authorizes v2 exposure after reviewing deployed evidence. Green CI, Pages success, or code-review approval alone does not satisfy this checkpoint.

## Slice 1B — gated transactional migration and shell

### Slice 1B settings handoff — master-compatible projection

Phase 2 must consume the Slice 1A settings contract; it must not redefine or narrow it. Before adding `explicitModelId` to `AppSettings`, Slice 1A's parser accepts both exact persisted shapes: the eight-key pre-Phase-2 record and the nine-key final-product record. After Phase 2 adds `explicitModelId: string | null` and `DEFAULT_SETTINGS.explicitModelId = null`, its `loadSettings` path continues to call `parseCompatibilitySettings` and projects an eight-key record to `explicitModelId: null`. Its `saveSettings` path serializes the final nine-key allowlist, including `explicitModelId`, for both a migrated v2 database and any v1 database that has not yet been upgraded.

The database version and settings projection version are separate. Database v1/v2 describes store topology; settings projection v1/v2 describes the exact settings key set. No `settingsSchemaVersion` field is persisted. Phase 2 must not add recommendation metadata, captured queue fields, canonical transcript fields, or Drive fields to settings. `explicitModelId` is the sole additive settings field, and it remains excluded from `CapturedTranscriptionSettings`, recommendation output, canonical JSON, repository records, migration quarantine, and Drive payloads. Add a Phase 2 test that reads a pre-Phase-2 v1 settings record as `{ ...DEFAULT_SETTINGS, explicitModelId: null }`, writes a selected model with `explicitModelId`, reloads it, and proves exact nine-key persistence; add the corresponding v2 read/write projection test against the permanent rollback parser.

### Task 9: Implement scalar, canonical whitespace, schema, and hash contracts

**Entry gate:** `docs/releases/precision-studio-slice-1a.json` has exact `deployed` schema and is committed on `master`; deployed MIG-01 output records 4 passed; `$slice1BBaseSha = (git rev-parse HEAD).Trim()` passes `pnpm release:check-rollback-floor -- $slice1BBaseSha`; `4098fe355588ae1331a1f574a72a42e022bcfaae` returns 1; and the recorded human approver has explicitly approved v2 exposure after reviewing evidence. If any condition is absent, remain stopped before Task 9.

**Files:**
- Modify: `src/features/transcription/types.ts:1-100`
- Modify: `src/features/transcription/language.ts:1-137`
- Modify: `src/App.tsx: legacy interface-language imports/type annotations only` (later extraction preserves this change in `LegacyProduct.tsx`)
- Create: `src/features/transcription/canonical.ts`
- Create: `src/features/transcription/schema.ts`
- Create: `src/features/transcription/hashes.ts`
- Create: `tests/fixtures/transcripts.ts`
- Create: `tests/unit/canonical.test.ts`
- Create: `tests/unit/schema-hashes.test.ts`
- Create: `tests/unit/compatibility-conformance.test.ts`
- Modify: `tests/unit/language.test.ts:1-end`

- [ ] **Step 1: Write canonical red tests with exact fixtures**

`tests/fixtures/transcripts.ts` must export the normative live/tombstone objects from spec lines 699-745 as `normativeLiveEnvelope` and `normativeTombstoneEnvelope`, exact accepted-payload JSON lines 787-795, plus generators:

```ts
export const MiB = 1_048_576
export const MAX_TEXT_BYTES = 16 * MiB
export const wsMixed = "\uFEFF\u0085\t \u3000"
export const validPair = "\u{1F642}"
export const loneHigh = "\uD800"
export const loneLow = "\uDC00"
export const reversedPair = "\uDC00\uD800"
export const bytes = (count: number) => "a".repeat(count)
export const legacySegment = (overrides: Record<string, unknown> = {}) => ({ id: "seg-1", start: 0, end: 1.0005, text: " Hello\u00A0world ", ...overrides })
```

`tests/unit/canonical.test.ts` must assert: lone/reversed surrogate rejection before normalization; valid pair preservation/count; exact `CANONICAL_WS` members and U+200B exclusion; segment run collapse; title outer-only removal/internal preservation; no NFC; 1 MiB and 16 MiB exact acceptance/+1 rejection; half-ms rounding; seven-day acceptance; over-cap/unsafe/non-finite rejection; local negative/non-finite forward repair; global no-overlap timing. Add exact draft rows for bounded non-integer, negative, over-seven-day, reversed, and overlapping timing: `parseEditorDraftPayload` accepts each bounded draft, `commitEditorDraftPayload` returns `needs-attention` with exact issue code/segment ID/index, and corrected timing returns the exact canonical payload with derived text. Reject unknown/missing draft keys, independent `text`, malformed scalar, duplicate ID, non-finite timing, and timing magnitude above `Number.MAX_SAFE_INTEGER`.

Before implementation, extend `tests/unit/language.test.ts` with a source-contract test that scans every `.ts`/`.tsx` file under `src`, expects `AppSettings.uiLanguage: InterfaceLanguage`, expects `language.ts` to import `InterfaceLanguage` from `@/app/copy-types`, and rejects `/\bUiLanguage\b/` everywhere. Add runtime rows proving `resolveTranscriptionLanguage("auto", language)` and `isEnglishOnlyLanguageMismatch("auto", language)` accept both values from `readonly InterfaceLanguage[] = ["en", "vi"]`. In `tests/unit/schema-hashes.test.ts`, import `sha256Base64Url` and assert `sha256Base64Url("🙂") === sha256Base64Url(new TextEncoder().encode("🙂"))`, a subarray hashes only visible bytes, input bytes remain unchanged, output matches `/^[A-Za-z0-9_-]{43}$/`, and lone/reversed surrogate strings reject before `crypto.subtle.digest` is called.

Run: `pnpm vitest run tests/unit/canonical.test.ts tests/unit/schema-hashes.test.ts tests/unit/language.test.ts`.

Expected: FAIL with unresolved canonical/hash modules and the source-contract assertion reporting the still-present `UiLanguage` alias/imports.

- [ ] **Step 2: Extend shared types and remove the legacy UI-language alias**

At the top of `src/features/transcription/types.ts`, add `import type { InterfaceLanguage } from "@/app/copy-types"`, delete `export type UiLanguage = "en" | "vi"`, and change `AppSettings.uiLanguage` to `InterfaceLanguage`. Update every language helper/type consumer in this task, including `src/features/transcription/language.ts` and current `src/App.tsx`, to import `InterfaceLanguage` only from `@/app/copy-types`; `language.ts` imports `LanguageCode` separately from `./types`. The later `App.tsx` → `LegacyProduct.tsx` extraction preserves those imports and annotations. No product file may export, import, or reference `UiLanguage` after this step. Then append the canonical declarations:

```ts
export interface CanonicalSegment { id: string; startMs: number; endMs: number; text: string }
export interface CanonicalTranscriptPayload {
  title: string; sourceName: string; language: string; modelId: string; mode: ProcessingMode
  createdAt: number; text: string; segments: CanonicalSegment[]
}
export interface TranscriptEnvelope {
  schemaVersion: 2; transcriptId: string; revision: number; updatedAt: number
  deletedAt: number | null; deviceId: string; deletionId: string | null
  restoredFromDeletionId: string | null; transcript: CanonicalTranscriptPayload | null
}
export interface TranscriptRecord {
  id: string; revision: number; updatedAt: number; deletedAt: number | null
  deviceId: string; deletionId: string | null; restoredFromDeletionId: string | null
  transcript: CanonicalTranscriptPayload | null; localIssueCode: string | null
}

export interface EditorDraftSegment {
  id: string
  startMs: number
  endMs: number
  text: string
}

export interface EditorDraftPayload {
  title: string
  sourceName: string
  language: string
  modelId: string
  mode: ProcessingMode
  createdAt: number
  segments: EditorDraftSegment[]
}

export type CanonicalCommitIssueCode =
  | "draft.timing-not-integer"
  | "draft.timing-negative"
  | "draft.timing-over-cap"
  | "draft.timing-reversed"
  | "draft.timing-overlap"

export interface CanonicalCommitIssue {
  code: CanonicalCommitIssueCode
  segmentId: string
  segmentIndex: number
}

export type CanonicalCommitResult =
  | { status: "canonical"; payload: CanonicalTranscriptPayload }
  | { status: "needs-attention"; draft: EditorDraftPayload; issues: readonly CanonicalCommitIssue[] }

export type ParseResult<T, E extends string> =
  | { ok: true; value: T }
  | { ok: false; error: E }
```

Do not alter current `TranscriptDocument` or second-based `TranscriptSegment`; Phase 3/4 adapters consume canonical types later. The persisted property remains named `uiLanguage`; this is a TypeScript ownership migration, not a settings-key migration.

- [ ] **Step 3: Implement canonical primitives exactly**

`src/features/transcription/canonical.ts` must export these constants/functions with no engine `trim()`/`\s` use:

```ts
export const MIN_EPOCH_MS = 946_684_800_000
export const MAX_EPOCH_MS = 4_102_444_800_000
export const MAX_RELATIVE_MS = 604_800_000
export const MAX_SEGMENT_BYTES = 1_048_576
export const MAX_TEXT_BYTES = 16_777_216
export const MAX_REMOTE_BODY_BYTES = 26_214_400
const WS = new Set([9,10,11,12,13,32,133,160,5760,8232,8233,8239,8287,12288,65279])
export function isCanonicalWhitespace(codePoint: number) { return WS.has(codePoint) || (codePoint >= 8192 && codePoint <= 8202) }
export function assertScalarString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") throw new TypeError(`${field}: expected string`)
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = value.charCodeAt(index + 1)
      if (!(low >= 0xdc00 && low <= 0xdfff)) throw new TypeError(`${field}: malformed Unicode scalar sequence`)
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new TypeError(`${field}: malformed Unicode scalar sequence`)
  }
}
export function scalarCount(value: string) { assertScalarString(value, "value"); return Array.from(value).length }
export function utf8Bytes(value: string) { assertScalarString(value, "value"); return new TextEncoder().encode(value).byteLength }
export function hasVisibleScalar(value: string) { assertScalarString(value, "value"); return Array.from(value).some((scalar) => !isCanonicalWhitespace(scalar.codePointAt(0)!)) }
export function normalizeSegmentText(value: string) {
  assertScalarString(value, "segment.text")
  const output: string[] = []; let pendingSpace = false
  for (const scalar of value) {
    if (isCanonicalWhitespace(scalar.codePointAt(0)!)) { if (output.length) pendingSpace = true; continue }
    if (pendingSpace) output.push(" ")
    pendingSpace = false; output.push(scalar)
  }
  return output.join("")
}
export function canonicalizeTitle(value: string) {
  assertScalarString(value, "title"); const scalars = Array.from(value); let start = 0; let end = scalars.length
  while (start < end && isCanonicalWhitespace(scalars[start].codePointAt(0)!)) start += 1
  while (end > start && isCanonicalWhitespace(scalars[end - 1].codePointAt(0)!)) end -= 1
  return scalars.slice(start, end).join("")
}
export function checkedEpoch(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || (value as number) < MIN_EPOCH_MS || (value as number) > MAX_EPOCH_MS) throw new RangeError(`${field}: epoch out of range`)
  return value as number
}
export function secondsToMilliseconds(value: number, field: string) {
  const product = value * 1000
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(product)) || product > MAX_RELATIVE_MS) throw new RangeError(`${field}: timing out of range`)
  return Math.round(product)
}
export function deriveTranscriptText(segments: readonly { text: string }[]) {
  const text = segments.map((segment) => normalizeSegmentText(segment.text)).filter(Boolean).join(" ")
  if (utf8Bytes(text) > MAX_TEXT_BYTES) throw new RangeError("transcript.text: exceeds 16 MiB")
  return text
}
```

Schema implementation must use exact-key set comparison at envelope/payload/segment levels, validate every string first, enforce all spec line 653-693 bounds/enums/lineage/timing/unique IDs, require already-canonical remote title/segment text and derived text equality, and export the master Section 5.3 functions. `serializeTranscriptEnvelope` must call `JSON.stringify` only after `parseTranscriptEnvelope` succeeds.

Implement and export these exact signatures from `canonical.ts`:

```ts
export function parseEditorDraftPayload(
  value: unknown,
): ParseResult<EditorDraftPayload, "draft.invalid-shape" | "draft.invalid-scalar" | "draft.out-of-bounds">
export function commitEditorDraftPayload(draft: EditorDraftPayload): CanonicalCommitResult
```

`parseEditorDraftPayload` accepts only the exact seven-key `EditorDraftPayload` object and exact four-key draft segments; it applies scalar/count/UTF-8/ID uniqueness/enum/epoch validation, but permits finite draft timing values with absolute value at most `Number.MAX_SAFE_INTEGER`, including non-integers, negatives, values above seven days, reversed pairs, and overlaps. `commitEditorDraftPayload` is the sole gate: normalize title/segment text, validate every segment in array order for safe-integer `0..604800000`, `endMs >= startMs`, and forward non-overlap, derive `text`, and return `{ status: "canonical", payload }`; otherwise return `{ status: "needs-attention", draft, issues }` with deterministic issue order and no clamp, reorder, hash, persistence, transcript write, or pending enqueue. Draft payload contains no independent `text`, `transcriptId`, `revision`, or `updatedAt`.

Hash implementation must wrap `canonicalize` only after `parseTranscriptEnvelope` and must export `sha256Base64Url(input: string | Uint8Array): Promise<string>` plus distinct domain functions `remoteKey`, `candidateHash`, `acceptedPayloadHash`, and `rawBodyByteHash`. For strings, `sha256Base64Url` calls `assertScalarString(input, "sha256.input")` and hashes exactly `new TextEncoder().encode(input)`; for `Uint8Array`, it hashes exactly the visible view bytes without decoding, coercing, or mutating them. It returns 43-character unpadded RFC 4648 base64url. `remoteKey` and `candidateHash` call this helper with their exact UTF-8 domain input. Accepted-payload and raw-body outputs remain lowercase hex; never alias one domain function to another. Pin exact canonical bytes from spec lines 787-795 in tests.

- [ ] **Step 4: Add Slice 1B parity tests without replacing the rollback parser**

Create `tests/unit/compatibility-conformance.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { parseRollbackV2Envelope } from "@/features/storage/compatibility"
import { parseTranscriptEnvelope } from "@/features/transcription/schema"
import { normativeLiveEnvelope, normativeTombstoneEnvelope } from "../fixtures/transcripts"

function canonicalAccepts(value: unknown): boolean {
  try {
    parseTranscriptEnvelope(value)
    return true
  } catch {
    return false
  }
}

describe("COMPAT-01 canonical parser parity", () => {
  const liveTranscript = normativeLiveEnvelope.transcript!
  const cases: Array<{ name: string; value: unknown; accepted: boolean }> = [
    { name: "normative live", value: normativeLiveEnvelope, accepted: true },
    { name: "normative tombstone", value: normativeTombstoneEnvelope, accepted: true },
    { name: "restored live", value: { ...normativeLiveEnvelope, restoredFromDeletionId: "x_AAAAAAAAAAAAAAAAAAAAAA" }, accepted: true },
    { name: "unknown envelope key", value: { ...normativeLiveEnvelope, extra: true }, accepted: false },
    { name: "wrong schema", value: { ...normativeLiveEnvelope, schemaVersion: 1 }, accepted: false },
    { name: "malformed scalar ID", value: { ...normativeLiveEnvelope, transcriptId: "\ud800" }, accepted: false },
    { name: "invalid live lineage", value: { ...normativeLiveEnvelope, deletionId: "x_AAAAAAAAAAAAAAAAAAAAAA" }, accepted: false },
    { name: "stale derived text", value: { ...normativeLiveEnvelope, transcript: { ...liveTranscript, text: "stale" } }, accepted: false },
    { name: "unknown payload key", value: { ...normativeLiveEnvelope, transcript: { ...liveTranscript, id: "payload-id" } }, accepted: false },
    { name: "noncanonical segment text", value: { ...normativeLiveEnvelope, transcript: { ...liveTranscript, text: "Hello world.", segments: [{ ...liveTranscript.segments[0], text: " Hello world. " }] } }, accepted: false },
    { name: "over-cap timing", value: { ...normativeLiveEnvelope, transcript: { ...liveTranscript, segments: [{ ...liveTranscript.segments[0], endMs: 604800001 }] } }, accepted: false },
    { name: "tombstone restore lineage", value: { ...normativeTombstoneEnvelope, restoredFromDeletionId: "x_AAAAAAAAAAAAAAAAAAAAAA" }, accepted: false },
  ]

  it.each(cases)("matches acceptance for $name", ({ value, accepted }) => {
    expect(parseRollbackV2Envelope(value).ok).toBe(accepted)
    expect(canonicalAccepts(value)).toBe(accepted)
  })
})
```

Run: `pnpm vitest run tests/unit/compatibility.test.ts tests/unit/compatibility-conformance.test.ts`.

Expected: COMPAT-01 rollback tests and all 12 parity rows pass. The test imports both modules independently; production canonical modules do not import, wrap, replace, or redefine `compatibility.ts`.

- [ ] **Step 5: Verify canonical/schema/hash green and adjacent exports**

Run:

```bash
pnpm vitest run tests/unit/canonical.test.ts tests/unit/schema-hashes.test.ts tests/unit/language.test.ts tests/unit/compatibility.test.ts tests/unit/compatibility-conformance.test.ts
pnpm vitest run tests/unit/exports.test.ts tests/unit/models.test.ts
```

Expected: all selected tests pass; malformed-scalar instrumentation records zero canonicalizer calls; normative bytes and independent Web Crypto digest agree.

- [ ] **Step 6: Stage exact files and commit**

```bash
git add src/App.tsx src/features/transcription/types.ts src/features/transcription/language.ts src/features/transcription/canonical.ts src/features/transcription/schema.ts src/features/transcription/hashes.ts tests/fixtures/transcripts.ts tests/unit/canonical.test.ts tests/unit/schema-hashes.test.ts tests/unit/language.test.ts tests/unit/compatibility-conformance.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(transcription): define canonical schema 2 contracts"
```

### Task 10: Implement exact local-v1 and strict-remote legacy conversion

**Files:**
- Create: `src/features/transcription/legacy.ts`
- Create: `tests/unit/legacy-migration.test.ts`

- [ ] **Step 1: Write the complete legacy fixture matrix first**

Create table-driven tests using `tests/fixtures/transcripts.ts`. Every row must carry `{ id, title, sourceName, language, modelId, mode, createdAt, updatedAt, text, segments }`; every segment must carry `{ id, start, end, text }` except local repair-ID cases. Include exact cases from spec line 1001: default settings; invalid numeric settings; FEFF/0085/mixed outer title and preserved internal runs; U+200B; empty/all-WS/oversize/wrong-type title; valid segmented; wrong-type/oversize/malformed text; text-only/empty zero segments; exact/+1 MiB synthesized and segment text; exact/+1 16 MiB aggregate; normalization boundary; missing/empty/all-WS/non-string/oversize/duplicate/malformed segment IDs; overlap/out-of-order/non-finite/negative/half-ms/seven-day/over-cap timing; invalid mode; ID empty/all-WS/wrong-type/512/513/multibyte; source/language/model/segment bounds/types; unknown bounded language/model; timestamp lower/upper/invalid; unknown/missing object fields; lone-high/lone-low/reversed/valid-pair in every string field; malformed device metadata.

For each repairable ID, assert:

```ts
import { sha256Base64Url } from "@/features/transcription/hashes"

const expectedInput = `${String(legacyId)}\u0000${index}`
const expectedId = `seg_${await sha256Base64Url(expectedInput)}`
```

For zero segments assert domain input `${legacyId}\u0000legacy-empty\u00000`. Remote conversion must reject every repaired local ID/timing case.

Run: `pnpm vitest run tests/unit/legacy-migration.test.ts`.

Expected: FAIL with unresolved `legacy.ts`.

- [ ] **Step 2: Implement isolated exact-shape conversion**

`src/features/transcription/legacy.ts` must export:

```ts
export type LegacyPolicy = "local-v1" | "remote"
export type LegacyConversion =
  | { status: "canonical"; envelope: TranscriptEnvelope }
  | { status: "noncanonical"; reasonCode: string }
export async function convertLegacyTranscript(value: unknown, policy: LegacyPolicy, deviceId: string): Promise<LegacyConversion>
export function parseLegacyIso(value: unknown, field: string): number
export function repairLocalTiming(segments: readonly unknown[]): CanonicalSegment[]
```

Implementation order is exact: plain-object/exact-key check; scalar validation of all strings; intake bounds; ISO round-trip and epoch bounds; title outer canonicalization; preserve source/language/model/ID bytes; validate mode; normalize/size segment text; policy-specific ID and timing handling; zero-segment synthesis; aggregate derivation; construct live envelope with revision 0/null lineage. Catch only known validation failures and return a stable ASCII reason code; rethrow digest/infrastructure failure so migration aborts. No truncation, split-to-fit, random segment ID, malformed-string hashing, canonical hash, or Drive metadata occurs.

- [ ] **Step 3: Verify local/remote policy and canonical adjacency**

```bash
pnpm vitest run tests/unit/legacy-migration.test.ts
pnpm vitest run tests/unit/canonical.test.ts tests/unit/schema-hashes.test.ts
```

Expected: matrix passes; canonicalizable migration/parser payload bytes are identical; noncanonical local output has no envelope/hash.

- [ ] **Step 4: Stage exact files and commit**

```bash
git add src/features/transcription/legacy.ts tests/unit/legacy-migration.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(storage): normalize legacy transcript records"
```

### Task 11: Define exact v2 stores/indexes and transactional migration/quarantine

**Files:**
- Create: `src/features/storage/schema.ts`
- Create: `src/features/storage/migration.ts`
- Modify: `src/features/storage/database.ts:1-end`
- Expand: `tests/unit/database.test.ts`
- Expand: `tests/e2e/fixtures/database.ts`
- Modify: `tests/e2e/migration.spec.ts`

- [ ] **Step 1: Write MIG-02/03 red tests**

Use fake-indexeddb fixtures to seed all Task 9 cases plus two valid siblings. Assert exact physical stores:

```ts
[
  "conflictCandidates", "drafts", "meta", "migrationQuarantine",
  "pendingOperations", "settings", "syncMetadata", "syncState", "transcripts",
]
```

Assert exact indexes:

```ts
{
  transcripts: ["by-deletedAt", "by-updatedAt"],
  migrationQuarantine: ["by-originalV1Key", "by-reasonCode"],
  conflictCandidates: ["by-receivedAt", "by-transcriptId"],
  syncMetadata: ["by-accountKey", "by-transcriptId"],
  pendingOperations: ["by-accountKey", "by-nextAttemptAt", "by-transcriptId"],
  syncState: [], drafts: [], settings: [], meta: [],
}
```

Assert every successful v2 `transcripts` store has key path exactly `transcriptId`, never `id`, and indexes exactly `by-deletedAt` and `by-updatedAt`. Seed v1 rows whose legacy key differs from the prepared canonical `transcriptId`; all canonical rows must still appear under their inline v2 key after recreation. Inject failures at recreated-store/index creation, quarantine put, canonical put, and commit. Each must reject the v2 open; reopening versionlessly must report v1 with `transcripts.keyPath === "id"`, original keys/values, and valid siblings unchanged. Assert no migration path calls `cursor.update`, `cursor.delete`, or attempts to mutate an existing store's key path. Verify a 25 MiB exact JSON representation is prepared for quarantine; +1 or serialization failure rejects before the numeric v2 open. Quarantine shape is exactly `{ quarantineId, originalV1Key, reasonCode, original }` with no raw-body/hash fields.

Instrument the numeric v2 `openDB` callback and assert idb v8 argument order exactly: database first, `oldVersion` second, `newVersion` third, upgrade transaction fourth. Assert `upgradeToVersion2` receives those same four values in that order plus the exact precomputed plan fifth, returns `undefined`, and is never awaited. Hold one upgrade request open in a controlled fixture and prove the `openDB(...)` promise remains unsettled; complete the request/transaction and prove the promise resolves only afterward. Abort the transaction and prove the open rejects.

Add an existing-v2 reopen fixture with all nine exact stores, key paths, indexes, and parser-valid `meta/deviceId`. Spy on `snapshotVersion1`, `precomputeMigrationPlan`, and numeric `openDB(..., 2, ...)`; `openVersion2Database()` must return the inspected existing handle after `inspectVersion2Schema()` and call none of those legacy/upgrade paths. Add malformed-v2 schema rows that reject without mutation. Add an unsupported-v3 fixture that closes and returns unsupported. A fresh versionless open remains v1-compatible and may advance to v2 only when the recorded Slice 1B release gate permits numeric exposure.

Run: `pnpm vitest run tests/unit/database.test.ts --grep "MIG-02|MIG-03"`.

Expected: FAIL because `openVersion2Database` and v2 schema are absent.

- [ ] **Step 2: Define schema names and keys**

Create `src/features/storage/schema.ts` exporting literal store/index objects matching Step 1. Use transcript key path `transcriptId`; quarantine `quarantineId`; drafts `transcriptId`; conflict `candidateId`; compound sync keys `["accountKey", "transcriptId"]`; syncState `accountKey`; meta/settings out-of-line named keys. Create every index exactly once during `oldVersion < 2`.

The v2 `pendingOperations` store persists the exact `PendingOperation` union, not a nullable flat record. Its compound key is `['accountKey', 'transcriptId']`; `publicationState` is the discriminator. `unbound` rows contain literal `null` for all generated/attempted identity fields and permit only desired hash/JSON coalescing. `bound`, `creating`, `verifying`, and `needs-attention` rows contain the complete frozen attempt; every transition validates expected state, generated ID, and attempted hash before writing and preserves frozen fields byte-for-byte. `SyncMetadata.itemState = "synced"` is not a schema-default or generic store write: only the guarded `finalizeStabilizedWinner` repository transaction may create it after exact same-ID verification and stabilized-winner equality.

- [ ] **Step 3: Implement migration transaction rules**

Create `src/features/storage/migration.ts` with these exact orchestration signatures:

```ts
export interface LegacySnapshot {
  settings: unknown
  transcripts: ReadonlyArray<{ key: IDBValidKey; value: unknown }>
}

export interface MigrationPlan {
  deviceId: string
  settingsAction: { value: unknown; key: IDBValidKey }
  canonicalRecords: readonly TranscriptEnvelope[]
  quarantineRecords: readonly MigrationQuarantineRecord[]
}

export async function snapshotVersion1(db: IDBPDatabase): Promise<LegacySnapshot>
export async function precomputeMigrationPlan(
  snapshot: LegacySnapshot,
  dependencies: MigrationDependencies,
): Promise<MigrationPlan>
export function upgradeToVersion2(
  database: IDBPDatabase,
  oldVersion: number,
  newVersion: number,
  transaction: IDBPTransaction,
  preparedPlan: MigrationPlan,
): void
```

`openVersion2Database()` first opens versionlessly and branches on the inspected current version. For version `2`, call `inspectVersion2Schema()` and return that same existing database handle directly when valid; do not call `snapshotVersion1`, `precomputeMigrationPlan`, or any numeric-version open. Invalid v2 schema closes and rejects. Version `>2` closes and returns unsupported. For version `1`, synchronously snapshot legacy records through request callbacks, close the handle, await `precomputeMigrationPlan` outside any upgrade, verify the Slice 1B release gate, then call `openDB(WHISDOM_DB_NAME, 2, { upgrade(database, oldVersion, newVersion, transaction) { upgradeToVersion2(database, oldVersion, newVersion, transaction, preparedPlan) } })`. A fresh versionless database follows the same v1 path and cannot request version 2 before that release gate. The idb v8 callback signature/order is exactly `upgrade(database, oldVersion, newVersion, transaction)`; an optional event is fifth. `upgradeToVersion2(database, oldVersion, newVersion, transaction, preparedPlan): void` uses that exact wiring, although a closure may bind `preparedPlan`. Neither callback is `async` or returns a promise. The upgrade callback contains no `await`, no `convertLegacyTranscript`, no hashing, no random-ID generation, and no asynchronous conversion. The `openDB(...)` promise resolves only after the upgrade transaction completes and rejects on request failure or abort.

Generate one parser-valid `d_` ID from 16 caller-supplied random bytes and persist it at meta key `deviceId`; tests inject bytes. Generate each `q_` ID from caller-supplied 16 random bytes during precomputation. Production obtains bytes through `crypto.getRandomValues`; if unavailable, reject before the v2 open—never use `Math.random` for protocol IDs. Keep `createId()` fallback for non-protocol UI IDs only.

`precomputeMigrationPlan` converts every snapshotted v1 row, validates bounds, computes all hashes and IDs, and produces complete canonical records or bounded migration-quarantine records before upgrade. Every malformed but bounded row becomes a prepared `{ quarantineId, originalV1Key, reasonCode, original }` record in `migrationQuarantine`; serialization/measurement over 25 MiB or infrastructure failure rejects planning before the numeric open. Inside the synchronous versionchange transaction, `upgradeToVersion2` deletes the old `transcripts` store with key path `id`, recreates it with key path `transcriptId`, creates exactly `by-deletedAt` and `by-updatedAt`, creates the remaining exact stores/indexes, then puts all prepared canonical records and prepared quarantine records. It never attempts cursor update to change key path, never performs per-row source deletion, and never converts or measures data. Store/index creation failure, quarantine put failure, canonical put failure, request error, abort, or commit failure aborts the whole versionchange transaction. IndexedDB rollback restores the complete v1 store definition and data atomically. Settings merge defaults; chunk requires integer 15..60; overlap finite 0..5 and `< chunk`; otherwise use 30/1. Initialize no pending operation.

- [ ] **Step 4: Add gated v2 opener**

Append the gated opener to `database.ts`. The implementation must preserve the versionless inspection branch above; this skeleton replaces the stale plan-first opener:

```ts
let version2Open: Promise<DatabaseOpenResult> | null = null
export function openVersion2Database(): Promise<DatabaseOpenResult> {
  version2Open ??= inspectCurrentDatabaseThenOpenVersion2().catch((error) => {
    version2Open = null
    throw error
  })
  return version2Open
}
```

`inspectCurrentDatabaseThenOpenVersion2()` performs the exact versionless branch and schema validation described in Step 3. Only its version-1/fresh gated branch snapshots, precomputes, closes, and invokes numeric `openDB(..., 2, ...)` with `upgradeToVersion2`. It returns an existing valid v2 handle without replacing it.

Update `closeDatabase` to close/reset both cached opens. `main.tsx` must not call this opener until Task 14 shell wiring after the approval gate.

- [ ] **Step 5: Verify migration green, reopen, and rollback safety**

```bash
pnpm vitest run tests/unit/database.test.ts tests/unit/legacy-migration.test.ts tests/unit/schema-hashes.test.ts
pnpm playwright test tests/e2e/migration.spec.ts --grep "MIG-02|MIG-03" --reporter=list
```

Expected: all pass; every source row becomes canonical or bounded recoverable quarantine; v2 `transcripts` uses key path `transcriptId` and exact indexes; existing-v2 reopen performs no legacy planning or numeric upgrade; injected failures retain v1 key path `id` and byte-identical rows; no pending operation exists; Slice 1A opener still opens resulting v2.

Migration retry tests must cover both pre-upgrade and in-upgrade failures. A precompute failure retries from a fresh versionless v1 snapshot. A recreated-store/index, put, request, or commit failure aborts the v2 transaction, closes the failed handle, reopens versionlessly, and proves the original `transcripts` key path is still `id` and all original keys/values remain byte-identical before recomputing the plan. After the bounded retry is exhausted, the API rejects with migration failure and leaves v1 intact; it never resumes partial v2 actions or silently treats an incomplete v2 database as v1.

- [ ] **Step 6: Stage exact files and commit**

```bash
git add src/features/storage/schema.ts src/features/storage/migration.ts src/features/storage/database.ts tests/unit/database.test.ts tests/e2e/fixtures/database.ts tests/e2e/migration.spec.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(storage): migrate transcripts to schema 2"
```

Commit body: `Prepare every canonical or quarantined row before upgrade; atomically replace the v1 transcript store only inside the abort-safe versionchange transaction.`

### Task 12: Add durable types and repository transaction boundaries

**Files:**
- Create: `src/features/storage/sync-types.ts`
- Create: `src/features/google-drive/types.ts`
- Create: `src/features/storage/remote-types.ts`
- Create: `src/features/storage/repositories.ts`
- Create: `src/features/storage/transcript-repository.ts`
- Create: `src/features/storage/sync-repository.ts`
- Create: `src/features/storage/quarantine-repository.ts`
- Create: `tests/unit/repositories.test.ts`

- [ ] **Step 1: Write repository red tests**

Test caller-supplied transcript/deletion/quarantine IDs and every exact master method. Cover:

1. `mutateTranscriptAndCoalescePending`, tombstone, restore, bulk clear, and `commitCanonicalDraftAndCoalescePending` reject stale transcript/draft revisions with the exact repository error and no writes; successful canonical calls atomically write transcript revision plus latest eligible pending desired publication.
2. Existing `unbound` pending rows coalesce desired hash/JSON while every attempted field stays literal `null`. Existing `bound`, `creating`, `verifying`, and `needs-attention` rows may advance only desired hash/JSON; frozen attempted identity and publication state remain byte-for-byte unchanged.
3. `bindGeneratedAttempt` rejects non-`unbound` or wrong desired hash; success freezes complete attempted identity. Creating/verifying/Needs-attention transitions reject stale state/generated ID/attempted hash and write nothing.
4. `persistDraftOnly` accepts bounded non-integer, negative, over-seven-day, reversed, and overlapping `EditorDraftPayload` values and touches only `drafts`. Snapshot `transcripts`, canonical revision, canonical envelope/hash, `syncMetadata`, and `pendingOperations` before/after and require exact equality. Reload the draft and require exact payload equality.
5. Correct the same draft, require `commitEditorDraftPayload(...).status === "canonical"`, then call only `commitCanonicalDraftAndCoalescePending`; assert one transaction updates transcript, clears/updates draft under expected editor revision, and coalesces desired publication. A `needs-attention` result never reaches any canonical mutation method.
6. Candidate-first incoming merge rejects stale transcript/pending state; `IncomingMergeSyncMetadata` cannot represent `synced`. `finalizeStabilizedWinner` requires a complete `VerifiedPublicationReceipt` plus stabilized candidate and rejects stale/non-verifying state, a missing/malformed receipt, any receipt/pending/candidate/body-hash mismatch, or a winner different from the receipt candidate hash. Callers cannot supply duplicate generated-file, attempted-hash, confirmed-file, or confirmed-hash strings. Only exact same-ID verified stabilized attempted success writes `synced`, removes pending, and optionally installs one literal-null `unbound` replacement.
7. Observed-deletion restore, clear-as-tombstones exact ID map, account-neutral candidate shape, due-operation index, and bounded quarantine export/delete. Inject abort after each write in every multi-store transaction and assert every participating store remains unchanged.

Run: `pnpm vitest run tests/unit/repositories.test.ts`.

Expected: FAIL with unresolved repositories.

- [ ] **Step 2: Define durable storage sync types and Drive-facing types without a cycle**

Create storage-neutral `src/features/storage/remote-types.ts` first. It solely declares `RemoteQuarantineMetadata`, `RemoteQuarantineRecord`, and any remote-quarantine write-input types. Create `src/features/storage/sync-types.ts` as sole owner of `PublicationState`, `DriveAppProperties`, `PendingDesiredPublication`, `PendingOperationBase`, every `PendingOperation` variant, `FrozenPendingAttempt`, pending constructors/parser/guards, repository transition inputs, `RemoteCandidate`, `VerifiedPublicationReceipt`, `DriveConnectionState`, `DriveSyncState`, and `SyncMetadata`. Both storage type modules import no Drive feature module. Storage repositories import every durable candidate/publication/sync record and verifier receipt only from these storage owners.

Create `src/features/google-drive/types.ts` for `ObservedRemoteCandidate`, `ResolvedCandidateSet`, `DriveSyncSnapshot`, and `DriveSyncService`. It imports durable records from `@/features/storage/sync-types` and quarantine metadata from `@/features/storage/remote-types`; it may re-export storage-owned sync names only when existing Drive consumers require that compatibility surface. Phase 5 adds `AccountSwitchGuard` and its associated result types to this same owner, then makes `identity.ts` import and implement their usage without redeclaration. No `src/features/storage/**` file imports `@/features/google-drive/**`. Do not add fetch, GIS, access-token, Drive API, publication, resolver, or reconciliation implementations.

Define pending publication with this exact discriminated union; a flat object with nullable attempted fields is prohibited:

```ts
export type PublicationState = "unbound" | "bound" | "creating" | "verifying" | "needs-attention"
export interface DriveAppProperties {
  whisdomTranscriptKey: string
  whisdomSchemaVersion: "2"
  whisdomCandidateHash: string
}
export interface PendingDesiredPublication {
  accountKey: string
  transcriptId: string
  desiredCandidateHash: string
  desiredEnvelopeJson: string
}
export interface PendingOperationBase extends PendingDesiredPublication {
  retryCount: number
  nextAttemptAt: number
  lastErrorCode: string | null
}
export interface UnboundPendingOperation extends PendingOperationBase {
  publicationState: "unbound"
  generatedFileId: null
  attemptedCandidateHash: null
  attemptedEnvelopeJson: null
  attemptedPayloadHash: null
  attemptedFileName: null
  attemptedMimeType: null
  attemptedPrivateProperties: null
}
export interface FrozenPendingAttempt {
  readonly generatedFileId: string
  readonly attemptedCandidateHash: string
  readonly attemptedEnvelopeJson: string
  readonly attemptedPayloadHash: string
  readonly attemptedFileName: string
  readonly attemptedMimeType: "application/vnd.whisdom.transcript+json"
  readonly attemptedPrivateProperties: Readonly<DriveAppProperties>
}
export interface BoundPendingOperation extends PendingOperationBase, FrozenPendingAttempt { publicationState: "bound" }
export interface CreatingPendingOperation extends PendingOperationBase, FrozenPendingAttempt { publicationState: "creating" }
export interface VerifyingPendingOperation extends PendingOperationBase, FrozenPendingAttempt { publicationState: "verifying" }
export interface NeedsAttentionPendingOperation extends PendingOperationBase, FrozenPendingAttempt {
  publicationState: "needs-attention"
  lastErrorCode: string
}
export type PendingOperation =
  | UnboundPendingOperation
  | BoundPendingOperation
  | CreatingPendingOperation
  | VerifyingPendingOperation
  | NeedsAttentionPendingOperation
export function parsePendingOperation(
  value: unknown,
): ParseResult<PendingOperation, "pending.invalid-shape" | "pending.invalid-state" | "pending.invalid-attempt">
export function createUnboundPendingOperation(input: PendingDesiredPublication & {
  nextAttemptAt: number
}): UnboundPendingOperation
export function freezePendingAttempt(input: {
  operation: UnboundPendingOperation
  attempt: FrozenPendingAttempt
}): BoundPendingOperation
export function isUnboundPendingOperation(value: PendingOperation): value is UnboundPendingOperation
export function isBoundPendingOperation(value: PendingOperation): value is BoundPendingOperation
export function isCreatingPendingOperation(value: PendingOperation): value is CreatingPendingOperation
export function isVerifyingPendingOperation(value: PendingOperation): value is VerifyingPendingOperation
export function isNeedsAttentionPendingOperation(value: PendingOperation): value is NeedsAttentionPendingOperation
export interface BindGeneratedAttemptInput extends FrozenPendingAttempt {
  accountKey: string
  transcriptId: string
  expectedState: "unbound"
  expectedDesiredCandidateHash: string
}
export interface ExpectedBoundAttempt {
  accountKey: string
  transcriptId: string
  expectedState: "bound"
  expectedGeneratedFileId: string
  expectedAttemptedCandidateHash: string
}
export interface ExpectedFrozenAttempt {
  accountKey: string
  transcriptId: string
  expectedGeneratedFileId: string
  expectedAttemptedCandidateHash: string
}
export interface ExpectedCreatingAttempt {
  accountKey: string
  transcriptId: string
  expectedState: "creating"
  expectedGeneratedFileId: string
  expectedAttemptedCandidateHash: string
}
export interface RemoteCandidate {
  candidateId: string
  transcriptId: string
  candidateHash: string
  acceptedPayloadHash: string
  revision: number
  updatedAt: number
  deviceId: string
  deletedAt: number | null
  deletionId: string | null
  restoredFromDeletionId: string | null
  transcript: CanonicalTranscriptPayload | null
  receivedAt: number
}
export interface VerifiedPublicationReceipt {
  readonly kind: "verified-publication"
  readonly generatedFileId: string
  readonly candidateHash: string
  readonly acceptedPayloadHash: string
  readonly exactBodyHash: string
  readonly verifiedAt: number
}
export interface ObservedRemoteCandidate {
  fileId: string
  remoteKey: string
  filename: string
  mimeType: "application/vnd.whisdom.transcript+json"
  appProperties: DriveAppProperties
  envelopeJson: string
  candidate: RemoteCandidate
}
export interface ResolvedCandidateSet {
  winner: RemoteCandidate | null
  dominantTombstone: RemoteCandidate | null
  representatives: ReadonlyMap<string, ObservedRemoteCandidate>
  losers: RemoteCandidate[]
}
export type DriveConnectionState = "signed-out" | "opening" | "connected" | "needs-reconnect" | "revoking"
export interface DriveSyncState {
  accountKey: string
  connection: DriveConnectionState
  lastSuccessfulReconcileAt: number | null
  pendingOperationCount: number
  active: boolean
  rerunRequested: boolean
  authPaused: boolean
  currentTranscriptId: string | null
  lastErrorCode: string | null
}
export interface SyncMetadata {
  accountKey: string
  transcriptId: string
  remoteKey: string
  confirmedCandidateHash: string | null
  confirmedFileId: string | null
  informationalDriveVersion: string | null
  itemState: "local-only" | "pending" | "syncing" | "synced" | "needs-attention"
  lastErrorCode: string | null
}
export interface DriveSyncSnapshot {
  connection: DriveConnectionState
  accountKey: string | null
  lastSuccessfulReconcileAt: number | null
  pendingOperationCount: number
  active: boolean
  authPaused: boolean
  lastErrorCode: string | null
}
export interface DriveSyncService {
  getSnapshot(): DriveSyncSnapshot
  subscribe(listener: () => void): () => void
  connectFromGesture(): Promise<void>
  reconnectFromGesture(): Promise<void>
  syncNowFromGesture(): Promise<void>
  signOut(): void
  revokeFromGesture(): Promise<void>
  requestReconcile(trigger: "sign-in" | "local-mutation" | "online" | "focus" | "interval"): void
  dispose(): void
}
```

`parsePendingOperation` uses exact-key validation: `unbound` requires literal-null attempted fields; every other variant requires complete frozen identity; Needs-attention requires non-null `lastErrorCode`. Constructors copy inputs, validate desired/attempted hash-and-body agreement, and deeply freeze attempt private properties. Guards narrow only their exact discriminator. `sync-types.ts` owns these durable declarations. `google-drive/types.ts` owns `ObservedRemoteCandidate`, `ResolvedCandidateSet`, `DriveSyncSnapshot`, and `DriveSyncService` while consuming storage records from `sync-types.ts`. Phase 5 adds Drive identity/transport/parser data types only.

- [ ] **Step 3: Implement repository interfaces and factory**

Create `repositories.ts` with these exact master Section 5.4 declarations. `repositories.ts`, `transcript-repository.ts`, and `sync-repository.ts` import every publication operation, candidate persistence record, sync-state record, and sync-metadata record only from `@/features/storage/sync-types`; they never import `@/features/google-drive/types`. `DraftRecord.draft` is bounded `EditorDraftPayload`, never `CanonicalTranscriptPayload`:

```ts
export interface TranscriptMutationInput {
  transcriptId: string
  updatedAt: number
  payload: CanonicalTranscriptPayload
  restoredFromDeletionId: string | null
}
export interface TranscriptRepository {
  get(id: string): Promise<TranscriptRecord | null>
  list(): Promise<TranscriptRecord[]>
}
export interface DraftRecord {
  transcriptId: string
  baseRevision: number
  editorRevision: number
  draft: EditorDraftPayload
  dirty: boolean
  saveState: "dirty" | "saving" | "save-failed"
  updatedAt: number
}
export type RepositoryErrorCode =
  | "repository.stale-transcript-revision"
  | "repository.stale-draft-revision"
  | "repository.stale-publication-state"
  | "repository.attempt-identity-mismatch"
  | "repository.invalid-record"
export type RepositoryResult<T> = { ok: true; value: T } | { ok: false; error: RepositoryErrorCode }
export interface AtomicMutationRepository {
  mutateTranscriptAndCoalescePending(input: {
    mutation: TranscriptMutationInput
    expectedRevision: number | null
    desiredPublication: PendingDesiredPublication | null
  }): Promise<RepositoryResult<TranscriptRecord>>
  tombstoneTranscriptAndCoalescePending(input: {
    transcriptId: string
    observedRevision: number
    deletedAt: number
    deletionId: string
    desiredPublication: PendingDesiredPublication | null
  }): Promise<RepositoryResult<TranscriptRecord>>
  restoreTranscriptAndCoalescePending(input: {
    transcriptId: string
    observedRevision: number
    observedDeletionId: string
    updatedAt: number
    payload: CanonicalTranscriptPayload
    desiredPublication: PendingDesiredPublication | null
  }): Promise<RepositoryResult<TranscriptRecord>>
  clearAsTombstones(input: {
    observed: ReadonlyArray<{ transcriptId: string; revision: number }>
    deletedAt: number
    deletionIds: Readonly<Record<string, string>>
    desiredPublications: readonly PendingDesiredPublication[]
  }): Promise<RepositoryResult<TranscriptRecord[]>>
  commitCanonicalDraftAndCoalescePending(input: {
    draft: DraftRecord
    mutation: TranscriptMutationInput
    expectedTranscriptRevision: number
    expectedDraftEditorRevision: number
    desiredPublication: PendingDesiredPublication | null
  }): Promise<RepositoryResult<TranscriptRecord>>
  persistDraftOnly(input: {
    draft: DraftRecord
    expectedDraftEditorRevision: number | null
  }): Promise<RepositoryResult<DraftRecord>>
  discardDraft(input: {
    transcriptId: string
    expectedDraftEditorRevision: number
  }): Promise<RepositoryResult<null>>
}
export interface DraftRepository { get(transcriptId: string): Promise<DraftRecord | null> }
export interface CandidateRepository {
  put(candidate: RemoteCandidate): Promise<RepositoryResult<RemoteCandidate>>
  get(candidateId: string): Promise<RemoteCandidate | null>
  list(transcriptId: string): Promise<RemoteCandidate[]>
  delete(candidateId: string): Promise<boolean>
}
// src/features/storage/remote-types.ts
export type RemoteQuarantineMetadata = {
  fileId: string
  remoteKey?: string
  errorCode: string
} & (
  | { bodyByteHash: string; bodyHashScope: "full"; sizeAtLeast?: never; fingerprintUnavailableReason?: never }
  | { bodyByteHash: string; bodyHashScope: "prefix-25MiB"; sizeAtLeast: 26_214_401; fingerprintUnavailableReason?: never }
  | { bodyByteHash?: never; bodyHashScope?: never; sizeAtLeast?: never; fingerprintUnavailableReason: string }
)
export interface RemoteQuarantineRecord {
  recordType: "remote-quarantine"
  candidateId: string
  transcriptId: string | null
  receivedAt: number
  metadata: RemoteQuarantineMetadata
}
export interface RemoteQuarantineRepository {
  put(record: RemoteQuarantineRecord): Promise<RepositoryResult<RemoteQuarantineRecord>>
  get(candidateId: string): Promise<RemoteQuarantineRecord | null>
  list(transcriptId?: string): Promise<RemoteQuarantineRecord[]>
  delete(candidateId: string): Promise<boolean>
}
export interface PendingOperationRepository {
  get(accountKey: string, transcriptId: string): Promise<PendingOperation | null>
  listDue(accountKey: string, now: number): Promise<PendingOperation[]>
  bindGeneratedAttempt(input: BindGeneratedAttemptInput): Promise<RepositoryResult<BoundPendingOperation>>
  transitionToCreating(input: ExpectedBoundAttempt): Promise<RepositoryResult<CreatingPendingOperation>>
  transitionToVerifying(input: ExpectedCreatingAttempt): Promise<RepositoryResult<VerifyingPendingOperation>>
  markNeedsAttention(input: ExpectedFrozenAttempt & {
    expectedState: "bound" | "creating" | "verifying"
    errorCode: string
  }): Promise<RepositoryResult<NeedsAttentionPendingOperation>>
}
export type IncomingMergeSyncMetadata = Omit<SyncMetadata, "itemState"> & {
  itemState: "local-only" | "pending" | "syncing" | "needs-attention"
}
export interface ReconciliationRepository {
  persistIncomingCandidateFirstAndMerge(input: {
    candidate: RemoteCandidate
    remoteQuarantineCandidateIds: readonly string[]
    expectedTranscriptRevision: number | null
    expectedPendingState: PublicationState | null
    winner: TranscriptRecord
    metadata: IncomingMergeSyncMetadata
  }): Promise<RepositoryResult<TranscriptRecord>>
  finalizeStabilizedWinner(input: {
    accountKey: string
    transcriptId: string
    expectedState: "verifying"
    receipt: VerifiedPublicationReceipt
    stabilizedWinner: RemoteCandidate
    informationalDriveVersion: string | null
  }): Promise<RepositoryResult<{ metadata: SyncMetadata; replacement: UnboundPendingOperation | null }>>
}
export interface SyncMetadataRepository {
  get(accountKey: string, transcriptId: string): Promise<SyncMetadata | null>
}
export interface SyncStateRepository {
  get(accountKey: string): Promise<DriveSyncState | null>
  put(state: DriveSyncState): Promise<void>
}
export interface MigrationQuarantineRecord {
  quarantineId: string
  originalV1Key: IDBValidKey
  reasonCode: string
  original: unknown
}
export interface MigrationQuarantineRepository {
  get(quarantineId: string): Promise<MigrationQuarantineRecord | null>
  list(): Promise<MigrationQuarantineRecord[]>
  exportJson(quarantineId: string): Promise<string>
  delete(quarantineId: string): Promise<void>
  clear(quarantineIds: readonly string[]): Promise<void>
}
export interface StorageRepositories {
  transcripts: TranscriptRepository
  mutations: AtomicMutationRepository
  drafts: DraftRepository
  candidates: CandidateRepository
  remoteQuarantine: RemoteQuarantineRepository
  pendingOperations: PendingOperationRepository
  reconciliation: ReconciliationRepository
  syncMetadata: SyncMetadataRepository
  syncState: SyncStateRepository
  migrationQuarantine: MigrationQuarantineRepository
}
export type RepositoryFixtureMethod =
  | "persistDraftOnly"
  | "commitCanonicalDraftAndCoalescePending"
  | "discardDraft"
export interface RepositoryFailurePort {
  shouldFail(method: RepositoryFixtureMethod): boolean
}
export type RepositoryFactoryOptions = {
  failurePort?: RepositoryFailurePort
}
export function createStorageRepositories(
  db: IDBPDatabase,
  options?: RepositoryFactoryOptions,
): StorageRepositories
```

Do not add aliases or generic pending/metadata `put` methods. `createStorageRepositories(db, options?)` returns concrete repository instances. `RepositoryFactoryOptions = { failurePort?: RepositoryFailurePort }` and this optional second parameter are permanent frozen factory API, established now so Phase 4 consumes rather than changes it. No method generates IDs or reads clock/randomness.

`RepositoryFailurePort` is test-only. Before opening a write transaction, each of the three named methods calls `options?.failurePort?.shouldFail(method)` exactly once; `true` returns the method's normal typed repository failure and performs no durable write. The production call omits options. The default test/dev adapter may read `window.__WHISDOM_REPOSITORY_FIXTURE__` only when `import.meta.env.DEV || import.meta.env.MODE === "e2e"`; it compares `failNext`, atomically sets it to `null`, appends the exact method to `consumed`, and returns `true`. Production mode never reads the property. Add repository tests for explicit injection, one-shot consumption, no-transaction failure, and production-mode ignore. Phase 4 may add no factory parameter or alternate failure seam; a genuinely required new named operation must first amend this owning Phase 1 contract.

`transcript-repository.ts` must use one guarded readwrite transaction over `transcripts` plus `pendingOperations`, and `drafts` when required. Validate canonical payload before opening the transaction; require exact current expected transcript/draft revisions; increment only canonical transcript writes; block overflow; preserve supplied `updatedAt`, `transcriptId`, and valid restore lineage; atomically coalesce the latest desired publication without mutating frozen attempt identity. Delete requires caller `deletionId`; restore requires exact observed current `deletionId`; bulk clear requires every observed revision and caller ID. Any stale revision/state or attempted identity mismatch returns its typed `RepositoryResult` and writes nothing.

`persistDraftOnly` validates `EditorDraftPayload`, writes only `drafts`, and never opens `transcripts`, `pendingOperations`, `syncMetadata`, or hashing. `commitCanonicalDraftAndCoalescePending` accepts only the payload returned by a `CanonicalCommitResult` whose status is `canonical`; it atomically writes transcript plus draft disposition plus eligible pending desired publication. There is no repository overload accepting a needs-attention draft as a canonical mutation.

`sync-repository.ts` supplies account-neutral candidate/remote-quarantine plus pending/metadata/state methods using exact keys/indexes. Candidate and remote-quarantine records both use `conflictCandidates`' `candidateId` key path and `transcriptId`/`receivedAt` indexes; neither contains `accountKey`. A quarantine file ID is bounded evidence only, never accepted-candidate account association; Drive association remains outside `RemoteCandidate`. `CandidateRepository` and `RemoteQuarantineRepository` own exact put/get/list/delete APIs. Migration failures remain separate under `MigrationQuarantineRepository`; remote parser failures never enter `migrationQuarantine`. Every non-unbound transition checks expected state, generated file ID, and attempted candidate hash and preserves all frozen attempted fields. `persistIncomingCandidateFirstAndMerge` puts the immutable candidate first, then winner/non-Synced metadata/pending disposition and supplied `remoteQuarantineCandidateIds` deletions in one transaction; any later failure aborts all writes. `finalizeStabilizedWinner` is the only method that may write `SyncMetadata.itemState = "synced"`; it accepts the storage-owned `VerifiedPublicationReceipt` and stabilized candidate, derives generated-file and confirmed identity from the receipt, recomputes the exact frozen-envelope body hash, rejects every missing/malformed/mismatched receipt atomically, then removes matching pending state and installs an unbound replacement only when desired differs. `SyncMetadataRepository` exposes no independent `put`. `quarantine-repository.ts` exports selected bounded migration original as `JSON.stringify` only after byte measurement `<=25 MiB`; failure rejects without deletion.

- [ ] **Step 4: Verify atomicity and migration adjacency**

```bash
pnpm vitest run tests/unit/repositories.test.ts
pnpm vitest run tests/unit/database.test.ts tests/unit/legacy-migration.test.ts
```

Expected: all pass; injected transaction abort leaves all participating stores unchanged. Compile-time tests reject a finalization input with no receipt or any reintroduced duplicate identity string. Runtime tests independently alter receipt discriminant, generated file ID, candidate hash, accepted-payload hash, exact body hash, and verified timestamp bounds and require atomic rejection. Repository source-graph assertions prove remote-quarantine records are declared only in `storage/remote-types.ts`; durable publication/candidate/sync records, `VerifiedPublicationReceipt`, and pending constructors/guards are declared only in `storage/sync-types.ts`; repositories import only those storage-domain owners; every `google-drive` consumer imports persisted and receipt types from that neutral owner; no `src/features/storage/**` source imports `src/features/google-drive/**`; and the receipt discriminant has no construction site yet in Phase 1. Phase 5's source-graph test later permits exactly one construction site: the successful verifier branch in `google-drive/publication.ts`.

- [ ] **Step 5: Stage exact files and commit**

```bash
git add src/features/google-drive/types.ts src/features/storage/remote-types.ts src/features/storage/sync-types.ts src/features/storage/repositories.ts src/features/storage/transcript-repository.ts src/features/storage/sync-repository.ts src/features/storage/quarantine-repository.ts tests/unit/repositories.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(storage): add atomic transcript repositories"
```

### Task 13: Implement query routes, history, focus, and baseline dirty guard

**Files:**
- Create: `src/app/navigation.ts`
- Create: `src/app/use-app-route.ts`
- Create: `tests/components/navigation.test.tsx`

- [ ] **Step 1: Write NAV-01 red tests**

Test `/`, known views, encoded transcript ID decoded once, missing transcript ID correction, unknown view replacement, `pushState`, canonical replace, pop subscribe, heading focus, guard blocked retry/discard, and replay-loop prevention. Use a fake guard returning each master `NavigationGuardDecision` shape.

Run: `pnpm vitest run tests/components/navigation.test.tsx`.

Expected: FAIL with unresolved navigation modules.

- [ ] **Step 2: Implement exact public contract**

`navigation.ts` must contain master Section 5.1 declarations, including `AppNavigator.setGuard(guard: NavigationGuard | null): void` and `createAppNavigator({guard: NavigationGuard | null})`. Keep one mutable active guard initialized from the constructor argument. `setGuard` replaces that reference synchronously; `navigate` and pop handling read the current reference at intent time and allow when it is null. Phase 4 consumes this frozen API without editing `navigation.ts`. Serialization is exactly:

```ts
workbench => "?view=workbench"
library => "?view=library"
settings => "?view=settings"
transcript => `?view=transcript&id=${encodeURIComponent(transcriptId)}`
```

`parseAppRoute("")` returns Workbench with `replace: true`; explicit known Workbench returns false; unknown/missing transcript ID returns Workbench with replace true. Navigator tracks monotonically increasing `historyIndex` in `history.state.whisdomIndex`. `navigate` awaits guard before push. Blocked pop immediately restores current entry with `history.go(delta)`, sets one replay guard, then exposes returned retry/discard closures. Allowed route schedules heading focus with `requestAnimationFrame`; heading uses `[data-route-heading]`, temporarily receives `tabIndex=-1`, focuses with `{ preventScroll: true }`, then removes the attribute on blur.

`use-app-route.ts` uses `useSyncExternalStore` around navigator subscribe/current and returns `{ route, navigate, replace }`. It creates no global router and performs no repository save itself.

- [ ] **Step 3: Verify focused and adjacent component suites**

```bash
pnpm vitest run tests/components/navigation.test.tsx
pnpm vitest run tests/components/product-errors.test.tsx
```

Expected: all pass; focus assertion identifies exactly one page heading.

- [ ] **Step 4: Stage exact files and commit**

```bash
git add src/app/navigation.ts src/app/use-app-route.ts tests/components/navigation.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "feat(app): add query navigation contract"
```

### Task 14: Ship typed EN/VI Precision Studio shell, final Settings, lazy placeholders, and legacy Workbench bridge

**Files:**
- Expand: `src/app/copy.ts`
- Consume unchanged: `src/app/copy-types.ts`
- Create: `src/app/AppShell.tsx`
- Create: `src/app/LegacyProduct.tsx` by moving the complete current product implementation from `src/App.tsx`
- Create: `src/components/product/AppHeader.tsx`
- Create: `src/components/product/MobileNavigation.tsx`
- Create: `src/components/product/RoutePending.tsx`
- Create: `src/features/library/LibraryPage.tsx`
- Create: `src/features/transcript-editor/TranscriptPage.tsx`
- Create: `src/app/work-activity-store.ts`
- Create: `src/features/settings/validation.ts`
- Create: `src/features/settings/SettingsPage.tsx`
- Create: `tests/unit/settings-validation.test.ts`
- Create: `tests/e2e/fixtures/settings.ts`
- Modify: `tests/components/navigation.test.tsx`
- Modify: `tests/e2e/whisdom.spec.ts`
- Modify: `src/main.tsx:1-14`
- Modify: `src/index.css:8-160`
- Replace: `src/App.tsx:1-end` with the exact thin `AppShell` adapter

- [ ] **Step 1: Write shell, EN/VI, mobile, axe, and lazy-route red tests**

`tests/components/navigation.test.tsx` asserts skip link first focusable; semantic header/nav/main; one visible h1; Workbench/Library desktop nav; mobile bottom nav under 768 px; 44 px controls; Settings in menu; Light/Dark/System options; route heading focus; localized pending/not-found/placeholder copy; final Settings processing/chunking/storage controls; helper/error associations; destructive confirmations; active-work disabling; and zero axe critical/serious violations for Workbench and Settings default/validation states in EN/VI at 320 and 390 widths. It also pins `AppShell` as the stable application-lifetime owner above route outlets: changing Workbench/Library/Transcript/Settings query routes must not remount that owner. Phase 3 extends this test with a held runtime rather than changing shell ownership. `tests/unit/settings-validation.test.ts` covers every parsing boundary before component implementation.

Run:

```bash
pnpm vitest run tests/components/navigation.test.tsx
```

Expected: FAIL because shell modules do not exist.

- [ ] **Step 2: Extend typed shell copy with compile-time parity**

Add identical EN/VI key shapes: `skipToContent`, `primaryNavigation`, `wordmark`, `localByDefault`, `localExplanation`, `workbench`, `library`, `settings`, `accountMenu`, `driveNotConnected`, `theme`, `light`, `dark`, `system`, `interfaceLanguage`, `loadingRoute`, `libraryComingSoon`, `transcriptComingSoon`, `transcriptNotFound`, and `backToLibrary`. Preserve the exact values established in the Foundation registry for `skipToContent` and `primaryNavigation`; `AppShell` consumes those typed keys without an alias. `SETTINGS_COPY` owns equal EN/VI keys for Processing, chunk length, overlap, storage, keep source media, transcript cleanup, model-cache cleanup, helpers, range/relationship errors, active-work disabled explanation, confirmation titles/bodies, Cancel, and destructive action labels. Remove `settingsComingSoon`; every component consumes typed copy and no hardcoded user-facing English remains.

- [ ] **Step 3: Implement shell composition and old-App bridge**

Move the complete legacy product implementation from `src/App.tsx` into exact owner `src/app/LegacyProduct.tsx`, preserving behavior and compatibility bootstrap use. Export `LegacyProduct` from that file. It imports neither `@/App` nor `@/app/AppShell`. Replace `src/App.tsx` with the exact thin adapter below; it contains no product state, worker/storage orchestration, route logic, or import back to `LegacyProduct`:

```tsx
import "@/features/storage/compatibility-api"
import { AppShell } from "@/app/AppShell"

export function App() {
  return <AppShell />
}

export default App
```

`AppShell.tsx` creates one navigator with `guard:null`, exposes the exact master `setGuard(guard: NavigationGuard | null): void` API, canonicalizes invalid initial URL with replace, and lazy imports Library, transcript, and Settings. Its stable provider/service scope wraps the route outlet and survives every query-route change; route pages are consumers, never lifetime owners. Phase 3 installs the singleton queue store/runtime coordinator in that scope and reserves app teardown—not Workbench unmount—as its disposal boundary. The interim Workbench outlet imports and renders `<LegacyProduct />`; `AppShell` never imports or renders `App`. This one-way graph is exact: `main.tsx → App → AppShell → LegacyProduct`. `RoutePending` is stable-height localized fallback. Phase 1 creates addressable Library and Transcript route placeholders with route `h1`; transcript loads the requested ID and renders localized not-found plus Back to Library. Phase 4 must modify/replace those exact files. Settings is final in this phase, not a placeholder and not deferred to Phase 7.

- [ ] **Step 4: Implement bounded Settings validation and final Settings page**

Create `src/features/settings/validation.ts` with exact pure results:

```ts
export type SettingsField = "chunkSeconds" | "overlapSeconds"
export type SettingsValidationCode =
  | "settings.chunk-integer"
  | "settings.chunk-range"
  | "settings.overlap-finite"
  | "settings.overlap-range"
  | "settings.overlap-not-less-than-chunk"
export type SettingsNumberResult =
  | { ok: true; value: number }
  | { ok: false; field: SettingsField; code: SettingsValidationCode }

export function parseChunkSeconds(raw: string): SettingsNumberResult
export function parseOverlapSeconds(raw: string, chunkSeconds: number): SettingsNumberResult
```

`parseChunkSeconds` accepts only `/^(?:1[5-9]|[2-5]\d|60)$/`: an integer from 15 through 60 inclusive. Empty, exponent, sign, decimal, whitespace-padded, `NaN`, and `Infinity` reject. `parseOverlapSeconds` first requires non-empty `Number(raw)` with `Number.isFinite`, then range `0..5` inclusive and strict `value < chunkSeconds`; exponent syntax may parse only when finite/in range, but whitespace-only rejects. It never rounds or clamps. Tests cover 14/15/60/61, decimals for chunk, overlap `0`, `5`, `5.01`, non-finite values, and the strict relationship.

Create `src/app/work-activity-store.ts` as a tiny `useSyncExternalStore` source with `getWorkActivitySnapshot()`, `subscribeWorkActivity(listener)`, and `setWorkActivity(active)`. During the interim, exact publisher owner `src/app/LegacyProduct.tsx` calls `setWorkActivity(true)` while transcription or conversion is active and clears only after its terminal cleanup completes. Phase 3 removes every LegacyProduct publication and transfers sole publisher ownership to the runtime coordinator/external store: it publishes active transcription, active conversion, and cancelling, and clears only after terminal provider `dispose()` or forced teardown acknowledgement resolves. The `AppShell` provider scope owns that coordinator across route changes. Final `WorkbenchPage` never imports or calls `setWorkActivity`; it subscribes on mount and unsubscribes on unmount without disposing/cancelling the coordinator. App teardown alone disposes. Thin `src/App.tsx` never imports `setWorkActivity`, subscribes, or publishes. The store carries no progress or provider data. `SettingsPage` subscribes and disables save/cleanup actions while active.

`SettingsPage.tsx` loads `AppSettings` through `loadSettings`, keeps raw numeric input drafts separate from durable values, and calls `saveSettings` only when both parsers succeed. Preserve processing mode/model/language controls already owned by current Settings behavior, chunk length, overlap, and `persistMediaBlobs`; do not add preferences. Each numeric input has a stable helper ID and, when invalid, a stable error ID; `aria-describedby` contains helper then error, `aria-invalid` reflects failure, and the localized error is adjacent. Invalid drafts remain visible, never persist, and disable Save. Successful save persists one complete valid `AppSettings` object and announces the result politely.

Transcript cleanup requires an accessible confirmation dialog naming local transcript loss, calls `clearTranscripts()` only after confirmation, and never implies Drive deletion. Model-cache cleanup requires a separate confirmation, then awaits `clearLocalWorkerState()` before `clearModelCaches()`; if worker reset fails, cache deletion does not run and one scoped Settings error appears. Both destructive buttons and confirmation actions are disabled while work is active; opening activity closes/prevents confirmation without executing. Persist-media copy states source blobs remain local and are off by default. All labels/helpers/errors/dialog copy come from `SETTINGS_COPY` in EN/VI.

`tests/components/navigation.test.tsx` owns the Settings component validation test: type invalid raw values, assert helper/error association and no `saveSettings`; repair both values, assert exact persisted numbers; toggle persist media; verify both confirmations; assert worker clear precedes cache clear; inject worker-clear failure; and set active work to prove every destructive action and Save are disabled. No second Settings feature test file is created.

Create `tests/e2e/fixtures/settings.ts` with:

```ts
import { expect, type Page } from "@playwright/test"

export type SettingsFixtureState = "default" | "validation"
export async function openSettingsState(
  page: Page,
  state: SettingsFixtureState,
  language: "en" | "vi",
): Promise<void>
```

The opener navigates to `/?view=settings`, sets interface language through the public account menu, waits for `[data-testid="settings-page"]`, and for `validation` fills chunk with `14` and overlap with `NaN`, blurs, then waits for `[data-testid="settings-validation-summary"]` and both associated field errors. Phase 6 imports this function unchanged for `A11Y-AUTO-05`; it never recreates Settings state with ad hoc selectors.

`AppHeader` includes wordmark, local-default indicator/explanation, desktop Workbench/Library nav, disconnected Drive status slot, and account menu with Settings, EN/VI, Light/Dark/System. `MobileNavigation` contains Workbench/Library only and safe-area padding. Both use query navigator; no `<a href>` full reload for route commands.

Replace `src/main.tsx` render target with `<App />` under existing `ThemeProvider`; retain `import "@/features/storage/compatibility-api"` as an unconditional bootstrap import before rendering. Before app render, await `openVersion2Database`; unsupported/failure renders typed ProductErrorPanel and does not mount `App`. This is the first v2 exposure and is permitted only after Task 8 approval. `App` remains the thin public root while `AppShell` owns routes.

- [ ] **Step 5: Apply exact Precision Studio semantic tokens**

Keep Geist import. Add `--font-mono: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace`; warm light canvas/card, graphite text, warm rules, cobalt accent/focus, restrained critical, muted success/warning; deliberate deep-graphite dark equivalents. Map `--color-success`, `--color-warning`, and mono in `@theme inline`. Set radius to `0.375rem`. Add visible skip-link positioning, `:focus-visible` 2 px ring/2 px offset, `@media (prefers-reduced-motion: reduce)` disabling animation/transition/scroll behavior, `main` bottom padding for mobile nav, and `env(safe-area-inset-bottom)`. Use no gradient, backdrop blur, glass, glow, neon, remote font, or decorative image.

- [ ] **Step 6: Verify component, Settings unit, and legacy bridge adjacency**

```bash
pnpm vitest run tests/unit/settings-validation.test.ts tests/components/navigation.test.tsx tests/components/product-errors.test.tsx
pnpm playwright test tests/e2e/whisdom.spec.ts --reporter=list
```

Expected: component tests pass with zero critical/serious axe findings; legacy Workbench flow remains usable. Adapt legacy selectors only for the new outer shell; do not weaken behavior assertions.

- [ ] **Step 7: Stage exact files and commit**

```bash
git add src/App.tsx src/app/copy.ts src/app/AppShell.tsx src/app/LegacyProduct.tsx src/app/work-activity-store.ts src/components/product/AppHeader.tsx src/components/product/MobileNavigation.tsx src/components/product/RoutePending.tsx src/features/library/LibraryPage.tsx src/features/transcript-editor/TranscriptPage.tsx src/features/settings/validation.ts src/features/settings/SettingsPage.tsx src/main.tsx src/index.css tests/unit/settings-validation.test.ts tests/components/navigation.test.tsx tests/e2e/fixtures/settings.ts tests/e2e/whisdom.spec.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(app): add precision studio shell"
```

### Task 15: Prove NAV-01, Settings validation, I18N baseline, PERF-01, and final MIG gates

**Files:**
- Create: `tests/e2e/navigation-i18n.spec.ts`
- Create: `tests/e2e/performance.spec.ts`
- Modify: `tests/e2e/migration.spec.ts`

- [ ] **Step 1: Add failing NAV-01/SETTINGS-01/I18N browser scenarios**

Test direct Workbench/Library/Settings/transcript URL; refresh; Back/Forward; unknown canonicalization; missing transcript localized EN/VI; focused h1; mobile bottom nav at 320/390; desktop nav at 1024; no horizontal overflow at 200%/320. The baseline dirty guard test injects a guard that blocks with `dirty`, verifies route hold, then executes retry and discard independently. Phase 4 extends it with real serialized save. Add exact `SETTINGS-01 numeric validation preserves durable settings`: import `openSettingsState` from `./fixtures/settings`, open `validation` in EN and VI, assert chunk/overlap errors are visible and associated, Save is disabled, reload, and verify the previous valid `30`/`1` values remain durable. Then enter `15`/`0`, save, reload, and verify exact persistence. Exercise separate transcript/model-cache confirmations and active-work disabling through the public Workbench-to-Settings flow.

Run: `pnpm playwright test tests/e2e/navigation-i18n.spec.ts --grep "NAV-01|SETTINGS-01" --reporter=list`.

Expected: first run fails on any missing wiring; after correction all selected cases pass.

- [ ] **Step 2: Add PERF-01 request/chunk assertions**

Build first, then inspect browser requests. Initial `/?view=workbench` must not request filenames/chunks containing `LibraryPage`, `TranscriptPage`, `SettingsPage`, `ffmpeg`, `onnx`, `transformers`, `audio_processor`, or model extensions `.onnx/.bin/.safetensors`. Navigate each route and require a distinct lazy JS request only then. Keep the exact test independent of hashed filename by recording script response URLs before/after each navigation and asserting one new route script plus no heavy asset URL.

Run:

```bash
pnpm build
pnpm playwright test tests/e2e/performance.spec.ts --grep "PERF-01" --reporter=list
```

Expected: build emits separate Library, Transcript, and Settings chunks; PERF-01 passes; initial Workbench emits none of those route requests or heavy assets.

- [ ] **Step 3: Complete MIG-02/03 browser evidence**

Add browser fixtures for canonical valid, repairable, quarantined, 25 MiB abort, and valid sibling records. Assert v2 store/index list, exact migrated payload, quarantine export/delete, no pending operation, and data preservation after simulated interrupted upgrade. Run rollback-floor guard against current HEAD and against `4098fe355588ae1331a1f574a72a42e022bcfaae` from the test process; current passes, old target rejects.

Run:

```bash
pnpm playwright test tests/e2e/migration.spec.ts --grep "MIG-02|MIG-03" --reporter=list
```

Expected: all MIG-02/03 cases pass; every v1 key is represented canonically or in quarantine; interrupted database remains v1.

- [ ] **Step 4: Run adjacent browser suites**

```bash
pnpm playwright test tests/e2e/navigation-i18n.spec.ts tests/e2e/performance.spec.ts tests/e2e/migration.spec.ts tests/e2e/whisdom.spec.ts tests/e2e/server-mode.spec.ts --reporter=list
```

Expected: all nongated scenarios pass; no model/ffmpeg request precedes Transcribe; no `.first()` strict workaround exists.

- [ ] **Step 5: Stage exact tests and commit**

```bash
git add tests/e2e/navigation-i18n.spec.ts tests/e2e/performance.spec.ts tests/e2e/migration.spec.ts
git diff --cached --name-only
git diff --cached
git commit -m "test(app): verify migration navigation and lazy routes"
```

## Phase 1 exit gates

### Foundation gate

- [ ] Node contract is `.node-version` `24`; engine is `>=22.22.2`; dependency ranges match master exactly.
- [ ] jsdom, fake-indexeddb, Testing Library, direct axe-core, and Playwright axe packages are installed; pure tests remain Node by default.
- [ ] Both baseline `.first()` workarounds are removed; each failure renders once contextually; no failure toast duplicates it.
- [ ] Run `pnpm typecheck`, `rtk lint`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; expect exit 0, lint zero warnings, only documented gated skips.

### Slice 1A release gate

- [ ] `openCompatibleDatabase` passes no explicit version and creates only v1-compatible fresh stores.
- [ ] `compatibility.ts` passes COMPAT-01 schema/parser/conversion/projection tests; the adapter calls its exports for every v2 read and mutation and maps failures to the exact `StorageCompatibilityError.code`.
- [ ] MIG-01 fresh/v1/v2/unsupported-v3 cases pass in EN/VI where applicable through `[data-testid="compatibility-product-ready"]` plus the public compatibility API; no case expects legacy heading copy.
- [ ] No Slice 1A code requests, creates, migrates, or exposes v2.
- [ ] Independent deployment evidence contains exact commit/URL/UTC/smoke/approver values.
- [ ] Rollback guard accepts the floor and rejects `4098fe355588ae1331a1f574a72a42e022bcfaae`; runbook is permanent.
- [ ] Human approval is recorded before Slice 1B starts.

### Slice 1B data gate

- [ ] Scalar validation precedes normalization/counting/persistence/canonicalization/hash. Exact `CANONICAL_WS`, title, timing, 1 MiB/16 MiB, exact allowlists, RFC 8785 bytes, and four digest domains pass.
- [ ] Local-v1 conversion applies only specified ID/timing/title/text/zero-segment repairs; remote policy remains strict.
- [ ] V2 physical stores and indexes match Task 11 exactly. Migration precomputes canonical/quarantine records outside upgrade, then one synchronous versionchange transaction deletes v1 `transcripts` key path `id`, recreates v2 `transcripts` key path `transcriptId` with exact indexes, and puts prepared rows. No cursor key-path rewrite exists; abort restores v1 schema/data atomically. Existing-v2 reopen validates and returns directly without legacy planning or numeric upgrade.
- [ ] Every v1 record is canonical or recoverably quarantined; no record truncates, silently drops, hashes malformed input, uploads, or creates pending Drive work.
- [ ] Repository transactions are atomic and generate no IDs/timestamps/randomness.
- [ ] Query routes, Back/Forward/refresh/deep link, focus, baseline guard, final Settings validation/cleanup/active-work behavior, EN/VI copy, 320/390 shell, Light/Dark/System, reduced motion, axe, and PERF-01 pass.
- [ ] Legacy `App` remains the Workbench bridge. No Phase 2–5 flow or Drive protocol is implemented.

### Full Phase 1 checks and review

- [ ] Run in exact order from `F:\Workspace\whisdom\whisdom-precision-studio`:

```bash
pnpm typecheck
rtk lint
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Expected: every command exits 0; lint has zero errors/warnings; all nongated browser tests pass; only documented real-ASR/WebGPU cases skip.

- [ ] Do not run worker typecheck unless worker/shared worker-facing contracts unexpectedly changed. No such change belongs in this phase.
- [ ] Do not run `cargo build`; no `server/` change belongs in this phase. Stop for approval if implementation appears to require one.
- [ ] Inspect `git status --short`, remove generated `test-results/.last-run.json`, `dist`, traces, screenshots not designated as baselines, and caches; never discard another worker's files.
- [ ] Review exact staged paths and `git diff --cached` before every authorized commit. Never use `git add .` or `git add -A`.
- [ ] Obtain migration/data-loss review, accessibility review, and release-floor review. Any conflict with corrected spec or master blocks completion.

Phase 1 contains exactly 15 sequential integer-numbered tasks with no letter suffix or duplicate marker. It ends only when Foundation, independently deployed/approved 1A, gated 1B, final Settings, named tests, and full repository checks all pass. Phase 2 must consume these contracts without reopening migration, replacing Settings, or replacing the old App bridge.
