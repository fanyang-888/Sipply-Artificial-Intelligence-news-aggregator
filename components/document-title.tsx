"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

/**
 * Sets document.title from the current route and language, for the pages
 * whose title is just a section name. Every other page (stories, topics,
 * weekly recaps) keeps the specific title its generateMetadata rendered.
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
      : null;
    if (pagePart) document.title = `${pagePart} | ${t.meta.titleBrand}`;
  }, [i18nReady, pathname, t]);

  return null;
}
