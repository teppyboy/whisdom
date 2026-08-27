pub const DEFAULT_NATIVE_MODEL_ID: &str = "ggml-large-v3-turbo-q5_0";
#[cfg(test)]
const HF_REVISION: &str = "5359861c739e955e79d9a303bcbc70fb988958b1";
#[cfg(test)]
const HF_RESOLVE_PREFIX: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/";

#[derive(Debug, Clone, Copy)]
pub struct NativeModel {
    pub id: &'static str,
    pub label: &'static str,
    pub quality: &'static str,
    pub size_bytes: u64,
    pub filename: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
}

const NATIVE_MODELS: [NativeModel; 5] = [
    NativeModel {
        id: "ggml-tiny-q5_1",
        label: "Whisper Tiny",
        quality: "fast",
        size_bytes: 32_152_673,
        filename: "ggml-tiny-q5_1.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-tiny-q5_1.bin?download=true",
        sha256: "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7",
    },
    NativeModel {
        id: "ggml-base-q5_1",
        label: "Whisper Base",
        quality: "balanced",
        size_bytes: 59_707_625,
        filename: "ggml-base-q5_1.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base-q5_1.bin?download=true",
        sha256: "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898",
    },
    NativeModel {
        id: "ggml-small-q5_1",
        label: "Whisper Small",
        quality: "high",
        size_bytes: 190_085_487,
        filename: "ggml-small-q5_1.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-small-q5_1.bin?download=true",
        sha256: "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
    },
    NativeModel {
        id: "ggml-large-v3-turbo-q5_0",
        label: "Whisper Large v3 Turbo",
        quality: "high",
        size_bytes: 574_041_195,
        filename: "ggml-large-v3-turbo-q5_0.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo-q5_0.bin?download=true",
        sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
    },
    NativeModel {
        id: "ggml-large-v3-q5_0",
        label: "Whisper Large v3",
        quality: "best",
        size_bytes: 1_081_140_203,
        filename: "ggml-large-v3-q5_0.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-q5_0.bin?download=true",
        sha256: "d75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1",
    },
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_catalog_has_exact_pinned_models() {
        assert_eq!(HF_REVISION.len(), 40);
        let expected = [
            (
                "ggml-tiny-q5_1",
                "Whisper Tiny",
                "fast",
                32_152_673,
                "ggml-tiny-q5_1.bin",
                "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7",
            ),
            (
                "ggml-base-q5_1",
                "Whisper Base",
                "balanced",
                59_707_625,
                "ggml-base-q5_1.bin",
                "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898",
            ),
            (
                "ggml-small-q5_1",
                "Whisper Small",
                "high",
                190_085_487,
                "ggml-small-q5_1.bin",
                "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
            ),
            (
                "ggml-large-v3-turbo-q5_0",
                "Whisper Large v3 Turbo",
                "high",
                574_041_195,
                "ggml-large-v3-turbo-q5_0.bin",
                "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
            ),
            (
                "ggml-large-v3-q5_0",
                "Whisper Large v3",
                "best",
                1_081_140_203,
                "ggml-large-v3-q5_0.bin",
                "d75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1",
            ),
        ];

        assert_eq!(native_models().len(), expected.len());
        for (model, (id, label, quality, size_bytes, filename, sha256)) in
            native_models().iter().zip(expected)
        {
            assert_eq!(model.id, id);
            assert_eq!(model.label, label);
            assert_eq!(model.quality, quality);
            assert_eq!(model.size_bytes, size_bytes);
            assert_eq!(model.filename, filename);
            assert_eq!(model.sha256, sha256);
            assert_eq!(
                model.url,
                format!("{HF_RESOLVE_PREFIX}{filename}?download=true")
            );
        }
    }

    #[test]
    fn default_model_is_catalogued() {
        assert_eq!(default_native_model().id, DEFAULT_NATIVE_MODEL_ID);
        assert!(find_native_model("unknown").is_none());
    }
}
