use serde::Deserialize;

use crate::config::Config;
use crate::error::AppError;

#[derive(Debug, Deserialize)]
struct TokenInfo {
    email: Option<String>,
    email_verified: Option<String>,
}

pub async fn verify_token(config: &Config, token: &str) -> Result<String, AppError> {
    if token.is_empty() {
        return Err(AppError::Unauthorized);
    }

    if config.dev_auth_bypass() {
        return Ok("dev@localhost".into());
    }

    let url = format!(
        "https://oauth2.googleapis.com/tokeninfo?access_token={}",
        token
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("tokeninfo request failed: {e}")))?;

    if !resp.status().is_success() {
        return Err(AppError::Unauthorized);
    }

    let info: TokenInfo = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("tokeninfo parse failed: {e}")))?;

    let email_verified = info.email_verified.as_deref().unwrap_or("") == "true"
        || info.email_verified.as_deref().unwrap_or("") == "True";

    if !email_verified {
        return Err(AppError::Unauthorized);
    }

    let email = info.email.unwrap_or_default();

    if email.is_empty() {
        return Err(AppError::Unauthorized);
    }

    if !config.is_allowed(&email) {
        return Err(AppError::Unauthorized);
    }

    Ok(email)
}

pub fn extract_bearer(header: &str) -> &str {
    header.strip_prefix("Bearer ").unwrap_or("")
}
