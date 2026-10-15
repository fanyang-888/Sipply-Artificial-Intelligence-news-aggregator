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

/**
 * Daily signal counts as bars; the last 3 days (the velocity window) are highlighted.
 * ``scaleMax`` puts every sparkline in a table on one scale.
 */
export function RadarSparkline({ counts, label, scaleMax }: { counts: number[]; label: string; scaleMax?: number }) {
  const height = 20;
  const bar = 3;
  const gap = 2;
  const width = Math.max(1, counts.length * (bar + gap) - gap);
  const heights = sparklineHeights(counts, height, scaleMax);
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

/** The score and its five components in one line; the weights are in the method note. */
export function ScoreLine({ score, components, rank, total }: { score: number; components: ApiRadarScoreComponents; rank: number; total: number }) {
  const { t } = useI18n();
  const parts: [string, number][] = [
    [t.radar.componentVolume, components.volume],
    [t.radar.componentEngagement, components.engagement],
    [t.radar.componentVelocity, components.velocity],
    [t.radar.componentRecency, components.recency],
    [t.radar.componentRelevance, components.relevance],
  ];
  return (
    <p className="text-[12.5px] leading-relaxed [color:var(--text-muted)]">
      <span className="text-foreground">{t.radar.scoreLine(Math.round(score), rank, total)}</span>
      {" · "}
      {parts.map(([name, value]) => `${name} ${Math.round(value)}`).join(" · ")}
    </p>
  );
}

const UTC_MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", timeZone: "UTC" });

/**
 * Daily counts as an area chart, the last 3 days (the velocity window) shaded.
 * ``endIso`` is the radar build time: the last point is the 24h before it.
 */
export function RadarTrendChart({ counts, endIso, windowDays }: { counts: number[]; endIso: string | null; windowDays: number }) {
  const { t } = useI18n();
  if (counts.length < 2) return null;
  const W = 420;
  const H = 96;
  const P = 4;
  const B = 16;
  const max = Math.max(1, ...counts);
  const step = (W - 2 * P) / (counts.length - 1);
  const base = H - B - P;
  const pts = counts.map((v, i) => [P + i * step, P + (base - P) * (1 - v / max)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${base} L${P} ${base} Z`;
  const recentX = P + (counts.length - 3.5) * step;
  const [endX, endY] = pts[pts.length - 1];
  const start = endIso ? new Date(new Date(endIso).getTime() - (counts.length - 1) * 86_400_000) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={t.radar.dailyChartAria(windowDays)}>
      <title>{`${t.radar.dailyChartAria(windowDays)}: ${counts.join(" ")}`}</title>
      <rect x={recentX} y={P} width={W - P - recentX} height={base - P} fill="var(--accent-faint)" />
      <line x1={P} x2={W - P} y1={base} y2={base} stroke="var(--border)" />
      <path d={area} fill="var(--accent-faint)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth={1.8} />
      <circle cx={endX} cy={endY} r={3} fill="var(--accent)" />
      <g fontFamily="'IBM Plex Mono', monospace" fontSize={11} fill="var(--text-muted)">
        <text x={P} y={11}>
          {t.radar.trendPeak(max)}
        </text>
        {start ? (
          <text x={P} y={H - 3}>
            {UTC_MONTH_DAY.format(start)}
          </text>
        ) : null}
        <text x={recentX + (W - P - recentX) / 2} y={H - 3} textAnchor="middle">
          {t.radar.trendRecent}
        </text>
      </g>
    </svg>
  );
}

export function RadarSignalItem({ signal, now }: { signal: ApiRadarSignal; now: number | null }) {
  const { t, lang } = useI18n();
  const title = radarTitle(signal.title, signal.titleZh, lang);
  const engagement = engagementLabel(signal, t.radar);
  const showDiscussion = signal.discussionUrl && signal.discussionUrl !== signal.url;
  return (
    <li className="py-3">
      <a
        href={signal.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[14px] font-medium leading-snug text-foreground no-underline hover:[color:var(--accent)]"
        title={title !== signal.title ? signal.title : undefined}
      >
        {title}
      </a>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] [color:var(--text-muted)]">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] [color:var(--accent)]">
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
