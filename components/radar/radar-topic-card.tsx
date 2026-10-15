"use client";

import Link from "next/link";
import type { ApiRadarTopic } from "@/lib/api/types";
import { topicGroupByKey, topicGroupLabel } from "@/lib/constants/topic-groups";
import { useI18n, type Translations } from "@/lib/i18n";
import { formatVelocity, platformBreakdown, radarSectorForTag, radarTitle, ringMove } from "@/lib/utils/radar";
import { RadarSignalItem, RadarTrendChart, ScoreLine } from "@/components/radar/radar-bits";
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
    platforms: platformBreakdown(topic, t.radar.sourceShort, lang === "zh" ? "，" : ", "),
    trend,
    pace: trend === "down" ? `${Math.round(v * 100)}%` : formatVelocity(v),
    first: day(topic.firstSeenAt),
    last: day(topic.lastSeenAt),
  });
}

/** Where the topic was a few days ago, in words. */
export function trailSentence(topic: ApiRadarTopic, t: Translations): string {
  const move = ringMove(topic);
  if (!move) return "";
  if (move.kind === "appeared") return t.radar.trailAppeared;
  if (move.kind === "stayed") return t.radar.trailStayed(t.radar.rings[topic.ring].name);
  return t.radar.trailMoved(t.radar.rings[move.from].name, move.fromSignals, t.radar.rings[topic.ring].name, topic.signalCount);
}

type RadarTopicCardProps = {
  topic: ApiRadarTopic;
  rank: number;
  total: number;
  windowDays: number;
  builtAt: string | null;
  now: number | null;
  hidden: boolean;
};

/**
 * Everything about one topic. Every topic's card is in the server HTML (the
 * unselected ones hidden) so crawlers and AI assistants can read all of them.
 */
export function RadarTopicCard({ topic, rank, total, windowDays, builtAt, now, hidden }: RadarTopicCardProps) {
  const { t, lang } = useI18n();
  const sector = radarSectorForTag(topic.topicTag);
  const group = sector === "other" ? undefined : topicGroupByKey(sector);
  const title = radarTitle(topic.label, topic.labelZh, lang);
  const summary = lang === "zh" ? topic.summaryZh ?? topic.summaryEn : topic.summaryEn;
  const ring = t.radar.rings[topic.ring];
  const coverage = topic.coverage;
  const loud = topic.momentum === "new" || topic.momentum === "rising";
  const h3 = "mb-1 text-[13px] font-semibold text-foreground";

  return (
    <article id={`topic-${topic.id}`} data-radar-topic hidden={hidden} className="space-y-4">
      <header>
        <p className="text-[12.5px] [color:var(--text-muted)]">
          #{rank} · {group ? topicGroupLabel(group, lang) : t.radar.otherCategory} · {ring.name} ·{" "}
          <span style={loud ? { color: MOMENTUM_FILL[topic.momentum] } : undefined}>{t.radar.momentum[topic.momentum]}</span>
        </p>
        <h2 className="mt-1 text-[20px] font-semibold leading-snug text-foreground [text-wrap:balance]">{title}</h2>
        {title !== topic.label ? <p className="mt-1 text-[13px] [color:var(--text-muted)]">{topic.label}</p> : null}
      </header>

      {summary ? (
        <p className="text-[14.5px] leading-relaxed text-foreground">
          {summary} <span className="text-[12px] [color:var(--text-muted)]">— {t.radar.aiSummaryNote}</span>
        </p>
      ) : null}

      <div>
        <p className="mb-2 text-[14px] leading-relaxed text-foreground">
          {topicReading(topic, t, lang)} {trailSentence(topic, t)}
        </p>
        <RadarTrendChart counts={topic.dailyCounts} endIso={builtAt} windowDays={windowDays} />
      </div>

      {coverage?.status === "covered" && coverage.clusterId ? (
        <p className="text-sm text-foreground">
          {t.radar.coverageCovered}
          {lang === "zh" ? "：" : ": "}
          <Link href={`/cluster/${coverage.clusterId}`} className="[color:var(--accent)] hover:underline">
            {radarTitle(coverage.title ?? "", coverage.titleZh, lang)}
          </Link>
        </p>
      ) : null}

      <ScoreLine score={topic.score} components={topic.components} rank={rank} total={total} />

      <TopicAnswerCheck topic={topic} now={now} />

      <section>
        <h3 className={h3}>{t.radar.evidenceLabel(topic.signals.length)}</h3>
        <ul>
          {topic.signals.map((s) => (
            <RadarSignalItem key={s.id} signal={s} now={now} />
          ))}
        </ul>
      </section>

      {topic.questions.length > 0 ? (
        <section>
          <h3 className={h3}>{t.radar.askedInTopic}</h3>
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
