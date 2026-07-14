mod auth;
mod config;
mod error;
mod job;
mod pipeline;
mod queue;
mod routes;
mod turnstile;

use std::net::SocketAddr;

use tower_http::cors::CorsLayer;

use config::Config;
use queue::Queue;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub queue: Queue,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "whisdom_server=info,tower_http=info".into()),
        )
        .json()
        .init();

    let mut config = Config::load();
    config.resolve_paths();

    tokio::fs::create_dir_all(std::path::Path::new(config.model_path()).parent().unwrap_or(std::path::Path::new(".")))
        .await
        .expect("failed to create model directory");
    tokio::fs::create_dir_all(config.temp_dir())
        .await
        .expect("failed to create temp directory");

    let queue = Queue::new();

    let cors = {
        let mut cors = CorsLayer::new()
            .allow_methods(tower_http::cors::Any)
            .allow_headers(tower_http::cors::Any);

        if config.dev_auth_bypass() {
            cors = cors.allow_origin(tower_http::cors::Any);
        } else {
            cors = cors.allow_origin(
                config
                    .allowed_origin()
                    .parse::<axum::http::HeaderValue>()
                    .unwrap_or_else(|_| axum::http::HeaderValue::from_static("*")),
            );
        }
        cors
    };

    let state = AppState {
        config: config.clone(),
        queue: queue.clone(),
    };

    let public_routes = axum::Router::new()
        .route("/api/health", axum::routing::get(routes::health::health))
        .route(
            "/api/capabilities",
            axum::routing::get(routes::capabilities::capabilities),
        );

    let protected_routes = axum::Router::new()
        .route(
            "/api/transcribe",
            axum::routing::post(routes::transcribe::transcribe),
        )
        .route(
            "/api/progress/{id}",
            axum::routing::get(routes::progress::progress),
        )
        .route(
            "/api/cancel/{id}",
            axum::routing::post(routes::cancel::cancel),
        );

    let app = axum::Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .layer(cors)
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .with_state(state);

    let port = config.port();
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "whisdom-server starting");
    if config.turnstile.enabled {
        tracing::info!("turnstile verification enabled");
    }

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
