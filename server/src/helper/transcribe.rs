use std::ffi::c_void;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
#[cfg(feature = "vulkan")]
use std::sync::Once;

use hound::WavReader;
use tokio::sync::{watch, RwLock};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use super::cache::{HelperCache, JobGuard};
use super::models::NativeModel;
use super::protocol::{HelperError, TranscriptSegment};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ModelBackend {
    Cpu,
    #[cfg(feature = "vulkan")]
    Vulkan,
}

pub struct LoadedModel {
    pub context: Arc<WhisperContext>,
    pub backend: ModelBackend,
    pub model_id: &'static str,
}

pub type SharedModel = Arc<RwLock<Option<Arc<LoadedModel>>>>;

const SAMPLE_RATE: usize = 16_000;

unsafe extern "C" fn abort_when_cancelled(user_data: *mut c_void) -> bool {
    // SAFETY: `transcribe_chunk` supplies a live `Arc<AtomicBool>` for its synchronous call.
    unsafe { (&*user_data.cast::<AtomicBool>()).load(Ordering::Acquire) }
}
#[cfg(feature = "vulkan")]
static VULKAN_WORKAROUNDS: Once = Once::new();

#[cfg(feature = "vulkan")]
fn configure_vulkan_workarounds() {
    VULKAN_WORKAROUNDS.call_once(|| {
        std::env::set_var("GGML_VK_DISABLE_MMVQ", "1");
        tracing::info!("disabling Vulkan MMVQ for encoder compatibility");
    });
}

pub async fn load_model(
    cache: &HelperCache,
    model: &SharedModel,
    model_spec: &'static NativeModel,
) -> Result<Arc<LoadedModel>, HelperError> {
    load_model_with_backend(cache, model, model_spec, true).await
}

#[allow(dead_code)]
pub async fn load_cpu_model(
    cache: &HelperCache,
    model: &SharedModel,
    model_spec: &'static NativeModel,
) -> Result<Arc<LoadedModel>, HelperError> {
    load_model_with_backend(cache, model, model_spec, false).await
}

async fn load_model_with_backend(
    cache: &HelperCache,
    model: &SharedModel,
    model_spec: &'static NativeModel,
    prefer_vulkan: bool,
) -> Result<Arc<LoadedModel>, HelperError> {
    if let Some(loaded) = model.read().await.as_ref() {
        if loaded.model_id == model_spec.id && cached_backend_matches(prefer_vulkan, loaded.backend)
        {
            tracing::debug!(backend = ?loaded.backend, "using cached Whisper model");
            return Ok(Arc::clone(loaded));
        }
    }

    tracing::info!("loading Whisper model");
    let path = cache.ensure_model(model_spec).await?;
    let context = tokio::task::spawn_blocking(move || {
        #[cfg(feature = "vulkan")]
        if prefer_vulkan {
            configure_vulkan_workarounds();
            let mut gpu_params = WhisperContextParameters::default();
            gpu_params.use_gpu(true);
            match WhisperContext::new_with_params(&path, gpu_params) {
                Ok(context) => {
                    tracing::info!("Whisper Vulkan backend selected");
                    return Ok((Arc::new(context), ModelBackend::Vulkan));
                }
                Err(error) => {
                    return Err(HelperError::BadRequest(format!(
                        "Whisper Vulkan model load failed: {error}"
                    )));
                }
            }
        }

        #[cfg(feature = "vulkan")]
        if prefer_vulkan {
            return Err(HelperError::BadRequest(
                "Whisper Vulkan backend is unavailable; CPU fallback is disabled".into(),
            ));
        }

        let mut cpu_params = WhisperContextParameters::default();
        cpu_params.use_gpu(false);
        WhisperContext::new_with_params(&path, cpu_params)
            .map(|context| {
                tracing::info!("Whisper CPU backend selected");
                (Arc::new(context), ModelBackend::Cpu)
            })
            .map_err(|error| HelperError::BadRequest(format!("Whisper model load failed: {error}")))
    })
    .await
    .map_err(|error| {
        HelperError::BadRequest(format!("Whisper model load task failed: {error}"))
    })??;

    let loaded = Arc::new(LoadedModel {
        context: context.0,
        backend: context.1,
        model_id: model_spec.id,
    });
    let mut guard = model.write().await;
    if let Some(existing) = guard.as_ref() {
        if existing.model_id == model_spec.id
            && cached_backend_matches(prefer_vulkan, existing.backend)
        {
            return Ok(Arc::clone(existing));
        }
    }
    *guard = Some(Arc::clone(&loaded));
    Ok(loaded)
}

#[allow(dead_code)]
pub(crate) fn is_vulkan_backend(backend: ModelBackend) -> bool {
    #[cfg(feature = "vulkan")]
    {
        return backend == ModelBackend::Vulkan;
    }
    #[cfg(not(feature = "vulkan"))]
    {
        let _ = backend;
        false
    }
}

fn cached_backend_matches(prefer_vulkan: bool, backend: ModelBackend) -> bool {
    #[cfg(feature = "vulkan")]
    {
        prefer_vulkan == is_vulkan_backend(backend)
    }
    #[cfg(not(feature = "vulkan"))]
    {
        let _ = prefer_vulkan;
        let _ = backend;
        true
    }
}

pub fn spawn_cancel_watcher(cancel: Arc<AtomicBool>, mut cancel_rx: watch::Receiver<bool>) {
    tokio::spawn(async move {
        if *cancel_rx.borrow() {
            cancel.store(true, Ordering::Release);
            return;
        }
        while cancel_rx.changed().await.is_ok() {
            if *cancel_rx.borrow() {
                cancel.store(true, Ordering::Release);
                break;
            }
        }
    });
}

pub(crate) fn mark_pre_cancelled(cancel: &AtomicBool, cancel_rx: &watch::Receiver<bool>) -> bool {
    if *cancel_rx.borrow() {
        cancel.store(true, Ordering::Release);
        true
    } else {
        false
    }
}

pub async fn transcribe_wav(
    wav_path: &Path,
    model: Arc<LoadedModel>,
    language: Option<String>,
    cancel: Arc<AtomicBool>,
    cancel_rx: watch::Receiver<bool>,
    _job_guard: &JobGuard,
) -> Result<Vec<TranscriptSegment>, HelperError> {
    let wav_path = wav_path.to_owned();
    if !mark_pre_cancelled(&cancel, &cancel_rx) {
        spawn_cancel_watcher(Arc::clone(&cancel), cancel_rx);
    }
    tokio::task::spawn_blocking(move || {
        let reader = WavReader::open(&wav_path)
            .map_err(|error| HelperError::BadRequest(format!("WAV open failed: {error}")))?;
        let spec = reader.spec();
        if spec.sample_rate != SAMPLE_RATE as u32
            || spec.channels != 1
            || spec.bits_per_sample != 16
        {
            return Err(HelperError::BadRequest(
                "helper audio must be 16 kHz mono PCM 16-bit WAV".into(),
            ));
        }
        let samples = reader
            .into_samples::<i16>()
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| HelperError::BadRequest(format!("WAV read failed: {error}")))?;
        transcribe_chunk(&model.context, &samples, language.as_deref(), cancel, 0.0)
    })
    .await
    .map_err(|error| HelperError::BadRequest(format!("Whisper task failed: {error}")))?
}

fn transcribe_chunk(
    context: &WhisperContext,
    samples: &[i16],
    language: Option<&str>,
    cancel: Arc<AtomicBool>,
    offset_seconds: f32,
) -> Result<Vec<TranscriptSegment>, HelperError> {
    let mut state = context.create_state().map_err(|error| {
        HelperError::BadRequest(format!("Whisper state creation failed: {error}"))
    })?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_n_threads(4);
    params.set_translate(false);
    params.set_no_context(true);
    params.set_single_segment(false);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_token_timestamps(true);
    params.set_temperature_inc(0.2);
    // SAFETY: `cancel` remains alive until `state.full` returns, so the callback's userdata
    // remains valid for the entire native inference call.
    unsafe {
        params.set_abort_callback(Some(abort_when_cancelled));
        params.set_abort_callback_user_data(Arc::as_ptr(&cancel).cast_mut().cast());
    }
    if let Some(language) = language.filter(|value| *value != "auto") {
        params.set_language(Some(language));
    }

    let audio = samples
        .iter()
        .map(|sample| f32::from(*sample) / 32768.0)
        .collect::<Vec<_>>();
    if cancel.load(Ordering::Acquire) {
        return Err(HelperError::BadRequest("cancelled".into()));
    }
    state.full(params, &audio).map_err(|error| {
        if cancel.load(Ordering::Acquire) {
            HelperError::BadRequest("cancelled".into())
        } else {
            HelperError::BadRequest(format!("Whisper transcription failed: {error}"))
        }
    })?;

    let mut segments = Vec::new();
    for index in 0..state.full_n_segments() {
        if cancel.load(Ordering::Acquire) {
            return Err(HelperError::BadRequest("cancelled".into()));
        }
        if let Some(segment) = state.get_segment(index) {
            let text = segment
                .to_str_lossy()
                .map_err(|error| HelperError::BadRequest(format!("Whisper text failed: {error}")))?
                .into_owned();
            segments.push(TranscriptSegment {
                start: offset_seconds + segment.start_timestamp() as f32 / 100.0,
                end: offset_seconds + segment.end_timestamp() as f32 / 100.0,
                text,
            });
        }
    }
    Ok(segments)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn abort_callback_tracks_the_cancellation_flag() {
        let cancel = AtomicBool::new(false);
        let user_data = std::ptr::from_ref(&cancel).cast_mut().cast();
        // SAFETY: `user_data` points to the live `cancel` above for both calls.
        assert!(!unsafe { abort_when_cancelled(user_data) });
        cancel.store(true, Ordering::Release);
        // SAFETY: `user_data` still points to the live `cancel` above.
        assert!(unsafe { abort_when_cancelled(user_data) });
    }

    #[test]
    fn pre_cancelled_inference_marks_atomic_flag_without_model_loading() {
        let (sender, receiver) = watch::channel(true);
        let cancel = AtomicBool::new(false);
        assert!(mark_pre_cancelled(&cancel, &receiver));
        assert!(cancel.load(Ordering::Acquire));
        drop(sender);
    }
}
