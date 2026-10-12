"use client";

import Link from "next/link";
import { StoryBadge } from "@/components/digest/story-badge";
import { IngestChannelRow } from "@/components/digest/ingest-channel-row";
import { ActionRow } from "@/components/shared/action-row";
import { ResultCardFrame } from "@/components/shared/result-card-frame";
import { useI18n } from "@/lib/i18n";
import { ROLES, roleLabel, usePreferredRole } from "@/lib/preferred-role";
import { pickLocalized } from "@/lib/utils/localized-string";
import { uiMetaText, uiTextLinkPrimary } from "@/lib/ui/classes";
import {
  formatClusterSourcesLine,
  formatRelevancePercent,
  getClusterSourceChannelCounts,
  partitionChannelCountsForDisplay,
} from "@/lib/utils/cluster-sources";
import type { Cluster } from "@/types/cluster";

type FeaturedStoryCardProps = {
  cluster: Cluster;
  className?: string;
};

export function FeaturedStoryCard({
  cluster,
  className = "",
}: FeaturedStoryCardProps) {
  const { t, lang } = useI18n();
  const [preferredRole, setRole] = usePreferredRole();
  const role = preferredRole ?? "pm";
  const sourceCount = cluster.articleIds.length;
  const relevance = formatRelevancePercent(cluster.clusterScore);
  const status = cluster.storyStatus ?? t.digest.featuredFallback;
  const sourcesLine = formatClusterSourcesLine(cluster);
  const channelCounts = getClusterSourceChannelCounts(cluster);
  const { visible: visibleChannels, extraTypeCount } =
    partitionChannelCountsForDisplay(channelCounts, 3);

  return (
    <ResultCardFrame
      as="section"
      variant="digestFeatured"
      className={className}
      statusKey={cluster.storyStatus ?? undefined}
      aria-labelledby="featured-story-title"
    >
      {cluster.topicTag ? (
        <span
          className="mb-3 inline-block rounded-sm px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest"
          style={{ background: "var(--sp-chip)", color: "var(--sp-accent-mid)" }}
        >
          {cluster.topicTag}
        </span>
      ) : null}
      <h2
        id="featured-story-title"
        className="text-2xl leading-tight tracking-tight sm:text-[1.65rem]"
        style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, color: "var(--sp-navy)" }}
      >
        {pickLocalized(cluster.title, lang)}
      </h2>
      {cluster.subtitle ? (
        <p className="mt-2 text-sm [color:var(--text-muted)]">
          {pickLocalized(cluster.subtitle, lang)}
        </p>
      ) : null}

      {visibleChannels.length > 0 ? (
        <IngestChannelRow
          visibleChannels={visibleChannels}
          extraTypeCount={extraTypeCount}
          className="mt-3"
        />
      ) : null}

      {sourcesLine ? (
        <p className={`mt-3 ${uiMetaText}`}>
          <span className="font-medium [color:var(--text-muted)]">
            {t.digest.sourcesPrefix}{" "}
          </span>
          {sourcesLine}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <StoryBadge variant="status" statusKey={cluster.storyStatus}>{status}</StoryBadge>
        <StoryBadge variant="metric">
          {t.formatSourceCount(sourceCount)}
        </StoryBadge>
        <StoryBadge variant="metric">{relevance}</StoryBadge>
      </div>

      <p className="mt-5 text-base leading-relaxed text-foreground line-clamp-4 sm:line-clamp-none">
        {pickLocalized(cluster.summary, lang)}
      </p>

      <div className="mt-4">
        <div className="mb-2 flex gap-1">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={role === r}
              onClick={() => setRole(r)}
              className="rounded px-2 py-0.5 text-[11px] font-medium transition-colors"
              style={
                role === r
                  ? { background: "var(--sp-navy)", color: "#fff" }
                  : { background: "var(--surface2)", color: "var(--text-muted)" }
              }
            >
              {roleLabel(r, lang, true)}
            </button>
          ))}
        </div>
        <p className="text-sm font-medium [color:var(--text-muted)] line-clamp-2 sm:line-clamp-none">
          <span className="[color:var(--text-muted)]">{t.digest.whyItMattersPrefix} </span>
          {pickLocalized(cluster.audience[role], lang) || pickLocalized(cluster.whyItMatters, lang)}
        </p>
      </div>

      {/* Mobile: full-width buttons */}
      <div className="mt-6 flex gap-3 sm:hidden">
        <Link
          href={`/cluster/${cluster.id}`}
          className="flex-1 rounded-xl py-2.5 text-center text-[13px] font-medium"
          style={{ background: "var(--sp-navy)", color: "#5dc8f5" }}
        >
          {t.digest.viewStory}
        </Link>
      </div>
      {/* Desktop: inline links */}
      <ActionRow className="mt-6 hidden sm:flex">
        <Link href={`/cluster/${cluster.id}`} className={uiTextLinkPrimary}>
          {t.digest.viewStory}
        </Link>
      </ActionRow>
    </ResultCardFrame>
  );
}
