/**
 * Pure helpers for the Trend Radar page (filters, formatting, sparkline geometry).
 */

import {
  RADAR_SOURCE_ORDER,
  type ApiRadar,
  type ApiRadarSignal,
  type ApiRadarTopic,
  type RadarMomentum,
  type RadarRing,
  type RadarSourceKey,
} from "@/lib/api/types";
import type { Lang, Translations } from "@/lib/i18n";
import { TOPIC_GROUPS, type TopicGroupKey } from "@/lib/constants/topic-groups";

/** Radar sectors: the site's six categories, then everything else. */
export type RadarSectorKey = TopicGroupKey | "other";
export const RADAR_SECTORS: RadarSectorKey[] = [...TOPIC_GROUPS.map((g) => g.key), "other"];

export type RadarFilters = {
  /** Sector, or "" for all categories. */
  group: RadarSectorKey | "";
  /** Source family, or "" for all sources. */
  source: RadarSourceKey | "";
  momentum: RadarMomentum | "";
};

export const DEFAULT_RADAR_FILTERS: RadarFilters = { group: "", source: "", momentum: "" };

export function hasActiveFilter(f: RadarFilters): boolean {
  return Boolean(f.group || f.source || f.momentum);
}

/** Topic group a backend topic_tag belongs to; null for "Other" and unknown tags. */
export function topicGroupForTag(tag: string): TopicGroupKey | null {
  return TOPIC_GROUPS.find((g) => g.tags.includes(tag))?.key ?? null;
}

export function radarSectorForTag(tag: string): RadarSectorKey {
  return topicGroupForTag(tag) ?? "other";
}

export function matchesRadarFilters(t: ApiRadarTopic, f: RadarFilters): boolean {
  return (
    (!f.group || radarSectorForTag(t.topicTag) === f.group) &&
    (!f.source || (t.sourceCounts[f.source] ?? 0) > 0) &&
    (!f.momentum || t.momentum === f.momentum)
  );
}

export function filterRadarTopics(topics: ApiRadarTopic[], f: RadarFilters): ApiRadarTopic[] {
  return topics.filter((t) => matchesRadarFilters(t, f));
}

/** Platforms that carry the topic, in display order. */
export function topicPlatforms(t: ApiRadarTopic): RadarSourceKey[] {
  return RADAR_SOURCE_ORDER.filter((k) => (t.sourceCounts[k] ?? 0) > 0);
}

/**
 * Fill in fields an older API doesn't send yet (ring, momentum, isNew, summary,
 * coverage). Vercel usually deploys before Railway, so for a few minutes the new
 * page can meet the old API. Ring and momentum follow the backend rules in
 * app/signals/topics.py (evidence_ring, topic_momentum).
 */
export function withRadarDefaults(radar: ApiRadar): ApiRadar {
  const builtAt = radar.generatedAt ? new Date(radar.generatedAt).getTime() : Date.now();
  return {
    ...radar,
    topics: radar.topics.map((t) => {
      const platforms = topicPlatforms(t).length;
      const quietDays = t.lastSeenAt ? (builtAt - new Date(t.lastSeenAt).getTime()) / 86_400_000 : Infinity;
      const counts = t.dailyCounts ?? [];
      const recent = counts.slice(-3).reduce((a, b) => a + b, 0);
      const earlier = counts.slice(0, -3).reduce((a, b) => a + b, 0);
      const momentum: RadarMomentum =
        quietDays > 3
          ? "cooling"
          : earlier <= 1
            ? "new"
            : t.velocity >= 2 && recent >= 3
              ? "rising"
              : t.velocity < 0.8
                ? "cooling"
                : "steady";
      return {
        ...t,
        ring: t.ring ?? (t.signalCount >= 15 ? 1 : t.signalCount >= 5 || (t.signalCount >= 3 && platforms >= 2) ? 2 : 3),
        momentum: t.momentum ?? momentum,
        isNew: t.isNew ?? (t.momentum ?? momentum) === "new",
        trailSignals: t.trailSignals ?? [],
        trailRings: t.trailRings ?? [],
        summaryEn: t.summaryEn ?? null,
        summaryZh: t.summaryZh ?? null,
        coverage: t.coverage ?? null,
        question: t.question ?? null,
        answerCheck: t.answerCheck ?? null,
      };
    }),
  };
}

/** Display order: inner ring first, then score. Blip numbers and table rows follow it. */
export function radarOrder(topics: ApiRadarTopic[]): ApiRadarTopic[] {
  return [...topics].sort((a, b) => a.ring - b.ring || b.score - a.score);
}

/** "News 24, YouTube 6, HN 3": the topic's platforms, busiest first. */
export function platformBreakdown(t: ApiRadarTopic, short: Record<RadarSourceKey, string>, sep: string): string {
  return topicPlatforms(t)
    .map((k) => [k, t.sourceCounts[k] ?? 0] as const)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${short[k]} ${n}`)
    .join(sep);
}

/** Days back the radar compares against for "moved inward". */
export const MOVE_LOOKBACK_DAYS = 3;

/**
 * Where the topic was MOVE_LOOKBACK_DAYS ago: "moved" (to an inner ring), "stayed",
 * "appeared" (no signal yet back then), or null when there is no trail.
 */
export function ringMove(
  t: ApiRadarTopic,
): { kind: "moved"; from: RadarRing; fromSignals: number } | { kind: "stayed" } | { kind: "appeared" } | null {
  const k = t.trailRings.length - 1 - MOVE_LOOKBACK_DAYS;
  if (k < 0) return null;
  const from = t.trailRings[k];
  if (from === 0) return { kind: "appeared" };
  if (from === t.ring) return { kind: "stayed" };
  return { kind: "moved", from, fromSignals: t.trailSignals[k] };
}

export type RadarBrief = {
  rings: [number, number, number];
  /** The rising topic with the steepest velocity, if any. */
  fastest: ApiRadarTopic | null;
  /** Inner-ring topics Sipply has checked, and how many of them it has no story on. */
  checked: number;
  gaps: number;
  newCount: number;
  /** Topics that reached an inner ring in the last MOVE_LOOKBACK_DAYS days; biggest jump first. */
  moved: { topic: ApiRadarTopic; from: RadarRing }[];
};

export function radarBrief(topics: ApiRadarTopic[]): RadarBrief {
  const rings: [number, number, number] = [0, 0, 0];
  for (const t of topics) rings[t.ring - 1] += 1;
  const fastest = topics.filter((t) => t.momentum === "rising").sort((a, b) => b.velocity - a.velocity)[0] ?? null;
  const checked = topics.filter((t) => t.coverage);
  return {
    rings,
    fastest,
    checked: checked.length,
    gaps: checked.filter((t) => t.coverage?.status === "gap").length,
    newCount: topics.filter((t) => t.isNew).length,
    moved: topics
      .flatMap((t) => {
        const m = ringMove(t);
        return m?.kind === "moved" ? [{ topic: t, from: m.from }] : [];
      })
      .sort((a, b) => b.from - b.topic.ring - (a.from - a.topic.ring) || b.topic.score - a.topic.score),
  };
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

/**
 * Bar heights (px) for a daily-count sparkline; empty days keep a 1px baseline.
 * Pass ``scaleMax`` to draw several sparklines on one shared scale (so a topic
 * with 1 signal a day doesn't look as busy as one with 20).
 */
export function sparklineHeights(counts: number[], maxHeight: number, scaleMax?: number): number[] {
  const max = scaleMax ?? Math.max(0, ...counts);
  return counts.map((c) => (max === 0 || c === 0 ? 1 : Math.max(2, Math.round((Math.min(c, max) / max) * maxHeight))));
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
