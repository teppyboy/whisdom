# Precision Studio Phase 6 Cross-Feature Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the integrated Phases 1–5 product across accessibility, responsive behavior, internationalization, themes, visual design, request loading, render isolation, incremental work, virtualization, and Drive concurrency through tests, harnesses, and configuration only. A stopped scenario may add its one exact permitted review record; do not repair product behavior in Phase 6.

**Architecture:** Treat Phase 6 as an integrated tests-only verification gate over the existing shell, Workbench, queue, editor, Library, Settings, and Drive boundaries. Add reusable test-only axe, viewport, request, and state-matrix harnesses. A focused red that exposes a product defect is not permission to edit product code: stop the task, record the exact failing command, assertion, owning file, owning function/component/selector, and observed failure, then obtain an explicit plan amendment and review before editing. No executor-invented conditional product edit is allowed.

**Tech Stack:** Node 24, pnpm 11.5.2, React 19, TypeScript 6, Tailwind CSS 4, Radix/shadcn, TanStack Virtual 3, Vitest 4, Testing Library, jsdom, Playwright 1.60, `axe-core` 4.12, `@axe-core/playwright` 4.12, React Profiler.

---

## Entry, authority, and non-goals

- [ ] Confirm Phases 1–5 are feature-complete, their named gates pass, and Phase 5 Checkpoints A, B, and C are recorded complete.
- [ ] Confirm worktree is `F:\Workspace\whisdom\whisdom-precision-studio` on `feature/precision-studio-redesign`.
- [ ] Read `AGENTS.md`, `docs/superpowers/specs/2026-07-29-ui-redesign-design.md`, `docs/superpowers/plans/2026-07-29-ui-redesign-master-rollout.md`, all Phase 1–5 plans, `package.json`, `vitest.config.ts`, and `playwright.config.ts` before editing.
- [ ] Record `git status --short`; preserve every unrelated path and never reset, clean, stash, or broad-stage.
- [ ] Verify `axe-core@~4.12.1` and `@axe-core/playwright@~4.12.1` from the Phase 1 dependency contract. A missing dependency is a Phase 1 entry-contract failure and stops Phase 6.
- [ ] Do not deploy Phase 6 independently. Phase 6 and Phase 7 remain one integrated release train.
- [ ] Add no route, schema, repository, runtime event, queue action, editor action, Drive protocol state, copy-key shape, source mode, setting, or product capability.
- [ ] Do not weaken an assertion to accommodate a defect. Expected execution is tests-only. For any focused red caused by product code, stop before editing, record the exact file/function/failure, and obtain a reviewed plan amendment naming the approved product path and repair. This gate applies even when the repair appears presentation-only and never permits executor-invented conditional edits.
- [ ] Do not alter workers, server, Cloudflare Worker, media persistence, model-cache behavior, Drive scopes, immutable publication semantics, or sequential batch behavior.
- [ ] Screenshots are designated only in Task 8. Playwright traces, videos, ad hoc screenshots, `test-results/`, and `playwright-report/` remain generated output and are never staged.

## Phase 6 target file map

### Test harness and configuration

- Modify `playwright.config.ts`: retain Chromium full-suite coverage; add Firefox and WebKit hardening projects; define deterministic desktop, 390, and 320 project metadata without changing production behavior.
- Verify unchanged `tests/setup.ts`: it solely owns Testing Library DOM cleanup. Axe runs are scoped to each test invocation; no shared axe cleanup exists. Phase 6 test files import neither `cleanup` nor `afterEach` for cleanup and add no second cleanup path.
- Create `tests/e2e/fixtures/accessibility.ts`: locale/viewport/theme matrix, axe runner, overflow/touch-target/positive-tabindex/prohibited-style/request helpers.
- Import/consume unchanged `tests/e2e/fixtures/database.ts`: Phase 4 exports `seedLibrary(page, { count, updatedAtStart? })` and `seedTranscript(page, { segmentCount, saveFails?, transcriptId? })` for Library/editor states.
- Import/consume unchanged `tests/e2e/fixtures/runtime.ts`: Phase 3 exports `installRuntimeFixture(page)` and `openWorkbenchState(page, state, language)` for Workbench states.
- Import/consume unchanged `tests/e2e/fixtures/drive.ts`: Phase 5 exports `installDriveFixture(page, options?)`, `openIdentityState(page, state, language)`, and `openSyncState(page, state, language)` for identity, conflict, and sync-attention states.
- Import/consume unchanged `tests/e2e/fixtures/settings.ts`: Phase 1 exports `openSettingsState(page, state, language)` for default and validated-error Settings states.
- Modify `tests/e2e/fixtures/performance.ts`: retain Phase 4 exports `makeLibraryRecords(count = 1000)` and `makeTimelineSegments(count = 5000)`; add the Phase 6 request collector defined in Task 6. Scheduler and Drive concurrency observations stay in their owning unit tests rather than creating duplicate fixture APIs.

### Consolidated verification

- Create `tests/components/accessibility.test.tsx`: direct `axe-core` checks for component states that can render without browser layout.
- Create `tests/components/progress-profiler.test.tsx`: 100-update React Profiler isolation test.
- Modify `tests/unit/drive-reconcile.test.ts`: tests-only Phase 5 concurrency assertions declared by Task 7.
- Create `tests/unit/i18n.test.ts`: typed-copy parity sentinel and hardcoded-user-facing-English source scan.
- Create `tests/e2e/accessibility.spec.ts`: `A11Y-AUTO-01..07`, structural semantics, keyboard-observable behavior, touch, overflow, safe-area, virtual-keyboard, motion, and theme assertions.
- Modify `tests/e2e/performance.spec.ts`: retain Phase 1 PERF-01 and Phase 4 PERF-02/03 coverage; add Phase 6 request graph, lazy chunks, asset deferral, thresholds, 8 ms scheduler/fallback, and fixture-size assertions.
- Create `tests/e2e/visual-regression.spec.ts`: `VIS-01` designated snapshots and prohibited-aesthetic assertions.
- Create `tests/e2e/visual-baselines/ownership-manifest.json`: schema version 1 and the exact 42 normalized paths/owners/scenarios in Task 8; module-level pre-run validation always rejects schema/name/extra/duplicate/traversal/metadata defects, allows only missing expected files during explicit update-snapshots mode, and requires exact 42-file equality afterward.
- Modify `tests/e2e/navigation-i18n.spec.ts`: consolidated `I18N-01`, language-switch state preservation, and locale formatting.

### Product-defect stop-and-record rule

Phase 6 has no product-file ownership map and no product-repair task. Existing test files may be modified only where a task's `Files` block names the exact path and assertions; this grants no permission to edit production code or an owning fixture. If a focused red is caused by product behavior, stop immediately. Do not edit, stage, or propose an implementation change in a product file. The only permitted non-test/config artifact is exactly one scenario-specific `docs/superpowers/reviews/phase-6-product-defect-<scenario>.md` record with the exact scenario, command, assertion, product file, function/component/selector, browser/viewport/locale, measured evidence, and captured output. It may be staged and committed with the failing test/harness evidence, but no other review/doc/artifact path is permitted. Then stop and request an explicit reviewed plan amendment naming any later product owner and repair. Continue only after that amendment; the amended work remains outside this Phase 6 execution unless the plan explicitly names a tests/harness/config change.

Fixture API failures in `database.ts`, `runtime.ts`, or `drive.ts` are owning-phase failures, not Phase 6 edit permission. Stop and amend Phase 4, Phase 3, or Phase 5 respectively. Phase 6 may correct only its newly created accessibility/performance harnesses, Phase 4-owned `fixtures/performance.ts` extension explicitly assigned here, Phase 6 test files, existing tests explicitly named by a task (including Task 7's `tests/unit/drive-reconcile.test.ts`), or `playwright.config.ts`. Earlier database/runtime/Drive fixtures and product files are never implementation, Files-list, or staging targets in this phase. Phase 1's existing Vitest configuration is sufficient and remains unchanged.

## Browser and state matrix

`chromium` runs the full repository suite. `hardening-firefox` and `hardening-webkit` run `accessibility.spec.ts`, `navigation-i18n.spec.ts`, and `performance.spec.ts`; visual baselines remain Chromium-only because cross-engine text rasterization is not a product defect. Every `A11Y-AUTO` state runs exactly six locale/viewport cases total: EN and VI × desktop `1440×1000`, mobile `390×844`, and narrow `320×720`. Theme coverage resolves Light and Dark directly and verifies System against both emulated system preferences. Reduced-motion coverage uses browser emulation rather than a product setting.

Required automated states:

| ID | Required states |
| --- | --- |
| `A11Y-AUTO-01` | Workbench empty, review, active, failed |
| `A11Y-AUTO-02` | Queue sheet open with movable middle item and disabled boundary actions |
| `A11Y-AUTO-03` | Library empty, populated, filtered |
| `A11Y-AUTO-04` | Transcript Document, Timeline, search results, save error |
| `A11Y-AUTO-05` | Settings default and numeric validation error |
| `A11Y-AUTO-06` | Identity menu, auth failure/reconnect, revoke-unconfirmed, account switch |
| `A11Y-AUTO-07` | Sync attention, conflict choice, confirmation toast |

Every axe case passes only when `critical` and `serious` violation counts are both zero. Do not exclude product regions or disable axe rules. Third-party GIS frames may be replaced by the existing Phase 5 deterministic fixture; do not scan or whitelist a live cross-origin frame.

### Task 1: Freeze the cross-feature browser and axe harness

**Files:**
- Modify: `playwright.config.ts`
- Create: `tests/components/accessibility.test.tsx`
- Create: `tests/e2e/fixtures/accessibility.ts`
- Create: `tests/e2e/accessibility.spec.ts`

- [ ] **Step 1.1: Write the failing harness smoke test**

Add the first test to `tests/e2e/accessibility.spec.ts`:

```ts
import { expect, test } from "@playwright/test"
import type { InterfaceLanguage } from "@/app/copy-types"
import {
  assertNoAxeBlockers,
  setInterfaceLanguage,
} from "./fixtures/accessibility"

for (const language of ["en", "vi"] as const satisfies readonly InterfaceLanguage[]) {
  test(`A11Y-AUTO harness scans Workbench shell in ${language}`, async ({ page }) => {
    await page.goto("/?view=workbench")
    await setInterfaceLanguage(page, language)
    await assertNoAxeBlockers(page)
    await expect(page.locator("main")).toHaveCount(1)
  })
}
```

- [ ] **Step 1.2: Run the focused test and verify red**

Run:

```bash
pnpm playwright test tests/e2e/accessibility.spec.ts --grep "A11Y-AUTO harness" --project=chromium --reporter=list
```

Expected: FAIL during TypeScript transform because `tests/e2e/fixtures/accessibility.ts` does not exist.

- [ ] **Step 1.3: Add the complete shared accessibility harness**

Create `tests/e2e/fixtures/accessibility.ts`:

```ts
import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"
import type { InterfaceLanguage } from "@/app/copy-types"

export type ResolvedTheme = "light" | "dark"

export const VIEWPORTS = [
  { id: "desktop", width: 1440, height: 1000 },
  { id: "mobile-390", width: 390, height: 844 },
  { id: "mobile-320", width: 320, height: 720 },
] as const

export async function setInterfaceLanguage(
  page: Page,
  language: InterfaceLanguage,
): Promise<void> {
  const current = await page.locator("html").getAttribute("lang")
  if (current === language) return
  await page.getByRole("button", { name: /account menu|menu tài khoản/i }).click()
  await page.getByRole("button", { name: language.toUpperCase(), exact: true }).click()
  await page.keyboard.press("Escape")
  await expect(page.locator("html")).toHaveAttribute("lang", language)
}

export async function setResolvedTheme(
  page: Page,
  theme: ResolvedTheme,
): Promise<void> {
  await page.evaluate((value) => localStorage.setItem("theme", value), theme)
  await page.reload()
  await expect(page.locator("html")).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`))
}

export async function assertNoAxeBlockers(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).analyze()
  const blockers = result.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  )
  expect(blockers, JSON.stringify(blockers, null, 2)).toEqual([])
}

export async function assertNoPositiveTabIndex(page: Page): Promise<void> {
  const offenders = await page.locator("[tabindex]").evaluateAll((elements) =>
    elements
      .filter((element) => Number(element.getAttribute("tabindex")) > 0)
      .map((element) => element.outerHTML),
  )
  expect(offenders).toEqual([])
}

export async function assertNoPageOverflow(page: Page): Promise<void> {
  const measurements = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(measurements.scrollWidth).toBeLessThanOrEqual(measurements.clientWidth)
}

export async function assertTouchTargets(
  page: Page,
  scope: Locator = page.locator("body"),
): Promise<void> {
  const undersized = await scope.locator(
    "button:not([disabled]), a[href], input:not([type=hidden]), [role=button]:not([aria-disabled=true]), [role=tab]",
  ).evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      if (style.display === "none" || style.visibility === "hidden") return []
      if (rect.width >= 44 && rect.height >= 44) return []
      return [{ html: element.outerHTML, width: rect.width, height: rect.height }]
    }),
  )
  expect(undersized).toEqual([])
}

export async function assertCriticalContentVisible(page: Page): Promise<void> {
  const hidden = await page.locator(
    "[data-critical-action], [data-save-state], [data-error-recovery], [data-active-editor-field]",
  ).evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rect = element.getBoundingClientRect()
      const viewport = window.visualViewport
      const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight
      return rect.top >= 0 && rect.bottom <= bottom ? [] : [element.outerHTML]
    }),
  )
  expect(hidden).toEqual([])
}

export async function assertProhibitedAesthetics(page: Page): Promise<void> {
  const violations = await page.locator("body *").evaluateAll((elements) =>
    elements.flatMap((element) => {
      const style = getComputedStyle(element)
      const bad: string[] = []
      if (style.backgroundImage.includes("gradient(")) bad.push("gradient")
      if (style.backdropFilter !== "none") bad.push("backdrop-filter")
      if (style.textShadow !== "none") bad.push("text-shadow")
      const shadow = style.boxShadow.toLowerCase()
      if (shadow.includes("rgb(0, 255") || shadow.includes("rgb(255, 0, 255")) bad.push("neon-shadow")
      return bad.length === 0 ? [] : [{ html: element.outerHTML, bad }]
    }),
  )
  expect(violations).toEqual([])
  await expect(page.locator('img[src^="http://"], img[src^="https://"]')).toHaveCount(0)
  await expect(page.locator('[data-fake-waveform="true"], [data-parallax]')).toHaveCount(0)
}
```

- [ ] **Step 1.4: Add explicit Playwright projects and deterministic snapshot paths**

Set top-level `snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}"`, then replace only the `projects` array in `playwright.config.ts` with:

```ts
projects: [
  {
    name: "chromium",
    use: { ...devices["Desktop Chrome"] },
  },
  {
    name: "hardening-firefox",
    testMatch: /(?:accessibility|navigation-i18n|performance)\.spec\.ts/,
    use: { ...devices["Desktop Firefox"] },
  },
  {
    name: "hardening-webkit",
    testMatch: /(?:accessibility|navigation-i18n|performance)\.spec\.ts/,
    use: { ...devices["Desktop Safari"] },
  },
],
```

- [ ] **Step 1.5: Run focused and adjacent tests**

Run:

```bash
pnpm playwright test tests/e2e/accessibility.spec.ts --grep "A11Y-AUTO harness" --project=chromium --reporter=list
pnpm playwright test tests/e2e/navigation-i18n.spec.ts --project=chromium --reporter=list
```

Expected: both commands exit 0; harness reports two passing locale cases and no serious/critical axe violation.

- [ ] **Step 1.6: Add direct `axe-core` component coverage**

Create `tests/components/accessibility.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render } from "@testing-library/react"
import axe from "axe-core"
import { describe, expect, it } from "vitest"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

async function expectNoAxeBlockers(container: HTMLElement): Promise<void> {
  const result = await axe.run(container)
  const blockers = result.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  )
  expect(blockers, JSON.stringify(blockers, null, 2)).toEqual([])
}

describe("component accessibility harness", () => {
  it.each([
    { language: "en", label: "Transcript title", action: "Save transcript" },
    { language: "vi", label: "Tiêu đề bản chép lời", action: "Lưu bản chép lời" },
  ] as const)("scans the shared form/control surface in $language", async ({ language, label, action }) => {
    const { container } = render(
      <main lang={language}>
        <h1>{label}</h1>
        <Label htmlFor={`title-${language}`}>{label}</Label>
        <Input id={`title-${language}`} aria-describedby={`help-${language}`} />
        <p id={`help-${language}`}>{language === "en" ? "Stored locally." : "Được lưu cục bộ."}</p>
        <Button type="button">{action}</Button>
      </main>,
    )
    await expectNoAxeBlockers(container)
  })
})
```

Run:

```bash
pnpm vitest run tests/components/accessibility.test.tsx
```

Expected: two component cases pass. `tests/setup.ts` performs the sole shared cleanup. If `axe.run` reports missing DOM APIs, stop and record the missing API plus `tests/setup.ts` owner; obtain a reviewed plan amendment before changing setup. Do not add local cleanup or disable a rule.

- [ ] **Step 1.7: Stage exact files, inspect, and commit**

```bash
git add playwright.config.ts tests/components/accessibility.test.tsx tests/e2e/fixtures/accessibility.ts tests/e2e/accessibility.spec.ts
git diff --cached --name-only
git diff --cached
git commit -m "test(a11y): add cross-feature accessibility harness"
```

Expected staged paths: exactly the four paths above. Commit only when implementation execution was explicitly requested.

### Task 2: Consolidate `A11Y-AUTO-01..07` in every locale and viewport

**Files:**
- Import/consume unchanged: `tests/e2e/fixtures/database.ts`
- Import/consume unchanged: `tests/e2e/fixtures/runtime.ts`
- Import/consume unchanged: `tests/e2e/fixtures/drive.ts`
- Import/consume unchanged: `tests/e2e/fixtures/settings.ts`
- Modify: `tests/e2e/accessibility.spec.ts`
- Product defects are stop-and-record events; no Phase 1–5 product file is editable or stageable in Phase 6.

- [ ] **Step 2.1: Add one matrix runner with exact assertions**

Consolidate this runner into `tests/e2e/accessibility.spec.ts`; each Phase 1–5 fixture callback must reach the named state through its public UI and deterministic transport fixture, not a production test bridge. The complete file has exactly one `@playwright/test` import—`import { expect, test, type Page } from "@playwright/test"`—at its top. It imports `InterfaceLanguage` exactly once and only from `@/app/copy-types`; it has no local declaration, alias, fixture re-export import, or second Playwright import:

```ts
import { expect, test, type Page } from "@playwright/test"
import type { InterfaceLanguage } from "@/app/copy-types"
import { seedLibrary, seedTranscript, type SeedLibraryOptions, type SeedTranscriptOptions } from "./fixtures/database"
import { installDriveFixture, openIdentityState, openSyncState, type DriveFixtureOptions, type DriveIdentityFixtureState, type DriveSyncFixtureState } from "./fixtures/drive"
import { installRuntimeFixture, openWorkbenchState, type WorkbenchFixtureState } from "./fixtures/runtime"
import { openSettingsState, type SettingsFixtureState } from "./fixtures/settings"
import { VIEWPORTS, assertNoAxeBlockers, assertNoPositiveTabIndex, assertNoPageOverflow, assertTouchTargets, setInterfaceLanguage } from "./fixtures/accessibility"

const fixtureTypeCheck: {
  library: SeedLibraryOptions
  transcript: SeedTranscriptOptions
  drive: DriveFixtureOptions
  identity: DriveIdentityFixtureState
  sync: DriveSyncFixtureState
  workbench: WorkbenchFixtureState
  settings: SettingsFixtureState
} = {
  library: { count: 1 },
  transcript: { segmentCount: 1 },
  drive: {},
  identity: "menu",
  sync: "toast",
  workbench: "empty",
  settings: "default",
}
void fixtureTypeCheck

type MatrixCase = {
  id: `A11Y-AUTO-0${1 | 2 | 3 | 4 | 5 | 6 | 7}`
  state: string
  prepare: (page: Page, language: InterfaceLanguage) => Promise<void>
}

const matrixCases: readonly MatrixCase[] = [
  ...(["empty", "review", "active", "failed"] as const).map((state) => ({
    id: "A11Y-AUTO-01" as const,
    state,
    prepare: async (page: Page, language: InterfaceLanguage) => {
      await installRuntimeFixture(page)
      await openWorkbenchState(page, state, language)
    },
  })),
  {
    id: "A11Y-AUTO-02",
    state: "queue-sheet",
    prepare: async (page, language) => {
      await installRuntimeFixture(page)
      await openWorkbenchState(page, "queue-sheet", language)
    },
  },
  ...(["empty", "populated", "filtered"] as const).map((state) => ({
    id: "A11Y-AUTO-03" as const,
    state,
    prepare: async (page: Page, language: InterfaceLanguage) => {
      await seedLibrary(page, { count: state === "empty" ? 0 : 12 })
      await page.goto("/?view=library")
      await setInterfaceLanguage(page, language)
      if (state === "filtered") await page.getByRole("searchbox").fill("no-match-value")
    },
  })),
  ...(["document", "timeline", "search", "save-error"] as const).map((state) => ({
    id: "A11Y-AUTO-04" as const,
    state,
    prepare: async (page: Page, language: InterfaceLanguage) => {
      const transcriptId = await seedTranscript(page, { segmentCount: 12, saveFails: state === "save-error" })
      await page.goto(`/?view=transcript&id=${encodeURIComponent(transcriptId)}`)
      await setInterfaceLanguage(page, language)
      if (state === "timeline") await page.getByRole("tab", { name: /timeline|dòng thời gian/i }).click()
      if (state === "search") await page.getByRole("searchbox").fill("segment")
      if (state === "save-error") {
        await page.getByLabel(/title|tiêu đề/i).fill("Save failure")
        await expect(page.locator("[data-save-state]")).toContainText(/attention|chú ý/i)
      }
    },
  })),
  ...(["default", "validation"] as const).map((state) => ({
    id: "A11Y-AUTO-05" as const,
    state,
    prepare: async (page: Page, language: InterfaceLanguage) => openSettingsState(page, state, language),
  })),
  ...(["menu", "auth-error", "revoke-unconfirmed", "account-switch"] as const).map((state) => ({
    id: "A11Y-AUTO-06" as const,
    state,
    prepare: async (page: Page, language: InterfaceLanguage) => {
      await installDriveFixture(page, { identity: state })
      await openIdentityState(page, state, language)
    },
  })),
  ...(["attention", "conflict", "toast"] as const).map((state) => ({
    id: "A11Y-AUTO-07" as const,
    state,
    prepare: async (page: Page, language: InterfaceLanguage) => {
      await installDriveFixture(page, { sync: state })
      await openSyncState(page, state, language)
    },
  })),
]

for (const matrixCase of matrixCases) {
  for (const language of ["en", "vi"] as const) {
    for (const viewport of VIEWPORTS) {
      test(`${matrixCase.id} ${matrixCase.state} ${language} ${viewport.id}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await matrixCase.prepare(page, language)
        await assertNoAxeBlockers(page)
        await assertNoPositiveTabIndex(page)
        await assertNoPageOverflow(page)
        if (viewport.width <= 390) await assertTouchTargets(page)
      })
    }
  }
}
```

`seedLibrary(page, options)` and `seedTranscript(page, options)` are owned by `tests/e2e/fixtures/database.ts`; `options.count`, `options.updatedAtStart`, `options.segmentCount`, `options.saveFails`, and `options.transcriptId` are the complete option fields. `installRuntimeFixture(page)` and `openWorkbenchState(page, state, language)` are owned by `tests/e2e/fixtures/runtime.ts`. `installDriveFixture(page, options?)`, `openIdentityState(page, state, language)`, and `openSyncState(page, state, language)` are owned by `tests/e2e/fixtures/drive.ts`. `openSettingsState(page,state,language)` is owned by `tests/e2e/fixtures/settings.ts`. Import actual functions and types verbatim; no bodyless export, ambient declaration, duplicate interface, or local fixture signature is permitted. A missing export blocks Phase 6: stop and amend its owning Phase 1, 3, 4, or 5 plan before proceeding. Every state opener awaits the exact visible state named by its argument before returning.

- [ ] **Step 2.2: Run each family separately and record exact red evidence**

```bash
pnpm playwright test tests/e2e/accessibility.spec.ts --grep "A11Y-AUTO-01" --project=chromium --reporter=list
pnpm playwright test tests/e2e/accessibility.spec.ts --grep "A11Y-AUTO-02" --project=chromium --reporter=list
pnpm playwright test tests/e2e/accessibility.spec.ts --grep "A11Y-AUTO-03" --project=chromium --reporter=list
pnpm playwright test tests/e2e/accessibility.spec.ts --grep "A11Y-AUTO-04" --project=chromium --reporter=list
pnpm playwright test tests/e2e/accessibility.spec.ts --grep "A11Y-AUTO-05" --project=chromium --reporter=list
pnpm playwright test tests/e2e/accessibility.spec.ts --grep "A11Y-AUTO-06" --project=chromium --reporter=list
pnpm playwright test tests/e2e/accessibility.spec.ts --grep "A11Y-AUTO-07" --project=chromium --reporter=list
```

Expected red: a selected state reports its actual serious/critical axe node, overflow measurement, positive tabindex, or undersized target. Fixture timeout/syntax failure is not valid red; repair fixture setup before product code.

- [ ] **Step 2.3: Gate any semantic product defect**

When a focused matrix family is green, record the task as tests-only. When it is red because of product behavior, stop and record the exact axe node/assertion, owner path, and owning component/function/selector from the map above; obtain a reviewed plan amendment before editing. Fixture timeout, syntax, or setup failure may be corrected only in the test file already listed by the task. Required already-planned shell shape:

```tsx
<>
  <a className="skip-link" href="#main-content">{copy.skipToContent}</a>
  <header>{header}</header>
  <nav aria-label={copy.primaryNavigation}>{navigation}</nav>
  <main id="main-content" tabIndex={-1}>
    <h1 ref={routeHeadingRef} tabIndex={-1}>{pageTitle}</h1>
    {routeContent}
  </main>
</>
```

Required route-focus operation remains inside the existing navigator callback:

```ts
requestAnimationFrame(() => {
  const heading = document.querySelector<HTMLElement>("main h1")
  heading?.focus({ preventScroll: true })
})
```

Required icon/reorder controls use existing localized copy and no positive tabindex:

```tsx
<button
  type="button"
  className="touch-target"
  aria-label={copy.moveEarlier({ name: item.displayName })}
  disabled={!canMoveEarlier}
  onClick={() => onMove(item.id, "earlier")}
>
  <ArrowUp aria-hidden="true" />
</button>
```

Do not add `aria-label` to a control that already has an unambiguous visible accessible name. Do not add ARIA that contradicts native semantics.

- [ ] **Step 2.4: Rerun focused family, adjacent feature suite, then all matrix cases**

Run the failed family command first, then its owning Phase 1–5 suite, then:

```bash
pnpm playwright test tests/e2e/accessibility.spec.ts --project=chromium --reporter=list
```

Expected: all generated EN/VI desktop/390/320 cases pass; zero fixture retries; zero critical/serious violations; no page overflow, positive tabindex, or undersized tested mobile target.

- [ ] **Step 2.5: Stage exact changed paths and commit**

Stage `tests/e2e/accessibility.spec.ts` and only Phase 6-owned harness/config files actually changed. Never stage `tests/e2e/fixtures/database.ts`, `tests/e2e/fixtures/runtime.ts`, `tests/e2e/fixtures/drive.ts`, or product files. Inspect staged path list and patch. Commit:

```bash
git commit -m "test(a11y): cover precision studio states"
```

Expected: staged paths contain tests, fixtures, snapshots, or test configuration only. No Phase 1–5 product path, including presentation owners, is staged; no schema/runtime/Drive public type changes exist.

### Task 3: Harden keyboard, focus, combobox, queue sheet, reorder, and live regions

**Files:**
- Modify: `tests/e2e/accessibility.spec.ts`
- Product behavior is not an implementation target. A red result follows the stop-and-record procedure.

- [ ] **Step 3.1: Add keyboard/focus observable tests**

Add tests covering first-focus skip link, route heading focus, combobox Arrow/Home/End/Enter/Escape and restoration, sheet trap/Escape/close/restore, reorder announcement, and no positive tabindex. Use role/name selectors only. For the skip-link assertion, navigate or reload to a fresh document and perform no click, locator focus, or keyboard input before the single `Tab`; `Home` does not move focus and is never part of skip-link setup. Required focused assertions:

```ts
test("A11Y-KBD-01 and A11Y-FOCUS-01 preserve focus contracts", async ({ page }) => {
  await page.goto("/?view=workbench")
  await page.keyboard.press("Tab")
  await expect(page.getByRole("link", { name: /skip to content/i })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.locator("#main-content")).toBeFocused()

  await installRuntimeFixture(page)
  await openWorkbenchState(page, "queue-sheet", "en")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: /open queue/i })).toBeFocused()

  const language = page.getByRole("combobox", { name: /transcription language/i })
  await expect(language).toHaveAttribute("aria-expanded", "false")
  await expect(language).not.toHaveAttribute("aria-activedescendant")
  await language.click()
  await expect(language).toHaveAttribute("aria-expanded", "true")
  const languageListboxId = await language.getAttribute("aria-controls")
  expect(languageListboxId).toBeTruthy()
  const languageSearch = page.getByRole("searchbox", { name: /search/i })
  await expect(languageSearch).toBeFocused()
  await expect(languageSearch).toHaveAttribute("aria-controls", languageListboxId!)
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("End")
  const activeId = await languageSearch.getAttribute("aria-activedescendant")
  expect(activeId).toBeTruthy()
  await expect(language).not.toHaveAttribute("aria-activedescendant")
  await expect(page.locator(`#${activeId}`)).toHaveRole("option")
  await page.keyboard.press("Escape")
  await expect(language).toBeFocused()

  const moveLater = page.getByRole("button", { name: /move .* later/i }).first()
  await moveLater.click()
  await expect(page.locator('[aria-live="polite"]')).toContainText(/position 2/i)
  await assertNoPositiveTabIndex(page)
})
```

Repeat locale-facing names in a VI test. Add route-navigation assertions for Workbench→Library→Transcript→Settings and overlay restoration for menu, dialog, popover, and sheet.

- [ ] **Step 3.2: Verify red**

```bash
pnpm playwright test tests/e2e/accessibility.spec.ts --grep "A11Y-KBD-01|A11Y-FOCUS-01" --project=chromium --reporter=list
```

Expected red: first unmet focus/keyboard assertion fails with exact active element or missing announcement. A strict-locator ambiguity is a product/test-contract defect; fix semantic uniqueness rather than adding `.first()` unless the assertion deliberately addresses the first ordered queue item.

- [ ] **Step 3.3: Record or proceed without product changes**

Use existing public queue and progress behavior only for assertions. If a required movement announcement, focus restoration, live-region throttle, or cancellation distinction is absent, stop and create the exact `phase-6-product-defect-<scenario>.md` record. Do not implement or stage the queue, progress, or product owner. Tests must still assert that phase changes announce immediately, progress announcements are throttled, cancellation request/completion remain distinct, and live regions contain no token, authorization header, source content, provider body, or Drive file ID.

- [ ] **Step 3.4: Run focused and adjacent suites**

```bash
pnpm playwright test tests/e2e/accessibility.spec.ts --grep "A11Y-KBD-01|A11Y-FOCUS-01" --project=chromium --reporter=list
pnpm vitest run tests/components/workbench.test.tsx tests/components/queue.test.tsx tests/components/transcript-editor.test.tsx
pnpm playwright test tests/e2e/workbench.spec.ts tests/e2e/runtime-queue.spec.ts tests/e2e/editor-save.spec.ts --project=chromium --reporter=list
```

Expected: all commands exit 0. Queue boundaries remain disabled, running items remain immovable, sheet restores its trigger, route `h1` receives focus, no-result search retains search input focus, and no positive tabindex exists.

- [ ] **Step 3.5: Execute manual semantic checklists in EN and VI**

Record PASS/FAIL and browser/OS/screen-reader in implementation evidence. Every row is mandatory:

**`A11Y-KBD-01`**

- [ ] Skip link is first Tab stop, visible on focus, and moves focus to `main`.
- [ ] Header, desktop/mobile navigation, File/Link, review, start, cancel, retry, Library actions, editor tabs/search/edit/split/merge/undo/export, Settings, identity, conflict, Retry/Discard, dialogs, and sheets work without pointer.
- [ ] Focus indicator remains visible and unclipped at every stop.
- [ ] Queue reorder buttons expose disabled first/last boundaries and announce new position.
- [ ] Queue sheet traps Tab/Shift+Tab, closes through Escape and visible close button, and restores trigger.

**`A11Y-FOCUS-01`**

- [ ] Every route change focuses its visible `h1` without surprise scroll.
- [ ] Menu, combobox, dialog, and sheet restore trigger focus.
- [ ] No-result search keeps input focus and announces zero results.
- [ ] Dirty Back/Forward Retry/Discard returns focus to failed action.
- [ ] Mutation-driven search reset announces/focuses current match without moving page unexpectedly.

**`A11Y-LIVE-01`**

- [ ] Phase change announces immediately; progress does not announce every worker event.
- [ ] Cancel requested and cancelled are separate announcements.
- [ ] Queue movement, zero/current search result, save, sync, blocking error, and confirmation announce once with required politeness.
- [ ] No live output contains access token, authorization header, source content, response body, or raw Drive ID.

**`A11Y-SR-01`**

- [ ] Landmarks/headings and labeled navigation are discoverable.
- [ ] Route change, combobox active option/result count, stage current/completed state, queue position, editor segment/timestamp context, search count/current match, save/sync text, conflict choice, and revoke-unconfirmed permissions link are understandable.

- [ ] **Step 3.6: Stage exact files and commit**

```bash
git add tests/e2e/accessibility.spec.ts
git diff --cached --name-only
git diff --cached
git commit -m "test(a11y): verify keyboard and focus behavior"
```

Expected: Git stages only changed content among these exact existing paths; unchanged paths add nothing.

### Task 4: Prove 320/390/200% reflow, touch, safe areas, and virtual keyboard behavior

**Files:**
- Modify: `tests/e2e/accessibility.spec.ts`
- Product layout defects are stop-and-record events; no stylesheet or product owner is editable or stageable in Phase 6.

- [ ] **Step 4.1: Add automated reflow and keyboard tests**

Add one loop over Workbench review/active/failed, queue sheet, Library populated, editor Document/Timeline/save-error, Settings validation, and sync attention. For 320 and 390, assert document width, critical rectangles, 44 px targets, and no fixed-width popover escape. Add 200% through a 640 CSS-pixel browser surface with `deviceScaleFactor: 1` and Chromium `Emulation.setPageScaleFactor` set to 2; effective CSS viewport is 320.

Use this exact overflow assertion:

```ts
const overflow = await page.evaluate(() => ({
  page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  offenders: [...document.querySelectorAll<HTMLElement>("body *")]
    .filter((element) => {
      const rect = element.getBoundingClientRect()
      return rect.left < -0.5 || rect.right > document.documentElement.clientWidth + 0.5
    })
    .map((element) => element.outerHTML),
}))
expect(overflow.page).toBeLessThanOrEqual(0)
expect(overflow.offenders).toEqual([])
```

For the virtual keyboard case, set `window.visualViewport` through the Phase 4 viewport fixture to a reduced height, focus the active editor field, and assert `[data-save-state]`, `[data-error-recovery]`, and `[data-critical-action]` remain inside the visual viewport. A passing sticky/natural layout is tests-only. A failing visibility assertion stops the task; record `src/features/transcript-editor/TranscriptPage.tsx`, its page-layout/save-state owner, and the exact measurement, then obtain a reviewed plan amendment. Never invent a visual-viewport production subsystem.

- [ ] **Step 4.2: Run focused tests and verify red**

```bash
pnpm playwright test tests/e2e/accessibility.spec.ts --grep "A11Y-REFLOW-01|touch targets|safe area|virtual keyboard" --project=chromium --reporter=list
```

Expected red: exact offending element, measured target, or hidden critical rectangle is printed. No screenshot-only red qualifies.

- [ ] **Step 4.3: Gate any stylesheet/layout product defect**

When the focused reflow suite is green, record this step as tests-only. For a product-owned red, create the exact review record with assertion, computed measurement, owner path, selector/component, viewport, and captured output; stop and request a reviewed plan amendment. Do not edit CSS or layout, add an overflow workaround, or stage a product owner. Tests must observe the existing no-overflow, safe-area, target-size, and natural-height contracts.

- [ ] **Step 4.4: Run focused and adjacent suites**

```bash
pnpm playwright test tests/e2e/accessibility.spec.ts --grep "A11Y-REFLOW-01|touch targets|safe area|virtual keyboard" --project=chromium --reporter=list
pnpm playwright test tests/e2e/workbench.spec.ts tests/e2e/library.spec.ts tests/e2e/editor-save.spec.ts --project=chromium --reporter=list
```

Expected: zero page overflow at 320/390/effective-320-at-200%; every tested interactive target is at least 44×44 CSS px; active editor field, save/error state, and primary action stay visible; no hover-only action.

- [ ] **Step 4.5: Run manual `A11Y-REFLOW-01` in EN and VI**

- [ ] Browser zoom 200% on desktop: no horizontal page scroll or clipped critical state.
- [ ] 320×720 and 390×844: Workbench, queue sheet, Library, editor, Settings, identity, and conflict remain complete.
- [ ] iOS/WebKit and Android/Chromium safe-area simulation: bottom navigation/sheet controls clear inset.
- [ ] Mobile virtual keyboard: active field, save/error recovery, and completion action remain reachable.
- [ ] Combobox uses available width and collision handling; no fixed minimum width escapes viewport.

- [ ] **Step 4.6: Stage exact files and commit**

Inspect exact files, then commit:

```bash
git add tests/e2e/accessibility.spec.ts
git diff --cached --name-only
git diff --cached
git commit -m "test(a11y): verify responsive feature flows"
```

### Task 5: Enforce EN/VI compile-time parity and hardcoded-English exclusion

**Files:**
- Create: `tests/unit/i18n.test.ts`
- Modify: `tests/e2e/navigation-i18n.spec.ts`
- Product-copy defects are stop-and-record events; no copy module or component is editable or stageable in Phase 6.

- [ ] **Step 5.1: Write parity and source-scan tests**

Create `tests/unit/i18n.test.ts` with a recursive key comparison over exported localized copy registries and a source scan that excludes proper nouns, technical IDs, model names, URLs, test files, and code-only diagnostics. The scan must inspect `src/app`, `src/components/product`, and `src/features`, reject JSX text and user-facing accessibility/title/placeholder strings, and print exact path/line/content. Add an import-graph sentinel: `src/app/copy-types.ts` imports no feature or `src/app/copy.ts`; each exact feature copy module imports helper/types from `@/app/copy-types` and never `@/app/copy`; `src/app/copy.ts` imports all four exact feature copy modules and exports the sole registry. Reject duplicate `InterfaceLanguage`, `defineCopy`, `CopyRegistry`, `COPY_REGISTRY`, and every stale `UiLanguage` declaration/import/export/type reference in product source. Use the Phase 1 shared copy registry export; do not inspect private copy objects for parity.

Core parity assertion:

```ts
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { COPY_REGISTRY } from "@/app/copy"

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value === "function" || typeof value === "string") return [prefix]
  if (value === null || typeof value !== "object") return []
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key))
}

const SOURCE_ROOTS = ["src/app", "src/components/product", "src/features"] as const
const USER_FACING_PROP = /\b(?:aria-label|title|placeholder|alt)\s*=\s*["']([A-Za-z][^"']*)["']/g
const JSX_TEXT = />\s*([A-Za-z][A-Za-z0-9 ,.'’!?():/+-]{2,})\s*</g
const ALLOWED_LITERAL = /^(?:Whisdom|Google|Google Drive|WebGPU|WASM|ONNX|SRT|VTT|TXT|JSON|EN|VI|http|https)$/
const STALE_UI_LANGUAGE_ALIAS = /\bUiLanguage\b/g

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(fullPath)
    return /\.tsx?$/.test(entry.name) ? [fullPath] : []
  })
}

function lineNumber(source: string, index: number): number {
  return source.slice(0, index).split("\n").length
}

function hardcodedEnglish(): string[] {
  return SOURCE_ROOTS.flatMap((root) => sourceFiles(root)).flatMap((file) => {
    const source = fs.readFileSync(file, "utf8")
    return [USER_FACING_PROP, JSX_TEXT].flatMap((pattern) => {
      pattern.lastIndex = 0
      return [...source.matchAll(pattern)].flatMap((match) => {
        const text = match[1].trim()
        if (ALLOWED_LITERAL.test(text) || /^https?:|^[A-Z0-9_.:/-]+$/.test(text)) return []
        return [`${file}:${lineNumber(source, match.index ?? 0)}:${text}`]
      })
    })
  })
}

function staleUiLanguageAliases(): string[] {
  return sourceFiles("src").flatMap((file) => {
    const source = fs.readFileSync(file, "utf8")
    STALE_UI_LANGUAGE_ALIAS.lastIndex = 0
    return [...source.matchAll(STALE_UI_LANGUAGE_ALIAS)].map(
      (match) => `${file}:${lineNumber(source, match.index ?? 0)}:${match[0]}`,
    )
  })
}

describe("I18N-01", () => {
  it("keeps every registered EN and VI copy key in parity", () => {
    for (const [feature, copy] of Object.entries(COPY_REGISTRY)) {
      expect(keys(copy.vi).sort(), feature).toEqual(keys(copy.en).sort())
    }
  })

  it("keeps user-facing English out of product source", () => {
    expect(hardcodedEnglish()).toEqual([])
  })

  it("uses InterfaceLanguage as the sole interface-language type", () => {
    expect(staleUiLanguageAliases()).toEqual([])
    const types = fs.readFileSync("src/features/transcription/types.ts", "utf8")
    const language = fs.readFileSync("src/features/transcription/language.ts", "utf8")
    expect(types).toMatch(/import type \{ InterfaceLanguage \} from ["']@\/app\/copy-types["']/)
    expect(types).toMatch(/uiLanguage:\s*InterfaceLanguage/)
    expect(language).toMatch(/import type \{ InterfaceLanguage \} from ["']@\/app\/copy-types["']/)
  })
})
```

Import the exact Phase 1 registry export `COPY_REGISTRY` from `@/app/copy`; do not add a duplicate registry or inspect private feature copy objects.

- [ ] **Step 5.2: Verify red**

```bash
pnpm vitest run tests/unit/i18n.test.ts
pnpm playwright test tests/e2e/navigation-i18n.spec.ts --grep "I18N-01" --project=chromium --reporter=list
```

Expected red: missing locale key or exact hardcoded user-facing English path/line; browser test reports visible English leakage or state reset after language switch.

- [ ] **Step 5.3: Gate any product-copy defect**

When `tests/unit/i18n.test.ts` is green, record this step as tests-only. For a product-copy red, stop and record the exact literal/key, source path, owning copy table, call site, and failing assertion; obtain a reviewed plan amendment before editing. The ownership map remains: helper/types and `InterfaceLanguage` in `src/app/copy-types.ts`; shell/navigation/error and Settings copy plus registry composition in `src/app/copy.ts`; Workbench in `src/features/workbench/copy.ts`; editor in `src/features/transcript-editor/copy.ts`; Library in `src/features/library/copy.ts`; Drive in `src/features/google-drive/copy.ts`. Feature copy modules import only `copy-types.ts`, never the registry. No `src/features/settings/copy.ts` exists. No executor may add a counterpart or alter a call site without that amendment. Preserve proper nouns, model IDs, filenames, URLs, stable codes, and state across language switching.

- [ ] **Step 5.4: Run focused and adjacent suites**

```bash
pnpm vitest run tests/unit/i18n.test.ts
pnpm playwright test tests/e2e/navigation-i18n.spec.ts --project=chromium --reporter=list
pnpm vitest run tests/components/navigation.test.tsx tests/components/workbench.test.tsx tests/components/transcript-editor.test.tsx tests/components/drive-identity.test.tsx tests/components/drive-sync.test.tsx
```

Expected: all commands exit 0; parity scan finds no user-facing hardcoded English; switching EN↔VI changes copy/formatting without resetting feature state.

- [ ] **Step 5.5: Stage exact files and commit**

```bash
git add tests/unit/i18n.test.ts tests/e2e/navigation-i18n.spec.ts
git diff --cached --name-only
git diff --cached
git commit -m "test(i18n): enforce bilingual product copy"
```

### Task 6: Prove lazy request graph and deferred heavy assets (`PERF-01`)

**Files:**
- Modify: `tests/e2e/fixtures/performance.ts`
- Modify: `tests/e2e/performance.spec.ts`
- Route import defects are stop-and-record events; no application product file is editable or stageable in Phase 6.

- [ ] **Step 6.1: Add request/chunk observations**

In `tests/e2e/fixtures/performance.ts`, export a collector that records request URLs from before navigation and classifies Vite chunks, model/ONNX, ffmpeg, editor/search, and lazy routes. Keep request matching explicit:

```ts
export const HEAVY_REQUEST = /(?:onnx|transformers|ffmpeg|\.wasm(?:\?|$)|whisper-[^/]+\.(?:onnx|bin))/i
export const ROUTE_CHUNK = {
  library: /LibraryPage-[A-Za-z0-9_-]+\.js/,
  transcript: /TranscriptPage-[A-Za-z0-9_-]+\.js/,
  settings: /SettingsPage-[A-Za-z0-9_-]+\.js/,
} as const

export function collectRequests(page: import("@playwright/test").Page): string[] {
  const urls: string[] = []
  page.on("request", (request) => urls.push(request.url()))
  return urls
}
```

- [ ] **Step 6.2: Write `PERF-01` red test**

Assert initial Workbench excludes all three lazy chunks and every heavy request; each route requests exactly its chunk on demand; explicit Transcribe is the first action allowed to request model/ONNX/ffmpeg assets.

- [ ] **Step 6.3: Build then run red test**

```bash
pnpm build
pnpm playwright test tests/e2e/performance.spec.ts --grep "PERF-01" --project=chromium --reporter=list
```

Expected red: request list prints an eager route/heavy URL or missing distinct lazy chunk. A dev-server module URL is not accepted as production chunk evidence; Playwright already starts built preview.

- [ ] **Step 6.4: Verify import boundaries and record product red**

Required existing route imports remain direct `React.lazy` boundaries:

```ts
const LibraryPage = React.lazy(() => import("@/features/library/LibraryPage"))
const TranscriptPage = React.lazy(() => import("@/features/transcript-editor/TranscriptPage"))
const SettingsPage = React.lazy(() => import("@/features/settings/SettingsPage"))
```

Verify editor/search-only imports behind `TranscriptPage`, Library query/list imports behind `LibraryPage`, and settings-only imports behind `SettingsPage`. If the request graph fails, stop and record the owning product import boundary; do not repair it in Phase 6.

- [ ] **Step 6.5: Run focused and adjacent suites**

```bash
pnpm build
pnpm playwright test tests/e2e/performance.spec.ts --grep "PERF-01" --project=chromium --reporter=list
pnpm playwright test tests/e2e/navigation-i18n.spec.ts tests/e2e/workbench.spec.ts --project=chromium --reporter=list
```

Expected: distinct Library/editor/Settings chunks exist; initial Workbench requests none; no ASR/ffmpeg/model/ONNX/WASM request occurs before explicit Transcribe.

- [ ] **Step 6.6: Stage and commit**

```bash
git add tests/e2e/fixtures/performance.ts tests/e2e/performance.spec.ts
git diff --cached --name-only
git diff --cached
git commit -m "perf(test): enforce lazy request boundaries"
```

### Task 7: Prove render isolation, thresholds, yielding, and Drive concurrency (`PERF-02..03`)

**Files:**
- Create: `tests/components/progress-profiler.test.tsx`
- Modify: `tests/e2e/fixtures/performance.ts`
- Modify: `tests/e2e/performance.spec.ts`
- Modify: `tests/unit/drive-reconcile.test.ts`
- Profiler, virtualization, scheduler, and Drive-concurrency product defects are stop-and-record events; no product owner is editable or stageable in Phase 6.

- [ ] **Step 7.1: Write the 100-update profiler test**

Mount integrated shell regions using the existing runtime/sync external stores. Wrap Header, primary navigation, mounted Library, and progress regions in separate `Profiler` instances. After initial mount, clear counters, publish 100 throttled progress snapshots, flush timers, then assert header/nav/Library counts are zero and progress count is greater than zero.

Required assertion body:

```ts
expect(commits.header).toBe(0)
expect(commits.navigation).toBe(0)
expect(commits.library).toBe(0)
expect(commits.progress).toBeGreaterThan(0)
```

Use fake timers only around the presentation throttle and restore real timers in the same test `try/finally`. Do not add an `afterEach` cleanup path. Do not mock React Profiler.

- [ ] **Step 7.2: Run `PERF-02` and verify red**

```bash
pnpm vitest run tests/components/progress-profiler.test.tsx
```

Expected red: an unrelated subtree count is greater than zero, or progress never commits. Log exact counters.

- [ ] **Step 7.3: Gate any profiler product defect**

When `tests/components/progress-profiler.test.tsx` is green, record this step as tests-only. When it is red, stop and record exact counters, the broad subscription owner/function, and whether `src/features/google-drive/sync-service.ts` or `src/features/workbench/RunProgress.tsx` emitted the commit. Obtain a reviewed plan amendment before changing selectors, subscriptions, props, or callbacks. Do not move runtime ownership into React or create a global state dependency.

- [ ] **Step 7.4: Add exact virtualization tests**

Import `makeLibraryRecords` and `makeTimelineSegments` from `tests/e2e/fixtures/performance.ts`. Generate exactly 200 and 201 filtered Library rows, and exactly 500 and 501 render-capable Timeline segments. Assert 200/500 may render nonvirtual content and 201/501 activate the existing TanStack Virtual owner. Then call `makeLibraryRecords(1000)` and `makeTimelineSegments(5000)` to verify bounded DOM node count, keyboard reachability, and focus continuity after scrolling. These Phase 4 exports retain their exact argument and return contracts; Phase 6 adds no replacement generators.

Required threshold predicates in production remain:

```ts
const virtualizeLibrary = filteredRows.length > 200
const virtualizeTimeline = renderableSegments.length > 500
```

- [ ] **Step 7.5: Add deterministic 8 ms scheduler and fallback tests**

Use the fixture monotonic clock to advance one millisecond per work unit. With `globalThis.scheduler.yield` installed, assert each chunk yields once elapsed work reaches 8 ms. Remove scheduler and idle callbacks, spy on `setTimeout`, and assert `setTimeout(0)` splits large work across multiple tasks. Terminal search result/order must match synchronous reference output.

The exact helpers remain owned by their Phase 4 modules. Phase 6 tests only observe monotonic 8 ms yielding and the `setTimeout(0)` fallback. If either contract fails, create the exact review record and stop; do not add a scheduler module or modify the Phase 4 product files.

- [ ] **Step 7.6: Add Drive cap/serialization observations**

Modify `tests/unit/drive-reconcile.test.ts` with 12 pending downloads across three transcript IDs. Count active downloads and record create intervals keyed by transcript ID. Assert exact peak download concurrency `4`; same-transcript create intervals never overlap; at least two different transcript IDs may overlap under the existing scheduler; every create retains its original generated ID, candidate hash, frozen body bytes, and per-transcript order. Assert no protocol field/body/order changes. This is an explicitly allowed existing-test edit only; `src/features/google-drive/reconcile.ts` and Phase 5 fixtures remain unchanged.

Expected result is tests-only because Phase 5 owns the cap. If the observation proves the cap absent or create serialization broken, create the exact review record with `src/features/google-drive/reconcile.ts`, the exact download/create function, measured concurrency, and failing assertion; stop and request a reviewed plan amendment. Do not add or move a semaphore in Phase 6. The test observes the existing per-transcript publication-operation key and four-download limit.

- [ ] **Step 7.7: Run red/green and adjacent suites**

```bash
pnpm vitest run tests/components/progress-profiler.test.tsx
pnpm playwright test tests/e2e/performance.spec.ts --grep "PERF-02|PERF-03" --project=chromium --reporter=list
pnpm vitest run tests/unit/editor-search.test.ts tests/unit/library.test.ts tests/unit/drive-reconcile.test.ts
pnpm playwright test tests/e2e/library.spec.ts tests/e2e/editor-save.spec.ts tests/e2e/drive-sync.spec.ts --project=chromium --reporter=list
```

Expected: zero unrelated profiler commits across 100 updates; exact >200/>500 thresholds; bounded DOM with 1,000/5,000 fixtures; scheduler and `setTimeout(0)` both split work at 8 ms; output/order unchanged; maximum Drive downloads four; same-transcript creates never overlap.

- [ ] **Step 7.8: Stage exact files and commit**

```bash
git add tests/components/progress-profiler.test.tsx tests/e2e/fixtures/performance.ts tests/e2e/performance.spec.ts tests/unit/drive-reconcile.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "perf(test): enforce render and scheduler isolation"
```

### Task 8: Verify themes, reduced motion, contrast, and `VIS-01`

**Files:**
- Create: `tests/e2e/visual-regression.spec.ts`
- Modify: `tests/e2e/accessibility.spec.ts`
- Create: `tests/e2e/visual-baselines/ownership-manifest.json`
- Theme and style product defects are stop-and-record events; no stylesheet or presentation owner is editable or stageable in Phase 6.
- Create only through Playwright update command: designated Chromium snapshot files under `tests/e2e/visual-regression.spec.ts-snapshots/`

- [ ] **Step 8.1: Add theme and motion assertions**

Test Light, Dark, and System. For System, emulate light, select System, assert resolved light; emulate dark, assert resolved dark without resetting route/state. Emulate `reducedMotion: "reduce"`, inspect representative sheet, stage transition, queue reorder, and editor scroll targets, and assert animation/transition durations resolve to zero-equivalent while state changes remain immediate.

- [ ] **Step 8.2: Add `A11Y-CONTRAST-01`**

Run axe color-contrast rules in resolved Light and Dark for sampled body text, muted text, controls, focus, disabled, critical, success, warning, and textual/non-color status states. Manually inspect focus ring against adjacent colors because automated contrast does not fully prove WCAG 2.2 focus appearance.

- [ ] **Step 8.3: Commit the exact ownership manifest and failing manifest gate before baselines**

Use platform-neutral baseline names. Task 1's `playwright.config.ts` sets `snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}"`; visual arguments are exact `.png` basenames below, so no project, OS, slash, or absolute-path suffix enters the manifest. Visual locale is deliberately EN only: every `prepareVisualState` call passes `"en"`. Locale visual duplication is outside `VIS-01`; accessibility and behavior matrices still run both EN and VI.

Create `tests/e2e/visual-baselines/ownership-manifest.json` with this exact schema-version-1 JSON. Its paths are normalized relative to `tests/e2e/visual-regression.spec.ts-snapshots/`. It has 42 entries = seven states × three viewport IDs (`desktop`, `390`, `320`) × two themes (`light`, `dark`):

```json
{
  "schemaVersion": 1,
  "entries": [
    {"path":"empty-light-desktop.png","owner":"phase-6","scenario":"VIS-01:empty:light:desktop"},
    {"path":"empty-light-390.png","owner":"phase-6","scenario":"VIS-01:empty:light:390"},
    {"path":"empty-light-320.png","owner":"phase-6","scenario":"VIS-01:empty:light:320"},
    {"path":"empty-dark-desktop.png","owner":"phase-6","scenario":"VIS-01:empty:dark:desktop"},
    {"path":"empty-dark-390.png","owner":"phase-6","scenario":"VIS-01:empty:dark:390"},
    {"path":"empty-dark-320.png","owner":"phase-6","scenario":"VIS-01:empty:dark:320"},
    {"path":"review-light-desktop.png","owner":"phase-6","scenario":"VIS-01:review:light:desktop"},
    {"path":"review-light-390.png","owner":"phase-6","scenario":"VIS-01:review:light:390"},
    {"path":"review-light-320.png","owner":"phase-6","scenario":"VIS-01:review:light:320"},
    {"path":"review-dark-desktop.png","owner":"phase-6","scenario":"VIS-01:review:dark:desktop"},
    {"path":"review-dark-390.png","owner":"phase-6","scenario":"VIS-01:review:dark:390"},
    {"path":"review-dark-320.png","owner":"phase-6","scenario":"VIS-01:review:dark:320"},
    {"path":"active-light-desktop.png","owner":"phase-6","scenario":"VIS-01:active:light:desktop"},
    {"path":"active-light-390.png","owner":"phase-6","scenario":"VIS-01:active:light:390"},
    {"path":"active-light-320.png","owner":"phase-6","scenario":"VIS-01:active:light:320"},
    {"path":"active-dark-desktop.png","owner":"phase-6","scenario":"VIS-01:active:dark:desktop"},
    {"path":"active-dark-390.png","owner":"phase-6","scenario":"VIS-01:active:dark:390"},
    {"path":"active-dark-320.png","owner":"phase-6","scenario":"VIS-01:active:dark:320"},
    {"path":"failed-light-desktop.png","owner":"phase-6","scenario":"VIS-01:failed:light:desktop"},
    {"path":"failed-light-390.png","owner":"phase-6","scenario":"VIS-01:failed:light:390"},
    {"path":"failed-light-320.png","owner":"phase-6","scenario":"VIS-01:failed:light:320"},
    {"path":"failed-dark-desktop.png","owner":"phase-6","scenario":"VIS-01:failed:dark:desktop"},
    {"path":"failed-dark-390.png","owner":"phase-6","scenario":"VIS-01:failed:dark:390"},
    {"path":"failed-dark-320.png","owner":"phase-6","scenario":"VIS-01:failed:dark:320"},
    {"path":"library-light-desktop.png","owner":"phase-6","scenario":"VIS-01:library:light:desktop"},
    {"path":"library-light-390.png","owner":"phase-6","scenario":"VIS-01:library:light:390"},
    {"path":"library-light-320.png","owner":"phase-6","scenario":"VIS-01:library:light:320"},
    {"path":"library-dark-desktop.png","owner":"phase-6","scenario":"VIS-01:library:dark:desktop"},
    {"path":"library-dark-390.png","owner":"phase-6","scenario":"VIS-01:library:dark:390"},
    {"path":"library-dark-320.png","owner":"phase-6","scenario":"VIS-01:library:dark:320"},
    {"path":"editor-light-desktop.png","owner":"phase-6","scenario":"VIS-01:editor:light:desktop"},
    {"path":"editor-light-390.png","owner":"phase-6","scenario":"VIS-01:editor:light:390"},
    {"path":"editor-light-320.png","owner":"phase-6","scenario":"VIS-01:editor:light:320"},
    {"path":"editor-dark-desktop.png","owner":"phase-6","scenario":"VIS-01:editor:dark:desktop"},
    {"path":"editor-dark-390.png","owner":"phase-6","scenario":"VIS-01:editor:dark:390"},
    {"path":"editor-dark-320.png","owner":"phase-6","scenario":"VIS-01:editor:dark:320"},
    {"path":"sync-attention-light-desktop.png","owner":"phase-6","scenario":"VIS-01:sync-attention:light:desktop"},
    {"path":"sync-attention-light-390.png","owner":"phase-6","scenario":"VIS-01:sync-attention:light:390"},
    {"path":"sync-attention-light-320.png","owner":"phase-6","scenario":"VIS-01:sync-attention:light:320"},
    {"path":"sync-attention-dark-desktop.png","owner":"phase-6","scenario":"VIS-01:sync-attention:dark:desktop"},
    {"path":"sync-attention-dark-390.png","owner":"phase-6","scenario":"VIS-01:sync-attention:dark:390"},
    {"path":"sync-attention-dark-320.png","owner":"phase-6","scenario":"VIS-01:sync-attention:dark:320"}
  ]
}
```

`visual-regression.spec.ts` loads and strictly validates this JSON at module-level before defining screenshots: exact top-level keys, `schemaVersion === 1`, exactly 42 entries, exact entry keys/types, owner `phase-6`, scenario derived as `VIS-01:<state>:<theme>:<viewport>`, and path derived as `<state>-<theme>-<viewport>.png`. Paths must be NFC-normalized POSIX basenames matching `/^[a-z0-9]+(?:-[a-z0-9]+)*\.png$/`; reject `..`, `/`, `\\`, absolute paths, duplicates, and case-fold duplicates. Derive the expected 7×2×3 matrix in code and require exact equality with manifest entries on every invocation. Recursively enumerate actual `.png` files and normalize separators to `/`.

The pre-run validator has one explicit mode input, derived only from Playwright's CLI update-snapshots option. Normal mode requires exact equality among all 42 manifest, matrix, and disk paths; missing or extra files fail. Explicit update mode may omit any currently missing expected disk path so bootstrap can create it, but still rejects every extra disk file and every manifest/matrix/schema/name/owner/scenario/duplicate/traversal defect. Do not infer update mode from `CI`, missing files, environment variables, test title, or filesystem state. Register a post-generation validator after all `VIS-01` captures; it re-enumerates disk and requires exact 42-path equality with both manifest and matrix even in update mode. A generation run fails if any expected image remains missing or any extra appears.

Add focused `VIS-MANIFEST-01` tests around the pure pre-run and postcondition validators before generating images. Pass controlled in-memory entry/file lists and prove independently: normal mode rejects one missing path; normal mode rejects `unexpected.png`; explicit update mode accepts missing expected paths; explicit update mode still rejects `unexpected.png`; both modes reject duplicate and case-duplicate paths, `../escape.png`, absolute paths, changed owner, changed scenario, and path/name divergence; postcondition mode rejects one missing path and every extra and accepts only exact 42 equality. Also test CLI-mode detection: no flag is normal, exact `--update-snapshots` and `--update-snapshots=<value>` are explicit update, unrelated arguments are normal. A normal focused run before bootstrap still fails at module pre-run because actual baselines are missing; the explicit update run reaches the tests and generation path.

- [ ] **Step 8.4: Add `VIS-01` designated snapshots**

Create tests for exactly seven states: empty, review, active, failed, Library, editor, sync-attention. For each state, capture desktop, 390, and 320 in Light and Dark. Use `VISUAL_VIEWPORTS = [{id:"desktop",width:1440,height:1000},{id:"390",width:390,height:844},{id:"320",width:320,height:720}] as const`, stable fixture times/IDs/content, EN locale, hidden text caret, disabled nonessential motion, and only generated avatar Blob pixels masked. No other mask is allowed.

Snapshot test shape:

```ts
for (const state of ["empty", "review", "active", "failed", "library", "editor", "sync-attention"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const viewport of VISUAL_VIEWPORTS) {
      test(`VIS-01 ${state} ${theme} ${viewport.id}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await page.goto("/?view=workbench")
        await setResolvedTheme(page, theme)
        await prepareVisualState(page, state)
        await waitForExactVisualState(page, state)
        await assertProhibitedAesthetics(page)
        const manifestEntry = manifestEntryFor(state, theme, viewport.id)
        await expect(page).toHaveScreenshot(manifestEntry.path, {
          animations: "disabled",
          caret: "hide",
          fullPage: true,
          mask: [page.locator('[data-avatar-source="blob"]')],
        })
      })
    }
  }
}
```

Ordering is contractual for every manifest entry: establish viewport, navigate once, write theme/storage and reload through `setResolvedTheme`, verify resolved theme, then call `prepareVisualState`, wait through `waitForExactVisualState`, and capture without another reload. `prepareVisualState`, `waitForExactVisualState`, and screenshot code must not call `page.reload()`. This preserves volatile review, active, failed, and sync-attention state instead of resetting it after preparation.

Define `prepareVisualState` in `tests/e2e/visual-regression.spec.ts` with the exact Phase 4/3/5 fixture calls:

```ts
import { seedLibrary, seedTranscript } from "./fixtures/database"
import { installDriveFixture, openSyncState } from "./fixtures/drive"
import { installRuntimeFixture, openWorkbenchState } from "./fixtures/runtime"

async function prepareVisualState(
  page: import("@playwright/test").Page,
  state: "empty" | "review" | "active" | "failed" | "library" | "editor" | "sync-attention",
): Promise<void> {
  switch (state) {
    case "empty":
    case "review":
    case "active":
    case "failed":
      await installRuntimeFixture(page)
      await openWorkbenchState(page, state, "en")
      return
    case "library":
      await seedLibrary(page, { count: 12 })
      await page.goto("/?view=library")
      await page.getByRole("heading", { name: /library/i }).waitFor()
      return
    case "editor": {
      const transcriptId = await seedTranscript(page, { segmentCount: 12 })
      await page.goto(`/?view=transcript&id=${encodeURIComponent(transcriptId)}`)
      await page.locator("main h1").waitFor()
      return
    }
    case "sync-attention":
      await installDriveFixture(page, { sync: "attention" })
      await openSyncState(page, "attention", "en")
      return
    default: {
      const unreachable: never = state
      throw new Error(`unhandled visual state: ${unreachable}`)
    }
  }
}

async function waitForExactVisualState(
  page: import("@playwright/test").Page,
  state: "empty" | "review" | "active" | "failed" | "library" | "editor" | "sync-attention",
): Promise<void> {
  const selector = {
    empty: '[data-workbench-state="empty"]',
    review: '[data-workbench-state="review"]',
    active: '[data-workbench-state="active"]',
    failed: '[data-workbench-state="failed"]',
    library: '[data-testid="library-page"]',
    editor: '[data-testid="transcript-page"]',
    "sync-attention": '[data-sync-state="needs-attention"]',
  }[state]
  await page.locator(selector).waitFor({ state: "visible" })
}
```

- [ ] **Step 8.5: Run focused assertions before generating baselines**

```bash
pnpm playwright test tests/e2e/accessibility.spec.ts --grep "A11Y-CONTRAST-01|Light|Dark|System|reduced motion" --project=chromium --reporter=list
pnpm playwright test tests/e2e/visual-regression.spec.ts --grep "VIS-01" --project=chromium --reporter=list
```

Expected red: normal module-level pre-run reports the exact missing baseline set; accessibility may report any real contrast/theme/motion defect. Do not generate baselines until observable assertions pass. Synthetic validator tests execute during Step 8.7's explicit update command, where missing expected files alone are allowed.

- [ ] **Step 8.6: Gate any token/style product defect**

When contrast, theme, motion, and prohibited-style assertions are green, record this step as tests-only. For a product-owned red, stop and record the exact computed style/contrast result, selector, owner path, and assertion; obtain a reviewed plan amendment before editing. Any approved later repair preserves warm off-white/deep graphite, restrained cobalt, crisp rules, small radii, restrained elevation, Geist, system-safe mono, and the prohibited-aesthetic rules.

- [ ] **Step 8.7: Generate and review designated snapshots**

```bash
pnpm playwright test tests/e2e/visual-regression.spec.ts --grep "VIS-MANIFEST-01|VIS-01" --project=chromium --update-snapshots --reporter=list
pnpm playwright test tests/e2e/visual-regression.spec.ts --grep "VIS-MANIFEST-01|VIS-01" --project=chromium --reporter=list
```

Expected: first command's module-level pre-run validates schema/matrix/names and allows only missing expected files because explicit update mode is active. It runs all focused validator cases, generates 42 named snapshots, then its postcondition re-enumerates disk and proves exact 42 manifest/file/matrix equality. Second command runs in normal mode and requires exact equality before tests; all 42 snapshots plus `VIS-MANIFEST-01` pass. Review every image at full size. Reject clipped labels, card soup, empty ratio-preserving cards, hover-only actions, decorative gradients/glass/glow/neon/parallax, remote imagery/fonts, fake waveform data, weak hierarchy, wrong safe-area spacing, or theme inversion artifacts.

- [ ] **Step 8.8: Run manual contrast/theme/motion checklist in EN and VI**

- [ ] Body/muted text, controls, focus, disabled, critical, success, and warning meet WCAG 2.2 AA in Light and Dark.
- [ ] Every status includes text or icon-plus-accessible-name; color is never sole carrier.
- [ ] Light, Dark, and System remain visible choices; System tracks OS light/dark.
- [ ] Reduced motion removes spatial/nonessential animation and animated scrolling while preserving immediate state indication.
- [ ] Focus indicator remains visible against component and page background and is not clipped.

- [ ] **Step 8.9: Stage designated files only and commit**

Stage only `tests/e2e/visual-regression.spec.ts`, `tests/e2e/accessibility.spec.ts`, `tests/e2e/visual-baselines/ownership-manifest.json`, and all 42 exact `.png` basenames listed above under `tests/e2e/visual-regression.spec.ts-snapshots/`. Use explicit `git add` arguments generated from the validated manifest entries, then require 45 staged paths total: two specs + one manifest + 42 images. Never stage product owner files. Inspect every staged path; reject any unlisted baseline, trace, report, or ad hoc screenshot.

```powershell
$manifestPath = 'tests/e2e/visual-baselines/ownership-manifest.json'
$snapshotRoot = 'tests/e2e/visual-regression.spec.ts-snapshots'
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or $manifest.entries.Count -ne 42) { throw 'Visual manifest must contain exact schema version 1 and 42 entries' }
git add tests/e2e/visual-regression.spec.ts tests/e2e/accessibility.spec.ts $manifestPath
foreach ($entry in $manifest.entries) {
  if ($entry.path -notmatch '^[a-z0-9]+(?:-[a-z0-9]+)*\.png$') { throw "Invalid visual baseline path: $($entry.path)" }
  git add -- (Join-Path $snapshotRoot $entry.path)
}
if ((git diff --cached --name-only).Count -ne 45) { git diff --cached --name-only; throw 'Visual staging manifest must contain exactly 45 paths' }
git diff --cached --name-status
git diff --cached
git commit -m "test(ui): add precision studio visual gate"
```

### Task 9: Run cross-browser hardening and record-only review gate

**Files:**
- Modify: `playwright.config.ts` only for test-project configuration
- Modify: named Phase 6 tests/fixtures/configuration only
- Create only on a product-owned failure: exact `docs/superpowers/reviews/phase-6-product-defect-<scenario>.md`
- No product files, product owners, or other fixture/screenshot/document artifacts

- [ ] **Step 9.1: Run hardening suites in Firefox and WebKit**

```bash
pnpm playwright test tests/e2e/accessibility.spec.ts tests/e2e/navigation-i18n.spec.ts tests/e2e/performance.spec.ts --project=hardening-firefox --reporter=list
pnpm playwright test tests/e2e/accessibility.spec.ts tests/e2e/navigation-i18n.spec.ts tests/e2e/performance.spec.ts --project=hardening-webkit --reporter=list
```

Expected: both commands exit 0. No Chromium-only API is used without a tested fallback. The 200% CDP-only test is explicitly Chromium-scoped; the equivalent 320 CSS-pixel reflow assertion still runs in Firefox/WebKit.

- [ ] **Step 9.2: Perform screen-reader/browser matrix**

Run `A11Y-SR-01` in both locales with:

- [ ] NVDA + current Firefox on Windows.
- [ ] NVDA + current Chrome on Windows.
- [ ] VoiceOver + current Safari/WebKit on macOS/iOS-capable release environment.

Record version, locale, state IDs, and PASS/FAIL. Environment unavailability is recorded as NOT RUN and blocks an unqualified accessibility completion claim; it is never converted to PASS.

- [ ] **Step 9.3: Stop and record product-owned engine differences**

When Firefox/WebKit runs are green, record this step as tests-only. For any product-owned red, stop immediately and record browser, command, assertion, owner path, function/component/selector, viewport, locale, and measured failure in the prescribed `phase-6-product-defect-<scenario>.md` review path. Do not edit, stage, list, or repair the product owner. Obtain a reviewed plan amendment naming the later owner and repair before any product change; that amended work is outside Phase 6. A route, runtime, storage, Drive, or browser-specific contract defect returns directly to its owning earlier phase.

- [ ] **Step 9.4: Rerun failed browser plus Chromium adjacent suite**

Expected: engine-specific command and Chromium counterpart both exit 0.

- [ ] **Step 9.5: Record test-only changes**

If Phase 6 tests, Phase 6 harnesses, `tests/e2e/fixtures/performance.ts`, test configuration, or the one exact scenario defect record changed, inspect only those named paths and record them for review. A defect record is staged only as `docs/superpowers/reviews/phase-6-product-defect-<scenario>.md`; no sibling review file or generated capture is allowed. Never stage or commit product files or the earlier database/runtime/Drive fixtures. If no named Phase 6 path changed, record no-change evidence.

### Task 10: Complete integrated Phase 6 gate and hand off to Phase 7

**Files:**
- No product changes are permitted; only named Phase 6 tests/harnesses, explicitly named existing tests such as `tests/unit/drive-reconcile.test.ts`, `tests/e2e/fixtures/performance.ts`, and test configuration may change. Database/runtime/Drive fixtures remain imported unchanged.
- One exact `docs/superpowers/reviews/phase-6-product-defect-<scenario>.md` is permitted only when its scenario stopped execution; it is the sole non-test/config artifact.
- Remove generated non-designated test artifacts before staging

- [ ] **Step 10.1: Run focused named hardening families**

```bash
pnpm vitest run tests/unit/i18n.test.ts
pnpm vitest run tests/components/accessibility.test.tsx
pnpm vitest run tests/components/progress-profiler.test.tsx
pnpm playwright test tests/e2e/accessibility.spec.ts --project=chromium --reporter=list
pnpm playwright test tests/e2e/performance.spec.ts --project=chromium --reporter=list
pnpm playwright test tests/e2e/navigation-i18n.spec.ts --grep "I18N-01|NAV-01" --project=chromium --reporter=list
pnpm playwright test tests/e2e/visual-regression.spec.ts --grep "VIS-01" --project=chromium --reporter=list
```

Expected: every command exits 0; all `A11Y-AUTO-01..07`, `PERF-01..03`, `I18N-01`, `NAV-01`, and 42 `VIS-01` snapshots pass.

- [ ] **Step 10.2: Rerun Phase 1–5 named browser families**

```bash
pnpm playwright test tests/e2e/migration.spec.ts --grep "MIG-01" --project=chromium --reporter=list
pnpm playwright test tests/e2e/recommendation.spec.ts tests/e2e/workbench.spec.ts tests/e2e/runtime-queue.spec.ts tests/e2e/editor-save.spec.ts tests/e2e/migration.spec.ts tests/e2e/library.spec.ts tests/e2e/drive-identity.spec.ts tests/e2e/drive-sync.spec.ts tests/e2e/privacy.spec.ts tests/e2e/navigation-i18n.spec.ts tests/e2e/performance.spec.ts tests/e2e/accessibility.spec.ts --project=chromium --reporter=list
```

Expected: focused MIG-01 passes against final Workbench using `[data-testid="compatibility-product-ready"]` and public adapter behavior, with no assertion for legacy heading copy. REC-01..06, WB-01..02, RUN-01..04, QUEUE-01, ERR-01, EDIT-01..04, SAVE-01..03, MIG-01..03, LIB-01, GIS-01..05, DRV-01..06, PRIV-01, NAV-01, I18N-01, PERF-01..03, and A11Y-AUTO-01..07 pass.

- [ ] **Step 10.3: Run repository full gate in required order**

```bash
pnpm typecheck
rtk lint
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Expected: every command exits 0; both lint commands report zero errors and zero warnings; E2E reports only documented real-ASR/WebGPU gated skips. If `rtk lint` reports transient missing `test-results`, rerun once before changing unrelated code.

- [ ] **Step 10.4: Confirm worker and server scope remains unchanged**

No worker/shared-worker or server change is planned. Inspect the implementation diff for `worker/`, shared worker-facing types, and `server/`; any such path is a scope violation and stops Phase 6. Do not run or claim these checks as Phase 6 evidence.

- [ ] **Step 10.5: Preserve gated real-runtime checks for rollout-capable environment**

```powershell
$env:WHISDOM_REAL_ASR = "1"
try {
  rtk playwright test tests/e2e/real-transcription.spec.ts --reporter=list
} finally {
  Remove-Item Env:WHISDOM_REAL_ASR -ErrorAction SilentlyContinue
}

$env:WHISDOM_REAL_ASR = "1"
$env:WHISDOM_REAL_WEBGPU = "1"
try {
  rtk playwright test tests/e2e/real-transcription.spec.ts --grep "WebGPU" --reporter=list
} finally {
  Remove-Item Env:WHISDOM_REAL_ASR -ErrorAction SilentlyContinue
  Remove-Item Env:WHISDOM_REAL_WEBGPU -ErrorAction SilentlyContinue
}
```

Expected evidence records command, browser/OS/GPU, provider/model fixture, selected scenario names, pass count, skip count, exit code, and UTC execution time. When enabled on a supported environment, the real-ASR command must pass an actual audio transcription and open its transcript in the full-page editor; the real-WebGPU command must pass the WebGPU-tagged scenario using WebGPU. An unavailable or unsupported environment may report a documented gated skip, but that skip is not a real-runtime pass and does not satisfy a gate requiring the enabled environment.

- [ ] **Step 10.6: Verify manual evidence is complete**

- [ ] `A11Y-KBD-01`: EN and VI PASS.
- [ ] `A11Y-FOCUS-01`: EN and VI PASS.
- [ ] `A11Y-REFLOW-01`: EN and VI PASS at 200%, 390, and 320.
- [ ] `A11Y-CONTRAST-01`: EN and VI PASS in Light and Dark.
- [ ] `A11Y-LIVE-01`: EN and VI PASS.
- [ ] `A11Y-SR-01`: EN and VI matrix evidence recorded without overstating unavailable environments.
- [ ] Safe-area and virtual-keyboard checks PASS.
- [ ] Light, Dark, System, and reduced-motion checks PASS.
- [ ] `VIS-01` review confirms required states and prohibited-aesthetic absence.

- [ ] **Step 10.7: Inspect architecture and privacy diff**

Review the Phase 6 change manifest using only named Phase 6 test/harness/configuration paths, `tests/e2e/fixtures/performance.ts`, designated snapshots, and—only after a stop—the exact scenario path `docs/superpowers/reviews/phase-6-product-defect-<scenario>.md`. Confirm `tests/e2e/fixtures/database.ts`, `tests/e2e/fixtures/runtime.ts`, `tests/e2e/fixtures/drive.ts`, and every other review/doc path are absent. Do not run a product-tree diff or product-file listing as part of this gate. Expected: Phase 6 contains tests, harnesses, configuration, the assigned performance fixture extension, designated snapshots, and at most one permitted defect record. No product-file repair, earlier-fixture edit, extra artifact, new feature contract, source-media/settings Drive upload, broad Google host, token/Drive-ID exposure, worker architecture change, concurrent batch behavior, or standalone deployment artifact.

- [ ] **Step 10.8: Remove generated artifacts and inspect final status**

Remove only generated `test-results/.last-run.json`, `playwright-report/`, non-designated screenshots, traces, videos, and temporary profiling output produced by this phase. Do not delete tracked or contributor-owned files. Then run:

```bash
git status --short
git diff --cached --name-only
git diff --cached
```

Expected: no generated output staged; only exact Phase 6 paths plus at most the one permitted scenario defect record remain.

- [ ] **Step 10.9: Commit final gate evidence only when files changed and execution requested**

```bash
git commit -m "test: complete precision studio hardening gate"
```

Expected: conventional commit succeeds only with reviewed staged content. Do not push or deploy.

## Phase 6 exit criteria

- [ ] Phases 1–5 remain green with unchanged contracts.
- [ ] `A11Y-AUTO-01..07` pass in EN and VI at desktop, 390, and 320 with zero critical/serious axe violations.
- [ ] Skip link, landmarks, one visible `h1`, route focus, overlay restoration, combobox, queue sheet, reorder, 44 px touch targets, and no positive tabindex pass automated and manual checks.
- [ ] `A11Y-KBD-01`, `A11Y-FOCUS-01`, `A11Y-REFLOW-01`, `A11Y-CONTRAST-01`, `A11Y-LIVE-01`, and `A11Y-SR-01` have explicit EN/VI evidence.
- [ ] No page-level horizontal overflow exists at 200% zoom, 390, or 320; safe areas and virtual keyboard do not hide critical state.
- [ ] Light, Dark, System, and reduced motion pass without state reset or nonessential spatial motion.
- [ ] `VIS-01` passes for empty, review, active, failed, Library, editor, and sync-attention at desktop/390/320 in Light/Dark.
- [ ] No gradient, glass, glow, neon, parallax, remote font/image, generic AI imagery, or fake waveform data exists.
- [ ] `PERF-01` proves distinct lazy route chunks and no eager Library/editor/Settings/model/ONNX/ffmpeg request.
- [ ] `PERF-02` proves 100 progress updates cause zero commits in header, primary navigation, and mounted Library, while progress commits.
- [ ] `PERF-03` proves exact >200/>500 virtualization thresholds and 8 ms monotonic scheduler plus `setTimeout(0)` fallback with 1,000/5,000 fixtures.
- [ ] Drive downloads never exceed four and creates serialize per logical transcript without changing immutable publication semantics.
- [ ] Compile-time EN/VI parity and hardcoded-user-facing-English scan pass.
- [ ] Chromium full suite and Firefox/WebKit hardening suites pass.
- [ ] `pnpm typecheck`, `rtk lint`, `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` exit 0 with zero lint warnings.
- [ ] No Phase 6 standalone deploy occurs. Green integrated state proceeds directly to Phase 7 rollout/cleanup.
