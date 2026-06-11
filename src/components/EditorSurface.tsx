import { lazy, Suspense } from "react";
import { AlertTriangle, ExternalLink, FilePlus2, FolderOpen, Info, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeEditor } from "@/components/CodeEditor";
import { CsvPreview } from "@/components/CsvPreview";
import { useAppStore } from "@/stores/useAppStore";
import { formatBytes, formatDate } from "@/utils/files";

const PdfViewer = lazy(() => import("@/components/PdfViewer").then((module) => ({ default: module.PdfViewer })));
const EpubViewer = lazy(() => import("@/components/EpubViewer").then((module) => ({ default: module.EpubViewer })));
const ComicViewer = lazy(() => import("@/components/ComicViewer").then((module) => ({ default: module.ComicViewer })));
const ReadableDocumentViewer = lazy(() =>
  import("@/components/ReadableDocumentViewer").then((module) => ({ default: module.ReadableDocumentViewer })),
);

function ViewerLoading() {
  return (
    <div className="grid h-full place-items-center rounded-lg border border-border bg-editor text-sm text-muted-foreground">
      Loading viewer
    </div>
  );
}

export function EditorSurface() {
  const activeTabId = useAppStore((state) => state.activeTabId);
  const error = useAppStore((state) => state.error);
  const isBusy = useAppStore((state) => state.isBusy);
  const isDragActive = useAppStore((state) => state.isDragActive);
  const editorSettings = useAppStore((state) => state.editorSettings);
  const tabs = useAppStore((state) => state.tabs);
  const createNewFile = useAppStore((state) => state.createNewFile);
  const openActiveExternally = useAppStore((state) => state.openActiveExternally);
  const openFromDialog = useAppStore((state) => state.openFromDialog);
  const revealActiveFile = useAppStore((state) => state.revealActiveFile);
  const setCsvViewMode = useAppStore((state) => state.setCsvViewMode);
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
                Open or drop text, CSV, code, PDF, EPUB, DOCX, Kindle books, comics, or folders.
                Huge text files open in preview mode.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={createNewFile}>
                <FilePlus2 className="size-4" />
                New File
              </Button>
              <Button variant="outline" disabled={isBusy} onClick={() => void openFromDialog()}>
                <FolderOpen className="size-4" />
                Open File
              </Button>
            </div>
          </div>
        </div>
      ) : document.kind === "pdf" ? (
        <Suspense fallback={<ViewerLoading />}>
          <PdfViewer document={document} onOpenExternal={() => void openActiveExternally()} />
        </Suspense>
      ) : document.kind === "epub" ? (
        <Suspense fallback={<ViewerLoading />}>
          <EpubViewer document={document} onOpenExternal={() => void openActiveExternally()} />
        </Suspense>
      ) : document.kind === "comic" ? (
        <Suspense fallback={<ViewerLoading />}>
          <ComicViewer document={document} onOpenExternal={() => void openActiveExternally()} />
        </Suspense>
      ) : document.kind === "office" || document.kind === "kindle" ? (
        <Suspense fallback={<ViewerLoading />}>
          <ReadableDocumentViewer
            document={document}
            onOpenExternal={() => void openActiveExternally()}
            onReveal={() => void revealActiveFile()}
          />
        </Suspense>
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
      ) : document.kind === "csv" ? (
        <CsvPreview
          content={activeTab?.content ?? ""}
          document={document}
          mode={activeTab?.csvViewMode ?? "table"}
          onModeChange={(mode) => {
            if (activeTab) setCsvViewMode(activeTab.id, mode);
          }}
          rawView={
            <CodeEditor
              key={`${document.path}:csv-raw`}
              document={document}
              value={activeTab?.content ?? ""}
              settings={editorSettings}
              readOnly={!document.editable}
              onChange={updateActiveContent}
            />
          }
        />
      ) : (
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
          {document.truncated ? (
            <div className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
              <span>
                Preview mode: showing the first {formatBytes(document.previewBytes)} of {formatBytes(document.size)}.
                Editing is disabled to keep BNote responsive.
              </span>
              <Button size="sm" variant="outline" className="h-7" onClick={() => void openActiveExternally()}>
                <ExternalLink className="size-3.5" />
                External
              </Button>
            </div>
          ) : null}
          <CodeEditor
            key={document.path}
            document={document}
            value={activeTab?.content ?? ""}
            settings={editorSettings}
            readOnly={!document.editable}
            onChange={updateActiveContent}
          />
        </div>
      )}
    </section>
  );
}
