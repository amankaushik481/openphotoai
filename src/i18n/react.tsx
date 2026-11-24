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

/** Translator bound to the current locale: `const t = useT(); t("nav.pricing")`. */
export function useT(): Translator {
  const locale = useLocale();
  return React.useMemo(() => {
    const fn = ((key: TranslationKey, vars?: TranslationVars) => translateKey(key, vars, locale)) as Translator;
    fn.count = (key, oneKey, count, vars) => translateCount(key, oneKey, count, vars, locale);
    fn.locale = locale;
    return fn;
  }, [locale]);
}
