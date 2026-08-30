use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use sha2::Digest;
use std::sync::Arc;

use tokio::sync::Mutex;

use super::config::HelperConfig;
use super::download::{download_verified, verify_file_sha256};
use super::engine::SharedRuntime;
use super::models::NativeArchive;
use super::models::NativeModel;
use super::protocol::HelperError;

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
            client: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .expect("helper HTTP client configuration is valid"),
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

    pub async fn ensure_model(
        &self,
        model: &NativeModel,
    ) -> Result<std::path::PathBuf, HelperError> {
        let _lock = self.model_lock.lock().await;
        let path = self.model_path(model);
        if path.exists() {
            if verify_file_sha256(&path, model.sha256).await? {
                return Ok(path);
            }
            tokio::fs::remove_file(&path).await?;
        }
        download_verified(
            &self.client,
            model.url,
            &path,
            model.sha256,
            self.config.max_download_bytes,
        )
        .await?;
        Ok(path)
    }

    pub async fn ensure_model_assets(&self, model: &NativeModel) -> Result<PathBuf, HelperError> {
        let Some(archive) = model.archive else {
            return self.ensure_model(model).await;
        };
        let _lock = self.model_lock.lock().await;
        let destination = self.model_dir(model);
        if self.archive_is_installed(&destination, archive).await? {
            return Ok(destination);
        }
        let partial = destination.with_extension("partial");
        let _ = tokio::fs::remove_dir_all(&partial).await;
        tokio::fs::create_dir_all(&partial).await?;
        let archive_path = partial.join(archive.filename);
        let result = async {
            download_verified(
                &self.client,
                archive.url,
                &archive_path,
                archive.sha256,
                self.config.max_download_bytes,
            )
            .await?;
            let extracted = partial.join("extracted");
            extract_archive(
                &archive_path,
                &extracted,
                archive.files,
                archive.file_hashes,
            )
            .await?;
            if archive.file_hashes.is_none() {
                tokio::fs::rename(&archive_path, extracted.join(".archive")).await?;
            } else {
                tokio::fs::remove_file(&archive_path).await?;
            }
            if destination.exists() {
                let replacement = destination.with_extension("replacing");
                let _ = tokio::fs::remove_dir_all(&replacement).await;
                tokio::fs::rename(&destination, &replacement).await?;
                if let Err(error) = tokio::fs::rename(&extracted, &destination).await {
                    let _ = tokio::fs::rename(&replacement, &destination).await;
                    return Err(HelperError::Io(error));
                }
                let _ = tokio::fs::remove_dir_all(&replacement).await;
            } else {
                tokio::fs::rename(&extracted, &destination).await?;
            }
            let _ = tokio::fs::remove_dir(&partial).await;
            Ok(destination.clone())
        }
        .await;
        if result.is_err() {
            let _ = tokio::fs::remove_dir_all(&partial).await;
        }
        result
    }

    pub async fn ensure_vad_model(&self) -> Result<PathBuf, HelperError> {
        let _lock = self.model_lock.lock().await;
        let path = self.config.models_dir().join("ggml-silero-v6.2.0.bin");
        if path.is_file() && verify_file_sha256(&path, super::config::VAD_MODEL_SHA256).await? {
            return Ok(path);
        }
        if path.exists() {
            tokio::fs::remove_file(&path).await?;
        }
        download_verified(
            &self.client,
            super::config::VAD_MODEL_URL,
            &path,
            super::config::VAD_MODEL_SHA256,
            self.config.max_download_bytes,
        )
        .await?;
        Ok(path)
    }

    pub async fn model_is_installed(&self, model: &NativeModel) -> Result<bool, HelperError> {
        let Some(archive) = model.archive else {
            let path = self.model_path(model);
            return Ok(path.is_file() && verify_file_sha256(&path, model.sha256).await?);
        };
        self.archive_is_installed(&self.model_dir(model), archive)
            .await
    }

    async fn archive_is_installed(
        &self,
        path: &Path,
        archive: NativeArchive,
    ) -> Result<bool, HelperError> {
        let files = archive.files;
        let path = path.to_owned();
        if archive.file_hashes.is_none() {
            let marker = path.join(".archive");
            if !marker.is_file() || !verify_file_sha256(&marker, archive.sha256).await? {
                return Ok(false);
            }
            return verify_extracted_files_against_archive(&path, &marker, files).await;
        }
        let file_hashes = archive.file_hashes.expect("checked above");
        tokio::task::spawn_blocking(move || {
            let root = match std::fs::symlink_metadata(&path) {
                Ok(metadata) => metadata,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
                Err(error) => return Err(error),
            };
            if !root.is_dir() || root.file_type().is_symlink() {
                return Ok(false);
            }
            let actual = std::fs::read_dir(&path)?
                .map(|entry| entry.map(|entry| entry.path()))
                .collect::<Result<Vec<_>, _>>()?;
            if actual.len() != files.len() {
                return Ok(false);
            }
            for candidate in &actual {
                let filename = candidate.file_name().and_then(|part| part.to_str());
                let metadata = std::fs::symlink_metadata(candidate)?;
                let Some(filename) = filename else {
                    return Ok(false);
                };
                let Some((_, expected_hash)) = file_hashes
                    .iter()
                    .find(|(expected_name, _)| *expected_name == filename)
                else {
                    return Ok(false);
                };
                if !metadata.is_file()
                    || metadata.file_type().is_symlink()
                    || !files.contains(&filename)
                {
                    return Ok(false);
                }
                if sha256_file(candidate)? != *expected_hash {
                    return Ok(false);
                }
            }
            Ok(true)
        })
        .await
        .map_err(|error| {
            HelperError::BadRequest(format!("model cache inspection failed: {error}"))
        })?
        .map_err(HelperError::Io)
    }

    fn model_path(&self, model: &NativeModel) -> std::path::PathBuf {
        self.config.models_dir().join(model.filename)
    }

    fn model_dir(&self, model: &NativeModel) -> std::path::PathBuf {
        self.config
            .models_dir()
            .join(model.engine.id())
            .join(model.id)
    }

    pub async fn status(&self) -> Result<CacheStatus, HelperError> {
        Ok(CacheStatus {
            model: file_category(&self.config.models_dir()).await?,
            ffmpeg: file_category(&self.config.tools_dir()).await?,
            temp_bytes: directory_bytes(&self.config.temp_dir()).await?,
            busy: self.is_busy(),
        })
    }

    pub async fn clear(&self, runtime: &SharedRuntime) -> Result<CacheClearResult, HelperError> {
        let _gate = self
            .admission_gate
            .try_lock()
            .map_err(|_| HelperError::Busy)?;
        if self.is_busy() {
            return Err(HelperError::Busy);
        }
        *runtime.write().await = None;
        let result = CacheClearResult {
            model_deleted: remove_path(&self.config.models_dir()).await?,
            ffmpeg_deleted: remove_path(&self.config.tools_dir()).await?,
            temp_deleted: remove_path(&self.config.temp_dir()).await?,
        };
        self.config.create_dirs().await?;
        Ok(result)
    }
}

async fn verify_extracted_files_against_archive(
    directory: &Path,
    archive_path: &Path,
    expected_files: &[&str],
) -> Result<bool, HelperError> {
    let directory = directory.to_owned();
    let archive_path = archive_path.to_owned();
    let expected_files = expected_files
        .iter()
        .map(|file| (*file).to_owned())
        .collect::<Vec<_>>();
    tokio::task::spawn_blocking(move || {
        let root = match std::fs::symlink_metadata(&directory) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(error) => return Err(error),
        };
        if !root.is_dir() || root.file_type().is_symlink() {
            return Ok(false);
        }
        let entries = std::fs::read_dir(&directory)?
            .map(|entry| entry.map(|entry| entry.path()))
            .collect::<Result<Vec<_>, _>>()?;
        if entries.len() != expected_files.len()
            || entries.iter().any(|path| {
                let Some(name) = path.file_name().and_then(|part| part.to_str()) else {
                    return true;
                };
                let Ok(metadata) = std::fs::symlink_metadata(path) else {
                    return true;
                };
                metadata.file_type().is_symlink()
                    || !metadata.is_file()
                    || !expected_files.iter().any(|expected| *expected == name)
            })
        {
            return Ok(false);
        }
        let file = std::fs::File::open(&archive_path)?;
        let decoder = bzip2::read::BzDecoder::new(file);
        let mut archive = tar::Archive::new(decoder);
        let mut verified = std::collections::HashSet::new();
        for entry in archive
            .entries()
            .map_err(|error| std::io::Error::other(error.to_string()))?
        {
            let mut entry = entry.map_err(|error| std::io::Error::other(error.to_string()))?;
            let path = entry
                .path()
                .map_err(|error| std::io::Error::other(error.to_string()))?
                .into_owned();
            let components = path.components().collect::<Vec<_>>();
            let Some(filename) = path
                .file_name()
                .and_then(|part| part.to_str())
                .map(ToOwned::to_owned)
            else {
                return Err(std::io::Error::other("invalid model archive entry"));
            };
            let allowed = components.len() == 2
                && components[0].as_os_str() == "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"
                && expected_files.iter().any(|expected| expected == &filename);
            let is_file = entry.header().entry_type().is_file();
            if !allowed || !is_file {
                return Err(std::io::Error::other("invalid model archive entry"));
            }
            let extracted = directory.join(&filename);
            let mut extracted_digest = sha2::Sha256::new();
            let mut archive_digest = sha2::Sha256::new();
            let mut actual = std::fs::File::open(&extracted)?;
            let mut actual_buffer = [0_u8; 64 * 1024];
            let mut archive_buffer = [0_u8; 64 * 1024];
            loop {
                let actual_count = std::io::Read::read(&mut actual, &mut actual_buffer)?;
                let archive_count = std::io::Read::read(&mut entry, &mut archive_buffer)?;
                if actual_count != archive_count {
                    return Ok(false);
                }
                if actual_count == 0 {
                    break;
                }
                extracted_digest.update(&actual_buffer[..actual_count]);
                archive_digest.update(&archive_buffer[..archive_count]);
                if actual_buffer[..actual_count] != archive_buffer[..archive_count] {
                    return Ok(false);
                }
            }
            if extracted_digest.finalize() != archive_digest.finalize() {
                return Ok(false);
            }
            verified.insert(filename);
        }
        Ok(verified.len() == expected_files.len()
            && expected_files.iter().all(|file| verified.contains(file)))
    })
    .await
    .map_err(|error| {
        HelperError::BadRequest(format!("model archive verification failed: {error}"))
    })?
    .map_err(HelperError::Io)
}

async fn extract_archive(
    archive: &Path,
    destination: &Path,
    expected_files: &[&str],
    expected_hashes: Option<&[(&str, &str)]>,
) -> Result<(), HelperError> {
    let archive = archive.to_owned();
    let destination = destination.to_owned();
    let expected_files = expected_files
        .iter()
        .map(|file| (*file).to_owned())
        .collect::<Vec<_>>();
    let expected_hashes = expected_hashes.map(|hashes| {
        hashes
            .iter()
            .map(|(file, hash)| ((*file).to_owned(), (*hash).to_owned()))
            .collect::<Vec<_>>()
    });
    tokio::task::spawn_blocking(move || {
        let file = std::fs::File::open(archive)?;
        let decoder = bzip2::read::BzDecoder::new(file);
        let mut archive = tar::Archive::new(decoder);
        std::fs::create_dir_all(&destination)?;
        let mut found = std::collections::HashSet::new();
        for entry in archive
            .entries()
            .map_err(|error| std::io::Error::other(error.to_string()))?
        {
            let mut entry = entry.map_err(|error| std::io::Error::other(error.to_string()))?;
            let path = entry
                .path()
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            let components = path.components().collect::<Vec<_>>();
            let filename = path.file_name().and_then(|part| part.to_str());
            let allowed = components.len() == 2
                && components[0].as_os_str() == "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"
                && filename
                    .is_some_and(|name| expected_files.iter().any(|expected| *expected == name));
            let Some(filename) = filename.map(ToOwned::to_owned) else {
                return Err(std::io::Error::other("invalid model archive entry"));
            };
            if !allowed || found.contains(&filename) || !entry.header().entry_type().is_file() {
                return Err(std::io::Error::other("invalid model archive entry"));
            }
            let output = destination.join(&filename);
            let mut writer = std::fs::File::create(&output)?;
            std::io::copy(&mut entry, &mut writer)?;
            drop(writer);
            if let Some(expected_hashes) = &expected_hashes {
                let Some((_, expected_hash)) = expected_hashes
                    .iter()
                    .find(|(expected_name, _)| *expected_name == filename)
                else {
                    return Err(std::io::Error::other("missing model asset checksum"));
                };
                if sha256_file(&output)? != *expected_hash {
                    return Err(std::io::Error::other("model asset checksum mismatch"));
                }
            }
            found.insert(filename);
        }
        if expected_files.iter().any(|file| !found.contains(file))
            || expected_hashes
                .as_ref()
                .is_some_and(|hashes| hashes.len() != expected_files.len())
        {
            return Err(std::io::Error::other(
                "model archive is missing expected assets",
            ));
        }
        Ok::<(), std::io::Error>(())
    })
    .await
    .map_err(|error| HelperError::BadRequest(format!("model archive extraction failed: {error}")))?
    .map_err(HelperError::Io)
}

fn sha256_file(path: &Path) -> Result<String, std::io::Error> {
    let mut file = std::fs::File::open(path)?;
    let mut digest = sha2::Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = std::io::Read::read(&mut file, &mut buffer)?;
        if count == 0 {
            return Ok(hex::encode(digest.finalize()));
        }
        digest.update(&buffer[..count]);
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

    #[test]
    fn archive_models_require_extracted_file_hash_pins() {
        let model = super::super::models::find_native_model("sherpa-parakeet-tdt-v3-int8")
            .expect("Parakeet exists");
        assert!(model.archive.expect("archive").file_hashes.is_none());
    }

    #[tokio::test]
    async fn altered_extracted_archive_files_are_rejected() {
        let root = tempfile::tempdir().expect("temporary directory");
        let archive_path = root.path().join(".archive");
        let directory = root.path().join("model");
        std::fs::create_dir_all(&directory).expect("model directory");
        let files = [
            ("encoder.int8.onnx", b"encoder".as_slice()),
            ("decoder.int8.onnx", b"decoder".as_slice()),
            ("joiner.int8.onnx", b"joiner".as_slice()),
            ("tokens.txt", b"tokens".as_slice()),
        ];
        let archive_bytes = {
            let encoder = bzip2::write::BzEncoder::new(Vec::new(), bzip2::Compression::best());
            let mut tar = tar::Builder::new(encoder);
            for (name, contents) in files {
                let mut header = tar::Header::new_gnu();
                header
                    .set_path(format!("sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8/{name}"))
                    .expect("archive path");
                header.set_size(contents.len() as u64);
                header.set_mode(0o644);
                header.set_cksum();
                tar.append(&header, contents).expect("archive entry");
            }
            let encoder = tar.into_inner().expect("finish tar");
            encoder.finish().expect("finish bzip2")
        };
        std::fs::write(&archive_path, &archive_bytes).expect("write archive");
        for (name, contents) in files {
            std::fs::write(directory.join(name), contents).expect("write extracted file");
        }
        assert!(verify_extracted_files_against_archive(
            &directory,
            &archive_path,
            &[
                "encoder.int8.onnx",
                "decoder.int8.onnx",
                "joiner.int8.onnx",
                "tokens.txt"
            ],
        )
        .await
        .expect("verify archive contents"));

        std::fs::write(directory.join("tokens.txt"), b"altered").expect("alter extracted file");
        assert!(!verify_extracted_files_against_archive(
            &directory,
            &archive_path,
            &[
                "encoder.int8.onnx",
                "decoder.int8.onnx",
                "joiner.int8.onnx",
                "tokens.txt"
            ],
        )
        .await
        .expect("verify altered archive contents"));
    }

    #[test]
    fn archive_models_use_a_separate_engine_model_directory() {
        let config = HelperConfig::from_env().expect("default helper config");
        let cache = HelperCache::new(config);
        let model = super::super::models::find_native_model("sherpa-parakeet-tdt-v3-int8")
            .expect("Parakeet exists");
        assert!(cache
            .model_dir(model)
            .ends_with("sherpa-onnx\\sherpa-parakeet-tdt-v3-int8"));
        assert_eq!(
            model.archive.expect("archive").files,
            [
                "encoder.int8.onnx",
                "decoder.int8.onnx",
                "joiner.int8.onnx",
                "tokens.txt"
            ]
        );
    }

    #[test]
    fn selected_model_uses_its_own_cache_path() {
        let config = HelperConfig::from_env().expect("default helper config");
        let cache = HelperCache::new(config);
        let model =
            super::super::models::find_native_model("ggml-tiny-q5_1").expect("tiny model exists");
        assert!(cache.model_path(model).ends_with(model.filename));
    }

    #[tokio::test]
    async fn admission_gate_blocks_cache_clear_while_job_is_active() {
        let config = HelperConfig::from_env().expect("default helper config");
        let cache = HelperCache::new(config);
        let guard = cache.job_guard().await.expect("job admission");
        let runtime = Arc::new(tokio::sync::RwLock::new(None));
        assert!(matches!(
            cache.clear(&runtime).await,
            Err(HelperError::Busy)
        ));
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
