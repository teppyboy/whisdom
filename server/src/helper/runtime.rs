use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tokio::sync::watch;

use super::cache::JobGuard;
use super::logging::sanitize_filename;
use super::models::NativeModel;
use super::protocol::HelperError;
use super::state::{HelperJob, HelperState};
use super::transcribe::{load_cpu_model, load_model, transcribe_wav};

pub async fn start_path_job(
    state: Arc<HelperState>,
    input: PathBuf,
    filename: String,
    language: Option<String>,
    model: &'static NativeModel,
) -> Result<String, HelperError> {
    start_path_job_inner(state, input, filename, language, model, None).await
}

pub async fn start_staged_job(
    state: Arc<HelperState>,
    input: PathBuf,
    filename: String,
    language: Option<String>,
    staged_dir: PathBuf,
    model: &'static NativeModel,
) -> Result<String, HelperError> {
    start_path_job_inner(state, input, filename, language, model, Some(staged_dir)).await
}

async fn start_path_job_inner(
    state: Arc<HelperState>,
    input: PathBuf,
    filename: String,
    language: Option<String>,
    model: &'static NativeModel,
    staged_dir: Option<PathBuf>,
) -> Result<String, HelperError> {
    let metadata = tokio::fs::metadata(&input).await?;
    if !metadata.is_file() {
        return Err(HelperError::BadRequest(
            "selected media is not a file".into(),
        ));
    }
    let filename = if staged_dir.is_some() {
        Path::new(&filename)
            .file_name()
            .and_then(|value| value.to_str())
            .filter(|value| !value.is_empty())
            .map(sanitize_filename)
            .ok_or_else(|| HelperError::BadRequest("uploaded media has no valid filename".into()))?
    } else {
        input
            .file_name()
            .and_then(|value| value.to_str())
            .filter(|value| !value.is_empty())
            .map(sanitize_filename)
            .ok_or_else(|| HelperError::BadRequest("selected media has no valid filename".into()))?
    };
    let admission_guard = state.cache.job_guard().await?;
    let id = uuid::Uuid::new_v4().to_string();
    let work_dir = state.config.temp_dir().join(&id);
    tokio::fs::create_dir_all(&work_dir).await?;
    let (cancel, _) = tokio::sync::watch::channel(false);
    let cancel_for_job = cancel.clone();
    tracing::info!(filename = %filename, "transcription job queued");
    let job = state
        .queue
        .insert(HelperJob {
            id: id.clone(),
            filename,
            phase: "queued".into(),
            progress: Some(0.0),
            message: None,
            text: None,
            segments: None,
            error: None,
            cancel,
        })
        .await;
    state.queue.publish(&id).await;

    let state_clone = state.clone();
    let job_id = id.clone();
    tokio::spawn(async move {
        let result = run_transcription(
            &state_clone,
            &job,
            &job_id,
            &input,
            language,
            model,
            cancel_for_job.subscribe(),
            admission_guard,
        )
        .await;
        if let Err(error) = result {
            tracing::error!(job_id = %job_id, error = %error, "transcription job failed");
            set_error(&state_clone, &job, &job_id, error.to_string()).await;
        } else {
            tracing::info!(job_id = %job_id, "transcription job complete");
        }
        let _ = tokio::fs::remove_dir_all(&work_dir).await;
        if let Some(staged_dir) = staged_dir {
            let _ = tokio::fs::remove_dir_all(staged_dir).await;
        }
    });
    Ok(id)
}

pub async fn run_transcription(
    state: &Arc<HelperState>,
    job: &Arc<tokio::sync::Mutex<HelperJob>>,
    id: &str,
    input: &Path,
    language: Option<String>,
    model_spec: &'static NativeModel,
    cancel_rx: tokio::sync::watch::Receiver<bool>,
    guard: JobGuard,
) -> Result<(), HelperError> {
    if is_cancelled(&cancel_rx) {
        return Err(cancelled_error());
    }
    let work_dir = state.config.temp_dir().join(id);
    tracing::info!(job_id = %id, "transcription backend starting");
    set_phase(
        state,
        job,
        id,
        "transcribing",
        Some(10.0),
        Some("loading native Whisper model".into()),
    )
    .await;
    let model = load_model(&state.cache, &state.model, model_spec).await?;
    if is_cancelled(&cancel_rx) {
        return Err(cancelled_error());
    }
    let wav = work_dir.join("audio.wav");
    if input.extension().and_then(|value| value.to_str()) == Some("wav") {
        tokio::fs::copy(input, &wav).await?;
    } else {
        if is_cancelled(&cancel_rx) {
            return Err(cancelled_error());
        }
        let ffmpeg = super::ffmpeg::ensure_ffmpeg(&state.cache).await?;
        if is_cancelled(&cancel_rx) {
            return Err(cancelled_error());
        }
        super::ffmpeg::convert_to_wav(&ffmpeg, input, &wav, cancel_rx.clone()).await?;
    }
    let cancel = Arc::new(AtomicBool::new(false));
    let segments = match transcribe_wav(
        &wav,
        model.clone(),
        language.clone(),
        Arc::clone(&cancel),
        cancel_rx.clone(),
        &guard,
    )
    .await
    {
        Ok(segments) => segments,
        Err(error)
            if super::transcribe::is_vulkan_backend(model.backend)
                && error.to_string().contains("Whisper transcription failed") =>
        {
            if cancel.load(Ordering::Acquire) || is_cancelled(&cancel_rx) {
                return Err(cancelled_error());
            }
            tracing::warn!(job_id = %id, "Whisper Vulkan inference failed; retrying with CPU");
            let cpu = load_cpu_model(&state.cache, &state.model, model_spec).await?;
            let retry_cancel = Arc::new(AtomicBool::new(false));
            let retry_cancel_rx = cancel_rx.clone();
            if is_cancelled(&retry_cancel_rx) {
                return Err(cancelled_error());
            }
            transcribe_wav(&wav, cpu, language, retry_cancel, retry_cancel_rx, &guard).await?
        }
        Err(error) => return Err(error),
    };
    let text = segments
        .iter()
        .map(|segment| segment.text.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    if cancellation_wins(&cancel, &cancel_rx) {
        return Err(cancelled_error());
    }
    {
        let mut current = job.lock().await;
        if cancellation_wins(&cancel, &cancel_rx) {
            return Err(cancelled_error());
        }
        current.phase = "complete".into();
        current.progress = Some(100.0);
        current.text = Some(text);
        current.segments = Some(segments);
    }
    state.queue.publish(id).await;
    Ok(())
}

fn is_cancelled(cancel_rx: &watch::Receiver<bool>) -> bool {
    *cancel_rx.borrow()
}

fn cancellation_wins(cancel: &AtomicBool, cancel_rx: &watch::Receiver<bool>) -> bool {
    cancel.load(Ordering::Acquire) || is_cancelled(cancel_rx)
}

const CANCELLED_ERROR_DISPLAY: &str = "helper bad request: cancelled";

fn cancelled_error() -> HelperError {
    HelperError::BadRequest("cancelled".into())
}

fn is_cancelled_error(error: &str) -> bool {
    matches!(error, "cancelled" | CANCELLED_ERROR_DISPLAY)
}

async fn set_phase(
    state: &Arc<HelperState>,
    job: &Arc<tokio::sync::Mutex<HelperJob>>,
    id: &str,
    phase: &str,
    progress: Option<f32>,
    message: Option<String>,
) {
    {
        let mut current = job.lock().await;
        current.phase = phase.into();
        current.progress = progress;
        current.message = message;
    }
    tracing::debug!(job_id = %id, phase, "transcription job phase");
    state.queue.publish(id).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancellation_predicate_reads_watch_state() {
        let (sender, receiver) = watch::channel(false);
        let cancel = AtomicBool::new(false);
        assert!(!is_cancelled(&receiver));
        assert!(!cancellation_wins(&cancel, &receiver));
        sender.send(true).expect("watch receiver exists");
        assert!(is_cancelled(&receiver));
        assert!(cancellation_wins(&cancel, &receiver));
    }

    #[test]
    fn atomic_cancellation_wins_before_completion() {
        let (_sender, receiver) = watch::channel(false);
        let cancel = AtomicBool::new(true);
        assert!(cancellation_wins(&cancel, &receiver));
    }

    #[test]
    fn cancellation_error_classification_accepts_displayed_helper_error() {
        assert!(is_cancelled_error("cancelled"));
        assert!(is_cancelled_error(CANCELLED_ERROR_DISPLAY));
        assert!(!is_cancelled_error(
            "helper bad request: transcription failed"
        ));
    }
}

async fn set_error(
    state: &Arc<HelperState>,
    job: &Arc<tokio::sync::Mutex<HelperJob>>,
    id: &str,
    error: String,
) {
    let cancelled = is_cancelled_error(&error);
    {
        let mut current = job.lock().await;
        current.phase = if cancelled { "cancelled" } else { "error" }.into();
        current.error = Some(error);
    }
    state.queue.publish(id).await;
}
