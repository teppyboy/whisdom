# Precision Studio Phase 4 Editor and Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-page transcript editor and deterministic Library that preserve bounded `EditorDraftPayload` edits locally, commit only `CanonicalCommitResult.status === "canonical"` to transcript/sync state, export one byte-consistent segment-derived representation, and protect dirty work during refresh and navigation.

**Architecture:** Consume Phase 1B schema-2 repositories, `EditorDraftSegment`/`EditorDraftPayload`/`CanonicalCommitResult`, and Phase 3 `RuntimeResult` without changing those contracts or IndexedDB schema. A pure caller-ID editor reducer owns bounded scalar-safe draft state that may violate canonical timing. An external autosave controller serializes draft revisions independently from canonical transcript revisions and branches only on `commitEditorDraftPayload()`'s discriminant. Lazy route pages render document/timeline and Library projections over repository records. Search and large lists use shared 8 ms cooperative yielding, with TanStack Virtual enabled only above the specified thresholds.

**Tech Stack:** React 19, TypeScript 6, IndexedDB/idb repositories from Phase 1B, query navigation from Phase 1B, `@tanstack/react-virtual`, RFC 8785 canonicalization from Phase 1B, Vitest, Testing Library/jsdom, Playwright, axe-core.

---

## Entry conditions and scope lock

- [ ] Work only in `F:\Workspace\whisdom\whisdom-precision-studio` on `feature/precision-studio-redesign`.
- [ ] Confirm Phase 3 is complete: normalized runtimes return the exact `RuntimeResult` from `src/features/transcription/runtime.ts`; queue completion persists through schema-2 repositories; RUN-01..04, QUEUE-01, and ERR-01 pass.
- [ ] Read `AGENTS.md`, `docs/superpowers/specs/2026-07-29-ui-redesign-design.md`, and `docs/superpowers/plans/2026-07-29-ui-redesign-master-rollout.md` before editing.
- [ ] Treat Phase 1B `CanonicalSegment`, `CanonicalTranscriptPayload`, `EditorDraftSegment`, `EditorDraftPayload`, `CanonicalCommitResult`, `TranscriptRecord`, `DraftRecord`, `StorageRepositories`, `parseEditorDraftPayload`, `commitEditorDraftPayload`, hash functions, and repository transaction behavior as immutable inputs. Phase 4 performs no database migration and creates no stores or indexes.
- [ ] Consume Phase 1B `RepositoryFixtureMethod`, `RepositoryFailurePort`, `RepositoryFactoryOptions`, and `createStorageRepositories(db, options?)` unchanged. Phase 4 supplies the existing `failurePort`; it does not modify the repository factory or create another failure seam.
- [ ] Keep Drive transport, GIS identity, remote publication, reconciliation, remote parsing, and conflict resolution out of Phase 4. Sync-state UI receives repository-derived slots only. Canonical Workbench-save, editor-autosave, and Library mutation controller dependencies expose one structural `desiredPublicationFor(envelope: TranscriptEnvelope): Promise<PendingDesiredPublication | null>` callback and Phase 4 injects `async () => null`; controllers await it only after preparing an exact canonical next envelope and pass its result to the existing atomic repository call. Needs-attention/draft-only paths never invoke it. Phase 4 declares no public factory symbol or Drive import; Phase 5 supplies the definitive account-bound implementation.
- [ ] Keep editor state and undo/redo snapshots as `EditorDraftSegment[]`. Create canonical `text` only inside `commitEditorDraftPayload()` after canonical timing succeeds; never introduce an independently editable document string.
- [ ] Use caller-supplied `createId()` results for every operation, split segment, pasted segment, deletion, and quarantine-repair identity. Reducers never read time, generate IDs, access repositories, or perform I/O.

## Locked behavior and constants

```ts
export const EDITOR_HISTORY_LIMIT = 100
export const AUTOSAVE_DELAY_MS = 600
export const WORK_YIELD_BUDGET_MS = 8
export const LIBRARY_VIRTUALIZATION_THRESHOLD = 200
export const TIMELINE_VIRTUALIZATION_THRESHOLD = 500
export const DELETE_UNDO_WINDOW_MS = 10_000
```

- `startMs` and `endMs` remain relative-millisecond numbers in editor drafts. The reducer accepts only finite values with absolute value at most `Number.MAX_SAFE_INTEGER`; canonical commit additionally requires safe integers in `0..604800000`, `endMs >= startMs`, and every later `startMs >= previous.endMs`. Segment array order never changes from timing edits.
- Invalid timeline timing remains in the exact account-neutral `EditorDraftPayload`, sets Needs attention, blocks schema-2 JSON/SRT/VTT and future sync enqueue, and leaves TXT/copy available from normalized scalar-valid draft segment text.
- Subtitle eligibility validates every ordered segment before omitting normalized-empty cues. Valid timing plus zero non-empty cues returns `no-non-empty-cues`; invalid timing on an empty segment returns `invalid-timing` first.
- Split preserves original ID/start/end on the left and creates `[original.endMs, original.endMs]` on the right. Merge preserves the previous ID/start, takes the later end, and joins normalized non-empty text with one ASCII space.
- Multiline paste splits on `CRLF`, lone `LF`, lone `CR`, `U+2028`, or `U+2029`. Caller supplies exactly one new segment ID per extra part. New parts use zero-length timing at the original segment end.
- Undo/redo covers title, text, split, merge, paste, selection replacement, and timing. Selection-only/save-state actions do not enter history. Past and future arrays are each capped at 100 snapshots.
- Library default ordering is `updatedAt` descending, then transcript ID ascending. Discovery search case-folds and removes Vietnamese combining marks from title, source name, and canonical text without changing displayed or persisted values.

## File ownership map

| Path | Action and responsibility |
| --- | --- |
| `src/features/transcript-editor/types.ts` | Create; public editor state, actions, selection, save/search contracts, constants |
| `src/features/transcript-editor/reducer.ts` | Create; deterministic structural edits, timing issue, bounded undo/redo, payload derivation |
| `src/features/transcript-editor/search.ts` | Create; incremental match indexing, wrap/reset policy, 8 ms scheduler/fallback |
| `src/features/transcript-editor/autosave.ts` | Create; 600 ms one-flight save controller, coalesced desired revision, best-effort lifecycle bridge, navigation guard |
| `src/features/transcript-editor/copy.ts` | Create; compile-time equal EN/VI editor copy importing helper/types only from `src/app/copy-types.ts` |
| `src/features/transcript-editor/DocumentView.tsx` | Create; segment-backed prose blocks and keyboard editing |
| `src/features/transcript-editor/TimelineView.tsx` | Create; exact millisecond inputs and >500 virtualization |
| `src/features/transcript-editor/TranscriptPage.tsx` | Replace/modify the exact Phase 1 route placeholder; lazy full-page route, loading/not-found, tabs, search/copy/export/save state |
| `src/features/transcription/exports.ts:1-71` | Replace; discriminated draft/canonical TXT/JSON/SRT/VTT policy, integer timestamps, identical UTF-8 bytes |
| `src/features/library/queries.ts` | Create; deterministic search/filter/sort and incremental indexing |
| `src/features/library/actions.ts` | Create; rename/export/tombstone/delete/observed Undo/quarantine orchestration |
| `src/features/library/copy.ts` | Create; compile-time equal EN/VI Library/recovery copy importing helper/types only from `src/app/copy-types.ts` |
| `src/features/library/TranscriptList.tsx` | Create; visible row actions and >200 virtualization |
| `src/features/library/LibraryPage.tsx` | Replace/modify the exact Phase 1 route placeholder; lazy route, filters, sync slots, quarantine recovery |
| `src/app/copy.ts` | Composition root imports editor and Library modules; modify only typed `CopyRegistry`/`COPY_REGISTRY` entries |
| `src/app/AppShell.tsx:1-end` | Modify route import table only; lazy transcript and Library pages |
| `src/app/navigation.ts:1-end` | Consume/verify Phase 1B's frozen `setGuard` implementation; no public API change |
| `tests/unit/editor-reducer.test.ts` | Create; EDIT-01/03/04 reducer and timing fixtures |
| `tests/unit/editor-search.test.ts` | Create; EDIT-02 traversal/reset/yield fixtures |
| `tests/unit/exports.test.ts:1-end` | Replace; canonical bytes, empty cues, exact milliseconds |
| `tests/unit/library.test.ts` | Create; deterministic query/filter/tombstone behavior |
| `tests/components/transcript-editor.test.tsx` | Create; SAVE-01..03, keyboard/focus/live/mobile behavior |
| `tests/components/library.test.tsx` | Create; actions, quarantine, virtualization continuity |
| `tests/components/navigation.test.tsx:1-end` | Extend; NAV-01 dirty push/pop replay cases |
| `tests/e2e/fixtures/database.ts:1-end` | Modify; exact `SeedLibraryOptions`/`SeedTranscriptOptions` and protocol-valid `seedLibrary`/`seedTranscript` exports |
| `tests/e2e/fixtures/performance.ts` | Create; deterministic 1,000-row and 5,000-segment fixtures |
| `tests/e2e/editor-save.spec.ts` | Create; EDIT-01..04 and SAVE-01..03 |
| `tests/e2e/library.spec.ts` | Create; LIB-01 |
| `tests/e2e/navigation-i18n.spec.ts:1-end` | Extend; NAV-01 dirty deep-link/refresh/Back/Forward and EN/VI |
| `tests/e2e/performance.spec.ts:1-end` | Extend; PERF-02/03 |
Phase 4 keeps changed-flow axe, keyboard, focus, reflow, live-region, and profiler assertions in `tests/components/transcript-editor.test.tsx`, `tests/components/library.test.tsx`, `tests/e2e/editor-save.spec.ts`, and `tests/e2e/library.spec.ts`. Consolidation belongs exclusively to Phase 6.

## Task 1: Add deterministic editor public contracts and reducer

**Files:**
- Create: `src/features/transcript-editor/types.ts`
- Create: `src/features/transcript-editor/reducer.ts`
- Create: `tests/unit/editor-reducer.test.ts`

- [ ] **Step 1: Write the failing EDIT-01/03 reducer tests (5 minutes)**

Create `tests/unit/editor-reducer.test.ts` with table-driven assertions covering caller IDs, split, merge, single-line replacement, every multiline separator, spanning selection, empty boundary text, timing changes, title changes, 100-entry history eviction, undo/redo bounds, redo clearing after a new edit, and derived text. Use this complete fixture and test skeleton; add each named assertion before its matching reducer branch:

```ts
import { describe, expect, it } from "vitest"

import { createEditorDraftPayload, editorReducer, createEditorState } from "@/features/transcript-editor/reducer"
import { commitEditorDraftPayload, parseEditorDraftPayload } from "@/features/transcription/canonical"
import type { TranscriptRecord } from "@/features/transcription/types"

const record: TranscriptRecord = {
  id: "tr_editor",
  revision: 7,
  updatedAt: 1785283200000,
  deletedAt: null,
  deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA",
  deletionId: null,
  restoredFromDeletionId: null,
  localIssueCode: null,
  transcript: {
    title: "Research call",
    sourceName: "call.wav",
    language: "en",
    modelId: "Xenova/whisper-base",
    mode: "local-webgpu",
    createdAt: 1785283200000,
    text: "Alpha beta",
    segments: [
      { id: "s1", startMs: 0, endMs: 1000, text: "Alpha" },
      { id: "s2", startMs: 1000, endMs: 2000, text: "beta" },
    ],
  },
}

describe("EDIT-01 editor reducer", () => {
  it("uses caller IDs and canonical millisecond split/merge rules", () => {
    const split = editorReducer(createEditorState(record), {
      type: "segment-split",
      operationId: "op_split",
      segmentId: "s1",
      offset: 2,
      newSegmentId: "s_new",
    })
    expect(split.present.segments).toEqual([
      { id: "s1", startMs: 0, endMs: 1000, text: "Al" },
      { id: "s_new", startMs: 1000, endMs: 1000, text: "pha" },
      { id: "s2", startMs: 1000, endMs: 2000, text: "beta" },
    ])
    const merged = editorReducer(split, {
      type: "segments-merged",
      operationId: "op_merge",
      previousSegmentId: "s1",
      segmentId: "s_new",
    })
    expect(merged.present.segments[0]).toEqual({
      id: "s1",
      startMs: 0,
      endMs: 1000,
      text: "Al pha",
    })
    const draft = createEditorDraftPayload(merged, record.transcript!)
    expect(parseEditorDraftPayload(draft)).toEqual({ ok: true, value: draft })
    expect(commitEditorDraftPayload(draft)).toMatchObject({
      status: "canonical",
      payload: { text: "Al pha beta" },
    })
  })

  it.each(["a\r\nb", "a\nb", "a\rb", "a\u2028b", "a\u2029b"])(
    "splits multiline paste %j without inventing duration",
    (clipboard) => {
      const state = editorReducer(createEditorState(record), {
        type: "selection-replaced",
        operationId: "op_paste",
        selection: {
          anchor: { segmentId: "s1", offset: 1 },
          focus: { segmentId: "s1", offset: 4 },
        },
        text: clipboard,
        newSegmentIds: ["paste_1"],
      })
      expect(state.present.segments.slice(0, 2)).toEqual([
        { id: "s1", startMs: 0, endMs: 1000, text: "Aaa" },
        { id: "paste_1", startMs: 1000, endMs: 1000, text: "b" },
      ])
    },
  )

  it("merges a spanning selection before inserting text", () => {
    const state = editorReducer(createEditorState(record), {
      type: "selection-replaced",
      operationId: "op_range",
      selection: {
        anchor: { segmentId: "s1", offset: 2 },
        focus: { segmentId: "s2", offset: 2 },
      },
      text: "X",
      newSegmentIds: [],
    })
    expect(state.present.segments).toEqual([
      { id: "s1", startMs: 0, endMs: 2000, text: "AlXta" },
    ])
  })

  it("caps undo history at 100 and clears redo after a new edit", () => {
    let state = createEditorState(record)
    for (let index = 0; index < 101; index += 1) {
      state = editorReducer(state, {
        type: "title-changed",
        operationId: `op_${index}`,
        title: `Title ${index}`,
      })
    }
    expect(state.past).toHaveLength(100)
    state = editorReducer(state, { type: "undo" })
    expect(state.future).toHaveLength(1)
    state = editorReducer(state, {
      type: "title-changed",
      operationId: "op_final",
      title: "Final",
    })
    expect(state.future).toHaveLength(0)
  })

  it("emits a bounded scalar-safe draft without manufacturing canonical timing", () => {
    const state = editorReducer(createEditorState(record), {
      type: "timing-changed",
      operationId: "op_overlap",
      segmentId: "s2",
      startMs: 999.5,
      endMs: 604800001,
    })
    const draft = createEditorDraftPayload(state, record.transcript!)
    expect(parseEditorDraftPayload(draft)).toEqual({ ok: true, value: draft })
    expect(commitEditorDraftPayload(draft)).toEqual({
      status: "needs-attention",
      draft,
      issues: [
        { code: "draft.timing-not-integer", segmentId: "s2", segmentIndex: 1 },
        { code: "draft.timing-over-cap", segmentId: "s2", segmentIndex: 1 },
        { code: "draft.timing-overlap", segmentId: "s2", segmentIndex: 1 },
      ],
    })
  })
})
```

- [ ] **Step 2: Run the focused test and verify red (2 minutes)**

Run: `pnpm vitest run tests/unit/editor-reducer.test.ts`

Expected: exit 1; module resolution fails for `@/features/transcript-editor/reducer` before any assertion runs.

- [ ] **Step 3: Create the complete public type contract (5 minutes)**

Create `src/features/transcript-editor/types.ts` exactly as follows:

```ts
import type { ProductError, ProductIssue } from "@/app/copy"
import type { EditorDraftSegment } from "@/features/transcription/types"

export const EDITOR_HISTORY_LIMIT = 100
export const AUTOSAVE_DELAY_MS = 600
export const TIMELINE_VIRTUALIZATION_THRESHOLD = 500

export interface EditorSelectionPoint { segmentId: string; offset: number }
export interface EditorSelection { anchor: EditorSelectionPoint; focus: EditorSelectionPoint }
export interface EditorSnapshot {
  title: string
  segments: EditorDraftSegment[]
  selection: EditorSelection | null
}
export interface EditorState {
  present: EditorSnapshot
  past: EditorSnapshot[]
  future: EditorSnapshot[]
  revision: number
  durableRevision: number
  dirty: boolean
  saveState: "saved" | "dirty" | "saving" | "save-failed"
  issue: ProductIssue | ProductError | null
}
export type EditorAction =
  | { type: "title-changed"; operationId: string; title: string }
  | { type: "text-replaced"; operationId: string; selection: EditorSelection; text: string }
  | { type: "segment-split"; operationId: string; segmentId: string; offset: number; newSegmentId: string }
  | { type: "segments-merged"; operationId: string; previousSegmentId: string; segmentId: string }
  | { type: "multiline-pasted"; operationId: string; selection: EditorSelection; parts: string[]; newSegmentIds: string[] }
  | { type: "selection-replaced"; operationId: string; selection: EditorSelection; text: string; newSegmentIds: string[] }
  | { type: "timing-changed"; operationId: string; segmentId: string; startMs: number; endMs: number }
  | { type: "selection-changed"; selection: EditorSelection | null }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "save-started"; revision: number }
  | { type: "save-succeeded"; revision: number }
  | { type: "save-failed"; revision: number; error: ProductError }
  | { type: "durable-restored"; snapshot: EditorSnapshot; revision: number }

```

- [ ] **Step 4: Implement the pure reducer (5 minutes)**

Create `src/features/transcript-editor/reducer.ts`. Implement exactly these exported functions with no side effects: `createEditorState(record)`, `editorReducer(state, action)`, and `createEditorDraftPayload(state, base)`. Use `normalizeSegmentText` and `canonicalizeTitle` from Phase 1B. `EditorSnapshot.segments` is `EditorDraftSegment[]`, never `CanonicalSegment[]`. Validate offsets against JavaScript string length; reject malformed Unicode scalars, scalar/UTF-8/count/ID bound violations, missing IDs, duplicate new IDs, wrong new-ID counts, empty documents, non-finite timing, timing whose absolute value exceeds `Number.MAX_SAFE_INTEGER`, unsafe revision increments, and structural shape failures by returning unchanged state. Do not reject non-integer, negative, over-seven-day, reversed, or overlapping bounded timing: those values are valid draft state and must survive undo, autosave, and refresh. Order selection endpoints by segment index then offset. Spanning replacement keeps earlier segment ID/start, takes later segment end, removes fully covered segments, and inserts normalized boundary text before splitting paste parts. The reducer emits only bounded scalar-safe draft state; it does not call `commitEditorDraftPayload()` or infer canonical status.

`createEditorDraftPayload` returns the exact `EditorDraftPayload` allowlist `{title,sourceName,language,modelId,mode,createdAt,segments}` with cloned `EditorDraftSegment` values and no independent `text`. It must pass `parseEditorDraftPayload`; it never calls `validateCanonicalTranscriptPayload`, derives a canonical payload, hashes, or decides sync eligibility. Every canonical decision calls `commitEditorDraftPayload(draft)` and branches on its `CanonicalCommitResult.status`; no parallel timing predicate or eligibility boolean exists.

Use this exact mutation wrapper so history/save behavior cannot diverge between actions:

```ts
function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    title: snapshot.title,
    segments: snapshot.segments.map((segment) => ({ ...segment })),
    selection: snapshot.selection === null
      ? null
      : {
          anchor: { ...snapshot.selection.anchor },
          focus: { ...snapshot.selection.focus },
        },
  }
}

function snapshotEqual(left: EditorSnapshot, right: EditorSnapshot): boolean {
  if (left.title !== right.title || left.segments.length !== right.segments.length) return false
  const selectionEqual = left.selection === null
    ? right.selection === null
    : right.selection !== null
      && left.selection.anchor.segmentId === right.selection.anchor.segmentId
      && left.selection.anchor.offset === right.selection.anchor.offset
      && left.selection.focus.segmentId === right.selection.focus.segmentId
      && left.selection.focus.offset === right.selection.focus.offset
  if (!selectionEqual) return false
  return left.segments.every((segment, index) => {
    const other = right.segments[index]
    return segment.id === other.id
      && segment.startMs === other.startMs
      && segment.endMs === other.endMs
      && segment.text === other.text
  })
}

function commit(state: EditorState, next: EditorSnapshot): EditorState {
  if (snapshotEqual(state.present, next)) return state
  const past = [...state.past, cloneSnapshot(state.present)].slice(-EDITOR_HISTORY_LIMIT)
  return {
    ...state,
    present: next,
    past,
    future: [],
    revision: state.revision + 1,
    dirty: true,
    saveState: "dirty",
    issue: null,
  }
}
```

The reducer's `revision` is the editor/draft revision; `durableRevision` is the latest locally persisted editor/draft revision. Neither is the canonical `TranscriptRecord.revision`. Save actions update only draft save metadata. The autosave boundary maps `CanonicalCommitResult.status === "needs-attention"` issues to one account-neutral `ProductIssue`; the reducer never duplicates canonical commit logic. `save-succeeded` sets `durableRevision = Math.max(state.durableRevision, action.revision)` and remains dirty when `state.revision > action.revision`. It may clear dirty after a successful draft-only persistence even though canonical transcript revision did not change. `durable-restored` clears both history arrays and sets present/revision/durableRevision to supplied durable draft state.

- [ ] **Step 5: Run reducer tests and adjacent canonical tests (3 minutes)**

Run: `pnpm vitest run tests/unit/editor-reducer.test.ts tests/unit/canonical.test.ts tests/unit/schema-hashes.test.ts`

Expected: exit 0; all selected tests pass. No snapshot contains independent `text`; no test observes reducer-generated IDs.

- [ ] **Step 6: Stage and commit the reducer slice (2 minutes)**

Run:

```bash
git add src/features/transcript-editor/types.ts src/features/transcript-editor/reducer.ts tests/unit/editor-reducer.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(editor): add bounded draft reducer"
```

Expected staged names: exactly the three listed paths. Expected commit: created with subject `feat(editor): add bounded draft reducer`.

## Task 2: Replace exports with discriminated draft/canonical policy and exact bytes

**Files:**
- Modify: `src/features/transcription/exports.ts:1-71`
- Modify: `tests/unit/exports.test.ts:1-end`
- Modify: `tests/unit/editor-reducer.test.ts:canonical/needs-attention export boundary assertions`

- [ ] **Step 1: Replace export tests with EDIT-01/03/04 fixtures (5 minutes)**

Replace `tests/unit/exports.test.ts` fixtures and explicitly append to `tests/unit/editor-reducer.test.ts` one integration assertion that passes the reducer's existing canonical result and existing Needs-attention result into `serializeTranscript`: canonical JSON is available, Needs-attention TXT is available, and Needs-attention JSON/SRT/VTT each return `invalid-timing`. Test these exact outcomes against `CanonicalCommitResult`: TXT derives normalized text from either discriminant; a Needs-attention draft makes JSON/SRT/VTT unavailable with `invalid-timing`; canonical JSON equals Phase 1B RFC 8785 canonical payload bytes; SRT/VTT format integer milliseconds without floating conversion; valid empty cues are omitted and numbering closes gaps; an invalid empty cue blocks subtitles before omission; all-valid empty cues return `no-non-empty-cues`; seven-day endpoint formats as `168:00:00.000`; filename uses result metadata; `TextEncoder().encode(content)` equals returned bytes. Assert draft JSON never serializes and canonicalizer/hash spies remain untouched for Needs-attention input.

- [ ] **Step 2: Run export tests and verify red (2 minutes)**

Run: `pnpm vitest run tests/unit/exports.test.ts`

Expected: exit 1; old `TranscriptDocument` API reads second-based timing and cannot return eligibility or canonical bytes.

- [ ] **Step 3: Replace `exports.ts` completely (5 minutes)**

Use this public API:

```ts
import canonicalize from "canonicalize"
import { deriveTranscriptText } from "@/features/transcription/canonical"
import { validateCanonicalTranscriptPayload } from "@/features/transcription/schema"
import type { CanonicalCommitResult } from "./types"

export type ExportFormat = "txt" | "json" | "srt" | "vtt"
export type ExportUnavailableReason = "invalid-timing" | "no-non-empty-cues"
export type ExportResult =
  | { available: true; content: string; bytes: Uint8Array; mimeType: string }
  | { available: false; reason: ExportUnavailableReason }

export function buildExportFileName(result: CanonicalCommitResult, format: ExportFormat): string
export function serializeTranscript(result: CanonicalCommitResult, format: ExportFormat): ExportResult
export function downloadTranscript(result: CanonicalCommitResult, format: ExportFormat): ExportResult
```

Implementation rules:

1. TXT selects `result.payload.segments` for `canonical` or `result.draft.segments` for `needs-attention`, normalizes through the Phase 1B segment-text function, and derives text without creating a canonical payload. TXT remains available when only timing is invalid.
2. JSON/SRT/VTT return `{available:false,reason:"invalid-timing"}` immediately for `status:"needs-attention"`. They never serialize the draft, invoke RFC 8785, hash, mutate a transcript, or enqueue sync.
3. For `status:"canonical"`, validate `result.payload` through `validateCanonicalTranscriptPayload`. JSON content is `canonicalize(validatedPayload)`. Throw `Error("canonical-json-failed")` only if the package returns `undefined` after validated input.
4. Subtitle validation defensively checks safe integers, `0..604800000`, `endMs >= startMs`, and forward non-overlap across every canonical segment. Return `invalid-timing` before filtering empty cues.
5. Omit cues whose canonical normalized text is empty. Return `no-non-empty-cues` if none remain.
6. Format milliseconds with integer division: hours may exceed two digits; minutes/seconds are two digits; milliseconds three digits. SRT separator is comma; VTT separator is period.
7. `bytes` is exactly `new TextEncoder().encode(content)`. Blob construction uses those bytes, never reserializes content. JSON MIME is `application/json;charset=utf-8`; VTT is `text/vtt;charset=utf-8`; SRT is `application/x-subrip;charset=utf-8`; TXT is `text/plain;charset=utf-8`.
8. `downloadTranscript` returns unavailable results without creating a URL. For available output, create Blob from `[result.bytes]`, click one detached anchor, revoke URL, and return same result.

- [ ] **Step 4: Run canonical byte tests (3 minutes)**

Run: `pnpm vitest run tests/unit/exports.test.ts tests/unit/editor-reducer.test.ts tests/unit/schema-hashes.test.ts`

Expected: exit 0; EDIT-01/03/04 export assertions pass and pinned canonical JSON bytes remain unchanged.

- [ ] **Step 5: Stage and commit exports (2 minutes)**

```bash
git add src/features/transcription/exports.ts tests/unit/exports.test.ts tests/unit/editor-reducer.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(editor): export canonical transcript bytes"
```

Expected: only three listed paths staged; commit succeeds.

## Task 3: Add incremental search with 8 ms scheduler and fallback

**Files:**
- Create: `src/features/transcript-editor/search.ts`
- Create: `tests/unit/editor-search.test.ts`

- [ ] **Step 1: Write failing EDIT-02 and PERF-03 search tests (5 minutes)**

Cover array-order/offset order, default case-insensitivity, next/previous wrapping, preserved active `{segmentId,offset}` after unrelated mutation, deterministic first match at/after mutation when active text disappears, no-result state, scheduler-yield use, idle-callback use when scheduler is absent, and `setTimeout(0)` fallback when both are absent. Inject a deterministic monotonic clock whose samples cross 8 ms; assert large work spans at least two tasks.

- [ ] **Step 2: Run and verify red (2 minutes)**

Run: `pnpm vitest run tests/unit/editor-search.test.ts`

Expected: exit 1; `search.ts` is missing.

- [ ] **Step 3: Create complete search API and implementation (5 minutes)**

```ts
import type { EditorDraftSegment } from "@/features/transcription/types"

export const WORK_YIELD_BUDGET_MS = 8
export interface SearchMatch { segmentId: string; offset: number; length: number }
export interface SearchIndex { query: string; matches: SearchMatch[] }
export interface WorkScheduler {
  now(): number
  yield(): Promise<void>
}
export interface IdleScheduler {
  requestIdleCallback?: (callback: IdleRequestCallback) => number
  setTimeout: typeof window.setTimeout
}
export interface BrowserWorkSchedulerCapabilities {
  now: () => number
  schedulerYield?: () => Promise<void>
  idle: IdleScheduler
}
export function browserWorkSchedulerCapabilities(browserWindow: Window): BrowserWorkSchedulerCapabilities {
  const schedulerHost = browserWindow as Window & {
    scheduler?: { yield?: () => Promise<void> }
  }
  const idleHost = browserWindow as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback) => number
  }
  const scheduler = schedulerHost.scheduler
  const schedulerYield = scheduler?.yield?.bind(scheduler)
  const requestIdleCallback = idleHost.requestIdleCallback?.bind(browserWindow)
  return {
    now: () => browserWindow.performance.now(),
    ...(schedulerYield ? { schedulerYield } : {}),
    idle: {
      setTimeout: browserWindow.setTimeout.bind(browserWindow),
      ...(requestIdleCallback ? { requestIdleCallback } : {}),
    },
  }
}
export function createBrowserWorkScheduler(
  capabilities: BrowserWorkSchedulerCapabilities,
): WorkScheduler {
  return {
    now: capabilities.now,
    async yield() {
      if (capabilities.schedulerYield) {
        await capabilities.schedulerYield()
        return
      }
      const requestIdleCallback = capabilities.idle.requestIdleCallback
      if (requestIdleCallback) {
        await new Promise<void>((resolve) => {
          requestIdleCallback(() => resolve())
        })
        return
      }
      await new Promise<void>((resolve) => {
        capabilities.idle.setTimeout(resolve, 0)
      })
    },
  }
}
export async function buildSearchIndex(segments: readonly EditorDraftSegment[], query: string, scheduler: WorkScheduler): Promise<SearchIndex>
export function moveSearchMatch(index: SearchIndex, current: SearchMatch | null, direction: "next" | "previous"): SearchMatch | null
export function reconcileActiveMatch(previous: SearchMatch | null, index: SearchIndex, mutated: { segmentId: string; offset: number }): SearchMatch | null
```

Production calls `createBrowserWorkScheduler(browserWorkSchedulerCapabilities(window))`. No interface extends `Window` or weakens a platform member to optional. The boundary performs the two narrow capability casts once, binds host methods, and returns a pure injectable object. Tests pass literal `BrowserWorkSchedulerCapabilities` objects and never cast a fake object to `Window`. Yield precedence: injected `schedulerYield`, then one `requestIdleCallback`, then `setTimeout(resolve, 0)`. Tests cover all three paths under strict TypeScript, including absent optional capabilities, and prove callbacks resolve once. `buildSearchIndex` lowercases query and segment text with `toLocaleLowerCase("und")`, scans overlapping occurrences by advancing one UTF-16 code unit, and yields whenever `scheduler.now() - chunkStartedAt >= 8`. Empty query returns no matches without yielding. Ignore stale async results in React by comparing a monotonically increasing request token before state update.

- [ ] **Step 4: Run search suite (3 minutes)**

Run: `pnpm vitest run tests/unit/editor-search.test.ts`

Expected: exit 0; scheduler and fallback cases each report multiple work turns; no-result result is `{query, matches: []}`.

- [ ] **Step 5: Stage and commit search (2 minutes)**

```bash
git add src/features/transcript-editor/search.ts tests/unit/editor-search.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(editor): add incremental transcript search"
```

Expected: exactly two paths staged; commit succeeds.

## Task 4: Add 600 ms serialized autosave and dirty navigation guard

**Files:**
- Create: `src/features/transcript-editor/autosave.ts`
- Create: `tests/components/transcript-editor.test.tsx`
- Read/verify: `src/app/navigation.ts:1-end`; use its frozen `setGuard` API
- Modify: `tests/components/navigation.test.tsx:1-end`

- [ ] **Step 1: Write failing SAVE-01..03 component/controller tests (5 minutes)**

Use fake timers, repository spies, a Phase 4 `desiredPublicationFor = vi.fn(async () => null)`, and a deferred first repository promise. Assert: no save at 599 ms; one save at 600 ms; edits during first save do not start a second flight; completion starts one save for newest desired editor revision; intermediate editor revisions are skipped; success at an older editor revision remains dirty; canonical transcript revision and durable editor revision are tracked separately; refresh loads a newer durable draft over its unchanged base transcript; invalid timing survives refresh and still reports Needs attention; correction commits canonically. For Needs-attention input, assert exactly one `persistDraftOnly` call and zero `desiredPublicationFor`, `commitCanonicalDraftAndCoalescePending`, transcript writes, hash calls, sync-metadata writes, or pending-operation writes. For canonical success, assert `desiredPublicationFor` receives the exact deterministic next envelope once and exactly one `commitCanonicalDraftAndCoalescePending` call receives matching expected transcript/draft revisions plus its null result, then transcript revision advances. Also cover app navigation wait; failure Retry/Discard; Back/Forward replay; lifecycle best effort; conditional `beforeunload`; and incoming candidates never overwriting dirty editor state.

SAVE-02 browser failure uses one exact test-only repository port, never an unused global:

```ts
import type {
  RepositoryFailurePort,
  RepositoryFactoryOptions,
  RepositoryFixtureMethod,
} from "@/features/storage/repositories"

declare global {
  interface Window {
    __WHISDOM_REPOSITORY_FIXTURE__?: {
      version: 1
      failNext: RepositoryFixtureMethod | null
      consumed: RepositoryFixtureMethod[]
    }
  }
}
```

Phase 1B already implements `createStorageRepositories(db, { failurePort })`, including the guarded test/dev global adapter and production ignore behavior. Phase 4 only supplies/consumes that seam. `seedTranscript(...,{saveFails:true})` installs `{version:1,failNext:"commitCanonicalDraftAndCoalescePending",consumed:[]}` before bootstrap. SAVE-02 asserts the intended method was consumed once, no durable write occurred, Retry/Discard behavior is exact, then deletes the property in `finally`. `saveFails:false` deletes it. Do not add a factory test here; Phase 1 owns factory injection tests.

Use this complete SAVE-01 discriminated-persistence fixture in `tests/components/transcript-editor.test.tsx`; the debounce/coalescing, navigation, lifecycle, and failure cases in the same file reuse these exact records and repository method names:

```ts
import { act } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { createAutosaveController } from "@/features/transcript-editor/autosave"
import { commitEditorDraftPayload, parseEditorDraftPayload } from "@/features/transcription/canonical"
import type { DraftRecord } from "@/features/storage/repositories"
import type { EditorDraftPayload, TranscriptRecord } from "@/features/transcription/types"

const transcript: TranscriptRecord = {
  id: "tr_editor",
  revision: 7,
  updatedAt: 1785283200000,
  deletedAt: null,
  deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA",
  deletionId: null,
  restoredFromDeletionId: null,
  localIssueCode: null,
  transcript: {
    title: "Research call",
    sourceName: "call.wav",
    language: "en",
    modelId: "Xenova/whisper-base",
    mode: "local-webgpu",
    createdAt: 1785283200000,
    text: "Alpha beta",
    segments: [
      { id: "s1", startMs: 0, endMs: 1000, text: "Alpha" },
      { id: "s2", startMs: 1000, endMs: 2000, text: "beta" },
    ],
  },
}

function makeDraft(editorRevision: number, segments: EditorDraftPayload["segments"]): DraftRecord {
  return {
    transcriptId: transcript.id,
    baseRevision: transcript.revision,
    editorRevision,
    draft: {
      title: transcript.transcript!.title,
      sourceName: transcript.transcript!.sourceName,
      language: transcript.transcript!.language,
      modelId: transcript.transcript!.modelId,
      mode: transcript.transcript!.mode,
      createdAt: transcript.transcript!.createdAt,
      segments,
    },
    dirty: true,
    saveState: "dirty",
    updatedAt: 1785283200100 + editorRevision,
  }
}

describe("SAVE-01 discriminated draft persistence", () => {
  it("persists invalid timing as draft-only, restores it, then commits only corrected canonical success", async () => {
    const invalid = makeDraft(8, [
      { id: "s1", startMs: 0, endMs: 1000, text: "Alpha" },
      { id: "s2", startMs: 999.5, endMs: 604800001, text: "beta" },
    ])
    expect(parseEditorDraftPayload(invalid.draft)).toEqual({ ok: true, value: invalid.draft })
    expect(commitEditorDraftPayload(invalid.draft).status).toBe("needs-attention")

    const persistDraftOnly = vi.fn().mockResolvedValue({ ok: true, value: invalid })
    const commitCanonicalDraftAndCoalescePending = vi.fn().mockImplementation(async ({ mutation }) => ({
      ok: true,
      value: {
        ...transcript,
        revision: 8,
        updatedAt: mutation.updatedAt,
        transcript: mutation.payload,
      },
    }))
    const discardDraft = vi.fn().mockResolvedValue({ ok: true, value: null })
    const desiredPublicationFor = vi.fn(async () => null)
    const port = {
      getTranscript: vi.fn().mockResolvedValue(transcript),
      getDraft: vi.fn().mockResolvedValue(invalid),
      mutations: {
        persistDraftOnly,
        commitCanonicalDraftAndCoalescePending,
        discardDraft,
      },
    }
    const controller = createAutosaveController({
      transcriptId: transcript.id,
      initialCanonicalTranscriptRevision: transcript.revision,
      initialDurableEditorRevision: 0,
      port,
      desiredPublicationFor,
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
      replayIntent: vi.fn().mockResolvedValue(undefined),
    })

    controller.changed({ draft: invalid, restoredFromDeletionId: null })
    await act(async () => { await controller.flush() })

    expect(persistDraftOnly).toHaveBeenCalledWith({
      draft: invalid,
      expectedDraftEditorRevision: null,
    })
    expect(commitCanonicalDraftAndCoalescePending).not.toHaveBeenCalled()
    expect(desiredPublicationFor).not.toHaveBeenCalled()
    expect(controller.getSnapshot()).toMatchObject({
      durableEditorRevision: 8,
      canonicalTranscriptRevision: 7,
      needsAttention: true,
      state: "saved",
    })

    const refreshedTranscript = await port.getTranscript(transcript.id)
    const refreshedDraft = await port.getDraft(transcript.id)
    expect(refreshedTranscript).toEqual(transcript)
    expect(refreshedDraft).toEqual(invalid)
    expect(commitEditorDraftPayload(refreshedDraft!.draft).status).toBe("needs-attention")

    const corrected = makeDraft(9, [
      { id: "s1", startMs: 0, endMs: 1000, text: "Alpha" },
      { id: "s2", startMs: 1000, endMs: 2000, text: "beta" },
    ])
    const correctedCommit = commitEditorDraftPayload(corrected.draft)
    expect(correctedCommit.status).toBe("canonical")

    controller.changed({ draft: corrected, restoredFromDeletionId: null })
    await act(async () => { await controller.flush() })

    if (correctedCommit.status !== "canonical") throw new Error("expected-canonical-fixture")
    expect(desiredPublicationFor).toHaveBeenCalledOnce()
    expect(desiredPublicationFor).toHaveBeenCalledWith({
      schemaVersion: 2,
      transcriptId: transcript.id,
      revision: 8,
      updatedAt: corrected.updatedAt,
      deletedAt: null,
      deviceId: transcript.deviceId,
      deletionId: null,
      restoredFromDeletionId: null,
      transcript: correctedCommit.payload,
    })
    expect(commitCanonicalDraftAndCoalescePending).toHaveBeenCalledWith({
      draft: corrected,
      mutation: {
        transcriptId: transcript.id,
        updatedAt: corrected.updatedAt,
        payload: correctedCommit.payload,
        restoredFromDeletionId: null,
      },
      expectedTranscriptRevision: 7,
      expectedDraftEditorRevision: 8,
      desiredPublication: null,
    })
    expect(persistDraftOnly).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot()).toMatchObject({
      durableEditorRevision: 9,
      canonicalTranscriptRevision: 8,
      needsAttention: false,
      state: "saved",
    })
    controller.dispose()
  })
})
```

- [ ] **Step 2: Run SAVE tests and verify red (2 minutes)**

Run: `pnpm vitest run tests/components/transcript-editor.test.tsx tests/components/navigation.test.tsx`

Expected: exit 1; autosave controller import is missing or navigation guard assertions fail.

- [ ] **Step 3: Create the autosave controller contract (5 minutes)**

```ts
import type { NavigationGuard, NavigationGuardDecision, NavigationIntent } from "@/app/navigation"
import type {
  AtomicMutationRepository,
  DraftRecord,
} from "@/features/storage/repositories"
import type { PendingDesiredPublication } from "@/features/storage/sync-types"
import type { TranscriptEnvelope, TranscriptRecord } from "@/features/transcription/types"

export interface SaveCandidate {
  draft: DraftRecord
  restoredFromDeletionId: string | null
}
export interface AutosavePort {
  getTranscript(transcriptId: string): Promise<TranscriptRecord | null>
  getDraft(transcriptId: string): Promise<DraftRecord | null>
  mutations: Pick<
    AtomicMutationRepository,
    "persistDraftOnly" | "commitCanonicalDraftAndCoalescePending" | "discardDraft"
  >
}
export interface AutosaveSnapshot {
  desiredEditorRevision: number | null
  durableEditorRevision: number
  canonicalTranscriptRevision: number
  inFlightEditorRevision: number | null
  state: "saved" | "dirty" | "saving" | "save-failed"
  needsAttention: boolean
  error: unknown | null
}
export interface AutosaveController {
  getSnapshot(): AutosaveSnapshot
  subscribe(listener: () => void): () => void
  changed(candidate: SaveCandidate): void
  flush(): Promise<void>
  retry(): Promise<void>
  discard(): Promise<TranscriptRecord>
  createNavigationGuard(onDiscarded: (record: TranscriptRecord) => void): NavigationGuard
  attachLifecycle(window: Window, document: Document): () => void
  dispose(): void
}
export function createAutosaveController(args: {
  transcriptId: string
  initialCanonicalTranscriptRevision: number
  initialDurableEditorRevision: number
  port: AutosavePort
  desiredPublicationFor(envelope: TranscriptEnvelope): Promise<PendingDesiredPublication | null>
  setTimeout: Window["setTimeout"]
  clearTimeout: Window["clearTimeout"]
  replayIntent(intent: NavigationIntent): Promise<void>
}): AutosaveController
```

- [ ] **Step 4: Implement one-flight/coalescing behavior (5 minutes)**

Keep exactly one mutable `desired: SaveCandidate | null`, one `inFlight: Promise<void> | null`, one debounce handle, and one immutable listener set. `TranscriptPage` creates each exact `DraftRecord` as `{ transcriptId, baseRevision: canonicalTranscriptRevision, editorRevision: state.revision, draft: createEditorDraftPayload(state, basePayload), dirty: true, saveState: "dirty", updatedAt }`; `baseRevision` changes only after canonical success advances the transcript revision. `changed` first requires `parseEditorDraftPayload(candidate.draft.draft).ok`, replaces `desired`, sets dirty, and rearms 600 ms; it does not start an untracked repository write. `flush` clears debounce and loops while newest `draft.editorRevision` exceeds `durableEditorRevision`: capture newest desired; set saving/in-flight editor revision; call `commitEditorDraftPayload(captured.draft.draft)` exactly once; branch only on returned `CanonicalCommitResult.status`. `durableEditorRevision` is the `DraftRecord.editorRevision`; `canonicalTranscriptRevision` is the `TranscriptRecord.revision`. Never compare or overwrite these revisions as if they were one counter.

For `status:"needs-attention"`, call only:

```ts
await port.mutations.persistDraftOnly({
  draft: captured.draft,
  expectedDraftEditorRevision: durableEditorRevision === 0 ? null : durableEditorRevision,
})
```

On success, advance only `durableEditorRevision`, set `needsAttention:true`, retain deterministic commit issues for `editor.invalid-timing`, and mark saved locally when no newer desired editor revision exists. Do not update `canonicalTranscriptRevision`, `TranscriptRecord`, payload hash, sync metadata, or pending operations. Do not call `validateCanonicalTranscriptPayload` or manufacture partial canonical data.

For `status:"canonical"`, construct `nextEnvelope` exactly from the current parsed `TranscriptRecord` plus `revision: canonicalTranscriptRevision + 1`, captured update/payload/restore values, and the schema-2 live-lineage rules; parse it through `parseTranscriptEnvelope`, then call only:

```ts
const desiredPublication = await args.desiredPublicationFor(nextEnvelope)
await port.mutations.commitCanonicalDraftAndCoalescePending({
  draft: captured.draft,
  mutation: {
    transcriptId: captured.draft.transcriptId,
    updatedAt: captured.draft.updatedAt,
    payload: commit.payload,
    restoredFromDeletionId: captured.restoredFromDeletionId,
  },
  expectedTranscriptRevision: canonicalTranscriptRevision,
  expectedDraftEditorRevision: durableEditorRevision,
  desiredPublication,
})
```

On success, advance `canonicalTranscriptRevision` from returned `TranscriptRecord.revision`, advance `durableEditorRevision` to captured draft editor revision, clear Needs attention, and mark saved only when no newer desired exists. This discriminated canonical branch is the only Phase 4 autosave path allowed to invoke `desiredPublicationFor`, update the transcript/hash, or coalesce a pending publication. Phase 4's injected callback resolves null; Phase 5 replaces only that dependency with its account-bound implementation. Repository `RepositoryResult.ok === false` becomes save-failed without advancing either revision.

Calls to `flush` during a flight await same promise. No recursion, parallel repository call, boolean canonical-eligibility flag, or payload-independent timing predicate exists. Refresh loads transcript and draft concurrently, accepts draft only through `parseEditorDraftPayload`, and restores it when its `baseRevision` equals current transcript revision and its `editorRevision` is durable. Run `commitEditorDraftPayload` after restoration: a Needs-attention result restores exact draft timing and issue while canonical transcript/hash/pending state remains unchanged; a canonical result is passed to the same canonical autosave branch rather than applied by the refresh loader. A stale-base draft is never silently applied. A canonical success advances `TranscriptRecord.revision` and the durable draft revision together through `commitCanonicalDraftAndCoalescePending`; a draft-only success advances only `DraftRecord.editorRevision`.

The guard must behave exactly:

```ts
async function check(intent: NavigationIntent): Promise<NavigationGuardDecision> {
  if (snapshot.state === "saved") return { status: "allowed" }
  try {
    await flush()
    if (snapshot.state === "saved") return { status: "allowed" }
  } catch {
    // snapshot already carries the failure
  }
  return {
    status: "blocked",
    reason: snapshot.state === "saving" ? "saving" : snapshot.state === "save-failed" ? "save-failed" : "dirty",
    retry: async () => { await retry(); await args.replayIntent(intent) },
    discard: async () => { const record = await discard(); onDiscarded(record); await args.replayIntent(intent) },
  }
}
```

For pop intents, `args.replayIntent` makes the Phase 1B navigator immediately replace the current editor history index before showing the blocked UI, then replays the captured destination index under one boolean `replayingPop` guard. Push intents never mutate URL before `allowed`.

Lifecycle behavior: hidden visibility and pagehide call `void flush()`; beforeunload is registered only while state is dirty/saving/save-failed, calls `preventDefault()`, and sets `returnValue = ""`; cleanup removes all three listeners. Copy says persistence is best effort and never promises unload completion.

- [ ] **Step 5: Consume the frozen Phase 1B navigator guard API (5 minutes)**

Phase 1B already exports this exact frozen interface and one mutable active guard registration; Phase 4 must not add or change it:

```ts
export interface AppNavigator {
  current(): AppRoute
  navigate(route: AppRoute): Promise<NavigationGuardDecision>
  replace(route: AppRoute): void
  setGuard(guard: NavigationGuard | null): void
  subscribe(listener: (route: AppRoute) => void): () => void
  dispose(): void
}
```

The transcript page registers its autosave guard on mount and clears that exact guard on unmount. Unknown/missing transcript IDs still show not-found and do not register a guard.

- [ ] **Step 6: Run SAVE and NAV focused suites (3 minutes)**

Run: `pnpm vitest run tests/components/transcript-editor.test.tsx tests/components/navigation.test.tsx`

Expected: exit 0; SAVE-01..03 and NAV-01 dirty cases pass; deferred repository fixture records maximum concurrency 1.

- [ ] **Step 7: Stage and commit autosave protection (2 minutes)**

```bash
git add src/features/transcript-editor/autosave.ts tests/components/transcript-editor.test.tsx tests/components/navigation.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "feat(editor): protect serialized autosave"
```

Expected: exactly three paths staged; `src/app/navigation.ts` remains byte-for-byte unchanged; commit succeeds.

## Task 5: Build full-page Document and Timeline editor views

**Files:**
- Create: `src/features/transcript-editor/copy.ts`
- Create: `src/features/transcript-editor/DocumentView.tsx`
- Create: `src/features/transcript-editor/TimelineView.tsx`
- Replace: `src/features/transcript-editor/TranscriptPage.tsx:1-end` (Phase 1 placeholder)
- Modify: `src/app/AppShell.tsx:1-end` route import table only
- Modify: `tests/components/transcript-editor.test.tsx`

- [ ] **Step 1: Add failing component tests for EDIT-01/02/04 and A11Y editor behavior (5 minutes)**

Assert one visible `h1`; full page rather than dialog; Document/Timeline `tablist`, `tab`, and `tabpanel`; segment-backed text controls; Enter split; Backspace-at-start merge; multiline paste with caller IDs; Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z; search focus/count/current/no-result polite live status; exact millisecond timeline controls; invalid timing focused recovery; TXT remains enabled while JSON/SRT/VTT are blocked; >500 render-capable rows virtualize while exactly 500 do not; mobile controls wrap with 44 px targets; active field and save/error status remain visible; route heading receives focus.

- [ ] **Step 2: Run component tests and verify red (2 minutes)**

Run: `pnpm vitest run tests/components/transcript-editor.test.tsx`

Expected: exit 1; editor page/view modules are missing.

- [ ] **Step 3: Add compile-time equal EN/VI editor copy (5 minutes)**

Create `src/features/transcript-editor/copy.ts` with `defineCopy`, `CopyParams`, and `InterfaceLanguage` imported only from `@/app/copy-types`; never import `@/app/copy`. Include full-message keys for page title, Document, Timeline, search label/placeholder, result count/current, no results, Saved locally, Saving, Synced slot, Needs attention, Retry, Discard, Copy, copied confirmation, export labels, invalid timing, no non-empty subtitle cues, transcript not found, Back to Library, title label, start/end/text labels, segment position/timestamp context, undo, redo, split, merge, and unload best-effort note. Components consume only these keys; no hardcoded user-facing English or Vietnamese remains. Task 5 tests import `EDITOR_COPY` directly from this feature module; registry registration waits until Task 8, when both Phase 4 feature modules exist.

- [ ] **Step 4: Implement `DocumentView.tsx` (5 minutes)**

Props include `state`, `dispatch`, `allocateId: () => string`, localized copy, active search match, and `onSearchMatchMounted`. Render one controlled `<textarea rows={1}>` per segment in array order inside prose typography with 60–75 character line length. Timestamp chrome is visually secondary and uses `<time>` text. Preserve native selection on change. Enter without modifiers prevents default and dispatches `segment-split` with one operation ID and one new segment ID. Backspace at offset zero dispatches `segments-merged` when a previous segment exists. Paste reads `text/plain`; multiline dispatches `selection-replaced` with one preallocated ID per extra part. A document selection bridge maps DOM segment/offset endpoints; cross-segment Delete/Backspace dispatches one `selection-replaced` with empty text. Toolbar buttons provide keyboard alternatives for split and merge. Every segment control label includes one-based position and timestamp context.

- [ ] **Step 5: Implement `TimelineView.tsx` (5 minutes)**

Use `@tanstack/react-virtual` only when `segments.length > 500`; at 500 render all rows. Each row has controlled integer-millisecond start/end inputs and text input. Parse with `/^(0|[1-9]\d*)$/`, `Number`, and `Number.isSafeInteger`; invalid syntax dispatches an account-neutral local invalid value represented by the input's local string until blur, then focuses the field and exposes `editor.invalid-timing` without clamping. Valid numbers dispatch `timing-changed`. Virtual rows use stable segment IDs as keys, overscan 8, semantic list/listitem wrappers, and roving focus restoration by segment ID after scroll. Search navigation calls `virtualizer.scrollToIndex(index,{align:"center"})`, then focuses the mounted segment control without animated scrolling when reduced motion is active.

- [ ] **Step 6: Implement `TranscriptPage.tsx` (5 minutes)**

Load `route.transcriptId` from `repositories.transcripts.get` before editable render. Render localized pending state during load. Missing/deleted/null-payload record renders one `h1`, not-found text, and Back to Library. Live records create reducer and autosave controller once per transcript ID. Header contains title edit, source metadata, local/sync textual slot, search, copy, export, and visible overflow actions. Tabs switch presentation only and never parse/rebuild text. Search uses Task 3 request tokens. Copy defaults to `deriveTranscriptText(state.present.segments)`. Export buttons use Task 2 availability; unavailable SRT/VTT show the exact localized reason. Save status is `aria-live="polite"`; blocking save failure uses the shared singular error panel. Register autosave navigation/lifecycle guards and remove them on unmount. On route change focus the `h1` with temporary `tabIndex={-1}`. At mobile widths keep natural page height, sticky textual save state above safe area, and no nested fixed-height panes.

Runtime result handoff creates the initial payload only through Phase 1B normalization/repository path. Do not add a second runtime save path in this page.

- [ ] **Step 7: Lazy-load the transcript route (3 minutes)**

In `src/app/AppShell.tsx`, add:

```ts
const TranscriptPage = lazy(() => import("@/features/transcript-editor/TranscriptPage"))
```

Render it only for `{view:"transcript"}` inside the existing localized `RoutePending`. Do not import editor modules from Workbench, header, navigation, or Library route entry.

- [ ] **Step 8: Run editor components, typecheck, and build chunk check (5 minutes)**

Run:

```bash
pnpm vitest run tests/components/transcript-editor.test.tsx
pnpm typecheck
pnpm build
```

Expected: all commands exit 0; component tests pass; build emits a distinct transcript-editor route chunk and Workbench entry has no static import of `TranscriptPage`, `DocumentView`, `TimelineView`, or editor search.

- [ ] **Step 9: Stage and commit workspace UI (2 minutes)**

```bash
git add src/features/transcript-editor/copy.ts src/features/transcript-editor/DocumentView.tsx src/features/transcript-editor/TimelineView.tsx src/features/transcript-editor/TranscriptPage.tsx src/app/AppShell.tsx tests/components/transcript-editor.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "feat(editor): add draft-backed transcript workspace"
```

Expected: exactly six paths staged; commit succeeds with subject `feat(editor): add draft-backed transcript workspace`.

## Task 6: Add deterministic Library queries and 1,000-row fixture

**Files:**
- Create: `src/features/library/queries.ts`
- Create: `tests/unit/library.test.ts`
- Create: `tests/e2e/fixtures/performance.ts`

- [ ] **Step 1: Write failing LIB-01/PERF-03 query tests (5 minutes)**

Test title/source/text search, Vietnamese diacritic-insensitive discovery (`"nghien cuu"` finds `"Nghiên cứu"`), display preservation, filters `all|local-only|pending|syncing|synced|needs-attention|deleted`, deterministic updated-desc/ID-asc tie order, tombstone exclusion from default results, 1,000-row output stability, and 8 ms scheduler/fallback yields.

- [ ] **Step 2: Run and verify red (2 minutes)**

Run: `pnpm vitest run tests/unit/library.test.ts`

Expected: exit 1; Library query module is missing.

- [ ] **Step 3: Create complete query API (5 minutes)**

```ts
import type { TranscriptRecord } from "@/features/transcription/types"
import type { WorkScheduler } from "@/features/transcript-editor/search"

export const LIBRARY_VIRTUALIZATION_THRESHOLD = 200
export type LibraryFilter = "all" | "local-only" | "pending" | "syncing" | "synced" | "needs-attention" | "deleted"
export type LibrarySyncState = "local-only" | "pending" | "syncing" | "synced" | "needs-attention"
export interface LibrarySyncMetadata { transcriptId: string; itemState: LibrarySyncState }
export interface LibraryRow { record: TranscriptRecord; syncState: LibrarySyncState; searchKey: string }
export function normalizeLibrarySearch(value: string): string
export async function buildLibraryRows(records: readonly TranscriptRecord[], metadata: readonly LibrarySyncMetadata[], scheduler: WorkScheduler): Promise<LibraryRow[]>
export function filterLibraryRows(rows: readonly LibraryRow[], query: string, filter: LibraryFilter): LibraryRow[]
```

`normalizeLibrarySearch` uses `toLocaleLowerCase("vi")`, then `normalize("NFD")`, removes only combining marks `U+0300..U+036F`, then normalizes repeated ASCII spaces for discovery. This transform never enters persistence, exports, or hashing. `buildLibraryRows` maps metadata by transcript ID, derives canonical text from live segments, yields every elapsed 8 ms, and sorts updated descending then ID ascending with code-point comparison. Default `all` excludes tombstones. `deleted` includes only tombstones. `needs-attention` includes local issue or matching sync state.

- [ ] **Step 4: Create deterministic performance fixtures (5 minutes)**

Create `tests/e2e/fixtures/performance.ts` exporting `makeLibraryRecords(count = 1000)` and `makeTimelineSegments(count = 5000)`. IDs are zero-padded ASCII, timestamps remain within epoch/relative bounds, every segment is nonoverlapping, every payload text is derived from segments, and records alternate all five sync states through separately returned metadata. No randomness, clock reads, or undefined fixture helper.

- [ ] **Step 5: Run query tests (3 minutes)**

Run: `pnpm vitest run tests/unit/library.test.ts tests/unit/editor-search.test.ts`

Expected: exit 0; 1,000-row sort is stable and fallback performs multiple turns.

- [ ] **Step 6: Stage and commit queries (2 minutes)**

```bash
git add src/features/library/queries.ts tests/unit/library.test.ts tests/e2e/fixtures/performance.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(library): add deterministic transcript queries"
```

Expected: exactly three paths staged; commit succeeds.

## Task 7: Add Library rename/export/tombstone/observed Undo and quarantine actions

**Files:**
- Create: `src/features/library/actions.ts`
- Modify: `tests/unit/library.test.ts`

- [ ] **Step 1: Add failing action tests (5 minutes)**

Assert inline rename uses the same atomic mutation path and increments observed revision; export never opens editor; delete supplies caller-created fresh deletion ID and observed revision; toast duration is 10,000 ms; Undo passes the exact observed deletion ID returned by delete; a second delete uses another ID; stale/mismatching Undo is rejected; tombstone leaves default list; quarantine export/delete call only `migrationQuarantine`; no action creates Drive transport requests.

- [ ] **Step 2: Run and verify red (2 minutes)**

Run: `pnpm vitest run tests/unit/library.test.ts`

Expected: exit 1; action module is missing.

- [ ] **Step 3: Implement action orchestration (5 minutes)**

```ts
import type { StorageRepositories } from "@/features/storage/repositories"
import type { ExportFormat, ExportResult } from "@/features/transcription/exports"
import type { CanonicalTranscriptPayload, TranscriptRecord } from "@/features/transcription/types"

export const DELETE_UNDO_WINDOW_MS = 10_000
export interface ObservedDelete {
  transcriptId: string
  deletedRevision: number
  deletionId: string
  payload: CanonicalTranscriptPayload
  expiresAt: number
}
export interface LibraryActions {
  rename(record: TranscriptRecord, title: string, operationId: string, updatedAt: number): Promise<TranscriptRecord>
  export(record: TranscriptRecord, format: ExportFormat): ExportResult
  remove(record: TranscriptRecord, operationId: string, deletionId: string, deletedAt: number): Promise<ObservedDelete>
  undo(observed: ObservedDelete, updatedAt: number): Promise<TranscriptRecord>
  repairQuarantine(input: {
    quarantineId: string
    transcriptId: string
    payload: CanonicalTranscriptPayload
    updatedAt: number
  }): Promise<TranscriptRecord>
  exportQuarantine(quarantineId: string): Promise<string>
  deleteQuarantine(quarantineId: string): Promise<void>
}
export function createLibraryActions(
  repositories: StorageRepositories,
  desiredPublicationFor: (envelope: TranscriptEnvelope) => Promise<PendingDesiredPublication | null>,
): LibraryActions
```

Import `CanonicalTranscriptPayload` from `src/features/transcription/types.ts` for the interface above. Validate rename through the Phase 1B title canonicalizer; reject empty/oversize with `Error("library-title-invalid")`. `rename` copies the payload title and calls exactly `repositories.mutations.mutateTranscriptAndCoalescePending({ mutation: { transcriptId: record.id, updatedAt, payload, restoredFromDeletionId: record.restoredFromDeletionId }, expectedRevision: record.revision, desiredPublication: null })`. `remove` requires a live `record.transcript`, calls exactly `repositories.mutations.tombstoneTranscriptAndCoalescePending({ transcriptId: record.id, observedRevision: record.revision, deletedAt, deletionId, desiredPublication: null })`, and returns the repository tombstone's revision/deletion identity, the observed live payload needed for Undo, and `deletedAt + DELETE_UNDO_WINDOW_MS`. `undo` reloads the current record and requires matching tombstone `deletionId` and `deletedRevision`; then calls exactly `repositories.mutations.restoreTranscriptAndCoalescePending({ transcriptId: observed.transcriptId, observedRevision: observed.deletedRevision, observedDeletionId: observed.deletionId, updatedAt, payload: observed.payload, desiredPublication: null })`. `operationId` remains caller-supplied action identity; repository signatures intentionally do not accept it. Never infer or generate IDs in this module. `export` requires a live payload, wraps it as `{ status: "canonical", payload }`, and calls Task 2 `downloadTranscript`; it never opens the editor. `repairQuarantine` validates the complete supplied payload with Phase 1B `validateCanonicalTranscriptPayload`, requires that no transcript already uses the caller-supplied ID, calls `repositories.mutations.mutateTranscriptAndCoalescePending({ mutation: { transcriptId, updatedAt, payload, restoredFromDeletionId: null }, expectedRevision: null, desiredPublication: null })`, and deletes the quarantine entry only after that transaction succeeds. Export/delete methods delegate directly; quarantined originals are never parsed, hashed, or used as repair defaults.

Normative Phase 4 dependency correction: import `TranscriptEnvelope` and `PendingDesiredPublication` from their existing owners. The injected `desiredPublicationFor` shown in the public signature supersedes the direct-null call examples in the preceding paragraph. `rename`, `remove`, `undo`, and `repairQuarantine` each deterministically construct and parse their exact next live/tombstone/restore envelope from observed revision/device/lineage, await `desiredPublicationFor(nextEnvelope)`, and pass only its result as `desiredPublication` to the matching atomic repository method. Phase 4 injects `async () => null`; Phase 5 replaces only this dependency. Export and quarantine-only actions never invoke it.

- [ ] **Step 4: Run storage-adjacent tests (3 minutes)**

Run: `pnpm vitest run tests/unit/library.test.ts tests/unit/database.test.ts tests/unit/legacy-migration.test.ts`

Expected: exit 0; mutation spies show atomic repository calls and exact observed deletion ID.

- [ ] **Step 5: Stage and commit actions (2 minutes)**

```bash
git add src/features/library/actions.ts tests/unit/library.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(library): add tombstone transcript actions"
```

Expected: exactly two paths staged; commit succeeds.

## Task 8: Build lazy Library route, virtualization, recovery, and sync slots

**Files:**
- Create: `src/features/library/copy.ts`
- Create: `src/features/library/TranscriptList.tsx`
- Replace: `src/features/library/LibraryPage.tsx:1-end` (Phase 1 placeholder)
- Modify: `src/app/AppShell.tsx:1-end` route import table only
- Modify: `src/app/copy.ts:1-end` registry composition only
- Create: `tests/components/library.test.tsx`

- [ ] **Step 1: Write failing LIB-01 component tests (5 minutes)**

Cover empty/populated/filtered states; deterministic rows; visible Open/Rename/Export/Delete controls without hover; inline validated rename; deep-link URL encoding; export without route change; delete immediate removal; polite 10-second Undo; stale observed Undo failure; Deleted recovery filter; quarantine reason/original key/export/delete/repair entry; sync-state text slots and header placeholders for identity/last reconcile/pending count/Sync now; exactly 200 rows nonvirtual; 201 and 1,000 rows virtual; keyboard focus continuity after filtering and scrolling; 320/390 controls and 44 px targets.

- [ ] **Step 2: Run and verify red (2 minutes)**

Run: `pnpm vitest run tests/components/library.test.tsx`

Expected: exit 1; Library page/list modules are missing.

- [ ] **Step 3: Add equal EN/VI Library copy (5 minutes)**

Create `src/features/library/copy.ts` with `defineCopy`, `CopyParams`, and `InterfaceLanguage` imported only from `@/app/copy-types`; never import `@/app/copy`. Include Library heading, search, all seven filters, Open/Rename/Export/Delete/Undo, deletion confirmation, stale Undo, empty/zero result, title/source/updated/language/model/runtime/duration labels, five sync states, identity slot, last successful reconcile, pending count, Sync now, recovery heading, reason, original key, export recovery JSON, repair, delete recovery, confirmation, and error text. No raw Drive file ID key exists.

- [ ] **Step 4: Implement `TranscriptList.tsx` (5 minutes)**

Before implementation, make composition-root `src/app/copy.ts` import `EDITOR_COPY` and `LIBRARY_COPY`, then add exact typed `editor: typeof EDITOR_COPY` and `library: typeof LIBRARY_COPY` entries after both copy modules exist. Preserve shell/settings/workbench entries. Feature modules depend only on `copy-types.ts`, so no `app/copy.ts` ↔ feature-copy cycle exists. Component tests import `COPY_REGISTRY` and assert those exact references; no second registry exists.

At `rows.length <= 200`, render every semantic row. At `>200`, use TanStack Virtual with stable transcript ID keys and overscan 8. Each row always renders a visible 44 px menu/action trigger; desktop may group visible buttons, mobile uses the same trigger. Open uses `navigator.navigate({view:"transcript",transcriptId:record.id})`. Rename remains inline and reports validation beside its input. Export format menu calls actions directly. Delete receives `createId()` for operation/deletion IDs and `Date.now()` from the caller component, then enqueues one confirmation-only toast with Undo and 10-second duration. Focus remains on nearest surviving row/action after filter/delete; virtual focus scrolls by ID before focus.

- [ ] **Step 5: Implement `LibraryPage.tsx` (5 minutes)**

Load `transcripts.list` and `migrationQuarantine.list` concurrently. Resolve sync metadata through an injected `loadSyncMetadata(transcriptIds): Promise<LibrarySyncMetadata[]>` page prop; the Phase 4 AppShell supplies `async () => []`, and Phase 5 adapts account-scoped repository/service data to this display-only projection. Build rows incrementally. Header has one `h1`, search, filters, and Phase-5-ready sync slots whose values come from page props; no Drive import or network call. Recovery list never treats quarantine originals as transcripts. Export uses bounded `exportJson`; delete requires explicit confirmation. Repair opens an accessible modal with caller-entered transcript ID, title, source name, language, model ID, mode, created epoch milliseconds, and a segment table containing caller-entered ID/startMs/endMs/text rows. Submit assembles the exact payload, derives `text` from rows, calls `repairQuarantine`, and keeps the quarantine entry plus focused validation error on any failure. Query/filter changes do not modify URL. Opening a transcript creates the exact deep link `/?view=transcript&id=<encoded ID>` through navigator serialization.

- [ ] **Step 6: Lazy-load Library (3 minutes)**

In `src/app/AppShell.tsx`, add:

```ts
const LibraryPage = lazy(() => import("@/features/library/LibraryPage"))
```

Render only for `{view:"library"}` inside `RoutePending`. Workbench must not statically import Library queries, actions, TanStack Virtual list, or editor code.

- [ ] **Step 7: Run Library components and build (5 minutes)**

```bash
pnpm vitest run tests/components/library.test.tsx
pnpm typecheck
pnpm build
```

Expected: exit 0; 200/201 threshold assertions pass; build emits separate Library and transcript chunks.

- [ ] **Step 8: Stage and commit Library UI (2 minutes)**

```bash
git add src/features/library/copy.ts src/features/library/TranscriptList.tsx src/features/library/LibraryPage.tsx src/app/AppShell.tsx src/app/copy.ts tests/components/library.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "feat(library): add transcript library"
```

Expected: exactly six paths staged, including the modified registry composition root; commit succeeds.

## Task 8A: Extend the database fixture with protocol-valid Library/editor seeders

**Files:**
- Modify: `tests/e2e/fixtures/database.ts:1-end`
- Create: `tests/e2e/fixtures/database-contract.spec.ts`

- [ ] **Step 1: Write the failing fixture contract test (5 minutes)**

Create `tests/e2e/fixtures/database-contract.spec.ts`. Import `seedLibrary`, `seedTranscript`, `SeedLibraryOptions`, and `SeedTranscriptOptions`. First assert `seedTranscript(page,{segmentCount:0})` and `seedTranscript(page,{segmentCount:-1})` each reject with exact `RangeError("fixture.segmentCount must be a safe integer in 1..5000")` before IndexedDB opens. Seed three Library rows with `updatedAtStart: 1785283200000`; assert returned IDs are deterministic, each stored row is an exact live schema-2 envelope, payload `text` equals segment text derivation, segment timing is ordered/nonoverlapping, and rows sort by updated-desc/ID-asc. Seed a 12-segment transcript with `saveFails:true`; assert exact segment count and valid relative milliseconds. Before the save attempt, assert repository fixture state exactly `{version:1,failNext:"commitCanonicalDraftAndCoalescePending",consumed:[]}`. Trigger the canonical autosave through public editor UI, then assert exact state `{version:1,failNext:null,consumed:["commitCanonicalDraftAndCoalescePending"]}` and no durable transcript/draft mutation.

Run: `pnpm playwright test tests/e2e/fixtures/database-contract.spec.ts --reporter=list`.

Expected: FAIL because the Phase 4 exports do not exist.

- [ ] **Step 2: Add the complete exact master implementation (5 minutes)**

Append this code to the Phase 1/Slice 1B fixture; retain all existing migration/quarantine exports. Add the exact imports at the top so the snippet compiles without an ambient or duplicate `RepositoryFixtureMethod` declaration:

```ts
import type { Page } from "@playwright/test"
import type { RepositoryFixtureMethod } from "../../../src/features/storage/repositories"

export interface SeedLibraryOptions {
  count: number
  updatedAtStart?: number
}

export interface SeedTranscriptOptions {
  segmentCount: number
  saveFails?: boolean
  transcriptId?: string
}

type FixtureEnvelope = {
  schemaVersion: 2; transcriptId: string; revision: number; updatedAt: number
  deletedAt: null; deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA"; deletionId: null; restoredFromDeletionId: null
  transcript: {
    title: string; sourceName: string; language: "en"; modelId: "Xenova/whisper-base"
    mode: "local-webgpu"; createdAt: number; text: string
    segments: Array<{ id: string; startMs: number; endMs: number; text: string }>
  }
}

function fixtureEnvelope(transcriptId: string, segmentCount: number, updatedAt: number, title: string): FixtureEnvelope {
  if (!Number.isSafeInteger(segmentCount) || segmentCount < 1 || segmentCount > 5_000) {
    throw new RangeError("fixture.segmentCount must be a safe integer in 1..5000")
  }
  const segments = Array.from({ length: segmentCount }, (_, index) => ({
    id: `${transcriptId}-segment-${String(index + 1).padStart(5, "0")}`,
    startMs: index * 1_000,
    endMs: (index + 1) * 1_000,
    text: `Segment ${index + 1}`,
  }))
  return {
    schemaVersion: 2, transcriptId, revision: 0, updatedAt, deletedAt: null,
    deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA", deletionId: null, restoredFromDeletionId: null,
    transcript: {
      title, sourceName: `${transcriptId}.wav`, language: "en", modelId: "Xenova/whisper-base",
      mode: "local-webgpu", createdAt: updatedAt,
      text: segments.map((segment) => segment.text).join(" "), segments,
    },
  }
}

async function writeFixtureEnvelopes(page: Page, records: readonly FixtureEnvelope[]): Promise<void> {
  await page.goto("/favicon.svg")
  await page.evaluate(async (input) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("whisdom", 2)
      request.onupgradeneeded = (event) => {
        if (event.oldVersion !== 0) throw new Error("fixture refuses non-fresh schema upgrade")
        const database = request.result
        const transaction = request.transaction!
        const settings = database.createObjectStore("settings")
        const transcripts = database.createObjectStore("transcripts", { keyPath: "transcriptId" })
        transcripts.createIndex("by-deletedAt", "deletedAt")
        transcripts.createIndex("by-updatedAt", "updatedAt")
        const quarantine = database.createObjectStore("migrationQuarantine", { keyPath: "quarantineId" })
        quarantine.createIndex("by-originalV1Key", "originalV1Key")
        quarantine.createIndex("by-reasonCode", "reasonCode")
        database.createObjectStore("drafts", { keyPath: "transcriptId" })
        const conflicts = database.createObjectStore("conflictCandidates", { keyPath: "candidateId" })
        conflicts.createIndex("by-receivedAt", "receivedAt")
        conflicts.createIndex("by-transcriptId", "transcriptId")
        const metadata = database.createObjectStore("syncMetadata", { keyPath: ["accountKey", "transcriptId"] })
        metadata.createIndex("by-accountKey", "accountKey")
        metadata.createIndex("by-transcriptId", "transcriptId")
        const pending = database.createObjectStore("pendingOperations", { keyPath: ["accountKey", "transcriptId"] })
        pending.createIndex("by-accountKey", "accountKey")
        pending.createIndex("by-nextAttemptAt", "nextAttemptAt")
        pending.createIndex("by-transcriptId", "transcriptId")
        database.createObjectStore("syncState", { keyPath: "accountKey" })
        const meta = database.createObjectStore("meta")
        settings.put({ uiLanguage: "en", modelId: "Xenova/whisper-base", explicitModelId: null, language: "auto", mode: "local-webgpu", chunkSeconds: 30, overlapSeconds: 1, persistMediaBlobs: false, serverModelId: null }, "settings")
        meta.put("d_AAAAAAAAAAAAAAAAAAAAAA", "deviceId")
        void transaction;
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    if (db.version !== 2 || !db.objectStoreNames.contains("transcripts")) {
      db.close()
      throw new Error("fixture requires schema-2 database")
    }
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("transcripts", "readwrite")
      const store = transaction.objectStore("transcripts")
      for (const record of input) store.put(record)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error ?? new Error("fixture transaction aborted"))
    })
    db.close()
  }, records)
}

export async function seedLibrary(page: Page, options: SeedLibraryOptions): Promise<readonly string[]> {
  if (!Number.isSafeInteger(options.count) || options.count < 0 || options.count > 1_000) throw new RangeError("count")
  const updatedAtStart = options.updatedAtStart ?? 1_785_283_200_000
  const ids = Array.from({ length: options.count }, (_, index) => `tr_library_${String(index + 1).padStart(4, "0")}`)
  await writeFixtureEnvelopes(page, ids.map((id, index) => fixtureEnvelope(id, 1, updatedAtStart - index, `Library transcript ${index + 1}`)))
  return ids
}

export async function seedTranscript(page: Page, options: SeedTranscriptOptions): Promise<string> {
  const transcriptId = options.transcriptId ?? "tr_editor_fixture"
  await page.addInitScript((saveFails) => {
    const target = window as Window & {
      __WHISDOM_REPOSITORY_FIXTURE__?: {
        version: 1
        failNext: "commitCanonicalDraftAndCoalescePending" | null
        consumed: RepositoryFixtureMethod[]
      }
    }
    if (saveFails) {
      target.__WHISDOM_REPOSITORY_FIXTURE__ = {
        version: 1,
        failNext: "commitCanonicalDraftAndCoalescePending",
        consumed: [],
      }
    } else {
      delete target.__WHISDOM_REPOSITORY_FIXTURE__
    }
  }, options.saveFails === true)
  await writeFixtureEnvelopes(page, [fixtureEnvelope(transcriptId, options.segmentCount, 1_785_283_200_000, "Editor fixture")])
  return transcriptId
}
```

- [ ] **Step 3: Run fixture and consuming E2E tests (4 minutes)**

```bash
pnpm playwright test tests/e2e/fixtures/database-contract.spec.ts tests/e2e/editor-save.spec.ts tests/e2e/library.spec.ts --reporter=list
```

Expected: fixture contract passes; EDIT/SAVE/LIB consumers use the same exact exports and records.

- [ ] **Step 4: Stage exact files and commit (2 minutes)**

```bash
git add tests/e2e/fixtures/database.ts tests/e2e/fixtures/database-contract.spec.ts
git diff --cached --name-only
git diff --cached
git commit -m "test(storage): add protocol-valid editor fixtures"
```

Expected staged paths: exactly the two test-fixture paths above.

## Task 9: Add exact editor/save/Library browser scenarios

**Files:**
- Consume unchanged: `tests/e2e/fixtures/database.ts` (Task 8A owns its completed fixture contract; Task 9 does not edit or stage it)
- Create: `tests/e2e/editor-save.spec.ts`
- Create: `tests/e2e/library.spec.ts`
- Modify: `tests/e2e/navigation-i18n.spec.ts:1-end`

- [ ] **Step 1: Add EDIT-01 browser scenario (5 minutes)**

Seed one schema-2 record with `const transcriptId = await seedTranscript(page, { segmentCount: 12, transcriptId: "tr_editor" })`; assert `transcriptId === "tr_editor"`, then open `/?view=transcript&id=${encodeURIComponent(transcriptId)}`. EDIT-01 must never seed default `tr_editor_fixture` and then open `tr_editor`. Exercise Document split, Timeline millisecond edit, Document merge, multiline paste, undo, redo, TXT/JSON/SRT/VTT downloads, and compare downloaded UTF-8 content against pinned fixture bytes and payload hash fixture. Run:

`pnpm playwright test tests/e2e/editor-save.spec.ts --grep "EDIT-01" --reporter=list`

Expected red: exit 1 until browser wiring/selectors satisfy the complete flow. After fixing only observed wiring defects, rerun; expected green: `1 passed`.

Task 9 stages `tests/e2e/editor-save.spec.ts` with this exact-ID assertion; Task 8A stages the fixture and its zero/negative contract test. No staging step may omit either changed test.

- [ ] **Step 2: Add EDIT-02 browser scenario (5 minutes)**

Assert next/previous wrap, surviving active match, mutation reset, no-result input focus, and one polite zero-result announcement. Run with `--grep "EDIT-02"`; expected red before final wiring, then `1 passed`.

- [ ] **Step 3: Add EDIT-03 browser scenario (5 minutes)**

Seed one normalized-empty invalid-timing segment among valid cues. Assert SRT/VTT disabled for invalid timing before omission. Correct timing, leave all text empty, assert exact localized “No non-empty subtitle cues.”/VI equivalent. TXT remains available. Run with `--grep "EDIT-03"`; expected green: `1 passed`.

- [ ] **Step 4: Add EDIT-04 browser scenario (5 minutes)**

Inject Phase 3 runtime results at half-millisecond boundaries, exactly seven days, and seven days plus one millisecond. Assert Math.round conversion, exact timeline/export values, seven-day acceptance, and over-cap Needs attention without clamping. Run with `--grep "EDIT-04"`; expected green: `1 passed`.

- [ ] **Step 5: Add SAVE-01..03 browser scenarios (5 minutes)**

`SAVE-01`: make a scalar-safe over-cap or overlapping timing edit, wait 600 ms plus `persistDraftOnly` completion, reload the same URL, and assert the exact invalid `EditorDraftPayload` timing survives, the page remains Needs attention, the canonical `TranscriptRecord`, its revision/hash, sync metadata, and pending-operation set are byte-for-byte unchanged, TXT remains available, and JSON/SRT/VTT plus sync are blocked. Correct timing, wait for `commitCanonicalDraftAndCoalescePending`, reload, and assert only that canonical success invokes the Phase 4 null `desiredPublicationFor` callback with the exact next envelope, advances transcript revision/hash, and removes draft-only Needs-attention state; no Drive pending row exists yet. `SAVE-02`: force repository failure for app navigation and Back/Forward; assert URL/editor remain, Retry saves then navigates, Discard reloads the last durable editor revision independently from the canonical transcript revision, and replay does not loop. `SAVE-03`: instrument beforeunload registration; assert absent when clean, present while dirty/saving, absent after save. Do not assert async IndexedDB completion during unload.

Run: `pnpm playwright test tests/e2e/editor-save.spec.ts --grep "SAVE-0" --reporter=list`

Expected: `3 passed`.

- [ ] **Step 6: Add LIB-01 browser scenario (5 minutes)**

Seed the deterministic 1,000-row fixture plus one quarantine entry and all sync states. Assert search/diacritic discovery/filter/sort; visible rename/open/export/delete; exact observed Undo; stale Undo rejection; quarantine export/delete/repair; deep-link refresh; 200/201 virtualization boundary; no hover dependency; mobile action visibility at 390 and 320.

Run: `pnpm playwright test tests/e2e/library.spec.ts --grep "LIB-01" --reporter=list`

Expected: `1 passed`.

- [ ] **Step 7: Extend NAV-01 dirty cases and EN/VI parity (5 minutes)**

Add refresh/deep-link/not-found/route-heading focus plus dirty push, dirty Back, dirty Forward, Retry, and Discard in both locales. Assert unknown transcript IDs show localized not-found and Back to Library without opening another record. Run:

`pnpm playwright test tests/e2e/navigation-i18n.spec.ts --grep "NAV-01" --reporter=list`

Expected: all selected NAV-01 locale projects pass.

- [ ] **Step 8: Run complete Phase 4 functional E2E group (5 minutes)**

```bash
pnpm playwright test tests/e2e/editor-save.spec.ts tests/e2e/library.spec.ts tests/e2e/navigation-i18n.spec.ts --reporter=list
```

Expected: exit 0; EDIT-01..04, SAVE-01..03, LIB-01, and NAV-01 dirty extensions pass in configured desktop/mobile locale projects.

- [ ] **Step 9: Stage and commit browser coverage (2 minutes)**

```bash
git add tests/e2e/editor-save.spec.ts tests/e2e/library.spec.ts tests/e2e/navigation-i18n.spec.ts
git diff --cached --name-only
git diff --cached
git commit -m "test(editor): cover workspace persistence and library"
```

Expected: exactly three paths staged; commit succeeds.

## Task 10: Add PERF-02/03 and accessibility coverage

**Files:**
- Modify: `tests/e2e/performance.spec.ts:1-end`
- Modify: `tests/e2e/editor-save.spec.ts:1-end`
- Modify: `tests/e2e/library.spec.ts:1-end`
- Modify: `tests/components/transcript-editor.test.tsx`
- Modify: `tests/components/library.test.tsx`

- [ ] **Step 1: Add PERF-02 profiler assertion (5 minutes)**

Mount header, primary navigation, Library subtree, and Phase 3 progress subtree under separate React Profilers. Deliver 100 throttled progress snapshots. Record commits after initial mount. Assert header/nav/Library each record zero progress-caused commits and progress subtree records at least one. Run:

`pnpm vitest run tests/components/transcript-editor.test.tsx tests/components/library.test.tsx -t "PERF-02"`

Expected: exit 0; no Phase 4 subscription widens progress rerenders.

- [ ] **Step 2: Add PERF-03 browser assertions (5 minutes)**

Use 1,000 Library rows and 5,000 Timeline segments. Assert Library does not virtualize at 200 and does at 201; Timeline does not virtualize at 500 and does at 501; large search/index work yields after deterministic 8 ms under scheduler/idle support and under removed scheduler/idle APIs via `setTimeout(0)`. Assert focused row/segment remains keyboard reachable across virtual scroll.

Run: `pnpm playwright test tests/e2e/performance.spec.ts --grep "PERF-0(2|3)" --reporter=list`

Expected: `PERF-02` and `PERF-03` pass; no threshold uses `>=`.

- [ ] **Step 3: Add A11Y-AUTO-03/04 axe matrix (5 minutes)**

Cover Library empty/populated/filtered/recovery and transcript Document/Timeline/search/save-error in EN/VI at desktop, 390, and 320. Run direct axe-core scans and fail on critical or serious violations. Assert one visible h1, landmarks, tab semantics, labels, no positive tabindex, visible actions, and textual save/sync status.

Run: `pnpm vitest run tests/components/transcript-editor.test.tsx tests/components/library.test.tsx -t "A11Y-AUTO-03|A11Y-AUTO-04"`

Expected: exit 0; zero critical/serious violations in all Phase 4 component states.

- [ ] **Step 4: Add browser keyboard/focus/reflow/live assertions (5 minutes)**

Extend Phase 4-owned `tests/e2e/editor-save.spec.ts` and `tests/e2e/library.spec.ts` with changed-flow keyboard, focus, reflow, live-region, and screen-reader-observable assertions: Library actions; editor tabs/search/edit/split/merge/undo/export; dirty Retry/Discard; heading focus; no-result focus; mutation search reset; 200%/320 no horizontal overflow; 44×44 targets; keyboard/safe-area visibility; one polite save/search/delete announcement; segment position/timestamp context.

Run:

```bash
pnpm playwright test tests/e2e/editor-save.spec.ts tests/e2e/library.spec.ts --grep "FEATURE-A11Y" --reporter=list
```

Expected: all selected Phase 4 assertions pass in EN/VI desktop, 390, and 320 projects.

- [ ] **Step 5: Verify lazy route/request behavior remains intact (3 minutes)**

Run: `pnpm playwright test tests/e2e/performance.spec.ts --grep "PERF-01" --reporter=list`

Expected: initial Workbench requests exclude Library/editor/Settings chunks, search-heavy code, model assets, and ffmpeg assets; direct Library and transcript navigation request only their needed lazy chunks.

- [ ] **Step 6: Stage and commit quality coverage (2 minutes)**

```bash
git add tests/e2e/performance.spec.ts tests/e2e/editor-save.spec.ts tests/e2e/library.spec.ts tests/components/transcript-editor.test.tsx tests/components/library.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "test(ui): verify editor and library quality gates"
```

Expected: exactly five paths staged; commit succeeds.

## Task 11: Phase 4 integration, review, and verification gate

**Files:**
- Modify only files already listed above when a failing gate identifies a Phase 4 defect
- Do not modify `worker/`, `server/`, Google Drive transport files, schema/migration files, or generated output

- [ ] **Step 1: Run focused unit and component suites (5 minutes)**

```bash
pnpm vitest run tests/unit/editor-reducer.test.ts tests/unit/editor-search.test.ts tests/unit/exports.test.ts tests/unit/library.test.ts
pnpm vitest run tests/components/transcript-editor.test.tsx tests/components/library.test.tsx tests/components/navigation.test.tsx
```

Expected: both commands exit 0; no unhandled promise rejection, timer leak, act warning, or axe critical/serious violation.

- [ ] **Step 2: Run named Phase 4 E2E families (5 minutes)**

```bash
pnpm playwright test tests/e2e/editor-save.spec.ts --grep "EDIT-0[1-4]|SAVE-0[1-3]" --reporter=list
pnpm playwright test tests/e2e/library.spec.ts --grep "LIB-01" --reporter=list
pnpm playwright test tests/e2e/navigation-i18n.spec.ts --grep "NAV-01" --reporter=list
pnpm playwright test tests/e2e/performance.spec.ts --grep "PERF-0[1-3]" --reporter=list
pnpm playwright test tests/e2e/editor-save.spec.ts tests/e2e/library.spec.ts --grep "FEATURE-A11Y" --reporter=list
```

Expected: every command exits 0; named scenarios pass at their configured EN/VI and viewport matrix. Only documented real-ASR/WebGPU tests remain gated; none of these commands contains a gated runtime scenario.

- [ ] **Step 3: Run repository pre-commit gate in required order (5 minutes)**

```bash
pnpm typecheck
rtk lint
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Expected: every command exits 0. Both lint commands report zero errors and zero warnings. Build emits separate lazy Library/editor/Settings chunks. E2E reports only documented real-ASR/WebGPU gated skips.

- [ ] **Step 4: Confirm worker/server exclusions (2 minutes)**

Run `git diff --name-only` and inspect output. Expected: no path under `worker/` or `server/`; no `src/features/google-drive/identity.ts`, `transport.ts`, `publication.ts`, `parser.ts`, `resolver.ts`, `reconcile.ts`, or `sync-service.ts`. Do not run or claim worker/server checks when those boundaries remain unchanged.

- [ ] **Step 5: Remove generated test artifacts before final staging (2 minutes)**

Delete only generated `test-results/.last-run.json`, Playwright output, non-baseline screenshots, `dist/`, temporary traces, and caches created by verification. Do not use `git clean`, reset, stash, or broad deletion. Re-run `git diff --name-only`; expected: only intended source/test files remain.

- [ ] **Step 6: Perform phase self-review (5 minutes)**

Check each item and record evidence in the implementation session:

- [ ] EDIT-01..04 pass; canonical text exists only as segment derivation.
- [ ] SAVE-01..03 pass; 600 ms debounce, one flight, newest desired coalescing, atomic local save, refresh, Retry/Discard, pop replay guard, and conditional unload warning are proven.
- [ ] LIB-01 passes with deterministic search/filter/sort, 1,000 rows, >200 virtualization, visible actions, tombstone and exact observed Undo, recovery, deep links, and sync slots.
- [ ] PERF-02/03 pass with zero unrelated progress commits, >500 Timeline virtualization, and both 8 ms yield paths.
- [ ] A11Y-AUTO-03/04 and Phase 4 keyboard/focus/reflow/live/screen-reader checks pass in EN/VI at desktop/390/320.
- [ ] TXT remains available for scalar-valid timing-invalid `EditorDraftPayload` values; JSON/SRT/VTT require `CanonicalCommitResult.status === "canonical"`; all output bytes are produced once and reused.
- [ ] No Drive transport, media upload, schema migration, concurrent batch, or independent document string was introduced.

- [ ] **Step 7: Stage any final gate fixes by exact path and commit (2 minutes)**

For each corrected file, run `git add <exact-path>` separately. Then:

```bash
git diff --cached --name-only
git diff --cached
git commit -m "fix(editor): complete phase 4 integration"
```

Expected: staged output contains only reviewed Phase 4 paths; commit is created only when gate fixes exist. If no final fix exists, do not create an empty commit.

- [ ] **Step 8: Record Phase 4 exit (2 minutes)**

Record actual command output, commit IDs, named-scenario counts, locale/viewport projects, gated skips, and remaining Phase 5 dependency. Phase 4 exits only with every checkbox above satisfied. Next phase consumes local atomic mutations, durable drafts/candidates, tombstones, and sync-state slots; it adds Drive transport without changing editor canonical behavior.

## Self-review record

- [ ] **Spec coverage:** Tasks 1–5 cover canonical segment-only editing, integer timing, structural actions, bounded history, search, exports, autosave, navigation protection, full-page lazy route, keyboard/focus/live/mobile behavior, and EDIT-01..04/SAVE-01..03. Tasks 6–8 cover deterministic Library queries, thresholds, visible actions, tombstone/observed Undo, quarantine recovery, deep links, and sync slots. Tasks 9–11 cover LIB-01, NAV dirty extensions, PERF-02/03, A11Y-AUTO-03/04, EN/VI, 320/390, and full gates.
- [ ] **Placeholder scan:** No placeholder marker, deferred implementation marker, “similar to” instruction, execution choice, or undefined production helper remains. Every external symbol is a platform API, package API, or Phase 1B/3 export named with its owning path; every new public helper has an exact signature and owning file.
- [ ] **Type consistency:** Editor names match master Section 5.7; persisted timing is `startMs`/`endMs`; `text` is derived; payload excludes envelope fields; repository mutations receive expected revision and caller time/IDs; `LibrarySyncMetadata` is display-only and cannot enter schema/hash/sync storage; Drive Phase 5 types are not imported.
- [ ] **Ordering:** Every task uses red test, observed behavior-specific failure, smallest behavior implementation, focused green, adjacent suite, exact staging inspection, and conventional commit. No task uses broad staging.

## Final acceptance checklist

- [ ] Required writing-plans header and checkbox tracking are present.
- [ ] Entry requires completed Phase 3 and exact Phase 1B schema-2 repositories.
- [ ] Every edit action carries caller-supplied operation/new-segment IDs.
- [ ] Segment-derived canonical text, integer milliseconds, timing bounds, empty-cue order, split/merge/paste/spanning-selection rules, and 100-entry undo/redo bounds are explicit.
- [ ] Document and Timeline share one reducer; Timeline virtualizes only above 500 render-capable segments.
- [ ] Search yields at 8 ms with scheduler/idle and `setTimeout(0)` fallback tests.
- [ ] TXT is available for both `CanonicalCommitResult` discriminants; JSON/SRT/VTT require `status === "canonical"`; exact integer formatting, canonical JSON, and single-source UTF-8 bytes are explicit.
- [ ] Autosave uses 600 ms inactivity, one in-flight save, newest desired coalescing, local-first atomic persistence, refresh recovery, navigation Retry/Discard, pop replay guard, lifecycle best effort, and conditional unload warning.
- [ ] Transcript route is full-page, lazy, deep-linkable, localized, keyboard complete, focus managed, live-announced, and mobile-safe.
- [ ] Library search/filter/sort is deterministic; fixture has 1,000 rows; virtualization starts only above 200 filtered rows.
- [ ] Open/Rename/Export/Delete remain visible; delete writes a tombstone; Undo uses only the exact observed deletion ID; quarantine recovery and sync-state slots are present.
- [ ] EDIT-01..04, SAVE-01..03, LIB-01, NAV-01 dirty extensions, PERF-02/03, component, E2E, accessibility, EN/VI, 320/390, and full verification commands have exact expected results.
- [ ] Staging uses exact paths; commits are conventional; no push, Drive transport, schema migration, worker/server edit, or execution-choice ending is present.
