"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

/**
 * Sets document.title from the current route and language.
 * Story pages are left alone: their headline title comes from the server.
 */
export function DocumentTitle() {
  const pathname = usePathname();
  const { t, i18nReady } = useI18n();

  useEffect(() => {
    if (!i18nReady) return;
    // Story pages keep the headline title rendered by the server (generateMetadata)
    if (pathname.startsWith("/cluster/")) return;

    const brand = t.meta.titleBrand;
    let pagePart = t.meta.titleHome;

    if (pathname === "/archive") {
      pagePart = t.meta.titleArchive;
    } else if (pathname === "/radar") {
      pagePart = t.meta.titleRadar;
    } else if (pathname.startsWith("/cluster/")) {
      pagePart = t.meta.titleStoryFallback;
    }

    document.title = `${pagePart} | ${brand}`;
  }, [i18nReady, pathname, t]);

  return null;
}
