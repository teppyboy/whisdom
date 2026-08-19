use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use super::config::HelperConfig;
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

pub fn init(config: &HelperConfig) -> Result<HelperLogGuard, HelperError> {
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
