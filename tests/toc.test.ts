import { describe, expect, test } from "bun:test";
import type { TocNode } from "../src/types";
import { epubTocTargetMatches, tocNodePageIndex } from "../src/utils/toc";

const tocNode = (node: Partial<TocNode> & Pick<TocNode, "id" | "title">): TocNode => ({
  target: "",
  pageIndex: null,
  children: [],
  ...node,
});

describe("TOC helpers", () => {
  test("uses the first child page for PDF TOC nodes without their own destination", () => {
    const node = tocNode({
      id: "section",
      title: "Section",
      children: [
        tocNode({ id: "chapter-1", title: "Chapter 1", pageIndex: 4 }),
        tocNode({ id: "chapter-2", title: "Chapter 2", pageIndex: 8 }),
      ],
    });

    expect(tocNodePageIndex(node)).toBe(4);
  });

  test("does not treat every EPUB TOC entry in the same chapter as active when an anchor is selected", () => {
    expect(epubTocTargetMatches("chapter.xhtml#intro", "chapter.xhtml#details")).toBe(false);
    expect(epubTocTargetMatches("chapter.xhtml#details", "chapter.xhtml#details")).toBe(true);
  });
});
