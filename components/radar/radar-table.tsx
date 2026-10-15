"use client";

import Link from "next/link";
import type { ApiRadarTopic, RadarRing } from "@/lib/api/types";
import { topicGroupByKey, topicGroupLabel } from "@/lib/constants/topic-groups";
import { useI18n } from "@/lib/i18n";
import { radarSectorForTag, radarTitle, topicPlatforms } from "@/lib/utils/radar";
import { RadarSparkline } from "@/components/radar/radar-bits";
import { MOMENTUM_FILL } from "@/components/radar/radar-chart";

type RadarTableProps = {
  /** Already in display order (radarOrder); row numbers match the chart's blips. */
  topics: ApiRadarTopic[];
  rankOf: (id: string) => number;
  isShown: (topic: ApiRadarTopic) => boolean;
  selectedId: string | null;
  windowDays: number;
  onSelect: (id: string) => void;
};

/**
 * Columns as a CSS grid, so narrow screens drop whole columns (hidden cells
 * take no track): #, topic, trend on phones; + signals from sm; + momentum
 * and Sipply from md.
 */
const ROW_GRID =
  "grid grid-cols-[2rem_minmax(0,1fr)_4.75rem] items-center gap-x-3 sm:grid-cols-[2rem_minmax(0,1fr)_3.5rem_4.75rem] md:grid-cols-[2rem_minmax(0,1fr)_3.5rem_4.75rem_6rem_6.5rem]";

/**
 * Every topic in one table, grouped by ring. The sparklines share one scale,
 * so a topic with one signal a day looks quieter than one with twenty.
 */
export function RadarTable({ topics, rankOf, isShown, selectedId, windowDays, onSelect }: RadarTableProps) {
  const { t, lang } = useI18n();
  const scaleMax = Math.max(1, ...topics.flatMap((x) => x.dailyCounts));
  const loud = (x: ApiRadarTopic) => x.momentum === "new" || x.momentum === "rising";
  return (
    <section aria-label={t.radar.tableAria} className="text-[13.5px]">
      <div aria-hidden="true" className={`${ROW_GRID} border-b px-2 pb-2 text-[11.5px] [border-color:var(--border)] [color:var(--text-muted)]`}>
        <span>#</span>
        <span>{t.radar.colTopic}</span>
        <span className="hidden text-right sm:block">{t.radar.colSignals}</span>
        <span>{t.radar.colTrend(windowDays)}</span>
        <span className="hidden md:block">{t.radar.colMomentum}</span>
        <span className="hidden md:block">{t.radar.colSipply}</span>
      </div>
      {([1, 2, 3] as RadarRing[]).map((ring) => {
        const all = topics.filter((x) => x.ring === ring);
        const shown = all.filter(isShown);
        if (all.length === 0) return null;
        const r = t.radar.rings[ring];
        return (
          <div key={ring}>
            <h3 className="px-2 pb-1.5 pt-6">
              <span className="text-[15px] font-semibold text-foreground">{r.name}</span>
              <span className="ml-2 text-[12.5px] [color:var(--text-muted)]">
                {r.rule} · {r.action} · {shown.length === all.length ? all.length : `${shown.length}/${all.length}`}
              </span>
            </h3>
            <ol>
              {shown.map((topic) => {
                const sector = radarSectorForTag(topic.topicTag);
                const group = sector === "other" ? undefined : topicGroupByKey(sector);
                const platforms = topicPlatforms(topic).map((k) => t.radar.sourceShort[k]);
                const coverage = topic.coverage;
                const momentum = (
                  <span style={{ color: loud(topic) ? MOMENTUM_FILL[topic.momentum] : "var(--text-muted)" }}>
                    {t.radar.momentum[topic.momentum]}
                  </span>
                );
                return (
                  <li
                    key={topic.id}
                    aria-current={topic.id === selectedId}
                    onClick={() => onSelect(topic.id)}
                    className={`${ROW_GRID} cursor-pointer border-t px-2 py-1.5 transition-colors [border-color:var(--border)] hover:[background:var(--surface)] aria-[current=true]:[background:var(--surface2)]`}
                  >
                    <span className="font-mono text-[12px] tabular-nums [color:var(--text-muted)]">{rankOf(topic.id)}</span>
                    <span className="min-w-0 leading-snug">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(topic.id);
                        }}
                        className="text-left text-foreground [overflow-wrap:anywhere] hover:[color:var(--accent)]"
                      >
                        {radarTitle(topic.label, topic.labelZh, lang)}
                      </button>
                      <span className="ml-1.5 text-[12px] [color:var(--text-muted)]">
                        {group ? topicGroupLabel(group, lang) : t.radar.otherCategory} · {platforms.join(", ")}
                        {/* Columns hidden on small screens, folded into this line */}
                        <span className="sm:hidden"> · {topic.signalCount}</span>
                        <span className="md:hidden">
                          {loud(topic) ? <> · {momentum}</> : null}
                          {coverage?.status === "gap" ? <span className="[color:var(--amber)]"> · {t.radar.noStoryShort}</span> : null}
                        </span>
                      </span>
                    </span>
                    <span className="hidden text-right font-mono tabular-nums text-foreground sm:block">{topic.signalCount}</span>
                    <RadarSparkline counts={topic.dailyCounts} scaleMax={scaleMax} label={t.radar.dailyChartAria(windowDays)} />
                    <span className="hidden text-[12.5px] md:block">{momentum}</span>
                    <span className="hidden text-[12.5px] md:block">
                      {coverage?.status === "covered" && coverage.clusterId ? (
                        <Link
                          href={`/cluster/${coverage.clusterId}`}
                          onClick={(e) => e.stopPropagation()}
                          title={radarTitle(coverage.title ?? "", coverage.titleZh, lang)}
                          aria-label={`${t.radar.coverageCovered}: ${radarTitle(coverage.title ?? "", coverage.titleZh, lang)}`}
                          className="[color:var(--text-muted)] hover:[color:var(--accent)]"
                        >
                          ✓
                        </Link>
                      ) : coverage?.status === "gap" ? (
                        <span className="[color:var(--amber)]">{t.radar.noStoryShort}</span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </section>
  );
}
