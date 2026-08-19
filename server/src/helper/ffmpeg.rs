use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;
use tokio::sync::watch;

use super::cache::HelperCache;
use super::download::download_verified;
use super::protocol::HelperError;

const FFMPEG_DIR: &str = "ffmpeg-n8.1.2-44-g7c533d0f86-win64-gpl-8.1";
const FFMPEG_ENTRY: &str = "ffmpeg-n8.1.2-44-g7c533d0f86-win64-gpl-8.1/bin/ffmpeg.exe";
const FFMPEG_TIMEOUT: Duration = Duration::from_secs(30);

pub async fn ensure_ffmpeg(cache: &HelperCache) -> Result<PathBuf, HelperError> {
    let root = cache.config().tools_dir().join(FFMPEG_DIR);
    let executable = root.join("ffmpeg.exe");
    if executable.exists() {
        tracing::debug!("using cached FFmpeg");
        verify_executable(&executable, &cache.config().ffmpeg_exe_sha256).await?;
        verify_version(&executable).await?;
        return Ok(executable);
    }

    let archive = cache.config().temp_dir().join("ffmpeg.zip");
    tracing::info!("downloading FFmpeg");
    download_verified(
        cache.client(),
        &cache.config().ffmpeg_url,
        &archive,
        &cache.config().ffmpeg_sha256,
        cache.config().max_download_bytes,
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
            if !is_expected_entry(&name) {
                continue;
            }
            let output = temp_destination.join("ffmpeg.exe");
            let mut writer = std::fs::File::create(&output)?;
            std::io::copy(&mut entry, &mut writer)?;
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

fn is_expected_entry(path: &Path) -> bool {
    path.to_string_lossy().replace('\\', "/") == FFMPEG_ENTRY
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
    }

    #[test]
    fn accepts_only_the_pinned_ffmpeg_archive_entry() {
        assert!(is_expected_entry(Path::new(FFMPEG_ENTRY)));
        assert!(is_expected_entry(Path::new(
            "ffmpeg-n8.1.2-44-g7c533d0f86-win64-gpl-8.1\\bin\\ffmpeg.exe"
        )));
        assert!(!is_expected_entry(Path::new("bin/ffmpeg.exe")));
        assert!(!is_expected_entry(Path::new(
            "ffmpeg-n8.1.2-44-g7c533d0f86-win64-gpl-8.1/../ffmpeg.exe"
        )));
    }
}
