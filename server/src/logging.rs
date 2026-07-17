//! Logging/tracing initialization.

use crate::config::Config;

/// Initialize the global tracing subscriber from `config.logging.level`.
/// Safe to call only once at startup.
pub fn init(config: &Config) {
    let level = config.log_level();
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| format!("whisdom_server={level},tower_http=info").into());

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .json()
        .init();
}