use axum::extract::State;
use axum::Json;
use serde_json::{json, Value};
use std::path::PathBuf;

use crate::auth::{extract_bearer, verify_token};
use crate::error::AppError;
use crate::job::{Job, JobInput, JobPhase};
use crate::pipeline::run;
use crate::turnstile;
use crate::AppState;

pub async fn transcribe(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    mut multipart: axum::extract::Multipart,
) -> Result<Json<Value>, AppError> {
    let content_type = headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let content_length = headers
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    tracing::info!(content_type, content_length, "transcribe request received");

    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(extract_bearer)
        .unwrap_or("");
    let email = verify_token(&state.config, token).await?;

    let mut file_bytes: Option<Vec<u8>> = None;
    let mut file_filename: Option<String> = None;
    let mut url_string: Option<String> = None;
    let mut language: Option<String> = None;
    let mut turnstile_token: Option<String> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "audio" => {
                let fname = field
                    .file_name()
                    .unwrap_or("upload.bin")
                    .to_string();
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| {
                        tracing::error!(
                            error = %e,
                            filename = %fname,
                            "failed to read audio field"
                        );
                        AppError::Internal(format!("failed to read audio field: {e}"))
                    })?;

                if data.len() > state.config.max_upload_bytes() {
                    return Err(AppError::PayloadTooLarge);
                }

                file_bytes = Some(data.to_vec());
                file_filename = Some(fname);
            }
            "url" => {
                let value = field
                    .text()
                    .await
                    .map_err(|e| AppError::Internal(format!("failed to read url field: {e}")))?;
                if !value.is_empty() {
                    url_string = Some(value);
                }
            }
            "language" => {
                let value = field
                    .text()
                    .await
                    .map_err(|e| AppError::Internal(format!("failed to read language field: {e}")))?;
                if !value.is_empty() {
                    language = Some(value);
                }
            }
            "turnstile_token" => {
                let value = field
                    .text()
                    .await
                    .map_err(|e| AppError::Internal(format!("failed to read turnstile field: {e}")))?;
                if !value.is_empty() {
                    turnstile_token = Some(value);
                }
            }
            _ => {}
        }
    }

    turnstile::verify_turnstile(
        &state.config.turnstile,
        &turnstile_token.unwrap_or_default(),
    )
    .await?;

    let job_id = uuid::Uuid::new_v4().to_string();
    let temp_dir = PathBuf::from(state.config.temp_dir());
    let work_dir = temp_dir.join(&job_id);

    let (input, need_create_dir) = match (file_bytes, file_filename, url_string) {
        (Some(data), Some(fname), _) => {
            tokio::fs::create_dir_all(&work_dir).await.map_err(|e| {
                AppError::Internal(format!("failed to create work dir: {e}"))
            })?;
            let file_path = work_dir.join(&fname);
            tokio::fs::write(&file_path, &data).await.map_err(|e| {
                AppError::Internal(format!("failed to write uploaded file: {e}"))
            })?;
            (JobInput::File { filename: fname }, false)
        }
        (_, _, Some(u)) => (JobInput::Url { url: u }, true),
        _ => return Err(AppError::BadRequest("either 'audio' file or 'url' field required".into())),
    };

    if need_create_dir {
        tokio::fs::create_dir_all(&work_dir).await.map_err(|e| {
            AppError::Internal(format!("failed to create work dir: {e}"))
        })?;
    }

    let (cancel_tx, _) = tokio::sync::watch::channel(false);

    let job = Job {
        id: job_id.clone(),
        email: email.clone(),
        input,
        language,
        phase: JobPhase::Queued,
        progress: None,
        message: None,
        text: None,
        segments: None,
        error: None,
        work_dir: work_dir.clone(),
        cancel_tx,
    };

    let (id, job_arc) = state.queue.insert(job).await;
    let job_clone = job_arc.clone();
    let config_clone = state.config.clone();
    let queue_clone = state.queue.clone();

    tokio::spawn(async move {
        run::run_pipeline(&job_clone, &config_clone, &queue_clone).await;
        queue_clone.remove(&id).await;
    });

    Ok(Json(json!({ "job_id": job_id })))
}
