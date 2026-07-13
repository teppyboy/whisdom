use serde::Deserialize;

use crate::config::TurnstileConfig;
use crate::error::AppError;

#[derive(Debug, Deserialize)]
struct SiteverifyResponse {
    success: bool,
    #[serde(rename = "error-codes")]
    #[allow(dead_code)]
    error_codes: Option<Vec<String>>,
}

pub async fn verify_turnstile(config: &TurnstileConfig, token: &str) -> Result<(), AppError> {
    if !config.enabled || config.secret_key.is_empty() {
        return Ok(());
    }

    if token.is_empty() {
        return Err(AppError::BadRequest("turnstile token missing".into()));
    }

    let client = reqwest::Client::new();
    let params = [
        ("secret", config.secret_key.as_str()),
        ("response", token),
    ];

    let resp = client
        .post(&config.siteverify_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("turnstile verify request failed: {e}")))?;

    let body: SiteverifyResponse = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("turnstile verify parse failed: {e}")))?;

    if !body.success {
        return Err(AppError::BadRequest("turnstile verification failed".into()));
    }

    Ok(())
}
