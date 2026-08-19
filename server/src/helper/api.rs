use std::convert::Infallible;
use std::sync::Arc;

use axum::extract::{DefaultBodyLimit, Json, Multipart, Path, State};
use axum::http::{header, HeaderMap, Method, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::Router;
use futures::Stream;
use tokio_stream::wrappers::{BroadcastStream, ReceiverStream};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;

use super::cache::CacheStatus;
use super::logging::sanitize_filename;
use super::protocol::{
    CapabilitiesResponse, HealthResponse, HelperError, PairResponse, PickAndTranscribeRequest,
    PickAndTranscribeResponse, PROTOCOL_VERSION,
};
use super::runtime;
use super::state::HelperState;

const MODEL_ID: &str = "ggml-large-v3-turbo-q5_0";
const FFMPEG_DIR: &str = "ffmpeg-n8.1.2-44-g7c533d0f86-win64-gpl-8.1";

pub fn router(state: Arc<HelperState>) -> Router {
    let multipart_limit = state.config.max_upload_bytes.saturating_add(1024 * 1024);
    Router::new()
        .route("/api/health", get(health))
        .route("/api/pair", post(pair))
        .route("/api/capabilities", get(capabilities))
        .route("/api/cache/status", get(cache_status))
        .route("/api/cache/clear", post(cache_clear))
        .route(
            "/api/transcribe",
            post(transcribe).layer(DefaultBodyLimit::max(multipart_limit)),
        )
        .route("/api/progress/{id}", get(progress))
        .route("/api/cancel/{id}", post(cancel))
        .route("/api/v1/health", get(health))
        .route("/api/v1/pair", post(pair))
        .route("/api/v1/capabilities", get(capabilities))
        .route("/api/v1/cache/status", get(cache_status))
        .route("/api/v1/cache/clear", post(cache_clear))
        .route(
            "/api/v1/transcribe",
            post(transcribe).layer(DefaultBodyLimit::max(multipart_limit)),
        )
        .route("/api/v1/pick-and-transcribe", post(pick_and_transcribe))
        .route("/api/v1/progress/{id}", get(progress))
        .route("/api/v1/cancel/{id}", post(cancel))
        .route("/v1/health", get(health))
        .route("/v1/pair", post(pair))
        .route("/v1/capabilities", get(capabilities))
        .route("/v1/cache/status", get(cache_status))
        .route("/v1/cache/clear", post(cache_clear))
        .route(
            "/v1/transcribe",
            post(transcribe).layer(DefaultBodyLimit::max(multipart_limit)),
        )
        .route("/v1/pick-and-transcribe", post(pick_and_transcribe))
        .route("/v1/progress/{id}", get(progress))
        .route("/v1/cancel/{id}", post(cancel))
        .layer(TraceLayer::new_for_http())
        .layer(cors_layer(&state.config.allowed_origins))
        .with_state(state)
}

fn cors_layer(origins: &[String]) -> CorsLayer {
    let allowed = origins
        .iter()
        .filter_map(|origin| origin.parse().ok())
        .collect::<Vec<axum::http::HeaderValue>>();

    CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed))
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([
            header::ACCEPT,
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ORIGIN,
        ])
        .allow_credentials(true)
}

async fn health(State(state): State<Arc<HelperState>>) -> axum::Json<HealthResponse> {
    axum::Json(HealthResponse {
        available: true,
        protocol_version: PROTOCOL_VERSION,
        busy: state.cache.is_busy(),
    })
}

async fn pair(
    State(state): State<Arc<HelperState>>,
    headers: HeaderMap,
) -> Result<axum::Json<PairResponse>, HelperError> {
    let token = state.auth.pair(&headers).await?;
    Ok(axum::Json(PairResponse {
        token,
        protocol_version: PROTOCOL_VERSION,
    }))
}

async fn capabilities(
    State(state): State<Arc<HelperState>>,
    headers: HeaderMap,
) -> Result<axum::Json<CapabilitiesResponse>, HelperError> {
    state.auth.authorize(&headers).await?;
    Ok(axum::Json(CapabilitiesResponse {
        available: true,
        engine: "whisper.cpp",
        accelerator: if cfg!(feature = "vulkan") {
            "vulkan-or-cpu"
        } else {
            "cpu"
        },
        model_id: MODEL_ID.into(),
        model_ready: state.config.model_path().exists(),
        ffmpeg_ready: state
            .config
            .tools_dir()
            .join(FFMPEG_DIR)
            .join("ffmpeg.exe")
            .exists(),
        native_picker: state.native_file_picker.is_some(),
    }))
}

async fn cache_status(
    State(state): State<Arc<HelperState>>,
    headers: HeaderMap,
) -> Result<axum::Json<CacheStatus>, HelperError> {
    state.auth.authorize(&headers).await?;
    Ok(axum::Json(state.cache.status().await?))
}

async fn cache_clear(
    State(state): State<Arc<HelperState>>,
    headers: HeaderMap,
) -> Result<axum::Json<super::cache::CacheClearResult>, HelperError> {
    state.auth.authorize(&headers).await?;
    Ok(axum::Json(state.cache.clear(&state.model).await?))
}

async fn pick_and_transcribe(
    State(state): State<Arc<HelperState>>,
    headers: HeaderMap,
    Json(request): Json<PickAndTranscribeRequest>,
) -> Result<axum::response::Response, HelperError> {
    state.auth.authorize(&headers).await?;
    validate_model(request.model.as_deref())?;
    let picker = state
        .native_file_picker
        .clone()
        .ok_or(HelperError::NotFound)?;
    tracing::info!("native file picker opened");
    let Some(path) = picker().await? else {
        tracing::info!("native file picker cancelled");
        return Ok(StatusCode::NO_CONTENT.into_response());
    };
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(sanitize_filename)
        .ok_or_else(|| HelperError::BadRequest("selected media has no valid filename".into()))?;
    tracing::info!(filename = %filename, "native file selected");
    let job_id = runtime::start_path_job(
        state,
        path,
        filename.clone(),
        request.language.filter(|value| !value.is_empty()),
    )
    .await?;
    Ok(axum::Json(PickAndTranscribeResponse { job_id, filename }).into_response())
}

async fn read_limited_field(
    field: &mut axum::extract::multipart::Field<'_>,
    limit: usize,
) -> Result<Vec<u8>, HelperError> {
    let mut bytes = Vec::new();
    while let Some(chunk) = field
        .chunk()
        .await
        .map_err(|error| HelperError::BadRequest(error.to_string()))?
    {
        if bytes.len().saturating_add(chunk.len()) > limit {
            return Err(HelperError::BadRequest(
                "uploaded media exceeds the helper limit".into(),
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn validate_model(model: Option<&str>) -> Result<(), HelperError> {
    if model.is_some_and(|value| !value.is_empty() && value != MODEL_ID) {
        return Err(HelperError::BadRequest("unsupported helper model".into()));
    }
    Ok(())
}

async fn transcribe(
    State(state): State<Arc<HelperState>>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<axum::Json<serde_json::Value>, HelperError> {
    state.auth.authorize(&headers).await?;
    let mut audio: Option<(String, Vec<u8>)> = None;
    let mut language = None;
    let mut model = None;
    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|error| HelperError::BadRequest(error.to_string()))?
    {
        match field.name().unwrap_or("") {
            "audio" => {
                let filename = field.file_name().unwrap_or("upload.bin").to_owned();
                let bytes = read_limited_field(&mut field, state.config.max_upload_bytes).await?;
                audio = Some((filename, bytes));
            }
            "language" => {
                language = Some(
                    field
                        .text()
                        .await
                        .map_err(|error| HelperError::BadRequest(error.to_string()))?,
                )
            }
            "model" => {
                model = Some(
                    field
                        .text()
                        .await
                        .map_err(|error| HelperError::BadRequest(error.to_string()))?,
                )
            }
            _ => {}
        }
    }
    let (filename, bytes) =
        audio.ok_or_else(|| HelperError::BadRequest("audio field required".into()))?;
    validate_model(model.as_deref())?;
    if bytes.len() > state.config.max_upload_bytes {
        return Err(HelperError::BadRequest(
            "uploaded media exceeds the helper limit".into(),
        ));
    }
    let id = uuid::Uuid::new_v4().to_string();
    let work_dir = state.config.temp_dir().join(&id);
    tokio::fs::create_dir_all(&work_dir).await?;
    let extension = std::path::Path::new(&filename)
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| {
            value.len() <= 16
                && value
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric())
        })
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    let input = work_dir.join(format!("input{extension}"));
    tokio::fs::write(&input, bytes).await?;
    let job_id = runtime::start_staged_job(
        state,
        input,
        filename,
        language.filter(|value| !value.is_empty()),
        work_dir,
    )
    .await?;
    Ok(axum::Json(serde_json::json!({ "job_id": job_id })))
}

async fn progress(
    State(state): State<Arc<HelperState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, HelperError> {
    state.auth.authorize(&headers).await?;
    let (rx, current) = state.queue.subscribe_with_snapshot(&id).await?;
    let (tx, output) = tokio::sync::mpsc::channel(128);
    let initial_terminal = super::state::is_terminal_phase(&current.phase);
    let event = Event::default()
        .json_data(current)
        .map_err(|error| HelperError::BadRequest(error.to_string()))?;
    let _ = tx.send(Ok(event)).await;
    if initial_terminal {
        return Ok(Sse::new(ReceiverStream::new(output))
            .keep_alive(KeepAlive::new().interval(std::time::Duration::from_secs(15))));
    }
    tokio::spawn(async move {
        let mut stream = BroadcastStream::new(rx);
        while let Some(Ok(status)) = tokio_stream::StreamExt::next(&mut stream).await {
            let terminal = super::state::is_terminal_phase(&status.phase);
            let Ok(event) = Event::default().json_data(status) else {
                break;
            };
            if tx.send(Ok(event)).await.is_err() || terminal {
                break;
            }
        }
    });
    Ok(Sse::new(ReceiverStream::new(output))
        .keep_alive(KeepAlive::new().interval(std::time::Duration::from_secs(15))))
}

async fn cancel(
    State(state): State<Arc<HelperState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<axum::Json<serde_json::Value>, HelperError> {
    state.auth.authorize(&headers).await?;
    state.queue.cancel(&id).await?;
    Ok(axum::Json(serde_json::json!({ "cancelled": true })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_only_the_fixed_model() {
        assert!(validate_model(Some(MODEL_ID)).is_ok());
        assert!(validate_model(Some("other")).is_err());
        assert!(validate_model(None).is_ok());
    }
}
