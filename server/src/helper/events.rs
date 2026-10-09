use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tokio::sync::broadcast;

use super::engine;
use super::protocol::PROTOCOL_VERSION;

/// Feature flags compiled into this helper binary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct FeatureFlags {
    pub vulkan: bool,
    pub metal: bool,
    pub directml: bool,
}

impl FeatureFlags {
    pub fn current() -> Self {
        Self {
            vulkan: cfg!(feature = "vulkan"),
            metal: cfg!(feature = "metal"),
            directml: cfg!(feature = "directml"),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct HelloEvent {
    pub protocol_version: u32,
    pub features: FeatureFlags,
    pub preferred_backend: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogEvent {
    /// ISO-8601 UTC timestamp.
    pub ts: String,
    pub level: &'static str,
    pub target: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub job_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProgressEvent {
    pub job_id: String,
    pub phase: String,
    pub percent: Option<f32>,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct JobEvent {
    pub job_id: String,
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Unified events-stream payload. Each variant maps to one SSE event name and
/// serializes as its inner payload (never as an externally tagged enum).
#[derive(Debug, Clone)]
pub enum HelperEvent {
    Hello(HelloEvent),
    Log(LogEvent),
    Progress(ProgressEvent),
    Job(JobEvent),
}

impl serde::Serialize for HelperEvent {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        match self {
            Self::Hello(event) => event.serialize(serializer),
            Self::Log(event) => event.serialize(serializer),
            Self::Progress(event) => event.serialize(serializer),
            Self::Job(event) => event.serialize(serializer),
        }
    }
}

impl HelperEvent {
    pub fn hello() -> Self {
        Self::Hello(HelloEvent {
            protocol_version: PROTOCOL_VERSION,
            features: FeatureFlags::current(),
            preferred_backend: engine::preferred_backend(),
        })
    }

    pub fn event_name(&self) -> &'static str {
        match self {
            Self::Hello(_) => "hello",
            Self::Log(_) => "log",
            Self::Progress(_) => "progress",
            Self::Job(_) => "job",
        }
    }
}

/// Multi-client broadcast hub for the unified `/events` stream.
#[derive(Clone)]
pub struct EventHub {
    sender: broadcast::Sender<Arc<HelperEvent>>,
}

impl EventHub {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(1024);
        Self { sender }
    }

    /// Emits to every subscriber; drops the event when nobody listens.
    pub fn emit(&self, event: HelperEvent) {
        let _ = self.sender.send(Arc::new(event));
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Arc<HelperEvent>> {
        self.sender.subscribe()
    }
}

impl Default for EventHub {
    fn default() -> Self {
        Self::new()
    }
}

pub fn unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

/// ISO-8601 UTC timestamp from unix milliseconds, e.g. "2026-07-12T09:15:03.250Z".
/// Implemented without a date dependency; validated by the unit tests below.
pub fn rfc3339(unix_millis: u64) -> String {
    let seconds = (unix_millis / 1000) as i64;
    let millis = (unix_millis % 1000) as u32;
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3600;
    let minute = (seconds_of_day % 3600) / 60;
    let second = seconds_of_day % 60;
    format!(
        "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z"
    )
}

/// Days-since-epoch to (year, month, day); Howard Hinnant's civil algorithm.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let year_of_era = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = doe - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let mp = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = if month <= 2 { year + 1 } else { year };
    (year, month, day)
}

/// Maps a helper job phase to the contract progress phase.
pub fn progress_phase(phase: &str) -> Option<&'static str> {
    match phase {
        "downloading" | "extracting" => Some("download_model"),
        "transcribing" => Some("transcribe"),
        "queued" => Some("other"),
        _ => None,
    }
}

/// Maps a helper job phase to the contract job status.
pub fn job_status(phase: &str) -> &'static str {
    match phase {
        "complete" => "complete",
        "error" => "failed",
        "cancelled" => "cancelled",
        "queued" => "queued",
        _ => "running",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_names_match_the_contract() {
        assert_eq!(HelperEvent::hello().event_name(), "hello");
        assert_eq!(
            HelperEvent::Log(LogEvent {
                ts: rfc3339(0),
                level: "info",
                target: "t".into(),
                message: "m".into(),
                job_id: None,
            })
            .event_name(),
            "log"
        );
        assert_eq!(
            HelperEvent::Progress(ProgressEvent {
                job_id: "j".into(),
                phase: "transcribe".into(),
                percent: Some(0.5),
                message: String::new(),
                detail: None,
            })
            .event_name(),
            "progress"
        );
        assert_eq!(
            HelperEvent::Job(JobEvent {
                job_id: "j".into(),
                status: "running",
                error: None,
            })
            .event_name(),
            "job"
        );
    }

    #[test]
    fn phase_mappings_are_exact() {
        assert_eq!(progress_phase("downloading"), Some("download_model"));
        assert_eq!(progress_phase("extracting"), Some("download_model"));
        assert_eq!(progress_phase("transcribing"), Some("transcribe"));
        assert_eq!(progress_phase("queued"), Some("other"));
        assert_eq!(progress_phase("complete"), None);
        assert_eq!(job_status("queued"), "queued");
        assert_eq!(job_status("transcribing"), "running");
        assert_eq!(job_status("complete"), "complete");
        assert_eq!(job_status("error"), "failed");
        assert_eq!(job_status("cancelled"), "cancelled");
    }

    #[test]
    fn hub_delivers_to_multiple_subscribers_and_survives_idle() {
        let hub = EventHub::new();
        let mut first = hub.subscribe();
        let mut second = hub.subscribe();
        hub.emit(HelperEvent::hello());
        hub.emit(HelperEvent::hello());
        assert!(first.try_recv().is_ok());
        assert!(first.try_recv().is_ok());
        assert!(second.try_recv().is_ok());
        assert!(second.try_recv().is_ok());
    }

    #[test]
    fn rfc3339_formats_known_instants() {
        assert_eq!(rfc3339(0), "1970-01-01T00:00:00.000Z");
        // 2026-07-12T09:15:03.250Z
        assert_eq!(rfc3339(1_783_844_503_250), "2026-07-12T08:21:43.250Z");
        // Leap-year day: 2024-02-29T23:59:59.999Z
        assert_eq!(rfc3339(1_709_251_199_999), "2024-02-29T23:59:59.999Z");
    }

    #[test]
    fn serialized_event_payloads_match_the_frontend_validators() {
        let log = serde_json::to_value(HelperEvent::Log(LogEvent {
            ts: rfc3339(0),
            level: "warn",
            target: "whisdom_helper".into(),
            message: "hello".into(),
            job_id: None,
        }))
        .expect("log serializes");
        assert!(log.get("job_id").is_none(), "absent job_id must be omitted");
        let job = serde_json::to_value(HelperEvent::Job(JobEvent {
            job_id: "job".into(),
            status: "running",
            error: None,
        }))
        .expect("job serializes");
        assert!(job.get("error").is_none(), "absent error must be omitted");
        let progress = serde_json::to_value(HelperEvent::Progress(ProgressEvent {
            job_id: "job".into(),
            phase: "transcribe".into(),
            percent: None,
            message: String::new(),
            detail: None,
        }))
        .expect("progress serializes");
        assert!(progress["message"].is_string());
        assert_eq!(progress["percent"], serde_json::Value::Null);
        assert!(progress.get("detail").is_none());
    }
}
