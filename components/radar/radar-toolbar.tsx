"use client";

import { RADAR_SOURCE_ORDER, type ApiRadarTopic, type RadarMomentum, type RadarSourceKey } from "@/lib/api/types";
import { topicGroupByKey, topicGroupLabel } from "@/lib/constants/topic-groups";
import { useI18n } from "@/lib/i18n";
import { uiInput, uiTab } from "@/lib/ui/classes";
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
      className={uiTab(on)}
    >
      {name}
      <span className="ml-1.5 opacity-70">{n}</span>
    </button>
  );
  const select = `${uiInput} h-8 appearance-none pr-8 text-[12.5px] [background-image:linear-gradient(45deg,transparent_50%,var(--text-muted)_50%),linear-gradient(135deg,var(--text-muted)_50%,transparent_50%)] [background-position:calc(100%-1.1rem)_55%,calc(100%-0.8rem)_55%] [background-repeat:no-repeat] [background-size:5px_5px,5px_5px]`;

  return (
    <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-x-6" role="toolbar" aria-label={t.radar.filterAria}>
      <div className="sp-no-scrollbar -mx-6 flex gap-x-5 overflow-x-auto whitespace-nowrap px-6 pt-1 sm:mx-0 sm:flex-wrap sm:gap-y-2 sm:overflow-visible sm:px-0" role="group" aria-label={t.radar.filterCategory}>
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
      <div className="flex shrink-0 items-center gap-2">
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
            className="font-mono text-[11px] uppercase tracking-[0.12em] [color:var(--text-muted)] hover:text-foreground"
          >
            {t.radar.clearFilters}
          </button>
        ) : null}
      </div>
    </div>
  );
}
