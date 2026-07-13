use std::path::Path;
use std::process::Stdio;

use tokio::process::Command;
use tokio::sync::watch;

use crate::config::Config;
use crate::error::AppError;

#[allow(dead_code)]
pub async fn get_duration(input: &Path, config: &Config) -> Result<f64, AppError> {
    let output = Command::new(config.ffmpeg_path())
        .args([
            "-v",
            "quiet",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
        ])
        .arg(
            input
                .to_str()
                .ok_or_else(|| AppError::Internal("invalid input path".into()))?,
        )
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|e| AppError::Internal(format!("ffprobe failed: {e}")))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let duration: f64 = stdout
        .trim()
        .parse()
        .map_err(|_| AppError::Internal("failed to parse duration".into()))?;

    Ok(duration)
}

pub async fn extract_audio(
    input: &Path,
    output: &Path,
    config: &Config,
    cancel_rx: &watch::Receiver<bool>,
) -> Result<(), AppError> {
    let input_str = input
        .to_str()
        .ok_or_else(|| AppError::Internal("invalid input path".into()))?;
    let output_str = output
        .to_str()
        .ok_or_else(|| AppError::Internal("invalid output path".into()))?;

    let mut child = Command::new(config.ffmpeg_path())
        .args([
            "-y",
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
        ])
        .arg("-i")
        .arg(input_str)
        .arg(output_str)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| AppError::Internal(format!("failed to spawn ffmpeg: {e}")))?;

    let status = loop {
        if *cancel_rx.borrow() {
            child.kill().await.ok();
            child.wait().await.ok();
            return Err(AppError::BadRequest("cancelled".into()));
        }
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) => tokio::time::sleep(std::time::Duration::from_millis(200)).await,
            Err(e) => return Err(AppError::Internal(format!("ffmpeg wait error: {e}"))),
        }
    };

    if !status.success() {
        return Err(AppError::Internal("ffmpeg exited with non-zero status".into()));
    }

    Ok(())
}
