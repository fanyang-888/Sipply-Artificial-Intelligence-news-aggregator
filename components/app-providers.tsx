"use client";

import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

/** The page's language (from its URL) for every client component; nothing here hides the page. */
export function AppProviders({ lang, children }: { lang: Lang; children: ReactNode }) {
  return (
    <I18nProvider lang={lang}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </I18nProvider>
  );
}
