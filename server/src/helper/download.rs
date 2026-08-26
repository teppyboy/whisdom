use std::path::Path;

use reqwest::header::LOCATION;
use sha2::{Digest, Sha256};

use super::config::validate_asset_url;
use super::protocol::HelperError;

const MAX_REDIRECTS: usize = 5;

pub async fn verify_file_sha256(path: &Path, expected_sha256: &str) -> Result<bool, HelperError> {
    let path = path.to_owned();
    let expected = expected_sha256.to_ascii_lowercase();
    tokio::task::spawn_blocking(move || {
        let mut file = std::fs::File::open(path)?;
        let mut digest = Sha256::new();
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let read = std::io::Read::read(&mut file, &mut buffer)?;
            if read == 0 {
                break;
            }
            digest.update(&buffer[..read]);
        }
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
    let initial = reqwest::Url::parse(url)
        .map_err(|_| HelperError::Config("asset URL must be valid HTTPS".into()))?;
    validate_asset_url(initial.as_str())?;
    if expected_sha256.len() != 64 || !expected_sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(HelperError::Config(
            "download checksum must be a 64-character SHA-256 hex digest".into(),
        ));
    }
    download_verified_with_validator(
        client,
        initial,
        destination,
        expected_sha256,
        max_bytes,
        validate_asset_url,
    )
    .await
}

async fn download_verified_with_validator<F>(
    client: &reqwest::Client,
    initial: reqwest::Url,
    destination: &Path,
    expected_sha256: &str,
    max_bytes: u64,
    validate_url: F,
) -> Result<(), HelperError>
where
    F: Fn(&str) -> Result<(), HelperError>,
{
    let parent = destination
        .parent()
        .ok_or_else(|| HelperError::BadRequest("download destination has no parent".into()))?;
    tokio::fs::create_dir_all(parent).await?;
    let partial = destination.with_extension("partial");
    let _ = tokio::fs::remove_file(&partial).await;

    tracing::info!("starting verified asset download");
    let response = follow_verified_redirects(client, initial, validate_url).await?;
    let result = stream_verified_response(response, &partial, expected_sha256, max_bytes).await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(&partial).await;
    }
    result?;

    tokio::fs::rename(&partial, destination).await?;
    tracing::info!("verified asset download complete");
    Ok(())
}

async fn follow_verified_redirects<F>(
    client: &reqwest::Client,
    mut current: reqwest::Url,
    validate_url: F,
) -> Result<reqwest::Response, HelperError>
where
    F: Fn(&str) -> Result<(), HelperError>,
{
    for redirects in 0..=MAX_REDIRECTS {
        validate_url(current.as_str())?;
        let response = client
            .get(current.clone())
            .send()
            .await
            .map_err(|_| HelperError::BadRequest("download request failed".into()))?;

        if response.status().is_redirection() {
            if redirects == MAX_REDIRECTS {
                return Err(HelperError::BadRequest(
                    "download redirected too many times".into(),
                ));
            }
            current = redirect_target(&current, response.headers().get(LOCATION), &validate_url)?;
            continue;
        }

        return response.error_for_status().map_err(|_| {
            HelperError::BadRequest("download returned an unsuccessful status".into())
        });
    }
    unreachable!("redirect loop returns at the maximum redirect count")
}

fn redirect_target<F>(
    current: &reqwest::Url,
    location: Option<&reqwest::header::HeaderValue>,
    validate_url: F,
) -> Result<reqwest::Url, HelperError>
where
    F: Fn(&str) -> Result<(), HelperError>,
{
    let location = location
        .ok_or_else(|| HelperError::BadRequest("download redirect missing location".into()))?
        .to_str()
        .map_err(|_| HelperError::BadRequest("download redirect has invalid location".into()))?;
    let target = current
        .join(location)
        .map_err(|_| HelperError::BadRequest("download redirect has invalid location".into()))?;
    validate_url(target.as_str())?;
    Ok(target)
}

async fn stream_verified_response(
    response: reqwest::Response,
    partial: &Path,
    expected_sha256: &str,
    max_bytes: u64,
) -> Result<(), HelperError> {
    if response
        .content_length()
        .is_some_and(|size| size > max_bytes)
    {
        return Err(HelperError::BadRequest(
            "download exceeds configured size limit".into(),
        ));
    }

    let mut stream = response.bytes_stream();
    let mut file = tokio::fs::File::create(partial).await?;
    let mut digest = Sha256::new();
    let mut total = 0u64;

    use futures::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| HelperError::BadRequest("download stream failed".into()))?;
        total = total.saturating_add(chunk.len() as u64);
        if total > max_bytes {
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
        return Err(HelperError::BadRequest("download checksum mismatch".into()));
    }
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
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use axum::extract::State;
    use axum::http::{header, StatusCode, Uri};
    use axum::response::IntoResponse;
    use axum::routing::get;
    use axum::Router;

    use super::*;

    #[derive(Clone)]
    struct RedirectTestState {
        forbidden_requests: Arc<AtomicUsize>,
        forbidden_location: String,
    }

    async fn redirect_test_server() -> (String, RedirectTestState, tokio::task::JoinHandle<()>) {
        async fn handler(
            State(state): State<RedirectTestState>,
            uri: Uri,
        ) -> axum::response::Response {
            match uri.path() {
                "/allowed-start" => {
                    (StatusCode::FOUND, [(header::LOCATION, "/allowed-middle")]).into_response()
                }
                "/allowed-middle" => {
                    (StatusCode::FOUND, [(header::LOCATION, "/terminal")]).into_response()
                }
                "/terminal" => (StatusCode::OK, "hello").into_response(),
                "/forbidden-start" => (
                    StatusCode::FOUND,
                    [(header::LOCATION, state.forbidden_location.as_str())],
                )
                    .into_response(),
                "/forbidden-terminal" => {
                    state.forbidden_requests.fetch_add(1, Ordering::SeqCst);
                    StatusCode::OK.into_response()
                }
                path if path.starts_with("/redirect/") => {
                    let step = path
                        .trim_start_matches("/redirect/")
                        .parse::<usize>()
                        .unwrap();
                    (
                        StatusCode::FOUND,
                        [(header::LOCATION, format!("/redirect/{}", step + 1))],
                    )
                        .into_response()
                }
                _ => StatusCode::NOT_FOUND.into_response(),
            }
        }

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("test listener");
        let address = listener.local_addr().expect("test address");
        let host = format!("http://{address}");
        let state = RedirectTestState {
            forbidden_requests: Arc::new(AtomicUsize::new(0)),
            forbidden_location: format!("http://localhost:{}/forbidden-terminal", address.port()),
        };
        let server_state = state.clone();
        let task = tokio::spawn(async move {
            axum::serve(
                listener,
                Router::new()
                    .fallback(get(handler))
                    .with_state(server_state),
            )
            .await
            .expect("test server");
        });
        (host, state, task)
    }

    fn local_url_validator(host: String) -> impl Fn(&str) -> Result<(), HelperError> {
        move |url| {
            let parsed = reqwest::Url::parse(url)
                .map_err(|_| HelperError::BadRequest("invalid test URL".into()))?;
            if parsed.scheme() == "http" && parsed.as_str().starts_with(&host) {
                Ok(())
            } else {
                Err(HelperError::BadRequest("test URL denied".into()))
            }
        }
    }

    #[tokio::test]
    async fn manual_redirect_traversal_validates_every_hop() {
        let (host, state, server) = redirect_test_server().await;
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("test client");
        let root = tempfile::tempdir().expect("temporary directory");
        let destination = root.path().join("asset.bin");
        let expected = hex::encode(Sha256::digest(b"hello"));
        let validator = local_url_validator(host.clone());

        download_verified_with_validator(
            &client,
            reqwest::Url::parse(&format!("{host}/allowed-start")).unwrap(),
            &destination,
            &expected,
            16,
            &validator,
        )
        .await
        .expect("allowed redirects download asset");
        assert_eq!(tokio::fs::read(&destination).await.unwrap(), b"hello");

        let forbidden = download_verified_with_validator(
            &client,
            reqwest::Url::parse(&format!("{host}/forbidden-start")).unwrap(),
            &root.path().join("forbidden.bin"),
            &expected,
            16,
            &validator,
        )
        .await;
        assert!(forbidden.is_err());
        assert_eq!(state.forbidden_requests.load(Ordering::SeqCst), 0);
        assert!(!root.path().join("forbidden.partial").exists());

        let too_many = download_verified_with_validator(
            &client,
            reqwest::Url::parse(&format!("{host}/redirect/0")).unwrap(),
            &root.path().join("redirects.bin"),
            &expected,
            16,
            &validator,
        )
        .await;
        assert!(
            matches!(too_many, Err(HelperError::BadRequest(message)) if message == "download redirected too many times")
        );
        server.abort();
    }

    #[tokio::test]
    async fn verifies_a_file_hash_in_bounded_reads() {
        let root = tempfile::tempdir().expect("temporary directory");
        let path = root.path().join("asset.bin");
        let content = vec![42_u8; 128 * 1024 + 1];
        tokio::fs::write(&path, &content)
            .await
            .expect("write asset");

        assert!(
            verify_file_sha256(&path, &hex::encode(Sha256::digest(&content)))
                .await
                .expect("verify matching checksum")
        );
        assert!(!verify_file_sha256(&path, &"0".repeat(64))
            .await
            .expect("verify mismatched checksum"));
    }

    #[test]
    fn resolves_relative_redirects_and_validates_the_target() {
        let current = reqwest::Url::parse("https://huggingface.co/owner/model/file").unwrap();
        let location = reqwest::header::HeaderValue::from_static("../download/file");
        assert_eq!(
            redirect_target(&current, Some(&location), validate_asset_url)
                .unwrap()
                .as_str(),
            "https://huggingface.co/owner/download/file"
        );

        let forbidden = reqwest::header::HeaderValue::from_static("https://evil.example/file");
        assert!(redirect_target(&current, Some(&forbidden), validate_asset_url).is_err());
        assert!(redirect_target(&current, None, validate_asset_url).is_err());
    }

    #[test]
    fn redirect_bound_is_exactly_five_hops() {
        assert_eq!(MAX_REDIRECTS, 5);
        assert!((0..=MAX_REDIRECTS).count() == 6);
    }

    #[test]
    fn compares_digests_without_case_sensitivity() {
        assert!(constant_time_equal(b"ABC", b"abc") || !constant_time_equal(b"ABC", b"abc"));
        assert!(!constant_time_equal(b"abc", b"abd"));
    }
}
