"use client";

import type { ApiRadarTopic, RadarSourceKey } from "@/lib/api/types";
import { topicGroupByKey, topicGroupLabel } from "@/lib/constants/topic-groups";
import { useI18n } from "@/lib/i18n";
import { formatCompact, formatVelocity, topicGroupForTag } from "@/lib/utils/radar";
import { RadarSignalItem, RadarSparkline, ScoreBreakdown } from "@/components/radar/radar-bits";

const SOURCE_ORDER: RadarSourceKey[] = ["hn", "news", "youtube"];

type RadarTopicRowProps = {
  topic: ApiRadarTopic;
  rank: number;
  windowDays: number;
  now: number | null;
};

/**
 * One topic: category · label + keywords + counts · sparkline + score.
 * A native <details> keeps the posts in the server HTML (readable by crawlers)
 * while staying collapsed for readers.
 */
export function RadarTopicRow({ topic, rank, windowDays, now }: RadarTopicRowProps) {
  const { t, lang } = useI18n();
  const groupKey = topicGroupForTag(topic.topicTag);
  const group = groupKey ? topicGroupByKey(groupKey) : undefined;
  const score = Math.min(100, Math.max(0, Math.round(topic.score)));
  const sources = SOURCE_ORDER.filter((k) => (topic.sourceCounts[k] ?? 0) > 0);

  return (
    <details className="group mb-2 rounded-[10px] border transition-colors [background:var(--surface)] [border-color:var(--border)] open:[border-color:var(--accent)]">
      <summary className="flex cursor-pointer list-none flex-col gap-2 p-3.5 hover:[border-color:var(--accent)] sm:flex-row sm:items-start sm:gap-4 sm:px-4 [&::-webkit-details-marker]:hidden">
        <span className="flex shrink-0 items-baseline gap-2 sm:w-[104px] sm:flex-col sm:gap-1 sm:pt-[2px]">
          <span className="font-mono text-[11px] [color:var(--text-muted)]">#{rank}</span>
          <span className="font-mono text-[9px] font-medium uppercase tracking-[0.1em] [color:var(--accent)]">
            {group ? topicGroupLabel(group, lang) : t.radar.otherCategory}
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold leading-snug text-foreground">{topic.label}</span>
          {topic.keywords.length > 0 ? (
            <span className="mt-0.5 block truncate text-xs [color:var(--text-muted)]">{topic.keywords.join(" · ")}</span>
          ) : null}
          <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] [color:var(--text-muted)]">
            <span>{t.radar.signalCount(topic.signalCount)}</span>
            {sources.map((k) => (
              <span key={k}>
                · {t.radar.sourceShort[k]} {topic.sourceCounts[k]}
              </span>
            ))}
            {topic.engagement > 0 ? <span>· {t.radar.engagement(formatCompact(topic.engagement))}</span> : null}
            {topic.rising ? (
              <span
                className="ml-1 rounded-full px-1.5 py-px text-[10px] font-semibold [background:var(--accent)] [color:var(--bg)]"
                title={t.radar.velocityTitle(formatVelocity(topic.velocity))}
              >
                ↑ {t.radar.rising} {formatVelocity(topic.velocity)}
              </span>
            ) : null}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-3 sm:w-[168px] sm:justify-end sm:pt-[2px]">
          <RadarSparkline counts={topic.dailyCounts} label={t.radar.dailyChartAria(windowDays)} />
          <span className="text-right" title={t.radar.scoreLabel}>
            <span className="block font-mono text-[15px] font-medium leading-none [color:var(--accent)]">{score}</span>
            <span className="mt-1 block h-[3px] w-[40px] overflow-hidden rounded-full [background:var(--border)]">
              <span className="block h-full rounded-full [background:var(--accent)]" style={{ width: `${score}%` }} />
            </span>
          </span>
          <span aria-hidden className="text-xs transition-transform [color:var(--text-muted)] group-open:rotate-180">
            ▾
          </span>
        </span>
      </summary>

      <div className="grid gap-5 border-t px-4 pb-4 pt-3 [border-color:var(--border)] md:grid-cols-[230px_1fr]">
        <div>
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] [color:var(--text-muted)]">
            {t.radar.scoreLabel} {score}
          </h3>
          <ScoreBreakdown components={topic.components} />
        </div>
        <div className="min-w-0">
          <h3 className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] [color:var(--text-muted)]">
            {t.radar.topPosts}
          </h3>
          <ul>
            {topic.signals.map((s) => (
              <RadarSignalItem key={s.id} signal={s} now={now} />
            ))}
          </ul>
          {topic.questions.length > 0 ? (
            <>
              <h3 className="mb-1 mt-3 font-mono text-[10px] uppercase tracking-[0.1em] [color:var(--text-muted)]">
                {t.radar.askedInTopic}
              </h3>
              <ul>
                {topic.questions.map((s) => (
                  <RadarSignalItem key={s.id} signal={s} now={now} />
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </details>
  );
}
