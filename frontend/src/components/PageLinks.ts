import type { NotePage } from "../types";

// [[Page title]] wikilinks between note pages (Notion-style @-mentions,
// simplified to titles). Matching is case-insensitive; a page never links
// to itself.

export function parseWikilinks(markdown: string): string[] {
  const found: string[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    const title = match[1].trim();
    if (title && !found.some((t) => t.toLowerCase() === title.toLowerCase())) {
      found.push(title);
    }
  }
  return found;
}

export function resolveWikilink(pages: NotePage[], title: string, selfId: string): NotePage | null {
  const clean = title.toLowerCase();
  return pages.find((p) => p.id !== selfId && p.title.toLowerCase() === clean) ?? null;
}

export function findBacklinks(pages: NotePage[], page: NotePage): NotePage[] {
  const self = page.title.toLowerCase();
  return pages.filter(
    (p) => p.id !== page.id && parseWikilinks(p.content_md).some((t) => t.toLowerCase() === self),
  );
}
