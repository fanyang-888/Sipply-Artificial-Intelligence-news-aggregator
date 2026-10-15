"use client";

import { useState } from "react";
import type { ApiRadarBrief } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";
import { briefMarkdown } from "@/lib/utils/radar";

/**
 * On a "not on Sipply" topic's card: what an editor needs to cover it. Every
 * fact links to the post it comes from; "Copy as Markdown" puts the whole
 * brief on the clipboard for a doc or CMS.
 */
export function RadarContentBrief({ brief }: { brief: ApiRadarBrief }) {
  const { t, lang } = useI18n();
  const [copied, setCopied] = useState(false);
  const zh = lang === "zh";
  const angle = zh ? brief.angleZh : brief.angleEn;
  const h4 = "mt-3 text-[12.5px] font-semibold [color:var(--text-muted)]";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(briefMarkdown(brief, lang, t.radar));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked (permissions, insecure context): nothing to do
    }
  };

  return (
    <section className="border-l-2 pl-3 [border-color:var(--amber)]" aria-label={t.radar.briefTitle}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-foreground">{t.radar.briefTitle}</h3>
        <button type="button" onClick={copy} className="shrink-0 text-[12px] [color:var(--accent)] hover:underline" aria-live="polite">
          {copied ? t.radar.briefCopied : t.radar.briefCopy}
        </button>
      </div>
      <p className="mt-0.5 text-[11.5px] [color:var(--text-muted)]">{t.radar.briefNote}</p>

      <p className="mt-2 text-[15px] font-semibold leading-snug text-foreground">{zh ? brief.headlineZh : brief.headlineEn}</p>
      {angle ? <p className="mt-1 text-[13.5px] leading-relaxed text-foreground">{angle}</p> : null}

      {brief.questions.length > 0 ? (
        <>
          <h4 className={h4}>{t.radar.briefQuestions}</h4>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13.5px] text-foreground">
            {brief.questions.map((q) => (
              <li key={q.en}>{zh ? q.zh : q.en}</li>
            ))}
          </ul>
        </>
      ) : null}

      <h4 className={h4}>{t.radar.briefFacts}</h4>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-[13.5px] leading-snug text-foreground">
        {brief.facts.map((f) => (
          <li key={f.en}>
            {zh ? f.zh : f.en}{" "}
            <a
              href={f.source.url}
              target="_blank"
              rel="noopener noreferrer"
              title={f.source.title}
              className="whitespace-nowrap text-[11.5px] [color:var(--text-muted)] hover:[color:var(--accent)]"
            >
              {t.radar.sourceShort[f.source.platform] ?? f.source.platform} ↗
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
