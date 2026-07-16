//! Model catalog derivation: turns a ggml filename into a stable id/label pair.

/// Strip the leading `ggml-` prefix and trailing `.bin` suffix, then strip a
/// trailing quantization suffix matching `-q<digits>...` or `-f<digits>...`
/// (case-insensitive). If no quantization suffix is found, the stripped
/// string is returned as-is. Never panics.
pub fn derive_id(filename: &str) -> String {
    let no_prefix = filename.strip_prefix("ggml-").unwrap_or(filename);
    let stripped = no_prefix.strip_suffix(".bin").unwrap_or(no_prefix);

    match stripped.rfind('-') {
        Some(idx) => {
            let (head, tail) = stripped.split_at(idx);
            let quant = &tail[1..]; // skip the '-'
            let is_quant = quant.len() > 1
                && (quant.starts_with('q')
                    || quant.starts_with('Q')
                    || quant.starts_with('f')
                    || quant.starts_with('F'))
                && quant
                    .chars()
                    .nth(1)
                    .map(|c| c.is_ascii_digit())
                    .unwrap_or(false);
            if is_quant {
                head.to_string()
            } else {
                stripped.to_string()
            }
        }
        None => stripped.to_string(),
    }
}

/// Convert a derived id into a human label: hyphens become spaces, each
/// word is capitalized. E.g. "large-v3" -> "Large V3".
pub fn derive_label(id: &str) -> String {
    id.split('-')
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[derive(Debug, Clone, PartialEq)]
pub struct ModelInfo {
    pub id: String,
    pub label: String,
    pub filename: String,
    pub size_mb: u64,
    pub quality: String,
    pub gpu: bool,
}

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Semaphore;
use whisper_rs::WhisperContext;

struct ModelEntry {
    info: ModelInfo,
    context: Arc<WhisperContext>,
    semaphore: Arc<Semaphore>,
}

pub struct ModelRegistry {
    entries: HashMap<String, ModelEntry>,
    default_id: String,
}

impl ModelRegistry {
    pub fn get(&self, id: &str) -> Option<(Arc<WhisperContext>, Arc<Semaphore>)> {
        self.entries
            .get(id)
            .map(|e| (Arc::clone(&e.context), Arc::clone(&e.semaphore)))
    }

    pub fn info(&self, id: &str) -> Option<&ModelInfo> {
        self.entries.get(id).map(|e| &e.info)
    }

    pub fn default_id(&self) -> &str {
        &self.default_id
    }

    pub fn available(&self) -> impl Iterator<Item = &ModelInfo> {
        self.entries.values().map(|e| &e.info)
    }

    #[cfg(test)]
    pub fn empty_for_tests() -> Self {
        ModelRegistry {
            entries: HashMap::new(),
            default_id: String::new(),
        }
    }
}

use crate::config::Config;
use std::path::Path;
use tracing::{error, info};
use whisper_rs::{WhisperContextParameters, WhisperError};

#[derive(Debug)]
pub enum PreloadError {
    NoModelsLoaded,
    DefaultModelNotLoaded { requested: String },
    DuplicateModelId { id: String },
}

impl std::fmt::Display for PreloadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PreloadError::NoModelsLoaded => {
                write!(f, "no models could be loaded from the configured catalog")
            }
            PreloadError::DefaultModelNotLoaded { requested } => {
                write!(
                    f,
                    "configured default model '{requested}' was not successfully loaded"
                )
            }
            PreloadError::DuplicateModelId { id } => {
                write!(f, "duplicate derived model id '{id}' in catalog; filenames must produce unique ids")
            }
        }
    }
}

impl std::error::Error for PreloadError {}

/// Preloads every catalog entry whose file exists under `config.model.dir`,
/// in parallel, building a `ModelRegistry`. Fails fast if the configured
/// default model isn't loaded, if zero models load, or if two catalog
/// entries derive the same id.
pub async fn preload_models(config: &Config) -> Result<ModelRegistry, PreloadError> {
    let dir = Path::new(&config.model.dir);

    // Derive ids up front and check for duplicates before spawning any work.
    let mut seen_ids = std::collections::HashSet::new();
    let mut candidates = Vec::new();
    for entry in &config.model.catalog {
        let id = derive_id(&entry.filename);
        if !seen_ids.insert(id.clone()) {
            return Err(PreloadError::DuplicateModelId { id });
        }
        let path = dir.join(&entry.filename);
        if path.exists() {
            candidates.push((id, entry.clone(), path));
        } else {
            info!(filename = %entry.filename, "model file not found, skipping");
        }
    }

    let gpu_enabled = config.gpu.enabled;
    let gpu_device = config.gpu.device;

    let mut tasks = Vec::new();
    for (id, entry, path) in candidates {
        let effective_gpu = gpu_enabled && entry.gpu;
        tasks.push(tokio::task::spawn_blocking(move || {
            let started = std::time::Instant::now();
            let size_bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            const BYTES_PER_MB: u64 = 1024 * 1024;
            let size_mb = size_bytes / BYTES_PER_MB
                + u64::from(size_bytes % BYTES_PER_MB >= BYTES_PER_MB / 2);

            let mut params = WhisperContextParameters::default();
            params.use_gpu(effective_gpu);
            if effective_gpu {
                params.gpu_device(gpu_device);
            }

            let load_result: Result<WhisperContext, WhisperError> =
                WhisperContext::new_with_params(&path, params);

            (
                id,
                entry,
                size_mb,
                effective_gpu,
                gpu_device,
                started.elapsed(),
                load_result,
            )
        }));
    }

    let results = futures::future::join_all(tasks).await;

    let mut entries = HashMap::new();
    for joined in results {
        let (id, entry, size_mb, gpu, device, elapsed, load_result) = match joined {
            Ok(v) => v,
            Err(e) => {
                error!(error = %e, "model preload task panicked");
                continue;
            }
        };
        match load_result {
            Ok(context) => {
                info!(
                    model_id = %id,
                    size_mb,
                    gpu,
                    device,
                    duration_ms = elapsed.as_millis() as u64,
                    "model loaded"
                );
                let label = derive_label(&id);
                entries.insert(
                    id.clone(),
                    ModelEntry {
                        info: ModelInfo {
                            id,
                            label,
                            filename: entry.filename,
                            size_mb,
                            quality: entry.quality,
                            gpu,
                        },
                        context: Arc::new(context),
                        semaphore: Arc::new(Semaphore::new(1)),
                    },
                );
            }
            Err(e) => {
                error!(model_id = %id, error = %e, "failed to load model, excluding from registry");
            }
        }
    }

    if entries.is_empty() {
        return Err(PreloadError::NoModelsLoaded);
    }

    let default_id = config.model.default_model.clone();
    if !entries.contains_key(&default_id) {
        return Err(PreloadError::DefaultModelNotLoaded {
            requested: default_id,
        });
    }

    Ok(ModelRegistry {
        entries,
        default_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_id_strips_prefix_suffix_and_quant() {
        assert_eq!(derive_id("ggml-tiny-q5_1.bin"), "tiny");
        assert_eq!(derive_id("ggml-base-q5_1.bin"), "base");
        assert_eq!(derive_id("ggml-small-q5_1.bin"), "small");
        assert_eq!(derive_id("ggml-medium-q5_0.bin"), "medium");
    }

    #[test]
    fn derive_id_handles_two_segment_name_with_quant() {
        assert_eq!(derive_id("ggml-large-v3-q5_0.bin"), "large-v3");
    }

    #[test]
    fn derive_id_handles_missing_quant_suffix() {
        assert_eq!(derive_id("ggml-tiny.bin"), "tiny");
    }

    #[test]
    fn derive_id_handles_f_type_quant_suffix() {
        assert_eq!(derive_id("ggml-medium-f16.bin"), "medium");
    }

    #[test]
    fn derive_id_never_panics_on_unexpected_filename() {
        assert_eq!(derive_id("weird-file-name.bin"), "weird-file-name");
        assert_eq!(derive_id(""), "");
        assert_eq!(derive_id("ggml-.bin"), "");
    }

    #[test]
    fn derive_label_capitalizes_and_replaces_hyphens() {
        assert_eq!(derive_label("large-v3"), "Large V3");
        assert_eq!(derive_label("base"), "Base");
        assert_eq!(derive_label("tiny"), "Tiny");
    }

    #[tokio::test]
    async fn semaphore_blocks_second_concurrent_acquire_until_first_drops() {
        let sem = Arc::new(Semaphore::new(1));
        let permit1 = sem.clone().acquire_owned().await.unwrap();

        let sem2 = Arc::clone(&sem);
        let mut second = tokio::spawn(async move { sem2.acquire_owned().await });

        // Give the spawned task a chance to run; it must NOT complete yet.
        tokio::select! {
            _ = &mut second => panic!("second acquire completed before first permit was dropped"),
            _ = tokio::time::sleep(std::time::Duration::from_millis(50)) => {}
        }

        drop(permit1);
        let permit2 = second.await.unwrap().unwrap();
        drop(permit2);
    }
}
