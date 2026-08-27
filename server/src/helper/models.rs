pub const DEFAULT_NATIVE_MODEL_ID: &str = "ggml-large-v3-turbo-q5_0";
pub const PARAKEET_TDT_V3_ID: &str = "sherpa-parakeet-tdt-v3-int8";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AsrEngine {
    WhisperCpp,
    SherpaOnnx,
}

impl AsrEngine {
    pub const fn id(self) -> &'static str {
        match self {
            Self::WhisperCpp => "whisper.cpp",
            Self::SherpaOnnx => "sherpa-onnx",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct NativeArchive {
    pub filename: &'static str,
    pub url: &'static str,
    pub size_bytes: u64,
    pub sha256: &'static str,
    pub files: &'static [&'static str],
    // Every extracted file must be pinned before this archive can be installed.
    pub file_hashes: Option<&'static [(&'static str, &'static str)]>,
}

#[derive(Debug, Clone, Copy)]
pub struct NativeModel {
    pub id: &'static str,
    pub label: &'static str,
    pub quality: &'static str,
    pub size_bytes: u64,
    pub filename: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
    pub engine: AsrEngine,
    pub supported_languages: &'static [&'static str],
    pub supports_auto_language: bool,
    pub archive: Option<NativeArchive>,
}

const WHISPER_LANGUAGES: [&str; 1] = ["*"];
const PARAKEET_LANGUAGES: [&str; 25] = [
    "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "it", "lv", "lt", "mt",
    "pl", "pt", "ro", "ru", "sk", "sl", "es", "sv", "uk",
];
const PARAKEET_FILES: [&str; 4] = [
    "encoder.int8.onnx",
    "decoder.int8.onnx",
    "joiner.int8.onnx",
    "tokens.txt",
];
const PARAKEET_ARCHIVE: NativeArchive = NativeArchive {
    filename: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2",
    size_bytes: 487_170_055,
    sha256: "5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf",
    files: &PARAKEET_FILES,
    // sherpa-onnx publishes the archive digest, not per-file digests. Keep
    // this unavailable until maintainer-verified extracted-file pins exist.
    file_hashes: None,
};

const NATIVE_MODELS: [NativeModel; 6] = [
    NativeModel { id: "ggml-tiny-q5_1", label: "Whisper Tiny", quality: "fast", size_bytes: 32_152_673, filename: "ggml-tiny-q5_1.bin", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-tiny-q5_1.bin?download=true", sha256: "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7", engine: AsrEngine::WhisperCpp, supported_languages: &WHISPER_LANGUAGES, supports_auto_language: true, archive: None },
    NativeModel { id: "ggml-base-q5_1", label: "Whisper Base", quality: "balanced", size_bytes: 59_707_625, filename: "ggml-base-q5_1.bin", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base-q5_1.bin?download=true", sha256: "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898", engine: AsrEngine::WhisperCpp, supported_languages: &WHISPER_LANGUAGES, supports_auto_language: true, archive: None },
    NativeModel { id: "ggml-small-q5_1", label: "Whisper Small", quality: "high", size_bytes: 190_085_487, filename: "ggml-small-q5_1.bin", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-small-q5_1.bin?download=true", sha256: "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb", engine: AsrEngine::WhisperCpp, supported_languages: &WHISPER_LANGUAGES, supports_auto_language: true, archive: None },
    NativeModel { id: "ggml-large-v3-turbo-q5_0", label: "Whisper Large v3 Turbo", quality: "high", size_bytes: 574_041_195, filename: "ggml-large-v3-turbo-q5_0.bin", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo-q5_0.bin?download=true", sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2", engine: AsrEngine::WhisperCpp, supported_languages: &WHISPER_LANGUAGES, supports_auto_language: true, archive: None },
    NativeModel { id: "ggml-large-v3-q5_0", label: "Whisper Large v3", quality: "best", size_bytes: 1_081_140_203, filename: "ggml-large-v3-q5_0.bin", url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-q5_0.bin?download=true", sha256: "d75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1", engine: AsrEngine::WhisperCpp, supported_languages: &WHISPER_LANGUAGES, supports_auto_language: true, archive: None },
    NativeModel { id: PARAKEET_TDT_V3_ID, label: "Parakeet TDT v3", quality: "high", size_bytes: PARAKEET_ARCHIVE.size_bytes, filename: PARAKEET_ARCHIVE.filename, url: PARAKEET_ARCHIVE.url, sha256: PARAKEET_ARCHIVE.sha256, engine: AsrEngine::SherpaOnnx, supported_languages: &PARAKEET_LANGUAGES, supports_auto_language: false, archive: Some(PARAKEET_ARCHIVE) },
];

pub fn native_models() -> &'static [NativeModel] {
    &NATIVE_MODELS
}
pub fn find_native_model(id: &str) -> Option<&'static NativeModel> {
    native_models().iter().find(|model| model.id == id)
}
pub fn default_native_model() -> &'static NativeModel {
    find_native_model(DEFAULT_NATIVE_MODEL_ID).expect("default native model is in the catalog")
}

pub fn supports_language(model: &NativeModel, language: Option<&str>) -> bool {
    match language.filter(|language| !language.is_empty()) {
        None | Some("auto") => model.supports_auto_language,
        Some(language) => {
            model.supported_languages.contains(&"*")
                || model.supported_languages.contains(&language)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn catalog_models_declare_safe_engine_language_and_asset_metadata() {
        let ids = native_models()
            .iter()
            .map(|model| model.id)
            .collect::<HashSet<_>>();
        assert_eq!(ids.len(), native_models().len());
        let parakeet = find_native_model(PARAKEET_TDT_V3_ID).expect("Parakeet catalog entry");
        assert_eq!(parakeet.engine, AsrEngine::SherpaOnnx);
        assert!(parakeet.supported_languages.contains(&"en"));
        assert!(!parakeet.supported_languages.contains(&"vi"));
        assert_eq!(parakeet.archive.expect("archive").files.len(), 4);
        assert_eq!(parakeet.sha256.len(), 64);
    }

    #[test]
    fn catalog_keeps_whisper_default_and_language_rules() {
        assert_eq!(default_native_model().id, DEFAULT_NATIVE_MODEL_ID);
        assert!(supports_language(default_native_model(), Some("vi")));
        assert!(!supports_language(
            find_native_model(PARAKEET_TDT_V3_ID).unwrap(),
            Some("vi")
        ));
        assert!(!supports_language(
            find_native_model(PARAKEET_TDT_V3_ID).unwrap(),
            Some("auto")
        ));
    }
}
