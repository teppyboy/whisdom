use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::{broadcast, Mutex};

use super::error::AppError;
use super::job::{Job, JobId, JobStatus};

#[derive(Clone)]
pub struct Queue {
    jobs: Arc<Mutex<HashMap<JobId, QueueEntry>>>,
}

struct QueueEntry {
    job: Arc<Mutex<Job>>,
    tx: broadcast::Sender<JobStatus>,
}

impl Queue {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn insert(&self, job: Job) -> (JobId, Arc<Mutex<Job>>) {
        let id = job.id.clone();
        let (tx, _) = broadcast::channel(128);
        let job = Arc::new(Mutex::new(job));
        self.jobs.lock().await.insert(
            id.clone(),
            QueueEntry {
                job: job.clone(),
                tx,
            },
        );
        (id, job)
    }

    pub async fn get(&self, id: &str) -> Option<Arc<Mutex<Job>>> {
        self.jobs.lock().await.get(id).map(|e| e.job.clone())
    }

    pub async fn subscribe(&self, id: &str) -> Result<broadcast::Receiver<JobStatus>, AppError> {
        self.jobs
            .lock()
            .await
            .get(id)
            .map(|e| e.tx.subscribe())
            .ok_or(AppError::NotFound)
    }

    pub async fn publish(&self, id: &str, status: JobStatus) {
        if let Some(entry) = self.jobs.lock().await.get(id) {
            let _ = entry.tx.send(status);
        }
    }

    pub async fn cancel(&self, id: &str) -> Result<(), AppError> {
        let jobs = self.jobs.lock().await;
        let entry = jobs.get(id).ok_or_else(|| AppError::NotFound)?;
        let job = entry.job.lock().await;
        let _ = job.cancel_tx.send(true);
        Ok(())
    }

    pub async fn remove(&self, id: &str) {
        self.jobs.lock().await.remove(id);
    }
}
