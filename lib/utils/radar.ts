/**
 * Pure helpers for the Trend Radar page (filters, formatting, sparkline geometry).
 */

import type { ApiRadarSignal, ApiRadarTopic, RadarSourceKey } from "@/lib/api/types";
import type { Lang, Translations } from "@/lib/i18n";
import { TOPIC_GROUPS, type TopicGroupKey } from "@/lib/constants/topic-groups";

export type RadarFilters = {
  /** Topic group key, or "" for all categories. */
  group: TopicGroupKey | "";
  /** Source family, or "" for all sources. */
  source: RadarSourceKey | "";
  risingOnly: boolean;
};

export const DEFAULT_RADAR_FILTERS: RadarFilters = { group: "", source: "", risingOnly: false };

/** Topic group a backend topic_tag belongs to; null for "Other" and unknown tags. */
export function topicGroupForTag(tag: string): TopicGroupKey | null {
  return TOPIC_GROUPS.find((g) => g.tags.includes(tag))?.key ?? null;
}

export function filterRadarTopics(topics: ApiRadarTopic[], f: RadarFilters): ApiRadarTopic[] {
  return topics.filter(
    (t) =>
      (!f.group || topicGroupForTag(t.topicTag) === f.group) &&
      (!f.source || (t.sourceCounts[f.source] ?? 0) > 0) &&
      (!f.risingOnly || t.rising),
  );
}

/** The Chinese title in 中文 mode when one exists, else the original. */
export function radarTitle(en: string, zh: string | null | undefined, lang: Lang): string {
  return lang === "zh" && zh ? zh : en;
}

/**
 * Each platform's own engagement unit: ★ stars (GitHub), ♥ likes (Bluesky),
 * reactions (DEV), views (YouTube), points (HN, Lobsters). Null when there is none.
 */
export function engagementLabel(s: ApiRadarSignal, r: Translations["radar"]): string | null {
  switch (s.source) {
    case "github":
      return s.points != null ? r.stars(formatCompact(s.points)) : null;
    case "bluesky":
      return s.likeCount != null ? r.likesReplies(formatCompact(s.likeCount), s.numComments ?? 0) : null;
    case "devto":
      return s.points != null ? r.reactionsComments(s.points, s.numComments ?? 0) : null;
    case "youtube":
      return s.viewCount != null ? r.views(formatCompact(s.viewCount)) : null;
    case "threads":
      return null;
    default:
      return s.points != null ? r.pointsComments(s.points, s.numComments ?? 0) : null;
  }
}

/** "3.9×" — one decimal under 10, whole numbers above. */
export function formatVelocity(v: number): string {
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)}×`;
}

/** 950 → "950", 1234 → "1.2k", 25300 → "25k". */
export function formatCompact(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}k`;
}

/** Bar heights (px) for a daily-count sparkline; empty days keep a 1px baseline. */
export function sparklineHeights(counts: number[], maxHeight: number): number[] {
  const max = Math.max(0, ...counts);
  return counts.map((c) => (max === 0 || c === 0 ? 1 : Math.max(2, Math.round((c / max) * maxHeight))));
}

/** Whole hours/days since an ISO timestamp, for "5h" / "3d" labels. */
export function ageParts(iso: string | null, now: Date = new Date()): { unit: "m" | "h" | "d"; value: number } | null {
  if (!iso) return null;
  const ms = now.getTime() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return { unit: "m", value: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return { unit: "h", value: hours };
  return { unit: "d", value: Math.floor(hours / 24) };
}
