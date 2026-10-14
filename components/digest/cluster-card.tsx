"use client";

import Link from "next/link";
import { StoryBadge } from "@/components/digest/story-badge";
import { IngestChannelRow } from "@/components/digest/ingest-channel-row";
import { SourceLink } from "@/components/digest/source-link";
import { MetaRow } from "@/components/shared/meta-row";
import { ResultCardFrame } from "@/components/shared/result-card-frame";
import { useI18n } from "@/lib/i18n";
import { usePreferredRole } from "@/lib/preferred-role";
import { pickLocalized } from "@/lib/utils/localized-string";
import { uiMetaText, uiTextLinkPrimary } from "@/lib/ui/classes";
import {
  formatClusterSourcesLine,
  formatRelevancePercent,
  getClusterSourceChannelCounts,
  partitionChannelCountsForDisplay,
} from "@/lib/utils/cluster-sources";
import type { Cluster } from "@/types/cluster";

type ClusterCardProps = {
  cluster: Cluster;
};

export function ClusterCard({ cluster }: ClusterCardProps) {
  const { t, lang } = useI18n();
  const [role] = usePreferredRole();
  // Empty for clusters built from archive rows (category tabs), which carry no audience copy
  const roleWhy = role ? pickLocalized(cluster.audience[role], lang) : "";
  const tags = cluster.tags?.length ? cluster.tags : [cluster.theme];
  const sourceCount = cluster.articleIds.length;
  const status = cluster.storyStatus ?? t.digest.featuredFallback;
  const relevance = formatRelevancePercent(cluster.clusterScore);
  const freshness = cluster.freshnessLabel ?? "—";
  const sourcesLine = formatClusterSourcesLine(cluster);
  const channelCounts = getClusterSourceChannelCounts(cluster);
  const { visible: visibleChannels, extraTypeCount } =
    partitionChannelCountsForDisplay(channelCounts, 3);

  return (
    <ResultCardFrame as="li" variant="digest" statusKey={cluster.storyStatus ?? undefined}>
      {/* Water-drop icon + tag row */}
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--sp-chip)" }}
        >
          <svg viewBox="0 0 14 14" fill="none" width="14" height="14">
            <path d="M7 2C7 2 3 6 3 9a4 4 0 008 0c0-3-4-7-4-7z" fill="var(--sp-accent-mid)" />
          </svg>
        </span>
        <span
          className="text-[10px] uppercase tracking-[0.12em]"
          style={{ color: "var(--sp-accent-dim)" }}
        >
          {cluster.topicTag ?? tags[0] ?? cluster.theme}
        </span>
      </div>

      <h3
        className="text-base leading-snug"
        style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, color: "var(--sp-navy)" }}
      >
        {pickLocalized(cluster.title, lang)}
      </h3>

      {visibleChannels.length > 0 ? (
        <IngestChannelRow
          visibleChannels={visibleChannels}
          extraTypeCount={extraTypeCount}
          className="mt-2"
        />
      ) : null}

      <p className="mt-2 line-clamp-2 text-sm leading-relaxed [color:var(--text-muted)] sm:line-clamp-3">
        {pickLocalized(cluster.summary, lang)}
      </p>

      {roleWhy ? (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-foreground">
          <span className="font-medium [color:var(--accent)]">
            {t.cluster.whyItMattersForYou}
            {lang === "zh" ? "：" : ": "}
          </span>
          {roleWhy}
        </p>
      ) : null}

      {sourcesLine ? (
        <p className={`mt-2 ${uiMetaText}`}>
          <span className="font-medium [color:var(--text-muted)]">
            {t.digest.sourcesPrefix}{" "}
          </span>
          {sourcesLine}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <StoryBadge variant="status" statusKey={cluster.storyStatus}>
          {status}
        </StoryBadge>
        {tags.map((tag) => (
          <StoryBadge key={tag} variant="tag">
            {tag}
          </StoryBadge>
        ))}
      </div>

      <MetaRow
        dense
        className="mt-3"
        items={[
          {
            label: t.digest.srOnlySources,
            value: t.formatSourceCount(sourceCount),
            labelSrOnly: true,
          },
          {
            label: t.digest.srOnlyFreshness,
            value: freshness,
            labelSrOnly: true,
          },
          {
            label: t.digest.srOnlyRelevance,
            value: relevance,
            labelSrOnly: true,
          },
        ]}
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <Link href={`/cluster/${cluster.id}`} className={uiTextLinkPrimary}>
          {t.digest.viewStory}
        </Link>
        <SourceLink cluster={cluster} />
      </div>

    </ResultCardFrame>
  );
}
