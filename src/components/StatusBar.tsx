import { AlertTriangle, Check } from "lucide-react";
import { useAppStore } from "@/stores/useAppStore";
import { countWords, formatBytes, getLanguageLabel, isDirty, isUntitledDocument, lineCount, shortPath } from "@/utils/files";

export function StatusBar() {
  const activeTabId = useAppStore((state) => state.activeTabId);
  const isBusy = useAppStore((state) => state.isBusy);
  const tabs = useAppStore((state) => state.tabs);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const dirty = isDirty(activeTab);
  const document = activeTab?.document ?? null;
  const content = activeTab?.content ?? "";

  return (
    <footer className="flex h-7 items-center justify-between gap-3 border-t border-border bg-muted/40 px-3 text-[11px] text-muted-foreground">
      <div className="flex min-w-0 items-center gap-3">
        <span className={dirty ? "flex items-center gap-1 text-amber-500" : "flex items-center gap-1 text-primary"}>
          {dirty ? <AlertTriangle className="size-3" /> : <Check className="size-3" />}
          {dirty ? "Unsaved" : "Saved"}
        </span>
        <span>{document ? getLanguageLabel(document) : "Ready"}</span>
        <span>{document ? formatBytes(document.size) : "0 B"}</span>
        <span className="truncate">
          {document ? (isUntitledDocument(document) ? document.name : shortPath(document.path)) : ""}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {document && document.content !== null ? (
          <>
            <span>{lineCount(content)} lines</span>
            <span>{countWords(content)} words</span>
            {document.truncated ? <span>preview {formatBytes(document.previewBytes)}</span> : null}
            <span>{document.encoding}</span>
          </>
        ) : (
          <span>{document ? document.encoding : "utf-8"}</span>
        )}
        {isBusy ? <span className="text-primary">Working</span> : null}
      </div>
    </footer>
  );
}
