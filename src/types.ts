export type FileKind =
  | "text"
  | "csv"
  | "largeText"
  | "pdf"
  | "epub"
  | "office"
  | "kindle"
  | "comic"
  | "binary";

export type FileDocument = {
  path: string;
  name: string;
  extension: string | null;
  size: number;
  modified: number | null;
  kind: FileKind;
  content: string | null;
  encoding: string;
  lineCount: number;
  editable: boolean;
  truncated: boolean;
  previewBytes: number;
};

export type FileMetadata = {
  path: string;
  name: string;
  extension: string | null;
  size: number;
  modified: number | null;
};

export type TocNode = {
  id: string;
  title: string;
  target: string;
  pageIndex: number | null;
  children: TocNode[];
};

export type PdfPageInfo = {
  index: number;
  width: number;
  height: number;
};

export type PdfInfo = {
  path: string;
  name: string;
  size: number;
  pageCount: number;
  pages: PdfPageInfo[];
  toc: TocNode[];
};

export type PdfPageRender = {
  pageIndex: number;
  width: number;
  height: number;
  mimeType: string;
  dataBase64: string;
};

export type EpubSpineItem = {
  index: number;
  href: string;
  label: string;
};

export type EpubInfo = {
  path: string;
  name: string;
  size: number;
  title: string | null;
  creators: string[];
  toc: TocNode[];
  spine: EpubSpineItem[];
};

export type EpubChapter = {
  href: string;
  title: string | null;
  spineIndex: number | null;
  previousHref: string | null;
  nextHref: string | null;
  html: string;
};

export type ComicPageInfo = {
  index: number;
  name: string;
  size: number;
  mimeType: string;
};

export type ComicInfo = {
  path: string;
  name: string;
  size: number;
  pageCount: number;
  pages: ComicPageInfo[];
};

export type ComicPageRender = {
  pageIndex: number;
  name: string;
  mimeType: string;
  dataBase64: string;
};

export type PathInspection = {
  path: string;
  name: string;
  isFile: boolean;
  isDir: boolean;
};

export type FolderTreeNode = {
  path: string;
  name: string;
  kind: "folder" | "file";
  extension: string | null;
  size: number | null;
  modified: number | null;
  children: FolderTreeNode[];
};

export type FolderTree = {
  root: FolderTreeNode;
  truncated: boolean;
  entryCount: number;
  maxDepth: number;
  maxEntries: number;
};

export type EditorTab = {
  id: string;
  document: FileDocument;
  content: string;
  csvViewMode: CsvViewMode;
  lastSavedContent: string;
};

export type ThemeMode = "dark" | "light" | "system";
export type CsvViewMode = "table" | "raw";

export type EditorSettings = {
  showLineNumbers: boolean;
  wordWrap: boolean;
  fontSize: number;
  tabSize: number;
};
