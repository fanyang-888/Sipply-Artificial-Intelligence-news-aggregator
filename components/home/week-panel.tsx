"use client";

import Link from "@/components/shared/link";
import { SubscribeBar } from "@/components/shared/subscribe-bar";
import type { ApiWeekSummary } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";
import { formatWeekRange } from "@/lib/utils/weeks";
import { storyPath } from "@/lib/seo/site";

/** Panel 04 body: this week's headlines so far, and the weekly email. */
export function WeekPanel({ week }: { week: ApiWeekSummary | null }) {
  const { t, lang } = useI18n();
  const headlines = week?.headlines ?? [];
  return (
    <div className="mx-auto grid max-w-5xl items-stretch gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      {week && headlines.length > 0 ? (
        <div className="sp-glass flex flex-col p-6 sm:p-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] [color:var(--text-muted)]">
            {formatWeekRange(week.start, week.end, lang)} · {t.hubs.weekStories(week.storyCount)}
          </p>
          <ol className="mt-5 space-y-4">
            {headlines.map((h, i) => (
              <li key={h.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2">
                <span className="pt-0.5 font-mono text-[12px] tabular-nums [color:var(--text-muted)]">{String(i + 1).padStart(2, "0")}</span>
                <Link
                  href={storyPath(h)}
                  className="font-display font-normal text-[17px] leading-snug text-foreground no-underline hover:[color:var(--accent)]"
                >
                  {lang === "zh" && h.titleZh ? h.titleZh : h.title}
                </Link>
              </li>
            ))}
          </ol>
          <Link href={`/weekly/${week.week}`} className="mt-auto pt-7 text-[14px] font-medium text-foreground no-underline hover:[color:var(--accent)]">
            {t.home.openWeek} <span aria-hidden>→</span>
          </Link>
        </div>
      ) : null}
      <div className="flex [&>section]:flex-1 [&>section]:content-center">
        <SubscribeBar />
      </div>
    </div>
  );
}
