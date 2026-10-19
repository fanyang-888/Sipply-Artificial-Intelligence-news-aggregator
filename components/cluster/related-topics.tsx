"use client";

import Link from "@/components/shared/link";
import { SectionTitle } from "@/components/shared/section-title";
import { useI18n } from "@/lib/i18n";
import type { Cluster } from "@/types/cluster";

/** Links to the company / model-family pages this story belongs to. */
export function RelatedTopics({ topics }: { topics: Cluster["topics"] }) {
  const { t } = useI18n();
  if (!topics?.length) return null;
  return (
    <section aria-labelledby="story-topics">
      <SectionTitle id="story-topics">{t.cluster.relatedTopics}</SectionTitle>
      <ul className="flex flex-wrap gap-2">
        {topics.map((topic) => (
          <li key={topic.slug}>
            <Link href={`/topics/${topic.slug}`} className="sp-chip">
              {topic.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
