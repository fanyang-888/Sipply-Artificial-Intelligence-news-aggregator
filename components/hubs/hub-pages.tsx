"use client";

import Link from "next/link";
import type { ApiTopicDetail, ApiTopicSummary, ApiWeekDetail, ApiWeekSummary } from "@/lib/api/types";
import { topicGroupByKey, topicGroupLabel } from "@/lib/constants/topic-groups";
import { useI18n } from "@/lib/i18n";
import { apiRowToArchiveRow } from "@/lib/mappers/archive";
import { useNowMinute } from "@/lib/use-now-minute";
import { radarSectorForTag } from "@/lib/utils/radar";
import { formatWeekRange } from "@/lib/utils/weeks";
import { ArchiveTimelineRow } from "@/components/archive/archive-timeline-row";
import { EmptyState } from "@/components/shared/empty-state";

const label = "font-mono text-[10.5px] uppercase tracking-[0.12em] [color:var(--text-muted)]";
const UTC_DAY = {
  en: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  zh: new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", timeZone: "UTC" }),
};

function PageHeader({ eyebrow, title, description }: { eyebrow?: string; title: string; description: string }) {
  return (
    <header className="mb-6">
      {eyebrow ? <p className={label}>{eyebrow}</p> : null}
      <h1 className="mt-1 text-4xl" style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, color: "var(--sp-navy)" }}>
        {title}
      </h1>
      <p className="mt-1.5 max-w-3xl text-sm [color:var(--text-muted)]">{description}</p>
    </header>
  );
}

function Unavailable() {
  const { t } = useI18n();
  return <EmptyState title={t.hubs.unavailable} description="" />;
}

function StoryList({ stories }: { stories: ApiTopicDetail["stories"] }) {
  const { t, lang } = useI18n();
  // A fixed date on the server, "3h ago" after mount
  const now = useNowMinute();
  return (
    <div>
      {stories.map((s) => (
        <ArchiveTimelineRow key={s.id} row={apiRowToArchiveRow(s, t, lang, now)} />
      ))}
    </div>
  );
}

function categoryName(tag: string, lang: "en" | "zh", other: string): string {
  const key = radarSectorForTag(tag);
  const group = key === "other" ? undefined : topicGroupByKey(key);
  return group ? topicGroupLabel(group, lang) : other;
}

// ---------------------------------------------------------------------------
// /topics
// ---------------------------------------------------------------------------

export function TopicsIndex({ topics }: { topics: ApiTopicSummary[] | null }) {
  const { t, lang } = useI18n();
  return (
    <div>
      <PageHeader title={t.hubs.topicsTitle} description={t.hubs.topicsDescription} />
      {!topics ? (
        <Unavailable />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((topic) => (
            <li key={topic.slug}>
              <Link
                href={`/topics/${topic.slug}`}
                className="block h-full rounded-[10px] border p-4 no-underline transition-colors [background:var(--surface)] [border-color:var(--border)] hover:[border-color:var(--accent)]"
              >
                <span className="block text-lg font-semibold text-foreground">{topic.name}</span>
                <span className="mt-1 block text-[13px] [color:var(--text-muted)]">
                  {t.hubs.recentStories(topic.storyCount)} · {t.hubs.totalStories(topic.totalStories)}
                </span>
                {topic.latestAt ? (
                  <span className="mt-0.5 block font-mono text-[11px] [color:var(--text-dim)]">
                    {t.hubs.latest(UTC_DAY[lang].format(new Date(topic.latestAt)))}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// /topics/[slug]
// ---------------------------------------------------------------------------

export function TopicPage({ topic }: { topic: ApiTopicDetail | null }) {
  const { t } = useI18n();
  if (!topic) return <Unavailable />;
  return (
    <div>
      <p className="mb-3 text-sm">
        <Link href="/topics" className="[color:var(--accent)] hover:underline">
          ← {t.hubs.allTopics}
        </Link>
      </p>
      <PageHeader
        title={t.hubs.topicTitle(topic.name)}
        description={`${t.hubs.recentStories(topic.storyCount)} · ${t.hubs.totalStories(topic.totalStories)}`}
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0" aria-labelledby="topic-stories">
          <h2 id="topic-stories" className={`${label} mb-2`}>
            {t.hubs.storiesTitle}
          </h2>
          <StoryList stories={topic.stories} />
        </section>
        {topic.radar.length > 0 ? (
          <aside className="h-fit rounded-[10px] border p-4 [background:var(--surface)] [border-color:var(--border)]">
            <h2 className="text-sm font-semibold text-foreground">{t.hubs.onRadar}</h2>
            <p className="mb-2 mt-0.5 text-xs [color:var(--text-muted)]">{t.hubs.onRadarDesc}</p>
            <ul className="space-y-2">
              {topic.radar.map((r) => (
                <li key={r.id} className="text-[13px] leading-snug">
                  <Link href="/radar" className="text-foreground hover:[color:var(--accent)]">
                    {r.label}
                  </Link>
                  <span className="mt-0.5 block text-[11px] [color:var(--text-muted)]">
                    {t.hubs.ringNames[r.ring]} · {t.hubs.signals(r.signalCount)}
                    {r.rising ? ` · ↑ ${t.hubs.rising}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// /weekly
// ---------------------------------------------------------------------------

export function WeeksIndex({ weeks, currentWeek }: { weeks: ApiWeekSummary[] | null; currentWeek: string }) {
  const { t, lang } = useI18n();
  return (
    <div>
      <PageHeader title={t.hubs.weeklyTitle} description={t.hubs.weeklyDescription} />
      {!weeks ? (
        <Unavailable />
      ) : (
        <ul className="max-w-2xl divide-y rounded-[10px] border [background:var(--surface)] [border-color:var(--border)] [&>*]:[border-color:var(--border)]">
          {weeks.map((w) => (
            <li key={w.week}>
              <Link href={`/weekly/${w.week}`} className="flex items-baseline justify-between gap-3 px-4 py-3 no-underline hover:[background:var(--surface2)]">
                <span className="text-[15px] font-medium text-foreground">
                  {t.hubs.weekTitle(formatWeekRange(w.start, w.end, lang))}
                  {w.week === currentWeek ? (
                    <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold [background:var(--accent)] [color:var(--bg)]">
                      {t.hubs.thisWeek}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-mono text-[11px] [color:var(--text-muted)]">{t.hubs.weekStories(w.storyCount)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// /weekly/[week]
// ---------------------------------------------------------------------------

export function WeekPage({
  week,
  newer,
  older,
}: {
  week: ApiWeekDetail | null;
  newer: ApiWeekSummary | null;
  older: ApiWeekSummary | null;
}) {
  const { t, lang } = useI18n();
  if (!week) return <Unavailable />;
  const range = formatWeekRange(week.start, week.end, lang);
  // Several backend tags share one category (Regulation + Safety = Policy & Safety)
  const categories = new Map<string, number>();
  for (const c of week.categories) {
    const name = categoryName(c.key, lang, t.radar.otherCategory);
    categories.set(name, (categories.get(name) ?? 0) + c.count);
  }
  return (
    <div>
      <nav className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" aria-label={t.hubs.allWeeks}>
        <Link href="/weekly" className="[color:var(--accent)] hover:underline">
          ← {t.hubs.allWeeks}
        </Link>
        {older ? (
          <Link href={`/weekly/${older.week}`} className="[color:var(--text-muted)] hover:underline">
            ‹ {t.hubs.older}
          </Link>
        ) : null}
        {newer ? (
          <Link href={`/weekly/${newer.week}`} className="[color:var(--text-muted)] hover:underline">
            {t.hubs.newer} ›
          </Link>
        ) : null}
      </nav>
      <PageHeader eyebrow={week.week} title={t.hubs.weekTitle(range)} description={t.hubs.weekStories(week.storyCount)} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0" aria-labelledby="week-top">
          <h2 id="week-top" className={`${label} mb-2`}>
            {t.hubs.topStories}
          </h2>
          <StoryList stories={week.stories} />
        </section>
        <aside className="h-fit space-y-5">
          {week.topics.length > 0 ? (
            <section>
              <h2 className={`${label} mb-2`}>{t.hubs.companies}</h2>
              <ul className="flex flex-wrap gap-1.5">
                {week.topics.map((c) => (
                  <li key={c.key}>
                    <Link
                      href={`/topics/${c.key}`}
                      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs no-underline [background:var(--surface)] [border-color:var(--border)] hover:[border-color:var(--accent)]"
                    >
                      <span className="text-foreground">{c.name}</span>
                      <span className="font-mono [color:var(--text-muted)]">{c.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section>
            <h2 className={`${label} mb-2`}>{t.hubs.byCategory}</h2>
            <ul className="space-y-1 text-[13px]">
              {[...categories].sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                <li key={name} className="flex justify-between gap-3">
                  <span className="text-foreground">{name}</span>
                  <span className="font-mono [color:var(--text-muted)]">{count}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
