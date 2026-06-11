import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/useAppStore";
import type { EpubChapter, EpubInfo, FileDocument, TocNode } from "@/types";
import { formatBytes } from "@/utils/files";
import { epubTocTargetMatches, firstTocTarget, flattenToc, hrefFragment, hrefWithoutFragment } from "@/utils/toc";

type EpubViewerProps = {
  document: FileDocument;
  onOpenExternal: () => void;
};

function srcDocFor(html: string, fontSize: number, lineHeight: number) {
  const css = `<style>
    :root { color-scheme: light; }
    html { background: #ffffff; }
    body {
      margin: 0 auto;
      max-width: 780px;
      padding: 42px 54px 72px;
      color: #171a18;
      font-family: Georgia, "Times New Roman", serif;
      font-size: ${fontSize}px;
      line-height: ${lineHeight};
      overflow-wrap: anywhere;
    }
    img, svg, video { max-width: 100%; height: auto; }
    a { color: #1d4ed8; }
    p { margin: 0 0 1em; }
    h1, h2, h3, h4, h5, h6 {
      font-family: Aptos, "Segoe UI", sans-serif;
      line-height: 1.2;
      margin: 1.4em 0 .55em;
    }
    table { max-width: 100%; border-collapse: collapse; }
    pre { white-space: pre-wrap; }
  </style>`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${css}`);
  }

  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${css}</head>`);
  }

  return `<!doctype html><html><head>${css}</head><body>${html}</body></html>`;
}

function EpubTocTree({
  nodes,
  activeHref,
  onSelect,
  depth = 0,
}: {
  nodes: TocNode[];
  activeHref: string | null;
  onSelect: (href: string) => void;
  depth?: number;
}) {
  return (
    <div className={depth === 0 ? "space-y-1" : "mt-1 space-y-1"}>
      {nodes.map((node) => {
        const target = node.target || firstTocTarget(node.children);
        const isActive = Boolean(target && epubTocTargetMatches(target, activeHref));

        return (
          <div key={node.id}>
            <button
              className={`block w-full truncate rounded px-2 py-1.5 text-left text-xs ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              }`}
              disabled={!target}
              style={{ paddingLeft: `${8 + depth * 12}px` }}
              title={node.title}
              onClick={() => target && onSelect(target)}
            >
              {node.title}
            </button>
            {node.children.length > 0 ? (
              <EpubTocTree nodes={node.children} activeHref={activeHref} onSelect={onSelect} depth={depth + 1} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function EpubViewer({ document, onOpenExternal }: EpubViewerProps) {
  const documentOutlineCollapsed = useAppStore((state) => state.documentOutlineCollapsed);
  const toggleDocumentOutline = useAppStore((state) => state.toggleDocumentOutline);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [info, setInfo] = useState<EpubInfo | null>(null);
  const [chapter, setChapter] = useState<EpubChapter | null>(null);
  const [selectedHref, setSelectedHref] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.65);
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);
  const [isLoadingChapter, setIsLoadingChapter] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flatToc = useMemo(() => flattenToc(info?.toc ?? []), [info?.toc]);
  const activeTitle = useMemo(() => {
    if (!selectedHref) return null;
    return flatToc.find((node) => epubTocTargetMatches(node.target, selectedHref))?.title ?? null;
  }, [flatToc, selectedHref]);

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    setChapter(null);
    setSelectedHref(null);
    setError(null);
    setIsLoadingInfo(true);

    invoke<EpubInfo>("epub_info", { path: document.path })
      .then((nextInfo) => {
        if (cancelled) return;
        setInfo(nextInfo);
        setSelectedHref(firstTocTarget(nextInfo.toc) ?? nextInfo.spine[0]?.href ?? null);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingInfo(false);
      });

    return () => {
      cancelled = true;
    };
  }, [document.path]);

  useEffect(() => {
    if (!selectedHref) return;

    let cancelled = false;
    setIsLoadingChapter(true);
    setError(null);

    invoke<EpubChapter>("epub_chapter", { path: document.path, href: selectedHref })
      .then((nextChapter) => {
        if (!cancelled) {
          setChapter(nextChapter);
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingChapter(false);
      });

    return () => {
      cancelled = true;
    };
  }, [document.path, selectedHref]);

  const scrollToSelectedAnchor = useCallback(() => {
    const frame = iframeRef.current;
    const frameWindow = frame?.contentWindow;
    const frameDocument = frame?.contentDocument;
    if (!frameWindow || !frameDocument) return;

    const fragment = hrefFragment(selectedHref);
    if (!fragment) {
      frameWindow.scrollTo({ top: 0 });
      return;
    }

    const target = frameDocument.getElementById(fragment) ?? frameDocument.getElementsByName(fragment)[0];
    target?.scrollIntoView({ block: "start" });
  }, [selectedHref]);

  useEffect(() => {
    if (!chapter) return;
    requestAnimationFrame(scrollToSelectedAnchor);
  }, [chapter, scrollToSelectedAnchor]);

  const isLoading = isLoadingInfo || isLoadingChapter;
  const creators = info?.creators.filter(Boolean).join(", ");
  const chapterIndexLabel =
    chapter?.spineIndex != null && info ? `${chapter.spineIndex + 1} / ${info.spine.length}` : "Chapter";

  return (
    <div className="grid min-h-0 grid-rows-[42px_minmax(0,1fr)] rounded-lg border border-border bg-editor">
      <div className="flex items-center justify-between gap-3 border-b border-border px-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => void toggleDocumentOutline()}
            title={documentOutlineCollapsed ? "Show chapters" : "Hide chapters"}
          >
            {documentOutlineCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={!chapter?.previousHref || isLoading}
            onClick={() => chapter?.previousHref && setSelectedHref(chapter.previousHref)}
            title="Previous chapter"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={!chapter?.nextHref || isLoading}
            onClick={() => chapter?.nextHref && setSelectedHref(chapter.nextHref)}
            title="Next chapter"
          >
            <ChevronRight className="size-4" />
          </Button>
          <span className="truncate text-xs text-muted-foreground">
            {activeTitle ?? info?.title ?? document.name}
            {creators ? ` · ${creators}` : ""}
          </span>
          {isLoading ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className="hidden text-xs text-muted-foreground md:inline">{chapterIndexLabel}</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={isLoadingInfo}
            onClick={() => setFontSize((value) => Math.max(14, value - 1))}
            title="Smaller text"
          >
            <Minus className="size-4" />
          </Button>
          <span className="w-10 text-center text-xs text-muted-foreground">{fontSize}px</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={isLoadingInfo}
            onClick={() => setFontSize((value) => Math.min(28, value + 1))}
            title="Larger text"
          >
            <Plus className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            disabled={isLoadingInfo}
            onClick={() => setLineHeight((value) => (value >= 1.9 ? 1.45 : Number((value + 0.15).toFixed(2))))}
          >
            {lineHeight.toFixed(2)}
          </Button>
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
            Chapters
          </div>
          {info?.toc.length ? (
            <EpubTocTree nodes={info.toc} activeHref={selectedHref} onSelect={setSelectedHref} />
          ) : info?.spine.length ? (
            <div className="space-y-1">
              {info.spine.map((item) => (
                <button
                  key={item.href}
                  className={`block w-full truncate rounded px-2 py-1.5 text-left text-xs ${
                    selectedHref && hrefWithoutFragment(selectedHref) === hrefWithoutFragment(item.href)
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  }`}
                  onClick={() => setSelectedHref(item.href)}
                >
                  {item.label || `Chapter ${item.index + 1}`}
                </button>
              ))}
            </div>
          ) : (
            <p className="px-1 text-xs leading-5 text-sidebar-muted">
              {isLoadingInfo ? "Loading chapters" : "No table of contents found"}
            </p>
          )}
          <div className="mt-3 px-1 text-[10px] text-sidebar-muted">{formatBytes(document.size)}</div>
          </div>
        </aside>

        <div className="relative min-h-0 bg-muted/45">
          {isLoading ? (
            <div className="absolute inset-0 z-10 grid place-items-center bg-editor/85 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Loading EPUB
              </span>
            </div>
          ) : null}
          {error ? (
            <div className="grid h-full place-items-center p-6 text-center">
              <div className="max-w-md space-y-3">
                <h2 className="text-base font-semibold text-foreground">EPUB preview unavailable</h2>
                <p className="text-sm leading-6 text-muted-foreground">{error}</p>
                <Button onClick={onOpenExternal}>
                  <ExternalLink className="size-4" />
                  Open External
                </Button>
              </div>
            </div>
          ) : chapter ? (
            <iframe
              ref={iframeRef}
              className="h-full w-full border-0 bg-white"
              onLoad={scrollToSelectedAnchor}
              sandbox=""
              srcDoc={srcDocFor(chapter.html, fontSize, lineHeight)}
              title={activeTitle ?? info?.title ?? document.name}
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">No chapter selected</div>
          )}
        </div>
      </div>
    </div>
  );
}
