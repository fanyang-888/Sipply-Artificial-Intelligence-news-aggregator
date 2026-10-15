"use client";

import Link from "next/link";
import { SectionTitle } from "@/components/shared/section-title";
import { useI18n } from "@/lib/i18n";
import { pickLocalized } from "@/lib/utils/localized-string";
import type { Cluster } from "@/types/cluster";

type RelatedStoriesProps = {
  clusters: Cluster[];
};

/** Earlier stories on the same subject, one row each. */
export function RelatedStories({ clusters }: RelatedStoriesProps) {
  const { t, lang } = useI18n();

  if (clusters.length === 0) return null;

  return (
    <section aria-labelledby="story-related">
      <SectionTitle id="story-related">{t.cluster.relatedStories}</SectionTitle>
      <ul className="sp-glass sp-rows overflow-hidden">
        {clusters.map((c) => (
          <li key={c.id}>
            <Link
              href={`/cluster/${c.id}`}
              className="sp-row-link flex items-baseline justify-between gap-4 px-6 py-4 font-display text-[17px] leading-snug text-foreground no-underline hover:[color:var(--accent)]"
            >
              <span>{pickLocalized(c.title, lang)}</span>
              <span className="shrink-0 text-[14px] [color:var(--text-muted)]" aria-hidden>
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
