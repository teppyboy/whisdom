use std::num::NonZeroUsize;

use serde::Deserialize;

fn default_port() -> u16 {
    8788
}
fn default_threads() -> usize {
    0
}
fn default_allowed_origin() -> String {
    "http://localhost:5173".into()
}
fn default_temp_dir() -> String {
    "./tmp".into()
}
fn default_ytdlp_path() -> String {
    "yt-dlp".into()
}
fn default_ffmpeg_path() -> String {
    "ffmpeg".into()
}
fn default_max_upload_mb() -> usize {
    500
}
fn default_log_level() -> String {
    "info".into()
}
const MULTIPART_OVERHEAD_BYTES: usize = 1024 * 1024;

#[derive(Clone, Debug, Deserialize)]
pub struct Config {
    #[serde(default, deserialize_with = "deserialize_from_env_or")]
    pub config_path: Option<String>,

    #[serde(default)]
    pub server: ServerConfig,

    #[serde(default)]
    pub auth: AuthConfig,

    #[serde(default)]
    pub model: ModelConfig,

    #[serde(default)]
    pub paths: PathsConfig,

    #[serde(default)]
    pub limits: LimitsConfig,

    #[serde(default)]
    pub logging: LoggingConfig,

    #[serde(default)]
    pub turnstile: TurnstileConfig,

    #[serde(default)]
    pub gpu: GpuConfig,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ServerConfig {
    #[serde(default = "default_port", deserialize_with = "deserialize_from_env_or")]
    pub port: u16,

    #[serde(
        default = "default_threads",
        deserialize_with = "deserialize_from_env_or"
    )]
    pub threads: usize,
}

#[derive(Clone, Debug, Deserialize)]
pub struct AuthConfig {
    #[serde(
        default = "default_allowed_origin",
        deserialize_with = "deserialize_from_env_or"
    )]
    pub allowed_origin: String,

    #[serde(default, deserialize_with = "deserialize_from_env_or")]
    pub allowed_emails: Vec<String>,

    #[serde(default, deserialize_with = "deserialize_from_env_or")]
    pub allowed_domains: Vec<String>,

    #[serde(default)]
    pub dev_auth_bypass: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ModelConfig {
    #[serde(default = "default_model_dir")]
    pub dir: String,
    #[serde(default = "default_model_default")]
    pub default_model: String,
    #[serde(default = "default_model_catalog")]
    pub catalog: Vec<ModelCatalogEntry>,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, PartialEq)]
pub struct ModelCatalogEntry {
    pub filename: String,
    pub quality: String,
    #[serde(default)]
    pub gpu: bool,
}

fn default_model_dir() -> String {
    "./models".to_string()
}

fn default_model_default() -> String {
    "base".to_string()
}

fn default_model_catalog() -> Vec<ModelCatalogEntry> {
    vec![
        ModelCatalogEntry {
            filename: "ggml-tiny-q5_1.bin".to_string(),
            quality: "fast".to_string(),
            gpu: false,
        },
        ModelCatalogEntry {
            filename: "ggml-base-q5_1.bin".to_string(),
            quality: "balanced".to_string(),
            gpu: false,
        },
        ModelCatalogEntry {
            filename: "ggml-small-q5_1.bin".to_string(),
            quality: "high".to_string(),
            gpu: false,
        },
        ModelCatalogEntry {
            filename: "ggml-medium-q5_0.bin".to_string(),
            quality: "high".to_string(),
            gpu: false,
        },
        ModelCatalogEntry {
            filename: "ggml-large-v3-q5_0.bin".to_string(),
            quality: "best".to_string(),
            gpu: false,
        },
    ]
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize, PartialEq)]
pub struct GpuConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub device: i32,
}

impl Default for GpuConfig {
    fn default() -> Self {
        GpuConfig {
            enabled: false,
            device: 0,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct PathsConfig {
    #[serde(
        default = "default_temp_dir",
        deserialize_with = "deserialize_from_env_or"
    )]
    pub temp_dir: String,

    #[serde(
        default = "default_ytdlp_path",
        deserialize_with = "deserialize_from_env_or"
    )]
    pub ytdlp_path: String,

    #[serde(
        default = "default_ffmpeg_path",
        deserialize_with = "deserialize_from_env_or"
    )]
    pub ffmpeg_path: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct LimitsConfig {
    #[serde(
        default = "default_max_upload_mb",
        deserialize_with = "deserialize_from_env_or"
    )]
    pub max_upload_mb: usize,
}

#[derive(Clone, Debug, Deserialize)]
pub struct LoggingConfig {
    #[serde(default = "default_log_level")]
    pub level: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TurnstileConfig {
    #[serde(default)]
    pub enabled: bool,

    #[serde(default, deserialize_with = "deserialize_from_env_or")]
    pub secret_key: String,

    #[serde(default = "default_siteverify_url")]
    pub siteverify_url: String,
}

fn default_siteverify_url() -> String {
    "https://challenges.cloudflare.com/turnstile/v0/siteverify".into()
}

impl Default for Config {
    fn default() -> Self {
        Self {
            config_path: None,
            server: ServerConfig::default(),
            auth: AuthConfig::default(),
            model: ModelConfig::default(),
            paths: PathsConfig::default(),
            limits: LimitsConfig::default(),
            logging: LoggingConfig::default(),
            turnstile: TurnstileConfig::default(),
            gpu: GpuConfig::default(),
        }
    }
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: default_port(),
            threads: default_threads(),
        }
    }
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            allowed_origin: default_allowed_origin(),
            allowed_emails: Vec::new(),
            allowed_domains: Vec::new(),
            dev_auth_bypass: false,
        }
    }
}

impl Default for ModelConfig {
    fn default() -> Self {
        ModelConfig {
            dir: default_model_dir(),
            default_model: default_model_default(),
            catalog: default_model_catalog(),
        }
    }
}

impl Default for PathsConfig {
    fn default() -> Self {
        Self {
            temp_dir: default_temp_dir(),
            ytdlp_path: default_ytdlp_path(),
            ffmpeg_path: default_ffmpeg_path(),
        }
    }
}

impl Default for LimitsConfig {
    fn default() -> Self {
        Self {
            max_upload_mb: default_max_upload_mb(),
        }
    }
}

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            level: default_log_level(),
        }
    }
}

impl Default for TurnstileConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            secret_key: String::new(),
            siteverify_url: default_siteverify_url(),
        }
    }
}

impl Config {
    pub fn load() -> Self {
        dotenvy::dotenv().ok();

        let config_path = std::env::var("WHISDOM_CONFIG").ok().or_else(|| {
            let cwd = std::env::current_dir().ok()?;
            let default_path = cwd.join("config.toml");
            if default_path.exists() {
                Some(default_path.to_string_lossy().to_string())
            } else {
                None
            }
        });

        let mut cfg = config_path
            .as_deref()
            .and_then(|p| {
                let content = std::fs::read_to_string(p).ok()?;
                toml::from_str::<Config>(&content).ok()
            })
            .unwrap_or_default();

        cfg.apply_env_overrides();
        cfg
    }

    fn apply_env_overrides(&mut self) {
        apply_env_u16("WHISDOM_SERVER_PORT", &mut self.server.port);
        apply_env_usize("WHISDOM_THREADS", &mut self.server.threads);

        apply_env_string("WHISDOM_ALLOWED_ORIGIN", &mut self.auth.allowed_origin);
        apply_env_vec("WHISDOM_ALLOWED_EMAILS", &mut self.auth.allowed_emails);
        apply_env_vec("WHISDOM_ALLOWED_DOMAINS", &mut self.auth.allowed_domains);
        apply_env_bool("WHISDOM_DEV_AUTH_BYPASS", &mut self.auth.dev_auth_bypass);

        apply_env_string("WHISDOM_MODEL_DIR", &mut self.model.dir);
        apply_env_string("WHISDOM_MODEL_DEFAULT", &mut self.model.default_model);
        apply_env_bool("WHISDOM_GPU_ENABLED", &mut self.gpu.enabled);
        apply_env_i32("WHISDOM_GPU_DEVICE", &mut self.gpu.device);

        apply_env_string("WHISDOM_TEMP_DIR", &mut self.paths.temp_dir);
        apply_env_string("WHISDOM_YTDLP_PATH", &mut self.paths.ytdlp_path);
        apply_env_string("WHISDOM_FFMPEG_PATH", &mut self.paths.ffmpeg_path);

        apply_env_usize("WHISDOM_MAX_UPLOAD_MB", &mut self.limits.max_upload_mb);
        apply_env_string("WHISDOM_LOG_LEVEL", &mut self.logging.level);

        apply_env_string("TURNSTILE_SECRET_KEY", &mut self.turnstile.secret_key);
        if let Ok(val) = std::env::var("TURNSTILE_ENABLED") {
            self.turnstile.enabled = val == "1" || val.eq_ignore_ascii_case("true");
        }

        if !self.turnstile.secret_key.is_empty() {
            self.turnstile.enabled = true;
        }
    }

    pub fn port(&self) -> u16 {
        self.server.port
    }
    pub fn allowed_origin(&self) -> &str {
        &self.auth.allowed_origin
    }
    pub fn allowed_emails(&self) -> &[String] {
        &self.auth.allowed_emails
    }
    pub fn allowed_domains(&self) -> &[String] {
        &self.auth.allowed_domains
    }
    pub fn dev_auth_bypass(&self) -> bool {
        self.auth.dev_auth_bypass
    }
    pub fn temp_dir(&self) -> &str {
        &self.paths.temp_dir
    }
    pub fn log_level(&self) -> &str {
        &self.logging.level
    }
    pub fn max_upload_bytes(&self) -> usize {
        self.limits.max_upload_mb.saturating_mul(1024 * 1024)
    }
    pub fn multipart_body_limit(&self) -> usize {
        self.max_upload_bytes()
            .saturating_add(MULTIPART_OVERHEAD_BYTES)
    }
    pub fn ytdlp_path(&self) -> &str {
        &self.paths.ytdlp_path
    }
    pub fn ffmpeg_path(&self) -> &str {
        &self.paths.ffmpeg_path
    }

    pub fn threads(&self) -> usize {
        let t = self.server.threads;
        if t == 0 {
            std::thread::available_parallelism()
                .map(NonZeroUsize::get)
                .unwrap_or(4)
        } else {
            t
        }
    }

    pub fn is_allowed(&self, email: &str) -> bool {
        if email.is_empty() {
            return false;
        }
        let emails = self.allowed_emails();
        let domains = self.allowed_domains();
        if emails.is_empty() && domains.is_empty() {
            return true;
        }
        let normalized = email.to_lowercase();
        if emails.contains(&normalized) {
            return true;
        }
        if let Some(domain) = normalized.split('@').nth(1) {
            if domains.contains(&domain.to_string()) {
                return true;
            }
        }
        false
    }

    pub fn resolve_paths(&mut self) {
        fn resolve(p: &mut String) {
            if p.starts_with("./") || p.starts_with("../") || !std::path::Path::new(p).is_absolute()
            {
                if let Ok(cwd) = std::env::current_dir() {
                    *p = cwd.join(&*p).to_string_lossy().to_string();
                }
            }
        }
        resolve(&mut self.model.dir);
        resolve(&mut self.paths.temp_dir);
    }
}

fn apply_env_string(env_key: &str, target: &mut String) {
    if let Ok(val) = std::env::var(env_key) {
        *target = val;
    }
}

fn apply_env_u16(env_key: &str, target: &mut u16) {
    if let Ok(val) = std::env::var(env_key) {
        if let Ok(parsed) = val.parse() {
            *target = parsed;
        }
    }
}

fn apply_env_usize(env_key: &str, target: &mut usize) {
    if let Ok(val) = std::env::var(env_key) {
        if let Ok(parsed) = val.parse() {
            *target = parsed;
        }
    }
}

fn apply_env_i32(env_key: &str, target: &mut i32) {
    if let Ok(value) = std::env::var(env_key) {
        if let Ok(parsed) = value.parse::<i32>() {
            *target = parsed;
        }
    }
}

fn apply_env_bool(env_key: &str, target: &mut bool) {
    if let Ok(val) = std::env::var(env_key) {
        *target = val == "1" || val.eq_ignore_ascii_case("true");
    }
}

fn apply_env_vec(env_key: &str, target: &mut Vec<String>) {
    if let Ok(val) = std::env::var(env_key) {
        *target = val
            .split(',')
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty())
            .collect();
    }
}

fn deserialize_from_env_or<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de> + Default,
{
    T::deserialize(deserializer).or_else(|_| Ok(T::default()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logging_defaults_to_info() {
        let config = Config::default();

        assert_eq!(config.log_level(), "info");
    }

    #[test]
    fn logging_level_deserializes_from_toml() {
        let config: Config = toml::from_str("[logging]\nlevel = \"debug\"")
            .expect("logging config should deserialize");

        assert_eq!(config.log_level(), "debug");
    }

    #[test]
    fn multipart_body_limit_includes_bounded_overhead() {
        let config = Config::default();

        assert_eq!(
            config.multipart_body_limit(),
            config.max_upload_bytes() + MULTIPART_OVERHEAD_BYTES
        );
    }

    #[test]
    fn multipart_body_limit_saturates() {
        let mut config = Config::default();
        config.limits.max_upload_mb = usize::MAX;

        assert_eq!(config.multipart_body_limit(), usize::MAX);
    }

    #[test]
    fn model_config_defaults_to_five_catalog_entries() {
        let cfg = ModelConfig::default();
        assert_eq!(cfg.dir, "./models");
        assert_eq!(cfg.default_model, "base");
        assert_eq!(cfg.catalog.len(), 5);
        assert_eq!(cfg.catalog[0].filename, "ggml-tiny-q5_1.bin");
        assert_eq!(cfg.catalog[0].quality, "fast");
        assert!(!cfg.catalog[0].gpu);
    }

    #[test]
    fn model_catalog_entry_deserializes_from_toml_with_gpu_default_false() {
        let toml_str = r#"
            filename = "ggml-large-v3-q5_0.bin"
            quality = "best"
        "#;
        let entry: ModelCatalogEntry = toml::from_str(toml_str).unwrap();
        assert_eq!(entry.filename, "ggml-large-v3-q5_0.bin");
        assert_eq!(entry.quality, "best");
        assert!(!entry.gpu);
    }

    #[test]
    fn model_catalog_entry_deserializes_gpu_true_when_present() {
        let toml_str = r#"
            filename = "ggml-large-v3-q5_0.bin"
            quality = "best"
            gpu = true
        "#;
        let entry: ModelCatalogEntry = toml::from_str(toml_str).unwrap();
        assert!(entry.gpu);
    }

    #[test]
    fn gpu_config_defaults_disabled_device_zero() {
        let cfg = GpuConfig::default();
        assert!(!cfg.enabled);
        assert_eq!(cfg.device, 0);
    }

    #[test]
    fn gpu_config_deserializes_from_toml() {
        let toml_str = r#"
            enabled = true
            device = 1
        "#;
        let cfg: GpuConfig = toml::from_str(toml_str).unwrap();
        assert!(cfg.enabled);
        assert_eq!(cfg.device, 1);
    }

    #[test]
    fn env_overrides_model_dir_and_default() {
        let mut cfg = Config::default();
        std::env::set_var("WHISDOM_MODEL_DIR", "/tmp/custom-models");
        std::env::set_var("WHISDOM_MODEL_DEFAULT", "small");
        cfg.apply_env_overrides();
        assert_eq!(cfg.model.dir, "/tmp/custom-models");
        assert_eq!(cfg.model.default_model, "small");
        std::env::remove_var("WHISDOM_MODEL_DIR");
        std::env::remove_var("WHISDOM_MODEL_DEFAULT");
    }

    #[test]
    fn env_overrides_gpu_enabled_and_device() {
        let mut cfg = Config::default();
        std::env::set_var("WHISDOM_GPU_ENABLED", "true");
        std::env::set_var("WHISDOM_GPU_DEVICE", "2");
        cfg.apply_env_overrides();
        assert!(cfg.gpu.enabled);
        assert_eq!(cfg.gpu.device, 2);
        std::env::remove_var("WHISDOM_GPU_ENABLED");
        std::env::remove_var("WHISDOM_GPU_DEVICE");
    }
}
