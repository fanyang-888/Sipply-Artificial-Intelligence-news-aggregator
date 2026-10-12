"use client";

import type { ApiRadarSource } from "@/lib/api/types";
import { TOPIC_GROUPS, topicGroupLabel } from "@/lib/constants/topic-groups";
import { useI18n } from "@/lib/i18n";
import type { RadarFilters } from "@/lib/utils/radar";

type RadarToolbarProps = {
  filters: RadarFilters;
  onChange: (next: RadarFilters) => void;
  sources: ApiRadarSource[];
};

/** Filter row (sticky from sm up): category pills + rising toggle + source switch, archive look. */
export function RadarToolbar({ filters, onChange, sources }: RadarToolbarProps) {
  const { t, lang } = useI18n();

  const pillClass = (on: boolean) =>
    [
      "rounded-full border px-3.5 py-1.5 text-xs transition-colors",
      on
        ? "border-transparent font-semibold [background:var(--accent)] [color:var(--bg)]"
        : "[border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)] hover:[border-color:var(--accent)] hover:[color:var(--accent)]",
    ].join(" ");

  const segClass = (on: boolean) =>
    [
      "rounded px-2.5 py-1 text-xs font-medium transition-colors",
      on ? "bg-foreground text-background" : "[color:var(--text-muted)] hover:text-foreground",
    ].join(" ");

  return (
    <div
      className="z-30 mb-4 flex sm:sticky sm:top-14 flex-wrap items-center gap-2 border-b py-3 [background:var(--bg)] [border-color:var(--border)]"
      role="toolbar"
      aria-label={t.radar.filterAria}
    >
      <button type="button" className={pillClass(filters.group === "")} onClick={() => onChange({ ...filters, group: "" })}>
        {t.radar.allCategories}
      </button>
      {TOPIC_GROUPS.map((g) => (
        <button
          key={g.key}
          type="button"
          className={pillClass(filters.group === g.key)}
          onClick={() => onChange({ ...filters, group: g.key })}
        >
          {topicGroupLabel(g, lang)}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={filters.risingOnly}
        className={pillClass(filters.risingOnly)}
        onClick={() => onChange({ ...filters, risingOnly: !filters.risingOnly })}
      >
        {t.radar.risingOnly}
      </button>

      <div className="flex items-center gap-1 sm:ml-auto">
        <button type="button" className={segClass(filters.source === "")} onClick={() => onChange({ ...filters, source: "" })}>
          {t.radar.allSources}
        </button>
        {sources
          .filter((s) => s.active)
          .map((s) => (
            <button
              key={s.key}
              type="button"
              className={segClass(filters.source === s.key)}
              onClick={() => onChange({ ...filters, source: s.key })}
            >
              {t.radar.sourceShort[s.key]}
            </button>
          ))}
      </div>
    </div>
  );
}
