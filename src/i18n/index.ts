/**
 * Tiny typed i18n. `t("nav.pricing")` with dot-path type safety and `{var}` interpolation.
 * Server components call `t()` directly; client components use `useT()` from `@/i18n/react`.
 *
 * Adding a locale (e.g. German):
 *   1. Create `src/i18n/de.ts` exporting `export const de: Dictionary = { ... }` — the
 *      `Dictionary` type forces the same nested keys as `en.ts` (values are plain strings).
 *   2. Add `"de"` to `LOCALES` and register it in `DICTIONARIES` below.
 *   3. Choose the locale per request (e.g. `user.locale` or `Accept-Language`) in the root
 *      layout, set `<html lang>` and pass it to `<I18nProvider locale>` (src/components/providers).
 *   Missing keys in a locale fall back to English, then to the key itself.
 */
import type { ApiErrorCode } from "@/types/domain";
import { en } from "./en";

export const LOCALES = ["en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Same shape as `en`, but any string values — what every other locale must satisfy. */
export type Dictionary = DeepStrings<typeof en>;
type DeepStrings<T> = { readonly [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };

/** Every dot-path that resolves to a string leaf, e.g. "nav.pricing" | "errors.not_found". */
export type TranslationKey = LeafPaths<typeof en>;
type LeafPaths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : LeafPaths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TranslationVars = Record<string, string | number>;

const DICTIONARIES: Record<Locale, Dictionary> = { en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

function lookup(dict: unknown, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** Replace `{name}` placeholders; unknown placeholders are left as-is so gaps are visible. */
export function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/**
 * Untyped core used by `t()`: looks the key up in `dict`, then in `fallback`, else returns the key.
 * Exported for tests and for callers holding a dynamic key string.
 */
export function translate(
  dict: unknown,
  key: string,
  vars?: TranslationVars,
  fallback: unknown = en,
): string {
  const template = lookup(dict, key) ?? lookup(fallback, key) ?? key;
  return interpolate(template, vars);
}

export function t(key: TranslationKey, vars?: TranslationVars, locale: Locale = DEFAULT_LOCALE): string {
  return translate(DICTIONARIES[locale] ?? en, key, vars);
}

export function getDictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
  return DICTIONARIES[locale] ?? en;
}

/** Friendly message for an API error code (from `ApiClientError.code`). */
export function errorMessage(code: ApiErrorCode | "network" | undefined, locale: Locale = DEFAULT_LOCALE): string {
  return t(code ? `errors.${code}` : "errors.generic", undefined, locale);
}

/** Pick the `…One` variant for count === 1 (e.g. "credits.balance" / "credits.balanceOne"). */
export function tCount(
  key: TranslationKey,
  oneKey: TranslationKey,
  count: number,
  vars?: TranslationVars,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return t(count === 1 ? oneKey : key, { count: count.toLocaleString(locale), ...vars }, locale);
}
