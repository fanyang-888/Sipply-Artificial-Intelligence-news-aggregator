"use client";

import Link from "@/components/shared/link";
import { SourceLink } from "@/components/digest/source-link";
import { ageLabel } from "@/components/radar/radar-bits";
import { RoleSwitch } from "@/components/home/role-switch";
import { topicGroupByKey, topicGroupLabel } from "@/lib/constants/topic-groups";
import { useI18n } from "@/lib/i18n";
import { usePreferredRole } from "@/lib/preferred-role";
import { useNowMinute } from "@/lib/use-now-minute";
import { pickLocalized } from "@/lib/utils/localized-string";
import { topicGroupForTag } from "@/lib/utils/radar";
import type { Cluster } from "@/types/cluster";
import { storyPath } from "@/lib/seo/site";

type LeadStoryProps = {
  story: Cluster;
  dateLabel: string;
  updatedAt: string | null;
  /** How many more stories the carousel below holds. */
  more: number;
};

/**
 * Panel 01: today's lead story as the page's one authored moment. A single
 * light falls on the headline; everything else is quieter.
 */
export function LeadStory({ story, dateLabel, updatedAt, more }: LeadStoryProps) {
  const { t, lang } = useI18n();
  const [role] = usePreferredRole();
  const now = useNowMinute();
  const group = story.topicTag ? topicGroupForTag(story.topicTag) : null;
  const category = group ? topicGroupByKey(group) : undefined;
  const angle = (role && pickLocalized(story.audience[role], lang)) || pickLocalized(story.whyItMatters, lang);

  return (
    <section className="relative flex min-h-[calc(100svh-7rem)] flex-col justify-center overflow-x-clip pb-16 pt-6 sm:pb-20" aria-labelledby="lead-story-title">
      <div className="sp-beam" aria-hidden />
      <div className="relative z-[1]">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 sm:mb-14">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.14em] [color:var(--text-muted)]">
            <span className="[color:var(--accent)]">{t.home.leadEyebrow}</span>
            {dateLabel ? <span>{dateLabel}</span> : null}
            {updatedAt ? (
              <span className="inline-flex items-center gap-1.5 normal-case tracking-[0.06em]">
                <span className="inline-block h-1.5 w-1.5 rounded-full [background:var(--green)]" aria-hidden />
                {t.home.updated(ageLabel(updatedAt, now, t))}
              </span>
            ) : null}
          </p>
          <RoleSwitch />
        </div>

        <div className="max-w-4xl">
          {category ? (
            <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.16em] [color:var(--text-muted)]">
              {topicGroupLabel(category, lang)}
            </p>
          ) : null}
          <h1
            id="lead-story-title"
            className="font-display font-light text-[clamp(2.3rem,5.4vw,4.6rem)] leading-[1.03] tracking-[-0.025em] text-foreground [text-wrap:balance]"
          >
            <Link href={storyPath(story)} className="no-underline hover:opacity-90">
              {pickLocalized(story.title, lang)}
            </Link>
          </h1>
          <p className="mt-7 max-w-2xl text-[17px] leading-relaxed [color:var(--text-soft)] line-clamp-4">
            {pickLocalized(story.summary, lang)}
          </p>
          {angle ? (
            <p className="mt-5 max-w-2xl border-l-2 pl-4 text-[15px] leading-relaxed text-foreground line-clamp-3 [border-color:var(--accent)]">
              {angle}
            </p>
          ) : null}
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href={storyPath(story)}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium no-underline transition-opacity hover:opacity-90 [background:var(--cta-bg)] [color:var(--cta-text)]"
            >
              {t.home.readStory} <span aria-hidden>→</span>
            </Link>
            <SourceLink cluster={story} />
          </div>
        </div>
      </div>

      {more > 0 ? (
        <a
          href="#today"
          className="absolute bottom-6 left-1/2 z-[1] -translate-x-1/2 font-mono text-[11px] uppercase tracking-[0.16em] no-underline [color:var(--text-muted)] hover:text-foreground"
        >
          {t.home.moreBelow(more)} <span aria-hidden>↓</span>
        </a>
      ) : null}
    </section>
  );
}
