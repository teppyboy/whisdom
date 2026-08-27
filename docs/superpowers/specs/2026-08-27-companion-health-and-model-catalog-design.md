# Companion health and model catalog design

## Goal

Keep Desktop Companion availability current, describe native Whisper choices in plain language, add full Whisper Large v3 for accuracy-sensitive work, and make pinned Hugging Face model metadata easy to refresh deliberately.

## Scope

- While Desktop Companion mode is selected, refresh localhost health every second and immediately when the browser regains focus.
- Stop the timer and focus listener when another mode is selected or the app unmounts.
- Replace technical `quality - ~size` helper model text with clear EN/VI descriptions based on model capability and download size.
- Add `ggml-large-v3-q5_0` as `Whisper Large v3`, described as the best-accuracy choice and kept optional beside the Turbo default.
- Keep runtime downloads immutable: each native model remains tied to a resolved Hugging Face Git revision and SHA-256.
- Add a Bash maintenance script that queries Hugging Face for the current Git revision and LFS metadata, then rewrites the pinned revision, model URL fragments, sizes, and SHA-256 values in the native catalog. It must require an explicit `--apply` to write the catalog.

## Non-goals

- No runtime metadata lookups.
- No unverified model downloads.
- No Companion protocol or IndexedDB schema changes.
- No new model-management UI.

## Data flow

The React page polls the existing authenticated-free localhost `/health` discovery endpoint only in Desktop Companion mode. Failed discovery yields the existing unavailable state. The model picker still comes entirely from the helper capability response; the UI maps known native model IDs to localized human descriptions and formats download size.

The Rust catalog holds the approved model IDs, labels, filenames, resolved revision, URL, size, and hash. The maintenance script queries Hugging Face only when an operator runs it, prints the proposed pin changes by default, and updates the catalog only with `--apply`. The Companion continues verifying SHA-256 before using a downloaded model.

## Validation

- Component test proves health refresh scheduling is active only in Companion mode and cleaned up.
- Component test proves model descriptions are understandable and localized.
- Rust catalog test includes full Large v3 and validates every fixed SHA and resolved URL.
- Script shell syntax check; dry-run against the catalog.
- Run root typecheck, lint, unit tests, build; server tests and release build; Companion Vulkan release build. Browser E2E remains CI-only.
