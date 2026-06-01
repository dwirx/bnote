import { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/stores/useAppStore";
import type { FolderTreeNode } from "@/types";
import { fileNameFromPath, getInitials, shortPath } from "@/utils/files";

function nodeIcon(node: FolderTreeNode, expanded: boolean) {
  if (node.kind === "folder") {
    return expanded ? <FolderOpen className="size-3.5" /> : <Folder className="size-3.5" />;
  }

  if (node.extension?.toLowerCase() === "epub") return <BookOpen className="size-3.5" />;
  return <FileText className="size-3.5" />;
}

function FolderNode({
  activePath,
  expandedPaths,
  node,
  onOpenFile,
  onToggle,
}: {
  activePath: string | null;
  expandedPaths: Set<string>;
  node: FolderTreeNode;
  onOpenFile: (path: string) => void;
  onToggle: (path: string) => void;
}) {
  const expanded = expandedPaths.has(node.path);
  const active = activePath === node.path;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        className={[
          "grid w-full grid-cols-[18px_18px_minmax(0,1fr)] items-center gap-1 rounded px-1.5 py-1 text-left text-xs transition-colors",
          active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/70",
        ].join(" ")}
        title={node.path}
        onClick={() => {
          if (node.kind === "folder") {
            onToggle(node.path);
          } else {
            onOpenFile(node.path);
          }
        }}
      >
        <span className="text-sidebar-muted">
          {node.kind === "folder" && hasChildren ? (
            expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />
          ) : null}
        </span>
        <span className={node.kind === "folder" ? "text-sidebar-ring" : "text-sidebar-muted"}>
          {nodeIcon(node, expanded)}
        </span>
        <span className="truncate font-medium">{node.name}</span>
      </button>

      {node.kind === "folder" && expanded && hasChildren ? (
        <div className="ml-4 border-l border-sidebar-border pl-1">
          {node.children.map((child) => (
            <FolderNode
              activePath={activePath}
              expandedPaths={expandedPaths}
              key={child.path}
              node={child}
              onOpenFile={onOpenFile}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Sidebar() {
  const activeTabId = useAppStore((state) => state.activeTabId);
  const activeFolder = useAppStore((state) => state.activeFolder);
  const clearRecentFiles = useAppStore((state) => state.clearRecentFiles);
  const createNewFile = useAppStore((state) => state.createNewFile);
  const folderTree = useAppStore((state) => state.folderTree);
  const folderTreeTruncated = useAppStore((state) => state.folderTreeTruncated);
  const isBusy = useAppStore((state) => state.isBusy);
  const query = useAppStore((state) => state.query);
  const recentFiles = useAppStore((state) => state.recentFiles);
  const refreshFolder = useAppStore((state) => state.refreshFolder);
  const tabs = useAppStore((state) => state.tabs);
  const openFolderFromDialog = useAppStore((state) => state.openFolderFromDialog);
  const openFromDialog = useAppStore((state) => state.openFromDialog);
  const openFiles = useAppStore((state) => state.openFiles);
  const setQuery = useAppStore((state) => state.setQuery);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const activePath = tabs.find((tab) => tab.id === activeTabId)?.document.path ?? null;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRecentFiles = normalizedQuery
    ? recentFiles.filter((path) => path.toLowerCase().includes(normalizedQuery))
    : recentFiles;

  useEffect(() => {
    if (folderTree?.root.path) {
      setExpandedPaths((current) => new Set([...current, folderTree.root.path]));
    }
  }, [folderTree?.root.path]);

  const toggleFolder = (path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <aside className="flex min-h-0 w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-10 items-center justify-between border-b border-sidebar-border px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">
          Workspace
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 p-3">
        <Button className="h-8 bg-primary text-xs font-semibold" onClick={createNewFile}>
          <FilePlus2 className="size-4" />
          New
        </Button>
        <Button className="h-8 text-xs font-semibold" variant="outline" disabled={isBusy} onClick={() => void openFromDialog()}>
          <FolderOpen className="size-4" />
          File
        </Button>
        <Button className="h-8 text-xs font-semibold" variant="outline" disabled={isBusy} onClick={() => void openFolderFromDialog()}>
          <Folder className="size-4" />
          Folder
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">
          <span className="truncate" title={activeFolder ?? undefined}>
            {activeFolder ? fileNameFromPath(activeFolder) : "Folder"}
          </span>
          <div className="flex items-center gap-1">
            {folderTreeTruncated ? (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-500">
                limited
              </span>
            ) : null}
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              disabled={!activeFolder || isBusy}
              onClick={() => void refreshFolder()}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-2">
          {!folderTree ? (
            <div className="flex flex-col items-center gap-2 px-5 py-8 text-center text-xs text-sidebar-muted">
              <Folder className="size-7 opacity-60" />
              <span>Open a folder to browse supported files</span>
            </div>
          ) : (
            <div className="pb-3">
              <FolderNode
                activePath={activePath}
                expandedPaths={expandedPaths}
                node={folderTree.root}
                onOpenFile={(path) => void openFiles([path])}
                onToggle={toggleFolder}
              />
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="border-t border-sidebar-border">
        <div className="space-y-3 p-3">
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
          <div className="flex items-center gap-1">
            <span>{recentFiles.length}</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              disabled={recentFiles.length === 0 || isBusy}
              onClick={() => void clearRecentFiles()}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        <ScrollArea className="max-h-52 px-2">
          {filteredRecentFiles.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-8 text-center text-xs text-sidebar-muted">
              <FileText className="size-7 opacity-60" />
              <span>No recent files</span>
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
      </div>

      <div className="border-t border-sidebar-border px-3 py-2 text-[10px] text-sidebar-muted">
        BNote v0.1.0
      </div>
    </aside>
  );
}
