/** Pull clickable http(s) links out of rendered email HTML (dev mailbox, e2e tests). */

const NAMED_ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Unique absolute http(s) hrefs of `<a>` tags, in document order (the primary CTA comes first). */
export function extractLinks(html: string): string[] {
  const links = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const url = decodeEntities(m[1] ?? m[2] ?? "").trim();
    if (/^https?:\/\//i.test(url)) links.add(url);
  }
  return [...links];
}
