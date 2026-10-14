"use client";

import { useI18n } from "@/lib/i18n";
import { primarySource } from "@/lib/utils/cluster-sources";
import type { Cluster } from "@/types/cluster";

/**
 * "Original: TechCrunch ↗" — straight to the most relevant source article
 * (the API sorts a story's articles by relevance). The story page stays the
 * main link: it carries the full summary, all sources and the structured data
 * AI assistants read.
 */
export function SourceLink({ cluster, className = "" }: { cluster: Cluster; className?: string }) {
  const { t } = useI18n();
  const source = primarySource(cluster);
  if (!source) return null;
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-[13px] [color:var(--text-muted)] hover:[color:var(--accent)] hover:underline ${className}`}
      title={source.title}
    >
      <span>{t.digest.originalPrefix}</span>
      <span className="font-medium text-foreground">{source.name}</span>
      <span aria-hidden>↗</span>
    </a>
  );
}
