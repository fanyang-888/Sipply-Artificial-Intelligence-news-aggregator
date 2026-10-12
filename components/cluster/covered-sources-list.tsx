"use client";

import { SectionTitle } from "@/components/shared/section-title";
import { useI18n } from "@/lib/i18n";
import { LocalDateTime } from "@/components/shared/local-date-time";
import type { Article } from "@/types/article";

type CoveredSourcesListProps = {
  articles: Article[];
};

export function CoveredSourcesList({ articles }: CoveredSourcesListProps) {
  const { t, lang } = useI18n();

  if (articles.length === 0) {
    return (
      <section className="mb-6">
        <SectionTitle>{t.cluster.coveredSources}</SectionTitle>
        <p className="text-sm [color:var(--text-muted)]">{t.cluster.emptyCoveredSources}</p>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <SectionTitle>{t.cluster.coveredSources}</SectionTitle>
      <p className="mb-3 text-xs leading-relaxed [color:var(--text-muted)]">
        {t.cluster.sourceOriginalPreservedNote}
      </p>
      <ul className="space-y-4 text-sm">
        {articles.map((art) => {
          const outlet = art.organizationName ?? "—";

          return (
            <li
              key={art.id}
              className="rounded-md border [border-color:var(--border)] [background:var(--surface2)] p-3"
            >
              <p className="text-xs font-medium uppercase tracking-wide [color:var(--text-muted)]">
                {outlet}
              </p>
              <a
                href={art.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block font-medium text-foreground underline underline-offset-4"
              >
                {art.title}
              </a>
              <p className="mt-2 leading-relaxed [color:var(--text-muted)]">{art.excerpt}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs [color:var(--text-muted)]">
                <span>
                  <LocalDateTime iso={art.publishedAt} lang={lang} />
                </span>
                {art.credibilityLabel ? (
                  <span>
                    {t.cluster.credibilityPrefix} {art.credibilityLabel}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
