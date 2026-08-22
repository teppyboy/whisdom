use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tokio::sync::watch;

use super::cache::JobGuard;
use super::logging::sanitize_filename;
use super::models::NativeModel;
use super::protocol::HelperError;
use super::state::{HelperJob, HelperState};
use super::transcribe::{load_model, transcribe_wav};

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
    let ffmpeg = super::ffmpeg::ensure_ffmpeg(&state.cache).await?;
    let chunks_dir = work_dir.join("chunks");
    let chunk_seconds = 20 * 60;
    tracing::info!(
        job_id = %id,
        chunk_seconds,
        "splitting media into native WAV chunks"
    );
    let chunks = super::ffmpeg::split_to_wav_chunks(
        &ffmpeg,
        input,
        &chunks_dir,
        chunk_seconds,
        cancel_rx.clone(),
    )
    .await?;
    tracing::info!(job_id = %id, chunk_count = chunks.len(), "native WAV chunks ready");
    if is_cancelled(&cancel_rx) {
        return Err(cancelled_error());
    }
    let mut pending = chunks
        .into_iter()
        .enumerate()
        .map(|(index, chunk)| (chunk, index as f32 * chunk_seconds as f32, chunk_seconds))
        .collect::<VecDeque<_>>();
    let initial_chunk_count = pending.len();
    let mut completed_chunks = 0usize;
    let mut retry_id = 0usize;
    let mut segments = Vec::new();
    while let Some((chunk, offset_seconds, current_seconds)) = pending.pop_front() {
        if is_cancelled(&cancel_rx) {
            return Err(cancelled_error());
        }
        tracing::info!(
            job_id = %id,
            chunk_seconds = current_seconds,
            "loading Vulkan Whisper model for chunk"
        );
        let model = load_model(&state.cache, &state.model, model_spec).await?;
        match transcribe_chunk(&chunk, model, language.clone(), cancel_rx.clone(), &guard).await {
            Ok(chunk_segments) => {
                segments.extend(chunk_segments.into_iter().map(|mut segment| {
                    segment.start += offset_seconds;
                    segment.end += offset_seconds;
                    segment
                }));
                completed_chunks += 1;
                set_phase(
                    state,
                    job,
                    id,
                    "transcribing",
                    Some(10.0 + 85.0 * completed_chunks as f32 / initial_chunk_count as f32),
                    Some(format!(
                        "transcribed chunk {} of {}",
                        completed_chunks, initial_chunk_count
                    )),
                )
                .await;
            }
            Err(error) if is_retryable_transcription_error(&error) && current_seconds > 60 => {
                let next_seconds = (current_seconds / 2).max(60);
                retry_id += 1;
                let retry_dir = chunks_dir.join(format!("retry-{retry_id:05}"));
                tracing::warn!(
                    job_id = %id,
                    failed_chunk_seconds = current_seconds,
                    retry_chunk_seconds = next_seconds,
                    "Vulkan chunk failed; splitting into smaller physical chunks"
                );
                {
                    let mut loaded = state.model.write().await;
                    *loaded = None;
                }
                let retry_chunks = super::ffmpeg::split_to_wav_chunks(
                    &ffmpeg,
                    &chunk,
                    &retry_dir,
                    next_seconds,
                    cancel_rx.clone(),
                )
                .await?;
                for (index, retry_chunk) in retry_chunks.into_iter().enumerate().rev() {
                    pending.push_front((
                        retry_chunk,
                        offset_seconds + index as f32 * next_seconds as f32,
                        next_seconds,
                    ));
                }
            }
            Err(error) => return Err(error),
        }
    }
    let text = segments
        .iter()
        .map(|segment| segment.text.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    if is_cancelled(&cancel_rx) {
        return Err(cancelled_error());
    }
    {
        let mut current = job.lock().await;
        if is_cancelled(&cancel_rx) {
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

async fn transcribe_chunk(
    chunk: &Path,
    model: Arc<super::transcribe::LoadedModel>,
    language: Option<String>,
    cancel_rx: watch::Receiver<bool>,
    guard: &JobGuard,
) -> Result<Vec<super::protocol::TranscriptSegment>, HelperError> {
    transcribe_wav(
        chunk,
        model,
        language,
        Arc::new(AtomicBool::new(false)),
        cancel_rx,
        guard,
    )
    .await
}

fn is_retryable_transcription_error(error: &HelperError) -> bool {
    error.to_string().contains("Whisper transcription failed")
}

fn is_cancelled(cancel_rx: &watch::Receiver<bool>) -> bool {
    *cancel_rx.borrow()
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
        assert!(!is_cancelled(&receiver));
        sender.send(true).expect("watch receiver exists");
        assert!(is_cancelled(&receiver));
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
