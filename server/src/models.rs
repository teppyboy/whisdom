// Wired up in a later task (ModelRegistry/preload_models and route integration).
#![allow(dead_code)]

//! Model catalog derivation: turns a ggml filename into a stable id/label pair.

/// Strip the leading `ggml-` prefix and trailing `.bin` suffix, then strip a
/// trailing quantization suffix matching `-q<digits>...` or `-f<digits>...`
/// (case-insensitive). If no quantization suffix is found, the stripped
/// string is returned as-is. Never panics.
pub fn derive_id(filename: &str) -> String {
    let no_prefix = filename.strip_prefix("ggml-").unwrap_or(filename);
    let stripped = no_prefix.strip_suffix(".bin").unwrap_or(no_prefix);

    match stripped.rfind('-') {
        Some(idx) => {
            let (head, tail) = stripped.split_at(idx);
            let quant = &tail[1..]; // skip the '-'
            let is_quant = quant.len() > 1
                && (quant.starts_with('q') || quant.starts_with('Q') || quant.starts_with('f') || quant.starts_with('F'))
                && quant.chars().nth(1).map(|c| c.is_ascii_digit()).unwrap_or(false);
            if is_quant {
                head.to_string()
            } else {
                stripped.to_string()
            }
        }
        None => stripped.to_string(),
    }
}

/// Convert a derived id into a human label: hyphens become spaces, each
/// word is capitalized. E.g. "large-v3" -> "Large V3".
pub fn derive_label(id: &str) -> String {
    id.split('-')
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[derive(Debug, Clone, PartialEq)]
pub struct ModelInfo {
    pub id: String,
    pub label: String,
    pub filename: String,
    pub size_mb: u64,
    pub quality: String,
    pub gpu: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_id_strips_prefix_suffix_and_quant() {
        assert_eq!(derive_id("ggml-tiny-q5_1.bin"), "tiny");
        assert_eq!(derive_id("ggml-base-q5_1.bin"), "base");
        assert_eq!(derive_id("ggml-small-q5_1.bin"), "small");
        assert_eq!(derive_id("ggml-medium-q5_0.bin"), "medium");
    }

    #[test]
    fn derive_id_handles_two_segment_name_with_quant() {
        assert_eq!(derive_id("ggml-large-v3-q5_0.bin"), "large-v3");
    }

    #[test]
    fn derive_id_handles_missing_quant_suffix() {
        assert_eq!(derive_id("ggml-tiny.bin"), "tiny");
    }

    #[test]
    fn derive_id_handles_f_type_quant_suffix() {
        assert_eq!(derive_id("ggml-medium-f16.bin"), "medium");
    }

    #[test]
    fn derive_id_never_panics_on_unexpected_filename() {
        assert_eq!(derive_id("weird-file-name.bin"), "weird-file-name");
        assert_eq!(derive_id(""), "");
        assert_eq!(derive_id("ggml-.bin"), "");
    }

    #[test]
    fn derive_label_capitalizes_and_replaces_hyphens() {
        assert_eq!(derive_label("large-v3"), "Large V3");
        assert_eq!(derive_label("base"), "Base");
        assert_eq!(derive_label("tiny"), "Tiny");
    }
}
