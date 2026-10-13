"use client";

import type { ApiRadarScoreComponents, ApiRadarSignal } from "@/lib/api/types";
import { useI18n, type Translations } from "@/lib/i18n";
import { ageParts, engagementLabel, radarTitle, sparklineHeights } from "@/lib/utils/radar";

const UTC_SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "5h ago" once mounted; a fixed UTC date during server render (no hydration mismatch). */
export function ageLabel(iso: string, now: number | null, t: Translations): string {
  const parts = now == null ? null : ageParts(iso, new Date(now));
  if (!parts) return UTC_SHORT_DATE.format(new Date(iso));
  return parts.unit === "m" && parts.value === 0 ? t.radar.justNow : t.radar.age(parts.unit, parts.value);
}

export function RelativeAge({ iso, now }: { iso: string | null; now: number | null }) {
  const { t } = useI18n();
  if (!iso) return null;
  return <time dateTime={iso}>{ageLabel(iso, now, t)}</time>;
}

/** Daily signal counts as bars; the last 3 days (the velocity window) are highlighted. */
export function RadarSparkline({ counts, label }: { counts: number[]; label: string }) {
  const height = 22;
  const bar = 3;
  const gap = 2;
  const width = Math.max(1, counts.length * (bar + gap) - gap);
  const heights = sparklineHeights(counts, height);
  return (
    <svg role="img" aria-label={label} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0">
      <title>{`${label}: ${counts.join(" ")}`}</title>
      {heights.map((h, i) => (
        <rect
          key={i}
          x={i * (bar + gap)}
          y={height - h}
          width={bar}
          height={h}
          rx={1}
          fill={i >= counts.length - 3 ? "var(--accent)" : "var(--text-muted)"}
          opacity={i >= counts.length - 3 ? 1 : 0.55}
        />
      ))}
    </svg>
  );
}

export function ScoreBreakdown({ components }: { components: ApiRadarScoreComponents }) {
  const { t } = useI18n();
  const rows: [string, number][] = [
    [t.radar.componentVolume, components.volume],
    [t.radar.componentEngagement, components.engagement],
    [t.radar.componentVelocity, components.velocity],
    [t.radar.componentRecency, components.recency],
    [t.radar.componentRelevance, components.relevance],
  ];
  return (
    <dl className="space-y-1.5">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[88px_1fr_28px] items-center gap-2 text-[11px]">
          <dt className="[color:var(--text-muted)]">{label}</dt>
          <dd className="h-[4px] overflow-hidden rounded-full [background:var(--border)]">
            <span className="block h-full rounded-full [background:var(--accent)]" style={{ width: `${Math.round(value)}%` }} />
          </dd>
          <dd className="text-right font-mono [color:var(--text-muted)]">{Math.round(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RadarSignalItem({ signal, now }: { signal: ApiRadarSignal; now: number | null }) {
  const { t, lang } = useI18n();
  const title = radarTitle(signal.title, signal.titleZh, lang);
  const engagement = engagementLabel(signal, t.radar);
  const showDiscussion = signal.discussionUrl && signal.discussionUrl !== signal.url;
  return (
    <li className="border-b py-2 last:border-b-0 [border-color:var(--border)]">
      <a
        href={signal.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[13.5px] font-medium leading-snug text-foreground no-underline hover:[color:var(--accent)]"
        title={title !== signal.title ? signal.title : undefined}
      >
        {title}
      </a>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] [color:var(--text-muted)]">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] [color:var(--accent)]">
          {t.radar.sourceShort[signal.source]}
        </span>
        {signal.outlet ? <span>{signal.outlet}</span> : null}
        {engagement ? <span>{engagement}</span> : null}
        <RelativeAge iso={signal.publishedAt} now={now} />
        {showDiscussion ? (
          <a
            href={signal.discussionUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:underline [color:var(--text-muted)]"
          >
            {t.radar.discussion}
          </a>
        ) : null}
      </div>
    </li>
  );
}
