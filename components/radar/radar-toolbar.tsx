"use client";

import type { ReactNode } from "react";
import { RADAR_SOURCE_ORDER, type ApiRadarTopic, type RadarMomentum } from "@/lib/api/types";
import { topicGroupByKey, topicGroupLabel } from "@/lib/constants/topic-groups";
import { useI18n } from "@/lib/i18n";
import {
  RADAR_SECTORS,
  hasActiveFilter,
  radarSectorForTag,
  topicPlatforms,
  type RadarFilters,
} from "@/lib/utils/radar";

type RadarToolbarProps = {
  filters: RadarFilters;
  onChange: (next: RadarFilters) => void;
  topics: ApiRadarTopic[];
};

const MOMENTA: RadarMomentum[] = ["rising", "steady", "cooling"];

/** Three filter rows (platform, momentum, category); each pill shows how many topics it keeps. */
export function RadarToolbar({ filters, onChange, topics }: RadarToolbarProps) {
  const { t, lang } = useI18n();

  const pill = (on: boolean, onClick: () => void, children: ReactNode, key: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1 text-xs transition-colors",
        on
          ? "border-transparent font-semibold [background:var(--accent)] [color:var(--bg)]"
          : "[border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)] hover:[border-color:var(--accent)] hover:[color:var(--accent)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
  const count = (n: number) => <span className="ml-1 font-mono text-[10.5px] opacity-75">{n}</span>;
  const row = (label: string, children: ReactNode) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-[4.2em] shrink-0 font-mono text-[11px] [color:var(--text-muted)]">{label}</span>
      {children}
    </div>
  );

  const platforms = RADAR_SOURCE_ORDER.filter((k) => topics.some((x) => topicPlatforms(x).includes(k)));

  return (
    <div className="mb-3 grid gap-2" role="toolbar" aria-label={t.radar.filterAria}>
      {row(
        t.radar.filterPlatform,
        <>
          {pill(!filters.source, () => onChange({ ...filters, source: "" }), t.radar.allSources, "all")}
          {platforms.map((k) =>
            pill(
              filters.source === k,
              () => onChange({ ...filters, source: k }),
              <>
                {t.radar.sourceShort[k]}
                {count(topics.filter((x) => (x.sourceCounts[k] ?? 0) > 0).length)}
              </>,
              k,
            ),
          )}
        </>,
      )}
      {row(
        t.radar.filterMomentum,
        <>
          {pill(!filters.momentum, () => onChange({ ...filters, momentum: "" }), t.radar.allSources, "all")}
          {MOMENTA.map((m) =>
            pill(
              filters.momentum === m,
              () => onChange({ ...filters, momentum: m }),
              <>
                {t.radar.momentum[m]}
                {count(topics.filter((x) => x.momentum === m).length)}
              </>,
              m,
            ),
          )}
        </>,
      )}
      {row(
        t.radar.filterCategory,
        <>
          {pill(!filters.group, () => onChange({ ...filters, group: "" }), t.radar.allCategories, "all")}
          {RADAR_SECTORS.map((key) => {
            const g = key === "other" ? undefined : topicGroupByKey(key);
            return pill(
              filters.group === key,
              () => onChange({ ...filters, group: key }),
              <>
                {g ? topicGroupLabel(g, lang) : t.radar.otherCategory}
                {count(topics.filter((x) => radarSectorForTag(x.topicTag) === key).length)}
              </>,
              key,
            );
          })}
          {hasActiveFilter(filters) ? (
            <button
              type="button"
              onClick={() => onChange({ group: "", source: "", momentum: "" })}
              className="ml-1 text-xs underline underline-offset-2 [color:var(--text-muted)] hover:text-foreground"
            >
              {t.radar.clearFilters}
            </button>
          ) : null}
        </>,
      )}
    </div>
  );
}
