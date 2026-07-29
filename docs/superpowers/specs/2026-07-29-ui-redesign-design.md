# Precision Studio UI Redesign

## 1. Status and decision summary

| Field | Decision |
| --- | --- |
| Status | Approved for implementation |
| Date | 2026-07-29 |
| Product | Whisdom local-first speech-to-text web app |
| Audience | Product, design, frontend, storage, sync, and test implementers |
| Delivery strategy | Product-slice rebuild across complete workflows |
| Visual direction | Precision Studio |
| Default processing | Local, in-browser transcription |
| Batch policy | Sequential |
| Primary transcript representation | Ordered segments; document text is derived |
| Cloud scope | Two-way transcript sync through Google Drive `appDataFolder` |
| Media sync | Prohibited |
| Settings sync | Out of scope |
| Hosting constraint | Static-host compatible, including GitHub Pages |

This specification replaces the current UI structure and interaction model while preserving proven transcription workers, runtime APIs, storage semantics, exports, and model caches where their contracts remain sound. It is not a visual reskin. Each delivery slice must leave a usable product flow.

The redesign resolves these product decisions:

1. Workbench, Library, transcript workspace, and Settings become addressable views.
2. First run recommends a safe local model instead of asking users to understand model internals.
3. Progress reports real phases and real measurements; it never fabricates a global percentage.
4. Every processing runtime supports terminal cancellation and retry through acknowledgement or worker termination.
5. Errors appear once, beside the failed action, with a recovery path.
6. Transcript editing uses one canonical segment model across Document and Timeline views.
7. Google Drive becomes visible, identity-aware, two-way transcript sync.
8. Mobile receives a complete purpose-built flow, not a compressed desktop layout.

## 2. Goals and non-goals

### 2.1 Goals

1. Make first transcription understandable without prior Whisper knowledge.
2. Make privacy, processing location, downloads, conversion, and sync behavior explicit at decision points.
3. Keep current task, queue state, progress, recovery, and cancellation legible during long work.
4. Make transcripts editable, searchable, exportable, and recoverable on desktop and mobile.
5. Provide dependable Drive identity, reconnect, backup, restore, conflict, and deletion behavior.
6. Preserve local-first operation when Drive or optional transcription servers are unavailable.
7. Reach WCAG 2.2 AA and complete EN/VI copy coverage.
8. Keep startup light: no model, ffmpeg, editor, Library, or Settings heavy assets before needed.
9. Preserve existing settings and transcripts through a transactional storage migration.
10. Create feature boundaries that prevent another application-shell monolith.

### 2.2 Non-goals

1. No backend requirement for core transcription.
2. No concurrent batch processing. Queue execution remains sequential.
3. No source-media upload to Google Drive or transcript sync storage.
4. No Google Drive settings sync.
5. No Drive permissions beyond `openid email profile`, `drive.file`, and `drive.appdata`.
6. No broad server or Cloudflare Worker refactor. Existing APIs remain compatible unless an additive capability is required.
7. No replacement of the singleton-at-most-one ASR/ffmpeg worker architecture, persistent model Cache Storage, or static-host deployment. Cancellation may terminate and lazily recreate a worker.
8. No PWA expansion or new offline media-transcription guarantee beyond current behavior.
9. No fake analytics, dashboard metrics, model benchmarks, or device-performance claims unsupported by runtime data.
10. No Settings feature expansion. Settings work is limited to consistency, validation, accessibility, and navigation.
11. No decorative gradients, glass, neon, generic AI imagery, or ornamental waveform data presented as real audio analysis.

## 3. Users and jobs

### 3.1 Primary users

Students, researchers, journalists, creators, and other knowledge workers transcribe lectures, interviews, meetings, videos, and voice notes. Many handle sensitive media. They care about a dependable result more than model taxonomy, execution-provider details, or AI operations.

### 3.2 Core jobs

| Job | Success condition |
| --- | --- |
| Transcribe a local recording privately | User sees that media remains on device, accepts any required download, and reaches an editable transcript |
| Transcribe a server-supported link | User can submit a URL without selecting a local file |
| Process several recordings | New selections append; queue runs sequentially; each item exposes state, retry, remove, and reorder |
| Understand a long-running job | Current phase, activity, elapsed time, measured progress, and cancel action remain visible |
| Recover from failure | One error explains what happened in plain language and offers a relevant action |
| Correct and export text | Document and Timeline edits stay synchronized; TXT, JSON, SRT, and VTT reflect current content |
| Find prior work | Library search and filters expose metadata, sync state, rename, export, delete, and Undo |
| Continue across devices | Drive reconnects, reconciles transcript JSON, resolves conflicts deterministically, and never blocks local saves |

### 3.3 Trust requirements

- At source selection, state: local files stay in this browser unless user explicitly selects a server transcription mode. Drive sync stores transcript data only.
- Before work starts, name processing location and any network transfer.
- Never describe server or cloud processing as local.
- Never show “Synced” until remote persistence is confirmed.
- Never imply revoking app access deletes the Drive backup.

## 4. Current-state problem inventory

Line references describe the repository state reviewed for this specification.

### 4.1 Structure and navigation

- `src/App.tsx` is 2,563 lines and owns shell, bilingual copy, setup, source input, queue, progress, settings, history, result dialog, errors, toast, Drive, server capability loading, and runtime orchestration. Its main component holds 24 `useState`/`useRef` atoms at `src/App.tsx:600-627`; inline product components continue through `src/App.tsx:2563`.
- Navigation is local state (`View = "home" | "settings"` at `src/App.tsx:123` and `setView` at `src/App.tsx:601`). It has no addressable Workbench, Library, editor, or Settings URL, and cannot preserve Back, Forward, refresh, or deep links.
- The current desktop layout combines setup cards, drop zone, preflight, queue, and Recent panel (`src/App.tsx:1455-1571`). Product hierarchy depends on repeated cards rather than task structure.

### 4.2 Source and runtime defects

- `canStart` requires both `file` and `analysis` at `src/App.tsx:719-723`. The server URL input exists at `src/App.tsx:1481-1496`, but `startTranscription` exits when either file or analysis is absent at `src/App.tsx:1178-1181`. The server URL branch at `src/App.tsx:993-1041` is therefore unreachable without an unrelated local file.
- `ServerTranscriptionApi.cancelJob` exists at `src/features/server-transcription/api.ts:99-116` but the UI never invokes it. Local and Cloudflare paths also expose no cancel control.
- `subscribeProgress` returns an aborting `unsubscribe` handle at `src/features/server-transcription/sse.ts:60-62`. Both subscriptions created at `src/App.tsx:1002-1040` and `src/App.tsx:1051-1089` discard that handle, creating leak and late-update risk after completion, cancellation, navigation, or unmount.
- Cloudflare progress includes hardcoded English chunk detail at `src/App.tsx:936-938`. Server progress uses hardcoded “Submitting URL...” and “Uploading...” at `src/App.tsx:995` and `src/App.tsx:1044`.
- Progress maps unrelated operations into manually weighted global values, including `0.08`, `0.18`, `0.35`, `0.4`, `0.5-0.9`, and `0.95` at `src/App.tsx:793-803`, `src/App.tsx:904-915`, `src/App.tsx:931-939`, and `src/App.tsx:960-966`. These values do not share a measured denominator.
- Initial progress uses English copy before stored UI language loads (`src/App.tsx:609-613`). Runtime messages are localized by matching mutable English strings at `src/App.tsx:547-597`, which is brittle and lets unknown English pass through.

### 4.3 Error and notification defects

- Failures can populate contextual `error`, a destructive toast, and a detail dialog (`src/App.tsx:619-620`, `src/App.tsx:1187-1199`, `src/App.tsx:1544-1551`, `src/App.tsx:1583-1608`). Analysis and cleanup failures repeat the same pattern at `src/App.tsx:804-813` and `src/App.tsx:1290-1298`.
- Batch completion writes a success toast and then overwrites it with an error toast when any item fails (`src/App.tsx:1222-1243`). `AppToast` accepts one nullable message, has no queue, and has no auto-dismiss timer (`src/App.tsx:2487-2532`).
- Current E2E tests work around duplicate strict locators with `.first()` at `tests/e2e/whisdom.spec.ts:196` and `tests/e2e/whisdom.spec.ts:248`. These workarounds must be removed when the duplicate rendering is fixed.
- Successful retries do not centrally clear all previous error channels, allowing stale failure state.

### 4.4 Drive defects

- Drive requests only `drive.file` and `drive.appdata` (`src/features/google-drive/drive.ts:3`). It receives only an access token and has no identity fetch, sign-out, revoke, expiry model, or durable sync state.
- Popup closure or dismissal is not handled. `requestDriveAccess` resolves only through the token callback (`src/features/google-drive/drive.ts:44-59`), so the opening state can hang.
- The token lives in React memory at `src/App.tsx:622`; expiry is not tracked. Silent refresh is attempted only immediately before a local-mode upload at `src/App.tsx:1149-1169`.
- Drive performs one blind multipart create into `appDataFolder` (`src/features/google-drive/drive.ts:62-101`). It cannot list, download, update, restore, reconcile, detect conflicts, or preserve deletion.
- Drive upload occurs only in the local runtime branch. Cloudflare and server results save locally but bypass Drive at `src/App.tsx:960-967`, `src/App.tsx:1026-1033`, and `src/App.tsx:1075-1082`.
- UI identity remains “Guest”; connected state is a buried menu status (`src/App.tsx:1372-1413`). A successful upload displays the raw Drive file ID via `synced(id)` (`src/App.tsx:173`, `src/App.tsx:505`, `src/App.tsx:1161-1163`).

### 4.5 Setup, settings, and control defects

- First run presents model and language controls before explaining a recommendation (`src/App.tsx:1636-1723`). Users must interpret seven model choices from size, quality, and prose.
- Model metadata supports only `sizeMb`, coarse `quality`, `multilingual`, and notes (`src/features/transcription/types.ts:20-27`; catalog at `src/features/transcription/models.ts:7-64`). It does not support claims about measured speed, device RAM, GPU class, accuracy, or language-specific performance.
- Large-model labels and history can use stale or raw capability data: server fallback labels are static at `src/App.tsx:528-545`, while History and result receive non-keyed `serverCapabilities` at `src/App.tsx:1568`, `src/App.tsx:1581`, and render labels at `src/App.tsx:2299-2304` and `src/App.tsx:2458-2460`.
- Numeric Settings inputs directly persist `Number(event.target.value)` (`src/App.tsx:1909-1929`). Empty, non-finite, or out-of-range values can become `NaN` or invalid settings despite HTML min/max attributes.
- The language picker is a hand-rolled listbox (`src/App.tsx:1727-1850`). It lacks roving active-option state, Arrow/Home/End navigation, `aria-activedescendant`, selection-on-Enter behavior, and focus restoration. Its `min-w-[18rem]` panel at `src/App.tsx:1796` can overflow narrow screens.
- Main setup depends on `overflow-visible` card escape behavior (`src/App.tsx:1637`), coupling layout and popover correctness.
- Preflight warnings are rendered as untyped strings (`src/App.tsx:2205-2209`) generated by a second embedded copy table (`src/features/media/preflight.ts:101-172`). English-only mismatch can also render in setup and sidebar (`src/App.tsx:1711-1714`, `src/App.tsx:1555-1561`), producing duplicate warnings.

### 4.6 Transcript and Library defects

- Result opens in a fixed-height dialog (`src/App.tsx:2307-2385`). The raw text area is read-only (`src/App.tsx:2334-2340`); timestamp rows are also read-only. Mobile uses two `32svh` panes with `min-h-72`, causing cramped or clipped content (`src/App.tsx:2329-2359`).
- `TranscriptDocument` stores both `text` and `segments` (`src/features/transcription/types.ts:67-78`), while exports read TXT from `text` and subtitle formats from `segments` (`src/features/transcription/exports.ts:17-30`). Editing either independently would make exports diverge.
- Cloudflare results save an empty segment array (`src/App.tsx:946-958`). Existing seeded and legacy records may also have text with no segments (`tests/e2e/whisdom.spec.ts:90-101`).
- Recent history is a small capped panel, not a Library (`src/App.tsx:2425-2485`). It has no search, filters, sync states, export action, Undo, recovery, or explicit conflict state.
- History delete is visually hover-dependent on larger screens through `sm:opacity-0` (`src/App.tsx:2469-2478`). Touch and keyboard users need permanently discoverable actions.
- Deletion immediately removes the IndexedDB record (`src/features/storage/indexed-db.ts:40-43`), so it cannot be undone or propagated as a durable tombstone.

### 4.7 Storage and test gaps

- IndexedDB is version 1 with only `settings` and `transcripts` stores (`src/features/storage/indexed-db.ts:6-21`). There are no transactions spanning transcript mutation and sync enqueue, revisions, device identity, pending operations, tombstones, or migration normalization.
- Current E2E coverage validates shell, preflight, queue append, model selection, language, theme-era settings navigation, limited mobile fit, Recent CRUD, and cache cleanup (`tests/e2e/whisdom.spec.ts`). It does not cover cancellation, URL-only input, editor consistency, Drive restore/conflict/offline behavior, or 320 px layouts.
- Real local ASR coverage is correctly gated by `WHISDOM_REAL_ASR` and `WHISDOM_REAL_WEBGPU` (`tests/e2e/real-transcription.spec.ts:12-14`, `108-149`) and must remain available after navigation changes.
- Server-mode coverage only asserts the option is hidden without configuration (`tests/e2e/server-mode.spec.ts:3-18`).

## 5. Product and design principles

1. **Local-first trust.** Explain where work runs and what leaves the browser before processing starts.
2. **Task before technology.** Lead with source, language, and a recommendation. Place model internals under “Change model” and advanced details.
3. **Honest state.** Show measured phase progress or an indeterminate state. Never turn elapsed time or arbitrary weights into apparent completion.
4. **Transcript as product.** Give editing, search, export, autosave, and sync full-page space.
5. **Recovery in context.** Place one problem and one primary recovery action where failure occurred.
6. **Calm density.** Use rules, spacing, type, and alignment before containers. Avoid card soup.
7. **Mobile completeness.** Every core action must remain visible, reachable, and understandable at 320 px.
8. **Bilingual parity.** EN and VI are equal product surfaces, not a translation pass.
9. **Deterministic behavior.** Recommendation, normalization, retry, merge, migration, and legacy conversion must be pure and testable.

## 6. Precision Studio visual system

### 6.1 Character

Precision Studio feels like a quiet audio workbench: warm, exact, capable, and tailored to long-form transcription. Audio ruler ticks, restrained waveform traces, and stage markers may communicate structure. They must derive from real media data when presented as content; decorative motifs remain abstract and unlabeled.

### 6.2 Color and themes

| Token role | Light | Dark | Use |
| --- | --- | --- | --- |
| Canvas | Warm off-white | Deep graphite | Main page |
| Primary text | Graphite | Warm near-white | Headings and body |
| Secondary text | Neutral graphite | Cool neutral gray | Metadata |
| Rules | Warm gray | Mid-graphite | Structure and boundaries |
| Accent | Restrained cobalt | Clear cobalt | Primary action, active stage, focus |
| Critical | Accessible restrained red | Accessible warm red | Blocking errors and destructive actions |
| Success | Muted green | Clear muted green | Confirmed saved/synced states |
| Warning | Ochre | Warm amber | Non-blocking attention |

Implementation must define semantic tokens, not scatter literal colors. Text, controls, focus indicators, status combinations, and disabled states must meet WCAG 2.2 AA contrast. Color never carries state alone.

Theme options are Light, Dark, and System. Preserve the provider’s current three-state support (`src/components/theme-provider.tsx:4-5`, `102-149`) rather than reducing it to the current binary menu switch. Dark mode receives deliberate deep-graphite surfaces and equivalent hierarchy, not inverted light colors.

### 6.3 Typography

- Geist remains primary sans and heading family, matching `src/index.css:4` and `src/index.css:83-85`.
- Define a mono family token for timestamps, durations, file sizes, progress values, revisions, and technical details. Use a bundled or system-safe monospace stack; do not trigger a remote font request.
- Page title: compact, high-contrast, sentence case.
- Section title: one step below page title; avoid oversized marketing type.
- Body: readable line length of roughly 60-75 characters in editor document view.
- Metadata: smaller but never below a legible 12 CSS px equivalent.

### 6.4 Shape, spacing, and motion

- Use crisp one-pixel rules, small radii, and few elevation levels.
- Reserve contained surfaces for popovers, sheets, dialogs, selection groups, and status panels. Main page sections use alignment and separators.
- Desktop composition is asymmetric, approximately 70/30, with task canvas dominant.
- Motion communicates opening, stage change, reorder, save, and recovery. Keep transitions short and interruptible.
- Under `prefers-reduced-motion: reduce`, remove spatial motion and nonessential animation; preserve immediate state indication.
- No gradient, blur-based glass surface, glow, neon, or parallax.

## 7. Information architecture and navigation

### 7.1 Global shell

Header contains:

1. Whisdom wordmark.
2. “Local by default” indicator with an accessible explanation.
3. Desktop navigation: Workbench and Library.
4. Drive identity/status control.
5. Theme and menu control containing Settings and interface language.

Use semantic `header`, `nav`, `main`, and supporting landmarks. Add a first-focus skip link to main content.

### 7.2 Address model

Static hosting requires query-based navigation:

| View | Address |
| --- | --- |
| Workbench | `/?view=workbench` or `/` as canonical alias |
| Library | `/?view=library` |
| Transcript | `/?view=transcript&id=<encoded transcript id>` |
| Settings | `/?view=settings` |

Rules:

- Parse only known `view` values. Unknown values return to Workbench and replace invalid history state.
- Missing or unknown transcript IDs show a localized not-found state with “Back to Library”; they do not crash or silently open another document.
- Navigation updates `history.pushState`; replace only canonicalization or invalid-state correction.
- `popstate` restores the view, selected transcript, scroll policy, and focus.
- On view change, focus the page `h1` through a temporary programmatic target. Returning from overlays restores trigger focus.
- Refreshing an editor URL loads the transcript from IndexedDB before rendering editable content.
- Dirty-navigation behavior follows Section 13.6. App-driven navigation awaits the serialized local save. Back/Forward restores the editor history entry until the user resolves Retry or Discard.

### 7.3 Workbench

Workbench contains complete source, setup, review, queue, progress, and completion flow. A stage rail provides orientation:

`Add media → Review → Transcribe → Edit`

The rail is not a blocking wizard. Users may return to source or setup when no active job makes a change unsafe. Completed stages remain selectable when their content is available. Edit opens the completed transcript workspace.

Desktop uses a dominant task canvas and a context rail. Source/setup/review/current task occupy the canvas. Recommendation rationale, privacy, downloads, batch summary, or queue drawer occupies the rail according to state. Do not render empty cards to preserve the ratio.

### 7.4 Library

Library owns transcript search, filters, metadata list, item actions, sync summary, and recovery states. It does not display aggregate “minutes transcribed,” model usage charts, or other dashboard analytics.

### 7.5 Transcript workspace

Transcript opens as a full addressable page. Header contains title, source metadata, local/sync state, search, copy, export, and overflow actions. Main area switches between Document and Timeline views over the same canonical segments.

### 7.6 Settings

Settings remains secondary and familiar. Keep processing, chunking, storage, model-cache cleanup, and transcript cleanup concepts. Add validation, helper/error association, three-state theme access, and consistent destructive confirmation. Do not add unrelated preferences.

### 7.7 Mobile navigation

- At widths below the desktop navigation breakpoint, use bottom navigation with Workbench and Library.
- Account, Drive state, interface language, theme, and Settings remain in the header menu.
- Bottom navigation and sheets include `env(safe-area-inset-bottom)` padding.
- Hide bottom navigation only when the virtual keyboard would otherwise cover editor controls; preserve an accessible way back.

## 8. Responsive behavior

| Width/context | Required behavior |
| --- | --- |
| 320-389 px | Single column; 16 px outer gutter where possible; controls wrap or fill width; no fixed minimum popover width; critical action remains above keyboard/safe area |
| 390-767 px | Same mobile structure with room for paired secondary actions where labels remain intact |
| 768-1023 px | Single primary column plus optional inline context sections; no forced 70/30 split |
| 1024 px and above | Approximately 70/30 Workbench canvas/context rail; persistent desktop header navigation |

Mobile-specific requirements:

1. Queue opens as a bottom sheet with current item summarized on Workbench.
2. Bottom sheet supports full-height scrolling, safe-area padding, focus trap, Escape, close button, and focus restoration.
3. Transcript editor is a page. Document and Timeline views occupy natural height; no nested fixed-height modal panes.
4. Item actions use visible buttons or an always-available menu. No hover-only controls.
5. Touch targets are at least 44 by 44 CSS px, including reorder, dismiss, tabs, and icon buttons.
6. Combobox popovers use available viewport width and collision handling.
7. At 200% zoom and 320 CSS px, content has no horizontal page overflow.
8. Virtual keyboard must not hide Save state, active editor field, error recovery, or primary completion action. Use visual viewport-aware positioning only where sticky layout cannot satisfy this.

## 9. Workbench behavior

### 9.1 First run and returning users

First run means there is no valid explicit stored model choice. No other persisted state participates in first-run detection. Local and server recommendations are separate. On first Workbench load:

1. Detect secure context and WebGPU availability through current preflight capability logic.
2. Read UI language and saved transcription language.
3. Select the deterministic recommendation in Section 10.
4. Show one sentence: model name, local runtime, and plain reason.
5. Expose “Change model.” Advanced details show download size, multilingual support, dtype, and runtime requirement.

An explicit user choice is persisted. Recommendation explanations are derived on every evaluation from current language, runtime capability, catalog, and stored choice; recommendation metadata is not persisted. Re-evaluate when the choice is missing, its catalog model was removed, transcription language changes, or runtime capability changes. Preserve a valid compatible explicit choice. Replace an English-only choice when the resolved language requires multilingual support, and replace a choice whose runtime is unavailable only when a beginner-safe replacement exists. If no beginner-safe candidate exists but other compatible models do—including the required Small/q4-only case—block automatic start and require explicit model choice with plain-language speed, memory, and runtime trade-offs. If no compatible model exists, block with runtime recovery. Never persist an invalid fallback.

### 9.2 Source switch

Source control has two options: File and Link.

#### File

- Accept supported audio/video through picker and drag/drop.
- Selection appends to the existing queue. It never replaces the queue unless user explicitly clears it.
- Analyze the first newly added item only when no selected item exists; otherwise preserve current selection.
- State privacy promise beside selection, not in a distant Settings page.
- File metadata timeout and cleanup behavior from `readMediaDuration` must remain intact.

#### Link

- Available only for configured server mode whose capabilities include URL input.
- Link input can start without a local file or file analysis.
- Validate URL syntax and supported protocol before submit. Accept only `http:` and `https:`.
- A Link queue item stores the original URL as source reference; do not fetch media in the browser solely for preflight.
- If server is unavailable, show one contextual error and retry action. Do not retain a stale blocking file requirement.
- Privacy copy states that the server will retrieve/process the linked media.

Switching sources preserves valid draft input in each source tab during the session. Active processing locks only unsafe source mutations; users may inspect the queue and Library.

### 9.3 Review

Review summarizes:

- selected source and metadata known with confidence;
- spoken language;
- recommended or explicitly selected model;
- processing runtime/location;
- model and ffmpeg downloads, including catalog sizes and cache state when known;
- conversion requirement;
- media transfer/privacy behavior;
- blocking issues and informational notices.

Messages use stable issue codes. Dedupe by code and affected item, then order: blocking, actionable warning, informational. Render one canonical message per issue. An English-only mismatch must not appear in setup, rail, and review simultaneously.

Blocking messages disable Transcribe and include a recovery action. Informational messages do not use destructive styling or `role="alert"`.

### 9.4 Start behavior

- Single item: primary action names the item when ambiguity exists.
- Batch: primary action starts all eligible pending/retry items sequentially. A secondary action starts only selected item.
- Snapshot runtime, model, language, and conversion settings per started item. Later setting changes apply only to pending items after explicit confirmation.
- No model or ffmpeg request occurs until user starts transcription.
- A completed single item offers “Open transcript” and “Next item” when applicable.
- Batch completion shows a queued confirmation toast; it does not automatically open a transcript.

## 10. Deterministic recommendation algorithm

### 10.1 Inputs

Local recommendation may use only:

- secure-context status;
- successful WebGPU adapter availability;
- catalog fields: model ID, size, quality, multilingual, notes, and local weight dtype/format needed to identify q4;
- `requiresWebGpuForLocalModel` derived from current dtype threshold;
- UI language and selected transcription language;
- explicit persisted user choice and whether that choice remains runnable.

It must not infer RAM, GPU tier, expected speed, accuracy, battery, device class, or language-specific quality from user agent or model labels.

### 10.2 Local policy

A **beginner-safe local candidate** is narrowly defined as a compatible multilingual Tiny or Base catalog variant that supports the resolved language and uses non-q4 weights. Base is preferred over Tiny. Small, English-only variants, and every q4 model always require explicit user choice and are never an automatic recommendation or fallback.

Evaluate these rules in exact order and stop at the first match:

| Precedence | Condition | Decision | Reason code |
| --- | --- | --- | --- |
| 1 | No catalog model is compatible with the available local runtime and resolved language | Block local start and offer runtime/catalog/language recovery | `no_compatible_model` |
| 2 | Resolved language requires multilingual support and the stored model is English-only, and a beginner-safe candidate exists | Select the beginner-safe candidate | `language_requires_multilingual` |
| 3 | Stored model requires an unavailable runtime, and a beginner-safe candidate exists | Select the beginner-safe candidate | `stored_choice_runtime_unavailable` |
| 4 | Stored explicit choice exists in the catalog, supports the resolved language, and can run | Preserve that model and runtime | `stored_choice_valid` |
| 5 | No valid explicit stored choice and compatible non-q4 multilingual Base exists | Select that Base on WebGPU when available, otherwise WASM | `first_run_base_webgpu` or `first_run_base_wasm` |
| 6 | Base is unavailable/incompatible but another beginner-safe candidate exists | Filter to compatible multilingual non-q4 Tiny/Base variants, prefer Base, then catalog order | `deterministic_catalog_fallback` |
| 7 | Compatible models exist but no beginner-safe candidate exists | Do not select or start automatically; require explicit choice and explain speed, memory, and runtime requirements in plain language | `explicit_model_choice_required` |

Base multilingual is the first-run default when compatible because current metadata supports “balanced,” multilingual, 145 MB, and local-run eligibility; it does not justify recommending larger models automatically. Row 6 may choose only a beginner-safe candidate and prefers Base before Tiny. Small and all q4 models require user choice under “Change model.” A missing choice, removed model, or invalid stored value follows first-run default then beginner-safe fallback. Language and runtime changes re-run the full precedence from current inputs.

`auto` language continues to resolve to UI language under current behavior. Recommendation evaluates the resolved language, not literal `auto`.

### 10.3 Server-mode policy

Server recommendations use a separate capability-derived catalog. The server default capability may be selected automatically because the server controls model/runtime compatibility. Local dtype, q4, Small, WebGPU, and WASM recommendation restrictions do not apply to server catalogs. UI must still identify server processing and derive its explanation from advertised server capabilities; it must never present a server recommendation as local.

### 10.4 Output

Recommendation returns a blocking decision, an explicit-choice-required decision, or a structured model decision containing mode, model ID, runtime, reason code, whether it replaced a stored choice, and explanation parameters. UI localizes the derived reason code at the boundary. Only explicit user selection updates persisted model choice; an automatic recommendation does not become an explicit choice until the user starts with or confirms it under the existing settings contract. Unit tests cover local precedence, no-compatible-model blocking, Small/q4-only explicit choice, missing/removed choices, language/runtime changes, beginner-safe fallback ordering, and separate server-default selection.

## 11. Queue model and behavior

### 11.1 Item shape

Each queue item has stable ID, source kind, display name, source reference, order, captured settings, status, current stage, measured stage progress if available, transcript ID if complete, and one current issue if failed/cancelled. Local `File` objects remain session-only unless existing media persistence is explicitly enabled.

### 11.2 Statuses

| Status | Allowed next states | User actions |
| --- | --- | --- |
| Draft | Ready, Blocked, Removed | Review, remove, reorder |
| Ready | Running, Removed | Start, remove, reorder |
| Blocked | Ready, Removed | Apply recovery, remove |
| Running | Completed, Failed, Cancelling | Cancel, inspect details |
| Cancelling | Cancelled, Failed | Wait; no duplicate cancel |
| Cancelled | Ready, Removed | Retry, remove, reorder |
| Failed | Ready, Removed | Retry, remove, inspect details, reorder |
| Completed | Removed | Open transcript, export, remove queue entry |

Cancellation stops only the active item. In batch mode, user chooses “Cancel current and continue” or “Stop batch.” Default cancel action stops current and pauses the batch, preventing unexpected next-item uploads or compute.

### 11.3 Drawer

- Desktop: contextual drawer or rail panel; current task remains central.
- Mobile: bottom sheet.
- Show per-item stage, real progress if measurable, retry, remove, and reorder.
- Drag reorder is optional enhancement. Always provide Move earlier and Move later buttons with disabled boundary states.
- Running item cannot move. Reordering affects pending/retry items only.
- Removing a completed queue entry does not delete its transcript.

## 12. Normalized runtime, progress, and cancellation

### 12.1 Adapter contract

Local WebGPU, local WASM, Cloudflare, and server runtimes implement one adapter contract:

| Operation | Requirement |
| --- | --- |
| `start` | Accept normalized source and captured options; return run handle immediately |
| `events` | Emit typed events with stable codes, phase, activity parameters, and optional measured progress |
| `result` | Resolve one normalized transcript result or reject one typed runtime error |
| `cancel` | Idempotent; request cooperative interruption when proven, otherwise terminate the active worker; complete only after provider acknowledgement or termination confirmation |
| `dispose` | Remove listeners and abort run-scoped resources; preserve persistent caches but not necessarily live worker state |

Run handles own request IDs, abort controllers, SSE subscriptions, and job IDs. React components never call provider-specific APIs.

### 12.2 Event model

Events use codes, not English strings. Minimum events:

- `prepare.started`, `prepare.media_metadata`, `prepare.converting`, `prepare.complete`;
- `model.cache_check`, `model.downloading_asset`, `model.loading`, `model.reused`, `model.complete`;
- `transcribe.queued`, `transcribe.chunk`, `transcribe.running`, `transcribe.complete`;
- `save.local`, `save.complete`;
- `run.cancel_requested`, `run.cancelled`, `run.failed`.

Each event may carry safe parameters such as asset name, bytes loaded/total, chunk index/count, server message code, or filename. UI copy maps code and parameters to EN/VI. Unknown codes render a localized generic activity plus technical code in expanded details; raw provider strings never become primary UI copy.

### 12.3 User-visible phases

The fixed phase sequence is:

`Prepare → Load model → Transcribe → Save`

Rules:

1. Mark a phase complete only after its work finishes.
2. Omit Load model only for a runtime with no model-loading step visible to this client; label omission in technical details.
3. Show stage percentage only with a real numerator and denominator from that stage.
4. Use indeterminate presentation when denominator is absent.
5. Never combine phase percentages into a synthetic global percent.
6. Show elapsed time from monotonic run start.
7. Compute ETA from a rolling 30-second throughput window only when it contains at least three samples spanning at least 10 seconds, all throughput values are positive, and coefficient of variation is at most `0.25`. Reset the window on stage or item change, pause, retry, cancellation, or throughput discontinuity. Before eligibility, show localized “Estimating…” only for a stage expected to become measurable; otherwise show no ETA. Never carry ETA across stages or items.
8. Throttle visual progress updates to avoid whole-app rerenders; retain latest event for completion.

### 12.4 Active-file and batch progress

- Active file shows phase rail, activity, optional stage percent, elapsed, optional ETA, and cancel.
- Batch shows completed count over total eligible items plus current filename. This count is not presented as processing percentage.
- Failed and cancelled items remain in denominator and receive explicit status.
- Advanced logs are collapsed by default, chronological, bounded, copyable, and free of access tokens or private response bodies.

### 12.5 Cancellation implementation requirements

| Runtime | Required cancellation behavior |
| --- | --- |
| Local ASR | Use run-scoped cooperative cancellation only when the inference runtime proves interruptible and acknowledges stop; otherwise terminate the active ASR worker, preserve Cache Storage model assets, and lazily recreate the singleton for retry/next work |
| Local conversion | Use cooperative ffmpeg cancellation only when the runtime proves interruptible and acknowledges stop; otherwise terminate the active ffmpeg worker and lazily recreate it without affecting the ASR worker or model Cache Storage |
| Server CPU | Call existing `POST /api/cancel/:jobId`, then unsubscribe/abort SSE in all terminal paths |
| Cloudflare | Abort current fetch and prevent subsequent chunks from starting |

The adapter chooses cooperative cancellation only for a provider/version covered by an interruptibility test. Otherwise it terminates the active worker. Cancellation remains `Cancelling` until cooperative acknowledgement, remote acknowledgement, fetch/SSE abort completion, or worker termination is confirmed. Late events with old run IDs are ignored. Persistent Cache Storage model assets survive worker termination; in-memory pipelines and ffmpeg state may be lost and are recreated lazily.

Singleton means at most one live worker per type. It does not require retaining one worker forever: cancellation may reduce the live count to zero, and later work may create one replacement. Normal navigation and completed jobs reuse live workers. `clearLocalWorkerState()` remains the explicit full cleanup path, but cancellation may use a narrower per-type termination path that does not delete Cache Storage.

Cancellation is not an error. It uses neutral status, no destructive toast, and leaves item retryable.

## 13. Transcript canonical model and editor

### 13.1 Canonical representation

Ordered transcript segments are the source of truth. The canonical editor and schema-2 persistence model uses integer relative milliseconds named `startMs` and `endMs`; `start` and `end` in seconds exist only at runtime-adapter and legacy-parser boundaries. Segment order is array order; timestamps never reorder the array. Every string entering canonical normalization must first pass the Unicode-scalar validation in Section 15.4; normalization never repairs malformed UTF-16 or inserts `U+FFFD`. Normalize each segment’s text with the pinned `CANONICAL_WS` algorithm in Section 15.4: replace each maximal non-empty run of `CANONICAL_WS` with one ASCII `U+0020`, then remove leading and trailing `U+0020`. Do not apply NFC, NFKC, case folding, or punctuation changes. Derived raw text is the non-empty normalized segment texts joined with exactly one ASCII space. Each normalized segment must be at most 1 MiB UTF-8, and the final joined text must be at most 16 MiB UTF-8. Section 15.4 is the normative persisted/synced schema.

Canonical subtitle timing is valid only when every segment, including a segment whose normalized text is empty, satisfies all of these invariants: `startMs` and `endMs` are safe integers from `0` through `604800000` inclusive; `endMs >= startMs`; and each segment after the first has `startMs >= previous.endMs`. These are relative milliseconds from media start, not UTC epoch milliseconds. The seven-day maximum is a protocol/storage cap. Local input over the cap becomes Needs attention and cannot sync; remote input over the cap is rejected. No path silently clamps to the cap, including migration. Subtitle eligibility first validates timing globally across the complete ordered segment array. Only after that validation may emission omit normalized-empty segments. If no non-empty cues remain, SRT/VTT export is unavailable and the UI gives the explicit localized reason “No non-empty subtitle cues.” Validating emitted cues alone is prohibited.

Every canonical write regenerates `text` from canonical segments in the same transaction. TXT uses regenerated document text. SRT and VTT format `startMs`/`endMs` as subtitle timestamps without floating-point conversion. Schema-2 JSON uses the exact payload in Section 15.4 and must satisfy the derivation invariant.

Runtime adapters convert provider-emitted second values before creating canonical editor state. A valid value is finite and non-negative, and `seconds * 1000` must remain finite, within JavaScript’s safe-integer magnitude, and within `0..604800000` before rounding. Convert it with `Math.round(seconds * 1000)`, then apply the same forward overlap clamp used below. A negative, non-finite, unsafe, or over-cap runtime value makes the local result Needs attention and prevents upload; it is never silently capped. Adapter tests cover values around half-millisecond rounding, safe/range checks, and overlap normalization.

### 13.2 Legacy records and seconds conversion

The exact legacy schema and field disposition are normative in Section 15.4. Remote legacy import and local IndexedDB v1 migration deliberately differ:

1. **Remote legacy timing is strict.** Each `start` and `end` must be a finite JSON number whose checked `Math.round(value * 1000)` result is within `0..604800000`. Reject negative values, `endMs < startMs`, `startMs < previous.endMs`, unsafe products, over-cap values, and every other noncanonical timing condition. Remote import never repairs timing.
2. **Local v1 timing permits only forward repair.** Process segments in array order. Let `previousEndMs` be `0` for the first segment and the repaired prior segment’s `endMs` thereafter. For each structured-clone number, a finite non-negative value converts with `Math.round(value * 1000)` after checking that the product is finite, safely representable, and within `0..604800000`. A non-finite or negative raw start becomes `previousEndMs`; a non-finite or negative raw end becomes the repaired raw start. Then set `startMs = max(rawStartMs, previousEndMs)` and `endMs = max(rawEndMs, startMs)`. Any non-negative finite value with an unsafe or over-cap product is noncanonicalizable and follows local migration-quarantine disposition; it is never capped.
3. Process scalar-valid segment text in array order, normalize it under Section 13.1, and regenerate canonical `text`; a mismatching legacy top-level `text` is not a failure when segments exist.
4. Local missing, non-string, empty, all-`CANONICAL_WS`, oversize, or duplicate segment IDs use the deterministic repair in Section 15.4. A malformed-scalar string is noncanonicalizable rather than repairable. Remote legacy input rejects every invalid ID.
5. A local zero-segment record uses the distinct deterministic empty-record ID formula in Section 15.4, `startMs = 0`, `endMs = 0`, and normalized legacy `text`. A non-empty zero-length cue is subtitle-eligible; an only empty cue leaves SRT/VTT unavailable with “No non-empty subtitle cues.” Remote legacy import may synthesize the same canonical zero-segment result only after every other field passes strict remote validation.
6. Size checks occur after text normalization. Every canonical segment text must be at most 1 MiB UTF-8. For a zero-segment legacy record, normalized fallback `text` must itself be at most 1 MiB because it becomes one segment; a fallback over 1 MiB is not synthesizable even when it is at most the 16 MiB legacy intake cap. For non-empty segments, derive the final joined canonical `text` and require it to be at most 16 MiB UTF-8 even when every segment passes its individual limit. Remote legacy violation rejects and quarantines the complete remote record; local v1 violation is noncanonicalizable and follows the copy-before-delete/abort migration-quarantine rules. Never truncate or split text solely to satisfy either limit. Schema-2 remote parsing enforces the same individual 1 MiB and aggregate 16 MiB checks.

These conversions are deterministic and idempotent. Parser, migration, repository-read, editor, export, and payload-hash fixtures must produce identical canonical payload bytes from the same canonicalizable legacy input. Noncanonicalizable local input produces no schema-2 payload or accepted-payload hash.

### 13.3 Document view

Document view provides continuous prose editing. To preserve segment ownership:

- Render segment-backed editable blocks with document typography and minimal timestamp chrome, not one uncontrolled textarea detached from segments.
- Editing a block updates that segment text; persisted/exported text uses the pinned `CANONICAL_WS` segment algorithm in Section 15.4.
- Enter splits at the caret. The original segment keeps its ID, `startMs`, and `endMs` and receives the left text. The new segment gets a preallocated stable ID carried by the edit action, right text, and zero-length timing `[originalEndMs, originalEndMs]`.
- Backspace at the start of a segment merges it into the previous segment. The surviving previous segment keeps its ID and `startMs`, takes the later segment’s `endMs`, and joins the two normalized non-empty texts with one ASCII space; the later segment is removed.
- A single-line paste replaces the current selection inside its segment. A multiline paste splits on `CRLF` or one `LF`, `CR`, `U+2028`, or `U+2029`: the first part replaces the selection in the original segment; each additional part creates a segment in paste order with a preallocated stable action ID and zero-length timing at the original segment’s `endMs`. When an edit command carries deterministic adjacent millisecond timing—for example, importing already-timed cues—use those validated adjacent times instead, then apply the same forward-clamp invariants. Clipboard text alone never invents duration.
- A selection spanning segments deletes covered text/segments first, merges surviving boundary text using the merge rule, then applies split/paste rules at that deterministic caret. IDs of surviving boundary segments remain stable.

Structural reducer actions carry their operation ID and all new segment IDs; the reducer never generates IDs during application or replay. Given the same canonical base document and action payload, normalization, segment order/timing, derived text, subtitle cues, JSON, and payload hash are byte-for-byte deterministic.

### 13.4 Timeline view

Timeline shows each segment with editable start, end, and text while storing `startMs`/`endMs` internally. Display/input formatters convert user-facing time syntax to bounded integer relative milliseconds without retaining floating-point seconds. Invalid, unsafe, over-seven-day, reversed, or overlapping timing remains a local Needs-attention issue, blocks subtitle export and sync enqueue for that draft, and provides a focused correction action; TXT copy/export remains available from valid text.

Changing segment text or structure immediately updates both views through one reducer. Switching views never reparses raw text.

### 13.5 Editing functions

- Search traverses segment array order and text offsets within each segment, is case-insensitive by default, and wraps after the last/first match for next/previous. Preserve the active match by segment ID plus normalized text offset when that match survives a mutation. Otherwise reset deterministically to the first match at or after the mutated segment/offset, wrapping once; if none remain, clear the active match. A no-result search keeps focus in the search input and announces the localized zero-result state.
- Undo/redo covers text, title, segment split/merge, and timestamp changes. Keep a bounded session history; persisted revisions are not the undo stack.
- Copy defaults to current document text. Secondary copy options may include current segment or timestamped text.
- Export supports TXT, JSON, SRT, and VTT. Library can export without opening.
- Rename is inline, validated, and autosaved through the same mutation path.

### 13.6 Autosave and unsaved input protection

1. Update in-memory editor state immediately.
2. Debounce local save after 600 ms of inactivity.
3. Serialize one save at a time. If edits arrive during save, schedule another save using the newest revision.
4. App-driven navigation awaits the serialized local save. On failure, keep the current route and offer Retry or Discard. Retry repeats the save; Discard restores the last durable local revision from IndexedDB, clears the dirty draft, then performs the requested navigation.
5. When Back or Forward fires while dirty/saving, immediately restore the editor’s current history entry and present the same Retry/Discard choice for the requested destination. Retry saves then replays that destination; Discard reloads the last durable local revision then navigates. Guard replay so it does not create a popstate loop.
6. `visibilitychange` to hidden and `pagehide` initiate best-effort save only. Register the browser’s native `beforeunload` warning only while dirty or saving, and remove it once clean. Browser unload does not guarantee asynchronous IndexedDB persistence; copy must not promise otherwise.
7. Local save commits transcript, revision, and pending sync operation atomically.
8. Incoming Drive merges never replace a transcript with an active dirty editor. Stage incoming winner as a durable conflict candidate, save local draft first, then apply deterministic merge or show Needs attention if assumptions changed.

Visible save states:

| State | Meaning |
| --- | --- |
| Saved locally | IndexedDB contains current editor revision; Drive not active or no remote confirmation yet |
| Syncing | Current local revision has an active Drive operation |
| Synced | Current revision confirmed remotely and no pending operation exists |
| Needs attention | Local save failed, auth paused sync, conflict requires protection, or permanent remote error occurred |

## 14. Library behavior

### 14.1 List and search

- Default sort: `updatedAt` descending, then transcript ID ascending for deterministic ties.
- Search title, source name, and transcript text. Normalize case and Vietnamese diacritics for discovery while preserving displayed text.
- Filters: All, Local only, Pending, Syncing, Synced, Needs attention, Deleted/recovery when Undo window or recovery state applies.
- Needs-attention recovery includes bounded `migrationQuarantine` entries. It exposes reason, original v1 key, bounded JSON export, explicit repair entry point, and delete; it never presents a quarantined value as a canonical transcript or sync candidate.
- Metadata per row: title, source, updated time, language, model/runtime label, duration when known, and sync state.
- Do not show raw Drive file IDs.

### 14.2 Item actions

Every item exposes Open, Rename, Export, Delete. Desktop may use a visible overflow button; mobile uses the same visible control. No action depends on hover.

Delete flow:

1. Transactionally set `deletedAt`, generate a new `deletionId`, clear `restoredFromDeletionId`, increment revision, write the compact tombstone, and enqueue remote deletion state. Every later deletion generates a different `deletionId`.
2. Remove item from default list immediately.
3. Show confirmation toast with Undo for 10 seconds.
4. Undo/Restore may act only on a tombstone the user action observed. It clears deletion, sets `restoredFromDeletionId` to that exact tombstone’s `deletionId`, writes a greater revision, and enqueues upsert. No background or stale live mutation may create, copy, or guess this field. Undo remains available after toast expiry through recovery only when product exposes a deleted filter.
5. A restored live record remains subordinate to any later tombstone with a different `deletionId`, even if it restored an older deletion.
6. Tombstone auxiliary metadata is compacted only under the retention policy in Section 15.10, never merely because remote deletion succeeded; causal deletion identity remains permanent.

### 14.3 Sync summary

Library header shows identity, last successful reconcile time, pending operation count, and Sync now. “Last sync” means completed reconcile, not attempted sync. Auth or network failure remains visible until recovered.

## 15. Google identity and Drive sync

### 15.1 Scope and privacy

Request exactly:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/drive.appdata`

Use identity scopes for available optional name, verified email, and optional avatar. Use Drive scopes only for Whisdom-created transcript records in `appDataFolder`. Never upload source media or settings. Explain that `appDataFolder` content is app-private but stored in the user’s Google Drive account.

### 15.2 Authentication state machine

| State | Event | Next state |
| --- | --- | --- |
| Signed out | Connect | Opening |
| Opening | Token + identity success | Connected |
| Opening | Popup dismissed | Signed out with contextual dismissal message |
| Opening | Auth error | Needs reconnect |
| Connected | Near expiry on same page | Refreshing |
| Refreshing | `prompt: ''` token success before watchdog | Connected |
| Refreshing | Popup required/blocked, timeout, interaction required, or auth error | Needs reconnect |
| Connected/Needs reconnect | Sign out | Signed out |
| Connected/Needs reconnect | Revoke with usable token | Revoking until callback; then Signed out with confirmed/unconfirmed result |
| Connected/Needs reconnect | Revoke without usable token | Signed out; revocation unconfirmed with permissions link |

Google Identity Services supplies short-lived access tokens only; browser GIS does not supply a refresh token. Each auth attempt has a unique attempt ID. The success callback and GIS `error_callback`, when available, may settle only the current ID. A bounded watchdog invalidates the ID on timeout, moves to Signed out or Needs reconnect as appropriate, and ignores every late callback. Popup dismissal/blocking and interaction-required responses must settle visibly.

Access tokens and `expires_in`-derived expiry remain memory-only. While the same page remains connected, a near-expiry refresh may attempt GIS with `prompt: ''`; popup requirement/blocking, timeout, or interaction-required moves to Needs reconnect. After reload, stale non-secret identity metadata may be displayed as stale, but Drive access requires a user-initiated reconnect. There is no launch-time silent token reacquisition. Never persist an access token, authorization header, refresh token, or ID token.

Sign out clears in-memory credentials and pauses sync; local transcripts remain. Revoke success is shown only after Google’s revoke callback confirms success. On callback failure/timeout, clear local credential/session state but report that revocation is unconfirmed and link to Google Account permissions at `https://myaccount.google.com/permissions`. If no usable token exists, do not claim or simulate revocation: clear local state, state that revocation is unconfirmed, and provide the same link. Revocation does not erase existing backup files. A separate “Delete Drive backup” operation is out of scope.

Reconnect preserves local records, pending operations, tombstones, account-neutral drafts, and conflict candidates. On a different-account connection, sync defaults to paused and no transcript is uploaded. Present exactly: Cancel; Reconcile without upload; or Sync local transcripts to new account. Reconcile without upload may fetch, strictly validate, and stage remote candidates for preview, but it must not apply a remote winner over account-neutral local transcript or draft state without explicit user confirmation; it may not enqueue or push local transcripts. “Sync local transcripts to new account” requires a separate explicit disclosure confirmation naming that transcript JSON—not media or settings—will be uploaded. Only that confirmed choice associates/enqueues local transcripts for the new account. Never silently disclose local transcripts to a different account.

### 15.3 Identity presentation

- After token acquisition, fetch OIDC UserInfo with the access token. Cap the response at 64 KiB before parsing; require a plain object and expected field types. Before any display derivation, URL parsing, scalar/UTF-8 counting, account-key encoding, or persistence, every `sub`, `name`, `email`, and `picture` string must pass the Unicode-scalar validation in Section 15.4. These fields are not whitespace-normalized. Then require non-empty `sub` containing at least one scalar outside `CANONICAL_WS` and up to 255 scalar values, optional `name` up to 256 scalar values, optional `email` up to 320 scalar values, optional `email_verified` as a boolean, and optional `picture` URL up to 2,048 scalar values. Email may be displayed only when non-empty and `email_verified === true`. An invalid optional display field is discarded and follows its normal fallback; invalid required `sub` rejects identity activation. The normalized issuer is fixed as `https://accounts.google.com`. Encode stable account key as the unambiguous length-prefixed pair `<issuer-scalar-length>:<issuer><sub-scalar-length>:<sub>`; email is display metadata and never an identity key.
- Header control displays avatar or initials/generic glyph, display label, and concise sync indicator. Display label fallback order is non-empty bounded name, verified email, then localized “Google account.” Initials derive from name, then verified email; when neither yields initials, use a generic account glyph. Account menu shows available bounded name and verified email, connection state, last sync, pending count, Sync now, Sign out, and Revoke access.
- For avatar, validate the picture string as a Unicode scalar sequence before URL construction or display. Then validate the initial URL before any request: scheme must be HTTPS, hostname must be in the explicit allowlist (initially exactly `lh3.googleusercontent.com`), credentials must be absent, and the port must be empty or the standard HTTPS port `443`. Fetch with `redirect: "error"`, a five-second timeout, and a 1 MiB streamed byte cap; require an `image/*` MIME type, then render a revocable Blob URL. Any redirect is rejected because browser Fetch cannot expose or count cross-origin redirect hops. Never inspect `response.url` as a redirect-chain security control, and never place the remote picture URL directly in `img src`. Redirect rejection, CORS prevention, timeout, invalid MIME, oversize response, malformed Unicode, or any validation failure falls back to initials or the generic account glyph.
- Broken avatar falls back to initials or the generic account glyph without hiding identity.
- Signed-out UI says “Not connected”; it never says Guest when a stale or failed connection is the relevant state.

Static-host CSP must enumerate narrow endpoints: `script-src https://accounts.google.com/gsi/client`; `frame-src https://accounts.google.com`; `connect-src https://accounts.google.com https://openidconnect.googleapis.com https://oauth2.googleapis.com https://www.googleapis.com https://lh3.googleusercontent.com`; and `img-src 'self' blob: data:`. Keep the project’s required self directives. Do not add wildcard hosts. Calls are limited to GIS under `https://accounts.google.com/gsi/`, UserInfo `https://openidconnect.googleapis.com/v1/userinfo`, revoke `https://oauth2.googleapis.com/revoke`, Drive `https://www.googleapis.com/drive/v3/` and `https://www.googleapis.com/upload/drive/v3/`, and bounded avatar fetch on the exact allowlisted origin `https://lh3.googleusercontent.com/`.

### 15.4 Remote record

Each remote file is a versioned envelope in `appDataFolder` and uses MIME type `application/vnd.whisdom.transcript+json`. Validate `transcriptId` as a Unicode scalar sequence before UTF-8 encoding or `remoteKey` hashing. Then let `remoteKey = base64url(SHA-256(UTF-8(transcriptId)))`, using the RFC 4648 URL-safe alphabet without padding. It is exactly 43 ASCII characters and must be recomputed from the parsed JSON `transcriptId` before accepting a file. A malformed-scalar `transcriptId` is rejected and never derives a key. The deterministic display name is `whisdom-transcript-<remoteKey>.json`. Drive `appProperties` contain `whisdomTranscriptKey=<remoteKey>` and a separate bounded decimal `whisdomSchemaVersion=<schemaVersion>`. Raw `transcriptId` must never appear in a filename or appProperty; it remains inside JSON.

The current envelope schema version is `2`; the supported lower and upper version bounds are both `2`. Tables in this section are normative. Every listed object is an exact allowlist: every field is required unless explicitly stated otherwise, and unknown or missing fields are rejected. Numeric strings are rejected. “Safe integer” means a JSON number for which `Number.isSafeInteger` is true.

**Unicode scalar precondition.** Every string in a schema-2 envelope or payload, every UserInfo/avatar-URL-derived string, and every remote or local legacy string must be a valid Unicode scalar sequence before canonical whitespace handling, URL/display derivation, scalar or UTF-8 byte counting, persistence into a canonical store, `remoteKey` derivation, RFC 8785 serialization, or accepted-payload hashing. Implement validation over JavaScript UTF-16 code units: each high surrogate `U+D800..U+DBFF` must be immediately followed by one low surrogate `U+DC00..U+DFFF`; every low surrogate must be immediately preceded by one high surrogate. Reject lone, reversed, or otherwise unpaired surrogates. A valid surrogate pair counts as one scalar value. Never repair malformed input or replace it with `U+FFFD`. Schema-2 remote input rejects any malformed-scalar string. Malformed local legacy input follows the exact migration-quarantine disposition below and is never canonicalized, payload-hashed, or uploaded. RFC 8785 input may be formed only after this validation; malformed Unicode is a hard parser/payload-hash error. This precondition does not apply to `bodyByteHash`, which hashes raw response bytes before UTF-8 decoding.

**Pinned canonical whitespace.** `CANONICAL_WS` is the immutable protocol set containing exactly these Unicode scalar values and inclusive ranges: `U+0009..U+000D`, `U+0020`, `U+0085`, `U+00A0`, `U+1680`, `U+2000..U+200A`, `U+2028`, `U+2029`, `U+202F`, `U+205F`, `U+3000`, and `U+FEFF`. No other scalar is whitespace for this protocol, regardless of JavaScript engine or Unicode version. `U+FEFF` is included; zero-width space `U+200B` is not. Scalar validation always runs first. Segment text and legacy transcript text normalization replaces each maximal non-empty run of `CANONICAL_WS` with one ASCII `U+0020`, then removes leading and trailing `U+0020`. Title canonicalization removes only leading and trailing runs of `CANONICAL_WS`; it preserves every internal scalar and its UTF-8 bytes exactly, including internal whitespace runs. Neither algorithm applies NFC, NFKC, case folding, punctuation changes, or any engine-defined `trim()`/regular-expression whitespace behavior. `sourceName`, `language`, `modelId`, and IDs are never whitespace-normalized; their exact scalar-valid strings are preserved when accepted. Any non-empty `language`, `modelId`, `transcriptId`, segment ID, legacy record ID, or identity `sub` must contain at least one scalar outside `CANONICAL_WS` so blank-looking identifiers cannot enter UI or protocol state. Title satisfies the same rule after its outer-only canonicalization.

UTF-8 limits count encoded bytes without truncation after scalar validation. Scalar-value limits count Unicode scalar iteration, not UTF-16 code units. Every “code-point” limit elsewhere in this specification means this validated scalar-value count.

Epoch fields and relative timing fields use different units and domains. `updatedAt`, `deletedAt`, and payload `createdAt` are UTC epoch milliseconds from `946684800000` (`2000-01-01T00:00:00.000Z`) through `4102444800000` (`2100-01-01T00:00:00.000Z`), inclusive. `startMs` and `endMs` are milliseconds relative to media start from `0` through `604800000` (seven days), inclusive. Zero is valid for relative timing and never valid for an epoch timestamp.

#### Schema-2 envelope: exact allowlist

| Field | Exact JSON type | Required/nullability | Bounds and units | Semantics |
| --- | --- | --- | --- | --- |
| `schemaVersion` | number | Required; non-null | Safe integer exactly `2` | Selects this schema; every other value is unsupported |
| `transcriptId` | string | Required; non-null | 1..512 UTF-8 bytes; at least one scalar outside `CANONICAL_WS` | Logical ID carried only by the envelope; preserve exactly; it must not appear inside `transcript` and is never truncated |
| `revision` | number | Required; non-null | Safe integer `0..Number.MAX_SAFE_INTEGER` | Monotonic revision for each accepted mutation |
| `updatedAt` | number | Required; non-null | Bounded UTC epoch milliseconds | Time of this envelope mutation |
| `deletedAt` | number or null | Required | `null` or bounded UTC epoch milliseconds | `null` means live; a number means tombstone |
| `deviceId` | string | Required; non-null | Exactly 24 ASCII characters matching `^d_[A-Za-z0-9_-]{22}$`; suffix decodes to exactly 16 bytes and canonical unpadded base64url re-encoding must match | Stable random browser-profile ID, never account-derived or fingerprint-derived |
| `deletionId` | string or null | Required | `null` or exactly the canonical 24-character `x_` form matching `^x_[A-Za-z0-9_-]{22}$` with the same 16-byte decode/re-encode rule | Required non-null for tombstones; required `null` for ordinary live records; a restored live record also uses `null` here |
| `restoredFromDeletionId` | string or null | Required | `null` or exact canonical `x_` form | Always `null` for tombstones and ordinary live records; non-null only for an explicit live restore that observed this exact deletion ID, and preserved by descended live mutations |
| `transcript` | object or null | Required | Exact canonical payload below or `null` | Non-null iff live; `null` iff tombstone |

Legal combinations are exact: a tombstone has numeric `deletedAt`, canonical non-null `deletionId`, null `restoredFromDeletionId`, and null `transcript`. An ordinary live record has null `deletedAt`, null `deletionId`, null `restoredFromDeletionId`, and a payload. A restored live record differs only by a canonical non-null `restoredFromDeletionId`. No unknown envelope field is accepted.

#### Canonical live transcript payload: exact allowlist

| Field | Exact JSON type | Required/nullability | Bounds and units | Semantics |
| --- | --- | --- | --- | --- |
| `title` | string | Required; non-null | After removing only outer `CANONICAL_WS` runs: 1..512 scalar values, at most 2,048 UTF-8 bytes, and at least one scalar outside `CANONICAL_WS` | Canonical value has only outer `CANONICAL_WS` removed; preserve every internal scalar and run exactly; reject a remote value that is not already canonical |
| `sourceName` | string | Required; non-null | 0..2,048 scalar values and at most 8,192 UTF-8 bytes | Preserve exactly without whitespace normalization; display metadata only; never a fetch target or model instruction |
| `language` | string | Required; non-null | 1..128 scalar values, at most 512 UTF-8 bytes, and at least one scalar outside `CANONICAL_WS` | Preserve exactly without whitespace normalization; `auto` or a catalog code; preserve a bounded unknown legacy code and display Unknown, but never execute it as a model instruction until explicitly remapped |
| `modelId` | string | Required; non-null | 1..128 scalar values, at most 512 UTF-8 bytes, and at least one scalar outside `CANONICAL_WS` | Preserve exactly without whitespace normalization; preserve bounded unknown IDs and use a display fallback; unknown IDs do not become executable selections |
| `mode` | string | Required; non-null | Exact enum `local-webgpu`, `cloudflare-ai`, `local-wasm`, or `server` | Processing mode that produced the transcript |
| `createdAt` | number | Required; non-null | Bounded UTC epoch milliseconds | Transcript creation instant; distinct from envelope `updatedAt` |
| `text` | string | Required; non-null | At most 16 MiB UTF-8 | Must exactly equal canonical derivation from `segments` |
| `segments` | array | Required; non-null | 1..100,000 entries | Transcript order; every entry is the exact segment object below |

The payload contains no `id`, no `updatedAt`, and no extension fields. The repository may separately retain bounded sync/quarantine implementation metadata, but that data never enters this payload, exports, or its RFC 8785 payload hash.

#### Canonical segment: exact allowlist

| Field | Exact JSON type | Required/nullability | Bounds and units | Semantics |
| --- | --- | --- | --- | --- |
| `id` | string | Required; non-null | 1..255 scalar values, at most 1,024 UTF-8 bytes, and at least one scalar outside `CANONICAL_WS` | Stable, unique within this transcript, and preserved without whitespace normalization |
| `startMs` | number | Required; non-null | Safe integer `0..604800000`; relative milliseconds | Inclusive cue start relative to media start |
| `endMs` | number | Required; non-null | Safe integer `0..604800000`; relative milliseconds | Cue end relative to media start; must be `>= startMs` |
| `text` | string | Required; non-null | At most 1 MiB UTF-8 | Already normalized by Section 13.1; may be empty |

Array order is transcript order. For each entry after the first, `startMs >= previous.endMs`. No segment has unknown fields. Schema-2 remote input must already use the exact `CANONICAL_WS` segment normalization; each segment is measured after normalization and must be at most 1 MiB UTF-8, and the exactly derived joined payload `text` must be at most 16 MiB UTF-8. Failure rejects/quarantines the complete remote record with no partial application. The seven-day limit is a protocol/storage cap: over-cap local runtime/editor input remains Needs attention outside canonical sync state; over-cap local legacy input follows `migrationQuarantine`; and over-cap remote schema-2 or legacy input is rejected. Silent capping is prohibited.

#### Normative JSON examples

All strings in these examples are valid Unicode scalar sequences. Example bytes and hashes are normative only after the scalar precondition, exact-field validation, canonical-value validation, and all stated bounds succeed.

Live record:

```json
{
  "schemaVersion": 2,
  "transcriptId": "tr_sample_001",
  "revision": 3,
  "updatedAt": 1785283201000,
  "deletedAt": null,
  "deviceId": "d_AAAAAAAAAAAAAAAAAAAAAA",
  "deletionId": null,
  "restoredFromDeletionId": null,
  "transcript": {
    "title": "Sample transcript",
    "sourceName": "sample.wav",
    "language": "en",
    "modelId": "Xenova/whisper-base",
    "mode": "local-webgpu",
    "createdAt": 1785283200000,
    "text": "Hello world.",
    "segments": [
      {
        "id": "seg_001",
        "startMs": 0,
        "endMs": 1250,
        "text": "Hello world."
      }
    ]
  }
}
```

Tombstone:

```json
{
  "schemaVersion": 2,
  "transcriptId": "tr_sample_001",
  "revision": 4,
  "updatedAt": 1785283202000,
  "deletedAt": 1785283202000,
  "deviceId": "d_AAAAAAAAAAAAAAAAAAAAAA",
  "deletionId": "x_AAAAAAAAAAAAAAAAAAAAAA",
  "restoredFromDeletionId": null,
  "transcript": null
}
```

#### Runtime, legacy, parser, and hash conformance

Runtime result adapters, the canonical editor, JSON/TXT/subtitle exporters, IndexedDB repositories, schema-2 parser, migration, and hash code all consume or produce this exact payload. Runtime seconds and legacy `start`/`end` seconds convert only under Section 13.2; canonical code uses `startMs`/`endMs`.

##### Exact v1/current legacy contract

The isolated legacy parser accepts only a non-array plain object with exactly the top-level fields `{id,title,sourceName,language,modelId,mode,createdAt,updatedAt,text,segments}`. Every segment has exactly `{id,start,end,text}`, except that local IndexedDB v1 migration may repair a missing `id` under the rule below. Every other unknown or missing top-level or segment field is noncanonicalizable. Every legacy string must pass the Unicode scalar precondition before any other operation.

| Legacy field | Exact input and bound | Canonicalization or failure |
| --- | --- | --- |
| `id` | Scalar-valid string, non-empty, containing at least one scalar outside `CANONICAL_WS`. Remote intake is at most 16 KiB UTF-8. Local IDs have no arbitrary intake truncation. | Preserve exactly without whitespace normalization. IDs of 1..512 UTF-8 bytes may sync. A local ID over 512 bytes remains recoverable in `migrationQuarantine` as Needs attention and cannot upload until explicit repair creates a canonical ID. Empty, all-`CANONICAL_WS`, non-string, malformed-scalar, or remote-over-16-KiB input is noncanonicalizable. Never truncate. |
| `title` | String. After removing only leading and trailing `CANONICAL_WS` runs, 1..512 scalar values and at most 2,048 UTF-8 bytes. | Canonically remove only outer `CANONICAL_WS`; preserve every internal scalar and run exactly. Empty/all-`CANONICAL_WS`, oversize, non-string, or malformed-scalar input is noncanonicalizable; never invent a title or apply NFC/NFKC. |
| `sourceName` | String, 0..2,048 scalar values and at most 8,192 UTF-8 bytes. | Preserve exactly without whitespace normalization. Wrong type, malformed scalar sequence, or oversize input is noncanonicalizable. |
| `language` | Non-empty string containing at least one scalar outside `CANONICAL_WS`, at most 128 scalar values and 512 UTF-8 bytes. | Preserve exactly without whitespace normalization. Preserve a bounded unknown value and display Unknown; never execute it until remapped. Wrong type, empty/all-`CANONICAL_WS`, malformed, or oversize input is noncanonicalizable. |
| `modelId` | Non-empty string containing at least one scalar outside `CANONICAL_WS`, at most 128 scalar values and 512 UTF-8 bytes. | Preserve exactly without whitespace normalization. Preserve a bounded unknown value and use the defined display fallback; never make it executable. Wrong type, empty/all-`CANONICAL_WS`, malformed, or oversize input is noncanonicalizable. |
| `mode` | String exactly `local-webgpu`, `cloudflare-ai`, `local-wasm`, or `server`. | Any other value or type is noncanonicalizable. |
| `createdAt`, `updatedAt` | Strings in exact canonical `Date.prototype.toISOString()` form. Parse to a finite epoch, require `new Date(epochMs).toISOString()` to equal the original, and require the Section 15.4 epoch range. | Convert to epoch milliseconds. Invalid type, spelling, round-trip, scalar sequence, or range is noncanonicalizable. This replaces every older claim that a canonical record may retain an invalid timestamp. |
| `text` | String at most 16 MiB UTF-8 at intake. | Intake/fallback only. If `segments` is non-empty, rederive canonical text from normalized segments, ignore a legacy mismatch, and require the final joined text to be at most 16 MiB UTF-8. If `segments` is empty, normalize legacy text with the `CANONICAL_WS` segment algorithm and require the result to be at most 1 MiB UTF-8 because it becomes one segment. Wrong type, malformed scalar sequence, intake oversize, post-normalization synthesized text over 1 MiB, or derived joined text over 16 MiB is noncanonicalizable. |
| `segments` | Array with 0..100,000 entries. | Remote legacy requires every segment to pass exact shape, type, ID, text, and strict timing validation. Local migration permits only the documented ID and timing repairs. Non-array or oversize input is noncanonicalizable. |

| Legacy segment field | Remote legacy import | Local IndexedDB v1 migration |
| --- | --- | --- |
| `id` | Non-empty scalar-valid string containing at least one scalar outside `CANONICAL_WS`, of at most 255 scalar values and 1,024 UTF-8 bytes, globally unique in the transcript. Otherwise reject. Preserve accepted IDs exactly without whitespace normalization. | Keep the first valid unique ID. For a missing, non-string, empty, all-`CANONICAL_WS`, oversize, or duplicate ID, use `seg_` plus the 43-character unpadded RFC 4648 base64url SHA-256 digest of the exact UTF-8 bytes of the scalar-valid JavaScript string ``${legacyId}\u0000${arrayIndex}``, where `arrayIndex` is the zero-based decimal index with no sign or leading zero except `0`. Including the index makes replacements deterministic and distinct by position. A malformed-scalar ID string is noncanonicalizable and is not repaired. A digest failure or generated collision is noncanonicalizable; never substitute random data. A malformed `legacyId` is rejected before hashing. The resulting 47-ASCII-character ID satisfies the schema-2 bound. |
| `start`, `end` | JSON numbers. Reject negative, non-finite/unrepresentable, unsafe-product, over-cap, reversed, or overlapping timing. Convert accepted values with checked `Math.round(value * 1000)` and do not repair. JSON cannot represent `NaN` or infinities. | Structured-clone numbers. Apply only Section 13.2 non-finite/negative and forward-overlap repair. A finite non-negative unsafe or over-seven-day product is noncanonicalizable and quarantined; never cap. |
| `text` | Scalar-valid string; normalize with the exact `CANONICAL_WS` segment algorithm; normalized value must be at most 1 MiB UTF-8. After all segments pass, the final joined canonical `text` must be at most 16 MiB UTF-8. | Same. Wrong type, malformed scalar sequence, post-normalization segment over 1 MiB, or final joined text over 16 MiB is noncanonicalizable. Remote import rejects/quarantines the complete record; local migration uses migration quarantine. Never truncate or split to fit. |

For a canonicalizable record with zero legacy segments, first normalize legacy `text` with the exact `CANONICAL_WS` segment algorithm and require the normalized result to be at most 1 MiB UTF-8. A normalized result of exactly 1 MiB is accepted; 1 MiB plus one byte is not synthesizable even though the legacy intake permits up to 16 MiB. Then synthesize one segment whose ID is `seg_` plus the 43-character unpadded RFC 4648 base64url SHA-256 digest of the exact UTF-8 bytes of the scalar-valid JavaScript string ``${legacyId}\u0000legacy-empty\u00000``. Its `startMs` and `endMs` are `0`, and its text is that normalized value. This distinct domain separator prevents reuse of the index-0 repair input, and the resulting 47-character ASCII ID is within the schema bound. Canonical derived `text` then follows the segment array. Never truncate or split fallback text to make synthesis pass.

##### Legacy disposition

**Remote legacy import.** Any noncanonicalizable field, malformed Unicode, unknown or missing field, invalid timing, missing/invalid/duplicate segment ID, post-normalization 1 MiB segment/synthesis failure, aggregate 16 MiB derived-text failure, or other bound failure rejects the complete body. Do not import a partial record. Store only bounded remote quarantine metadata under the existing Drive invalid-record policy in Section 15.8.

**Local IndexedDB v1 migration.** Apply only outer-title `CANONICAL_WS` removal, canonical-text rederivation with the post-normalization 1 MiB per-segment/synthesis and 16 MiB aggregate limits, deterministic missing/non-string/empty/all-`CANONICAL_WS`/oversize/duplicate segment-ID repair, deterministic timing forward repair, and zero-segment synthesis. If any noncanonicalizable issue remains, do not fabricate canonical data and remove nothing until quarantine copy succeeds. Copy the original structured-clone value into the dedicated v2 `migrationQuarantine` store when its measured bounded JSON serialized representation is at most 25 MiB. Key it with a generated canonical quarantine ID and include a bounded reason code plus the original v1 key. In the single upgrade transaction, order operations as: put the complete quarantine entry; await put success; only then delete that source entry from the v1 `transcripts` store. If measurement exceeds 25 MiB or serialization/put fails, retain only a bounded in-memory migration-failure report containing reason code and original v1 key; commit no v2 metadata, delete nothing, and abort the upgrade transaction so the original v1 database remains intact. The report is re-derived on retry and drives the Needs-attention migration-blocked UX. Local structured-clone migration quarantine has no raw HTTP response and therefore no `bodyByteHash`, `bodyHashScope`, or `sizeAtLeast`. It must not serialize malformed strings merely to manufacture a fingerprint. The preserved structured-clone object plus bounded reason/key metadata remains the recovery evidence under these migration rules. For a canonicalizable record whose v1 key already equals canonical `transcriptId`, replace it atomically with cursor `update`; do not follow that update with a delete. If the keys differ, put the complete schema-2 record at canonical `transcriptId`, await success, then delete the old v1 key. Any update/put/delete failure aborts the transaction. Thus valid siblings migrate when the transaction can commit, bounded invalid values remain recoverable, and no record is silently lost.

Recovery UI lists `migrationQuarantine` entries as Needs attention and permits bounded JSON export or delete. Export must enforce the 25 MiB limit and fail safely when the original cannot be represented as JSON. Quarantined values are never treated as schema 2, uploaded, used for `remoteKey`, RFC 8785 serialized, payload-hashed, or assigned a raw-body fingerprint. Only explicit repair that creates a fully canonical record may enter `transcripts` and sync.

The conflict payload hash remains lowercase hexadecimal SHA-256 over RFC 8785 canonical JSON of an exact four-key object containing `deletedAt`, `deletionId`, `restoredFromDeletionId`, and `transcript`, with each value copied from the fully validated record and every key and null present. Scalar validation precedes RFC 8785 serialization; malformed Unicode is a hard parser/payload-hash error and produces no RFC 8785 digest. For a live record, `transcript` is byte-for-byte the exact payload allowlist above: no envelope `transcriptId`/`updatedAt`, no field aliases, and segment keys are `startMs`/`endMs`. Section 15.8 defines ordering use. This accepted-payload hash is distinct from `remoteKey` and the quarantine-only raw `bodyByteHash`; neither other digest participates in conflict ordering. Conformance fixtures pin the exact RFC 8785 canonical JSON bytes and expected digest; parser output, migration output, editor serialization, export serialization, and hash input must be identical.

For the normative live example, the pinned UTF-8 hash input is this exact single line (no trailing newline):

```json
{"deletedAt":null,"deletionId":null,"restoredFromDeletionId":null,"transcript":{"createdAt":1785283200000,"language":"en","mode":"local-webgpu","modelId":"Xenova/whisper-base","segments":[{"endMs":1250,"id":"seg_001","startMs":0,"text":"Hello world."}],"sourceName":"sample.wav","text":"Hello world.","title":"Sample transcript"}}
```

For the normative tombstone example, the pinned UTF-8 hash input is this exact single line (no trailing newline):

```json
{"deletedAt":1785283202000,"deletionId":"x_AAAAAAAAAAAAAAAAAAAAAA","restoredFromDeletionId":null,"transcript":null}
```

The hash fixture records the lowercase 64-character digest produced by both the implementation and an independent Web Crypto `SHA-256` oracle over these fixed bytes; fixture review fails if either digest or any canonical byte changes. The oracle is not used to canonicalize the object and therefore cannot mask field-name, field-order, omission, or unit regressions.

`deletionId` is stable for that tombstone across retries, duplicate files, reconcile, and idempotent upserts. It is generated only for a new delete event, never regenerated while rewriting the same tombstone. A valid live mutation descended from an explicit restore preserves its `restoredFromDeletionId`; unrelated or stale live state cannot synthesize or change it. A later delete replaces that live lineage with a fresh `deletionId` and null `restoredFromDeletionId`.

Remote Drive file IDs are implementation metadata only. Store them locally for update/delete efficiency; never expose them in copy, logs, URLs, exports, or analytics.

Discovery calls Drive files list with `spaces=appDataFolder`, `trashed=false`, the `whisdomTranscriptKey=<remoteKey>` appProperties predicate, pagination, and explicit fields only: `nextPageToken` plus file `id,name,mimeType,modifiedTime,appProperties,size`. After bounded JSON parsing, recompute the candidate’s remote key from its `transcriptId` and require exact equality with the requested key, filename key, and appProperty key. Retain the opaque HTTP ETag from each downloaded candidate in `syncMetadata` only when it is non-empty ASCII of at most 512 bytes. Update a known file with `PATCH` plus `If-Match` for the exact downloaded ETag; a missing/invalid ETag forces rediscovery instead of an unconditional PATCH. A precondition failure must relist, download, validate, and resolve again before any retry, so a tombstone created after the earlier read cannot be overwritten by stale live state. On a known-file `404`, clear the mapping and rediscover once before create/update. Tombstones update the remote JSON record through this same upsert path; they never trash the Drive file.

Concurrent clients can race and create duplicate Drive files; absolute remote uniqueness is not promised. Eventual uniqueness uses this protocol: discover all logical duplicates, validate each, select canonical content by Section 15.8 conflict order and then ascending Drive file ID as the deterministic tie-break when content order is identical, write/verify the canonical file, relist after the write, and enqueue a bounded cleanup job for noncanonical duplicate file IDs. After canonical verification, cleanup deletes at most 20 noncanonical files per reconcile and retries safely; failure leaves duplicates but not ambiguous canonical selection.

Legacy Drive migration recognizes existing Whisdom `TranscriptDocument` files named `{id}.json` only through a bounded legacy discovery pass; raw names are never copied into new metadata. Cap the pass by normal Drive pagination, the 25 MiB body limit, and the exact remote legacy contract in Section 15.4, including the 16 KiB remote-ID intake cap. Every downloaded legacy body uses the Section 15.8 raw-byte fingerprint disposition before decode or parse. Remote legacy timing and segment IDs are strict: no local timing or ID repair applies. Validate scalar sequences before every bound, key derivation, serialization, or accepted-payload hash operation. Only a successfully canonicalized record may be imported locally and written as a schema-2 envelope. IDs from 1 through 512 UTF-8 bytes may derive `remoteKey`; IDs from 513 bytes through 16 KiB fail the canonical target bound and therefore remain bounded remote quarantine metadata rather than a partial local transcript. Empty/all-`CANONICAL_WS` IDs, IDs above 16 KiB, malformed Unicode, and every other invalid body receive the same metadata-only disposition with `bodyByteHash` scope or bounded fingerprint-unavailable reason. Verify every new file body, recomputed key, appProperties, and canonical payload hash before enqueueing cleanup of the old file. Cleanup remains bounded to 20 old files per reconcile and never runs before verified envelope persistence. Invalid old remote files are not cleaned up by migration. Never truncate an ID. Separately, locally migrated scalar-valid IDs over 512 bytes remain recoverable in `migrationQuarantine` as Needs attention until explicit safe-ID repair creates a canonical record.

### 15.5 Local-first mutation path

All local, Cloudflare, and server transcription results enter one path:

1. Normalize result into canonical transcript.
2. Save to IndexedDB.
3. Increment revision and enqueue pending upsert in the same transaction.
4. Update UI to Saved locally.
5. Let background sync process the operation when authenticated and online.

Drive failure cannot fail or roll back transcription completion. Local save failure is blocking and must not claim completion.

Before enqueue, validate Unicode scalar sequences, the transcript ID byte bound, and all envelope fields. A legacy record quarantined because its scalar-valid ID exceeds 512 UTF-8 bytes has no pending operation; explicit safe-ID repair must create a new canonical record before enqueue. No upload path truncates, percent-encodes into a filename, or exposes the raw ID in Drive metadata.

### 15.6 Reconcile triggers

Run reconcile on:

- successful sign-in;
- local transcript mutation;
- browser `online`;
- window focus when last attempt is stale;
- periodic foreground interval;
- manual Sync now.

Use one coalescing sync service. Triggers while active set a rerun flag instead of starting concurrent reconciles. Pause interval while document is hidden. A practical foreground interval is five minutes; focus recheck threshold is one minute.

### 15.7 Reconcile sequence

1. Validate account and token freshness.
2. List Whisdom remote records, using pagination, before any pending write.
3. Download every changed/unknown record and every current remote candidate for a pending logical transcript with at most four concurrent downloads.
4. Stream-cap and validate remote schema/canonical payload under Section 15.8 before it enters transcript storage.
5. Resolve each local/remote pair under Section 15.8, including the causal tombstone rule, before deciding an outbound winner. A pending stale live mutation may never overwrite an unseen remote tombstone merely because it was queued first or has a higher revision.
6. Persist candidates, incoming winners, and sync metadata transactionally.
7. Push only resolved local-winning tombstones/upserts idempotently, with writes serialized per logical transcript; cancel or supersede pending operations that lost.
8. Requeue any local winner not confirmed remotely.
9. Mark reconcile success time only after all non-permanent operations finish or are durably classified.

Remote create/update uses retained file IDs and ETags, conditional PATCH, 404/412 rediscovery, post-write verification, and eventual-uniqueness cleanup from Section 15.4. Writes remain serialized per logical transcript even while downloads run at concurrency four.

### 15.8 Conflict order

Apply the causal tombstone rule before normal ordering whenever exactly one candidate is a tombstone:

1. The tombstone wins regardless of the live record’s revision or timestamp.
2. The only exception is a live record whose `restoredFromDeletionId` exactly equals that tombstone’s `deletionId` and whose revision is greater than the tombstone revision. That explicit observed restore wins.
3. Only an explicit user Undo/Restore action that observed that exact tombstone may originate the exception. Valid later mutations descended from that restored live record preserve the field; stale live mutations and merge/sync code cannot synthesize, substitute, or guess `restoredFromDeletionId`.
4. A later tombstone always receives a new `deletionId`. A live record restored from an older deletion does not match and therefore loses to the later tombstone, regardless of revision or timestamp.

When both candidates are live or both are tombstones, compare by this exact descending precedence:

1. `revision` numeric value.
2. Valid bounded `updatedAt` instant when revisions are equal.
3. `deviceId` lexicographic ASCII code-point order.
4. Payload hash lexicographic ASCII order.

The tombstone special rule, not revision ordering alone, prevents resurrection. Within two-live or two-tombstone comparisons, revision precedes clocks so clock skew cannot let a lower revision win. Equal revisions are treated as concurrent for tie-breaking. `updatedAt` selects among those candidates; it does not independently establish causality. Every compared `updatedAt` is a bounded epoch-millisecond safe integer under Section 15.4. A legacy record with an invalid timestamp is noncanonicalizable and remains in `migrationQuarantine`; it never enters conflict ordering. Invalid remote timestamps fail parser validation. Competing tombstones therefore converge deterministically by revision, `updatedAt`, `deviceId`, payload hash, and finally ascending Drive file ID only when their content order is identical.

`deviceId` compares ASCII code points, not locale collation. Payload hash uses the exact RFC 8785 input and canonical schema-2 payload defined normatively in Section 15.4; no repository/app-domain assembly fields enter it. After accepting a remote winner, the next local mutation revision is `max(local revision, remote revision) + 1`; if that increment would exceed `Number.MAX_SAFE_INTEGER`, mutation is blocked as Needs attention rather than rounded or wrapped.

#### Untrusted remote parser and durable candidates

Treat every Drive body as untrusted. Stream raw HTTP response bytes through an incremental SHA-256 before UTF-8 decoding, `JSON.parse`, scalar validation, or any canonicalization. `bodyByteHash` is the lowercase 64-character hexadecimal SHA-256 of those exact raw bytes. Because it never decodes or canonicalizes strings, it remains defined for invalid UTF-8 and JSON strings containing malformed escaped high/low surrogates. It is quarantine evidence only: it never participates in identity, `remoteKey`, accepted-payload hashing, conflict ordering, or canonical record acceptance.

For a complete body of at most 25 MiB (`26,214,400` bytes), hash every byte; if that body is quarantined, store `bodyHashScope = "full"`. On detecting byte `26,214,401`, abort intake immediately, retain neither that extra byte nor any body bytes, finalize the digest over exactly the first `26,214,400` bytes, and store `bodyHashScope = "prefix-25MiB"` plus the fixed bounded sentinel `sizeAtLeast = 26,214,401` bytes (`25 MiB + 1`). A valid accepted body discards this quarantine-only fingerprint after validation. No parser/application path may run for an over-cap body. Quarantine metadata may omit `bodyByteHash` only when streaming or digest infrastructure itself fails; then store a scalar-valid bounded `fingerprintUnavailableReason` code of 1..128 ASCII bytes. Fingerprint failure never permits decoding, parsing, application, retry as valid data, or body retention. For a stored hash, `fingerprintUnavailableReason` is absent; `sizeAtLeast` is present only for `prefix-25MiB`. No quarantine path stores arbitrary body bytes, decoded provider text, or parsed transcript fragments.

Only after a complete in-cap body has a full raw-byte digest may intake decode as strict UTF-8 and call `JSON.parse`. Accept only a non-array plain object matching the exact schema-2 envelope, payload, and segment tables in Section 15.4; reject every unknown or missing field at every level. Require `schemaVersion` to be the safe integer `2` and reject every other value rather than partially interpreting it. Before canonical whitespace handling, bound checks, persistence, key derivation, RFC 8785 serialization, or accepted-payload hashing, validate every parsed string as a Unicode scalar sequence. JSON escapes such as a lone `\uD800`, lone `\uDC00`, or reversed low/high pair remain malformed after parsing and are rejected, while their complete raw bodies retain `bodyByteHash` with `bodyHashScope = "full"`; a valid escaped high/low pair is one scalar. Validate every JSON type, nullability rule, scalar and UTF-8 byte bound, enum, epoch/relative-millisecond unit and range, legal tombstone/live lineage combination, derived-text equality, normalized segment text, globally unique segment ID, and segment order invariant. Segment text must satisfy the post-normalization 1 MiB limit and final joined text the 16 MiB aggregate limit. A live payload containing envelope fields such as `id`, `transcriptId`, or `updatedAt`, or any other extension, is an unknown-field failure. Reject rather than repair remote input. The total 25 MiB stream cap remains authoritative in addition to all field bounds.

Persist every validated incoming winner/non-winner needed for dirty-editor, account-switch preview, or conflict handling in the dedicated account-neutral `conflictCandidates` store before presenting or applying it. Candidate comparison data includes revision, updatedAt, deviceId, deletedAt, deletionId, restoredFromDeletionId, transcript/null, and canonical payload hash; it excludes account identity and Drive identifiers. The Drive layer associates a candidate with account key, remoteKey, and Drive file metadata in `syncMetadata`; editor draft/candidate payloads remain account-neutral. Invalid records never enter `transcripts` or `conflictCandidates`. Store only scalar-valid bounded remote quarantine metadata: Drive file ID up to 255 scalar values, `remoteKey` when independently valid, stable error code up to 128 ASCII bytes, and the `bodyByteHash`/`bodyHashScope`/`sizeAtLeast` or fingerprint-unavailable disposition defined above. The raw-byte fingerprint is not a `remoteKey` or RFC 8785 payload hash. Never store arbitrary body bytes, provider response text, or parsed transcript fragments.

Remote invalid-record quarantine metadata follows this exact disposition:

| Field | Requirement |
| --- | --- |
| Drive file ID | Required scalar-valid opaque string, at most 255 scalar values |
| `remoteKey` | Optional; present only when independently derived and validated |
| Error code | Required stable ASCII code, 1..128 bytes |
| `bodyByteHash` | Required lowercase 64-character SHA-256 when incremental streaming/digest succeeds; absent only on infrastructure failure |
| `bodyHashScope` | Required with `bodyByteHash`; exactly `full` or `prefix-25MiB` |
| `sizeAtLeast` | Present iff scope is `prefix-25MiB`; exact bounded integer `26,214,401` |
| `fingerprintUnavailableReason` | Present iff `bodyByteHash` is absent; scalar-valid stable ASCII code, 1..128 bytes |

Every other field is prohibited. In particular, no raw/decoded body, parsed fragment, canonical payload hash, or serialized-string substitute enters remote quarantine metadata.

If an incoming winner targets a dirty open editor, do not overwrite in-memory content. Persist the validated candidate, save/protect the account-neutral local draft, then recompute conflict order. If local persistence fails, mark Needs attention and retain the durable candidate plus last durable transcript until user action.

### 15.9 Retry and failure policy

| Failure | Behavior |
| --- | --- |
| Offline/network/408/429/5xx | Retry with bounded exponential backoff and jitter |
| 401/403 caused by auth | Pause queue; refresh once; then Needs reconnect |
| 400/404 for stale remote file ID | Clear mapping and re-discover once |
| 412 conditional write conflict | Relist/download/validate and rerun conflict resolution; never retry the stale body blindly |
| Invalid remote UTF-8/JSON/schema/canonical value | Store bounded file-ID/error-code plus raw `bodyByteHash` disposition metadata only; malformed escaped surrogates still retain a full raw-byte hash; mark item Needs attention; never store body or overwrite local transcript |
| Remote body exceeds 25 MiB | Abort on byte 25 MiB + 1; hash exactly the first 25 MiB; store `bodyHashScope = "prefix-25MiB"` and `sizeAtLeast = 26,214,401`; retain no body or extra byte; never parse/apply |
| Streaming/digest infrastructure failure | Store bounded fingerprint-unavailable reason without a hash; never decode, parse, apply, or retain body |
| Other permanent 4xx | Stop retrying item; mark Needs attention with safe details |

Backoff schedule uses base 1 second, doubles to maximum 60 seconds, adds 0-25% jitter, and stops automatic per-operation attempts after 7 failures. New online/focus/manual triggers may resume transient failures. Auth failures do not consume destructive retries.

### 15.10 Tombstone retention

Remote tombstones and local causal ordering identity are permanent for this redesign. After 180 days following a confirmed reconcile, and only when no known operation is pending, compaction may remove retry history and auxiliary error state from sync implementation metadata. It must retain transcript ID, remoteKey, revision, updatedAt, deletedAt, deletionId, `restoredFromDeletionId` null state, device ID, payload hash, account association/confirmation needed for ordering, and the complete remote tombstone JSON. Do not compact while signed out or auth-paused. Physical local or remote tombstone deletion is out of scope until a future replica-watermark protocol can prove every replica observed the deletion.

## 16. IndexedDB schema and migration

### 16.1 Source of truth

IndexedDB is durable source of truth. React state is a view/edit cache. Drive is a replicated backup, not primary storage.

### 16.2 Stores

Version 2 contains every required logical store:

| Store | Key | Purpose |
| --- | --- | --- |
| `settings` | Existing singleton key | Preserve current `AppSettings`; add only validated fields through defaults |
| `transcripts` | Transcript ID | Schema-2 envelope state and exact canonical payload from Section 15.4, plus local-only remediation state kept outside serialized payload |
| `migrationQuarantine` | Generated quarantine ID | Original noncanonicalizable v1 structured-clone record when bounded, bounded reason code, and original v1 key; no raw-body fingerprint; never a canonical/payload-hash/sync source |
| `drafts` | Transcript ID | Account-neutral durable editor draft, base durable revision, dirty/save state |
| `conflictCandidates` | Candidate ID | Validated account-neutral incoming transcript/tombstone candidate including causal deletion lineage and comparison fields; no account/Drive identifiers |
| `syncMetadata` | Account key + transcript ID | Derived remoteKey, remote file ID/ETag, candidate/account association, confirmed revision/order/lineage, item state, last error code |
| `pendingOperations` | Operation ID | Durable coalesced upsert/tombstone work, attempts, next attempt time |
| `syncState` | Account key | Last reconcile, cursor/page token if safe, auth-paused marker, account metadata |
| `meta` | Named key | Schema version helpers, stable device ID, migration completion data |

Pending operations require indexes for account, transcript ID, and next attempt time. Transcript listing requires updated-time and deletion-state indexes. Conflict candidates require transcript-ID and received-time indexes; Drive account/file association belongs in `syncMetadata`, not candidate payloads. Migration quarantine requires indexes for original v1 key and reason code. Physical store names are exactly those in this table.

Each persisted migration-quarantine value is an exact object `{quarantineId,originalV1Key,reasonCode,original}` with no extension fields. `quarantineId` is a generated canonical 24-character `q_` ID using the same 16-random-byte decode/re-encode rule as schema-2 `deviceId`; `reasonCode` is a scalar-valid stable ASCII code of 1..128 bytes; `originalV1Key` is the unchanged structured-clone IndexedDB key; and `original` is the unchanged structured-clone v1 value whose measured JSON representation is at most 25 MiB. This local recovery object has no `bodyByteHash`, `bodyHashScope`, `sizeAtLeast`, RFC 8785 digest, or manufactured serialization fingerprint. This object is recovery data, not canonical transcript data.

The persisted and synced schema separates envelope identity/revision fields from the canonical transcript payload. A repository API may assemble an app-domain record that exposes envelope `transcriptId` as `id` and envelope `updatedAt` beside payload fields for UI convenience, but that assembled object is not schema-2 JSON, RFC 8785 payload-hash input, or canonical payload. The current TypeScript `TranscriptDocument` still uses the legacy combined shape and second-based segments; Slice 1B/4 implementation must migrate its types and adapters rather than claiming it already satisfies this specification.

### 16.3 Transaction boundaries

- Transcript create/edit/rename: write transcript revision and coalesced pending upsert together.
- Delete/Undo/Restore: write transcript deletion state, fresh `deletionId` or exact observed `restoredFromDeletionId`, and pending operation together.
- Editor save/discard: write or clear account-neutral draft and update transcript revision in one serialized repository operation.
- Incoming merge: persist candidate first, then write transcript winner, sync metadata, resolved pending-operation state, and candidate disposition together.
- Sync success: update confirmed metadata and delete matching pending operation together.
- Migration quarantine: put the complete bounded original and metadata before deleting its v1 source entry; any put/delete failure aborts the complete versionchange transaction.

No UI may show Saved locally until its mutation transaction completes.

### 16.4 Migration

Migration ships in two deployment-safe phases:

1. **Slice 1A compatibility opener (rollback floor).** Open the named database without passing a lower explicit version. Omitting the version lets IndexedDB open the existing version; passing `1` against a v2 database would raise `VersionError` and is prohibited. Inspect `db.version`, use a version-aware repository for supported v1/v2 layouts, and close with a localized unsupported-data-version state if the version is above the client’s maximum supported version. A brand-new omitted-version open creates the platform’s initial version; initialize only the Slice 1A-compatible layout through its controlled creation path.
2. **Slice 1B transactional v1→v2 upgrade.** Request version 2 and create `migrationQuarantine`, `drafts`, `conflictCandidates`, `syncMetadata`, `pendingOperations`, `syncState`, and `meta`, plus every required index, in the single `versionchange` transaction. Upgrade existing `settings` and `transcripts` in that same transaction; abort leaves the v1 database intact.
3. For each v1 transcript, enforce the exact local legacy contract and Unicode-scalar precondition in Section 15.4 before any canonical whitespace handling, bound, persistence, key, serialization, or payload-hash operation. For a canonicalizable record, apply only the documented local repairs: remove only valid outer title `CANONICAL_WS`; repair allowed segment IDs with the exact SHA-256 formula; apply Section 13.2 timing normalization/forward clamp; synthesize the zero-segment record only when normalized fallback text is at most 1 MiB; normalize each segment and enforce its 1 MiB post-normalization limit; and rederive canonical `text` with the 16 MiB aggregate limit. Preserve scalar-valid ID/title/source/language/model/mode under their exact no-whitespace-normalization rules, map legacy `id` to envelope `transcriptId`, set revision `0`, assign one parser-valid generated device ID persisted in `meta`, set deletion-lineage fields to null, keep envelope `updatedAt` outside payload, and convert exact bounded ISO timestamps to epoch milliseconds. Use the exact same-key cursor-update or different-key put-then-delete ordering defined in Section 15.4.
4. A local record with any remaining noncanonicalizable field—including invalid timestamp, malformed Unicode, invalid title/source/language/model/mode/text/segments, post-normalization segment or synthesized text over 1 MiB, derived joined text over 16 MiB, over-cap timing, unknown/missing fields other than repairable segment ID, or scalar-valid ID over the schema-2 512-byte bound—produces no canonical transcript. Apply the exact `migrationQuarantine` copy-then-delete/abort disposition in Section 15.4. Quarantine entries remain Needs attention, exportable/deletable under bounded recovery UX, and ineligible for sync/payload hash until explicit repair creates a canonical record. Migration never truncates or splits text solely to satisfy a limit. Valid sibling records remain preserved in the same successful upgrade. Migration never silently loses a record.
5. Preserve settings by merging only missing defaults. Validate numeric values: chunk seconds finite integer 15-60; overlap finite number 0-5 and less than chunk seconds. Invalid values fall back to current defaults 30 and 1.
6. Initialize empty drafts/candidate/sync stores. Create no pending Drive upload merely from migration while signed out. Slice 5 associates/enqueues records only after account consent.
7. The upgrade is idempotent under interrupted open attempts and never deletes a valid or inaccessible transcript. It validates or replaces malformed legacy local device metadata with one newly generated parser-valid profile device ID; it never derives identity from account data or a fingerprint. Serialization, quarantine put, canonical put, source delete, or upgrade failure aborts the transaction whenever original data cannot otherwise be proven durable.

After any deployed client opens/upgrades a database to v2, no production rollback may go below Slice 1A. Operational rollback must deploy Slice 1A-compatible or newer code, because older code that explicitly opens version 1 will fail on v2 and code assuming v1 stores may misbehave. Slice 4 consumes the migrated v2 repository; it performs no schema migration.

Migration fixtures must include: default v1 settings; `NaN`-equivalent invalid persisted settings; title outer removal using `U+FEFF`, `U+0085`, and mixed `CANONICAL_WS` runs while preserving internal runs byte-for-byte; `U+200B` retained as non-whitespace; empty/all-`CANONICAL_WS`, oversize, and wrong-type titles; valid segmented records; wrong-type, oversize, and malformed-scalar `text`; text-only and empty-text zero-segment records; synthesized normalized text at exactly 1 MiB and 1 MiB plus one byte; normalized segment text at exactly 1 MiB and 1 MiB plus one byte; final joined canonical text at exactly 16 MiB and 16 MiB plus one byte while each segment independently passes; boundary cases where mixed `CANONICAL_WS` collapse changes the UTF-8 byte count; local missing, empty, all-`CANONICAL_WS`, non-string, oversize, and duplicate segment-ID repair versus remote rejection; malformed-scalar segment ID quarantine; overlapping/out-of-order/non-finite/negative local timing repair versus remote rejection; half-millisecond rounding; exact seven-day timing; over-seven-day quarantine; invalid mode; empty, all-`CANONICAL_WS`, wrong-type, 512-byte, 513-byte, and larger local IDs including multibyte boundaries; source/language/model/segment-text bounds and wrong types; all-`CANONICAL_WS` language/model rejection and bounded unknown language/model preservation without whitespace normalization; canonical timestamp lower/upper boundaries plus invalid/out-of-range values; unknown/missing top-level and segment fields; JSON-escaped lone high surrogate, lone low surrogate, reversed pair, and valid surrogate pair at scalar/UTF-8 boundaries in `id`, `title`, `sourceName`, `language`, `modelId`, top-level `text`, and segment `id`/`text`; and malformed legacy device metadata.

Tests reopen migrated data and verify exact payload equality with parser/editor/hash fixtures; deterministic zero-segment and repaired-ID digest bytes; exact `CANONICAL_WS` membership and normalization bytes; title internal-run preservation; `U+FEFF`/`U+0085` handling and `U+200B` non-handling; valid surrogate-pair preservation; exact 1 MiB synthesized/segment and 16 MiB aggregate acceptance with plus-one rejection after normalization; `startMs`/`endMs` conversion and forward repair; strict remote timing rejection; an empty generated cue’s subtitle ineligibility; quarantine Needs-attention/no-upload/no-payload-hash/no-raw-body-fingerprint behavior; bounded recovery JSON export/delete; copy-before-delete ordering; preservation of original v1 key/value; 25 MiB boundary; serialization/put failure and interrupted-transaction rollback; valid sibling preservation; parser-valid persisted device identity; null initial deletion lineage; every v2 store/index including `migrationQuarantine`; Slice 1A opening v1 and v2 without requesting a downgrade; and deterministic rejection of unsupported versions above 2. Canonicalizable parser and migration fixtures must produce identical canonical bytes and the pinned exact RFC 8785 digest.

### 16.5 Clear-data semantics

- Clear downloaded models still calls `clearLocalWorkerState()` first and remains disabled during active conversion/transcription.
- Clear saved transcripts becomes a destructive bulk tombstone operation when Drive is connected or known remote records exist. It must not silently clear local records and allow remote resurrection.
- Clear migration quarantine is a separate destructive action. It deletes only explicitly selected/all quarantined originals after confirmation, never tombstones or uploads them, and never runs as a side effect of Clear saved transcripts.
- Clearing local app data and deleting Drive backup are distinct actions with distinct consequences.
- Media blobs remain disabled by default and are never included in Drive sync.

## 17. Feature and component architecture

### 17.1 Target structure

| Area | Responsibility |
| --- | --- |
| `src/app/` | Shell, query navigation, providers, route focus, shared copy contracts |
| `src/features/workbench/` | Source, recommendation, review, queue reducer, progress presentation |
| `src/features/transcript-editor/` | Canonical reducer, Document/Timeline views, autosave, search, undo/redo |
| `src/features/library/` | Repository queries, filters, list, item actions, recovery |
| `src/features/google-drive/` | Identity client, Drive transport, sync service, conflict/retry policies |
| `src/features/storage/` | DB opening/migration, transcript repository, sync repositories, transactions |
| `src/features/transcription/` | Shared domain types, models, language, exports, normalized runtime contracts |
| `src/components/ui/` | Low-level reusable primitives only |

Product components live above `components/ui`; they may compose existing Radix/shadcn primitives but must express Whisdom-specific hierarchy and states.

### 17.2 State ownership

- Local component state: popover open state, draft input, selected tab, disclosure state.
- Feature reducer: queue workflow, editor operations, Workbench stage state.
- IndexedDB repositories: transcripts, account-neutral drafts/conflict candidates, settings, sync metadata, operations, tombstones.
- Drive sync service: external store with immutable snapshot subscription through `useSyncExternalStore`.
- Runtime coordinator: active run handles and normalized events outside render logic.

Do not add a large global state dependency unless implementation demonstrates a cross-feature requirement not served by reducers, repositories, and external-store subscriptions.

### 17.3 Runtime boundaries

Preserve:

- at most one live ASR worker and one live ffmpeg worker, with lazy recreation after cancellation termination;
- Transformers.js model Cache Storage and cleanup key;
- ffmpeg single-threaded GitHub Pages compatibility;
- sequential batch execution;
- current server endpoints and authentication pattern;
- local WebGPU secure-context guard and WASM fallback;
- large-model q4/WebGPU restriction.

Add adapters around these boundaries. Do not move long-running work into React components.

### 17.4 Copy architecture

Move copy from the `src/App.tsx` monolith into feature-scoped EN/VI modules. Each feature exports one typed key shape and both locales must satisfy it at compile time. Event and issue codes map to localized copy at the UI boundary. No hardcoded user-facing English in components, workers, adapters, validation, aria labels, titles, empty states, or technical-detail headings.

## 18. Error and notification system

### 18.1 Error shape

Typed product errors contain stable code, severity, scope, localized parameter data, recovery actions, technical cause, retryability, and occurrence ID. Technical cause may include provider status and stack in development, but never token, authorization header, source-media content, raw Drive ID, or sensitive response body.

### 18.2 Rendering rules

1. One active error per failed operation scope.
2. Render beside the action or item that failed.
3. Provide one primary recovery CTA and optional secondary action.
4. Put technical details in an expandable disclosure.
5. Use `role="alert"`/assertive announcement only for newly blocking errors.
6. Clear error when retry begins; do not preserve it after confirmed success.
7. Dedupe repeated provider events by operation occurrence ID.
8. Do not put errors in confirmation toasts.

### 18.3 Toasts

Toasts are confirmation-only: saved export, copied text, delete with Undo, batch completion, connected, signed out. Use a FIFO queue. Default auto-dismiss is 5 seconds; Undo confirmation remains 10 seconds. Pause timer on hover and keyboard focus. `aria-live="polite"`; no toast steals focus.

Batch completion emits one summary confirmation. Failed items retain contextual errors in queue; summary links to affected items.

### 18.4 Recovery map

| Error | Primary recovery |
| --- | --- |
| WebGPU unavailable for selected model | Use a beginner-safe non-q4 Base/Tiny fallback when available; otherwise choose another compatible model explicitly or recover runtime |
| Unsupported/failed media analysis | Choose another file |
| Model asset download failed | Retry download |
| Runtime failed | Retry item |
| Server unavailable | Retry connection or choose local file mode |
| Drive auth expired | Reconnect Drive |
| Drive transient failure | Retry sync |
| Invalid remote record | Keep local and inspect safe details |
| Local save failed | Retry local save; do not navigate silently |

## 19. Internationalization

1. All app copy has EN and VI keys with compile-time parity.
2. Locale formatting uses current UI language for dates, times, counts, sizes, and elapsed duration.
3. Runtime, warning, validation, auth, sync, editor, and aria copy are localized by stable code.
4. Proper nouns, model IDs, file names, URLs, and technical codes remain unchanged.
5. Do not concatenate translated sentence fragments where grammar differs. Use parameterized full messages.
6. Switching UI language updates visible copy without resetting queue, editor, runtime, or navigation state.
7. Transcription language remains separate from UI language. `auto` behavior remains explicit in recommendation/review copy.

## 20. Accessibility

WCAG 2.2 AA is release target.

### 20.1 Structure and focus

- One visible `h1` per page.
- Landmarks and labeled navigation regions.
- Skip link to main content.
- Route changes focus page heading; dialogs/sheets restore trigger focus.
- Visible focus indicator meets contrast and is not clipped.
- No positive `tabindex`.

### 20.2 Controls

- Use proven accessible combobox primitives or implement full ARIA combobox behavior: typed search, active descendant, Arrow Up/Down, Home/End, Enter, Escape, selected state, result count, and focus restoration.
- Stage rail exposes current/completed state in text and semantics; it is not falsely marked as a required wizard.
- Queue reorder supports buttons and announces new position politely.
- Icon buttons have localized accessible names.
- Touch targets meet 44 by 44 CSS px.

### 20.3 Dynamic state

- Blocking error: assertive once.
- Confirmation and queue reorder: polite.
- Progress announcements: phase changes immediately; percentage at most every 10% or 15 seconds, whichever is less noisy. Do not announce every worker event.
- Cancellation request and completion receive distinct announcements.
- Save/sync state is textual and not color-only.

### 20.4 Editor

- Document and Timeline tabs use correct tab semantics.
- Segment controls have position and timestamp context.
- Search reports result count and current result.
- Keyboard supports all edit, split/merge alternative, copy, export, undo/redo, and navigation actions.
- Reduced motion removes animated scrolling and spatial transitions.

## 21. Performance requirements

1. Initial Workbench bundle excludes lazy Library, editor, and Settings feature code.
2. No model or ffmpeg asset request before explicit Transcribe.
3. Reuse live singleton workers and loaded models across normal navigation/jobs; cancellation may terminate and lazily recreate one worker while persistent model Cache Storage survives.
4. Subscribe components to narrow external-store snapshots. A React Profiler test around header, primary navigation, and Library subtree records commit counts while at least 100 throttled progress updates render; each named subtree must record zero progress-caused commits after initial mount, while the progress subtree commits.
5. Throttle high-frequency runtime events for presentation while keeping terminal event delivery immediate.
6. Virtualize when the filtered Library result set exceeds 200 rows and when Timeline contains more than 500 rendered-capable segments. At or below each threshold, nonvirtual rendering is allowed. Preserve keyboard and screen-reader continuity.
7. Search indexing/traversal runs incrementally or off the urgent render path. Chunk work and yield whenever a chunk reaches 8 ms measured with a monotonic clock. Browser tests use a deterministic clock/work scheduler; fallback-environment tests remove `scheduler.yield`/idle callbacks and assert the `setTimeout(0)` yield path splits large-fixture work across multiple tasks.
8. Drive reconcile paginates, allows at most four concurrent downloads, and serializes writes per logical transcript. It must not compete with local transcription for avoidable main-thread work.
9. Avoid decorative images and remote font requests. Abstract audio motifs use CSS/SVG with minimal geometry.
10. Route lazy-loading states use stable layout and localized labels. Build/request assertions require separate lazy chunks for Library, editor, and Settings; initial Workbench must not import or request those chunks, model assets, ffmpeg assets, or editor/search heavy dependencies before route/action demand. This replaces subjective bundle-growth judgment.

Profile fixtures contain 1,000 Library rows and 5,000 Timeline segments. Threshold, yielding, focus continuity, and progress-isolation tests run against these fixtures.

Performance acceptance uses request inspection and React profiling, not subjective “fast” claims.

## 22. Delivery slices

Each slice is independently shippable behind coherent UI behavior. Do not merge half-wired controls. Mobile, accessibility, localization, and performance are cross-cutting from Slice 1, not deferred work. Before every slice exits, every new/changed flow must pass its focused EN and VI keyboard scenarios, 320 px and 390 px responsive/reflow checks, zero automated critical/serious accessibility violations, route/chunk request assertions, and applicable profile thresholds.

### 22.1 Slice 1: foundations and rollback floor

- **Slice 1A:** stabilize strict-locator tests; ship the version-aware compatibility opener from Section 16.4; preserve current transcription behind the shell; verify v1/v2 open and unsupported-newer rejection. This deployment becomes the permanent rollback floor.
- **Slice 1B:** perform the complete transactional v1→v2 migration, including scalar validation, exact legacy disposition, canonical normalization, `migrationQuarantine`, copy-before-delete/abort safety, recovery access, and every target store/index; add query navigation, shell, focus management, Precision Studio tokens, theme parity, product primitives, typed copy, and repository boundaries.
- Operational release tooling/documentation must prevent rollback below Slice 1A after v2 exposure.

Exit: addressable Workbench/Settings; every v1 record is canonicalized or recoverably quarantined with no silent loss; rollback-floor and migration-abort tests pass; both themes render; baseline EN/VI keyboard, 320/390, accessibility, and lazy-load checks pass; no unrelated flow regresses.

### 22.2 Slice 2: guided Workbench

- Add deterministic recommendation.
- Add stage rail, File/Link source switch, privacy copy, review summary, typed issues.
- Make URL-only server flow reachable.
- Keep advanced model/language controls accessible.

Exit: recommendation scenario tests cover first run, preserved explicit choice, missing/removed model, language/runtime change, beginner-safe row-6 fallback, Small/q4-only explicit choice, no-compatible-model recovery, and separate server default selection; file append/link submit plus cross-cutting baseline pass.

### 22.3 Slice 3: progress, cancel, errors, queue

- Add runtime adapters and stable event codes.
- Add honest phase progress, elapsed/ETA policy, active/batch split.
- Add cancellation for every runtime and SSE cleanup.
- Add focused drawer/sheet, retry/remove/reorder, contextual errors, queued confirmation toasts.

Exit: ETA/progress/cancellation adapter scenarios prove no fake percentage, duplicate error, leaked subscription, or terminal cancellation before acknowledgement/termination; cross-cutting baseline passes.

### 22.4 Slice 4: editor and Library

- Consume the Slice 1B migrated repository; perform no schema migration.
- Add account-neutral durable `drafts` and `conflictCandidates` repository infrastructure and canonical serialization.
- Add full transcript workspace, Document/Timeline editing, autosave, search, undo/redo, copy/export.
- Add Library search/filter/actions and tombstone/Undo behavior.

Exit: canonical fixture outputs match across TXT/JSON/SRT/VTT/hash; dirty-navigation and durable draft/candidate scenarios pass; editor/Library EN/VI keyboard and 320/390 baseline passes.

### 22.5 Slice 5: Google identity and sync

- **Checkpoint A — identity/transport:** approved scopes, attempt IDs/watchdogs, optional UserInfo display fields and fallbacks, initial avatar URL validation plus bounded `redirect: "error"` Blob fetch/fallback, exact-host CSP, same-page token renewal, user-initiated reload reconnect, sign-out/revoke, remoteKey Drive discovery/upsert.
- **Checkpoint B — durable outbound:** account consent/association, durable queue, serialized writes, local-save-first path for every transcription mode, causal tombstone/restore JSON, safe-ID upload gate, legacy Drive migration, retry, post-write verification, eventual-uniqueness cleanup.
- **Checkpoint C — inbound reconciliation/conflicts:** four-download concurrency, strict bounded envelope parser, durable account-neutral candidates, causal restore rule, deterministic regular ordering/hash, dirty-editor protection, account-switch preview confirmation, offline/auth recovery.

Exit: all three checkpoints and cross-cutting baseline pass; request inspection proves no source-media/settings upload, no broad Google CSP wildcard, and no silent cross-account disclosure.

### 22.6 Slice 6: cross-feature hardening and regression

- Harden already-implemented 320/390 layouts, bottom navigation, queue sheet, keyboard/safe-area handling across feature boundaries.
- Run complete WCAG checklists, reduced-motion regression, exact virtualization/yield thresholds, lazy-load request assertions, and profiler isolation fixtures.
- Run focused visual regression/refinement in both themes without introducing new feature contracts.

Exit: every checklist in Section 23.4 passes in EN and VI; viewport, keyboard, automated accessibility, request, and profile checks pass with named thresholds.

### 22.7 Slice 7: regression and cleanup

- Run full functional, real-ASR-gated, server, migration, sync, screenshot, and accessibility review.
- Remove old `App.tsx` product components, duplicate copy, string matching, dead state, old result modal, and obsolete test workarounds.
- Verify no stale routes, warnings, cache behavior, or generated output.

Exit: all observable acceptance scenarios, deployment rollback checks, and repository pre-commit checks pass.

## 23. Test strategy

### 23.1 Unit tests

- Local recommendation precedence, no-compatible blocking, beginner-safe Base-before-Tiny fallback, fixture where only Small/q4 remains and no automatic selection occurs, missing/removed choice, language mismatch, capability changes, explicit-choice persistence, derived explanation, and separate server-capability default selection unaffected by local q4 rules.
- Progress event normalization, phase completion, indeterminate behavior, rolling-30-second ETA sample/span/CV eligibility, and stage/item reset.
- Workbench queue reducer and editor reducer.
- Runtime cancellation idempotency, cooperative acknowledgement, forced per-type worker termination/recreation, persistent-cache retention, singleton-at-most-one invariant, and late-event rejection.
- Unicode-scalar validation before canonical whitespace handling/counting/persistence/key/serialization/payload hashing; JSON-escaped lone high surrogate, lone low surrogate, reversed pair, and valid surrogate pairs at scalar and UTF-8 boundaries; immutable `CANONICAL_WS` membership with `U+FEFF` and `U+0085` included and `U+200B` excluded; mixed-run collapse; exact outer-only title handling with internal runs preserved; no NFC/NFKC; all-`CANONICAL_WS` title/language/model/ID rejection without changing accepted source/language/model/ID strings; runtime and legacy seconds-to-`startMs`/`endMs` rounding/range checks; deterministic local forward timing repair and strict remote timing rejection; synthesized and ordinary segment normalized text at exactly 1 MiB versus 1 MiB plus one byte; final joined text at exactly 16 MiB versus 16 MiB plus one byte; normalization cases that cross a byte boundary; split/merge/multiline paste/spanning-selection behavior in relative milliseconds; raw derivation; all-segment subtitle timing validation; invalid normalized-empty segment rejection; all-empty no-cue unavailability; millisecond subtitle formatting; and byte-identical canonical inputs for TXT/SRT/VTT/JSON/payload hash.
- Causal tombstone-before-ordering rule; reconcile discovery/read-before-write preventing a queued stale live record with arbitrarily high revision from overwriting an unseen tombstone; exact observed restore with greater revision winning; restore against an older deletion losing to a newer deletion ID; duplicate/competing tombstones converging by revision/updatedAt/device/hash/Drive ID; two-live regular ordering; bounded timestamp validity; ASCII device tie-break; RFC 8785 lowercase SHA-256 including deletion lineage; safe next-revision overflow handling; and bounded cleanup.
- Untrusted parser incrementally computes `bodyByteHash` over exact raw response bytes before decode/parse/scalar validation; complete bodies through 25 MiB receive full hashes; byte 25 MiB + 1 triggers abort, a digest over exactly the first 25 MiB, `prefix-25MiB`, fixed `sizeAtLeast`, and retention of neither extra byte nor body; streaming/digest failure is the only hash-omission path and stores a bounded unavailable reason without permitting parse/application. Fixtures prove raw fingerprints never equal or influence `remoteKey`, RFC 8785 payload hash, identity, or ordering. Parser coverage includes strict UTF-8, plain-object/exact-field/schema/unknown-field/enum/string/array/segment-ID/invariant rejection against every normative Section 15.4 row; malformed Unicode rejection in envelope `transcriptId`, payload title/source/language/model/text, and segment ID/text; escaped lone high surrogate, lone low surrogate, and reversed pair bodies that still produce the exact full raw `bodyByteHash` while RFC 8785/payload hashing is rejected; exact lower/upper scalar and UTF-8 acceptance using a valid surrogate pair; exact lower/upper acceptance and outside/fraction/unsafe rejection fixtures for schemaVersion and revision; transcript ID at 512 UTF-8 bytes and rejection at 513; malformed-scalar transcript ID rejected before `remoteKey`; transcript ID present only in the envelope; payload `id`, `transcriptId`, duplicate `updatedAt`, and every other unknown field rejected; remoteKey recomputation mismatch; canonical and malformed deviceId/deletionId/restoredFromDeletionId; epoch timestamp lower/upper acceptance plus zero/null/type/out-of-range rejection; relative timing zero/seven-day acceptance plus over-cap/fraction/unsafe rejection; post-normalization segment/synthesis 1 MiB and joined 16 MiB boundaries; explicit epoch-versus-relative-unit fixtures; legal live/tombstone lineage combinations; bounded invalid-record quarantine state; and account-neutral durable candidate storage.
- Legacy Drive `{id}.json` exact object/segment allowlist and exact field types/bounds; outer-only `CANONICAL_WS` title removal with internal preservation; empty/all-`CANONICAL_WS`/oversize/wrong-type title; invalid mode; empty/all-`CANONICAL_WS`/oversize/wrong-type ID; wrong-type/oversize/malformed-scalar text; zero segments with the post-normalization 1 MiB synthesis bound; ordinary 1 MiB segment and 16 MiB aggregate boundaries; missing/invalid/duplicate segment-ID remote rejection; current ISO timestamp parsing and invalid timestamp rejection; negative/overlap/non-finite/unrepresentable/over-cap timing rejection; unknown/missing-field rejection; deterministic canonical output; 512-byte upload boundary; 513-byte through 16-KiB and over-16-KiB metadata-only quarantine with the same raw-byte fingerprint disposition; derived remoteKey envelope write/verify-before-cleanup; invalid old-file retention; bounded old-file cleanup; and no truncation.
- Local v1 migration exact contract covers the same field fixtures while proving only documented title/text/ID/timing/zero-segment repairs; exact `seg_` digest inputs; deterministic output; post-normalization 1 MiB synthesized/segment and 16 MiB aggregate boundaries; malformed Unicode/timestamp/remaining-invalid quarantine; original structured-clone copy and original key; no `bodyByteHash` or manufactured serialization fingerprint; 25 MiB boundary; recovery export/delete; separate clear-quarantine semantics; copy-before-delete; valid sibling preservation; and transaction abort when serialization, canonical put, quarantine put, or bounded failure-report derivation fails.
- Schema/hash fixtures use the normative live example plus `U+FEFF`, `U+0085`, `U+200B`, mixed canonical-whitespace runs, valid surrogate pairs, and title internal-run preservation, and pin both exact RFC 8785 canonical bytes and exact lowercase digest for the deletion-lineage projection. They prove `transcriptId` occurs once in the envelope and never in hash input/payload; segment keys are exactly `startMs`/`endMs`; parsing, editor serialization, and canonicalizable legacy migration produce identical payload bytes; repeated hashing is stable; malformed Unicode deterministically raises a hard payload-hash error with no RFC 8785 digest even when remote quarantine has a raw `bodyByteHash`; and the implementation SHA-256 equals an independent Web Crypto digest of those fixed canonical bytes. A paired tombstone fixture pins explicit nulls and the tombstone projection.
- Backoff bounds/jitter range, auth pause, transient/permanent classification.
- Slice 1A versionless compatibility open for v1/v2, unsupported-version rejection, complete v1→v2 store/index migration including `migrationQuarantine`, copy-before-delete ordering, and transaction rollback without data loss.
- Settings numeric validation.

### 23.2 Component tests

- Combobox keyboard and screen-reader semantics.
- Stage rail and blocking/informational issue rendering.
- One-error rendering, retry clearing, confirmation toast queue/timers.
- Autosave debounce/serialization, app-navigation await, save-failure Retry/Discard, popstate restoration/replay guard, best-effort visibility/pagehide, conditional beforeunload registration, save states, and incoming dirty-editor protection.
- Queue reorder alternatives, drawer/sheet focus, cancel choices.
- Identity menu, auth attempt-ID timeout/late callback rejection, GIS error callback, same-page renewal, reload reconnect requirement, revoke confirmed/unconfirmed states, scalar validation of UserInfo `sub`/`name`/`email`/`picture` before display/count/key/URL use, optional name/picture and display/initial/glyph fallbacks, avatar initial HTTPS/exact-host/no-credentials/standard-port validation, `redirect: "error"` fallback on any redirect, malformed Unicode, CORS/MIME/byte/timeout fallback, and account-switch paused/preview/apply/disclosure confirmation behavior. Tests make no assertion about inspecting redirect hops or final `response.url`.
- Library visible item actions and responsive editor controls.

### 23.3 E2E tests

Required named scenarios:

1. `REC-01`: first run with WebGPU available/unavailable selects compatible non-q4 multilingual Base and missing/removed choice follows beginner-safe fallback; `REC-02`: multilingual language and runtime changes follow exact precedence; `REC-03`: no compatible model blocks with runtime recovery; `REC-04`: valid explicit choice persists and recommendation explanation remains derived from current inputs; `REC-05`: only Small/q4 compatible models remain, so no model is selected and explicit choice with plain-language trade-offs is required; `REC-06`: server mode selects its advertised default capability independently of local q4 policy.
2. `WB-01`: file select, append, remove, reorder, review, and start; `WB-02`: URL-only server submission without file.
3. `RUN-01`: cooperative local cancel acknowledges before terminal state; `RUN-02`: noninterruptible ASR/ffmpeg cancel terminates only active worker, retains Cache Storage, recreates lazily, and never has two live workers of one type; `RUN-03`: Cloudflare/server cancel and cancelled retry; `RUN-04`: ETA eligibility/reset boundaries.
4. `QUEUE-01`: sequential batch covers success, failure, cancel/pause, continue choice, and retry; `ERR-01`: one contextual error and stale-error removal after success.
5. `EDIT-01`: Document/Timeline split, merge, multiline paste, relative-millisecond timestamps, undo/redo, and canonical TXT/JSON/SRT/VTT/hash fixture outputs; `EDIT-02`: search traversal/wrap/persistence/reset/no-result focus/announcement; `EDIT-03`: a normalized-empty segment with invalid timing blocks SRT/VTT before cue omission, while all timing-valid empty segments leave subtitle export unavailable with the explicit no-non-empty-cues reason; `EDIT-04`: runtime seconds round exactly to bounded milliseconds, seven days is accepted, over-cap becomes Needs attention without clamping, and format/export retain exact canonical timing; `SAVE-01`: autosave survives refresh; `SAVE-02`: app navigation and Back/Forward save failure exercise Retry and Discard against last durable revision; `SAVE-03`: unload warning exists only while dirty/saving without asserting guaranteed async unload save.
6. `MIG-01`: Slice 1A opens v1 and v2 without lower-version request and rejects unsupported version; `MIG-02`: transactional v1→v2 exact-contract fixtures produce every store/index including `migrationQuarantine`, exact current-ISO epoch conversion, pinned `CANONICAL_WS` segment/title behavior, exact deterministic segment IDs, canonical millisecond rounding/forward repairs, zero-segment 1 MiB and aggregate 16 MiB boundaries, byte-identical parser/payload-hash output, and quarantine/recovery for every remaining invalid field without any raw-body or manufactured serialization fingerprint; `MIG-03`: simulated serialization/put/interruption abort preserves the original v1 database and valid siblings, and rollback never deploys a pre-1A opener after v2 exposure.
7. `LIB-01`: search, filter, rename, export, delete, Undo, deep link, 1,000-row threshold, and visible actions.
8. `GIS-01`: sign-in dismissal/error/timeout/late callback; `GIS-02`: UserInfo stable sub identity, optional name/picture fallbacks, initial URL policy, `redirect: "error"`, and timeout/oversize/MIME/CORS fallback to a bounded local Blob/initials/glyph result; `GIS-03`: same-page expiry renewal and reload user reconnect; `GIS-04`: confirmed and unconfirmed revoke copy/link; `GIS-05`: different-account Cancel, Reconcile-without-upload preview without apply, explicit apply confirmation, and separate disclosure confirmation before upload.
9. `DRV-01`: deterministic MIME/remoteKey filename/appProperties discovery pagination, raw-ID absence, scalar validation before key derivation, JSON key recomputation, ETag-conditioned PATCH, 404/412 rediscovery, and post-write verification; `DRV-02`: duplicate race selects conflict winner then Drive ID and bounded cleanup; `DRV-03`: reconcile reads current remote state before writes, stale arbitrarily-high-revision live loses without overwriting an unseen or raced tombstone, exact observed higher-revision restore wins, old-deletion restore loses to newer tombstone, duplicate/competing tombstones converge, two-live regular ties converge, next local revision is safe, and causal tombstone JSON remains permanent; `DRV-04`: raw response fingerprinting before decode/parse, full hash through 25 MiB, exact first-25-MiB prefix hash and abort on the next byte, bounded unavailable-reason failure path, and proof that `bodyByteHash` never affects `remoteKey`, payload hash, identity, or ordering; every normative envelope/payload/segment type, pinned `CANONICAL_WS`, 1 MiB segment/synthesis and 16 MiB aggregate, scalar/UTF-8 byte, malformed-surrogate, numeric, identity, epoch/relative-unit, seven-day, exact-field, derivation, ordering, and lineage boundary; transcriptId envelope-only and malformed transcriptId never receives a `remoteKey` or RFC 8785 digest; escaped lone high/low/reversed-surrogate bodies still receive full raw hashes; exact RFC 8785 fixture bytes/digest and deterministic malformed-Unicode payload-hash rejection; durable account-neutral valid candidate; bounded invalid metadata; offline queue/retry/auth pause; four-download cap; and serialized per-transcript writes; `DRV-05`: strict legacy `{id}.json` migration verifies canonical output and new envelope before bounded cleanup, uploads IDs only through 512 UTF-8 bytes, metadata-quarantines every invalid/oversize body including 513-byte IDs, retains invalid old files, and never truncates or partially imports.
10. `PRIV-01`: no source-media/settings request to Drive under any mode; CSP contains only documented Google hosts; account switch performs no upload without explicit consent.
11. `NAV-01`: Back/Forward/refresh/deep-link and route focus; `I18N-01`: every named flow runs in EN and VI with no hardcoded English leakage.
12. `PERF-01`: initial route/chunk requests exclude Library/editor/Settings/model/ffmpeg heavy assets; `PERF-02`: 100 progress updates produce zero profiler commits in mounted header/nav/Library subtrees; `PERF-03`: 1,000-row/5,000-segment fixtures verify thresholds and 8 ms yielding with scheduler and fallback paths.

Run functional browser coverage at desktop, 390 px, and 320 px. Preserve gated real ASR tests and adapt selectors to the full transcript page. Expand server tests beyond configuration visibility using mocked capability, submit, SSE, cancel, and URL flows.

### 23.4 Accessibility and visual checks

Required state matrix: `A11Y-AUTO-01` Workbench empty/review/active/failed; `A11Y-AUTO-02` queue sheet; `A11Y-AUTO-03` Library empty/populated/filtered; `A11Y-AUTO-04` transcript Document/Timeline/search/save-error; `A11Y-AUTO-05` Settings validation; `A11Y-AUTO-06` identity menu/auth/revoke/account-switch; `A11Y-AUTO-07` sync attention/conflict/toast. Each state runs in EN and VI at desktop, 390 px, and 320 px and passes only with zero automated critical or serious accessibility violations.

Manual checklists run separately in EN and VI; every listed scenario must pass:

- `A11Y-KBD-01`: skip link, header/nav, route focus, File/Link, review, queue reorder/sheet trap/Escape/restore, cancellation/retry, Library actions, editor tabs/search/edit/split/merge/undo/export, Settings, identity, conflict, Retry/Discard, and dialogs are operable without pointer and have visible unclipped focus.
- `A11Y-FOCUS-01`: route headings receive focus; popovers/dialogs/sheets restore trigger; no-result search retains input focus; dirty Back/Forward choice returns focus to failed action; mutation-driven search reset focuses/announces active match without surprise page movement.
- `A11Y-REFLOW-01`: at 200% zoom and 320 CSS px, no horizontal page overflow or clipped content; keyboard/safe areas do not hide active field, save/error state, or primary action.
- `A11Y-CONTRAST-01`: automated token checks plus sampled text, controls, focus, disabled, critical, success, warning, and non-color status combinations meet WCAG 2.2 AA in Light and Dark.
- `A11Y-LIVE-01`: phase changes, throttled progress, cancel requested/completed, reorder, zero-result/current-result search, save/sync, errors, and confirmations use specified politeness, occur once, and do not announce access tokens/Drive IDs.
- `A11Y-SR-01`: screen-reader smoke verifies landmarks/headings, route changes, combobox active option/count, stage state, queue position, editor segment/timestamp context, search count/current match, save/sync state, conflict choice, and revoke-unconfirmed link.

Focused screenshot regression `VIS-01` runs at desktop, 390, and 320 in Light and Dark for empty, review, active, failed, Library, editor, and sync-attention states. Screenshots supplement, never replace, observable reflow/contrast/accessibility assertions.

## 24. Acceptance criteria

### 24.1 Product flow

- [ ] `REC-01` shows a beginner-safe non-q4 Base/Tiny model, local runtime, and localized reason without opening advanced details; `REC-02` through `REC-06` pass exact local precedence, Small/q4 explicit-choice blocking, persistence, and separate server-default assertions.
- [ ] File additions append to queue.
- [ ] Link source starts configured server transcription without a local file or media analysis.
- [ ] Review names model, language, downloads, conversion, processing location, and privacy behavior.
- [ ] Batch remains sequential.
- [ ] `RUN-01` through `RUN-03` prove every cancel reaches terminal state only after acknowledgement/abort/termination and remains retryable.
- [ ] `EDIT-01`, `A11Y-KBD-01`, and `A11Y-REFLOW-01` pass on the full-page transcript at 320 and 390 px.
- [ ] Library supports search, sync filters, rename, export, delete, and Undo without opening an item.

### 24.2 State integrity

- [ ] UI never displays a synthetic cross-phase percentage.
- [ ] Current phase percentage appears only with real numerator/denominator.
- [ ] One issue renders once per scope; no duplicate error toast/dialog/detail.
- [ ] Success clears stale errors.
- [ ] Document and Timeline edits update one canonical segment state.
- [ ] `EDIT-01`/`EDIT-04` fixtures produce expected pinned-`CANONICAL_WS` text, title with internal whitespace preserved, `startMs`/`endMs`, TXT, JSON, SRT, VTT, exact RFC 8785 bytes, and exact payload digest after split/merge/paste; runtime seconds round exactly; seven days is accepted; over-cap input becomes Needs attention without clamping; `EDIT-03` proves every segment is timing-valid before empty-cue omission and all-empty transcripts disable SRT/VTT with an explicit reason.
- [ ] `SAVE-02` holds route on failed save; Retry and Discard produce specified durable outcomes for app and browser history navigation.
- [ ] `MIG-01` through `MIG-03` prove v1 preservation, complete v2 stores/indexes including `migrationQuarantine`, exact local repairs, quarantine recovery/export/delete and separate clear semantics, copy-before-delete, transactional abort on inaccessible data, valid-sibling preservation, supported-version behavior, and deployment rollback floor.
- [ ] Canonicalizable legacy text-only records produce the exact deterministic hashed segment ID with `startMs = 0`, `endMs = 0`; a non-empty cue is subtitle-eligible and an empty generated cue remains ineligible.
- [ ] Legacy normalization accepts synthesized and ordinary segment text at exactly 1 MiB and rejects 1 MiB plus one byte; accepts final joined text at exactly 16 MiB and rejects 16 MiB plus one byte; remote violations quarantine the complete record, local violations use migration quarantine, and neither path truncates or splits text to fit.
- [ ] `CANONICAL_WS` equals the exact pinned scalar set independent of engine Unicode data; `U+FEFF`/`U+0085` normalize, `U+200B` does not, mixed segment runs collapse exactly, title removes outer runs only and preserves internal UTF-8 bytes, valid surrogate pairs survive unchanged, no NFC/NFKC occurs, and source/language/model/ID values are preserved without whitespace normalization while required all-`CANONICAL_WS` values are rejected.
- [ ] Every schema-2, UserInfo/avatar-derived, and legacy string is scalar-validated before canonical whitespace handling, bounds, persistence, key derivation, RFC 8785 serialization, or payload hashing; lone/reversed/unpaired surrogates are rejected without replacement, and valid pairs count once at scalar/UTF-8 boundaries. Raw `bodyByteHash` alone runs before decoding and remains available for malformed bodies.
- [ ] Invalid local legacy timestamps and every other noncanonicalizable local record remain recoverable only through migration quarantine, never inside canonical transcripts, conflict ordering, sync, or RFC 8785 payload-hash input.

### 24.3 Drive

- [ ] Identity scalar-validates `sub`, name, verified email, and picture before counting, display, account-key, or URL use; malformed surrogate sequences reject identity activation when required or trigger the defined optional-field/avatar fallback without replacement. Identity then shows optional bounded name, verified-email, localized account-label, initials/glyph, and bounded avatar fallbacks in the defined order, plus explicit connection state.
- [ ] `GIS-01` proves popup dismissal/error/timeout settles, invalidates attempt ID, and ignores late callbacks.
- [ ] Access/expiry remain memory-only; `GIS-03` permits `prompt: ''` only on the connected page and requires user reconnect after reload.
- [ ] Account key equals normalized Google issuer plus UserInfo `sub`; email is never used as key. Avatar validates only the initial HTTPS/exact-host/no-credentials/standard-port URL, fetches with `redirect: "error"`, and falls back to initials/generic glyph on any redirect, timeout, oversize body, non-image MIME, CORS prevention, or other fetch failure. No acceptance check assumes browser access to redirect hops or final `response.url`.
- [ ] Revoke success appears only after confirmed callback; absent/failing token reports unconfirmed revocation and links Google Account permissions.
- [ ] Local save always completes before Drive work and Drive failure never loses local transcript.
- [ ] All transcription modes enqueue the same sync path.
- [ ] `DRV-01` and `DRV-02` prove deterministic remoteKey filename/appProperties/upsert, scalar validation before transcriptId hashing, malformed transcriptId rejection, no raw transcript ID in Drive metadata, transcriptId-to-key verification, bounded ETag-conditioned PATCH with 404/412 rediscovery, post-write verification, race-tolerant canonical selection, and bounded eventual duplicate cleanup without claiming absolute uniqueness.
- [ ] `DRV-03` proves reconcile reads current remote state before writes and the causal tombstone special rule precedes regular ordering: stale live state loses without overwriting the unseen tombstone regardless of revision, only an exact observed higher-revision restore wins, an old-deletion restore loses to a later deletion, and competing tombstones converge deterministically. It also proves safe next-revision handling and permanent lineage-bearing tombstone JSON.
- [ ] `DRV-04` proves incremental `bodyByteHash` runs before decode/parse/scalar validation; complete bodies through 25 MiB receive `full`; byte 25 MiB + 1 is not retained and yields exactly the first-25-MiB digest, `prefix-25MiB`, and `sizeAtLeast = 26,214,401`; only streaming/digest infrastructure failure omits the hash and it cannot permit parsing/application. It also proves raw fingerprints never affect identity, `remoteKey`, accepted-payload hashing, or conflict ordering; malformed escaped high/low/reversed-surrogate bodies retain full raw fingerprints but receive no RFC 8785 digest; and every exact Section 15.4 JSON type, required/nullability rule, pinned whitespace rule, scalar/UTF-8 and post-normalization size bound, valid-pair boundary, enum, epoch/relative unit and range, seven-day boundary, segment invariant, canonical derivation, envelope-only transcriptId, no-unknown-field rule, legal lineage combination, exact stable RFC 8785 bytes/digest, durable account-neutral valid candidates, bounded invalid metadata, four-download maximum, and per-transcript write serialization passes.
- [ ] `DRV-05` proves strict bounded legacy Drive JSON import, exact field/timing/ID rejection, derived remoteKey envelope write and verification before old-file cleanup, 512-byte upload acceptance, metadata-only quarantine at 513 bytes and all larger/invalid bounds, invalid old-file retention, no partial import, and no truncation.
- [ ] UI states Local only, Pending, Syncing, Synced, Needs attention, last sync, and pending count equal repository/sync-service fixture state.
- [ ] No raw Drive file ID appears.
- [ ] No source media or settings are uploaded.
- [ ] Revoke copy states that existing backup remains.
- [ ] `GIS-05` starts different-account sync paused; Reconcile without upload stages preview only and requires explicit confirmation before applying a remote winner; local transcript upload occurs only after separate disclosure confirmation.

### 24.4 Responsive and accessibility

- [ ] No horizontal page overflow at desktop, 390 px, 320 px, or 200% zoom.
- [ ] No hover-only action.
- [ ] All touch targets are at least 44 by 44 CSS px.
- [ ] Virtual keyboard does not hide critical action or active editor state.
- [ ] Comboboxes and queue reorder are keyboard-complete.
- [ ] Focus moves/restores correctly for routes, menus, dialogs, and sheets.
- [ ] Every status has visible text or icon-plus-accessible-name independent of color, verified by `A11Y-CONTRAST-01` and `A11Y-SR-01`.
- [ ] Live announcements are semantic and throttled.
- [ ] Every `A11Y-AUTO-*` state has zero critical/serious violations in EN and VI.
- [ ] `A11Y-KBD-01`, `A11Y-FOCUS-01`, `A11Y-REFLOW-01`, `A11Y-CONTRAST-01`, `A11Y-LIVE-01`, and `A11Y-SR-01` each pass every documented assertion in EN and VI.

### 24.5 Performance and localization

- [ ] Network inspection shows no model or ffmpeg request before user starts transcription.
- [ ] `PERF-01` proves separate lazy Library/editor/Settings chunks and no eager heavy/model/ffmpeg asset request.
- [ ] Normal navigation reuses workers/models; forced cancellation retains persistent model Cache Storage and later recreates at most one worker of that type.
- [ ] `PERF-02` records zero progress-caused commits in mounted header/nav/Library subtrees across 100 updates.
- [ ] `PERF-03` proves exact >200 Library and >500 Timeline virtualization thresholds plus 8 ms yield behavior using 1,000/5,000 fixtures.
- [ ] Every user-facing string and accessible name has EN/VI copy parity.
- [ ] `VIS-01` snapshots contain defined semantic themes and no gradients, glass, neon, or generic AI imagery.

### 24.6 Repository quality gates

Every implementation slice must pass applicable focused tests. Before merge, repository-required checks pass with zero errors or warnings:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`

Run worker typecheck for worker/shared contract changes and server build for `server/` changes.

## 25. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Product-slice rebuild creates old/new state divergence | Lost queue or inconsistent routes | Introduce repositories/contracts first; one durable source; remove old path per completed slice |
| Cooperative local cancellation unsupported deep in inference/ffmpeg | UI says cancelled while compute continues or live state is lost | Use cooperation only when proven; otherwise terminate active per-type worker, preserve persistent cache, confirm termination, and lazily recreate singleton |
| Segment-backed Document editing feels fragmented | Poor writing experience | Style blocks as continuous document; preserve caret and selection in reducer tests |
| Legacy data violates new invariants, Unicode scalar validity, pinned whitespace, or post-normalization size/ID bounds | Migration loss, empty exports, invalid hashes, or unsafe Drive metadata | Scalar validation before all transforms; immutable `CANONICAL_WS`; exact 1 MiB segment/synthesis and 16 MiB aggregate checks; exact remote rejection/local repair split; bounded `migrationQuarantine`; copy-before-delete and abort on inaccessible data; explicit repair; no truncation/splitting/destructive fallback |
| Drive races create duplicate files | Ambiguous remote state | Conflict-order canonical content, Drive-ID tie-break, post-write verification, and bounded eventual cleanup; never promise absolute uniqueness |
| Device clocks skew | Older state could appear newer | Causal tombstone lineage precedes regular ordering; revision then bounded epoch milliseconds/device/hash order same-kind candidates; do not treat timestamps as causal clocks |
| Popup/renewal browser behavior varies | Silent auth failure | Attempt IDs, GIS error callback, bounded watchdog, same-page `prompt: ''` only, explicit reload reconnect |
| Revoke cannot be confirmed without a usable token/callback | UI overstates removed access | Clear local session, label revocation unconfirmed, and link Google Account permissions |
| Remote JSON is oversized or hostile | Memory pressure, corruption, or transcript overwrite | Incremental raw-byte digest before decode; full hash through 25 MiB; abort on byte 25 MiB + 1 with exact prefix hash and no retained body/extra byte; strict bounded parser; durable validated candidates; metadata-only invalid quarantine |
| Raw-body, identity-key, and accepted-payload digests become conflated | Invalid input affects identity/order or malformed bodies lose forensic correlation | Keep `bodyByteHash`, `remoteKey`, and RFC 8785 payload hash separate by name, input, timing, storage, and permitted use; raw fingerprint never enters conflict ordering or acceptance |
| JavaScript silently encodes unpaired UTF-16 surrogates as replacement characters | Different keys/hashes, corrupted display, or cross-runtime disagreement | Explicit surrogate-pair validator before canonical whitespace handling, byte/scalar bounds, persistence, remoteKey, RFC 8785, and payload hashing; hard rejection without `U+FFFD`; quarantine raw-byte hash remains independent of decoding |
| Stale live record has a high revision | Deleted transcript resurrects | Tombstone wins before revision unless a user-observed exact deletionId restore has a greater revision; later deletions use new IDs |
| Raw or oversized transcript ID reaches Drive metadata | Metadata leakage, invalid query/name, or collisions | Scalar-validate before hashing, derive fixed 43-character remoteKey, recompute after parse, keep oversized local legacy records in recovery quarantine as Needs attention, never truncate |
| Avatar URL redirects or cannot be fetched under browser CORS | Browser follows an unapproved target or identity image fails | Validate initial HTTPS/exact host/credentials/port, fetch with `redirect: "error"`, cap bytes/MIME/time, use Blob URL, and fall back locally on any redirect or fetch failure; never claim hop inspection |
| Sync overwrites active edits | User data loss | Dirty-editor protection, local save first, transactional incoming merge |
| Navigation/unload occurs during dirty save | Lost edits or false persistence promise | Await app navigation, restore popstate, Retry/Discard against durable revision, conditional beforeunload; pagehide remains best effort |
| High-frequency progress harms rendering/a11y | Jank and announcement spam | Normalizer, narrow subscriptions, visual throttle, live-region throttle |
| Mobile sheets/editor collide with keyboard | Hidden actions | Natural-height page editor, safe areas, visual viewport testing at 320/390 |
| Copy extraction leaves English in adapters | Broken VI parity | Stable codes, typed feature copy, hardcoded-string lint/test scan |
| Recommendation overclaims device capability | Misleading guidance | Auto-select only compatible multilingual non-q4 Base/Tiny locally; require explicit choice whenever no beginner-safe candidate exists; treat server capability defaults separately |
| Permanent tombstone ordering state grows storage | Long-term metadata accumulation | After confirmed 180-day reconcile, compact retry/error auxiliaries only; retain deletionId, lineage, hash, remoteKey, and ordering identity until future replica-watermark protocol |
| Quarantine copy or serialization fails during v1 upgrade | Original record becomes inaccessible or is silently dropped | Single upgrade transaction, measured 25 MiB bound, put-before-delete ordering, bounded in-memory failure report when safe, and transaction abort retaining the v1 database on failure |
| Rollback client requests IndexedDB v1 after v2 exposure | `VersionError` or unusable app | Ship Slice 1A version-aware opener first and prohibit production rollback below that floor |

## 26. Explicit resolved decisions

1. Precision Studio is approved visual direction.
2. Rebuild uses product slices, not big-bang or surface-only delivery.
3. Workbench and Library are primary destinations; Settings remains secondary.
4. Navigation uses query parameters for static-host compatibility.
5. Mobile uses bottom navigation and queue bottom sheet.
6. Transcript uses a full workspace, never a centered result modal.
7. First run means no valid explicit stored model choice. Automatic local recommendation can select only compatible multilingual non-q4 Base or Tiny variants, preferring Base; explanation is derived from current inputs.
8. Small, English-only, and every q4 model always require explicit local choice. Whenever compatible models exist but no beginner-safe candidate remains—including the Small/q4-only fixture—automatic start blocks with plain-language trade-offs; if none are compatible, runtime recovery blocks start. Server capability defaults are evaluated separately and may be selected by the server.
9. File and Link are distinct source types; Link has no local-file prerequisite.
10. Progress phases are Prepare, Load model, Transcribe, Save. No synthetic global percentage.
11. ETA is conditional on stable measured throughput.
12. Every runtime reaches cancelled only after acknowledgement, abort completion, or worker termination. Cooperative local cancel is conditional; forced cancel may discard live worker state but retains persistent model Cache Storage and permits lazy singleton recreation.
13. Queue remains sequential and supports accessible reorder alternatives.
14. Errors are contextual and singular. Toasts confirm; they do not report failures.
15. Ordered segments are canonical and use safe-integer relative `startMs`/`endMs` bounded to seven days. After scalar validation, the immutable `CANONICAL_WS` set drives segment run-collapse/outer removal and title outer-only removal; `U+FEFF` and `U+0085` are included, `U+200B` is not, title internal scalars/runs remain exact, and no NFC/NFKC or engine `trim()` behavior applies. One-space joining derives document text. Every segment, including normalized-empty segments, must pass bounded, nonnegative, nonoverlapping timing before SRT/VTT is eligible; empty cues are omitted only afterward, and zero remaining non-empty cues disables subtitle export with an explicit reason.
16. Runtime and local legacy seconds convert with checked `Math.round(seconds * 1000)` and deterministic forward clamp/repair. Remote legacy timing is strict and never repaired. Over-seven-day input is never capped. Canonicalizable legacy no-segment transcripts use the exact deterministic hashed zero-time segment ID only when normalized fallback text is at most 1 MiB; each ordinary normalized segment has the same 1 MiB limit, and final joined text has a 16 MiB limit. Exact limits pass and plus-one-byte values fail. Remote violations reject/quarantine the complete record; local violations enter migration quarantine under copy-before-delete/abort guarantees; neither truncates or splits text. Only a non-empty generated cue is subtitle-eligible. Split/merge/paste, formatter, export, parser, migration, and payload-hash rules use canonical milliseconds.
17. Autosave is local-first, debounced at 600 ms, and serialized. App navigation awaits save; dirty Back/Forward restores editor state; Retry/Discard is explicit; unload persistence is best effort only.
18. Library delete uses Undo plus a durable tombstone with fresh stable deletionId; only a user action observing that exact tombstone may write a greater-revision restoredFromDeletionId.
19. Drive sync is two-way for transcript JSON only.
20. Approved Google scopes are exactly `openid email profile drive.file drive.appdata` with full scope URIs for Drive.
21. GIS access tokens/expiry remain memory-only and no browser refresh token exists. Same-page `prompt: ''` may be attempted; reload requires user reconnect.
22. Identity comes from bounded OIDC UserInfo; name/picture are optional, verified email is display-only, account key is normalized issuer plus `sub`, and avatar validates the initial exact HTTPS host/no-credentials/standard-port URL, uses a bounded `redirect: "error"` fetch, and falls back locally on every redirect/CORS/fetch validation failure. Browser redirect hops/final URL are not inspected. Revoke is confirmed only by callback and never erases backup.
23. When exactly one candidate is a tombstone, it wins before normal ordering unless the live candidate is an exact observed greater-revision restore of that deletionId. Two-live and two-tombstone candidates use revision, bounded epoch-millisecond `updatedAt`, ASCII device ID, then lowercase RFC 8785/SHA-256 hash including deletion lineage. Revision alone does not prevent resurrection.
24. Drive never blocks or precedes local save.
25. All runtimes use one normalized save/sync path.
26. IndexedDB v2 receives transcripts, `migrationQuarantine`, account-neutral drafts/conflict candidates, sync metadata, pending operations, safe-integer revision/device/causal-tombstone state, sync state, and meta through Slice 1B transactional migration. Quarantine copy precedes v1 source deletion; inaccessible-data failure aborts the transaction. Slice 1A is the permanent rollback floor.
27. React presentation state stays local; workflow state uses reducers; Drive sync is an external service with snapshot subscriptions.
28. Runtime and issue localization uses stable codes, never string matching.
29. EN/VI copy parity is compile-time enforced.
30. Library, editor, and Settings are separate lazy chunks; model/ffmpeg assets wait for explicit user action; exact virtualization, yielding, Drive concurrency, and profiler-isolation thresholds apply.
31. WCAG 2.2 AA, zero automated critical/serious violations, all named EN/VI manual checks, 320 px completeness, both themes, and reduced motion are release requirements in every slice.
32. No source-media upload, concurrent batch, fake dashboard, PWA expansion, or broad backend refactor is included.
33. Drive uses deterministic MIME, 43-character SHA-256 remoteKey filename/appProperties, read-before-write discovery, and ETag-conditioned PATCH semantics; JSON retains bounded transcriptId and must hash back to the same key. Raw transcript IDs never enter filenames/appProperties. Concurrent creates may duplicate files; conflict-order plus Drive-ID tie-break, verification, and bounded cleanup provide eventual—not absolute—uniqueness.
34. Section 15.4 is the normative schema-2 exact allowlist. Envelope owns transcriptId/revision/updatedAt/deletion lineage; live payload owns only title/sourceName/language/modelId/mode/createdAt/text/segments; segments own only id/startMs/endMs/text. Exact types, nulls, bounds, units, canonical derivation, and unknown-field rejection apply. RFC 8785 hashing uses that exact payload without assembled app-domain fields.
35. Legacy Drive `{id}.json` documents use the exact strict remote legacy contract: any invalid field, malformed scalar sequence, timing/ID failure, or canonical target-bound failure yields bounded metadata-only quarantine and no partial import. Only canonicalized records receive a verified schema-2 envelope before bounded old-file cleanup; invalid old files remain untouched.
36. Remote tombstones and local causal ordering identity are permanent; only retry/error auxiliary sync metadata compacts after the confirmed 180-day gate.
37. Different-account connection starts paused. Reconcile without upload stages preview but applies no remote winner without explicit confirmation; local upload requires separate disclosure confirmation.
38. Every schema-2, UserInfo/avatar-derived, and legacy string must be a valid Unicode scalar sequence before canonical whitespace handling, counting, persistence, `remoteKey` derivation, RFC 8785 serialization, or accepted-payload hashing. UTF-16 lone/reversed/unpaired surrogates are rejected without replacement; valid pairs count as one scalar. Separately, remote `bodyByteHash` covers exact raw bytes before decoding, can fingerprint malformed UTF-8/escaped surrogates, and never participates in identity, acceptance, or ordering.
39. Local v1 migration applies only documented repairs. Every remaining invalid record enters recoverable `migrationQuarantine` when bounded; serialization or quarantine persistence failure aborts migration rather than losing data. Invalid timestamps never remain in canonical transcript state or conflict ordering.
40. Remote invalid-record quarantine uses lowercase raw `bodyByteHash`: `full` for every complete body through 25 MiB, or `prefix-25MiB` plus fixed `sizeAtLeast = 26,214,401` after detecting and discarding byte 25 MiB + 1. Hash omission is allowed only for streaming/digest infrastructure failure and requires a bounded unavailable reason. Local structured-clone migration quarantine has no raw-body fingerprint and never manufactures one by serializing malformed strings.
