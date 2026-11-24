/** Formatting helpers for the admin pages (server + client safe, fixed en-US / UTC output). */

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const integer = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});
const shortDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Integer cents → "$1,234.50" (negative amounts keep their sign). */
export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** Provider cost in USD with sub-cent precision: "$0.035", "$12.40". */
export function formatCostUsd(value: number): string {
  if (value !== 0 && Math.abs(value) < 1) return `$${value.toFixed(4).replace(/0{1,2}$/, "")}`;
  return usd.format(value);
}

export function formatNumber(n: number): string {
  return integer.format(n);
}

export function formatCompact(n: number): string {
  return compact.format(n);
}

/** 0.1234 → "12.3%"; null → "—". */
export function formatPercent(rate: number | null, digits = 1): string {
  if (rate === null || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(digits)}%`;
}

export function formatSignedCredits(delta: number): string {
  return `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${integer.format(Math.abs(delta))}`;
}

type DateLike = Date | string | null | undefined;

function toDate(value: DateLike): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Nov 24, 2026" (UTC). */
export function formatDate(value: DateLike): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : "—";
}

/** "Nov 24, 14:05" (UTC). */
export function formatDateTime(value: DateLike): string {
  const d = toDate(value);
  return d ? `${dateTimeFmt.format(d)} UTC` : "—";
}

/** "2026-11-24" day key → "Nov 24". */
export function formatDayKey(key: string): string {
  const d = toDate(`${key}T00:00:00Z`);
  return d ? shortDay.format(d) : key;
}

/** Machine-ish identifiers ("remove_background") → "Remove background". */
export function humanize(value: string): string {
  const text = value.replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Compact JSON for safety-event details (long strings trimmed). */
export function summarizeDetails(details: Record<string, unknown>, max = 240): string {
  const json = JSON.stringify(details, (_key, value: unknown) =>
    typeof value === "string" && value.length > 120 ? `${value.slice(0, 119)}…` : value,
  );
  if (!json || json === "{}") return "—";
  return json.length > max ? `${json.slice(0, max - 1)}…` : json;
}
