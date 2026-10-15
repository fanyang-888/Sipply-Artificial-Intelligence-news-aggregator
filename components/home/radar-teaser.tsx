"use client";

import Link from "next/link";
import { RadarSparkline } from "@/components/radar/radar-bits";
import { MOMENTUM_FILL } from "@/components/radar/radar-chart";
import type { ApiRadarTopic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";
import { radarTitle, topicPlatforms } from "@/lib/utils/radar";

/**
 * Panel 03 body: the radar's leading topics, each with its 14-day sparkline
 * on one shared scale, then the way into the full radar.
 */
export function RadarTeaser({ topics, windowDays }: { topics: ApiRadarTopic[]; windowDays: number }) {
  const { t, lang } = useI18n();
  const scaleMax = Math.max(1, ...topics.flatMap((x) => x.dailyCounts));
  return (
    <div className="mx-auto max-w-3xl">
      <ol className="sp-glass divide-y overflow-hidden [&>*]:[border-color:var(--border)]">
        {topics.map((topic, i) => {
          const loud = topic.momentum === "new" || topic.momentum === "rising";
          return (
            <li key={topic.id}>
              <Link
                href="/radar"
                className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-4 px-5 py-5 no-underline transition-colors hover:[background:var(--panel-fill-2)] sm:px-7"
              >
                <span className="font-mono text-[12px] tabular-nums [color:var(--text-muted)]">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="block text-[16px] leading-snug text-foreground sm:text-[17px]">{radarTitle(topic.label, topic.labelZh, lang)}</span>
                  <span className="mt-1 block text-[12.5px] [color:var(--text-muted)]">
                    {t.radar.rings[topic.ring].name} · {t.home.signals(topic.signalCount)} ·{" "}
                    {topicPlatforms(topic).map((k) => t.radar.sourceShort[k]).join(", ")}
                    {loud ? <span style={{ color: MOMENTUM_FILL[topic.momentum] }}> · {t.radar.momentum[topic.momentum]}</span> : null}
                  </span>
                </span>
                <RadarSparkline counts={topic.dailyCounts} scaleMax={scaleMax} label={t.radar.dailyChartAria(windowDays)} />
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="mt-8 text-center">
        <Link
          href="/radar"
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium no-underline transition-opacity hover:opacity-90 [background:var(--cta-bg)] [color:var(--cta-text)]"
        >
          {t.home.openRadar} <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
