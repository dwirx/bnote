import { describe, expect, test } from "bun:test";
import type { EditorTab, FileDocument } from "../src/types";
import { clampViewerZoom, imageGalleryTabs, zoomViewportAroundPoint } from "../src/utils/imageViewer";

function imageDocument(path: string): FileDocument {
  const name = path.split(/[\\/]/).pop() ?? path;
  return {
    path,
    name,
    extension: name.split(".").pop() ?? null,
    size: 1024,
    modified: null,
    kind: "image",
    content: null,
    encoding: "image",
    lineCount: 0,
    editable: false,
    truncated: false,
    previewBytes: 0,
  };
}

function tab(path: string, kind: FileDocument["kind"] = "image"): EditorTab {
  const document = kind === "image" ? imageDocument(path) : { ...imageDocument(path), kind };
  return {
    id: `file:${path}`,
    document,
    content: "",
    csvViewMode: "raw",
    lastSavedContent: "",
  };
}

describe("image viewer helpers", () => {
  test("clamps zoom to readable viewer bounds", () => {
    expect(clampViewerZoom(0.01)).toBe(0.1);
    expect(clampViewerZoom(2)).toBe(2);
    expect(clampViewerZoom(20)).toBe(10);
  });

  test("keeps the pointer focus stable when zooming a scrolled image", () => {
    expect(
      zoomViewportAroundPoint({
        zoom: 1,
        nextZoom: 2,
        scrollLeft: 200,
        scrollTop: 80,
        anchorX: 300,
        anchorY: 160,
      }),
    ).toEqual({
      zoom: 2,
      scrollLeft: 700,
      scrollTop: 320,
    });
  });

  test("returns only image tabs in their current tab order", () => {
    const tabs = [
      tab("C:/notes/readme.md", "text"),
      tab("C:/images/one.png"),
      tab("C:/images/two.webp"),
    ];

    expect(imageGalleryTabs(tabs).map((item) => item.document.name)).toEqual(["one.png", "two.webp"]);
  });
});
