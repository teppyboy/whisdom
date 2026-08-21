use std::collections::HashMap;
use std::sync::Arc;

use futures::future::BoxFuture;
use tokio::sync::{broadcast, Mutex};

use super::auth::HelperAuth;
use super::cache::HelperCache;
use super::config::HelperConfig;
use super::protocol::{HelperError, JobStatus};
use super::selection::SelectionStore;
use super::transcribe::SharedModel;

pub type NativeFilePicker =
    Arc<dyn Fn() -> BoxFuture<'static, Result<Vec<std::path::PathBuf>, HelperError>> + Send + Sync>;

#[derive(Clone)]
pub struct HelperState {
    pub config: HelperConfig,
    pub auth: HelperAuth,
    pub cache: HelperCache,
    pub queue: HelperQueue,
    pub model: SharedModel,
    pub selections: SelectionStore,
    pub native_file_picker: Option<NativeFilePicker>,
}

#[derive(Clone)]
pub struct HelperQueue {
    jobs: Arc<Mutex<HashMap<String, JobEntry>>>,
}

#[derive(Clone)]
struct JobEntry {
    job: Arc<Mutex<HelperJob>>,
    events: broadcast::Sender<JobStatus>,
}

pub struct HelperJob {
    pub id: String,
    pub filename: String,
    pub phase: String,
    pub progress: Option<f32>,
    pub message: Option<String>,
    pub text: Option<String>,
    pub segments: Option<Vec<super::protocol::TranscriptSegment>>,
    pub error: Option<String>,
    pub cancel: tokio::sync::watch::Sender<bool>,
}

impl HelperJob {
    pub fn status(&self) -> JobStatus {
        JobStatus {
            id: self.id.clone(),
            phase: self.phase.clone(),
            progress: self.progress,
            message: self.message.clone(),
            text: self.text.clone(),
            segments: self.segments.clone(),
            error: self.error.clone(),
            filename: Some(self.filename.clone()),
        }
    }
}

impl Default for HelperQueue {
    fn default() -> Self {
        Self {
            jobs: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl HelperQueue {
    pub async fn insert(&self, job: HelperJob) -> Arc<Mutex<HelperJob>> {
        let id = job.id.clone();
        let (events, _) = broadcast::channel(128);
        let job = Arc::new(Mutex::new(job));
        self.jobs.lock().await.insert(
            id,
            JobEntry {
                job: job.clone(),
                events,
            },
        );
        job
    }

    pub async fn get(&self, id: &str) -> Option<Arc<Mutex<HelperJob>>> {
        self.jobs
            .lock()
            .await
            .get(id)
            .map(|entry| entry.job.clone())
    }

    pub async fn subscribe_with_snapshot(
        &self,
        id: &str,
    ) -> Result<(broadcast::Receiver<JobStatus>, JobStatus), HelperError> {
        let jobs = self.jobs.lock().await;
        let entry = jobs.get(id).ok_or(HelperError::NotFound)?;
        let receiver = entry.events.subscribe();
        let status = entry.job.lock().await.status();
        Ok((receiver, status))
    }

    pub async fn publish(&self, id: &str) {
        if let Some(entry) = self.jobs.lock().await.get(id) {
            let status = entry.job.lock().await.status();
            let _ = entry.events.send(status);
        }
    }

    pub async fn cancel(&self, id: &str) -> Result<(), HelperError> {
        let job = self.get(id).await.ok_or(HelperError::NotFound)?;
        let job = job.lock().await;
        if is_terminal_phase(&job.phase) {
            return Ok(());
        }
        job.cancel.send(true).map_err(|_| HelperError::NotFound)
    }
}

pub fn is_terminal_phase(phase: &str) -> bool {
    matches!(phase, "complete" | "error" | "cancelled")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_phases_are_exact() {
        assert!(is_terminal_phase("complete"));
        assert!(is_terminal_phase("error"));
        assert!(is_terminal_phase("cancelled"));
        assert!(!is_terminal_phase("queued"));
        assert!(!is_terminal_phase("transcribing"));
    }

    #[tokio::test]
    async fn cancel_does_not_change_terminal_jobs() {
        let queue = HelperQueue::default();
        let (cancel, mut cancelled) = tokio::sync::watch::channel(false);
        queue
            .insert(HelperJob {
                id: "job".into(),
                filename: "audio.wav".into(),
                phase: "complete".into(),
                progress: Some(100.0),
                message: None,
                text: Some("done".into()),
                segments: None,
                error: None,
                cancel,
            })
            .await;

        queue
            .cancel("job")
            .await
            .expect("terminal cancellation is a no-op");
        assert!(!*cancelled.borrow_and_update());
    }
}
