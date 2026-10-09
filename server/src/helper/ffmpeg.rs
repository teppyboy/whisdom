use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;
use tokio::sync::watch;

use super::cache::HelperCache;
use super::config::HelperConfig;
use super::download::{download_verified_progress, DownloadProgress};
use super::protocol::HelperError;

const FFMPEG_DIR: &str = "ffmpeg";
// Resolved by basename inside the downloaded archive at runtime; the archive's
// directory prefix changes with every ffmpeg release and must never be pinned.
const FFMPEG_EXECUTABLE: &str = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
const FFMPEG_TIMEOUT: Duration = Duration::from_secs(30);
const FFMPEG_SPLIT_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const FFMPEG_VERSION_TIMEOUT: Duration = Duration::from_secs(5);

/// Path of the managed ffmpeg executable when installed.
pub fn installed_executable(config: &HelperConfig) -> PathBuf {
    config.tools_dir().join(FFMPEG_DIR).join(FFMPEG_EXECUTABLE)
}

/// First line of `ffmpeg -version`, e.g. "ffmpeg version 8.1 ...".
pub async fn installed_version(config: &HelperConfig) -> Option<String> {
    let executable = installed_executable(config);
    if !executable.is_file() {
        return None;
    }
    match query_version(&executable).await {
        Ok(version) => Some(version),
        Err(error) => {
            tracing::warn!(error = %error, "managed FFmpeg version query failed");
            None
        }
    }
}

async fn query_version(executable: &Path) -> Result<String, HelperError> {
    let output = tokio::time::timeout(
        FFMPEG_VERSION_TIMEOUT,
        Command::new(executable)
            .arg("-version")
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| HelperError::BadRequest("FFmpeg version check timed out".into()))?
    .map_err(|error| HelperError::BadRequest(format!("FFmpeg launch failed: {error}")))?;
    if !output.status.success() {
        return Err(HelperError::BadRequest(
            "FFmpeg version verification failed".into(),
        ));
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .filter(|line| line.contains("ffmpeg version"))
        .map(ToOwned::to_owned)
        .ok_or_else(|| {
            HelperError::BadRequest("FFmpeg version verification failed".into())
        })
}

pub async fn ensure_ffmpeg(cache: &HelperCache) -> Result<PathBuf, HelperError> {
    ensure_ffmpeg_progress(cache, None).await
}

pub async fn ensure_ffmpeg_progress(
    cache: &HelperCache,
    progress: Option<DownloadProgress>,
) -> Result<PathBuf, HelperError> {
    let root = cache.config().tools_dir().join(FFMPEG_DIR);
    let executable = root.join(FFMPEG_EXECUTABLE);
    if executable.exists() {
        tracing::debug!("using cached FFmpeg");
        verify_executable(&executable, &cache.config().ffmpeg_exe_sha256).await?;
        verify_version(&executable).await?;
        return Ok(executable);
    }

    let archive = cache.config().temp_dir().join("ffmpeg.zip");
    tracing::info!("downloading FFmpeg");
    download_verified_progress(
        cache.client(),
        &cache.config().ffmpeg_url,
        &archive,
        &cache.config().ffmpeg_sha256,
        cache.config().max_download_bytes,
        progress,
    )
    .await?;
    extract_ffmpeg_zip(&archive, &root).await?;
    let _ = tokio::fs::remove_file(archive).await;
    verify_executable(&executable, &cache.config().ffmpeg_exe_sha256).await?;
    verify_version(&executable).await?;
    Ok(executable)
}

async fn extract_ffmpeg_zip(archive: &Path, destination: &Path) -> Result<(), HelperError> {
    let archive = archive.to_owned();
    let destination = destination.to_owned();
    tokio::task::spawn_blocking(move || {
        let file = std::fs::File::open(&archive)?;
        let mut zip =
            zip::ZipArchive::new(file).map_err(|error| std::io::Error::other(error.to_string()))?;
        let temp_destination = destination.with_extension("partial");
        if temp_destination.exists() {
            std::fs::remove_dir_all(&temp_destination)?;
        }
        std::fs::create_dir_all(&temp_destination)?;
        let mut found = false;
        for index in 0..zip.len() {
            let mut entry = zip
                .by_index(index)
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            let Some(name) = entry.enclosed_name().map(|path| path.to_owned()) else {
                return Err(std::io::Error::other("archive path traversal"));
            };
            if !is_ffmpeg_entry(&name) {
                continue;
            }
            let output = temp_destination.join(FFMPEG_EXECUTABLE);
            let mut writer = std::fs::File::create(&output)?;
            std::io::copy(&mut entry, &mut writer)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&output, std::fs::Permissions::from_mode(0o755))?;
            }
            found = true;
            break;
        }
        if !found {
            return Err(std::io::Error::other("archive does not contain ffmpeg.exe"));
        }
        if destination.exists() {
            std::fs::remove_dir_all(&destination)?;
        }
        std::fs::rename(temp_destination, destination)?;
        Ok::<(), std::io::Error>(())
    })
    .await
    .map_err(|error| HelperError::BadRequest(format!("FFmpeg extraction failed: {error}")))??;
    Ok(())
}

async fn verify_executable(executable: &Path, expected_sha256: &str) -> Result<(), HelperError> {
    if !super::download::verify_file_sha256(executable, expected_sha256).await? {
        return Err(HelperError::BadRequest(
            "FFmpeg executable checksum mismatch".into(),
        ));
    }
    Ok(())
}

async fn verify_version(executable: &Path) -> Result<(), HelperError> {
    let output = tokio::time::timeout(
        FFMPEG_TIMEOUT,
        Command::new(executable)
            .arg("-version")
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| HelperError::BadRequest("FFmpeg version check timed out".into()))?
    .map_err(|error| HelperError::BadRequest(format!("FFmpeg launch failed: {error}")))?;
    if !output.status.success()
        || !String::from_utf8_lossy(&output.stdout).contains("ffmpeg version")
    {
        return Err(HelperError::BadRequest(
            "FFmpeg version verification failed".into(),
        ));
    }
    Ok(())
}

fn is_ffmpeg_entry(path: &Path) -> bool {
    path.file_name().is_some_and(|name| name == FFMPEG_EXECUTABLE)
}

pub async fn split_to_wav_chunks(
    executable: &Path,
    input: &Path,
    output_dir: &Path,
    chunk_seconds: u64,
    mut cancel_rx: watch::Receiver<bool>,
) -> Result<Vec<PathBuf>, HelperError> {
    tokio::fs::create_dir_all(output_dir).await?;
    let pattern = output_dir.join("chunk-%05d.wav");
    if *cancel_rx.borrow() {
        return Err(HelperError::BadRequest("cancelled".into()));
    }

    let mut child = Command::new(executable)
        .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
        .arg(input)
        .args([
            "-map",
            "0:a:0",
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            "-f",
            "segment",
            "-segment_time",
        ])
        .arg(chunk_seconds.to_string())
        .args(["-reset_timestamps", "1"])
        .arg(&pattern)
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| HelperError::BadRequest(format!("FFmpeg split failed: {error}")))?;
    let deadline = tokio::time::Instant::now() + FFMPEG_SPLIT_TIMEOUT;
    loop {
        tokio::select! {
        status = child.wait() => {
        let status = status.map_err(|error| HelperError::BadRequest(format!("FFmpeg split failed: {error}")))?;
                        if !status.success() {
                            return Err(HelperError::BadRequest("FFmpeg split exited with an error".into()));
                        }
                        break;
                    }
                    _ = cancel_rx.changed() => {
                        if *cancel_rx.borrow() {
                            let _ = child.kill().await;
                            return Err(HelperError::BadRequest("cancelled".into()));
                        }
                    }
                    _ = tokio::time::sleep_until(deadline) => {
                        let _ = child.kill().await;
                        return Err(HelperError::BadRequest("FFmpeg split timed out".into()));
                    }
                }
    }

    let mut chunks = Vec::new();
    let mut entries = tokio::fs::read_dir(output_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) == Some("wav") {
            chunks.push(path);
        }
    }
    chunks.sort();
    if chunks.is_empty() {
        return Err(HelperError::BadRequest(
            "FFmpeg produced no audio chunks".into(),
        ));
    }
    Ok(chunks)
}

pub async fn convert_to_wav(
    executable: &Path,
    input: &Path,
    output: &Path,
    mut cancel_rx: watch::Receiver<bool>,
) -> Result<(), HelperError> {
    if *cancel_rx.borrow() {
        return Err(HelperError::BadRequest("cancelled".into()));
    }

    let mut child = Command::new(executable)
        .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
        .arg(input)
        .args(["-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1"])
        .arg(output)
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| HelperError::BadRequest(format!("FFmpeg conversion failed: {error}")))?;
    let deadline = tokio::time::Instant::now() + FFMPEG_TIMEOUT;
    loop {
        tokio::select! {
            status = child.wait() => {
                let status = status.map_err(|error| HelperError::BadRequest(format!("FFmpeg conversion failed: {error}")))?;
                return if status.success() {
                    tracing::debug!("FFmpeg conversion complete");
                    Ok(())
                } else {
                    Err(HelperError::BadRequest("FFmpeg exited with an error".into()))
                };
            }
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() {
                    let _ = child.kill().await;
                    return Err(HelperError::BadRequest("cancelled".into()));
                }
            }
            _ = tokio::time::sleep_until(deadline) => {
                let _ = child.kill().await;
                return Err(HelperError::BadRequest("FFmpeg conversion timed out".into()));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "macos")]
    #[tokio::test]
    #[ignore = "requires network and WHISDOM_REAL_FFMPEG=1"]
    async fn ffmpeg_downloads_latest_and_verifies() {
        if std::env::var_os("WHISDOM_REAL_FFMPEG").is_none() {
            return;
        }
        let config = crate::helper::config::HelperConfig::from_env().expect("helper config");
        let cache = HelperCache::new(config);
        let executable = ensure_ffmpeg(&cache).await.expect("ffmpeg installed");
        assert!(executable.is_file());
    }

    #[tokio::test]
    async fn pre_cancelled_conversion_does_not_start_ffmpeg() {
        let (_sender, receiver) = watch::channel(true);
        let error = convert_to_wav(
            Path::new("missing-ffmpeg.exe"),
            Path::new("missing-input.mkv"),
            Path::new("missing-output.wav"),
            receiver,
        )
        .await
        .expect_err("pre-cancelled conversion should stop before spawning");
        assert_eq!(error.to_string(), "helper bad request: cancelled");

        let (_sender, receiver) = watch::channel(true);
        let error = split_to_wav_chunks(
            Path::new("missing-ffmpeg.exe"),
            Path::new("missing-input.mkv"),
            Path::new("missing-output"),
            600,
            receiver,
        )
        .await
        .expect_err("pre-cancelled split should stop before spawning");
        assert_eq!(error.to_string(), "helper bad request: cancelled");
    }

    #[test]
    fn resolves_the_ffmpeg_entry_by_basename_at_runtime() {
        assert!(is_ffmpeg_entry(Path::new(FFMPEG_EXECUTABLE)));
        let other = if cfg!(windows) { "ffmpeg" } else { "ffmpeg.exe" };
        assert!(is_ffmpeg_entry(Path::new(&format!(
            "ffmpeg-n8.1-latest-win64-gpl-8.1/bin/{FFMPEG_EXECUTABLE}"
        ))));
        assert!(!is_ffmpeg_entry(Path::new(other)));
        assert!(!is_ffmpeg_entry(Path::new("ffprobe.exe")));
        assert!(!is_ffmpeg_entry(Path::new("ffprobe")));
    }
}
