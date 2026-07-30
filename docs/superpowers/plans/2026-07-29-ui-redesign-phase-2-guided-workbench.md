# Precision Studio Guided Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic model guidance plus an accessible File/Link, Setup, and Review Workbench while preserving the proven transcription implementation behind a narrow bridge until Phase 3.

**Architecture:** Pure recommendation, issue, and queue modules consume Phase 1B's pinned `ProcessingMode`, `ProductIssue`, copy, repository, and route contracts. A synchronous external `QueueStore` owns queue state; `WorkbenchPage` subscribes through `useSyncExternalStore`, performs media analysis only after file selection, and delegates explicit starts to the extracted `src/app/LegacyProduct.tsx` transcription path through `LegacyWorkbenchBridge`. `src/App.tsx` stays the thin AppShell adapter. No runtime adapter, worker, provider, canonical schema, repository, or route contract changes occur.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS 4, Radix/shadcn primitives, IndexedDB/idb 8, Vitest 4, Testing Library, axe-core 4.12, Playwright 1.60.

---

## Entry gate, authority, and frozen scope

- [ ] Work only in `F:\Workspace\whisdom\whisdom-precision-studio` on `feature/precision-studio-redesign`.
- [ ] Confirm Phase 1B release gates are green and its v2 database, query shell, typed copy, canonical transcript, repositories, final validated Settings route, Settings fixture, and product-error renderer are present.
- [ ] Confirm Phase 1B removed `UiLanguage`: `AppSettings.uiLanguage` and transcription-language helpers consume `InterfaceLanguage` only from `@/app/copy-types`. Phase 2 does not add an alias, re-export, or compatibility import.
- [ ] Read `AGENTS.md`, the complete approved spec at `docs/superpowers/specs/2026-07-29-ui-redesign-design.md`, and the complete master at `docs/superpowers/plans/2026-07-29-ui-redesign-master-rollout.md` before changing code.
- [ ] Preserve these declarations byte-for-byte: `AppRoute` in `src/app/navigation.ts`, `ProductIssue`/`ProductError` contracts in `src/app/copy.ts`, copy helper/types in `src/app/copy-types.ts`, canonical types in `src/features/transcription/types.ts`, repository interfaces in `src/features/storage/repositories.ts`, and the queue declarations in master Section 5.6.
- [ ] Do not create `runtime.ts`, adapters, coordinator, queue panel/sheet, normalized progress, cancellation, editor, Library, or Drive sync. Those belong to Phases 3–5.
- [ ] Do not change `src/workers/*`, `src/lib/transcription-worker-client.ts`, `src/features/server-transcription/api.ts`, server endpoints, ffmpeg threading, Cache Storage keys, canonical schema, IndexedDB version/stores/indexes, or repository transaction behavior.
- [ ] Do not persist recommendation metadata or an automatic recommendation, including after Start. Persist only explicit user model selection through the existing Phase 1B settings write path. Captured queue settings record the effective model chosen for that run.
- [ ] Do not request ASR workers, ONNX/model assets, ffmpeg assets, or wasm audio-processing assets before the user activates Transcribe.
- [ ] Do not replace or defer `src/features/settings/SettingsPage.tsx`; Phase 1B owns its complete processing/chunking, persist-media, validation, active-work, transcript-cleanup, and worker-first model-cache-cleanup behavior. Run `tests/unit/settings-validation.test.ts` and the Settings assertions in `tests/components/navigation.test.tsx` as adjacency when Workbench settings persistence changes.

## Locked file map

| Path | Responsibility |
| --- | --- |
| `src/features/workbench/types.ts` | Exact master queue/source/captured-settings declarations plus Phase 2 recommendation/view inputs |
| `src/features/workbench/recommendation.ts` | Pure REC-01..06 local and server decisions |
| `src/features/workbench/issues.ts` | Structured issue construction, dedupe, stable ordering, and start gating |
| `src/features/workbench/queue-reducer.ts` | Exact pure queue contract and Phase 2 transitions |
| `src/features/workbench/queue-store.ts` | Synchronous external QueueStore; dispatch returns exact next state |
| `src/features/workbench/copy.ts` | Create Workbench EN/VI copy and stable-code formatting; import helper/types only from `src/app/copy-types.ts` |
| `src/app/copy.ts` | Composition root imports `WORKBENCH_COPY` and adds its one typed registry entry |
| `src/features/transcription/types.ts` | Add only `explicitModelId: string | null` to legacy `AppSettings`; preserve Phase 1B-owned `uiLanguage: InterfaceLanguage` and canonical declarations byte-for-byte; never recreate `UiLanguage` |
| `src/features/transcription/models.ts` | Set `DEFAULT_SETTINGS.explicitModelId` to `null`; retain catalog/dtype rules |
| `src/features/workbench/components/WorkbenchCombobox.tsx` | Shared keyboard-complete language/model combobox |
| `src/features/workbench/components/StageRail.tsx` | Non-wizard Add media/Review/Transcribe/Edit orientation |
| `src/features/workbench/components/SourceSetup.tsx` | File/Link source drafts, privacy disclosure, language/model setup |
| `src/features/workbench/components/ReviewPanel.tsx` | Canonical review summary, singular issues, start controls |
| `src/features/workbench/WorkbenchPage.tsx` | Workbench composition, capability/preflight orchestration, captured starts |
| `src/app/LegacyProduct.tsx` | Narrow legacy start bridge only; existing provider execution remains intact |
| `src/App.tsx` | Read only; retain exact thin AppShell adapter and no circular import |
| `tests/unit/recommendation.test.ts` | Pure precedence and server separation |
| `tests/unit/queue-reducer.test.ts` | Append, capture, state, move/remove, sequential selection |
| `tests/unit/workbench-issues.test.ts` | Dedupe/order/gating |
| `tests/components/workbench.test.tsx` | Setup/Review, combobox, stage, privacy, EN/VI, axe |
| `tests/e2e/fixtures/runtime.ts` | Request recorder and mocked capability/transcription responses |
| `tests/e2e/recommendation.spec.ts` | REC-01..06 browser scenarios |
| `tests/e2e/workbench.spec.ts` | WB-01..02 and 320/390/request checks |
| `tests/e2e/whisdom.spec.ts` | Replace superseded home selectors; preserve unrelated regression cases |
| `tests/e2e/server-mode.spec.ts` | Retain hidden-without-config assertion; use new Settings/Workbench selectors |

## Contract pins used by every task

Use the master `MeasuredProgress`, `QueueStatus`, `QueueStage`, `QueueSource`, `CapturedTranscriptionSettings`, `QueueItem`, `QueueState`, and `QueueAction` declarations exactly. `src/features/workbench/types.ts` is the sole owner and declaration site of `MeasuredProgress`; every later runtime consumer imports it from there. In particular, `QueueItem.issue` remains `ProductIssue | ProductError | null`; `CapturedTranscriptionSettings` remains exactly six fields; `items-appended` receives caller-created IDs; `item-started` captures settings only from `ready`; reducers never create IDs.

The bridge is the only additive Phase 2 integration contract:

```ts
export interface LegacyWorkbenchStartRequest {
  itemId: string
  source: QueueSource
  settings: CapturedTranscriptionSettings
}

export interface LegacyWorkbenchStartResult {
  transcriptId: string
}

export interface LegacyWorkbenchBridge {
  start(request: LegacyWorkbenchStartRequest): Promise<LegacyWorkbenchStartResult>
}
```

It wraps existing `transcribeFile` and the existing server URL submit/SSE/save branch. It does not normalize events or cancellation. File starts may rerun current preflight inside legacy execution; Link starts call server submit directly and never create, require, or analyze a fake `File`.

### Task 1: Pin Workbench domain and deterministic recommendation

**Files:**
- Create: `src/features/workbench/types.ts`
- Create: `src/features/workbench/recommendation.ts`
- Create: `tests/unit/recommendation.test.ts`
- Read only: `src/features/transcription/models.ts:1-91`
- Read only: `src/features/transcription/language.ts:113-137`
- Read only: `src/features/server-transcription/types.ts:27-41`

- [ ] **Step 1: Write the failing REC policy tests**

Create `tests/unit/recommendation.test.ts` with table-driven cases named `REC-01` through `REC-06`. Use this complete fixture and assertions:

```ts
import { describe, expect, it } from "vitest"
import { recommendLocalModel, recommendServerModel } from "@/features/workbench/recommendation"
import type { WhisperModel } from "@/features/transcription/types"

const base: WhisperModel = { id: "catalog/whisper-base", label: "Base", sizeMb: 145, quality: "balanced", multilingual: true, notes: "Balanced" }
const tiny: WhisperModel = { id: "catalog/whisper-tiny", label: "Tiny", sizeMb: 75, quality: "fast", multilingual: true, notes: "Light" }
const small: WhisperModel = { id: "catalog/whisper-small", label: "Small", sizeMb: 466, quality: "high", multilingual: true, notes: "Heavier" }
const large: WhisperModel = { id: "catalog/whisper-large-v3", label: "Large", sizeMb: 1600, quality: "high", multilingual: true, notes: "q4" }
const english: WhisperModel = { id: "catalog/whisper-tiny.en", label: "Tiny English", sizeMb: 75, quality: "fast", multilingual: false, notes: "English only" }

const input = (overrides: Partial<Parameters<typeof recommendLocalModel>[0]> = {}): Parameters<typeof recommendLocalModel>[0] => ({
  secureContext: true,
  webGpuAvailable: true,
  catalog: [base, tiny, small, large, english],
  uiLanguage: "en",
  transcriptionLanguage: "auto",
  storedModelId: null,
  storedExplicitModelId: null,
  ...overrides,
})

describe("deterministic recommendation", () => {
  it("REC-01 selects non-q4 multilingual Base on WebGPU or WASM and handles removed choices", () => {
    expect(recommendLocalModel(input())).toMatchObject({ kind: "selected", modelId: base.id, mode: "local-webgpu", reasonCode: "first_run_base_webgpu" })
    expect(recommendLocalModel(input({ webGpuAvailable: false }))).toMatchObject({ kind: "selected", modelId: base.id, mode: "local-wasm", reasonCode: "first_run_base_wasm" })
    expect(recommendLocalModel(input({ storedModelId: "removed/model", storedExplicitModelId: "removed/model" }))).toMatchObject({ kind: "selected", modelId: base.id, reasonCode: "first_run_base_webgpu" })
  })

  it("REC-02 applies language replacement before runtime replacement and deterministic fallback", () => {
    expect(recommendLocalModel(input({ uiLanguage: "vi", storedModelId: english.id, storedExplicitModelId: english.id }))).toMatchObject({ kind: "selected", modelId: base.id, reasonCode: "language_requires_multilingual", replacedStoredChoice: true })
    expect(recommendLocalModel(input({ webGpuAvailable: false, storedModelId: large.id, storedExplicitModelId: large.id }))).toMatchObject({ kind: "selected", modelId: base.id, mode: "local-wasm", reasonCode: "stored_choice_runtime_unavailable", replacedStoredChoice: true })
    expect(recommendLocalModel(input({ catalog: [small, tiny], storedModelId: null }))).toMatchObject({ kind: "selected", modelId: tiny.id, reasonCode: "deterministic_catalog_fallback" })
  })

  it("REC-03 blocks when no model supports the available runtime and language", () => {
    expect(recommendLocalModel(input({ webGpuAvailable: false, catalog: [large] }))).toEqual({ kind: "blocked", reasonCode: "no_compatible_model", recoveryActionCode: "choose-model" })
  })

  it("REC-04 preserves a valid explicit choice while deriving current runtime", () => {
    expect(recommendLocalModel(input({ storedModelId: small.id, storedExplicitModelId: small.id }))).toMatchObject({ kind: "selected", modelId: small.id, mode: "local-webgpu", reasonCode: "stored_choice_valid", replacedStoredChoice: false })
    expect(recommendLocalModel(input({ storedModelId: small.id, storedExplicitModelId: small.id, webGpuAvailable: false }))).toMatchObject({ kind: "selected", modelId: small.id, mode: "local-wasm", reasonCode: "stored_choice_valid" })
  })

  it("REC-05 requires explicit choice when only Small or q4 candidates remain", () => {
    expect(recommendLocalModel(input({ catalog: [small, large] }))).toEqual({ kind: "explicit-choice-required", compatibleModelIds: [small.id, large.id], reasonCode: "explicit_model_choice_required", recoveryActionCode: "choose-model" })
  })

  it("REC-06 selects the advertised server default independently", () => {
    expect(recommendServerModel({ available: true, engine: "whisper.cpp", input_types: ["file", "url"], cpu_optimized: true, models: [{ id: "large", label: "Large", size_mb: 3000, quality: "high" }], default_model: "large" })).toEqual({ kind: "selected", mode: "server", modelId: "large", runtime: "whisper.cpp", reasonCode: "server_advertised_default" })
  })
})
```

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/unit/recommendation.test.ts`

Expected: exit 1; one suite fails to resolve `@/features/workbench/recommendation`.

- [ ] **Step 3: Add exact types and minimal algorithm**

Create `src/features/workbench/types.ts` with this complete content. Do not import `MeasuredProgress` from another module and do not add a conditional import, alias, duplicate declaration, or fallback declaration:

```ts
import type { ProductError, ProductIssue } from "@/app/copy"
import type { InterfaceLanguage } from "@/app/copy-types"
import type { LanguageCode, ProcessingMode, WhisperModel } from "@/features/transcription/types"

export interface MeasuredProgress {
  completed: number
  total: number
  unit: "bytes" | "chunks" | "items"
}

export type QueueStatus =
  | "draft"
  | "ready"
  | "blocked"
  | "running"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "completed"

export type QueueStage = "source" | "review" | "prepare" | "load-model" | "transcribe" | "save"

export type QueueSource =
  | { kind: "file"; file: File; name: string; mediaId: string | null }
  | { kind: "link"; url: string; name: string }

export interface CapturedTranscriptionSettings {
  mode: ProcessingMode
  modelId: string
  language: string
  chunkSeconds: number
  overlapSeconds: number
  needsConversion: boolean
}

export interface QueueItem {
  id: string
  source: QueueSource
  displayName: string
  order: number
  capturedSettings: CapturedTranscriptionSettings | null
  status: QueueStatus
  stage: QueueStage
  progress: MeasuredProgress | null
  transcriptId: string | null
  issue: ProductIssue | ProductError | null
}

export interface QueueState {
  items: QueueItem[]
  selectedItemId: string | null
  activeItemId: string | null
  batch: {
    running: boolean
    paused: boolean
    stopAfterCurrent: boolean
  }
}

export type QueueAction =
  | { type: "items-appended"; items: QueueItem[] }
  | { type: "item-selected"; itemId: string }
  | { type: "item-reviewed"; itemId: string; issue: ProductIssue | null }
  | { type: "item-started"; itemId: string; settings: CapturedTranscriptionSettings }
  | { type: "item-progressed"; itemId: string; stage: QueueStage; progress: MeasuredProgress | null }
  | { type: "item-cancel-requested"; itemId: string; stopBatch: boolean }
  | { type: "item-cancelled"; itemId: string }
  | { type: "item-failed"; itemId: string; error: ProductError }
  | { type: "item-completed"; itemId: string; transcriptId: string }
  | { type: "item-retried"; itemId: string }
  | { type: "item-removed"; itemId: string }
  | { type: "item-moved"; itemId: string; direction: "earlier" | "later" }
  | { type: "batch-started" }
  | { type: "batch-resumed" }
  | { type: "batch-stopped" }

export type LocalRecommendationReason = "no_compatible_model" | "language_requires_multilingual" | "stored_choice_runtime_unavailable" | "stored_choice_valid" | "first_run_base_webgpu" | "first_run_base_wasm" | "deterministic_catalog_fallback" | "explicit_model_choice_required"
export type LocalRecommendation =
  | { kind: "blocked"; reasonCode: "no_compatible_model"; recoveryActionCode: "choose-model" }
  | { kind: "explicit-choice-required"; compatibleModelIds: string[]; reasonCode: "explicit_model_choice_required"; recoveryActionCode: "choose-model" }
  | { kind: "selected"; mode: "local-webgpu" | "local-wasm"; modelId: string; runtime: "webgpu" | "wasm"; reasonCode: Exclude<LocalRecommendationReason, "no_compatible_model" | "explicit_model_choice_required">; replacedStoredChoice: boolean }
export interface LocalRecommendationInput { secureContext: boolean; webGpuAvailable: boolean; catalog: readonly WhisperModel[]; uiLanguage: InterfaceLanguage; transcriptionLanguage: LanguageCode; storedModelId: string | null; storedExplicitModelId: string | null }
export type ServerRecommendation = { kind: "selected"; mode: "server"; modelId: string; runtime: string; reasonCode: "server_advertised_default" } | { kind: "blocked"; reasonCode: "server_capabilities_unavailable" }
```

The exact master reducer API is implemented and exported by `queue-reducer.ts`: `createInitialQueueState(): QueueState`, `queueReducer(state: QueueState, action: QueueAction): QueueState`, and `nextSequentialItem(state: QueueState): QueueItem | null`. `queue-store.ts` exports `QueueStore { getState(): QueueState; dispatch(action: QueueAction): QueueState; subscribe(listener: () => void): () => void }` and `createQueueStore(initialState?: QueueState): QueueStore`. Dispatch synchronously applies the reducer, stores and returns the exact next state, and notifies listeners only when state identity changes. Do not place ambient function declarations or reducer bodies in `types.ts`. `MeasuredProgress` remains declared only in `types.ts`.

Create `src/features/workbench/recommendation.ts`:

```ts
import { resolveTranscriptionLanguage } from "@/features/transcription/language"
import { getLocalModelDtype } from "@/features/transcription/models"
import type { ServerCapabilities } from "@/features/server-transcription/types"
import type { WhisperModel } from "@/features/transcription/types"
import type { LocalRecommendation, LocalRecommendationInput, ServerRecommendation } from "./types"

const family = (model: WhisperModel): "base" | "tiny" | "other" => /whisper-base(?:$|[^a-z])/i.test(model.id) ? "base" : /whisper-tiny(?:$|[^a-z])/i.test(model.id) && !/\.en(?:$|[^a-z])/i.test(model.id) ? "tiny" : "other"
const supports = (model: WhisperModel, language: string) => language === "en" || model.multilingual
const q4 = (model: WhisperModel) => getLocalModelDtype(model) === "q4"
const runnable = (model: WhisperModel, input: LocalRecommendationInput) => supports(model, resolveTranscriptionLanguage(input.transcriptionLanguage, input.uiLanguage)) && (!q4(model) || (input.secureContext && input.webGpuAvailable))
const safe = (model: WhisperModel, input: LocalRecommendationInput) => runnable(model, input) && model.multilingual && !q4(model) && family(model) !== "other"
const runtime = (input: LocalRecommendationInput) => input.secureContext && input.webGpuAvailable ? ({ mode: "local-webgpu", runtime: "webgpu" } as const) : ({ mode: "local-wasm", runtime: "wasm" } as const)
const preferredSafe = (models: readonly WhisperModel[], input: LocalRecommendationInput) => models.map((model, index) => ({ model, index })).filter(({ model }) => safe(model, input)).sort((left, right) => (family(left.model) === "base" ? 0 : 1) - (family(right.model) === "base" ? 0 : 1) || left.index - right.index)[0]?.model ?? null

export function recommendLocalModel(input: LocalRecommendationInput): LocalRecommendation {
  const language = resolveTranscriptionLanguage(input.transcriptionLanguage, input.uiLanguage)
  const compatible = input.catalog.filter((model) => runnable(model, input))
  if (compatible.length === 0) return { kind: "blocked", reasonCode: "no_compatible_model", recoveryActionCode: "choose-model" }
  const storedExplicitCandidate = input.storedExplicitModelId === null ? null : input.catalog.find((model) => model.id === input.storedExplicitModelId) ?? null
  const stored = storedExplicitCandidate && supports(storedExplicitCandidate, language) && runnable(storedExplicitCandidate, input) ? storedExplicitCandidate : null
  const fallback = preferredSafe(input.catalog, input)
  if (input.storedExplicitModelId !== null && storedExplicitCandidate && language !== "en" && !storedExplicitCandidate.multilingual && fallback) return { kind: "selected", modelId: fallback.id, ...runtime(input), reasonCode: "language_requires_multilingual", replacedStoredChoice: true }
  if (input.storedExplicitModelId !== null && storedExplicitCandidate && !runnable(storedExplicitCandidate, input) && fallback) return { kind: "selected", modelId: fallback.id, ...runtime(input), reasonCode: "stored_choice_runtime_unavailable", replacedStoredChoice: true }
  if (stored) return { kind: "selected", modelId: stored.id, ...runtime(input), reasonCode: "stored_choice_valid", replacedStoredChoice: false }
  const base = compatible.find((model) => family(model) === "base" && model.multilingual && !q4(model))
  if (base) return { kind: "selected", modelId: base.id, ...runtime(input), reasonCode: input.secureContext && input.webGpuAvailable ? "first_run_base_webgpu" : "first_run_base_wasm", replacedStoredChoice: false }
  if (fallback) return { kind: "selected", modelId: fallback.id, ...runtime(input), reasonCode: "deterministic_catalog_fallback", replacedStoredChoice: false }
  return { kind: "explicit-choice-required", compatibleModelIds: compatible.map((model) => model.id), reasonCode: "explicit_model_choice_required", recoveryActionCode: "choose-model" }
}

export function recommendServerModel(capabilities: ServerCapabilities | null): ServerRecommendation {
  const selected = capabilities?.available && capabilities.default_model ? capabilities.models?.find((model) => model.id === capabilities.default_model) : undefined
  return selected ? { kind: "selected", mode: "server", modelId: selected.id, runtime: capabilities!.engine, reasonCode: "server_advertised_default" } : { kind: "blocked", reasonCode: "server_capabilities_unavailable" }
}
```

- [ ] **Step 4: Run green and adjacent model tests**

Run: `pnpm vitest run tests/unit/recommendation.test.ts tests/unit/models.test.ts tests/unit/language.test.ts`

Expected: exit 0; 3 files pass; `recommendation.test.ts` reports 6 passed.

- [ ] **Step 5: Stage and commit**

```bash
git add src/features/workbench/types.ts src/features/workbench/recommendation.ts tests/unit/recommendation.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(workbench): add deterministic model guidance"
```

Expected staged names: exactly the three paths above. Expected commit: `feat(workbench): add deterministic model guidance`.

### Task 2: Add pure queue capture and structured issue policy

**Files:**
- Create: `src/features/workbench/queue-reducer.ts`
- Create: `src/features/workbench/queue-store.ts`
- Create: `src/features/workbench/issues.ts`
- Create: `tests/unit/queue-reducer.test.ts`
- Create: `tests/unit/workbench-issues.test.ts`

- [ ] **Step 1: Write reducer and issue red tests**

Create `tests/unit/queue-reducer.test.ts` with this complete content. The final three tests use the exact master-required names and prove that terminal states never become implicit work candidates:

```ts
import { describe, expect, it } from "vitest"
import { createInitialQueueState, nextSequentialItem, queueReducer } from "@/features/workbench/queue-reducer"
import type {
  CapturedTranscriptionSettings,
  QueueItem,
  QueueState,
  QueueStatus,
} from "@/features/workbench/types"
import type { ProductError, ProductIssue } from "@/app/copy"

const settings: CapturedTranscriptionSettings = {
  mode: "local-webgpu",
  modelId: "onnx-community/whisper-base",
  language: "auto",
  chunkSeconds: 30,
  overlapSeconds: 5,
  needsConversion: false,
}

const blockingIssue: ProductIssue = {
  code: "source.file-required",
  severity: "error",
  scope: "source",
  scopeId: "a",
  params: {},
  blocking: true,
  recoveryAction: { code: "choose-file", params: {} },
}

const failure: ProductError = {
  occurrenceId: "error-a",
  code: "runtime.legacy-failed",
  severity: "error",
  scope: "queue-item",
  scopeId: "a",
  params: { itemName: "a.wav" },
  primaryAction: { code: "retry", params: { itemName: "a.wav" } },
  secondaryAction: null,
  retryable: true,
  technicalCause: null,
}

const item = (id: string, status: QueueStatus = "draft", order = 0): QueueItem => ({
  id,
  source: { kind: "file", file: {} as File, name: `${id}.wav`, mediaId: null },
  displayName: `${id}.wav`,
  order,
  capturedSettings: null,
  status,
  stage: status === "draft" ? "source" : "review",
  progress: null,
  transcriptId: null,
  issue: null,
})

const stateWith = (...items: QueueItem[]): QueueState => ({
  ...createInitialQueueState(),
  items,
  selectedItemId: items[0]?.id ?? null,
})

const runningBatch = (...items: QueueItem[]): QueueState => ({
  ...stateWith(...items),
  batch: { running: true, paused: false, stopAfterCurrent: false },
})

describe("queueReducer", () => {
  it("appends caller-created items and keeps an existing selection", () => {
    const first = queueReducer(createInitialQueueState(), {
      type: "items-appended",
      items: [item("a", "draft", 9), item("b", "draft", 12)],
    })
    expect(first.items.map(({ id, order }) => ({ id, order }))).toEqual([
      { id: "a", order: 0 },
      { id: "b", order: 1 },
    ])
    expect(first.selectedItemId).toBe("a")

    const selected = queueReducer(first, { type: "item-selected", itemId: "b" })
    const appended = queueReducer(selected, {
      type: "items-appended",
      items: [item("c", "draft", 50)],
    })
    expect(appended.items.map((entry) => entry.id)).toEqual(["a", "b", "c"])
    expect(appended.selectedItemId).toBe("b")
  })

  it("reviews into blocked or ready", () => {
    const initial = stateWith(item("a"))
    const blocked = queueReducer(initial, { type: "item-reviewed", itemId: "a", issue: blockingIssue })
    expect(blocked.items[0]).toMatchObject({ status: "blocked", stage: "review", issue: blockingIssue })
    const ready = queueReducer(blocked, { type: "item-reviewed", itemId: "a", issue: null })
    expect(ready.items[0]).toMatchObject({ status: "ready", stage: "review", issue: null })
  })

  it("starts only ready and freezes a copied settings snapshot", () => {
    const ready = stateWith(item("a", "ready"), item("b", "ready", 1))
    const started = queueReducer(ready, { type: "item-started", itemId: "a", settings })
    expect(started.activeItemId).toBe("a")
    expect(started.items[0]).toMatchObject({ status: "running", stage: "prepare", issue: null })
    expect(started.items[0].capturedSettings).toEqual(settings)
    expect(started.items[0].capturedSettings).not.toBe(settings)
    expect(queueReducer(started, { type: "item-started", itemId: "b", settings })).toBe(started)

    for (const status of ["draft", "blocked", "cancelled", "failed", "completed"] as const) {
      const candidate = stateWith(item("x", status))
      expect(queueReducer(candidate, { type: "item-started", itemId: "x", settings })).toBe(candidate)
    }
  })

  it("updates progress and terminal state only for the active item", () => {
    const started = queueReducer(stateWith(item("a", "ready")), { type: "item-started", itemId: "a", settings })
    const progressed = queueReducer(started, {
      type: "item-progressed",
      itemId: "a",
      stage: "transcribe",
      progress: { completed: 1, total: 2, unit: "chunks" },
    })
    expect(progressed.items[0]).toMatchObject({ stage: "transcribe", progress: { completed: 1, total: 2, unit: "chunks" } })
    expect(queueReducer(progressed, { type: "item-progressed", itemId: "missing", stage: "save", progress: null })).toBe(progressed)

    const failed = queueReducer(progressed, { type: "item-failed", itemId: "a", error: failure })
    expect(failed.activeItemId).toBeNull()
    expect(failed.items[0]).toMatchObject({ status: "failed", issue: failure })
  })

  it("requests cancellation before terminal cancellation and pauses batch", () => {
    const started = queueReducer(
      { ...stateWith(item("a", "ready")), batch: { running: true, paused: false, stopAfterCurrent: false } },
      { type: "item-started", itemId: "a", settings },
    )
    const cancelling = queueReducer(started, { type: "item-cancel-requested", itemId: "a", stopBatch: true })
    expect(cancelling.items[0]).toMatchObject({ status: "cancelling", progress: null })
    expect(cancelling.batch).toEqual({ running: true, paused: true, stopAfterCurrent: true })
    const cancelled = queueReducer(cancelling, { type: "item-cancelled", itemId: "a" })
    expect(cancelled.activeItemId).toBeNull()
    expect(cancelled.items[0].status).toBe("cancelled")
  })

  it("requires explicit retry and clears terminal run state", () => {
    for (const terminal of ["cancelled", "failed"] as const) {
      const terminalItem: QueueItem = {
        ...item("a", terminal),
        capturedSettings: { ...settings },
        progress: { completed: 1, total: 2, unit: "chunks" },
        transcriptId: "stale-transcript",
        issue: terminal === "failed" ? failure : blockingIssue,
      }
      const retried = queueReducer(stateWith(terminalItem), { type: "item-retried", itemId: "a" })
      expect(retried.items[0]).toMatchObject({
        status: "ready",
        stage: "review",
        capturedSettings: null,
        progress: null,
        transcriptId: null,
        issue: null,
      })
    }
  })

  it("normalizes move and remove order without touching transcript storage", () => {
    const initial = stateWith(item("a", "ready", 4), item("b", "failed", 8), item("c", "completed", 12))
    const moved = queueReducer(initial, { type: "item-moved", itemId: "b", direction: "earlier" })
    expect(moved.items.map(({ id, order }) => ({ id, order }))).toEqual([
      { id: "b", order: 0 },
      { id: "a", order: 1 },
      { id: "c", order: 2 },
    ])
    expect(queueReducer(moved, { type: "item-moved", itemId: "c", direction: "earlier" })).toBe(moved)
    const removed = queueReducer(moved, { type: "item-removed", itemId: "c" })
    expect(removed.items.map(({ id, order }) => ({ id, order }))).toEqual([
      { id: "b", order: 0 },
      { id: "a", order: 1 },
    ])
  })

  it("rejects unknown IDs and active removal or movement", () => {
    const started = queueReducer(stateWith(item("a", "ready")), { type: "item-started", itemId: "a", settings })
    expect(queueReducer(started, { type: "item-removed", itemId: "a" })).toBe(started)
    expect(queueReducer(started, { type: "item-moved", itemId: "a", direction: "later" })).toBe(started)
    expect(queueReducer(started, { type: "item-selected", itemId: "missing" })).toBe(started)
  })

  it("applies exact batch flags", () => {
    const initial = createInitialQueueState()
    const started = queueReducer(initial, { type: "batch-started" })
    expect(started.batch).toEqual({ running: true, paused: false, stopAfterCurrent: false })
    const stopped = queueReducer(started, { type: "batch-stopped" })
    expect(stopped.batch).toEqual({ running: false, paused: true, stopAfterCurrent: true })
    const resumed = queueReducer(stopped, { type: "batch-resumed" })
    expect(resumed.batch).toEqual({ running: true, paused: false, stopAfterCurrent: false })
  })
})

describe("nextSequentialItem", () => {
  it("nextSequentialItem selects earliest ready only", () => {
    const state = runningBatch(
      item("cancelled", "cancelled", 0),
      item("first-ready", "ready", 50),
      item("failed", "failed", 1),
      item("second-ready", "ready", 2),
    )
    expect(nextSequentialItem(state)?.id).toBe("first-ready")
    expect(nextSequentialItem({ ...state, activeItemId: "active" })).toBeNull()
    expect(nextSequentialItem({ ...state, batch: { ...state.batch, running: false } })).toBeNull()
    expect(nextSequentialItem({ ...state, batch: { ...state.batch, paused: true } })).toBeNull()
    expect(nextSequentialItem({ ...state, batch: { ...state.batch, stopAfterCurrent: true } })).toBeNull()
  })

  it("cancelled item requires item-retried before selection", () => {
    const terminal = runningBatch(item("a", "cancelled"))
    expect(nextSequentialItem(terminal)).toBeNull()
    const retried = queueReducer(terminal, { type: "item-retried", itemId: "a" })
    expect(nextSequentialItem(retried)?.id).toBe("a")
  })

  it("failed item requires item-retried before selection", () => {
    const terminal = runningBatch({ ...item("a", "failed"), issue: failure })
    expect(nextSequentialItem(terminal)).toBeNull()
    const retried = queueReducer(terminal, { type: "item-retried", itemId: "a" })
    expect(nextSequentialItem(retried)?.id).toBe("a")
  })
})
```

Create `tests/unit/workbench-issues.test.ts` with this complete content:

```ts
import { describe, expect, it } from "vitest"
import { canonicalizeIssues, canStartReview, workbenchIssue } from "@/features/workbench/issues"

describe("workbench issues", () => {
  it("builds exact issue metadata and copies recovery params", () => {
    const issue = workbenchIssue("model.explicit-choice-required", "queue-a", { model: "Small" })
    expect(issue).toEqual({
      code: "model.explicit-choice-required",
      severity: "warning",
      scope: "queue-item",
      scopeId: "queue-a",
      params: { model: "Small" },
      blocking: true,
      recoveryAction: { code: "choose-model", params: { model: "Small" } },
    })
    expect(issue.recoveryAction?.params).not.toBe(issue.params)
  })

  it("dedupes by code and scopeId while keeping the first occurrence", () => {
    const first = workbenchIssue("privacy.local", "source-a", { itemName: "first.wav" })
    const duplicate = workbenchIssue("privacy.local", "source-a", { itemName: "duplicate.wav" })
    const otherScope = workbenchIssue("privacy.local", "source-b", { itemName: "second.wav" })
    expect(canonicalizeIssues([first, duplicate, otherScope])).toEqual([first, otherScope])
  })

  it("orders error, actionable warning, warning, and info stably", () => {
    const infoA = workbenchIssue("privacy.local", "a")
    const warningA = workbenchIssue("model.language-replaced", "a")
    const errorA = workbenchIssue("source.file-required", "a")
    const actionableA = workbenchIssue("model.explicit-choice-required", "a")
    const infoB = workbenchIssue("download.model", "b")
    const warningB = workbenchIssue("model.runtime-replaced", "b")
    const errorB = workbenchIssue("media.analysis-failed", "b")
    const actionableB = workbenchIssue("model.explicit-choice-required", "b")
    expect(canonicalizeIssues([infoA, warningA, errorA, actionableA, infoB, warningB, errorB, actionableB])).toEqual([
      errorA,
      errorB,
      actionableA,
      actionableB,
      warningA,
      warningB,
      infoA,
      infoB,
    ])
  })

  it("blocks start iff a deduped issue blocks", () => {
    const notices = [
      workbenchIssue("privacy.local", "a"),
      workbenchIssue("media.conversion-required", "a"),
      workbenchIssue("model.language-replaced", "a"),
    ]
    expect(canStartReview(notices)).toBe(true)
    expect(canStartReview([...notices, workbenchIssue("source.file-required", "a")])).toBe(false)
  })
})
```

Run: `pnpm vitest run tests/unit/queue-reducer.test.ts tests/unit/workbench-issues.test.ts`

Expected: exit 1; both module imports fail.

- [ ] **Step 2: Implement the exact reducer**

Create `src/features/workbench/queue-reducer.ts` with this complete content:

```ts
import type { ProductIssue } from "@/app/copy"
import type { QueueAction, QueueItem, QueueState, QueueStatus } from "./types"

const movableStatuses = new Set<QueueStatus>(["draft", "ready", "blocked", "cancelled", "failed"])

const normalize = (items: QueueItem[]): QueueItem[] =>
  items.map((item, order) => item.order === order ? item : { ...item, order })

const reviewStatus = (issue: ProductIssue | null): QueueStatus => issue?.blocking ? "blocked" : "ready"

const replaceItem = (
  state: QueueState,
  itemId: string,
  replace: (item: QueueItem) => QueueItem,
): QueueState => {
  const index = state.items.findIndex((item) => item.id === itemId)
  if (index < 0) return state
  const current = state.items[index]
  const replacement = replace(current)
  if (replacement === current) return state
  const items = state.items.slice()
  items[index] = replacement
  return { ...state, items }
}

export function createInitialQueueState(): QueueState {
  return {
    items: [],
    selectedItemId: null,
    activeItemId: null,
    batch: { running: false, paused: false, stopAfterCurrent: false },
  }
}

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case "items-appended": {
      if (action.items.length === 0) return state
      return {
        ...state,
        items: normalize([...state.items, ...action.items]),
        selectedItemId: state.selectedItemId ?? action.items[0].id,
      }
    }
    case "item-selected":
      return state.items.some((item) => item.id === action.itemId)
        ? { ...state, selectedItemId: action.itemId }
        : state
    case "item-reviewed":
      return replaceItem(state, action.itemId, (item) =>
        ["draft", "ready", "blocked"].includes(item.status)
          ? { ...item, issue: action.issue, status: reviewStatus(action.issue), stage: "review" }
          : item,
      )
    case "item-started": {
      if (state.activeItemId !== null) return state
      const target = state.items.find((item) => item.id === action.itemId)
      if (!target || target.status !== "ready") return state
      const next = replaceItem(state, action.itemId, (item) => ({
        ...item,
        capturedSettings: { ...action.settings },
        status: "running",
        stage: "prepare",
        progress: null,
        transcriptId: null,
        issue: null,
      }))
      return { ...next, activeItemId: action.itemId }
    }
    case "item-progressed":
      if (state.activeItemId !== action.itemId) return state
      return replaceItem(state, action.itemId, (item) =>
        item.status === "running" ? { ...item, stage: action.stage, progress: action.progress } : item,
      )
    case "item-cancel-requested": {
      if (state.activeItemId !== action.itemId) return state
      const next = replaceItem(state, action.itemId, (item) =>
        item.status === "running" ? { ...item, status: "cancelling", progress: null } : item,
      )
      if (next === state) return state
      return {
        ...next,
        batch: {
          ...state.batch,
          paused: true,
          stopAfterCurrent: action.stopBatch ? true : state.batch.stopAfterCurrent,
        },
      }
    }
    case "item-cancelled": {
      if (state.activeItemId !== action.itemId) return state
      const next = replaceItem(state, action.itemId, (item) =>
        item.status === "cancelling" ? { ...item, status: "cancelled", progress: null } : item,
      )
      return next === state ? state : { ...next, activeItemId: null }
    }
    case "item-failed": {
      if (state.activeItemId !== action.itemId) return state
      const next = replaceItem(state, action.itemId, (item) =>
        item.status === "running" || item.status === "cancelling"
          ? { ...item, status: "failed", progress: null, issue: action.error }
          : item,
      )
      return next === state ? state : { ...next, activeItemId: null }
    }
    case "item-completed": {
      if (state.activeItemId !== action.itemId) return state
      const next = replaceItem(state, action.itemId, (item) =>
        item.status === "running"
          ? { ...item, status: "completed", progress: null, transcriptId: action.transcriptId, issue: null }
          : item,
      )
      return next === state ? state : { ...next, activeItemId: null }
    }
    case "item-retried":
      return replaceItem(state, action.itemId, (item) =>
        item.status === "cancelled" || item.status === "failed"
          ? {
              ...item,
              capturedSettings: null,
              status: "ready",
              stage: "review",
              progress: null,
              transcriptId: null,
              issue: null,
            }
          : item,
      )
    case "item-removed": {
      const index = state.items.findIndex((item) => item.id === action.itemId)
      if (index < 0) return state
      const target = state.items[index]
      if (target.status === "running" || target.status === "cancelling") return state
      const items = normalize(state.items.filter((item) => item.id !== action.itemId))
      const selectedItemId = state.selectedItemId === action.itemId
        ? items[Math.min(index, items.length - 1)]?.id ?? null
        : state.selectedItemId
      return { ...state, items, selectedItemId }
    }
    case "item-moved": {
      const index = state.items.findIndex((item) => item.id === action.itemId)
      if (index < 0 || !movableStatuses.has(state.items[index].status)) return state
      const adjacent = action.direction === "earlier" ? index - 1 : index + 1
      if (adjacent < 0 || adjacent >= state.items.length || !movableStatuses.has(state.items[adjacent].status)) return state
      const items = state.items.slice()
      ;[items[index], items[adjacent]] = [items[adjacent], items[index]]
      return { ...state, items: normalize(items) }
    }
    case "batch-started":
    case "batch-resumed":
      return { ...state, batch: { running: true, paused: false, stopAfterCurrent: false } }
    case "batch-stopped":
      return { ...state, batch: { running: false, paused: true, stopAfterCurrent: true } }
  }
}

export function nextSequentialItem(state: QueueState): QueueItem | null {
  if (state.activeItemId !== null || !state.batch.running || state.batch.paused || state.batch.stopAfterCurrent) return null
  return state.items.find((item) => item.status === "ready") ?? null
}
```

`nextSequentialItem` scans current array order. It never sorts, mutates, dispatches retry, or treats `cancelled`/`failed` as ready. `item-started` accepts only `ready`. The sole transition from `cancelled` or `failed` to `ready` is an explicit `item-retried` action.

Create `src/features/workbench/queue-store.ts` with the exact master `QueueStore`/`createQueueStore` API. Extend `tests/unit/queue-reducer.test.ts` to assert `dispatch` returns the reducer's exact next object, `getState()` equals that return before `dispatch` returns, listeners run synchronously once for a changed state and never for a no-op, and unsubscribe is exact. This external-store contract replaces React reducer ownership before Phase 3 consumes it.

- [ ] **Step 3: Implement issue construction and canonicalization**

Create `src/features/workbench/issues.ts` with this complete content:

```ts
import type {
  ProductIssue,
  ProductScope,
  ProductSeverity,
  RecoveryActionCode,
} from "@/app/copy"
import type { CopyParams } from "@/app/copy-types"

export type WorkbenchIssueCode = "source.file-required" | "source.link-invalid" | "source.link-unsupported" | "server.capabilities-unavailable" | "model.no-compatible" | "model.explicit-choice-required" | "model.language-replaced" | "model.runtime-replaced" | "media.analysis-failed" | "media.conversion-required" | "download.model" | "download.ffmpeg" | "privacy.local" | "privacy.server-link"

interface IssuePolicy {
  severity: ProductSeverity
  blocking: boolean
  recovery: RecoveryActionCode | null
  scope: ProductScope
}

const source = (severity: ProductSeverity, blocking: boolean, recovery: RecoveryActionCode | null): IssuePolicy => ({ severity, blocking, recovery, scope: "source" })
const queueItem = (severity: ProductSeverity, blocking: boolean, recovery: RecoveryActionCode | null): IssuePolicy => ({ severity, blocking, recovery, scope: "queue-item" })

const POLICY: Record<WorkbenchIssueCode, IssuePolicy> = {
  "source.file-required": source("error", true, "choose-file"),
  "source.link-invalid": source("error", true, "retry"),
  "source.link-unsupported": source("error", true, "retry"),
  "server.capabilities-unavailable": source("error", true, "retry"),
  "model.no-compatible": queueItem("error", true, "choose-model"),
  "model.explicit-choice-required": queueItem("warning", true, "choose-model"),
  "model.language-replaced": queueItem("warning", false, "choose-model"),
  "model.runtime-replaced": queueItem("warning", false, "use-safe-model"),
  "media.analysis-failed": source("error", true, "choose-file"),
  "media.conversion-required": source("info", false, null),
  "download.model": queueItem("info", false, null),
  "download.ffmpeg": queueItem("info", false, null),
  "privacy.local": source("info", false, null),
  "privacy.server-link": source("info", false, null),
}

export function workbenchIssue(
  code: WorkbenchIssueCode,
  scopeId: string,
  params: CopyParams = {},
): ProductIssue {
  const policy = POLICY[code]
  return {
    code,
    severity: policy.severity,
    scope: policy.scope,
    scopeId,
    params,
    blocking: policy.blocking,
    recoveryAction: policy.recovery === null ? null : { code: policy.recovery, params: { ...params } },
  }
}

const rank = (issue: ProductIssue): number => {
  if (issue.severity === "error") return 0
  if (issue.severity === "warning" && issue.recoveryAction !== null) return 1
  if (issue.severity === "warning") return 2
  return 3
}

export function canonicalizeIssues(issues: readonly ProductIssue[]): ProductIssue[] {
  const seen = new Set<string>()
  return issues
    .map((issue, index) => ({ issue, index }))
    .filter(({ issue }) => {
      const key = `${issue.code}\u0000${issue.scopeId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((left, right) => rank(left.issue) - rank(right.issue) || left.index - right.index)
    .map(({ issue }) => issue)
}

export function canStartReview(issues: readonly ProductIssue[]): boolean {
  return !canonicalizeIssues(issues).some((issue) => issue.blocking)
}
```

- [ ] **Step 4: Run green and adjacent tests**

Run: `pnpm vitest run tests/unit/queue-reducer.test.ts tests/unit/workbench-issues.test.ts tests/unit/preflight.test.ts`

Expected: exit 0; 3 files pass; no unhandled errors.

- [ ] **Step 5: Stage and commit**

```bash
git add src/features/workbench/queue-reducer.ts src/features/workbench/queue-store.ts src/features/workbench/issues.ts tests/unit/queue-reducer.test.ts tests/unit/workbench-issues.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(workbench): add review and queue policies"
```

### Task 3: Add typed EN/VI Workbench copy and explicit-choice persistence

**Files:**
- Create: `src/features/workbench/copy.ts`
- Modify: `src/app/copy.ts:1-end`
- Modify: `src/features/transcription/types.ts: legacy AppSettings declaration only`
- Modify: `src/features/transcription/models.ts:66-75`
- Create: `tests/components/workbench.test.tsx`
- Read only: `src/app/copy-types.ts` Phase 1 Foundation implementation

- [ ] **Step 1: Add a compile/runtime parity test**

Create the first `tests/components/workbench.test.tsx` case. Import `WORKBENCH_COPY` and recursively compare EN/VI key paths and leaf kinds. Assert formatting for every recommendation/issue code returns non-empty EN and VI text and preserves parameters `Whisper Base`, `sample.wav`, `145`, and `WebGPU`.

Run: `pnpm vitest run tests/components/workbench.test.tsx`

Expected: exit 1; `src/features/workbench/copy.ts` does not exist.

- [ ] **Step 2: Create feature copy through the acyclic Foundation helper**

Create `src/features/workbench/copy.ts`. Import `defineCopy`, `CopyParams`, and `InterfaceLanguage` only from `@/app/copy-types`; never import `@/app/copy`. Its exported `WORKBENCH_COPY` must have identical EN/VI keys for: page title/description; four stage labels; File/Link tabs; choose/drop/append/remove/move earlier/move later; source privacy; link label/helper/invalid/server retrieval; language/model/search/no-results/result-count; recommendation title/change-model/advanced-details/download-size/multilingual/dtype/runtime; Setup/Review headings; source/language/model/location/downloads/conversion/privacy summary labels; local WebGPU/local WASM/server values; no conversion/required conversion; Transcribe/Transcribe selected/Transcribe all; and all issue/recommendation reason codes from Tasks 1–2.

Export `getWorkbenchCopy(language: InterfaceLanguage)`, `formatRecommendation(language, decision, catalog, capabilities)`, and `formatWorkbenchIssue(language, issue)` from the feature module. Then make `src/app/copy.ts` import `WORKBENCH_COPY` and extend Phase 1's exact registry in the same edit:

```ts
export interface CopyRegistry {
  shell: typeof SHELL_COPY
  settings: typeof SETTINGS_COPY
  workbench: typeof WORKBENCH_COPY
}

export const COPY_REGISTRY: Readonly<CopyRegistry> = Object.freeze({
  shell: SHELL_COPY,
  settings: SETTINGS_COPY,
  workbench: WORKBENCH_COPY,
})
```

Later phases add editor, Library, and Drive keys additively to this same typed export. Parameter readers must be local functions that accept `CopyParams`, return safe string/number fallbacks, and never cast provider text into primary copy. Required exact trust copy:

```text
EN local: Local files stay in this browser unless you explicitly choose server processing. Drive sync stores transcript data only.
VI local: Tệp cục bộ nằm trong trình duyệt này trừ khi bạn chủ động chọn xử lý trên máy chủ. Đồng bộ Drive chỉ lưu dữ liệu bản chép.
EN link: The transcription server will retrieve and process this linked media. The browser does not fetch it for review.
VI link: Máy chủ chép lời sẽ truy xuất và xử lý nội dung từ liên kết này. Trình duyệt không tải nội dung để kiểm tra.
```

Explicit-choice text must state that Small uses more memory and may run more slowly, while q4 models require secure-context WebGPU; it must not claim measured device speed, RAM, GPU tier, accuracy, battery, or language-specific performance.

Add `explicitModelId: string | null` to legacy `AppSettings` only and set `DEFAULT_SETTINGS.explicitModelId` to `null`. Preserve `uiLanguage: InterfaceLanguage` exactly as delivered by Phase 1B and import `InterfaceLanguage` only from `@/app/copy-types`; `UiLanguage` must not appear in Phase 2 source or tests. Recommendation input carries both `storedModelId` and `storedExplicitModelId`; automatic recommendation remains derived and unpersisted. Explicit evidence is valid only when `storedExplicitModelId` is non-null, exists in the catalog, supports the resolved language, and can run. Invalid stored explicit evidence remains stored for warning/recovery but is never silently treated as a valid explicit choice and never drives model preservation.

Automatic selection never writes either global field, before or after Start/Submit. `item-started` still captures the effective recommended `modelId` in that run's immutable `CapturedTranscriptionSettings`. Explicit selection immediately persists the selected ID in both global fields, `modelId` and `explicitModelId`, and Start uses that choice without a second write. `storedModelId` remains legacy/display evidence; only `storedExplicitModelId` can establish explicit-choice status. Removed, language-incompatible, or runtime-incompatible explicit evidence remains stored unchanged for warning/recovery, is treated as invalid for selection, and is never silently cleared or overwritten by fallback. Tests cover valid explicit preservation; invalid evidence retention/recovery; automatic Start and Link Submit with zero settings writes plus captured effective model; and explicit selection writing both fields once.

- [ ] **Step 3: Run green**

Run: `pnpm vitest run tests/components/workbench.test.tsx`

Expected: exit 0; parity case passes in jsdom.

- [ ] **Step 4: Stage and commit**

```bash
git add src/features/workbench/copy.ts src/app/copy.ts src/features/transcription/types.ts src/features/transcription/models.ts tests/components/workbench.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "feat(workbench): localize guided setup"
```

### Task 4: Build keyboard-complete setup and review components

**Files:**
- Create: `src/features/workbench/components/WorkbenchCombobox.tsx`
- Create: `src/features/workbench/components/StageRail.tsx`
- Create: `src/features/workbench/components/SourceSetup.tsx`
- Create: `src/features/workbench/components/ReviewPanel.tsx`
- Modify: `tests/components/workbench.test.tsx:1-end`

- [ ] **Step 1: Add failing component behavior and axe tests**

Add tests that render each component in EN and VI and assert:

1. The trigger button is the sole `role="combobox"`: it has `aria-controls` and `aria-expanded` while closed and open, and never has `aria-activedescendant`. The popup input has `role="searchbox"`, owns `aria-controls` while open, and owns `aria-activedescendant` only while an enabled result is active. It is never a second combobox. The popup list has `role="listbox"`; each result has `role="option"` and `aria-selected`. Opening focuses the searchbox. ArrowDown/Up, Home, and End from the searchbox update the searchbox's active descendant while retaining searchbox focus; Enter selects and restores trigger focus; Escape closes and restores trigger focus. Typing filters by code/name/native/Whisper name and retains searchbox focus, including with no results. Tab closes and follows normal tab order without restoring trigger focus. Outside pointer closes without stealing focus. Result count is polite.
2. Both language and model controls use this component. Model details stay collapsed until Change model. Explicit Small/q4 choices remain available and selection callback marks them explicit.
3. Stage rail uses an ordered list with textual current state via `aria-current="step"`; completed available stages are buttons and unavailable future stages are text, not disabled wizard controls.
4. File/Link is a real tablist. File input is `multiple` and accepts `audio/*,video/*`. Link is disabled/omitted when server capabilities lack `url`. Link validation accepts only `http:`/`https:`.
5. Review renders each canonical issue once, blocking issue in `ProductErrorPanel`/alert semantics once, informational notices without `role="alert"`, and disables start only for blocking issues.
6. Direct `axe.run(container)` has zero critical/serious violations for empty Setup, populated Review, model disclosure, and blocking Review.

Run: `pnpm vitest run tests/components/workbench.test.tsx`

Expected: exit 1; component imports fail.

- [ ] **Step 2: Implement `WorkbenchCombobox` completely**

The component API is:

```ts
export interface WorkbenchComboboxOption { value: string; label: string; description: string; searchText: string; disabled?: boolean }
export interface WorkbenchComboboxProps { id: string; label: string; searchLabel: string; emptyText: string; resultCount: (count: number) => string; value: string | null; options: readonly WorkbenchComboboxOption[]; disabled?: boolean; onValueChange(value: string): void }
```

Implement a button trigger plus absolutely positioned panel constrained with `w-[min(calc(100vw-2rem),var(--radix-popover-trigger-width,100%))] max-w-full`; no fixed minimum width. Define `listboxId` as `${id}-listbox` and derive each stable option ID from `id` plus the option's immutable `value`, never its filtered-array index. The trigger is the sole ARIA combobox owner in both states: render `role="combobox"`, `aria-controls={listboxId}`, and `aria-expanded={open}` at all times. Never render `aria-activedescendant` on the trigger.

On open, clear the query, set the active option to the selected enabled option when present or otherwise the first enabled option, then focus the popup input. The input has `role="searchbox"`, its accessible name is `searchLabel`, and while rendered/open has `aria-controls={listboxId}`. It must not have `role="combobox"`, `aria-expanded`, or `aria-autocomplete`. Render `aria-activedescendant={activeOptionId}` on this focused searchbox only when an enabled filtered option is active; omit it when filtering yields no result. Filter with `searchText.toLocaleLowerCase().includes(query.toLocaleLowerCase())`. Filtering retains searchbox focus and resets the active option to the selected enabled match or first enabled match; no match sets no active option. The popup collection has `id={listboxId}` and `role="listbox"`. Options use their stable derived IDs, `role="option"`, `aria-selected`, and 44 px minimum height.

While the searchbox owns DOM focus, ArrowDown/Up wrap among enabled filtered options, Home/End choose the first/last enabled option, and active changes update the searchbox's `aria-activedescendant`. Enter selects the active option, closes, and queues trigger focus with `queueMicrotask`; Escape closes without selection and queues trigger focus. Tab closes and allows native forward/backward tab movement without refocusing the trigger. Outside pointer closes and leaves focus on the pointer target. Scroll the active option with `scrollIntoView({block:"nearest"})`. A visually hidden `aria-live="polite"` region reports result count. Tests assert exactly one combobox, trigger ownership of expanded/controls, focused searchbox ownership of controls/active descendant, and no conflicting active-descendant owner. No positive tabindex.

- [ ] **Step 3: Implement the three product components**

`StageRail` owns and uses this exact stage union; no lowercase or ambient `stage` type exists:

```ts
export type WorkbenchStage = "source" | "review" | "transcribe" | "edit"

export interface StageRailProps {
  current: WorkbenchStage
  available: readonly WorkbenchStage[]
  labels: Readonly<Record<WorkbenchStage, string>>
  onSelect(stage: WorkbenchStage): void
}
```

Render an `ol` with four items and no progress percentage.

`SourceSetup` accepts source mode/drafts, queue items, selected language/model, recommendation, server capabilities, busy flag, and callbacks. File callback receives `File[]` and never replaces caller state. Link callback receives raw draft; validation runs through exported `validateWorkbenchUrl(value): {valid:true;url:string}|{valid:false}` using `new URL(value)` and exact protocol allowlist. Build language options from `auto + TRANSCRIPTION_LANGUAGES`; model options from complete `WHISPER_MODELS`. Hide advanced model picker by default. Show recommendation name, local runtime, and localized reason before controls. Show privacy copy beside active source. Disable source mutations only while `busy`; queue inspection remains available.

Create `src/features/workbench/components/ReviewPanel.tsx` with the complete status/action implementation below. `readyCount` is computed by `WorkbenchPage` with `state.items.filter((item) => item.status === "ready").length`; it never includes `cancelled` or `failed`. Product-error primary recovery dispatches retry through `onRetry`, not start:

```tsx
import { Button } from "@/components/ui/button"
import type { ProductError, ProductIssue } from "@/app/copy"
import type { MediaAnalysis } from "@/features/transcription/types"
import type { QueueItem } from "../types"

export interface ReviewPanelLabels {
  heading: string
  source: string
  language: string
  model: string
  location: string
  downloads: string
  conversion: string
  privacy: string
  noDownloads: string
  noConversion: string
  conversionRequired: string
  transcribe: string
  transcribeSelected: string
  transcribeAll: string
  retry: string
  cancelled: string
}

export interface ReviewPanelProps {
  selected: QueueItem | null
  analysis: MediaAnalysis | null
  languageLabel: string
  modelLabel: string
  processingLocationLabel: string
  privacyText: string
  issues: readonly ProductIssue[]
  readyCount: number
  labels: ReviewPanelLabels
  formatIssue(issue: ProductIssue): string
  formatError(error: ProductError): string
  onStartSelected(itemId: string): void
  onStartAll(): void
  onRetry(itemId: string): void
}

const isProductError = (value: QueueItem["issue"]): value is ProductError =>
  value !== null && "occurrenceId" in value

export function ReviewPanel({
  selected,
  analysis,
  languageLabel,
  modelLabel,
  processingLocationLabel,
  privacyText,
  issues,
  readyCount,
  labels,
  formatIssue,
  formatError,
  onStartSelected,
  onStartAll,
  onRetry,
}: ReviewPanelProps) {
  if (selected === null) return null

  const blocking = issues.some((issue) => issue.blocking)
  const mayStartSelected = selected.status === "ready" && !blocking
  const mayRetry = selected.status === "cancelled" || selected.status === "failed"
  const downloads = analysis?.requiredAssets.filter((asset) => asset.required) ?? []

  return (
    <section aria-labelledby="workbench-review-heading" className="space-y-6">
      <h2 id="workbench-review-heading" className="text-lg font-semibold">{labels.heading}</h2>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">{labels.source}</dt><dd>{selected.displayName}</dd></div>
        <div><dt className="text-muted-foreground">{labels.language}</dt><dd>{languageLabel}</dd></div>
        <div><dt className="text-muted-foreground">{labels.model}</dt><dd>{modelLabel}</dd></div>
        <div><dt className="text-muted-foreground">{labels.location}</dt><dd>{processingLocationLabel}</dd></div>
        <div>
          <dt className="text-muted-foreground">{labels.downloads}</dt>
          <dd>{downloads.length === 0 ? labels.noDownloads : downloads.map((asset) => `${asset.label} (${asset.sizeMb} MB)`).join(", ")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{labels.conversion}</dt>
          <dd>{analysis?.needsFfmpeg ? labels.conversionRequired : labels.noConversion}</dd>
        </div>
        <div className="sm:col-span-2"><dt className="text-muted-foreground">{labels.privacy}</dt><dd>{privacyText}</dd></div>
      </dl>

      {issues.length > 0 ? (
        <ul className="space-y-2">
          {issues.map((issue) => (
            <li
              key={`${issue.code}\u0000${issue.scopeId}`}
              role={issue.blocking ? "alert" : undefined}
              className="rounded-md border p-3 text-sm"
            >
              {formatIssue(issue)}
            </li>
          ))}
        </ul>
      ) : null}

      {isProductError(selected.issue) ? (
        <div role="alert" className="space-y-3 rounded-md border border-destructive/40 p-3 text-sm">
          <p>{formatError(selected.issue)}</p>
          <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={() => onRetry(selected.id)}>
            {labels.retry}
          </Button>
        </div>
      ) : selected.status === "cancelled" ? (
        <div className="space-y-3 rounded-md border p-3 text-sm">
          <p>{labels.cancelled}</p>
          <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={() => onRetry(selected.id)}>
            {labels.retry}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        {mayRetry ? null : (
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            disabled={!mayStartSelected}
            onClick={() => onStartSelected(selected.id)}
          >
            {labels.transcribeSelected}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          className="min-h-11 w-full sm:w-auto"
          disabled={readyCount === 0}
          onClick={onStartAll}
        >
          {labels.transcribeAll}
        </Button>
      </div>
    </section>
  )
}
```

This component renders source metadata only when selected, model/ffmpeg download size from `analysis.requiredAssets`, conversion state, privacy, and each canonical issue once. A failed/cancelled item shows Retry only; Retry calls `onRetry(selected.id)`. It never calls `onStartSelected` for a terminal item. Every primary action is at least 44 px high and full width below `sm`.

- [ ] **Step 4: Run green and adjacent accessibility tests**

Run: `pnpm vitest run tests/components/workbench.test.tsx`

Expected: exit 0; Workbench's own feature tests pass with zero critical/serious axe findings.

- [ ] **Step 5: Stage and commit**

```bash
git add src/features/workbench/components/WorkbenchCombobox.tsx src/features/workbench/components/StageRail.tsx src/features/workbench/components/SourceSetup.tsx src/features/workbench/components/ReviewPanel.tsx tests/components/workbench.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "feat(workbench): add accessible setup and review"
```

### Task 5: Compose Workbench with preflight, issue dedupe, and captured starts

**Files:**
- Create: `src/features/workbench/WorkbenchPage.tsx`
- Modify: `src/app/LegacyProduct.tsx:legacy Workbench bridge and provider helpers`
- Modify: `src/features/media/preflight.ts:31-73, 101-172`
- Modify: `tests/components/workbench.test.tsx:1-end`

- [ ] **Step 1: Add failing integration tests**

Use injected `bridge`, `analyzeFile`, capability state, settings, and `createId` props. Assert:

- selecting two files appends two `QueueItem`s and analyzes only the first when selection was null;
- a later selection appends and preserves current selection;
- analysis uses `readMediaDuration` behavior through the injected production analyzer;
- automatic recommendation does not call settings persistence;
- selecting a model explicitly calls persistence once;
- starting with an automatic local recommendation performs no global settings write and captures that effective model in the bridge request;
- Review lists source, language, model, runtime, downloads, conversion, privacy, and one canonical copy of each issue;
- start remains disabled during analysis or any blocking issue;
- start dispatches `item-started` before bridge invocation and passes an immutable exact six-field settings snapshot;
- changing UI controls after bridge start does not mutate the captured object;
- a cancelled item exposes Retry, does not expose a direct Transcribe action, and reaches `ready` only after Retry dispatches `item-retried`;
- a failed item exposes Retry, does not expose a direct Transcribe action, and reaches `ready` only after Retry dispatches `item-retried`;
- Transcribe all sends only items whose status is exactly `ready`; cancelled and failed items remain untouched until their explicit Retry actions;
- link Review requires no `File`/`MediaAnalysis`, passes `{kind:"link",url,name}` to bridge, and is unavailable without configured URL capability;
- changing EN/VI rerenders copy without resetting queue/source/link/review state;
- rendering Workbench never calls bridge, `transcribeLocally`, `convertWithFfmpeg`, or dynamic wasm imports.

Run: `pnpm vitest run tests/components/workbench.test.tsx`

Expected: exit 1; `WorkbenchPage` import fails.

- [ ] **Step 2: Make preflight return facts, not duplicate user messages**

In `src/features/media/preflight.ts`, preserve `readMediaDuration` and cleanup byte-for-byte. Remove `WARNING_COPY` and `buildWarnings`; return `warnings: []`. Keep `requiredAssets`, `needsFfmpeg`, secure-context/WebGPU detection, recommended mode, duration, chunk plan, and model-limit logic. Workbench derives stable `ProductIssue` codes from those facts. Existing legacy rendering remains safe because an empty warning array is valid.

- [ ] **Step 3: Implement `WorkbenchPage` state and effects**

Export these exact props and bridge types:

```ts
export interface WorkbenchSettings { uiLanguage: InterfaceLanguage; modelId: string; explicitModelId: string | null; language: LanguageCode; mode: ProcessingMode; chunkSeconds: number; overlapSeconds: number; serverModelId: string | null }
export interface LegacyWorkbenchStartRequest { itemId: string; source: QueueSource; settings: CapturedTranscriptionSettings }
export interface LegacyWorkbenchStartResult { transcriptId: string }
export interface LegacyWorkbenchBridge { start(request: LegacyWorkbenchStartRequest): Promise<LegacyWorkbenchStartResult> }
export interface WorkbenchPageProps { settings: WorkbenchSettings; serverCapabilities: ServerCapabilities | "loading" | "error" | null; bridge: LegacyWorkbenchBridge; analyzeFile?: typeof analyzeMediaFile; createId?: typeof createId; onSettingsChange(next: Partial<WorkbenchSettings>): void; onExplicitLocalModelChange(modelId: string): void }
```

Create one `QueueStore` with `useRef(createQueueStore()).current`; read `const state = useSyncExternalStore(queueStore.subscribe, queueStore.getState, queueStore.getState)` and dispatch only through `queueStore.dispatch`. Do not use `useReducer`, a mirrored state ref, or a callback-closure queue snapshot. Phase 3 transfers this same store ownership into the coordinator. Keep `sourceMode`, `linkDraft`, `analysisByItemId`, and `analysisStateByItemId` local. Detect capability in one effect using `getWebGpuStatus`; do not request workers/assets. Recompute recommendation with `useMemo` from exact inputs. `auto` resolves through current UI language.

`appendFiles(files)` allocates each item through injected `createId("queue")` and `{kind:"file",file,name:file.name,mediaId:null}`; dispatch once. Analyze only the first appended item when `selectedItemId` was null. Selecting an existing item analyzes it only when no cached fact/state exists. Analysis failure becomes `media.analysis-failed` for that item, not toast/dialog.

For review issue generation, add source validity issue first, recommendation blocking/replacement issue second, analysis issue/facts third, downloads fourth, and privacy last; pass through `canonicalizeIssues`. Never render analysis warnings. A link item creates no browser preflight and gets `privacy.server-link`; a file gets `privacy.local`. Server mode uses `recommendServerModel` and advertised default; local restrictions never inspect server model size/q4.

`startItem(item)` must recompute current canonical issues and return unless `item.status === "ready"` and no issue blocks. For a local automatic selection, perform no global settings write on recommendation, Start, or Submit. For a user-selected model, `onExplicitLocalModelChange` writes `{ modelId: selectedModelId, explicitModelId: selectedModelId }` once when the choice is confirmed. Invalid stored explicit evidence remains stored warning/recovery data and never satisfies an explicit-choice requirement. Construct a fresh exact six-field captured object containing the effective run model, dispatch `item-started`, await bridge, then dispatch completed or a single scoped `ProductError` with `occurrenceId=createId("error")`, code `runtime.legacy-failed`, scope `queue-item`, safe params `{itemName}`, retry action, and development stack only under `import.meta.env.DEV`. It must not toast or open another error channel.

Use this exact queue-status wiring inside `WorkbenchPage`; every callback reads the synchronous store, and dispatch return values are available immediately:

```tsx
const retryItem = React.useCallback((itemId: string) => {
  const item = queueStore.getState().items.find((candidate) => candidate.id === itemId)
  if (item?.status !== "cancelled" && item?.status !== "failed") return
  queueStore.dispatch({ type: "item-retried", itemId })
}, [queueStore])

const startSelected = React.useCallback(async (itemId: string) => {
  const item = queueStore.getState().items.find((candidate) => candidate.id === itemId)
  if (item?.status !== "ready") return
  await startItem(item)
}, [queueStore, startItem])

const startAll = React.useCallback(async () => {
  const readyIds = queueStore.getState().items
    .filter((item) => item.status === "ready")
    .map((item) => item.id)

  if (readyIds.length === 0) return
  queueStore.dispatch({ type: "batch-started" })

  for (const itemId of readyIds) {
    const item = queueStore.getState().items.find((candidate) => candidate.id === itemId)
    if (item?.status !== "ready") continue
    await startItem(item)
  }
}, [queueStore, startItem])

const readyCount = state.items.filter((item) => item.status === "ready").length

<ReviewPanel
  selected={selectedItem}
  analysis={selectedAnalysis}
  languageLabel={selectedLanguageLabel}
  modelLabel={selectedModelLabel}
  processingLocationLabel={processingLocationLabel}
  privacyText={privacyText}
  issues={selectedIssues}
  readyCount={readyCount}
  labels={copy.review}
  formatIssue={(issue) => formatWorkbenchIssue(settings.uiLanguage, issue)}
  formatError={(error) => formatProductError(settings.uiLanguage, error).message}
  onStartSelected={(itemId) => { void startSelected(itemId) }}
  onStartAll={() => { void startAll() }}
  onRetry={retryItem}
/>
```

`startAll` captures IDs of `ready` items only, preserves array order, awaits each start, and never dispatches `item-retried`. A cancelled or failed item can join a later batch only after its visible Retry action dispatches `item-retried` and the reducer changes it to `ready`. No `Promise.all` is permitted.

- [ ] **Step 4: Add the narrow `LegacyProduct.tsx` bridge without rewriting runtime**

Keep existing provider methods and result dialog in `src/app/LegacyProduct.tsx`. Extract its existing URL branch into `transcribeServerLink(url, queueId, runSettings)` by replacing reads of `urlInput.trim()` with the `url` parameter. In this Phase 2 commit, preserve the existing positional call `api.submitJob({ type: "url", url }, runSettings.language, serverModelId)`, where `serverModelId` is the same already-validated selected server model captured by the existing branch; subscribe through the existing API, save through the existing current save path, and resolve the transcript. Phase 3 atomically changes `ServerTranscriptionApi` and every retained call site to its final object-options contract. Phase 2 adds no signal or cancellation/event normalization. Do not edit thin `src/App.tsx`; `LegacyProduct` imports neither `App` nor `AppShell`.

Create one memoized bridge:

```ts
const legacyWorkbenchBridge = React.useMemo<LegacyWorkbenchBridge>(() => ({
  async start(request) {
    const runSettings: AppSettings = { ...settingsRef.current, mode: request.settings.mode, modelId: request.settings.modelId, language: request.settings.language, chunkSeconds: request.settings.chunkSeconds, overlapSeconds: request.settings.overlapSeconds }
    const document = request.source.kind === "link"
      ? await transcribeServerLink(request.source.url, request.itemId, runSettings)
      : await transcribeFile(request.source.file, request.itemId, runSettings)
    setTranscript(document)
    return { transcriptId: document.id }
  },
}), [activeServerCapabilities, driveAccessToken])
```

Render `WorkbenchPage` only for the Workbench `AppRoute`; keep Phase 1B lazy Settings/Library/transcript route handling unchanged. Pass existing settings writes. Persist explicit local choice only inside `onExplicitLocalModelChange`; the existing default recommendation must not trigger it. Remove old Workbench `MainControls`, URL card, `DropZone`, file queue, preflight card, and recent rail from the Workbench route only after the bridge is wired. Keep their runtime helper functions and result dialog until Phase 3/4 replacements consume them. Do not automatically open a result after batch completion; preserve the current single-result bridge behavior only where the current path requires it.

- [ ] **Step 5: Run focused green and regression tests**

Run: `pnpm vitest run tests/components/workbench.test.tsx tests/unit/recommendation.test.ts tests/unit/queue-reducer.test.ts tests/unit/workbench-issues.test.ts tests/unit/preflight.test.ts`

Expected: exit 0; 5 files pass; no worker/network call occurs in render tests.

- [ ] **Step 6: Stage and commit**

```bash
git add src/features/workbench/WorkbenchPage.tsx src/app/LegacyProduct.tsx src/features/media/preflight.ts tests/components/workbench.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "feat(workbench): bridge guided review to transcription"
```

### Task 6: Prove REC-01..06 and WB-01..02 in the browser

**Files:**
- Modify: `src/features/transcription/models.ts:1-end`
- Modify: `src/features/workbench/WorkbenchPage.tsx:recommendation/model option wiring`
- Create: `tests/e2e/fixtures/runtime.ts`
- Create: `tests/e2e/recommendation.spec.ts`
- Create: `tests/e2e/workbench.spec.ts`
- Modify: `tests/e2e/whisdom.spec.ts:26-67, 112-249`
- Modify: `tests/e2e/server-mode.spec.ts:1-19`
- Modify: `playwright.config.ts:13-16`

- [ ] **Step 1: Add deterministic browser fixtures**

Phase 2 creates `tests/e2e/fixtures/runtime.ts` as the base fixture. It exports `createSilentWav`, `installWebGpu(page, available, secure=true)`, `mockServer(page, options)`, `recordHeavyRequests(page)`, and `expectNoHeavyRequests(requests)`. It does not declare placeholder versions of Phase 3's `installRuntimeFixture`, `WorkbenchFixtureState`, or `openWorkbenchState`; Phase 3 modifies this same file and adds their complete exact implementations. Heavy URL patterns are `/onnx|\.wasm($|\?)|ffmpeg|huggingface|whisper.*\.(bin|json)/i`; explicitly exclude app JS chunks whose names contain feature words but are not model assets. Server mock handles `/api/capabilities`, `/api/transcribe`, and SSE/status completion using the current server API contract, records submitted form keys, and returns canonical fixture segments.

Where REC-03/05 require a catalog unavailable in production, use a build-time E2E-only catalog seam:

```ts
declare global { interface Window { __WHISDOM_E2E_MODEL_CATALOG__?: WhisperModel[] } }
export const ACTIVE_MODEL_CATALOG = import.meta.env.MODE === "e2e" && window.__WHISDOM_E2E_MODEL_CATALOG__ ? window.__WHISDOM_E2E_MODEL_CATALOG__ : WHISPER_MODELS
```

Place that expression in `models.ts` and consume `ACTIVE_MODEL_CATALOG` only in Workbench recommendation/model options; legacy runtime still resolves selected IDs through the existing catalog. Set Playwright web server command to `pnpm build --mode e2e && pnpm preview --host 127.0.0.1 --port 4173`. Normal `pnpm build` tree-shakes the seam condition false. Tests install the catalog before navigation through `page.addInitScript`.

- [ ] **Step 2: Write and run REC browser tests red**

`tests/e2e/recommendation.spec.ts` contains exactly six tests prefixed `REC-01`..`REC-06`. Assert visible model/runtime/reason, advanced disclosure closed initially, no automatic settings persistence, replacement precedence, blocking recovery, valid explicit persistence across reload, Small/q4 trade-off copy, and server default label/location independent from local catalog. Run each in EN and repeat the recommendation text/state assertion after switching to VI without queue reset.

Run: `pnpm playwright test tests/e2e/recommendation.spec.ts --reporter=list`

Expected red: exit 1 before the fixture seam/wiring; failures identify missing REC state, not navigation or syntax errors.

- [ ] **Step 3: Wire fixture seam and run REC green**

Run: `pnpm playwright test tests/e2e/recommendation.spec.ts --reporter=list`

Expected: exit 0; `6 passed`.

- [ ] **Step 4: Write WB-01 and WB-02**

`WB-01` selects `first.wav` and `second.wav`, appends `third.wav` in a later picker action, proves first remains selected, removes third, moves second earlier/later with visible order, reaches Review, checks language/model/runtime/download/conversion/privacy, starts selected, and verifies captured form/runtime values. Run at desktop, 390, and 320 using one test body loop or three named projects; assert `document.documentElement.scrollWidth <= innerWidth`, every visible primary/source/combobox control rectangle stays in viewport, and touch controls are at least 44 CSS px in both dimensions.

`WB-02` configures server capabilities with `input_types:["file","url"]`, chooses Link, fills `https://example.test/media?id=1`, reaches Review with no file input requirement or browser media fetch, starts, and asserts submitted form contains `url`, language, and advertised default model but no `audio`. Add invalid `ftp:`, malformed URL, missing URL capability, and server unavailable contextual retry assertions. Repeat core flow in VI at 390 px.

Both tests start request recording before `page.goto`. Before Transcribe, assert no heavy requests. After an audio-only review, assert no ffmpeg/model request. Do not assert runtime adapter cancellation or normalized progress.

Run: `pnpm playwright test tests/e2e/workbench.spec.ts --reporter=list`

Expected: exit 0; `2 passed` when viewport loops are internal.

- [ ] **Step 5: Update old E2E selectors without weakening assertions**

Replace tests now owned by REC/WB in `whisdom.spec.ts` with imports/helpers or remove exact duplicate scenarios. Keep shell, Settings, language switch, recent transcript bridge, cleanup, and gated runtime coverage. Never add `.first()`, `.nth()`, sleeps, or broad text selectors to bypass duplicate UI. Update `server-mode.spec.ts` to open Phase 1B Settings route and assert Link/Server controls are absent without `VITE_SERVER_URL`.

Run: `pnpm playwright test tests/e2e/whisdom.spec.ts tests/e2e/server-mode.spec.ts tests/e2e/recommendation.spec.ts tests/e2e/workbench.spec.ts --reporter=list`

Expected: exit 0; all nongated selected tests pass; zero strict-locator errors; no generated real-ASR execution.

- [ ] **Step 6: Stage and commit**

```bash
git add src/features/transcription/models.ts src/features/workbench/WorkbenchPage.tsx tests/e2e/fixtures/runtime.ts tests/e2e/recommendation.spec.ts tests/e2e/workbench.spec.ts tests/e2e/whisdom.spec.ts tests/e2e/server-mode.spec.ts playwright.config.ts
git diff --cached --name-only
git diff --cached
git commit -m "test(workbench): cover guided source and recommendation flows"
```

Expected staged paths: exactly eight paths from the task Files block; `playwright.config.ts` contains the single E2E-mode web-server command, not a duplicate server.

### Task 7: Cross-cutting Phase 2 accessibility, localization, responsive, and request gate

**Files:**
- Modify: `src/features/workbench/components/WorkbenchCombobox.tsx:1-end`
- Modify: `src/features/workbench/components/StageRail.tsx:1-end`
- Modify: `src/features/workbench/components/SourceSetup.tsx:1-end`
- Modify: `src/features/workbench/components/ReviewPanel.tsx:1-end`
- Modify: `src/features/workbench/WorkbenchPage.tsx:1-end`
- Modify: `tests/components/workbench.test.tsx:1-end`
- Modify: `tests/e2e/workbench.spec.ts:1-end`
- Modify: `tests/e2e/navigation-i18n.spec.ts:1-end`

Phase 2 keeps changed-flow axe, keyboard, focus, reflow, and request assertions in its own Workbench feature tests. Consolidation belongs exclusively to Phase 6.

- [ ] **Step 1: Add A11Y-AUTO-01 Workbench states**

Cover empty, model disclosure, file Review, link Review, and blocking Review in EN/VI at desktop, 390, and 320. Run axe and fail on every critical/serious violation. Observable assertions must also prove: one visible `h1`; main landmark; stage semantics; unique labels; combobox active option/count; informational issue lacks alert; blocking issue alerts once; no positive tabindex; 44×44 controls; no horizontal overflow at 200% zoom/320 CSS px; focus restoration after combobox Escape; keyboard completion of File/Link and Review.

Run: `pnpm playwright test tests/e2e/workbench.spec.ts --grep "WB-A11Y-01" --reporter=list`

Expected red: only newly added Phase 2 assertion failures; no fixture/navigation failure.

- [ ] **Step 2: Fix only Phase 2 presentation defects**

Adjust classes/ARIA in Phase 2 Workbench components. Required composition: single column through 1023 px; at `lg` approximately `minmax(0,7fr) minmax(18rem,3fr)` with no empty rail; 16 px mobile outer gutter; full-width controls at 320; paired secondary actions only where labels remain intact at 390; no fixed popover minimum; `overflow-x-clip` may protect motifs but must not hide focus or content. No gradients, glass, glow, fake waveform, remote font, or decorative image.

- [ ] **Step 3: Add I18N-01 and request assertions**

Switch EN↔VI while file queue, link draft, selected source, selected language, explicit model disclosure, and Review remain mounted. Assert state survives and all visible/accessible Workbench strings change through typed copy. Search built output/request log for old hardcoded Workbench English only after excluding model proper nouns, file names, URLs, and technical codes. Assert initial Workbench requests exclude lazy Library/editor/Settings chunks and model/ffmpeg/wasm assets; navigation to Settings may request Settings chunk.

Run: `pnpm playwright test tests/e2e/navigation-i18n.spec.ts tests/e2e/workbench.spec.ts --reporter=list`

Expected: exit 0; I18N-01 Workbench and WB-01/02 pass.

- [ ] **Step 4: Run accessibility/visual green**

Run: `pnpm playwright test tests/e2e/workbench.spec.ts --grep "WB-A11Y-01|WB-01|WB-02" --reporter=list`

Expected: exit 0; zero critical/serious axe violations; desktop/390/320 Light/Dark Workbench empty and Review snapshots/assertions pass. Commit snapshots only if the Phase 1B visual harness already treats them as reviewed baselines.

- [ ] **Step 5: Stage and commit**

```bash
git add src/features/workbench/components/WorkbenchCombobox.tsx src/features/workbench/components/StageRail.tsx src/features/workbench/components/SourceSetup.tsx src/features/workbench/components/ReviewPanel.tsx src/features/workbench/WorkbenchPage.tsx tests/components/workbench.test.tsx tests/e2e/workbench.spec.ts tests/e2e/navigation-i18n.spec.ts
git diff --cached --name-only
git diff --cached
git commit -m "fix(ui): harden guided workbench accessibility"
```

Expected staged paths: exactly eight paths from the task Files block.

## Phase 2 verification and review

- [ ] Run focused unit policy:

```bash
pnpm vitest run tests/unit/recommendation.test.ts tests/unit/queue-reducer.test.ts tests/unit/workbench-issues.test.ts tests/unit/preflight.test.ts
```

Expected: exit 0; all four files pass; REC unit suite reports 6 passed.

The queue suite must report passing tests named exactly `nextSequentialItem selects earliest ready only`, `cancelled item requires item-retried before selection`, and `failed item requires item-retried before selection`. Any test or implementation that directly selects or starts `cancelled`/`failed` is a phase-gate failure.

- [ ] Run component behavior and axe:

```bash
pnpm vitest run tests/components/workbench.test.tsx
```

Expected: exit 0; all selected tests pass; zero critical/serious axe findings and no unhandled React errors.

- [ ] Run named browser families:

```bash
pnpm playwright test tests/e2e/recommendation.spec.ts tests/e2e/workbench.spec.ts --reporter=list
```

Expected: exit 0; `8 passed` (`REC-01..06`, `WB-01..02`).

- [ ] Run adjacent navigation, localization, accessibility, visual, legacy shell, server visibility, and gated-test discovery:

```bash
pnpm playwright test tests/e2e/navigation-i18n.spec.ts tests/e2e/workbench.spec.ts tests/e2e/whisdom.spec.ts tests/e2e/server-mode.spec.ts tests/e2e/real-transcription.spec.ts --reporter=list
```

Expected: exit 0; all nongated scenarios pass; real ASR/WebGPU scenarios report only their documented skips; no `.first()` strict-locator workaround exists.

- [ ] Inspect production build/request behavior, not E2E-mode output:

```bash
pnpm build
```

Expected: exit 0; Library, transcript editor, and Settings remain separate lazy chunks; initial Workbench does not include/request model, ONNX, ffmpeg, wasm audio processor, editor, Library, or Settings heavy assets. The E2E catalog seam is unreachable in normal production mode.

- [ ] Run repository phase gate in this exact order:

```bash
pnpm typecheck
rtk lint
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Expected: every command exits 0; both lint commands report zero errors and zero warnings; all unit/component tests pass; production build succeeds; Playwright reports only documented real-ASR/WebGPU gated skips.

- [ ] Do not run worker typecheck unless an unplanned worker/shared worker-facing contract changed. No worker change is allowed by this plan.
- [ ] Remove generated `test-results/.last-run.json`, traces, screenshots not accepted by the existing visual harness, `dist/`, and caches before staging. Do not use `git clean`, reset, stash, or broad staging.
- [ ] Review exact diff against the entry scope. Confirm no runtime adapter rewrite, cancellation semantics, worker lifecycle, canonical schema, repository interface, `AppRoute`, `ProductIssue`, queue shape/action rename, server endpoint, Drive scope, or model-cache behavior changed.
- [ ] Confirm first-run detection uses only valid explicit stored model choice; recommendation metadata is absent from IndexedDB; automatic fallback remains derived and is never persisted even after Start; each queue capture stores its effective run model; valid compatible explicit choices survive; invalid explicit evidence remains stored for recovery while fallback is derived; Small/q4 never auto-select; server default remains separate.
- [ ] Confirm file selections append, selected item remains stable, link requires configured URL capability but no file/analysis, the exact six-field settings snapshot is immutable at start, review issues dedupe/order once, blocking issues alone gate start, `item-started` accepts only `ready`, `nextSequentialItem` returns only the earliest `ready`, cancelled/failed require visible Retry before returning to `ready`, privacy copy names processing location/network transfer, and no eager heavy request occurs.
- [ ] Confirm desktop, 390, and 320 composition, EN/VI parity, keyboard combobox/stage/source/review behavior, 44 px targets, focus restoration, zero page overflow, and zero critical/serious axe findings.
- [ ] Obtain task-level code-quality review after each commit and one phase-level review after the complete gate. Correct every P0/P1 and in-scope P2 finding, rerun focused tests, then rerun the complete phase gate.
- [ ] Record final Phase 2 commit IDs and command outputs in the orchestrator's execution log. Do not push or deploy unless explicitly requested.

## Self-review record

- [ ] **Spec coverage:** Tasks 1–2 own deterministic precedence, beginner-safe policy, separate server default, exact queue/captured settings, and issue ordering. Tasks 3–5 own EN/VI copy, explicit-choice persistence, File/Link drafts, append semantics, preflight, Setup/Review, privacy, gating, and legacy bridge. Tasks 6–7 own REC-01..06, WB-01..02, keyboard/axe, 320/390/desktop composition, localization state retention, and eager-request prevention.
- [ ] **Scope coverage:** No Phase 3 adapter/event/cancellation/progress implementation, Phase 4 editor/Library implementation, Settings replacement, Phase 5 Drive implementation, backend change, worker change, schema migration, or repository-contract mutation appears in any Files block.
- [ ] **Placeholder scan:** No deferred marker, generic error-handling instruction, out-of-order “same as” reference, undefined production helper, or execution-choice ending remains. Every helper named by a production step has an owning file and exact signature or is a pinned Phase 1B/platform API.
- [ ] **Type consistency:** `ProcessingMode`, `ProductIssue`, `ProductError`, recovery codes, canonical/repository contracts, queue fields/actions, `CapturedTranscriptionSettings`, and `AppRoute` retain master names and shapes. `src/features/workbench/types.ts` contains the sole exact master `MeasuredProgress` declaration; no conditional import, alias, duplicate, or relocation exists. Additive `explicitModelId` belongs only to legacy `AppSettings`; it never enters captured settings, canonical transcript JSON, repository records, or recommendation output. `InterfaceLanguage` remains solely owned by `src/app/copy-types.ts`; `UiLanguage` has zero source/test matches.
- [ ] **Behavior consistency:** Recommendation evaluates resolved `auto`, secure context, successful adapter, strict catalog membership, q4 threshold, language support, and explicit stored choice in REC precedence. Automatic decisions never persist; Start captures only the run-effective model. Explicit selection writes global `modelId` and `explicitModelId` together. Invalid explicit evidence remains stored for recovery. Link never receives browser preflight. File selection always appends. Batch bridge starts sequentially from `ready` only. Cancelled/failed items remain terminal until Retry dispatches `item-retried`; neither direct start nor sequential selection treats them as ready. Review renders canonical issues once. No eager ASR/ffmpeg/model/wasm request occurs.
