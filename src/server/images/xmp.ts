/**
 * XMP packet for the "AI-generated" label (IPTC Digital Source Type) and a small reader for it.
 * See docs/DECISIONS.md #16.
 */
export const TRAINED_ALGORITHMIC_MEDIA = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";

export interface AiLabelInfo {
  /** IPTC Digital Source Type URI. */
  digitalSourceType: string;
  /** `xmp:CreatorTool` (generator / model id). */
  generator?: string;
  /** `dc:description` (x-default). */
  description?: string;
  /** `dc:identifier` — the job that produced the file. */
  jobId?: string;
  /** `xmp:CreateDate` (ISO 8601). */
  createdAt?: string;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number.parseInt(d, 10)))
    .replace(/&amp;/g, "&");
}

export function buildAiXmp(info: { generator: string; jobId: string; createdAt: Date; appName: string }): string {
  const created = info.createdAt.toISOString();
  return [
    `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>`,
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">`,
    ` <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">`,
    `  <rdf:Description rdf:about=""`,
    `    xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"`,
    `    xmlns:xmp="http://ns.adobe.com/xap/1.0/"`,
    `    xmlns:dc="http://purl.org/dc/elements/1.1/"`,
    `    Iptc4xmpExt:DigitalSourceType="${TRAINED_ALGORITHMIC_MEDIA}"`,
    `    xmp:CreatorTool="${escapeXml(info.generator)}"`,
    `    xmp:CreateDate="${created}"`,
    `    xmp:MetadataDate="${created}">`,
    `   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(`AI-generated with ${info.appName}`)}</rdf:li></rdf:Alt></dc:description>`,
    `   <dc:identifier>${escapeXml(info.jobId)}</dc:identifier>`,
    `  </rdf:Description>`,
    ` </rdf:RDF>`,
    `</x:xmpmeta>`,
    `<?xpacket end="w"?>`,
  ].join("\n");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Read a simple XMP property in attribute (`p:Name="v"`) or element (`<p:Name>v</p:Name>`) form. */
function readProperty(xmp: string, qname: string): string | undefined {
  const q = escapeRe(qname);
  const attr = new RegExp(`\\s${q}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(xmp);
  if (attr) return unescapeXml(attr[1] ?? attr[2] ?? "");
  const el = new RegExp(`<${q}(?:\\s[^>]*)?>([\\s\\S]*?)</${q}>`).exec(xmp);
  if (!el) return undefined;
  const inner = el[1] ?? "";
  // Language alternatives / bags: take the x-default (or first) rdf:li.
  const li =
    /<rdf:li[^>]*xml:lang\s*=\s*["']x-default["'][^>]*>([\s\S]*?)<\/rdf:li>/.exec(inner) ??
    /<rdf:li(?:\s[^>]*)?>([\s\S]*?)<\/rdf:li>/.exec(inner);
  return unescapeXml((li ? li[1] ?? "" : inner).trim());
}

/** Parse our AI label from an XMP packet. Returns null when no Digital Source Type is present. */
export function parseAiXmp(xmp: string): AiLabelInfo | null {
  const digitalSourceType = readProperty(xmp, "Iptc4xmpExt:DigitalSourceType");
  if (!digitalSourceType) return null;
  return {
    digitalSourceType,
    generator: readProperty(xmp, "xmp:CreatorTool"),
    description: readProperty(xmp, "dc:description"),
    jobId: readProperty(xmp, "dc:identifier"),
    createdAt: readProperty(xmp, "xmp:CreateDate"),
  };
}
