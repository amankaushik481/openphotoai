/** Legal templates are typed data (no MDX): sections of paragraphs, lists, tables and callouts. */

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "note"; text: string };

export interface LegalSection {
  /** Anchor id (stable, used in the table of contents and cross-links). */
  id: string;
  heading: string;
  blocks: LegalBlock[];
}

export type LegalSlug = "terms" | "privacy" | "acceptable-use";

export interface LegalDocument {
  slug: LegalSlug;
  title: string;
  /** One-paragraph plain-language summary shown above the full text (and used as meta description). */
  summary: string;
  /** Short bullet "in plain words" highlights. */
  highlights: string[];
  sections: LegalSection[];
}
