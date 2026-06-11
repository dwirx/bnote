export function normalizeDroppedPaths(paths: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawPath of paths) {
    const path = normalizeDroppedPath(rawPath);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    normalized.push(path);
  }

  return normalized;
}

export function droppedPathCountLabel(count: number) {
  if (count <= 0) return "Drop files or folders anywhere";
  if (count === 1) return "Drop 1 item to open";
  return `Drop ${count} items to open`;
}

export function shouldPreventDomFileDrop(nativeFileDropAvailable: boolean) {
  return !nativeFileDropAvailable;
}

export function isLikelyFileArgument(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("--")) return false;
  if (/^\/[a-z-]+$/i.test(trimmed)) return false;
  return true;
}

function normalizeDroppedPath(rawPath: string) {
  const path = rawPath.trim();
  if (!path) return "";

  if (path.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(path).pathname).replace(/^\/([a-z]:)/i, "$1");
    } catch {
      return path;
    }
  }

  return path;
}
