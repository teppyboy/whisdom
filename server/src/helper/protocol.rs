use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum HelperError {
    #[error("helper configuration error: {0}")]
    Config(String),
    #[error("helper authentication failed")]
    Unauthorized,
    #[error("helper origin is not allowed")]
    OriginDenied,
    #[error("helper resource is busy")]
    Busy,
    #[error("helper resource was not found")]
    NotFound,
    #[error("helper bad request: {0}")]
    BadRequest(String),
    #[error("helper I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("helper serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

impl IntoResponse for HelperError {
    fn into_response(self) -> Response {
        let status = match &self {
            Self::Unauthorized | Self::OriginDenied => StatusCode::UNAUTHORIZED,
            Self::Busy => StatusCode::CONFLICT,
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::BadRequest(_) | Self::Config(_) => StatusCode::BAD_REQUEST,
            Self::Io(_) | Self::Serialization(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        let message = self.to_string();
        (status, axum::Json(serde_json::json!({ "error": message }))).into_response()
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct HealthResponse {
    pub available: bool,
    pub protocol_version: u32,
    pub busy: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PairResponse {
    pub token: String,
    pub protocol_version: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct CapabilitiesResponse {
    pub available: bool,
    pub engine: &'static str,
    pub accelerator: &'static str,
    pub model_id: String,
    pub model_ready: bool,
    pub ffmpeg_ready: bool,
    pub native_picker: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PickAndTranscribeRequest {
    pub language: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PickAndTranscribeResponse {
    pub job_id: String,
    pub filename: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TranscriptSegment {
    pub start: f32,
    pub end: f32,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct JobStatus {
    pub id: String,
    pub phase: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub segments: Option<Vec<TranscriptSegment>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
}

pub const PROTOCOL_VERSION: u32 = 1;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picker_request_rejects_client_paths() {
        let result = serde_json::from_str::<PickAndTranscribeRequest>(
            r#"{"language":"vi","model":"ggml-large-v3-turbo-q5_0","path":"C:\\secret.wav"}"#,
        );
        assert!(result.is_err());
    }

    #[test]
    fn picker_response_contains_no_path() {
        let value = serde_json::to_value(PickAndTranscribeResponse {
            job_id: "job-123".into(),
            filename: "meeting.mkv".into(),
        })
        .expect("picker response serializes");
        assert_eq!(value["job_id"], "job-123");
        assert_eq!(value["filename"], "meeting.mkv");
        assert!(value.get("path").is_none());
    }
}
