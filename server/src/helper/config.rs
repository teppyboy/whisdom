use std::path::{Path, PathBuf};

use super::protocol::HelperError;

const DEFAULT_PORT: u16 = 8788;
const DEFAULT_ORIGINS: &str =
    "https://whisdom.tretrauit.me,https://whisdom.app,http://localhost:5173";
const DEFAULT_FFMPEG_URL: &str = "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-08-15-13-02/ffmpeg-n8.1.2-44-g7c533d0f86-win64-gpl-8.1.zip";
const DEFAULT_FFMPEG_SHA256: &str =
    "0e7829b6e1ba867e37bbad17153de258bd3bffaa3b745626a6424df0ea113970";
const DEFAULT_FFMPEG_EXE_SHA256: &str =
    "5d5e06fbb900fd7a45a82eb0529e67f905853432139f673ac90aff45930504d8";
pub const VAD_MODEL_URL: &str =
    "https://huggingface.co/ggml-org/whisper-vad/resolve/9ffd54a1e1ee413ddf265af9913beaf518d1639b/ggml-silero-v6.2.0.bin?download=true";
pub const VAD_MODEL_SHA256: &str =
    "2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987";

#[derive(Clone, Debug)]
pub struct HelperConfig {
    pub port: u16,
    pub allowed_origins: Vec<String>,
    pub root: PathBuf,
    pub ffmpeg_url: String,
    pub ffmpeg_sha256: String,
    pub ffmpeg_exe_sha256: String,
    pub max_download_bytes: u64,
    pub max_upload_bytes: usize,
}

impl HelperConfig {
    pub fn from_env() -> Result<Self, HelperError> {
        let root = std::env::var_os("WHISDOM_HELPER_ROOT")
            .map(PathBuf::from)
            .unwrap_or_else(default_root);
        validate_root(&root)?;

        let allowed_origins = std::env::var("WHISDOM_HELPER_ORIGINS")
            .unwrap_or_else(|_| DEFAULT_ORIGINS.to_string())
            .split(',')
            .map(str::trim)
            .filter(|origin| !origin.is_empty())
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>();

        if allowed_origins.is_empty() {
            return Err(HelperError::Config(
                "at least one allowed origin is required".into(),
            ));
        }

        let ffmpeg_url = env_or("WHISDOM_HELPER_FFMPEG_URL", DEFAULT_FFMPEG_URL);
        let ffmpeg_sha256 = env_or("WHISDOM_HELPER_FFMPEG_SHA256", DEFAULT_FFMPEG_SHA256);
        let ffmpeg_exe_sha256 = env_or(
            "WHISDOM_HELPER_FFMPEG_EXE_SHA256",
            DEFAULT_FFMPEG_EXE_SHA256,
        );
        validate_asset_url(&ffmpeg_url)?;
        validate_sha256(&ffmpeg_sha256, "WHISDOM_HELPER_FFMPEG_SHA256")?;
        validate_sha256(&ffmpeg_exe_sha256, "WHISDOM_HELPER_FFMPEG_EXE_SHA256")?;

        Ok(Self {
            port: parse_port("WHISDOM_HELPER_PORT", DEFAULT_PORT)?,
            allowed_origins,
            root,
            ffmpeg_url,
            ffmpeg_sha256,
            ffmpeg_exe_sha256,
            max_download_bytes: 2 * 1024 * 1024 * 1024,
            max_upload_bytes: parse_usize("WHISDOM_HELPER_MAX_UPLOAD_MB", 500)?
                .saturating_mul(1024 * 1024),
        })
    }

    pub fn models_dir(&self) -> PathBuf {
        self.root.join("models")
    }
    pub fn tools_dir(&self) -> PathBuf {
        self.root.join("tools")
    }
    pub fn temp_dir(&self) -> PathBuf {
        self.root.join("temp")
    }
    pub fn logs_dir(&self) -> PathBuf {
        self.root.join("logs")
    }
    pub fn auth_dir(&self) -> PathBuf {
        self.root.join("auth")
    }
    pub fn token_path(&self) -> PathBuf {
        self.auth_dir().join("helper-token")
    }

    pub async fn create_dirs(&self) -> Result<(), HelperError> {
        for path in [
            self.models_dir(),
            self.tools_dir(),
            self.temp_dir(),
            self.logs_dir(),
            self.auth_dir(),
        ] {
            tokio::fs::create_dir_all(path)
                .await
                .map_err(HelperError::Io)?;
        }
        Ok(())
    }
}

fn default_root() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("Whisdom")
        .join("Helper")
}

fn validate_root(root: &Path) -> Result<(), HelperError> {
    if !root.is_absolute()
        || root
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(HelperError::Config(
            "helper root must be an absolute path without parent traversal".into(),
        ));
    }
    Ok(())
}

fn parse_port(name: &str, default: u16) -> Result<u16, HelperError> {
    match std::env::var(name) {
        Ok(value) => value
            .parse()
            .map_err(|_| HelperError::Config(format!("{name} must be a valid port"))),
        Err(_) => Ok(default),
    }
}

fn env_or(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_string())
}

pub fn validate_asset_url(value: &str) -> Result<(), HelperError> {
    let url = reqwest::Url::parse(value)
        .map_err(|_| HelperError::Config("asset URL must be valid HTTPS".into()))?;
    let host = url
        .host_str()
        .ok_or_else(|| HelperError::Config("asset URL must include a pinned host".into()))?;
    if url.scheme() != "https"
        || !matches!(
            host,
            "huggingface.co"
                | "cdn-lfs.hf.co"
                | "cas-bridge.xethub.hf.co"
                | "transfer.xethub.hf.co"
                | "us.aws.cdn.hf.co"
                | "github.com"
                | "objects.githubusercontent.com"
                | "release-assets.githubusercontent.com"
        )
    {
        return Err(HelperError::Config(
            "asset URL host or scheme is not allowed".into(),
        ));
    }
    Ok(())
}

fn validate_sha256(value: &str, name: &str) -> Result<(), HelperError> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(HelperError::Config(format!(
            "{name} must be a 64-character SHA-256 hex digest"
        )));
    }
    Ok(())
}

fn parse_usize(name: &str, default_mb: usize) -> Result<usize, HelperError> {
    match std::env::var(name) {
        Ok(value) => value
            .parse()
            .map_err(|_| HelperError::Config(format!("{name} must be a valid integer"))),
        Err(_) => Ok(default_mb),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_origins_include_the_deployed_site() {
        assert!(DEFAULT_ORIGINS
            .split(',')
            .any(|origin| origin == "https://whisdom.tretrauit.me"));
    }

    #[test]
    fn default_paths_are_under_local_app_data_or_temp() {
        assert!(HelperConfig::from_env().is_ok_and(|config| config.root.is_absolute()));
    }

    #[test]
    fn rejects_relative_root() {
        assert!(validate_root(Path::new("relative/helper")).is_err());
        assert!(validate_root(Path::new("C:/helper/../escape")).is_err());
    }

    #[test]
    fn accepts_only_exact_pinned_https_hosts() {
        for host in [
            "huggingface.co",
            "cdn-lfs.hf.co",
            "cas-bridge.xethub.hf.co",
            "transfer.xethub.hf.co",
            "us.aws.cdn.hf.co",
            "github.com",
            "objects.githubusercontent.com",
            "release-assets.githubusercontent.com",
        ] {
            assert!(validate_asset_url(&format!("https://{host}/asset")).is_ok());
        }
        assert!(validate_asset_url("http://github.com/org/repo/file").is_err());
        assert!(validate_asset_url("https://evil.example/file").is_err());
        assert!(validate_asset_url("https://github.com.evil.example/file").is_err());
        assert!(validate_asset_url("https://cdn-lfs.hf.co.evil.example/file").is_err());
    }

    #[test]
    fn validates_sha256_format() {
        assert!(validate_sha256(&"a".repeat(64), "TEST").is_ok());
        assert!(validate_sha256("short", "TEST").is_err());
    }
}
