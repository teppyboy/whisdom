use std::path::Path;
use std::sync::Arc;

use super::cache::{HelperCache, JobGuard};
use super::models::{NativeModel, PARAKEET_TDT_V3_ID};
use super::protocol::{HelperError, TranscriptSegment};

const MAX_WORDS_PER_SEGMENT: usize = 12;
const MAX_SECONDS_PER_SEGMENT: f32 = 12.0;
const TIMESTAMP_EPSILON_SECONDS: f32 = 0.05;
const THREADS: i32 = 2;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ParakeetBackend {
    DirectMl,
    Vulkan,
    Cpu,
}

impl ParakeetBackend {
    pub const fn id(self) -> &'static str {
        match self {
            Self::DirectMl => "directml",
            Self::Vulkan => "vulkan",
            Self::Cpu => "cpu",
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct BackendAvailability {
    pub directml: bool,
    pub vulkan: bool,
    pub cpu: bool,
}

pub const BACKEND_ORDER: [ParakeetBackend; 3] = [
    ParakeetBackend::DirectMl,
    ParakeetBackend::Vulkan,
    ParakeetBackend::Cpu,
];

pub fn select_backend(available: BackendAvailability) -> Option<ParakeetBackend> {
    BACKEND_ORDER.into_iter().find(|backend| match backend {
        ParakeetBackend::DirectMl => available.directml,
        ParakeetBackend::Vulkan => available.vulkan,
        ParakeetBackend::Cpu => available.cpu,
    })
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TimestampedToken<'a> {
    pub text: &'a str,
    pub start: f32,
    pub duration: f32,
}

pub struct LoadedParakeet {
    recognizer: sherpa_onnx::OfflineRecognizer,
    pub backend: ParakeetBackend,
    pub model_id: &'static str,
}

// The crates.io sherpa-onnx archive is CPU-only. A DirectML build must be
// supplied through SHERPA_ONNX_LIB_DIR and compiled with the `directml` feature.
pub fn available_backends() -> BackendAvailability {
    BackendAvailability {
        // This enables the DirectML attempt. sherpa-onnx 1.13.6 can silently
        // fall back to CPU, so capabilities report CPU until a provider query
        // proves the active backend.
        directml: cfg!(feature = "directml") && cfg!(target_os = "windows"),
        vulkan: false,
        cpu: true,
    }
}

pub fn unavailable_error() -> HelperError {
    HelperError::BadRequest(
        "Parakeet runtime is unavailable because no supported backend is packaged".into(),
    )
}

pub fn is_backend_initialization_error(error: &HelperError) -> bool {
    matches!(
        error,
        HelperError::BadRequest(message)
            if message == "Parakeet DirectML runtime initialization failed"
                || message == "Parakeet Vulkan runtime initialization failed"
                || message == "Parakeet CPU runtime initialization failed"
    )
}

pub async fn load_model(
    cache: &HelperCache,
    model: &'static NativeModel,
) -> Result<Arc<LoadedParakeet>, HelperError> {
    if model.id != PARAKEET_TDT_V3_ID {
        return Err(HelperError::BadRequest("unsupported Parakeet model".into()));
    }
    if model.archive.is_none() {
        return Err(HelperError::Config(
            "Parakeet model has no verified archive manifest".into(),
        ));
    }
    let backend = select_backend(available_backends()).ok_or_else(unavailable_error)?;
    match load_model_with_backend(cache, model, backend).await {
        Err(error)
            if backend == ParakeetBackend::DirectMl && is_backend_initialization_error(&error) =>
        {
            tracing::warn!("Parakeet DirectML initialization failed; falling back to CPU");
            load_model_with_backend(cache, model, ParakeetBackend::Cpu).await
        }
        result => result,
    }
}

async fn load_model_with_backend(
    cache: &HelperCache,
    model: &'static NativeModel,
    backend: ParakeetBackend,
) -> Result<Arc<LoadedParakeet>, HelperError> {
    let model_dir = cache.ensure_model_assets(model).await?;
    let encoder = model_dir.join("encoder.int8.onnx");
    let decoder = model_dir.join("decoder.int8.onnx");
    let joiner = model_dir.join("joiner.int8.onnx");
    let tokens = model_dir.join("tokens.txt");
    for path in [&encoder, &decoder, &joiner, &tokens] {
        if !path.is_file() {
            return Err(HelperError::BadRequest(
                "Parakeet model archive is missing a required file".into(),
            ));
        }
    }

    let mut config = sherpa_onnx::OfflineRecognizerConfig::default();
    config.model_config.transducer = sherpa_onnx::OfflineTransducerModelConfig {
        encoder: Some(encoder.to_string_lossy().into_owned()),
        decoder: Some(decoder.to_string_lossy().into_owned()),
        joiner: Some(joiner.to_string_lossy().into_owned()),
    };
    config.model_config.tokens = Some(tokens.to_string_lossy().into_owned());
    config.model_config.model_type = Some("nemo_transducer".into());
    config.model_config.provider = Some(backend.id().into());
    config.model_config.num_threads = THREADS;
    config.decoding_method = Some("greedy_search".into());

    let recognizer =
        tokio::task::spawn_blocking(move || sherpa_onnx::OfflineRecognizer::create(&config))
            .await
            .map_err(|error| {
                HelperError::BadRequest(format!("Parakeet load task failed: {error}"))
            })?;

    let Some(recognizer) = recognizer else {
        return Err(HelperError::BadRequest(format!(
            "Parakeet {} runtime initialization failed",
            backend.id()
        )));
    };

    Ok(Arc::new(LoadedParakeet {
        recognizer,
        // sherpa-onnx 1.13.6 does not expose the provider actually selected.
        // Keep this conservative: a DirectML request that initializes cannot
        // prove it avoided the CPU fallback, so report CPU.
        backend: if backend == ParakeetBackend::DirectMl {
            // The recognizer may have silently fallen back to CPU.
            ParakeetBackend::Cpu
        } else {
            backend
        },
        model_id: model.id,
    }))
}

pub async fn transcribe_wav(
    wav_path: &Path,
    model: Arc<LoadedParakeet>,
    cancel: tokio::sync::watch::Receiver<bool>,
    _guard: &JobGuard,
) -> Result<Vec<TranscriptSegment>, HelperError> {
    if *cancel.borrow() {
        return Err(HelperError::BadRequest("cancelled".into()));
    }
    let wav_path = wav_path.to_owned();
    tokio::task::spawn_blocking(move || {
        let wav_name = wav_path.to_string_lossy();
        let wave = sherpa_onnx::Wave::read(&wav_name)
            .ok_or_else(|| HelperError::BadRequest("Parakeet WAV read failed".into()))?;
        let duration = wave.samples().len() as f32 / wave.sample_rate() as f32;
        if !duration.is_finite() || duration <= 0.0 {
            return Err(HelperError::BadRequest(
                "Parakeet WAV has no audio samples".into(),
            ));
        }
        let stream = model.recognizer.create_stream();
        stream.accept_waveform(wave.sample_rate(), wave.samples());
        model.recognizer.decode(&stream);
        let result = stream.get_result().ok_or_else(|| {
            HelperError::BadRequest("Parakeet returned no recognition result".into())
        })?;
        let timestamps = result.timestamps.ok_or_else(|| {
            HelperError::BadRequest("Parakeet returned unsupported timestamps".into())
        })?;
        if timestamps.len() != result.tokens.len() {
            return Err(HelperError::BadRequest(
                "Parakeet returned mismatched token timestamps".into(),
            ));
        }
        let durations = result.durations.unwrap_or_default();
        let tokens = result
            .tokens
            .iter()
            .enumerate()
            .map(|(index, text)| TimestampedToken {
                text,
                start: timestamps[index],
                duration: durations.get(index).copied().unwrap_or(0.0),
            })
            .collect::<Vec<_>>();
        normalize_tokens(&tokens, duration)
    })
    .await
    .map_err(|error| HelperError::BadRequest(format!("Parakeet task failed: {error}")))?
}

pub fn normalize_tokens(
    tokens: &[TimestampedToken<'_>],
    duration_seconds: f32,
) -> Result<Vec<TranscriptSegment>, HelperError> {
    if !duration_seconds.is_finite() || duration_seconds < 0.0 || tokens.is_empty() {
        return Err(invalid_output());
    }

    let mut words = Vec::new();
    let mut current = String::new();
    let mut current_start = 0.0;
    let mut current_end = 0.0;
    let mut previous = -1.0;
    for token in tokens {
        let end = token.start + token.duration.max(0.0);
        if !token.start.is_finite()
            || !token.duration.is_finite()
            || token.start < previous
            || token.start < 0.0
            || end > duration_seconds + TIMESTAMP_EPSILON_SECONDS
        {
            return Err(invalid_output());
        }
        previous = token.start;
        let piece = token.text.trim();
        if piece.is_empty() {
            continue;
        }
        let starts_word = token.text.chars().next().is_some_and(char::is_whitespace);
        let punctuation = piece.chars().all(|character| !character.is_alphanumeric());
        if starts_word && !current.is_empty() {
            words.push(TranscriptSegment {
                start: current_start,
                end: current_end,
                text: std::mem::take(&mut current),
            });
        }
        if current.is_empty() {
            current_start = token.start;
        }
        if starts_word && !current.is_empty() && !punctuation {
            current.push(' ');
        }
        current.push_str(piece);
        current_end = end.max(token.start);
    }
    if !current.trim().is_empty() {
        words.push(TranscriptSegment {
            start: current_start,
            end: current_end,
            text: current,
        });
    }
    if words.is_empty() {
        return Err(invalid_output());
    }

    let mut segments = Vec::new();
    let mut text = String::new();
    let mut start = 0.0;
    let mut end = 0.0;
    let mut word_count = 0;
    for word in words {
        if text.is_empty() {
            start = word.start;
        } else {
            text.push(' ');
        }
        end = word.end;
        text.push_str(word.text.trim());
        word_count += 1;
        if text.ends_with(['.', '!', '?'])
            || word_count >= MAX_WORDS_PER_SEGMENT
            || end - start >= MAX_SECONDS_PER_SEGMENT
        {
            segments.push(TranscriptSegment {
                start,
                end,
                text: std::mem::take(&mut text),
            });
            word_count = 0;
        }
    }
    if !text.is_empty() {
        segments.push(TranscriptSegment { start, end, text });
    }
    if segments.iter().any(|segment| {
        segment.text.trim().is_empty()
            || !segment.start.is_finite()
            || !segment.end.is_finite()
            || segment.start < 0.0
            || segment.end < segment.start
            || segment.end > duration_seconds + TIMESTAMP_EPSILON_SECONDS
    }) {
        return Err(invalid_output());
    }
    Ok(segments)
}

fn invalid_output() -> HelperError {
    HelperError::BadRequest("Parakeet returned invalid timestamped output".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn token(text: &str, start: f32, duration: f32) -> TimestampedToken<'_> {
        TimestampedToken {
            text,
            start,
            duration,
        }
    }

    #[test]
    fn parakeet_backend_order_is_directml_then_vulkan_then_cpu() {
        assert_eq!(
            select_backend(BackendAvailability {
                directml: true,
                vulkan: true,
                cpu: true,
            }),
            Some(ParakeetBackend::DirectMl)
        );
        assert_eq!(
            select_backend(BackendAvailability {
                directml: false,
                vulkan: true,
                cpu: true,
            }),
            Some(ParakeetBackend::Vulkan)
        );
        assert_eq!(
            select_backend(BackendAvailability {
                directml: false,
                vulkan: false,
                cpu: true,
            }),
            Some(ParakeetBackend::Cpu)
        );
    }

    #[test]
    fn groups_token_pieces_and_punctuation_without_inventing_time() {
        let segments = normalize_tokens(
            &[
                token(" Hel", 0.0, 0.2),
                token("lo", 0.2, 0.2),
                token(",", 0.4, 0.1),
                token(" world", 0.5, 0.3),
                token("!", 0.8, 0.1),
            ],
            1.0,
        )
        .expect("valid tokens");
        assert_eq!(segments[0].text, "Hello, world!");
        assert_eq!(segments[0].start, 0.0);
        assert_eq!(segments[0].end, 0.9);
    }

    #[test]
    fn rejects_non_monotonic_or_empty_timestamped_output() {
        assert!(
            normalize_tokens(&[token(" hello", 1.0, 0.1), token(" there", 0.9, 0.1)], 2.0).is_err()
        );
        assert!(normalize_tokens(&[], 2.0).is_err());
    }
}
