use std::convert::Infallible;
use std::sync::Arc;

use axum::extract::{DefaultBodyLimit, Json, Multipart, Path, State};
use axum::http::{header, HeaderMap, Method, StatusCode};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::IntoResponse;
use axum::routing::{delete, get, post};
use axum::Router;
use futures::Stream;
use tokio_stream::wrappers::{BroadcastStream, ReceiverStream};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;

use super::cache::CacheStatus;
use super::engine;
use super::models::{default_native_model, find_native_model, native_models, supports_language};
use super::protocol::{
    CapabilitiesResponse, HealthResponse, HelperError, NativeModelResponse,
    NativeSelectionResponse, PairResponse, SelectFilesResponse, StartSelectionRequest,
    StartSelectionResponse, PROTOCOL_VERSION,
};
use super::runtime;
use super::state::HelperState;

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
        .route("/api/v1/select-files", post(select_files))
        .route("/api/v1/selections/{id}", delete(delete_selection))
        .route("/api/v1/transcribe-selection", post(transcribe_selection))
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
        .route("/v1/select-files", post(select_files))
        .route("/v1/selections/{id}", delete(delete_selection))
        .route("/v1/transcribe-selection", post(transcribe_selection))
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
        .allow_methods([Method::DELETE, Method::GET, Method::POST, Method::OPTIONS])
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
    let mut models = Vec::with_capacity(native_models().len());
    for model in native_models() {
        models.push(NativeModelResponse {
            id: model.id.into(),
            label: model.label.into(),
            quality: model.quality.into(),
            size_bytes: model.size_bytes,
            installed: state.cache.model_is_installed(model).await.unwrap_or(false),
            engine: model.engine.id(),
            supported_languages: model
                .supported_languages
                .iter()
                .map(|language| (*language).into())
                .collect(),
            supports_auto_language: model.supports_auto_language,
            active_backend: engine::configured_backend(model),
        });
    }
    Ok(axum::Json(CapabilitiesResponse {
        available: true,
        engine: "catalog",
        accelerator: "per-model",
        model_id: default_native_model().id.into(),
        model_ready: state
            .cache
            .model_is_installed(default_native_model())
            .await?,
        ffmpeg_ready: state
            .config
            .tools_dir()
            .join(FFMPEG_DIR)
            .join("ffmpeg.exe")
            .exists(),
        native_picker: state.native_file_picker.is_some(),
        models,
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
    // Cache clearing drops the tagged runtime before deleting managed assets.
    Ok(axum::Json(state.cache.clear(&state.runtime).await?))
}

async fn select_files(
    State(state): State<Arc<HelperState>>,
    headers: HeaderMap,
) -> Result<axum::response::Response, HelperError> {
    state.auth.authorize(&headers).await?;
    let picker = state
        .native_file_picker
        .clone()
        .ok_or(HelperError::NotFound)?;
    tracing::info!("native file picker opened");
    let paths = picker().await?;
    if paths.is_empty() {
        tracing::info!("native file picker cancelled");
        return Ok(StatusCode::NO_CONTENT.into_response());
    }

    let mut selections = Vec::with_capacity(paths.len());
    for path in paths {
        match state.selections.insert(path).await {
            Ok(selection) => selections.push(selection),
            Err(error) => {
                for selection in selections {
                    let _ = state.selections.delete(&selection.id).await;
                }
                return Err(error);
            }
        }
    }
    tracing::info!(count = selections.len(), "native files selected");
    Ok(axum::Json(SelectFilesResponse {
        selections: selections
            .into_iter()
            .map(|selection| NativeSelectionResponse {
                id: selection.id,
                filename: selection.filename,
                size_bytes: selection.size_bytes,
                extension: selection.extension,
            })
            .collect(),
    })
    .into_response())
}

async fn delete_selection(
    State(state): State<Arc<HelperState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<StatusCode, HelperError> {
    state.auth.authorize(&headers).await?;
    state.selections.delete(&id).await;
    Ok(StatusCode::NO_CONTENT)
}

async fn transcribe_selection(
    State(state): State<Arc<HelperState>>,
    headers: HeaderMap,
    request: Result<Json<StartSelectionRequest>, axum::extract::rejection::JsonRejection>,
) -> Result<axum::Json<StartSelectionResponse>, HelperError> {
    state.auth.authorize(&headers).await?;
    let request = request
        .map_err(|_| HelperError::BadRequest("invalid selection request".into()))?
        .0;
    let model = find_native_model(&request.model)
        .ok_or_else(|| HelperError::BadRequest("unsupported helper model".into()))?;
    if !supports_language(model, request.language.as_deref()) {
        return Err(HelperError::BadRequest(
            "selected Companion model does not support this language".into(),
        ));
    }
    let selection = state.selections.take(&request.selection_id).await?;
    let job_id = runtime::start_path_job(
        state,
        selection.path(),
        selection.filename,
        request.language.filter(|value| !value.is_empty()),
        model,
    )
    .await?;
    Ok(axum::Json(StartSelectionResponse { job_id }))
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

fn resolve_model(model: Option<&str>) -> Result<&'static super::models::NativeModel, HelperError> {
    let id = model
        .filter(|value| !value.is_empty())
        .unwrap_or(default_native_model().id);
    find_native_model(id).ok_or_else(|| HelperError::BadRequest("unsupported helper model".into()))
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
            // Buffer media only after the model/language preflight. Multipart
            // ordering is not trustworthy, so reject as soon as those fields
            // appear and repeat the check before staging below.
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
    let model = resolve_model(model.as_deref())?;
    if model.engine != super::models::AsrEngine::WhisperCpp {
        return Err(HelperError::BadRequest(
            "selected model is unavailable for legacy uploads".into(),
        ));
    }
    if !supports_language(model, language.as_deref()) {
        return Err(HelperError::BadRequest(
            "selected Companion model does not support this language".into(),
        ));
    }
    let (filename, bytes) =
        audio.ok_or_else(|| HelperError::BadRequest("audio field required".into()))?;
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
        model,
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
    use std::path::PathBuf;

    use axum::body::{to_bytes, Body};
    use axum::http::Request;
    use tower::ServiceExt;

    use super::*;
    use crate::helper::auth::HelperAuth;
    use crate::helper::cache::HelperCache;
    use crate::helper::config::HelperConfig;
    use crate::helper::engine::SharedRuntime;
    use crate::helper::selection::SelectionStore;
    use crate::helper::state::{HelperQueue, NativeFilePicker};

    #[test]
    fn legacy_upload_defaults_to_turbo_and_rejects_unknown_models() {
        assert_eq!(
            resolve_model(None).expect("default model").id,
            default_native_model().id
        );
        assert!(resolve_model(Some("other")).is_err());
    }

    #[test]
    fn legacy_upload_rejects_unavailable_parakeet_before_staging() {
        let model = resolve_model(Some("sherpa-parakeet-tdt-v3-int8")).expect("catalog model");
        assert_ne!(model.engine, super::super::models::AsrEngine::WhisperCpp);
        assert!(!supports_language(model, Some("vi")));
    }

    async fn paired_router(path: PathBuf) -> (Router, String) {
        let directory = tempfile::tempdir().expect("temporary companion root");
        let root = directory.keep();
        let config = HelperConfig {
            port: 8788,
            allowed_origins: vec!["https://whisdom.app".into()],
            root,
            ffmpeg_url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/x/file.zip".into(),
            ffmpeg_sha256: "a".repeat(64),
            ffmpeg_exe_sha256: "b".repeat(64),
            max_download_bytes: 1024,
            max_upload_bytes: 1024,
        };
        config.create_dirs().await.expect("cache directories");
        let picker: NativeFilePicker = Arc::new(move || {
            let path = path.clone();
            Box::pin(async move { Ok(vec![path]) })
        });
        let auth = HelperAuth::load(&config).await.expect("auth");
        let state = Arc::new(HelperState {
            cache: HelperCache::new(config.clone()),
            config,
            auth,
            queue: HelperQueue::default(),
            runtime: SharedRuntime::default(),
            selections: SelectionStore::default(),
            native_file_picker: Some(picker),
            update_check: None,
            update_install: None,
        });
        let app = router(state);
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/pair")
                    .header("origin", "https://whisdom.app")
                    .body(Body::empty())
                    .expect("pair request"),
            )
            .await
            .expect("pair response");
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("pair body");
        let token = serde_json::from_slice::<serde_json::Value>(&body).expect("pair JSON")["token"]
            .as_str()
            .expect("pair token")
            .to_owned();
        (app, token)
    }

    fn request(method: &str, uri: &str, token: &str, body: Body) -> Request<Body> {
        Request::builder()
            .method(method)
            .uri(uri)
            .header("origin", "https://whisdom.app")
            .header("authorization", format!("Bearer {token}"))
            .header("content-type", "application/json")
            .body(body)
            .expect("request")
    }

    #[tokio::test]
    async fn selection_api_returns_display_metadata_and_rejects_path_start_payloads() {
        let media = tempfile::NamedTempFile::with_suffix(".mkv").expect("test media");
        std::fs::write(media.path(), b"media").expect("write test media");
        let (app, token) = paired_router(media.path().to_owned()).await;

        let response = app
            .clone()
            .oneshot(request(
                "POST",
                "/api/v1/select-files",
                &token,
                Body::empty(),
            ))
            .await
            .expect("select response");
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("select body");
        let value: serde_json::Value = serde_json::from_slice(&body).expect("select JSON");
        let selection_id = value["selections"][0]["id"]
            .as_str()
            .expect("opaque ID")
            .to_owned();
        assert!(value["selections"][0].get("path").is_none());
        assert!(value["selections"][0]["filename"].is_string());

        let response = app
            .clone()
            .oneshot(request(
                "POST",
                "/api/v1/transcribe-selection",
                &token,
                Body::from(format!(
                    r#"{{"selection_id":"{selection_id}","model":"ggml-tiny-q5_1","path":"C:\\\\secret.wav"}}"#
                )),
            ))
            .await
            .expect("malformed start response");
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let response = app
            .oneshot(request(
                "DELETE",
                &format!("/api/v1/selections/{selection_id}"),
                &token,
                Body::empty(),
            ))
            .await
            .expect("delete response");
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    async fn parakeet_rejects_vietnamese_without_consuming_selection() {
        let media = tempfile::NamedTempFile::with_suffix(".mkv").expect("test media");
        std::fs::write(media.path(), b"media").expect("write media");
        let (app, token) = paired_router(media.path().to_owned()).await;
        let selection = app
            .clone()
            .oneshot(request(
                "POST",
                "/api/v1/select-files",
                &token,
                Body::empty(),
            ))
            .await
            .expect("selection response");
        let body = to_bytes(selection.into_body(), usize::MAX)
            .await
            .expect("body");
        let id = serde_json::from_slice::<serde_json::Value>(&body).expect("json")["selections"][0]
            ["id"]
            .as_str()
            .expect("id")
            .to_owned();
        let response = app
            .clone()
            .oneshot(request(
                "POST",
                "/api/v1/transcribe-selection",
                &token,
                Body::from(format!(r#"{{"selection_id":"{id}","model":"sherpa-parakeet-tdt-v3-int8","language":"vi"}}"#)),
            ))
            .await
            .expect("rejection response");
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let response = app
            .oneshot(request(
                "DELETE",
                &format!("/api/v1/selections/{id}"),
                &token,
                Body::empty(),
            ))
            .await
            .expect("selection remains available");
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    async fn capabilities_expose_catalog_metadata_without_paths() {
        let media = tempfile::NamedTempFile::new().expect("test media");
        let (app, token) = paired_router(media.path().to_owned()).await;
        let response = app
            .oneshot(request(
                "GET",
                "/api/v1/capabilities",
                &token,
                Body::empty(),
            ))
            .await
            .expect("capability response");
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("capability body");
        let value: serde_json::Value = serde_json::from_slice(&body).expect("capability JSON");
        assert_eq!(
            value["models"].as_array().expect("models").len(),
            native_models().len()
        );
        assert!(value["models"]
            .as_array()
            .expect("models")
            .iter()
            .all(|model| model.get("path").is_none() && model.get("url").is_none()));
        let parakeet = value["models"]
            .as_array()
            .expect("models")
            .iter()
            .find(|model| model["id"] == "sherpa-parakeet-tdt-v3-int8")
            .expect("Parakeet model");
        assert_eq!(parakeet["engine"], "sherpa-onnx");
        assert_eq!(parakeet["active_backend"], "cpu");
        assert!(parakeet["supported_languages"]
            .as_array()
            .expect("languages")
            .iter()
            .all(|language| language != "vi"));
    }
}
