"use client";

import Link from "next/link";
import { SectionTitle } from "@/components/shared/section-title";
import { useI18n } from "@/lib/i18n";
import type { Cluster } from "@/types/cluster";

/** Links to the company / model-family pages this story belongs to. */
export function RelatedTopics({ topics }: { topics: Cluster["topics"] }) {
  const { t } = useI18n();
  if (!topics?.length) return null;
  return (
    <section className="mb-6">
      <SectionTitle>{t.cluster.relatedTopics}</SectionTitle>
      <ul className="flex flex-wrap gap-2">
        {topics.map((topic) => (
          <li key={topic.slug}>
            <Link
              href={`/topics/${topic.slug}`}
              className="inline-block rounded-full border px-3 py-1 text-sm no-underline [border-color:var(--border)] [background:var(--surface)] hover:[border-color:var(--accent)] hover:[color:var(--accent)]"
            >
              {topic.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
