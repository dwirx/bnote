use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

const MAX_EDITABLE_BYTES: u64 = 5 * 1024 * 1024;

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

fn document_for(path: &Path) -> Result<FileDocument, AppError> {
    let meta = metadata_for(path)?;

    if meta.size > MAX_EDITABLE_BYTES {
        return Ok(FileDocument {
            path: meta.path,
            name: meta.name,
            extension: meta.extension,
            size: meta.size,
            modified: meta.modified,
            kind: "binary".into(),
            content: None,
            encoding: "too-large".into(),
            line_count: 0,
        });
    }

    let bytes = fs::read(path)?;
    if bytes.iter().any(|byte| *byte == 0) {
        return Ok(FileDocument {
            path: meta.path,
            name: meta.name,
            extension: meta.extension,
            size: meta.size,
            modified: meta.modified,
            kind: "binary".into(),
            content: None,
            encoding: "binary".into(),
            line_count: 0,
        });
    }

    match String::from_utf8(bytes) {
        Ok(content) => {
            let line_count = if content.is_empty() {
                0
            } else {
                content.lines().count()
            };

            Ok(FileDocument {
                path: meta.path,
                name: meta.name,
                extension: meta.extension,
                size: meta.size,
                modified: meta.modified,
                kind: "text".into(),
                content: Some(content),
                encoding: "utf-8".into(),
                line_count,
            })
        }
        Err(_) => Ok(FileDocument {
            path: meta.path,
            name: meta.name,
            extension: meta.extension,
            size: meta.size,
            modified: meta.modified,
            kind: "binary".into(),
            content: None,
            encoding: "binary".into(),
            line_count: 0,
        }),
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![inspect_file, load_file, save_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
