import { useEffect, useMemo, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { EditorSurface } from "@/components/EditorSurface";
import { Sidebar } from "@/components/Sidebar";
import { StatusBar } from "@/components/StatusBar";
import { TabsBar } from "@/components/TabsBar";
import { TitleBar } from "@/components/TitleBar";
import { Toolbar } from "@/components/Toolbar";
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
  const openPaths = useAppStore((state) => state.openPaths);
  const saveActiveTab = useAppStore((state) => state.saveActiveTab);
  const saveActiveTabAs = useAppStore((state) => state.saveActiveTabAs);
  const openFromDialog = useAppStore((state) => state.openFromDialog);
  const openFolderFromDialog = useAppStore((state) => state.openFolderFromDialog);
  const closeTab = useAppStore((state) => state.closeTab);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const setDragActive = useAppStore((state) => state.setDragActive);
  const activeTabId = useAppStore((state) => state.activeTabId);
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const themeMode = useAppStore((state) => state.themeMode);
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

      if (commandKey && key === "b") {
        event.preventDefault();
        void toggleSidebar();
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
    openFolderFromDialog,
    openFromDialog,
    saveActiveTab,
    saveActiveTabAs,
    toggleSidebar,
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
            gridTemplateColumns: sidebarCollapsed ? "0 minmax(0, 1fr)" : "256px minmax(0, 1fr)",
          }}
        >
          <div className="min-h-0 overflow-hidden">{sidebarCollapsed ? null : <Sidebar />}</div>
          <section className="grid min-h-0 grid-rows-[36px_36px_minmax(0,1fr)_28px]">
            <Toolbar />
            <TabsBar />
            <EditorSurface />
            <StatusBar />
          </section>
        </section>
      </main>
    </TooltipProvider>
  );
}

export default App;
