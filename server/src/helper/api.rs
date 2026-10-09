use std::convert::Infallible;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use axum::extract::{DefaultBodyLimit, Json, Multipart, Path, Query, State};
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
use super::events::{EventHub, HelperEvent, JobEvent, ProgressEvent};
use super::models::{default_native_model, find_native_model, native_models, supports_language};
use super::protocol::{
    CapabilitiesResponse, DiagnosticsFeatures, DiagnosticsFfmpeg, DiagnosticsModel,
    DiagnosticsResponse, HealthResponse, HelperError, NativeModelResponse,
    NativeSelectionResponse, PairResponse, SelectFilesResponse, StartSelectionRequest,
    StartSelectionResponse, UpdateDependenciesRequest, UpdateDependenciesResponse, UpdateScope,
    PROTOCOL_VERSION,
};
use super::runtime;
use super::state::HelperState;

pub fn router(state: Arc<HelperState>) -> Router {
    let multipart_limit = state.config.max_upload_bytes.saturating_add(1024 * 1024);
    Router::new()
        .route("/api/health", get(health))
        .route("/api/pair", post(pair))
        .route("/api/capabilities", get(capabilities))
        .route("/api/diagnostics", get(diagnostics))
        .route("/api/events", get(events))
        .route("/api/update-dependencies", post(update_dependencies))
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
        .route("/api/v1/diagnostics", get(diagnostics))
        .route("/api/v1/events", get(events))
        .route("/api/v1/update-dependencies", post(update_dependencies))
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
        .route("/v1/diagnostics", get(diagnostics))
        .route("/v1/events", get(events))
        .route("/v1/update-dependencies", post(update_dependencies))
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
            active_backend: engine::active_backend(model, &state.runtime).await,
        });
    }
    Ok(axum::Json(CapabilitiesResponse {
        available: true,
        experimental_vad: true,
        engine: "catalog",
        accelerator: "per-model",
        model_id: default_native_model().id.into(),
        model_ready: state
            .cache
            .model_is_installed(default_native_model())
            .await?,
        ffmpeg_ready: super::ffmpeg::installed_executable(&state.config).exists(),
        native_picker: state.native_file_picker.is_some(),
        active_backend: engine::current_backend(&state.runtime).await,
        preferred_backend: engine::preferred_backend(),
        models,
    }))
}

async fn diagnostics(
    State(state): State<Arc<HelperState>>,
    headers: HeaderMap,
) -> Result<axum::Json<DiagnosticsResponse>, HelperError> {
    state.auth.authorize(&headers).await?;
    let mut models = Vec::with_capacity(native_models().len());
    for model in native_models() {
        models.push(DiagnosticsModel {
            id: model.id.into(),
            label: model.label.into(),
            installed: state.cache.model_is_installed(model).await.unwrap_or(false),
            engine: model.engine.id(),
            size_bytes: model.size_bytes,
            active_backend: engine::active_backend(model, &state.runtime).await,
        });
    }
    Ok(axum::Json(DiagnosticsResponse {
        protocol_version: PROTOCOL_VERSION,
        os: os_name(),
        arch: std::env::consts::ARCH,
        features: DiagnosticsFeatures {
            vulkan: cfg!(feature = "vulkan"),
            metal: cfg!(feature = "metal"),
            directml: cfg!(feature = "directml"),
        },
        active_backend: engine::current_backend(&state.runtime).await,
        preferred_backend: engine::preferred_backend(),
        ffmpeg: DiagnosticsFfmpeg {
            installed: super::ffmpeg::installed_executable(&state.config).exists(),
            version: super::ffmpeg::installed_version(&state.config).await,
            source_url: state.config.ffmpeg_url.clone(),
        },
        models,
    }))
}

fn os_name() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

#[derive(serde::Deserialize)]
struct EventsQuery {
    token: Option<String>,
}

async fn events(
    State(state): State<Arc<HelperState>>,
    Query(query): Query<EventsQuery>,
    headers: HeaderMap,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, HelperError> {
    // EventSource cannot set headers, so the token may arrive in the query
    // string; header bearer auth keeps working for fetch-based clients.
    state
        .auth
        .authorize_with_query(&headers, query.token.as_deref())
        .await?;
    let receiver = state.events.subscribe();
    let (tx, output) = tokio::sync::mpsc::channel(256);
    let hello = Event::default()
        .event("hello")
        .json_data(HelperEvent::hello())
        .map_err(|error| HelperError::BadRequest(error.to_string()))?;
    let _ = tx.send(Ok(hello)).await;
    tokio::spawn(async move {
        let mut stream = BroadcastStream::new(receiver);
        while let Some(Ok(event)) = tokio_stream::StreamExt::next(&mut stream).await {
            let Ok(data) = Event::default().event(event.event_name()).json_data(&*event) else {
                break;
            };
            if tx.send(Ok(data)).await.is_err() {
                break;
            }
        }
    });
    // KeepAlive emits an SSE comment every interval, keeping proxies and
    // EventSource connections alive without fabricating events.
    Ok(Sse::new(ReceiverStream::new(output)).keep_alive(
        KeepAlive::new().interval(std::time::Duration::from_secs(15)),
    ))
}

async fn update_dependencies(
    State(state): State<Arc<HelperState>>,
    headers: HeaderMap,
    request: Result<Json<UpdateDependenciesRequest>, axum::extract::rejection::JsonRejection>,
) -> Result<axum::Json<UpdateDependenciesResponse>, HelperError> {
    state.auth.authorize(&headers).await?;
    let request = request
        .map_err(|_| HelperError::BadRequest("invalid dependency update request".into()))?
        .0;
    // Scoped clears share the transcription admission gate: they refuse while
    // a job is active instead of deleting caches under running work.
    match request.scope {
        UpdateScope::Ffmpeg => {
            state.cache.clear_ffmpeg().await?;
        }
        UpdateScope::Models => {
            state.cache.clear_models(&state.runtime).await?;
        }
        UpdateScope::All => {
            state.cache.clear_models(&state.runtime).await?;
            state.cache.clear_ffmpeg().await?;
        }
    }
    let job_id = uuid::Uuid::new_v4().to_string();
    state.events.emit(HelperEvent::Job(JobEvent {
        job_id: job_id.clone(),
        status: "running",
        error: None,
    }));
    tracing::info!(job_id = %job_id, scope = ?request.scope, "dependency update started");
    let worker_state = state.clone();
    let worker_job_id = job_id.clone();
    tokio::spawn(async move {
        let result = run_dependency_update(&worker_state, &worker_job_id, request.scope).await;
        match result {
            Ok(()) => {
                tracing::info!(job_id = %worker_job_id, "dependency update complete");
                worker_state.events.emit(HelperEvent::Progress(ProgressEvent {
                    job_id: worker_job_id.clone(),
                    phase: "deps".into(),
                    percent: Some(1.0),
                    message: "Dependencies are up to date".into(),
                    detail: None,
                }));
                worker_state.events.emit(HelperEvent::Job(JobEvent {
                    job_id: worker_job_id,
                    status: "complete",
                    error: None,
                }));
            }
            Err(error) => {
                tracing::error!(job_id = %worker_job_id, error = %error, "dependency update failed");
                worker_state.events.emit(HelperEvent::Job(JobEvent {
                    job_id: worker_job_id,
                    status: "failed",
                    error: Some(error.to_string()),
                }));
            }
        }
    });
    Ok(axum::Json(UpdateDependenciesResponse { job_id }))
}

fn dependency_progress_callback(
    events: &EventHub,
    job_id: &str,
    phase: &str,
    message: &str,
) -> super::download::DownloadProgress {
    let events = events.clone();
    let job_id = job_id.to_owned();
    let phase = phase.to_owned();
    let message = message.to_owned();
    let last_percent = Arc::new(AtomicU32::new(u32::MAX));
    Arc::new(move |downloaded, total| {
        let percent = total
            .filter(|size| *size > 0)
            .map(|size| (downloaded.min(size) as f32) / (size as f32));
        if let Some(value) = percent {
            // 1% granularity keeps the events stream quiet on fast links.
            let scaled = (value * 100.0).clamp(0.0, 100.0) as u32;
            if scaled == last_percent.swap(scaled, Ordering::AcqRel) {
                return;
            }
        }
        events.emit(HelperEvent::Progress(ProgressEvent {
            job_id: job_id.clone(),
            phase: phase.clone(),
            percent,
            message: message.clone(),
            detail: None,
        }));
    })
}

async fn run_dependency_update(
    state: &Arc<HelperState>,
    job_id: &str,
    scope: UpdateScope,
) -> Result<(), HelperError> {
    if matches!(scope, UpdateScope::Ffmpeg | UpdateScope::All) {
        let progress =
            dependency_progress_callback(&state.events, job_id, "ffmpeg", "Downloading FFmpeg");
        super::ffmpeg::ensure_ffmpeg_progress(&state.cache, Some(progress)).await?;
    }
    if matches!(scope, UpdateScope::Models | UpdateScope::All) {
        // Actively re-fetch the default model so the helper is usable right
        // away; remaining catalog models re-download through ensure_model on
        // their next use.
        let model = default_native_model();
        let progress = dependency_progress_callback(
            &state.events,
            job_id,
            "download_model",
            &format!("Downloading {}", model.label),
        );
        state
            .cache
            .ensure_model_progress(model, Some(progress))
            .await?;
    }
    Ok(())
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
        request.experimental_vad,
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
    use crate::helper::events::EventHub;
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
            events: EventHub::default(),
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
        assert!(parakeet["active_backend"].is_null());
        assert!(parakeet["supported_languages"]
            .as_array()
            .expect("languages")
            .iter()
            .all(|language| language != "vi"));
    }

    #[tokio::test]
    async fn diagnostics_reports_contract_shape_without_paths() {
        let media = tempfile::NamedTempFile::new().expect("test media");
        let (app, token) = paired_router(media.path().to_owned()).await;
        let response = app
            .oneshot(request(
                "GET",
                "/api/v1/diagnostics",
                &token,
                Body::empty(),
            ))
            .await
            .expect("diagnostics response");
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("diagnostics body");
        let value: serde_json::Value = serde_json::from_slice(&body).expect("diagnostics JSON");
        assert_eq!(value["protocol_version"], PROTOCOL_VERSION);
        assert!(matches!(
            value["os"].as_str(),
            Some("macos") | Some("windows") | Some("linux")
        ));
        assert!(value["arch"].is_string());
        assert!(value["features"]["vulkan"].is_boolean());
        assert!(value["features"]["metal"].is_boolean());
        assert!(value["features"]["directml"].is_boolean());
        assert!(value["active_backend"].is_null());
        assert!(value["preferred_backend"].is_string());
        assert_eq!(value["ffmpeg"]["installed"], false);
        assert!(value["ffmpeg"]["version"].is_null());
        assert_eq!(
            value["ffmpeg"]["source_url"],
            "https://github.com/BtbN/FFmpeg-Builds/releases/download/x/file.zip"
        );
        let models = value["models"].as_array().expect("models");
        assert_eq!(models.len(), native_models().len());
        assert!(models
            .iter()
            .all(|model| model.get("path").is_none() && model.get("url").is_none()));
        assert!(models
            .iter()
            .all(|model| model["active_backend"].is_null()));
    }

    #[tokio::test]
    async fn diagnostics_requires_authorization() {
        let media = tempfile::NamedTempFile::new().expect("test media");
        let (app, _token) = paired_router(media.path().to_owned()).await;
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/v1/diagnostics")
                    .header("origin", "https://whisdom.app")
                    .header("authorization", "Bearer wrong")
                    .body(Body::empty())
                    .expect("diagnostics request"),
            )
            .await
            .expect("diagnostics response");
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn events_rejects_a_wrong_query_token() {
        let media = tempfile::NamedTempFile::new().expect("test media");
        let (app, token) = paired_router(media.path().to_owned()).await;
        for (uri, expected) in [
            ("/api/v1/events?token=wrong", StatusCode::UNAUTHORIZED),
            (format!("/api/v1/events?token={token}").as_str(), StatusCode::OK),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method("GET")
                        .uri(uri)
                        .header("origin", "https://whisdom.app")
                        .body(Body::empty())
                        .expect("events request"),
                )
                .await
                .expect("events response");
            assert_eq!(response.status(), expected);
        }
    }

    #[tokio::test]
    async fn update_dependencies_returns_a_synthetic_job_id() {
        let media = tempfile::NamedTempFile::new().expect("test media");
        let (app, token) = paired_router(media.path().to_owned()).await;
        let response = app
            .clone()
            .oneshot(request(
                "POST",
                "/api/v1/update-dependencies",
                &token,
                Body::from(r#"{"scope":"all"}"#),
            ))
            .await
            .expect("update response");
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("update body");
        let value: serde_json::Value = serde_json::from_slice(&body).expect("update JSON");
        assert!(value["job_id"].as_str().is_some_and(|id| !id.is_empty()));
    }
}
