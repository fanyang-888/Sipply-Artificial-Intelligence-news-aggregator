"use client";

import type { ApiRadarTopic } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";
import { formatVelocity, radarBrief, radarTitle } from "@/lib/utils/radar";

/** Four facts about this run: ring sizes, the fastest riser, Sipply's gaps, topics that moved inward. */
export function RadarBrief({ topics, onSelect }: { topics: ApiRadarTopic[]; onSelect: (id: string) => void }) {
  const { t, lang } = useI18n();
  const brief = radarBrief(topics);
  const label = "font-mono text-[10.5px] uppercase tracking-[0.12em] [color:var(--text-muted)]";
  const cell = "grid min-w-0 content-start gap-1 px-4 py-3.5";
  return (
    <section
      aria-label={t.radar.briefAria}
      className="mb-6 grid grid-cols-1 divide-y border-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x [border-color:var(--border)] [&>*]:[border-color:var(--border)]"
    >
      <div className={cell}>
        <p className={label}>{t.radar.briefRings}</p>
        <p className="text-sm text-foreground">
          {([1, 2, 3] as const).map((r, i) => (
            <span key={r}>
              {i > 0 ? " · " : ""}
              {t.radar.rings[r].name} <strong className="font-semibold">{brief.rings[r - 1]}</strong>
            </span>
          ))}
        </p>
      </div>
      <div className={cell}>
        <p className={label}>{t.radar.briefFastest}</p>
        {brief.fastest ? (
          <p className="text-sm text-foreground">
            <button
              type="button"
              onClick={() => onSelect(brief.fastest!.id)}
              className="text-left font-semibold hover:[color:var(--accent)] hover:underline"
            >
              {radarTitle(brief.fastest.label, brief.fastest.labelZh, lang)}
            </button>
            {lang === "zh" ? "：" : ": "}
            {t.radar.briefFastestBody(formatVelocity(brief.fastest.velocity))}
          </p>
        ) : (
          <p className="text-sm [color:var(--text-muted)]">—</p>
        )}
      </div>
      <div className={cell}>
        <p className={label}>{t.radar.briefGaps}</p>
        <p className="text-sm text-foreground">
          {brief.checked > 0 ? t.radar.briefGapsBody(brief.gaps, brief.checked) : t.radar.briefGapsPending}
        </p>
      </div>
      <div className={cell}>
        <p className={label}>{t.radar.briefMoved}</p>
        {brief.moved.length > 0 ? (
          <p className="text-sm text-foreground">
            {t.radar.briefMovedBody(brief.moved.length)}{" "}
            <button
              type="button"
              onClick={() => onSelect(brief.moved[0].topic.id)}
              className="text-left font-semibold hover:[color:var(--accent)] hover:underline"
            >
              {radarTitle(brief.moved[0].topic.label, brief.moved[0].topic.labelZh, lang)}
            </button>{" "}
            <span className="[color:var(--text-muted)]">
              ({t.radar.rings[brief.moved[0].from].name} → {t.radar.rings[brief.moved[0].topic.ring].name})
            </span>
          </p>
        ) : (
          <p className="text-sm [color:var(--text-muted)]">{t.radar.briefMovedNone}</p>
        )}
      </div>
    </section>
  );
}
