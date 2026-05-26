use std::{env, fs, path::PathBuf};

fn main() {
    println!("cargo:rerun-if-changed=resources/pdfium/windows-x64/pdfium.dll");

    let source = PathBuf::from("resources")
        .join("pdfium")
        .join("windows-x64")
        .join("pdfium.dll");

    if source.exists() {
        if let Ok(out_dir) = env::var("OUT_DIR") {
            let profile_dir = PathBuf::from(out_dir).ancestors().nth(3).map(PathBuf::from);

            if let Some(profile_dir) = profile_dir {
                let _ = fs::copy(&source, profile_dir.join("pdfium.dll"));
            }
        }
    }

    tauri_build::build()
}
