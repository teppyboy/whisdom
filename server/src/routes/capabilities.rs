use axum::Json;
use serde_json::{json, Value};

pub async fn capabilities() -> Json<Value> {
    Json(json!({
        "available": true,
        "engine": "whisper.cpp",
        "input_types": ["file", "url"],
        "cpu_optimized": true
    }))
}
