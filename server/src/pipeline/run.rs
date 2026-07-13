use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tokio::sync::Mutex;

use crate::config::Config;
use crate::error::AppError;
use crate::job::{Job, JobInput, JobPhase};
use crate::queue::Queue;

use super::download;
use super::extract;
use super::transcribe;
use super::transcribe::TranscribeOptions;

pub async fn run_pipeline(job: &Arc<Mutex<Job>>, config: &Config, queue: &Queue) {
    let (id, input, language, work_dir) = {
        let j = job.lock().await;
        (
            j.id.clone(),
            j.input.clone(),
            j.language.clone(),
            j.work_dir.clone(),
        )
    };

    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let cancel_flag = cancel_flag.clone();
        let job = job.clone();
        tokio::spawn(async move {
            let mut cancel_rx = {
                let j = job.lock().await;
                j.cancel_tx.subscribe()
            };
            loop {
                if cancel_rx.changed().await.is_err() {
                    return;
                }
                cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
            }
        });
    }

    let result = execute(&id, &input, &language, &work_dir, config, queue, &cancel_flag).await;

    match result {
        Ok(segments) => {
            let mut j = job.lock().await;
            j.phase = JobPhase::Complete;
            j.progress = Some(100.0);
            let text = segments.iter().map(|s| s.text.as_str()).collect::<Vec<_>>().join(" ");
            j.text = Some(text);
            j.segments = Some(segments);
        }
        Err(e) => {
            let mut j = job.lock().await;
            let msg = format!("{e}");
            j.phase = if msg.contains("cancelled") {
                JobPhase::Cancelled
            } else {
                JobPhase::Error
            };
            j.error = Some(msg);
        }
    }

    let status = job.lock().await.status();
    queue.publish(&id, status).await;
}

async fn execute(
    id: &str,
    input: &JobInput,
    language: &Option<String>,
    work_dir: &PathBuf,
    config: &Config,
    queue: &Queue,
    cancel_flag: &AtomicBool,
) -> Result<Vec<crate::job::TranscriptSegment>, AppError> {
    tokio::fs::create_dir_all(work_dir).await?;

    let media_path = match input {
        JobInput::File { filename } => {
            let path = work_dir.join(filename);
            if !path.exists() {
                return Err(AppError::Internal("input file not found in work dir".into()));
            }
            path
        }
        JobInput::Url { url } => {
            update_phase(id, JobPhase::Downloading, Some(0.0), Some("downloading url...".into()), queue).await;

            let cancel_rx = {
                let entry = queue.get(id).await.unwrap();
                let j = entry.lock().await;
                j.cancel_tx.subscribe()
            };

            let path = download::download_url(url, work_dir, config, &cancel_rx).await?;

            update_phase(id, JobPhase::Downloading, Some(100.0), Some("download complete".into()), queue).await;

            path
        }
    };

    let audio_path = work_dir.join("audio.wav");

    update_phase(id, JobPhase::Extracting, Some(0.0), Some("extracting audio...".into()), queue).await;

    {
        let cancel_rx = {
            let entry = queue.get(id).await.unwrap();
            let j = entry.lock().await;
            j.cancel_tx.subscribe()
        };

        extract::extract_audio(&media_path, &audio_path, config, &cancel_rx).await?;
    }

    update_phase(id, JobPhase::Extracting, Some(100.0), Some("extraction complete".into()), queue).await;

    if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
        return Err(AppError::BadRequest("cancelled".into()));
    }

    update_phase(id, JobPhase::Transcribing, Some(0.0), Some("transcribing...".into()), queue).await;

    let options = TranscribeOptions {
        model_path: config.model_path().to_string(),
        threads: config.threads(),
        language: language.as_ref().and_then(|l| if l != "auto" { Some(l.clone()) } else { None }),
    };

    let flag = Arc::new(AtomicBool::new(cancel_flag.load(std::sync::atomic::Ordering::Relaxed)));
    let audio_clone = audio_path.clone();

    let segments = tokio::task::spawn_blocking(move || {
        transcribe::transcribe_wav(&audio_clone, &options, flag)
    })
    .await
    .map_err(|e| AppError::Internal(format!("spawn_blocking join error: {e}")))??;

    update_phase(id, JobPhase::Transcribing, Some(100.0), Some("transcription complete".into()), queue).await;

    cleanup(work_dir).await;

    Ok(segments)
}

async fn update_phase(id: &str, phase: JobPhase, progress: Option<f32>, message: Option<String>, queue: &Queue) {
    if let Some(entry) = queue.get(id).await {
        let mut j = entry.lock().await;
        j.phase = phase.clone();
        j.progress = progress;
        j.message = message;
        let status = j.status();
        drop(j);
        queue.publish(id, status).await;
    }
}

async fn cleanup(work_dir: &PathBuf) {
    if let Ok(mut dir) = tokio::fs::read_dir(work_dir).await {
        while let Ok(Some(entry)) = dir.next_entry().await {
            let path = entry.path();
            if path.is_file() {
                tokio::fs::remove_file(path).await.ok();
            }
        }
    }
    tokio::fs::remove_dir(work_dir).await.ok();
}
