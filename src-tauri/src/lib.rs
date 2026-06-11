use base64::{engine::general_purpose, Engine as _};
use image::{ImageFormat, ImageReader};
use mobi::Mobi;
use pdfium_render::prelude::*;
use rbook::Epub;
use regex::{Captures, Regex};
use serde::Serialize;
use std::{
    cmp::Ordering,
    fs::{self, File},
    io::{Cursor, Read},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::UNIX_EPOCH,
};
use tauri::Manager;
use unrar_ng::Archive;
use zip::ZipArchive;

const MAX_EDITABLE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_PREVIEW_BYTES: u64 = 512 * 1024;
const MAX_NATIVE_VIEWER_BYTES: u64 = 150 * 1024 * 1024;
const MAX_IMAGE_PAGE_BYTES: u64 = 100 * 1024 * 1024;
const MAX_FOLDER_DEPTH: usize = 3;
const MAX_FOLDER_ENTRIES: usize = 500;
const SKIPPED_FOLDER_NAMES: &[&str] = &[".git", "dist", "node_modules", "target"];
const IMAGE_FILE_EXTENSIONS: &[&str] = &[
    "apng", "arw", "avif", "bmp", "cr2", "cr3", "dib", "dng", "gif", "heic", "heif", "ico",
    "j2k", "jfif", "jp2", "jpe", "jpeg", "jpg", "jxl", "nef", "nrw", "orf", "pbm", "pef",
    "pgm", "png", "pnm", "ppm", "qoi", "raf", "raw", "rw2", "rwl", "sr2", "srf", "srw", "svg",
    "svgz", "tga", "tif", "tiff", "webp", "x3f",
];
const SUPPORTED_FOLDER_FILE_EXTENSIONS: &[&str] = &[
    "apng", "arw", "avif", "azw3", "bat", "bmp", "c", "cbr", "cbz", "conf", "cpp", "cr2",
    "cr3", "cs", "css", "csv", "dib", "dng", "doc", "docx", "epub", "gif", "go", "heic",
    "heif", "html", "ico", "ini", "j2k", "java", "jfif", "jp2", "jpe", "jpeg", "jpg", "js",
    "json", "jsx", "jxl", "kfx", "log", "lua", "md", "mdx", "mobi", "nef", "nrw", "orf",
    "pbm", "pdf", "pef", "pgm", "php", "png", "pnm", "ppm", "py", "qoi", "raf", "raw", "rs",
    "rw2", "rwl", "sh", "sql", "sr2", "srf", "srw", "svg", "svgz", "svelte", "tga", "tif",
    "tiff", "toml", "ts", "tsx", "txt", "vue", "webp", "x3f", "xml", "yaml", "yml",
];
const MAX_COMIC_PAGES: usize = 2000;
const MAX_COMIC_PAGE_BYTES: u64 = 35 * 1024 * 1024;
static PDFIUM: OnceLock<Pdfium> = OnceLock::new();
static PDF_DOCUMENT_CACHE: OnceLock<Mutex<Option<CachedPdfDocument>>> = OnceLock::new();

#[derive(Debug)]
enum AppError {
    Io(String),
    InvalidPath(String),
    Unsupported(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        match self {
            Self::Io(message) | Self::InvalidPath(message) | Self::Unsupported(message) => {
                serializer.serialize_str(message)
            }
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

#[derive(Clone, PartialEq, Eq)]
struct PdfDocumentCacheKey {
    path: String,
    size: u64,
    modified: Option<u64>,
}

struct CachedPdfDocument {
    key: PdfDocumentCacheKey,
    document: PdfDocument<'static>,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PathInspection {
    path: String,
    name: String,
    is_file: bool,
    is_dir: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderTreeNode {
    path: String,
    name: String,
    kind: String,
    extension: Option<String>,
    size: Option<u64>,
    modified: Option<u64>,
    children: Vec<FolderTreeNode>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderTree {
    root: FolderTreeNode,
    truncated: bool,
    entry_count: usize,
    max_depth: usize,
    max_entries: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TocNode {
    id: String,
    title: String,
    target: String,
    page_index: Option<usize>,
    children: Vec<TocNode>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PdfPageInfo {
    index: usize,
    width: f32,
    height: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PdfInfo {
    path: String,
    name: String,
    size: u64,
    page_count: usize,
    pages: Vec<PdfPageInfo>,
    toc: Vec<TocNode>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PdfPageRender {
    page_index: usize,
    width: u32,
    height: u32,
    mime_type: String,
    data_base64: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ComicPageInfo {
    index: usize,
    name: String,
    size: u64,
    mime_type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ComicInfo {
    path: String,
    name: String,
    size: u64,
    page_count: usize,
    pages: Vec<ComicPageInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ComicPageRender {
    page_index: usize,
    name: String,
    mime_type: String,
    width: Option<u32>,
    height: Option<u32>,
    data_base64: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EpubSpineItem {
    index: usize,
    href: String,
    label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EpubInfo {
    path: String,
    name: String,
    size: u64,
    title: Option<String>,
    creators: Vec<String>,
    toc: Vec<TocNode>,
    spine: Vec<EpubSpineItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EpubChapter {
    href: String,
    title: Option<String>,
    spine_index: Option<usize>,
    previous_href: Option<String>,
    next_href: Option<String>,
    html: String,
}

fn normalized_path(path: String) -> Result<PathBuf, AppError> {
    if path.trim().is_empty() {
        return Err(AppError::InvalidPath("No file path was provided.".into()));
    }

    Ok(PathBuf::from(path))
}

fn path_name(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_else(|| path.to_str().unwrap_or("Untitled"))
        .to_string()
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
        name: path_name(path),
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

fn extension_is(meta: &FileMetadata, expected: &str) -> bool {
    meta.extension
        .as_deref()
        .map(|extension| extension.eq_ignore_ascii_case(expected))
        .unwrap_or(false)
}

fn extension_in(meta: &FileMetadata, candidates: &[&str]) -> bool {
    meta.extension
        .as_deref()
        .map(|extension| {
            candidates
                .iter()
                .any(|candidate| candidate.eq_ignore_ascii_case(extension))
        })
        .unwrap_or(false)
}

fn is_image_file(meta: &FileMetadata) -> bool {
    extension_in(meta, IMAGE_FILE_EXTENSIONS)
}

fn document_from_kind(meta: FileMetadata, kind: &str, encoding: &str) -> FileDocument {
    FileDocument {
        path: meta.path,
        name: meta.name,
        extension: meta.extension,
        size: meta.size,
        modified: meta.modified,
        kind: kind.into(),
        content: None,
        encoding: encoding.into(),
        line_count: 0,
        editable: false,
        truncated: false,
        preview_bytes: 0,
    }
}

fn read_only_document(
    meta: FileMetadata,
    kind: &str,
    encoding: &str,
    content: Option<String>,
) -> FileDocument {
    let line_count = content.as_deref().map(line_count).unwrap_or(0);
    let preview_bytes = content
        .as_ref()
        .map(|value| value.len() as u64)
        .unwrap_or(0);

    FileDocument {
        path: meta.path,
        name: meta.name,
        extension: meta.extension,
        size: meta.size,
        modified: meta.modified,
        kind: kind.into(),
        content,
        encoding: encoding.into(),
        line_count,
        editable: false,
        truncated: false,
        preview_bytes,
    }
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

fn collapse_whitespace(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn strip_html_text(html: &str) -> String {
    let without_scripts = Regex::new(r"(?is)<script[^>]*>.*?</script>")
        .expect("valid regex")
        .replace_all(html, "");
    let without_scripts = Regex::new(r"(?is)<style[^>]*>.*?</style>")
        .expect("valid regex")
        .replace_all(&without_scripts, "");
    let with_breaks = Regex::new(r"(?i)</?(p|div|br|h[1-6]|li|section|article|tr)[^>]*>")
        .expect("valid regex")
        .replace_all(&without_scripts, "\n");
    let without_tags = Regex::new(r"(?is)<[^>]+>")
        .expect("valid regex")
        .replace_all(&with_breaks, "");
    collapse_whitespace(
        &without_tags
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'"),
    )
}

fn office_document(path: &Path, meta: FileMetadata) -> FileDocument {
    match docx_lite::extract_text(path) {
        Ok(text) if !text.trim().is_empty() => {
            read_only_document(meta, "office", "office", Some(collapse_whitespace(&text)))
        }
        Ok(_) => read_only_document(
            meta,
            "office",
            "office",
            Some("This DOCX did not contain readable text.".into()),
        ),
        Err(error) => read_only_document(
            meta,
            "office",
            "office",
            Some(format!(
                "BNote could not extract text from this DOCX. Use Open External to view it.\n\n{error}"
            )),
        ),
    }
}

fn kindle_document(path: &Path, meta: FileMetadata) -> FileDocument {
    match Mobi::from_path(path) {
        Ok(book) => {
            let mut sections = Vec::new();
            let title = book.title();
            if !title.trim().is_empty() {
                sections.push(format!("# {title}"));
            }
            if let Some(author) = book.author().filter(|value| !value.trim().is_empty()) {
                sections.push(format!("Author: {author}"));
            }

            let content = strip_html_text(&book.content_as_string_lossy());
            if !content.trim().is_empty() {
                sections.push(content);
            }

            if sections.is_empty() {
                sections.push("This Kindle file opened, but no readable text was found.".into());
            }

            read_only_document(meta, "kindle", "kindle", Some(sections.join("\n\n")))
        }
        Err(error) => read_only_document(
            meta,
            "kindle",
            "kindle",
            Some(format!(
                "BNote could not render this Kindle file. It may be DRM-protected, encrypted, or use an unsupported Kindle variant.\n\n{error}"
            )),
        ),
    }
}

fn document_for(path: &Path) -> Result<FileDocument, AppError> {
    let meta = metadata_for(path)?;

    if extension_is(&meta, "pdf") {
        return Ok(document_from_kind(meta, "pdf", "pdf"));
    }

    if extension_is(&meta, "epub") {
        return Ok(document_from_kind(meta, "epub", "epub"));
    }

    if extension_is(&meta, "docx") {
        return Ok(office_document(path, meta));
    }

    if extension_is(&meta, "doc") {
        return Ok(read_only_document(
            meta,
            "office",
            "office-legacy",
            Some(
                "Legacy .doc files are not rendered natively yet. Use Open External to view this document."
                    .into(),
            ),
        ));
    }

    if extension_is(&meta, "mobi") || extension_is(&meta, "azw3") {
        return Ok(kindle_document(path, meta));
    }

    if extension_is(&meta, "kfx") {
        return Ok(read_only_document(
            meta,
            "kindle",
            "kindle-unsupported",
            Some(
                "KFX is a proprietary Kindle format and is not rendered natively. Use Open External to view this file."
                    .into(),
            ),
        ));
    }

    if extension_is(&meta, "cbz") || extension_is(&meta, "cbr") {
        return Ok(document_from_kind(meta, "comic", "comic"));
    }

    if is_image_file(&meta) {
        return Ok(document_from_kind(meta, "image", "image"));
    }

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

fn is_supported_folder_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|extension| {
            SUPPORTED_FOLDER_FILE_EXTENSIONS
                .iter()
                .any(|candidate| candidate.eq_ignore_ascii_case(extension))
        })
        .unwrap_or(false)
}

fn folder_node_for_file(path: &Path) -> Result<FolderTreeNode, AppError> {
    let meta = metadata_for(path)?;
    Ok(FolderTreeNode {
        path: meta.path,
        name: meta.name,
        kind: "file".into(),
        extension: meta.extension,
        size: Some(meta.size),
        modified: meta.modified,
        children: Vec::new(),
    })
}

fn folder_node_for_directory(path: &Path) -> Result<FolderTreeNode, AppError> {
    Ok(FolderTreeNode {
        path: path.to_string_lossy().into_owned(),
        name: path_name(path),
        kind: "folder".into(),
        extension: None,
        size: None,
        modified: None,
        children: Vec::new(),
    })
}

fn read_folder_node(
    path: &Path,
    depth: usize,
    entry_count: &mut usize,
    truncated: &mut bool,
) -> Result<FolderTreeNode, AppError> {
    let mut node = folder_node_for_directory(path)?;
    if depth >= MAX_FOLDER_DEPTH {
        return Ok(node);
    }

    let mut folders = Vec::new();
    let mut files = Vec::new();

    for entry in fs::read_dir(path)? {
        if *entry_count >= MAX_FOLDER_ENTRIES {
            *truncated = true;
            break;
        }

        let Ok(entry) = entry else {
            continue;
        };
        let child_path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();

        if child_path.is_dir() {
            if SKIPPED_FOLDER_NAMES
                .iter()
                .any(|candidate| candidate.eq_ignore_ascii_case(&name))
            {
                continue;
            }
            folders.push(child_path);
        } else if child_path.is_file() && is_supported_folder_file(&child_path) {
            files.push(child_path);
        }
    }

    folders.sort_by_key(|candidate| path_name(candidate).to_lowercase());
    files.sort_by_key(|candidate| path_name(candidate).to_lowercase());

    for folder in folders {
        if *entry_count >= MAX_FOLDER_ENTRIES {
            *truncated = true;
            break;
        }
        *entry_count += 1;
        if let Ok(child) = read_folder_node(&folder, depth + 1, entry_count, truncated) {
            node.children.push(child);
        }
    }

    for file in files {
        if *entry_count >= MAX_FOLDER_ENTRIES {
            *truncated = true;
            break;
        }
        *entry_count += 1;
        node.children.push(folder_node_for_file(&file)?);
    }

    Ok(node)
}

fn document_error(context: &str, error: impl std::fmt::Display) -> AppError {
    AppError::Unsupported(format!("{context}: {error}"))
}

fn native_viewer_meta(path: &Path) -> Result<FileMetadata, AppError> {
    let meta = metadata_for(path)?;
    if meta.size > MAX_NATIVE_VIEWER_BYTES {
        return Err(AppError::Unsupported(format!(
            "{} is too large for the native reader. Open it externally instead.",
            meta.name
        )));
    }
    Ok(meta)
}

fn image_mime_type(name: &str) -> Option<&'static str> {
    let extension = name.rsplit('.').next()?.to_ascii_lowercase();
    match extension.as_str() {
        "jpg" | "jpeg" | "jpe" | "jfif" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "apng" => Some("image/apng"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "bmp" | "dib" => Some("image/bmp"),
        "svg" | "svgz" => Some("image/svg+xml"),
        "avif" => Some("image/avif"),
        "heic" => Some("image/heic"),
        "heif" => Some("image/heif"),
        "tif" | "tiff" => Some("image/tiff"),
        "ico" => Some("image/x-icon"),
        "jp2" | "j2k" => Some("image/jp2"),
        "jxl" => Some("image/jxl"),
        "tga" => Some("image/x-tga"),
        "qoi" => Some("image/qoi"),
        "pnm" | "pbm" | "pgm" | "ppm" => Some("image/x-portable-anymap"),
        "dng" => Some("image/x-adobe-dng"),
        "cr2" => Some("image/x-canon-cr2"),
        "cr3" => Some("image/x-canon-cr3"),
        "nef" | "nrw" => Some("image/x-nikon-nef"),
        "arw" | "srf" | "sr2" => Some("image/x-sony-arw"),
        "orf" => Some("image/x-olympus-orf"),
        "rw2" | "rwl" => Some("image/x-panasonic-raw"),
        "raf" => Some("image/x-fuji-raf"),
        "pef" => Some("image/x-pentax-pef"),
        "srw" => Some("image/x-samsung-srw"),
        "x3f" => Some("image/x-sigma-x3f"),
        "raw" => Some("image/x-raw"),
        _ => None,
    }
}

fn should_decode_image_to_png(name: &str) -> bool {
    let Some(extension) = name.rsplit('.').next().map(|value| value.to_ascii_lowercase()) else {
        return false;
    };
    matches!(
        extension.as_str(),
        "tif" | "tiff" | "tga" | "qoi" | "pnm" | "pbm" | "pgm" | "ppm"
    )
}

fn decoded_image_as_png(path: &Path) -> Result<Vec<u8>, AppError> {
    let image = ImageReader::open(path)?
        .with_guessed_format()
        .map_err(|error| document_error("Unable to inspect image", error))?
        .decode()
        .map_err(|error| document_error("Unable to decode image", error))?;
    let mut png = Cursor::new(Vec::new());
    image
        .write_to(&mut png, ImageFormat::Png)
        .map_err(|error| document_error("Unable to encode image preview", error))?;
    Ok(png.into_inner())
}

fn image_dimensions_from_bytes(bytes: &[u8]) -> (Option<u32>, Option<u32>) {
    match ImageReader::new(Cursor::new(bytes)).with_guessed_format() {
        Ok(reader) => match reader.into_dimensions() {
            Ok((width, height)) => (Some(width), Some(height)),
            Err(_) => (None, None),
        },
        Err(_) => (None, None),
    }
}

fn natural_compare(left: &str, right: &str) -> Ordering {
    let mut left_chars = left.chars().peekable();
    let mut right_chars = right.chars().peekable();

    loop {
        match (left_chars.peek(), right_chars.peek()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(left_char), Some(right_char))
                if left_char.is_ascii_digit() && right_char.is_ascii_digit() =>
            {
                let mut left_number = String::new();
                let mut right_number = String::new();

                while left_chars
                    .peek()
                    .map(|value| value.is_ascii_digit())
                    .unwrap_or(false)
                {
                    if let Some(value) = left_chars.next() {
                        left_number.push(value);
                    }
                }

                while right_chars
                    .peek()
                    .map(|value| value.is_ascii_digit())
                    .unwrap_or(false)
                {
                    if let Some(value) = right_chars.next() {
                        right_number.push(value);
                    }
                }

                let ordering = left_number
                    .trim_start_matches('0')
                    .len()
                    .cmp(&right_number.trim_start_matches('0').len())
                    .then_with(|| {
                        left_number
                            .trim_start_matches('0')
                            .cmp(right_number.trim_start_matches('0'))
                    })
                    .then_with(|| left_number.len().cmp(&right_number.len()));
                if ordering != Ordering::Equal {
                    return ordering;
                }
            }
            (Some(left_char), Some(right_char)) => {
                let ordering = left_char
                    .to_ascii_lowercase()
                    .cmp(&right_char.to_ascii_lowercase());
                left_chars.next();
                right_chars.next();
                if ordering != Ordering::Equal {
                    return ordering;
                }
            }
        }
    }
}

fn sorted_comic_pages(mut pages: Vec<ComicPageInfo>) -> Vec<ComicPageInfo> {
    pages.sort_by(|left, right| natural_compare(&left.name, &right.name));
    for (index, page) in pages.iter_mut().enumerate() {
        page.index = index;
    }
    pages
}

fn cbz_pages(path: &Path) -> Result<Vec<ComicPageInfo>, AppError> {
    let file = File::open(path)?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| document_error("Unable to open CBZ", error))?;
    let mut pages = Vec::new();

    for index in 0..archive.len() {
        let file = archive
            .by_index(index)
            .map_err(|error| document_error("Unable to inspect CBZ", error))?;
        if !file.is_file() {
            continue;
        }

        let name = file.name().replace('\\', "/");
        let Some(mime_type) = image_mime_type(&name) else {
            continue;
        };
        if file.size() > MAX_COMIC_PAGE_BYTES {
            continue;
        }

        pages.push(ComicPageInfo {
            index: pages.len(),
            name,
            size: file.size(),
            mime_type: mime_type.into(),
        });

        if pages.len() >= MAX_COMIC_PAGES {
            break;
        }
    }

    Ok(sorted_comic_pages(pages))
}

fn cbr_pages(path: &Path) -> Result<Vec<ComicPageInfo>, AppError> {
    let archive = Archive::new(path)
        .open_for_listing()
        .map_err(|error| document_error("Unable to open CBR", error))?;
    let mut pages = Vec::new();

    for entry in archive {
        let entry = entry.map_err(|error| document_error("Unable to inspect CBR", error))?;
        if !entry.is_file() {
            continue;
        }

        let name = entry.filename.to_string_lossy().replace('\\', "/");
        let Some(mime_type) = image_mime_type(&name) else {
            continue;
        };
        if entry.unpacked_size > MAX_COMIC_PAGE_BYTES {
            continue;
        }

        pages.push(ComicPageInfo {
            index: pages.len(),
            name,
            size: entry.unpacked_size,
            mime_type: mime_type.into(),
        });

        if pages.len() >= MAX_COMIC_PAGES {
            break;
        }
    }

    Ok(sorted_comic_pages(pages))
}

fn comic_pages(path: &Path, meta: &FileMetadata) -> Result<Vec<ComicPageInfo>, AppError> {
    if extension_is(meta, "cbz") {
        cbz_pages(path)
    } else if extension_is(meta, "cbr") {
        cbr_pages(path)
    } else {
        Err(AppError::Unsupported("Unsupported comic archive.".into()))
    }
}

fn comic_info_impl(path: String) -> Result<ComicInfo, AppError> {
    let path = normalized_path(path)?;
    let meta = native_viewer_meta(&path)?;
    let pages = comic_pages(&path, &meta)?;

    if pages.is_empty() {
        return Err(AppError::Unsupported(
            "This comic archive does not contain supported image pages.".into(),
        ));
    }

    Ok(ComicInfo {
        path: meta.path,
        name: meta.name,
        size: meta.size,
        page_count: pages.len(),
        pages,
    })
}

fn image_info_impl(path: String) -> Result<ComicInfo, AppError> {
    let path = normalized_path(path)?;
    let meta = native_viewer_meta(&path)?;
    if !is_image_file(&meta) {
        return Err(AppError::Unsupported(
            "This file is not recognized as an image.".into(),
        ));
    }

    let mime_type = image_mime_type(&meta.name).unwrap_or("application/octet-stream");
    Ok(ComicInfo {
        path: meta.path.clone(),
        name: meta.name.clone(),
        size: meta.size,
        page_count: 1,
        pages: vec![ComicPageInfo {
            index: 0,
            name: meta.name,
            size: meta.size,
            mime_type: mime_type.into(),
        }],
    })
}

fn read_cbz_page(path: &Path, page_name: &str) -> Result<Vec<u8>, AppError> {
    let file = File::open(path)?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| document_error("Unable to open CBZ", error))?;
    let mut page = archive
        .by_name(page_name)
        .map_err(|error| document_error("Unable to read CBZ page", error))?;

    if page.size() > MAX_COMIC_PAGE_BYTES {
        return Err(AppError::Unsupported(format!(
            "{page_name} is too large to preview."
        )));
    }

    let mut bytes = Vec::with_capacity(page.size() as usize);
    page.read_to_end(&mut bytes)?;
    Ok(bytes)
}

fn read_cbr_page(path: &Path, page_name: &str) -> Result<Vec<u8>, AppError> {
    let mut archive = Archive::new(path)
        .open_for_processing()
        .map_err(|error| document_error("Unable to open CBR", error))?;

    while let Some(header) = archive
        .read_header()
        .map_err(|error| document_error("Unable to read CBR", error))?
    {
        let entry_name = header.entry().filename.to_string_lossy().replace('\\', "/");
        if header.entry().is_file() && entry_name == page_name {
            if header.entry().unpacked_size > MAX_COMIC_PAGE_BYTES {
                return Err(AppError::Unsupported(format!(
                    "{page_name} is too large to preview."
                )));
            }
            let (bytes, _rest) = header
                .read()
                .map_err(|error| document_error("Unable to read CBR page", error))?;
            return Ok(bytes);
        }

        archive = header
            .skip()
            .map_err(|error| document_error("Unable to skip CBR page", error))?;
    }

    Err(AppError::InvalidPath(format!(
        "Comic page was not found: {page_name}"
    )))
}

fn comic_page_impl(path: String, page_index: usize) -> Result<ComicPageRender, AppError> {
    let path = normalized_path(path)?;
    let meta = native_viewer_meta(&path)?;
    let pages = comic_pages(&path, &meta)?;
    let page = pages.get(page_index).ok_or_else(|| {
        AppError::InvalidPath(format!("Page {} is outside this comic.", page_index + 1))
    })?;

    let bytes = if extension_is(&meta, "cbz") {
        read_cbz_page(&path, &page.name)?
    } else {
        read_cbr_page(&path, &page.name)?
    };
    let (width, height) = image_dimensions_from_bytes(&bytes);

    Ok(ComicPageRender {
        page_index,
        name: page.name.clone(),
        mime_type: page.mime_type.clone(),
        width,
        height,
        data_base64: general_purpose::STANDARD.encode(bytes),
    })
}

fn image_page_impl(path: String, page_index: usize) -> Result<ComicPageRender, AppError> {
    if page_index != 0 {
        return Err(AppError::InvalidPath(format!(
            "Page {} is outside this image.",
            page_index + 1
        )));
    }

    let path = normalized_path(path)?;
    let meta = native_viewer_meta(&path)?;
    if !is_image_file(&meta) {
        return Err(AppError::Unsupported(
            "This file is not recognized as an image.".into(),
        ));
    }
    if meta.size > MAX_IMAGE_PAGE_BYTES {
        return Err(AppError::Unsupported(format!(
            "{} is too large to preview as an image. Open it externally instead.",
            meta.name
        )));
    }

    let (mime_type, bytes) = if should_decode_image_to_png(&meta.name) {
        ("image/png".to_string(), decoded_image_as_png(&path)?)
    } else {
        (
            image_mime_type(&meta.name)
                .unwrap_or("application/octet-stream")
                .to_string(),
            fs::read(&path)?,
        )
    };
    let (width, height) = image_dimensions_from_bytes(&bytes);

    Ok(ComicPageRender {
        page_index,
        name: meta.name,
        mime_type,
        width,
        height,
        data_base64: general_purpose::STANDARD.encode(bytes),
    })
}

fn pdfium_candidate_paths(resource_dir: Option<PathBuf>) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("pdfium.dll"));
            candidates.push(
                dir.join("resources")
                    .join("pdfium")
                    .join("windows-x64")
                    .join("pdfium.dll"),
            );
        }
    }

    if let Some(resource_dir) = resource_dir {
        candidates.push(
            resource_dir
                .join("pdfium")
                .join("windows-x64")
                .join("pdfium.dll"),
        );
        candidates.push(
            resource_dir
                .join("resources")
                .join("pdfium")
                .join("windows-x64")
                .join("pdfium.dll"),
        );
    }

    candidates.push(
        PathBuf::from("src-tauri")
            .join("resources")
            .join("pdfium")
            .join("windows-x64")
            .join("pdfium.dll"),
    );
    candidates.push(
        PathBuf::from("resources")
            .join("pdfium")
            .join("windows-x64")
            .join("pdfium.dll"),
    );

    candidates
}

fn remember_pdfium(pdfium: Pdfium) -> &'static Pdfium {
    let _ = PDFIUM.set(pdfium);
    PDFIUM
        .get()
        .expect("PDFium should be initialized before use")
}

fn pdfium_ref(candidates: &[PathBuf]) -> Result<&'static Pdfium, AppError> {
    if let Some(pdfium) = PDFIUM.get() {
        return Ok(pdfium);
    }

    let mut last_error = None;

    for candidate in candidates {
        if !candidate.exists() {
            continue;
        }

        match Pdfium::bind_to_library(candidate) {
            Ok(bindings) => {
                return Ok(remember_pdfium(Pdfium::new(bindings)));
            }
            Err(PdfiumError::PdfiumLibraryBindingsAlreadyInitialized) => {
                if let Some(pdfium) = PDFIUM.get() {
                    return Ok(pdfium);
                }
                return Ok(remember_pdfium(Pdfium::default()));
            }
            Err(error) => last_error = Some(format!("{} ({error})", candidate.display())),
        }
    }

    match Pdfium::bind_to_system_library() {
        Ok(bindings) => Ok(remember_pdfium(Pdfium::new(bindings))),
        Err(PdfiumError::PdfiumLibraryBindingsAlreadyInitialized) => {
            if let Some(pdfium) = PDFIUM.get() {
                return Ok(pdfium);
            }
            Ok(remember_pdfium(Pdfium::default()))
        }
        Err(error) => Err({
            AppError::Unsupported(format!(
                "Pdfium is unavailable. Bundle pdfium.dll or install a system Pdfium library. System lookup failed: {error}.{}",
                last_error
                    .map(|message| format!(" Last attempted library: {message}."))
                    .unwrap_or_default()
            ))
        }),
    }
}

fn pdf_document_cache() -> &'static Mutex<Option<CachedPdfDocument>> {
    PDF_DOCUMENT_CACHE.get_or_init(|| Mutex::new(None))
}

fn pdf_cache_key(meta: &FileMetadata) -> PdfDocumentCacheKey {
    PdfDocumentCacheKey {
        path: meta.path.clone(),
        size: meta.size,
        modified: meta.modified,
    }
}

fn with_pdf_document<T>(
    path: &Path,
    pdfium_candidates: &[PathBuf],
    read_document: impl FnOnce(&PdfDocument<'static>, &FileMetadata) -> Result<T, AppError>,
) -> Result<T, AppError> {
    let meta = native_viewer_meta(path)?;
    let key = pdf_cache_key(&meta);
    let mut cache = pdf_document_cache()
        .lock()
        .map_err(|_| AppError::Unsupported("PDF document cache is unavailable.".into()))?;

    let should_load = cache
        .as_ref()
        .map(|cached| cached.key != key)
        .unwrap_or(true);

    if should_load {
        let pdfium = pdfium_ref(pdfium_candidates)?;
        let bytes = fs::read(path)?;
        let document = pdfium
            .load_pdf_from_byte_vec(bytes, None)
            .map_err(|error| document_error("Unable to open PDF", error))?;
        *cache = Some(CachedPdfDocument {
            key: key.clone(),
            document,
        });
    }

    let cached = cache
        .as_ref()
        .ok_or_else(|| AppError::Unsupported("PDF document cache did not load.".into()))?;
    read_document(&cached.document, &meta)
}

fn pdf_bookmark_node(bookmark: PdfBookmark<'_>, serial: &mut usize) -> TocNode {
    *serial += 1;
    let page_index = bookmark
        .destination()
        .and_then(|destination| destination.page_index().ok())
        .map(|index| index as usize);

    TocNode {
        id: format!("pdf-bookmark-{serial}"),
        title: bookmark
            .title()
            .filter(|title| !title.trim().is_empty())
            .unwrap_or_else(|| "Untitled bookmark".into()),
        target: page_index
            .map(|index| index.to_string())
            .unwrap_or_else(|| format!("bookmark-{serial}")),
        page_index,
        children: bookmark
            .iter_direct_children()
            .map(|child| pdf_bookmark_node(child, serial))
            .collect(),
    }
}

fn pdf_info_impl(path: String, pdfium_candidates: Vec<PathBuf>) -> Result<PdfInfo, AppError> {
    let path = normalized_path(path)?;
    with_pdf_document(&path, &pdfium_candidates, |document, meta| {
        let page_count = document.pages().len() as usize;
        let mut pages = Vec::with_capacity(page_count);
        for index in 0..page_count {
            let page = document
                .pages()
                .get(index as PdfPageIndex)
                .map_err(|error| document_error("Unable to inspect PDF page", error))?;
            pages.push(PdfPageInfo {
                index,
                width: page.width().value,
                height: page.height().value,
            });
        }

        let mut serial = 0;
        let toc = document
            .bookmarks()
            .root()
            .map(|root| pdf_bookmark_node(root, &mut serial))
            .map(|root| {
                if root.page_index.is_none() && !root.children.is_empty() {
                    root.children
                } else {
                    vec![root]
                }
            })
            .unwrap_or_default();

        Ok(PdfInfo {
            path: meta.path.clone(),
            name: meta.name.clone(),
            size: meta.size,
            page_count,
            pages,
            toc,
        })
    })
}

fn pdf_render_page_impl(
    path: String,
    page_index: usize,
    target_width: u32,
    pdfium_candidates: Vec<PathBuf>,
) -> Result<PdfPageRender, AppError> {
    let path = normalized_path(path)?;
    with_pdf_document(&path, &pdfium_candidates, |document, _meta| {
        let page_count = document.pages().len() as usize;

        if page_index >= page_count {
            return Err(AppError::InvalidPath(format!(
                "Page {} is outside this PDF.",
                page_index + 1
            )));
        }

        let page = document
            .pages()
            .get(page_index as PdfPageIndex)
            .map_err(|error| document_error("Unable to render PDF page", error))?;
        let width = target_width.clamp(320, 2600) as Pixels;
        let image = page
            .render_with_config(&PdfRenderConfig::new().set_target_width(width))
            .map_err(|error| document_error("Unable to render PDF page", error))?
            .as_image()
            .map_err(|error| document_error("Unable to render PDF page", error))?;

        let mut png = Cursor::new(Vec::new());
        image
            .write_to(&mut png, ImageFormat::Png)
            .map_err(|error| document_error("Unable to encode PDF page", error))?;

        Ok(PdfPageRender {
            page_index,
            width: image.width(),
            height: image.height(),
            mime_type: "image/png".into(),
            data_base64: general_purpose::STANDARD.encode(png.into_inner()),
        })
    })
}

fn strip_href_anchor(href: &str) -> &str {
    href.split(['#', '?']).next().unwrap_or(href)
}

fn normalize_epub_href(base_href: &str, raw_href: &str) -> String {
    let path = strip_href_anchor(raw_href).trim();
    if path.is_empty() {
        return String::new();
    }
    if path.starts_with('/') {
        return normalize_epub_path(path);
    }

    let base = strip_href_anchor(base_href);
    let base_dir = base.rsplit_once('/').map(|(dir, _)| dir).unwrap_or("");
    normalize_epub_path(&format!("{base_dir}/{path}"))
}

fn normalize_epub_path(path: &str) -> String {
    let mut parts = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            value => parts.push(value),
        }
    }
    format!("/{}", parts.join("/"))
}

fn epub_toc_node(entry: rbook::epub::toc::EpubTocEntry<'_>, serial: &mut usize) -> TocNode {
    *serial += 1;
    let href = entry
        .href()
        .map(|href| href.as_str().to_string())
        .unwrap_or_default();

    TocNode {
        id: entry
            .id()
            .map(|id| format!("epub-{id}"))
            .unwrap_or_else(|| format!("epub-toc-{serial}")),
        title: entry.label().to_string(),
        page_index: None,
        target: href,
        children: entry
            .iter()
            .map(|child| epub_toc_node(child, serial))
            .collect(),
    }
}

fn epub_toc(epub: &Epub) -> Vec<TocNode> {
    let mut serial = 0;
    epub.toc()
        .contents()
        .map(|root| {
            root.iter()
                .map(|entry| epub_toc_node(entry, &mut serial))
                .collect()
        })
        .unwrap_or_default()
}

fn epub_spine(epub: &Epub) -> Vec<EpubSpineItem> {
    epub.spine()
        .iter()
        .filter_map(|entry| {
            let manifest = entry.manifest_entry()?;
            Some(EpubSpineItem {
                index: entry.order(),
                href: manifest.href().as_str().to_string(),
                label: manifest.id().to_string(),
            })
        })
        .collect()
}

fn epub_info_impl(path: String) -> Result<EpubInfo, AppError> {
    let path = normalized_path(path)?;
    let meta = native_viewer_meta(&path)?;
    let epub = Epub::open(&path).map_err(|error| document_error("Unable to open EPUB", error))?;
    let metadata = epub.metadata();
    let title = metadata.title().map(|title| title.value().to_string());
    let creators = metadata
        .creators()
        .map(|creator| creator.value().to_string())
        .collect();

    Ok(EpubInfo {
        path: meta.path,
        name: meta.name,
        size: meta.size,
        title,
        creators,
        toc: epub_toc(&epub),
        spine: epub_spine(&epub),
    })
}

fn is_external_epub_href(href: &str) -> bool {
    let lower = href.trim_start().to_ascii_lowercase();
    lower.starts_with('#')
        || lower.starts_with("data:")
        || lower.starts_with("http:")
        || lower.starts_with("https:")
        || lower.starts_with("mailto:")
        || lower.starts_with("javascript:")
}

fn inline_epub_resources(epub: &Epub, chapter_href: &str, html: &str) -> String {
    let attr_regex = Regex::new(r#"(src|href)\s*=\s*["']([^"']+)["']"#).expect("valid regex");

    attr_regex
        .replace_all(html, |captures: &Captures<'_>| {
            let Some(attr) = captures.get(1).map(|value| value.as_str()) else {
                return captures[0].to_string();
            };
            let Some(raw_value) = captures.get(2).map(|value| value.as_str()) else {
                return captures[0].to_string();
            };

            if is_external_epub_href(raw_value) {
                return captures[0].to_string();
            }

            let resolved = normalize_epub_href(chapter_href, raw_value);
            let Some(entry) = epub.manifest().by_href(&resolved) else {
                return captures[0].to_string();
            };

            let media_type = entry.media_type();
            let should_inline =
                attr.eq_ignore_ascii_case("src") || media_type.eq_ignore_ascii_case("text/css");
            if !should_inline {
                return captures[0].to_string();
            }

            match entry.read_bytes() {
                Ok(bytes) => format!(
                    r#"{attr}="data:{media_type};base64,{}""#,
                    general_purpose::STANDARD.encode(bytes)
                ),
                Err(_) => captures[0].to_string(),
            }
        })
        .into_owned()
}

fn epub_chapter_impl(path: String, href: String) -> Result<EpubChapter, AppError> {
    let path = normalized_path(path)?;
    let _meta = native_viewer_meta(&path)?;
    let epub = Epub::open(&path).map_err(|error| document_error("Unable to open EPUB", error))?;
    let spine = epub_spine(&epub);
    let requested = strip_href_anchor(&href);
    let resolved = if requested.starts_with('/') {
        normalize_epub_path(requested)
    } else {
        normalize_epub_href(
            spine.first().map(|item| item.href.as_str()).unwrap_or("/"),
            requested,
        )
    };

    let manifest = epub
        .manifest()
        .by_href(&resolved)
        .or_else(|| epub.manifest().by_href(strip_href_anchor(&href)))
        .ok_or_else(|| AppError::InvalidPath(format!("EPUB chapter was not found: {href}")))?;
    let html = manifest
        .read_str()
        .map_err(|error| document_error("Unable to read EPUB chapter", error))?;
    let html = inline_epub_resources(&epub, manifest.href().as_str(), &html);
    let spine_index = spine
        .iter()
        .position(|item| strip_href_anchor(&item.href) == manifest.href().path().as_str());
    let previous_href = spine_index
        .and_then(|index| index.checked_sub(1))
        .and_then(|index| spine.get(index))
        .map(|item| item.href.clone());
    let next_href = spine_index
        .and_then(|index| spine.get(index + 1))
        .map(|item| item.href.clone());

    Ok(EpubChapter {
        href: manifest.href().as_str().to_string(),
        title: None,
        spine_index,
        previous_href,
        next_href,
        html,
    })
}

#[tauri::command]
async fn pdf_info(app: tauri::AppHandle, path: String) -> Result<PdfInfo, AppError> {
    let resource_dir = app.path().resource_dir().ok();
    let candidates = pdfium_candidate_paths(resource_dir);
    tauri::async_runtime::spawn_blocking(move || pdf_info_impl(path, candidates))
        .await
        .map_err(|error| AppError::Unsupported(format!("PDF worker failed: {error}")))?
}

#[tauri::command]
async fn pdf_render_page(
    app: tauri::AppHandle,
    path: String,
    page_index: usize,
    target_width: u32,
) -> Result<PdfPageRender, AppError> {
    let resource_dir = app.path().resource_dir().ok();
    let candidates = pdfium_candidate_paths(resource_dir);
    tauri::async_runtime::spawn_blocking(move || {
        pdf_render_page_impl(path, page_index, target_width, candidates)
    })
    .await
    .map_err(|error| AppError::Unsupported(format!("PDF renderer failed: {error}")))?
}

#[tauri::command]
async fn epub_info(path: String) -> Result<EpubInfo, AppError> {
    tauri::async_runtime::spawn_blocking(move || epub_info_impl(path))
        .await
        .map_err(|error| AppError::Unsupported(format!("EPUB worker failed: {error}")))?
}

#[tauri::command]
async fn epub_chapter(path: String, href: String) -> Result<EpubChapter, AppError> {
    tauri::async_runtime::spawn_blocking(move || epub_chapter_impl(path, href))
        .await
        .map_err(|error| AppError::Unsupported(format!("EPUB worker failed: {error}")))?
}

#[tauri::command]
async fn comic_info(path: String) -> Result<ComicInfo, AppError> {
    tauri::async_runtime::spawn_blocking(move || comic_info_impl(path))
        .await
        .map_err(|error| AppError::Unsupported(format!("Comic worker failed: {error}")))?
}

#[tauri::command]
async fn comic_page(path: String, page_index: usize) -> Result<ComicPageRender, AppError> {
    tauri::async_runtime::spawn_blocking(move || comic_page_impl(path, page_index))
        .await
        .map_err(|error| AppError::Unsupported(format!("Comic renderer failed: {error}")))?
}

#[tauri::command]
async fn image_info(path: String) -> Result<ComicInfo, AppError> {
    tauri::async_runtime::spawn_blocking(move || image_info_impl(path))
        .await
        .map_err(|error| AppError::Unsupported(format!("Image worker failed: {error}")))?
}

#[tauri::command]
async fn image_page(path: String, page_index: usize) -> Result<ComicPageRender, AppError> {
    tauri::async_runtime::spawn_blocking(move || image_page_impl(path, page_index))
        .await
        .map_err(|error| AppError::Unsupported(format!("Image renderer failed: {error}")))?
}

#[tauri::command]
fn inspect_file(path: String) -> Result<FileDocument, AppError> {
    let path = normalized_path(path)?;
    document_for(&path)
}

#[tauri::command]
fn inspect_path(path: String) -> Result<PathInspection, AppError> {
    let path = normalized_path(path)?;
    let metadata = fs::metadata(&path)?;

    Ok(PathInspection {
        path: path.to_string_lossy().into_owned(),
        name: path_name(&path),
        is_file: metadata.is_file(),
        is_dir: metadata.is_dir(),
    })
}

#[tauri::command]
fn load_file(path: String) -> Result<FileDocument, AppError> {
    let path = normalized_path(path)?;
    document_for(&path)
}

#[tauri::command]
fn list_folder(path: String) -> Result<FolderTree, AppError> {
    let path = normalized_path(path)?;
    if !path.is_dir() {
        return Err(AppError::InvalidPath(
            "The selected path is not a folder.".into(),
        ));
    }

    let mut entry_count = 0;
    let mut truncated = false;
    let root = read_folder_node(&path, 0, &mut entry_count, &mut truncated)?;

    Ok(FolderTree {
        root,
        truncated,
        entry_count,
        max_depth: MAX_FOLDER_DEPTH,
        max_entries: MAX_FOLDER_ENTRIES,
    })
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

fn startup_paths_from_args<I, S>(args: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .filter_map(|arg| {
            let value = arg.as_ref().trim();
            if value.is_empty() || value.starts_with("--") || value.starts_with("-") {
                return None;
            }
            let path = PathBuf::from(value);
            if path.exists() {
                Some(path.to_string_lossy().into_owned())
            } else {
                None
            }
        })
        .collect()
}

#[tauri::command]
fn startup_paths() -> Vec<String> {
    startup_paths_from_args(std::env::args().skip(1))
}

#[cfg(test)]
mod format_tests {
    use super::*;
    use std::io::Write;
    use zip::{write::SimpleFileOptions, ZipWriter};

    const ONE_PIXEL_PNG: &[u8] = &[
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6,
        0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 4, 0, 9,
        251, 3, 253, 167, 154, 164, 100, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ];

    fn temp_file_with_extension(extension: &str, bytes: &[u8]) -> PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "bnote-format-test-{}-{unique}.{}",
            std::process::id(),
            extension
        ));
        fs::write(&path, bytes).expect("write test file");
        path
    }

    #[test]
    fn new_supported_extensions_are_classified_as_read_only_viewers() {
        let cases = [
            ("docx", "office", "office"),
            ("doc", "office", "office-legacy"),
            ("mobi", "kindle", "kindle"),
            ("azw3", "kindle", "kindle"),
            ("kfx", "kindle", "kindle-unsupported"),
            ("cbz", "comic", "comic"),
            ("cbr", "comic", "comic"),
        ];

        for (extension, expected_kind, expected_encoding) in cases {
            let path = temp_file_with_extension(extension, b"not a real document");
            let document = document_for(&path).expect("classify document");
            assert_eq!(document.kind, expected_kind, "{extension} kind");
            assert_eq!(document.encoding, expected_encoding, "{extension} encoding");
            assert!(!document.editable, "{extension} should be read-only");
            let _ = fs::remove_file(path);
        }
    }

    #[test]
    fn image_extensions_are_classified_as_read_only_image_viewers() {
        let cases = [
            "jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "avif", "heic", "heif", "tif",
            "tiff", "ico", "dng", "raw", "cr2", "cr3", "nef", "nrw", "arw", "srf", "sr2",
            "orf", "rw2", "raf", "pef", "rwl", "srw", "x3f",
        ];

        for extension in cases {
            let path = temp_file_with_extension(extension, b"not a real image");
            let document = document_for(&path).expect("classify image");
            assert_eq!(document.kind, "image", "{extension} kind");
            assert_eq!(document.encoding, "image", "{extension} encoding");
            assert!(!document.editable, "{extension} should be read-only");
            let _ = fs::remove_file(path);
        }
    }

    #[test]
    fn single_image_info_and_page_render_return_the_original_image() {
        let path = temp_file_with_extension("png", ONE_PIXEL_PNG);

        let info = image_info_impl(path.to_string_lossy().into_owned()).expect("image info");
        assert_eq!(info.page_count, 1);
        assert_eq!(info.pages[0].name, path_name(&path));
        assert_eq!(info.pages[0].mime_type, "image/png");

        let page = image_page_impl(path.to_string_lossy().into_owned(), 0).expect("image page");
        assert_eq!(page.page_index, 0);
        assert_eq!(page.name, path_name(&path));
        assert_eq!(page.mime_type, "image/png");
        assert_eq!(page.width, Some(1));
        assert_eq!(page.height, Some(1));
        assert_eq!(page.data_base64, general_purpose::STANDARD.encode(ONE_PIXEL_PNG));

        let _ = fs::remove_file(path);
    }

    #[test]
    fn startup_paths_ignore_flags_and_missing_files() {
        let path = temp_file_with_extension("md", b"# Dropped");
        let paths = startup_paths_from_args([
            "--debug",
            path.to_string_lossy().as_ref(),
            "C:\\definitely\\missing\\bnote-file.md",
        ]);

        assert_eq!(paths, vec![path.to_string_lossy().into_owned()]);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn cbz_info_and_page_render_use_natural_page_order() {
        let path = temp_file_with_extension("cbz", &[]);
        let file = File::create(&path).expect("create cbz");
        let mut zip = ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        zip.start_file("chapter/page10.png", options)
            .expect("start page10");
        zip.write_all(ONE_PIXEL_PNG).expect("write page10");
        zip.start_file("chapter/page2.png", options)
            .expect("start page2");
        zip.write_all(ONE_PIXEL_PNG).expect("write page2");
        zip.start_file("notes.txt", options).expect("start notes");
        zip.write_all(b"ignore me").expect("write notes");
        let mut file = zip.finish().expect("finish cbz");
        file.flush().expect("flush cbz");
        file.sync_all().expect("sync cbz");
        drop(file);

        let info = comic_info_impl(path.to_string_lossy().into_owned()).expect("comic info");
        assert_eq!(info.page_count, 2);
        assert_eq!(info.pages[0].name, "chapter/page2.png");
        assert_eq!(info.pages[1].name, "chapter/page10.png");

        let page = comic_page_impl(path.to_string_lossy().into_owned(), 0).expect("comic page");
        assert_eq!(page.page_index, 0);
        assert_eq!(page.name, "chapter/page2.png");
        assert_eq!(page.mime_type, "image/png");
        assert_eq!(page.width, Some(1));
        assert_eq!(page.height, Some(1));
        assert!(!page.data_base64.is_empty());

        let _ = fs::remove_file(path);
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    fn minimal_pdf() -> Vec<u8> {
        let objects = [
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>\nendobj\n",
            "4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n",
        ];
        let mut pdf = String::from("%PDF-1.4\n");
        let mut offsets = Vec::new();
        for object in objects {
            offsets.push(pdf.len());
            pdf.push_str(object);
        }

        let xref_offset = pdf.len();
        pdf.push_str("xref\n0 5\n0000000000 65535 f \n");
        for offset in offsets {
            pdf.push_str(&format!("{offset:010} 00000 n \n"));
        }
        pdf.push_str(&format!(
            "trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n"
        ));
        pdf.into_bytes()
    }

    #[test]
    fn pdfium_can_be_reused_for_info_then_page_render() {
        let pdfium_dll = PathBuf::from("resources")
            .join("pdfium")
            .join("windows-x64")
            .join("pdfium.dll");

        if !pdfium_dll.exists() {
            return;
        }

        let pdf_path =
            std::env::temp_dir().join(format!("bnote-pdfium-reuse-{}.pdf", std::process::id()));
        fs::write(&pdf_path, minimal_pdf()).expect("write test pdf");
        let path = pdf_path.to_string_lossy().into_owned();
        let candidates = vec![pdfium_dll];

        let info = pdf_info_impl(path.clone(), candidates.clone()).expect("read pdf info");
        assert_eq!(info.page_count, 1);

        let rendered =
            pdf_render_page_impl(path.clone(), 0, 360, candidates).expect("render after info");
        assert_eq!(rendered.page_index, 0);
        assert_eq!(rendered.mime_type, "image/png");
        assert!(!rendered.data_base64.is_empty());

        let _ = fs::remove_file(pdf_path);
    }
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
            comic_info,
            comic_page,
            epub_chapter,
            epub_info,
            image_info,
            image_page,
            inspect_file,
            inspect_path,
            list_folder,
            load_file,
            pdf_info,
            pdf_render_page,
            save_file,
            startup_paths,
            updater_transport_enabled
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
