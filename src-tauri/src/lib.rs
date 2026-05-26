use serde::Serialize;
use std::{
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

const MAX_EDITABLE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_PREVIEW_BYTES: u64 = 512 * 1024;

#[derive(Debug)]
enum AppError {
    Io(String),
    InvalidPath(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        match self {
            Self::Io(message) | Self::InvalidPath(message) => serializer.serialize_str(message),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error.to_string())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileMetadata {
    path: String,
    name: String,
    extension: Option<String>,
    size: u64,
    modified: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileDocument {
    path: String,
    name: String,
    extension: Option<String>,
    size: u64,
    modified: Option<u64>,
    kind: String,
    content: Option<String>,
    encoding: String,
    line_count: usize,
    editable: bool,
    truncated: bool,
    preview_bytes: u64,
}

fn normalized_path(path: String) -> Result<PathBuf, AppError> {
    if path.trim().is_empty() {
        return Err(AppError::InvalidPath("No file path was provided.".into()));
    }

    Ok(PathBuf::from(path))
}

fn metadata_for(path: &Path) -> Result<FileMetadata, AppError> {
    let metadata = fs::metadata(path)?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs());

    Ok(FileMetadata {
        path: path.to_string_lossy().into_owned(),
        name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Untitled")
            .to_string(),
        extension: path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_string()),
        size: metadata.len(),
        modified,
    })
}

fn is_csv(meta: &FileMetadata) -> bool {
    meta.extension
        .as_deref()
        .map(|extension| extension.eq_ignore_ascii_case("csv"))
        .unwrap_or(false)
}

fn line_count(content: &str) -> usize {
    if content.is_empty() {
        0
    } else {
        content.lines().count()
    }
}

fn binary_document(meta: FileMetadata, encoding: &str) -> FileDocument {
    FileDocument {
        path: meta.path,
        name: meta.name,
        extension: meta.extension,
        size: meta.size,
        modified: meta.modified,
        kind: "binary".into(),
        content: None,
        encoding: encoding.into(),
        line_count: 0,
        editable: false,
        truncated: false,
        preview_bytes: 0,
    }
}

fn text_document(
    meta: FileMetadata,
    content: String,
    editable: bool,
    truncated: bool,
) -> FileDocument {
    let preview_bytes = content.len() as u64;
    let kind = if is_csv(&meta) {
        "csv"
    } else if editable {
        "text"
    } else {
        "largeText"
    };

    FileDocument {
        path: meta.path,
        name: meta.name,
        extension: meta.extension,
        size: meta.size,
        modified: meta.modified,
        kind: kind.into(),
        line_count: line_count(&content),
        content: Some(content),
        encoding: if editable { "utf-8" } else { "utf-8-preview" }.into(),
        editable,
        truncated,
        preview_bytes,
    }
}

fn read_preview_bytes(path: &Path) -> Result<Vec<u8>, AppError> {
    let mut file = File::open(path)?;
    let mut bytes = Vec::with_capacity(MAX_PREVIEW_BYTES as usize);
    file.by_ref()
        .take(MAX_PREVIEW_BYTES)
        .read_to_end(&mut bytes)?;
    Ok(bytes)
}

fn utf8_content(bytes: Vec<u8>) -> Option<String> {
    if bytes.iter().any(|byte| *byte == 0) {
        return None;
    }

    match String::from_utf8(bytes) {
        Ok(content) => Some(content),
        Err(error) => {
            let valid_up_to = error.utf8_error().valid_up_to();
            if error.utf8_error().error_len().is_some() || valid_up_to == 0 {
                return None;
            }

            let bytes = error.into_bytes();
            String::from_utf8(bytes[..valid_up_to].to_vec()).ok()
        }
    }
}

fn document_for(path: &Path) -> Result<FileDocument, AppError> {
    let meta = metadata_for(path)?;

    if meta.size > MAX_EDITABLE_BYTES {
        let preview = read_preview_bytes(path)?;
        return Ok(match utf8_content(preview) {
            Some(content) => text_document(meta, content, false, true),
            None => binary_document(meta, "binary"),
        });
    }

    let bytes = fs::read(path)?;
    match utf8_content(bytes) {
        Some(content) => Ok(text_document(meta, content, true, false)),
        None => Ok(binary_document(meta, "binary")),
    }
}

#[tauri::command]
fn inspect_file(path: String) -> Result<FileDocument, AppError> {
    let path = normalized_path(path)?;
    document_for(&path)
}

#[tauri::command]
fn load_file(path: String) -> Result<FileDocument, AppError> {
    let path = normalized_path(path)?;
    document_for(&path)
}

#[tauri::command]
fn save_file(path: String, contents: String) -> Result<FileMetadata, AppError> {
    let path = normalized_path(path)?;
    fs::write(&path, contents)?;
    metadata_for(&path)
}

#[tauri::command]
fn updater_transport_enabled() -> bool {
    cfg!(feature = "updater-full")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build());

    #[cfg(feature = "updater-full")]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .invoke_handler(tauri::generate_handler![
            inspect_file,
            load_file,
            save_file,
            updater_transport_enabled
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
