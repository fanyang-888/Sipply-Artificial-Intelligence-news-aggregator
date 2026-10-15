"use client";

import { RADAR_SOURCE_ORDER, type ApiRadarTopic, type RadarMomentum, type RadarSourceKey } from "@/lib/api/types";
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

const MOMENTA: RadarMomentum[] = ["new", "rising", "steady", "cooling"];

/**
 * One row: categories as text tabs (the same ones the chart's sector names
 * toggle), momentum and platform as two compact selects. Counts are topics kept.
 */
export function RadarToolbar({ filters, onChange, topics }: RadarToolbarProps) {
  const { t, lang } = useI18n();
  const platforms = RADAR_SOURCE_ORDER.filter((k) => topics.some((x) => topicPlatforms(x).includes(k)));
  const tab = (on: boolean, onClick: () => void, name: string, n: number, key: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={[
        "border-b-2 pb-0.5 text-[13px] transition-colors",
        on ? "font-semibold text-foreground [border-color:var(--accent)]" : "border-transparent [color:var(--text-muted)] hover:text-foreground",
      ].join(" ")}
    >
      {name}
      <span className="ml-1 font-mono text-[11px] [color:var(--text-muted)]">{n}</span>
    </button>
  );
  const select = "rounded-md border px-2 py-1 text-[12.5px] [background:var(--surface)] [border-color:var(--border)] [color:var(--text)]";

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2" role="toolbar" aria-label={t.radar.filterAria}>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5" role="group" aria-label={t.radar.filterCategory}>
        {tab(!filters.group, () => onChange({ ...filters, group: "" }), t.radar.allCategories, topics.length, "all")}
        {RADAR_SECTORS.map((key) => {
          const g = key === "other" ? undefined : topicGroupByKey(key);
          return tab(
            filters.group === key,
            () => onChange({ ...filters, group: filters.group === key ? "" : key }),
            g ? topicGroupLabel(g, lang) : t.radar.otherCategory,
            topics.filter((x) => radarSectorForTag(x.topicTag) === key).length,
            key,
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <select
          aria-label={t.radar.filterMomentum}
          value={filters.momentum}
          onChange={(e) => onChange({ ...filters, momentum: e.target.value as RadarMomentum | "" })}
          className={select}
        >
          <option value="">
            {t.radar.filterMomentum}: {t.radar.allSources}
          </option>
          {MOMENTA.map((m) => (
            <option key={m} value={m}>
              {t.radar.momentum[m]} ({topics.filter((x) => x.momentum === m).length})
            </option>
          ))}
        </select>
        <select
          aria-label={t.radar.filterPlatform}
          value={filters.source}
          onChange={(e) => onChange({ ...filters, source: e.target.value as RadarSourceKey | "" })}
          className={select}
        >
          <option value="">
            {t.radar.filterPlatform}: {t.radar.allSources}
          </option>
          {platforms.map((k) => (
            <option key={k} value={k}>
              {t.radar.sourceShort[k]} ({topics.filter((x) => (x.sourceCounts[k] ?? 0) > 0).length})
            </option>
          ))}
        </select>
        {hasActiveFilter(filters) ? (
          <button
            type="button"
            onClick={() => onChange({ group: "", source: "", momentum: "" })}
            className="text-xs underline underline-offset-2 [color:var(--text-muted)] hover:text-foreground"
          >
            {t.radar.clearFilters}
          </button>
        ) : null}
      </div>
    </div>
  );
}
