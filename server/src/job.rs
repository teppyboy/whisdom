use serde::Serialize;

pub type JobId = String;

#[derive(Debug, Clone, Serialize)]
pub struct TranscriptSegment {
    #[serde(rename = "start")]
    pub start: f32,
    #[serde(rename = "end")]
    pub end: f32,
    #[serde(rename = "text")]
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum JobPhase {
    Queued,
    Downloading,
    Extracting,
    Transcribing,
    Complete,
    Error,
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
pub struct JobStatus {
    pub id: JobId,
    pub phase: JobPhase,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub segments: Option<Vec<TranscriptSegment>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
}

#[derive(Debug, Clone)]
pub enum JobInput {
    File {
        filename: String,
    },
    Url {
        url: String,
    },
}

pub struct Job {
    pub id: JobId,
    pub email: String,
    pub input: JobInput,
    pub language: Option<String>,
    pub model_id: String,
    pub phase: JobPhase,
    pub progress: Option<f32>,
    pub message: Option<String>,
    pub text: Option<String>,
    pub segments: Option<Vec<TranscriptSegment>>,
    pub error: Option<String>,
    pub work_dir: std::path::PathBuf,
    pub cancel_tx: tokio::sync::watch::Sender<bool>,
}

impl Job {
    pub fn status(&self) -> JobStatus {
        JobStatus {
            id: self.id.clone(),
            phase: self.phase.clone(),
            progress: self.progress,
            message: self.message.clone(),
            text: self.text.clone(),
            segments: self.segments.clone(),
            error: self.error.clone(),
            filename: match &self.input {
                JobInput::File { filename } => Some(filename.clone()),
                JobInput::Url { .. } => None,
            },
        }
    }

    pub fn is_cancelled(&self) -> bool {
        *self.cancel_tx.borrow()
    }
}
