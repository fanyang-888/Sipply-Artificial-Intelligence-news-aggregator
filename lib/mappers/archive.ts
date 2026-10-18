/** Archive rows: the compact story rows used by the archive, topic and weekly pages. */

import type { ApiArchiveClusterRow } from "@/lib/api/types";
import type { Translations } from "@/lib/i18n";

export type ArchiveClusterRow = {
  kind: "cluster";
  id: string;
  slug?: string | null;
  title: string;
  theme: string;
  themeLabel: string;
  summarySnippet: string;
  sourceLabels: string;
  clusterScore?: number;
  freshnessLabel?: string;
  dateKey: string; // YYYY-MM-DD for grouping
};

export type ArchiveResultRow = ArchiveClusterRow;

export function toDateKey(dateStr: string | null): string {
  if (!dateStr) return "unknown";
  return dateStr.slice(0, 10); // YYYY-MM-DD
}

/** "arXiv · TechCrunch · The Verge +2" — names capped at 3, falls back to a count. */
export function formatSourceLabels(sourceNames: string[], sourceCount: number, t: Translations): string {
  if (sourceNames.length === 0) return t.archive.sourceCountLabel(sourceCount);
  const shown = sourceNames.slice(0, 3).join(" · ");
  const extra = sourceNames.length - 3;
  return extra > 0 ? `${shown} +${extra}` : shown;
}

const UTC_DAY = {
  en: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  zh: new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", timeZone: "UTC" }),
};

/**
 * API row → display row. ``now`` gives relative freshness ("3h ago"); pass
 * null when rendering on the server (or before mount) to get a fixed date
 * instead, so server and browser render the same text.
 */
export function apiRowToArchiveRow(
  c: ApiArchiveClusterRow,
  t: Translations,
  lang: string,
  now: number | null,
): ArchiveClusterRow {
  let freshnessLabel: string | undefined;
  if (c.lastSeenAt) {
    if (now == null) {
      freshnessLabel = UTC_DAY[lang === "zh" ? "zh" : "en"].format(new Date(c.lastSeenAt));
    } else {
      const diff = (now - new Date(c.lastSeenAt).getTime()) / 60000;
      if (diff < 60) freshnessLabel = t.archive.freshnessMinutes(Math.round(diff));
      else if (diff < 1440) freshnessLabel = t.archive.freshnessHours(Math.round(diff / 60));
      else freshnessLabel = t.archive.freshnessDays(Math.round(diff / 1440));
    }
  }
  const isZh = lang === "zh";
  return {
    kind: "cluster",
    id: c.id,
    slug: c.slug,
    title: isZh ? c.title_zh || c.title : c.title,
    theme: c.theme,
    themeLabel: c.topicTag ?? c.theme,
    summarySnippet: (isZh ? c.summary_zh ?? c.summary ?? "" : c.summary ?? "").slice(0, 160),
    sourceLabels: formatSourceLabels(c.sourceNames ?? [], c.sourceCount, t),
    clusterScore: c.clusterScore ?? undefined,
    freshnessLabel,
    dateKey: toDateKey(c.lastSeenAt),
  };
}
