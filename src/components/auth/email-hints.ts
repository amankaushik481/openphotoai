/**
 * Pure helpers for the magic-link form: typo suggestions for common email domains, a shortcut to the
 * user's webmail, friendly send errors and the resend cooldown. No React, so they're unit-tested.
 */

/** Seconds before "Resend link" is enabled again (the server also limits sends per address and IP). */
export const RESEND_COOLDOWN_SEC = 30;

/** Big webmail domains we fuzzy-match against. Short ones (me.com, aol.com, live.com) are exact-only. */
const FUZZY_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "protonmail.com",
  "proton.me",
  "hotmail.co.uk",
  "yahoo.co.uk",
] as const;

const KNOWN_DOMAINS = new Set<string>([
  ...FUZZY_DOMAINS,
  "me.com",
  "mac.com",
  "aol.com",
  "live.com",
  "msn.com",
  "mail.com",
  "email.com",
  "gmx.com",
  "gmx.de",
  "gmx.net",
  "web.de",
  "ymail.com",
  "pm.me",
]);

/** Misspelled top-level domains that don't exist, mapped to the one that was meant. */
const TLD_FIXES: Record<string, string> = {
  con: "com",
  cmo: "com",
  ocm: "com",
  vom: "com",
  xom: "com",
  cpm: "com",
  comm: "com",
  coom: "com",
  nte: "net",
  nett: "net",
  ogr: "org",
};

/** Optimal string alignment distance (Levenshtein + adjacent transpositions), capped for speed. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, rows[i - 2]![j - 2]! + 1);
      rows[i]![j] = d;
    }
  }
  return rows[a.length]![b.length]!;
}

function splitEmail(email: string): { local: string; domain: string } | null {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at < 1 || at === trimmed.length - 1) return null;
  return { local: trimmed.slice(0, at), domain: trimmed.slice(at + 1).toLowerCase() };
}

/**
 * The address the user probably meant when its domain looks like a typo of a big webmail provider
 * ("ana@gmial.com" → "ana@gmail.com", "ana@yahoo.con" → "ana@yahoo.com"); null when it looks fine.
 */
export function suggestEmail(email: string): string | null {
  const parts = splitEmail(email);
  if (!parts || KNOWN_DOMAINS.has(parts.domain)) return null;

  let domain = parts.domain;
  const dot = domain.lastIndexOf(".");
  if (dot > 0) {
    const fixed = TLD_FIXES[domain.slice(dot + 1)];
    if (fixed) domain = `${domain.slice(0, dot)}.${fixed}`;
  }
  if (!KNOWN_DOMAINS.has(domain)) {
    const tld = (d: string) => d.slice(d.lastIndexOf(".") + 1);
    let best: string | null = null;
    let bestDistance = Infinity;
    for (const candidate of FUZZY_DOMAINS) {
      // Two typos only in a long name with the same TLD: "hotmail.ca" is a real domain, not "hotmail.com".
      const allowed = candidate.length >= 10 && tld(candidate) === tld(domain) ? 2 : 1;
      const d = editDistance(domain, candidate, allowed);
      if (d <= allowed && d < bestDistance) {
        best = candidate;
        bestDistance = d;
      }
    }
    if (best) domain = best;
  }
  return domain === parts.domain ? null : `${parts.local}@${domain}`;
}

const WEBMAIL: { label: string; href: string; domains: readonly string[] }[] = [
  { label: "Gmail", href: "https://mail.google.com/mail/u/0/#inbox", domains: ["gmail.com", "googlemail.com"] },
  {
    label: "Outlook",
    href: "https://outlook.live.com/mail/0/",
    domains: ["outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "msn.com"],
  },
  { label: "Yahoo Mail", href: "https://mail.yahoo.com/", domains: ["yahoo.com", "yahoo.co.uk", "ymail.com"] },
  { label: "iCloud Mail", href: "https://www.icloud.com/mail", domains: ["icloud.com", "me.com", "mac.com"] },
  { label: "Proton Mail", href: "https://mail.proton.me/", domains: ["proton.me", "protonmail.com", "pm.me"] },
];

/** "Open Gmail"-style shortcut for addresses at a big webmail provider (null for anything else). */
export function webmailFor(email: string): { label: string; href: string } | null {
  const parts = splitEmail(email);
  if (!parts) return null;
  const hit = WEBMAIL.find((w) => w.domains.includes(parts.domain));
  return hit ? { label: hit.label, href: hit.href } : null;
}

/** The parts of a Better Auth client error we look at. */
export interface SendError {
  status?: number;
  code?: string;
  message?: string;
}

/** Plain-language copy for a failed magic-link send, always saying what to do next. */
export function sendErrorMessage(err: SendError | null | undefined): string {
  const code = err?.code?.toUpperCase();
  const status = err?.status ?? 0;
  if (status === 429 || code === "RATE_LIMITED" || code === "TOO_MANY_REQUESTS") {
    const seconds = Number(/(\d+)\s*s\b/.exec(err?.message ?? "")?.[1]);
    const wait =
      Number.isFinite(seconds) && seconds > 0
        ? seconds < 90
          ? "in a minute"
          : `in about ${Math.ceil(seconds / 60)} minutes`
        : "in a few minutes";
    return `You've requested several sign-in links in a short time. Use the newest link in your inbox, or try again ${wait}.`;
  }
  if (code === "INVALID_EMAIL" || (status === 400 && /email/i.test(err?.message ?? ""))) {
    return "That email address doesn't look right. Check it for typos and try again.";
  }
  if (code === "BANNED_USER") return "This account is suspended. Contact support if you think this is a mistake.";
  if (status === 0) return "We couldn't reach the server. Check your connection and try again.";
  if (status >= 500) return "We couldn't send the link just now. Please try again in a minute.";
  return err?.message?.trim() || "We couldn't send the link. Please try again.";
}

/** Whole seconds left before another link may be requested (0 when resending is allowed). */
export function resendSecondsLeft(sentAt: number | null, now: number, cooldownSec = RESEND_COOLDOWN_SEC): number {
  if (sentAt === null) return 0;
  // Clamped: the ticking clock can lag a moment behind `sentAt`.
  return Math.min(cooldownSec, Math.max(0, Math.ceil((sentAt + cooldownSec * 1000 - now) / 1000)));
}
