import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, PanelRightClose, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useAppStore } from "@/stores/useAppStore";
import { cn } from "@/lib/utils";
import { isDirty } from "@/utils/files";

type TabContextMenuState = {
  tabId: string;
  x: number;
  y: number;
};

export function TabsBar() {
  const activeTabId = useAppStore((state) => state.activeTabId);
  const tabs = useAppStore((state) => state.tabs);
  const closeTab = useAppStore((state) => state.closeTab);
  const closeAllTabs = useAppStore((state) => state.closeAllTabs);
  const closeTabsToRight = useAppStore((state) => state.closeTabsToRight);
  const createNewFile = useAppStore((state) => state.createNewFile);
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const zenMode = useAppStore((state) => state.zenMode);
  const [contextMenu, setContextMenu] = useState<TabContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const contextTabIndex = useMemo(
    () => tabs.findIndex((tab) => tab.id === contextMenu?.tabId),
    [contextMenu?.tabId, tabs],
  );
  const canCloseTabsToRight = contextTabIndex >= 0 && contextTabIndex < tabs.length - 1;

  useEffect(() => {
    if (!contextMenu) return;

    const close = (event: Event) => {
      if (contextMenuRef.current?.contains(event.target as Node)) return;
      setContextMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };

    window.addEventListener("mousedown", close);
    window.addEventListener("wheel", close, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("wheel", close);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
    };
  }, [contextMenu]);

  const runContextAction = (action: () => void) => {
    setContextMenu(null);
    action();
  };

  return (
    <div className="grid h-[38px] grid-cols-[minmax(0,1fr)_auto] items-end border-b border-border bg-muted/35">
      <ScrollArea className="min-w-0 whitespace-nowrap">
        <div className="flex h-[38px] items-end gap-1 px-2">
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            const dirty = isDirty(tab);
            return (
              <div
                className={cn(
                  "grid h-8 min-w-36 max-w-60 grid-cols-[minmax(0,1fr)_24px] items-center rounded-t-md border border-transparent border-b-0 transition-colors",
                  active
                    ? "border-border bg-editor text-foreground"
                    : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                )}
                key={tab.id}
                role="tab"
                onContextMenu={(event) => {
                  event.preventDefault();
                  setActiveTab(tab.id);
                  setContextMenu({
                    tabId: tab.id,
                    x: Math.max(8, Math.min(event.clientX, window.innerWidth - 208)),
                    y: Math.max(8, Math.min(event.clientY, window.innerHeight - 132)),
                  });
                }}
              >
                <button
                  className="flex min-w-0 items-center gap-2 px-2 text-left"
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.document.path}
                >
                  <FileText className="size-3.5 shrink-0" />
                  <span className="truncate text-xs font-medium">{tab.document.name}</span>
                  {dirty ? <span className="text-primary">●</span> : null}
                </button>
                <button
                  className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    void closeTab(tab.id);
                  }}
                  title="Close tab"
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      {sidebarCollapsed || zenMode ? (
        <Button
          size="icon"
          variant="ghost"
          className="mb-1 mr-2 h-7 w-7 text-muted-foreground hover:text-foreground"
          title="New file"
          onClick={createNewFile}
        >
          <Plus className="size-4" />
        </Button>
      ) : null}
      {contextMenu ? (
        <div
          ref={contextMenuRef}
          className="fixed z-50 w-52 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent"
            onClick={() => runContextAction(() => void closeTab(contextMenu.tabId))}
            role="menuitem"
          >
            <X className="size-3.5" />
            Close Tab
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent disabled:pointer-events-none disabled:opacity-50"
            disabled={!canCloseTabsToRight}
            onClick={() => runContextAction(() => void closeTabsToRight(contextMenu.tabId))}
            role="menuitem"
          >
            <PanelRightClose className="size-3.5" />
            Close Tabs to the Right
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent disabled:pointer-events-none disabled:opacity-50"
            disabled={tabs.length === 0}
            onClick={() => runContextAction(() => void closeAllTabs())}
            role="menuitem"
          >
            <Trash2 className="size-3.5" />
            Close All Tabs
          </button>
        </div>
      ) : null}
    </div>
  );
}
