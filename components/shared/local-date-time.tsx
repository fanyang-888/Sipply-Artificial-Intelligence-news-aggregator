"use client";

import type { Lang } from "@/lib/i18n";
import { formatShortDateTime } from "@/lib/utils/format-date";
import { useMounted } from "@/lib/use-mounted";

/**
 * A timestamp in the reader's time zone. The server (and hydration) render it
 * in UTC with a "UTC" suffix, then it switches to local time after mount.
 */
export function LocalDateTime({ iso, lang }: { iso: string; lang: Lang }) {
  const mounted = useMounted();
  // Some sources carry no publish date (mapped to ""); Intl throws on an invalid date
  if (!iso || Number.isNaN(Date.parse(iso))) return null;
  return (
    <time dateTime={iso}>
      {mounted ? formatShortDateTime(iso, lang) : `${formatShortDateTime(iso, lang, "UTC")} UTC`}
    </time>
  );
}
