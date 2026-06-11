import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { message, open, save } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, exists } from "@tauri-apps/plugin-fs";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { arch, platform, type as osType, version } from "@tauri-apps/plugin-os";
import { relaunch } from "@tauri-apps/plugin-process";
import { Store } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import type {
  CsvViewMode,
  EditorSettings,
  EditorTab,
  FileDocument,
  FileMetadata,
  FolderTree,
  PathInspection,
  ThemeMode,
} from "@/types";
import {
  DOCUMENT_OUTLINE_COLLAPSED_KEY,
  EDITOR_SETTINGS_KEY,
  MAX_RECENT_FILES,
  RECENT_FILES_KEY,
  SIDEBAR_COLLAPSED_KEY,
  STORE_FILE,
  THEME_MODE_KEY,
  ZEN_MODE_KEY,
  isDirty,
  isEditableDocument,
  isFilesystemDocument,
  isUntitledDocument,
  lineCount,
  tabIdForPath,
  toErrorMessage,
  untitledPathForId,
} from "@/utils/files";

type AppState = {
  activeTabId: string | null;
  activeFolder: string | null;
  documentOutlineCollapsed: boolean;
  editorSettings: EditorSettings;
  error: string | null;
  folderTree: FolderTree | null;
  folderTreeTruncated: boolean;
  isBusy: boolean;
  isDragActive: boolean;
  query: string;
  recentFiles: string[];
  sidebarCollapsed: boolean;
  store: Store | null;
  tabs: EditorTab[];
  themeMode: ThemeMode;
  checkForUpdates: () => Promise<void>;
  clearRecentFiles: () => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  copyActiveFileInfo: () => Promise<void>;
  copyActivePath: () => Promise<void>;
  createNewFile: () => void;
  hydratePreferences: () => Promise<void>;
  openActiveExternally: () => Promise<void>;
  openFiles: (paths: string[]) => Promise<void>;
  openFolder: (path: string) => Promise<void>;
  openFolderFromDialog: () => Promise<void>;
  openFromDialog: () => Promise<void>;
  openPaths: (paths: string[]) => Promise<void>;
  rememberFile: (path: string) => Promise<void>;
  refreshFolder: () => Promise<void>;
  revealActiveFile: () => Promise<void>;
  relaunchApp: () => Promise<void>;
  saveActiveTab: () => Promise<boolean>;
  saveActiveTabAs: () => Promise<boolean>;
  saveTab: (tabId: string) => Promise<boolean>;
  saveTabAs: (tabId: string) => Promise<boolean>;
  setActiveTab: (tabId: string | null) => void;
  setCsvViewMode: (tabId: string, mode: CsvViewMode) => void;
  setDragActive: (isDragActive: boolean) => void;
  setEditorFontSize: (fontSize: number) => Promise<void>;
  setEditorTabSize: (tabSize: number) => Promise<void>;
  setQuery: (query: string) => void;
  setShowLineNumbers: (showLineNumbers: boolean) => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setWordWrap: (wordWrap: boolean) => Promise<void>;
  showSystemInfo: () => Promise<void>;
  toggleDocumentOutline: () => Promise<void>;
  toggleSidebar: () => Promise<void>;
  toggleZenMode: () => Promise<void>;
  updateActiveContent: (content: string) => void;
  zenMode: boolean;
};

const defaultEditorSettings: EditorSettings = {
  showLineNumbers: true,
  wordWrap: true,
  fontSize: 13,
  tabSize: 2,
};

function normalizeDialogResult(result: unknown) {
  return String(result).toLowerCase();
}

function getNextActiveTabId(tabs: EditorTab[], closedTabId: string) {
  const closedIndex = tabs.findIndex((tab) => tab.id === closedTabId);
  const nextTab = tabs[closedIndex + 1] ?? tabs[closedIndex - 1] ?? null;
  return nextTab?.id ?? null;
}

async function persistValue(store: Store | null, key: string, value: unknown) {
  if (!store) return;
  await store.set(key, value);
  await store.save();
}

function defaultCsvViewMode(document: FileDocument): CsvViewMode {
  return document.kind === "csv" ? "table" : "raw";
}

export const useAppStore = create<AppState>((set, get) => ({
  activeTabId: null,
  activeFolder: null,
  documentOutlineCollapsed: false,
  editorSettings: defaultEditorSettings,
  error: null,
  folderTree: null,
  folderTreeTruncated: false,
  isBusy: false,
  isDragActive: false,
  query: "",
  recentFiles: [],
  sidebarCollapsed: false,
  store: null,
  tabs: [],
  themeMode: "dark",
  zenMode: false,

  hydratePreferences: async () => {
    try {
      const store = await Store.load(STORE_FILE);
      const documentOutlineCollapsed = await store.get<boolean>(DOCUMENT_OUTLINE_COLLAPSED_KEY);
      const recentFiles = await store.get<string[]>(RECENT_FILES_KEY);
      const sidebarCollapsed = await store.get<boolean>(SIDEBAR_COLLAPSED_KEY);
      const themeMode = await store.get<ThemeMode>(THEME_MODE_KEY);
      const editorSettings = await store.get<Partial<EditorSettings>>(EDITOR_SETTINGS_KEY);
      const zenMode = await store.get<boolean>(ZEN_MODE_KEY);
      await exists(".", { baseDir: BaseDirectory.AppConfig }).catch(() => false);

      set({
        documentOutlineCollapsed:
          typeof documentOutlineCollapsed === "boolean" ? documentOutlineCollapsed : false,
        editorSettings: {
          ...defaultEditorSettings,
          ...(editorSettings && typeof editorSettings === "object" ? editorSettings : {}),
        },
        recentFiles: Array.isArray(recentFiles)
          ? recentFiles.filter((path) => typeof path === "string")
          : [],
        sidebarCollapsed: typeof sidebarCollapsed === "boolean" ? sidebarCollapsed : false,
        store,
        themeMode:
          themeMode === "light" || themeMode === "dark" || themeMode === "system"
            ? themeMode
            : "dark",
        zenMode: typeof zenMode === "boolean" ? zenMode : false,
      });
    } catch (caught) {
      set({ error: toErrorMessage(caught) });
    }
  },

  createNewFile: () => {
    const existingNames = new Set(get().tabs.map((tab) => tab.document.name));
    let index = 1;
    while (existingNames.has(`Untitled-${index}.txt`)) index += 1;

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${index}`;
    const path = untitledPathForId(id);
    const name = `Untitled-${index}.txt`;
    const document: FileDocument = {
      path,
      name,
      extension: "txt",
      size: 0,
      modified: null,
      kind: "text",
      content: "",
      encoding: "utf-8",
      lineCount: 0,
      editable: true,
      truncated: false,
      previewBytes: 0,
    };

    set((state) => ({
      activeTabId: path,
      tabs: [
        ...state.tabs,
        {
          id: path,
          document,
          content: "",
          csvViewMode: "raw",
          lastSavedContent: "",
        },
      ],
    }));
  },

  rememberFile: async (path: string) => {
    const nextRecentFiles = [
      path,
      ...get().recentFiles.filter((recentPath) => recentPath !== path),
    ].slice(0, MAX_RECENT_FILES);

    set({ recentFiles: nextRecentFiles });
    await persistValue(get().store, RECENT_FILES_KEY, nextRecentFiles);
  },

  clearRecentFiles: async () => {
    set({ recentFiles: [] });
    await persistValue(get().store, RECENT_FILES_KEY, []);
  },

  openFiles: async (paths: string[]) => {
    for (const path of paths) {
      const tabId = tabIdForPath(path);
      if (get().tabs.some((tab) => tab.id === tabId)) {
        set({ activeTabId: tabId });
        await get().rememberFile(path);
        continue;
      }

      set({ error: null, isBusy: true });
      try {
        const document = await invoke<FileDocument>("load_file", { path });
        const content = document.content ?? "";

        set((state) => ({
          activeTabId: tabId,
          tabs: [
            ...state.tabs,
            {
              id: tabId,
              document,
              content,
              csvViewMode: defaultCsvViewMode(document),
              lastSavedContent: content,
            },
          ],
        }));
        await get().rememberFile(document.path);
      } catch (caught) {
        set({ error: toErrorMessage(caught) });
      } finally {
        set({ isBusy: false });
      }
    }
  },

  openPaths: async (paths: string[]) => {
    const filePaths: string[] = [];

    for (const path of paths) {
      try {
        const inspected = await invoke<PathInspection>("inspect_path", { path });
        if (inspected.isDir) {
          await get().openFolder(inspected.path);
        } else if (inspected.isFile) {
          filePaths.push(inspected.path);
        }
      } catch (caught) {
        set({ error: toErrorMessage(caught) });
      }
    }

    if (filePaths.length > 0) {
      await get().openFiles(filePaths);
    }
  },

  openFromDialog: async () => {
    const selected = await open({
      multiple: true,
      title: "Open files",
      fileAccessMode: "scoped",
      filters: [
        {
          name: "Supported files",
          extensions: [
            "txt",
            "md",
            "csv",
            "json",
            "ts",
            "js",
            "pdf",
            "epub",
            "doc",
            "docx",
            "mobi",
            "azw3",
            "kfx",
            "cbz",
            "cbr",
          ],
        },
      ],
    });

    if (Array.isArray(selected)) {
      await get().openFiles(selected);
    } else if (typeof selected === "string") {
      await get().openFiles([selected]);
    }
  },

  openFolderFromDialog: async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open folder",
      fileAccessMode: "scoped",
    });

    if (typeof selected === "string") {
      await get().openFolder(selected);
    }
  },

  openFolder: async (path: string) => {
    set({ error: null, isBusy: true });
    try {
      const folderTree = await invoke<FolderTree>("list_folder", { path });
      set({
        activeFolder: folderTree.root.path,
        folderTree,
        folderTreeTruncated: folderTree.truncated,
      });
    } catch (caught) {
      set({ error: toErrorMessage(caught) });
    } finally {
      set({ isBusy: false });
    }
  },

  refreshFolder: async () => {
    const activeFolder = get().activeFolder;
    if (activeFolder) {
      await get().openFolder(activeFolder);
    }
  },

  saveTab: async (tabId: string) => {
    const tab = get().tabs.find((candidate) => candidate.id === tabId);
    if (!tab || !isEditableDocument(tab.document)) return false;
    if (isUntitledDocument(tab.document)) return get().saveTabAs(tabId);

    set({ error: null, isBusy: true });
    try {
      const metadata = await invoke<FileMetadata>("save_file", {
        path: tab.document.path,
        contents: tab.content,
      });

      set((state) => ({
        tabs: state.tabs.map((candidate) =>
          candidate.id === tabId
            ? {
                ...candidate,
                document: {
                  ...candidate.document,
                  ...metadata,
                  content: candidate.content,
                  kind: candidate.document.kind,
                  encoding: "utf-8",
                  editable: true,
                  lineCount: lineCount(candidate.content),
                  previewBytes: metadata.size,
                  truncated: false,
                },
                lastSavedContent: candidate.content,
              }
            : candidate,
        ),
      }));
      await get().rememberFile(metadata.path);
      return true;
    } catch (caught) {
      set({ error: toErrorMessage(caught) });
      return false;
    } finally {
      set({ isBusy: false });
    }
  },

  saveActiveTab: async () => {
    const activeTabId = get().activeTabId;
    return activeTabId ? get().saveTab(activeTabId) : false;
  },

  saveActiveTabAs: async () => {
    const activeTabId = get().activeTabId;
    return activeTabId ? get().saveTabAs(activeTabId) : false;
  },

  saveTabAs: async (tabId: string) => {
    const activeTab = get().tabs.find((tab) => tab.id === tabId) ?? null;
    const selected = await save({
      title: "Save note as",
      defaultPath: activeTab?.document.name ?? "Untitled.txt",
      filters: [{ name: "Text files", extensions: ["txt", "md", "csv", "json", "ts", "js"] }],
    });
    if (!selected) return false;

    set({ error: null, isBusy: true });
    try {
      const contents = activeTab?.content ?? "";
      await invoke<FileMetadata>("save_file", { path: selected, contents });
      const document = await invoke<FileDocument>("load_file", { path: selected });
      const nextTabId = tabIdForPath(document.path);
      const nextContent = document.content ?? "";

      set((state) => {
        const withoutDuplicate = state.tabs.filter(
          (tab) => tab.id !== nextTabId || tab.id === activeTab?.id,
        );

        if (!activeTab) {
          return {};
        }

        return {
          activeTabId: state.activeTabId === activeTab.id ? nextTabId : state.activeTabId,
          tabs: withoutDuplicate.map((tab) =>
            tab.id === activeTab.id
              ? {
                  id: nextTabId,
                  document,
                  content: nextContent,
                  csvViewMode: defaultCsvViewMode(document),
                  lastSavedContent: nextContent,
                }
              : tab,
          ),
        };
      });
      await get().rememberFile(document.path);
      return true;
    } catch (caught) {
      set({ error: toErrorMessage(caught) });
      return false;
    } finally {
      set({ isBusy: false });
    }
  },

  closeTab: async (tabId: string) => {
    const tab = get().tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return;

    if (isDirty(tab)) {
      const result = await message(`Save changes to ${tab.document.name}?`, {
        title: "Unsaved changes",
        kind: "warning",
        buttons: {
          yes: "Save",
          no: "Don't Save",
          cancel: "Cancel",
        },
      });
      const normalized = normalizeDialogResult(result);
      if (normalized.includes("cancel")) return;
      if ((normalized.includes("save") || normalized === "yes") && !(await get().saveTab(tab.id))) {
        return;
      }
    }

    set((state) => ({
      activeTabId:
        state.activeTabId === tabId ? getNextActiveTabId(state.tabs, tabId) : state.activeTabId,
      tabs: state.tabs.filter((candidate) => candidate.id !== tabId),
    }));
  },

  openActiveExternally: async () => {
    const activeTab = get().tabs.find((tab) => tab.id === get().activeTabId);
    if (activeTab && isFilesystemDocument(activeTab.document)) {
      await openPath(activeTab.document.path);
    }
  },

  revealActiveFile: async () => {
    const activeTab = get().tabs.find((tab) => tab.id === get().activeTabId);
    if (activeTab && isFilesystemDocument(activeTab.document)) {
      await revealItemInDir(activeTab.document.path);
    }
  },

  copyActivePath: async () => {
    const activeTab = get().tabs.find((tab) => tab.id === get().activeTabId);
    if (!activeTab || !isFilesystemDocument(activeTab.document)) return;

    try {
      await writeText(activeTab.document.path);
      await message("File path copied to clipboard.", { title: "Clipboard", kind: "info" });
    } catch (caught) {
      set({ error: toErrorMessage(caught) });
    }
  },

  copyActiveFileInfo: async () => {
    const activeTab = get().tabs.find((tab) => tab.id === get().activeTabId);
    if (!activeTab) return;

    const { document } = activeTab;
    const info = [
      `Name: ${document.name}`,
      `Path: ${document.path}`,
      `Kind: ${document.kind}`,
      `Size: ${document.size} bytes`,
      `Encoding: ${document.encoding}`,
      `Editable: ${document.editable ? "yes" : "no"}`,
      `Preview bytes: ${document.previewBytes}`,
    ].join("\n");

    try {
      await writeText(info);
      await message("File details copied to clipboard.", { title: "Clipboard", kind: "info" });
    } catch (caught) {
      set({ error: toErrorMessage(caught) });
    }
  },

  showSystemInfo: async () => {
    const info = [
      `Platform: ${platform()}`,
      `OS: ${osType()}`,
      `Version: ${version()}`,
      `Architecture: ${arch()}`,
    ].join("\n");
    await message(info, { title: "System Info", kind: "info" });
  },

  checkForUpdates: async () => {
    try {
      const updaterEnabled = await invoke<boolean>("updater_transport_enabled");
      if (!updaterEnabled) {
        await message(
          "Updater transport is not enabled in this build. Use the updater-full release build to check for production updates.",
          {
            title: "Updates",
            kind: "info",
          },
        );
        return;
      }

      await message(
        "Updater transport is enabled in this build. Configure a production endpoint and signing keys before publishing updates.",
        {
          title: "Updates",
          kind: "info",
        },
      );
    } catch {
      await message("Updater is installed, but no production update endpoint is configured yet.", {
        title: "Updates",
        kind: "info",
      });
    }
  },

  relaunchApp: async () => {
    const result = await message("BNote will close and reopen.", {
      title: "Restart BNote",
      kind: "warning",
      buttons: {
        yes: "Restart",
        no: "Cancel",
        cancel: "Cancel",
      },
    });
    const normalized = normalizeDialogResult(result);
    if (normalized.includes("restart") || normalized === "yes") {
      await relaunch();
    }
  },

  setActiveTab: (activeTabId) => set({ activeTabId }),
  setCsvViewMode: (tabId, mode) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, csvViewMode: mode } : tab)),
    })),
  setDragActive: (isDragActive) => set({ isDragActive }),
  setQuery: (query) => set({ query }),

  setEditorFontSize: async (fontSize) => {
    const nextSettings = {
      ...get().editorSettings,
      fontSize: Math.min(22, Math.max(10, fontSize)),
    };
    set({ editorSettings: nextSettings });
    await persistValue(get().store, EDITOR_SETTINGS_KEY, nextSettings);
  },

  setEditorTabSize: async (tabSize) => {
    const nextSettings = {
      ...get().editorSettings,
      tabSize: [2, 4, 8].includes(tabSize) ? tabSize : 2,
    };
    set({ editorSettings: nextSettings });
    await persistValue(get().store, EDITOR_SETTINGS_KEY, nextSettings);
  },

  setShowLineNumbers: async (showLineNumbers) => {
    const nextSettings = { ...get().editorSettings, showLineNumbers };
    set({ editorSettings: nextSettings });
    await persistValue(get().store, EDITOR_SETTINGS_KEY, nextSettings);
  },

  setThemeMode: async (themeMode) => {
    set({ themeMode });
    await persistValue(get().store, THEME_MODE_KEY, themeMode);
  },

  setWordWrap: async (wordWrap) => {
    const nextSettings = { ...get().editorSettings, wordWrap };
    set({ editorSettings: nextSettings });
    await persistValue(get().store, EDITOR_SETTINGS_KEY, nextSettings);
  },

  toggleSidebar: async () => {
    const sidebarCollapsed = !get().sidebarCollapsed;
    set({ sidebarCollapsed });
    await persistValue(get().store, SIDEBAR_COLLAPSED_KEY, sidebarCollapsed);
  },

  toggleDocumentOutline: async () => {
    const documentOutlineCollapsed = !get().documentOutlineCollapsed;
    set({ documentOutlineCollapsed });
    await persistValue(get().store, DOCUMENT_OUTLINE_COLLAPSED_KEY, documentOutlineCollapsed);
  },

  toggleZenMode: async () => {
    const zenMode = !get().zenMode;
    set({ zenMode });
    await persistValue(get().store, ZEN_MODE_KEY, zenMode);
  },

  updateActiveContent: (content) => {
    const activeTabId = get().activeTabId;
    if (!activeTabId) return;
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === activeTabId ? { ...tab, content } : tab)),
    }));
  },
}));
