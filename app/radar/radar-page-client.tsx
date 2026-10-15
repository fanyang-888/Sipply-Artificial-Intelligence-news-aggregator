"use client";

import { useCallback, useMemo, useState } from "react";
import type { ApiRadar, ApiRadarAnswers, ApiRadarTopic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";
import { useNowMinute } from "@/lib/use-now-minute";
import {
  DEFAULT_RADAR_FILTERS,
  matchesRadarFilters,
  radarOrder,
  type RadarFilters,
  type RadarSectorKey,
} from "@/lib/utils/radar";
import type { BlipPosition } from "@/lib/utils/radar-layout";
import { RadarAnswersSection } from "@/components/radar/radar-answers";
import { RadarBrief } from "@/components/radar/radar-brief";
import { RadarChart, MOMENTUM_FILL } from "@/components/radar/radar-chart";
import { RadarTable } from "@/components/radar/radar-table";
import { RadarToolbar } from "@/components/radar/radar-toolbar";
import { RadarTopicCard } from "@/components/radar/radar-topic-card";
import { RadarSignalItem, ageLabel } from "@/components/radar/radar-bits";
import { EmptyState } from "@/components/shared/empty-state";

type RadarPageClientProps = {
  radar: ApiRadar | null;
  /** Blip coordinates, computed once on the server (lib/utils/radar-layout.ts). */
  positions: Record<string, BlipPosition>;
  /** What AI assistants cited for the radar questions; null hides that section. */
  answers: ApiRadarAnswers | null;
};

function Dot({ color }: { color: string }) {
  return <span className="mx-1 inline-block h-[9px] w-[9px] rounded-full align-[0.05em]" style={{ background: color }} />;
}

/** Trend Radar body. Data comes from the server component, so the HTML is complete without JS. */
export function RadarPageClient({ radar, positions, answers }: RadarPageClientProps) {
  const { t } = useI18n();
  const now = useNowMinute();
  const [filters, setFilters] = useState<RadarFilters>(DEFAULT_RADAR_FILTERS);
  // Inner ring first, then score: blip numbers, table rows and "#n" all follow this order
  const topics = useMemo(() => radarOrder(radar?.topics ?? []), [radar]);
  const [selectedId, setSelectedId] = useState<string | null>(topics[0]?.id ?? null);

  const ranks = useMemo(() => new Map(topics.map((x, i) => [x.id, i + 1])), [topics]);
  const rankOf = useCallback((id: string) => ranks.get(id) ?? 0, [ranks]);
  const isShown = useCallback((x: ApiRadarTopic) => matchesRadarFilters(x, filters), [filters]);
  const totalSignals = radar?.sources.reduce((sum, s) => sum + s.signalCount, 0) ?? 0;
  const sourceList = (radar?.sources ?? [])
    .filter((s) => s.active && s.signalCount > 0)
    .map((s) => `${s.label} ${s.signalCount.toLocaleString("en-US")}`)
    .join(" · ");

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
      <div className="mb-6">
        <h1
          className="text-4xl"
          style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, color: "var(--sp-navy)" }}
        >
          {t.radar.title}
        </h1>
        {radar && topics.length > 0 ? (
          <RadarBrief topics={topics} totalSignals={totalSignals} windowDays={radar.windowDays} onSelect={selectAndShow} />
        ) : null}
        {radar ? (
          <p className="mt-2 text-[12.5px] [color:var(--text-muted)]">
            {radar.generatedAt ? (
              <time dateTime={radar.generatedAt}>{t.radar.updated(ageLabel(radar.generatedAt, now, t))}</time>
            ) : null}
            {" · "}
            <a href="#radar-method" className="underline-offset-2 hover:text-foreground hover:underline">
              {t.radar.methodTitle}
            </a>
          </p>
        ) : null}
      </div>

      {!radar ? (
        <EmptyState title={t.radar.unavailableTitle} description={t.radar.unavailableDesc} />
      ) : topics.length === 0 ? (
        <EmptyState title={t.radar.emptyTitle} description={t.radar.emptyDesc} />
      ) : (
        <>
          <RadarToolbar filters={filters} onChange={applyFilters} topics={topics} />

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <section className="min-w-0" aria-label={t.radar.title}>
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
              <p className="mt-1 text-[12.5px] leading-relaxed [color:var(--text-muted)]">
                {t.radar.captionRings}
                <Dot color={MOMENTUM_FILL.rising} />
                {t.radar.momentum.rising}
                <Dot color={MOMENTUM_FILL.new} />
                {t.radar.momentum.new}
                <Dot color={MOMENTUM_FILL.steady} />
                {t.radar.captionOther}. {t.radar.captionTrail}
              </p>
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
                  total={topics.length}
                  windowDays={radar.windowDays}
                  builtAt={radar.generatedAt}
                  now={now}
                  hidden={topic.id !== selectedId}
                />
              ))}
            </aside>
          </div>

          <div className="mt-8">
            <RadarTable
              topics={topics}
              rankOf={rankOf}
              isShown={isShown}
              selectedId={selectedId}
              windowDays={radar.windowDays}
              onSelect={selectAndShow}
            />
          </div>

          {answers && answers.checks > 0 ? (
            <div className="mt-12">
              <RadarAnswersSection answers={answers} now={now} />
            </div>
          ) : null}

          <section className="mt-12">
            <h2 className="text-lg font-semibold text-foreground">{t.radar.questionsTitle}</h2>
            <p className="mb-2 mt-1 text-[12.5px] [color:var(--text-muted)]">{t.radar.questionsDesc(radar.windowDays)}</p>
            {radar.questions.length === 0 ? (
              <p className="text-sm [color:var(--text-muted)]">{t.radar.noQuestions}</p>
            ) : (
              <ul className="grid gap-x-8 md:grid-cols-2">
                {radar.questions.map((q) => (
                  <RadarSignalItem key={q.id} signal={q} now={now} />
                ))}
              </ul>
            )}
          </section>

          <footer id="radar-method" className="mt-12 max-w-3xl scroll-mt-24 border-t pt-4 [border-color:var(--border)]">
            <h2 className="text-[13px] font-semibold text-foreground">{t.radar.methodTitle}</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed [color:var(--text-muted)]">
              {t.radar.methodBody} {sourceList ? t.radar.methodSources(radar.windowDays, sourceList) : null}
            </p>
          </footer>
        </>
      )}
    </div>
  );
}
