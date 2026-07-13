use axum::extract::{Path, State};
use axum::Json;
use serde_json::{json, Value};

use crate::auth::{extract_bearer, verify_token};
use crate::error::AppError;
use crate::job::JobId;
use crate::AppState;

pub async fn cancel(
    State(state): State<AppState>,
    Path(id): Path<JobId>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Value>, AppError> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(extract_bearer)
        .unwrap_or("");
    let email = verify_token(&state.config, token).await?;

    let job = state.queue.get(&id).await.ok_or(AppError::NotFound)?;
    {
        let j = job.lock().await;
        if j.email != email {
            return Err(AppError::Unauthorized);
        }
    }

    state.queue.cancel(&id).await?;

    Ok(Json(json!({ "status": "cancelled" })))
}
