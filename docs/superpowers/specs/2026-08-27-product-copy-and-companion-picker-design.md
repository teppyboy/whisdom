# Product copy and Companion picker design

## Goal

Replace generic, implementation-led product wording with concise, connected English and Vietnamese copy, remove redundant Desktop Companion explanation, and bring the Companion forward before it opens the native file picker.

## Scope

- Rewrite every user-visible copy value in `src/App.tsx` and typed fatal-storage copy in `src/app/copy.ts`.
- Preserve translation keys, technical identifiers, model names, protocol/version values, and recovery behavior.
- Update tests that intentionally match exact visible wording.
- Remove the main-page `Desktop Companion` description card; retain the direct file-selection control and availability status.
- In Tauri, show, unminimize, and focus the Companion window immediately before invoking `pick_files`.

## Copy principles

- Controls use direct verbs: `Choose files`, `Start transcription`, `Clear saved transcripts`.
- Supporting text names the actual result or limit; it does not narrate internals or repeat the label.
- English remains plain and restrained. Vietnamese is natural product Vietnamese, not literal English syntax.
- Privacy claims remain precise: media remains local unless the selected mode sends it to a network service.
- Errors state the condition and the next useful action.

## UX behavior

Quick setup remains the primary place to choose a transcription mode. In Desktop Companion mode, the status row communicates availability; the standalone descriptive card is removed because it duplicates that context. Choosing files asks the running Tauri app to restore/show/focus before the native Windows picker opens, so its picker does not appear detached from the app.

## Data flow and safety

The website continues calling the authenticated localhost helper endpoint. The helper runs the existing picker closure; the closure invokes Tauri window activation methods before `pick_files`. Window-method errors are logged but do not prevent the file picker from opening. No browser media data, OAuth scope, storage schema, or network contract changes.

## Validation

- Component tests cover the removed card/file chooser and exact updated copy where appropriate.
- Native tests cover or otherwise compile-check the Tauri picker activation path.
- Run root typecheck, lint, unit tests, build; Worker typecheck; WASM build; Rust server tests/release build; Companion release build. Playwright remains excluded by explicit user instruction.
