# Server Multipart Upload Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make server uploads honor the configured audio-file limit instead of Axum's 2 MiB multipart default, with correct HTTP errors.

**Architecture:** Derive a bounded multipart request limit from the configured audio limit plus a fixed 1 MiB framing allowance. Apply it only to `/api/transcribe`, preserve the exact audio-byte check, and translate Axum multipart statuses into the existing application error model.

**Tech Stack:** Rust 2021, Axum 0.8, Tokio, Tower 0.5 test utilities

---

### Task 1: Define Multipart Parser Limit

**Files:**
- Modify: `server/src/config.rs:12,216-225,310-316`

- [ ] **Step 1: Add a failing configuration test**

Add a `#[cfg(test)]` module asserting that a 500 MiB audio limit produces a
501 MiB multipart parser limit and that arithmetic saturates at `usize::MAX`.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn multipart_body_limit_includes_bounded_overhead() {
        let config = Config::default();

        assert_eq!(
            config.multipart_body_limit(),
            config.max_upload_bytes() + MULTIPART_OVERHEAD_BYTES
        );
    }

    #[test]
    fn multipart_body_limit_saturates() {
        let mut config = Config::default();
        config.limits.max_upload_mb = usize::MAX;

        assert_eq!(config.multipart_body_limit(), usize::MAX);
    }
}
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `cargo test config::tests --locked`

Expected: compilation fails because `MULTIPART_OVERHEAD_BYTES` and
`multipart_body_limit` do not exist.

- [ ] **Step 3: Implement the limit derivation**

Add the constant and method:

```rust
const MULTIPART_OVERHEAD_BYTES: usize = 1024 * 1024;

pub fn multipart_body_limit(&self) -> usize {
    self.max_upload_bytes()
        .saturating_add(MULTIPART_OVERHEAD_BYTES)
}
```

Make `max_upload_bytes()` itself use saturating multiplication so extreme
configuration cannot wrap:

```rust
pub fn max_upload_bytes(&self) -> usize {
    self.limits.max_upload_mb.saturating_mul(1024 * 1024)
}
```

- [ ] **Step 4: Run the focused test and verify success**

Run: `cargo test config::tests --locked`

Expected: both configuration tests pass.

### Task 2: Reproduce Route Failures

**Files:**
- Modify: `server/Cargo.toml:6-24`
- Modify: `server/src/main.rs:10-105`

- [ ] **Step 1: Add Tower test utilities**

Add:

```toml
[dev-dependencies]
tower = { version = "0.5", features = ["util"] }
```

- [ ] **Step 2: Extract router construction**

Move router creation from `main()` into this testable function without changing
route behavior:

```rust
fn build_app(config: Config, queue: Queue) -> axum::Router {
    // Existing CORS, state, public routes, protected routes, and trace layer.
}
```

Keep directory creation, address binding, and `axum::serve` in `main()`.

- [ ] **Step 3: Add multipart request helpers and failing route tests**

Under `#[cfg(test)] mod tests`, build requests with an explicit boundary and
`Authorization: Bearer dev-mode`. Configure `dev_auth_bypass = true` and a
temporary directory. Add these Tokio tests:

```rust
#[tokio::test]
async fn transcribe_accepts_audio_above_axum_default_limit() {
    // max_upload_mb = 4; send 3 MiB; expect StatusCode::OK.
}

#[tokio::test]
async fn transcribe_rejects_audio_above_configured_file_limit() {
    // max_upload_mb = 1; send 1 MiB + 1 byte; expect PAYLOAD_TOO_LARGE.
}

#[tokio::test]
async fn transcribe_reports_incomplete_multipart_as_bad_request() {
    // Omit the closing boundary; expect BAD_REQUEST and a parser error body,
    // not the "audio or URL required" fallback.
}
```

Use `tower::ServiceExt::oneshot`, `axum::body::Body`, and
`axum::body::to_bytes` for requests and response assertions.

- [ ] **Step 4: Run route tests and verify failure**

Run: `cargo test tests::transcribe --locked`

Expected: the 3 MiB request returns 500, configured-limit rejection returns
500 when Axum's default wins, and incomplete multipart returns the fallback
missing-input message.

### Task 3: Apply Limit and Preserve Multipart Errors

**Files:**
- Modify: `server/src/main.rs:68-94`
- Modify: `server/src/routes/transcribe.rs:1-98`

- [ ] **Step 1: Apply the route-scoped Axum body limit**

Import `axum::extract::DefaultBodyLimit`, compute
`config.multipart_body_limit()` before moving config into state, and apply:

```rust
.route(
    "/api/transcribe",
    axum::routing::post(routes::transcribe::transcribe)
        .layer(DefaultBodyLimit::max(multipart_body_limit)),
)
```

- [ ] **Step 2: Add multipart error conversion**

In `transcribe.rs`, map Axum's status while retaining diagnostics:

```rust
fn multipart_error(error: axum::extract::multipart::MultipartError) -> AppError {
    match error.status() {
        axum::http::StatusCode::PAYLOAD_TOO_LARGE => AppError::PayloadTooLarge,
        axum::http::StatusCode::BAD_REQUEST => AppError::BadRequest(error.body_text()),
        _ => AppError::Internal(error.body_text()),
    }
}
```

- [ ] **Step 3: Propagate all parser errors**

Replace the swallowing loop:

```rust
while let Some(field) = multipart.next_field().await.map_err(multipart_error)? {
```

Replace each multipart `.bytes()` or `.text()` conversion with
`.map_err(multipart_error)?`. Keep the audio filename in the diagnostic log,
but return the status-aware converted error. Retain:

```rust
if data.len() > state.config.max_upload_bytes() {
    return Err(AppError::PayloadTooLarge);
}
```

- [ ] **Step 4: Run server tests**

Run: `cargo test --locked`

Expected: all configuration and route tests pass.

- [ ] **Step 5: Run server quality checks**

Run: `cargo fmt --check`

Run: `cargo clippy --all-targets --all-features --locked -- -D warnings`

Run: `cargo build --locked`

Expected: all commands exit zero without warnings.

### Task 4: Repository Verification

**Files:**
- Verify only; no planned edits

- [ ] **Step 1: Run required application checks**

Run from repository root:

```text
pnpm typecheck
rtk lint
pnpm test
pnpm build
```

Expected: all commands exit zero. E2E is not required because no browser UI,
storage, worker, or routing behavior changes.

- [ ] **Step 2: Inspect final diff**

Run: `git diff -- server/Cargo.toml server/src/config.rs server/src/main.rs server/src/routes/transcribe.rs docs/superpowers/specs/2026-07-14-server-multipart-upload-limit-design.md docs/superpowers/plans/2026-07-14-server-multipart-upload-limit.md`

Expected: only approved multipart-limit code, tests, and documentation appear.
