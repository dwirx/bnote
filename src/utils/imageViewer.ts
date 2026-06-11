import type { EditorTab } from "@/types";

export const MIN_VIEWER_ZOOM = 0.1;
export const MAX_VIEWER_ZOOM = 10;
export const VIEWER_ZOOM_STEP = 0.2;

export type ViewportZoomState = {
  zoom: number;
  nextZoom: number;
  scrollLeft: number;
  scrollTop: number;
  anchorX: number;
  anchorY: number;
};

export function clampViewerZoom(value: number) {
  return Math.min(MAX_VIEWER_ZOOM, Math.max(MIN_VIEWER_ZOOM, value));
}

export function zoomViewportAroundPoint(state: ViewportZoomState) {
  const zoom = clampViewerZoom(state.nextZoom);
  const ratio = zoom / state.zoom;

  return {
    zoom,
    scrollLeft: Math.max(0, Math.round((state.scrollLeft + state.anchorX) * ratio - state.anchorX)),
    scrollTop: Math.max(0, Math.round((state.scrollTop + state.anchorY) * ratio - state.anchorY)),
  };
}

export function imageGalleryTabs(tabs: EditorTab[]) {
  return tabs.filter((tab) => tab.document.kind === "image");
}
