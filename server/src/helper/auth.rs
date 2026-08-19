use std::path::Path;
use std::sync::Arc;

use axum::http::HeaderMap;
use tokio::sync::RwLock;

use super::config::HelperConfig;
use super::protocol::HelperError;

#[derive(Clone)]
pub struct HelperAuth {
    token: Arc<RwLock<String>>,
    path: std::path::PathBuf,
    allowed_origins: Arc<Vec<String>>,
}

impl HelperAuth {
    pub async fn load(config: &HelperConfig) -> Result<Self, HelperError> {
        let token = match tokio::fs::read_to_string(config.token_path()).await {
            Ok(token) if !token.trim().is_empty() => token.trim().to_string(),
            Ok(_) | Err(_) => String::new(),
        };
        Ok(Self {
            token: Arc::new(RwLock::new(token)),
            path: config.token_path(),
            allowed_origins: Arc::new(config.allowed_origins.clone()),
        })
    }

    pub fn origin_allowed(&self, headers: &HeaderMap) -> bool {
        headers
            .get("origin")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|origin| self.allowed_origins.iter().any(|allowed| allowed == origin))
    }

    pub async fn pair(&self, headers: &HeaderMap) -> Result<String, HelperError> {
        if !self.origin_allowed(headers) {
            return Err(HelperError::OriginDenied);
        }
        let token = generate_token();
        write_private_file(&self.path, &token).await?;
        *self.token.write().await = token.clone();
        Ok(token)
    }

    pub async fn authorize(&self, headers: &HeaderMap) -> Result<(), HelperError> {
        if !self.origin_allowed(headers) {
            return Err(HelperError::OriginDenied);
        }
        let provided = headers
            .get("authorization")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "))
            .unwrap_or("");
        let expected = self.token.read().await;
        if constant_time_equal(provided.as_bytes(), expected.as_bytes()) {
            Ok(())
        } else {
            Err(HelperError::Unauthorized)
        }
    }
}

async fn write_private_file(path: &Path, value: &str) -> Result<(), HelperError> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::write(path, value).await?;
    Ok(())
}

fn generate_token() -> String {
    let bytes = uuid::Uuid::new_v4().as_bytes().to_owned();
    format!("{}{}", uuid::Uuid::new_v4().simple(), hex::encode(bytes))
}

fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    let mut difference = left.len() ^ right.len();
    for index in 0..left.len().max(right.len()) {
        difference |= usize::from(left.get(index).copied().unwrap_or_default())
            ^ usize::from(right.get(index).copied().unwrap_or_default());
    }
    difference == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constant_time_equal_matches_only_equal_values() {
        assert!(constant_time_equal(b"token", b"token"));
        assert!(!constant_time_equal(b"token", b"tokens"));
        assert!(!constant_time_equal(b"token", b"Token"));
    }
}
