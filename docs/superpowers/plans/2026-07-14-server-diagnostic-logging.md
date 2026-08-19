# Server Diagnostic Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce readable configurable server logs and preserve bounded ffmpeg diagnostics when media extraction fails.

**Architecture:** Load configuration before tracing and initialize a compact formatter through a focused `logging` module. Keep subprocess handling local to each pipeline module: ffmpeg drains and retains a bounded stderr tail, while yt-dlp logs its already-drained stderr. Add structured job lifecycle events at existing request and pipeline boundaries.

**Tech Stack:** Rust 2021, Tokio process and I/O APIs, tracing, tracing-subscriber `EnvFilter`, serde/TOML, Cargo tests.

---

## File Map

- Create `server/src/logging.rs`: normalize simple levels, build `EnvFilter`, initialize compact tracing.
- Modify `server/src/config.rs`: add `LoggingConfig`, defaults, environment override, accessor, and config tests.
- Modify `server/src/main.rs`: load config before tracing and register the logging module.
- Modify `server/src/pipeline/extract.rs`: drain/log ffmpeg stderr and retain a bounded diagnostic tail.
- Modify `server/src/pipeline/download.rs`: log yt-dlp stderr lines and failed exit status.
- Modify `server/src/pipeline/run.rs`: log job lifecycle, phase transitions, and cleanup failures.
- Modify `server/src/routes/transcribe.rs`: log parsed upload and queued job metadata.
- Modify `server/Cargo.toml`: remove the no-longer-needed tracing-subscriber `json` feature.
- Modify `server/config.toml`, `server/.env.example`, `server/README.md`: document logging configuration and precedence.

### Task 1: Configurable Human-Readable Tracing

**Files:**
- Create: `server/src/logging.rs`
- Modify: `server/src/config.rs`
- Modify: `server/src/main.rs`
- Modify: `server/Cargo.toml`

- [ ] **Step 1: Add failing configuration and filter tests**

Add tests proving `Config::default().log_level() == "info"`, TOML accepts `[logging] level = "debug"`, and `logging::simple_directive()` maps supported levels while invalid values use `info`.

```rust
#[test]
fn logging_defaults_to_info() {
    assert_eq!(Config::default().log_level(), "info");
}

#[test]
fn logging_level_deserializes_from_toml() {
    let config: Config = toml::from_str("[logging]\nlevel = \"debug\"").unwrap();
    assert_eq!(config.log_level(), "debug");
}
```

```rust
#[test]
fn logging_filter_uses_supported_level() {
    assert_eq!(simple_directive("debug"), "whisdom_server=debug,tower_http=debug");
}

#[test]
fn logging_filter_rejects_unknown_level() {
    assert_eq!(simple_directive("verbose"), "whisdom_server=info,tower_http=info");
}
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `cargo test --locked logging -- --nocapture`

Expected: compilation fails because `LoggingConfig`, `log_level`, and logging filter helpers do not exist.

- [ ] **Step 3: Implement configuration and tracing initialization**

Add `LoggingConfig { level: String }` with an `info` Rust default, `WHISDOM_LOG_LEVEL` override, and `Config::log_level()`. Create `server/src/logging.rs`:

```rust
use tracing_subscriber::EnvFilter;

use crate::config::Config;

fn normalized_level(level: &str) -> &'static str {
    match level.to_ascii_lowercase().as_str() {
        "trace" => "trace",
        "debug" => "debug",
        "info" => "info",
        "warn" => "warn",
        "error" => "error",
        _ => "info",
    }
}

fn simple_directive(level: &str) -> String {
    let level = normalized_level(level);
    format!("whisdom_server={level},tower_http={level}")
}

pub fn init(config: &Config) {
    let filter = std::env::var("RUST_LOG")
        .ok()
        .and_then(|value| EnvFilter::try_new(value).ok())
        .unwrap_or_else(|| EnvFilter::new(simple_directive(config.log_level())));

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .compact()
        .init();

    if normalized_level(config.log_level()) != config.log_level().to_ascii_lowercase() {
        tracing::warn!(configured_level = config.log_level(), "invalid log level; using info");
    }
}
```

Load and resolve `Config` before `logging::init(&config)` in `main`; remove `.json()` and the inline subscriber. Remove `json` from tracing-subscriber features.

- [ ] **Step 4: Run focused tests**

Run: `cargo test --locked logging -- --nocapture`

Expected: logging tests pass.

### Task 2: Preserve ffmpeg and yt-dlp Diagnostics

**Files:**
- Modify: `server/src/pipeline/extract.rs`
- Modify: `server/src/pipeline/download.rs`

- [ ] **Step 1: Add failing stderr-tail tests**

Add tests in `extract.rs` for a helper retaining the final 32 lines and rendering at most 16 KiB without breaking UTF-8.

```rust
#[test]
fn stderr_tail_keeps_last_lines() {
    let mut tail = StderrTail::default();
    for index in 0..40 {
        tail.push(format!("line {index}"));
    }
    let rendered = tail.render();
    assert!(!rendered.contains("line 7\n"));
    assert!(rendered.contains("line 8\n"));
    assert!(rendered.ends_with("line 39"));
}

#[test]
fn stderr_tail_is_bounded_and_valid_utf8() {
    let mut tail = StderrTail::default();
    tail.push("é".repeat(20_000));
    let rendered = tail.render();
    assert!(rendered.len() <= STDERR_MAX_BYTES);
    assert!(rendered.is_char_boundary(0));
}
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `cargo test --locked stderr_tail -- --nocapture`

Expected: compilation fails because `StderrTail` does not exist.

- [ ] **Step 3: Implement bounded ffmpeg stderr draining**

Define `STDERR_MAX_LINES = 32`, `STDERR_MAX_BYTES = 16 * 1024`, and `StderrTail(VecDeque<String>)`. `push` truncates oversized lines to their UTF-8-safe suffix and evicts old lines; `render` joins lines and retains an UTF-8-safe final suffix no larger than the byte cap.

After ffmpeg spawn, require `child.stderr.take()`, then spawn an async reader using `BufReader::new(stderr).lines()`. For each non-empty line:

```rust
tracing::debug!(target: "ffmpeg", output = %line, "ffmpeg");
tail.push(line);
```

Await the reader after normal exit. On cancellation, kill/wait and await the reader before returning. On failure:

```rust
tracing::error!(
    target: "ffmpeg",
    status = %status,
    stderr = %tail.render(),
    "ffmpeg exited unsuccessfully"
);
return Err(AppError::Internal("ffmpeg exited with non-zero status".into()));
```

Reader and join errors return explicit internal errors. Add a debug event before spawning with executable, input, and output paths.

- [ ] **Step 4: Log yt-dlp stderr without retaining it**

Replace the discarded line with:

```rust
tracing::debug!(target: "yt_dlp", output = %line, "yt-dlp");
```

Log executable/work directory at start and exit status at error level before returning the existing safe error.

- [ ] **Step 5: Run focused tests**

Run: `cargo test --locked stderr_tail -- --nocapture`

Expected: both stderr-tail tests pass.

### Task 3: Add Job-Scoped Pipeline Events

**Files:**
- Modify: `server/src/routes/transcribe.rs`
- Modify: `server/src/pipeline/run.rs`

- [ ] **Step 1: Add structured request and queue events**

After multipart parsing, debug-log filename, byte count, and effective language. Before spawning the pipeline, info-log job ID and `file` or `url` input kind. Never log authorization data, email, URL value, transcript, or media content.

```rust
tracing::debug!(
    filename = file_filename.as_deref().unwrap_or(""),
    bytes = file_bytes.as_ref().map_or(0, Vec::len),
    language = language.as_deref().unwrap_or("auto"),
    "transcribe input parsed"
);
```

- [ ] **Step 2: Add pipeline lifecycle and phase events**

Info-log pipeline start, completion with segment count, cancellation, and errors with `job_id`. Debug-log every phase in `update_phase`. Log model path, thread count, effective language, and media/audio paths only at debug level.

- [ ] **Step 3: Replace silent cleanup suppression with warnings**

Change `cleanup` to inspect each `read_dir`, `next_entry`, `remove_file`, and `remove_dir` result. Warn with `work_dir`, affected path, and error while continuing cleanup when possible.

- [ ] **Step 4: Run all server tests**

Run: `cargo test --locked`

Expected: all server tests pass, including five multipart route regressions and new logging/tail tests.

### Task 4: Document Configuration and Verify

**Files:**
- Modify: `server/config.toml`
- Modify: `server/.env.example`
- Modify: `server/README.md`

- [ ] **Step 1: Update operator configuration**

Add checked-in TOML:

```toml
[logging]
# trace, debug, info, warn, or error
level = "debug"
```

Add `WHISDOM_LOG_LEVEL=debug` to `.env.example`. Add `[logging]` to the README config sample, `WHISDOM_LOG_LEVEL` to the override table, and explain that `RUST_LOG` has highest precedence and supports advanced target directives.

- [ ] **Step 2: Run server verification**

Run: `cargo test --locked`

Expected: all tests pass.

Run: `cargo build --locked`

Expected: release-independent server build succeeds.

Run: `cargo clippy --all-targets --all-features --locked -- -D warnings`

Expected: no new warning from scoped changes; report any known baseline warning separately.

Run: `cargo fmt --all -- --check`

Expected: scoped files are formatted; report repository baseline formatting failures without reformatting unrelated files.

- [ ] **Step 3: Run repository verification**

Run from repository root: `pnpm typecheck`, `rtk lint`, `pnpm test`, and `pnpm build`.

Expected: all commands exit successfully. Existing Vite size/timing warnings are non-failing.

- [ ] **Step 4: Inspect final scope**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors; unrelated dirty files remain untouched. Do not commit unless explicitly requested.
