use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-env-changed=SHERPA_ONNX_LIB_DIR");
    println!("cargo:rerun-if-env-changed=SHERPA_ONNX_ENABLE_DIRECTML");

    if env::var_os("CARGO_FEATURE_DIRECTML").is_some()
        && env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
    {
        let lib_dir = env::var_os("SHERPA_ONNX_LIB_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                panic!(
                    "the `directml` feature requires SHERPA_ONNX_LIB_DIR; "
                        "run scripts/build-sherpa-directml.ps1 first"
                )
            });
        let bundle_dir = lib_dir.parent().unwrap_or(&lib_dir);
        let manifest = bundle_dir.join("manifest.json");
        let manifest_text = fs::read_to_string(&manifest).unwrap_or_else(|error| {
            panic!(
                "DirectML sherpa bundle manifest is missing at {}: {error}",
                manifest.display()
            )
        });
        for required in ["sherpa-onnx-c-api.lib", "onnxruntime.lib"] {
            if !lib_dir.join(required).is_file() {
                panic!(
                    "DirectML sherpa bundle is missing {required} in {}",
                    lib_dir.display()
                );
            }
        }
        for required in ["sherpa-onnx-c-api.dll", "onnxruntime.dll", "DirectML.dll"] {
            if !bundle_dir.join("bin").join(required).is_file() {
                panic!("DirectML sherpa bundle is missing bin/{required}");
            }
        }
        if !manifest_text.contains("sherpaRevision")
            || !manifest_text.contains("onnxRuntimeVersion")
            || !manifest_text.contains("directMlVersion")
        {
            panic!(
                "DirectML sherpa bundle manifest is incomplete: {}",
                manifest.display()
            );
        }
    }
}
