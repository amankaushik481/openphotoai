"use client";

import * as React from "react";
import {
  DEFAULT_LOCALE,
  t as translateKey,
  tCount as translateCount,
  type Locale,
  type TranslationKey,
  type TranslationVars,
} from "./index";

const LocaleContext = React.createContext<Locale>(DEFAULT_LOCALE);

export function I18nProvider({ locale = DEFAULT_LOCALE, children }: { locale?: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return React.useContext(LocaleContext);
}

export interface Translator {
  (key: TranslationKey, vars?: TranslationVars): string;
  count: (key: TranslationKey, oneKey: TranslationKey, count: number, vars?: TranslationVars) => string;
  locale: Locale;
}

const translators = new Map<Locale, Translator>();

/** One stable translator per locale (stable identity keeps hook dependency arrays quiet). */
function translatorFor(locale: Locale): Translator {
  let fn = translators.get(locale);
  if (!fn) {
    fn = Object.assign((key: TranslationKey, vars?: TranslationVars) => translateKey(key, vars, locale), {
      count: (key: TranslationKey, oneKey: TranslationKey, count: number, vars?: TranslationVars) =>
        translateCount(key, oneKey, count, vars, locale),
      locale,
    });
    translators.set(locale, fn);
  }
  return fn;
}

/** Translator bound to the current locale: `const t = useT(); t("nav.pricing")`. */
export function useT(): Translator {
  return translatorFor(useLocale());
}
