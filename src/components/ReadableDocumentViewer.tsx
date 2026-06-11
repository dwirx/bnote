import { BookOpen, ExternalLink, FileText, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FileDocument } from "@/types";
import { formatBytes, formatDate } from "@/utils/files";

type ReadableDocumentViewerProps = {
  document: FileDocument;
  onOpenExternal: () => void;
  onReveal: () => void;
};

function viewerTitle(document: FileDocument) {
  if (document.kind === "office") {
    return document.encoding === "office-legacy" ? "Word document" : "DOCX preview";
  }
  if (document.encoding === "kindle-unsupported") return "Kindle external";
  return "Kindle preview";
}

export function ReadableDocumentViewer({
  document,
  onOpenExternal,
  onReveal,
}: ReadableDocumentViewerProps) {
  const isKindle = document.kind === "kindle";
  const content = document.content?.trim() || "No readable text was found in this file.";

  return (
    <div className="grid min-h-0 grid-rows-[42px_minmax(0,1fr)] rounded-lg border border-border bg-editor">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          {isKindle ? (
            <BookOpen className="size-4 text-muted-foreground" />
          ) : (
            <FileText className="size-4 text-muted-foreground" />
          )}
          <span className="truncate text-sm font-semibold text-foreground">{viewerTitle(document)}</span>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            {document.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8" onClick={onReveal}>
            <PanelLeft className="size-3.5" />
            Reveal
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={onOpenExternal}>
            <ExternalLink className="size-3.5" />
            External
          </Button>
        </div>
      </div>

      <div className="min-h-0 overflow-auto bg-background">
        <article className="mx-auto grid max-w-4xl gap-5 px-8 py-8">
          <header className="grid gap-3 border-b border-border pb-5">
            <h1 className="break-words text-2xl font-semibold leading-tight text-foreground">
              {document.name}
            </h1>
            <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
              {[
                ["Type", document.extension ? `.${document.extension}` : "Unknown"],
                ["Size", formatBytes(document.size)],
                ["Modified", formatDate(document.modified)],
                ["Mode", "Read-only"],
              ].map(([label, value]) => (
                <div className="rounded-md border border-border bg-muted/35 p-3" key={label}>
                  <dt className="font-semibold uppercase tracking-wide">{label}</dt>
                  <dd className="mt-1 truncate text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </header>

          <pre className="whitespace-pre-wrap break-words font-serif text-[15px] leading-7 text-foreground">
            {content}
          </pre>
        </article>
      </div>
    </div>
  );
}
