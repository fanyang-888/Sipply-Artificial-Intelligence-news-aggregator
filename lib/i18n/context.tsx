"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { Lang, Translations } from "./types";
import { en } from "./en";
import { zh } from "./zh";
import { isLocalizable, localePath, splitLocale } from "./routing";

/** The reader's chosen language. On an English page, the inline script in the root layout
 * sends a reader who chose Chinese to the /zh address before the first paint. */
export const LANG_STORAGE_KEY = "pai-lang";

type I18nContextValue = {
  /** The page's language: it comes from the URL (/zh/… is Chinese), so the server renders it. */
  lang: Lang;
  /** Remember ``next`` and open this page in it. */
  setLang: (lang: Lang) => void;
  t: Translations;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const setLang = useCallback(
    (next: Lang) => {
      try {
        localStorage.setItem(LANG_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      if (next === lang) return;
      const { path } = splitLocale(window.location.pathname);
      // A full load: the other language has its own <html lang>, title and metadata
      const target = isLocalizable(path) ? localePath(path, next) : path;
      window.location.assign(`${target}${window.location.search}${window.location.hash}`);
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t: lang === "zh" ? zh : en }), [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
