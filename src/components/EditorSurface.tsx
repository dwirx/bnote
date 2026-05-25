import { AlertTriangle, ExternalLink, FolderOpen, Info, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/useAppStore";
import { formatBytes, formatDate } from "@/utils/files";

export function EditorSurface() {
  const activeTabId = useAppStore((state) => state.activeTabId);
  const error = useAppStore((state) => state.error);
  const isBusy = useAppStore((state) => state.isBusy);
  const isDragActive = useAppStore((state) => state.isDragActive);
  const tabs = useAppStore((state) => state.tabs);
  const openActiveExternally = useAppStore((state) => state.openActiveExternally);
  const openFromDialog = useAppStore((state) => state.openFromDialog);
  const revealActiveFile = useAppStore((state) => state.revealActiveFile);
  const updateActiveContent = useAppStore((state) => state.updateActiveContent);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const document = activeTab?.document ?? null;

  return (
    <section className="relative grid min-h-0 bg-background p-2">
      {error ? (
        <div className="absolute right-3 top-3 z-20 flex max-w-md gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive shadow-md">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {isDragActive ? (
        <div className="absolute inset-2 z-30 grid place-items-center rounded-lg border border-dashed border-primary bg-background/85 backdrop-blur">
          <div className="flex flex-col items-center gap-2 text-center">
            <FolderOpen className="size-9 text-primary" />
            <strong className="text-sm text-foreground">Drop files to open in tabs</strong>
            <span className="text-xs text-muted-foreground">Text opens editable. Binary stays protected.</span>
          </div>
        </div>
      ) : null}

      {!document ? (
        <div className="grid place-items-center rounded-lg border border-border bg-editor">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <FolderOpen className="size-16 text-muted-foreground/70" />
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">No File Open</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Open or drop a local text file to start editing. BNote keeps file access local and safe.
              </p>
            </div>
            <Button disabled={isBusy} onClick={() => void openFromDialog()}>
              <FolderOpen className="size-4" />
              Open File
            </Button>
          </div>
        </div>
      ) : document.kind === "binary" ? (
        <div className="grid place-items-center rounded-lg border border-border bg-editor p-6">
          <div className="flex max-w-xl flex-col items-center gap-4 text-center">
            <Info className="size-14 text-muted-foreground" />
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">This file is not editable</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                BNote will not render binary or oversized files as text, so the original file remains untouched.
              </p>
            </div>
            <dl className="grid w-full grid-cols-2 gap-2 text-left">
              {[
                ["Type", document.extension ? `.${document.extension}` : "No extension"],
                ["Size", formatBytes(document.size)],
                ["Modified", formatDate(document.modified)],
                ["Encoding", document.encoding],
              ].map(([label, value]) => (
                <div className="rounded-md border border-border bg-muted/40 p-3" key={label}>
                  <dt className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</dt>
                  <dd className="truncate text-sm text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex gap-2">
              <Button onClick={() => void openActiveExternally()}>
                <ExternalLink className="size-4" />
                Open External
              </Button>
              <Button variant="outline" onClick={() => void revealActiveFile()}>
                <PanelLeft className="size-4" />
                Reveal
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <textarea
          className="editor-textarea h-full w-full resize-none rounded-lg border border-border bg-editor px-6 py-5 font-mono text-[13px] leading-6 text-editor-foreground outline-none selection:bg-primary/30 focus:border-ring"
          value={activeTab?.content ?? ""}
          onChange={(event) => updateActiveContent(event.currentTarget.value)}
          spellCheck={false}
          aria-label="File editor"
        />
      )}
    </section>
  );
}
