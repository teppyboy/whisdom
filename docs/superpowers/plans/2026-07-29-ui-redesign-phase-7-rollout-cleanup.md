# Precision Studio UI Redesign Phase 7 Rollout and Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove replaced legacy product code, prove final Precision Studio workflows, and rehearse candidate → Slice 1A floor → candidate on one fixed origin and one persistent IndexedDB profile.

**Architecture:** Slice 1B already made `src/App.tsx` the thin `AppShell` adapter and extracted the interim product into `src/app/LegacyProduct.tsx`. Phase 7 leaves `App` unchanged, deletes `LegacyProduct`, and updates `AppShell` route composition to render the final Workbench directly; `AppShell` never imports `App`, so no circular import exists. Test-owned Node code imports canonical/schema/hash functions directly from source, constructs protocol-valid fixtures, and seeds them through page IndexedDB helpers. One persistent Chromium context visits one fixed origin, `http://127.0.0.1:4187`, while candidate and floor previews run strictly sequentially. Phase 7 installs no rollout-specific global, browser test bridge, client environment define, or conditional fixture. The floor consumes only the required pre-existing Slice 1A deployed `window.__WHISDOM_STORAGE_COMPATIBILITY__` contract pinned by Phase 1; that compatibility contract is permitted and is not a Phase 7 bridge.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest, Playwright, IndexedDB/idb, and PowerShell/Git rollout tooling.

---

## 1. Authority, entry gate, and procedural stop rule

Execute from `F:\Workspace\whisdom\whisdom-precision-studio` on `feature/precision-studio-redesign`. Read the approved specification, master rollout, Phases 1–6, and recorded reviews first.

- [ ] Phase 6 integrated gate is green and was not deployed independently.
- [ ] `docs/releases/precision-studio-slice-1a.json` matches the closed deployed evidence variant and all four smoke values are `passed`.
- [ ] Phase 6 entry commit is clean and accepted by `release:check-rollback-floor`. This is only the Phase 7 starting point; it is not the rollout candidate SHA.
- [ ] No push or deployment occurs without a separate explicit request.

Expected Phase 7 changes are limited to the exact ownership map below. If a failing replacement or rollout assertion exposes a product defect, ownership uncertainty, or a required path outside this map, stop the task. Record the exact path, function/component, command, assertion, and observed failure; obtain an explicit reviewed plan amendment before editing. Zero imports, apparent dead code, or a focused red never grants executor-invented conditional edit authority.

## 2. Exact ownership

| Path | Action |
| --- | --- |
| `src/App.tsx` | Verify unchanged exact thin named/default `AppShell` adapter; no staging |
| `src/app/AppShell.tsx` | Modify Workbench route composition to final `WorkbenchPage`; never import `App` |
| `src/app/LegacyProduct.tsx` | Delete after replacement proof |
| `src/features/google-drive/drive.ts` | Delete only after exact zero-consumer proof |
| `tests/unit/legacy-removal.test.ts` | Create removal guard |
| `tests/e2e/fixtures/rollout.ts` | Create complete Node-side canonical fixture and page IndexedDB helper contract |
| `tests/e2e/rollout.spec.ts` | Create same-origin persistent-profile rollback drill |
| `tests/e2e/whisdom.spec.ts` | Verify only; Phase 1 already owns strict-locator cleanup |
| release evidence/checker/runbook | Verify unchanged |

Preserve database openers, schema/migration/repositories, workers, WASM, server/worker packages, low-level UI primitives, CNAME, CSP, CI deployment authority, and `src/features/storage/indexed-db.ts`. Any ownership uncertainty follows the stop rule above; do not delete or edit the uncertain path.

## 3. Remove only approved legacy owners

### Task 1: Prove replacement coverage and facade non-use

- [ ] Confirm `AppShell`, Workbench, Library, Transcript, Settings, sync service, and their component tests exist.
- [ ] Run replacement component and E2E suites before removal:

```powershell
pnpm vitest run tests/components/navigation.test.tsx tests/components/product-errors.test.tsx tests/components/workbench.test.tsx tests/components/queue.test.tsx tests/components/transcript-editor.test.tsx tests/components/library.test.tsx tests/components/drive-identity.test.tsx tests/components/drive-sync.test.tsx tests/components/accessibility.test.tsx tests/components/progress-profiler.test.tsx
pnpm playwright test tests/e2e/workbench.spec.ts tests/e2e/runtime-queue.spec.ts tests/e2e/editor-save.spec.ts tests/e2e/library.spec.ts tests/e2e/navigation-i18n.spec.ts --reporter=list
```

Expected: exit 0. A product failure invokes the procedural stop rule; assertions are not weakened.

- [ ] Prove no facade consumer remains:

```powershell
$matches = rg -n --glob '!src/features/google-drive/drive.ts' --glob '!docs/**' --glob '!dist/**' --glob '!test-results/**' 'features/google-drive/drive|requestDriveAccess|uploadTranscriptMetadata' src tests worker
if ($LASTEXITCODE -eq 0) { $matches; throw 'Legacy Drive facade still has consumers' }
if ($LASTEXITCODE -ne 1) { throw "rg failed with exit code $LASTEXITCODE" }
```

Expected: `rg` exits 1. Any match returns ownership to Phase 5 and blocks deletion.

### Task 2: Remove the extracted legacy owner and guard final composition

- [ ] Create `tests/unit/legacy-removal.test.ts` to require exact thin `App.tsx`, absent `LegacyProduct.tsx`, absent Drive facade, absent legacy copy/result/route/component signatures, nonrecursive `App → AppShell → WorkbenchPage` imports, and absent obsolete strict-locator workarounds.
- [ ] Verify `src/App.tsx` remains byte-for-byte equivalent to the Slice 1B thin adapter:

```tsx
import "@/features/storage/compatibility-api"
import { AppShell } from "@/app/AppShell"

export function App() {
  return <AppShell />
}

export default App
```

`src/features/storage/compatibility-api.ts` remains owned by Slice 1A and is neither moved nor edited. `src/main.tsx` also retains its bootstrap import; duplicate ESM imports execute the module once. `tests/unit/legacy-removal.test.ts` requires the module to remain present, requires the thin `App.tsx` side-effect import, and verifies Phase 7 did not relocate installation into `App.tsx` or install/replace the global itself. Modify `src/app/AppShell.tsx` so its Workbench route imports/renders final `WorkbenchPage` and has no `App` or `LegacyProduct` import. Delete only `src/app/LegacyProduct.tsx` and `src/features/google-drive/drive.ts`.

- [ ] Delete only the two approved legacy owners: `src/app/LegacyProduct.tsx` and `src/features/google-drive/drive.ts`.
- [ ] Run:

```powershell
pnpm vitest run tests/unit/legacy-removal.test.ts
pnpm typecheck
pnpm vitest run tests/components/navigation.test.tsx tests/components/product-errors.test.tsx tests/components/workbench.test.tsx tests/components/transcript-editor.test.tsx tests/components/library.test.tsx tests/components/drive-identity.test.tsx tests/components/drive-sync.test.tsx
pnpm playwright test tests/e2e/workbench.spec.ts tests/e2e/editor-save.spec.ts tests/e2e/library.spec.ts tests/e2e/navigation-i18n.spec.ts --reporter=list
```

Expected: all pass. Final Workbench, Library, and full-page Transcript routes render through `AppShell`; no result dialog or overlay route survives.

## 4. Test-owned rollout fixture contract

### Task 3: Create `tests/e2e/fixtures/rollout.ts`

This fixture is Node-side test code. It imports production canonical/schema/hash functions directly; it installs nothing in `window`, emits no `VITE_*` define, reads no rollout environment switch, and never conditionally exposes helpers. `tests/e2e/rollout.spec.ts` is its only consumer.

Required direct imports:

```ts
import type { Page } from "@playwright/test"

import {
  commitEditorDraftPayload,
  parseEditorDraftPayload,
} from "@/features/transcription/canonical"
import {
  parseTranscriptEnvelope,
  serializeTranscriptEnvelope,
} from "@/features/transcription/schema"
import {
  acceptedPayloadHash,
  candidateHash,
  rawBodyByteHash,
  remoteKey,
} from "@/features/transcription/hashes"
import {
  parsePendingOperation,
  type PendingOperation,
} from "@/features/storage/sync-types"
import type { EditorDraftPayload, TranscriptEnvelope } from "@/features/transcription/types"
```

Required complete exports:

```ts
export const ROLLOUT_DB_NAME = "whisdom"
export const ROLLOUT_ORIGIN = "http://127.0.0.1:4187"

export interface RolloutIdentity {
  envelope: TranscriptEnvelope
  envelopeJson: string
  remoteKey: string
  candidateHash: string
  acceptedPayloadHash: string
  bodyByteHash: string
}

export interface RolloutFixtureSet {
  transcripts: readonly TranscriptEnvelope[]
  draft: {
    transcriptId: string
    baseRevision: number
    editorRevision: number
    draft: EditorDraftPayload
    dirty: true
    saveState: "dirty"
    updatedAt: number
  }
  conflictCandidate: Readonly<Record<string, unknown>>
  syncMetadata: Readonly<Record<string, unknown>>
  pendingOperations: readonly PendingOperation[]
  identities: readonly RolloutIdentity[]
}

export interface RolloutDatabaseSnapshot {
  version: number
  stores: readonly string[]
  indexes: Readonly<Record<string, readonly string[]>>
  settings: readonly SerializedStoreEntry[]
  transcripts: readonly SerializedStoreEntry[]
  drafts: readonly SerializedStoreEntry[]
  conflictCandidates: readonly SerializedStoreEntry[]
  syncMetadata: readonly SerializedStoreEntry[]
  pendingOperations: readonly SerializedStoreEntry[]
  syncState: readonly SerializedStoreEntry[]
  meta: readonly SerializedStoreEntry[]
  migrationQuarantine: readonly SerializedStoreEntry[]
}

export interface SerializedStoreEntry {
  encodedKey: string
  value: unknown
  canonicalBytes: string
}

export interface FloorMutationExpectation {
  createdTranscriptId: "tr_rollout_floor_saved"
  tombstonedTranscriptId: "tr_rollout_floor_deleted"
  createdRecord: Readonly<Record<string, unknown>>
  tombstoneRecord: Readonly<Record<string, unknown>>
}

export async function buildRolloutFixtureSet(): Promise<RolloutFixtureSet>
export async function seedRolloutDatabase(page: Page, fixture: RolloutFixtureSet): Promise<void>
export async function readRolloutDatabase(page: Page): Promise<RolloutDatabaseSnapshot>
export async function mutateThroughFloorCompatibility(page: Page): Promise<FloorMutationExpectation>
export function expectProtectedSnapshotEqual(
  actual: RolloutDatabaseSnapshot,
  expected: RolloutDatabaseSnapshot,
  floorMutation: FloorMutationExpectation,
): void
export function expectedAfterFloorMutation(
  expectedBeforeFloorSnapshot: RolloutDatabaseSnapshot,
  floorMutation: FloorMutationExpectation,
): RolloutDatabaseSnapshot
```

`buildRolloutFixtureSet()` constructs literal live, tombstone, conflict, invalid-overlap draft, unbound pending, and verifying pending inputs in Node. Every envelope passes `parseTranscriptEnvelope`; every envelope JSON comes from `serializeTranscriptEnvelope`; all four digests come from source hash exports; the draft passes `parseEditorDraftPayload` and must return only `draft.timing-overlap` from `commitEditorDraftPayload`; every pending row passes `parsePendingOperation`. A failed constructor/parser/hash assertion rejects before Chromium starts.

`seedRolloutDatabase()` uses `page.evaluate((fixture) => ...)` only to perform IndexedDB requests against the already-open candidate origin. It receives fully constructed structured-clone data; browser code does not reconstruct, canonicalize, hash, or import production helpers. One readwrite transaction writes exact fixture rows to `transcripts`, `drafts`, `conflictCandidates`, `syncMetadata`, and `pendingOperations`. `readRolloutDatabase()` opens versionlessly and snapshots every schema-2 store by exact name: `settings`, `transcripts`, `drafts`, `conflictCandidates`, `syncMetadata`, `pendingOperations`, `syncState`, `meta`, and `migrationQuarantine`. Every one of the nine arrays contains exact `SerializedStoreEntry` objects. Cursor `primaryKey` supplies `encodedKey` for out-of-line stores (`settings`, `meta`) and inline/compound-key stores alike, preserving keys independently from values. Deterministic type-tagged IndexedDB-key encoding distinguishes strings, numbers, dates, binary keys, and recursive arrays; canonical value serialization produces `canonicalBytes`. Each array sorts by `encodedKey` then `canonicalBytes`. It reads exact sorted store/index names, closes the handle, and returns structured-clone data. `conflictCandidates` is the exact candidate/conflict and remote-quarantine store; `migrationQuarantine` is the exact migration-quarantine store—no alias store exists.

`mutateThroughFloorCompatibility()` consumes only the required pre-existing Slice 1A deployed `window.__WHISDOM_STORAGE_COMPATIBILITY__` seven-function contract in the floor artifact; it does not install, replace, or extend that object. It creates exact `tr_rollout_floor_saved` and tombstones exact `tr_rollout_floor_deleted`, returns both expected canonical records as `FloorMutationExpectation`, verifies version remains 2, verifies the new row projects through the adapter, and verifies delete produced the returned canonical v2 tombstone. If the deployed floor artifact does not expose that exact Phase 1 contract, stop and record the owning Phase 1 file/export; obtain a reviewed plan amendment. Do not add a rollout-specific global, bridge, client define, or conditional installation.

`expectProtectedSnapshotEqual()` compares schema/indexes and every array entry by exact `encodedKey` plus exact `canonicalBytes` across all nine schema-2 stores against `expectedBeforeFloorSnapshot`, never against `initialCandidateSnapshot`. It never compares array position, `value` object identity, or JSON-stringified keys. Its only allowed mutations are exact encoded transcript keys `tr_rollout_floor_saved` and `tr_rollout_floor_deleted`, the two IDs named by `FloorMutationExpectation`; it separately requires their complete returned canonical records. No settings, draft, candidate/conflict/remote-quarantine, sync-metadata, pending-operation, sync-state, meta, or migration-quarantine mutation is allowed. Protected content includes `tr_rollout_survivor`, the candidate-renamed record, candidate-delete tombstone, original tombstone, invalid-overlap draft, conflict candidate, sync metadata, unbound pending variant, and verifying pending variant. For every identity it preserves exact `remoteKey`, `candidateHash`, `acceptedPayloadHash`, and `bodyByteHash`; for pending attempts it also preserves exact desired/attempted hashes, envelope JSON, MIME, filename, generated ID, and private properties. It never normalizes an invalid draft, flattens pending variants, drops hashes, ignores unknown fields, or excludes candidate rename/delete effects.

`expectedAfterFloorMutation(expectedBeforeFloorSnapshot, floorMutation)` clones the post-candidate expected snapshot and applies only the two returned floor transcript records. It is the sole expected post-floor state. No helper derives floor expectations from the stale pre-candidate snapshot.

## 5. One-origin sequential rollout topology

The rollout directory must exist before any worktree, build, artifact, or control-file write. The rollout uses Vite 8, the pinned project version; `vite preview` supports the explicit existing `--outDir` directory contract used below. Candidate and floor `dist` directories must already exist and contain `index.html` before `startPreview` runs. Do not use a shared or implicit `dist` path.

### Task 4: Create `tests/e2e/rollout.spec.ts`

The Playwright test owns preview processes and the persistent context. It reads one test-owned control file at `.rollout-phase-7/artifacts.json`; no client environment bridge exists. The file is generated after both builds, contains only `candidateDist` and `floorDist`, and is removed with `.rollout-phase-7`. `ROLLBACK-01` uses a top-level test-owned `test.skip(!existsSync(controlFile), "ROLLBACK-01 requires immutable candidate/floor artifacts")`; therefore pre-artifact full-suite verification compiles/discovers the scenario and records one exact gated skip, while the explicit drill with the control file must run and pass. No environment variable controls this gate.

```json
{"candidateDist":"<absolute candidate dist>","floorDist":"<absolute floor dist>"}
```

The test resolves `candidateDist` and `floorDist`, requires different absolute directories containing `index.html`, and derives separate absolute roots/cwds:

```ts
interface Artifact {
  label: "candidate" | "floor"
  dist: string
  root: string
  cwd: string
}

const candidateRoot = path.dirname(candidateDist)
const floorRoot = path.dirname(floorDist)
const candidate: Artifact = { label: "candidate", dist: candidateDist, root: candidateRoot, cwd: candidateRoot }
const floor: Artifact = { label: "floor", dist: floorDist, root: floorRoot, cwd: floorRoot }
const PORT = 4187
const ORIGIN = "http://127.0.0.1:4187"
const READY_URL = `${ORIGIN}/index.html`
```

Preview helper signature and command are exact:

```ts
interface RunningPreview { artifact: Artifact; child: ChildProcess }

function startPreview(artifact: Artifact): RunningPreview {
  const child = spawn(
    "pnpm",
    ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", "4187", "--strictPort", "--outDir", artifact.dist],
    { cwd: artifact.cwd, stdio: "pipe", shell: process.platform === "win32" },
  )
  return { artifact, child }
}
```

`waitUntilReady(preview)` polls only `READY_URL` every 100 ms for at most 10 seconds. Success requires HTTP 200 and `preview.child.exitCode === null`. Child exit before readiness, non-200 timeout, fetch timeout, or strict-port failure fails the test with artifact label, cwd, dist, and captured stderr.

`stopPreview(preview)` performs process-tree termination (`taskkill /pid <pid> /T /F` on Windows; `SIGTERM` elsewhere), requires child exit within five seconds, then polls only `READY_URL` every 100 ms for at most five seconds. Success requires network failure; any HTTP response, including non-200, means the origin remains reachable and cleanup fails. Failed signal, failed `taskkill`, child timeout, stale descendant, or reachable `/index.html` fails the test. The next preview is never started until this unreachable proof succeeds.

One profile is created once with `mkdtemp(path.join(tmpdir(), "whisdom-rollout-"))` and passed once to `chromium.launchPersistentContext`. One page and the same IndexedDB origin/database are reused for candidate, floor, and forward candidate. No two previews overlap.

Exact sequence:

1. Build protocol-valid fixtures in Node.
2. Start candidate at strict port 4187; require exact readiness.
3. Navigate to `/?view=workbench`; require final Workbench `h1`, `[data-testid="workbench-page"]`, and preserved `[data-testid="compatibility-product-ready"]`.
4. Seed through `seedRolloutDatabase(page, fixture)` while candidate is running; immediately read and retain `initialCandidateSnapshot`. This snapshot proves fixture construction only and is never used as the floor comparison baseline.
5. Navigate to `/?view=library`; require `h1` named `Library` and `[data-testid="library-page"]`.
6. Use visible row action `button` named `Open Rollout survivor`; require URL `/?view=transcript&id=tr_rollout_survivor`, one `h1` named `Rollout survivor`, `[data-testid="transcript-page"]`, `tablist`, and no dialog.
7. Rename through textbox named `Transcript title`, wait for `[data-save-state]` to say `Saved locally`, return with link named `Back to Library`, delete through button named `Delete Rollout candidate delete`, confirm with button named `Delete transcript`, and verify the row disappears. These are final Phase 4 Workbench/Library/full-page editor roles and testids.
8. After both candidate mutations settle, read and retain `expectedBeforeFloorSnapshot`. Assert it differs from `initialCandidateSnapshot` exactly at the candidate rename and candidate delete records and preserves every explicit protected record/hash. This post-candidate snapshot—not the initial snapshot—is the floor baseline.
9. Stop candidate, require child exit and `/index.html` unreachable.
10. Start floor on the same strict port; require readiness. Navigate to the Slice 1A compatibility landing contract and require visible `[data-testid="compatibility-product-ready"]`, then obtain `floorMutation` from `mutateThroughFloorCompatibility(page)`. Do not assert legacy heading copy, use final-route selectors against the floor, or use any result-dialog selector.
11. Read `duringFloor`; call `expectProtectedSnapshotEqual(duringFloor, expectedBeforeFloorSnapshot, floorMutation)`, then derive `expectedAfterFloorSnapshot = expectedAfterFloorMutation(expectedBeforeFloorSnapshot, floorMutation)` and require full byte-equivalent equality with `duringFloor`. Only the two explicit floor transcript mutations differ from `expectedBeforeFloorSnapshot`.
12. Stop floor and prove `/index.html` unreachable.
13. Start candidate again on strict port 4187; require readiness. Before any forward mutation, read `forwardCandidateSnapshot` and require full byte-equivalent equality with the correct `expectedAfterFloorSnapshot`; never compare it with `initialCandidateSnapshot`.
14. Navigate through final Workbench → Library → full-page Transcript route. Open the floor-created live row using `button` named `Open Rollout floor saved`, require `[data-testid="transcript-page"]`, edit textbox `Transcript title`, wait for `[data-save-state]`, return to Library, delete through `Delete Rollout floor saved`, confirm `Delete transcript`, and verify tombstone state through `readRolloutDatabase`.
15. Build `expectedAfterForwardCandidateSnapshot` from `expectedAfterFloorSnapshot` by applying only the observed forward rename/delete records. Require full byte-equivalent equality with the final snapshot and reassert every explicit protected record/hash, earlier candidate rename/delete, original tombstone, and both floor records' causal lineage.
16. Stop forward candidate and prove `/index.html` unreachable.

Compatibility assertions also record IndexedDB opens from the test itself by wrapping `indexedDB.open` only inside each explicit `page.evaluate` call and restoring it before return. No observation array is attached to `window` or `globalThis`. Floor helper calls must observe only omitted versions; any numeric floor open or `VersionError` fails.

Runtime error collection is test-local (`pageerror` and console error listeners). Clear only after each phase has asserted an empty list; never suppress or filter `VersionError`.

Cleanup uses `try/finally`. It accumulates the primary failure plus every cleanup failure. In `finally`: stop any active preview and prove `READY_URL` unreachable; close the persistent context; remove the profile with `force:false`; prove the profile path absent. Readiness timeout, early child exit, kill failure, stale reachability, context-close failure, profile-removal failure, remaining profile path, or any runtime error makes the test fail. Cleanup errors are appended to—not substituted for—the primary failure.

## 6. Commit the verified Phase 7 candidate

### Task 5: Full verification, exact staging, candidate commit, and clean SHA capture

No rollback worktree, `.rollout-phase-7` directory, candidate/floor artifact, or `artifacts.json` may exist before this task completes. An uncommitted candidate drill is prohibited.

- [ ] Run Phase 7-focused and full verification after Tasks 1–4 have made all source/test changes:

```powershell
pnpm vitest run tests/unit/legacy-removal.test.ts
pnpm playwright test tests/e2e/rollout.spec.ts --list --project=chromium
pnpm typecheck
rtk lint
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Expected: every command exits 0; lint has zero warnings; `rollout.spec.ts --list` compiles and discovers exactly `ROLLBACK-01` without requiring artifacts; full E2E has only documented real-runtime skips plus the exact pre-artifact `ROLLBACK-01 requires immutable candidate/floor artifacts` skip.

- [ ] Remove generated `dist`, `test-results`, reports, traces, videos, screenshots not designated by Phase 6, caches, and temporary profiles. Inspect unstaged changes. Stage only the exact Phase 7 ownership paths, including deletion:

```powershell
git add src/app/AppShell.tsx
git add -- src/app/LegacyProduct.tsx
git add -- src/features/google-drive/drive.ts
git add tests/unit/legacy-removal.test.ts
git add tests/e2e/fixtures/rollout.ts
git add tests/e2e/rollout.spec.ts
git diff --cached --name-status
git diff --cached
```

Expected staged manifest: exactly six paths—`M src/app/AppShell.tsx`, `D src/app/LegacyProduct.tsx`, `D src/features/google-drive/drive.ts`, and `A` for the three exact test files. `src/App.tsx` is unchanged and unstaged. Any other path stops the task; never use `git add .` or `git add -A`.

- [ ] Commit the complete verified candidate, then require clean status before reading its SHA:

```powershell
git commit -m "chore: prepare precision studio rollout candidate"
if (git status --porcelain) { git status --short; throw 'Candidate commit must be clean before SHA capture' }
$candidateSha = (git rev-parse HEAD).Trim()
if ($candidateSha -notmatch '^[0-9a-f]{40}$') { throw 'Candidate SHA must be a full lowercase commit SHA' }
pnpm release:check-rollback-floor -- $candidateSha
if ($LASTEXITCODE -ne 0) { throw 'Committed candidate is not at or above rollback floor' }
```

`candidateSha` is assigned only after the commit and empty `git status --porcelain`. Record it as the sole rollout candidate. Do not amend this commit after artifacts start. Do not push or deploy unless separately requested.

## 7. Build immutable artifacts and run drill

- [ ] Validate floor evidence and checker tests. Require current full candidate SHA accepted; require abbreviated/pre-floor and missing-argument invocations rejected with contractual exits.
- [ ] Create detached candidate and floor worktrees under `.rollout-phase-7`; install with frozen lockfile; build normally. No rollout, smoke, or `VITE_*` environment variable is set.

```powershell
$root = 'F:\Workspace\whisdom\whisdom-precision-studio'
$rollout = Join-Path $root '.rollout-phase-7'
$null = New-Item -ItemType Directory -Force -Path $rollout
$candidateTree = Join-Path $rollout 'candidate'
$floorTree = Join-Path $rollout 'floor'
$record = Get-Content (Join-Path $root 'docs/releases/precision-studio-slice-1a.json') -Raw | ConvertFrom-Json
if (-not $candidateSha -or $candidateSha -ne (git rev-parse HEAD).Trim()) { throw 'Use the clean committed candidate SHA captured in Task 5' }
if (git status --porcelain) { throw 'Rollout artifacts require the clean committed candidate tree' }
if ((Test-Path $candidateTree) -or (Test-Path $floorTree) -or (Test-Path (Join-Path $rollout 'artifacts.json'))) { throw 'Rollout worktree or artifact already exists; inspect ownership' }
git worktree add --detach $candidateTree $candidateSha
git worktree add --detach $floorTree $record.lowerCommitSha
pnpm --dir $candidateTree install --frozen-lockfile
pnpm --dir $floorTree install --frozen-lockfile
pnpm --dir $candidateTree build
if ($LASTEXITCODE -ne 0) { throw 'Candidate artifact build failed' }
pnpm --dir $floorTree build
if ($LASTEXITCODE -ne 0) { throw 'Floor artifact build failed' }
$candidateDist = (Resolve-Path (Join-Path $candidateTree 'dist')).Path
$floorDist = (Resolve-Path (Join-Path $floorTree 'dist')).Path
if (-not (Test-Path (Join-Path $candidateDist 'index.html'))) { throw 'Candidate outDir must exist and contain index.html' }
if (-not (Test-Path (Join-Path $floorDist 'index.html'))) { throw 'Floor outDir must exist and contain index.html' }
@{ candidateDist = $candidateDist; floorDist = $floorDist } |
  ConvertTo-Json -Compress |
  Set-Content -NoNewline (Join-Path $rollout 'artifacts.json')
```

- [ ] Run:

```powershell
pnpm playwright test tests/e2e/rollout.spec.ts --project=chromium --reporter=list
```

Expected terminal result: one passing `ROLLBACK-01` test. It proves sequential candidate → floor → candidate on `http://127.0.0.1:4187`, one persistent profile/database, final candidate routes and mutation flows, Slice 1A compatibility behavior, exact protected data, and complete process/profile cleanup.

- [ ] Remove only generated worktrees and `.rollout-phase-7`. Failure or modified detached worktree blocks force removal and invokes the stop rule.

## 8. Final regression and release gate

```powershell
pnpm typecheck
rtk lint
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

- [ ] Run all named REC/WB/RUN/QUEUE/ERR/EDIT/SAVE/MIG/LIB/GIS/DRV/PRIV/NAV/I18N/PERF/A11Y/VIS families.
- [ ] Run worker typecheck only when worker-facing files changed; otherwise record exact skip reason.
- [ ] Run gated real-ASR/WebGPU checks only in available environments; record pass/skip honestly.
- [ ] Confirm no generated output, worktree, profile, rollout-specific environment bridge, rollout-specific browser global, stale preview, or unrelated change remains. The required pre-existing Slice 1A compatibility global is not removed or replaced by Phase 7.
- [ ] Obtain final code, privacy, migration, accessibility, and release review.

Task 5 creates the required local candidate commit. No additional commit, amend, push, or deployment occurs unless explicitly requested. Rollout evidence always identifies that clean committed candidate SHA; uncommitted-candidate drills are invalid.
