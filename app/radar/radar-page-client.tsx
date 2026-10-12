"use client";

import { useMemo, useState } from "react";
import type { ApiRadar } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";
import { useNowMinute } from "@/lib/use-now-minute";
import { DEFAULT_RADAR_FILTERS, filterRadarTopics, type RadarFilters } from "@/lib/utils/radar";
import { RadarToolbar } from "@/components/radar/radar-toolbar";
import { RadarTopicRow } from "@/components/radar/radar-topic-row";
import { RadarSignalItem, ageLabel } from "@/components/radar/radar-bits";
import { EmptyState } from "@/components/shared/empty-state";
import { NoResultsState } from "@/components/shared/no-results-state";

/** Trend Radar body. Data comes from the server component, so the HTML is complete without JS. */
export function RadarPageClient({ radar }: { radar: ApiRadar | null }) {
  const { t } = useI18n();
  const now = useNowMinute();
  const [filters, setFilters] = useState<RadarFilters>(DEFAULT_RADAR_FILTERS);

  const topics = useMemo(() => (radar ? filterRadarTopics(radar.topics, filters) : []), [radar, filters]);
  const totalSignals = radar?.sources.reduce((sum, s) => sum + s.signalCount, 0) ?? 0;

  return (
    <div>
      <div className="mb-4">
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
      ) : radar.topics.length === 0 ? (
        <EmptyState title={t.radar.emptyTitle} description={t.radar.emptyDesc} />
      ) : (
        <>
          <RadarToolbar filters={filters} onChange={setFilters} sources={radar.sources} />
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section aria-label={t.radar.title}>
              <p className="mb-3 text-sm [color:var(--text-muted)]">{t.radar.topicsCount(topics.length)}</p>
              {topics.length === 0 ? (
                <NoResultsState title={t.radar.noMatchTitle} message={t.radar.noMatchDesc} />
              ) : (
                topics.map((topic) => (
                  <RadarTopicRow
                    key={topic.id}
                    topic={topic}
                    rank={radar.topics.indexOf(topic) + 1}
                    windowDays={radar.windowDays}
                    now={now}
                  />
                ))
              )}
            </section>

            <aside className="space-y-6">
              <section>
                <h2 className="text-lg font-semibold text-foreground">{t.radar.questionsTitle}</h2>
                <p className="mb-2 mt-1 text-xs [color:var(--text-muted)]">{t.radar.questionsDesc(radar.windowDays)}</p>
                {radar.questions.length === 0 ? (
                  <p className="text-sm [color:var(--text-muted)]">{t.radar.noQuestions}</p>
                ) : (
                  <ul className="rounded-[10px] border px-3.5 py-1 [background:var(--surface)] [border-color:var(--border)]">
                    {radar.questions.map((q) => (
                      <RadarSignalItem key={q.id} signal={q} now={now} />
                    ))}
                  </ul>
                )}
              </section>
              <section className="rounded-[10px] border border-dashed p-3.5 [border-color:var(--border)]">
                <h2 className="text-sm font-semibold text-foreground">{t.radar.methodTitle}</h2>
                <p className="mt-1.5 text-xs leading-relaxed [color:var(--text-muted)]">{t.radar.methodBody}</p>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
