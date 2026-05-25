import { invoke } from "@tauri-apps/api/core";
import { message, open, save } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { Store } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import type { EditorTab, FileDocument, FileMetadata, ThemeMode } from "@/types";
import {
  MAX_RECENT_FILES,
  RECENT_FILES_KEY,
  SIDEBAR_COLLAPSED_KEY,
  STORE_FILE,
  THEME_MODE_KEY,
  isDirty,
  lineCount,
  tabIdForPath,
  toErrorMessage,
} from "@/utils/files";

type AppState = {
  activeTabId: string | null;
  error: string | null;
  isBusy: boolean;
  isDragActive: boolean;
  query: string;
  recentFiles: string[];
  sidebarCollapsed: boolean;
  store: Store | null;
  tabs: EditorTab[];
  themeMode: ThemeMode;
  closeTab: (tabId: string) => Promise<void>;
  hydratePreferences: () => Promise<void>;
  openActiveExternally: () => Promise<void>;
  openFiles: (paths: string[]) => Promise<void>;
  openFromDialog: () => Promise<void>;
  rememberFile: (path: string) => Promise<void>;
  revealActiveFile: () => Promise<void>;
  saveActiveTab: () => Promise<boolean>;
  saveActiveTabAs: () => Promise<boolean>;
  saveTab: (tabId: string) => Promise<boolean>;
  setActiveTab: (tabId: string | null) => void;
  setDragActive: (isDragActive: boolean) => void;
  setQuery: (query: string) => void;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  toggleSidebar: () => Promise<void>;
  updateActiveContent: (content: string) => void;
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

export const useAppStore = create<AppState>((set, get) => ({
  activeTabId: null,
  error: null,
  isBusy: false,
  isDragActive: false,
  query: "",
  recentFiles: [],
  sidebarCollapsed: false,
  store: null,
  tabs: [],
  themeMode: "dark",

  hydratePreferences: async () => {
    try {
      const store = await Store.load(STORE_FILE);
      const recentFiles = await store.get<string[]>(RECENT_FILES_KEY);
      const sidebarCollapsed = await store.get<boolean>(SIDEBAR_COLLAPSED_KEY);
      const themeMode = await store.get<ThemeMode>(THEME_MODE_KEY);

      set({
        recentFiles: Array.isArray(recentFiles)
          ? recentFiles.filter((path) => typeof path === "string")
          : [],
        sidebarCollapsed: typeof sidebarCollapsed === "boolean" ? sidebarCollapsed : false,
        store,
        themeMode:
          themeMode === "light" || themeMode === "dark" || themeMode === "system"
            ? themeMode
            : "dark",
      });
    } catch (caught) {
      set({ error: toErrorMessage(caught) });
    }
  },

  rememberFile: async (path: string) => {
    const nextRecentFiles = [
      path,
      ...get().recentFiles.filter((recentPath) => recentPath !== path),
    ].slice(0, MAX_RECENT_FILES);

    set({ recentFiles: nextRecentFiles });
    await persistValue(get().store, RECENT_FILES_KEY, nextRecentFiles);
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

  openFromDialog: async () => {
    const selected = await open({
      multiple: true,
      title: "Open files",
      fileAccessMode: "scoped",
    });

    if (Array.isArray(selected)) {
      await get().openFiles(selected);
    } else if (typeof selected === "string") {
      await get().openFiles([selected]);
    }
  },

  saveTab: async (tabId: string) => {
    const tab = get().tabs.find((candidate) => candidate.id === tabId);
    if (!tab || tab.document.kind !== "text") return false;

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
                  kind: "text",
                  encoding: "utf-8",
                  lineCount: lineCount(candidate.content),
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
    const activeTab = get().tabs.find((tab) => tab.id === get().activeTabId) ?? null;
    const selected = await save({
      title: "Save note as",
      defaultPath: activeTab?.document.name ?? "Untitled.txt",
      filters: [{ name: "Text files", extensions: ["txt", "md", "json", "ts", "js"] }],
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
          return {
            activeTabId: nextTabId,
            tabs: [
              ...withoutDuplicate,
              {
                id: nextTabId,
                document,
                content: nextContent,
                lastSavedContent: nextContent,
              },
            ],
          };
        }

        return {
          activeTabId: nextTabId,
          tabs: withoutDuplicate.map((tab) =>
            tab.id === activeTab.id
              ? {
                  id: nextTabId,
                  document,
                  content: nextContent,
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
    if (activeTab) await openPath(activeTab.document.path);
  },

  revealActiveFile: async () => {
    const activeTab = get().tabs.find((tab) => tab.id === get().activeTabId);
    if (activeTab) await revealItemInDir(activeTab.document.path);
  },

  setActiveTab: (activeTabId) => set({ activeTabId }),
  setDragActive: (isDragActive) => set({ isDragActive }),
  setQuery: (query) => set({ query }),

  setThemeMode: async (themeMode) => {
    set({ themeMode });
    await persistValue(get().store, THEME_MODE_KEY, themeMode);
  },

  toggleSidebar: async () => {
    const sidebarCollapsed = !get().sidebarCollapsed;
    set({ sidebarCollapsed });
    await persistValue(get().store, SIDEBAR_COLLAPSED_KEY, sidebarCollapsed);
  },

  updateActiveContent: (content) => {
    const activeTabId = get().activeTabId;
    if (!activeTabId) return;
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === activeTabId ? { ...tab, content } : tab)),
    }));
  },
}));
