/**
 * The language lives in the URL: English at the root (/story/…), Chinese under /zh
 * (/zh/story/…). Both are rendered on the server, so search engines and AI assistants
 * read each language at its own address; hreflang links the pair.
 */

import type { Lang } from "./types";

export const LANGS: readonly Lang[] = ["en", "zh"];

/** Public pages that exist in both languages. */
const LOCALIZABLE = /^\/(?:$|(?:story|archive|radar|topics|weekly|daily)(?:\/|$))/;

export function isLocalizable(path: string): boolean {
  return LOCALIZABLE.test(path);
}

/** ``path`` in ``lang``: "/radar" → "/zh/radar" for Chinese. Other sites, anchors, machine
 * files (anything with an extension), admin, the API and pages already under /zh are left alone. */
export function localePath(path: string, lang: Lang): string {
  if (lang !== "zh" || !path.startsWith("/") || path.startsWith("//")) return path;
  const end = path.search(/[?#]/);
  const pathname = end < 0 ? path : path.slice(0, end);
  const rest = end < 0 ? "" : path.slice(end);
  if (pathname === "/zh" || pathname.startsWith("/zh/") || !isLocalizable(pathname)) return path;
  return `${pathname === "/" ? "/zh" : `/zh${pathname}`}${rest}`;
}

/** The language of a pathname and the path without it: "/zh/radar" → { zh, "/radar" }. */
export function splitLocale(pathname: string): { lang: Lang; path: string } {
  if (pathname === "/zh") return { lang: "zh", path: "/" };
  if (pathname.startsWith("/zh/")) return { lang: "zh", path: pathname.slice(3) };
  return { lang: "en", path: pathname };
}

/** Metadata alternates for a page: its own canonical URL, and both languages for hreflang. */
export function pageAlternates(path: string, lang: Lang): { canonical: string; languages: Record<string, string> } {
  return {
    canonical: localePath(path, lang),
    languages: { en: path, "zh-CN": localePath(path, "zh"), "x-default": path },
  };
}
