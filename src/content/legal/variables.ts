/**
 * Variables interpolated into the legal templates as `{{name}}`. Operator-specific values come from
 * `APP` (NEXT_PUBLIC_LEGAL_* / support env vars); policy numbers live here so they are edited in one place.
 */
import { APP, TRAINING } from "@/config/app";
import type { LegalBlock, LegalDocument } from "./types";

/** Date the templates were last revised. Bump it whenever the wording changes. */
export const LEGAL_LAST_UPDATED = "2026-11-24";

export interface LegalVariables {
  appName: string;
  appUrl: string;
  legalEntity: string;
  jurisdiction: string;
  supportEmail: string;
  takedownEmail: string;
  lastUpdated: string;
  minAge: number;
  /** Self-serve refund window for unused credits (days after purchase). */
  refundWindowDays: number;
  /** Notice before any price change (days). */
  priceChangeNoticeDays: number;
  /** Plan credits carry over for this many months. */
  rolloverMonths: number;
  /** We acknowledge takedown requests within (hours). */
  takedownAckHours: number;
  /** Intimate imagery / minors / impersonation reports are actioned within (hours). */
  takedownUrgentHours: number;
  /** Other reports are resolved within (business days). */
  takedownStandardDays: number;
  /** Deleted data disappears from encrypted backups within (days). */
  backupRetentionDays: number;
  /** Account-deletion confirmation links expire after (hours). */
  deletionLinkHours: number;
  /** Biometric data is destroyed after this many years of inactivity at the latest. */
  biometricMaxYears: number;
  /** Server logs (IP addresses, request metadata) are kept for (days). */
  logRetentionDays: number;
}

export type LegalVariableName = keyof LegalVariables;

/** Defaults for the hosted service, derived from public app config. */
export function getLegalVariables(overrides: Partial<LegalVariables> = {}): LegalVariables {
  return {
    appName: APP.name,
    appUrl: APP.url,
    legalEntity: APP.legalEntity,
    jurisdiction: APP.legalJurisdiction,
    supportEmail: APP.supportEmail,
    takedownEmail: APP.takedownEmail,
    lastUpdated: LEGAL_LAST_UPDATED,
    minAge: TRAINING.minAge,
    refundWindowDays: 14,
    priceChangeNoticeDays: 30,
    rolloverMonths: 1,
    takedownAckHours: 24,
    takedownUrgentHours: 48,
    takedownStandardDays: 5,
    backupRetentionDays: 30,
    deletionLinkHours: 24,
    biometricMaxYears: 3,
    logRetentionDays: 30,
    ...overrides,
  };
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/** Replace `{{name}}` placeholders. Unknown names are left visible so gaps are caught in review/tests. */
export function interpolateTemplate(template: string, vars: LegalVariables): string {
  return template.replace(PLACEHOLDER, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name as LegalVariableName]) : match,
  );
}

/** Placeholders that remain in `text` (after interpolation this should be empty). */
export function findPlaceholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1]!);
}

function fillBlock(block: LegalBlock, vars: LegalVariables): LegalBlock {
  const fill = (s: string) => interpolateTemplate(s, vars);
  switch (block.type) {
    case "p":
    case "note":
      return { ...block, text: fill(block.text) };
    case "list":
      return { ...block, items: block.items.map(fill) };
    case "table":
      return { ...block, head: block.head.map(fill), rows: block.rows.map((r) => r.map(fill)) };
  }
}

/** A legal template with every string interpolated. Pure: the input template is not modified. */
export function renderLegalDocument(doc: LegalDocument, vars: LegalVariables = getLegalVariables()): LegalDocument {
  const fill = (s: string) => interpolateTemplate(s, vars);
  return {
    ...doc,
    title: fill(doc.title),
    summary: fill(doc.summary),
    highlights: doc.highlights.map(fill),
    sections: doc.sections.map((s) => ({
      ...s,
      heading: fill(s.heading),
      blocks: s.blocks.map((b) => fillBlock(b, vars)),
    })),
  };
}

/** Every string in a document, flattened (used by tests and search). */
export function documentStrings(doc: LegalDocument): string[] {
  const out = [doc.title, doc.summary, ...doc.highlights];
  for (const s of doc.sections) {
    out.push(s.heading);
    for (const b of s.blocks) {
      if (b.type === "p" || b.type === "note") out.push(b.text);
      else if (b.type === "list") out.push(...b.items);
      else out.push(...b.head, ...b.rows.flat());
    }
  }
  return out;
}
