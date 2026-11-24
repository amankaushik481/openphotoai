/**
 * Tiny inline markup used by marketing copy (FAQ answers, legal templates):
 *   **bold**   [label](/path or https://url or mailto:x)   bare emails are auto-linked.
 * Kept deliberately small so copy stays plain data (no MDX) and can be turned into plain text for JSON-LD.
 */

export type InlineToken =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "link"; text: string; href: string };

const TOKEN = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/** Split `text` into plain, bold and link tokens. */
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ type: "text", text: text.slice(last, index) });
    const [, bold, label, href, email] = match;
    if (bold !== undefined) tokens.push({ type: "strong", text: bold });
    else if (label !== undefined && href !== undefined) tokens.push({ type: "link", text: label, href });
    else if (email !== undefined) tokens.push({ type: "link", text: email, href: `mailto:${email}` });
    last = index + match[0].length;
  }
  if (last < text.length) tokens.push({ type: "text", text: text.slice(last) });
  return tokens;
}

/** Strip the inline markup (for meta descriptions and structured data). */
export function toPlainText(text: string): string {
  return parseInline(text)
    .map((t) => t.text)
    .join("");
}

/** True for links that leave the site (rendered with rel="noopener noreferrer"). */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}
