use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("unauthorized")]
    Unauthorized,

    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("not found")]
    NotFound,

    #[error("payload too large")]
    PayloadTooLarge,

    #[error("internal error: {0}")]
    Internal(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized".to_string()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            AppError::NotFound => (StatusCode::NOT_FOUND, "not found".to_string()),
            AppError::PayloadTooLarge => {
                (StatusCode::PAYLOAD_TOO_LARGE, "payload too large".to_string())
            }
            AppError::Internal(_) | AppError::Io(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "internal error".to_string())
            }
        };

        (status, axum::Json(serde_json::json!({ "error": message }))).into_response()
    }
}
