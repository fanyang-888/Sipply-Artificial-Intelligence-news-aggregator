"use client";

import {
  createContext,
  startTransition,
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
    let saved: Lang | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (isLang(raw)) saved = raw;
    } catch {
      /* ignore */
    }
    // A transition, so React finishes hydrating the page first. An ordinary update here
    // reaches every page through this context while the page's Suspense boundary may still be
    // hydrating; React then drops the server HTML, shows the loading skeleton and renders the
    // page again on the client (a ~300 ms flash, layout shift up to 0.75).
    startTransition(() => {
      if (saved) setLangState(saved);
      setHydrated(true);
    });
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
