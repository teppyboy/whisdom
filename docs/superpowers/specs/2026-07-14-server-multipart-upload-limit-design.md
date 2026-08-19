# Server Multipart Upload Limit Design

## Problem

The browser sends a valid multipart request with `audio` and optional `language`
fields. The Rust server advertises a configurable 500 MiB upload limit, but the
`Multipart` extractor still uses Axum's 2 MiB default body limit. Reading a
larger audio field therefore fails before the configured file-size check runs.
The route also converts that size rejection into HTTP 500 and silently ignores
errors returned while advancing to the next multipart field.

## Contract

`limits.max_upload_mb` limits audio file bytes, not multipart framing and text
field overhead. The request parser may accept up to the configured audio limit
plus 1 MiB of multipart overhead. The route must still reject an audio field
whose bytes exceed the configured limit.

The existing client request contract remains unchanged:

- `audio`: uploaded file with its original filename
- `url`: alternative remote media URL
- `language`: optional transcription language
- `turnstile_token`: optional server deployment token

The browser remains responsible for generating the multipart `Content-Type`
header and boundary.

## Server Changes

Apply `DefaultBodyLimit::max(max_upload_bytes + 1 MiB)` only to
`POST /api/transcribe`. Use saturating arithmetic when deriving the parser
limit.

Convert Axum multipart errors according to their status:

- HTTP 413 becomes `AppError::PayloadTooLarge`.
- HTTP 400 becomes `AppError::BadRequest` with Axum's parser message.
- Other statuses become `AppError::Internal` and retain diagnostic detail.

Propagate errors from both `next_field()` and field body reads. Keep the exact
audio byte check after reading the field.

## Client Changes

None. `ServerTranscriptionApi.submitJob` already sends one browser-generated
`FormData` request with matching field names and no manual `Content-Type`.
There is no client retry implementation. Duplicate server log entries require
separate reproduction evidence and must not cause a speculative retry or click
guard in this fix.

## Testing

Add server tests that verify:

- The multipart parser limit includes the configured file limit and overhead.
- Multipart size errors map to HTTP 413.
- Malformed multipart input maps to HTTP 400.
- Multipart iteration errors are propagated instead of becoming a missing-input
  error.

Run Rust formatting, Clippy, tests, and build. Run repository lint, typecheck,
unit tests, and production build because server and client contract behavior is
shared by the application.

## Deferred Work

The route buffers an entire upload and then copies it into a `Vec<u8>`. Direct
streaming to disk would reduce peak memory for large uploads, but requires a
larger job-lifecycle and cleanup change. It is outside this defect fix.
