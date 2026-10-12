"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatDigestDate } from "@/lib/utils/format-date";
import { useI18n } from "@/lib/i18n";
import { pickLocalized } from "@/lib/utils/localized-string";
import { uiTextLinkPrimary } from "@/lib/ui/classes";
import { FeaturedStoryCard } from "@/components/digest/featured-story-card";
import { ClusterCard } from "@/components/digest/cluster-card";
import { DiscoverArchiveCta } from "@/components/digest/quick-archive-entry";
import { AIBasicCard } from "@/components/digest/ai-basic-card";
import { SubscribeBar } from "@/components/shared/subscribe-bar";
import { SippyHero } from "@/components/layout/sipply-hero";
import { SectionBlock } from "@/components/shared/section-block";
import { CategoryBar, type CategoryKey } from "@/components/shared/category-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingState } from "@/components/shared/loading-state";
import { ErrorState } from "@/components/shared/error-state";
import { MobileClusterRow } from "@/components/digest/mobile-cluster-row";
import { RoleSelectorBanner } from "@/components/digest/role-selector-banner";
import { TopicFilter } from "@/components/shared/topic-filter";
import { fetchSearch, fetchTodayDigest } from "@/lib/api";
import { apiClusterToCluster, archiveRowToCluster } from "@/lib/api/mappers";
import { getDeviceId } from "@/lib/api/track";
import { topicTagsForGroup, type TopicGroupKey } from "@/lib/constants/topic-groups";
import { readPreferredRole, usePreferredRole, type Role } from "@/lib/preferred-role";
import { archiveTopicHref } from "@/lib/utils/archive-url";
import { useMounted } from "@/lib/use-mounted";
import type { ApiDigest } from "@/lib/api/types";
import type { Cluster } from "@/types/cluster";

const CATEGORY_PAGE_SIZE = 12;

type HomeT = ReturnType<typeof useI18n>["t"];

function freshnessLabelFrom(lastSeenAt: string | null, t: HomeT): string | undefined {
  if (!lastSeenAt) return undefined;
  const diff = (Date.now() - new Date(lastSeenAt).getTime()) / 60000;
  if (diff < 60) return t.archive.freshnessMinutes(Math.round(diff));
  if (diff < 1440) return t.archive.freshnessHours(Math.round(diff / 60));
  return t.archive.freshnessDays(Math.round(diff / 1440));
}

type HomePageClientProps = {
  /** Server-rendered global digest (so crawlers see the stories); null if the API was unreachable. */
  initialDigest: ApiDigest | null;
};

export function HomePageClient({ initialDigest }: HomePageClientProps) {
  const { t, lang } = useI18n();
  const [role] = usePreferredRole();
  // The reader's local date only after mount: the server's date/time zone may differ
  const mounted = useMounted();
  const dateLabel = mounted ? formatDigestDate(new Date(), lang) : "";

  const [featured, setFeatured] = useState<Cluster | null>(() =>
    initialDigest?.featured ? apiClusterToCluster(initialDigest.featured) : null,
  );
  const [topClusters, setTopClusters] = useState<Cluster[]>(() =>
    initialDigest ? initialDigest.topClusters.map(apiClusterToCluster) : [],
  );
  const [loading, setLoading] = useState(initialDigest === null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [personalized, setPersonalized] = useState(false);
  // Role the current list was ranked for; undefined until the first load finishes
  const rankedForRoleRef = useRef<Role | null | undefined>(undefined);

  const [activeCategory, setActiveCategory] = useState<CategoryKey>("trending");
  const [categoryCache, setCategoryCache] = useState<Partial<Record<TopicGroupKey, Cluster[]>>>({});
  const [categoryLoading, setCategoryLoading] = useState(false);

  // Freshness labels are baked per-language — refetch category lists on toggle
  useEffect(() => {
    setCategoryCache({});
  }, [lang]);

  // Fetch a category's recent stories on first visit to that tab
  useEffect(() => {
    if (activeCategory === "trending" || categoryCache[activeCategory]) return;
    let cancelled = false;
    setCategoryLoading(true);
    fetchSearch({
      topicTags: topicTagsForGroup(activeCategory),
      limit: CATEGORY_PAGE_SIZE,
      sortBy: "date",
    })
      .then((res) => {
        if (cancelled) return;
        const clusters = res.clusters.map((row) =>
          archiveRowToCluster(row, freshnessLabelFrom(row.lastSeenAt, t)),
        );
        setCategoryCache((prev) => ({ ...prev, [activeCategory]: clusters }));
      })
      .catch(() => {
        if (!cancelled) setCategoryCache((prev) => ({ ...prev, [activeCategory]: [] }));
      })
      .finally(() => {
        if (!cancelled) setCategoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeCategory, categoryCache, t]);

  const categoryClusters =
    activeCategory === "trending" ? null : categoryCache[activeCategory] ?? null;

  // Fetch this reader's order (history + role). With a server-rendered digest
  // already on screen this re-ranks in place; without one it is the first load.
  useEffect(() => {
    let cancelled = false;
    const hasInitial = initialDigest !== null;
    // Read the role directly: the role hook still reports null during hydration
    const role = readPreferredRole();

    async function load() {
      try {
        if (!hasInitial) {
          setLoading(true);
          setError(null);
        }
        const digest = await fetchTodayDigest({ deviceId: getDeviceId(), role });

        if (cancelled) return;

        setFeatured(digest.featured ? apiClusterToCluster(digest.featured) : null);
        setTopClusters(digest.topClusters.map(apiClusterToCluster));
        setPersonalized(Boolean(digest.personalized));
        rankedForRoleRef.current = role;
      } catch (e) {
        if (cancelled) return;
        if (hasInitial) {
          // Keep the global order; a later role change can still re-rank
          rankedForRoleRef.current = null;
        } else {
          setError((e as Error).message ?? "Failed to load digest");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [initialDigest]);

  // Re-rank today's list in place (no loading screen) when the reader switches role
  useEffect(() => {
    if (rankedForRoleRef.current === undefined || rankedForRoleRef.current === role) return;
    let cancelled = false;
    fetchTodayDigest({ deviceId: getDeviceId(), role })
      .then((digest) => {
        if (cancelled) return;
        rankedForRoleRef.current = role;
        setTopClusters(digest.topClusters.map(apiClusterToCluster));
        setPersonalized(Boolean(digest.personalized));
      })
      .catch(() => {
        // keep the current order
      });
    return () => { cancelled = true; };
  }, [role]);

  const personalizedNote =
    activeCategory === "trending" && personalized ? (
      <p className="mb-3 text-xs [color:var(--text-muted)]">
        <span className="[color:var(--accent)]">✦</span> {t.home.personalizedNote}
      </p>
    ) : null;

  const topicOptions = Array.from(
    new Set(
      topClusters
        .map((c) => c.topicTag)
        .filter((tag): tag is string => Boolean(tag && tag.trim())),
    ),
  );

  const filteredClusters =
    selectedTopics.length === 0
      ? topClusters
      : topClusters.filter(
          (c) => c.topicTag != null && selectedTopics.includes(c.topicTag),
        );

  if (loading) {
    return <LoadingState layout="digest" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load today's digest"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div>
      <SippyHero dateLabel={dateLabel} />

      {/* ── Mobile layout (< sm) ── */}
      <div className="sm:hidden">
        <RoleSelectorBanner />
        {/* Featured story */}
        {featured ? (
          <div
            className="mb-4 rounded-xl border border-l-4 p-4"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              borderLeftColor: "var(--accent)",
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                style={{
                  border: "1px solid var(--accent)",
                  color: "var(--accent)",
                  background: "var(--accent-faint)",
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                {featured.storyStatus ?? "new"}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {featured.articleIds.length} source{featured.articleIds.length !== 1 ? "s" : ""}
              </span>
            </div>
            <h2
              className="mb-2 leading-snug font-bold"
              style={{ fontSize: 17, color: "var(--text)", letterSpacing: "-0.2px" }}
            >
              {pickLocalized(featured.title, lang)}
            </h2>
            <p
              className="mb-3 line-clamp-3 leading-relaxed"
              style={{ fontSize: 13, color: "var(--text-muted)" }}
            >
              {pickLocalized(featured.summary, lang)}
            </p>
            {role && pickLocalized(featured.audience[role], lang) ? (
              <p className="mb-3 line-clamp-3 leading-relaxed" style={{ fontSize: 13, color: "var(--text)" }}>
                <span style={{ color: "var(--accent)", fontWeight: 500 }}>
                  {t.cluster.whyItMattersForYou}
                  {lang === "zh" ? "：" : ": "}
                </span>
                {pickLocalized(featured.audience[role], lang)}
              </p>
            ) : null}
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5 flex-wrap">
                {(featured.tags ?? []).slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="rounded px-2 py-0.5"
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      background: "var(--surface2)",
                      border: "1px solid var(--border)",
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <Link
                href={`/cluster/${featured.id}`}
                className="font-semibold"
                style={{ fontSize: 12, color: "var(--accent)" }}
              >
                {t.digest.viewStory} →
              </Link>
            </div>
          </div>
        ) : null}

        {/* Category bar + more stories */}
        {topClusters.length > 1 ? (
          <>
            <CategoryBar
              active={activeCategory}
              onSelect={setActiveCategory}
              trailing={
                <Link
                  href={activeCategory === "trending" ? "/archive" : archiveTopicHref(activeCategory)}
                  style={{ color: "var(--accent)", fontSize: 10, textDecoration: "none", whiteSpace: "nowrap" }}
                >
                  {t.home.viewAllInsights} →
                </Link>
              }
            />
            {activeCategory === "trending" ? (
              <>
                {personalizedNote}
                <TopicFilter tags={topicOptions} onChange={setSelectedTopics} />
                <div>
                  {filteredClusters.filter((c) => c.id !== featured?.id).map((c) => (
                    <MobileClusterRow key={c.id} cluster={c} />
                  ))}
                </div>
              </>
            ) : categoryLoading ? (
              <div className="space-y-3 py-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg [background:var(--surface2)]" />
                ))}
              </div>
            ) : categoryClusters && categoryClusters.length > 0 ? (
              <div>
                {categoryClusters.map((c) => (
                  <MobileClusterRow key={c.id} cluster={c} />
                ))}
              </div>
            ) : (
              <EmptyState title={t.archive.noResultsTitle} />
            )}
          </>
        ) : null}

        <div className="mt-6">
          <SubscribeBar />
        </div>
      </div>

      {/* ── Desktop layout (sm+) ── */}
      <div className="hidden sm:block">
        <RoleSelectorBanner />
        <div className="mb-10">
          {featured ? (
            <FeaturedStoryCard cluster={featured} />
          ) : (
            <EmptyState
              title={t.home.emptyFeaturedTitle}
              description={t.home.emptyFeaturedDesc}
            />
          )}
        </div>

        <SectionBlock>
          <CategoryBar active={activeCategory} onSelect={setActiveCategory} />
          {activeCategory === "trending" ? (
            <>
              {personalizedNote}
              <TopicFilter tags={topicOptions} onChange={setSelectedTopics} />
              {filteredClusters.length > 0 ? (
                <>
                  <ul className="space-y-4">
                    {filteredClusters.map((c) => (
                      <ClusterCard key={c.id} cluster={c} />
                    ))}
                  </ul>
                  <div className="mt-6">
                    <Link href="/archive" className={uiTextLinkPrimary}>
                      {t.home.viewAllInsights}
                    </Link>
                  </div>
                </>
              ) : (
                <EmptyState
                  title={t.home.emptyClustersTitle}
                  description={t.home.emptyClustersDesc}
                  action={
                    <Link href="/archive" className={uiTextLinkPrimary}>
                      {t.home.goToArchive}
                    </Link>
                  }
                />
              )}
            </>
          ) : categoryLoading ? (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl [background:var(--surface2)]" />
              ))}
            </div>
          ) : categoryClusters && categoryClusters.length > 0 ? (
            <>
              <ul className="space-y-4">
                {categoryClusters.map((c) => (
                  <ClusterCard key={c.id} cluster={c} />
                ))}
              </ul>
              <div className="mt-6">
                <Link href={archiveTopicHref(activeCategory)} className={uiTextLinkPrimary}>
                  {t.home.viewAllInsights}
                </Link>
              </div>
            </>
          ) : (
            <EmptyState
              title={t.archive.noResultsTitle}
              action={
                <Link href="/archive" className={uiTextLinkPrimary}>
                  {t.home.goToArchive}
                </Link>
              }
            />
          )}
        </SectionBlock>

        <SectionBlock>
          <AIBasicCard />
        </SectionBlock>

        <SectionBlock>
          <SubscribeBar />
        </SectionBlock>

        <DiscoverArchiveCta />
      </div>{/* end hidden sm:block */}
    </div>
  );
}
