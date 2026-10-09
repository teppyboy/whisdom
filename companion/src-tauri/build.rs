fn main() {
    tauri_build::build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        // Sherpa-onnx dylibs are linked via @rpath; they ship in
        // Contents/Resources (bundle) or beside the binary (portable zip).
        println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Resources");
        println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path");
        println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path");
    }
}
