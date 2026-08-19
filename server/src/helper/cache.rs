use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use tokio::sync::Mutex;

use super::config::HelperConfig;
use super::download::{download_verified, verify_file_sha256};
use super::protocol::HelperError;
use super::transcribe::SharedModel;

#[derive(Clone)]
pub struct HelperCache {
    config: HelperConfig,
    client: reqwest::Client,
    active_jobs: Arc<AtomicUsize>,
    admission_gate: Arc<Mutex<()>>,
    model_lock: Arc<Mutex<()>>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CacheCategory {
    pub installed: bool,
    pub bytes: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CacheStatus {
    pub model: CacheCategory,
    pub ffmpeg: CacheCategory,
    pub temp_bytes: u64,
    pub busy: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CacheClearResult {
    pub model_deleted: bool,
    pub ffmpeg_deleted: bool,
    pub temp_deleted: bool,
}

impl HelperCache {
    pub fn new(config: HelperConfig) -> Self {
        Self {
            config,
            client: reqwest::Client::new(),
            active_jobs: Arc::new(AtomicUsize::new(0)),
            admission_gate: Arc::new(Mutex::new(())),
            model_lock: Arc::new(Mutex::new(())),
        }
    }

    pub async fn job_guard(&self) -> Result<JobGuard, HelperError> {
        let gate = Arc::clone(&self.admission_gate).lock_owned().await;
        self.active_jobs.fetch_add(1, Ordering::AcqRel);
        Ok(JobGuard {
            active_jobs: Arc::clone(&self.active_jobs),
            _admission_gate: gate,
        })
    }

    pub fn is_busy(&self) -> bool {
        self.active_jobs.load(Ordering::Acquire) > 0
    }
    pub fn config(&self) -> &HelperConfig {
        &self.config
    }
    pub fn client(&self) -> &reqwest::Client {
        &self.client
    }

    pub async fn ensure_model(&self) -> Result<std::path::PathBuf, HelperError> {
        let _lock = self.model_lock.lock().await;
        let path = self.config.model_path();
        if path.exists() {
            if verify_file_sha256(&path, &self.config.model_sha256).await? {
                return Ok(path);
            }
            tokio::fs::remove_file(&path).await?;
        }
        download_verified(
            &self.client,
            &self.config.model_url,
            &path,
            &self.config.model_sha256,
            self.config.max_download_bytes,
        )
        .await?;
        Ok(path)
    }

    pub async fn status(&self) -> Result<CacheStatus, HelperError> {
        Ok(CacheStatus {
            model: file_category(&self.config.model_path()).await?,
            ffmpeg: file_category(&self.config.tools_dir()).await?,
            temp_bytes: directory_bytes(&self.config.temp_dir()).await?,
            busy: self.is_busy(),
        })
    }

    pub async fn clear(&self, model: &SharedModel) -> Result<CacheClearResult, HelperError> {
        let _gate = self
            .admission_gate
            .try_lock()
            .map_err(|_| HelperError::Busy)?;
        if self.is_busy() {
            return Err(HelperError::Busy);
        }
        *model.write().await = None;
        let result = CacheClearResult {
            model_deleted: remove_path(&self.config.models_dir()).await?,
            ffmpeg_deleted: remove_path(&self.config.tools_dir()).await?,
            temp_deleted: remove_path(&self.config.temp_dir()).await?,
        };
        self.config.create_dirs().await?;
        Ok(result)
    }
}

pub struct JobGuard {
    active_jobs: Arc<AtomicUsize>,
    _admission_gate: tokio::sync::OwnedMutexGuard<()>,
}
impl Drop for JobGuard {
    fn drop(&mut self) {
        self.active_jobs.fetch_sub(1, Ordering::AcqRel);
    }
}

async fn remove_path(path: &Path) -> Result<bool, HelperError> {
    let path = path.to_owned();
    tokio::task::spawn_blocking(move || remove_path_sync(&path))
        .await
        .map_err(|error| HelperError::BadRequest(format!("cache deletion task failed: {error}")))?
}

fn remove_path_sync(path: &Path) -> Result<bool, HelperError> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(HelperError::Io(error)),
    };
    if metadata.file_type().is_symlink() {
        return Err(HelperError::BadRequest(
            "managed cache path contains a symlink".into(),
        ));
    }
    if metadata.is_dir() {
        for entry in std::fs::read_dir(path)? {
            remove_path_sync(&entry?.path())?;
        }
        std::fs::remove_dir(path)?;
    } else {
        std::fs::remove_file(path)?;
    }
    Ok(true)
}

async fn file_category(path: &Path) -> Result<CacheCategory, HelperError> {
    match tokio::fs::symlink_metadata(path).await {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() {
                return Err(HelperError::BadRequest(
                    "managed cache path contains a symlink".into(),
                ));
            }
            Ok(CacheCategory {
                installed: true,
                bytes: if metadata.is_file() {
                    metadata.len()
                } else {
                    directory_bytes(path).await?
                },
            })
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(CacheCategory {
            installed: false,
            bytes: 0,
        }),
        Err(error) => Err(HelperError::Io(error)),
    }
}

async fn directory_bytes(path: &Path) -> Result<u64, HelperError> {
    let path = path.to_owned();
    tokio::task::spawn_blocking(move || directory_bytes_sync(&path))
        .await
        .map_err(|error| {
            HelperError::BadRequest(format!("cache inspection task failed: {error}"))
        })?
}

fn directory_bytes_sync(path: &Path) -> Result<u64, HelperError> {
    let mut total = 0u64;
    let entries = match std::fs::read_dir(path) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(HelperError::Io(error)),
    };
    for entry in entries {
        let entry_path = entry?.path();
        let metadata = std::fs::symlink_metadata(&entry_path)?;
        if metadata.file_type().is_symlink() {
            return Err(HelperError::BadRequest(
                "managed cache path contains a symlink".into(),
            ));
        }
        total = total.saturating_add(if metadata.is_dir() {
            directory_bytes_sync(&entry_path)?
        } else {
            metadata.len()
        });
    }
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn admission_gate_blocks_cache_clear_while_job_is_active() {
        let config = HelperConfig::from_env().expect("default helper config");
        let cache = HelperCache::new(config);
        let guard = cache.job_guard().await.expect("job admission");
        let model = Arc::new(tokio::sync::RwLock::new(None));
        assert!(matches!(cache.clear(&model).await, Err(HelperError::Busy)));
        drop(guard);
    }

    #[test]
    fn symlink_entries_are_rejected_without_following_them() {
        let root = tempfile::tempdir().expect("temp directory");
        let outside = tempfile::tempdir().expect("outside directory");
        std::fs::write(outside.path().join("secret.txt"), b"secret").expect("outside file");
        let link = root.path().join("linked");
        #[cfg(unix)]
        std::os::unix::fs::symlink(outside.path(), &link).expect("symlink");
        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(outside.path(), &link).expect("symlink");
        assert!(remove_path_sync(root.path()).is_err());
        assert!(outside.path().join("secret.txt").exists());
    }
}
