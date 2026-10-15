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
import { PageHeader } from "@/components/shared/page-header";
import { uiMicroLabel, uiSectionTitle } from "@/lib/ui/classes";

const label = uiMicroLabel;
const UTC_DAY = {
  en: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  zh: new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", timeZone: "UTC" }),
};

function Unavailable() {
  const { t } = useI18n();
  return <EmptyState title={t.hubs.unavailable} description="" />;
}

function StoryList({ stories }: { stories: ApiTopicDetail["stories"] }) {
  const { t, lang } = useI18n();
  // A fixed date on the server, "3h ago" after mount
  const now = useNowMinute();
  return (
    <div className="sp-glass sp-rows overflow-hidden">
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
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((topic) => (
            <li key={topic.slug}>
              <Link
                href={`/topics/${topic.slug}`}
                className="sp-glass group flex h-full flex-col p-6 no-underline"
              >
                <span className="font-display text-[1.5rem] leading-tight text-foreground transition-colors group-hover:[color:var(--accent)]">
                  {topic.name}
                </span>
                <span className="mt-3 block text-[13.5px] [color:var(--text-soft)]">
                  {t.hubs.recentStories(topic.storyCount)} · {t.hubs.totalStories(topic.totalStories)}
                </span>
                {topic.latestAt ? (
                  <span className={`${label} mt-auto block pt-5`}>
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
      <PageHeader
        back={{ href: "/topics", label: t.hubs.allTopics }}
        title={t.hubs.topicTitle(topic.name)}
        description={`${t.hubs.recentStories(topic.storyCount)} · ${t.hubs.totalStories(topic.totalStories)}`}
      />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0" aria-labelledby="topic-stories">
          <h2 id="topic-stories" className={uiSectionTitle}>
            {t.hubs.storiesTitle}
          </h2>
          <StoryList stories={topic.stories} />
        </section>
        {topic.radar.length > 0 ? (
          <aside className="sp-glass h-fit p-6 lg:mt-[3.1rem]">
            <h2 className="font-display text-[1.2rem] leading-tight text-foreground">{t.hubs.onRadar}</h2>
            <p className="mb-4 mt-1 text-[13px] [color:var(--text-soft)]">{t.hubs.onRadarDesc}</p>
            <ul className="sp-rows -mx-6">
              {topic.radar.map((r) => (
                <li key={r.id} className="px-6 py-3 text-[14px] leading-snug">
                  <Link href="/radar" className="text-foreground no-underline hover:[color:var(--accent)]">
                    {r.label}
                  </Link>
                  <span className={`${label} mt-1 block normal-case tracking-[0.04em]`}>
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

/** New stories per day, Monday to Sunday, on a scale shared by every week in the list. */
function WeekBars({ counts, max, label }: { counts: number[]; max: number; label: string }) {
  if (counts.length === 0) return null;
  const height = 20;
  const bar = 5;
  const gap = 2;
  return (
    <svg role="img" aria-label={label} width={counts.length * (bar + gap) - gap} height={height} className="shrink-0">
      <title>{label}</title>
      {counts.map((c, i) => {
        const h = c === 0 ? 1 : Math.max(2, Math.round((c / Math.max(1, max)) * height));
        return <rect key={i} x={i * (bar + gap)} y={height - h} width={bar} height={h} rx={1} fill="var(--accent)" opacity={0.75} />;
      })}
    </svg>
  );
}

/**
 * Each week with its top headlines (so the list says what happened, not just
 * when) and a 7-day bar strip; all strips share one scale, so busy weeks look busy.
 */
export function WeeksIndex({ weeks, currentWeek }: { weeks: ApiWeekSummary[] | null; currentWeek: string }) {
  const { t, lang } = useI18n();
  const maxDaily = Math.max(1, ...(weeks ?? []).flatMap((w) => w.dailyCounts ?? []));
  return (
    <div>
      <PageHeader title={t.hubs.weeklyTitle} description={t.hubs.weeklyDescription} />
      {!weeks ? (
        <Unavailable />
      ) : (
        <ul className="sp-glass sp-rows max-w-4xl overflow-hidden">
          {weeks.map((w) => (
            <li key={w.week} className="px-6 py-5">
              {/* Phones: the bars and count go under the title instead of squeezing it */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <Link href={`/weekly/${w.week}`} className="font-display text-[1.25rem] leading-tight text-foreground no-underline hover:[color:var(--accent)]">
                  {t.hubs.weekTitle(formatWeekRange(w.start, w.end, lang))}
                  {w.week === currentWeek ? (
                    <span className="ml-3 inline-block rounded-full px-2.5 py-0.5 align-[0.2em] font-mono text-[10px] uppercase tracking-[0.12em] [background:var(--accent)] [color:var(--bg)]">
                      {t.hubs.thisWeek}
                    </span>
                  ) : null}
                </Link>
                <span className="flex shrink-0 items-center gap-3 sm:justify-end">
                  <WeekBars counts={w.dailyCounts ?? []} max={maxDaily} label={t.hubs.weekDailyAria((w.dailyCounts ?? []).join(", "))} />
                  <span className={`${label} normal-case tracking-[0.04em] sm:w-[5.5rem] sm:text-right`}>{t.hubs.weekStories(w.storyCount)}</span>
                </span>
              </div>
              {w.headlines && w.headlines.length > 0 ? (
                <ul className="mt-2.5 space-y-1">
                  {w.headlines.map((h) => (
                    <li key={h.id} className="truncate text-[14px] leading-snug">
                      <Link href={`/cluster/${h.id}`} className="[color:var(--text-soft)] no-underline hover:text-foreground">
                        {lang === "zh" && h.titleZh ? h.titleZh : h.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
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
      <PageHeader
        back={{ href: "/weekly", label: t.hubs.allWeeks }}
        eyebrow={
          <>
            <span>{week.week}</span>
            {older ? (
              <Link href={`/weekly/${older.week}`} className="no-underline hover:text-foreground">
                ‹ {t.hubs.older}
              </Link>
            ) : null}
            {newer ? (
              <Link href={`/weekly/${newer.week}`} className="no-underline hover:text-foreground">
                {t.hubs.newer} ›
              </Link>
            ) : null}
          </>
        }
        title={t.hubs.weekTitle(range)}
        description={t.hubs.weekStories(week.storyCount)}
      />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0" aria-labelledby="week-top">
          <h2 id="week-top" className={uiSectionTitle}>
            {t.hubs.topStories}
          </h2>
          <StoryList stories={week.stories} />
        </section>
        <aside className="sp-glass h-fit space-y-7 p-6 lg:mt-[3.1rem]">
          {week.topics.length > 0 ? (
            <section>
              <h2 className={`${label} mb-3`}>{t.hubs.companies}</h2>
              <ul className="flex flex-wrap gap-2">
                {week.topics.map((c) => (
                  <li key={c.key}>
                    <Link href={`/topics/${c.key}`} className="sp-chip">
                      <span>{c.name}</span>
                      <span className="font-mono text-[11px] [color:var(--text-muted)]">{c.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section>
            <h2 className={`${label} mb-3`}>{t.hubs.byCategory}</h2>
            <ul className="sp-rows -mx-6 text-[14px]">
              {[...categories].sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                <li key={name} className="flex justify-between gap-3 px-6 py-2">
                  <span className="text-foreground">{name}</span>
                  <span className="font-mono text-[12px] [color:var(--text-muted)]">{count}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
