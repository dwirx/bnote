import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileArchive,
  Image as ImageIcon,
  Loader2,
  Maximize,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/useAppStore";
import type { ComicInfo, ComicPageRender, FileDocument } from "@/types";
import { formatBytes } from "@/utils/files";
import {
  VIEWER_ZOOM_STEP,
  imageGalleryTabs,
  zoomViewportAroundPoint,
} from "@/utils/imageViewer";

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
  const tabs = useAppStore((state) => state.tabs);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [info, setInfo] = useState<ComicInfo | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [pageInput, setPageInput] = useState("1");
  const [pageStates, setPageStates] = useState<Record<number, PageState>>({});
  const [fitWidth, setFitWidth] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isImageDocument = document.kind === "image";
  const infoCommand = isImageDocument ? "image_info" : "comic_info";
  const pageCommand = isImageDocument ? "image_page" : "comic_page";
  const showPagesPane = !isImageDocument && !documentOutlineCollapsed;
  const viewerTitle = isImageDocument ? "Image preview unavailable" : "Comic preview unavailable";
  const loadingLabel = isImageDocument ? "Loading image" : "Loading comic";
  const imageTabs = useMemo(() => imageGalleryTabs(tabs), [tabs]);
  const activeImageIndex = imageTabs.findIndex((tab) => tab.document.path === document.path);
  const galleryCount = imageTabs.length;
  const showImageGallery = isImageDocument && galleryCount > 1;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setInfo(null);
    setActivePage(0);
    setPageInput("1");
    setPageStates({});
    setFitWidth(true);
    setZoom(1);
    setImageSize(null);

    invoke<ComicInfo>(infoCommand, { path: document.path })
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
  }, [document.path, infoCommand]);

  const pageCount = info?.pageCount ?? 0;
  const currentState = pageStates[activePage];
  const currentPage = info?.pages[activePage] ?? null;
  const renderPageSize =
    currentState?.status === "ready" && currentState.page.width && currentState.page.height
      ? { width: currentState.page.width, height: currentState.page.height }
      : null;
  const baseImageWidth = imageSize?.width ?? renderPageSize?.width ?? 960;
  const baseImageHeight = imageSize?.height ?? renderPageSize?.height ?? 540;
  const fitScale = Math.min(1, Math.max(0.1, (viewportSize.width - 56) / baseImageWidth));
  const renderScale = fitWidth ? fitScale : zoom;
  const renderedWidth = Math.max(80, Math.round(baseImageWidth * renderScale));
  const renderedHeight = Math.max(80, Math.round(baseImageHeight * renderScale));
  const zoomLabel = fitWidth ? `Fit ${Math.round(renderScale * 100)}%` : `${Math.round(zoom * 100)}%`;
  const navIndex = isImageDocument ? Math.max(activeImageIndex, 0) : activePage;
  const navCount = isImageDocument ? galleryCount : pageCount;

  const loadPage = useCallback(
    (pageIndex: number) => {
      if (pageIndex < 0 || pageIndex >= pageCount || pageStates[pageIndex]?.status === "loading") {
        return;
      }
      if (pageStates[pageIndex]?.status === "ready") return;

      setPageStates((current) => ({ ...current, [pageIndex]: { status: "loading" } }));
      invoke<ComicPageRender>(pageCommand, { path: document.path, pageIndex })
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
    [document.path, pageCommand, pageCount, pageStates],
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

  const focusScroll = useCallback((scrollLeft: number, scrollTop: number) => {
    requestAnimationFrame(() => {
      const scrollArea = scrollAreaRef.current;
      if (!scrollArea) return;
      scrollArea.scrollLeft = scrollLeft;
      scrollArea.scrollTop = scrollTop;
    });
  }, []);

  const zoomTo = useCallback((nextZoom: number, anchorX?: number, anchorY?: number) => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) {
      setFitWidth(false);
      setZoom(nextZoom);
      return;
    }

    const rect = scrollArea.getBoundingClientRect();
    const next = zoomViewportAroundPoint({
      zoom: renderScale,
      nextZoom,
      scrollLeft: scrollArea.scrollLeft,
      scrollTop: scrollArea.scrollTop,
      anchorX: anchorX ?? rect.width / 2,
      anchorY: anchorY ?? rect.height / 2,
    });

    setFitWidth(false);
    setZoom(next.zoom);
    focusScroll(next.scrollLeft, next.scrollTop);
  }, [focusScroll, renderScale]);

  const zoomBy = useCallback((delta: number, anchorX?: number, anchorY?: number) => {
    zoomTo(renderScale + delta, anchorX, anchorY);
  }, [renderScale, zoomTo]);

  const resetView = useCallback(() => {
    setFitWidth(true);
    setZoom(1);
    focusScroll(0, 0);
  }, [focusScroll]);

  const selectImageAt = useCallback(
    (index: number) => {
      if (!isImageDocument || galleryCount === 0) return;
      const nextIndex = (index + galleryCount) % galleryCount;
      const nextTab = imageTabs[nextIndex];
      if (nextTab) setActiveTab(nextTab.id);
    },
    [galleryCount, imageTabs, isImageDocument, setActiveTab],
  );

  const goPrevious = useCallback(() => {
    if (isImageDocument) {
      selectImageAt(activeImageIndex - 1);
    } else {
      jumpToPage(activePage - 1);
    }
  }, [activeImageIndex, activePage, isImageDocument, jumpToPage, selectImageAt]);

  const goNext = useCallback(() => {
    if (isImageDocument) {
      selectImageAt(activeImageIndex + 1);
    } else {
      jumpToPage(activePage + 1);
    }
  }, [activeImageIndex, activePage, isImageDocument, jumpToPage, selectImageAt]);

  const beginPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || currentState?.status !== "ready") return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button,input")) return;
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    panRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: scrollArea.scrollLeft,
      scrollTop: scrollArea.scrollTop,
    };
    scrollArea.setPointerCapture(event.pointerId);
    setIsPanning(true);
  };

  const updatePan = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const scrollArea = scrollAreaRef.current;
    if (!pan || !scrollArea || pan.pointerId !== event.pointerId) return;

    scrollArea.scrollLeft = pan.scrollLeft - (event.clientX - pan.x);
    scrollArea.scrollTop = pan.scrollTop - (event.clientY - pan.y);
  };

  const endPan = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const scrollArea = scrollAreaRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;

    if (scrollArea?.hasPointerCapture(event.pointerId)) {
      scrollArea.releasePointerCapture(event.pointerId);
    }
    panRef.current = null;
    setIsPanning(false);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!info || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    zoomBy(
      event.deltaY < 0 ? VIEWER_ZOOM_STEP : -VIEWER_ZOOM_STEP,
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomBy(VIEWER_ZOOM_STEP);
      } else if (event.key === "-") {
        event.preventDefault();
        zoomBy(-VIEWER_ZOOM_STEP);
      } else if (event.key === "0") {
        event.preventDefault();
        resetView();
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        setFitWidth(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrevious, resetView, zoomBy]);

  useEffect(() => {
    setImageSize(null);
    requestAnimationFrame(() => {
      const scrollArea = scrollAreaRef.current;
      if (!scrollArea) return;
      scrollArea.scrollLeft = 0;
      scrollArea.scrollTop = 0;
    });
  }, [activePage, document.path]);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const updateSize = () => {
      setViewportSize({
        width: scrollArea.clientWidth,
        height: scrollArea.clientHeight,
      });
    };
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(scrollArea);
    return () => observer.disconnect();
  }, [showImageGallery, showPagesPane]);

  const visiblePages = useMemo(() => info?.pages ?? [], [info?.pages]);

  return (
    <div className="grid min-h-0 grid-rows-[42px_minmax(0,1fr)] rounded-lg border border-border bg-editor">
      <div className="flex items-center justify-between gap-3 border-b border-border px-2">
        <div className="flex min-w-0 items-center gap-2">
          {!isImageDocument ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => void toggleDocumentOutline()}
              title={documentOutlineCollapsed ? "Show pages" : "Hide pages"}
            >
              {documentOutlineCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </Button>
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={!info || navCount <= 1 || (!isImageDocument && activePage <= 0)}
            onClick={goPrevious}
            title={isImageDocument ? "Previous image" : "Previous page"}
          >
            <ChevronLeft className="size-4" />
          </Button>
          {isImageDocument ? (
            <span className="min-w-16 text-center text-xs text-muted-foreground">
              {navCount > 0 ? `${navIndex + 1} / ${navCount}` : "-"}
            </span>
          ) : (
            <>
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
            </>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={!info || navCount <= 1 || (!isImageDocument && activePage >= pageCount - 1)}
            onClick={goNext}
            title={isImageDocument ? "Next image" : "Next page"}
          >
            <ChevronRight className="size-4" />
          </Button>
          {isLoading ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
        </div>

        <div className="flex min-w-0 items-center justify-end gap-1">
          <span className="mr-2 hidden truncate text-xs text-muted-foreground md:inline">
            {currentPage?.name ?? document.name} · {formatBytes(currentPage?.size ?? document.size)}
          </span>
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!info} onClick={() => setFitWidth(true)} title="Fit to window">
            <Maximize className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={!info}
            onClick={() => zoomBy(-VIEWER_ZOOM_STEP)}
            title="Zoom out"
          >
            <Minus className="size-4" />
          </Button>
          <span className="hidden w-12 text-center text-xs text-muted-foreground sm:inline">
            {zoomLabel}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={!info}
            onClick={() => zoomBy(VIEWER_ZOOM_STEP)}
            title="Zoom in"
          >
            <Plus className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!info} onClick={resetView} title="Reset view">
            <RotateCcw className="size-4" />
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={onOpenExternal}>
            <ExternalLink className="size-3.5" />
            External
          </Button>
        </div>
      </div>

      <div
        className="grid min-h-0 bg-background/60"
        style={{ gridTemplateColumns: showPagesPane ? "240px minmax(0,1fr)" : "0 minmax(0,1fr)" }}
      >
        <aside className="min-h-0 overflow-hidden border-r border-border bg-sidebar/70">
          <div className="h-full overflow-auto p-2">
            <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">
              {isImageDocument ? <ImageIcon className="size-3.5" /> : <FileArchive className="size-3.5" />}
              {isImageDocument ? "Image" : "Pages"}
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

        <section
          className="grid min-h-0"
          style={{ gridTemplateRows: showImageGallery ? "minmax(0,1fr) 108px" : "minmax(0,1fr)" }}
        >
          <div
            ref={scrollAreaRef}
            className={`min-h-0 overflow-auto bg-muted/45 p-4 ${
              currentState?.status === "ready" ? (isPanning ? "cursor-grabbing" : "cursor-grab") : ""
            }`}
            onPointerDown={beginPan}
            onPointerMove={updatePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onWheel={handleWheel}
          >
          {isLoading ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                {loadingLabel}
              </span>
            </div>
          ) : error ? (
            <div className="grid h-full place-items-center p-6 text-center">
              <div className="max-w-md space-y-3">
                <h2 className="text-base font-semibold text-foreground">{viewerTitle}</h2>
                <p className="text-sm leading-6 text-muted-foreground">{error}</p>
                <Button onClick={onOpenExternal}>
                  <ExternalLink className="size-4" />
                  Open External
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-full min-w-full flex-col items-center justify-center gap-3 py-2">
              <div className="grid min-h-0 min-w-full place-items-center p-3">
                {currentState?.status === "ready" ? (
                  <div
                    className="relative shrink-0 rounded-sm shadow-lg ring-1 ring-black/10 dark:ring-white/10"
                    style={{
                      width: `${renderedWidth}px`,
                      height: `${renderedHeight}px`,
                    }}
                  >
                    <img
                      alt={currentState.page.name}
                      className="absolute left-0 top-0 block max-h-none max-w-none origin-top-left rounded-sm bg-white"
                      draggable={false}
                      src={`data:${currentState.page.mimeType};base64,${currentState.page.dataBase64}`}
                      onLoad={(event) => {
                        const image = event.currentTarget;
                        setImageSize((current) => {
                          const nextSize = {
                            width: image.naturalWidth || renderPageSize?.width || 960,
                            height: image.naturalHeight || renderPageSize?.height || 540,
                          };
                          return current?.width === nextSize.width && current.height === nextSize.height
                            ? current
                            : nextSize;
                        });
                      }}
                      style={{
                        width: `${baseImageWidth}px`,
                        height: `${baseImageHeight}px`,
                        transform: `scale(${renderScale})`,
                      }}
                    />
                  </div>
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
          {showImageGallery ? (
            <div className="min-w-0 border-t border-border bg-editor/95 px-3 py-2">
              <div className="flex h-full min-w-0 items-center gap-2 overflow-x-auto pb-1">
                {imageTabs.map((tab, index) => {
                  const isActive = tab.document.path === document.path;
                  const extension = tab.document.extension?.toUpperCase() ?? "IMG";
                  return (
                    <button
                      key={tab.id}
                      className={`group grid h-20 w-28 shrink-0 grid-rows-[1fr_auto] overflow-hidden rounded-md border text-left transition ${
                        isActive
                          ? "border-primary bg-primary/10 ring-1 ring-primary/35"
                          : "border-border bg-muted/40 hover:border-primary/45 hover:bg-muted"
                      }`}
                      onClick={() => selectImageAt(index)}
                      title={tab.document.path}
                    >
                      <span className="relative grid min-h-0 place-items-center overflow-hidden bg-background">
                        <ImageIcon className="size-5 text-muted-foreground" />
                        <img
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover opacity-90 transition group-hover:scale-105"
                          draggable={false}
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                          src={convertFileSrc(tab.document.path)}
                        />
                        <span className="absolute right-1 top-1 rounded bg-background/85 px-1 text-[9px] font-semibold text-muted-foreground shadow-sm">
                          {extension}
                        </span>
                      </span>
                      <span className="truncate px-2 py-1 text-[11px] text-foreground">
                        {tab.document.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
