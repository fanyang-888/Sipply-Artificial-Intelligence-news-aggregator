"use client";

import type { ApiRadarTopic, RadarRing } from "@/lib/api/types";
import { topicGroupByKey, topicGroupLabel } from "@/lib/constants/topic-groups";
import { useI18n } from "@/lib/i18n";
import { radarSectorForTag, radarTitle, topicPlatforms } from "@/lib/utils/radar";
import { RadarSparkline } from "@/components/radar/radar-bits";
import { MOMENTUM_FILL } from "@/components/radar/radar-chart";

type RadarRingListsProps = {
  topics: ApiRadarTopic[];
  rankOf: (id: string) => number;
  isShown: (topic: ApiRadarTopic) => boolean;
  selectedId: string | null;
  windowDays: number;
  onSelect: (id: string) => void;
};

/** The same topics as the chart, one column per ring, numbered like the blips. */
export function RadarRingLists({ topics, rankOf, isShown, selectedId, windowDays, onSelect }: RadarRingListsProps) {
  const { t, lang } = useI18n();
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {([1, 2, 3] as RadarRing[]).map((ring) => {
        const all = topics.filter((x) => x.ring === ring);
        const shown = all.filter(isShown);
        const r = t.radar.rings[ring];
        return (
          <section key={ring} className="min-w-0" aria-label={r.name}>
            <h2 className="flex flex-wrap items-baseline gap-2 text-base font-semibold text-foreground">
              {r.name}
              <span className="font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] [color:var(--text-muted)]">
                {r.action} · {shown.length === all.length ? all.length : `${shown.length}/${all.length}`}
              </span>
            </h2>
            <p className="mb-2 mt-0.5 text-[12.5px] [color:var(--text-muted)]">{r.rule}</p>
            {shown.length === 0 ? (
              <p className="px-2 py-1.5 text-[13px] [color:var(--text-muted)]">{t.radar.emptyRing}</p>
            ) : (
              <ul className="space-y-0.5">
                {shown.map((topic) => {
                  const sector = radarSectorForTag(topic.topicTag);
                  const group = sector === "other" ? undefined : topicGroupByKey(sector);
                  return (
                    <li key={topic.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(topic.id)}
                        aria-current={topic.id === selectedId}
                        className="grid w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:[background:var(--surface)] aria-[current=true]:[background:var(--surface2)]"
                      >
                        <span
                          className="grid h-[22px] w-[22px] place-items-center rounded-full font-mono text-[11px] font-medium [color:var(--bg)]"
                          style={{ background: MOMENTUM_FILL[topic.momentum] }}
                        >
                          {rankOf(topic.id)}
                        </span>
                        <span className="min-w-0 text-[13.5px] leading-snug text-foreground [overflow-wrap:anywhere]">
                          {radarTitle(topic.label, topic.labelZh, lang)}
                          <span className="mt-0.5 block text-[11.5px] [color:var(--text-muted)]">
                            {group ? topicGroupLabel(group, lang) : t.radar.otherCategory} ·{" "}
                            {t.radar.listMeta(topic.signalCount, topicPlatforms(topic).length)}
                            {topic.coverage?.status === "gap" ? (
                              <span className="[color:var(--amber)]"> · {t.radar.noStoryShort}</span>
                            ) : null}
                          </span>
                        </span>
                        <RadarSparkline counts={topic.dailyCounts} label={t.radar.dailyChartAria(windowDays)} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
