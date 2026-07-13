use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::error::AppError;
use crate::job::TranscriptSegment;

pub struct TranscribeOptions {
    pub model_path: String,
    pub threads: usize,
    pub language: Option<String>,
}

pub fn transcribe_wav(
    wav_path: &Path,
    options: &TranscribeOptions,
    cancel_flag: Arc<AtomicBool>,
) -> Result<Vec<TranscriptSegment>, AppError> {
    let model_path = Path::new(&options.model_path);

    let ctx_params = WhisperContextParameters::default();
    let ctx = WhisperContext::new_with_params(model_path, ctx_params)
        .map_err(|e| AppError::Internal(format!("failed to load whisper model: {e}")))?;

    let mut state = ctx
        .create_state()
        .map_err(|e| AppError::Internal(format!("failed to create whisper state: {e}")))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_n_threads(options.threads as i32);
    params.set_translate(false);
    params.set_no_context(false);
    params.set_single_segment(false);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_token_timestamps(true);

    if let Some(ref lang) = options.language {
        if lang != "auto" {
            params.set_language(Some(lang));
        }
    }

    let reader = hound::WavReader::open(wav_path)
        .map_err(|e| AppError::Internal(format!("failed to open WAV: {e}")))?;

    let spec = reader.spec();
    if spec.sample_rate != 16000 || spec.channels != 1 {
        return Err(AppError::BadRequest(
            "WAV must be 16kHz mono PCM 16-bit".into(),
        ));
    }

    let samples: Vec<i16> = reader
        .into_samples()
        .collect::<Result<Vec<i16>, _>>()
        .map_err(|e| AppError::Internal(format!("failed to read WAV samples: {e}")))?;

    let audio_data: Vec<f32> = samples.iter().map(|&s| s as f32 / 32768.0).collect();

    if cancel_flag.load(Ordering::Relaxed) {
        return Err(AppError::BadRequest("cancelled".into()));
    }

    state
        .full(params, &audio_data)
        .map_err(|e| AppError::Internal(format!("whisper full failed: {e}")))?;

    let n_segments = state.full_n_segments();

    let mut segments = Vec::with_capacity(n_segments as usize);

    for i in 0..n_segments {
        if cancel_flag.load(Ordering::Relaxed) {
            return Err(AppError::BadRequest("cancelled".into()));
        }

        if let Some(segment) = state.get_segment(i) {
            let text = segment
                .to_str_lossy()
                .map_err(|e| AppError::Internal(format!("failed to get segment text: {e}")))?
                .into_owned();

            let start = segment.start_timestamp() as f32 / 100.0;
            let end = segment.end_timestamp() as f32 / 100.0;

            segments.push(TranscriptSegment { start, end, text });
        }
    }

    Ok(segments)
}
