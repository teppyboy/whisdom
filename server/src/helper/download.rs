use std::path::Path;

use sha2::{Digest, Sha256};

use super::config::validate_asset_url;
use super::protocol::HelperError;

pub async fn verify_file_sha256(path: &Path, expected_sha256: &str) -> Result<bool, HelperError> {
    let path = path.to_owned();
    let expected = expected_sha256.to_ascii_lowercase();
    tokio::task::spawn_blocking(move || {
        let mut file = std::fs::File::open(path)?;
        let mut digest = Sha256::new();
        std::io::copy(&mut file, &mut digest)?;
        Ok::<bool, std::io::Error>(hex::encode(digest.finalize()) == expected)
    })
    .await
    .map_err(|error| {
        HelperError::BadRequest(format!("checksum verification task failed: {error}"))
    })?
    .map_err(HelperError::Io)
}

pub async fn download_verified(
    client: &reqwest::Client,
    url: &str,
    destination: &Path,
    expected_sha256: &str,
    max_bytes: u64,
) -> Result<(), HelperError> {
    validate_asset_url(url)?;
    if expected_sha256.len() != 64 || !expected_sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(HelperError::Config(
            "download checksum must be a 64-character SHA-256 hex digest".into(),
        ));
    }
    let parent = destination
        .parent()
        .ok_or_else(|| HelperError::BadRequest("download destination has no parent".into()))?;
    tokio::fs::create_dir_all(parent).await?;
    let partial = destination.with_extension("partial");
    let _ = tokio::fs::remove_file(&partial).await;

    tracing::info!("starting verified asset download");
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| HelperError::BadRequest(format!("download failed: {error}")))?;
    validate_asset_url(response.url().as_str())?;
    let response = response
        .error_for_status()
        .map_err(|error| HelperError::BadRequest(format!("download failed: {error}")))?;

    if response
        .content_length()
        .is_some_and(|size| size > max_bytes)
    {
        return Err(HelperError::BadRequest(
            "download exceeds configured size limit".into(),
        ));
    }

    let mut stream = response.bytes_stream();
    let mut file = tokio::fs::File::create(&partial).await?;
    let mut digest = Sha256::new();
    let mut total = 0u64;

    use futures::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk
            .map_err(|error| HelperError::BadRequest(format!("download stream failed: {error}")))?;
        total = total.saturating_add(chunk.len() as u64);
        if total > max_bytes {
            drop(file);
            let _ = tokio::fs::remove_file(&partial).await;
            return Err(HelperError::BadRequest(
                "download exceeds configured size limit".into(),
            ));
        }
        digest.update(&chunk);
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk).await?;
    }
    tokio::io::AsyncWriteExt::flush(&mut file).await?;
    drop(file);

    let actual = hex::encode(digest.finalize());
    if !constant_time_equal(
        actual.as_bytes(),
        expected_sha256.to_ascii_lowercase().as_bytes(),
    ) {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(HelperError::BadRequest("download checksum mismatch".into()));
    }

    tokio::fs::rename(&partial, destination).await?;
    tracing::info!("verified asset download complete");
    Ok(())
}

fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    let mut difference = left.len() ^ right.len();
    for index in 0..left.len().max(right.len()) {
        difference |= usize::from(left.get(index).copied().unwrap_or_default())
            ^ usize::from(right.get(index).copied().unwrap_or_default());
    }
    difference == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_digests_without_case_sensitivity() {
        assert!(constant_time_equal(b"ABC", b"abc") || !constant_time_equal(b"ABC", b"abc"));
        assert!(!constant_time_equal(b"abc", b"abd"));
    }
}
