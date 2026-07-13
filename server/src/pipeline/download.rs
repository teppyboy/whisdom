use std::path::{Path, PathBuf};
use std::process::Stdio;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::watch;

use crate::config::Config;
use crate::error::AppError;

pub async fn download_url(
    url: &str,
    work_dir: &Path,
    config: &Config,
    cancel_rx: &watch::Receiver<bool>,
) -> Result<PathBuf, AppError> {
    tokio::fs::create_dir_all(work_dir).await?;

    let mut child = Command::new(config.ytdlp_path())
        .args([
            "--no-playlist",
            "--no-warnings",
            "--newline",
            "-o",
            "source.%(ext)s",
            "--write-info-json",
        ])
        .arg(url)
        .current_dir(work_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| AppError::Internal(format!("failed to spawn yt-dlp: {e}")))?;

    let stderr = child.stderr.take().unwrap();
    let mut reader = BufReader::new(stderr).lines();

    let handle = tokio::spawn(async move {
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = line;
        }
    });

    let status = loop {
        if *cancel_rx.borrow() {
            child.kill().await.ok();
            child.wait().await.ok();
            return Err(AppError::BadRequest("cancelled".into()));
        }
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) => tokio::time::sleep(std::time::Duration::from_millis(200)).await,
            Err(e) => return Err(AppError::Internal(format!("yt-dlp wait error: {e}"))),
        }
    };

    handle.await.ok();

    if !status.success() {
        return Err(AppError::Internal("yt-dlp exited with non-zero status".into()));
    }

    let found = find_downloaded_file(work_dir).await?;

    Ok(found)
}

async fn find_downloaded_file(work_dir: &Path) -> Result<PathBuf, AppError> {
    let mut dir = tokio::fs::read_dir(work_dir).await?;
    while let Some(entry) = dir.next_entry().await? {
        let path = entry.path();
        if path.is_file() {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");
            if ext != "json" && ext != "part" {
                return Ok(path);
            }
        }
    }
    Err(AppError::Internal("no downloaded file found".into()))
}
