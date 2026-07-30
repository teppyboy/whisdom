# Precision Studio Phase 3 Runtime, Cancellation, and Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize every transcription provider behind the master runtime contract, execute one queue item at a time, expose truthful progress, and make cancellation terminal only after provider acknowledgement or confirmed worker teardown.

**Architecture:** Provider adapters own run IDs, abort controllers, worker requests, server job IDs, SSE subscriptions, and cleanup. A framework-independent coordinator owns exactly one active run, serializes queue work and persistence, ignores stale run events, and projects throttled progress into the pure Phase 2 queue reducer. One provider under `AppShell` owns the singleton queue store/coordinator across Workbench, Library, Transcript, and Settings query routes. Workbench only subscribes/unsubscribes. React renders coordinator snapshots through focused queue/progress components; confirmation toasts use a FIFO external store while failures remain one contextual `ProductError`.

**Tech Stack:** React 19, TypeScript 6, browser `Worker`, `AbortController`, `EventTarget`, ffmpeg.wasm, Transformers.js, Cloudflare Workers AI HTTP, Rust/Axum HTTP and SSE, Vitest 4, Testing Library, Playwright 1.60.

---

## Entry conditions, authority, and exclusions

- [ ] Work only in `F:\Workspace\whisdom\whisdom-precision-studio` on `feature/precision-studio-redesign`.
- [ ] Confirm Phase 2 is complete: `src/features/workbench/types.ts`, `queue-reducer.ts`, `WorkbenchPage.tsx`, and Phase 2 source/review components exist; REC-01..06 and WB-01..02 pass. Confirm `src/features/workbench/types.ts` exports the sole exact master `MeasuredProgress` declaration before creating any runtime file.
- [ ] Read `AGENTS.md`, the complete corrected spec `docs/superpowers/specs/2026-07-29-ui-redesign-design.md`, and `docs/superpowers/plans/2026-07-29-ui-redesign-master-rollout.md` before editing.
- [ ] Preserve the master declarations for `MeasuredProgress`, `RuntimeEvent`, `RuntimeRunHandle`, `RuntimeAdapter`, queue statuses/actions, canonical `startMs`/`endMs`, and `ProductError` without aliases or renamed fields. Every Phase 3 consumer imports `MeasuredProgress` directly from `@/features/workbench/types`; no runtime, adapter, coordinator, or component redeclares or aliases it.
- [ ] Keep at most one live ASR worker and one live ffmpeg worker. Normal completion and navigation reuse them. Forced cancellation terminates only the active worker type, retains Cache Storage, and creates one replacement lazily.
- [ ] Keep batch execution sequential. Default Cancel pauses after terminal acknowledgement; “Cancel current and continue” advances only after acknowledgement; “Stop batch” does not start another item.
- [ ] Do not mark an item `cancelled` when cancellation is requested. Keep `cancelling` until `run.cancelled` arrives after cooperative acknowledgement, fetch/SSE abort completion, or worker termination confirmation.
- [ ] Do not add editor, Library, Google Drive sync, source-media persistence, Cloudflare Worker API changes, or Rust server changes. Existing `POST /api/cancel/:jobId` and SSE contract are sufficient.
- [ ] Do not run `pnpm --filter whisdom-worker typecheck`: this phase changes browser workers under `src/workers/`, not the Cloudflare package under `worker/` or its shared boundary. Run it only if implementation unexpectedly edits `worker/`; stop for scope review first.
- [ ] Do not run `cargo build`: no `server/` file changes are planned. Stop for approval if client compatibility cannot be achieved without a server edit.

## File map

**Create**

- `src/features/transcription/runtime.ts` — exact master runtime contracts importing `MeasuredProgress` from Workbench types, event helpers, measured-progress validation, runtime-seconds conversion, ETA window, bounded log, and presentation throttle.
- `src/features/transcription/runtime-coordinator.ts` — one-active-run ownership, direct Workbench `MeasuredProgress` type import, sequential ready-only queue execution, persistence handoff, cancellation acknowledgement, stale-event rejection, and disposal.
- `src/app/RuntimeCoordinatorProvider.tsx` — `AppShell`-scoped singleton queue/coordinator owner, context access, and app-teardown disposal.
- `src/features/transcription/adapters/local.ts` — local ASR/ffmpeg adapter and forced per-type fallback.
- `src/features/transcription/adapters/cloudflare.ts` — run-scoped chunk loop with one abort controller and no post-abort chunk start.
- `src/features/transcription/adapters/server.ts` — submit/job/SSE adapter with cancel endpoint and terminal-path unsubscribe.
- `src/app/toast-store.ts` — confirmation-only FIFO store, 5-second default, 10-second Undo, hover/focus pause.
- `src/components/ui/sheet.tsx` — Radix Dialog-based mobile bottom-sheet primitive.
- `src/features/workbench/QueuePanel.tsx` — desktop queue actions and statuses.
- `src/features/workbench/QueueSheet.tsx` — mobile queue with trap, Escape, close, safe-area padding, and trigger-focus restoration.
- `src/features/workbench/RunProgress.tsx` — direct Workbench `MeasuredProgress` type import, phase/activity/elapsed/eligible ETA, and bounded technical log.
- `tests/unit/runtime.test.ts` — RUN-01..04 primitives, adapter lifecycle, races, cache retention, and singleton assertions.
- `tests/unit/runtime-adapters.test.ts` — local, Cloudflare, and server adapter request/resource tests.
- `tests/components/queue.test.tsx` — QUEUE-01 controls, cancellation choices, sheet accessibility, and reorder announcements.
- `tests/e2e/fixtures/runtime.ts` — modify the Phase 2 request/capability fixture with deterministic browser fake runtime, state openers, and resource counters.
- `tests/e2e/runtime-queue.spec.ts` — RUN-01..04, QUEUE-01, ERR-01 across desktop, 390 px, and 320 px.

**Modify**

- `src/lib/transcription-worker-client.ts:1-287` — replace promise-only calls with run-scoped local task handles plus narrow cooperative-request/forced-termination methods.
- `src/workers/transcription.worker.ts:22-139,209-211` — add run-scoped cancel request/ack checkpoints; retain model cache configuration at lines 142-190 unchanged.
- `src/workers/ffmpeg.worker.ts:1-62,88-95` — add cancel request/ack checkpoints without changing single-threaded core URLs/configuration.
- `src/features/server-transcription/api.ts:51-116` — accept request signals for submit/cancel while retaining URLs, auth, and form fields.
- `src/features/server-transcription/sse.ts:3-63` — expose a completion promise and guarantee idempotent abort/reader cleanup.
- `src/features/server-transcription/client.ts:27-54` — accept `AbortSignal` for Cloudflare chunk fetch.
- `src/features/workbench/queue-reducer.ts:entire reducer` — enforce the master transition table, immutable captured settings, reorder/remove/retry rules, and pause/continue semantics.
- `src/features/workbench/WorkbenchPage.tsx:runtime orchestration and queue composition block` — replace provider calls with provider-owned coordinator subscription/commands and mount progress/panel/sheet; unmount only unsubscribes and never disposes/cancels or publishes/clears work activity.
- `src/features/transcription/runtime-coordinator.ts:1-end` — directly consume Phase 1's frozen `setWorkActivity` API and become sole publisher for active/cancelling conversion/transcription state.
- `src/app/work-activity-store.ts:1-end` — consume the Phase 1 frozen API without changing it.
- `src/app/AppShell.tsx:provider boundary, route outlet, and live-region block` — mount the runtime provider and confirmation toast viewport once above all query routes; do not subscribe shell/header/navigation to progress.
- `src/features/workbench/copy.ts:runtime, queue, error, toast keys` — add matching EN/VI full messages and accessible names through `defineCopy` from `src/app/copy-types.ts`; leave registry composition in `src/app/copy.ts` unchanged.
- `vitest.config.ts:5-8` — include jsdom component tests while preserving Node unit environment.
- `tests/setup.ts:entire file` — retain Testing Library cleanup and add no production-global mutation.
- `tests/components/product-errors.test.tsx:1-end` — extend the Phase 1 Foundation-created test with ERR-01 stale clearing and FIFO confirmations; never recreate it.
- `tests/components/navigation.test.tsx:AppShell route-lifetime block` — prove a held run and queue survive Workbench/Library navigation and app teardown disposes once.
- `tests/e2e/server-mode.spec.ts:1-19` — expand mocked submit/SSE/cancel/URL coverage.
- `tests/e2e/real-transcription.spec.ts:runtime selectors only` — preserve gates; update selectors to normalized progress/cancel controls.

**Read only**

- `src/features/workbench/types.ts:queue contracts block` — import its exact `MeasuredProgress` type and preserve the complete Phase 2 contract byte-for-byte; Phase 3 adds no declaration, alias, re-export, or provider resource here.
- `src/features/workbench/queue-store.ts:1-end` — consume the exact Phase 2 synchronous API unchanged; coordinator owns the instance while React subscribes externally.

## Normative behavior

1. `start()` returns synchronously. Every handle exposes the exact master fields: `runId`, `events`, `result`, `cancel()`, and `dispose()`.
2. Event sequence is monotonic per run. Terminal events bypass visual throttling and bounded-log coalescing.
3. Progress exists only when `completed` and `total` are finite, non-negative, `total > 0`, and `completed <= total`. No weighted or cross-phase percentage exists.
4. `MeasuredProgress` has one owner: `src/features/workbench/types.ts`. Runtime, adapters, coordinator, and presentation import that exact type directly; they never redeclare, alias, widen, or relocate it.
5. ETA uses only a rolling 30-second window with at least three samples spanning at least 10 seconds, positive throughput, and coefficient of variation `<= 0.25`. Reset on stage/item/retry/pause/cancel/discontinuity.
6. Advanced logs retain the newest 200 safe events. Parameters permit scalar primitives only; tokens, authorization headers, raw response bodies, and provider messages never enter them.
7. `cancel()` is idempotent. It emits `run.cancel_requested` immediately, then resolves only after acknowledgement/abort/termination and emits `run.cancelled` as the immediate terminal event. Every local task stores its cancellation-timeout handle and clears/nuls it on cooperative acknowledgement, normal resolution, rejection, forced teardown, and dispose; no settled path leaves a pending timeout or can emit a duplicate terminal event.
8. Local workers get a cooperative request first. A cancel message marks only the matching active request cancelled and does not delete the marker or acknowledge immediately. The active operation checks the marker after each cooperative await and before every next work step/completion post; a hit stops further work, performs request cleanup, emits one terminal cancellation acknowledgement, then deletes the marker. If no matching acknowledgement arrives within 150 ms, terminate that worker type, clear its active request only after termination, and leave its singleton slot null. Cancellation resolves only after acknowledgement or confirmed termination. No completion may occur after acknowledgement, and retry cannot start until cleanup/teardown finishes. Next work creates one worker lazily. Never clear Cache Storage.
9. Cloudflare aborts the active fetch and checks `signal.aborted` before every subsequent chunk.
10. Server cancel waits for successful `POST /api/cancel/:jobId`, then closes SSE and waits for closure. Every complete/error/cancel/dispose path closes SSE exactly once.
11. `dispose()` is idempotent and removes listeners/timers/resources. Only app-scope teardown disposes the coordinator and requests terminal cancellation; Workbench route unmount only unsubscribes. Disposing a terminal handle performs cleanup only.

### Task 1: Pin runtime contracts, measurements, ETA, logs, and throttling

**Files:**
- Create: `src/features/transcription/runtime.ts`
- Create: `tests/unit/runtime.test.ts`

- [ ] **Step 1: Write failing RUN-04 contract and measurement tests (2–5 minutes)**

Add these imports and tests to `tests/unit/runtime.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import {
  BoundedRuntimeLog,
  EtaEstimator,
  createRuntimeEventTarget,
  normalizeRuntimeSegments,
  publishRuntimeEvent,
  subscribeRuntimeEvents,
  throttleRuntimeEvents,
  type RuntimeEvent,
} from "@/features/transcription/runtime"

const event = (overrides: Partial<RuntimeEvent> = {}): RuntimeEvent => ({
  runId: "run-1",
  sequence: 1,
  occurredAt: 0,
  code: "transcribe.chunk",
  phase: "transcribe",
  params: {},
  progress: { completed: 1, total: 4, unit: "chunks" },
  terminal: false,
  ...overrides,
})

describe("RUN-04 runtime measurement", () => {
  it("publishes typed events and rejects invalid measured progress", () => {
    const target = createRuntimeEventTarget()
    const seen: RuntimeEvent[] = []
    const unsubscribe = subscribeRuntimeEvents(target, (value) => seen.push(value))
    publishRuntimeEvent(target, event())
    expect(() => publishRuntimeEvent(target, event({ progress: { completed: 5, total: 4, unit: "chunks" } }))).toThrow("Invalid measured progress")
    unsubscribe()
    expect(seen).toEqual([event()])
  })

  it("requires three stable samples spanning ten seconds and resets by stage", () => {
    const eta = new EtaEstimator()
    expect(eta.add({ runId: "run-1", phase: "transcribe", occurredAt: 0, completed: 0, total: 100 })).toBeNull()
    expect(eta.add({ runId: "run-1", phase: "transcribe", occurredAt: 5_000, completed: 20, total: 100 })).toBeNull()
    expect(eta.add({ runId: "run-1", phase: "transcribe", occurredAt: 10_000, completed: 40, total: 100 })).toBe(15_000)
    expect(eta.add({ runId: "run-1", phase: "save", occurredAt: 11_000, completed: 1, total: 2 })).toBeNull()
  })

  it("rejects unstable or discontinuous throughput", () => {
    const eta = new EtaEstimator()
    eta.add({ runId: "run-1", phase: "transcribe", occurredAt: 0, completed: 0, total: 100 })
    eta.add({ runId: "run-1", phase: "transcribe", occurredAt: 5_000, completed: 1, total: 100 })
    expect(eta.add({ runId: "run-1", phase: "transcribe", occurredAt: 10_000, completed: 50, total: 100 })).toBeNull()
    expect(eta.add({ runId: "run-1", phase: "transcribe", occurredAt: 11_000, completed: 49, total: 100 })).toBeNull()
  })

  it("bounds logs and delivers terminal events without throttle delay", () => {
    vi.useFakeTimers()
    const log = new BoundedRuntimeLog(2)
    log.push(event({ sequence: 1 }))
    log.push(event({ sequence: 2 }))
    log.push(event({ sequence: 3 }))
    expect(log.snapshot().map((value) => value.sequence)).toEqual([2, 3])
    const delivered: RuntimeEvent[] = []
    const throttled = throttleRuntimeEvents((value) => delivered.push(value), 100)
    throttled.push(event({ sequence: 4 }))
    throttled.push(event({ sequence: 5, code: "run.cancelled", terminal: true }))
    expect(delivered.map((value) => value.sequence)).toEqual([5])
    vi.advanceTimersByTime(100)
    expect(delivered.map((value) => value.sequence)).toEqual([5])
    throttled.dispose()
    vi.useRealTimers()
  })

  it("rounds provider seconds and forward-clamps overlap", () => {
    expect(normalizeRuntimeSegments([
      { id: "a", start: 0.0005, end: 1.0005, text: " A " },
      { id: "b", start: 0.9, end: 2, text: "B" },
    ])).toEqual([
      { id: "a", startMs: 1, endMs: 1001, text: "A" },
      { id: "b", startMs: 1001, endMs: 2000, text: "B" },
    ])
    expect(() => normalizeRuntimeSegments([{ id: "a", start: -1, end: 0, text: "x" }])).toThrow("runtime_timing_invalid")
    expect(() => normalizeRuntimeSegments([{ id: "a", start: 604800.001, end: 604800.001, text: "x" }])).toThrow("runtime_timing_invalid")
  })
})
```

- [ ] **Step 2: Run red (2 minutes)**

Run: `pnpm vitest run tests/unit/runtime.test.ts`

Expected: FAIL with unresolved module `@/features/transcription/runtime`.

- [ ] **Step 3: Add the exact master contracts and minimal complete helpers (5 minutes)**

Create `src/features/transcription/runtime.ts`:

```ts
import type { CopyParams } from "@/app/copy-types"
import { normalizeSegmentText } from "@/features/transcription/canonical"
import type { CanonicalSegment, ProcessingMode } from "@/features/transcription/types"
import type { MeasuredProgress } from "@/features/workbench/types"

export type RuntimePhase = "prepare" | "load-model" | "transcribe" | "save"
export type RuntimeEventCode =
  | "prepare.started" | "prepare.media_metadata" | "prepare.converting" | "prepare.complete"
  | "model.cache_check" | "model.downloading_asset" | "model.loading" | "model.reused" | "model.complete"
  | "transcribe.queued" | "transcribe.chunk" | "transcribe.running" | "transcribe.complete"
  | "save.local" | "save.complete" | "run.cancel_requested" | "run.cancelled" | "run.failed"

export interface RuntimeEvent {
  runId: string
  sequence: number
  occurredAt: number
  code: RuntimeEventCode
  phase: RuntimePhase
  params: CopyParams
  progress: MeasuredProgress | null
  terminal: boolean
}
export type RuntimeSource =
  | { kind: "file"; file: File | Blob; name: string }
  | { kind: "link"; url: string }
export interface RuntimeOptions {
  mode: ProcessingMode
  modelId: string
  language: string
  chunkSeconds: number
  overlapSeconds: number
  needsConversion: boolean
}
export interface RuntimeResult {
  sourceName: string
  mode: ProcessingMode
  modelId: string
  language: string
  segments: CanonicalSegment[]
}
export interface RuntimeRunHandle {
  readonly runId: string
  readonly events: EventTarget
  readonly result: Promise<RuntimeResult>
  cancel(): Promise<void>
  dispose(): Promise<void>
}
export interface RuntimeAdapter {
  readonly mode: ProcessingMode
  start(source: RuntimeSource, options: RuntimeOptions): RuntimeRunHandle
  dispose(): Promise<void>
}

const EVENT_NAME = "runtime-event"
const MAX_RELATIVE_MS = 604_800_000

export function createRuntimeEventTarget(): EventTarget { return new EventTarget() }
export function subscribeRuntimeEvents(target: EventTarget, listener: (event: RuntimeEvent) => void): () => void {
  const handler = (raw: Event) => listener((raw as CustomEvent<RuntimeEvent>).detail)
  target.addEventListener(EVENT_NAME, handler)
  return () => target.removeEventListener(EVENT_NAME, handler)
}
export function publishRuntimeEvent(target: EventTarget, event: RuntimeEvent): void {
  if (event.progress) {
    const { completed, total } = event.progress
    if (!Number.isFinite(completed) || !Number.isFinite(total) || completed < 0 || total <= 0 || completed > total) {
      throw new Error("Invalid measured progress")
    }
  }
  target.dispatchEvent(new CustomEvent<RuntimeEvent>(EVENT_NAME, { detail: event }))
}

type ProviderSegment = { id: string; start: number; end: number; text: string }
function secondsToMs(value: number): number {
  const product = value * 1000
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(product)) || product > MAX_RELATIVE_MS) {
    throw new Error("runtime_timing_invalid")
  }
  return Math.round(product)
}
export function normalizeRuntimeSegments(input: readonly ProviderSegment[]): CanonicalSegment[] {
  let previousEndMs = 0
  return input.map((segment) => {
    const rawStart = secondsToMs(segment.start)
    const rawEnd = secondsToMs(segment.end)
    const startMs = Math.max(rawStart, previousEndMs)
    const endMs = Math.max(rawEnd, startMs)
    previousEndMs = endMs
    return { id: segment.id, startMs, endMs, text: normalizeSegmentText(segment.text) }
  })
}

type EtaSample = { runId: string; phase: RuntimePhase; occurredAt: number; completed: number; total: number }
export class EtaEstimator {
  private samples: EtaSample[] = []
  add(sample: EtaSample): number | null {
    const last = this.samples.at(-1)
    if (!last || last.runId !== sample.runId || last.phase !== sample.phase || sample.completed < last.completed || sample.total !== last.total) {
      this.samples = [sample]
      return null
    }
    this.samples.push(sample)
    this.samples = this.samples.filter((value) => sample.occurredAt - value.occurredAt <= 30_000)
    if (this.samples.length < 3 || sample.occurredAt - this.samples[0].occurredAt < 10_000) return null
    const rates = this.samples.slice(1).map((value, index) => {
      const prior = this.samples[index]
      return (value.completed - prior.completed) / ((value.occurredAt - prior.occurredAt) / 1000)
    })
    if (rates.some((rate) => !Number.isFinite(rate) || rate <= 0)) return null
    const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length
    const deviation = Math.sqrt(rates.reduce((sum, rate) => sum + (rate - mean) ** 2, 0) / rates.length)
    if (deviation / mean > 0.25) return null
    return Math.round(((sample.total - sample.completed) / mean) * 1000)
  }
  reset(): void { this.samples = [] }
}

export class BoundedRuntimeLog {
  private values: RuntimeEvent[] = []
  constructor(private readonly limit = 200) {}
  push(event: RuntimeEvent): void { this.values = [...this.values, event].slice(-this.limit) }
  snapshot(): readonly RuntimeEvent[] { return this.values }
  clear(): void { this.values = [] }
}

export function throttleRuntimeEvents(deliver: (event: RuntimeEvent) => void, intervalMs = 100) {
  let pending: RuntimeEvent | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => { timer = null; if (pending) { const value = pending; pending = null; deliver(value) } }
  return {
    push(event: RuntimeEvent) {
      if (event.terminal) {
        if (timer) clearTimeout(timer)
        timer = null
        pending = null
        deliver(event)
        return
      }
      pending = event
      timer ??= setTimeout(flush, intervalMs)
    },
    dispose() { if (timer) clearTimeout(timer); timer = null; pending = null },
  }
}
```

- [ ] **Step 4: Run green and adjacent canonical tests (3 minutes)**

Run: `pnpm vitest run tests/unit/runtime.test.ts tests/unit/canonical.test.ts`

Expected: PASS; all selected tests pass, no unhandled timer or event errors.

- [ ] **Step 5: Stage and commit (2 minutes)**

```bash
git add src/features/transcription/runtime.ts tests/unit/runtime.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(runtime): define normalized runtime events"
```

Expected staged paths: exactly the two files above. Expected commit: created with no hook failure.

### Task 2: Add acknowledged browser-worker cancellation and narrow forced reset

**Files:**
- Modify: `src/lib/transcription-worker-client.ts:1-287`
- Modify: `src/workers/transcription.worker.ts:22-139,209-211`
- Modify: `src/workers/ffmpeg.worker.ts:1-62,88-95`
- Create: `tests/unit/runtime-adapters.test.ts`

- [ ] **Step 1: Write failing local lifecycle tests (5 minutes)**

Create `tests/unit/runtime-adapters.test.ts` with the worker harness and RUN-01/RUN-02 assertions:

```ts
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  convertWithFfmpeg,
  getLocalWorkerCountsForTests,
  transcribeLocally,
} from "@/lib/transcription-worker-client"

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = false
  sent: unknown[] = []
  constructor(readonly url: URL) { super(); FakeWorker.instances.push(this) }
  postMessage(message: unknown): void { this.sent.push(message) }
  terminate(): void { this.terminated = true }
  reply(data: unknown): void { this.onmessage?.({ data } as MessageEvent) }
}

describe("RUN-01/RUN-02 local worker lifecycle", () => {
  afterEach(() => { vi.unstubAllGlobals(); FakeWorker.instances = []; vi.useRealTimers() })

  it("waits for matching cooperative acknowledgement", async () => {
    vi.stubGlobal("Worker", FakeWorker)
    const task = transcribeLocally({
      file: new Blob(), modelId: "base", language: "en", device: "wasm", dtype: "q8",
      onProgress: vi.fn(), decodeAudio: async () => new Float32Array([0]),
    })
    await Promise.resolve()
    const worker = FakeWorker.instances[0]
    const cancel = task.cancel(150)
    const request = worker.sent.at(-1) as { id: string }
    worker.reply({ type: "cancelled", id: request.id })
    await expect(cancel).resolves.toBe("acknowledged")
    expect(worker.terminated).toBe(false)
    worker.reply({ type: "complete", id: request.id, segments: [] })
    await expect(task.result).rejects.toMatchObject({ name: "AbortError" })

    const retry = transcribeLocally({
      file: new Blob(), modelId: "base", language: "en", device: "wasm", dtype: "q8",
      onProgress: vi.fn(), decodeAudio: async () => new Float32Array([0]),
    })
    expect(retry.requestId).not.toBe(request.id)
    void retry.cancel(0)
  })

  it("does not permit retry overlap while cooperative cleanup is unacknowledged", async () => {
    vi.stubGlobal("Worker", FakeWorker)
    const task = transcribeLocally({
      file: new Blob(), modelId: "base", language: "en", device: "wasm", dtype: "q8",
      onProgress: vi.fn(), decodeAudio: async () => new Float32Array([0]),
    })
    await Promise.resolve()
    const worker = FakeWorker.instances[0]
    const cancel = task.cancel(150)
    expect(() => transcribeLocally({
      file: new Blob(), modelId: "base", language: "en", device: "wasm", dtype: "q8",
      onProgress: vi.fn(), decodeAudio: async () => new Float32Array([0]),
    })).toThrow(/active/i)
    const request = worker.sent.at(-1) as { id: string }
    worker.reply({ type: "cancelled", id: request.id })
    await cancel
    const retry = transcribeLocally({
      file: new Blob(), modelId: "base", language: "en", device: "wasm", dtype: "q8",
      onProgress: vi.fn(), decodeAudio: async () => new Float32Array([0]),
    })
    void retry.cancel(0)
  })

  it("terminates only ASR after the acknowledgement bound and recreates lazily", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("Worker", FakeWorker)
    const task = transcribeLocally({
      file: new Blob(), modelId: "base", language: "en", device: "wasm", dtype: "q8",
      onProgress: vi.fn(), decodeAudio: async () => new Float32Array([0]),
    })
    await Promise.resolve()
    const cancel = task.cancel(150)
    await vi.advanceTimersByTimeAsync(150)
    await expect(cancel).resolves.toBe("terminated")
    expect(getLocalWorkerCountsForTests()).toEqual({ asr: 0, ffmpeg: 0 })
    const retry = transcribeLocally({
      file: new Blob(), modelId: "base", language: "en", device: "wasm", dtype: "q8",
      onProgress: vi.fn(), decodeAudio: async () => new Float32Array([0]),
    })
    await Promise.resolve()
    expect(getLocalWorkerCountsForTests()).toEqual({ asr: 1, ffmpeg: 0 })
    expect(FakeWorker.instances.filter((worker) => !worker.terminated)).toHaveLength(1)
    void retry.cancel(0)
  })

  it("terminates only ffmpeg and keeps ASR slot independent", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("Worker", FakeWorker)
    const task = convertWithFfmpeg({ file: new File(["x"], "x.webm"), onProgress: vi.fn() })
    const cancel = task.cancel(150)
    await vi.advanceTimersByTimeAsync(150)
    await expect(cancel).resolves.toBe("terminated")
    expect(getLocalWorkerCountsForTests()).toEqual({ asr: 0, ffmpeg: 0 })
  })
})
```

- [ ] **Step 2: Run red (2 minutes)**

Run: `pnpm vitest run tests/unit/runtime-adapters.test.ts`

Expected: FAIL because local calls do not return task handles and test-only worker counts do not exist.

- [ ] **Step 3: Replace client public operations with the complete task contract (5 minutes)**

In `src/lib/transcription-worker-client.ts`, retain audio decode/resample/mono and transcript mapping, but replace active-operation/public-call logic with:

```ts
export interface LocalTask<T> {
  readonly requestId: string
  readonly result: Promise<T>
  cancel(timeoutMs?: number): Promise<"acknowledged" | "terminated">
}

type ActiveLocal<T> = {
  id: string
  settled: boolean
  resolve: (value: T) => void
  reject: (error: Error) => void
  acknowledgeCancel: (() => void) | null
  cancellationTimer: ReturnType<typeof setTimeout> | null
}

function cancellable<T>(args: {
  kind: "asr" | "ffmpeg"
  worker: Worker
  active: ActiveLocal<T>
  clear: () => void
}): LocalTask<T> {
  let cancelPromise: Promise<"acknowledged" | "terminated"> | null = null
  const clearCancellationTimer = () => {
    if (args.active.cancellationTimer !== null) clearTimeout(args.active.cancellationTimer)
    args.active.cancellationTimer = null
  }
  return {
    requestId: args.active.id,
    result: new Promise<T>((resolve, reject) => { args.active.resolve = resolve; args.active.reject = reject }),
    cancel(timeoutMs = 150) {
      cancelPromise ??= new Promise((resolve) => {
        if (args.active.settled) { resolve("acknowledged"); return }
        let finished = false
        const finish = (result: "acknowledged" | "terminated") => {
          if (finished) return
          finished = true
          clearCancellationTimer()
          args.active.settled = true
          args.active.reject(new DOMException("Runtime cancelled", "AbortError"))
          args.clear()
          resolve(result)
        }
        args.active.acknowledgeCancel = () => finish("acknowledged")
        args.active.cancellationTimer = setTimeout(() => {
          if (finished) return
          args.worker.terminate()
          if (args.kind === "asr") transcriptionWorker = null
          else ffmpegWorker = null
          finish("terminated")
        }, Math.max(0, timeoutMs))
        args.worker.postMessage({ type: "cancel", id: args.active.id })
      })
      return cancelPromise
    },
  }
}

export function getLocalWorkerCountsForTests() {
  return { asr: transcriptionWorker ? 1 : 0, ffmpeg: ffmpegWorker ? 1 : 0 }
}
```

Implement `transcribeLocally()` and `convertWithFfmpeg()` to synchronously allocate one `ActiveLocal` with `cancellationTimer: null`, return `LocalTask`, assign the promise resolvers before asynchronous decode/post, ignore nonmatching IDs, call `acknowledgeCancel` only for `{type:"cancelled", id}`, and clear active state once on complete/error/acknowledged cancellation. Route normal task resolution, task rejection, cooperative acknowledgement, forced teardown, and disposal through one idempotent settlement helper that clears/nuls `cancellationTimer` before any resolve/reject/slot cleanup. The worker acknowledgement means worker-side cleanup already finished; only then reject `result`, clear the active slot, and resolve `cancel()`. A complete/progress/error message for that ID after acknowledgement is stale and ignored. While cancellation is unresolved, the active slot remains occupied and a retry cannot allocate or post work. Forced cancellation terminates first, nulls the worker slot and clears active state second, then resolves `cancel()`; retry is therefore also non-overlapping. Add optional `decodeAudio?: (file: File | Blob) => Promise<Float32Array>` to the local transcription argument solely as an injected browser-boundary dependency; production defaults to `decodeAudioForWhisper`. Keep `clearLocalWorkerState()` rejection while active and Cache Storage untouched.

Extend fake-timer coverage with cooperative acknowledgement before 150 ms: after awaiting `cancel()`, require `vi.getTimerCount()` to be `0`, advance beyond 150 ms, and require no worker termination and no second result rejection or terminal cancellation. Add corresponding resolution, rejection, forced-teardown, and dispose rows; each ends with zero pending timers. Count terminal settlement calls and require exactly one in every acknowledgement/timeout race.

- [ ] **Step 4: Add cooperative messages and checkpoints (5 minutes)**

Use these exact worker request additions in both workers:

```ts
type CancelRequest = { type: "cancel"; id: string }
const cancelledRequests = new Set<string>()
let activeRequestId: string | null = null

async function stopIfCancelled(id: string, cleanup: () => Promise<void> | void): Promise<boolean> {
  if (!cancelledRequests.has(id)) return false
  await cleanup()
  self.postMessage({ type: "cancelled", id })
  cancelledRequests.delete(id)
  if (activeRequestId === id) activeRequestId = null
  return true
}
```

At the top of each `self.onmessage`, handle cancel before work:

```ts
if (event.data.type === "cancel") {
  if (event.data.id === activeRequestId) cancelledRequests.add(event.data.id)
  return
}
```

Set `activeRequestId = id` immediately before starting each accepted request. Call `if (await stopIfCancelled(id, cleanupRequest)) return` after each awaited boundary and before dynamic import continuation, cache/load continuation, ffmpeg write/exec continuation, inference continuation, and every complete/error post. `cleanupRequest` releases request-scoped buffers/listeners/files and is idempotent; it does not terminate or clear the singleton worker. A checkpoint that observes the marker performs cleanup before posting exactly one terminal acknowledgement and deletes the marker only after that post. No work, progress, error, or completion post for the request follows. Inference/exec that cannot yield to process the cancel message falls through to the 150 ms forced client teardown. Do not label an unprocessed request acknowledged.

- [ ] **Step 5: Run green and worker-adjacent tests (3 minutes)**

Run: `pnpm vitest run tests/unit/runtime-adapters.test.ts tests/unit/storage-cleanup.test.ts`

Expected: PASS; no two live workers of one type, per-type teardown only, zero pending cancellation timers after every settled path, no duplicate terminal settlement after cooperative acknowledgement, no completion after cancellation acknowledgement, no retry overlap before cooperative cleanup or forced termination completes, and Cache Storage cleanup behavior unchanged.

- [ ] **Step 6: Stage and commit (2 minutes)**

```bash
git add src/lib/transcription-worker-client.ts src/workers/transcription.worker.ts src/workers/ffmpeg.worker.ts tests/unit/runtime-adapters.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(runtime): add acknowledged local cancellation"
```

Expected: exactly four staged files; commit succeeds.

### Task 3: Implement the local adapter

**Files:**
- Create: `src/features/transcription/adapters/local.ts`
- Modify: `tests/unit/runtime-adapters.test.ts`

- [ ] **Step 1: Add failing adapter terminal/resource tests (5 minutes)**

Append:

```ts
import {
  createLocalRuntimeAdapter,
  type LocalRuntimeDependencies,
} from "@/features/transcription/adapters/local"
import { subscribeRuntimeEvents, type RuntimeEvent } from "@/features/transcription/runtime"

it("emits cancel request then terminal only after local acknowledgement", async () => {
  let acknowledge!: () => void
  const dependencies: LocalRuntimeDependencies = {
    mode: "local-wasm",
    convert: () => { throw new Error("conversion not expected") },
    transcribe: () => ({ requestId: "worker-1", result: new Promise<never>(() => {}), cancel: () => new Promise((resolve) => { acknowledge = () => resolve("acknowledged") }) }),
    createId: () => "run-local",
    now: () => 10,
  }
  const adapter = createLocalRuntimeAdapter(dependencies)
  const handle = adapter.start({ kind: "file", file: new Blob(), name: "a.wav" }, {
    mode: "local-wasm", modelId: "base", language: "en", chunkSeconds: 30, overlapSeconds: 1, needsConversion: false,
  })
  const seen: RuntimeEvent[] = []
  subscribeRuntimeEvents(handle.events, (value) => seen.push(value))
  const cancelling = handle.cancel()
  expect(seen.at(-1)?.code).toBe("run.cancel_requested")
  expect(seen.some((value) => value.code === "run.cancelled")).toBe(false)
  acknowledge()
  await cancelling
  expect(seen.at(-1)?.code).toBe("run.cancelled")
  expect(seen.at(-1)?.terminal).toBe(true)
  await handle.dispose()
  await handle.dispose()
})
```

- [ ] **Step 2: Run red (2 minutes)**

Run: `pnpm vitest run tests/unit/runtime-adapters.test.ts -t "local acknowledgement"`

Expected: FAIL with missing local adapter module.

- [ ] **Step 3: Create the complete local adapter (5 minutes)**

Create `src/features/transcription/adapters/local.ts`. Import `convertWithFfmpeg`, `transcribeLocally`, and their existing public function types from `@/lib/transcription-worker-client`; import `createId` from `@/lib/id`; import `RuntimeAdapter` and runtime contracts from `@/features/transcription/runtime`; and import `type MeasuredProgress` directly from `@/features/workbench/types`. Export this complete dependency interface and factory, with no optional bag or duplicate client signature:

```ts
export interface LocalRuntimeDependencies {
  mode: "local-webgpu" | "local-wasm"
  convert: typeof convertWithFfmpeg
  transcribe: typeof transcribeLocally
  createId: typeof createId
  now: () => number
}

export function createLocalRuntimeAdapter(deps: LocalRuntimeDependencies): RuntimeAdapter
```

`RuntimeCoordinatorProvider.tsx` creates two instances by passing `{ mode: "local-webgpu", convert: convertWithFfmpeg, transcribe: transcribeLocally, createId, now: () => performance.now() }` and the corresponding `"local-wasm"` object; tests import `LocalRuntimeDependencies` from this module and type their fake dependency object before calling the factory. The returned adapter exposes `deps.mode`, while `start` rejects options whose mode does not equal it. Return a handle immediately. The handle must:

```ts
const emit = (code: RuntimeEventCode, phase: RuntimePhase, params: CopyParams = {}, progress: MeasuredProgress | null = null, terminal = false) =>
  publishRuntimeEvent(events, { runId, sequence: ++sequence, occurredAt: deps.now(), code, phase, params, progress, terminal })
```

Run this exact async sequence: emit `prepare.started`; if conversion is required emit `prepare.converting`, await conversion task, and map only actual ffmpeg progress carrying a denominator to `MeasuredProgress`; emit `prepare.complete`; emit `model.cache_check`; start ASR; map worker model callbacks to cache/download/load/reused events without invented percentages; emit `transcribe.running`; await ASR; normalize seconds through `normalizeRuntimeSegments`; emit `transcribe.complete`; resolve `RuntimeResult`. On non-abort failure emit one immediate terminal `run.failed` and reject. `cancel()` emits one `run.cancel_requested`, awaits the currently active conversion or ASR task’s `cancel(150)`, emits `run.cancelled`, and resolves. `dispose()` is idempotent, removes progress callbacks, and calls `cancel()` only while nonterminal. Never call `clearLocalWorkerState()` from cancellation.

- [ ] **Step 4: Run green and adjacent runtime tests (3 minutes)**

Run: `pnpm vitest run tests/unit/runtime-adapters.test.ts tests/unit/runtime.test.ts`

Expected: PASS; terminal cancellation appears only after the deferred acknowledgement.

- [ ] **Step 5: Stage and commit (2 minutes)**

```bash
git add src/features/transcription/adapters/local.ts tests/unit/runtime-adapters.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(runtime): adapt local transcription workers"
```

### Task 4: Implement abortable Cloudflare and server/SSE adapters

**Files:**
- Create: `src/features/transcription/adapters/cloudflare.ts`
- Create: `src/features/transcription/adapters/server.ts`
- Modify: `src/features/server-transcription/client.ts:27-54`
- Modify: `src/features/server-transcription/api.ts:51-116`
- Modify: `src/features/server-transcription/sse.ts:3-63`
- Modify: `src/app/LegacyProduct.tsx:all submitJob call sites`
- Modify: `tests/unit/runtime-adapters.test.ts`
- Modify: `tests/unit/server-api.test.ts:104-134`

- [ ] **Step 1: Add failing Cloudflare abort and server cleanup tests (5 minutes)**

Extend the existing `tests/unit/runtime-adapters.test.ts` imports rather than declaring local dependency shapes:

```ts
import {
  createCloudflareRuntimeAdapter,
  type CloudflareRuntimeDependencies,
} from "@/features/transcription/adapters/cloudflare"
import {
  createServerRuntimeAdapter,
  type ServerRuntimeDependencies,
} from "@/features/transcription/adapters/server"
```

Append tests that assign each fake object to its owning exported dependency interface, inject two Cloudflare chunks, hold the first fetch, call cancel, reject it with `AbortError`, and assert fetch count stays `1`; then inject server submit `job-7`, a closable SSE fixture, and cancel fixture, asserting order `submit → subscribe → cancel → unsubscribe → closed → run.cancelled`. Assert completion and failure also unsubscribe exactly once. Use the real runtime event subscription and verify `run.cancel_requested` precedes `run.cancelled`.

- [ ] **Step 2: Run red (2 minutes)**

Run: `pnpm vitest run tests/unit/runtime-adapters.test.ts -t "Cloudflare|server"`

Expected: FAIL because adapter modules and SSE completion are missing.

- [ ] **Step 3: Make existing clients abortable (5 minutes)**

Change Cloudflare client arguments to include required `signal: AbortSignal`, pass it to fetch, and preserve existing URL/form/auth behavior. In `src/features/server-transcription/api.ts`, replace positional language/model arguments with these exact exported option objects and methods; destructure options before building the existing form so language/model omission and field names remain unchanged:

```ts
export interface SubmitJobOptions {
  language?: string
  modelId?: string
  signal?: AbortSignal
}

export interface CancelJobOptions {
  signal?: AbortSignal
}

async submitJob(input: TranscribeInput, options: SubmitJobOptions = {}): Promise<string>
async cancelJob(jobId: string, options: CancelJobOptions = {}): Promise<void>
```

`submitJob` sets `language` only from `options.language`, sets the existing `model` form field only from `options.modelId`, and passes `options.signal` to the existing `/api/transcribe` fetch. `cancelJob` passes `options.signal` to the existing `/api/cancel/<encoded-id>` fetch. No overload or remaining positional language/model/signal form exists. In the same step, migrate both retained `LegacyProduct.tsx` file/link submit calls to `api.submitJob(input, { language: runSettings.language, modelId: serverModelId })`; this preserves the existing selected language/model and intentionally omits a signal from the legacy bridge. Update existing API tests to assert omitted options, language-only, model-only, both values, submit abort, and cancel abort while preserving URL, bearer, file/link, and response semantics. Replace `SseConnection` with:

```ts
export interface SseConnection {
  unsubscribe(): void
  readonly closed: Promise<void>
}
```

Implement `closed` using the existing async reader loop’s `finally`; `unsubscribe()` must be idempotent, call `controller.abort()`, and `reader.cancel()` when acquired. Parse only valid `data:` records. The adapter, not SSE parser, maps provider strings to safe codes.

- [ ] **Step 4: Create Cloudflare adapter (5 minutes)**

`src/features/transcription/adapters/cloudflare.ts` imports `transcribeChunkWithServer` from `@/features/server-transcription/client`, `createId` from `@/lib/id`, `RuntimeAdapter` and runtime contracts from `@/features/transcription/runtime`, and `type MeasuredProgress` directly from `@/features/workbench/types`. Export the complete public contract:

```ts
export interface CloudflareRuntimeDependencies {
  split: (source: File | Blob, signal: AbortSignal) => Promise<Blob[]>
  transcribeChunk: typeof transcribeChunkWithServer
  getAccessToken: () => string
  createId: typeof createId
  now: () => number
}

export function createCloudflareRuntimeAdapter(deps: CloudflareRuntimeDependencies): RuntimeAdapter
```

`RuntimeCoordinatorProvider.tsx` supplies the production dependency object explicitly. Its `split` callback imports `audio_processor.js`, initializes it, and splits at `9 * 1024 * 1024`; it checks `signal.aborted` before/after every await. Phase 3 adds required `signal: AbortSignal` to the existing `transcribeChunkWithServer` argument and passes it to fetch, so the `typeof` field includes `{ audio, language, accessToken, signal }` without a copied API signature. For each chunk, check abort before starting fetch, emit measured `{completed:index,total:chunks.length,unit:"chunks"}`, append one canonical zero-time segment with `createId("segment")`, and never use a synthetic overall percent. `cancel()` aborts once, awaits the active fetch settlement, emits terminal `run.cancelled`, and resolves. `dispose()` is idempotent. Do not import `MeasuredProgress` through `runtime.ts`, redeclare it, alias it, or make dependencies optional.

- [ ] **Step 5: Create server adapter (5 minutes)**

`src/features/transcription/adapters/server.ts` imports `ServerTranscriptionApi` from `@/features/server-transcription/api`, `createId` from `@/lib/id`, `RuntimeAdapter` and runtime contracts from `@/features/transcription/runtime`, and `type MeasuredProgress` directly from `@/features/workbench/types`. Export the complete public contract:

```ts
export interface ServerRuntimeDependencies {
  api: Pick<ServerTranscriptionApi, "submitJob" | "subscribeProgress" | "cancelJob">
  createId: typeof createId
  now: () => number
}

export function createServerRuntimeAdapter(deps: ServerRuntimeDependencies): RuntimeAdapter
```

`RuntimeCoordinatorProvider.tsx` supplies its existing `ServerTranscriptionApi` instance plus `createId` and `performance.now`; tests type the fake API through `ServerRuntimeDependencies`. Accept file or link source. Create separate run-owned `submitController` and `cancelController`; invoke `api.submitJob(input, { language: options.language, modelId: options.modelId, signal: submitController.signal })`, save `jobId`, then subscribe once. Map phases: queued→`transcribe.queued`, downloading/extracting→Prepare codes, transcribing→`transcribe.running`, complete→`transcribe.complete`. Treat provider `progress` as measured only when status also supplies an actual denominator; current percent-only server values therefore render indeterminate. Never surface `message` as primary copy; retain a bounded safe phase code only. On complete, normalize `segments`, resolve result, unsubscribe, await `closed`, and mark terminal. On error, unsubscribe/close then emit `run.failed`. On cancel after job ID exists, invoke and await `api.cancelJob(jobId, { signal: cancelController.signal })`, then unsubscribe, await `closed`, and emit `run.cancelled`; the observable order remains `submit → subscribe → cancel → unsubscribe → closed → run.cancelled`. Before job ID exists, abort `submitController` and await submit settlement before terminal. `dispose()` may abort an in-flight cancel through `cancelController`; ordinary cancel does not pre-abort its own acknowledgement request. Repeated cancel/dispose reuses one promise. Do not import `MeasuredProgress` through `runtime.ts`, redeclare it, alias it, or duplicate the server API method signatures.

- [ ] **Step 6: Run green and API adjacency (3 minutes)**

Run: `pnpm vitest run tests/unit/runtime-adapters.test.ts tests/unit/server-api.test.ts`

Expected: PASS; Cloudflare starts no second chunk, server closes every SSE path once, request URLs/auth remain unchanged.

- [ ] **Step 7: Stage and commit (2 minutes)**

```bash
git add src/features/transcription/adapters/cloudflare.ts src/features/transcription/adapters/server.ts src/features/server-transcription/client.ts src/features/server-transcription/api.ts src/features/server-transcription/sse.ts src/app/LegacyProduct.tsx tests/unit/runtime-adapters.test.ts tests/unit/server-api.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(runtime): normalize remote transcription providers"
```

### Task 5: Enforce pure queue transitions and captured settings

**Files:**
- Modify: `src/features/workbench/queue-reducer.ts:entire reducer`
- Modify: `tests/unit/queue-reducer.test.ts:entire file`

- [ ] **Step 1: Write failing QUEUE-01 reducer matrix (5 minutes)**

Add table-driven tests for every allowed transition in spec Section 11.2 and explicit rejection/no-op for every other transition. Add these exact named tests: `nextSequentialItem selects earliest ready only`, `cancelled item requires item-retried before selection`, and `failed item requires item-retried before selection`. The first proves `nextSequentialItem` returns the first array item whose status is exactly `ready`; the latter two prove cancelled and failed items are never selected or started until `item-retried` returns that item to `ready`. Also assert: `item-started` freezes a copied settings object; changing pending settings does not mutate running capture; `item-cancel-requested` yields `cancelling` and pauses by default; `item-cancelled` alone yields `cancelled`; `batch-resumed` selects no work until coordinator asks `nextSequentialItem`; failed/cancelled retry clears issue/progress/transcript/capture and becomes `ready`; running cannot move/remove; completed removal does not call a repository; boundary move buttons no-op; and order values normalize to array indices.

- [ ] **Step 2: Run red (2 minutes)**

Run: `pnpm vitest run tests/unit/queue-reducer.test.ts`

Expected: FAIL on premature cancellation, direct cancelled/failed selection or start, retry clearing, reorder, or batch pause semantics.

- [ ] **Step 3: Implement the exact master state machine (5 minutes)**

Keep the master `MeasuredProgress`, `QueueStatus`, `QueueItem`, `QueueState`, and `QueueAction` declarations unchanged. In the reducer use an exhaustive action switch and a local immutable `replaceItem` helper. Return the original state for illegal actions. Copy captured settings as `{...action.settings}`. Accept `item-started` only when no item is active and the target status is exactly `ready`; cancelled and failed targets remain unchanged until `item-retried` clears issue, progress, transcript ID, and captured settings and returns them to `ready`. `item-cancel-requested` sets `status:"cancelling"`, `progress:null`, and `batch.paused:true`; `stopBatch` also sets `stopAfterCurrent:true`. `item-cancelled` clears `activeItemId` but does not resume. `batch-resumed` sets `running:true,paused:false,stopAfterCurrent:false`; `batch-stopped` sets `running:false,paused:true,stopAfterCurrent:true`. Completion/failure clears active ID. `nextSequentialItem` returns null when active, not running, paused, or stop-after-current; otherwise it scans without sorting or mutation and returns the earliest item whose status is exactly `ready`. It never treats cancelled or failed as ready.

- [ ] **Step 4: Run green and Phase 2 adjacency (3 minutes)**

Run: `pnpm vitest run tests/unit/queue-reducer.test.ts tests/unit/recommendation.test.ts`

Expected: PASS; exact named tests `nextSequentialItem selects earliest ready only`, `cancelled item requires item-retried before selection`, and `failed item requires item-retried before selection` pass; recommendation behavior remains unchanged.

- [ ] **Step 5: Stage and commit (2 minutes)**

```bash
git add src/features/workbench/queue-reducer.ts tests/unit/queue-reducer.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(queue): enforce sequential queue transitions"
```

### Task 6: Add the one-active-run coordinator

**Files:**
- Create: `src/features/transcription/runtime-coordinator.ts`
- Consume unchanged: `src/features/workbench/queue-store.ts` — coordinator owns the synchronous store instance; public API unchanged
- Consume unchanged: `src/app/work-activity-store.ts` — coordinator directly owns publication through `setWorkActivity`
- Modify: `tests/unit/runtime.test.ts`

- [ ] **Step 1: Add failing sequential/race/disposal tests (5 minutes)**

Import the complete public coordinator surface in `tests/unit/runtime.test.ts`; do not declare an inline options interface:

```ts
import {
  createRuntimeCoordinator,
  type RuntimeCoordinator,
  type RuntimeCoordinatorOptions,
} from "@/features/transcription/runtime-coordinator"
```

Assign `createRuntimeCoordinator(options)` to a `RuntimeCoordinator` variable in these tests so the imported return contract is exercised and no type-only import is unused.

Assign each fake dependency object to `RuntimeCoordinatorOptions` before calling `createRuntimeCoordinator(options)`. Use a `FakeRuntimeAdapter` whose `start()` records sources and returns deferred result/cancel/dispose promises. Assert: the coordinator owns one real `QueueStore`; `dispatch` returns the exact synchronous next state; React is not needed to advance it; the coordinator asks `nextSequentialItem` for work and starts only the earliest `ready` item; cancelled and failed items never start; retry captures `const next = queueStore.dispatch({type:"item-retried",itemId})` and pumps that returned state in the same call stack, proving no stale React snapshot can suppress retry; the second ready item starts after the first save succeeds; failure leaves its item failed and later ready work continues only when batch policy permits; default cancel pauses and no next start occurs; continue-cancel starts the next ready item only after terminal acknowledgement and disposal/teardown cleanup; stale old-run events and completion after cancellation acknowledgement cannot update retry; save failure becomes one runtime `ProductError`; dispose twice cancels once and removes subscriptions; 100 completion/cancel races produce exactly one terminal reducer action. Attempt retry while cancellation acknowledgement/cleanup is held and prove adapter `start()` is not called until both resolve. Inject a `setWorkActivity` spy and require `true` before active transcription, conversion, or cancelling becomes observable. Keep it true while cancellation, provider disposal, or forced teardown acknowledgement is unresolved. Require one `false` only after completed, failed, cancelled, or coordinator-dispose cleanup acknowledgement; no React mount/unmount callback may publish or clear it.

- [ ] **Step 2: Run red (2 minutes)**

Run: `pnpm vitest run tests/unit/runtime.test.ts -t "coordinator"`

Expected: FAIL with missing coordinator module.

- [ ] **Step 3: Implement coordinator and fakeable dependencies (5 minutes)**

Create `runtime-coordinator.ts` with:

```ts
export interface RuntimeCoordinatorSnapshot {
  queue: QueueState
  activeEvent: RuntimeEvent | null
  elapsedMs: number
  etaMs: number | null
  log: readonly RuntimeEvent[]
}
export interface RuntimeCoordinator {
  getSnapshot(): RuntimeCoordinatorSnapshot
  subscribe(listener: () => void): () => void
  startItem(itemId: string, settings: CapturedTranscriptionSettings): void
  startBatch(): void
  cancelActive(choice: "pause" | "continue" | "stop"): Promise<void>
  retry(itemId: string): void
  remove(itemId: string): void
  move(itemId: string, direction: "earlier" | "later"): void
  dispose(): Promise<void>
}

export interface RuntimeCoordinatorOptions {
  queueStore: QueueStore
  adapters: Readonly<Record<ProcessingMode, RuntimeAdapter>>
  saveResult: (item: QueueItem, result: RuntimeResult) => Promise<string>
  toProductError: (error: unknown, item: QueueItem) => ProductError
  setWorkActivity: (active: boolean) => void
  now: () => number
  setInterval: (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>
  clearInterval: (handle: ReturnType<typeof setInterval>) => void
}

export function createRuntimeCoordinator(options: RuntimeCoordinatorOptions): RuntimeCoordinator
```

`runtime-coordinator.ts` imports `ProductError` from `@/app/copy`, `ProcessingMode` from `@/features/transcription/types`, `RuntimeAdapter`, `RuntimeEvent`, and `RuntimeResult` from `@/features/transcription/runtime`, `CapturedTranscriptionSettings`, `QueueItem`, and `QueueState` from `@/features/workbench/types`, and `QueueStore` from `@/features/workbench/queue-store`. Those imports define every field above; no alias is left unresolved. `createRuntimeCoordinator` takes exactly `RuntimeCoordinatorOptions` and returns exactly `RuntimeCoordinator`; tests import all three names from this module. There is no second options type or inline dependency shape.

`createRuntimeCoordinator` dependencies: coordinator-owned `queueStore: QueueStore`, adapter map keyed by `ProcessingMode`, `saveResult(item,result):Promise<string>`, `toProductError(error,item):ProductError`, Phase 1 `setWorkActivity(active:boolean):void`, monotonic `now`, and `setInterval/clearInterval`. There is no separate `initialQueue`, `dispatchQueue`, `getQueue`, React dispatch callback, or mirrored queue ref. Import `type MeasuredProgress` directly from `@/features/workbench/types` and use it for coordinator progress projections; never import it through `runtime.ts` or redeclare/alias it. Own `active:{itemId,runId,handle,unsubscribe,terminal}` or null. Subscribe before awaiting result. Ignore events unless both item ID and run ID equal active. Feed nonterminal presentation through `throttleRuntimeEvents`; feed terminal immediately. `pump(state = queueStore.getState())` calls `nextSequentialItem(state)` and starts only its earliest `ready` item. `retry(itemId)` is exact: `const next = queueStore.dispatch({ type: "item-retried", itemId }); pump(next)`. Every transition that pumps in the same call stack uses the `QueueState` returned by `dispatch`, never a React snapshot. Before exposing active transcription, conversion, or cancelling, the coordinator directly calls `setWorkActivity(true)`. On provider result it emits coordinator `save.local`, awaits save, emits `save.complete`, dispatches `item-completed`, awaits handle disposal/teardown acknowledgement, clears active, calls `setWorkActivity(false)`, then pumps that returned state once. On failure it dispatches one `item-failed` unless acknowledged cancellation already won, then awaits disposal/teardown before clearing activity. `cancelActive` dispatches request first, publishes/retains active work, waits `handle.cancel()`, dispatches `item-cancelled`, awaits terminal disposal/teardown acknowledgement, then calls `setWorkActivity(false)`; only afterward may `continue` dispatch `batch-resumed` and pump. Coordinator `dispose()` follows the same terminal ordering. React unmount merely awaits coordinator disposal. Serialize `pump()` with one promise so simultaneous subscription/result/user calls cannot start two runs. Elapsed interval updates only coordinator listeners and stops on every terminal/dispose.

Normative cancellation ordering: `pump` starts nothing while the prior active cancellation/cleanup remains owned. `cancelActive` may dispatch `item-cancelled` after `handle.cancel()` acknowledges, but it retains `active` through terminal `handle.dispose()`/teardown cleanup; only then does it clear active, publish `setWorkActivity(false)`, resume, or pump a retry/next item. Any completion/result arriving after cancellation acknowledgement loses the terminal race and is ignored. Coordinator `dispose()` is reserved for app teardown; route-page unmount never calls it.

- [ ] **Step 4: Run green and race loop (3 minutes)**

Run: `pnpm vitest run tests/unit/runtime.test.ts -t "coordinator|RUN-04"`

Expected: PASS; 100 race iterations produce one terminal state each, post-ack completion never wins, retry never overlaps unresolved cleanup, and zero live timers/listeners remain.

- [ ] **Step 5: Stage and commit (2 minutes)**

```bash
git add src/features/transcription/runtime-coordinator.ts tests/unit/runtime.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(runtime): coordinate one sequential active run"
```

### Task 7: Build truthful progress, desktop queue, and accessible mobile sheet

**Files:**
- Create: `src/components/ui/sheet.tsx`
- Create: `src/features/workbench/RunProgress.tsx`
- Create: `src/features/workbench/QueuePanel.tsx`
- Create: `src/features/workbench/QueueSheet.tsx`
- Modify: `src/features/workbench/copy.ts:runtime and queue keys`
- Create: `tests/components/queue.test.tsx`

- [ ] **Step 1: Add failing component tests (5 minutes)**

In `tests/components/queue.test.tsx`, test EN/VI labels, fixed four-phase order, omission annotation for server Load model, percent only for measured progress, “Estimating…” only for measurable-but-ineligible stage, elapsed localization, chronological bounded logs, immediate terminal announcement, and a focused 100-update render-isolation assertion around the progress subtree. Test desktop reorder disabled boundaries, running immovability, Retry/Remove actions, cancel-choice menu, polite position announcement. At 390/320 render mobile trigger and assert Dialog semantics, close button, Escape closure, trigger focus restoration, scroll container, `padding-bottom: env(safe-area-inset-bottom)`, and 44 px controls. Run axe directly and require zero critical/serious violations.

- [ ] **Step 2: Run red (2 minutes)**

Run: `pnpm vitest run tests/components/queue.test.tsx`

Expected: FAIL with missing components.

- [ ] **Step 3: Create sheet primitive (3 minutes)**

Compose existing Radix `Dialog` primitives in `sheet.tsx`; use a fixed bottom content surface, `max-h-[100svh]`, `overflow-y-auto`, and `[padding-bottom:env(safe-area-inset-bottom)]`. Export `Sheet`, `SheetTrigger`, `SheetContent`, `SheetTitle`, `SheetDescription`, and `SheetClose`. Keep overlay opaque-neutral; remove the existing Dialog blur class for this sheet. Radix supplies focus trap, Escape, and restoration.

- [ ] **Step 4: Create queue/progress components (5 minutes)**

`RunProgress` accepts only `RuntimeCoordinatorSnapshot`, localized formatter callbacks, and cancel callback. Import `type MeasuredProgress` directly from `@/features/workbench/types` and use it for the stage-local progress presentation input; do not import it through `runtime.ts` or redeclare/alias it. Derive displayed percentage as `Math.round(completed / total * 100)` only when progress exists. Render phase names, not global progress. Use one `role="status" aria-live="polite"` for phase/cancel transitions; announce numeric progress only on 10-point boundaries or after 15 seconds. Logs render escaped text from code plus safe params and offer Copy.

`QueuePanel` and `QueueSheet` accept the same queue/action props. Use Move earlier/later buttons for every movable failed/cancelled/ready item, visible action buttons or menu, textual status, and no drag-only behavior. Completed Remove only dispatches queue removal. Use minimum `min-h-11 min-w-11` controls. `QueueSheet` wraps `QueuePanel` and summarizes current item on the Workbench trigger.

- [ ] **Step 5: Add typed EN/VI copy (3 minutes)**

Add full-message keys for four phases, omitted Load model detail, Estimating, elapsed, ETA, queue count/statuses, move earlier/later, moved position, cancel, cancel-and-continue, stop batch, retry, remove, open/close queue, technical details, copy log, and unknown runtime code. Both locale objects must satisfy the existing `defineCopy` shape. No component/adaptor user-facing English remains.

- [ ] **Step 6: Run green, axe, and profiler adjacency (4 minutes)**

Run: `pnpm vitest run tests/components/queue.test.tsx`

Expected: PASS; zero critical/serious axe findings; across 100 throttled updates header/nav/Library probes record zero progress-caused commits while progress subtree commits.

- [ ] **Step 7: Stage and commit (2 minutes)**

```bash
git add src/components/ui/sheet.tsx src/features/workbench/RunProgress.tsx src/features/workbench/QueuePanel.tsx src/features/workbench/QueueSheet.tsx src/features/workbench/copy.ts tests/components/queue.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "feat(queue): add accessible sequential run controls"
```

### Task 8: Add singular errors and confirmation-only FIFO toasts

**Files:**
- Create: `src/app/toast-store.ts`
- Modify: `src/components/product/ProductErrorPanel.tsx:entire component`
- Modify: `src/app/AppShell.tsx:route outlet and live-region block`
- Modify: `src/features/workbench/copy.ts:error and toast keys`
- Modify: `tests/components/product-errors.test.tsx:1-end`

- [ ] **Step 1: Write failing ERR-01 and timer tests (5 minutes)**

Test one `ProductError` occurrence renders once beside its queue item, never in toast viewport; starting retry removes it synchronously; successful retry leaves no stale disclosure; repeated provider event with same occurrence ID renders once. Enqueue A/B/C confirmations and assert FIFO display, five-second dismissal, ten-second Undo, hover/focus pause, resume with remaining time, polite live region, no focus theft, and one batch summary even when items failed contextually.

- [ ] **Step 2: Run red (2 minutes)**

Run: `pnpm vitest run tests/components/product-errors.test.tsx`

Expected: FAIL with missing toast store or duplicate error rendering.

- [ ] **Step 3: Implement FIFO external store (5 minutes)**

Create `toast-store.ts` with exact public types/functions:

```ts
import type { CopyParams } from "@/app/copy-types"

export interface ConfirmationToast {
  id: string
  code: string
  params: CopyParams
  durationMs: 5_000 | 10_000
  action: { code: "undo"; run(): Promise<void> | void } | null
}
export interface ToastSnapshot { current: ConfirmationToast | null; pendingCount: number; paused: boolean }
export interface ConfirmationToastStore {
  getSnapshot(): ToastSnapshot
  subscribe(listener: () => void): () => void
  enqueue(toast: ConfirmationToast): void
  dismiss(id: string): void
  pause(): void
  resume(): void
  dispose(): void
}
export function createConfirmationToastStore(): ConfirmationToastStore
```

Use one queue and one timer. Store start time and remaining duration; pause subtracts monotonic elapsed, resume schedules remaining. Dismiss shifts FIFO and starts next. Dedupe by toast ID. `dispose()` clears timer/listeners/queue idempotently. Reject any object whose code begins `error.` or whose params contain token/header/body keys.

- [ ] **Step 4: Keep one contextual error renderer (4 minutes)**

`ProductErrorPanel` receives one error, formats via `formatProductError`, renders one newly blocking `role="alert"`, primary/optional secondary buttons, and one collapsed technical disclosure. Never enqueue toast. Queue retry dispatch clears issue before coordinator start. Success replaces issue with null. Mount one toast viewport in `AppShell`; use `useSyncExternalStore` against toast store, `aria-live="polite"`, pointer/focus pause handlers, and no autofocus.

- [ ] **Step 5: Run green and adjacent queue tests (3 minutes)**

Run: `pnpm vitest run tests/components/product-errors.test.tsx tests/components/queue.test.tsx`

Expected: PASS; one contextual error; FIFO/timers and stale clearing pass.

- [ ] **Step 6: Stage and commit (2 minutes)**

```bash
git add src/app/toast-store.ts src/components/product/ProductErrorPanel.tsx src/app/AppShell.tsx src/features/workbench/copy.ts tests/components/product-errors.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "fix(app): keep errors contextual and confirmations queued"
```

### Task 9: Integrate adapters and coordinator into Workbench

**Files:**
- Create: `src/app/RuntimeCoordinatorProvider.tsx`
- Modify: `src/app/AppShell.tsx:provider boundary and route outlet`
- Modify: `src/features/workbench/WorkbenchPage.tsx:runtime orchestration and queue composition block`
- Modify: `vitest.config.ts:5-8`
- Modify: `tests/setup.ts:entire file`
- Modify: `tests/components/workbench.test.tsx:active, failed, cancelled states`
- Modify: `tests/components/navigation.test.tsx:held-run route lifetime`

- [ ] **Step 1: Write failing Workbench integration tests (5 minutes)**

Inject fake adapters and repository save. Assert start captures current settings once, pending changes require confirmation, one active run, completion waits for local save, local save failure is contextual and not completed, cancellation shows Cancelling then Cancelled only after acknowledgement, retry clears error first and cannot overlap unresolved cancellation cleanup, batch confirmation is one FIFO toast, and single completion offers Open transcript without opening it automatically during batch. Assert `WorkbenchPage` only subscribes to and renders coordinator snapshots: source scan rejects every `setWorkActivity`, coordinator construction, queue-store construction, `dispose()`, and cancel call from Workbench/unmount cleanup. In `tests/components/navigation.test.tsx`, start and hold one run, capture its run ID and queue snapshot identity, navigate to Library, require work activity remains true and no cancel/dispose occurs, return to Workbench, require the same run ID and queue state, then complete it and require exactly one terminal cleanup. Unmount the complete `AppShell` tree separately and prove provider disposal runs once. Coordinator unit tests own exact activity publication timing.

- [ ] **Step 2: Run red (2 minutes)**

Run: `pnpm vitest run tests/components/workbench.test.tsx -t "runtime|cancel|batch"`

Expected: FAIL because Workbench still calls provider-specific clients or lacks coordinator controls.

- [ ] **Step 3: Wire one app-lifetime coordinator above route outlets (5 minutes)**

Create `RuntimeCoordinatorProvider.tsx` with a typed context. Import `createRuntimeCoordinator` plus types `RuntimeCoordinator` and `RuntimeCoordinatorOptions` from `@/features/transcription/runtime-coordinator`; import each adapter factory plus its dependency type from the owning `adapters/local`, `adapters/cloudflare`, or `adapters/server` module. Import production worker/API functions from `@/lib/transcription-worker-client`, `@/features/server-transcription/client`, and `@/features/server-transcription/api`, then construct separate `"local-webgpu"` and `"local-wasm"` objects satisfying `LocalRuntimeDependencies`, the other two adapter dependency objects, and one `RuntimeCoordinatorOptions` object before factory calls. Its provider creates adapters, one `QueueStore`, and one coordinator once with lazy `useState`/stable `useRef`, exposes only the coordinator through `useRuntimeCoordinator()`, and disposes it only in the provider's app-teardown effect cleanup. `AppShell` mounts this provider outside and above the complete query-route outlet so Workbench, Library, Transcript, and Settings navigation never remounts it. Map Phase 2 `QueueSource` to `RuntimeSource`, and captured settings to exact `RuntimeOptions`. Supply the Phase 1B repository save operation; do not perform Drive work. `WorkbenchPage` calls `useRuntimeCoordinator()`, subscribes through `useSyncExternalStore`, and unsubscribes on route unmount; it never creates, disposes, cancels, or clears the coordinator/queue. Dispatch queue actions only through coordinator commands/reducer. Remove direct imports/calls to local worker, Cloudflare client, Server API, SSE, timers, work-activity publication, and provider cancellation from Workbench. Mount `RunProgress`, desktop `QueuePanel` at `lg`, mobile `QueueSheet` below `lg`. Keep current item central and preserve sequential batch execution.

- [ ] **Step 4: Fix test environments (3 minutes)**

Configure unit tests as Node by default and `tests/components/**/*.test.tsx` as jsdom. `tests/setup.ts` imports `@testing-library/jest-dom/vitest` and runs Testing Library cleanup after each test. Do not install global fetch/Worker mocks outside individual tests.

- [ ] **Step 5: Run green and complete component adjacency (4 minutes)**

Run: `pnpm vitest run tests/components/workbench.test.tsx tests/components/navigation.test.tsx tests/components/queue.test.tsx tests/components/product-errors.test.tsx`

Expected: PASS; no act warning, leaked timer, listener, or unhandled rejection.

- [ ] **Step 6: Stage and commit (2 minutes)**

```bash
git add src/app/RuntimeCoordinatorProvider.tsx src/app/AppShell.tsx src/features/workbench/WorkbenchPage.tsx vitest.config.ts tests/setup.ts tests/components/workbench.test.tsx tests/components/navigation.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "feat(workbench): integrate normalized runtime coordinator"
```

### Task 10: Add deterministic browser runtime fixture and named E2E scenarios

**Files:**
- Modify: `src/app/RuntimeCoordinatorProvider.tsx:fixture seam only`
- Modify: `tests/e2e/fixtures/runtime.ts:1-end`
- Create: `tests/e2e/runtime-queue.spec.ts`
- Modify: `tests/e2e/server-mode.spec.ts:1-19`
- Modify: `tests/e2e/real-transcription.spec.ts:runtime selectors only`

- [ ] **Step 1: Create complete fake-runtime fixture (5 minutes)**

Modify the Phase 2-created fixture. Preserve `createSilentWav`, `installWebGpu`, `mockServer`, `recordHeavyRequests`, and `expectNoHeavyRequests`; add the exact master exports and implementation below. `installRuntimeFixture` takes only `page`: run behavior is selected through public UI plus the fixture's deterministic `nextOutcome` control, not a mismatched second script argument. Never intercept IndexedDB or Drive.

```ts
import { expect, type Page } from "@playwright/test"

export type WorkbenchFixtureState = "empty" | "review" | "active" | "failed" | "queue-sheet"

type RuntimeFixtureWindow = Window & {
  __WHISDOM_RUNTIME_FIXTURE__: {
    nextOutcome: "hold" | "success" | "failure"
    cancellationMode: "cooperative" | "forced-asr" | "forced-ffmpeg"
    starts: number
    activeRuns: number
    maxActiveRuns: number
    activeRunId: string | null
    terminalCleanups: number
    asrCreated: number
    asrTerminated: number
    ffmpegCreated: number
    ffmpegTerminated: number
    cloudflareFetches: number
    cloudflareAborts: number
    serverSubmits: number
    serverCancels: number
    sseOpened: number
    sseClosed: number
    cacheKeysBefore: string[]
    cacheKeysAfter: string[]
    lateEventsIgnored: number
    setCancellationMode(mode: "cooperative" | "forced-asr" | "forced-ffmpeg"): void
    acknowledgeCancel(): void
    complete(): void
    fail(code: string): void
    emitMeasured(completed: number, total: number): void
    start(source: { kind: "file" | "link"; name?: string }, options: { mode: string; modelId: string; language: string; needsConversion?: boolean }): {
      runId: string
      events: EventTarget
      result: Promise<{ sourceName: string; mode: string; modelId: string; language: string; segments: Array<{ id: string; startMs: number; endMs: number; text: string }> }>
      cancel(): Promise<void>
      dispose(): Promise<void>
    }
  }
}

export async function installRuntimeFixture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let sequence = 0
    let asrLive = false
    let ffmpegLive = false
    let activeControl: { acknowledgeCancel(): void; complete(): void; fail(code: string): void; emitMeasured(completed: number, total: number): void } | null = null
    const fixture = {
      nextOutcome: "hold" as "hold" | "success" | "failure",
      cancellationMode: "cooperative" as "cooperative" | "forced-asr" | "forced-ffmpeg",
      starts: 0, activeRuns: 0, maxActiveRuns: 0, activeRunId: null, terminalCleanups: 0,
      asrCreated: 0, asrTerminated: 0, ffmpegCreated: 0, ffmpegTerminated: 0,
      cloudflareFetches: 0, cloudflareAborts: 0, serverSubmits: 0, serverCancels: 0,
      sseOpened: 0, sseClosed: 0,
      cacheKeysBefore: ["whisdom-transformers-cache"],
      cacheKeysAfter: ["whisdom-transformers-cache"],
      lateEventsIgnored: 0,
      setCancellationMode(mode: "cooperative" | "forced-asr" | "forced-ffmpeg") { fixture.cancellationMode = mode },
      acknowledgeCancel() { activeControl?.acknowledgeCancel() },
      complete() { activeControl?.complete() },
      fail(code: string) { activeControl?.fail(code) },
      emitMeasured(completed: number, total: number) { activeControl?.emitMeasured(completed, total) },
      start(source: { kind: "file" | "link"; name?: string }, options: { mode: string; modelId: string; language: string; needsConversion?: boolean }) {
        const runId = `fixture-run-${++sequence}`
        const events = new EventTarget()
        fixture.starts += 1
        fixture.activeRuns += 1
        fixture.activeRunId = runId
        fixture.maxActiveRuns = Math.max(fixture.maxActiveRuns, fixture.activeRuns)
        if (options.mode.startsWith("local") && options.needsConversion && !ffmpegLive) { ffmpegLive = true; fixture.ffmpegCreated += 1 }
        if (options.mode.startsWith("local") && !asrLive) { asrLive = true; fixture.asrCreated += 1 }
        if (options.mode === "cloudflare-ai") fixture.cloudflareFetches += 1
        if (options.mode === "server") { fixture.serverSubmits += 1; fixture.sseOpened += 1 }
        let terminal = false
        let cancelResolve: (() => void) | null = null
        let resolveResult!: (value: { sourceName: string; mode: string; modelId: string; language: string; segments: Array<{ id: string; startMs: number; endMs: number; text: string }> }) => void
        let rejectResult!: (reason: Error) => void
        const result = new Promise<Parameters<typeof resolveResult>[0]>((resolve, reject) => { resolveResult = resolve; rejectResult = reject })
        const emit = (code: string, terminalEvent = false) => events.dispatchEvent(new CustomEvent("runtime-event", { detail: {
          runId, sequence: ++sequence, occurredAt: performance.now(), code,
          phase: code.startsWith("save.") ? "save" : "transcribe", params: {},
          progress: code === "transcribe.chunk" ? { completed: 1, total: 2, unit: "chunks" } : null,
          terminal: terminalEvent,
        } }))
        const finish = () => {
          if (!terminal) {
            terminal = true
            fixture.activeRuns -= 1
            fixture.activeRunId = null
            fixture.terminalCleanups += 1
          }
        }
        const complete = () => {
          if (terminal) { fixture.lateEventsIgnored += 1; return }
          finish(); emit("transcribe.complete")
          resolveResult({ sourceName: source.name ?? "fixture.wav", mode: options.mode, modelId: options.modelId, language: options.language, segments: [{ id: "fixture-segment-1", startMs: 0, endMs: 1000, text: "Fixture transcript" }] })
        }
        const fail = (code: string) => {
          if (terminal) { fixture.lateEventsIgnored += 1; return }
          finish(); emit("run.failed", true); rejectResult(new Error(code))
        }
        activeControl = {
          acknowledgeCancel() {
            if (terminal) return
            finish(); emit("run.cancelled", true); rejectResult(new DOMException("Cancelled", "AbortError")); cancelResolve?.(); cancelResolve = null
          },
          complete,
          fail,
          emitMeasured(completed, total) {
            if (terminal) { fixture.lateEventsIgnored += 1; return }
            events.dispatchEvent(new CustomEvent("runtime-event", { detail: { runId, sequence: ++sequence, occurredAt: performance.now(), code: "transcribe.chunk", phase: "transcribe", params: {}, progress: { completed, total, unit: "chunks" }, terminal: false } }))
          },
        }
        queueMicrotask(() => {
          emit("transcribe.running"); emit("transcribe.chunk")
          if (fixture.nextOutcome === "failure") fail("runtime.fixture-failed")
          else if (fixture.nextOutcome === "success") complete()
        })
        return {
          runId, events, result,
           async cancel() {
             if (terminal) return
             emit("run.cancel_requested")
             if (options.mode === "cloudflare-ai") fixture.cloudflareAborts += 1
             if (options.mode === "server") { fixture.serverCancels += 1; fixture.sseClosed += 1 }
             await new Promise<void>((resolve) => {
               cancelResolve = resolve
               if (fixture.cancellationMode === "cooperative") return
               window.setTimeout(() => {
                 if (terminal) return
                 if (fixture.cancellationMode === "forced-asr") {
                   if (!asrLive) throw new Error("forced ASR cancellation requires a live ASR worker")
                   asrLive = false
                   fixture.asrTerminated += 1
                 } else {
                   if (!ffmpegLive) throw new Error("forced ffmpeg cancellation requires conversion and a live ffmpeg worker")
                   ffmpegLive = false
                   fixture.ffmpegTerminated += 1
                 }
                 activeControl?.acknowledgeCancel()
               }, 150)
             })
          },
          async dispose() {
            if (terminal) return
            const cancellation = this.cancel()
            queueMicrotask(() => fixture.acknowledgeCancel())
            await cancellation
          },
        }
      },
    }
    ;(window as RuntimeFixtureWindow).__WHISDOM_RUNTIME_FIXTURE__ = fixture
  })
}

async function setFixtureLanguage(page: Page, language: "en" | "vi"): Promise<void> {
  if (await page.locator("html").getAttribute("lang") === language) return
  await page.getByRole("button", { name: /account menu|menu tài khoản/i }).click()
  await page.getByRole("button", { name: language.toUpperCase(), exact: true }).click()
  await expect(page.locator("html")).toHaveAttribute("lang", language)
}

export async function openWorkbenchState(page: Page, state: WorkbenchFixtureState, language: "en" | "vi"): Promise<void> {
  await page.goto("/?view=workbench")
  await setFixtureLanguage(page, language)
  await expect(page.locator("main h1")).toBeVisible()
  if (state === "empty") return
  const files = Array.from({ length: state === "queue-sheet" ? 3 : 1 }, (_, index) => ({
    name: `fixture-${index + 1}.wav`, mimeType: "audio/wav",
    buffer: Buffer.from("UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=", "base64"),
  }))
  await page.locator('input[type="file"]').setInputFiles(files)
  await expect(page.getByRole("heading", { name: /review|kiểm tra/i })).toBeVisible()
  if (state === "review") return
  if (state === "queue-sheet") {
    await page.getByRole("button", { name: /open queue|mở hàng đợi/i }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    const rows = page.getByTestId("queue-item")
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(1).getByRole("button", { name: /move earlier|di chuyển trước/i })).toBeEnabled()
    await expect(rows.nth(1).getByRole("button", { name: /move later|di chuyển sau/i })).toBeEnabled()
    await expect(rows.first().getByRole("button", { name: /move earlier|di chuyển trước/i })).toBeDisabled()
    await expect(rows.last().getByRole("button", { name: /move later|di chuyển sau/i })).toBeDisabled()
    return
  }
  await page.evaluate((outcome) => { ;(window as RuntimeFixtureWindow).__WHISDOM_RUNTIME_FIXTURE__.nextOutcome = outcome }, state === "failed" ? "failure" : "hold")
  await page.getByRole("button", { name: /transcribe selected|chép lời mục đã chọn/i }).click()
  if (state === "failed") await expect(page.getByRole("alert")).toBeVisible()
  else {
    await expect(page.getByTestId("runtime-active-state")).toHaveAttribute("data-runtime-status", "running")
    await expect(page.getByTestId("queue-active-item")).toHaveAttribute("data-queue-status", "running")
  }
}
```

The fixture models both local cancellation paths, not just counters. `cooperative` leaves worker slots live until the test calls `acknowledgeCancel()`. `forced-asr` and `forced-ffmpeg` deliberately withhold acknowledgement, wait the contractual 150 ms, terminate only the selected live slot, increment its termination counter, emit terminal cancellation, and leave the other slot unchanged. A later local start lazily increments the selected `*Created` counter once because its slot is null; reuse does not increment. `activeRunId` remains stable for a held run across route changes; `terminalCleanups` increments exactly once in the common terminal path. RUN-01 calls `complete()` after cancellation acknowledgement and requires only `lateEventsIgnored` to increment: no completion state/result is published after acknowledgement. RUN-02 sets each mode through `setCancellationMode`, uses conversion for the ffmpeg case, asserts Cancelling before 150 ms, termination/terminal state at 150 ms, unchanged Cache Storage keys, exact `{created,terminated}` deltas, one lazy replacement only after termination cleanup, no retry overlap, no second live slot, and `maxActiveRuns === 1`. `active` waits for the two exact running-state test IDs/attributes shown above; it never accepts broad text. `queue-sheet` seeds exactly three items and proves its movable middle plus disabled boundary actions before returning.

- [ ] **Step 2: Write RUN-01..04, QUEUE-01, ERR-01 E2E (5 minutes)**

Import `installRuntimeFixture`, `openWorkbenchState`, and `WorkbenchFixtureState` from `./fixtures/runtime`. Every test calls `await installRuntimeFixture(page)` with one argument; state setup calls `await openWorkbenchState(page, state, language)`. No test passes a script argument or defines a second runtime fixture wrapper. Use exact test titles prefixed with IDs. RUN-01 holds local acknowledgement, checks Cancelling remains until release, then attempts fixture completion after acknowledgement and proves no completed state/result appears. RUN-02 runs separate ASR and ffmpeg forced cases, checks only active type terminates, Cache Storage key survives, retry creates one replacement only after termination, no retry overlap occurs, and `maxActiveRuns === 1`. RUN-03 checks Cloudflare abort prevents chunk 2, server calls cancel and closes SSE, then retry succeeds. RUN-04 feeds eligible/ineligible ETA samples and checks stage/retry reset plus no global percent. QUEUE-01 scripts success→failure→cancel/pause, verifies only the earliest ready item starts, cancelled/failed items do not start, and each terminal item requires Retry to return to ready before starting again; then it chooses Continue, retries failure, reorders/removes allowed items, and keeps `maxActiveRuns === 1`. Add `QUEUE-01 preserves held run across query routes`: hold one run, capture `activeRunId` and queue-item identity, navigate to Library, require work activity remains true and `activeRuns === 1`, return to Workbench, require the same run/queue with `starts === 1`, complete it, and require `terminalCleanups === 1`. ERR-01 emits duplicate failure events, finds one contextual alert and no error toast, retries successfully, and verifies stale alert disappears.

- [ ] **Step 3: Add viewport, keyboard, live-region, and server coverage (5 minutes)**

Run each queue-sheet/cancel/retry path at desktop, 390×844, and 320×720; assert no horizontal overflow. Keyboard opens sheet, reorders, cancels, escapes, and returns focus to trigger. Assert request/completion cancellation announcements occur once. Expand `server-mode.spec.ts` with mocked capability, URL-only submit, SSE complete, cancel endpoint, and SSE closure; preserve hidden-without-config case. Update real-ASR selectors only; keep `WHISDOM_REAL_ASR` and `WHISDOM_REAL_WEBGPU` gates unchanged.

- [ ] **Step 4: Run focused browser red then green (5 minutes)**

Before production fixture wiring, run:

`pnpm playwright test tests/e2e/runtime-queue.spec.ts --grep "RUN-01" --reporter=list`

Expected red: FAIL because the app does not yet consume the fixture seam.

Wire the provider's runtime factory to select `window.__WHISDOM_RUNTIME_FIXTURE__` only when that test-installed property exists before app bootstrap; otherwise construct real adapters. Keep the fixture type in `tests/e2e/fixtures/runtime.ts`, use an inline structural guard in `RuntimeCoordinatorProvider.tsx`, and add no production import or environment switch. Then run:

`pnpm playwright test tests/e2e/runtime-queue.spec.ts tests/e2e/server-mode.spec.ts --reporter=list`

Expected green: all RUN-01..04, QUEUE-01, ERR-01, and server-mode scenarios pass; no unexpected request, console error, page error, leaked SSE, or active run remains.

- [ ] **Step 5: Stage and commit (2 minutes)**

```bash
git add tests/e2e/fixtures/runtime.ts tests/e2e/runtime-queue.spec.ts tests/e2e/server-mode.spec.ts tests/e2e/real-transcription.spec.ts src/app/RuntimeCoordinatorProvider.tsx
git diff --cached --name-only
git diff --cached
git commit -m "test(runtime): cover cancellation queue and resource races"
```

Expected staged paths: exactly five paths from the task Files block.

## Phase verification and review

- [ ] Run focused named unit/component suites:

```powershell
pnpm vitest run tests/unit/queue-reducer.test.ts -t 'nextSequentialItem selects earliest ready only|cancelled item requires item-retried before selection|failed item requires item-retried before selection'
pnpm vitest run tests/unit/runtime.test.ts tests/unit/runtime-adapters.test.ts tests/unit/queue-reducer.test.ts tests/unit/server-api.test.ts
pnpm vitest run tests/components/workbench.test.tsx tests/components/navigation.test.tsx tests/components/queue.test.tsx tests/components/product-errors.test.tsx
```

Expected: all three commands exit `0`; the three exact ready-only/retry test names pass; all selected tests pass; no unhandled rejection, open timer, duplicate terminal event, or React act warning.

- [ ] Run named E2E scenarios:

```bash
pnpm playwright test tests/e2e/runtime-queue.spec.ts --grep "RUN-01|RUN-02|RUN-03|RUN-04|QUEUE-01|ERR-01" --reporter=list
pnpm playwright test tests/e2e/server-mode.spec.ts --reporter=list
```

Expected: exit `0`; RUN-01..04, QUEUE-01, ERR-01, and expanded server scenarios pass at their declared viewports.

- [ ] Run Phase 2 regression and existing browser adjacency:

```bash
pnpm playwright test tests/e2e/recommendation.spec.ts tests/e2e/workbench.spec.ts tests/e2e/whisdom.spec.ts --reporter=list
```

Expected: exit `0`; REC-01..06 and WB-01..02 remain green; file selection still appends; batch completion does not auto-open transcript.

- [ ] Run repository gates from the worktree root in this exact order:

```bash
pnpm typecheck
rtk lint
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Expected: every command exits `0`; both lint commands report zero errors and zero warnings; Playwright reports only documented gated real-ASR/WebGPU skips.

- [ ] Do not run Cloudflare worker typecheck unless `worker/` changed. If it did unexpectedly, stop scope review, then run `pnpm --filter whisdom-worker typecheck`; expected exit `0`.
- [ ] Do not claim real-ASR coverage unless enabled. In an available environment run:

```powershell
$env:WHISDOM_REAL_ASR='1'
try {
  rtk playwright test tests/e2e/real-transcription.spec.ts --reporter=list
} finally {
  Remove-Item Env:WHISDOM_REAL_ASR -ErrorAction SilentlyContinue
}

$env:WHISDOM_REAL_ASR='1'
$env:WHISDOM_REAL_WEBGPU='1'
try {
  rtk playwright test tests/e2e/real-transcription.spec.ts --grep "WebGPU" --reporter=list
} finally {
  Remove-Item Env:WHISDOM_REAL_ASR -ErrorAction SilentlyContinue
  Remove-Item Env:WHISDOM_REAL_WEBGPU -ErrorAction SilentlyContinue
}
```

Expected: in an environment that supports the enabled scenario, the selected real-ASR or real-WebGPU scenario runs and passes rather than skipping. Record command, browser/OS/GPU, provider/model fixture, selected scenario names, pass count, skip count, exit code, and UTC execution time. Missing hardware or credentials may remain a documented gated skip, but a skip is not real-runtime evidence and does not satisfy this check when the environment supports the scenario.

- [ ] Inspect resource evidence from RUN-01..03: cooperative markers remain until active-operation cleanup and acknowledgement; no completion follows acknowledgement; retry starts only after cooperative cleanup or confirmed termination; no active run, timer, worker listener, fetch, AbortController, SSE reader/subscription, or server job handle remains after every terminal path; old run IDs cannot mutate retry state; Cache Storage remains present after forced local cancellation.
- [ ] Inspect UI evidence: no synthetic global percentage; no raw provider message as primary copy; four phases and omitted-load detail are truthful; terminal events render immediately; logs contain at most 200 safe entries; cancel request/completion announce separately; one contextual error renders; confirmations remain FIFO/polite.
- [ ] Inspect responsive/accessibility evidence at desktop, 390 px, and 320 px: no horizontal overflow; all queue controls at least 44×44 CSS px; sheet traps focus, closes by Escape/button, restores trigger, scrolls full height, and honors safe-area padding; reorder works without drag.
- [ ] Remove generated `test-results/.last-run.json`, Playwright output, traces, screenshots not designated as fixtures, `dist/`, caches, and local environment files before staging. Do not reset, clean, or discard another worker’s files.
- [ ] Run `git diff --cached --name-only` and `git diff --cached`; stage only paths named by the current task. Never use `git add .` or `git add -A`.
- [ ] Obtain task-level code-quality review after every commit and one phase-level review against spec Sections 11, 12, 18–21, 23.1–23.4, and acceptance Sections 24.1, 24.2, 24.4, and 24.5.
- [ ] Confirm phase exit: RUN-01..04, QUEUE-01, and ERR-01 pass; every runtime cancels terminally with no post-ack completion or retry overlap; one sequential active run is enforced; a held run/queue/work-activity state survives Workbench → Library → Workbench; route unmount never disposes/cancels; app teardown cleans up once; no fake percentage, duplicate error, stale error, leaked subscription/resource, cache deletion, singleton overlap, premature cancelled state, editor work, Drive work, Cloudflare API change, or Rust server change exists.

## Self-review record

- [ ] Spec coverage: Tasks 1–4 cover normalized contracts, honest events, all provider adapters, cancellation acknowledgement, forced per-type replacement, SSE/fetch cleanup, measured progress, elapsed/ETA, throttling, terminal immediacy, and bounded logs. Tasks 5–6 cover pure transitions, immutable captures, retry/reorder/remove rules, sequential ownership, pause/continue/stop, races, and idempotent disposal. Tasks 7–9 cover desktop/mobile queue UI, accessibility, EN/VI, contextual errors, stale clearing, FIFO confirmations, profiler isolation, and Workbench integration. Task 10 covers RUN-01..04, QUEUE-01, ERR-01, resources, leaks, races, viewports, server flow, and gated real-ASR selector preservation.
- [ ] Scope coverage: no editor, Library implementation, Drive sync, Cloudflare Worker API, or Rust server edit appears. Browser-worker changes retain Cache Storage and single-threaded ffmpeg. Cloudflare worker typecheck remains conditional on an unexpected `worker/` boundary edit.
- [ ] Type consistency: `src/features/workbench/types.ts` owns the sole exact `MeasuredProgress` declaration; runtime, adapters, coordinator, and presentation import it directly without aliases. `RuntimeEvent`, `RuntimeRunHandle`, `RuntimeAdapter`, `RuntimeResult`, `QueueAction`, `CapturedTranscriptionSettings`, canonical `startMs`/`endMs`, and `ProductError` names match the master. `nextSequentialItem` and coordinator pumping choose only the earliest `ready` item; `item-started` rejects cancelled/failed until explicit retry returns them to ready. Cancellation uses `cancelling` at request and `cancelled` only after terminal acknowledgement.
- [ ] Incomplete-work scan: no unfinished-work token, deferred implementation marker, undefined production helper, “similar to” instruction, or execution-choice ending remains. Every referenced helper is defined in this plan or is an existing Phase 1/2 export named with its owning path.
- [ ] Ordering check: every task follows red test, observed failure, minimum implementation, focused green, adjacent suite, exact staging inspection, and conventional commit. Phase verification runs focused suites before full repository gates.
