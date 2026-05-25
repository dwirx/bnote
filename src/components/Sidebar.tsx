import { FileText, FolderOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/stores/useAppStore";
import { fileNameFromPath, getInitials, shortPath } from "@/utils/files";

export function Sidebar() {
  const activeTabId = useAppStore((state) => state.activeTabId);
  const isBusy = useAppStore((state) => state.isBusy);
  const query = useAppStore((state) => state.query);
  const recentFiles = useAppStore((state) => state.recentFiles);
  const tabs = useAppStore((state) => state.tabs);
  const openFromDialog = useAppStore((state) => state.openFromDialog);
  const openFiles = useAppStore((state) => state.openFiles);
  const setQuery = useAppStore((state) => state.setQuery);
  const activePath = tabs.find((tab) => tab.id === activeTabId)?.document.path ?? null;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRecentFiles = normalizedQuery
    ? recentFiles.filter((path) => path.toLowerCase().includes(normalizedQuery))
    : recentFiles;

  return (
    <aside className="flex min-h-0 w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-10 items-center justify-between border-b border-sidebar-border px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">
          Files
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          disabled={isBusy}
          onClick={() => void openFromDialog()}
        >
          <FolderOpen className="size-4" />
        </Button>
      </div>

      <div className="space-y-3 p-3">
        <Button className="h-8 w-full bg-primary text-xs font-semibold" disabled={isBusy} onClick={() => void openFromDialog()}>
          <FolderOpen className="size-4" />
          Open file
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sidebar-muted" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search recent files"
            className="h-8 border-sidebar-border bg-sidebar-accent/50 pl-8 text-xs text-sidebar-foreground placeholder:text-sidebar-muted"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">
        <span>Recent</span>
        <span>{recentFiles.length}</span>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2">
        {filteredRecentFiles.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center text-xs text-sidebar-muted">
            <FileText className="size-7 opacity-60" />
            <span>No recent files yet</span>
          </div>
        ) : (
          <div className="space-y-1 pb-3">
            {filteredRecentFiles.map((path) => {
              const isActive = activePath === path;
              const name = fileNameFromPath(path);
              return (
                <button
                  className={[
                    "grid w-full grid-cols-[30px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/70",
                  ].join(" ")}
                  key={path}
                  onClick={() => void openFiles([path])}
                  title={path}
                >
                  <span className="grid size-7 place-items-center rounded bg-sidebar-ring/15 text-[9px] font-bold text-sidebar-ring">
                    {getInitials(name)}
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-xs font-semibold">{name}</strong>
                    <small className="block truncate text-[10px] text-sidebar-muted">
                      {shortPath(path)}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <div className="border-t border-sidebar-border px-3 py-2 text-[10px] text-sidebar-muted">
        BNote v0.1.0
      </div>
    </aside>
  );
}
