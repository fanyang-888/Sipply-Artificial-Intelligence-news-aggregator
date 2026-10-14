"use client";

import Link from "next/link";
import type { ApiRadarTopic } from "@/lib/api/types";
import { topicGroupByKey, topicGroupLabel } from "@/lib/constants/topic-groups";
import { useI18n, type Translations } from "@/lib/i18n";
import {
  PLATFORM_COLORS,
  formatVelocity,
  radarSectorForTag,
  radarTitle,
  topicPlatforms,
} from "@/lib/utils/radar";
import { RadarSignalItem, RadarTrendChart, ScoreBreakdown } from "@/components/radar/radar-bits";
import { MOMENTUM_FILL } from "@/components/radar/radar-chart";
import { TopicAnswerCheck } from "@/components/radar/radar-answers";

const UTC_DAY = {
  en: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  zh: new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", timeZone: "UTC" }),
};

/** One plain sentence built from the topic's own numbers (no AI involved). */
export function topicReading(topic: ApiRadarTopic, t: Translations, lang: "en" | "zh"): string {
  const day = (iso: string | null) => (iso ? UTC_DAY[lang].format(new Date(iso)) : "—");
  const v = topic.velocity;
  const trend = v >= 1.5 ? "up" : v <= 0.8 ? "down" : "flat";
  return t.radar.reading({
    signals: topic.signalCount,
    platforms: topicPlatforms(topic)
      .map((k) => t.radar.sourceShort[k])
      .join(lang === "zh" ? "、" : ", "),
    trend,
    pace: trend === "down" ? `${Math.round(v * 100)}%` : formatVelocity(v),
    first: day(topic.firstSeenAt),
    last: day(topic.lastSeenAt),
  });
}

type RadarTopicCardProps = {
  topic: ApiRadarTopic;
  rank: number;
  windowDays: number;
  builtAt: string | null;
  now: number | null;
  hidden: boolean;
};

/**
 * Everything about one topic. Every topic's card is in the server HTML (the
 * unselected ones hidden) so crawlers and AI assistants can read all of them.
 */
export function RadarTopicCard({ topic, rank, windowDays, builtAt, now, hidden }: RadarTopicCardProps) {
  const { t, lang } = useI18n();
  const sector = radarSectorForTag(topic.topicTag);
  const group = sector === "other" ? undefined : topicGroupByKey(sector);
  const title = radarTitle(topic.label, topic.labelZh, lang);
  const summary = lang === "zh" ? topic.summaryZh ?? topic.summaryEn : topic.summaryEn;
  const platforms = topicPlatforms(topic);
  const total = platforms.reduce((sum, k) => sum + (topic.sourceCounts[k] ?? 0), 0);
  const ring = t.radar.rings[topic.ring];
  const coverage = topic.coverage;
  const label = "font-mono text-[10.5px] uppercase tracking-[0.12em] [color:var(--text-muted)]";

  return (
    <article id={`topic-${topic.id}`} data-radar-topic hidden={hidden} className="space-y-4">
      <header>
        <p className={label}>
          #{rank} · {group ? topicGroupLabel(group, lang) : t.radar.otherCategory}
        </p>
        <h2 className="mt-1 text-[20px] font-semibold leading-snug text-foreground [text-wrap:balance]">{title}</h2>
        {title !== topic.label ? <p className="mt-1 text-[13px] [color:var(--text-muted)]">{topic.label}</p> : null}
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full border px-2.5 py-0.5 [border-color:var(--border)]">
            {ring.name} · {ring.action}
          </span>
          <span
            className="rounded-full border px-2.5 py-0.5"
            style={{ color: MOMENTUM_FILL[topic.momentum], borderColor: MOMENTUM_FILL[topic.momentum] }}
          >
            {t.radar.momentum[topic.momentum]}
          </span>
        </div>
      </header>

      {summary ? (
        <div className="border-l-2 pl-3 [border-color:var(--accent)]">
          <p className={label}>{t.radar.summaryLabel}</p>
          <p className="mt-1 text-[14.5px] leading-relaxed text-foreground">{summary}</p>
        </div>
      ) : null}

      <p className="text-[14px] leading-relaxed text-foreground">{topicReading(topic, t, lang)}</p>

      {coverage?.status === "covered" && coverage.clusterId ? (
        <div className="rounded-lg px-3.5 py-3 text-sm [background:var(--surface2)]">
          <p className="font-semibold text-foreground">{t.radar.coverageCovered}</p>
          <Link href={`/cluster/${coverage.clusterId}`} className="mt-0.5 block [color:var(--accent)] hover:underline">
            {radarTitle(coverage.title ?? "", coverage.titleZh, lang)}
          </Link>
        </div>
      ) : coverage?.status === "gap" ? (
        <div className="rounded-lg border px-3.5 py-3 text-sm [background:color-mix(in_srgb,var(--amber)_9%,transparent)] [border-color:var(--amber)]">
          <p className="font-semibold [color:var(--amber)]">{t.radar.coverageGap}</p>
          <p className="mt-0.5 text-foreground">{t.radar.coverageGapBody(topic.signalCount, windowDays)}</p>
        </div>
      ) : topic.ring === 3 ? (
        <p className="rounded-lg px-3.5 py-3 text-[13px] [background:var(--surface2)] [color:var(--text-muted)]">
          {t.radar.coverageWeak}
        </p>
      ) : null}

      <TopicAnswerCheck topic={topic} now={now} />

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className={label}>{t.radar.strengthLabel}</h3>
          <span className={label}>{t.radar.weightLabel}</span>
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
          <p className="font-['Playfair_Display',Georgia,serif] text-[44px] font-black leading-none tabular-nums text-foreground">
            {Math.round(topic.score)}
            <span className="ml-0.5 font-mono text-xs font-normal [color:var(--text-muted)]">/100</span>
          </p>
          <ScoreBreakdown components={topic.components} />
        </div>
      </section>

      <section>
        <h3 className={`${label} mb-1.5`}>{t.radar.trendLabel(windowDays)}</h3>
        <RadarTrendChart counts={topic.dailyCounts} endIso={builtAt} windowDays={windowDays} />
      </section>

      <section>
        <h3 className={`${label} mb-1.5`}>{t.radar.platformsLabel}</h3>
        <div className="flex h-2 overflow-hidden rounded [background:var(--surface2)]">
          {platforms.map((k) => (
            <span
              key={k}
              className="h-full"
              style={{ width: `${(100 * (topic.sourceCounts[k] ?? 0)) / Math.max(1, total)}%`, background: PLATFORM_COLORS[k] }}
            />
          ))}
        </div>
        <p className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-xs [color:var(--text-muted)]">
          {platforms.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: PLATFORM_COLORS[k] }} />
              {t.radar.sourceShort[k]} {topic.sourceCounts[k]}
            </span>
          ))}
        </p>
      </section>

      <section>
        <h3 className={label}>{t.radar.evidenceLabel(topic.signals.length)}</h3>
        <ul>
          {topic.signals.map((s) => (
            <RadarSignalItem key={s.id} signal={s} now={now} />
          ))}
        </ul>
      </section>

      {topic.questions.length > 0 ? (
        <section>
          <h3 className={label}>{t.radar.askedInTopic}</h3>
          <ul>
            {topic.questions.map((s) => (
              <RadarSignalItem key={s.id} signal={s} now={now} />
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
