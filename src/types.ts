export type FileKind = "text" | "binary";

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
  lastSavedContent: string;
};

export type ThemeMode = "dark" | "light" | "system";
