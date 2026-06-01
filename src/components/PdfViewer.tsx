import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Maximize,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/useAppStore";
import type { FileDocument, PdfInfo, PdfPageInfo, PdfPageRender, TocNode } from "@/types";
import { formatBytes } from "@/utils/files";

type PdfViewerProps = {
  document: FileDocument;
  onOpenExternal: () => void;
};

type PageImageState =
  | { status: "loading"; targetWidth: number }
  | { status: "ready"; targetWidth: number; image: PdfPageRender }
  | { status: "error"; targetWidth: number; message: string };

type PdfRenderMode = "native" | "webview";

function renderKey(pageIndex: number, targetWidth: number) {
  return `${pageIndex}:${targetWidth}`;
}

function flattenToc(nodes: TocNode[]): TocNode[] {
  return nodes.flatMap((node) => [node, ...flattenToc(node.children)]);
}

function PdfTocTree({
  nodes,
  activePage,
  onJump,
  depth = 0,
}: {
  nodes: TocNode[];
  activePage: number;
  onJump: (pageIndex: number) => void;
  depth?: number;
}) {
  return (
    <div className={depth === 0 ? "space-y-1" : "mt-1 space-y-1"}>
      {nodes.map((node) => {
        const pageIndex = node.pageIndex ?? 0;
        const isActive = pageIndex === activePage;

        return (
          <div key={node.id}>
            <button
              className={`block w-full truncate rounded px-2 py-1.5 text-left text-xs ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              }`}
              style={{ paddingLeft: `${8 + depth * 12}px` }}
              title={node.title}
              onClick={() => onJump(pageIndex)}
            >
              {node.title}
            </button>
            {node.children.length > 0 ? (
              <PdfTocTree nodes={node.children} activePage={activePage} onJump={onJump} depth={depth + 1} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function PdfViewer({ document, onOpenExternal }: PdfViewerProps) {
  const documentOutlineCollapsed = useAppStore((state) => state.documentOutlineCollapsed);
  const toggleDocumentOutline = useAppStore((state) => state.toggleDocumentOutline);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLElement | null>>({});
  const requestedRef = useRef<Set<string>>(new Set());
  const [info, setInfo] = useState<PdfInfo | null>(null);
  const [pageImages, setPageImages] = useState<Record<string, PageImageState>>({});
  const [containerWidth, setContainerWidth] = useState(900);
  const [activePage, setActivePage] = useState(0);
  const [pageInput, setPageInput] = useState("1");
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<PdfRenderMode>("native");
  const webviewSrc = useMemo(() => convertFileSrc(document.path), [document.path]);

  const targetWidth = useMemo(() => {
    if (fitWidth) {
      return Math.max(360, Math.floor(containerWidth - 56));
    }
    return Math.max(360, Math.min(2200, Math.round(760 * zoom)));
  }, [containerWidth, fitWidth, zoom]);

  const tocItems = useMemo(() => flattenToc(info?.toc ?? []), [info?.toc]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setRenderMode("native");
    setInfo(null);
    setPageImages({});
    requestedRef.current.clear();
    setActivePage(0);
    setPageInput("1");

    invoke<PdfInfo>("pdf_info", { path: document.path })
      .then((nextInfo) => {
        if (!cancelled) setInfo(nextInfo);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
          setRenderMode("webview");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [document.path]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    requestedRef.current.clear();
    setPageImages({});
  }, [targetWidth, document.path]);

  useEffect(() => {
    setPageInput(String(activePage + 1));
  }, [activePage]);

  const renderPage = useCallback(
    (pageIndex: number) => {
      const key = renderKey(pageIndex, targetWidth);
      if (requestedRef.current.has(key)) return;
      requestedRef.current.add(key);
      setPageImages((current) => ({ ...current, [key]: { status: "loading", targetWidth } }));

      invoke<PdfPageRender>("pdf_render_page", {
        path: document.path,
        pageIndex,
        targetWidth,
      })
        .then((image) => {
          setPageImages((current) => ({
            ...current,
            [key]: { status: "ready", targetWidth, image },
          }));
        })
        .catch((caught) => {
          const message = caught instanceof Error ? caught.message : String(caught);
          setError(message);
          setRenderMode("webview");
          setPageImages((current) => ({
            ...current,
            [key]: {
              status: "error",
              targetWidth,
              message,
            },
          }));
        });
    },
    [document.path, targetWidth],
  );

  useEffect(() => {
    if (!info || !scrollRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageIndex = Number((entry.target as HTMLElement).dataset.pageIndex);
            renderPage(pageIndex);
          }
        }
      },
      { root: scrollRef.current, rootMargin: "1000px 0px", threshold: 0.01 },
    );

    for (const page of info.pages) {
      const node = pageRefs.current[page.index];
      if (node) observer.observe(node);
    }

    info.pages.slice(0, 2).forEach((page) => renderPage(page.index));

    return () => observer.disconnect();
  }, [info, renderPage]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !info) return;

    const updateActivePage = () => {
      const rootTop = element.getBoundingClientRect().top;
      let bestPage = activePage;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const page of info.pages) {
        const node = pageRefs.current[page.index];
        if (!node) continue;
        const distance = Math.abs(node.getBoundingClientRect().top - rootTop - 16);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPage = page.index;
        }
      }

      setActivePage(bestPage);
    };

    element.addEventListener("scroll", updateActivePage, { passive: true });
    updateActivePage();
    return () => element.removeEventListener("scroll", updateActivePage);
  }, [activePage, info]);

  const jumpToPage = useCallback((pageIndex: number) => {
    pageRefs.current[pageIndex]?.scrollIntoView({ block: "start" });
    setActivePage(pageIndex);
  }, []);

  const commitPageInput = () => {
    if (!info) return;
    const nextPage = Math.min(info.pageCount, Math.max(1, Number(pageInput) || activePage + 1));
    jumpToPage(nextPage - 1);
  };

  const pageCount = info?.pageCount ?? 0;
  const canRead = renderMode === "native" && Boolean(info && !error);
  const usingWebviewFallback = renderMode === "webview";

  return (
    <div className="grid min-h-0 grid-rows-[42px_minmax(0,1fr)] rounded-lg border border-border bg-editor">
      <div className="flex items-center justify-between gap-3 border-b border-border px-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => void toggleDocumentOutline()}
            title={documentOutlineCollapsed ? "Show contents" : "Hide contents"}
          >
            {documentOutlineCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
          {usingWebviewFallback ? (
            <span className="rounded border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-500">
              WebView fallback
            </span>
          ) : (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                disabled={!canRead || activePage <= 0}
                onClick={() => jumpToPage(Math.max(0, activePage - 1))}
                title="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <input
                className="h-7 w-14 rounded-md border border-border bg-background px-2 text-center text-xs text-foreground outline-none focus:border-ring"
                value={pageInput}
                disabled={!canRead}
                onBlur={commitPageInput}
                onChange={(event) => setPageInput(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitPageInput();
                }}
              />
              <span className="text-xs text-muted-foreground">/ {pageCount || "-"}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                disabled={!canRead || activePage >= pageCount - 1}
                onClick={() => jumpToPage(Math.min(pageCount - 1, activePage + 1))}
                title="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </>
          )}
          {isLoading ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
        </div>

        <div className="flex min-w-0 items-center justify-end gap-1">
          <span className="mr-2 hidden truncate text-xs text-muted-foreground md:inline">
            {document.name} · {formatBytes(document.size)}
          </span>
          {usingWebviewFallback ? null : (
            <>
              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!canRead} onClick={() => setFitWidth(true)} title="Fit width">
                <Maximize className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                disabled={!canRead}
                onClick={() => {
                  setFitWidth(false);
                  setZoom((value) => Math.max(0.5, value - 0.15));
                }}
                title="Zoom out"
              >
                <Minus className="size-4" />
              </Button>
              <span className="hidden w-12 text-center text-xs text-muted-foreground sm:inline">
                {fitWidth ? "Fit" : `${Math.round(zoom * 100)}%`}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                disabled={!canRead}
                onClick={() => {
                  setFitWidth(false);
                  setZoom((value) => Math.min(2.6, value + 0.15));
                }}
                title="Zoom in"
              >
                <Plus className="size-4" />
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" className="h-8" onClick={onOpenExternal}>
            <ExternalLink className="size-3.5" />
            External
          </Button>
        </div>
      </div>

      <div
        className="grid min-h-0 bg-background/60"
        style={{ gridTemplateColumns: documentOutlineCollapsed ? "0 minmax(0,1fr)" : "230px minmax(0,1fr)" }}
      >
        <aside className="min-h-0 overflow-hidden border-r border-border bg-sidebar/70">
          <div className="h-full overflow-auto p-2">
          <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">
            <BookOpen className="size-3.5" />
            Contents
          </div>
          {usingWebviewFallback ? (
            <div className="space-y-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-2 text-xs leading-5 text-sidebar-muted">
              <p className="font-medium text-sidebar-foreground">Native PDFium could not render this PDF.</p>
              <p>Using the Windows WebView2 PDF viewer instead.</p>
              {error ? <p className="break-words text-[11px]">{error}</p> : null}
            </div>
          ) : tocItems.length > 0 ? (
            <PdfTocTree nodes={info?.toc ?? []} activePage={activePage} onJump={jumpToPage} />
          ) : info ? (
            <div className="space-y-1">
              {info.pages.map((page) => (
                <button
                  key={page.index}
                  className={`block w-full truncate rounded px-2 py-1.5 text-left text-xs ${
                    activePage === page.index
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  }`}
                  onClick={() => jumpToPage(page.index)}
                >
                  Page {page.index + 1}
                </button>
              ))}
            </div>
          ) : (
            <p className="px-1 text-xs leading-5 text-sidebar-muted">
              {isLoading ? "Loading contents" : "No document contents"}
            </p>
          )}
          </div>
        </aside>

        <div ref={scrollRef} className="min-h-0 overflow-auto bg-muted/45 p-4">
          {usingWebviewFallback ? (
            <iframe
              className="h-full w-full border-0 bg-white"
              src={webviewSrc}
              title={document.name}
            />
          ) : isLoading ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Loading PDF
              </span>
            </div>
          ) : error ? (
            <div className="grid h-full place-items-center p-6 text-center">
              <div className="max-w-md space-y-3">
                <h2 className="text-base font-semibold text-foreground">PDF preview unavailable</h2>
                <p className="text-sm leading-6 text-muted-foreground">{error}</p>
                <Button onClick={onOpenExternal}>
                  <ExternalLink className="size-4" />
                  Open External
                </Button>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-fit min-w-0 flex-col gap-5 pb-8">
              {(info?.pages ?? []).map((page: PdfPageInfo) => {
                const key = renderKey(page.index, targetWidth);
                const image = pageImages[key];
                const ratio = page.height > 0 ? page.height / page.width : 1.3;
                const placeholderHeight = Math.max(120, Math.round(targetWidth * ratio));

                return (
                  <section
                    key={page.index}
                    ref={(node) => {
                      pageRefs.current[page.index] = node;
                    }}
                    data-page-index={page.index}
                    className="scroll-mt-4"
                    style={{ width: targetWidth }}
                  >
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Page {page.index + 1}</span>
                      <span>{Math.round(page.width)} x {Math.round(page.height)} pt</span>
                    </div>
                    <div
                      className="grid place-items-center overflow-hidden rounded-sm bg-white shadow-lg ring-1 ring-black/10 dark:ring-white/10"
                      style={{ width: targetWidth, minHeight: placeholderHeight }}
                    >
                      {image?.status === "ready" ? (
                        <img
                          alt={`Page ${page.index + 1}`}
                          className="block h-auto w-full"
                          draggable={false}
                          src={`data:${image.image.mimeType};base64,${image.image.dataBase64}`}
                        />
                      ) : image?.status === "error" ? (
                        <div className="p-5 text-center text-xs leading-5 text-muted-foreground">
                          {image.message}
                        </div>
                      ) : (
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
