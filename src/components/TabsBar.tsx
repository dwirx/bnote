import { FileText, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useAppStore } from "@/stores/useAppStore";
import { cn } from "@/lib/utils";
import { isDirty } from "@/utils/files";

export function TabsBar() {
  const activeTabId = useAppStore((state) => state.activeTabId);
  const tabs = useAppStore((state) => state.tabs);
  const closeTab = useAppStore((state) => state.closeTab);
  const createNewFile = useAppStore((state) => state.createNewFile);
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const zenMode = useAppStore((state) => state.zenMode);

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
    </div>
  );
}
