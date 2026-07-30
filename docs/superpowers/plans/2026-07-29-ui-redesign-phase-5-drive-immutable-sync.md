# Precision Studio Phase 5 Drive Immutable Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional, identity-aware, two-way Google Drive transcript sync using immutable, retry-safe candidates without weakening local saves, editor protection, privacy, or deterministic deletion/conflict behavior.

**Architecture:** IndexedDB remains authoritative. A gesture-only GIS identity client owns memory-only credentials; a bounded HTTP transport owns exact Google requests; publication freezes one generated Drive ID and one exact body before create; reconciliation treats paginated listings as non-snapshot observations and resolves validated candidate sets through a pure permutation-invariant function. A coalescing external sync service joins these pieces outside React and exposes narrow snapshots.

**Tech Stack:** React 19, TypeScript 6, IndexedDB/idb 8, Google Identity Services OAuth token model, Google OIDC UserInfo, Drive API v3 `appDataFolder`, Web Crypto SHA-256, RFC 8785 through the existing guarded canonicalization wrapper, Vitest 4, Testing Library, Playwright 1.60, axe-core 4.12.

---

## 1. Authority, entry, and shipment rule

Read before editing:

- `AGENTS.md:1-156`.
- `docs/superpowers/specs/2026-07-29-ui-redesign-design.md:543-562,574-589,591-943,945-1011,1142-1162,1198-1204,1222-1286,1317-1339,1375-1464`.
- `docs/superpowers/plans/2026-07-29-ui-redesign-master-rollout.md:12-25,77-194,336-529,747-895,897-981,994-1020,1022-1070,1087-1163`.
- Phase 4 completion evidence and its staged-path/review record.
- Current `src/features/google-drive/drive.ts:1-102`, `.env.example:1-3`, `index.html:1-18`, `src/App.tsx` Drive imports/state/calls, storage repositories, transcript editor autosave, Library actions, Workbench runtime completion path, and existing unit/component/E2E conventions.

Entry is **Phase 4 complete**: canonical schema/hash wrappers, v2 stores/repositories, atomic transcript mutation APIs, durable drafts/conflict candidates, autosave guard, tombstone/observed Undo, full editor, and Library are green. If any named contract is absent or differs from the master declaration, stop and correct the earlier phase plan or implementation; Phase 5 must not redefine schema 2.

Three checkpoints are mandatory and ordered:

- [ ] **A — identity/transport:** GIS-01..05 identity portions, bounded transport, exact CSP, and privacy request inspection pass. Review and commit A before B.
- [ ] **B — durable outbound:** atomic enqueue/coalescing, generated-ID binding, immutable publication, same-ID ambiguity recovery, all-runtime local-save-first flow, and strict legacy migration pass. Review and commit B before C.
- [ ] **C — inbound:** bounded parser, pure resolver, non-snapshot stabilization, dirty-editor/account-switch protection, retention/cleanup guards, and external service pass.
- [ ] **Shipment gate:** A, B, and C complete together; GIS-01..05, DRV-01..06, PRIV-01, EN/VI, keyboard, 320/390 reflow, axe, full phase gate, privacy review, and phase review pass. No checkpoint-only deployment.

Hard prohibitions: no ETag, `If-Match`, PATCH, silent/background token request, refresh token, persisted access/ID token, direct revocation endpoint, Drive trash assumption, list-absence inference, `modifiedTime`/`version` causality, second ID after ambiguous create, source-media/settings upload, raw transcript ID in Drive metadata, raw Drive ID in UI/log/export/URL, wildcard Google CSP host, or cross-account upload/apply without explicit consent.

## 2. File map locked for this phase

Modify existing Phase 1B Drive owner:

- `src/features/google-drive/types.ts` — consume durable publication/candidate/sync records from `storage/sync-types.ts`, preserve its exact candidate-observation/resolver/snapshot/service contracts, and add only compatible identity, transport, parser, and verifier data declarations. It never declares or implements `verifyPublishedCandidate`.
- `src/features/storage/sync-types.ts` — consume unchanged Phase 1B storage owner of durable pending variants/constructors/guards, candidate records, sync state, and sync metadata. Storage repositories import these contracts directly; this file never imports Drive modules.
- `src/features/storage/remote-types.ts` — consume unchanged storage-neutral owner of `RemoteQuarantineMetadata`, `RemoteQuarantineRecord`, and remote-quarantine write inputs. Drive parser types import from it; storage imports no Drive feature module.

Create:
- `src/features/google-drive/constants.ts` — sole owner of Drive/GIS scopes, issuers, hosts, MIME, private-property names, and all remote caps/limits.
- `src/features/google-drive/copy.ts` — compile-time-parity EN/VI identity/sync/error/aria copy importing helper/types only from `src/app/copy-types.ts`.
- `src/features/google-drive/identity.ts` — attempt ID, watchdog, granted scopes, UserInfo, token margin, revoke, sign-out.
- `src/features/google-drive/avatar.ts` — exact-host HTTPS streamed Blob avatar loader and URL lifecycle.
- `src/features/google-drive/transport.ts` — exact bounded Drive/UserInfo HTTP transport and pagination primitives.
- `src/features/google-drive/parser.ts` — raw streamed fingerprint, strict UTF-8/schema/hash verification, bounded quarantine disposition.
- `src/features/google-drive/resolver.ts` — pure candidate deduplication/order/dominant-tombstone resolution and cleanup predicates.
- `src/features/google-drive/publication.ts` — bound-attempt ID handling, deterministic multipart create, and the repository's sole exported `verifyPublishedCandidate` declaration/body.
- `src/features/google-drive/desired-publication.ts` — sole account-bound factory from a validated canonical envelope to the existing immutable pending-desired representation.
- `src/features/google-drive/legacy-migration.ts` — bounded strict `{id}.json` migration and verified old-file cleanup eligibility.
- `src/features/google-drive/reconcile.ts` — complete-pass observation union, four-pass stabilization, merge, publication, cleanup.
- `src/features/google-drive/sync-service.ts` — coalesced external store, browser triggers, auth/offline/account transitions.
- `build/csp.ts` — pure exact-origin CSP builder used only by Vite configuration.
- `tests/unit/drive-identity.test.ts`, `drive-parser.test.ts`, `drive-resolver.test.ts`, `drive-publication.test.ts`, `drive-reconcile.test.ts`.
- `tests/components/drive-identity.test.tsx`, `drive-sync.test.tsx`.
- `tests/e2e/fixtures/drive.ts`, `drive-identity.spec.ts`, `drive-sync.spec.ts`, `privacy.spec.ts`.

Modify these complete files after Phase 4; whole-file review is required because sync invariants cross every mutation path:

- `src/features/storage/repositories.ts:1-end` — master interfaces only; import durable publication/candidate/sync records only from `storage/sync-types.ts` and quarantine records only from `storage/remote-types.ts`.
- `src/features/storage/sync-repository.ts:1-end` — operation binding/state, candidate association, remote quarantine, merge/success transactions.
- `src/features/storage/transcript-repository.ts:1-end` — account association and pending-operation creation inside every mutation transaction.
- `src/features/transcript-editor/autosave.ts:1-end` — pass eligible envelope into existing atomic save; stage incoming winner behind dirty draft.
- `src/features/transcript-editor/TranscriptPage.tsx:1-end` — sync status/attention/conflict presentation only.
- `src/features/library/actions.ts:1-end` — rename/delete/restore/clear all retain atomic pending operation.
- `src/features/library/LibraryPage.tsx:1-end` — sync summary/filter/account-switch preview UI.
- `src/features/workbench/WorkbenchPage.tsx:1-end` — no Drive call; consume unified repository mutation result.
- `src/components/product/AppHeader.tsx:1-end` — identity/status control and account menu.
- `src/app/copy.ts:1-end` — add stable recovery codes; no Drive prose.
- `src/app/AppShell.tsx:1-end` and `src/main.tsx:1-end` — create/provide/dispose singleton sync service.
- `src/features/google-drive/drive.ts:1-102` — replace blind upload with compatibility exports; Phase 7 deletes facade.
- `index.html:5-12` — exact Google CSP endpoints and GIS script.
- `vite.config.ts:1-end` — `transformIndexHtml` injects the CSP produced from configured optional transcription URLs.
- `.env.example:1-end` — retain `VITE_GOOGLE_CLIENT_ID`, `VITE_CF_WORKER_URL`, and `VITE_SERVER_URL`; document public URL/origin rules and no secret/token variable.
- Existing Phase 4 unit/component/E2E files, complete-file ranges `1-end`, for atomic editor/Library/runtime adjacency assertions.

Never stage a directory or unrelated work. Whole-file ranges are intentional: implementation must inspect every mutation, status, and cleanup branch rather than patch one apparent call site.

## 3. Pinned protocol constants and request shapes

Create `src/features/google-drive/constants.ts` and use these exact exports. This module imports nothing from Drive feature implementations. `types.ts`, `identity.ts`, `avatar.ts`, `transport.ts`, `publication.ts`, `parser.ts`, `legacy-migration.ts`, `reconcile.ts`, `sync-service.ts`, and `src/features/transcription/hashes.ts` import every applicable symbol from this file; none redeclares, aliases, or leaves placement implicit. Tests compare exported values and request bodies:

```ts
export const GOOGLE_ISSUER = "https://accounts.google.com"
export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
export const DRIVE_API_ROOT = "https://www.googleapis.com/drive/v3"
export const DRIVE_UPLOAD_ROOT = "https://www.googleapis.com/upload/drive/v3"
export const GOOGLE_AVATAR_HOST = "lh3.googleusercontent.com"
export const DRIVE_MIME = "application/vnd.whisdom.transcript+json" as const
export const DRIVE_PROPERTY_TRANSCRIPT_KEY = "whisdomTranscriptKey" as const
export const DRIVE_PROPERTY_SCHEMA_VERSION = "whisdomSchemaVersion" as const
export const DRIVE_PROPERTY_CANDIDATE_HASH = "whisdomCandidateHash" as const
export const DRIVE_SCHEMA_VERSION_VALUE = "2" as const
export const DRIVE_APP_DATA_SPACE = "appDataFolder" as const
export const DRIVE_MULTIPART_BOUNDARY = "whisdom_candidate_v2" as const
export const REQUIRED_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.appdata",
] as const
export const TOKEN_FRESHNESS_MARGIN_MS = 60_000
export const AUTH_WATCHDOG_MS = 30_000
export const USERINFO_CAP = 64 * 1024
export const AVATAR_CAP = 1024 * 1024
export const REMOTE_BODY_CAP = 25 * 1024 * 1024
export const REMOTE_BODY_OVERFLOW_SENTINEL = REMOTE_BODY_CAP + 1
export const MAX_DOWNLOADS = 4
export const MAX_STABILIZATION_PASSES = 4
export const MAX_CLEANUP = 20
export const MAX_OPERATION_FAILURES = 7
export const MAX_USERINFO_SUB_SCALARS = 255
export const MAX_USERINFO_NAME_SCALARS = 256
export const MAX_USERINFO_EMAIL_SCALARS = 320
export const MAX_USERINFO_PICTURE_SCALARS = 2_048
export const MAX_REMOTE_FILE_ID_BYTES = 16 * 1024
export const MAX_MIGRATABLE_TRANSCRIPT_ID_BYTES = 512
```

Required import ownership is exact:

| Consumer | Symbols imported from `@/features/google-drive/constants` |
| --- | --- |
| `types.ts` | `REQUIRED_SCOPES`, `GOOGLE_ISSUER`, `DRIVE_MIME` |
| `identity.ts` | `REQUIRED_SCOPES`, `GOOGLE_ISSUER`, `GOOGLE_USERINFO_URL`, `TOKEN_FRESHNESS_MARGIN_MS`, `AUTH_WATCHDOG_MS`, `USERINFO_CAP`, `MAX_USERINFO_SUB_SCALARS`, `MAX_USERINFO_NAME_SCALARS`, `MAX_USERINFO_EMAIL_SCALARS`, `MAX_USERINFO_PICTURE_SCALARS` |
| `avatar.ts` | `GOOGLE_AVATAR_HOST`, `AVATAR_CAP` |
| `transport.ts` | `DRIVE_API_ROOT`, `DRIVE_UPLOAD_ROOT`, `DRIVE_APP_DATA_SPACE`, `DRIVE_PROPERTY_TRANSCRIPT_KEY`, `MAX_DOWNLOADS` |
| `src/features/transcription/hashes.ts` | `DRIVE_MIME`, `DRIVE_PROPERTY_TRANSCRIPT_KEY`, `DRIVE_PROPERTY_SCHEMA_VERSION`, `DRIVE_PROPERTY_CANDIDATE_HASH`, `DRIVE_SCHEMA_VERSION_VALUE` |
| `publication.ts` | `DRIVE_MIME`, `DRIVE_MULTIPART_BOUNDARY`, `REMOTE_BODY_CAP`, `REMOTE_BODY_OVERFLOW_SENTINEL`, `MAX_OPERATION_FAILURES` |
| `parser.ts` | `DRIVE_MIME`, all three `DRIVE_PROPERTY_*` names, `DRIVE_SCHEMA_VERSION_VALUE`, `REMOTE_BODY_CAP`, `REMOTE_BODY_OVERFLOW_SENTINEL` |
| `legacy-migration.ts` | `DRIVE_APP_DATA_SPACE`, `MAX_REMOTE_FILE_ID_BYTES`, `MAX_MIGRATABLE_TRANSCRIPT_ID_BYTES`, `MAX_CLEANUP` |
| `reconcile.ts` | `MAX_DOWNLOADS`, `MAX_STABILIZATION_PASSES`, `MAX_CLEANUP`, `REMOTE_BODY_CAP`, `REMOTE_BODY_OVERFLOW_SENTINEL` |
| `sync-service.ts` | `TOKEN_FRESHNESS_MARGIN_MS` |

Import only symbols each consumer uses, but every listed symbol has this sole declaration. Tests scan for duplicate declarations and raw protocol literals outside `constants.ts` and fixture expectations.

Four digest domains never share input, encoding, storage role, or ordering role:

| Name | Exact input | Encoding | Use |
| --- | --- | --- | --- |
| `remoteKey` | UTF-8 scalar-valid `transcriptId` | 43-char unpadded base64url SHA-256 | query/name/property identity only |
| `candidateHash` | RFC 8785 canonical complete validated envelope | 43-char unpadded base64url SHA-256 | immutable candidate identity |
| `acceptedPayloadHash` | RFC 8785 exact `{deletedAt,deletionId,restoredFromDeletionId,transcript}` | 64-char lowercase hex SHA-256 | final conflict-order tie only |
| `bodyByteHash` | raw response bytes before decode, through full body or first 25 MiB | 64-char lowercase hex SHA-256 | quarantine evidence only |

Exact candidate metadata:

```ts
const appProperties = {
  [DRIVE_PROPERTY_TRANSCRIPT_KEY]: remoteKey,
  [DRIVE_PROPERTY_SCHEMA_VERSION]: DRIVE_SCHEMA_VERSION_VALUE,
  [DRIVE_PROPERTY_CANDIDATE_HASH]: candidateHash,
}
const name = `whisdom-transcript-${remoteKey}-${candidateHash}.json`
const metadata = {
  id: generatedFileId,
  name,
  parents: [DRIVE_APP_DATA_SPACE],
  mimeType: DRIVE_MIME,
  appProperties,
}
```

Exact Drive calls:

```text
GET /drive/v3/files/generateIds?count=1&space=appDataFolder&fields=ids
GET /drive/v3/files?spaces=appDataFolder&q=<encodeURIComponent of `trashed = false and 'appDataFolder' in parents and appProperties has { key = 'whisdomTranscriptKey' and value = '<validated-43-ASCII-remoteKey>' and visibility = 'PRIVATE' }`>&fields=incompleteSearch%2CnextPageToken%2Cfiles(id%2Cname%2CmimeType%2CappProperties%2Csize%2CmodifiedTime%2Cversion)&pageSize=1000
POST /upload/drive/v3/files?uploadType=multipart&fields=id%2Cname%2CmimeType%2CappProperties%2Csize%2Cversion
GET /drive/v3/files/<encoded-id>?fields=id%2Cname%2CmimeType%2CappProperties%2Csize%2Cversion
GET /drive/v3/files/<encoded-id>?alt=media
DELETE /drive/v3/files/<encoded-id>
```

Every protected request sets `Authorization` to ``Bearer ${credential.accessToken}``; tests inspect it but reporters redact it. Candidate list sends no body. Candidate create media part is exactly frozen `attemptedEnvelopeJson`, with no pretty printing or trailing newline. Deterministic multipart bytes use `\r\n`, boundary `DRIVE_MULTIPART_BOUNDARY`, metadata JSON generated from the frozen allowlisted fields in the displayed order, and no user-controlled boundary.

## Checkpoint A — identity and bounded transport

### Task 1: Pin public contracts, copy, and fixture vocabulary

**Files:**

- Modify/consume: `src/features/google-drive/types.ts:1-end` — Phase 1B owns Drive candidate-observation/resolver/snapshot/service declarations; Phase 5 adds only the compatible identity/transport/parser/service declarations explicitly listed in this plan.
- Read/consume unchanged: `src/features/storage/sync-types.ts:1-end` — Phase 1B owns every durable publication/candidate/sync persistence declaration and pending constructor/guard.
- Create: `src/features/google-drive/constants.ts`
- Create: `src/features/google-drive/copy.ts`
- Modify: `src/app/copy.ts:1-end` — import/register `DRIVE_COPY` only.
- Create: `tests/e2e/fixtures/drive.ts`
- Modify: `src/features/storage/repositories.ts:1-end`
- Create: `tests/unit/drive-identity.test.ts`

- [ ] **Step 1: Write failing type/fixture tests**

Add compile-time assertions in `tests/unit/drive-identity.test.ts` for the exact master discriminated union and direct imports of every constant exported by `src/features/google-drive/constants.ts`. Prove values, tuple scope order, private-property names, API roots/host, MIME, caps, and limits exactly match Section 3; source-scan Drive implementations and `src/features/transcription/hashes.ts` to reject local declarations of those symbols. Prove `UnboundPendingOperation` requires every generated/attempted field to be literal `null`; every bound/creating/verifying/needs-attention variant requires the complete readonly frozen attempt; `NeedsAttentionPendingOperation.lastErrorCode` is non-null; no flat object with nullable attempted fields satisfies `PendingOperation`; and no legacy field alias compiles. Exercise `createUnboundPendingOperation`, `freezePendingAttempt`, every discriminator guard, and `parsePendingOperation`: each valid variant round-trips exactly; constructor inputs are copied; later caller mutation cannot alter frozen private properties; mixed/null attempted identity, unknown fields, invalid desired hash/JSON agreement, and every illegal variant shape reject. Assert copy has identical EN/VI keys and `COPY_REGISTRY.drive === DRIVE_COPY`. Define fixture factories with fixed scalar-valid IDs, timestamps, normative live/tombstone envelopes, GIS callback controls, and exact list-query fixtures. The request recorder rejects candidate list requests without `spaces=appDataFolder`, `trashed=false`, `'appDataFolder' in parents`, and the exact private candidate predicate; it rejects legacy list requests without `spaces=appDataFolder`, `trashed=false`, and `'appDataFolder' in parents`; it rejects any body containing `File`, `Blob` media fixture bytes, settings JSON, bearer token in logs, or raw transcript ID in name/properties.

Create `tests/e2e/fixtures/drive.ts` with these complete exact master exports and deterministic implementation. No body, token, raw transcript ID, settings value, source media, or Drive file ID enters `requests`:

```ts
import { expect, type Page } from "@playwright/test"
import { candidateHash, remoteKey } from "../../../src/features/transcription/hashes"
import { serializeTranscriptEnvelope } from "../../../src/features/transcription/schema"
import type { TranscriptEnvelope } from "../../../src/features/transcription/types"
import { seedTranscript } from "./database"

export const LIVE_ENVELOPE: TranscriptEnvelope = {
  schemaVersion: 2,
  transcriptId: "tr_sample_001",
  revision: 3,
  updatedAt: 1785283201000,
  deletedAt: null,
  deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA",
  deletionId: null,
  restoredFromDeletionId: null,
  transcript: {
    title: "Sample transcript",
    sourceName: "sample.wav",
    language: "en",
    modelId: "Xenova/whisper-base",
    mode: "local-webgpu",
    createdAt: 1785283200000,
    text: "Hello world.",
    segments: [{ id: "seg_001", startMs: 0, endMs: 1250, text: "Hello world." }],
  },
}

export const TOMBSTONE_ENVELOPE: TranscriptEnvelope = {
  schemaVersion: 2,
  transcriptId: "tr_sample_001",
  revision: 4,
  updatedAt: 1785283202000,
  deletedAt: 1785283202000,
  deviceId: "d_AAAAAAAAAAAAAAAAAAAAAA",
  deletionId: "x_AAAAAAAAAAAAAAAAAAAAAA",
  restoredFromDeletionId: null,
  transcript: null,
}

export type DriveIdentityFixtureState = "menu" | "auth-error" | "revoke-unconfirmed" | "account-switch"
export type DriveSyncFixtureState = "attention" | "conflict" | "toast"
export interface DriveFixtureOptions {
  identity?: DriveIdentityFixtureState
  sync?: DriveSyncFixtureState
  discoveryFault?: "reject-candidate-query" | "invalid-page-token" | "incomplete-search"
}
type DriveFixtureWindow = Window & {
  __WHISDOM_DRIVE_FIXTURE__: {
    identity: DriveIdentityFixtureState
    sync: DriveSyncFixtureState
    requests: Array<{ method: string; pathname: string }>
    completedListPasses: number
    metadataReadbacks: string[]
    mediaReadbacks: string[]
    uploads: number
    deletes: number
    applyActions: number
  }
}

export async function installDriveFixture(page: Page, options: DriveFixtureOptions = {}): Promise<void> {
  const fixture = { identity: options.identity ?? "menu", sync: options.sync ?? "toast" } as const
  const liveTranscript = LIVE_ENVELOPE.transcript
  if (liveTranscript === null) throw new Error("fixture LIVE_ENVELOPE must be live")
  const conflictB = {
    ...LIVE_ENVELOPE,
    deviceId: "d_AQEBAQEBAQEBAQEBAQEBAQ",
    transcript: {
      ...liveTranscript,
      text: "Competing transcript.",
      segments: [{ id: "seg_001", startMs: 0, endMs: 1250, text: "Competing transcript." }],
    },
  } satisfies TranscriptEnvelope
  const bodies = [serializeTranscriptEnvelope(LIVE_ENVELOPE), serializeTranscriptEnvelope(conflictB)]
  const remoteKeyValue = await remoteKey(LIVE_ENVELOPE.transcriptId)
  const hashes = [await candidateHash(LIVE_ENVELOPE), await candidateHash(conflictB)]
  const permittedEnvelopeBodies = bodies
  await page.addInitScript((state) => {
    ;(window as DriveFixtureWindow).__WHISDOM_DRIVE_FIXTURE__ = {
      ...state,
      requests: [],
      completedListPasses: 0,
      metadataReadbacks: [],
      mediaReadbacks: [],
      uploads: 0,
      deletes: 0,
      applyActions: 0,
    }
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-drive-action="apply-account-switch"]') : null
      if (target) (window as DriveFixtureWindow).__WHISDOM_DRIVE_FIXTURE__.applyActions += 1
    }, true)
    const oauth2 = {
      initTokenClient(config: { callback: (response: Record<string, unknown>) => void; error_callback?: () => void }) {
        return { requestAccessToken() { queueMicrotask(() => state.identity === "auth-error"
          ? config.error_callback?.()
          : config.callback({ access_token: "fixture-token", expires_in: 3600, scope: "openid email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata" })) } }
      },
      revoke(_token: string, callback: (response?: unknown) => void) {
        if (state.identity !== "revoke-unconfirmed") queueMicrotask(() => callback({ successful: true }))
      },
    }
    ;(window as Window & { google?: unknown }).google = { accounts: { oauth2 } }
  }, fixture)
  let userInfoAttempt = 0
  await page.route("https://openidconnect.googleapis.com/v1/userinfo", async (route) => {
    userInfoAttempt += 1
    const accountB = fixture.identity === "account-switch" && userInfoAttempt > 1
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      sub: accountB ? "fixture-account-b" : "fixture-account-a",
      name: accountB ? "Fixture Account B" : "Fixture Account A",
      email: accountB ? "account-b@example.test" : "account-a@example.test",
      email_verified: true,
    }) })
  })
  let completedListPasses = 0
  let createdCandidate = false
  const passFileIds = [
    ["fixture-file-a"],
    ["fixture-file-b"],
    ["fixture-file-a", "fixture-file-b"],
    ["fixture-file-a", "fixture-file-b"],
  ] as const
  await page.route("https://www.googleapis.com/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const headers = await request.allHeaders()
    const authorization = headers.authorization
    if (authorization !== "Bearer fixture-token") throw new Error("unexpected Drive authorization credential")
    if (url.href.includes("fixture-token")) throw new Error("bearer token leaked in URL")
    const body = request.postDataBuffer()
    const bodyText = body?.toString("utf8") ?? ""
    const forbiddenBody = [
      "fixture-token",
      "persistMediaBlobs",
      "chunkSeconds",
      "fixture-source-media-bytes",
      "https://example.test/media?id=1",
    ]
    if (forbiddenBody.some((value) => bodyText.includes(value))) {
      throw new Error("Drive request leaked forbidden media/settings/raw identity data")
    }
    if (bodyText.includes("tr_sample_001") && !permittedEnvelopeBodies.some((value) => bodyText.includes(value))) {
      throw new Error("raw transcript ID leaked outside canonical envelope media")
    }
    if (body && request.method() === "GET") throw new Error("unexpected Drive GET body")
    if (request.method() === "POST" && url.pathname.includes("/upload/drive/v3/files")) {
      const matchingBodies = permittedEnvelopeBodies.filter((value) => bodyText.includes(value))
      if (matchingBodies.length !== 1) throw new Error("multipart upload must contain exactly one approved canonical envelope")
    } else if (body && body.byteLength > 0) {
      throw new Error("unexpected non-upload Drive request body")
    }
    const observedPath = url.pathname.replace(/\/drive\/v3\/files\/[^/]+$/u, "/drive/v3/files/:id")
    await page.evaluate(({ method, pathname }) => {
      ;(window as DriveFixtureWindow).__WHISDOM_DRIVE_FIXTURE__.requests.push({ method, pathname })
    }, { method: request.method(), pathname: observedPath })
    if (fixture.sync === "attention" && request.method() !== "GET") {
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" }); return
    }
    if (url.pathname.endsWith("/generateIds")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ids: ["fixture-generated-id"] }) }); return
    }
    if (url.pathname.endsWith("/files") && request.method() === "GET") {
      if (url.searchParams.get("spaces") !== "appDataFolder" || url.searchParams.get("pageSize") !== "1000") throw new Error("invalid candidate pagination controls")
      const expectedQuery = `trashed = false and 'appDataFolder' in parents and appProperties has { key = 'whisdomTranscriptKey' and value = '${remoteKeyValue}' and visibility = 'PRIVATE' }`
      if (options.discoveryFault === "reject-candidate-query") throw new Error("fixture rejected candidate query as malformed")
      if (url.searchParams.get("q") !== expectedQuery) throw new Error("malformed candidate query")
      const pageToken = url.searchParams.get("pageToken")
      if (pageToken !== null && pageToken !== "fixture-page-2") throw new Error("invalid candidate page token")
      const ids = fixture.sync === "conflict"
        ? passFileIds[Math.min(completedListPasses, 3)]
        : createdCandidate ? ["fixture-generated-id"] : []
      const pageIds = pageToken === null ? ids.slice(0, 1) : ids.slice(1)
      if (pageToken === "fixture-page-2" && ids.length < 2) throw new Error("unexpected second page")
      const files = pageIds.map((id) => {
        const index = id === "fixture-file-b" ? 1 : 0
        const hash = hashes[index]
        return { id, name: `whisdom-transcript-${remoteKeyValue}-${hash}.json`, mimeType: "application/vnd.whisdom.transcript+json", appProperties: { whisdomTranscriptKey: remoteKeyValue, whisdomSchemaVersion: "2", whisdomCandidateHash: hash }, size: String(new TextEncoder().encode(permittedEnvelopeBodies[index]).byteLength), version: "1" }
      })
      const nextPageToken = pageToken === null && ids.length > 1
        ? options.discoveryFault === "invalid-page-token" ? "fixture-invalid-page-token" : "fixture-page-2"
        : undefined
      if (!nextPageToken && options.discoveryFault !== "incomplete-search") {
        completedListPasses += 1
        await page.evaluate((count) => { ;(window as DriveFixtureWindow).__WHISDOM_DRIVE_FIXTURE__.completedListPasses = count }, completedListPasses)
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ incompleteSearch: options.discoveryFault === "incomplete-search", nextPageToken, files }) }); return
    }
    if (request.method() === "POST" && url.pathname.includes("/upload/drive/v3/files")) {
      createdCandidate = true
      await page.evaluate(() => { ;(window as DriveFixtureWindow).__WHISDOM_DRIVE_FIXTURE__.uploads += 1 })
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        id: "fixture-generated-id",
        name: `whisdom-transcript-${remoteKeyValue}-${hashes[0]}.json`,
        mimeType: "application/vnd.whisdom.transcript+json",
        appProperties: { whisdomTranscriptKey: remoteKeyValue, whisdomSchemaVersion: "2", whisdomCandidateHash: hashes[0] },
        size: String(new TextEncoder().encode(permittedEnvelopeBodies[0]).byteLength),
        version: "1",
      }) }); return
    }
    const readbackIndex = url.pathname.endsWith("fixture-file-b") ? 1 : url.pathname.endsWith("fixture-file-a") || url.pathname.endsWith("fixture-generated-id") ? 0 : -1
    if (readbackIndex >= 0 && url.searchParams.get("alt") !== "media") {
      const hash = hashes[readbackIndex]
      const readbackId = url.pathname.endsWith("fixture-generated-id") ? "generated" : readbackIndex === 0 ? "a" : "b"
      await page.evaluate((id) => { ;(window as DriveFixtureWindow).__WHISDOM_DRIVE_FIXTURE__.metadataReadbacks.push(id) }, readbackId)
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        id: readbackId === "generated" ? "fixture-generated-id" : `fixture-file-${readbackId}`,
        name: `whisdom-transcript-${remoteKeyValue}-${hash}.json`,
        mimeType: "application/vnd.whisdom.transcript+json",
        appProperties: { whisdomTranscriptKey: remoteKeyValue, whisdomSchemaVersion: "2", whisdomCandidateHash: hash },
        size: String(new TextEncoder().encode(permittedEnvelopeBodies[readbackIndex]).byteLength),
        version: "1",
      }) }); return
    }
    if (url.searchParams.get("alt") === "media") {
      await page.evaluate((id) => { ;(window as DriveFixtureWindow).__WHISDOM_DRIVE_FIXTURE__.mediaReadbacks.push(id) }, url.pathname.endsWith("fixture-generated-id") ? "generated" : url.pathname.endsWith("fixture-file-b") ? "b" : "a")
      const body = url.pathname.endsWith("fixture-file-b") ? permittedEnvelopeBodies[1] : permittedEnvelopeBodies[0]
      await route.fulfill({ status: 200, contentType: "application/vnd.whisdom.transcript+json", body }); return
    }
    if (request.method() === "DELETE") await page.evaluate(() => { ;(window as DriveFixtureWindow).__WHISDOM_DRIVE_FIXTURE__.deletes += 1 })
    await route.fulfill({ status: 200, contentType: "application/json", body: request.method() === "DELETE" ? "" : "{}" })
  })
}

async function setDriveFixtureLanguage(page: Page, language: "en" | "vi"): Promise<void> {
  if (await page.locator("html").getAttribute("lang") === language) return
  await page.getByRole("button", { name: /account menu|menu tài khoản/i }).click()
  await page.getByRole("button", { name: language.toUpperCase(), exact: true }).click()
  await expect(page.locator("html")).toHaveAttribute("lang", language)
}

export async function openIdentityState(page: Page, state: DriveIdentityFixtureState, language: "en" | "vi"): Promise<void> {
  await page.goto("/?view=workbench")
  await setDriveFixtureLanguage(page, language)
  await page.getByRole("button", { name: /drive|account|tài khoản/i }).click()
  if (state === "menu") { await expect(page.getByRole("menu")).toBeVisible(); return }
  await page.getByRole("button", { name: /connect|kết nối/i }).click()
  if (state === "auth-error") { await expect(page.getByRole("alert")).toBeVisible(); return }
  if (state === "account-switch") {
    await expect(page.getByText("Fixture Account A")).toBeVisible()
    await page.getByRole("button", { name: /sync now|đồng bộ ngay/i }).click()
    await expect.poll(async () => page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("whisdom")
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const rows = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction("syncState").objectStore("syncState").getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      db.close()
      return rows.some((row) => JSON.stringify(row).includes("fixture-account-a"))
    })).toBe(true)
    const transcriptId = await seedTranscript(page, { segmentCount: 2, saveFails: true })
    const transcriptRemoteKey = await remoteKey(transcriptId)
    await page.evaluate(async ({ transcriptId, transcriptRemoteKey }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("whisdom")
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const accountState = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const request = db.transaction("syncState").objectStore("syncState").getAll()
        request.onsuccess = () => resolve((request.result as Record<string, unknown>[])[0])
        request.onerror = () => reject(request.error)
      })
      const accountKey = String(accountState.accountKey)
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("syncMetadata", "readwrite")
        transaction.objectStore("syncMetadata").put({
          accountKey,
          transcriptId,
          remoteKey: transcriptRemoteKey,
          confirmedCandidateHash: null,
          confirmedFileId: null,
          informationalDriveVersion: null,
          itemState: "local-only",
          lastErrorCode: null,
        })
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error ?? new Error("account-A metadata seed aborted"))
      })
      db.close()
    }, { transcriptId, transcriptRemoteKey })
    await expect.poll(() => page.evaluate(async (expectedTranscriptId) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("whisdom")
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const rows = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = db.transaction("syncMetadata").objectStore("syncMetadata").getAll()
        request.onsuccess = () => resolve(request.result as Record<string, unknown>[])
        request.onerror = () => reject(request.error)
      })
      db.close()
      return rows.some((row) => row.transcriptId === expectedTranscriptId && row.itemState === "local-only")
    }, transcriptId)).toBe(true)
    await page.goto(`/?view=transcript&id=${encodeURIComponent(transcriptId)}`)
    await page.getByLabel(/title|tiêu đề/i).fill("Dirty account A editor")
    // Switch before the 600 ms debounce releases the dirty save; the installed
    // one-shot repository failure then proves the held save cannot be bypassed.
    await page.getByRole("button", { name: /drive|account|tài khoản/i }).click()
    await page.getByRole("button", { name: /connect another|kết nối tài khoản khác/i }).click()
    await expect(page.getByRole("dialog")).toContainText("Fixture Account B")
    await expect(page.getByLabel(/title|tiêu đề/i)).toHaveValue("Dirty account A editor")
    await expect.poll(() => page.evaluate(() => {
      const repository = (window as Window & { __WHISDOM_REPOSITORY_FIXTURE__?: { failNext: string | null; consumed: string[] } }).__WHISDOM_REPOSITORY_FIXTURE__
      return repository ? { failNext: repository.failNext, consumed: repository.consumed } : null
    })).toEqual({ failNext: null, consumed: ["commitCanonicalDraftAndCoalescePending"] })
    await expect.poll(() => page.evaluate(() => (window as DriveFixtureWindow).__WHISDOM_DRIVE_FIXTURE__.uploads)).toBe(0)
    await expect.poll(() => page.evaluate(() => (window as DriveFixtureWindow).__WHISDOM_DRIVE_FIXTURE__.applyActions)).toBe(0)
    await expect(page.getByRole("dialog").getByRole("button", { name: /apply|áp dụng/i })).toBeVisible()
    return
  }
  await page.getByRole("button", { name: /drive|account|tài khoản/i }).click()
  await page.getByRole("button", { name: /revoke|thu hồi/i }).click()
  await page.getByRole("button", { name: /confirm|xác nhận/i }).click()
  await expect(page.getByText(/permissions|quyền/i)).toBeVisible()
}

export async function openSyncState(page: Page, state: DriveSyncFixtureState, language: "en" | "vi"): Promise<void> {
  await page.goto("/?view=workbench")
  await setDriveFixtureLanguage(page, language)
  await page.getByRole("button", { name: /drive|account|tài khoản/i }).click()
  await page.getByRole("button", { name: /connect|kết nối/i }).click()
  await expect(page.getByText(/connected|đã kết nối/i)).toBeVisible()
  await page.goto("/?view=library")
  await page.getByRole("button", { name: /sync now|đồng bộ ngay/i }).click()
  if (state === "attention") await expect(page.getByText(/needs attention|cần chú ý/i)).toBeVisible()
  else if (state === "conflict") {
    await expect.poll(() => page.evaluate(() => (window as DriveFixtureWindow).__WHISDOM_DRIVE_FIXTURE__.completedListPasses)).toBe(4)
    await expect.poll(() => page.evaluate(() => ({
      metadata: [...new Set((window as DriveFixtureWindow).__WHISDOM_DRIVE_FIXTURE__.metadataReadbacks)].sort(),
      media: [...new Set((window as DriveFixtureWindow).__WHISDOM_DRIVE_FIXTURE__.mediaReadbacks)].sort(),
    }))).toEqual({ metadata: ["a", "b"], media: ["a", "b"] })
    await expect(page.getByRole("dialog")).toContainText(/conflict|xung đột/i)
    await expect(page.getByRole("dialog")).toContainText(/Fixture Account A|tài khoản A/i)
  }
  else await expect(page.locator('[aria-live="polite"]')).toContainText(/sync|đồng bộ/i)
}
```

`LIVE_ENVELOPE` is a mutable `TranscriptEnvelope`, not an `as const`/readonly structural type. Its nested `transcript.segments` is the mutable `CanonicalSegment[]` required by `serializeTranscriptEnvelope`, `candidateHash`, and spread-based divergent-candidate construction. Tests include compile-time assignments through `TranscriptEnvelope` and call both serialization and hashing without readonly casts.

Conflict setup is protocol-valid, not display-only: both listed candidates share the computed `remoteKey`, use RFC-8785 `serializeTranscriptEnvelope` bodies, computed `candidateHash` values, exact candidate filenames/properties/MIME, byte-accurate `size`, and matching metadata and `alt=media` readbacks. The two envelopes are valid divergent live candidates for one transcript. Complete-pass sequence is exactly `{A}`, `{B}`, `{A,B}`, `{A,B}`; every two-file pass paginates with exactly `fixture-page-2`. This reaches the two-identical-set rule only on pass four and proves the max-four bound. Any malformed query, missing predicate, invalid page token, `incompleteSearch`, skipped metadata readback, or skipped media readback fails the fixture before UI assertion.

For `account-switch`, `openIdentityState` performs two real fixture connections. First UserInfo returns exact account-A `sub`/name/verified email, waits until account-A sync state is durable, seeds its transcript, installs `failNext:"commitCanonicalDraftAndCoalescePending"`, opens the editor, edits before the 600 ms debounce releases (held), and then observes the one-shot save failure. Second clicked Connect returns exact account-B identity metadata. The opener returns only after the account-switch dialog names B, account A remains durable/protected, B is paused, upload count is zero, Apply has not been clicked, the failure was consumed once, and dirty editor content remains mounted. Cancel, preview, Apply, and disclosure/upload tests each start from this exact state and separately assert their counter/state transitions. `openSyncState("conflict")` connects account A first, runs all four complete passes and complete metadata/media readbacks, then returns after the conflict dialog names validated choices. No opener writes final UI state directly.

The recorder inspects `request.allHeaders()` and `request.postDataBuffer()` before fulfillment. Drive requests must transmit the expected in-memory `Authorization: Bearer fixture-token`; absence or a different bearer fails. It validates headers and body in local callback variables, then discards both. The recorder never stores, logs, serializes, returns, snapshots, or attaches either value to the page. It rejects token material in URL/body/observations, any GET body, any non-upload body, source `File`/Blob sentinel bytes, source URLs, settings keys/values, raw transcript IDs outside the one approved canonical envelope media part, raw Drive IDs in observations, and multipart bodies containing zero or multiple approved envelopes. Only sanitized `{method,pathname}` with opaque file IDs replaced by `:id` enters `requests`. PRIV-01 inspects every body before sanitization and then asserts the persisted recorder contains no header/body field.

The GIS unit/component tests import `DriveFixtureOptions`, `DriveIdentityFixtureState`, and `DriveSyncFixtureState` for compile-time signature checks. `drive-identity.spec.ts`, `drive-sync.spec.ts`, and Phase 6 consume the same `installDriveFixture`, `openIdentityState`, and `openSyncState` functions; every opener returns only after its named visible state is reached.

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/unit/drive-identity.test.ts`

Expected: FAIL only from missing Phase 5 additive identity/transport declarations or `google-drive/copy`; the Phase 1B frozen contract resolves and no fixture/setup error occurs.

- [ ] **Step 3: Consume frozen contracts and add compatible Phase 5 types**

Import `RemoteCandidate`, `VerifiedPublicationReceipt`, `DriveSyncState`, `SyncMetadata`, `PublicationState`, `DriveAppProperties`, `PendingDesiredPublication`, `PendingOperationBase`, every `PendingOperation` variant, pending constructor/guard, `BindGeneratedAttemptInput`, `ExpectedBoundAttempt`, `ExpectedFrozenAttempt`, and `ExpectedCreatingAttempt` directly from the master-owned `src/features/storage/sync-types.ts`. Import `TranscriptEnvelope` from transcription types. Import `ObservedRemoteCandidate`, `ResolvedCandidateSet`, `DriveSyncSnapshot`, and `DriveSyncService` from `src/features/google-drive/types.ts`. Do not copy, restate, alias, rename, narrow, widen, or redeclare these contracts. The Phase 5 Drive-types edit adds only identity/transport/parser/verifier data declarations plus representation-preserving Drive-only references to `constants.ts`; `storage/sync-types.ts` retains its literal durable representation and never imports Drive constants. In particular, do not introduce a flat persisted operation or nullable attempted identity outside `unbound`.

Source-graph tests require remote-quarantine declarations only in `src/features/storage/remote-types.ts`; durable publication/candidate/sync declarations, `VerifiedPublicationReceipt`, and pending constructors/guards only in `src/features/storage/sync-types.ts`; storage repositories to import only those storage owners; every Google Drive consumer of persisted or receipt types to import that neutral owner; and every `src/features/storage/**` source file to contain no import of `src/features/google-drive/**`. `google-drive/types.ts` may consume or narrowly re-export storage-owned types. Phase 5 consumes the amended Phase 1B storage owner unchanged and does not modify or stage either storage type owner.

Add only these compatible Phase 5 identity/transport/parser declarations to the Phase 1B-owned Drive types file; do not repeat any storage-owned declaration. `storage/remote-types.ts` owns quarantine records. `storage/sync-types.ts` owns durable pending/candidate/sync records and every pending constructor/parser/guard. Drive types import those owners and already own `ObservedRemoteCandidate`, `ResolvedCandidateSet`, `DriveSyncSnapshot`, and `DriveSyncService`. The parser declarations included below are the sole Drive-owned parser result/error declarations; `parser.ts` imports them and adds no duplicate contract:

```ts
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

`src/features/google-drive/types.ts` owns all shared parser, raw-body, dependency, and readback expectation declarations imported by `parser.ts` and `publication.ts`; Phase 5 adds them in place while importing durable records from `storage/sync-types.ts`. This is the one declaration of these Drive service names in the repository. `parser.ts` owns implementations only.

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

export type RemoteBodyFailureCode =
  | "remote.body-too-large"
  | "remote.body-read-failed"
  | "remote.invalid-utf8"

export interface RemoteBodySource {
  response: Response
  fileId: string
  privateProperties: unknown
  receivedAt: number
  fileName?: string
  mimeType?: string
}

export type RawRemoteBodyResult =
  | { boundedBytes: Uint8Array; byteHash: string; contentType: string; fileId: string; privateProperties: unknown; receivedAt: number; fileName: string | null; mimeType: string | null; bodyText: string; failureCode: null }
  | { boundedBytes: Uint8Array; byteHash: string; contentType: string; fileId: string; privateProperties: unknown; receivedAt: number; fileName: string | null; mimeType: string | null; bodyText: null; failureCode: "remote.body-too-large" | "remote.invalid-utf8" }
  | { boundedBytes: Uint8Array; byteHash: null; contentType: string; fileId: string; privateProperties: unknown; receivedAt: number; fileName: string | null; mimeType: string | null; bodyText: null; failureCode: "remote.body-read-failed" }

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

The imported storage-neutral receipt declaration is identical in master, Phase 1, and Phase 5:

```ts
export interface VerifiedPublicationReceipt {
  readonly kind: "verified-publication"
  readonly generatedFileId: string
  readonly candidateHash: string
  readonly acceptedPayloadHash: string
  readonly exactBodyHash: string
  readonly verifiedAt: number
}
```

`RemoteBodySource`, `RemoteBodyLimits`, `RawRemoteBodyResult`, `RawRemoteBody`, `RemoteBodyFailureCode`, `RemoteCandidateParseErrorCode`, `RemoteCandidateParseError`, `RemoteCandidateParseResult`, `PureParserDependencies`, `LegacyDriveDocumentParseResult`, `DriveFileMetadata`, `PublishedCandidateReadback`, `SameIdReadbackExpectation`, `ReadbackVerifierDependencies`, and `ReadbackVerificationResult` live additively in the Phase-1B-created shared types file beside its base pending/candidate/sync declarations. The file contains shared data contracts, constructors, parsers, and guards, but no identity/transport/parser/publication/service implementation and no `verifyPublishedCandidate` declaration, overload, ambient signature, or body. Dependencies contain only body-read, schema-parse, and hash callbacks; they have no repository, account, clock, transport mutation, or persistence callback. `parseRemoteCandidate` is pure with respect to application state: it returns a validated schema-2 candidate or bounded quarantine metadata and performs no IndexedDB write. `parseLegacyDriveDocument` validates the exact legacy top-level fields `{id,title,sourceName,language,modelId,mode,createdAt,updatedAt,text,segments}` and returns a bounded intermediate containing converted `transcriptId`, both bounded epoch timestamps, canonical text, and canonical millisecond segments. Migration maps validated `updatedAt` to envelope `updatedAt`, maps all payload fields including `text`, sets revision `0` and null deletion lineage, and computes candidate/accepted hashes only after strict conversion. `src/features/google-drive/publication.ts` alone exports and implements `verifyPublishedCandidate`; it returns the validated `RemoteCandidate` plus exact candidate, accepted-payload, and raw-body hashes on success or the exact discriminated failure on mismatch. Publication/reconcile may mark synced or remove pending only after verifier success plus stabilization. `reconcile.ts` owns candidate/quarantine persistence after parser results are returned.

Normative declaration boundary for the parser block above: parser/raw-body/readback declarations live in `google-drive/types.ts`; durable pending/candidate/sync declarations, constructors, parsers, and guards live only in `storage/sync-types.ts`. The Drive file consumes or narrowly re-exports storage names and never owns a second declaration. Storage code never imports the Drive file.

`RemoteQuarantineMetadata` validator enforces the mutually exclusive exact disposition from spec §15.8. `copy.ts` imports `defineCopy`, `CopyParams`, and `InterfaceLanguage` only from `@/app/copy-types`, never from `@/app/copy`, and supplies complete EN/VI labels/messages for Not connected, Opening, Connected, Needs reconnect, Revoking, Connect, Reconnect, Sync now, Sign out, Revoke access, same-Cloud-project blast-radius warning, backup-remains warning, permissions link, Local only/Pending/Syncing/Synced/Needs attention, popup dismissed/blocked/error/timeout, missing scope, account switch choices, preview/apply/disclosure confirmation, conflict, retry, and all accessible names/live announcements.

Make composition-root `src/app/copy.ts` import exported `DRIVE_COPY` and register it in Phase 1's same typed `CopyRegistry`/`COPY_REGISTRY` as `drive: typeof DRIVE_COPY`, preserving shell/settings/workbench/editor/library references exactly. The feature module imports only `copy-types.ts`, so no cycle exists. Phase 6 imports only this final registry export; no Drive-local registry or undefined slot exists.

Exercise `createUnboundPendingOperation`, `freezePendingAttempt`, `parsePendingOperation`, and discriminator guards imported directly from Phase 1B `storage/sync-types.ts` without redeclaring them here. Constructors are the only production path that creates persisted operations; tests prove they validate the desired hash/JSON pair and initialize every retry field explicitly:

`createUnboundPendingOperation` returns literal `null` for every generated/attempted field. `freezePendingAttempt` returns a deeply readonly, independently copied attempt and rejects any hash/body, filename, MIME, generated-ID, or private-property mismatch. Guards narrow only the discriminated variants; they do not coerce a flat object. The persisted parser and every repository transition use these constructors/guards, reject unknown fields, and reject illegal edges (`unbound → creating`, `bound → verifying`, `creating → bound`, `verifying → creating`, automatic `needs-attention` retry/rebind, or any frozen-field mutation).

Normative correction for verifier summaries above: `ReadbackVerifierDependencies` also contains only injected `now()`; no other clock is permitted. Successful verification returns exactly `{ candidate, receipt }`, where `receipt` is the storage-owned `VerifiedPublicationReceipt`; it does not return parallel candidate/payload/body hash strings or envelope JSON. Only the successful verifier branch constructs the receipt. Failure returns no receipt. This correction supersedes older return/dependency wording above.

- [ ] **Step 4: Run green and adjacency**

Run: `pnpm vitest run tests/unit/drive-identity.test.ts tests/unit/schema-hashes.test.ts tests/unit/database.test.ts`

Expected: PASS; exact schema/hash/database fixtures remain unchanged.

- [ ] **Step 5: Stage and commit**

Run:

```bash
git add src/features/google-drive/constants.ts src/features/google-drive/types.ts src/features/google-drive/copy.ts src/app/copy.ts src/features/storage/repositories.ts tests/unit/drive-identity.test.ts tests/e2e/fixtures/drive.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(drive): extend immutable sync contracts"
```

Expected staged paths: exactly seven listed paths. Commit only during plan execution and only after review.

### Task 2: Build gesture-only GIS identity state machine

**Files:**

- Create: `src/features/google-drive/identity.ts`
- Consume unchanged: `src/features/google-drive/types.ts` — sole owner of `DriveIdentityClient`, `IdentitySnapshot`, `AccountSwitchGuard`, and all account-switch result types
- Modify: `tests/unit/drive-identity.test.ts`
- Create: `tests/components/drive-identity.test.tsx`

- [ ] **Step 1: Add GIS-01/GIS-03/GIS-04/GIS-05 failing tests**

Use fake timers and a controlled GIS token client. Assert unique attempt IDs; token callback and `error_callback` settle only current attempt; dismissal/error/timeout invalidate attempt; late callbacks do nothing; credential/expiry never enter storage; all five scopes are checked before UserInfo/Drive; crossing `expiresAt - 60_000` pauses; focus/online/interval/reload never call `requestAccessToken`; only direct Connect/Reconnect/Sync-now handlers call it. Assert revoke uses `google.accounts.oauth2.revoke`, callback controls confirmed copy, no-token/failure/timeout produces unconfirmed state plus exact permissions URL and backup/blast-radius copy. For a `sub` different from the prior account, assert connection remains paused; Cancel clears the attempted session; Reconcile without upload permits bounded read/stage only and exposes an explicit apply callback; Sync local transcripts requires a second disclosure callback before account association or enqueue. Both apply and disclosure paths call the existing Phase 4 navigation/editor guard first, so a dirty or failed-save editor cannot be overwritten or disclosed.

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/unit/drive-identity.test.ts --testNamePattern="GIS-01|GIS-03|GIS-04"`

Expected: FAIL because identity client does not exist.

- [ ] **Step 3: Add minimal state machine**

Use injected `clock`, `setTimeout`, `clearTimeout`, GIS object, UserInfo loader, and state listener. `identity.ts` imports the exact contracts below; it implements/consumes them and declares no local snapshot, guard, result, interface, or type alias. `tests/unit/drive-identity.test.ts` and `tests/components/drive-identity.test.tsx` use the same owner and never import these contracts from `identity.ts`:

```ts
import type {
  AccountSwitchApplyResult,
  AccountSwitchAssociationResult,
  AccountSwitchGuard,
  AccountSwitchPreviewResult,
  DriveIdentityClient,
  IdentitySnapshot,
} from "@/features/google-drive/types"
```

`requestFromGesture` synchronously marks `opening`, increments an attempt sequence, initializes GIS with exact five-scope string, callback, and `error_callback`, starts a 30-second watchdog, then invokes `requestAccessToken({prompt: gesture === "connect" ? "consent" : ""})` in that same user-event call stack. Validate `access_token` non-empty, `expires_in` finite positive seconds, and granted scope set before UserInfo. Store token and `expiresAt = now + expires_in * 1000` only in closure memory. Clear/overwrite callback handlers and timeout after settlement. `credentialForProtectedCall` throws typed `drive.auth.scope-missing` or `drive.auth.stale` before fetch. `checkFreshness` only clears credential/sets Needs reconnect; it never requests a token. Inject the imported `AccountSwitchGuard` with `cancel`, `previewWithoutUpload`, `applyPreviewAfterEditorGuard`, and `associateAfterDisclosure`; identity code can select these explicit transitions but cannot mutate transcript/pending stores directly. `identity.ts` exports the identity implementation/factory only; it does not re-export or redeclare guard/result contracts.

Identity transition helpers explicitly return `Promise<AccountSwitchPreviewResult>`, `Promise<AccountSwitchApplyResult>`, and `Promise<AccountSwitchAssociationResult>` respectively, so every imported result type is used under `noUnusedLocals`. Preview returns the guard's candidate list unchanged; apply and association await the guard and return only after its editor/disclosure gate completes.

- [ ] **Step 4: Run green and component state test**

Run: `pnpm vitest run tests/unit/drive-identity.test.ts tests/components/drive-identity.test.tsx`

Expected: PASS; popup outcomes announce once; buttons remain keyboard operable; no token appears in rendered DOM or serialized fixture storage.

- [ ] **Step 5: Stage and commit**

```bash
git add src/features/google-drive/identity.ts tests/unit/drive-identity.test.ts tests/components/drive-identity.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "feat(drive): require gesture-bound Google identity"
```

### Task 3: Validate UserInfo and load fallback-first avatars

**Files:**

- Create: `src/features/google-drive/avatar.ts`
- Modify: `src/features/google-drive/identity.ts:1-end`
- Modify: `tests/unit/drive-identity.test.ts`
- Modify: `tests/components/drive-identity.test.tsx`

- [ ] **Step 1: Add GIS-02 failing boundary tests**

Cover 64 KiB UserInfo cap, strict plain object/types, scalar validation before count/key/URL, required nonblank `sub` 1..255 scalars, optional name 256, email 320 plus `email_verified === true`, picture 2,048, fixed issuer, and exact length-prefixed account key. Invalid required `sub` rejects activation; invalid optional fields drop to fallback. Avatar cases: malformed scalar, HTTP, credentials, nonstandard port, wrong host, redirect, CORS rejection, five-second timeout, 1 MiB + 1, non-image MIME, broken Blob image. Assert no remote URL reaches `img.src`, sync remains connected on avatar failure, and prior Blob URLs revoke on replacement/unmount.

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/unit/drive-identity.test.ts --testNamePattern="GIS-02"`

Expected: FAIL on absent UserInfo cap/account key/avatar loader.

- [ ] **Step 3: Add exact identity/avatar code**

UserInfo request is `GET https://openidconnect.googleapis.com/v1/userinfo`, `redirect: "error"`, bearer header, and no body. Stream through a generic cap reader that cancels upon byte 65,537. Account key is:

```ts
import { assertScalarString } from "@/features/transcription/canonical"

export function accountKeyForSub(sub: string): string {
  assertScalarString(sub, "sub")
  const issuerLength = [...GOOGLE_ISSUER].length
  const subLength = [...sub].length
  return `${issuerLength}:${GOOGLE_ISSUER}${subLength}:${sub}`
}
```

Avatar implementation validates initial URL only, requires `https:`, hostname exactly `lh3.googleusercontent.com`, empty username/password, and port `""` or `"443"`; fetches with `redirect: "error"`, aborts at five seconds, cancels on byte 1,048,577, requires normalized response `Content-Type` beginning `image/`, creates a Blob URL, and returns a disposer that calls `URL.revokeObjectURL` once. It never reads `response.url`. React renders initials from name then verified email, else generic glyph before async image success; `onError` disposes Blob and restores fallback.

- [ ] **Step 4: Run green**

Run: `pnpm vitest run tests/unit/drive-identity.test.ts tests/components/drive-identity.test.tsx`

Expected: PASS; every fallback leaves identity/sync usable.

- [ ] **Step 5: Stage and commit**

```bash
git add src/features/google-drive/avatar.ts src/features/google-drive/identity.ts tests/unit/drive-identity.test.ts tests/components/drive-identity.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "feat(drive): validate Google identity presentation"
```

### Task 4: Add exact Drive transport, pagination, concurrency cap, and CSP

**Files:**

- Create: `src/features/google-drive/transport.ts`
- Create: `build/csp.ts`
- Modify: `vite.config.ts:1-end`
- Modify: `index.html:5-12`
- Modify: `.env.example:1-end`
- Create: `tests/unit/drive-reconcile.test.ts`
- Create: `tests/unit/csp.test.ts`
- Create: `tests/e2e/drive-identity.spec.ts`
- Create: `tests/e2e/privacy.spec.ts`

- [ ] **Step 1: Add failing request/privacy tests**

Assert exact URLs/query/fields/methods. Candidate `files.list` always uses `spaces=appDataFolder`, `trashed=false`, `'appDataFolder' in parents`, and `appProperties has { key='whisdomTranscriptKey' and value='<validated-43-ASCII-remoteKey>' and visibility='PRIVATE' }`. Legacy discovery always uses `spaces=appDataFolder`, `trashed=false`, and `'appDataFolder' in parents`; it never uses the candidate property predicate because legacy files predate those properties. Both list paths fully paginate; rejected/invalid page tokens mark the pass invalid for caller restart; `incompleteSearch` invalidates partial results; max four media downloads; no body for list/get/delete; generated IDs request uses `count=1`, `space=appDataFolder`; IDs and metadata are bounded scalar-valid opaque values. `tests/unit/csp.test.ts` covers absent optional URLs, valid HTTPS origins, valid localhost/loopback HTTP origins with ports, duplicate-origin dedupe, path/query stripping to `URL.origin`, invalid URL, credentials, fragment-only/junk, non-HTTP(S), and non-local HTTP rejection. It builds the static Pages variant with both optional values absent. Inspect built CSP: no bare `https:`, `http:`, `ws:`, `wss:`, wildcard host, remote avatar in `img-src`, or undocumented Google origin.

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/unit/drive-reconcile.test.ts --testNamePattern="transport|pagination|four downloads"`

Expected: FAIL because bounded transport is absent.

- [ ] **Step 3: Add transport and exact CSP**

Transport methods are `generateFileId`, `listCandidatePage`, `listLegacyPage`, `getMetadata`, `download`, `createMultipart`, and `deletePermanently`. `listCandidatePage` emits exactly `spaces=appDataFolder`, `q=trashed=false and 'appDataFolder' in parents and appProperties has { key='whisdomTranscriptKey' and value='<validated-43-ASCII-remoteKey>' and visibility='PRIVATE' }`, explicit candidate fields, `pageSize=1000`, and an optional encoded `pageToken`; `listLegacyPage` emits exactly `spaces=appDataFolder`, `q=trashed=false and 'appDataFolder' in parents`, explicit legacy-discovery fields, `pageSize=1000`, and an optional encoded `pageToken`. No list request omits `trashed=false`, the app-data parent predicate, or (for candidate discovery) the private-property predicate. Every method obtains a fresh-enough credential from identity immediately before fetch, classifies 401/403 auth separately, parses only allowlisted response fields, and redacts IDs/tokens/body from errors. `mapConcurrent(items, 4, worker)` uses one shared cursor and exactly four or fewer workers; creates are not exposed through this pool.

Build list URLs from these exact code constants; fixtures compare decoded `q` values byte-for-byte and reject any missing predicate:

```ts
const CANDIDATE_LIST_QUERY = (remoteKey: string) =>
  `trashed = false and '${DRIVE_APP_DATA_SPACE}' in parents and appProperties has { key = '${DRIVE_PROPERTY_TRANSCRIPT_KEY}' and value = '${remoteKey}' and visibility = 'PRIVATE' }`
const LEGACY_LIST_QUERY = `trashed = false and '${DRIVE_APP_DATA_SPACE}' in parents`
```

`listCandidatePage` always uses `CANDIDATE_LIST_QUERY(validatedRemoteKey)`; `listLegacyPage` always uses `LEGACY_LIST_QUERY`. URL construction encodes the complete query once, encodes `pageToken` once when present, and keeps `spaces=appDataFolder`, explicit fields, and `pageSize=1000` on every page.

Create `build/csp.ts` with exact public API:

```ts
export interface CspEnvironment {
  VITE_CF_WORKER_URL?: string
  VITE_SERVER_URL?: string
}
export function optionalConnectOrigin(raw: string | undefined, name: keyof CspEnvironment): string | null
export function buildContentSecurityPolicy(environment: CspEnvironment): string
```

`optionalConnectOrigin` returns `null` only for missing/empty input. Otherwise parse with `new URL`; reject credentials; accept any exact `https:` origin; accept `http:` only when `hostname` is exactly `localhost`, `127.0.0.1`, or `[::1]`; reject every other protocol and non-local HTTP origin. Return only `url.origin`, preserving explicit port and dropping path/query/hash. `buildContentSecurityPolicy` starts from the fixed directives below, appends deduplicated optional origins to `connect-src` in `VITE_CF_WORKER_URL`, then `VITE_SERVER_URL` order, and emits no wildcard or scheme source.

`vite.config.ts` calls `loadEnv(mode, process.cwd(), "VITE_")`, builds CSP once, and registers an exact `transformIndexHtml` replacement of `__WHISDOM_CSP__`. Build fails on any configured invalid value; it never silently omits a malformed configured URL. `index.html` uses `content="__WHISDOM_CSP__"` and keeps GIS script exact.

The fixed built CSP before optional origins is:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="__WHISDOM_CSP__"
/>
```

The generated value is `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://accounts.google.com/gsi/client; script-src-elem 'self' 'unsafe-inline' https://accounts.google.com/gsi/client; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' blob: https://accounts.google.com https://openidconnect.googleapis.com https://www.googleapis.com https://lh3.googleusercontent.com<optional exact origins>; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self'`. Keep GIS script exactly `https://accounts.google.com/gsi/client`. `.env.example` documents the public OAuth client ID and both optional transcription URLs; tokens/expiry/secrets have no environment variable.

- [ ] **Step 4: Run green and browser privacy assertion**

Run:

```bash
pnpm vitest run tests/unit/drive-reconcile.test.ts tests/unit/csp.test.ts
pnpm build
pnpm playwright test tests/e2e/privacy.spec.ts --grep "PRIV-01 CSP" --reporter=list
```

Expected: PASS; observed download concurrency peak equals four; absent-value static Pages build succeeds; valid optional values add only their exact origins; invalid configured values fail closed.

- [ ] **Step 5: Checkpoint A review, gate, stage, commit**

Run:

```bash
pnpm vitest run tests/unit/drive-identity.test.ts tests/unit/drive-reconcile.test.ts
pnpm vitest run tests/components/drive-identity.test.tsx
pnpm playwright test tests/e2e/drive-identity.spec.ts --grep "GIS-01|GIS-02|GIS-03|GIS-04|GIS-05" --reporter=list
pnpm playwright test tests/e2e/privacy.spec.ts --grep "PRIV-01" --reporter=list
pnpm typecheck
rtk lint
pnpm lint
git add src/features/google-drive/transport.ts build/csp.ts vite.config.ts index.html .env.example tests/unit/csp.test.ts tests/unit/drive-reconcile.test.ts tests/e2e/privacy.spec.ts tests/e2e/drive-identity.spec.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(drive): add identity and bounded transport"
```

Expected: all commands exit 0; lint has zero warnings; staged paths match list; A review explicitly signs off gesture-only auth, memory-only expiry, exact UserInfo/account key, avatar lifecycle, granted scopes, revoke blast radius, different-account pause/preview/apply/disclosure and dirty-editor guard, max-four transport, CSP, and no privacy leak. Do not begin B on failure.

## Checkpoint B — durable outbound immutable publication

### Task 5: Pin candidate construction and all four digest domains

**Files:**

- Modify: `src/features/transcription/hashes.ts:1-end`
- Create: `tests/unit/drive-publication.test.ts`
- Modify: `tests/unit/schema-hashes.test.ts:1-end`

- [ ] **Step 1: Add DRV-02/DRV-04 hash failures**

Pin normative live/tombstone exact RFC 8785 full-envelope bytes and 43-character `candidateHash`; preserve existing lowercase accepted-payload digest fixtures. Add lone high/low/reversed surrogate instrumentation proving canonicalizer invocation count remains zero. Import and call the `rawBodyByteHash` function; assert outputs from `remoteKey(...)`, `candidateHash(...)`, `acceptedPayloadHash(...)`, and `rawBodyByteHash(...)` differ and cannot substitute for one another. Do not reference a nonexistent `bodyByteHash` symbol. Assert raw transcript ID occurs once inside envelope JSON and nowhere in filename/properties.

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/unit/schema-hashes.test.ts tests/unit/drive-publication.test.ts --testNamePattern="candidate|digest|surrogate"`

Expected: FAIL because complete-envelope candidate construction is absent.

- [ ] **Step 3: Add guarded construction**

`src/features/transcription/hashes.ts` owns the exact shared return type and function. No other file redeclares or ambiently supplies `DriveCandidateBody`:

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

export async function constructDriveCandidate(envelope: TranscriptEnvelope): Promise<DriveCandidateBody> {
  const validated = parseTranscriptEnvelope(envelope)
  const envelopeJson = canonicalizeValidatedEnvelope(validated)
  const remoteKey = await sha256Base64Url(validated.transcriptId)
  const candidateHash = await sha256Base64Url(envelopeJson)
  const acceptedHash = await acceptedPayloadHash(validated)
  const filename = `whisdom-transcript-${remoteKey}-${candidateHash}.json`
  return {
    envelope: validated,
    envelopeJson,
    remoteKey,
    candidateHash,
    acceptedPayloadHash: acceptedHash,
    filename,
    mimeType: DRIVE_MIME,
    appProperties: {
      [DRIVE_PROPERTY_TRANSCRIPT_KEY]: remoteKey,
      [DRIVE_PROPERTY_SCHEMA_VERSION]: DRIVE_SCHEMA_VERSION_VALUE,
      [DRIVE_PROPERTY_CANDIDATE_HASH]: candidateHash,
    },
  }
}
```

`canonicalizeValidatedEnvelope` accepts only parser-branded validated values; no overload accepts unknown input. Keep candidate, accepted-payload, remote-key, and raw-byte hash functions distinctly named.

`sha256Base64Url` is imported from the Phase 1B hash owner with exact signature `(input: string | Uint8Array) => Promise<string>`. `constructDriveCandidate` passes the validated transcript ID and canonical envelope JSON directly as strings; the helper performs their exact UTF-8 encoding. Tests retain the Phase 1 string/byte/subarray equivalence assertions and reject a local Phase 5 hash helper.

- [ ] **Step 4: Run green and adjacency**

Run: `pnpm vitest run tests/unit/schema-hashes.test.ts tests/unit/canonical.test.ts tests/unit/drive-publication.test.ts`

Expected: PASS; parser/editor/export/migration payload bytes remain identical.

- [ ] **Step 5: Stage and commit**

```bash
git add src/features/transcription/hashes.ts tests/unit/schema-hashes.test.ts tests/unit/drive-publication.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(drive): derive immutable candidate identities"
```

### Task 6: Make every local mutation atomically coalesce desired publication

**Files:**

- Modify: `src/features/storage/transcript-repository.ts:1-end`
- Modify: `src/features/storage/sync-repository.ts:1-end`
- Modify: `src/features/transcript-editor/autosave.ts:1-end`
- Modify: `src/features/library/actions.ts:1-end`
- Modify: `src/features/workbench/WorkbenchPage.tsx:1-end`
- Create: `src/features/google-drive/desired-publication.ts`
- Modify: `src/app/AppShell.tsx:1-end`
- Modify: `src/main.tsx:1-end`
- Modify: `tests/unit/canonical.test.ts:1-end`
- Modify: `tests/unit/drive-publication.test.ts:1-end`
- Modify: `tests/unit/database.test.ts:1-end`
- Modify: `tests/unit/editor-reducer.test.ts:1-end`
- Modify: `tests/components/transcript-editor.test.tsx:1-end`
- Modify: `tests/components/library.test.tsx:1-end`
- Modify: `tests/e2e/editor-save.spec.ts:1-end`

- [ ] **Step 1: Add atomicity/offline/auth-expired and draft-boundary failures**

For local, Cloudflare, server, canonical editor text/timing/title, Library rename, delete, observed Undo/Restore, and bulk clear, assert one guarded IndexedDB transaction writes transcript plus account-associated desired publication. Abort either write and assert neither commits. Pass stale expected transcript revision, stale expected draft editor revision, stale publication state, or mismatched attempt identity and assert the typed rejection writes nothing. Signed-out records save without pending account association. Offline/auth-expired records save locally, show Saved locally/Needs reconnect as applicable, and retain pending operation without calling Drive. New canonical local revision always updates `desiredCandidateHash` and exact `desiredEnvelopeJson`; only `unbound` may change which content will become attempted identity, while every frozen attempted field remains byte-for-byte unchanged in bound/creating/verifying/needs-attention. Delete creates fresh stable `deletionId`; restore copies only exact observed ID and greater revision; descendant live edits preserve it. Assert each coalesced row parses as exactly one master union variant: literal-null attempted fields for `unbound`, complete frozen attempted identity for every other variant, and non-null `lastErrorCode` for `needs-attention`. Factory tests switch the injected identity while candidate construction is pending and prove the result binds the identity snapshot read after candidate completion; signed-out/opening/revoking snapshots return null, while connected and Needs-reconnect-with-identity bind that exact `accountKey`. Source-contract tests reject construction of `PendingDesiredPublication` outside `desired-publication.ts`; `createAccountBoundDesiredPublicationFactory` is called only in `main.tsx`, and its returned `desiredPublicationFor` callback is invoked only in the named canonical Workbench-save, autosave-canonical, and Library mutation branches, never draft-only, transport, repository, or reconciliation code.

Add a separate draft matrix using bounded non-integer, negative, over-seven-day, reversed, and overlapping timing. `commitEditorDraftPayload()` must return `{ status: "needs-attention", draft, issues }`; autosave must call only `persistDraftOnly`; refresh must recover that draft. Assert no `transcripts`, canonical revision, canonical envelope/hash, `syncMetadata`, or `pendingOperations` write and no reconcile trigger. Correct the timing, require `CanonicalCommitResult.status === "canonical"`, then prove `commitCanonicalDraftAndCoalescePending` atomically writes the canonical transcript, clears/updates the draft under its expected editor revision, and enqueues the desired publication. No other editor path may construct `PendingDesiredPublication`; a draft-only result cannot call candidate construction, hash calculation, or any sync service trigger.

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/unit/canonical.test.ts tests/unit/database.test.ts tests/unit/editor-reducer.test.ts tests/unit/drive-publication.test.ts tests/components/transcript-editor.test.tsx tests/components/library.test.tsx --testNamePattern="atomic|account-bound|offline|expired|tombstone|restore|draft-only|canonical commit"`

Expected: FAIL on non-atomic or missing pending operation paths.

- [ ] **Step 3: Route canonical mutations through exact guarded repository operations**

`repositories.ts`, `transcript-repository.ts`, and `sync-repository.ts` import `PendingDesiredPublication`, all pending variants and transition inputs, `RemoteCandidate`, `DriveConnectionState`, `DriveSyncState`, and `SyncMetadata` only from `@/features/storage/sync-types`; they import no symbol from `@/features/google-drive/types`. `src/features/google-drive/desired-publication.ts` is the sole Phase 5 constructor boundary and exports exactly:

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

The returned function parses the supplied canonical `TranscriptEnvelope` through the existing exact schema parser, passes that validated envelope to existing `constructDriveCandidate`, then reads `getIdentitySnapshot()` after the awaited candidate construction. It returns null for signed-out/opening/revoking or Needs-reconnect without identity. For connected or Needs-reconnect with identity, it returns only:

```ts
const desiredPublication: PendingDesiredPublication = {
  accountKey: identity.accountKey,
  transcriptId: candidate.envelope.transcriptId,
  desiredCandidateHash: candidate.candidateHash,
  desiredEnvelopeJson: candidate.envelopeJson,
}
```

It returns no transport object, token, file ID, mutable candidate, alternate envelope, or compatibility alias. `constructDriveCandidate` remains the sole candidate/envelope serializer/hash owner and this factory never reconstructs protocol fields.

Use the master `AtomicMutationRepository` methods exactly: `mutateTranscriptAndCoalescePending`, `tombstoneTranscriptAndCoalescePending`, `restoreTranscriptAndCoalescePending`, `clearAsTombstones`, `commitCanonicalDraftAndCoalescePending`, `persistDraftOnly`, and `discardDraft`. Each canonical mutation receives its exact expected transcript/draft revision and performs one transaction over every affected transcript plus pending row. Existing `unbound` rows retain literal-null attempted fields while desired fields coalesce. Existing bound/creating/verifying/needs-attention rows retain `publicationState`, `generatedFileId`, `attemptedCandidateHash`, `attemptedEnvelopeJson`, `attemptedPayloadHash`, `attemptedFileName`, `attemptedMimeType`, and `attemptedPrivateProperties` exactly while only desired hash/JSON advance. No generic pending `put`, state overwrite, or partial transcript-only fallback exists.

```ts
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

export type RepositoryErrorCode =
  | "repository.stale-transcript-revision"
  | "repository.stale-draft-revision"
  | "repository.stale-publication-state"
  | "repository.attempt-identity-mismatch"
  | "repository.invalid-record"
```

`main.tsx` creates one `AccountBoundDesiredPublicationFactory` from the singleton identity client's `snapshot`, `parseTranscriptEnvelope`, and `constructDriveCandidate`, then injects the returned callback into `AppShell`; `AppShell` passes it as the existing Phase 4 `desiredPublicationFor` dependency of canonical Workbench-save, editor-autosave, and Library mutation controllers. Each controller first deterministically prepares the exact next live/tombstone/restore `TranscriptEnvelope` from its validated canonical mutation and observed revision/lineage, calls `desiredPublicationFor(nextEnvelope)`, then passes that returned value to the matching repository method in the same canonical mutation flow. Bulk clear calls it once per prepared tombstone and passes the resulting non-null list. No component render/event handler, draft-only branch, transport, reconcile path, or repository implementation imports or invokes the factory.

Editor autosave first calls `commitEditorDraftPayload(draft)`. For `needs-attention`, call only `persistDraftOnly({ draft, expectedDraftEditorRevision })`; never invoke `desiredPublicationFor`, build a canonical envelope/candidate, or touch transcript/hash/sync/pending state. For `canonical`, prepare the exact next envelope, invoke `desiredPublicationFor`, and call only `commitCanonicalDraftAndCoalescePending` with the returned payload/publication and exact expected transcript/draft revisions. Repository consumes the explicit account-bound desired publication; it never infers an account from email or ambient auth. UI/runtime/editor/library never call transport. Drive/auth failure is outside mutation transaction and cannot roll it back.

- [ ] **Step 4: Run green and all Phase 4 adjacency**

Run:

```bash
pnpm vitest run tests/unit/database.test.ts tests/unit/editor-reducer.test.ts tests/unit/library.test.ts tests/unit/drive-publication.test.ts
pnpm vitest run tests/components/transcript-editor.test.tsx tests/components/library.test.tsx tests/components/workbench.test.tsx
pnpm playwright test tests/e2e/editor-save.spec.ts tests/e2e/library.spec.ts --reporter=list
```

Expected: PASS; SAVE-01..03 and LIB-01 remain green; invalid/Needs-attention timing survives refresh as draft only; corrected canonical success alone increments revision/enqueues; local saves succeed under offline/auth-expired fixtures.

- [ ] **Step 5: Stage and commit**

```bash
git add src/features/google-drive/desired-publication.ts src/features/storage/transcript-repository.ts src/features/storage/sync-repository.ts src/features/transcript-editor/autosave.ts src/features/library/actions.ts src/features/workbench/WorkbenchPage.tsx src/app/AppShell.tsx src/main.tsx tests/unit/canonical.test.ts tests/unit/database.test.ts tests/unit/editor-reducer.test.ts tests/unit/drive-publication.test.ts tests/components/transcript-editor.test.tsx tests/components/library.test.tsx tests/e2e/editor-save.spec.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(drive): enqueue sync with local mutations"
```

### Task 7: Bind once, create immutably, and resolve ambiguity with same ID/body

**Files:**

- Create: `src/features/google-drive/publication.ts`
- Modify: `src/features/storage/sync-repository.ts:1-end`
- Modify: `tests/unit/drive-publication.test.ts:1-end`
- Create: `tests/components/drive-sync.test.tsx`

- [ ] **Step 1: Add DRV-06 state/identity/race failures**

Cover pre-bind desired coalescing; `files.generateIds` before create; `bindGeneratedAttempt` atomically freezes `generatedFileId`, `attemptedCandidateHash`, exact `attemptedEnvelopeJson`, `attemptedPayloadHash`, `attemptedFileName`, `attemptedMimeType`, `attemptedPrivateProperties`, and `bound`; transaction failure sends no create. Prove `transitionToCreating` commits before request and metadata `id` equals the frozen generated ID. Lost response and every network/408/429/5xx retry must use that same ID, exact media body, exact deterministic metadata JSON, boundary, and byte-identical multipart request. A 409 performs same-ID verification as two ordered requests: metadata GET with exact fields, then `alt=media` GET. Construct `PublishedCandidateReadback` and the exact `SameIdReadbackExpectation` from frozen attempt fields; invoke `verifyPublishedCandidate(readback, expected, dependencies)`. Tests independently mismatch ID, name, MIME, private properties, exact body bytes, candidate hash, and accepted-payload hash and require their exact failure codes with no receipt. Success returns only candidate plus receipt. Source scan requires `kind: "verified-publication"` construction only in this verifier's successful branch. Transient same-ID metadata/body 404 or unreadable response retries boundedly. Newer desired revision changes only desired hash/JSON. Exact verification plus stabilization removes the attempted operation; differing desired content creates a new literal-null `unbound` operation. Mismatch/retry exhaustion becomes Needs attention. No second ID and no duplicate physical growth.

For every repository method, test stale state, wrong generated ID, wrong attempted hash, malformed persisted variant, and interleaved desired update. Each must return `repository.stale-publication-state`, `repository.attempt-identity-mismatch`, or `repository.invalid-record` as applicable and leave all stores unchanged. Illegal transitions—unbound→creating, bound→verifying, creating→bound, verifying→creating, needs-attention automatic retry/rebind, and any mutation of frozen identity—must be impossible through public types or rejected atomically at runtime.

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/unit/drive-publication.test.ts --testNamePattern="DRV-06"`

Expected: FAIL because publication coordinator is absent.

- [ ] **Step 3: Add publication protocol through exact guarded methods**

`PendingOperationRepository` exposes exactly:

```ts
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
```

No public `put`, generic transition, retry reset, or rebind method exists. Public coordinator methods are `publish(operation)`, `verifySameId(operation)`, and `recoverAmbiguous(operation)`. Exact sequence:

1. Reload operation; stop if ineligible or absent from the resolved desired set. `needs-attention` never retries automatically.
2. If `unbound`, generate one ID, parse/reconstruct desired envelope, verify desired hash/JSON and all request metadata, then call `bindGeneratedAttempt` with `expectedState: "unbound"` and `expectedDesiredCandidateHash`. A stale result restarts from reload; it never sends.
3. Reload the returned/current `BoundPendingOperation`. Build deterministic multipart only from its readonly `FrozenPendingAttempt`; never reparse current transcript or regenerate attempted JSON/metadata.
4. Call `transitionToCreating` with exact expected state, generated ID, and attempted hash. POST only after success.
5. On 2xx or before 409/ambiguous recovery verification, call `transitionToVerifying` from exact `creating`. Perform `getMetadata(generatedFileId)` first with fields `id,name,mimeType,appProperties,size,version`; only after valid transport parsing, perform `download(generatedFileId)` using `alt=media`. Adapt `appProperties` to `DriveFileMetadata.privateProperties`, attach the bounded local observation time as `receivedAt`, and construct `{ metadata, bodyResponse } satisfies PublishedCandidateReadback`. Construct `SameIdReadbackExpectation` with the exact frozen `generatedFileId`, `attemptedFileName`, `attemptedMimeType`, `attemptedPrivateProperties`, `attemptedCandidateHash`, `attemptedEnvelopeJson`, and `expectedAcceptedPayloadHash: attemptedPayloadHash`. Call `verifyPublishedCandidate(readback, expected, dependencies)` with the master signature. It verifies ID → name → MIME → exact properties → bounded exact body → candidate hash → accepted-payload hash. Success returns exactly `{ candidate, receipt }`; the receipt is `kind: "verified-publication"` with generated ID, candidate hash, accepted-payload hash, exact body hash, and injected bounded verification time. Failure returns one of the exact ID/name/MIME/properties/body/candidateHash/payloadHash mismatch codes and no receipt. `parseRemoteCandidate` never performs this check.
6. On network/408/429/5xx or post-ambiguous 404/unreadable, apply base-1-second doubling capped at 60 seconds plus injected 0..25% jitter and restart from the persisted same attempt. Every publication retry reuses `generatedFileId` and byte-for-byte multipart bytes derived from the exact frozen body/metadata; stop after seven failures.
7. Do not remove pending state on readback alone. Keep the attempt `verifying` through candidate-set stabilization. Only a successful `verifyPublishedCandidate` result whose candidate remains the stabilized winner may call `finalizeStabilizedWinner({ accountKey, transcriptId, expectedState: "verifying", receipt, stabilizedWinner: candidate, informationalDriveVersion })`; only that transaction may mark synced or remove pending. The caller passes no duplicate generated-file, attempted-hash, confirmed-file, or confirmed-hash strings. A parsed candidate, body match without hash verification, missing/mismatched receipt, or unstable observation never changes synced state.
8. On any same-ID mismatch or exhausted ambiguity, call `markNeedsAttention` with exact expected state/ID/hash; retain every frozen and desired field; never rebind.

Deterministic multipart builder returns `Uint8Array`, not a newly stringified user object. Test stores first bytes and compares every retry byte-for-byte, including retries after process reload. `attemptedFileName` and `attemptedPrivateProperties` are the only accepted field names.

Implement the verifier in `publication.ts` with this exact public signature and result construction; `sameBytes` performs length plus byte-for-byte equality, and `samePrivateProperties` compares exact own-key sets and string values without coercion:

```ts
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

`readbackFailure(code)` returns exactly `{ ok: false, error: { code, detail: code } }`; it never includes a Drive ID, body, metadata value, or parser exception. No overload accepts a bare `Response`.

- [ ] **Step 4: Run green and presentation adjacency**

Run: `pnpm vitest run tests/unit/drive-publication.test.ts tests/components/drive-sync.test.tsx`

Expected: PASS; bound ambiguity displays Syncing; mismatch displays one localized Needs attention action; no Drive ID is visible.

- [ ] **Step 5: Stage and commit**

```bash
git add src/features/google-drive/publication.ts src/features/storage/sync-repository.ts tests/unit/drive-publication.test.ts tests/components/drive-sync.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "feat(drive): publish retry-safe immutable candidates"
```

### Task 8: Migrate strict bounded legacy Drive documents

**Files:**

- Create: `src/features/google-drive/legacy-migration.ts`
- Modify: `tests/unit/drive-publication.test.ts:1-end`
- Create: `tests/e2e/drive-sync.spec.ts`

- [ ] **Step 1: Add DRV-05 failing fixtures**

Test exact old top-level/segment allowlists, strict remote timing and segment IDs, scalar-before-bound/hash, distinct exact ISO `createdAt` and `updatedAt`, missing/wrong-type/malformed/out-of-range `updatedAt`, unknown/missing fields, exact legacy `text` validation against canonical segment derivation or bounded zero-segment synthesis, 25 MiB intake, 16 KiB remote ID intake, canonical upload only for IDs through 512 UTF-8 bytes, 513-byte through 16 KiB metadata-only quarantine, over-16-KiB invalid disposition, zero-segment 1 MiB and segment/joined limits, no repair/truncation/partial import, invalid old-file retention, and at most 20 verified old-file deletes. Migration conversion tests require envelope `updatedAt` to equal validated legacy `updatedAt`, payload `createdAt` to equal validated legacy `createdAt`, payload `text`/segments to equal parser output, revision `0`, generated device ID, and null deletion lineage; current time and `createdAt` must never replace envelope update time.

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/unit/drive-publication.test.ts --testNamePattern="DRV-05"`

Expected: FAIL because legacy migration is absent.

- [ ] **Step 3: Add strict migration sequence**

Paginate bounded legacy discovery with the exact query `trashed = false and 'appDataFolder' in parents` (plus `spaces=appDataFolder`, explicit fields, and complete page-token handling); legacy discovery does not add the schema-2 private-property predicate because legacy files do not have it. For each legacy response, capture bounded local observation timestamp `receivedAt`, call `readRemoteBody({response,fileId,privateProperties,receivedAt,fileName,mimeType}, limits)`, then call `parseLegacyDriveDocument(raw, legacyDependencies)` directly. Legacy migration never calls `parseRemoteCandidate` first and never sends a legacy body through schema-2 validation. Reconcile persists the strict legacy result or quarantine metadata. Invalid bodies store only exact remote quarantine metadata. Canonical target maps parsed `transcriptId` to envelope identity, parsed `updatedAt` to envelope update time, parsed title/source/language/model/mode/createdAt/text/segments to payload, revision to `0`, generated device ID to `deviceId`, and all deletion lineage to `null`. It publishes through Task 7, verifies exact-ID body/name/MIME/properties and candidate persistence, then marks old file cleanup-eligible. Delete only that positively validated old file; limit 20 per reconcile. Never delete invalid, unverified, oversized, or merely absent files.

- [ ] **Step 4: Run green**

Run:

```bash
pnpm vitest run tests/unit/drive-publication.test.ts
pnpm playwright test tests/e2e/drive-sync.spec.ts --grep "DRV-05" --reporter=list
```

Expected: PASS; 512-byte fixture migrates; 513-byte fixture quarantines metadata and old file remains.

- [ ] **Step 5: Checkpoint B review, gate, stage, commit**

```bash
pnpm vitest run tests/unit/schema-hashes.test.ts tests/unit/database.test.ts tests/unit/drive-publication.test.ts
pnpm vitest run tests/components/transcript-editor.test.tsx tests/components/library.test.tsx tests/components/drive-sync.test.tsx
pnpm playwright test tests/e2e/editor-save.spec.ts tests/e2e/library.spec.ts tests/e2e/drive-sync.spec.ts --grep "DRV-05|DRV-06|SAVE-|LIB-01" --reporter=list
pnpm typecheck
rtk lint
pnpm lint
git add src/features/google-drive/legacy-migration.ts tests/unit/drive-publication.test.ts tests/e2e/drive-sync.spec.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(drive): migrate bounded legacy transcripts"
```

Expected: all exit 0; B review signs off exact master `TranscriptEnvelope`/`PendingOperation`, scalar-guarded RFC 8785, four digest domains, atomic all-path mutation, local offline/auth-expired saves, generated-ID same-body retry, 409 verification, desired race, tombstone lineage, and strict migration. Do not begin C on failure.

## Checkpoint C — inbound reconciliation, convergence, and service integration

### Task 9: Stream-cap, fingerprint, strictly parse, and quarantine remote bodies

**Files:**

- Create: `src/features/google-drive/parser.ts`
- Modify: `src/features/storage/sync-repository.ts:1-end`
- Create: `tests/unit/drive-parser.test.ts`

- [ ] **Step 1: Add DRV-04 parser/type TDD**

Import `RemoteBodySource`, `RemoteCandidateParseErrorCode`, `RemoteCandidateParseError`, `RemoteCandidateParseResult`, `RawRemoteBody`, `RawRemoteBodyResult`, `RemoteBodyLimits`, `PureParserDependencies`, `LegacyDriveDocumentParseResult`, `LegacyParserDependencies`, `DriveFileMetadata`, `PublishedCandidateReadback`, `SameIdReadbackExpectation`, `ReadbackVerifierDependencies`, and `ReadbackVerificationResult` from `src/features/google-drive/types.ts`. Import `RemoteCandidate`, `VerifiedPublicationReceipt`, and `DriveAppProperties` from `src/features/storage/sync-types.ts` where needed. Do not create a local error union, interface, result type, alias, or second parser/verifier signature. `parser.ts` implements the exact `parseRemoteCandidate(raw: RawRemoteBody, dependencies: PureParserDependencies): Promise<RemoteCandidateParseResult>` and `parseLegacyDriveDocument(raw: RawRemoteBody, dependencies: LegacyParserDependencies): Promise<LegacyDriveDocumentParseResult>` signatures. `publication.ts` implements the exact master `verifyPublishedCandidate(readback: PublishedCandidateReadback, expected: SameIdReadbackExpectation, dependencies: ReadbackVerifierDependencies): Promise<ReadbackVerificationResult>` signature.

Import the master-owned raw-body declarations. `parser.ts` adds only the implementation of `readRemoteBody`; it does not redeclare any parser result/error/helper type:

```ts
export function readRemoteBody(
  source: RemoteBodySource,
  limits: RemoteBodyLimits,
): Promise<RawRemoteBodyResult>
```

Transport/reconcile and publication readback callers must pass `receivedAt` explicitly in every `RemoteBodySource`, including legacy discovery. Parser tests use a source observation timestamp distinct from envelope `updatedAt`, legacy timestamps, and execution time; they require `RawRemoteBodyResult.receivedAt` and parsed `candidate.receivedAt` to equal the source value exactly. Missing, non-safe-integer, or out-of-epoch-range observation timestamps reject before body parsing.

Every caller constructs the executable source as `{ response, fileId, privateProperties, receivedAt, fileName?, mimeType? }`. `receivedAt` is the bounded local observation timestamp captured by transport/reconciliation, not Drive metadata or envelope time. `readRemoteBody(source, limits)` preserves it in success/failure results and solely owns metadata projection, bounded byte reading, overflow cancellation, full/prefix raw hash, and fatal UTF-8 decoding. Success returns `bodyText`; `remote.invalid-utf8` returns before JSON/schema work. `parseRemoteCandidate` and `parseLegacyDriveDocument` consume only decoded `bodyText`, call `JSON.parse` once, and map schema/legacy validation errors; they never decode or raw-hash again. Publication readback uses this same function and compares `TextEncoder().encode(bodyText)` with attempted bytes.

Test type narrowing for every discriminant and compile-time rejection of an error object with a missing quarantine disposition, a `bodyHashScope`/`sizeAtLeast` mismatch, a supplied body, or a second parser error shape. Runtime matrix must cover every exact failure code and prove each invalid result has only the `RemoteQuarantineMetadata` allowlist. Test `readRemoteBody(source, limits)`, `parseRemoteCandidate(raw, dependencies)`, and `parseLegacyDriveDocument(raw, dependencies)` with injected pure dependencies, and prove no dependency or parser path receives a repository or writes persistence. Legacy parser rows cover validated `updatedAt` and `text`, every invalid update timestamp, text derivation mismatch, and exact migration envelope conversion. Add verifier fixtures for ordered metadata GET plus `alt=media` GET, exact body bytes, candidate hash, accepted-payload hash, response ID, filename, MIME, private properties, and bounded injected verification time; each isolated mismatch maps to the shared `ReadbackVerificationResult` failure discriminant and returns no receipt. Success must return exactly the validated `RemoteCandidate` plus `VerifiedPublicationReceipt`; compile-time assertions reject old parallel `candidateHash`, `acceptedPayloadHash`, `bodyByteHash`, or `envelopeJson` success fields.

Cover complete bodies of 0 through 25 MiB with full raw hash; byte 26,214,401 cancels intake, returns no body/overflow byte, hashes exactly the retained first 25 MiB, and returns `prefix-25MiB` plus fixed sentinel; only reader/allocation/one-shot digest infrastructure failure omits hash and stores bounded reason. Spy on `crypto.subtle.digest`: every complete or overflow result makes exactly one `SHA-256` call after bounded intake, receives exactly the full retained bytes or 25 MiB prefix, and no production object exposes `update`, `final`, or another streaming-digest API. Test strict UTF-8 before JSON; exact object/field/type/null/enum/schema/timestamp/timing/lineage/segment uniqueness/order/text derivation/bounds; escaped lone high/low/reversed surrogates retain full raw hash but call canonicalizer zero times; valid pairs pass scalar/UTF-8 edges. Recompute exact remoteKey, candidateHash, accepted hash, name, MIME, and all properties. Invalid data never enters transcripts/conflicts and stores no body/fragment.

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/unit/drive-parser.test.ts`

Expected: FAIL because streamed parser is absent.

- [ ] **Step 3: Implement the complete one-way intake pipeline**

Implement `readRemoteBody(source, limits)` with one reader from `source.response.body` and bounded chunk accumulation only; Web Crypto has no incremental digest state. Project bounded `contentType`, `fileId`, `privateProperties`, `fileName`, and `mimeType` into the result. A null body returns `boundedBytes: new Uint8Array(0)`, `byteHash: null`, `bodyText: null`, and `failureCode: "remote.body-read-failed"`. For each chunk, require `Uint8Array`, copy only bytes through `limits.maxBytes` into retained chunks, track checked cumulative length, and inspect at most the first byte beyond the cap. On overflow, call `reader.cancel()`, concatenate exactly the retained `limits.maxBytes` prefix once, call transcription-hash-owner `rawBodyByteHash(prefix)` once (its implementation is one `crypto.subtle.digest("SHA-256", prefix)`), then return `boundedBytes: new Uint8Array(0)`, that prefix `byteHash`, `bodyText: null`, and `failureCode: "remote.body-too-large"`; neither prefix nor overflow byte survives in the result. On normal completion, concatenate the at-most-25-MiB body once, call `rawBodyByteHash(fullBytes)` once before decode, fatal-decode once, and return the same full bytes/hash plus `bodyText`; fatal decode returns empty `boundedBytes`, the already-computed full hash, null text, and `remote.invalid-utf8`. On reader, chunk, allocation, or digest failure, cancel/close best effort, retain no body, and return `remote.body-read-failed` with `byteHash:null`; never expose a partial hash. `parser.ts` imports `rawBodyByteHash` from `@/features/transcription/hashes`; it declares no hash class/state/helper and uses no unsupported `SubtleCrypto` streaming API.

Implement `parseRemoteCandidate(raw, dependencies)` as this exact ordered pipeline:

1. Require a successful `RawRemoteBody` from `readRemoteBody`; failure results are converted to bounded quarantine by the caller before this function. The raw object already contains bounded bytes, byte hash, content type, file ID, and private properties; this function performs no I/O or persistence.
2. Require `raw.bodyText`; the body reader already performed the sole fatal UTF-8 decode. Intake `remote.invalid-utf8` maps directly to quarantine without `JSON.parse`, canonicalization, or schema parsing.
3. Call `JSON.parse(raw.bodyText)` exactly once. Map syntax failure or a non-JSON value to `remote.invalid-json`. Pass the parsed value to `dependencies.parseTranscriptEnvelope(value)` exact allowlist parser. Map every type, unknown/missing-field, scalar, bound, enum, timing, lineage, segment, derived-text, schema-version, and canonical-value rejection to `remote.invalid-envelope`. Never repair or partially import remote input.
4. Call `dependencies.serializeTranscriptEnvelope(envelope)`, `remoteKey(envelope.transcriptId)`, `candidateHash(envelope)`, and `acceptedPayloadHash(envelope)` exactly once each. Compute accepted-payload hash for the candidate value, but do not compare it and do not emit `remote.payload-hash-mismatch`. Compare only schema-2 candidate identity and metadata owned by this parser: wrong remote key maps to `remote.remote-key-mismatch`; wrong candidate hash maps to `remote.candidate-hash-mismatch`; wrong exact filename, MIME, or private properties maps to its corresponding parser error. Same-ID readback compares accepted-payload hash, exact body, and exact properties through the publication verifier and emits `remote.payload-hash-mismatch` there.
5. Construct the exact `ObservedRemoteCandidate` using the validated envelope, exact canonical `envelopeJson`, supplied metadata, deterministic account-neutral candidate identity, and `raw.receivedAt`. Set `candidate.receivedAt` exactly to `raw.receivedAt`; parser dependencies expose no clock. It contains no account key or Drive ID inside `candidate`. Return it without persistence.
6. Every failure returns `{ ok: false, error: { code, quarantine } }`, never throws raw parse details, and never calls a repository or `putRemoteQuarantine` with body bytes, decoded text, parsed fragments, canonical payload hash, token, authorization header, source media, settings, or provider response text. A valid candidate discards the quarantine-only raw fingerprint. Reconciliation owns all candidate/quarantine persistence and candidate-first merge; no parser path may write `Synced`, remove a pending operation, bind an ID, mutate frozen attempted fields, or write any store.

Implement `parseLegacyDriveDocument(raw, dependencies)` as a separate strict path in the same `parser.ts`. It parses already-decoded bounded legacy JSON from `raw.bodyText`, requires the exact top-level allowlist `{id,title,sourceName,language,modelId,mode,createdAt,updatedAt,text,segments}`, applies scalar checks, independently validates both exact bounded ISO timestamps, validates legacy `text`, performs strict remote seconds-to-milliseconds conversion, checks segment-ID uniqueness/order, normalizes text, applies zero-segment synthesis, and enforces individual/aggregate UTF-8 limits. It returns only a bounded validated `LegacyDriveDocument` intermediate with `transcriptId`, `createdAt`, `updatedAt`, canonical `text`, and canonical segments, not a `TranscriptEnvelope`. It rejects every invalid timing, ID, scalar, timestamp, text derivation, field, lineage, or size condition; it never decodes again, repairs, clamps, truncates, derives a schema-2 candidate hash, or calls `parseRemoteCandidate`. The migration caller constructs the canonical schema-2 envelope from every intermediate field, then computes candidate and accepted-payload hashes and publishes only after strict success.

- [ ] **Step 4: Run green and hash adjacency**

Run: `pnpm vitest run tests/unit/drive-parser.test.ts tests/unit/schema-hashes.test.ts tests/unit/legacy-migration.test.ts`

Expected: PASS; exact boundary and malformed-scalar canonicalizer counters match.

- [ ] **Step 5: Stage and commit**

```bash
git add src/features/google-drive/parser.ts src/features/storage/sync-repository.ts tests/unit/drive-parser.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(drive): quarantine bounded remote candidates"
```

### Task 10: Resolve candidate sets as a pure permutation-invariant function

**Files:**

- Create: `src/features/google-drive/resolver.ts`
- Create: `tests/unit/drive-resolver.test.ts`

- [ ] **Step 1: Add DRV-03 exhaustive permutation tests**

Generate every permutation for live races, physical duplicates, multiple deletion IDs, competing tombstones, matching/nonmatching restores, equal revisions/times/devices/hash ties, and `T1(d1,rev5)`, live restore `d1 rev6`, `T2(d2,rev4)`. Assert lowest file ID only represents identical candidateHash; regular maximum uses revision → updatedAt → ASCII deviceId → lowercase accepted hash; dominant tombstone is regular maximum tombstone; restore requires exact dominant deletion ID and greater revision; every distinct loser remains. Assert Drive file ID/version/modifiedTime/pagination/download order never changes winner. Cover next revision overflow and cleanup/prune guard matrix.

Add exact `nextRevision` rows: `0 → 1`, `Number.MAX_SAFE_INTEGER - 1 → Number.MAX_SAFE_INTEGER`; `-1`, `1.5`, `NaN`, and unsafe integers throw `RevisionAdvanceIssue` with `code:"resolver.invalid-revision"` and exact `current`; `Number.MAX_SAFE_INTEGER` throws the same exported class with `code:"resolver.revision-overflow"`. Add a restore-resolution case whose dominant tombstone revision is `Number.MAX_SAFE_INTEGER` and assert `resolveCandidateSet` surfaces that typed overflow issue, proving it calls `nextRevision` rather than direct arithmetic.

The test imports the public names directly: `import { RevisionAdvanceIssue, nextRevision, resolveCandidateSet } from "@/features/google-drive/resolver"`. No test-local helper, ambient declaration, or alternate neutral owner supplies them.

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/unit/drive-resolver.test.ts`

Expected: FAIL because resolver is absent.

- [ ] **Step 3: Add pure resolver**

```ts
export function compareRegularOrder(left: RemoteCandidate, right: RemoteCandidate): -1 | 0 | 1 {
  const fields: Array<[number | string, number | string]> = [
    [left.revision, right.revision],
    [left.updatedAt, right.updatedAt],
    [left.deviceId, right.deviceId],
    [left.acceptedPayloadHash, right.acceptedPayloadHash],
  ]
  for (const [a, b] of fields) {
    if (a < b) return -1
    if (a > b) return 1
  }
  return 0
}

export function isRestoreEligible(live: RemoteCandidate, tombstone: RemoteCandidate): boolean {
  const minimumRestoreRevision = nextRevision(tombstone.revision)
  return live.deletedAt === null
    && tombstone.deletedAt !== null
    && live.restoredFromDeletionId === tombstone.deletionId
    && live.revision >= minimumRestoreRevision
}

export type RevisionAdvanceIssueCode =
  | "resolver.invalid-revision"
  | "resolver.revision-overflow"

export class RevisionAdvanceIssue extends RangeError {
  constructor(
    readonly code: RevisionAdvanceIssueCode,
    readonly current: number,
  ) {
    super(`${code}:${current}`)
    this.name = "RevisionAdvanceIssue"
  }
}

export function nextRevision(current: number): number {
  if (!Number.isSafeInteger(current) || current < 0) {
    throw new RevisionAdvanceIssue("resolver.invalid-revision", current)
  }
  if (current === Number.MAX_SAFE_INTEGER) {
    throw new RevisionAdvanceIssue("resolver.revision-overflow", current)
  }
  return current + 1
}
```

`resolveCandidateSet` groups by candidateHash, picks lexicographically lowest file ID representative per group, finds regular maximum tombstone, then exact eligible live maximum or tombstone; with no tombstone picks live maximum. Losers contain every other distinct candidate in deterministic regular-order-plus-candidateHash order. `nextRevision` is the sole revision-advance helper and rejects invalid/overflow input through `RevisionAdvanceIssue`; restore eligibility calls it. Remote cleanup permits only duplicate physical copies after retaining one verified copy or strictly lower-revision same-device live candidates. Local prune additionally rejects any draft/UI/restore/pending/verification reference. Tombstones, same-revision divergence, cross-device candidates, and unresolved visible conflicts are never prunable.

- [ ] **Step 4: Run green**

Run: `pnpm vitest run tests/unit/drive-resolver.test.ts`

Expected: PASS for all generated permutations and guard cases.

- [ ] **Step 5: Stage and commit**

```bash
git add src/features/google-drive/resolver.ts tests/unit/drive-resolver.test.ts
git diff --cached --name-only
git diff --cached
git commit -m "feat(drive): resolve immutable candidate sets"
```

### Task 11: Reconcile non-snapshot observations and stabilize before Synced

**Files:**

- Create: `src/features/google-drive/reconcile.ts`
- Modify: `src/features/storage/sync-repository.ts:1-end`
- Modify: `tests/unit/drive-reconcile.test.ts`
- Modify: `tests/components/drive-sync.test.tsx`

- [ ] **Step 1: Add DRV-01/DRV-02 stabilization and atomic-finalization races**

Fixtures insert candidates before first page, between pages, after final page, during readback, and between stabilization passes. Assert complete pagination, invalid token full-pass restart, incomplete-search partial discard, initial/readback/post-create union, four concurrent downloads, creates serialized per transcript, and concurrent clients' distinct candidates both survive. Require two consecutive identical sorted `(fileId,candidateHash)` sets with no intervening local create and at most four complete passes. Unstable fourth pass retains the exact pending variant/Syncing, schedules backoff, performs zero cleanup, and never marks last-success/Synced. Later candidate reopens reconciliation.

Inject a failure after candidate put but before transcript/metadata/pending writes and prove `persistIncomingCandidateFirstAndMerge` aborts all writes. Test stale expected transcript revision and pending state reject without writes. Its `IncomingMergeSyncMetadata` must fail to type-check with `itemState: "synced"`. For `finalizeStabilizedWinner`, compile-time reject missing receipt and old duplicate identity strings; at runtime independently mismatch receipt discriminant, generated ID, candidate hash, accepted-payload hash, exact body hash, verified-time bounds, and stabilized candidate. Each rejects atomically and leaves pending plus metadata unchanged. Prove exact success derives confirmation metadata only from the receipt, removes the matching verifying attempt, and either returns `replacement: null` or installs a new literal-null `UnboundPendingOperation` containing the latest desired hash/JSON. Prove no independent metadata API can write Synced.

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/unit/drive-reconcile.test.ts --testNamePattern="DRV-01|DRV-02|stabilization"`

Expected: FAIL because reconcile coordinator is absent.

- [ ] **Step 3: Add reconciliation through exact candidate-first and stabilized-finalization transactions**

Expose only these reconciliation writes:

```ts
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
```

One run validates account/scopes/freshness; performs complete initial pass before create; downloads unknown/current-pending candidates through cap-four pool; captures bounded local observation timestamp `receivedAt`, calls `readRemoteBody({response,fileId,privateProperties,receivedAt,fileName,mimeType}, limits)`, then pure `parseRemoteCandidate(raw, dependencies)` for each generated schema-2 body. It consumes the exact Phase 1B APIs: valid results call `repositories.candidates.put(value.candidate)`, reads use `candidates.get(candidateId)`/`candidates.list(transcriptId)`, and cleanup uses `candidates.delete(candidateId)` only after prune eligibility; invalid results are wrapped as `RemoteQuarantineRecord` and call `repositories.remoteQuarantine.put(record)`, review uses `get`/`list`, and explicit cleanup uses `delete`. Parser code never persists. Remote quarantine is distinct from `repositories.migrationQuarantine`, which reconciliation never writes. Then resolve the accumulated set; cancel/supersede only losing `unbound` operations; process each transcript's bound/create sequence serially; union exact readback and every later complete pass. Legacy discovery uses the same body source then calls `parseLegacyDriveDocument(raw, legacyDependencies)` directly and never invokes the schema-2 parser. A stability signature is sorted JSON of exact `[fileId,candidateHash]` pairs. Reset consecutive count after local create. Stop after four complete post-create passes.

`persistIncomingCandidateFirstAndMerge` consumes Phase 1B's exact signature, including `remoteQuarantineCandidateIds`. It opens one guarded transaction, puts the immutable account-neutral candidate first, then applies winner/transcript, non-Synced metadata, expected pending disposition, loser/conflict references, and deletes only supplied already-durable remote-quarantine rows by `candidateId`. Any failed later request aborts candidate put and quarantine deletion. It rejects stale transcript revision or pending state; it cannot accept Synced metadata. Candidate association remains in sync metadata only; candidate records never gain account keys or Drive file IDs. Neither persistence path stores response bytes, decoded text, parsed fragments, or parser dependencies.

Before incoming apply, run the existing dirty-editor guard. If editor state contains invalid/Needs-attention timing, persist it only with `persistDraftOnly`; never convert it into a transcript, canonical hash, or pending operation. Preserve the incoming candidate durably and stage conflict/Needs attention without overwriting the canonical transcript. If the dirty draft commits canonically, serialize that save first through `commitCanonicalDraftAndCoalescePending`, reload durable transcript/pending state, re-resolve, then call the candidate-first merge with fresh expected values. Only `CanonicalCommitResult.status === "canonical"` may alter canonical state or enqueue.

After exact same-ID verification and stabilized-set resolution, call `finalizeStabilizedWinner` with exact expected verifying state, the verifier-returned receipt, the stabilized candidate, and informational version only. It validates receipt discriminant/time, matches receipt generated ID and candidate/payload hashes to the frozen verifying attempt, recomputes `exactBodyHash` from frozen attempted-envelope UTF-8 bytes, and requires the stabilized candidate's candidate and accepted-payload hashes to match the receipt. It derives `confirmedFileId` and `confirmedCandidateHash` from the receipt; callers supply no duplicate identity strings. It alone may write `SyncMetadata.itemState = "synced"`. In one transaction it writes the complete exact metadata shape—`accountKey`, `transcriptId`, `remoteKey`, `confirmedCandidateHash`, `confirmedFileId`, `informationalDriveVersion`, `itemState`, and `lastErrorCode`—and removes the matching pending attempt. When desired differs from attempted, that transaction installs one new `UnboundPendingOperation` through `createUnboundPendingOperation`, preserving current `accountKey`, `transcriptId`, `desiredCandidateHash`, and exact `desiredEnvelopeJson`; it sets `retryCount: 0`, `nextAttemptAt` to the repository's injected transaction time, `lastErrorCode: null`, and every generated/attempted field to literal `null`. No independent `SyncMetadataRepository.put`, pending delete, item-state setter, or replacement constructor exists. Last successful reconcile updates only after every operation finishes or is durably classified.

Cleanup runs only after stability and only over positively observed, downloaded, strictly validated IDs. Cap 20. On cleanup 404, relist/re-resolve; infer nothing from absence. Permanent tombstones and causal JSON remain. Auxiliary retry/error metadata alone may compact after 180 days following confirmed reconcile, with no pending operation and neither signed-out nor auth-paused.

- [ ] **Step 4: Run green and component state adjacency**

Run: `pnpm vitest run tests/unit/drive-reconcile.test.ts tests/components/drive-sync.test.tsx`

Expected: PASS; unstable UI says Syncing, stable verified winner says Synced, conflicts/losers persist, no file ID renders.

- [ ] **Step 5: Stage and commit**

```bash
git add src/features/google-drive/reconcile.ts src/features/storage/sync-repository.ts tests/unit/drive-reconcile.test.ts tests/components/drive-sync.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "feat(drive): reconcile non-snapshot candidate sets"
```

### Task 12: Add coalescing sync service and account-switch/dirty-editor controls

**Files:**

- Create: `src/features/google-drive/sync-service.ts`
- Modify: `src/components/product/AppHeader.tsx:1-end`
- Modify: `src/features/library/LibraryPage.tsx:1-end`
- Modify: `src/features/transcript-editor/TranscriptPage.tsx:1-end`
- Modify: `src/app/AppShell.tsx:1-end`
- Modify: `src/main.tsx:1-end`
- Modify: `src/features/google-drive/drive.ts:1-102`
- Modify: `tests/components/drive-identity.test.tsx`
- Modify: `tests/components/drive-sync.test.tsx`

- [ ] **Step 1: Add GIS-05/service trigger failures**

Assert one immutable `useSyncExternalStore` snapshot; triggers on sign-in/local mutation/online/focus older than one minute/five-minute foreground interval/manual; triggers while active set one rerun flag; hidden document pauses interval; offline pauses without dropping queue; auth margin pauses and never requests token. Different-account connection starts paused and offers exactly Cancel, Reconcile without upload, Sync local transcripts to new account. Preview may download/validate/stage but cannot apply/upload; Apply requires explicit confirmation and dirty-editor save protection; local upload requires separate transcript-JSON/not-media-or-settings disclosure confirmation.

- [ ] **Step 2: Run red**

Run: `pnpm vitest run tests/components/drive-identity.test.tsx tests/components/drive-sync.test.tsx --testNamePattern="GIS-05|trigger|offline|dirty"`

Expected: FAIL because service/UI integration is absent.

- [ ] **Step 3: Add external service and UI integration**

`src/features/google-drive/sync-service.ts` is the sole implementation owner and exports this complete public factory contract; `DriveSyncService` remains owned by `google-drive/types.ts`:

```ts
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
```

`createDriveSyncService` owns the immutable snapshot, listener set, active/rerun flags, online/focus/visibility/five-minute interval wiring, gesture methods, account-switch delegation, and disposal. It uses only `dependencies.identity` for gesture/credential state and only `dependencies.reconcile(trigger)` to execute synchronization; it performs no fetch, candidate parsing, repository write, or transport construction itself.

`requestReconcile` is synchronous and coalesces; active run sets `rerunRequested`; completion runs once more if requested. `online`, focus, interval, and local mutation call reconciliation only with a usable current credential; they never call GIS. `connectFromGesture`, `reconnectFromGesture`, and `syncNowFromGesture` are the only token-request entry points. `signOut` clears credentials, listeners remain safe, local data/pending/tombstones/conflicts remain. `dispose` removes timers/window/document listeners and invalidates active callbacks.

`src/main.tsx` is the sole production composition call site. It opens repositories, calls the Task 2 export `createDriveIdentityClient(identityDependencies)`, calls the Task 4 export `createDriveTransport({ identity, fetch: window.fetch.bind(window) })`, calls the Task 11 export `createDriveReconciler({ identity, transport, repositories, ...reconcileDependencies })`, then calls `createDriveSyncService({ identity, reconcile: reconciler.run, accountSwitchGuard, now: () => Date.now(), isOnline: () => navigator.onLine, window, document })`. It injects that returned `DriveSyncService` and the same identity-backed account-bound desired-publication factory into `AppShell`; `AppShell` provides the service to header/Library/editor and disposes it once on app teardown. React consumers receive the service, never identity/transport/reconciler internals.

Header/account/Library/editor consume only service snapshots and repository item state. All copy comes from `google-drive/copy.ts`; status is textual, polite where appropriate, and not color-only. Revoke dialog includes same-project blast radius and backup remains. The account-switch Apply button carries stable `data-drive-action="apply-account-switch"` for the request/state fixture; the attribute changes no product behavior. No UI interpolates Drive file IDs. Replace `drive.ts` with the explicit compatibility facade below; both re-exports resolve to the named implementation owner, and no undefined `service factory` alias exists. Remove `requestDriveAccess` and `uploadTranscriptMetadata` so blind uploads/silent refresh cannot compile.

```ts
export {
  createDriveSyncService,
  type DriveSyncServiceDependencies,
} from "@/features/google-drive/sync-service"

export function isGoogleDriveConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim())
}
```

- [ ] **Step 4: Run green, EN/VI, keyboard, axe, and reflow checks**

Run:

```bash
pnpm vitest run tests/components/drive-identity.test.tsx tests/components/drive-sync.test.tsx tests/components/transcript-editor.test.tsx
pnpm playwright test tests/e2e/drive-identity.spec.ts --grep "GIS-05" --reporter=list
pnpm playwright test tests/e2e/drive-identity.spec.ts tests/e2e/drive-sync.spec.ts --grep "DRIVE-FEATURE-A11Y" --reporter=list
```

Expected: PASS in EN/VI at desktop, 390, and 320 fixtures; zero critical/serious axe violations; keyboard focus returns from dialogs; no horizontal overflow; sync announcements contain no token/Drive ID.

- [ ] **Step 5: Stage and commit**

```bash
git add src/features/google-drive/sync-service.ts src/components/product/AppHeader.tsx src/features/library/LibraryPage.tsx src/features/transcript-editor/TranscriptPage.tsx src/app/AppShell.tsx src/main.tsx src/features/google-drive/drive.ts tests/components/drive-identity.test.tsx tests/components/drive-sync.test.tsx
git diff --cached --name-only
git diff --cached
git commit -m "feat(drive): expose protected two-way sync"
```

### Task 13: Complete named E2E races, privacy assertions, and accessibility coverage

**Files:**

- Modify: `tests/e2e/fixtures/drive.ts:1-end`
- Modify: `tests/e2e/drive-identity.spec.ts:1-end`
- Modify: `tests/e2e/drive-sync.spec.ts:1-end`
- Modify: `tests/e2e/privacy.spec.ts:1-end`
- Modify: `tests/e2e/navigation-i18n.spec.ts:1-end`

Phase 5 keeps changed-flow axe, keyboard, focus, and reflow assertions in `drive-identity.spec.ts`, `drive-sync.spec.ts`, and their component tests. Consolidation belongs exclusively to Phase 6.

- [ ] **Step 1: Finish exact GIS-01..05 browser fixtures**

GIS-01 covers dismissal/error/watchdog/late callback. GIS-02 covers stable `sub`, optional fields, initial avatar policy, Blob fallback, redirect/error/timeout/oversize/MIME/CORS. GIS-03 covers margin/expiry/reload and proves only a clicked Connect/Reconnect/Sync-now requests token. GIS-04 covers omitted UserInfo/Drive scopes and confirmed/unconfirmed revoke blast-radius/link. GIS-05 uses the exact fixture state above and asserts account-A identity/sync metadata precedes account B, the dirty save is first held then fails exactly once, Cancel and preview leave `applyActions === 0` and `uploads === 0`, Apply increments only `applyActions`, and separate disclosure is required before any upload.

- [ ] **Step 2: Finish exact DRV-01..06 browser fixtures**

DRV-01 runs two isolated browser contexts against one deterministic Drive fixture and preserves both branches. DRV-02 rejects one deliberately malformed candidate query, one invalid page token, and one incomplete page; then runs exact `{A}`, `{B}`, `{A,B}`, `{A,B}` complete passes, validates second-page tokens, requires four completed passes, and proves metadata plus media readbacks for both candidates before conflict UI. DRV-03 imports exhaustive resolver fixture results and verifies UI winner/conflicts without Drive metadata causality. DRV-04 tests parser fingerprint boundaries, offline/auth pause, cap four, serialized creates. DRV-05 tests strict migration and 512/513 boundaries. DRV-06 tests exact discriminated persisted variants, guarded stale/illegal transition rejection, binding before dispatch, lost success, byte-identical same-ID/body retries including reload, 409 match, transient 404, desired race, stabilized finalization, new unbound desired replacement, mismatch, and physical count. Add an editor fixture proving invalid timing persists across reload only as draft, produces no canonical/hash/pending change or Drive request, and enqueues only after correction returns a canonical commit.

- [ ] **Step 3: Finish PRIV-01 request recorder**

Run each runtime result, editor mutation, rename, delete/Undo, settings change, account switch choices, migration, and reconcile. Fail if any Drive request contains source `File`/Blob bytes, source URL, settings payload/key, raw transcript ID in name/properties, an unapproved scope/host, upload before local transaction completion, or upload/apply during Cancel/preview. Assert request recorder entries have exact own keys `method` and `pathname` only; no authorization/header/body/token/opaque ID survives sanitization. Assert only one exact canonical transcript envelope media part reaches Drive after explicit same/new-account consent.

- [ ] **Step 4: Run focused named families**

```bash
pnpm playwright test tests/e2e/drive-identity.spec.ts --reporter=list
pnpm playwright test tests/e2e/drive-sync.spec.ts --reporter=list
pnpm playwright test tests/e2e/privacy.spec.ts --reporter=list
pnpm playwright test tests/e2e/navigation-i18n.spec.ts --grep "I18N-01.*Drive" --reporter=list
pnpm playwright test tests/e2e/drive-identity.spec.ts tests/e2e/drive-sync.spec.ts --grep "DRIVE-FEATURE-A11Y" --reporter=list
```

Expected: GIS-01..05, DRV-01..06, PRIV-01, Drive I18N, and identity/sync axe matrices pass; only documented real-ASR/WebGPU tests skip.

- [ ] **Step 5: Stage and commit**

```bash
git add tests/e2e/fixtures/drive.ts tests/e2e/drive-identity.spec.ts tests/e2e/drive-sync.spec.ts tests/e2e/privacy.spec.ts tests/e2e/navigation-i18n.spec.ts
git diff --cached --name-only
git diff --cached
git commit -m "test(drive): prove privacy and convergence"
```

## 4. Checkpoint C and phase gate

- [ ] Run focused unit gate:

```bash
pnpm vitest run tests/unit/schema-hashes.test.ts tests/unit/database.test.ts tests/unit/drive-identity.test.ts tests/unit/drive-parser.test.ts tests/unit/drive-resolver.test.ts tests/unit/drive-publication.test.ts tests/unit/drive-reconcile.test.ts
```

Expected: exit 0; all scalar/hash/parser/publication/resolver/reconcile fixtures pass with no unhandled rejection.

- [ ] Run focused component gate:

```bash
pnpm vitest run tests/components/drive-identity.test.tsx tests/components/drive-sync.test.tsx tests/components/transcript-editor.test.tsx tests/components/library.test.tsx tests/components/navigation.test.tsx
```

Expected: exit 0; save/account-switch protection, sync states, EN/VI copy, keyboard, live regions, and axe assertions pass.

- [ ] Run named browser gate:

```bash
pnpm playwright test tests/e2e/drive-identity.spec.ts tests/e2e/drive-sync.spec.ts tests/e2e/privacy.spec.ts --reporter=list
pnpm playwright test tests/e2e/editor-save.spec.ts tests/e2e/library.spec.ts tests/e2e/navigation-i18n.spec.ts --reporter=list
pnpm playwright test tests/e2e/drive-identity.spec.ts tests/e2e/drive-sync.spec.ts --grep "DRIVE-FEATURE-A11Y" --reporter=list
```

Expected: GIS-01..05, DRV-01..06, PRIV-01, SAVE-01..03, LIB-01, relevant NAV/I18N and accessibility states pass at required desktop/390/320 configurations.

- [ ] Perform C review. Reviewer must trace: raw-byte intake before decode; exact quarantine allowlist; account-neutral durable candidates; resolver permutation invariance; dominant tombstone and exact restore eligibility; loser retention; safe revision overflow; non-snapshot complete-pass union; four-pass/two-identical-set stability; no intervening create; dirty-editor save protection; unstable pending/Syncing/no-cleanup; positive-ID cleanup only; permanent tombstone/cross-device retention; local pruning references; external-store trigger coalescing; offline/auth/account transitions.

- [ ] Run full repository phase gate from `F:\Workspace\whisdom\whisdom-precision-studio`:

```bash
pnpm typecheck
rtk lint
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Expected: every command exits 0; both lint commands report zero errors and zero warnings; Playwright reports only documented real-ASR/WebGPU gated skips. No worker/server contract change is planned; if shared worker-facing types changed unexpectedly, also run `pnpm --filter whisdom-worker typecheck` and expect exit 0. If `server/` appears in staged paths, stop: Phase 5 has no approved server change.

- [ ] Inspect artifacts and exact staged state:

```bash
git diff --name-only
git diff --cached --name-only
git diff --cached
```

Expected: no `dist/`, `test-results/`, traces, screenshots outside approved baselines, caches, `.env`, token, private body, media fixture output, server file, or unrelated path. Never use `git add .` or `git add -A`.

- [ ] Record all three checkpoint reviews and phase-level privacy/code review. Confirm no shipment marker exists until A/B/C evidence is attached together.

- [ ] If final C integration changes remain after Task 13, stage only their exact listed paths and commit:

```bash
git commit -m "feat(drive): complete immutable transcript sync"
```

Expected: conventional commit created only when execution was explicitly requested; no push/deploy occurs in this plan-writing task.

## 5. Final invariant checklist

- [ ] Five scopes exactly: `openid email profile` plus full `drive.file` and `drive.appdata` URIs.
- [ ] GIS token attempts originate only in direct Connect/Reconnect/Sync-now gestures; watchdog/error callback settle; late callback ignored.
- [ ] Token, expiry, authorization header, and ID-token-like data remain memory-only and redacted.
- [ ] 60-second margin pauses; no timer/focus/online/reconcile/reload token request.
- [ ] UserInfo and avatar strings scalar-validate before count/key/display/URL; exact account key uses issuer+`sub`; email never identifies account.
- [ ] Avatar uses exact HTTPS host, no credentials/nonstandard port, `redirect: "error"`, five seconds, 1 MiB, image MIME, Blob URL, and complete cleanup.
- [ ] Revoke uses GIS callback and states same-Cloud-project blast radius plus backup retention; unconfirmed result links exact permissions URL.
- [ ] Different account starts paused; preview cannot apply/upload; remote apply and local upload have distinct confirmations; dirty editor is protected.
- [ ] CSP enumerates documented Google endpoints plus only parsed exact HTTPS or local-HTTP origins from `VITE_CF_WORKER_URL`/`VITE_SERVER_URL`; absent static Pages build, valid, duplicate, and invalid values are tested; no wildcard exists; request recorder proves transcript JSON only.
- [ ] Every mutation saves locally first and atomically writes eligible pending operation; offline/auth failure never rolls back local completion.
- [ ] `PendingOperation` is the exact `unbound | bound | creating | verifying | needs-attention` discriminated union; no flat nullable-attempt shape exists.
- [ ] Exact operation fields are `generatedFileId`, `attemptedCandidateHash`, `attemptedEnvelopeJson`, `attemptedPayloadHash`, `attemptedFileName`, `attemptedMimeType`, `attemptedPrivateProperties`, `desiredCandidateHash`, and `desiredEnvelopeJson`; every frozen attempted field is immutable outside `unbound`.
- [ ] Canonical transcript mutations atomically write transcript revision plus desired pending publication; stale expected transcript/draft/publication state or attempt identity rejects with no write.
- [ ] Invalid/Needs-attention editor timing calls only `persistDraftOnly`; it never updates canonical transcript/revision/hash/sync metadata/pending state. Only `CanonicalCommitResult.status === "canonical"` may enqueue.
- [ ] Scalar/schema validation precedes RFC 8785; lone surrogates never reach canonicalizer.
- [ ] Four digest domains remain separate; candidate hash covers full envelope.
- [ ] Candidate filename/MIME/three properties exact; raw transcript ID absent from metadata.
- [ ] `files.generateIds` uses appDataFolder; binding transaction precedes create; metadata carries same generated ID.
- [ ] Binding freezes generated ID and exact attempted identity before network; creating/verifying/Needs-attention use guarded expected state/ID/hash transitions; illegal/stale transitions reject atomically.
- [ ] Ambiguous and publication retries reuse same generated ID, exact envelope body, metadata, and byte-identical multipart bytes; 409 verifies metadata+media; no second ID.
- [ ] Legacy migration is strict/bounded, verifies new candidate before at-most-20 cleanup, accepts 512-byte ID, quarantines 513-byte and other invalid bodies, retains invalid old files, never truncates/partially imports.
- [ ] Remote body cap/fingerprint behavior matches 25 MiB/25 MiB+1 exactly; invalid metadata stores no body/fragment.
- [ ] Discovery is non-snapshot, fully paginated, restarts invalid tokens, rejects incomplete searches, and caps downloads at four.
- [ ] Resolver ignores enumeration/Drive metadata, uses exact regular order/dominant tombstone/restore rule, and preserves every loser.
- [ ] Reconcile unions initial/readback/post-create observations; at most four complete passes; two consecutive identical sets; no intervening create.
- [ ] Unstable state remains pending/Syncing, schedules bounded backoff, performs zero cleanup, and never says Synced.
- [ ] Candidate-first incoming merge atomically persists candidate before winner/non-Synced metadata/pending disposition; any later failure aborts all writes.
- [ ] Only `finalizeStabilizedWinner` can write Synced, with exact verifying state, verifier-issued `VerifiedPublicationReceipt`, matching stabilized candidate, derived confirmed identity, pending removal, complete sync metadata, and optional new literal-null unbound desired replacement. Missing/mismatched receipts and caller-supplied duplicate identity strings are rejected; Synced is impossible through an independent metadata write.
- [ ] Cleanup uses only positively validated IDs; local pruning uses all reference guards; tombstones/causal identity/cross-device branches remain permanent.
- [ ] No ETag, If-Match, PATCH, silent refresh, direct revoke request, trash, list-absence, version/time causality, raw Drive ID, media/settings upload, or silent account disclosure exists.
- [ ] GIS-01..05, DRV-01..06, PRIV-01, EN/VI, keyboard, 320/390, axe, full phase gate, checkpoint reviews, and phase review all pass before shipment.

## 6. Self-review record

- Spec coverage: §§13.6, 14.2, 15.1-15.10, 16.2-16.5, 22.5, 23.1-23.4, 24.3, 25, 26 decisions 18-43, and §27 request contracts map to Tasks 1-13 and final gates.
- Type consistency: master `TranscriptEnvelope`, `PendingOperation`, candidate, metadata, and service fields remain exact; attempted fields freeze after binding; desired fields advance without rebinding.
- Digest consistency: raw bytes, transcript key, complete-envelope identity, and accepted-payload conflict tie are independently named and tested.
- Completeness scan: `DriveCandidateBody` has one exact owner, CSP has one exact build-time owner, fixture query/pagination/pass/readback/account/save/no-apply/no-upload behavior matches its tests, and no deferred behavior, partial implementation instruction, undefined execution choice, or generic error/testing directive remains.
- Release topology: A precedes B, B precedes C, and Phase 5 cannot ship until all checkpoints and named gates pass together.
