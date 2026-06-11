import { describe, expect, test } from "bun:test";
import type { FileDocument } from "../src/types";
import { getLanguageLabel } from "../src/utils/files";

function documentWithKind(kind: FileDocument["kind"], extension: string): FileDocument {
  return {
    path: `C:/images/sample.${extension}`,
    name: `sample.${extension}`,
    extension,
    size: 1024,
    modified: null,
    kind,
    content: null,
    encoding: kind,
    lineCount: 0,
    editable: false,
    truncated: false,
    previewBytes: 0,
  };
}

describe("file helpers", () => {
  test("labels native image documents as images", () => {
    expect(getLanguageLabel(documentWithKind("image", "heic"))).toBe("Image");
  });
});
