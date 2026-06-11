import { describe, expect, test } from "bun:test";
import {
  droppedPathCountLabel,
  isLikelyFileArgument,
  normalizeDroppedPaths,
  shouldPreventDomFileDrop,
} from "../src/utils/drop";

describe("drop helpers", () => {
  test("removes empty and duplicate dropped paths while preserving order", () => {
    expect(normalizeDroppedPaths(["", "C:/notes/a.md", "C:/notes/a.md", "file:///C:/notes/b.md", "   "])).toEqual([
      "C:/notes/a.md",
      "C:/notes/b.md",
    ]);
  });

  test("formats dropped path counts for the global overlay", () => {
    expect(droppedPathCountLabel(0)).toBe("Drop files or folders anywhere");
    expect(droppedPathCountLabel(1)).toBe("Drop 1 item to open");
    expect(droppedPathCountLabel(3)).toBe("Drop 3 items to open");
  });

  test("lets Tauri native file drop own the drop pipeline when it is available", () => {
    expect(shouldPreventDomFileDrop(true)).toBe(false);
    expect(shouldPreventDomFileDrop(false)).toBe(true);
  });

  test("filters command-line flags out of startup file arguments", () => {
    expect(isLikelyFileArgument("--help")).toBe(false);
    expect(isLikelyFileArgument("/safe-mode")).toBe(false);
    expect(isLikelyFileArgument("C:/notes/readme.md")).toBe(true);
  });
});
