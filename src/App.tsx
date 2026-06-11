import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { EditorSurface } from "@/components/EditorSurface";
import { Sidebar } from "@/components/Sidebar";
import { StatusBar } from "@/components/StatusBar";
import { TabsBar } from "@/components/TabsBar";
import { TitleBar } from "@/components/TitleBar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppStore } from "@/stores/useAppStore";
import type { ThemeMode } from "@/types";
import { droppedPathCountLabel, normalizeDroppedPaths, shouldPreventDomFileDrop } from "@/utils/drop";
import { toErrorMessage } from "@/utils/files";
import { BookOpen, FileArchive, FileCode2, FileInput, FileText, FolderOpen } from "lucide-react";
import "./App.css";

function resolveThemeMode(themeMode: ThemeMode, systemDark: boolean) {
  if (themeMode === "system") return systemDark ? "dark" : "light";
  return themeMode;
}

function App() {
  const hydratePreferences = useAppStore((state) => state.hydratePreferences);
  const createNewFile = useAppStore((state) => state.createNewFile);
  const openPaths = useAppStore((state) => state.openPaths);
  const saveActiveTab = useAppStore((state) => state.saveActiveTab);
  const saveActiveTabAs = useAppStore((state) => state.saveActiveTabAs);
  const openFromDialog = useAppStore((state) => state.openFromDialog);
  const openFolderFromDialog = useAppStore((state) => state.openFolderFromDialog);
  const closeTab = useAppStore((state) => state.closeTab);
  const toggleDocumentOutline = useAppStore((state) => state.toggleDocumentOutline);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const toggleZenMode = useAppStore((state) => state.toggleZenMode);
  const isDragActive = useAppStore((state) => state.isDragActive);
  const setDragActive = useAppStore((state) => state.setDragActive);
  const activeTabId = useAppStore((state) => state.activeTabId);
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const themeMode = useAppStore((state) => state.themeMode);
  const zenMode = useAppStore((state) => state.zenMode);
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [dragPathCount, setDragPathCount] = useState(0);
  const [nativeFileDropReady, setNativeFileDropReady] = useState(false);
  const resolvedTheme = useMemo(
    () => resolveThemeMode(themeMode, systemDark),
    [systemDark, themeMode],
  );

  useEffect(() => {
    void hydratePreferences();
  }, [hydratePreferences]);

  useEffect(() => {
    invoke<string[]>("startup_paths")
      .then((paths) => {
        const normalizedPaths = normalizeDroppedPaths(paths);
        if (normalizedPaths.length > 0) void openPaths(normalizedPaths);
      })
      .catch((caught) => {
        console.error(toErrorMessage(caught));
      });
  }, [openPaths]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    setSystemDark(query.matches);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    getCurrentWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setDragActive(true);
          if ("paths" in event.payload) {
            setDragPathCount(normalizeDroppedPaths(event.payload.paths).length);
          }
        }

        if (event.payload.type === "leave") {
          setDragActive(false);
          setDragPathCount(0);
        }

        if (event.payload.type === "drop") {
          const paths = normalizeDroppedPaths(event.payload.paths);
          setDragActive(false);
          setDragPathCount(0);
          if (paths.length > 0) void openPaths(paths);
        }
      })
      .then((listener) => {
        setNativeFileDropReady(true);
        unlisten = listener;
      })
      .catch((caught) => {
        setNativeFileDropReady(false);
        console.error(toErrorMessage(caught));
      });

    return () => {
      unlisten?.();
    };
  }, [openPaths, setDragActive]);

  useEffect(() => {
    const isFileDrag = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const preventFileDropDefault = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      if (!shouldPreventDomFileDrop(nativeFileDropReady)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };

    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      preventFileDropDefault(event);
      setDragActive(true);
      setDragPathCount(0);
    };

    const onDragOver = (event: DragEvent) => {
      preventFileDropDefault(event);
    };

    const onDragLeave = (event: DragEvent) => {
      const outsideWindow =
        event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= window.innerWidth ||
        event.clientY >= window.innerHeight;
      if (outsideWindow) {
        setDragActive(false);
        setDragPathCount(0);
      }
    };

    const onDrop = (event: DragEvent) => {
      preventFileDropDefault(event);
      setDragActive(false);
      setDragPathCount(0);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [nativeFileDropReady, setDragActive]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const commandKey = event.ctrlKey || event.metaKey;

      if (event.key === "F11") {
        event.preventDefault();
        void toggleZenMode();
        return;
      }

      if (commandKey && event.altKey && key === "z") {
        event.preventDefault();
        void toggleZenMode();
        return;
      }

      if (commandKey && event.altKey && key === "b") {
        event.preventDefault();
        void toggleDocumentOutline();
        return;
      }

      if (commandKey && key === "b") {
        event.preventDefault();
        void toggleSidebar();
        return;
      }

      if (commandKey && key === "n") {
        event.preventDefault();
        createNewFile();
        return;
      }

      if (commandKey && key === "s" && event.shiftKey) {
        event.preventDefault();
        void saveActiveTabAs();
        return;
      }

      if (commandKey && key === "s") {
        event.preventDefault();
        void saveActiveTab();
        return;
      }

      if (commandKey && key === "o") {
        event.preventDefault();
        if (event.shiftKey) {
          void openFolderFromDialog();
        } else {
          void openFromDialog();
        }
        return;
      }

      if (commandKey && key === "w" && activeTabId) {
        event.preventDefault();
        void closeTab(activeTabId);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeTabId,
    closeTab,
    createNewFile,
    openFolderFromDialog,
    openFromDialog,
    saveActiveTab,
    saveActiveTabAs,
    toggleDocumentOutline,
    toggleSidebar,
    toggleZenMode,
  ]);

  return (
    <TooltipProvider delayDuration={250}>
      <main
        className="relative grid h-screen overflow-hidden bg-background text-foreground"
        style={{
          gridTemplateRows: "40px minmax(0, 1fr)",
        }}
      >
        {isDragActive ? (
          <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-background/70 p-6 backdrop-blur-sm">
            <div className="flex min-h-48 w-full max-w-xl flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-primary bg-editor/95 px-8 py-8 text-center shadow-2xl ring-1 ring-primary/15">
              <div className="grid size-14 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                <FileInput className="size-7" />
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText className="size-4" />
                <FileCode2 className="size-4" />
                <BookOpen className="size-4" />
                <FileArchive className="size-4" />
                <FolderOpen className="size-4" />
              </div>
              <strong className="text-base font-semibold text-foreground">{droppedPathCountLabel(dragPathCount)}</strong>
              <span className="max-w-sm text-xs leading-5 text-muted-foreground">
                Markdown, PDF, EPUB, DOCX, comics, code files, and folders open through the same safe file pipeline.
              </span>
            </div>
          </div>
        ) : null}
        <TitleBar />
        <section
          className="grid min-h-0"
          style={{
            gridTemplateColumns:
              sidebarCollapsed || zenMode ? "0 minmax(0, 1fr)" : "256px minmax(0, 1fr)",
          }}
        >
          <div className="min-h-0 overflow-hidden">
            {sidebarCollapsed || zenMode ? null : <Sidebar />}
          </div>
          <section
            className={
              zenMode
                ? "grid min-h-0 grid-rows-[38px_minmax(0,1fr)]"
                : "grid min-h-0 grid-rows-[38px_minmax(0,1fr)_28px]"
            }
          >
            <TabsBar />
            <EditorSurface />
            {zenMode ? null : <StatusBar />}
          </section>
        </section>
      </main>
    </TooltipProvider>
  );
}

export default App;
