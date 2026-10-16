"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Lang, Translations } from "./types";
import { en } from "./en";
import { zh } from "./zh";

const STORAGE_KEY = "pai-lang";

function isLang(v: string | null): v is Lang {
  return v === "en" || v === "zh";
}

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translations;
  /** True after the saved language has been read on the client. */
  i18nReady: boolean;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      /* eslint-disable react-hooks/set-state-in-effect -- hydrate preferred language from localStorage after mount (avoid SSR mismatch) */
      if (isLang(raw)) setLangState(raw);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    // The page now renders in the saved language: show it (see the root layout's inline script)
    document.documentElement.removeAttribute("data-lang-gate");
  }, [lang, hydrated]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
  }, []);

  const t = useMemo(() => (lang === "zh" ? zh : en), [lang]);

  const value = useMemo(
    () => ({ lang, setLang, t, i18nReady: hydrated }),
    [lang, setLang, t, hydrated],
  );

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
