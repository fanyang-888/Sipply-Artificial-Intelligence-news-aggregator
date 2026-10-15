"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { uiMicroLabel } from "@/lib/ui/classes";

/**
 * "Share": the system share sheet where there is one (phones), otherwise the
 * page URL goes to the clipboard and the label says so for a moment. The
 * generated share card (opengraph-image) is what the link unfurls into.
 */
export function ShareButton({ title }: { title: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // The reader dismissed the sheet or the clipboard is unavailable; nothing to do
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className={`${uiMicroLabel} inline-flex items-center gap-1.5 transition-colors hover:text-foreground`}
      aria-live="polite"
    >
      {copied ? t.cluster.linkCopied : t.cluster.share}
      {copied ? null : <span aria-hidden>↗</span>}
    </button>
  );
}
