mod auth;
mod config;
mod error;
mod job;
mod logging;
mod models;
mod pipeline;
mod queue;
mod routes;
mod turnstile;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::DefaultBodyLimit;
use tower_http::cors::CorsLayer;

use config::Config;
use queue::Queue;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub queue: Queue,
    pub model_registry: Arc<models::ModelRegistry>,
}

fn build_app(config: Config, queue: Queue, model_registry: Arc<models::ModelRegistry>) -> axum::Router {
    let multipart_body_limit = config.multipart_body_limit();
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
        config,
        queue,
        model_registry,
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
            axum::routing::post(routes::transcribe::transcribe)
                .layer(DefaultBodyLimit::max(multipart_body_limit)),
        )
        .route(
            "/api/progress/{id}",
            axum::routing::get(routes::progress::progress),
        )
        .route(
            "/api/cancel/{id}",
            axum::routing::post(routes::cancel::cancel),
        );

    axum::Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .layer(cors)
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .with_state(state)
}

#[tokio::main]
async fn main() {
    let mut config = Config::load();
    config.resolve_paths();
    logging::init(&config);

    tokio::fs::create_dir_all(&config.model.dir)
        .await
        .expect("failed to create model directory");
    tokio::fs::create_dir_all(config.temp_dir())
        .await
        .expect("failed to create temp directory");

    let model_registry = match models::preload_models(&config).await {
        Ok(registry) => Arc::new(registry),
        Err(e) => {
            tracing::error!(error = %e, "failed to preload models, server cannot start");
            std::process::exit(1);
        }
    };

    let port = config.port();
    if config.turnstile.enabled {
        tracing::info!("turnstile verification enabled");
    }
    let app = build_app(config, Queue::new(), model_registry);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "whisdom-server starting");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

#[cfg(test)]
mod tests {
    use axum::body::{to_bytes, Body};
    use axum::http::{header, Request, StatusCode};
    use tower::ServiceExt;

    use super::*;

    const BOUNDARY: &str = "whisdom-test-boundary";

    fn test_config(temp_dir: &tempfile::TempDir, max_upload_mb: usize) -> Config {
        let mut config = Config::default();
        config.auth.dev_auth_bypass = true;
        config.limits.max_upload_mb = max_upload_mb;
        config.paths.temp_dir = temp_dir.path().to_string_lossy().into_owned();
        config
    }

    fn test_model_registry() -> Arc<models::ModelRegistry> {
        // Empty registry is fine for multipart-body-limit tests — they never
        // reach model resolution logic (audio parsing fails/succeeds before
        // model lookup in routes/transcribe.rs, per Task 9's ordering).
        Arc::new(models::ModelRegistry::empty_for_tests())
    }

    fn multipart_request(audio_size: usize, complete: bool) -> Request<Body> {
        let mut body = format!(
            "--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"test.wav\"\r\nContent-Type: audio/wav\r\n\r\n"
        )
        .into_bytes();
        body.resize(body.len() + audio_size, 0);
        if complete {
            body.extend_from_slice(format!("\r\n--{BOUNDARY}--\r\n").as_bytes());
        }

        Request::builder()
            .method("POST")
            .uri("/api/transcribe")
            .header(
                header::CONTENT_TYPE,
                format!("multipart/form-data; boundary={BOUNDARY}"),
            )
            .header(header::AUTHORIZATION, "Bearer dev-mode")
            .body(Body::from(body))
            .expect("multipart request should be valid")
    }

    fn multipart_request_with_model(audio_size: usize, model: &str) -> Request<Body> {
        let mut body = format!(
            "--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"test.wav\"\r\nContent-Type: audio/wav\r\n\r\n"
        )
        .into_bytes();
        body.resize(body.len() + audio_size, 0);
        body.extend_from_slice(
            format!(
                "\r\n--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n{model}\r\n--{BOUNDARY}--\r\n"
            )
            .as_bytes(),
        );

        Request::builder()
            .method("POST")
            .uri("/api/transcribe")
            .header(
                header::CONTENT_TYPE,
                format!("multipart/form-data; boundary={BOUNDARY}"),
            )
            .header(header::AUTHORIZATION, "Bearer dev-mode")
            .body(Body::from(body))
            .expect("multipart request should be valid")
    }

    #[tokio::test]
    async fn transcribe_rejects_unknown_model_with_bad_request() {
        let temp_dir = tempfile::tempdir().expect("temp directory should be created");
        let app = build_app(test_config(&temp_dir, 1), Queue::new(), test_model_registry());

        let response = app
            .oneshot(multipart_request_with_model(16, "nonexistent-model"))
            .await
            .expect("request should complete");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn transcribe_accepts_audio_above_axum_default_limit() {
        let temp_dir = tempfile::tempdir().expect("temp directory should be created");
        let app = build_app(test_config(&temp_dir, 4), Queue::new(), test_model_registry());

        let response = app
            .oneshot(multipart_request(3 * 1024 * 1024, true))
            .await
            .expect("request should complete");

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn transcribe_accepts_audio_at_configured_file_limit() {
        let temp_dir = tempfile::tempdir().expect("temp directory should be created");
        let app = build_app(test_config(&temp_dir, 1), Queue::new(), test_model_registry());

        let response = app
            .oneshot(multipart_request(1024 * 1024, true))
            .await
            .expect("request should complete");

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn transcribe_rejects_audio_above_configured_file_limit() {
        let temp_dir = tempfile::tempdir().expect("temp directory should be created");
        let app = build_app(test_config(&temp_dir, 1), Queue::new(), test_model_registry());

        let response = app
            .oneshot(multipart_request(1024 * 1024 + 1, true))
            .await
            .expect("request should complete");

        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    }

    #[tokio::test]
    async fn transcribe_maps_parser_limit_to_payload_too_large() {
        let temp_dir = tempfile::tempdir().expect("temp directory should be created");
        let app = build_app(test_config(&temp_dir, 1), Queue::new(), test_model_registry());

        let response = app
            .oneshot(multipart_request(2 * 1024 * 1024, true))
            .await
            .expect("request should complete");

        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    }

    #[tokio::test]
    async fn transcribe_reports_incomplete_multipart_as_bad_request() {
        let temp_dir = tempfile::tempdir().expect("temp directory should be created");
        let app = build_app(test_config(&temp_dir, 1), Queue::new(), test_model_registry());

        let response = app
            .oneshot(multipart_request(16, false))
            .await
            .expect("request should complete");
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let body = to_bytes(response.into_body(), 1024 * 1024)
            .await
            .expect("response body should be readable");
        let body = String::from_utf8(body.to_vec()).expect("response body should be UTF-8");
        assert!(!body.contains("audio' file or 'url' field required"));
    }
}
