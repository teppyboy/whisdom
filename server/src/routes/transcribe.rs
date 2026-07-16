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

fn multipart_error(error: axum::extract::multipart::MultipartError) -> AppError {
    match error.status() {
        axum::http::StatusCode::PAYLOAD_TOO_LARGE => AppError::PayloadTooLarge,
        axum::http::StatusCode::BAD_REQUEST => AppError::BadRequest(error.body_text()),
        _ => AppError::Internal(error.body_text()),
    }
}

fn resolve_model_id(
    requested: Option<String>,
    registry: &crate::models::ModelRegistry,
) -> Result<String, AppError> {
    match requested {
        Some(id) => {
            if registry.info(&id).is_none() {
                return Err(AppError::BadRequest(format!(
                    "model '{id}' is not available on this server"
                )));
            }
            Ok(id)
        }
        None => Ok(registry.default_id().to_string()),
    }
}

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
    let mut model: Option<String> = None;
    let mut turnstile_token: Option<String> = None;

    while let Some(field) = multipart.next_field().await.map_err(multipart_error)? {
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "audio" => {
                let fname = field
                    .file_name()
                    .unwrap_or("upload.bin")
                    .to_string();
                let data = field.bytes().await.map_err(|error| {
                    tracing::error!(
                        error = %error,
                        filename = %fname,
                        "failed to read audio field"
                    );
                    multipart_error(error)
                })?;

                if data.len() > state.config.max_upload_bytes() {
                    return Err(AppError::PayloadTooLarge);
                }

                file_bytes = Some(data.to_vec());
                file_filename = Some(fname);
            }
            "url" => {
                let value = field.text().await.map_err(multipart_error)?;
                if !value.is_empty() {
                    url_string = Some(value);
                }
            }
            "language" => {
                let value = field.text().await.map_err(multipart_error)?;
                if !value.is_empty() {
                    language = Some(value);
                }
            }
            "model" => {
                let value = field.text().await.map_err(multipart_error)?;
                if !value.is_empty() {
                    model = Some(value);
                }
            }
            "turnstile_token" => {
                let value = field.text().await.map_err(multipart_error)?;
                if !value.is_empty() {
                    turnstile_token = Some(value);
                }
            }
            _ => {}
        }
    }

    let resolved_model_id = resolve_model_id(model, &state.model_registry)?;
    tracing::debug!(model_id = %resolved_model_id, "resolved model for job");

    tracing::debug!(
        filename = file_filename.as_deref().unwrap_or(""),
        bytes = file_bytes.as_ref().map_or(0, Vec::len),
        language = language.as_deref().unwrap_or("auto"),
        "transcribe input parsed"
    );

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

    let input_kind = match &input {
        JobInput::File { .. } => "file",
        JobInput::Url { .. } => "url",
    };

    let (cancel_tx, _) = tokio::sync::watch::channel(false);

    let job = Job {
        id: job_id.clone(),
        email: email.clone(),
        input,
        language,
        model_id: resolved_model_id,
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
    tracing::info!(job_id = %id, input_kind, "transcription job queued");
    let job_clone = job_arc.clone();
    let config_clone = state.config.clone();
    let queue_clone = state.queue.clone();
    let model_registry_clone = std::sync::Arc::clone(&state.model_registry);

    tokio::spawn(async move {
        run::run_pipeline(&job_clone, &config_clone, &queue_clone, &model_registry_clone).await;
        queue_clone.remove(&id).await;
    });

    Ok(Json(json!({ "job_id": job_id })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ModelRegistry;

    #[test]
    fn resolve_model_id_defaults_to_registry_default_when_none_requested() {
        let registry = ModelRegistry::empty_for_tests();
        let result = resolve_model_id(None, &registry);
        assert_eq!(result.unwrap(), registry.default_id().to_string());
    }

    #[test]
    fn resolve_model_id_rejects_unknown_model() {
        let registry = ModelRegistry::empty_for_tests();
        let result = resolve_model_id(Some("nonexistent".to_string()), &registry);
        assert!(result.is_err());
    }
}
