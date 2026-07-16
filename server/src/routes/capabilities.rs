use axum::extract::State;
use axum::Json;
use serde_json::{json, Value};

use crate::AppState;

pub async fn capabilities(State(state): State<AppState>) -> Json<Value> {
    let models: Vec<Value> = state
        .model_registry
        .available()
        .map(|m| json!({"id": m.id, "label": m.label, "size_mb": m.size_mb, "quality": m.quality}))
        .collect();

    Json(json!({
        "available": true,
        "engine": "whisper.cpp",
        "input_types": ["file", "url"],
        "cpu_optimized": true,
        "models": models,
        "default_model": state.model_registry.default_id(),
    }))
}
