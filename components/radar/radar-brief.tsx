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
 * rings, the fastest riser and the biggest move inward.
 * Topic names are buttons that open the topic.
 */
export function RadarBrief({ topics, totalSignals, windowDays, onSelect }: RadarBriefProps) {
  const { t, lang } = useI18n();
  const brief = radarBrief(topics);
  const name = (topic: ApiRadarTopic): ReactNode => (
    <button
      type="button"
      onClick={() => onSelect(topic.id)}
      className="inline text-left font-medium text-foreground underline decoration-[var(--panel-edge-a)] underline-offset-[4px] hover:[color:var(--accent)] hover:decoration-current"
    >
      {radarTitle(topic.label, topic.labelZh, lang)}
    </button>
  );
  const moved = brief.moved[0];
  return (
    <p aria-label={t.radar.briefAria} className="max-w-3xl text-[16px] leading-relaxed [color:var(--text-soft)] sm:text-[17px]">
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
    </p>
  );
}
