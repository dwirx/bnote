import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileArchive,
  Loader2,
  Maximize,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/useAppStore";
import type { ComicInfo, ComicPageRender, FileDocument } from "@/types";
import { formatBytes } from "@/utils/files";

type ComicViewerProps = {
  document: FileDocument;
  onOpenExternal: () => void;
};

type PageState =
  | { status: "loading" }
  | { status: "ready"; page: ComicPageRender }
  | { status: "error"; message: string };

export function ComicViewer({ document, onOpenExternal }: ComicViewerProps) {
  const documentOutlineCollapsed = useAppStore((state) => state.documentOutlineCollapsed);
  const toggleDocumentOutline = useAppStore((state) => state.toggleDocumentOutline);
  const [info, setInfo] = useState<ComicInfo | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [pageInput, setPageInput] = useState("1");
  const [pageStates, setPageStates] = useState<Record<number, PageState>>({});
  const [fitWidth, setFitWidth] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setInfo(null);
    setActivePage(0);
    setPageInput("1");
    setPageStates({});

    invoke<ComicInfo>("comic_info", { path: document.path })
      .then((nextInfo) => {
        if (!cancelled) setInfo(nextInfo);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [document.path]);

  const pageCount = info?.pageCount ?? 0;
  const currentState = pageStates[activePage];
  const currentPage = info?.pages[activePage] ?? null;
  const imageWidth = fitWidth ? "min(100%, 980px)" : `${Math.round(760 * zoom)}px`;

  const loadPage = useCallback(
    (pageIndex: number) => {
      if (pageIndex < 0 || pageIndex >= pageCount || pageStates[pageIndex]?.status === "loading") {
        return;
      }
      if (pageStates[pageIndex]?.status === "ready") return;

      setPageStates((current) => ({ ...current, [pageIndex]: { status: "loading" } }));
      invoke<ComicPageRender>("comic_page", { path: document.path, pageIndex })
        .then((page) => {
          setPageStates((current) => ({ ...current, [pageIndex]: { status: "ready", page } }));
        })
        .catch((caught) => {
          setPageStates((current) => ({
            ...current,
            [pageIndex]: {
              status: "error",
              message: caught instanceof Error ? caught.message : String(caught),
            },
          }));
        });
    },
    [document.path, pageCount, pageStates],
  );

  useEffect(() => {
    if (!info) return;
    loadPage(activePage);
    loadPage(activePage + 1);
  }, [activePage, info, loadPage]);

  useEffect(() => {
    setPageInput(String(activePage + 1));
  }, [activePage]);

  const jumpToPage = useCallback(
    (pageIndex: number) => {
      const nextPage = Math.min(Math.max(pageIndex, 0), Math.max(pageCount - 1, 0));
      setActivePage(nextPage);
    },
    [pageCount],
  );

  const commitPageInput = () => {
    const nextPage = Math.min(pageCount, Math.max(1, Number(pageInput) || activePage + 1));
    jumpToPage(nextPage - 1);
  };

  const visiblePages = useMemo(() => info?.pages ?? [], [info?.pages]);

  return (
    <div className="grid min-h-0 grid-rows-[42px_minmax(0,1fr)] rounded-lg border border-border bg-editor">
      <div className="flex items-center justify-between gap-3 border-b border-border px-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => void toggleDocumentOutline()}
            title={documentOutlineCollapsed ? "Show pages" : "Hide pages"}
          >
            {documentOutlineCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={!info || activePage <= 0}
            onClick={() => jumpToPage(activePage - 1)}
            title="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <input
            className="h-7 w-14 rounded-md border border-border bg-background px-2 text-center text-xs text-foreground outline-none focus:border-ring"
            value={pageInput}
            disabled={!info}
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
            disabled={!info || activePage >= pageCount - 1}
            onClick={() => jumpToPage(activePage + 1)}
            title="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
          {isLoading ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
        </div>

        <div className="flex min-w-0 items-center justify-end gap-1">
          <span className="mr-2 hidden truncate text-xs text-muted-foreground md:inline">
            {document.name} · {formatBytes(document.size)}
          </span>
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!info} onClick={() => setFitWidth(true)} title="Fit width">
            <Maximize className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={!info}
            onClick={() => {
              setFitWidth(false);
              setZoom((value) => Math.max(0.35, value - 0.15));
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
            disabled={!info}
            onClick={() => {
              setFitWidth(false);
              setZoom((value) => Math.min(3, value + 0.15));
            }}
            title="Zoom in"
          >
            <Plus className="size-4" />
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={onOpenExternal}>
            <ExternalLink className="size-3.5" />
            External
          </Button>
        </div>
      </div>

      <div
        className="grid min-h-0 bg-background/60"
        style={{ gridTemplateColumns: documentOutlineCollapsed ? "0 minmax(0,1fr)" : "240px minmax(0,1fr)" }}
      >
        <aside className="min-h-0 overflow-hidden border-r border-border bg-sidebar/70">
          <div className="h-full overflow-auto p-2">
            <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">
              <FileArchive className="size-3.5" />
              Pages
            </div>
            {visiblePages.length > 0 ? (
              <div className="space-y-1">
                {visiblePages.map((page) => (
                  <button
                    key={page.index}
                    className={`grid w-full grid-cols-[42px_minmax(0,1fr)] items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${
                      activePage === page.index
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent"
                    }`}
                    onClick={() => jumpToPage(page.index)}
                    title={page.name}
                  >
                    <span className="text-sidebar-muted">{page.index + 1}</span>
                    <span className="truncate">{page.name.split("/").pop() ?? page.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-1 text-xs leading-5 text-sidebar-muted">
                {isLoading ? "Loading pages" : "No comic pages"}
              </p>
            )}
          </div>
        </aside>

        <div className="min-h-0 overflow-auto bg-muted/45 p-4">
          {isLoading ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Loading comic
              </span>
            </div>
          ) : error ? (
            <div className="grid h-full place-items-center p-6 text-center">
              <div className="max-w-md space-y-3">
                <h2 className="text-base font-semibold text-foreground">Comic preview unavailable</h2>
                <p className="text-sm leading-6 text-muted-foreground">{error}</p>
                <Button onClick={onOpenExternal}>
                  <ExternalLink className="size-4" />
                  Open External
                </Button>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex min-h-full w-full flex-col items-center justify-center gap-3 py-2">
              <div className="text-xs text-muted-foreground">
                {currentPage ? `${currentPage.name} · ${formatBytes(currentPage.size)}` : document.name}
              </div>
              <div className="grid w-full place-items-center">
                {currentState?.status === "ready" ? (
                  <img
                    alt={currentState.page.name}
                    className="block h-auto max-h-none rounded-sm bg-white shadow-lg ring-1 ring-black/10 dark:ring-white/10"
                    draggable={false}
                    src={`data:${currentState.page.mimeType};base64,${currentState.page.dataBase64}`}
                    style={{ width: imageWidth }}
                  />
                ) : currentState?.status === "error" ? (
                  <div className="max-w-md rounded-md border border-border bg-editor p-5 text-center text-sm leading-6 text-muted-foreground">
                    {currentState.message}
                  </div>
                ) : (
                  <div className="grid h-96 w-full max-w-3xl place-items-center rounded-md border border-border bg-editor">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
