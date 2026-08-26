# Main-page transcript mode and Companion status

## Goal

Let people choose the transcription backend on the main page and see whether Whisdom Desktop Companion is reachable before they rely on it.

## Scope

- Move the existing processing-mode select from Settings to Quick setup on the main page.
- Retain Settings only for advanced local chunk and overlap controls.
- Probe the local helper on initial app load and whenever Desktop Companion mode is selected.
- Show a compact Companion status below the mode selector: available, busy, or not found.
- For not found, link to `https://github.com/teppyboy/whisdom/releases`.
- Keep Companion model selection and native picker gated by a successful connection.
- Add English and Vietnamese copy and focused component coverage.

## Design

Quick setup becomes the single place to choose mode, model, and spoken language. The mode control uses the existing `MODES` catalogue and continues to hide Server when `VITE_SERVER_URL` is absent.

The Companion status is only shown for Desktop Companion mode. A restrained inline row reports the current health: green Available, amber Busy, or muted Not found. Not found explains that the Windows app must be running and provides a Releases-page download link. Selecting Companion triggers discovery; local model controls remain unavailable until its capabilities are loaded.

## Data flow

`App` holds helper capabilities as today and adds a health state derived from `LocalHelperClient.discover()`. A discovery effect runs on mount and on selecting `local-helper`. A successful discovery supplies availability/busy status; `connect()` continues pairing and capabilities fetching only for Companion mode.

## Errors and validation

Local discovery failures are a normal unavailable state, not a toast. The component never claims that a release asset exists; it links to the Releases listing. Unit/component coverage verifies mode placement and unavailable status/link. Full typecheck, lint, unit tests, browser tests, build, Worker check, Rust tests/build, WASM build, and Companion build are required before completion.
