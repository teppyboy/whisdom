use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn resample_to_mono_16k(samples: &[f32], src_rate: u32, channels: u16) -> Vec<f32> {
    let _ = (samples, src_rate, channels);
    vec![]
}

#[wasm_bindgen]
pub fn f32_to_16k_wav(samples: &[f32]) -> Vec<u8> {
    let _ = samples;
    vec![]
}

#[wasm_bindgen]
pub fn split_wav_chunks(wav: &[u8], max_bytes: usize) -> js_sys::Array {
    let _ = (wav, max_bytes);
    js_sys::Array::new()
}
