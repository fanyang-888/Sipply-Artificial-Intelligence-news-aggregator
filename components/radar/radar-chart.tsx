"use client";

import { useRef, useState } from "react";
import type { ApiRadarTopic, RadarRing } from "@/lib/api/types";
import { topicGroupByKey, topicGroupLabel } from "@/lib/constants/topic-groups";
import { useI18n } from "@/lib/i18n";
import { RADAR_SECTORS, radarSectorForTag, radarTitle, type RadarSectorKey } from "@/lib/utils/radar";
import {
  BLIP_RADIUS,
  RADAR_RADIUS,
  RING_OUTER,
  SECTOR_SPAN,
  SECTOR_START,
  type BlipPosition,
} from "@/lib/utils/radar-layout";

/** Only new and rising topics get a color; steady and cooling stay gray. */
export const MOMENTUM_FILL = {
  new: "var(--accent)",
  rising: "var(--green)",
  steady: "var(--radar-cool)",
  cooling: "var(--radar-cool)",
} as const;

type RadarChartProps = {
  topics: ApiRadarTopic[];
  positions: Record<string, BlipPosition>;
  rankOf: (id: string) => number;
  selectedId: string | null;
  isDimmed: (topic: ApiRadarTopic) => boolean;
  sector: RadarSectorKey | "";
  onSelect: (id: string) => void;
  onSector: (key: RadarSectorKey) => void;
};

/** Long English sector names go on two lines so they fit beside the chart. */
export function splitSectorLabel(name: string): string[] {
  if (name.length <= 12) return [name];
  const amp = name.indexOf(" & ");
  if (amp > 0) return [name.slice(0, amp + 2), name.slice(amp + 3)];
  const mid = name.lastIndexOf(" ", Math.ceil(name.length / 2));
  return mid > 0 ? [name.slice(0, mid), name.slice(mid + 1)] : [name];
}

function wedge(a0: number, a1: number, r: number): string {
  const p = (a: number) => `${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)}`;
  return `M0 0 L${p(a0)} A${r} ${r} 0 0 1 ${p(a1)} Z`;
}

/**
 * Rings = evidence (mainstream inside), sectors = category, color = momentum
 * (new, rising; gray otherwise). Blip numbers match the table rows.
 */
export function RadarChart({ topics, positions, rankOf, selectedId, isDimmed, sector, onSelect, onSector }: RadarChartProps) {
  const { t, lang } = useI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ id: string; left: number; top: number } | null>(null);
  const hovered = hover ? topics.find((x) => x.id === hover.id) : undefined;

  const sectorName = (key: RadarSectorKey) => {
    const g = key === "other" ? undefined : topicGroupByKey(key);
    return g ? topicGroupLabel(g, lang) : t.radar.otherCategory;
  };

  const showTip = (id: string, el: Element) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const b = el.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    let left = b.right - w.left + 8;
    if (left + 260 > w.width) left = Math.max(0, b.left - w.left - 268);
    setHover({ id, left, top: b.top - w.top - 4 });
  };

  // Selected blip last, so its ring is drawn on top
  const ordered = [...topics].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId));

  return (
    <div ref={wrapRef} className="relative">
      <svg
        viewBox="-520 -440 1040 880"
        className="radar-chart block h-auto w-full"
        role="group"
        aria-label={t.radar.chartAria}
        onMouseLeave={() => setHover(null)}
      >
        {sector ? (
          <path
            d={wedge(
              SECTOR_START + RADAR_SECTORS.indexOf(sector) * SECTOR_SPAN,
              SECTOR_START + (RADAR_SECTORS.indexOf(sector) + 1) * SECTOR_SPAN,
              RADAR_RADIUS,
            )}
            fill="var(--accent-faint)"
          />
        ) : null}
        {([1, 2, 3] as RadarRing[]).map((r) => (
          <circle key={r} r={RING_OUTER[r]} fill="none" stroke="var(--border)" />
        ))}
        {RADAR_SECTORS.map((_, i) => {
          const a = SECTOR_START + i * SECTOR_SPAN;
          return (
            <line
              key={i}
              x1={0}
              y1={0}
              x2={(RADAR_RADIUS * Math.cos(a)).toFixed(1)}
              y2={(RADAR_RADIUS * Math.sin(a)).toFixed(1)}
              stroke="var(--border)"
            />
          );
        })}

        {RADAR_SECTORS.map((key, i) => {
          const a = SECTOR_START + (i + 0.5) * SECTOR_SPAN;
          const r = RADAR_RADIUS + 30;
          const x = r * Math.cos(a);
          const y = r * Math.sin(a);
          const anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
          const name = sectorName(key);
          const lines = splitSectorLabel(name);
          const extra = (lines.length - 1) * 21;
          const yy = Math.sin(a) < -0.3 ? y - extra : Math.sin(a) > 0.3 ? y + 14 : y + 6 - extra / 2;
          const empty = !topics.some((x) => radarSectorForTag(x.topicTag) === key);
          return (
            <g
              key={key}
              role="button"
              tabIndex={0}
              aria-pressed={sector === key}
              aria-label={t.radar.sectorFilterAria(name)}
              className="cursor-pointer outline-none [&:focus-visible_text]:underline"
              onClick={() => onSector(key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSector(key);
                }
              }}
            >
              <text
                x={x.toFixed(1)}
                y={yy.toFixed(1)}
                textAnchor={anchor}
                className="radar-sector-name"
                fill={sector === key ? "var(--accent)" : empty ? "var(--text-muted)" : "var(--text)"}
              >
                {lines.map((line, li) => (
                  <tspan key={li} x={x.toFixed(1)} dy={li === 0 ? 0 : 21}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}

        {([1, 2, 3] as RadarRing[]).map((r) => (
          <text
            key={r}
            x={6}
            y={-(RING_OUTER[r] - 16)}
            className="radar-ring-label"
            fill="var(--text-muted)"
            stroke="var(--bg)"
            strokeWidth={5}
            paintOrder="stroke"
            strokeLinejoin="round"
          >
            {t.radar.rings[r].name}
          </text>
        ))}

        {ordered.map((topic) => {
          const tail = positions[topic.id]?.tail;
          if (!tail) return null;
          const pos = positions[topic.id];
          // Stop at the blip's edge
          const dx = pos.x - tail.x;
          const dy = pos.y - tail.y;
          const len = Math.hypot(dx, dy) || 1;
          const endX = pos.x - (dx / len) * (BLIP_RADIUS + 2);
          const endY = pos.y - (dy / len) * (BLIP_RADIUS + 2);
          return (
            <g key={`tail-${topic.id}`} style={{ opacity: isDimmed(topic) ? 0.14 : 0.85 }} aria-hidden="true">
              <line x1={tail.x} y1={tail.y} x2={endX.toFixed(1)} y2={endY.toFixed(1)} stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4 3" />
              <circle cx={tail.x} cy={tail.y} r={4} fill="var(--bg)" stroke="var(--text-muted)" strokeWidth={1.5} />
            </g>
          );
        })}
        {ordered.map((topic) => {
          const pos = positions[topic.id];
          if (!pos) return null;
          const dim = isDimmed(topic);
          const selected = topic.id === selectedId;
          const rank = rankOf(topic.id);
          return (
            <g
              key={topic.id}
              transform={`translate(${pos.x} ${pos.y})`}
              role="button"
              tabIndex={dim ? -1 : 0}
              aria-pressed={selected}
              aria-label={`#${rank} ${radarTitle(topic.label, topic.labelZh, lang)}`}
              className="cursor-pointer outline-none transition-opacity [&:focus-visible_.radar-dot]:stroke-[var(--text)]"
              style={{ opacity: dim ? 0.14 : 1 }}
              onClick={() => onSelect(topic.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(topic.id);
                }
              }}
              onMouseEnter={(e) => showTip(topic.id, e.currentTarget)}
              onFocus={(e) => showTip(topic.id, e.currentTarget)}
              onBlur={() => setHover(null)}
            >
              {selected ? <circle r={BLIP_RADIUS + 5} fill="none" stroke="var(--text)" strokeWidth={1.6} /> : null}
              <circle r={BLIP_RADIUS} fill={MOMENTUM_FILL[topic.momentum]} stroke="var(--bg)" strokeWidth={2} className="radar-dot" />
              <text dy="0.36em" textAnchor="middle" className="radar-blip-num" fill="var(--bg)">
                {rank}
              </text>
            </g>
          );
        })}
      </svg>

      {hover && hovered ? (
        <div
          className="pointer-events-none absolute z-10 max-w-[260px] rounded-md border px-2.5 py-1.5 text-[13px] leading-snug shadow-lg [background:var(--surface2)] [border-color:var(--border)]"
          style={{ left: hover.left, top: hover.top }}
          role="tooltip"
        >
          <span className="block font-mono text-[10.5px] [color:var(--text-muted)]">
            #{rankOf(hovered.id)} · {t.radar.rings[hovered.ring].name} · {t.radar.momentum[hovered.momentum]} ·{" "}
            {Math.round(hovered.score)}
          </span>
          {radarTitle(hovered.label, hovered.labelZh, lang)}
        </div>
      ) : null}
    </div>
  );
}
