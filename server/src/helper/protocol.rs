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
    #[error("helper update failed: {0}")]
    Update(String),
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
            Self::Update(_) | Self::Io(_) | Self::Serialization(_) => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
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
pub struct UpdateResponse {
    pub update: Option<super::state::HelperUpdateInfo>,
}
#[derive(Debug, Clone, Serialize)]
pub struct PairResponse {
    pub token: String,
    pub protocol_version: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct NativeModelResponse {
    pub id: String,
    pub label: String,
    pub quality: String,
    pub size_bytes: u64,
    pub installed: bool,
    pub engine: &'static str,
    pub supported_languages: Vec<String>,
    pub supports_auto_language: bool,
    pub active_backend: &'static str,
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
    pub models: Vec<NativeModelResponse>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NativeSelectionResponse {
    pub id: String,
    pub filename: String,
    pub size_bytes: u64,
    pub extension: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SelectFilesResponse {
    pub selections: Vec<NativeSelectionResponse>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartSelectionRequest {
    pub selection_id: String,
    pub language: Option<String>,
    pub model: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct StartSelectionResponse {
    pub job_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
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

pub const PROTOCOL_VERSION: u32 = 2;

// `unavailable` is a truthful capability state while a catalog model's native
// runtime has not been packaged; it is never an accelerator claim.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selection_start_rejects_client_paths_and_assets() {
        for field in [
            "path",
            "file",
            "url",
            "checksum",
            "engine",
            "asset_url",
            "model_path",
        ] {
            let input =
                format!(r#"{{"selection_id":"id","model":"ggml-tiny-q5_1","{field}":"x"}}"#);
            assert!(serde_json::from_str::<StartSelectionRequest>(&input).is_err());
        }
    }

    #[test]
    fn serialized_companion_responses_never_contain_paths() {
        let value = serde_json::to_value(SelectFilesResponse {
            selections: vec![NativeSelectionResponse {
                id: "selection-1".into(),
                filename: "meeting.mkv".into(),
                size_bytes: 5,
                extension: Some("mkv".into()),
            }],
        })
        .expect("serializes");
        assert!(value.get("path").is_none());
        assert!(value["selections"][0].get("path").is_none());
    }
}
