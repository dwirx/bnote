import { useEffect, useMemo, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { EditorSurface } from "@/components/EditorSurface";
import { Sidebar } from "@/components/Sidebar";
import { StatusBar } from "@/components/StatusBar";
import { TabsBar } from "@/components/TabsBar";
import { TitleBar } from "@/components/TitleBar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppStore } from "@/stores/useAppStore";
import type { ThemeMode } from "@/types";
import { toErrorMessage } from "@/utils/files";
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
  const setDragActive = useAppStore((state) => state.setDragActive);
  const activeTabId = useAppStore((state) => state.activeTabId);
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const themeMode = useAppStore((state) => state.themeMode);
  const zenMode = useAppStore((state) => state.zenMode);
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const resolvedTheme = useMemo(
    () => resolveThemeMode(themeMode, systemDark),
    [systemDark, themeMode],
  );

  useEffect(() => {
    void hydratePreferences();
  }, [hydratePreferences]);

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

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setDragActive(true);
        }

        if (event.payload.type === "leave") {
          setDragActive(false);
        }

        if (event.payload.type === "drop") {
          setDragActive(false);
          void openPaths(event.payload.paths);
        }
      })
      .then((listener) => {
        unlisten = listener;
      })
      .catch((caught) => {
        console.error(toErrorMessage(caught));
      });

    return () => {
      unlisten?.();
    };
  }, [openPaths, setDragActive]);

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
        className="grid h-screen overflow-hidden bg-background text-foreground"
        style={{
          gridTemplateRows: "40px minmax(0, 1fr)",
        }}
      >
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
