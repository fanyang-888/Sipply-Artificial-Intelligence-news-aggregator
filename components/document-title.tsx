"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

/**
 * Sets document.title from the current route and language, for the pages
 * whose title is just a section name. Every other page (stories, a topic,
 * a week) keeps the specific title its generateMetadata rendered.
 *
 * Next streams each page's own <title> into <head> after hydration, which
 * would overwrite a title set only once; so after setting ours we watch the
 * <head> and put it back whenever the page's English one lands.
 */
export function DocumentTitle() {
  const pathname = usePathname();
  const { t, i18nReady } = useI18n();

  useEffect(() => {
    if (!i18nReady) return;
    const pagePart =
      pathname === "/" ? t.meta.titleHome
      : pathname === "/archive" ? t.meta.titleArchive
      : pathname === "/radar" ? t.meta.titleRadar
      : pathname === "/topics" ? t.hubs.topicsTitle
      : pathname === "/weekly" ? t.hubs.weeklyTitle
      : null;
    if (!pagePart) return;
    const wanted = `${pagePart} | ${t.meta.titleBrand}`;
    const apply = () => {
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [i18nReady, pathname, t]);

  return null;
}
