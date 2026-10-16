"use client";

import type { ReactNode } from "react";
import { DocumentTitle } from "@/components/document-title";
import { I18nProvider, useI18n } from "@/lib/i18n";

/**
 * Visible in the server HTML. Only a reader whose saved language is Chinese is gated:
 * the inline script in the root layout sets data-lang-gate on <html> before first paint,
 * CSS hides .sp-lang-gate while it is there, and I18nProvider removes it once the page
 * has re-rendered in Chinese.
 */
function I18nVisualGate({ children }: { children: ReactNode }) {
  const { i18nReady } = useI18n();

  return (
    <div className="sp-lang-gate flex min-h-0 min-w-0 flex-1 flex-col">
      {i18nReady ? <DocumentTitle /> : null}
      {children}
    </div>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <I18nVisualGate>{children}</I18nVisualGate>
    </I18nProvider>
  );
}
