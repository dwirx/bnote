use base64::{engine::general_purpose, Engine as _};
use image::ImageFormat;
use pdfium_render::prelude::*;
use rbook::Epub;
use regex::{Captures, Regex};
use serde::Serialize;
use std::{
    fs::{self, File},
    io::{Cursor, Read},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::UNIX_EPOCH,
};
use tauri::Manager;

const MAX_EDITABLE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_PREVIEW_BYTES: u64 = 512 * 1024;
const MAX_NATIVE_VIEWER_BYTES: u64 = 150 * 1024 * 1024;
const MAX_FOLDER_DEPTH: usize = 3;
const MAX_FOLDER_ENTRIES: usize = 500;
const SKIPPED_FOLDER_NAMES: &[&str] = &[".git", "dist", "node_modules", "target"];
const SUPPORTED_FOLDER_FILE_EXTENSIONS: &[&str] = &[
    "bat", "c", "conf", "cpp", "cs", "css", "csv", "epub", "go", "html", "ini", "java", "js",
    "json", "jsx", "log", "lua", "md", "mdx", "pdf", "php", "py", "rs", "sh", "sql", "svelte",
    "toml", "ts", "tsx", "txt", "vue", "xml", "yaml", "yml",
];
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

    if extension_is(&meta, "pdf") {
        return Ok(document_from_kind(meta, "pdf", "pdf"));
    }

    if extension_is(&meta, "epub") {
        return Ok(document_from_kind(meta, "epub", "epub"));
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

        let pdf_path = std::env::temp_dir().join(format!(
            "bnote-pdfium-reuse-{}.pdf",
            std::process::id()
        ));
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
            epub_chapter,
            epub_info,
            inspect_file,
            inspect_path,
            list_folder,
            load_file,
            pdf_info,
            pdf_render_page,
            save_file,
            updater_transport_enabled
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
