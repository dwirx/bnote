import type { EditorTab, FileDocument } from "../types";

export const EDITOR_SETTINGS_KEY = "editorSettings";
export const DOCUMENT_OUTLINE_COLLAPSED_KEY = "documentOutlineCollapsed";
export const RECENT_FILES_KEY = "recentFiles";
export const SIDEBAR_COLLAPSED_KEY = "sidebarCollapsed";
export const STORE_FILE = "settings.json";
export const THEME_MODE_KEY = "themeMode";
export const ZEN_MODE_KEY = "zenMode";
export const MAX_RECENT_FILES = 12;
export const imageFileExtensions = [
  "apng",
  "arw",
  "avif",
  "bmp",
  "cr2",
  "cr3",
  "dib",
  "dng",
  "gif",
  "heic",
  "heif",
  "ico",
  "j2k",
  "jfif",
  "jp2",
  "jpe",
  "jpeg",
  "jpg",
  "jxl",
  "nef",
  "nrw",
  "orf",
  "pbm",
  "pef",
  "pgm",
  "png",
  "pnm",
  "ppm",
  "qoi",
  "raf",
  "raw",
  "rw2",
  "rwl",
  "sr2",
  "srf",
  "srw",
  "svg",
  "svgz",
  "tga",
  "tif",
  "tiff",
  "webp",
  "x3f",
] as const;

const textFileExtensions = new Set([
  "bat",
  "c",
  "conf",
  "cpp",
  "cs",
  "css",
  "csv",
  "go",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "log",
  "lua",
  "md",
  "mdx",
  "php",
  "py",
  "rs",
  "sh",
  "sql",
  "svelte",
  "toml",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
]);

export function tabIdForPath(path: string) {
  return `file:${path}`;
}

export function untitledPathForId(id: string) {
  return `untitled:${id}`;
}

export function isUntitledDocument(document: FileDocument | null | undefined) {
  return Boolean(document?.path.startsWith("untitled:"));
}

export function isFilesystemDocument(document: FileDocument | null | undefined) {
  return Boolean(document && !isUntitledDocument(document));
}

export function isDirty(tab: EditorTab | null | undefined) {
  return Boolean(tab?.document.editable && tab.content !== tab.lastSavedContent);
}

export function lineCount(content: string) {
  return content ? content.split(/\r\n|\r|\n/).length : 0;
}

export function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(seconds: number | null) {
  if (!seconds) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(seconds * 1000));
}

export function shortPath(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 3) return path;
  return `...${parts.slice(-3).join(" / ")}`;
}

export function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

export function countWords(content: string) {
  const matches = content.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

export function getLanguageLabel(document: FileDocument | null | undefined) {
  if (isUntitledDocument(document)) return "New file";
  if (document?.kind === "largeText") return "Large text preview";
  if (document?.kind === "binary") return "Binary";
  if (document?.kind === "csv") return "CSV";
  if (document?.kind === "pdf") return "PDF";
  if (document?.kind === "epub") return "EPUB";
  if (document?.kind === "office") {
    return document.encoding === "office-legacy" ? "Word document" : "DOCX preview";
  }
  if (document?.kind === "kindle") {
    return document.encoding === "kindle-unsupported" ? "Kindle external" : "Kindle preview";
  }
  if (document?.kind === "comic") return "Comic archive";
  if (document?.kind === "image") return "Image";
  if (!document?.extension) return "Plain text";
  const ext = document.extension.toLowerCase();
  if (ext === "md" || ext === "mdx") return "Markdown";
  if (ext === "json") return "JSON";
  if (ext === "ts" || ext === "tsx") return "TypeScript";
  if (ext === "js" || ext === "jsx") return "JavaScript";
  if (textFileExtensions.has(ext)) return ext.toUpperCase();
  return "Text";
}

export function isEditableDocument(document: FileDocument | null | undefined) {
  return Boolean(document?.editable);
}

export function getInitials(name: string) {
  const cleanName = name.trim();
  if (!cleanName) return "BN";
  const extension = cleanName.split(".").pop();
  if (extension && extension !== cleanName) return extension.slice(0, 3).toUpperCase();
  return cleanName.slice(0, 2).toUpperCase();
}

export function toErrorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : String(caught);
}
