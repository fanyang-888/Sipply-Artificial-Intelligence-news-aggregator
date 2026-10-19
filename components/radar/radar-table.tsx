"use client";

import Link from "@/components/shared/link";
import { useState } from "react";
import type { ApiRadarTopic, RadarRing } from "@/lib/api/types";
import { topicGroupByKey, topicGroupLabel } from "@/lib/constants/topic-groups";
import { useI18n } from "@/lib/i18n";
import { radarSectorForTag, radarTitle, topicPlatforms } from "@/lib/utils/radar";
import { RadarSparkline } from "@/components/radar/radar-bits";
import { MOMENTUM_FILL } from "@/components/radar/radar-chart";
import { uiMicroLabel } from "@/lib/ui/classes";
import { storyPath } from "@/lib/seo/site";

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

/** Rows shown per outer ring before "Show all"; the mainstream ring always shows in full. */
export const RING_PREVIEW_ROWS = 5;

/**
 * Every topic in one table, grouped by ring. The sparklines share one scale,
 * so a topic with one signal a day looks quieter than one with twenty. The
 * outer rings show their first RING_PREVIEW_ROWS rows; the rest stay in the
 * HTML (hidden) and open with "Show all N", or on their own when the selected
 * topic is among them.
 */
export function RadarTable({ topics, rankOf, isShown, selectedId, windowDays, onSelect }: RadarTableProps) {
  const { t, lang } = useI18n();
  const scaleMax = Math.max(1, ...topics.flatMap((x) => x.dailyCounts));
  const loud = (x: ApiRadarTopic) => x.momentum === "new" || x.momentum === "rising";
  // Set once the reader uses a ring's button; until then a ring opens when its selected topic is folded away
  const [expanded, setExpanded] = useState<Partial<Record<RadarRing, boolean>>>({});
  return (
    <section aria-label={t.radar.tableAria} className="sp-glass px-4 pb-4 pt-5 text-[13.5px] sm:px-6">
      <div aria-hidden="true" className={`${ROW_GRID} ${uiMicroLabel} border-b px-2 pb-3 [border-color:var(--panel-divider)]`}>
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
        const folds = ring !== 1 && shown.length > RING_PREVIEW_ROWS;
        const open = !folds || (expanded[ring] ?? shown.findIndex((x) => x.id === selectedId) >= RING_PREVIEW_ROWS);
        return (
          <div key={ring}>
            <h3 className="px-2 pb-2 pt-7">
              <span className="font-display text-[1.15rem] text-foreground">{r.name}</span>
              <span className="ml-2.5 text-[12.5px] [color:var(--text-muted)]">
                {r.rule} · {r.action} · {shown.length === all.length ? all.length : `${shown.length}/${all.length}`}
              </span>
            </h3>
            <ol>
              {shown.map((topic, i) => {
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
                    hidden={!open && i >= RING_PREVIEW_ROWS}
                    aria-current={topic.id === selectedId}
                    onClick={() => onSelect(topic.id)}
                    className={`${ROW_GRID} cursor-pointer rounded-lg border-t px-2 py-2 transition-colors [border-color:var(--panel-divider)] hover:[background:var(--panel-hover)] aria-[current=true]:[background:var(--panel-fill-2)]`}
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
                          </span>
                      </span>
                    </span>
                    <span className="hidden text-right font-mono tabular-nums text-foreground sm:block">{topic.signalCount}</span>
                    <RadarSparkline counts={topic.dailyCounts} scaleMax={scaleMax} label={t.radar.dailyChartAria(windowDays)} />
                    <span className="hidden text-[12.5px] md:block">{momentum}</span>
                    <span className="hidden text-[12.5px] md:block">
                      {coverage?.status === "covered" && coverage.clusterId ? (
                        <Link
                          href={storyPath({ id: coverage.clusterId, slug: coverage.slug })}
                          onClick={(e) => e.stopPropagation()}
                          title={radarTitle(coverage.title ?? "", coverage.titleZh, lang)}
                          aria-label={`${t.radar.coverageCovered}: ${radarTitle(coverage.title ?? "", coverage.titleZh, lang)}`}
                          className="[color:var(--text-muted)] hover:[color:var(--accent)]"
                        >
                          ✓
                        </Link>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
            {folds ? (
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setExpanded({ ...expanded, [ring]: !open })}
                className="mt-2 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.12em] [color:var(--accent)] hover:underline"
              >
                {open ? t.radar.showFewer : t.radar.showAllRows(shown.length)}
              </button>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
