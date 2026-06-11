import type { TocNode } from "@/types";

export function flattenToc(nodes: TocNode[]): TocNode[] {
  return nodes.flatMap((node) => [node, ...flattenToc(node.children)]);
}

export function tocNodePageIndex(node: TocNode): number | null {
  if (node.pageIndex != null) return node.pageIndex;

  for (const child of node.children) {
    const pageIndex = tocNodePageIndex(child);
    if (pageIndex != null) return pageIndex;
  }

  return null;
}

export function firstTocTarget(nodes: TocNode[]): string | null {
  for (const node of nodes) {
    if (node.target) return node.target;
    const childTarget = firstTocTarget(node.children);
    if (childTarget) return childTarget;
  }
  return null;
}

export function hrefWithoutFragment(href: string) {
  return href.split(/[?#]/)[0] ?? href;
}

export function hrefFragment(href: string | null) {
  if (!href) return null;
  const fragment = href.match(/#([^?]*)/)?.[1];
  return fragment ? decodeURIComponent(fragment) : null;
}

export function epubTocTargetMatches(target: string, activeHref: string | null) {
  if (!target || !activeHref) return false;
  if (target === activeHref) return true;

  const targetFragment = hrefFragment(target);
  const activeFragment = hrefFragment(activeHref);
  if (targetFragment || activeFragment) return false;

  return hrefWithoutFragment(target) === hrefWithoutFragment(activeHref);
}
