"use client";

import Link from "next/link";
import type { ArchiveClusterRow } from "@/lib/mappers/archive";
import { HighlightMatch } from "@/components/archive/highlight-match";

type ArchiveTimelineRowProps = {
  row: ArchiveClusterRow;
  highlightQuery?: string;
};

/**
 * One story as a row inside a glass panel (`sp-rows`): category · title +
 * one-line summary · sources, age and score.
 */
export function ArchiveTimelineRow({ row, highlightQuery }: ArchiveTimelineRowProps) {
  const score = Math.min(100, Math.max(0, Math.round(row.clusterScore ?? 0)));

  return (
    <Link
      href={`/cluster/${row.id}`}
      className="sp-row-link group flex flex-col gap-1.5 px-5 py-4 no-underline sm:flex-row sm:items-start sm:gap-5 sm:px-6"
    >
      <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.14em] [color:var(--accent)] sm:w-[96px] sm:pt-[5px]">
        {row.themeLabel}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[17px] leading-snug text-foreground transition-colors group-hover:[color:var(--accent)]">
          <HighlightMatch text={row.title} query={highlightQuery ?? ""} />
        </span>
        <span className="mt-1 block truncate text-[13px] [color:var(--text-soft)]">
          <HighlightMatch text={row.summarySnippet} query={highlightQuery ?? ""} />
        </span>
      </span>
      <span className="shrink-0 font-mono text-[10.5px] leading-relaxed [color:var(--text-muted)] sm:w-[150px] sm:pt-[3px] sm:text-right">
        <span className="block truncate">{row.sourceLabels}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 sm:justify-end">
          {row.freshnessLabel ? <span className="whitespace-nowrap">{row.freshnessLabel}</span> : null}
          {row.clusterScore != null ? (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span>· {score}%</span>
              <span className="inline-block h-[3px] w-[34px] overflow-hidden rounded-full [background:var(--panel-divider)]">
                <span className="block h-full rounded-full [background:var(--accent)]" style={{ width: `${score}%` }} />
              </span>
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}
