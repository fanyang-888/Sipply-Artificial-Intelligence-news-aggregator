import type { Lang } from "@/lib/i18n/types";

const localeForLang: Record<Lang, string> = {
  en: "en-US",
  zh: "zh-CN",
};

export function formatDigestDate(
  date: Date = new Date(),
  lang: Lang = "en",
): string {
  return new Intl.DateTimeFormat(localeForLang[lang], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

/** Pass a timeZone (e.g. "UTC") for output that must match between server and browser. */
export function formatShortDateTime(iso: string, lang: Lang = "en", timeZone?: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(localeForLang[lang], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}
