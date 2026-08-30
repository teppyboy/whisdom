use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU32};
use std::sync::Arc;

use tokio::sync::{watch, RwLock};

use super::cache::{HelperCache, JobGuard};
use super::models::{AsrEngine, NativeModel};
use super::parakeet;
use super::protocol::{HelperError, TranscriptSegment};
use super::transcribe;

pub enum LoadedRuntime {
    Whisper(Arc<transcribe::LoadedModel>),
    Parakeet(Arc<parakeet::LoadedParakeet>),
}

pub type SharedRuntime = Arc<RwLock<Option<Arc<LoadedRuntime>>>>;

pub fn engine_for(model: &NativeModel) -> AsrEngine {
    model.engine
}

pub async fn load_runtime(
    cache: &HelperCache,
    runtime: &SharedRuntime,
    model: &'static NativeModel,
) -> Result<Arc<LoadedRuntime>, HelperError> {
    if let Some(loaded) = runtime.read().await.as_ref() {
        let same_model = match (&**loaded, model.engine) {
            (LoadedRuntime::Whisper(loaded), AsrEngine::WhisperCpp) => loaded.model_id == model.id,
            (LoadedRuntime::Parakeet(loaded), AsrEngine::SherpaOnnx) => loaded.model_id == model.id,
            _ => false,
        };
        if same_model {
            return Ok(Arc::clone(loaded));
        }
    }
    match model.engine {
        AsrEngine::WhisperCpp => {
            let whisper_state = Arc::new(RwLock::new(None));
            let loaded = Arc::new(LoadedRuntime::Whisper(
                transcribe::load_model(cache, &whisper_state, model).await?,
            ));
            *runtime.write().await = Some(Arc::clone(&loaded));
            Ok(loaded)
        }
        AsrEngine::SherpaOnnx => {
            let loaded = Arc::new(LoadedRuntime::Parakeet(
                parakeet::load_model(cache, model).await?,
            ));
            *runtime.write().await = Some(Arc::clone(&loaded));
            Ok(loaded)
        }
    }
}

pub async fn transcribe_wav(
    wav_path: &Path,
    runtime: Arc<LoadedRuntime>,
    model: &'static NativeModel,
    language: Option<String>,
    cancel_rx: watch::Receiver<bool>,
    guard: &JobGuard,
    progress: Option<Arc<AtomicU32>>,
    vad_model_path: Option<std::path::PathBuf>,
) -> Result<Vec<TranscriptSegment>, HelperError> {
    match (&*runtime, model.engine) {
        (LoadedRuntime::Whisper(loaded), AsrEngine::WhisperCpp) => {
            transcribe::transcribe_wav(
                wav_path,
                Arc::clone(loaded),
                language,
                Arc::new(AtomicBool::new(false)),
                cancel_rx,
                guard,
                progress,
                vad_model_path,
            )
            .await
        }
        (LoadedRuntime::Parakeet(loaded), AsrEngine::SherpaOnnx) => {
            parakeet::transcribe_wav(wav_path, Arc::clone(loaded), cancel_rx, guard).await
        }
        _ => Err(HelperError::BadRequest(
            "loaded runtime does not match the selected model".into(),
        )),
    }
}

// sherpa-onnx 1.13.6 exposes no active-provider query. The loaded backend is
// therefore the provider requested for the custom, verified runtime bundle.
pub async fn active_backend(model: &NativeModel, runtime: &SharedRuntime) -> &'static str {
    let Some(loaded_runtime) = runtime.read().await.as_ref().cloned() else {
        return "cpu";
    };
    match (&*loaded_runtime, model.engine) {
        (LoadedRuntime::Whisper(loaded), AsrEngine::WhisperCpp) if loaded.model_id == model.id => {
            loaded_backend(loaded_runtime.as_ref())
        }
        (LoadedRuntime::Parakeet(loaded), AsrEngine::SherpaOnnx) if loaded.model_id == model.id => {
            loaded_backend(loaded_runtime.as_ref())
        }
        _ => "cpu",
    }
}

pub fn loaded_backend(runtime: &LoadedRuntime) -> &'static str {
    match runtime {
        LoadedRuntime::Whisper(model) => match model.backend {
            transcribe::ModelBackend::Cpu => "cpu",
            #[cfg(feature = "vulkan")]
            transcribe::ModelBackend::Vulkan => "vulkan",
        },
        LoadedRuntime::Parakeet(model) => model.backend.id(),
    }
}

pub fn is_retryable_inference_error(engine: AsrEngine, error: &HelperError) -> bool {
    engine == AsrEngine::WhisperCpp && error.to_string().contains("Whisper transcription failed")
}

pub fn should_try_next_parakeet_backend(error: &HelperError) -> bool {
    parakeet::is_backend_initialization_error(error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::helper::models::find_native_model;

    #[test]
    fn model_engine_dispatch_is_closed_and_exact() {
        assert_eq!(
            engine_for(find_native_model("ggml-base-q5_1").unwrap()),
            AsrEngine::WhisperCpp
        );
        let parakeet = find_native_model("sherpa-parakeet-tdt-v3-int8").unwrap();
        assert_eq!(engine_for(parakeet), AsrEngine::SherpaOnnx);
        let whisper = find_native_model("ggml-base-q5_1").unwrap();
        assert_eq!(
            futures::executor::block_on(active_backend(whisper, &SharedRuntime::default())),
            "cpu"
        );
        assert_eq!(
            futures::executor::block_on(active_backend(parakeet, &SharedRuntime::default())),
            "cpu"
        );
        assert!(should_try_next_parakeet_backend(&HelperError::BadRequest(
            "Parakeet DirectML runtime initialization failed".into()
        )));
        assert!(!should_try_next_parakeet_backend(&HelperError::BadRequest(
            "Parakeet transcription failed".into()
        )));
    }
}
