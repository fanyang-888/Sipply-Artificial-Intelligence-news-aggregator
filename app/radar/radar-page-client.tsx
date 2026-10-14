"use client";

import { useCallback, useMemo, useState } from "react";
import type { ApiRadar, ApiRadarTopic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";
import { useNowMinute } from "@/lib/use-now-minute";
import { DEFAULT_RADAR_FILTERS, matchesRadarFilters, type RadarFilters, type RadarSectorKey } from "@/lib/utils/radar";
import type { BlipPosition } from "@/lib/utils/radar-layout";
import { RadarBrief } from "@/components/radar/radar-brief";
import { RadarChart, MOMENTUM_FILL } from "@/components/radar/radar-chart";
import { RadarRingLists } from "@/components/radar/radar-ring-lists";
import { RadarToolbar } from "@/components/radar/radar-toolbar";
import { RadarTopicCard } from "@/components/radar/radar-topic-card";
import { RadarSignalItem, ageLabel } from "@/components/radar/radar-bits";
import { EmptyState } from "@/components/shared/empty-state";

type RadarPageClientProps = {
  radar: ApiRadar | null;
  /** Blip coordinates, computed once on the server (lib/utils/radar-layout.ts). */
  positions: Record<string, BlipPosition>;
};

/** Trend Radar body. Data comes from the server component, so the HTML is complete without JS. */
export function RadarPageClient({ radar, positions }: RadarPageClientProps) {
  const { t } = useI18n();
  const now = useNowMinute();
  const [filters, setFilters] = useState<RadarFilters>(DEFAULT_RADAR_FILTERS);
  const topics = useMemo(() => radar?.topics ?? [], [radar]);
  const [selectedId, setSelectedId] = useState<string | null>(topics[0]?.id ?? null);

  const ranks = useMemo(() => new Map(topics.map((x, i) => [x.id, i + 1])), [topics]);
  const rankOf = useCallback((id: string) => ranks.get(id) ?? 0, [ranks]);
  const isShown = useCallback((x: ApiRadarTopic) => matchesRadarFilters(x, filters), [filters]);
  const totalSignals = radar?.sources.reduce((sum, s) => sum + s.signalCount, 0) ?? 0;

  // Keep the card on a topic that is still visible after a filter change
  const applyFilters = (next: RadarFilters) => {
    setFilters(next);
    const current = topics.find((x) => x.id === selectedId);
    if (!current || !matchesRadarFilters(current, next)) {
      const first = topics.find((x) => matchesRadarFilters(x, next));
      if (first) setSelectedId(first.id);
    }
  };
  const toggleSector = (key: RadarSectorKey) => applyFilters({ ...filters, group: filters.group === key ? "" : key });
  const select = (id: string) => setSelectedId(id);
  const selectAndShow = (id: string) => {
    setSelectedId(id);
    // Below the lg breakpoint the card sits under the chart: bring it into view
    if (window.matchMedia("(max-width: 1023px)").matches) {
      document.getElementById("radar-card")?.scrollIntoView({ block: "start" });
    }
  };

  return (
    <div>
      <div className="mb-5">
        <h1
          className="text-4xl"
          style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, color: "var(--sp-navy)" }}
        >
          {t.radar.title}
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm [color:var(--text-muted)]">{t.radar.description}</p>
        {radar ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs [color:var(--text-muted)]">
            {radar.generatedAt ? (
              <time dateTime={radar.generatedAt}>{t.radar.updated(ageLabel(radar.generatedAt, now, t))}</time>
            ) : null}
            <span>· {t.radar.signalsInWindow(totalSignals, radar.windowDays)}</span>
            {radar.sources.map((s) => (
              <span key={s.key}>
                · {s.label} {s.active ? s.signalCount.toLocaleString("en-US") : `— ${t.radar.notConnected}`}
              </span>
            ))}
          </p>
        ) : null}
      </div>

      {!radar ? (
        <EmptyState title={t.radar.unavailableTitle} description={t.radar.unavailableDesc} />
      ) : topics.length === 0 ? (
        <EmptyState title={t.radar.emptyTitle} description={t.radar.emptyDesc} />
      ) : (
        <>
          <RadarBrief topics={topics} onSelect={select} />

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <section className="min-w-0" aria-label={t.radar.title}>
              <RadarToolbar filters={filters} onChange={applyFilters} topics={topics} />
              <RadarChart
                topics={topics}
                positions={positions}
                rankOf={rankOf}
                selectedId={selectedId}
                isDimmed={(x) => !isShown(x)}
                sector={filters.group}
                onSelect={select}
                onSector={toggleSector}
              />
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] [color:var(--text-muted)]">
                <li className="inline-flex items-center gap-1.5">
                  <span className="h-[11px] w-[11px] rounded-full" style={{ background: MOMENTUM_FILL.new }} />
                  {t.radar.legendNew}
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <span className="h-[11px] w-[11px] rounded-full" style={{ background: MOMENTUM_FILL.rising }} />
                  {t.radar.legendRising}
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <span className="h-[11px] w-[11px] rounded-full" style={{ background: MOMENTUM_FILL.steady }} />
                  {t.radar.legendSteady}
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <span className="h-[11px] w-[11px] rounded-full" style={{ background: MOMENTUM_FILL.cooling }} />
                  {t.radar.legendCooling}
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <span className="h-[14px] w-[14px] rounded-full border-[1.6px] border-dashed [border-color:var(--amber)]" />
                  {t.radar.legendGap}
                </li>
                <li>{t.radar.legendCenter}</li>
              </ul>
            </section>

            <aside
              id="radar-card"
              className="min-w-0 rounded-[10px] border p-5 [background:var(--surface)] [border-color:var(--border)] lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
              aria-live="polite"
            >
              {topics.map((topic) => (
                <RadarTopicCard
                  key={topic.id}
                  topic={topic}
                  rank={rankOf(topic.id)}
                  windowDays={radar.windowDays}
                  builtAt={radar.generatedAt}
                  now={now}
                  hidden={topic.id !== selectedId}
                />
              ))}
            </aside>
          </div>

          <div className="mt-10">
            <RadarRingLists
              topics={topics}
              rankOf={rankOf}
              isShown={isShown}
              selectedId={selectedId}
              windowDays={radar.windowDays}
              onSelect={selectAndShow}
            />
          </div>

          <div className="mt-10 grid gap-8 border-t pt-8 [border-color:var(--border)] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section>
              <h2 className="text-lg font-semibold text-foreground">{t.radar.questionsTitle}</h2>
              <p className="mb-2 mt-1 text-xs [color:var(--text-muted)]">{t.radar.questionsDesc(radar.windowDays)}</p>
              {radar.questions.length === 0 ? (
                <p className="text-sm [color:var(--text-muted)]">{t.radar.noQuestions}</p>
              ) : (
                <ul className="grid gap-x-8 rounded-[10px] border px-3.5 py-1 [background:var(--surface)] [border-color:var(--border)] md:grid-cols-2">
                  {radar.questions.map((q) => (
                    <RadarSignalItem key={q.id} signal={q} now={now} />
                  ))}
                </ul>
              )}
            </section>
            <section className="h-fit rounded-[10px] border border-dashed p-3.5 [border-color:var(--border)]">
              <h2 className="text-sm font-semibold text-foreground">{t.radar.methodTitle}</h2>
              <p className="mt-1.5 text-xs leading-relaxed [color:var(--text-muted)]">{t.radar.methodBody}</p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
