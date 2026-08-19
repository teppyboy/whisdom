# Server Diagnostic Logging Design

## Goal

Make server logs readable during local operation and expose enough job and subprocess detail to diagnose failures such as ffmpeg exiting unsuccessfully.

## Current Problem

The server always initializes JSON tracing before loading configuration. Operators cannot select the log level in `config.toml`, and routine terminal output is difficult to scan.

The ffmpeg process pipes stderr but never reads it. This discards the diagnostic explaining a failed conversion and risks blocking the child if the pipe buffer fills. Background pipeline failures only reach the frontend as a safe generic error and do not produce a job-scoped backend error log.

## Configuration

Add a logging section:

```toml
[logging]
level = "debug"
```

Accepted levels are `trace`, `debug`, `info`, `warn`, and `error`. The checked-in development configuration defaults to `debug`; the Rust default remains `info` when the field is absent.

`WHISDOM_LOG_LEVEL` overrides `logging.level`. `RUST_LOG` remains the highest-priority override and may contain full tracing filter directives. This preserves existing deployment behavior while giving normal operators a simple setting.

The server loads and resolves configuration before initializing tracing. Invalid simple levels fall back to `info` rather than preventing startup.

## Output Format

Replace JSON tracing output with the compact human-readable `tracing-subscriber` formatter. Each event includes timestamp, level, target, message, and structured fields. ANSI behavior remains controlled by the formatter's terminal handling.

## Diagnostic Events

Add structured events at these boundaries:

- Request accepted: content type and content length.
- Upload parsed: filename, byte count, and selected language.
- Job queued: job ID and input kind.
- Pipeline started and phase changed: job ID, phase, and relevant paths or options at debug level.
- Pipeline completed: job ID and segment count.
- Pipeline cancelled or failed: job ID and error at info or error level.
- Cleanup problems: log directory-read, file-removal, and directory-removal failures with the work directory and error at warning level.

Logs must not contain bearer tokens, Turnstile tokens, user email addresses, transcript contents, or uploaded media contents.

## ffmpeg Handling

Take ownership of ffmpeg stderr immediately after spawning the process. Drain it concurrently while the existing cancellation/status loop runs.

Each non-empty stderr line is emitted at debug level with an `ffmpeg` target. Maintain a bounded tail while reading so diagnostics cannot consume unbounded memory. Keep at most the final 32 lines and cap the rendered tail to 16 KiB.

After ffmpeg exits, await the stderr reader. On unsuccessful exit, emit one error event containing the exit status and bounded stderr tail. Return the existing safe `internal error: ffmpeg exited with non-zero status` result to the job/frontend; local paths and third-party diagnostics remain backend-only.

Reader failures become an internal pipeline error with job context logged by the pipeline boundary. Cancellation still kills and waits for ffmpeg before returning.

## yt-dlp Handling

The existing yt-dlp stderr reader already prevents pipe blockage but discards every line. Emit those lines at debug level. On failure, log the process status. A shared subprocess abstraction is out of scope.

## Tests

Add unit coverage for:

- Default logging level when configuration omits `[logging]`.
- TOML deserialization of a configured logging level.
- Construction of a server filter from supported simple levels.
- Bounded stderr-tail behavior, including line and byte caps.

Existing multipart route tests and application checks remain unchanged. Verification includes server tests/build plus repository typecheck, lint, unit tests, and production build.

## Documentation

Update `server/config.toml`, `server/.env.example`, and `server/README.md` with the new setting, override precedence, accepted levels, and `RUST_LOG` advanced override.

## Non-Goals

- Changing frontend error disclosure.
- Persisting logs to files or adding rotation.
- JSON/pretty format selection.
- A general subprocess execution framework.
- Streaming uploads or reducing existing media-buffer memory use.
