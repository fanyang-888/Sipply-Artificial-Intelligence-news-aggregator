"use client";

import { SectionTitle } from "@/components/shared/section-title";
import { useI18n } from "@/lib/i18n";
import { LocalDateTime } from "@/components/shared/local-date-time";
import { uiMicroLabel } from "@/lib/ui/classes";
import type { Article } from "@/types/article";

type CoveredSourcesListProps = {
  articles: Article[];
};

/** The original articles behind the story, one row each in a glass panel. */
export function CoveredSourcesList({ articles }: CoveredSourcesListProps) {
  const { t, lang } = useI18n();

  return (
    <section aria-labelledby="story-sources">
      <SectionTitle id="story-sources">{t.cluster.coveredSources}</SectionTitle>
      {articles.length === 0 ? (
        <p className="text-sm [color:var(--text-muted)]">{t.cluster.emptyCoveredSources}</p>
      ) : (
        <>
          <p className="mb-4 text-[13px] leading-relaxed [color:var(--text-muted)]">
            {t.cluster.sourceOriginalPreservedNote}
          </p>
          <ul className="sp-glass sp-rows overflow-hidden">
            {articles.map((art) => (
              <li key={art.id} className="px-6 py-5">
                <p className={uiMicroLabel}>{art.organizationName ?? "—"}</p>
                <a
                  href={art.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 block font-display text-[17px] leading-snug text-foreground no-underline hover:[color:var(--accent)]"
                >
                  {art.title} <span aria-hidden>↗</span>
                </a>
                {art.excerpt ? (
                  <p className="mt-2 text-[14px] leading-relaxed [color:var(--text-soft)]">{art.excerpt}</p>
                ) : null}
                <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] [color:var(--text-muted)]">
                  <LocalDateTime iso={art.publishedAt} lang={lang} />
                  {art.credibilityLabel ? (
                    <span>
                      {t.cluster.credibilityPrefix} {art.credibilityLabel}
                    </span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
