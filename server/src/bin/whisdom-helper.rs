use std::sync::Arc;

use helper::auth::HelperAuth;
use helper::cache::HelperCache;
use helper::config::HelperConfig;
use helper::engine::SharedRuntime;
use helper::logging::HelperLogGuard;
use helper::selection::SelectionStore;
use helper::state::{HelperQueue, HelperState};
use whisdom_server::helper;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = HelperConfig::from_env()?;
    config.create_dirs().await?;
    let auth = HelperAuth::load(&config).await?;
    let cache = HelperCache::new(config.clone());
    let state = Arc::new(HelperState {
        config,
        auth,
        cache,
        queue: HelperQueue::default(),
        runtime: SharedRuntime::default(),
        selections: SelectionStore::default(),
        native_file_picker: None,
        update_check: None,
        update_install: None,
    });

    let _log_guard: HelperLogGuard = helper::logging::init(&state.config)?;
    let listener =
        tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, state.config.port)).await?;
    tracing::info!(port = state.config.port, "whisdom helper listening");
    axum::serve(listener, helper::api::router(state)).await?;
    Ok(())
}
