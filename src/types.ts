export type FileKind = "text" | "csv" | "largeText" | "binary";

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
