# Precision Studio UI Redesign Master Rollout Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Whisdom's monolithic UI with a release-safe, local-first Precision Studio workbench, canonical transcript editor, Library, and immutable Google Drive transcript sync without losing existing data or weakening privacy.

**Architecture:** Deliver one protected feature branch through seven ordered phase plans. Slice 1 first establishes a deployed versionless IndexedDB compatibility opener and permanent rollback floor, then migrates to schema 2 and introduces focused app, repository, runtime, editor, Library, and sync boundaries; later phases consume the pinned contracts below rather than redefining them. IndexedDB remains authoritative, React remains presentation/edit state, runtime adapters own provider resources and cancellation, and Drive remains an optional transcript-only replica.

**Tech Stack:** Node 24, pnpm 11.5.2, Vite 8, React 19, TypeScript 6, Tailwind CSS 4, Radix/shadcn, IndexedDB/idb 8, Transformers.js, ONNX Runtime Web, ffmpeg.wasm, TanStack Virtual 3, RFC 8785 canonicalization, Vitest 4, Testing Library, jsdom, Playwright 1.60, axe-core 4.12.

---

## Context & Decisions

| Decision | Rationale | Source |
| --- | --- | --- |
| Keep Slice 1A rollback parsing in Foundation-owned `src/features/storage/compatibility.ts`, separate from Slice 1B canonical modules | The rollback floor must parse and project v2 without importing code that does not exist in the independently deployed artifact; conformance can be tested after 1B | `ref:required-aquamarine-wildcat` |
| Create `MeasuredProgress` once in Phase 2 Workbench types and import it from Phase 3 runtime | Prevents queue/runtime field drift and fabricated progress semantics | `ref:dual-black-bee` |
| Treat Drive listings as observations and stabilize by complete-set repetition | Drive pagination and `incompleteSearch` cannot establish absence or causal ordering | `ref:fantastic-gold-macaw` |
| Use distinct absolute candidate/floor preview artifacts with one persistent profile | Rollback evidence must exercise the shipped floor against the same v2 database without ambiguous Vite root/output resolution | `ref:required-aquamarine-wildcat` |

The official URLs and specification citations remain in Section 14; these references identify the reviewer research decisions that corrected this rollout contract.

## 1. Authority, workspace, and baseline

This plan governs implementation from the approved specification at `docs/superpowers/specs/2026-07-29-ui-redesign-design.md`, commit `4098fe355588ae1331a1f574a72a42e022bcfaae`. If a phase plan conflicts with that specification or this master contract, stop and correct the phase plan before implementation.

Reviewer blocker resolutions in Sections 4, 5.3A, 5.4, 5.5, 5.6, 5.8, 5.9, 7, 8, 9, 12, 13, and Appendix B are authoritative. They pin the compatibility parser, progress type, fixture APIs, queue selection, Drive type ownership, and rollback drill after cross-plan review. No phase may implement a contradictory older snippet (`ref:dual-black-bee`; `ref:fantastic-gold-macaw`; `ref:required-aquamarine-wildcat`).

- Branch: `feature/precision-studio-redesign`
- Isolated worktree: `F:\Workspace\whisdom\whisdom-precision-studio`
- Base repository: `F:\Workspace\whisdom\whisdom`
- Main branch: `master`
- Approved specification commit: `4098fe355588ae1331a1f574a72a42e022bcfaae`
- Baseline: `pnpm typecheck`, `rtk lint`, `pnpm test`, and `pnpm build` pass.
- Baseline Playwright: 12 pass, 3 gated skip, and 2 pre-existing strict-locator defects hidden by `expect(...).first()` at `tests/e2e/whisdom.spec.ts:196` and `tests/e2e/whisdom.spec.ts:248`.
- Phase 1 Foundation removes both `.first()` workarounds by fixing duplicate error rendering before any new product flow begins.

All implementation, tests, reviews, and release markers occur in this worktree. Do not edit the base worktree, switch this worktree to another branch, or copy uncommitted files between worktrees.

## 2. Non-negotiable release topology

Production order is hard, not advisory:

1. Phase 1 Foundation: dependency/test harness, baseline strict-locator repair, contracts needed by both compatibility slices.
2. Slice 1A: versionless compatibility opener, current usable product flow, v1/v2 open support, unsupported-newer rejection.
3. Deploy Slice 1A independently. Record deployed commit, deployment URL, time, and successful v1/v2 smoke evidence.
4. Declare that deployed Slice 1A commit the permanent rollback floor.
5. Slice 1B: transactional v1→v2 migration, query shell, repository boundaries, typed-copy extension, tokens, accessibility and lazy-route baseline.
6. Expose v2 only after Step 3 is complete and verified.
7. After any production client exposes/opens v2, rollback may target only the deployed Slice 1A-compatible build or newer. Never deploy a pre-1A build.
8. Implement Phases 2, 3, 4, and 5 in order.
9. Integrate Phases 6 and 7 into the same release train. They are hardening/cleanup gates, not independently marketed or deployed features.

Release automation or runbooks must reject a rollback target older than the recorded Slice 1A floor. A code review approval cannot waive this rule.

### 2.1 Slice 1A release artifact and deployment sequence

Slice 1A adds exactly these release controls: `docs/releases/precision-studio-slice-1a.json`, `scripts/check-rollback-floor.mjs`, `docs/runbooks/precision-studio-rollback.md`, and package script `release:check-rollback-floor` with value `node scripts/check-rollback-floor.mjs`. The evidence file uses this exact closed schema; no omitted, null, abbreviated, or extension field is valid:

```ts
export type Slice1AReleaseEvidence =
  | {
      schemaVersion: 1
      status: "awaiting-deployment"
      lowerCommitSha: string
      deploymentUrl: string
      deployedAtUtc: string
      verifiedAtUtc: string
      approvedBy: string
      approvedAtUtc: string
      smoke: {
        fresh: "pending"
        v1: "pending"
        v2: "pending"
        unsupportedV3: "pending"
      }
    }
  | {
      schemaVersion: 1
      status: "deployed"
      lowerCommitSha: string
      deploymentUrl: string
      deployedAtUtc: string
      verifiedAtUtc: string
      approvedBy: string
      approvedAtUtc: string
      smoke: {
        fresh: "passed"
        v1: "passed"
        v2: "passed"
        unsupportedV3: "passed"
      }
    }
```

For `awaiting-deployment`, `deploymentUrl`, `deployedAtUtc`, and `verifiedAtUtc` are exactly `""`; `lowerCommitSha` is the full 40-character lowercase SHA of the independently releasable Foundation+Slice-1A commit; `approvedBy` is a non-empty GitHub login matching `^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$`; `approvedAtUtc` is canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ`; and every smoke value is `pending`. The automated checker validates this syntax, status-dependent fields, and timestamps only; it cannot establish that the account or action is human. Release review must manually attest that the recorded GitHub login belongs to the human who approved the release and that approval occurred outside automation. For `deployed`, `lowerCommitSha`, `approvedBy`, and `approvedAtUtc` remain unchanged; `deploymentUrl` is the exact HTTPS production URL; `deployedAtUtc` and `verifiedAtUtc` are canonical UTC timestamps; and all four smoke values are `passed`. Transition is one-way from awaiting deployment to deployed after production verification. Any malformed field, invalid status-specific field, invalid approver-login syntax, noncanonical timestamp, non-HTTPS deployed URL, abbreviated SHA, unknown key, or non-ancestor floor fails closed.

Existing `.github/workflows/ci.yml` push-to-`master` remains the sole GitHub Pages deployment path. Do not create another deployment workflow. `workflow_dispatch` validates/builds only and does not deploy. Independent release procedure is exact:

1. Land only Phase 1 Foundation and Slice 1A on `master` after explicit human release approval; no Slice 1B file or v2-upgrade call may be present.
2. Push that descendant commit to `master`; the existing push trigger runs CI and Pages deployment.
3. Smoke the deployed URL through the product and public compatibility API, then commit the `deployed` evidence update as a later evidence-only descendant commit.
4. Block Slice 1B merge, release, and every numeric-version-2 IndexedDB open until that evidence commit is on `master` and the checker exits 0 for the proposed full commit SHA.

`scripts/check-rollback-floor.mjs` accepts exactly one candidate full SHA argument, reads and strictly validates the evidence JSON, and checks Git ancestry. Exit codes are contractual: `0` only when evidence status is `deployed` and candidate equals or descends from `lowerCommitSha`; `1` for malformed/missing/unreadable evidence, awaiting status, unavailable Git evidence, non-full SHA, or a candidate that predates/is not descended from the floor; `2` for invocation/usage errors. The checker never treats commit date, branch name, tag, approval text, network status, or workflow success as ancestry proof.

Rollback and recovery always move production to a known descendant commit. Prefer a roll-forward fix; otherwise revert faulty commits on `master` and deploy the resulting descendant. Never reset or force-move `master`, and never redeploy an artifact whose source commit predates the floor. The runbook includes exact preflight, evidence inspection, checker invocation, existing CI Pages observation, v2 browser smoke, and forward redeploy steps.

Required release-control commands from repository root:

```powershell
pnpm vitest run tests/unit/rollback-floor.test.ts
$candidateSha = (git rev-parse HEAD).Trim()
pnpm release:check-rollback-floor -- $candidateSha
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Expected: tests/checks exit `0`, lint reports zero warnings, and E2E reports only documented gated skips. Checker tests cover equal SHA, descendant SHA, pre-floor SHA, divergent SHA, awaiting deployment, malformed schema, missing evidence, and usage exit `2`.

After the push-triggered Pages job reports its production URL, run deployed `MIG-01` exactly:

```powershell
$deploymentUrl = Read-Host "Deployed HTTPS URL"
$env:WHISDOM_E2E_BASE_URL = $deploymentUrl
try {
  pnpm playwright test tests/e2e/migration.spec.ts --grep "MIG-01" --reporter=list
} finally {
  Remove-Item Env:WHISDOM_E2E_BASE_URL -ErrorAction SilentlyContinue
}
```

`playwright.config.ts` uses `WHISDOM_E2E_BASE_URL` only when non-empty and otherwise preserves its current built-preview behavior. The scenario seeds each fresh/v1/v2/unsupported-v3 browser fixture before navigation, then requires visible `[data-testid="compatibility-product-ready"]` and drives public compatibility-adapter list/open/save/rename/delete/reopen behavior. Slice 1A installs this product-readiness marker on its legacy surface; final Workbench preserves the same marker, so MIG-01 remains runnable against both artifacts without asserting legacy heading copy. Unsupported-v3 switches to Vietnamese, asserts exact `Xem chi tiết`, opens the fatal tree's rendered details dialog, and observes `storage.unsupported-version`; it never makes an English action assertion after locale switch. The fatal early-return tree contains both `ProductErrorPanel` and its controlled details `Dialog`, rather than referencing the normal return's unreachable dialog. It does not assert final Library or full-page Transcript routes, which exist only in the Phase 7 rollout candidate. The scenario exits nonzero unless all four cases pass. Copy the exact validated URL and UTC results into the evidence file; do not type smoke results manually without this run.

## 3. Runtime and dependency contract

### Node and package manifest

Phase 1 Foundation creates `.node-version` with exactly:

```text
24
```

`package.json` adds:

```json
{
  "engines": {
    "node": ">=22.22.2"
  }
}
```

Pin these additions and let `pnpm` update `pnpm-lock.yaml`:

- Runtime dependencies: `@tanstack/react-virtual@^3.14.9`, `canonicalize@^3.0.0`.
- Development dependencies: `@testing-library/react@^16.3.2`, `@testing-library/dom@^10.4.1`, `@testing-library/user-event@^14.6.1`, `@testing-library/jest-dom@^7.0.0`, `jsdom@^30.0.1`, `fake-indexeddb@^6.2.5`, `axe-core@~4.12.1`, `@axe-core/playwright@~4.12.1`.
- Keep existing `@playwright/test@^1.60.0`; do not opportunistically upgrade it.

Caret/tilde values above are declared manifest ranges, not floating release instructions. The generated `pnpm-lock.yaml` locks exact resolved versions and integrity; every install/build/release uses `pnpm install --frozen-lockfile`. Dependency changes require an intentional manifest plus lockfile review.

`axe-core` remains a direct development dependency because component tests run axe directly inside jsdom/browser-like fixtures; `@axe-core/playwright` covers browser E2E integration and does not supply that component-test API.

Do not add `react-router`, `sonner`, `cmdk`, `dnd-kit`, `jest-axe`, `vitest-axe`, or `core-js`. Query navigation is small and static-host-specific; existing Radix/shadcn primitives cover overlays and menus; queue reorder requires buttons and makes drag optional; Vitest can invoke `axe-core` directly; supported Node/browser targets need no blanket polyfill.

### Test harness

Phase 1 **modifies the existing `vitest.config.ts`** and creates `tests/setup.ts` plus `tests/components/` support. It must not replace the current config wholesale or discard existing aliases, include/exclude behavior, coverage settings, or project defaults. Unit and component tests run in deliberate environments: pure tests stay Node; DOM component files opt into jsdom. `tests/setup.ts` imports `@testing-library/jest-dom/vitest`, installs deterministic cleanup, and never mutates production globals beyond test scope.

## 4. Final file tree and ownership map

Existing files remain unless a phase explicitly replaces or deletes them. Every new path below is created by the named phase plan; phase writers may split a file further only after updating this master and all later phase plans in the same documentation change.

```text
.node-version                                      # Phase 1: Node major contract
package.json                                      # Phase 1 Foundation dependencies/engine; Slice 1A release script
pnpm-lock.yaml                                    # Phase 1 Foundation exact dependency lock
vitest.config.ts                                  # Phase 1 Foundation: Modify existing config
vite.config.ts                                    # Phase 5: exact-origin CSP transformIndexHtml owner
build/csp.ts                                      # Phase 5: pure optional-origin CSP builder
index.html                                        # Phase 5: CSP placeholder and exact GIS script
.env.example                                      # Phase 5: public Google ID and optional transcription URL rules
tests/setup.ts                                    # Phase 1 Foundation: Create component harness setup
playwright.config.ts                              # Slice 1A: Modify to accept optional WHISDOM_E2E_BASE_URL
docs/releases/precision-studio-slice-1a.json       # Slice 1A awaiting evidence; post-deploy evidence-only update
docs/runbooks/precision-studio-rollback.md         # Slice 1A: rollback/roll-forward procedure
docs/superpowers/reviews/phase-6-product-defect-<scenario>.md # Phase 6 optional sole non-test/config stop record
scripts/check-rollback-floor.mjs                   # Slice 1A: fail-closed floor checker
src/main.tsx                                       # Phase 1B: providers and thin app entry
src/App.tsx                                        # Slice 1B thin AppShell adapter; unchanged thereafter
src/app/LegacyProduct.tsx                          # Slice 1B extracted legacy product owner; Phase 7 deletes
src/index.css                                      # Phase 1B tokens, typography, focus, reduced motion
src/app/AppShell.tsx                               # Phase 1B semantic shell and lazy route outlet
src/app/RuntimeCoordinatorProvider.tsx             # Phase 3 AppShell-scoped queue/coordinator lifetime
src/app/navigation.ts                              # Phase 1B query parsing/history/focus/dirty guard contract
src/app/copy-types.ts                              # Foundation dependency-free InterfaceLanguage/defineCopy/copy helper types
src/app/copy.ts                                    # Foundation shell/Settings composition root; imports feature copy and builds COPY_REGISTRY
src/app/toast-store.ts                             # Phase 3 confirmation-only FIFO external store
src/app/use-app-route.ts                           # Phase 1B popstate subscription and route commands
src/app/work-activity-store.ts                     # Phase 1B active transcription/conversion Settings guard
src/components/ui/*                                # Existing/reused low-level primitives only
src/components/product/AppHeader.tsx               # Phase 1B header, desktop nav, Drive/menu slots
src/components/product/MobileNavigation.tsx        # Phase 1B Workbench/Library bottom navigation
src/components/product/ProductErrorPanel.tsx       # Foundation creates one scoped issue/error renderer; Slice 1B consumes
src/components/product/RoutePending.tsx            # Phase 1B localized stable lazy-route fallback
src/features/transcription/types.ts                # Existing legacy bridge; Slice 1B canonical/draft/repository types
src/features/transcription/canonical.ts            # Slice 1B scalar checks, CANONICAL_WS, normalization/bounds
src/features/transcription/schema.ts               # Slice 1B canonical schema-2 parse/serialize guards
src/features/transcription/legacy.ts               # Slice 1B strict remote/local-v1 conversion policies
src/features/transcription/hashes.ts               # Phase 1B RFC 8785 wrappers and four distinct digest domains
src/features/transcription/exports.ts              # Phase 4 canonical TXT/JSON/SRT/VTT output
src/features/transcription/models.ts               # Existing model catalog; Phase 2 modifies defaults and E2E catalog seam
src/features/transcription/runtime.ts              # Phase 3 normalized runtime contracts/events
src/features/transcription/runtime-coordinator.ts  # Phase 3 sequential active-run ownership
src/features/transcription/adapters/local.ts        # Phase 3 local ASR/ffmpeg adapter
src/features/transcription/adapters/cloudflare.ts   # Phase 3 Cloudflare adapter
src/features/transcription/adapters/server.ts       # Phase 3 server/SSE/cancel adapter
src/features/storage/database.ts                    # Slice 1A: versionless open; Phase 1B v2 open/upgrade
src/features/storage/compatibility.ts               # Slice 1A: permanent minimal v2 schema/parser/projection contract
src/features/storage/compatibility-api.ts           # Slice 1A: permanent public compatibility API installation/bootstrap
src/features/storage/indexed-db.ts                  # Slice 1A: version-aware current-API compatibility adapter; Phase 1B facade
src/features/storage/schema.ts                      # Phase 1B idb schema/store/index names
src/features/storage/migration.ts                   # Phase 1B transactional v1→v2 migration
src/features/storage/repositories.ts                # Phase 1B repository interfaces/factory
src/features/storage/transcript-repository.ts       # Phase 1B atomic transcript/draft/tombstone mutation
src/features/storage/sync-repository.ts             # Phase 1B operations/candidates/metadata/state transactions
src/features/storage/quarantine-repository.ts       # Phase 1B bounded local/remote quarantine access
src/features/storage/remote-types.ts                # Phase 1B storage-neutral remote quarantine metadata/write records
src/features/workbench/types.ts                     # Phase 2 queue/captured-setting/source and sole MeasuredProgress contract
src/features/workbench/recommendation.ts            # Phase 2 deterministic local/server policy
src/features/workbench/issues.ts                    # Phase 2 issue generation/dedupe/order
src/features/workbench/copy.ts                      # Phase 2 exact EN/VI Workbench/runtime copy
src/features/workbench/queue-reducer.ts             # Phase 2 pure queue state machine
src/features/workbench/queue-store.ts               # Phase 2 synchronous coordinator-owned external QueueStore
src/features/workbench/WorkbenchPage.tsx            # Phase 2 route composition
src/features/workbench/components/*                 # Phase 2 source/setup/review/stage/rail controls
src/features/workbench/components/WorkbenchCombobox.tsx # Phase 2 keyboard-complete combobox
src/features/workbench/components/StageRail.tsx     # Phase 2 non-blocking stage orientation
src/features/workbench/components/SourceSetup.tsx   # Phase 2 File/Link/setup controls
src/features/workbench/components/ReviewPanel.tsx   # Phase 2 canonical review and start gating
src/features/workbench/QueuePanel.tsx                # Phase 3 desktop queue presentation
src/features/workbench/QueueSheet.tsx                # Phase 3 mobile accessible sheet
src/features/workbench/RunProgress.tsx               # Phase 3 honest stage/elapsed/ETA presentation
src/features/transcript-editor/types.ts              # Phase 4 editor state/action contracts
src/features/transcript-editor/copy.ts               # Phase 4 exact EN/VI editor copy
src/features/transcript-editor/reducer.ts            # Phase 4 deterministic edits and bounded undo/redo
src/features/transcript-editor/autosave.ts            # Phase 4 600 ms serialized save/route guard bridge
src/features/transcript-editor/search.ts              # Phase 4 incremental segment search/yielding
src/features/transcript-editor/TranscriptPage.tsx     # Phase 1B creates lazy placeholder; Phase 4 replaces in place
src/features/transcript-editor/DocumentView.tsx       # Phase 4 segment-backed prose editing
src/features/transcript-editor/TimelineView.tsx       # Phase 4 millisecond timeline editing/virtualization
src/features/library/queries.ts                       # Phase 4 deterministic search/filter/sort/yielding
src/features/library/copy.ts                          # Phase 4 exact EN/VI Library copy
src/features/library/LibraryPage.tsx                  # Phase 1B creates lazy placeholder; Phase 4 replaces in place
src/features/library/TranscriptList.tsx               # Phase 4 visible actions and >200 virtualization
src/features/library/actions.ts                       # Phase 4 rename/export/delete/observed Undo orchestration
src/features/settings/validation.ts                  # Phase 1B pure bounded Settings numeric parsers
src/features/settings/SettingsPage.tsx                # Phase 1B final lazy validated Settings route and cleanup controls
src/features/storage/sync-types.ts                    # Phase 1B sole durable publication/candidate/sync record owner; no Drive import
src/features/google-drive/types.ts                    # Phase 1B Drive candidate/resolver/snapshot/service contracts; Phase 5 identity/transport/parser/verifier declarations
src/features/google-drive/constants.ts                # Phase 5 sole Drive/GIS scopes, issuer/hosts, MIME, property names, caps/limits
src/features/google-drive/copy.ts                     # Phase 5 exact EN/VI Drive identity/sync copy
src/features/google-drive/identity.ts                 # Phase 5A GIS attempt/watchdog/scope/token/revoke logic
src/features/google-drive/avatar.ts                   # Phase 5A bounded exact-host Blob avatar fetch
src/features/google-drive/transport.ts                # Phase 5A Drive HTTP transport, pagination, generated IDs
src/features/google-drive/parser.ts                   # Phase 5C streamed cap/fingerprint/strict body validation
src/features/google-drive/resolver.ts                 # Phase 5C pure candidate-set resolution
src/features/google-drive/publication.ts              # Phase 5B bind/create and sole verifyPublishedCandidate declaration/body
src/features/google-drive/desired-publication.ts     # Phase 5B account-bound canonical desired-publication factory
src/features/google-drive/reconcile.ts                # Phase 5C coalesced non-snapshot reconciliation
src/features/google-drive/sync-service.ts             # Phase 5 external store and triggers
src/features/google-drive/legacy-migration.ts          # Phase 5B strict bounded old Drive import
tests/unit/canonical.test.ts                          # scalar, whitespace, timing, canonical text
tests/unit/compatibility.test.ts                      # Slice 1A rollback parser contract
tests/unit/compatibility-conformance.test.ts          # Phase 1B rollback/canonical parser fixture parity
tests/unit/schema-hashes.test.ts                      # exact schema, RFC 8785 bytes, digest domains
tests/unit/legacy-migration.test.ts                   # strict remote/local-v1 conversion and quarantine
tests/unit/language.test.ts                           # Existing language tests; Phase 1 modifies for shared interface-language contract
tests/unit/database.test.ts                           # versionless open, v2 stores/indexes, abort safety
tests/unit/repositories.test.ts                       # Phase 1B repository/failure-port transaction contracts
tests/unit/indexed-db-compat.test.ts                  # Slice 1A Task 6 creates for v1/v2 projections and mutation refusal
tests/unit/rollback-floor.test.ts                     # evidence schema and ancestry checker behavior
tests/unit/recommendation.test.ts                     # REC policy precedence
tests/unit/queue-reducer.test.ts                      # queue transitions and sequential selection
tests/unit/runtime.test.ts                            # Phase 3 Task 1 creates; later Phase 3 tasks modify
tests/unit/runtime-adapters.test.ts                   # Phase 3 Task 2 creates; later Phase 3 tasks modify
tests/unit/server-api.test.ts                         # server submit/cancel/SSE client compatibility
tests/unit/editor-reducer.test.ts                     # deterministic split/merge/paste/undo/timing
tests/unit/editor-search.test.ts                      # search traversal and yielding
tests/unit/library.test.ts                            # deterministic query/filter/tombstone behavior
tests/unit/exports.test.ts                            # Phase 4 exact canonical/draft export bytes
tests/unit/drive-identity.test.ts                     # Phase 5 Task 1 creates; later tasks modify for GIS, scopes, token margin, avatars
tests/unit/drive-parser.test.ts                       # streamed body cap, fingerprint, exact remote parser
tests/unit/drive-resolver.test.ts                     # exhaustive candidate-set permutations
tests/unit/drive-publication.test.ts                  # binding, same-ID retry, exact verification
tests/unit/drive-reconcile.test.ts                    # Phase 5 Task 4 creates; Task 11 and Phase 6 modify
tests/unit/settings-validation.test.ts                # bounded numeric settings
tests/unit/workbench-issues.test.ts                   # Phase 2 issue dedupe/order/start gating
tests/unit/csp.test.ts                                # Phase 5 absent/valid/invalid optional-origin CSP
tests/unit/i18n.test.ts                               # Phase 6 registry parity/hardcoded-copy sentinel
tests/unit/legacy-removal.test.ts                     # Phase 7 thin shell/facade removal guard
tests/fixtures/transcripts.ts                         # Phase 1B canonical/legacy fixtures
tests/components/harness.test.tsx                     # Phase 1 Foundation jsdom/axe harness proof
tests/components/navigation.test.tsx                  # route focus and dirty guard UI
tests/components/product-errors.test.tsx              # Foundation creates singular-error baseline; Phase 3 modifies for stale/FIFO
tests/components/workbench.test.tsx                   # Phase 2 Task 3 creates; later phases modify
tests/components/queue.test.tsx                       # panel/sheet/reorder/cancel accessibility
tests/components/transcript-editor.test.tsx           # autosave, views, keyboard, dirty protection
tests/components/library.test.tsx                     # visible actions, recovery, virtualization continuity
tests/components/drive-identity.test.tsx              # Phase 5 Task 2 creates; later tasks modify account/reconnect/revoke states
tests/components/drive-sync.test.tsx                  # Phase 5 Task 7 creates; later tasks modify publication/conflict/sync states
tests/components/progress-profiler.test.tsx           # Phase 6 creates: 100-update render isolation
tests/components/accessibility.test.tsx               # Phase 6 creates: direct axe-core component states
tests/e2e/fixtures/database.ts                        # Slice 1A create; Phase 1B/4 extend; Phase 4 owns seedLibrary/seedTranscript
tests/e2e/fixtures/runtime.ts                         # Phase 2 create; Phase 3 owns installRuntimeFixture/openWorkbenchState
tests/e2e/fixtures/drive.ts                           # Phase 5 owns installDriveFixture/openIdentityState/openSyncState
tests/e2e/fixtures/settings.ts                        # Phase 1B owns openSettingsState default/validation states
tests/e2e/fixtures/accessibility.ts                   # Phase 6 matrix/axe/viewport/touch helpers
tests/e2e/fixtures/performance.ts                     # 1,000-row and 5,000-segment fixtures
tests/e2e/fixtures/database-contract.spec.ts          # Phase 4 database fixture contract consumer
tests/e2e/recommendation.spec.ts                      # REC-01..06
tests/e2e/workbench.spec.ts                           # WB-01..02
tests/e2e/runtime-queue.spec.ts                       # RUN-01..04, QUEUE-01, ERR-01
tests/e2e/editor-save.spec.ts                         # EDIT-01..04, SAVE-01..03
tests/e2e/migration.spec.ts                           # Slice 1A Task 6 creates for MIG-01; Phase 1B modifies for MIG-02/03
tests/e2e/library.spec.ts                             # LIB-01
tests/e2e/drive-identity.spec.ts                      # GIS-01..05
tests/e2e/drive-sync.spec.ts                          # DRV-01..06
tests/e2e/privacy.spec.ts                             # PRIV-01
tests/e2e/navigation-i18n.spec.ts                     # NAV-01, I18N-01
tests/e2e/performance.spec.ts                         # Phase 1 creates PERF-01; Phase 4 modifies for PERF-02/03; Phase 6 modifies
tests/e2e/accessibility.spec.ts                       # Phase 6 creates: A11Y-AUTO and observable manual assertions
tests/e2e/visual-regression.spec.ts                   # Phase 6 creates: VIS-01
tests/e2e/visual-baselines/ownership-manifest.json     # Phase 6 exact 42-baseline path/owner/scenario ledger
tests/e2e/fixtures/rollout.ts                         # Phase 7 Node-side canonical fixture and page IndexedDB helpers
tests/e2e/rollout.spec.ts                             # Phase 7 one-origin persistent-profile rollback drill
tests/e2e/server-mode.spec.ts                         # retained and expanded server flow
tests/e2e/real-transcription.spec.ts                  # retained gated real ASR/WebGPU flow
tests/e2e/whisdom.spec.ts                             # Phase 1 strict-error repair; later selector regression
```

`src/features/google-drive/drive.ts` remains only as a Phase 5 compatibility facade while imports move, then Phase 7 deletes it. `src/lib/transcription-worker-client.ts` remains the provider worker boundary, gains narrow per-type termination/recreation methods in Phase 3, and never becomes React state.

The tree above is the generated ownership ledger for every created path and every fixture/test/config/release/runbook/script path modified by these plans. Phase self-reviews compare their `Files` blocks and exact staging commands against it; a path missing from this ledger blocks implementation until master and affected phases are amended together. Phase 6 creates its named consolidated tests, `tests/e2e/fixtures/accessibility.ts`, `tests/unit/i18n.test.ts`, and the exact snapshot ownership manifest; Phases 1–5 keep changed-flow assertions in feature files. The schema-version-1 manifest contains the exact 42 normalized paths/owners/scenarios in Section 10.1, generated from seven named states × Light/Dark × desktop/390/320. `visual-regression.spec.ts` always rejects extra, duplicate, traversal, owner/scenario divergence, and manifest/matrix inequality; normal runs also reject missing disk baselines. Explicit Playwright update-snapshots mode alone may begin with missing expected files, but a post-generation validator still requires exact 42-entry manifest/matrix/disk equality. Visual baselines are EN-only; accessibility and behavior remain EN/VI. Phase 6 remains tests/harness/configuration-only except the expressly permitted scenario defect review record. It imports earlier database/runtime/Drive/Settings fixture APIs unchanged; missing exports stop Phase 6 and return to the owning phase.

## 5. Shared TypeScript contracts

These declarations are normative names and shapes. Exact validation logic belongs to the delegated phase file named after each block.

### 5.1 Query routes and navigation guard

Defined in `src/app/navigation.ts`; Phase 1B owns implementation and tests.

```ts
export type AppRoute =
  | { view: "workbench" }
  | { view: "library" }
  | { view: "transcript"; transcriptId: string }
  | { view: "settings" }

export type NavigationIntent =
  | { kind: "push"; route: AppRoute }
  | { kind: "replace"; route: AppRoute }
  | { kind: "pop"; route: AppRoute; historyIndex: number }

export type NavigationBlockReason = "dirty" | "saving" | "save-failed"

export type NavigationGuardDecision =
  | { status: "allowed" }
  | {
      status: "blocked"
      reason: NavigationBlockReason
      retry: () => Promise<void>
      discard: () => Promise<void>
    }

export interface NavigationGuard {
  check(intent: NavigationIntent): Promise<NavigationGuardDecision>
}

export interface AppNavigator {
  current(): AppRoute
  navigate(route: AppRoute): Promise<NavigationGuardDecision>
  replace(route: AppRoute): void
  setGuard(guard: NavigationGuard | null): void
  subscribe(listener: (route: AppRoute) => void): () => void
  dispose(): void
}

export function parseAppRoute(search: string): {
  route: AppRoute
  replace: boolean
}
export function serializeAppRoute(route: AppRoute): string
export function createAppNavigator(args: {
  window: Window
  guard: NavigationGuard | null
  focusRouteHeading: (route: AppRoute) => void
}): AppNavigator
```

`/` canonicalizes to Workbench without a push. Unknown views replace with Workbench. Transcript IDs are decoded once; missing/unknown records render localized not-found and never select another record. Pop navigation restores the editor history entry while blocked and guards replay loops.

### 5.2 Product errors, issues, and typed copy

Defined across dependency-free `src/app/copy-types.ts`, composition-root `src/app/copy.ts`, and `src/features/workbench/issues.ts`. Foundation creates `InterfaceLanguage`, copy helper/types, `SHELL_COPY`, `SETTINGS_COPY`, and the initial typed registry because Slice 1A consumes them. Feature copy modules import only `copy-types.ts`; `copy.ts` imports feature modules and builds the final registry. The mandatory graph is `copy-types.ts` → feature copy modules → `copy.ts`, never the reverse.

```ts
// src/app/copy-types.ts
export type InterfaceLanguage = "en" | "vi"
export type CopyPrimitive = string | number | boolean | null
export type CopyParams = Readonly<Record<string, CopyPrimitive>>
export type CopyLeaf = string | ((params: CopyParams) => string)
export type CopyShape = { readonly [key: string]: CopyLeaf | CopyShape }
export type LocalizedCopy<T extends CopyShape> = Readonly<{ en: T; vi: T }>
export function defineCopy<const T extends CopyShape>(copy: { en: T; vi: T }): LocalizedCopy<T>

// src/app/copy.ts
import type { CopyParams } from "@/app/copy-types"

export type ProductSeverity = "info" | "warning" | "error"
export type ProductScope =
  | "navigation"
  | "source"
  | "queue-item"
  | "runtime"
  | "save"
  | "library-item"
  | "identity"
  | "sync"
  | "settings"

export type RecoveryActionCode =
  | "choose-file"
  | "choose-model"
  | "use-safe-model"
  | "retry"
  | "retry-save"
  | "discard-draft"
  | "reconnect-drive"
  | "inspect-details"
  | "back-to-library"

export interface RecoveryAction {
  code: RecoveryActionCode
  params: CopyParams
}

export interface ProductError {
  occurrenceId: string
  code: string
  severity: "error"
  scope: ProductScope
  scopeId: string
  params: CopyParams
  primaryAction: RecoveryAction
  secondaryAction: RecoveryAction | null
  retryable: boolean
  technicalCause: {
    providerStatus: number | null
    safeCode: string | null
    developmentStack: string | null
  } | null
}

export interface ProductIssue {
  code: string
  severity: ProductSeverity
  scope: ProductScope
  scopeId: string
  params: CopyParams
  blocking: boolean
  recoveryAction: RecoveryAction | null
}

export function formatProductError(
  language: InterfaceLanguage,
  error: ProductError,
): { title: string; message: string; primaryLabel: string; secondaryLabel: string | null }
export function formatProductIssue(language: InterfaceLanguage, issue: ProductIssue): string

export const SHELL_COPY: LocalizedCopy<CopyShape>
export const SETTINGS_COPY: LocalizedCopy<CopyShape>
export const COPY_REGISTRY: Readonly<{
  shell: typeof SHELL_COPY
  settings: typeof SETTINGS_COPY
  workbench: LocalizedCopy<CopyShape>
  editor: LocalizedCopy<CopyShape>
  library: LocalizedCopy<CopyShape>
  drive: LocalizedCopy<CopyShape>
}>
```

`src/app/copy-types.ts` imports no feature module and solely owns `InterfaceLanguage`, `defineCopy`, and copy helper/types. `src/app/copy.ts` owns `SHELL_COPY`, `SETTINGS_COPY`, and the typed `COPY_REGISTRY`; it imports `WORKBENCH_COPY`, `EDITOR_COPY`, `LIBRARY_COPY`, and `DRIVE_COPY`. Each feature module imports helper/types only from `copy-types.ts`, never `copy.ts`. Phase 6 imports `COPY_REGISTRY` from `copy.ts` and `InterfaceLanguage` only from `copy-types.ts`; no local redeclaration or second registry exists. Components accept stable codes/parameters, never provider English. Technical causes exclude credentials, source content, Drive IDs, and response bodies. One occurrence renders once in its scope; errors never enter confirmation toasts.

Slice 1B removes the legacy `UiLanguage` alias from `src/features/transcription/types.ts`. `AppSettings.uiLanguage`, `resolveTranscriptionLanguage`, `isEnglishOnlyLanguageMismatch`, and every app/feature language parameter use the sole `InterfaceLanguage` imported from `@/app/copy-types`; no re-export or compatibility alias remains. The persisted field name stays `uiLanguage`. Phase 2 consumes this completed type migration and must not recreate or import `UiLanguage`. Phase 6 source-scans product files for any declaration, import, export, or type reference containing the stale alias.

`SHELL_COPY.en` and `SHELL_COPY.vi` have identical typed keys `skipToContent` and `primaryNavigation`, with values `"Skip to content"`/`"Chuyển đến nội dung"` and `"Primary navigation"`/`"Điều hướng chính"`. Shell and Phase 6 accessibility examples consume `copy.skipToContent` and `copy.primaryNavigation` directly.

### 5.2A Final Settings ownership and validation

Phase 1B owns the complete `src/features/settings/SettingsPage.tsx`; it is never a placeholder and no later phase replaces it. Phase 1 creates Library and Transcript route placeholders, which Phase 4 modifies/replaces in place. Settings preserves processing controls, chunking, `persistMediaBlobs`, local transcript cleanup, and downloaded model-cache cleanup without feature expansion.

`src/features/settings/validation.ts` owns:

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

Chunk accepts integer 15–60 inclusive only. Overlap accepts a finite number 0–5 inclusive and must be strictly less than the validated chunk value. No invalid/empty/non-finite draft persists, rounds, or clamps. EN/VI helpers and errors use stable IDs through `aria-describedby`; invalid fields expose `aria-invalid`. `tests/unit/settings-validation.test.ts` owns parser boundaries. Phase 1's `tests/components/navigation.test.tsx` owns component validation, persistence, confirmation, ordering, failure, and active-work assertions. `tests/e2e/fixtures/settings.ts` owns `openSettingsState(page,"default"|"validation",language)`; Phase 6 consumes it unchanged.

`src/app/work-activity-store.ts` receives active transcription/conversion state from `src/app/LegacyProduct.tsx` during the interim. Phase 3 removes that publisher and transfers sole publication ownership to the framework-independent runtime coordinator/external store, which calls `setWorkActivity(true)` for active transcription, active conversion, and cancelling, and calls `setWorkActivity(false)` only after terminal provider disposal or teardown acknowledgement. The `AppShell` provider scope owns one queue store and one runtime coordinator across Workbench, Library, Transcript, and Settings query routes. `WorkbenchPage` only subscribes/unsubscribes and renders coordinator snapshots; route unmount never disposes the coordinator, cancels its run, clears its queue, or publishes work activity. App teardown alone disposes the coordinator. Thin `src/App.tsx` never publishes work activity. Settings Save, transcript cleanup, model-cache cleanup, and open confirmation actions are disabled during active work. Transcript cleanup requires a localized confirmation and affects local transcripts only. Model cleanup requires a separate localized confirmation and awaits `clearLocalWorkerState()` before `clearModelCaches()`; reset failure prevents cache deletion. No Settings copy claims Drive deletion or media upload.

### 5.3 Canonical transcript and repository record

Defined in `src/features/transcription/types.ts`, `src/features/transcription/canonical.ts`, and `src/features/transcription/schema.ts`, all created or extended only in Slice 1B. Slice 1A must not import these later canonical modules; it uses the permanent minimal rollback contract in Section 5.3A. Slice 1B owns the canonical envelope/payload/draft types, parser, normalizer, commit gate, and migration. Epoch fields are safe integers in `946684800000..4102444800000`; relative canonical fields are safe integers in `0..604800000`; revisions are safe integers in `0..Number.MAX_SAFE_INTEGER`. Validators enforce bounds because TypeScript cannot encode numeric ranges.

```ts
export type ProcessingMode =
  | "local-webgpu"
  | "cloudflare-ai"
  | "local-wasm"
  | "server"

export interface CanonicalSegment {
  id: string
  startMs: number
  endMs: number
  text: string
}

export interface CanonicalTranscriptPayload {
  title: string
  sourceName: string
  language: string
  modelId: string
  mode: ProcessingMode
  createdAt: number
  text: string
  segments: CanonicalSegment[]
}

export interface TranscriptEnvelope {
  schemaVersion: 2
  transcriptId: string
  revision: number
  updatedAt: number
  deletedAt: number | null
  deviceId: string
  deletionId: string | null
  restoredFromDeletionId: string | null
  transcript: CanonicalTranscriptPayload | null
}

export interface TranscriptRecord {
  id: string
  revision: number
  updatedAt: number
  deletedAt: number | null
  deviceId: string
  deletionId: string | null
  restoredFromDeletionId: string | null
  transcript: CanonicalTranscriptPayload | null
  localIssueCode: string | null
}

export function validateCanonicalSegment(value: unknown): CanonicalSegment
export function validateCanonicalTranscriptPayload(value: unknown): CanonicalTranscriptPayload
export function parseTranscriptEnvelope(value: unknown): TranscriptEnvelope
export function deriveTranscriptText(segments: readonly CanonicalSegment[]): string
export function serializeTranscriptEnvelope(envelope: TranscriptEnvelope): string
export function toTranscriptRecord(envelope: TranscriptEnvelope): TranscriptRecord
export function toTranscriptEnvelope(record: TranscriptRecord): TranscriptEnvelope

// src/features/transcription/hashes.ts
export function sha256Base64Url(input: string | Uint8Array): Promise<string>

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
  | {
      status: "needs-attention"
      draft: EditorDraftPayload
      issues: readonly CanonicalCommitIssue[]
    }

export type ParseResult<T, E extends string> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export function parseEditorDraftPayload(
  value: unknown,
): ParseResult<EditorDraftPayload, "draft.invalid-shape" | "draft.invalid-scalar" | "draft.out-of-bounds">
export function commitEditorDraftPayload(draft: EditorDraftPayload): CanonicalCommitResult
```

Schema objects are exact allowlists. Payload has no `id` or `updatedAt`; envelope owns identity/revision/deletion fields. Segment order is array order. Scalar validation precedes normalization, sizing, persistence, key derivation, canonicalization, or hashing. Segment text uses pinned `CANONICAL_WS`; title removes outer pinned whitespace only; no `trim()`, engine `\s`, NFC, NFKC, punctuation, or case transforms. Canonical text is always derived from segments in the same write transaction.

`sha256Base64Url(input)` is the sole low-level base64url SHA-256 helper. A string input is scalar-validated and hashed as exactly `new TextEncoder().encode(input)`; a `Uint8Array` input hashes exactly its visible `byteOffset..byteOffset+byteLength` bytes without text decoding, coercion, or mutation. It resolves to the 43-character unpadded RFC 4648 base64url digest. `remoteKey` and `candidateHash` call this export rather than duplicating digest/encoding logic; accepted-payload and raw-body domains retain lowercase-hex APIs.

`tests/unit/schema-hashes.test.ts` imports `sha256Base64Url`, `remoteKey`, `candidateHash`, `acceptedPayloadHash`, and `rawBodyByteHash` from `@/features/transcription/hashes`. Its low-level rows call `sha256Base64Url` with both `string` and `Uint8Array`, including a nonzero-offset subarray; no test-local declaration, `utf8` wrapper, or `bodyByteHash` function symbol exists.

`EditorDraftPayload` is a separate exact local-only shape, never schema-2 JSON, hash input, export JSON, or Drive input. Its parser enforces the canonical scalar, string-count, UTF-8, segment-count, ID uniqueness, enum, and epoch bounds; draft times must be finite numbers with absolute value at most `Number.MAX_SAFE_INTEGER`, but may be non-integers, negative, greater than seven days, reversed, or overlapping. It contains no independent `text`; draft TXT derives normalized segment text. `commitEditorDraftPayload()` is the sole draft-to-canonical gate: it normalizes text/title, requires safe-integer timing in `0..604800000` plus array-order invariants, derives canonical `text`, and returns either a canonical payload or the still-bounded draft plus deterministic issues. It never clamps, reorders, or partially commits.

### 5.3A Slice 1A rollback compatibility parser and projection

Slice 1A creates `src/features/storage/compatibility.ts`. This file is the permanent, Foundation-owned compatibility boundary used by `src/features/storage/indexed-db.ts`; it exists in the independently deployed rollback floor before Slice 1B. It contains no RFC 8785, hashing, migration, quarantine, repository, Drive, editor-draft, or v2-upgrade code. Slice 1B later creates the canonical modules in Section 5.3 and adds conformance tests proving both parsers accept/reject the same schema-2 envelope fixtures. Slice 1B may consume this module but must not move, rename, delete, or redefine its exports.

The public contract is exact:

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

export interface RollbackV2Segment {
  id: string
  startMs: number
  endMs: number
  text: string
}

export interface RollbackV2Payload {
  title: string
  sourceName: string
  language: string
  modelId: string
  mode: ProcessingMode
  createdAt: number
  text: string
  segments: RollbackV2Segment[]
}

export interface RollbackV2Envelope {
  schemaVersion: 2
  transcriptId: string
  revision: number
  updatedAt: number
  deletedAt: number | null
  deviceId: string
  deletionId: string | null
  restoredFromDeletionId: string | null
  transcript: RollbackV2Payload | null
}

export type CompatibilitySettingsProjection = Omit<AppSettings, "explicitModelId"> & {
  explicitModelId: string | null
}

export interface Version2SchemaDescription {
  stores: readonly [
    "conflictCandidates",
    "drafts",
    "meta",
    "migrationQuarantine",
    "pendingOperations",
    "settings",
    "syncMetadata",
    "syncState",
    "transcripts",
  ]
  keyPaths: Readonly<{
    settings: null
    transcripts: "transcriptId"
    migrationQuarantine: "quarantineId"
    drafts: "transcriptId"
    conflictCandidates: "candidateId"
    syncMetadata: readonly ["accountKey", "transcriptId"]
    pendingOperations: readonly ["accountKey", "transcriptId"]
    syncState: "accountKey"
    meta: null
  }>
  indexes: Readonly<{
    transcripts: readonly ["by-deletedAt", "by-updatedAt"]
    migrationQuarantine: readonly ["by-originalV1Key", "by-reasonCode"]
    conflictCandidates: readonly ["by-receivedAt", "by-transcriptId"]
    syncMetadata: readonly ["by-accountKey", "by-transcriptId"]
    pendingOperations: readonly ["by-accountKey", "by-nextAttemptAt", "by-transcriptId"]
    drafts: readonly []
    settings: readonly []
    syncState: readonly []
    meta: readonly []
  }>
  deviceId: string
}

export function inspectVersion2Schema(
  db: IDBPDatabase,
): Promise<CompatibilityResult<Version2SchemaDescription>>
export function parseRollbackV2Segment(value: unknown): CompatibilityResult<RollbackV2Segment>
export function parseRollbackV2Payload(value: unknown): CompatibilityResult<RollbackV2Payload>
export function parseRollbackV2Envelope(value: unknown): CompatibilityResult<RollbackV2Envelope>
export function parseCompatibilityDeviceId(value: unknown): CompatibilityResult<string>
export function parseCompatibilityDeletionId(value: unknown): CompatibilityResult<string>
export function parseCompatibilityEpochMs(value: unknown): CompatibilityResult<number>
export function parseCompatibilityLegacyIso(value: unknown): CompatibilityResult<number>
export function legacySecondsToCompatibilityMs(value: unknown): CompatibilityResult<number>
export function compatibilityMsToLegacySeconds(value: unknown): CompatibilityResult<number>
export function projectRollbackEnvelope(
  envelope: RollbackV2Envelope,
): CompatibilityResult<TranscriptDocument | null>
export function parseCompatibilitySettings(
  value: unknown,
  defaults: AppSettings,
): CompatibilityResult<CompatibilitySettingsProjection>
```

Every object parser uses exact own-key allowlists and rejects arrays, prototypes other than `Object.prototype`/`null`, missing keys, and unknown keys. Every string is checked for paired UTF-16 surrogates before whitespace handling or byte/count work. Bounds, enums, canonical `d_`/`x_` 16-byte base64url decode-and-re-encode forms, epoch milliseconds, revision, live/tombstone/restore lineage, segment IDs/order/timing, per-segment/aggregate UTF-8 size, canonical title/segment normalization, and exact derived `text` equality match corrected spec Section 15.4. `parseCompatibilityDeletionId()` accepts only a non-null canonical `x_` ID; nullable callers validate `null` explicitly. `parseCompatibilitySettings()` always returns an own `explicitModelId` key: exact v1 and missing records project `null`, while exact v2 records preserve their string or `null` value. `serverModelId` accepts only `null` or a non-empty scalar-valid string bounded to 128 Unicode scalars and 512 UTF-8 bytes. Empty, oversized, or lone-surrogate values are rejected before projection.

`legacySecondsToCompatibilityMs()` accepts only a finite non-negative number, computes `product = value * 1000`, requires finite `product`, `Number.isSafeInteger(Math.round(product))`, and rounded result in `0..604800000`, then returns `Math.round(product)`. `compatibilityMsToLegacySeconds()` requires a safe integer in `0..604800000`, computes `seconds = value / 1000`, and requires `Math.round(seconds * 1000) === value`. No conversion clamps. `parseCompatibilityEpochMs()` requires a safe integer in `946684800000..4102444800000`; `parseCompatibilityLegacyIso()` additionally requires exact `new Date(epoch).toISOString() === input`.

`inspectVersion2Schema()` opens one readonly transaction over all nine exact stores, compares exact sorted store/index sets and every `keyPaths` entry above, reads `meta/deviceId`, and validates it. Any mismatch returns `compatibility.invalid-schema`; it never creates, deletes, repairs, or upgrades structure. `projectRollbackEnvelope()` returns `null` for a valid tombstone and otherwise rederives text and uses only the checked millisecond-to-seconds function. The adapter maps failures to `StorageCompatibilityError`: schema failures become `storage.incomplete-v2`; shape/scalar/bounds/lineage/derived-text failures become `storage.malformed-v2`; conversion failures become `storage.time-conversion`.

### 5.4 Storage opening and repositories

Defined in `src/features/storage/database.ts`, `src/features/storage/indexed-db.ts`, and `src/features/storage/repositories.ts`. Slice 1A implements the exact opener and legacy-product compatibility API below. Slice 1B alone adds the v2 upgrade and concrete repositories.

```ts
import type { IDBPDatabase } from "idb"

export const WHISDOM_DB_NAME = "whisdom"
export const WHISDOM_DB_VERSION = 2
export type SupportedDatabaseVersion = 1 | 2

export type DatabaseOpenResult =
  | { status: "ready"; version: SupportedDatabaseVersion; db: IDBPDatabase }
  | { status: "unsupported"; foundVersion: number; maximumVersion: 2 }

export function openCompatibleDatabase(): Promise<DatabaseOpenResult>
export function openVersion2Database(): Promise<DatabaseOpenResult>
export function closeDatabase(): Promise<void>
```

Slice 1A `src/features/storage/database.ts` uses this exact versionless opening body; no numeric version argument exists:

```ts
const db = await openDB(WHISDOM_DB_NAME, undefined, {
  upgrade(database, oldVersion, newVersion, transaction) {
    void newVersion;
    void transaction;
    if (oldVersion !== 0) {
      throw new Error("storage.unexpected-versionless-upgrade")
    }
    database.createObjectStore("settings")
    database.createObjectStore("transcripts", { keyPath: "id" })
  },
})

if (db.version === 1 || db.version === 2) {
  return { status: "ready", version: db.version, db }
}

const foundVersion = db.version
db.close()
return { status: "unsupported", foundVersion, maximumVersion: 2 }
```

The controlled `oldVersion === 0` path creates only the current v1 stores, so a fresh database is v1. Existing v1 or v2 opens run no upgrade. Slice 1A contains no numeric-version-2 open, no schema-2 creation/upgrade callback, and no path that deletes or recreates an existing store. `openVersion2Database()` is declared for the stable later contract but is not implemented/exported until Slice 1B.

Slice 1A modifies `src/features/storage/indexed-db.ts` into a version-aware compatibility adapter while preserving these current public imports and return shapes:

```ts
export type StorageCompatibilityErrorCode =
  | "storage.unsupported-version"
  | "storage.malformed-v2"
  | "storage.incomplete-v2"
  | "storage.revision-exhausted"
  | "storage.time-conversion"

export class StorageCompatibilityError extends Error {
  readonly code: StorageCompatibilityErrorCode
  readonly foundVersion: number | null
}

export async function loadSettings(): Promise<AppSettings>
export async function saveSettings(settings: AppSettings): Promise<void>
export async function saveTranscript(document: TranscriptDocument): Promise<void>
export async function deleteTranscript(id: string): Promise<void>
export async function clearTranscripts(): Promise<void>
export async function renameTranscript(id: string, title: string): Promise<TranscriptDocument | null>
export async function listTranscripts(): Promise<TranscriptDocument[]>
```

Slice 1A also creates permanent `src/features/storage/compatibility-api.ts`. That module imports these seven functions, exports `StorageCompatibilityApi` and frozen `STORAGE_COMPATIBILITY_API`, declares `Window.__WHISDOM_STORAGE_COMPATIBILITY__: StorageCompatibilityApi`, and unconditionally assigns the frozen object at module evaluation. Slice 1A `App.tsx` and Slice 1B/final `main.tsx` import it for side effects; installation never lives in `App.tsx`. Phase 7 preserves the module and bootstrap import when thinning `App.tsx`. `tests/unit/indexed-db-compat.test.ts` owns the exact-seven-key/reference/frozen test; MIG-01 and ROLLBACK-01 own browser installation/behavior evidence.

`StorageCompatibilityError.code` is mapped by the Slice 1A `src/App.tsx` product and, after Slice 1B extraction, `src/app/LegacyProduct.tsx` to concise EN/VI copy; raw parse details never enter UI. Every adapter call obtains `DatabaseOpenResult`. An unsupported result refuses reads and mutations. A malformed/incomplete v2 database or record is closed immediately, emits one localized compatibility error, and refuses the complete mutation; it never falls back to v1 interpretation, skips a malformed row, partially clears, repairs, or overwrites unknown data.

Before any v2 read or mutation, Slice 1A verifies all exact stores exist: `settings`, `transcripts`, `migrationQuarantine`, `drafts`, `conflictCandidates`, `syncMetadata`, `pendingOperations`, `syncState`, and `meta`. It also verifies the exact index sets listed below. Missing/extra required structure, wrong transcript key path, missing parser-valid `meta/deviceId`, or an unparseable target row is `storage.incomplete-v2`/`storage.malformed-v2`; the adapter closes and refuses mutation.

Slice 1A projections are exact:

- **v1 read/write:** values remain the current exact `AppSettings` and legacy `TranscriptDocument` shapes. List ordering remains parsed `updatedAt` descending. Rename preserves all fields except `title` and canonical current ISO `updatedAt`. Delete and clear physically remove v1 rows, preserving current v1 behavior.
- **v2 read:** `settings` still projects through `DEFAULT_SETTINGS`. A transcript row must be an exact, complete schema-2 `TranscriptEnvelope`, including exact equality between stored payload `text` and canonical derivation; tombstones are omitted from the current live list. A live envelope projects to legacy `TranscriptDocument` as `id = transcriptId`, payload fields copied exactly, `updatedAt = new Date(envelope.updatedAt).toISOString()`, and each segment `{id,start:startMs / 1000,end:endMs / 1000,text}`. Returned `text` is rederived from canonical segments. Milliseconds must be safe integers in canonical bounds; division by 1000 must round-trip through checked `Math.round(seconds * 1000)` to the original integer or the row is malformed.
- **v2 save:** validate the complete legacy input before a transaction. Convert segment seconds with checked finite/non-negative `seconds * 1000`, safe-integer/range validation, and `Math.round`; apply no silent cap. Normalize canonical segment text, derive payload `text`, and write one canonical live `TranscriptEnvelope`. For a new ID, revision is `0`, deletion lineage is null, `deviceId` is the existing parser-valid v2 profile device ID, and `updatedAt` is the exact bounded ISO conversion from the input. For an existing live ID, require an exact envelope, increment revision with overflow refusal, preserve `deviceId` and `restoredFromDeletionId`, clear `deletedAt`/`deletionId`, and replace the canonical payload. For an existing tombstone, require the same checks and create an explicit restored live descendant with `restoredFromDeletionId` equal to the observed tombstone `deletionId`. A save never writes the legacy combined shape into v2.
- **v2 rename:** require a valid live envelope, canonicalize/validate title, increment revision, set bounded current epoch `updatedAt`, and preserve `transcriptId`, `deviceId`, payload creation/source/language/model/mode/segments, and `restoredFromDeletionId`. Recompute payload `text`; never reset lineage.
- **v2 delete/clear:** write canonical tombstones instead of physical deletion. Delete requires a valid existing live envelope, increments revision, uses one pre-generated canonical `deletionId` from the adapter collaborator, sets `updatedAt = deletedAt` to bounded current epoch milliseconds, nulls `transcript` and `restoredFromDeletionId`, and preserves `deviceId`. Clear first validates every observed live envelope, generates one unique deletion ID per row before opening the transaction, then atomically writes all tombstones; any invalid row/time/revision aborts the full clear. Existing tombstones remain unchanged.

The compatibility adapter may use injected `now()` and `createDeletionId()` collaborators internally for deterministic tests, but these are not alternate product APIs. Slice 1A does not enqueue Drive operations because v2 sync stores may not exist; Slice 1B repositories assume ownership after upgrade. `MIG-01` tests the public functions above, not private projections alone.

Slice 1B declarations begin here. `repositories.ts`, `transcript-repository.ts`, and `sync-repository.ts` import every publication operation, candidate persistence record, sync-state record, and sync-metadata record only from `@/features/storage/sync-types`; they never import `@/features/google-drive/types`.

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

export type RepositoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RepositoryErrorCode }

export interface DraftRepository {
  get(transcriptId: string): Promise<DraftRecord | null>
}

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

// repositories.ts and google-drive/types.ts import these declarations from remote-types.ts.

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

export interface SyncMetadataRepository {
  get(accountKey: string, transcriptId: string): Promise<SyncMetadata | null>
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

export type IncomingMergeSyncMetadata = Omit<SyncMetadata, "itemState"> & {
  itemState: "local-only" | "pending" | "syncing" | "needs-attention"
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

`src/features/storage/remote-types.ts` is storage-neutral and solely owns `RemoteQuarantineMetadata`, `RemoteQuarantineRecord`, and later remote-quarantine write inputs. `src/features/storage/sync-types.ts` is storage-neutral and solely owns durable publication operations, pending constructors/guards, candidate persistence records, `VerifiedPublicationReceipt`, `DriveSyncState`, and `SyncMetadata`. Repositories import these contracts only from their storage owners. `src/features/google-drive/types.ts` imports or narrowly re-exports storage-owned contracts only for Drive consumers. Neither storage type file imports a Drive feature module, and no `src/features/storage/**` file imports `src/features/google-drive/**`. Unit source-graph tests enforce declaration ownership and this one-way boundary.

Slice 1B implements `openVersion2Database()` with a versionless inspection before any numeric open. If the inspected version is `2`, it validates the exact v2 schema through `inspectVersion2Schema()` and returns that existing handle directly; it performs no legacy snapshot, conversion, planning, or numeric upgrade. If the version is `1`, it snapshots and precomputes, closes the inspection handle, then performs one numeric version-2 open and one `versionchange` transaction. A version greater than `2` closes and returns unsupported. The fresh/version-1 path may request version 2 only after the Slice 1B release gate is satisfied. Physical v2 stores and key paths are exact: `settings` out-of-line singleton key; `transcripts` key path `transcriptId`; `migrationQuarantine` key path `quarantineId`; `drafts` key path `transcriptId`; `conflictCandidates` key path `candidateId`; `syncMetadata` compound key path `['accountKey','transcriptId']`; `pendingOperations` compound key path `['accountKey','transcriptId']`; `syncState` key path `accountKey`; and `meta` out-of-line named keys. Exact indexes are `transcripts: ['by-deletedAt','by-updatedAt']`, `migrationQuarantine: ['by-originalV1Key','by-reasonCode']`, `conflictCandidates: ['by-receivedAt','by-transcriptId']`, `syncMetadata: ['by-accountKey','by-transcriptId']`, `pendingOperations: ['by-accountKey','by-nextAttemptAt','by-transcriptId']`, with no indexes on the remaining stores. No Phase 1A release artifact may contain the numeric-version-2 call.

Migration orchestration is deliberately split across the v1 read phase, asynchronous planning phase, and v2 upgrade phase. `versionchange` never performs asynchronous conversion. For inspected version `1`, `openVersion2Database()` synchronously snapshots all v1 settings/transcript records into memory, closes that handle, and then awaits `precomputeMigrationPlan(snapshot, dependencies)`. Only after every conversion, quarantine decision, canonical record, bounded quarantine record, hash, and generated ID has been precomputed does it call the numeric v2 opener. The exact idb v8 callback is `upgrade(database, oldVersion, newVersion, transaction)`; an optional event is fifth. The callback returns `void`. In that same synchronous versionchange transaction it deletes the v1 `transcripts` store whose key path is `id`, recreates `transcripts` with key path `transcriptId`, creates exactly `by-deletedAt` and `by-updatedAt`, creates the other exact v2 stores/indexes, then puts prepared canonical records into the recreated store and prepared malformed rows into `migrationQuarantine`. It never attempts `cursor.update()` to change a key path and performs no source-row cursor update/delete choreography. It contains no `await`, no `convertLegacyTranscript` call, and no digest or random-ID generation. Its exact wiring is `upgradeToVersion2(database, oldVersion, newVersion, transaction, preparedPlan)`; alternatively, a closure may bind `preparedPlan` while preserving the same first four callback arguments.

The upgrade callback never returns a promise. The `openDB(...)` promise resolves only after the versionchange transaction completes; any store/index creation failure, canonical/quarantine put failure, transaction abort, or commit failure rejects that open. IndexedDB atomically rolls back deletion/recreation of `transcripts` with every other schema/data write, so an aborted upgrade leaves the complete v1 store, key path `id`, keys, and values intact. Retry reopens versionlessly, snapshots that intact v1 database, discards the failed plan, recomputes it, and retries once through a fresh v2 open. A failed retry leaves v1 intact and reports migration failure; it never interprets a partially created v2 database as v1 or resumes partial actions. Tests inject conversion/hash/ID failures before upgrade and schema/write/commit failures during upgrade, assert the callback returned `undefined`, assert the open remains pending until transaction completion, assert exact v2 key paths/indexes on success, assert existing-v2 reopen bypasses planning/upgrading, then assert byte-identical v1 schema/data recovery after abort.

All mutation methods above are guarded single IndexedDB transactions. `mutateTranscriptAndCoalescePending`, tombstone, restore, clear, and canonical-draft commit write the transcript revision plus latest eligible unbound desired publication together; stale expected transcript/draft revision returns a typed rejection and writes nothing. `persistDraftOnly` is the only invalid-timing persistence path: it writes only `drafts`, never `transcripts`, revision/hash/sync metadata, or `pendingOperations`. Only `CanonicalCommitResult.status === "canonical"` may call a transcript mutation or enqueue path.

Slice 1B permanently owns `RepositoryFixtureMethod`, `RepositoryFailurePort`, `RepositoryFactoryOptions`, and the optional factory parameter. `failurePort` is test-only: each named operation asks it once before opening a write transaction and returns its normal typed failure when consumed. The default factory may adapt `window.__WHISDOM_REPOSITORY_FIXTURE__` only under `import.meta.env.DEV || import.meta.env.MODE === "e2e"`; production ignores that global. Later phases consume this signature. Any genuinely required new named operation must first amend the owning Phase 1 contract; no later phase retrofits or redefines the factory.

`bindGeneratedAttempt` requires current `unbound` state and matching desired hash, then atomically freezes all attempted identity. Creating/verifying/Needs-attention transitions require exact expected state, generated file ID, and attempted hash. `persistIncomingCandidateFirstAndMerge` puts the immutable candidate before applying winner/transcript/metadata/pending disposition and supplied durable remote-quarantine deletions in that same transaction; any later write failure aborts all writes, and `IncomingMergeSyncMetadata` cannot represent Synced. `finalizeStabilizedWinner` is the only operation allowed to write `SyncMetadata.itemState = "synced"`. Its input requires the exact `VerifiedPublicationReceipt` returned by successful Phase 5 verification plus the stabilized `RemoteCandidate`; callers cannot supply duplicate generated-file, attempted-hash, confirmed-file, or confirmed-hash strings. It rejects a missing/malformed receipt, any receipt/pending mismatch, any receipt/candidate mismatch, a body hash unequal to the SHA-256 of the frozen attempted envelope bytes, or a stabilized winner different from the receipt candidate hash. It derives expected generated ID, expected attempted candidate/payload hashes, `confirmedFileId`, and `confirmedCandidateHash` from the receipt, then atomically updates confirmation metadata and removes the completed pending operation. If desired differs from attempted, that same transaction installs one replacement `unbound` desired operation; otherwise replacement is null. No repository exposes an independent `put()` that can claim `synced` or overwrite publication state.

Repository/verifier tests compile-fail a missing receipt and any old duplicate identity field, then independently mismatch all six receipt fields at runtime. Source-graph tests require `kind: "verified-publication"` construction only in the successful branch of `src/features/google-drive/publication.ts`, require all Google Drive persisted/receipt imports to point to `src/features/storage/sync-types.ts`, and require zero imports from `src/features/google-drive/**` anywhere under `src/features/storage/**`.

### 5.5 Runtime adapters and terminal cancellation

Defined in `src/features/transcription/runtime.ts`; Phase 3 owns all adapters and coordinator integration.

`runtime.ts` imports `type MeasuredProgress` from `src/features/workbench/types.ts`; its public `RuntimeEvent.progress` field is the same type. Phase 3 must delete the duplicate `MeasuredProgress` declaration shown in any older phase snippet rather than implementing a second runtime-owned type.

```ts
import type { CopyParams } from "@/app/copy-types"

export type RuntimePhase = "prepare" | "load-model" | "transcribe" | "save"
export type RuntimeEventCode =
  | "prepare.started"
  | "prepare.media_metadata"
  | "prepare.converting"
  | "prepare.complete"
  | "model.cache_check"
  | "model.downloading_asset"
  | "model.loading"
  | "model.reused"
  | "model.complete"
  | "transcribe.queued"
  | "transcribe.chunk"
  | "transcribe.running"
  | "transcribe.complete"
  | "save.local"
  | "save.complete"
  | "run.cancel_requested"
  | "run.cancelled"
  | "run.failed"

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

export interface LocalRuntimeDependencies {
  mode: "local-webgpu" | "local-wasm"
  convert: typeof convertWithFfmpeg
  transcribe: typeof transcribeLocally
  createId: typeof createId
  now: () => number
}

export interface CloudflareRuntimeDependencies {
  split: (source: File | Blob, signal: AbortSignal) => Promise<Blob[]>
  transcribeChunk: typeof transcribeChunkWithServer
  getAccessToken: () => string
  createId: typeof createId
  now: () => number
}

export interface ServerRuntimeDependencies {
  api: Pick<ServerTranscriptionApi, "submitJob" | "subscribeProgress" | "cancelJob">
  createId: typeof createId
  now: () => number
}

export function createLocalRuntimeAdapter(deps: LocalRuntimeDependencies): RuntimeAdapter
export function createCloudflareRuntimeAdapter(deps: CloudflareRuntimeDependencies): RuntimeAdapter
export function createServerRuntimeAdapter(deps: ServerRuntimeDependencies): RuntimeAdapter
```

The resulting server API contract is `submitJob(input: TranscribeInput, options?: SubmitJobOptions): Promise<string>` with `SubmitJobOptions = { language?: string; modelId?: string; signal?: AbortSignal }` and `cancelJob(jobId: string, options?: CancelJobOptions): Promise<void>` with `CancelJobOptions = { signal?: AbortSignal }`; both option interfaces are exported by `src/features/server-transcription/api.ts`. No positional language/model/signal overload remains. `submitJob` preserves existing `language` and `model` form semantics and passes `signal` to fetch; `cancelJob` preserves its URL/auth semantics and passes its option signal to fetch. The server adapter invokes submit with `{ language: options.language, modelId: options.modelId, signal: submitController.signal }`; after a job ID exists cancellation invokes `cancelJob(jobId, { signal: cancelController.signal })` before unsubscribe/closed/terminal cancellation, while pre-ID cancellation aborts and settles submit first.

These interfaces are exported from their adapter modules. `LocalRuntimeDependencies.mode` creates one adapter for each exact local `ProcessingMode`; its remaining fields import `convertWithFfmpeg` and `transcribeLocally` from `@/lib/transcription-worker-client` plus `createId` from `@/lib/id`. `CloudflareRuntimeDependencies` imports `transcribeChunkWithServer` from `@/features/server-transcription/client` plus `createId`; Phase 3 adds `signal: AbortSignal` to that existing client argument. `ServerRuntimeDependencies` imports `ServerTranscriptionApi` from `@/features/server-transcription/api` plus `createId`. Factories require explicit dependencies; `RuntimeCoordinatorProvider.tsx` constructs production dependency objects from those existing clients. Tests import each factory and dependency interface from its owning adapter module. No optional dependency bag, ambient overload, or bodyless declaration is added to production source.

`CandidateRepository` and `RemoteQuarantineRepository` are account-neutral durable owners over `conflictCandidates`; both record shapes use that store's `candidateId` key path and `transcriptId`/`receivedAt` indexes, and neither stores `accountKey`. A quarantine file ID is bounded evidence only, never accepted-candidate account association. Migration failures remain exclusively in `migrationQuarantine` through `MigrationQuarantineRepository`; remote parser failures never enter that store. `persistIncomingCandidateFirstAndMerge` is the sole atomic candidate-first merge transaction: in one guarded transaction it writes `candidate`, applies transcript/winner/non-Synced metadata/pending disposition, records loser references, and deletes only supplied already-durable `remoteQuarantineCandidateIds`. Any later failure aborts every write, including candidate put and quarantine deletion.

`start` returns immediately. Handle owns request IDs, abort controllers, SSE subscriptions, provider job IDs, and its cancellation-timeout handle. `cancel()` is idempotent and resolves only after cooperative acknowledgement, remote acknowledgement, fetch/SSE abort completion, or per-type worker termination confirmation. A local worker cancel request only marks the matching active request cancelled; it does not delete the marker or acknowledge immediately. The active operation checks that marker after every cooperative awaited boundary and before every next work step or completion post. A checkpoint stops before further work/completion, performs request cleanup, emits one terminal `{ type: "cancelled", id }`, then deletes the marker. If no checkpoint can run within 150 ms, the client terminates the active worker type and resolves cancellation only after termination. The stored timeout is cleared and nulled on cooperative acknowledgement, task resolution, task rejection, forced teardown, and `dispose()`. No settled path leaves a pending timer or permits its callback to emit a second terminal event. Once acknowledgement resolves, that request can never emit completion, and retry cannot overlap its cleanup or teardown. Fake-timer tests assert zero pending timers after acknowledgement and exactly one terminal result even after advancing beyond 150 ms. `dispose()` removes run listeners/timers/resources in every terminal path and does not delete persistent model Cache Storage. The Phase 3 coordinator directly calls `setWorkActivity(true)` before active conversion/transcription or cancelling is observable and retains it through cancellation; it calls `setWorkActivity(false)` only after terminal `dispose()` or forced teardown acknowledgement resolves. The `AppShell` provider scope owns one queue store/coordinator for the app lifetime; Workbench route mount only subscribes and route unmount only unsubscribes. App teardown alone disposes. Old-run events are ignored. Normal completion/navigation reuses workers; forced cancellation may reduce one worker type to zero and lazily create at most one replacement.

### 5.6 Workbench queue

Defined in `src/features/workbench/types.ts` and `src/features/workbench/queue-reducer.ts`; Phase 2 creates the type and core reducer, Phase 3 imports the type and adds runtime transitions without renaming actions.

Recommendation persistence is global and invariant: automatic recommendations remain derived and never write settings, including after Start/Submit. `item-started` captures the chosen effective model in `CapturedTranscriptionSettings` for that run. Only explicit user model selection writes global `modelId` and `explicitModelId`, together and to the same selected ID. Invalid/removed/language-incompatible/runtime-incompatible explicit evidence remains persisted for warning/recovery but is treated as invalid and never overwritten by automatic fallback. REC/WB unit, component, E2E, migration compatibility, and final gates assert zero automatic writes, exact queue capture, one explicit two-field write, and retained invalid evidence.

#### Sole measured-progress contract

`src/features/workbench/types.ts` exports the only `MeasuredProgress` declaration. Phase 2 creates it before any queue or runtime implementation; Phase 3 imports it into `src/features/transcription/runtime.ts`, adapters, coordinator, and presentation. No phase may redeclare, alias, widen, or relocate it.

```ts
export interface MeasuredProgress {
  completed: number
  total: number
  unit: "bytes" | "chunks" | "items"
}
```

Semantics: `completed` and `total` are finite real numbers in the provider's native measured unit; both are non-negative; `total > 0`; and `completed <= total`. A provider may emit progress only when it has a real denominator. The value is a stage-local measurement, not a weighted phase/global percentage, ETA, or completion claim. Adapters preserve the source unit and may emit `null` when no denominator exists. Runtime validation rejects every non-finite, negative, zero-total, or over-total value before publication. Terminal events may carry the final measured value, but terminal status never implies a fabricated measurement.

```ts
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

export function createInitialQueueState(): QueueState
export function queueReducer(state: QueueState, action: QueueAction): QueueState
export function nextSequentialItem(state: QueueState): QueueItem | null

export interface QueueStore {
  getState(): QueueState
  dispatch(action: QueueAction): QueueState
  subscribe(listener: () => void): () => void
}
export function createQueueStore(initialState?: QueueState): QueueStore

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

Reducer is pure and creates no IDs. File selections append. Only pending/retry items move; running item cannot move. Start captures an immutable settings snapshot. `item-started` accepts `ready` only. `cancelled` and `failed` are terminal display states, never implicit work candidates: `item-retried` is the explicit transition to `ready` and clears issue, progress, transcript ID, and captured settings before selection. Default cancel pauses batch; explicit continue advances only after terminal cancellation. Completed queue removal never deletes transcript.

`src/features/workbench/queue-store.ts` owns the synchronous external store. `dispatch(action)` applies `queueReducer`, stores the result, synchronously notifies listeners only when identity changes, and returns that exact next `QueueState`; `getState()` never lags a dispatch. React reads it only through `useSyncExternalStore`. The Phase 3 coordinator owns the store, the `AppShell` provider owns that coordinator for the complete app lifetime, and neither depends on a React reducer closure. `nextSequentialItem(state)` returns the earliest array item whose status is exactly `"ready"`, or `null`; it returns `null` when active, stopped, paused, or stop-after-current. Retry is exact: `const next = queueStore.dispatch({ type: "item-retried", itemId }); pump(next)`. Required tests prove returned-state identity, synchronous subscription, retry pumping the returned state, and the named ready-only cases `nextSequentialItem selects earliest ready only`, `cancelled item requires item-retried before selection`, and `failed item requires item-retried before selection`. A held-run route test navigates Workbench → Library → Workbench and requires work activity to remain true, the same run ID and queue object/state on return, no route-unmount cancellation/disposal, and exactly one terminal cleanup when the app scope eventually completes or disposes.

`src/features/transcription/runtime-coordinator.ts` owns `RuntimeCoordinatorSnapshot`, `RuntimeCoordinator`, `RuntimeCoordinatorOptions`, and `createRuntimeCoordinator(options: RuntimeCoordinatorOptions): RuntimeCoordinator`. It imports `ProductError`, `ProcessingMode`, `QueueItem`, `QueueState`, `QueueStore`, `CapturedTranscriptionSettings`, `RuntimeAdapter`, `RuntimeEvent`, and `RuntimeResult` from their exact owners. Provider and unit tests import coordinator types and factory only from this module; no second options alias or inline dependency shape exists.

### 5.7 Editor reducer

Defined in `src/features/transcript-editor/types.ts` and `src/features/transcript-editor/reducer.ts`; Phase 4 owns it.

```ts
export interface EditorSelectionPoint {
  segmentId: string
  offset: number
}

export interface EditorSelection {
  anchor: EditorSelectionPoint
  focus: EditorSelectionPoint
}

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

export function createEditorState(record: TranscriptRecord): EditorState
export function editorReducer(state: EditorState, action: EditorAction): EditorState
export function createEditorDraftPayload(
  state: EditorState,
  base: CanonicalTranscriptPayload,
): EditorDraftPayload
```

Callers allocate every operation/new-segment ID using `createId()`; reducer never generates IDs, reads time, uses randomness, performs I/O, or reparses a raw document. Enter/split, merge, multiline paste, spanning selection, and timing edits preserve spec ID/timing rules. Draft text derives from draft segments; canonical text exists only after successful commit. Invalid timeline timing remains an account-neutral Needs-attention draft and blocks subtitle/sync, not TXT.

Phase 1B owns draft/canonical types, parsers, commit gate, `DraftRecord`, and repository transaction tests. Phase 4 owns `createEditorDraftPayload`, reducer/autosave integration, draft-only refresh persistence, correction-to-canonical commit, subtitle/TXT behavior, navigation tests, and the structural `desiredPublicationFor(envelope): Promise<PendingDesiredPublication | null>` controller dependency. Phase 4 injects an async-null implementation and invokes it only from validated canonical mutation branches; Phase 5 supplies the definitive account-bound factory without changing repository signatures. `tests/unit/canonical.test.ts` proves bounded malformed timing returns Needs attention without factory/transcript/hash/pending writes; `tests/unit/database.test.ts` proves `persistDraftOnly` touches only `drafts`; `tests/unit/editor-reducer.test.ts` and `tests/e2e/editor-save.spec.ts` prove invalid timing survives refresh and only corrected canonical success invokes the callback, increments transcript revision, and may enqueue.

### 5.8 Drive publication, candidates, resolution, and sync state

Defined in storage-neutral `src/features/storage/remote-types.ts`, storage-neutral `src/features/storage/sync-types.ts`, `src/features/google-drive/types.ts`, and `src/features/google-drive/resolver.ts`. Phase 1B creates remote-quarantine declarations only in `remote-types.ts`. Phase 1B creates `PublicationState`, `DriveAppProperties`, `PendingDesiredPublication`, `PendingOperationBase`, every `PendingOperation` variant and constructor/parser guard, `BindGeneratedAttemptInput`, `ExpectedBoundAttempt`, `ExpectedFrozenAttempt`, `ExpectedCreatingAttempt`, `RemoteCandidate`, `VerifiedPublicationReceipt`, `DriveConnectionState`, `DriveSyncState`, and `SyncMetadata` only in `sync-types.ts`. Storage repositories import these durable contracts only from storage owners. Phase 1B Drive types consume those storage contracts and own `ObservedRemoteCandidate`, `ResolvedCandidateSet`, `DriveSyncSnapshot`, and `DriveSyncService`; they re-export storage names only when a Drive-facing compatibility import is necessary. Phase 5 adds `constants.ts` and modifies Drive types additively with identity, transport, parser, and verifier data declarations while importing the neutral receipt. No storage module imports Drive types. All strings entering canonical or identity state first pass scalar validation.

`src/features/transcription/hashes.ts` is the sole owner of candidate construction and its exact return type; no consumer may reference an undeclared local/ambient `DriveCandidateBody`:

```ts
export interface DriveCandidateBody {
  envelope: TranscriptEnvelope
  envelopeJson: string
  remoteKey: string
  candidateHash: string
  acceptedPayloadHash: string
  filename: string
  mimeType: typeof DRIVE_MIME
  appProperties: Readonly<DriveAppProperties>
}
export function constructDriveCandidate(envelope: TranscriptEnvelope): Promise<DriveCandidateBody>
```

Phase 5's definitive account-binding boundary is implemented only in `src/features/google-drive/desired-publication.ts`:

```ts
export interface AccountBoundDesiredPublicationFactoryDependencies {
  getIdentitySnapshot: DriveIdentityClient["snapshot"]
  parseTranscriptEnvelope: typeof parseTranscriptEnvelope
  constructDriveCandidate: typeof constructDriveCandidate
}
export type AccountBoundDesiredPublicationFactory = (
  envelope: TranscriptEnvelope,
) => Promise<PendingDesiredPublication | null>
export function createAccountBoundDesiredPublicationFactory(
  dependencies: AccountBoundDesiredPublicationFactoryDependencies,
): AccountBoundDesiredPublicationFactory
```

It parses the exact canonical next envelope, delegates candidate serialization/hashes/metadata to the existing immutable `constructDriveCandidate`, then reads the current identity snapshot after that await. Signed-out/opening/revoking and Needs-reconnect-without-identity return null. Connected and Needs-reconnect-with-identity return only `{ accountKey: identity.accountKey, transcriptId: candidate.envelope.transcriptId, desiredCandidateHash: candidate.candidateHash, desiredEnvelopeJson: candidate.envelopeJson }`. `main.tsx` creates one factory from the singleton identity client and injects its returned `desiredPublicationFor` callback into `AppShell`; `AppShell` passes it to Phase 4's canonical Workbench-save, autosave, and Library mutation controller dependencies. Those exact canonical branches alone invoke it after preparing a validated next live/tombstone/restore envelope and before their existing atomic repository call; draft-only, render/event, transport, repository, and reconcile paths never invoke it. Bulk clear prepares every tombstone first, awaits one factory call per envelope, and passes only non-null results. No other `PendingDesiredPublication` constructor or compatibility export exists.

```ts
export type PublicationState =
  | "unbound"
  | "bound"
  | "creating"
  | "verifying"
  | "needs-attention"

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

export interface BoundPendingOperation extends PendingOperationBase, FrozenPendingAttempt {
  publicationState: "bound"
}

export interface CreatingPendingOperation extends PendingOperationBase, FrozenPendingAttempt {
  publicationState: "creating"
}

export interface VerifyingPendingOperation extends PendingOperationBase, FrozenPendingAttempt {
  publicationState: "verifying"
}

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

export function resolveCandidateSet(
  candidates: readonly ObservedRemoteCandidate[],
): ResolvedCandidateSet
export function compareRegularOrder(left: RemoteCandidate, right: RemoteCandidate): -1 | 0 | 1
export function isRestoreEligible(
  live: RemoteCandidate,
  dominantTombstone: RemoteCandidate,
): boolean
export type RevisionAdvanceIssueCode =
  | "resolver.invalid-revision"
  | "resolver.revision-overflow"
export class RevisionAdvanceIssue extends RangeError {
  readonly code: RevisionAdvanceIssueCode
  readonly current: number
  constructor(code: RevisionAdvanceIssueCode, current: number)
}
export function nextRevision(current: number): number

export type DriveConnectionState =
  | "signed-out"
  | "opening"
  | "connected"
  | "needs-reconnect"
  | "revoking"

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

export type DriveReconcileTrigger =
  | "sign-in"
  | "local-mutation"
  | "online"
  | "focus"
  | "interval"

export interface DriveSyncServiceDependencies {
  identity: DriveIdentityClient
  reconcile(trigger: DriveReconcileTrigger): Promise<void>
  accountSwitchGuard: AccountSwitchGuard
  now(): number
  isOnline(): boolean
  window: Pick<Window, "addEventListener" | "removeEventListener" | "setInterval" | "clearInterval">
  document: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">
}

export function createDriveSyncService(
  dependencies: DriveSyncServiceDependencies,
): DriveSyncService

export type AuthGesture = "connect" | "reconnect" | "sync-now"
export type GrantedScope = (typeof REQUIRED_SCOPES)[number]
export interface MemoryCredential {
  accessToken: string
  expiresAt: number
  grantedScopes: ReadonlySet<string>
}
export interface GoogleIdentity {
  issuer: typeof GOOGLE_ISSUER
  accountKey: string
  sub: string
  name: string | null
  verifiedEmail: string | null
  picture: string | null
}
export type IdentitySnapshot =
  | { state: "signed-out"; identity: null; attemptId: null; errorCode: null }
  | { state: "opening"; identity: null; attemptId: string; errorCode: null }
  | { state: "connected"; identity: GoogleIdentity; attemptId: null; errorCode: null }
  | { state: "needs-reconnect"; identity: GoogleIdentity | null; attemptId: null; errorCode: string }
  | { state: "revoking"; identity: GoogleIdentity; attemptId: null; errorCode: null }

export interface DriveIdentityClient {
  snapshot(): IdentitySnapshot
  subscribe(listener: () => void): () => void
  requestFromGesture(gesture: AuthGesture): Promise<GoogleIdentity>
  credentialForProtectedCall(required: readonly GrantedScope[]): MemoryCredential
  checkFreshness(): void
  signOut(): void
  revokeFromGesture(): Promise<"confirmed" | "unconfirmed">
  dispose(): void
}

export type AccountSwitchPreviewResult = readonly RemoteCandidate[]
export type AccountSwitchApplyResult = void
export type AccountSwitchAssociationResult = void

export interface AccountSwitchGuard {
  cancel(): Promise<void>
  previewWithoutUpload(identity: GoogleIdentity): Promise<AccountSwitchPreviewResult>
  applyPreviewAfterEditorGuard(identity: GoogleIdentity, candidateIds: readonly string[]): Promise<AccountSwitchApplyResult>
  associateAfterDisclosure(identity: GoogleIdentity, transcriptIds: readonly string[]): Promise<AccountSwitchAssociationResult>
}
```

`candidateId` is account-neutral durable identity for a distinct candidate, derived deterministically from transcript/candidate identity; Drive account/file association lives only in `SyncMetadata`. `RemoteCandidate` contains no account key or Drive file ID. Slice 1B `storage/sync-types.ts` owns pending constructors/parser/guards and durable candidate/sync records. Slice 1B `google-drive/types.ts` owns the exact `ObservedRemoteCandidate`, `ResolvedCandidateSet`, `DriveSyncSnapshot`, `DriveSyncService`, and Drive-only signatures above while consuming storage contracts one-way. Phase 5 adds `AccountSwitchGuard` and its three result types only to that existing `types.ts`; `identity.ts` imports and uses them without a duplicate declaration or re-export. Phase 5 changes Drive types only through explicitly additive declarations. Resolver deduplicates identical `candidateHash` values using lowest lexicographic file ID as physical representative, then applies revision → bounded `updatedAt` → ASCII `deviceId` → lowercase accepted-payload hash order, dominant tombstone, and exact greater-revision restore eligibility. Every loser remains durable.

`src/features/google-drive/sync-service.ts` alone implements and exports `createDriveSyncService` plus `DriveSyncServiceDependencies`; the existing `DriveSyncService` return interface remains in `google-drive/types.ts`. `src/main.tsx` is the sole production composition call site: repositories → `createDriveIdentityClient` → `createDriveTransport({ identity, fetch })` → `createDriveReconciler({ identity, transport, repositories, ... })` → `createDriveSyncService({ identity, reconcile: reconciler.run, accountSwitchGuard, now, isOnline, window, document })` → `AppShell` injection. Service code owns triggers/coalescing/snapshot/disposal and calls the injected reconcile runner; it never constructs transport or writes repositories. `src/features/google-drive/drive.ts` itself retains the concrete `isGoogleDriveConfigured(): boolean` implementation as `Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim())` and re-exports only the defined `createDriveSyncService`/`DriveSyncServiceDependencies` from `sync-service.ts`; no unnamed, undefined, or alternate compatibility factory is permitted.

`nextRevision(current)` accepts only safe integers in `0..Number.MAX_SAFE_INTEGER - 1`; invalid input throws `RevisionAdvanceIssue` with code `resolver.invalid-revision`, and `Number.MAX_SAFE_INTEGER` throws the same typed class with code `resolver.revision-overflow`. `resolveCandidateSet` calls `nextRevision(dominantTombstone.revision)` when evaluating the minimum eligible restore revision; it never spells revision advancement as `+ 1`, and overflow fails with the typed issue rather than wrapping, clamping, or silently choosing another candidate.

Phase 5 owns optional transcription origins through `build/csp.ts` plus `vite.config.ts` `transformIndexHtml`. `buildContentSecurityPolicy({VITE_CF_WORKER_URL,VITE_SERVER_URL})` always includes only fixed GIS/UserInfo/Drive hosts and appends `URL.origin` for each configured value when it is HTTPS or HTTP on exact `localhost`, `127.0.0.1`, or `[::1]`. It rejects credentials, malformed values, non-HTTP(S), and non-local HTTP; build fails closed. It deduplicates exact origins, strips path/query/hash, preserves explicit ports, and emits no wildcard or bare scheme. `index.html` contains only the `__WHISDOM_CSP__` placeholder. `tests/unit/csp.test.ts` covers absent/valid/invalid values and a static Pages build with both optional URLs absent.

`UnboundPendingOperation` requires every generated/attempted field to be literally null and permits only desired-body coalescing. `bindGeneratedAttempt` freezes `generatedFileId`, `attemptedCandidateHash`, `attemptedEnvelopeJson`, `attemptedPayloadHash`, `attemptedFileName`, `attemptedMimeType`, and `attemptedPrivateProperties` before network dispatch. Bound means durable and not in flight; Creating means request may have happened and recovery treats outcome as ambiguous; Verifying means exact-ID verification or stabilization is active; NeedsAttention disables automatic retry. Frozen fields are byte-for-byte immutable in every non-unbound state. A newer local revision changes only desired fields. Verified attempted success removes that attempt; differing desired content creates a fresh `UnboundPendingOperation`. Stale expected state/ID/hash rejects atomically. No transition allocates a second ID for one bound attempt.

#### 5.8A Drive constant ownership

`src/features/google-drive/constants.ts` is the sole declaration owner for `REQUIRED_SCOPES`, `GOOGLE_ISSUER`, `GOOGLE_USERINFO_URL`, `DRIVE_API_ROOT`, `DRIVE_UPLOAD_ROOT`, `GOOGLE_AVATAR_HOST`, `DRIVE_MIME`, `DRIVE_PROPERTY_TRANSCRIPT_KEY`, `DRIVE_PROPERTY_SCHEMA_VERSION`, `DRIVE_PROPERTY_CANDIDATE_HASH`, `DRIVE_SCHEMA_VERSION_VALUE`, `DRIVE_APP_DATA_SPACE`, `DRIVE_MULTIPART_BOUNDARY`, `TOKEN_FRESHNESS_MARGIN_MS`, `AUTH_WATCHDOG_MS`, `USERINFO_CAP`, `AVATAR_CAP`, `REMOTE_BODY_CAP`, `REMOTE_BODY_OVERFLOW_SENTINEL`, `MAX_DOWNLOADS`, `MAX_STABILIZATION_PASSES`, `MAX_CLEANUP`, `MAX_OPERATION_FAILURES`, all four UserInfo scalar limits, `MAX_REMOTE_FILE_ID_BYTES`, and `MAX_MIGRATABLE_TRANSCRIPT_ID_BYTES`. Values are exactly those pinned in Phase 5 Section 3.

`types.ts`, `identity.ts`, `avatar.ts`, `transport.ts`, `src/features/transcription/hashes.ts`, `publication.ts`, `parser.ts`, `legacy-migration.ts`, `reconcile.ts`, and `sync-service.ts` import applicable exact symbols from that module. None redeclares a protocol literal or leaves scope/issuer/MIME/host/property/cap placement undefined. Phase 5 constant tests verify exact values and scan consumers for duplicate declarations/raw protocol literals; Task 1 stages `constants.ts`, `types.ts`, Drive copy, `src/app/copy.ts`, repositories, and both named tests/fixtures as exactly seven paths.

### 5.9 Phase 6 fixture API ownership

These helpers are public test-fixture contracts, not production seams. Names, files, argument shapes, and return types are fixed; no plan may rename them, add a second fixture system, or use conditional “if absent” language.

Phase 6 runner imports actual functions and types from `./fixtures/database`, `./fixtures/runtime`, `./fixtures/drive`, and `./fixtures/settings`; it contains no bodyless exported declarations, ambient fixture declarations, or duplicate option/state interfaces. Missing exports return to the owning phase.

`tests/e2e/fixtures/database.ts` is created by Slice 1A for database fixtures, extended by Slice 1B for v2/quarantine fixtures, and extended by Phase 4 for Library/editor state helpers. Phase 4 owns these exact exports:

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
  schemaVersion: 2
  transcriptId: string
  revision: number
  updatedAt: number
  deletedAt: null
  deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA"
  deletionId: null
  restoredFromDeletionId: null
  transcript: {
    title: string
    sourceName: string
    language: "en"
    modelId: "Xenova/whisper-base"
    mode: "local-webgpu"
    createdAt: number
    text: string
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
    schemaVersion: 2,
    transcriptId,
    revision: 0,
    updatedAt,
    deletedAt: null,
    deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA",
    deletionId: null,
    restoredFromDeletionId: null,
    transcript: {
      title,
      sourceName: `${transcriptId}.wav`,
      language: "en",
      modelId: "Xenova/whisper-base",
      mode: "local-webgpu",
      createdAt: updatedAt,
      text: segments.map((segment) => segment.text).join(" "),
      segments,
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
  const records = ids.map((id, index) => fixtureEnvelope(id, 1, updatedAtStart - index, `Library transcript ${index + 1}`))
  await writeFixtureEnvelopes(page, records)
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
    if (saveFails) target.__WHISDOM_REPOSITORY_FIXTURE__ = {
      version: 1,
      failNext: "commitCanonicalDraftAndCoalescePending",
      consumed: [],
    }
    else delete target.__WHISDOM_REPOSITORY_FIXTURE__
  }, options.saveFails === true)
  await writeFixtureEnvelopes(page, [fixtureEnvelope(transcriptId, options.segmentCount, 1_785_283_200_000, "Editor fixture")])
  return transcriptId
}
```

`seedLibrary()` writes exactly `options.count` protocol-valid schema-2 live envelopes and returns IDs in `updatedAt`-descending/ID-ascending default-list order. `seedTranscript()` writes one protocol-valid live envelope with exactly `segmentCount` ordered, nonoverlapping segments. `segmentCount` must be a safe integer in `1..5000`; zero, negative, fractional, unsafe, and over-limit values throw `RangeError("fixture.segmentCount must be a safe integer in 1..5000")` before IndexedDB opens, so `fixtureEnvelope` can never manufacture an invalid zero-segment canonical envelope. The Phase 4 fixture contract test asserts both `0` and `-1` reject with this exact error and leave the database unopened. Its save-failure seam consumes the Phase 1B-owned `RepositoryFailurePort`: `window.__WHISDOM_REPOSITORY_FIXTURE__` has `{version:1,failNext:RepositoryFixtureMethod|null,consumed:RepositoryFixtureMethod[]}`. `createStorageRepositories(db,{failurePort})` supports explicit injection; the default factory reads the global only under `import.meta.env.DEV || import.meta.env.MODE === "e2e"`, consumes one matching failure before a write transaction, and ignores the global in production mode. SAVE-02 asserts consumption and deletes the property in `finally`; `saveFails:false` deletes it before bootstrap. The fixture contains no alternate persistence implementation. Neither helper opens a production route before seeding or imports a production page/component.

`tests/e2e/fixtures/runtime.ts` is created by Phase 2 and exclusively extended by Phase 3. The corrected complete implementation in the Phase 3 plan is authoritative; this master pins only its exact public signatures and invariants so no stale duplicate implementation can diverge:

```ts
import type { Page } from "@playwright/test"

export type WorkbenchFixtureState = "empty" | "review" | "active" | "failed" | "queue-sheet"

export function installRuntimeFixture(page: Page): Promise<void>
export function openWorkbenchState(
  page: Page,
  state: WorkbenchFixtureState,
  language: "en" | "vi",
): Promise<void>
```

The installed `window.__WHISDOM_RUNTIME_FIXTURE__` contract includes `cancellationMode`, `setCancellationMode(mode)`, `nextOutcome`, `acknowledgeCancel`, `complete`, `fail`, `emitMeasured`, and `start(...,{needsConversion?})`, plus deterministic `starts`, `activeRuns`, `maxActiveRuns`, `activeRunId`, `terminalCleanups`, ASR/ffmpeg created/terminated counters, Cloudflare fetch/abort counters, server submit/cancel counters, SSE open/close counters, cache-key snapshots, and ignored-late-event count. `cooperative` waits for an active-operation checkpoint to clean up and explicitly acknowledge while preserving both worker slots; a cancel request alone never acknowledges or deletes its marker. Completion after acknowledgement increments only ignored-late-event evidence and cannot publish success. `forced-asr` and `forced-ffmpeg` withhold acknowledgement for exactly 150 ms, terminate only the selected live slot, increment only its termination counter, then emit terminal cancellation; forced ffmpeg requires `needsConversion:true`. First use and post-termination retry lazily increment the selected creation counter once; singleton reuse does not. RUN-02 proves pre-timeout Cancelling, timeout completion, exact counter deltas, one lazy replacement only after teardown, no retry overlap, unchanged other slot/cache keys, and `maxActiveRuns === 1`. The held-route QUEUE-01 case proves `activeRunId`, queue identity/state, and work activity survive Workbench → Library → Workbench with `starts === 1`, then terminal completion increments `terminalCleanups` exactly once. `openWorkbenchState("active")` waits for exact `runtime-active-state[data-runtime-status="running"]` and `queue-active-item[data-queue-status="running"]`; broad text is insufficient. `openWorkbenchState("queue-sheet")` seeds exactly three queue items, opens the sheet, and proves the middle can move earlier/later while boundary actions are disabled. Phase 6 imports and consumes these exports unchanged; a missing export stops Phase 6 and requires an amendment to Phase 3.

`tests/e2e/fixtures/drive.ts` is created and exclusively owned by Phase 5. The corrected complete implementation in the Phase 5 plan is authoritative; this master pins only its exact public signatures and invariants. Phase 6 consumes it unchanged:

```ts
import type { Page } from "@playwright/test"

export type DriveIdentityFixtureState = "menu" | "auth-error" | "revoke-unconfirmed" | "account-switch"
export type DriveSyncFixtureState = "attention" | "conflict" | "toast"
export interface DriveFixtureOptions {
  identity?: DriveIdentityFixtureState
  sync?: DriveSyncFixtureState
  discoveryFault?: "reject-candidate-query" | "invalid-page-token" | "incomplete-search"
}

export function installDriveFixture(page: Page, options?: DriveFixtureOptions): Promise<void>
export function openIdentityState(
  page: Page,
  state: DriveIdentityFixtureState,
  language: "en" | "vi",
): Promise<void>
export function openSyncState(
  page: Page,
  state: DriveSyncFixtureState,
  language: "en" | "vi",
): Promise<void>
```

`installDriveFixture()` computes canonical envelope bodies with `serializeTranscriptEnvelope`, `remoteKey`, and each `candidateHash`; metadata filename/properties/MIME/byte size and both metadata and `alt=media` readbacks match those computed values. It rejects malformed candidate query predicates and invalid pagination tokens. Conflict observation is exact complete-pass sequence `{A}`, `{B}`, `{A,B}`, `{A,B}`, with the two-file passes paginated; stability occurs only on pass four and both candidates require metadata plus media readback before UI conflict. Account switching returns account-A identity/verified-email metadata first, persists/protects its sync state, holds the dirty edit before debounce, consumes one injected repository save failure, then returns account B and pauses before upload/apply; opener assertions require zero upload and zero Apply action. Request inspection reads headers and every body before fulfillment, verifies the in-memory bearer, validates exactly one approved canonical multipart body when applicable, discards raw observations, rejects media/settings/source/raw-identity leakage and noncanonical upload bytes, and stores only sanitized `{method,pathname}` with opaque Drive IDs replaced by `:id`. `openIdentityState()` and `openSyncState()` use public UI and await their named state. Phase 6 imports these exports unchanged; a missing export stops Phase 6 and requires an amendment to Phase 5.

Phase 1 also owns `tests/e2e/fixtures/settings.ts`:

```ts
import type { Page } from "@playwright/test"
export type SettingsFixtureState = "default" | "validation"
export function openSettingsState(
  page: Page,
  state: SettingsFixtureState,
  language: "en" | "vi",
): Promise<void>
```

`validation` enters chunk `14` and overlap `NaN`, blurs, and waits for the exact validation summary and both associated errors. Phase 6 imports this actual function/type unchanged; it contains no bodyless fixture declarations or ad hoc Settings setup.

### 5.10 Phase 7 rollout fixture ownership

Phase 7 creates exactly `tests/e2e/fixtures/rollout.ts` and `tests/e2e/rollout.spec.ts`. The fixture is Node-side test code and directly imports `parseTranscriptEnvelope`/`serializeTranscriptEnvelope` from `src/features/transcription/schema.ts`, `parseEditorDraftPayload`/`commitEditorDraftPayload` from `src/features/transcription/canonical.ts`, `remoteKey`/`candidateHash`/`acceptedPayloadHash`/`rawBodyByteHash` from `src/features/transcription/hashes.ts`, and `parsePendingOperation` from `src/features/storage/sync-types.ts`. It constructs all fixtures before browser launch, then passes structured-clone data into page IndexedDB helpers. No rollout-specific production/browser global, rollout environment switch, `VITE_*` define, conditional installation, copied canonicalizer, or client bridge exists. The required pre-existing Slice 1A `window.__WHISDOM_STORAGE_COMPATIBILITY__` contract remains the sole permitted browser contract for the floor.

```ts
import type { Page } from "@playwright/test"
import type { PendingOperation } from "@/features/storage/sync-types"
import type { EditorDraftPayload, TranscriptEnvelope } from "@/features/transcription/types"

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

export function buildRolloutFixtureSet(): Promise<RolloutFixtureSet>
export function seedRolloutDatabase(page: Page, fixture: RolloutFixtureSet): Promise<void>
export function readRolloutDatabase(page: Page): Promise<RolloutDatabaseSnapshot>
export function mutateThroughFloorCompatibility(page: Page): Promise<FloorMutationExpectation>
export function expectProtectedSnapshotEqual(actual: RolloutDatabaseSnapshot, expectedBeforeFloorSnapshot: RolloutDatabaseSnapshot, floorMutation: FloorMutationExpectation): void
export function expectedAfterFloorMutation(expectedBeforeFloorSnapshot: RolloutDatabaseSnapshot, floorMutation: FloorMutationExpectation): RolloutDatabaseSnapshot
```

`buildRolloutFixtureSet()` rejects unless every envelope, draft, digest, and pending variant passes its source parser/constructor. Browser helpers perform only IndexedDB I/O and consume the required pre-existing Slice 1A `window.__WHISDOM_STORAGE_COMPATIBILITY__` seven-function contract; they do not install a rollout-specific global or bridge, hash, canonicalize, reconstruct fixtures, or attach observations to browser globals. `readRolloutDatabase()` snapshots every schema-2 store by exact name: `settings`, `transcripts`, `drafts`, `conflictCandidates`, `syncMetadata`, `pendingOperations`, `syncState`, `meta`, and `migrationQuarantine`. Every one of the nine arrays contains exact `SerializedStoreEntry` objects. Cursor `primaryKey` supplies `encodedKey` for both out-of-line stores (`settings`, `meta`) and inline/compound-key stores; deterministic type-tagged IndexedDB-key encoding prevents string/number/date/binary/array collisions. Canonical value serialization produces `canonicalBytes`, and each array sorts by `encodedKey` then `canonicalBytes`. Comparisons use exact `encodedKey` plus exact `canonicalBytes`, never array position, `value` object identity, or JSON-stringified keys. `rollout.spec.ts` records `initialCandidateSnapshot` immediately after seed, performs candidate rename/delete, then records `expectedBeforeFloorSnapshot`. Floor comparison uses only that post-candidate expected snapshot and permits mutations only for exact encoded transcript keys `tr_rollout_floor_saved` and `tr_rollout_floor_deleted`; every other entry in all nine stores must retain the same encoded key and canonical value bytes. It separately validates the two complete canonical floor records. `expectedAfterFloorSnapshot` derives only from `expectedBeforeFloorSnapshot` plus those two allowed mutations. Forward candidate first compares a fresh snapshot to that expected post-floor state, never to the stale initial snapshot, then derives final expectation from only its observed rename/delete records; all other entries in every store retain exact encoded keys and canonical value bytes. If the deployed floor lacks the exact Phase 1 contract, Phase 7 stops, records the Phase 1 owner/export, and obtains a reviewed plan amendment before any edit.

## 6. Global ownership and safety rules

1. React render code performs no worker calls, repository transactions, fetches, GIS calls, Drive calls, timers that reacquire tokens, or provider cancellation.
2. Runtime adapters own cancellation, run IDs, abort controllers, job IDs, SSE subscriptions, listener cleanup, and terminal acknowledgement.
3. Runtime coordinator executes batch items sequentially. No adapter may introduce concurrent item processing.
4. Queue and editor reducers are pure. Callers supply IDs, timestamps, files, and validated external results.
5. Ordered editor-draft segments are edit source of truth; ordered canonical segments are durable/sync source of truth after successful commit. `text` is always derived. No editable independent document string exists.
6. Every worker/provider/Drive/GIS/IndexedDB legacy payload is external data and receives exact type, scalar, bound, enum, timestamp, and allowlist validation before canonical state.
7. Access tokens, authorization headers, expiry-derived credentials, ID tokens, and refresh-token-like state remain memory-only. No log, error, URL, export, IndexedDB record, or analytics entry contains them.
8. Local transcript mutation and pending-operation enqueue/coalescing are atomic. Drive failure never rolls back local completion.
9. Invalid-timing editor state persists through the draft-only transaction. It cannot mutate a transcript, revision, hash, sync metadata, or pending operation until `commitEditorDraftPayload()` returns `canonical`.
10. Remote Drive candidates are immutable append-only schema-2 files. Same candidate publication retries same pre-generated file ID and exact body.
11. Drive listing is non-snapshot. Absence never authorizes overwrite, Synced, or deletion. Cleanup uses only positively identified, downloaded, validated IDs.
12. `SyncMetadata.itemState = "synced"` is written only by `finalizeStabilizedWinner()` together with pending removal/replacement; no independent metadata write may claim it.
13. Core transcription remains local-first and static-host compatible. Add no backend dependency or broad server/Cloudflare refactor.
14. Never upload source media or settings to Drive. Link server mode may transfer its URL only after explicit mode/source choice and clear privacy copy.
15. Preserve at most one ASR and one ffmpeg worker, single-threaded ffmpeg, model Cache Storage, WebGPU secure-context/WASM fallback, and q4 WebGPU restriction.

## 7. Phase governance table

| Phase | Goal and entry | Mandatory checkpoints | Exit and release rule | Dependencies | Likely commits |
| --- | --- | --- | --- | --- | --- |
| 1 — Foundations/rollback/migration | Start at `4098fe355588ae1331a1f574a72a42e022bcfaae` baseline; establish dependencies, test harness, base typed copy/registry, `ProductErrorPanel`, strict single-error baseline, compatibility opener/parser, release floor, v2 migration, shell/contracts, and final Settings | Foundation copy/error primitives; 1A versionless opener plus exact `compatibility.ts` v1-v2 adapter contract; explicit independent Foundation+1A approval/merge to `master`; existing CI Pages deploy; product/API smoke; evidence-only descendant commit; 1B canonical modules/migration/shell, full Settings, and copy extension | Both `.first()` removed; deployed evidence/checker exits 0 before any v2 exposure; minimal parser/schema/projection matrix passes; every v1 row canonical or recoverably quarantined; SETTINGS-01 passes; Workbench/Settings addressable | None | `test: stabilize baseline error assertions`; `chore: establish precision studio foundations`; `fix(storage): open supported database versions`; `chore(release): record precision studio rollback floor`; `feat(storage): migrate transcripts to schema 2`; `feat(app): add precision studio shell` |
| 2 — Guided Workbench | Enter only on complete 1B; create sole `MeasuredProgress`; add recommendation/source/review/issues without runtime cancellation rewrite | Recommendation precedence; File append and Link-only server; privacy/review; typed issues; ready-only selection contract | REC-01..06 and WB-01..02 pass in EN/VI/mobile; queue tests prove cancelled/failed require retry before selection | Phase 1B | `feat(workbench): add deterministic model guidance`; `feat(workbench): add source and review flow` |
| 3 — Runtime/cancellation/queue | Enter with stable queue/source/progress contracts; normalize all providers without redeclaring progress | Adapter events; honest progress/ETA; cooperative checkpoint/forced-teardown terminal cancel; AppShell-owned sequential ready-only coordinator; queue panel/sheet; contextual errors/FIFO confirmations | RUN-01..04, QUEUE-01, ERR-01 pass; held runs survive query routes; no post-ack completion, retry overlap, synthetic percentage, direct cancelled/failed selection, leak, duplicate error, or premature cancelled state | Phase 2 | `feat(runtime): normalize transcription providers`; `feat(runtime): add acknowledged cancellation`; `feat(queue): add sequential run controls` |
| 4 — Editor/Library | Enter with v2 repository and normalized runtime result; consume migration, never alter schema | Bounded draft reducer; draft-only invalid save; canonical commit/export gate; autosave/dirty navigation; full-page editor; incremental search; Library virtualization/actions/tombstone Undo | EDIT-01..04, SAVE-01..03, LIB-01 pass; invalid timing survives only as draft; parser/editor/export/hash bytes agree after canonical success | Phases 1B and 3 | `feat(editor): add canonical transcript workspace`; `feat(editor): protect serialized autosave`; `feat(library): add transcript library` |
| 5 — Drive immutable sync | Enter with Phase 1B storage-owned durable sync contracts, Drive-only shared types, atomic local mutation, and durable drafts/candidates | Preserve `storage/sync-types.ts`; add compatible identity/transport/parser/service types only to the Drive file; A identity/transport; B durable outbound; C inbound reconciliation/conflicts | GIS-01..05, DRV-01..06, PRIV-01 pass; no storage→Drive import, duplicate durable declaration, source/settings upload, wildcard CSP, raw Drive IDs, silent account disclosure, or unstable false-Synced | Phase 4 | `feat(drive): add identity and bounded transport`; `feat(drive): publish immutable candidates`; `feat(drive): reconcile candidate sets`; `test(drive): prove privacy and convergence` |
| 6 — Cross-feature hardening | Enter only after Phases 1–5 feature-complete and all Section 5.9 fixture exports exist | Consume exact fixture APIs; 320/390/200% reflow; keyboard/safe-area; WCAG matrix; lazy chunks; profiler isolation; virtualization/yield gates | All named checks and PERF gates pass; no fixture rename/fallback/duplicate system. Integrated release gate; no standalone deployment | Phases 1–5 | `test(a11y): verify responsive feature flows`; `test(a11y): cover precision studio states`; `perf(test): enforce route and render isolation` |
| 7 — Rollout/cleanup | Enter after Phase 6 green; remove legacy/dead product code and execute exact artifact drill | Old App components/copy/string matching/modal/workarounds removed; full regression; exact-path candidate commit and clean SHA capture before artifacts; separate absolute candidate/floor artifacts; same-origin persistent-profile rollback rehearsal; cleanup | Every acceptance family and pre-commit gate passes; committed candidate status is clean; preview children/profile cleaned; candidate can roll forward or back only to 1A floor | Phase 6 | `chore: prepare precision studio rollout candidate` |

Phase 5 may be reviewed and committed per checkpoint, but no Phase 5 deployment occurs until A, B, and C are complete together.

## 8. Cross-phase test matrix

| Named family | Owning phase plan | Required scope |
| --- | --- | --- |
| REC-01..06 | Phase 2 | deterministic local recommendation and separate server default |
| WB-01..02 | Phase 2 | File append/review/start and URL-only server flow |
| RUN-01..04 | Phase 3 | cooperative/forced/server/Cloudflare cancel and ETA boundaries |
| QUEUE-01 | Phase 2 contract; Phase 3 integration | sequential success/failure/cancel/pause/continue; earliest `ready` only; cancelled/failed require explicit retry before selection |
| ERR-01 | Phase 1 Foundation baseline plus Phase 3 final system | one contextual failure channel and stale-error clearing |
| EDIT-01..04 | Phase 4 | canonical reducer, timing, exports/hash, search, empty-cue rules |
| SAVE-01..03 | Phase 4 | canonical and invalid draft refresh persistence, canonical-only transcript/enqueue, guarded navigation, unload warning |
| COMPAT-01 | Slice 1A | exact nine-store/index/key-path inspection; device/lineage/epoch/scalar/envelope/payload/segment parsing; checked ms↔seconds; failure mapping; no mutation |
| MIG-01 | Slice 1A | deployed/API fresh-v1-v2-unsupported-v3 opening plus list/open/save/rename/tombstone-delete/reopen behavior; no numeric v2 request |
| MIG-02..03 | Phase 1B | exact transactional migration, quarantine, abort, rollback floor |
| LIB-01 | Phase 4 | search/filter/actions/deep link/1,000 rows |
| GIS-01..05 | Phase 5A/C | auth attempts, identity/avatar, gesture expiry, scopes/revoke, account switch |
| DRV-01..06 | Phase 5B/C | immutable publication, parser/hash, resolver, migration, same-ID retry, stabilization |
| PRIV-01 | Phase 5 and Phase 7 regression | transcript-only requests, narrow CSP, consent |
| NAV-01 | Phase 1B; dirty extensions Phase 4 | query history/deep-link/focus and save guard |
| SETTINGS-01 | Phase 1B; consumed Phase 6 | chunk integer 15–60, overlap finite 0–5 and below chunk, durable-value preservation, EN/VI associations, confirmations, active-work cleanup disabling |
| I18N-01 | Every phase; consolidated Phase 6/7 | EN/VI parity and no hardcoded English |
| PERF-01 | Phase 1B, verified Phase 6 | separate lazy chunks and no eager heavy requests |
| PERF-02..03 | Phase 4/6 | progress isolation, virtualization thresholds, 8 ms yielding |
| FIXTURE-01 | Phases 1–5 own; Phase 6 consumes | exact Section 5.9 database/runtime/Drive/Settings exports and signatures reach every matrix state without rename, fallback, ambient declaration, or duplicate fixture system |
| ROLLBACK-01 | Phase 7 | distinct absolute candidate/floor artifacts, exact preview cwd/outDir semantics, one origin/profile/database, readiness, kill, and cleanup |

Accessibility families `A11Y-AUTO-01..07`, `A11Y-KBD-01`, `A11Y-FOCUS-01`, `A11Y-REFLOW-01`, `A11Y-CONTRAST-01`, `A11Y-LIVE-01`, `A11Y-SR-01`, and `VIS-01` are introduced with each affected phase and consolidated in Phase 6. Phase 7 reruns them without weakening assertions.

## 9. Verification protocol

### Focused red/green cycle

Every phase task follows test-first steps in its phase plan:

- [ ] Write one failing focused unit/component/E2E test with exact fixture and assertion.
- [ ] Run only that file/test and confirm failure is caused by missing behavior, not syntax or fixture failure.
- [ ] Implement minimum contract-compliant behavior.
- [ ] Rerun focused test and confirm pass.
- [ ] Run adjacent feature suite before staging.
- [ ] Stage exact listed files only and inspect staged paths/content.
- [ ] Commit only when the orchestrator explicitly executes the implementation plan; this documentation-writing task creates no commit.

Focused command forms:

```powershell
pnpm vitest run tests/unit/canonical.test.ts
pnpm vitest run tests/components/navigation.test.tsx
pnpm playwright test tests/e2e/workbench.spec.ts --grep "WB-01" --reporter=list
```

Expected red: selected assertion fails for the behavior under construction. Expected green: selected command exits 0 with all selected tests passing and no unhandled errors.

### Phase gate

Run from `F:\Workspace\whisdom\whisdom-precision-studio` in this order:

```powershell
pnpm typecheck
rtk lint
pnpm test
pnpm build
pnpm test:e2e
```

Expected: every command exits 0. `pnpm test:e2e` reports only documented real-ASR/WebGPU gated skips; after Phase 1 no strict-locator `.first()` workaround or duplicate-render failure remains.

During iteration, `rtk lint` is preferred. Before every commit/release candidate, also run `pnpm lint`; AGENTS requires zero errors and zero warnings. If `rtk lint` transiently reports missing `test-results` after Playwright cleanup, rerun once before editing unrelated code.

Worker/shared worker-contract changes also run:

```powershell
pnpm --filter whisdom-worker typecheck
```

Expected: exit 0. No `worker/` shared contract change is planned; run only if implementation actually touches that boundary.

Preserve gated real ASR checks and run for final rollout-capable environments:

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

Expected evidence records command, browser/OS/GPU, provider/model fixture, selected scenario names, pass count, skip count, exit code, and UTC execution time. Real-ASR evidence must show one actual audio fixture transcribed and its transcript opened in the full-page editor; real-WebGPU evidence must show the WebGPU-tagged scenario used WebGPU and completed. Missing hardware/credentials may produce a documented gated skip, but a skip is not recorded as real-runtime pass and cannot satisfy a rollout gate that explicitly requires that environment.

No `server/` changes are expected. Do not run or claim `cargo build` unless `server/` changes; if scope unexpectedly requires it, stop for approval because broad backend work is out of scope.

## 10. Performance, bundle, accessibility, mobile, and theme gates

### Performance and requests

- Initial Workbench build/request graph excludes lazy Library, transcript editor, and Settings code.
- No model, ONNX, or ffmpeg asset request occurs before explicit Transcribe.
- Library virtualizes only above 200 filtered rows; Timeline virtualizes only above 500 render-capable segments.
- Search/index work yields whenever a monotonic chunk reaches 8 ms. Tests prove both scheduler/idle support and `setTimeout(0)` fallback split large work.
- Fixtures contain 1,000 Library rows and 5,000 Timeline segments.
- Across 100 throttled progress updates, React Profiler records zero progress-caused commits after initial mount in header, primary navigation, and mounted Library subtree; progress subtree commits.
- Runtime visual updates are throttled; terminal delivery is immediate. Progress uses measured stage numerator/denominator only; no synthetic global percentage.
- Drive permits at most four concurrent downloads and serializes creates per logical transcript.
- Build/request assertions verify distinct lazy chunks and no eager model/ffmpeg/editor/search-heavy request.

### Accessibility, mobile, motion, and themes

- WCAG 2.2 AA; zero automated critical/serious axe violations for every `A11Y-AUTO-01..07` state.
- Run each state in exactly six locale/viewport cases total: EN and VI × desktop, 390 px, and 320 px.
- One visible `h1`, semantic landmarks/nav, first-focus skip link, route-heading focus, overlay trigger restoration, no positive `tabindex`.
- 44×44 CSS px minimum touch targets. No hover-only actions.
- One authoritative Workbench combobox model: the trigger button is the sole `role="combobox"` and owns `aria-expanded` plus `aria-controls`; it never owns `aria-activedescendant`. The open focused popup input is `role="searchbox"`, owns `aria-controls` and the enabled active option's `aria-activedescendant`, the collection is `role="listbox"`, and results are `role="option"`. No second combobox or conflicting active-descendant owner exists. Open focuses search; selection/Escape restore trigger focus; Tab and outside pointer close without focus theft. Queue button reorder uses polite announcement; sheet supports trap/Escape/close/focus restore.
- At 200% zoom and 320 CSS px: no page-level horizontal overflow or clipped critical state.
- Keyboard/safe-area behavior keeps active editor field, save/error state, and primary action visible.
- Live regions announce phase changes, cancel requested/completed, queue movement, search/save/sync/error/confirmation with required politeness and throttling; never tokens or Drive IDs.
- Light, Dark, and System remain available. Semantic tokens pass contrast in both resolved themes.
- Reduced motion removes spatial/nonessential animation while preserving immediate state.
- `VIS-01` covers empty/review/active/failed/Library/editor/sync-attention at desktop/390/320 in Light/Dark. No gradients, glass, glow, neon, parallax, remote fonts, generic AI imagery, or fake waveform data.

### 10.1 Exact visual ownership manifest

`tests/e2e/visual-baselines/ownership-manifest.json` is exactly schema version 1 below. Baseline paths are platform-neutral POSIX basenames relative to `tests/e2e/visual-regression.spec.ts-snapshots/`. Owner is always `phase-6`; scenario metadata is derived from state/theme/viewport. Visual locale is EN only; all accessibility states still run EN and VI.

Every manifest capture uses one exact order: set viewport; navigate to a neutral route; write theme/storage and reload; verify resolved theme; call `prepareVisualState`; wait for the exact named visible state; capture without another reload. No helper may reload after state preparation. This preserves volatile review, active, failed, and sync-attention states.

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

Phase 6 creates the manifest and `VIS-MANIFEST-01` validator tests before generating images. A module-level pre-run validator always validates exact manifest schema, names, owner/scenario metadata, matrix equality, duplicate/case-duplicate rejection, traversal/absolute-path rejection, and extra disk files. In normal runs it also requires exact equality among manifest, matrix, and disk files, so missing and extra baselines fail. Only when Playwright's explicit update-snapshots mode is active may this pre-run disk check tolerate currently missing expected files; it still rejects every extra file and every schema/name/metadata defect. After screenshot generation, a postcondition validator recursively re-enumerates disk and requires exact 42-entry manifest/matrix/file equality. Focused tests cover normal missing/extra failure, update-mode missing allowance, update-mode extra rejection, duplicates, traversal, metadata divergence, and postcondition missing failure. Exact visual staging totals 45 paths: two specs, one manifest, and all 42 named images.

## 11. Commit, staging, and artifact discipline

Implementation phase plans use frequent conventional commits, but only when explicitly asked to execute them.

1. Before each task, record expected modified paths from that task's `Files` block.
2. After tests pass, stage each exact path. Example for the queue reducer task: `git add src/features/workbench/queue-reducer.ts tests/unit/queue-reducer.test.ts`. Never use `git add .`, `git add -A`, or broad directory staging.
3. Inspect `git diff --cached --name-only` and `git diff --cached`; unstage any unrelated path before commit.
4. Use conventional commit subjects from the phase table; body explains why and release invariant when migration/rollback/sync safety changes.
5. Do not push unless requested.
6. Preserve worktree isolation. Never reset, clean, stash, or overwrite another contributor's work.
7. Remove generated `test-results/.last-run.json`, Playwright output, screenshots not designated as committed baselines, build output, caches, temporary traces, and local env files before staging.
8. Do not commit `dist/`, test output, caches, secrets, access tokens, local `.env`, or ad hoc fixtures containing private media/data.
9. Committed WASM artifacts change only after an intentional `audio-processor/` source change and `pnpm build:wasm`; no such change is planned.
10. Phase 6 may create and stage exactly `docs/superpowers/reviews/phase-6-product-defect-<scenario>.md` when that scenario stops on a product-owned failure. This is its sole permitted non-test/config artifact; every other review/doc/capture path is rejected. The record never grants product-edit authority.

## 12. Master execution checklist

### Preparation and Foundation

- [ ] Confirm current directory is `F:\Workspace\whisdom\whisdom-precision-studio`, branch is `feature/precision-studio-redesign`, and approved spec resolves to commit `4098fe355588ae1331a1f574a72a42e022bcfaae`.
- [ ] Confirm no unrelated worktree changes are present; do not discard changes owned by another worker.
- [ ] Execute Phase 1 Foundation tasks from its plan with test-first focused commands.
- [ ] Remove `.first()` at `tests/e2e/whisdom.spec.ts:196` and `:248`; run `pnpm playwright test tests/e2e/whisdom.spec.ts --reporter=list`; expect all nongated scenarios pass with strict unique locators.
- [ ] Run Foundation phase gate: `pnpm typecheck`, `rtk lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; expect exit 0 except documented gated skips.
- [ ] Obtain task-level code-quality review after each Foundation task and phase-level review before 1A.

### Slice 1A independent release

- [ ] Execute Slice 1A compatibility opener, current public `indexed-db.ts` adapter, rollback checker, runbook, and awaiting-deployment evidence tasks only; do not create/upgrade to v2.
- [ ] Run `pnpm vitest run tests/unit/database.test.ts tests/unit/indexed-db-compat.test.ts tests/unit/rollback-floor.test.ts`; prove COMPAT-01 exact schema/key/parser/conversion/failure mapping, fresh creates v1, existing v1/v2 project exactly, malformed/incomplete v2 closes/refuses all mutation, unsupported v3 closes/localizes, and no Slice 1A source performs a numeric-version-2 open.
- [ ] Run local `MIG-01` through visible `[data-testid="compatibility-product-ready"]` and the public compatibility API for each fresh, v1, v2, and unsupported-v3 fixture. Slice 1A installs this copy-independent marker and final Workbench preserves it; no case asserts legacy heading copy. For fresh/v1/v2, list, open, save, rename, delete, reload/reopen, and confirm surviving projected data through the shipped contract. For v2, confirm a tombstone rather than physical deletion; for v1, physical deletion remains expected. For unsupported v3, every mutation is refused and one localized state appears. Final Library and full-page Transcript routes are Phase 7 rollout-candidate assertions and must not appear in Slice 1A acceptance.
- [ ] Run full phase gate and `pnpm lint`; expect zero errors/warnings.
- [ ] Obtain explicit human release approval, record the approver's exact GitHub login and approval UTC in `awaiting-deployment`, and add manual release-review attestation that the named login belongs to the approving human and approval occurred outside automation. Checker validation cannot prove humanity. Land only Foundation+Slice 1A on `master`; no Slice 1B file is allowed.
- [ ] Push that commit to `master`; observe existing `.github/workflows/ci.yml` push-triggered Pages deployment. Do not deploy via `workflow_dispatch` and do not add a competing workflow.
- [ ] Repeat the complete Slice 1A legacy-product/public-API list/open/save/rename/delete/reopen sequence on the deployed URL against fresh, v1, v2, and unsupported-v3 browser fixtures; record actual UTC evidence. Do not assert Phase 1B/4 Library or full-page Transcript UI. Current transcription remains usable and no `VersionError` occurs.
- [ ] Change evidence to `deployed` in a later evidence-only descendant commit. Set `$floorSha` from `lowerCommitSha`, run `pnpm release:check-rollback-floor -- $floorSha`, and run descendant/pre-floor/divergent test cases; expect 0 only for equal/descendant, 1 fail-closed otherwise, and 2 for usage.
- [ ] Obtain release review confirming no v2 exposure occurred before deployed-floor evidence.

### Slice 1B and Phases 2–5

- [ ] Execute Slice 1B only after deployed evidence exists on `master`; set `$slice1BSha = (git rev-parse HEAD).Trim()` and require `pnpm release:check-rollback-floor -- $slice1BSha` to exit 0.
- [ ] Run `MIG-02`/`MIG-03` exact migration/quarantine/abort fixtures and NAV-01/PERF-01 shell checks; expect canonical or recoverable disposition for every v1 record and separate lazy chunks.
- [ ] Run `tests/unit/settings-validation.test.ts`, Phase 1 Settings component assertions in `tests/components/navigation.test.tsx`, and browser `SETTINGS-01`; require final Settings behavior, worker-first model-cache cleanup, and no invalid persistence before Phase 2.
- [ ] Run full phase gate and review. After this point, rollback only to 1A-compatible or newer builds.
- [ ] Execute Phase 2; run REC-01..06 and WB-01..02 focused commands, then phase gate and reviews.
- [ ] Verify `src/features/workbench/types.ts` owns the sole `MeasuredProgress` declaration and run the named ready-only queue tests; no runtime file may redeclare it.
- [ ] Execute Phase 3; run RUN-01..04, QUEUE-01, and ERR-01 focused commands, then worker-specific check if contracts changed, phase gate, and reviews.
- [ ] Execute Phase 4; run EDIT-01..04, SAVE-01..03, LIB-01, NAV-01 dirty cases, and PERF-02/03 feature cases, then phase gate and reviews.
- [ ] Execute Phase 5 Checkpoint A; review identity/token/scope/CSP/transport evidence before B.
- [ ] Verify Phase 5 preserves Phase 1B `src/features/storage/sync-types.ts` as sole durable publication/candidate/sync owner and modifies `src/features/google-drive/types.ts` only for additive Drive contracts; reject any storage-to-Drive import, duplicate declaration, or incompatible field change.
- [ ] Execute Phase 5 Checkpoint B; review atomic binding, same-ID retry, exact-body verification, all-runtime local-save-first evidence before C.
- [ ] Execute Phase 5 Checkpoint C; review non-snapshot stabilization, parser, resolver permutations, dirty-editor/account-switch protection, and cleanup evidence.
- [ ] Do not ship Phase 5 until A, B, and C all pass GIS-01..05, DRV-01..06, PRIV-01, cross-cutting gates, full phase gate, and phase-level review.

### Integrated hardening, cleanup, and rollout drill

- [ ] Execute Phase 6 against integrated Phases 1–5; do not deploy it as a standalone feature.
- [ ] Treat Phase 6 as tests-only by default. If a focused red exposes a product defect, stop that task and create only `docs/superpowers/reviews/phase-6-product-defect-<scenario>.md` with exact file/function/command/assertion/failure evidence. It is the sole permitted non-test/config manifest entry. Obtain a reviewed plan amendment before editing product code; no executor-invented “modify on red” branch exists.
- [ ] Run FIXTURE-01 through exact Section 5.9 exports; no phase plan may rename helpers or create fallback fixture systems.
- [ ] Run all `A11Y-AUTO-*`, manual keyboard/focus/reflow/contrast/live/screen-reader checklists, `VIS-01`, and PERF-01..03 in required locales/viewports/themes.
- [ ] Obtain review that fixes did not create new feature contracts or weaken assertions.
- [ ] Execute Phase 7 legacy removal only after integrated tests prove replacement flows.
- [ ] Apply the same stop-and-amend gate to Phase 7 ownership uncertainty or any product defect outside its exact file map; zero imports and a focused red never authorize conditional edits or deletion.
- [ ] Search for old product components, duplicate copy tables, English-string runtime matching, result modal, obsolete `.first()` workarounds, stale route state, and dead imports; expect none.
- [ ] Run focused named families REC/WB/RUN/QUEUE/ERR/EDIT/SAVE/MIG/LIB/GIS/DRV/PRIV/NAV/I18N/PERF; expect all pass.
- [ ] Run `pnpm typecheck`, `rtk lint`, `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`; expect exit 0, lint zero warnings, only documented gated skips.
- [ ] Run applicable worker typecheck and gated real-ASR/WebGPU smoke commands; record actual pass/skip evidence without claiming unrun environments.
- [ ] Remove generated artifacts and inspect exact staged files.
- [ ] Stage exactly modified `src/app/AppShell.tsx`, deleted `src/app/LegacyProduct.tsx`, deleted `src/features/google-drive/drive.ts`, `tests/unit/legacy-removal.test.ts`, `tests/e2e/fixtures/rollout.ts`, and `tests/e2e/rollout.spec.ts`; verify `src/App.tsx` remains the Slice 1B thin adapter unchanged; inspect name-status/content; commit `chore: prepare precision studio rollout candidate`. No broad staging.
- [ ] Require `git status --porcelain` empty after that commit. Only then set `$candidateSha = (git rev-parse HEAD).Trim()`, require full lowercase 40-character SHA, and run `pnpm release:check-rollback-floor -- $candidateSha`. An uncommitted candidate drill is prohibited. Do not amend after artifact creation and do not push unless asked.
- [ ] Drill rollback from the final release candidate to the recorded Slice 1A floor against a v2 database; expect app opens without downgrade request. Verify an older pre-1A target is rejected by tooling.
- [ ] Run ROLLBACK-01 with separate absolute `candidateDist`/`floorDist`, corresponding preview roots/cwds, `--strictPort`, absolute `--outDir` values, one `4187` origin, one persistent profile, readiness polling, process-tree kill, and `finally` cleanup; never run `--outDir dist`.
- [ ] Drill forward redeploy from rollback floor to final candidate; expect v2 data, drafts, tombstones, pending operations, and conflict candidates remain intact.
- [ ] Obtain final code, privacy, migration, accessibility, and release review. Push/deploy only when requested.

## 13. Phase-plan authoring and review rules

Each of the seven phase plans must:

- Start with the required writing-plans header and checkbox syntax.
- Repeat its exact entry conditions and the subset of contracts it implements; reference this master for unchanged shared declarations.
- Import and use the exact public names in Section 5. Do not introduce local aliases, duplicate declarations, flat publication records, independent Synced writes, or a second draft-to-canonical gate. Correct any existing phase-plan snippet before executing it.
- List exact create/modify/test paths and line ranges when modifying existing files.
- Break work into 2–5 minute test-first actions: failing test, observed failure, minimum implementation with complete code, passing focused test, adjacent suite, exact staging, optional commit.
- Define every created or modified public/test-fixture export with its exact owning file, creation phase, complete TypeScript signature, discriminated result/error type, and observable semantics before an implementation step consumes it. “Implement parser/adapter/helper,” an omitted return/error shape, and prose-only public behavior are not actionable.
- Include actual code for every implementation step; no stub prose, undefined helper, unresolved ownership, or conditional naming instruction.
- Use the exact compatibility exports in Section 5.3A, the Phase 5 parser result/error contract below, and the fixture exports in Section 5.9. Remove “if absent,” “if the name differs,” “if placed elsewhere,” “use actual export,” and equivalent fallback language. If an earlier owner failed to create an export, stop and correct that owning phase plan; do not improvise in a consumer phase.
- Use exact named scenario IDs and expected command output.
- Include EN/VI, 320/390, keyboard, axe, request/chunk, and profiler checks for changed flows rather than deferring all quality to Phase 6.
- End with phase-specific verification and review; never offer a plan execution choice inside the file.

Phase 1B creates storage-neutral `src/features/storage/remote-types.ts` for remote-quarantine records and storage-neutral `src/features/storage/sync-types.ts` for durable publication/candidate/sync records. `src/features/google-drive/types.ts` consumes those contracts and owns Drive-domain observation, resolver, service, identity, transport, parser, and verifier types; storage imports no Drive feature module. Phase 5 adds shared parser error/result/dependency/raw declarations to Drive types and replaces matching MIME/private-property/schema-version literal references with representation-preserving imports from `constants.ts`. `src/features/google-drive/parser.ts` is the sole owner of the `readRemoteBody`, `parseRemoteCandidate`, and `parseLegacyDriveDocument` implementations. No function declaration with no body belongs in Drive types, and no transport, migration, publication, or reconcile caller may invent another result type or parser signature.

```ts
export type RemoteCandidateParseErrorCode =
  | "remote.invalid-utf8"
  | "remote.invalid-json"
  | "remote.invalid-envelope"
  | "remote.remote-key-mismatch"
  | "remote.candidate-hash-mismatch"
  | "remote.filename-mismatch"
  | "remote.mime-mismatch"
  | "remote.properties-mismatch"

export interface RemoteCandidateParseError {
  code: RemoteCandidateParseErrorCode
  quarantine: RemoteQuarantineMetadata
}

export type RemoteCandidateParseResult =
  | { ok: true; value: ObservedRemoteCandidate }
  | { ok: false; error: RemoteCandidateParseError }

export interface RemoteBodyLimits {
  maxBytes: number
  overflowSentinel: number
}

export interface RemoteBodySource {
  response: Response
  fileId: string
  privateProperties: unknown
  receivedAt: number
  fileName?: string
  mimeType?: string
}

export type RemoteBodyFailureCode =
  | "remote.body-too-large"
  | "remote.body-read-failed"
  | "remote.invalid-utf8"

export type RawRemoteBodyResult =
  | {
      boundedBytes: Uint8Array
      byteHash: string
      contentType: string
      fileId: string
      privateProperties: unknown
      receivedAt: number
      fileName: string | null
      mimeType: string | null
      bodyText: string
      failureCode: null
    }
  | {
      boundedBytes: Uint8Array
      byteHash: string
      contentType: string
      fileId: string
      privateProperties: unknown
      receivedAt: number
      fileName: string | null
      mimeType: string | null
      bodyText: null
      failureCode: "remote.body-too-large" | "remote.invalid-utf8"
    }
  | {
      boundedBytes: Uint8Array
      byteHash: null
      contentType: string
      fileId: string
      privateProperties: unknown
      receivedAt: number
      fileName: string | null
      mimeType: string | null
      bodyText: null
      failureCode: "remote.body-read-failed"
    }

export type RawRemoteBody = Exclude<RawRemoteBodyResult, { failureCode: RemoteBodyFailureCode }>

export interface PureParserDependencies {
  parseTranscriptEnvelope: (value: unknown) => TranscriptEnvelope
  serializeTranscriptEnvelope: (envelope: TranscriptEnvelope) => string
  remoteKey: (transcriptId: string) => Promise<string>
  candidateHash: (envelope: TranscriptEnvelope) => Promise<string>
  acceptedPayloadHash: (envelope: TranscriptEnvelope) => Promise<string>
}

export interface LegacyDriveDocument {
  transcriptId: string
  title: string
  sourceName: string
  language: string
  modelId: string
  mode: ProcessingMode
  createdAt: number
  updatedAt: number
  text: string
  segments: ReadonlyArray<{ id: string; startMs: number; endMs: number; text: string }>
}

export interface LegacyParserDependencies {
  parseJson: (text: string) => unknown
  convertSecondsToMilliseconds: (value: unknown) => number
}

export type LegacyDriveDocumentParseResult =
  | { ok: true; value: LegacyDriveDocument }
  | { ok: false; error: RemoteCandidateParseError }

export interface DriveFileMetadata {
  id: string
  name: string
  mimeType: string
  privateProperties: Readonly<DriveAppProperties>
  receivedAt: number
}

export type PublishedCandidateReadback = {
  metadata: DriveFileMetadata
  bodyResponse: Response
}

export interface SameIdReadbackExpectation {
  generatedFileId: string
  attemptedFileName: string
  attemptedMimeType: string
  attemptedPrivateProperties: Readonly<DriveAppProperties>
  attemptedCandidateHash: string
  attemptedEnvelopeJson: string
  expectedAcceptedPayloadHash: string
}

export interface ReadbackVerifierDependencies {
  readRemoteBody: (source: RemoteBodySource, limits: RemoteBodyLimits) => Promise<RawRemoteBodyResult>
  parseTranscriptEnvelope: (value: unknown) => TranscriptEnvelope
  candidateHash: (envelope: TranscriptEnvelope) => Promise<string>
  acceptedPayloadHash: (envelope: TranscriptEnvelope) => Promise<string>
  now: () => number
}

export type ReadbackVerificationFailureCode =
  | "remote.payload-hash-mismatch"
  | "remote.body-mismatch"
  | "remote.filename-mismatch"
  | "remote.mime-mismatch"
  | "remote.properties-mismatch"
  | "remote.id-mismatch"
  | "remote.candidate-hash-mismatch"

export type ReadbackVerificationResult =
  | { ok: true; value: { candidate: RemoteCandidate; receipt: VerifiedPublicationReceipt } }
  | { ok: false; error: { code: ReadbackVerificationFailureCode; detail: string } }
```

`src/features/google-drive/types.ts` contains only the Drive verifier input, dependency, failure-code, and result interfaces/unions above while importing `RemoteCandidate` and `VerifiedPublicationReceipt` from storage-neutral `src/features/storage/sync-types.ts`. It contains no second receipt declaration, `verifyPublishedCandidate` function declaration, overload, ambient signature, or implementation.

`src/features/google-drive/parser.ts` implements these exact signatures:

```ts
export function readRemoteBody(
  source: RemoteBodySource,
  limits: RemoteBodyLimits,
): Promise<RawRemoteBodyResult>
export function parseRemoteCandidate(
  raw: RawRemoteBody,
  dependencies: PureParserDependencies,
): Promise<RemoteCandidateParseResult>
export function parseLegacyDriveDocument(
  raw: RawRemoteBody,
  dependencies: LegacyParserDependencies,
): Promise<LegacyDriveDocumentParseResult>
```

`receivedAt` is the bounded local observation timestamp supplied by transport/reconciliation in `RemoteBodySource`; parser dependencies expose no clock. `readRemoteBody` copies it into every `RawRemoteBodyResult`, and `parseRemoteCandidate` sets `candidate.receivedAt` exactly from `raw.receivedAt`. Tests use distinct observation timestamps and reject substitution with envelope time, Drive metadata time, or parser execution time. `readRemoteBody` incrementally reads but does not invent incremental Web Crypto hashing: it accumulates at most `REMOTE_BODY_CAP` bytes, detects one overflow byte, cancels, then calls transcription-owned `rawBodyByteHash(Uint8Array)` exactly once over the complete retained body or exact 25 MiB prefix. That helper performs one one-shot `crypto.subtle.digest("SHA-256", bytes)`. Overflow and invalid UTF-8 results expose no body bytes; overflow retains the prefix hash, invalid UTF-8 retains the full hash, and reader/allocation/digest failures return no hash.

`src/features/google-drive/publication.ts` alone exports and implements the verifier. Its complete declaration and body are:

```ts
import {
  REMOTE_BODY_CAP,
  REMOTE_BODY_OVERFLOW_SENTINEL,
} from "@/features/google-drive/constants"

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function samePrivateProperties(left: Readonly<DriveAppProperties>, right: Readonly<DriveAppProperties>): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && left[key as keyof DriveAppProperties] === right[key as keyof DriveAppProperties])
}

function readbackFailure(code: ReadbackVerificationFailureCode): ReadbackVerificationResult {
  return { ok: false, error: { code, detail: code } }
}

export async function verifyPublishedCandidate(
  readback: PublishedCandidateReadback,
  expected: SameIdReadbackExpectation,
  dependencies: ReadbackVerifierDependencies,
): Promise<ReadbackVerificationResult> {
  const { metadata } = readback
  if (metadata.id !== expected.generatedFileId) return readbackFailure("remote.id-mismatch")
  if (metadata.name !== expected.attemptedFileName) return readbackFailure("remote.filename-mismatch")
  if (metadata.mimeType !== expected.attemptedMimeType) return readbackFailure("remote.mime-mismatch")
  if (!samePrivateProperties(metadata.privateProperties, expected.attemptedPrivateProperties)) {
    return readbackFailure("remote.properties-mismatch")
  }

  let body: Uint8Array
  let exactBodyHash: string
  try {
    const bounded = await dependencies.readRemoteBody({
      response: readback.bodyResponse,
      fileId: metadata.id,
      privateProperties: metadata.privateProperties,
      receivedAt: metadata.receivedAt,
      fileName: metadata.name,
      mimeType: metadata.mimeType,
    }, { maxBytes: REMOTE_BODY_CAP, overflowSentinel: REMOTE_BODY_OVERFLOW_SENTINEL })
    if (bounded.failureCode !== null) return readbackFailure("remote.body-mismatch")
    body = new TextEncoder().encode(bounded.bodyText)
    exactBodyHash = bounded.byteHash
  } catch {
    return readbackFailure("remote.body-mismatch")
  }
  const attemptedBody = new TextEncoder().encode(expected.attemptedEnvelopeJson)
  if (!sameBytes(body, attemptedBody)) return readbackFailure("remote.body-mismatch")

  let envelope: TranscriptEnvelope
  try {
    envelope = dependencies.parseTranscriptEnvelope(JSON.parse(expected.attemptedEnvelopeJson))
  } catch {
    return readbackFailure("remote.body-mismatch")
  }

  let candidateHash: string
  try {
    candidateHash = await dependencies.candidateHash(envelope)
  } catch {
    return readbackFailure("remote.candidate-hash-mismatch")
  }
  if (candidateHash !== expected.attemptedCandidateHash) {
    return readbackFailure("remote.candidate-hash-mismatch")
  }

  let acceptedPayloadHash: string
  try {
    acceptedPayloadHash = await dependencies.acceptedPayloadHash(envelope)
  } catch {
    return readbackFailure("remote.payload-hash-mismatch")
  }
  if (acceptedPayloadHash !== expected.expectedAcceptedPayloadHash) {
    return readbackFailure("remote.payload-hash-mismatch")
  }

  const candidate: RemoteCandidate = {
    candidateId: `${envelope.transcriptId}:${candidateHash}`,
    transcriptId: envelope.transcriptId,
    candidateHash,
    acceptedPayloadHash,
    revision: envelope.revision,
    updatedAt: envelope.updatedAt,
    deviceId: envelope.deviceId,
    deletedAt: envelope.deletedAt,
    deletionId: envelope.deletionId,
    restoredFromDeletionId: envelope.restoredFromDeletionId,
    transcript: envelope.transcript,
    receivedAt: metadata.receivedAt,
  }
  return {
    ok: true,
    value: {
      candidate,
      receipt: {
        kind: "verified-publication",
        generatedFileId: expected.generatedFileId,
        candidateHash,
        acceptedPayloadHash,
        exactBodyHash,
        verifiedAt: dependencies.now(),
      },
    },
  }
}
```

`readRemoteBody` owns response metadata extraction, bounded chunk accumulation, one-shot raw-byte hashing, and fatal UTF-8 decoding. It never depends on a nonexistent Web Crypto streaming hash. Parser tests spy on one exact digest call for complete and overflow bodies and reject any `update`/`final` hash-state API. `parseRemoteCandidate` accepts only schema-2 generated candidates, parses JSON once, validates the exact envelope, recomputes remote key and candidate hash, computes `acceptedPayloadHash`, and returns it in the observed candidate. It never compares accepted-payload hash and never emits `remote.payload-hash-mismatch`. `parseLegacyDriveDocument(raw, dependencies)` validates the exact legacy fields `{id,title,sourceName,language,modelId,mode,createdAt,updatedAt,text,segments}` and returns a bounded `LegacyDriveDocument` intermediate containing the converted `transcriptId`, `createdAt`, `updatedAt`, canonical `text`, and canonical millisecond segments needed to build the complete schema-2 envelope. Both timestamps require exact bounded ISO input before conversion. Legacy migration maps `updatedAt` to envelope `updatedAt`, maps the other payload fields including `text`, sets revision `0` and null deletion lineage, and never substitutes `createdAt` or current time for the validated legacy update time. Parser and migration tests cover valid distinct created/update timestamps plus missing, wrong-type, malformed, and out-of-range `updatedAt`, text/segment disagreement, and exact resulting envelope conversion.

`verifyPublishedCandidate(readback, expected, dependencies)` is the only same-ID verifier. The caller first performs the exact metadata GET, then the `alt=media` GET, and supplies both as one `PublishedCandidateReadback`. Verification order and codes are executable: compare metadata `id`, `name`, `mimeType`, and exact private-property own keys/values; bounded-read and hash `bodyResponse`; require body bytes to equal UTF-8 `attemptedEnvelopeJson`; parse that exact JSON as a schema-2 envelope; recompute and compare `candidateHash`; then recompute and compare `acceptedPayloadHash`. Failures return respectively `remote.id-mismatch`, `remote.filename-mismatch`, `remote.mime-mismatch`, `remote.properties-mismatch`, `remote.body-mismatch`, `remote.candidate-hash-mismatch`, or `remote.payload-hash-mismatch`, with no receipt. Success returns exactly `{ candidate, receipt }`. The validated candidate's account-neutral `candidateId` is the exact colon-joined transcript ID and candidate hash, never a Drive file ID, and its `receivedAt` is `readback.metadata.receivedAt`. Only this successful branch constructs `VerifiedPublicationReceipt` with `kind: "verified-publication"`, generated file ID, candidate hash, accepted-payload hash, exact raw-body hash, and bounded injected `verifiedAt`; no parallel hash/body/envelope strings are returned. Dependencies contain only the bounded body reader, exact schema parser, candidate/accepted hash helpers, and injected `now`; they contain no repository, account store, transport mutation, or persistence callback. Publication and reconcile may mark synced or remove pending only by passing this receipt and its stabilized candidate to `finalizeStabilizedWinner`; callers supply no duplicate identity strings. `RemoteQuarantineMetadata` never carries response body, token, authorization header, source media, settings, or user-facing provider text. Reconcile alone persists a valid candidate or quarantine result.

## 14. Research decisions and official basis

1. **No Drive v3 ETag compare-and-swap.** The [Drive v2-to-v3 reference](https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference) does not preserve the old ETag/version write-precondition model as a causal CAS contract. Therefore `modifiedTime` and `version` remain informational; immutable candidates plus pure set resolution provide convergence (`ref:dual-black-bee`).
2. **Pre-generated ID and same-ID retry.** [`files.generateIds`](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds) supplies an appDataFolder-compatible ID before [`files.create`](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/create). Persist ID and exact multipart body first, include metadata `id`, and retry/verify that same identity after ambiguous outcomes; never create a duplicate with a second ID.
3. **Listing is not a snapshot.** [`files.list`](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list) paginates and can report `incompleteSearch`; page tokens can fail while concurrent changes occur. Complete passes are observations, not proof of absence. Union observations and require two identical complete `(fileId,candidateHash)` sets within four post-create passes; unstable state remains pending with zero cleanup (`ref:fantastic-gold-macaw`).
4. **App-private storage and permanent delete.** [`appDataFolder`](https://developers.google.com/workspace/drive/api/guides/appdata) constrains files to app data; [`files.delete`](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/delete) is permanent. Cleanup therefore targets only known, downloaded, validated IDs under retention rules; list absence never authorizes deletion.
5. **Private property bounds and fixed metadata.** [Drive custom properties](https://developers.google.com/workspace/drive/api/guides/properties) support the three pinned private properties. Fixed 43-character `remoteKey`/`candidateHash` values keep key-plus-value sizes within documented limits and prevent raw transcript IDs leaking into names/properties.
6. **GIS gesture-only reacquisition.** The [GIS token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model) provides short-lived access tokens, not refresh tokens; the [GIS JavaScript reference](https://developers.google.com/identity/oauth2/web/reference/js-reference) supplies callback/error/revoke APIs. Keep token/expiry memory-only, pause inside the 60-second margin, and call `requestAccessToken` only from explicit Connect, Reconnect, or Sync now gestures.
7. **RFC 8785 wrapper, not blind package trust.** [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) defines deterministic JSON canonicalization. `canonicalize` implements serialization, but Whisdom's wrapper first enforces valid Unicode scalar sequences and exact schema/value bounds because malformed UTF-16 must never be repaired or passed to the canonicalizer.
8. **Versionless IndexedDB rollback floor.** With `idb@8`, Slice 1A uses the exact versionless callback form `openDB(WHISDOM_DB_NAME, undefined, callbacks)`, inspects `db.version`, and closes unsupported versions. The explicit `undefined` reaches native IndexedDB's versionless open behavior while retaining fresh-database upgrade callbacks; explicitly opening version 1 after a v2 deployment would request a downgrade and fail with `VersionError` (`ref:required-aquamarine-wildcat`).
9. **One deployment authority and ancestry floor.** Existing `.github/workflows/ci.yml` push-to-`master` remains the only Pages publisher. The committed evidence file binds a human-approved full lower SHA to production smoke, while `git merge-base --is-ancestor` semantics allow only equal/descendant rollback targets. Reverts create safe descendants; reset/force-push does not establish a deployable rollback lineage.
10. **Draft is not canonical storage.** Timeline input can be scalar-safe and bounded yet violate canonical timing. A separate exact draft payload preserves correction work without manufacturing schema-2/hash/sync state; one explicit commit gate and draft-only transaction make canonical success the sole transcript/enqueue authority.

## Appendix A. Specification sections 1–27 coverage

| Spec section | Owning phase(s) | Concrete coverage |
| --- | --- | --- |
| 1 Status/decisions | Master, all | Approved scope, product-slice/release order, local default, sequential batch, canonical segments, transcript-only Drive |
| 2 Goals/non-goals | All; verified 7 | Local-first workflows, migration, EN/VI, WCAG, lazy assets; no backend/media/settings sync/PWA/fake analytics |
| 3 Users/jobs/trust | 2–5 | Source privacy, queue/progress/recovery, editor/Library, verified sync language |
| 4 Current problems | 1–5; cleanup 7 | App split, URL reachability, cancellation/SSE, singular errors, identity/sync, controls, editor/Library, storage/test gaps |
| 5 Principles | 1–7 | Local trust, task-first guidance, honest state, canonical product, contextual recovery, responsive parity, deterministic reducers |
| 6 Visual system | 1B, 6 | semantic Light/Dark tokens, Geist/mono, calm rules, reduced motion, prohibited aesthetics |
| 7 IA/navigation | 1B, 2, 4 | shell/query routes/focus, Workbench, Library, transcript page, Settings, mobile bottom nav |
| 8 Responsive | Every UI phase, 6 | 320/390/768/1024 composition, queue sheet, touch/reflow/keyboard/safe area |
| 9 Workbench | 2; runtime completion 3 | first run, File/Link drafts, review issues, captured start behavior, no eager assets |
| 10 Recommendation | 2 | exact precedence, beginner-safe definition, separate server policy, structured output tests |
| 11 Queue | 2–3 | exact statuses/transitions, sequential cancel choices, reorder alternatives, completed removal semantics |
| 12 Runtime/progress/cancel | 3 | adapter/typed event contracts, measured phases/ETA, bounded logs, provider-specific terminal cancellation |
| 13 Canonical/editor | 1B schema; 3 adapters; 4 editor | scalar/pinned whitespace/timing, legacy conversion, reducer edits, search/undo/export, serialized autosave/navigation guard |
| 14 Library | 4 | deterministic list/search/filter, quarantine recovery, visible actions, tombstone/observed Undo, sync summary slots |
| 15.1 Scope/privacy | 5A; regression 7 | `drive.file`/`drive.appdata`, transcript-only requests, no media/settings/tokens/raw IDs, narrow CSP |
| 15.2 Authentication | 5A | gesture-only GIS attempt/watchdog, exact scopes, memory token/expiry margin, reconnect/revoke/account switch |
| 15.3 Identity presentation | 5A | bounded UserInfo, issuer+sub account key, verified-email display only, exact-host bounded Blob avatar fallback |
| 15.4 Remote record/protocol | 1B schema/hash; 5B/C | exact envelope/payload/scalar/whitespace/hash/name/properties, immutable generated-ID attempt union, same-ID verify, candidate union/stabilization/cleanup |
| 15.5 Local-first mutation | 1B repositories; 3–5 consume | canonical save plus coalesced pending in one guarded transaction; local completion independent of Drive failure |
| 15.6 Reconcile triggers | 5C | sign-in, local mutation, online, stale focus, foreground interval, explicit gesture sync; auth pause rules |
| 15.7 Reconcile sequence | 5C | candidate-first durability, non-snapshot pagination union, pure resolve, bounded create/readback passes, stabilized-winner finalization |
| 15.8 Conflict order | 1B hashes; 5C | accepted-payload ordering, dominant tombstone/restore lineage, durable every distinct loser, account-neutral candidate identity |
| 15.9 Retry/failure | 5B/C | exact frozen attempt, bounded backoff, ambiguous create recovery, typed Needs attention, stale-state rejection |
| 15.10 Tombstone retention | 4 delete/Undo; 5C cleanup | fresh deletion identity, exact restore lineage, no tombstone cleanup/absence inference, bounded positive-ID cleanup only |
| 16.1 Source of truth | 1B–5 | IndexedDB durable authority, React edit cache, Drive optional replica |
| 16.2 Stores | 1B | exact nine v2 stores, keys/indexes, account-neutral draft/candidate split, exact quarantine value |
| 16.3 Transactions | 1B repositories; 4–5 consume | guarded transcript+pending, draft-only invalid persistence, freeze/state transitions, candidate-first merge, stabilized success+replacement, copy-before-delete |
| 16.4 Migration | 1A/1B | versionless v1/v2 bridge and deployed floor first; complete transactional v1→v2 exact repair/quarantine/abort second |
| 16.5 Clear data | 1A adapter; 1B/4/5 final | v2 transcript bulk tombstones, separate quarantine clear, worker-state-first model clear, separate local/Drive consequences |
| 17 Architecture | 1B–5 | focused target tree, reducers/repositories/external service/runtime coordinator, typed feature copy |
| 18 Errors/toasts | baseline 1; complete 3 | typed singular contextual errors, FIFO confirmation toasts, recovery map |
| 19 I18N | Every phase, 6–7 | compile-time EN/VI parity, locale formatting, stable code mapping, state-preserving language switch |
| 20 Accessibility | Every UI phase, 6 | structure/focus/controls/live state/editor keyboard and reduced motion |
| 21 Performance | 1B, 3–4, 6 | lazy chunks, deferred assets, worker reuse, profiler isolation, thresholds/yielding, Drive concurrency |
| 22 Delivery slices | Master and Phases 1–7 | exact release topology, phase exits, integrated 6/7 rule |
| 23 Test strategy | Every phase; consolidated 6–7 | unit/component/E2E families, a11y/manual/visual matrix, real-ASR preservation |
| 24 Acceptance | Phase exits and final 7 | named scenario, integrity, Drive, responsive/a11y, performance/localization, repository gates |
| 25 Risks | All; rollout drill 7 | cancellation fallback, migration abort, immutable publication, non-snapshot stabilization, privacy, rollback floor |
| 26 Resolved decisions | Master contracts and Phases 1–7 | all 43 decisions pinned in types, ownership, phase gates, release order, and exclusions |
| 27 References | Master research; Phase 5 | official Drive/GIS/RFC decisions and request-level tests |

No specification section is deferred outside these seven phase plans.

## Appendix B. Rollback preview command contract

Phase 7 first commits and verifies its exact six-path candidate manifest, requires empty `git status --porcelain`, then captures the full `candidateSha`. Only after that checkpoint may it write two different existing absolute artifact directories to test-owned `.rollout-phase-7/artifacts.json` as exact keys `candidateDist` and `floorDist`; each contains `index.html`. `tests/e2e/rollout.spec.ts` resolves both, derives separate absolute `candidateRoot`/`floorRoot` and corresponding `cwd` values, and runs:

```ts
function startPreview(artifact: { dist: string; cwd: string }) {
  return spawn(
    "pnpm",
    ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", "4187", "--strictPort", "--outDir", artifact.dist],
    { cwd: artifact.cwd, stdio: "pipe", shell: process.platform === "win32" },
  )
}
```

All three runs use only `http://127.0.0.1:4187`. Candidate starts first. Readiness polls only `/index.html` every 100 ms for at most ten seconds and succeeds only on HTTP 200 while the child remains alive. Before floor starts, candidate receives process-tree termination, must exit within five seconds, and `/index.html` must produce network failure for up to five seconds; any HTTP response means stale reachability and fails. The same stop/unreachable proof occurs before forward candidate starts and after it finishes. No previews overlap.

One `mkdtemp(path.join(tmpdir(), "whisdom-rollout-"))` profile is passed once to `chromium.launchPersistentContext`; one page, origin, IndexedDB database, and context survive candidate → floor → candidate. Node-side `tests/e2e/fixtures/rollout.ts` imports source canonical/schema/hash functions, builds protocol-valid fixtures, and seeds them through page IndexedDB helpers before candidate stops. Floor uses the exact deployed Slice 1A compatibility boundary; candidate uses final Workbench, Library, and full-page Transcript routes plus rename/save/delete assertions. No rollout-specific browser global, client environment bridge, conditional fixture installation, or copied constructor exists.

Snapshot order is mandatory: take `initialCandidateSnapshot` immediately after seed; perform candidate rename and delete; then take `expectedBeforeFloorSnapshot`. Floor comparison uses that post-candidate snapshot, excluding only exact returned floor save/tombstone IDs and separately checking their full records. Derive `expectedAfterFloorSnapshot` from `expectedBeforeFloorSnapshot` plus only those two mutations. On forward candidate startup, compare a fresh snapshot to `expectedAfterFloorSnapshot` before any forward mutation; never compare floor or forward state to the stale initial snapshot. Final expectation applies only observed forward rename/delete. Protected drafts, conflicts, sync metadata, unbound/verifying pending variants, tombstones, remote/candidate/accepted/body hashes, and frozen attempted identity remain byte-equivalent.

Cleanup is fail-closed. `finally` accumulates the primary failure plus preview-stop/unreachable, context-close, profile-removal, and residual-profile failures. Readiness timeout, child early exit, strict-port failure, kill failure, stale process/reachability, runtime error, cleanup failure, or remaining profile path fails `ROLLBACK-01`. No invocation uses literal `--outDir dist`, a shared artifact directory, another origin/profile, or parallel preview processes (`ref:required-aquamarine-wildcat`).

## Appendix C. Self-review record

- Placeholder scan passed: no placeholder marker, unresolved helper name, optional ownership, or conditional rename instruction remains in this master. Checkboxes are intentional execution tracking.
- Exact phase filenames checked against the rollout order below.
- Type consistency checked: canonical timing is `startMs`/`endMs`; bounded draft timing remains separate; epoch fields are numeric milliseconds; payload excludes envelope fields; queue/editor reducers receive caller IDs; exact attempted fields freeze after binding; desired fields may coalesce only while unbound and may advance after binding without mutating attempted identity.
- Storage consistency checked: Slice 1A retains exact current public API over v1/v2, `compatibility.ts` owns the minimal parser/schema/projection contract, fresh creates v1, malformed/incomplete v2 refuses mutation, and Slice 1B alone introduces numeric-version-2 upgrade plus canonical repositories.
- Transaction consistency checked: stale expected state rejects; invalid draft persistence touches only `drafts`; candidate persistence precedes merge; only stabilized-winner finalization can remove pending state and write Synced; differing desired content becomes a new unbound operation.
- Release consistency checked: exact artifact/script/runbook/package names, evidence states, full SHA ancestry, existing CI Pages authority, independent Foundation+1A deployment, browser/API smoke, and evidence-only descendant commit all precede Slice 1B.
- Path consistency checked against all eight current plans' `Files` blocks and staging commands: the Section 4 generated ownership ledger includes every created path plus every fixture/test/config/release/runbook/script path. Phase 1 Task 6 declares the exact 11-path aggregate staged across Tasks 4–6, including `tests/unit/indexed-db-compat.test.ts`; Task 14 declares its `tests/e2e/whisdom.spec.ts` edit. Slice 1A Task 6 creates `migration.spec.ts`, Phase 2 Task 3 creates `workbench.test.tsx`, and Phase 3 Tasks 1–2 create `runtime.test.ts` and `runtime-adapters.test.ts`; every later owner action is Modify. Foundation creates `copy-types.ts`; Phase 1 modifies existing `tests/unit/language.test.ts`; Phase 2 modifies existing `transcription/models.ts`; Phases 2/4/5 create feature copy modules and stage `copy.ts` whenever registry composition changes; Phase 1 creates full Settings, `storage/sync-types.ts`, and the Library/Transcript placeholders; Phase 4 replaces those exact placeholders; `vitest.config.ts` is modified by Phase 1 and remains unchanged in Phase 6; `google-drive/types.ts` is created once in 1B for Drive-only contracts and receives Phase 5 declarations; Phase 5 Task 6 creates/stages `google-drive/desired-publication.ts`, modifies/stages both singleton injection owners, and marks every staged existing unit/component/E2E file Modify; Phase 5 creates `drive-identity.test.ts` in Task 1, `drive-identity.test.tsx` in Task 2, `drive-reconcile.test.ts` in Task 4, and `drive-sync.test.tsx` in Task 7, then marks every later edit Modify; Phase 5 creates/stages `google-drive/constants.ts`; Phase 6 fixtures/exact 42-entry manifest and 45-path visual staging are fixed in Sections 5.9/10.1; rollout fixtures are fixed in Section 5.10; rollback uses separate absolute artifacts, one strict port/origin, one persistent profile, and post-candidate floor expectations.
- Workbench accessibility consistency checked: Phase 2 tests and implementation use one trigger-owned combobox (`aria-expanded`/`aria-controls`), one focused popup searchbox (`aria-controls`/open-state `aria-activedescendant`), one listbox, and option roles with no conflicting active-descendant owner. Phase 6 keyboard tests drive and inspect the focused searchbox before Escape restores the trigger. `StageRail.available` uses the exact owned `WorkbenchStage` union.
- Cross-plan correction status: all eight corrected plans use the same Settings, product-error, repository-fixture, runtime-state, Drive-candidate, Drive-fixture, CSP, Phase 6 artifact, and committed-candidate contracts. Phase 6 and Phase 7 use explicit stop-and-amend gates rather than conditional product edits or ownership guesses. Any contradiction found during execution blocks work until its owning plan receives reviewed amendment.
- Candidate consistency checked: Phase 7 completes source/tests, runs full verification, stages only its exact six ownership paths, commits once, requires empty `git status --porcelain`, then and only then captures full `candidateSha`; no rollback artifact may use uncommitted work.
- Plan-review status checked separately from implementation status: untracked plan files awaiting approval are expected and are not a content defect. Commit plans only after approval.

## Phase-plan reading and execution order

1. `docs/superpowers/plans/2026-07-29-ui-redesign-phase-1-foundations-rollback-migration.md`
2. `docs/superpowers/plans/2026-07-29-ui-redesign-phase-2-guided-workbench.md`
3. `docs/superpowers/plans/2026-07-29-ui-redesign-phase-3-runtime-cancellation-queue.md`
4. `docs/superpowers/plans/2026-07-29-ui-redesign-phase-4-editor-library.md`
5. `docs/superpowers/plans/2026-07-29-ui-redesign-phase-5-drive-immutable-sync.md`
6. `docs/superpowers/plans/2026-07-29-ui-redesign-phase-6-cross-feature-hardening.md`
7. `docs/superpowers/plans/2026-07-29-ui-redesign-phase-7-rollout-cleanup.md`

Read this master first, then read and execute each phase plan in that exact order. Stop at every task review, phase gate, Slice 1A deployment marker, and Phase 5 checkpoint; never skip ahead across a failed or unrecorded gate.
