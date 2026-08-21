use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::Mutex;

use super::logging::sanitize_filename;
use super::protocol::HelperError;

pub const DEFAULT_SELECTION_TTL: Duration = Duration::from_secs(30 * 60);
pub const DEFAULT_SELECTION_CAPACITY: usize = 100;

#[derive(Clone)]
pub struct NativeSelection {
    pub id: String,
    path: PathBuf,
    pub filename: String,
    pub size_bytes: u64,
    pub extension: Option<String>,
    inserted_at: Instant,
}

impl NativeSelection {
    pub fn path(&self) -> PathBuf {
        self.path.clone()
    }
}

impl std::fmt::Debug for NativeSelection {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("NativeSelection")
            .field("id", &self.id)
            .field("size_bytes", &self.size_bytes)
            .field("extension", &self.extension)
            .finish()
    }
}

#[derive(Clone)]
pub struct SelectionStore {
    entries: Arc<Mutex<HashMap<String, NativeSelection>>>,
    ttl: Duration,
    capacity: usize,
}

impl Default for SelectionStore {
    fn default() -> Self {
        Self::new(DEFAULT_SELECTION_TTL, DEFAULT_SELECTION_CAPACITY)
    }
}

impl SelectionStore {
    pub fn new(ttl: Duration, capacity: usize) -> Self {
        Self {
            entries: Arc::new(Mutex::new(HashMap::new())),
            ttl,
            capacity,
        }
    }

    pub async fn insert(&self, path: PathBuf) -> Result<NativeSelection, HelperError> {
        let (filename, size_bytes, extension) = inspect_path(&path).await?;
        let selection = NativeSelection {
            id: uuid::Uuid::new_v4().to_string(),
            path,
            filename,
            size_bytes,
            extension,
            inserted_at: Instant::now(),
        };
        let mut entries = self.entries.lock().await;
        prune_expired(&mut entries, self.ttl);
        if entries.len() >= self.capacity {
            return Err(HelperError::Busy);
        }
        entries.insert(selection.id.clone(), selection.clone());
        Ok(selection)
    }

    pub async fn take(&self, id: &str) -> Result<NativeSelection, HelperError> {
        let selection = {
            let mut entries = self.entries.lock().await;
            prune_expired(&mut entries, self.ttl);
            entries.remove(id).ok_or(HelperError::NotFound)?
        };
        inspect_path(&selection.path).await?;
        Ok(selection)
    }

    pub async fn delete(&self, id: &str) -> bool {
        let mut entries = self.entries.lock().await;
        prune_expired(&mut entries, self.ttl);
        entries.remove(id).is_some()
    }
}

fn prune_expired(entries: &mut HashMap<String, NativeSelection>, ttl: Duration) {
    entries.retain(|_, selection| selection.inserted_at.elapsed() < ttl);
}

async fn inspect_path(path: &Path) -> Result<(String, u64, Option<String>), HelperError> {
    let metadata = tokio::fs::metadata(path).await.map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            HelperError::BadRequest("selected media is no longer available".into())
        } else {
            HelperError::Io(error)
        }
    })?;
    if !metadata.is_file() {
        return Err(HelperError::BadRequest(
            "selected media is not a file".into(),
        ));
    }
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .map(sanitize_filename)
        .ok_or_else(|| HelperError::BadRequest("selected media has no valid filename".into()))?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| {
            !value.is_empty()
                && value.len() <= 16
                && value
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric())
        })
        .map(ToOwned::to_owned);
    Ok((filename, metadata.len(), extension))
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_path(name: &str) -> (tempfile::TempDir, PathBuf) {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join(name);
        tokio::fs::write(&path, b"media").await.expect("test media");
        (directory, path)
    }

    #[tokio::test]
    async fn selection_is_opaque_single_use_and_deletable() {
        let store = SelectionStore::new(Duration::from_secs(30), 2);
        let (_directory, path) = test_path("meeting.mkv").await;
        let selection = store.insert(path).await.expect("selection created");
        assert!(!selection.id.contains("meeting"));
        assert!(store.delete(&selection.id).await);
        assert!(matches!(
            store.take(&selection.id).await,
            Err(HelperError::NotFound)
        ));
    }

    #[tokio::test]
    async fn selection_store_rejects_overflow_and_expired_entries() {
        let store = SelectionStore::new(Duration::ZERO, 1);
        let (_directory, path) = test_path("one.wav").await;
        let selection = store.insert(path).await.expect("selection created");
        assert!(matches!(
            store.take(&selection.id).await,
            Err(HelperError::NotFound)
        ));

        let store = SelectionStore::new(Duration::from_secs(30), 1);
        let (_first_directory, first) = test_path("first.wav").await;
        let (_second_directory, second) = test_path("second.wav").await;
        store.insert(first).await.expect("first selection created");
        assert!(matches!(store.insert(second).await, Err(HelperError::Busy)));
    }

    #[tokio::test]
    async fn taking_a_missing_file_consumes_its_selection() {
        let store = SelectionStore::default();
        let (_directory, path) = test_path("deleted.wav").await;
        let selection = store.insert(path.clone()).await.expect("selection created");
        tokio::fs::remove_file(path)
            .await
            .expect("remove test media");
        assert!(matches!(
            store.take(&selection.id).await,
            Err(HelperError::BadRequest(_))
        ));
        assert!(matches!(
            store.take(&selection.id).await,
            Err(HelperError::NotFound)
        ));
    }

    #[tokio::test]
    async fn selection_reports_original_size_and_safe_extension() {
        let store = SelectionStore::default();
        let (_directory, path) = test_path("meeting.mkv").await;
        let selection = store.insert(path).await.expect("selection created");
        assert_eq!(selection.filename, "meeting.mkv");
        assert_eq!(selection.size_bytes, 5);
        assert_eq!(selection.extension.as_deref(), Some("mkv"));
    }

    #[tokio::test]
    async fn selection_debug_output_hides_path_and_filename() {
        let store = SelectionStore::default();
        let (_directory, path) = test_path("private-meeting.mkv").await;
        let path_display = path.display().to_string();
        let selection = store.insert(path).await.expect("selection created");
        let debug = format!("{selection:?}");
        assert!(!debug.contains(&path_display));
        assert!(!debug.contains("private-meeting.mkv"));
    }
}
