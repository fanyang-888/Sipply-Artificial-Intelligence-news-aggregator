"use client";

import type { ReactNode } from "react";
import type { ApiRadarTopic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";
import { formatVelocity, radarBrief, radarTitle } from "@/lib/utils/radar";

type RadarBriefProps = {
  topics: ApiRadarTopic[];
  totalSignals: number;
  windowDays: number;
  onSelect: (id: string) => void;
};

/**
 * This run in one paragraph: how many topics and how they split across the
 * rings, the fastest riser, the biggest move inward, and Sipply's gaps.
 * Topic names are buttons that open the topic.
 */
export function RadarBrief({ topics, totalSignals, windowDays, onSelect }: RadarBriefProps) {
  const { t, lang } = useI18n();
  const brief = radarBrief(topics);
  const name = (topic: ApiRadarTopic): ReactNode => (
    <button
      type="button"
      onClick={() => onSelect(topic.id)}
      className="text-left font-semibold text-foreground underline decoration-[var(--border)] underline-offset-[3px] hover:[color:var(--accent)] hover:decoration-current"
    >
      {radarTitle(topic.label, topic.labelZh, lang)}
    </button>
  );
  const moved = brief.moved[0];
  return (
    <p aria-label={t.radar.briefAria} className="mt-2 max-w-3xl text-[15px] leading-relaxed [color:var(--text-muted)]">
      {t.radar.ledeTopics(topics.length, totalSignals, windowDays)} {t.radar.ledeRings(...brief.rings)}{" "}
      {brief.fastest ? (
        <>
          {t.radar.ledeFastest}
          {name(brief.fastest)}
          {t.radar.ledeFastestPace(formatVelocity(brief.fastest.velocity))}{" "}
        </>
      ) : null}
      {moved ? (
        <>
          {t.radar.ledeMoved}
          {name(moved.topic)}
          {t.radar.ledeMovedRings(t.radar.rings[moved.from].name, t.radar.rings[moved.topic.ring].name)}{" "}
        </>
      ) : null}
      {brief.checked > 0 ? t.radar.briefGapsBody(brief.gaps, brief.checked) : null}
    </p>
  );
}
