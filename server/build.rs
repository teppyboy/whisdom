use std::env;

fn main() {
    println!("cargo:rerun-if-env-changed=SHERPA_ONNX_LIB_DIR");

    if env::var_os("CARGO_FEATURE_DIRECTML").is_some()
        && env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && env::var_os("SHERPA_ONNX_LIB_DIR").is_none()
    {
        panic!(
            "the `directml` feature requires SHERPA_ONNX_LIB_DIR to point to a custom sherpa-onnx DirectML build"
        );
    }
}
