use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use super::config::HelperConfig;
use super::events::{unix_millis, EventHub, HelperEvent, LogEvent};
use super::protocol::HelperError;

const DEFAULT_FILTER: &str = "whisdom_helper=info,whisdom_server::helper=info,tower_http=info";

pub(crate) fn sanitize_filename(value: &str) -> String {
    let basename = value.rsplit(['/', '\\']).next().unwrap_or(value);
    let sanitized: String = basename
        .chars()
        .map(|character| {
            if character.is_control() {
                '?'
            } else {
                character
            }
        })
        .take(255)
        .collect();
    if sanitized.is_empty() {
        "unnamed-media".into()
    } else {
        sanitized
    }
}

pub struct HelperLogGuard {
    _worker_guard: WorkerGuard,
}

/// Broadcasts every tracing event as a `log` SSE event. This is the default
/// log channel for the unified events stream; stdout/stderr and the log file
/// remain best-effort diagnostics.
struct EventLogLayer {
    events: EventHub,
}

impl<S> tracing_subscriber::Layer<S> for EventLogLayer
where
    S: tracing::Subscriber,
{
    fn on_event(
        &self,
        event: &tracing::Event<'_>,
        _ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        let level = match *event.metadata().level() {
            tracing::Level::ERROR => "error",
            tracing::Level::WARN => "warn",
            tracing::Level::INFO => "info",
            // Debug and trace never leave the process.
            tracing::Level::DEBUG | tracing::Level::TRACE => return,
        };
        let mut visitor = LogFieldVisitor::default();
        event.record(&mut visitor);
        let Some(message) = visitor.message else {
            return;
        };
        self.events.emit(HelperEvent::Log(LogEvent {
            ts: super::events::rfc3339(unix_millis()),
            level,
            target: event.metadata().target().to_owned(),
            message,
            job_id: visitor.job_id,
        }));
    }
}

#[derive(Default)]
struct LogFieldVisitor {
    message: Option<String>,
    job_id: Option<String>,
}

impl tracing::field::Visit for LogFieldVisitor {
    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        match field.name() {
            "message" => self.message = Some(value.to_owned()),
            "job_id" => self.job_id = Some(value.to_owned()),
            _ => {}
        }
    }

    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        match field.name() {
            "message" => self.message = Some(format!("{value:?}")),
            "job_id" => self.job_id = Some(format!("{value:?}")),
            _ => {}
        }
    }
}

pub fn init(config: &HelperConfig, events: &EventHub) -> Result<HelperLogGuard, HelperError> {
    std::fs::create_dir_all(config.logs_dir()).map_err(HelperError::Io)?;
    let file = tracing_appender::rolling::daily(config.logs_dir(), "whisdom-helper.log");
    let (file_writer, guard) = tracing_appender::non_blocking(file);
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(DEFAULT_FILTER));

    tracing_subscriber::registry()
        .with(filter)
        .with(
            tracing_subscriber::fmt::layer()
                .json()
                .with_writer(file_writer)
                .with_ansi(false),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(std::io::stderr)
                .with_ansi(false),
        )
        .with(EventLogLayer {
            events: events.clone(),
        })
        .try_init()
        .map_err(|error| HelperError::Config(format!("logging initialization failed: {error}")))?;

    Ok(HelperLogGuard {
        _worker_guard: guard,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_filter_covers_helper_and_http_logs() {
        assert!(DEFAULT_FILTER.contains("whisdom_helper=info"));
        assert!(DEFAULT_FILTER.contains("whisdom_server::helper=info"));
        assert!(DEFAULT_FILTER.contains("tower_http=info"));
    }

    #[test]
    fn filename_sanitizer_drops_paths_and_control_characters() {
        assert_eq!(sanitize_filename(r"C:\\secret\\meeting.mkv"), "meeting.mkv");
        assert_eq!(sanitize_filename("meeting\n.mkv"), "meeting?.mkv");
        assert_eq!(sanitize_filename(""), "unnamed-media");
    }
}
