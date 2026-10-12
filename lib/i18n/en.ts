import type { Translations } from "./types";

export const en: Translations = {
  nav: {
    dailyDigest: "Daily Digest",
    dailyDigestShort: "Digest",
    archive: "Archive",
    searchPlaceholder: "Search archive…",
    searchAria: "Site search",
    mainAria: "Main",
  },
  meta: {
    titleBrand: "Sipply",
    titleHome: "Daily Digest",
    titleArchive: "Archive",
    titleStoryFallback: "Story",
  },
  home: {
    title: "Daily AI Digest",
    subtitle:
      "Top ranked AI updates with cross-source synthesis and practical context",
    emptyFeaturedTitle: "No featured story",
    emptyFeaturedDesc: "Today's featured story will appear here once the pipeline has run.",
    topClusters: "Top Story Clusters",
    viewAllInsights: "View all daily insights",
    categoryBarAria: "Browse by category",
    personalizedNote: "Reordered to match what you read and your role",
    emptyClustersTitle: "Waiting for more data",
    emptyClustersDesc:
      "We need a bit more signal to synthesize today's clusters. Check back soon or browse the archive.",
    goToArchive: "Go to Archive",
  },
  formatSourceCount: (n) => (n === 1 ? `${n} source` : `${n} sources`),
  digest: {
    ingestChannelsAria: "Ingest channels",
    sourcesPrefix: "Sources:",
    whyItMattersPrefix: "Why it matters:",
    viewStory: "View Story",
    featuredFallback: "Featured",
    formatMoreChannelTypesHidden: (n) =>
      `${n} more ingest channel types not shown`,
    srOnlySources: "Sources",
    srOnlyFreshness: "Freshness",
    srOnlyRelevance: "Relevance",
    formatChannelBadgeAria: (c, label) =>
      `${c === 1 ? "1 source" : `${c} sources`} from ${label}`,
  },
  discover: {
    title: "Discover in the Archive",
    bodyBeforeEmphasis:
      "Browse the full catalog of synthesized clusters and sources. Use the ",
    bodyEmphasis: "search field in the header",
    bodyAfterEmphasis: " to find companies, models, themes, or keywords.",
    cta: "Go to Archive",
  },
  archive: {
    title: "Archive",
    description:
      "Search every story Sipply has synthesized — filter by category or keyword.",
    searchPlaceholder: "Keyword in title or summary…",
    searchLabel: "Search",
    results: "Results",
    emptyCatalog: "No stories in catalog",
    noResultsTitle: "No results",
    noResultsMessage:
      "Try a different keyword or category.",
    filterCategory: "Category",
    allCategories: "All categories",
    loading: "Loading archive…",
    suggestThemesLead: "Try browsing a category:",
    sortBestMatch: "Best match",
    sortNewest: "Newest",
    loadingMore: "Loading…",
    loadMore: (remaining) => `Load more (${remaining} remaining)`,
    resultCountStories: (n) => `${n.toLocaleString()} ${n === 1 ? "story" : "stories"}`,
    freshnessMinutes: (m) => `Updated ${m}m ago`,
    freshnessHours: (h) => `Updated ${h}h ago`,
    freshnessDays: (d) => `Updated ${d}d ago`,
    sourceCountLabel: (n) => n > 0 ? `${n} ${n === 1 ? "source" : "sources"}` : "—",
  },
  channels: {
    email: "Email",
    chat: "Chat",
    web: "Web",
    feed: "Feed",
  },
  cluster: {
    summary: "Summary",
    takeaways: "Takeaways",
    whyItMatters: "Why it matters",
    whyItMattersForYou: "Why it matters for you",
    audiencePm: "PMs",
    audienceDeveloper: "Developers",
    audienceStudent: "Students & job seekers",
    coveredSources: "Covered sources",
    relatedStories: "Related stories",
    bilingualAssistTrustNote:
      "Chinese text is provided as reading assistance. Refer to the original language for exact wording.",
    sourceOriginalPreservedNote:
      "Source titles and excerpts stay in their original language for accuracy and traceability.",
    headerStoryStatus: "Status",
    headerSourceCount: "Coverage",
    headerScore: "Cluster score",
    headerFirstSeen: "First seen",
    headerLastUpdated: "Last updated",
    emptyCoveredSources: "No linked articles in the mock catalog for this cluster.",
    credibilityPrefix: "Credibility:",
    breadcrumbAria: "Breadcrumb",
    backToDigest: "Back to Daily Digest",
    nextStory: "Next story",
    formatReadTimeMinutes: (minutes) =>
      `${minutes} min read`,
    formatSourceDiversityBroad: (outlets, articles) =>
      `${outlets} outlet${outlets === 1 ? "" : "s"} · ${articles} article${articles === 1 ? "" : "s"} — broad cross-source check`,
    formatSourceDiversityNarrow: (outlets, articles) =>
      `${outlets} outlet${outlets === 1 ? "" : "s"} · ${articles} article${articles === 1 ? "" : "s"} — narrow sourcing (verify claims carefully)`,
    allCaughtUpToday: "You're all caught up for today.",
    caughtUpViewArchive: "View Archive",
  },
  notFound: {
    clusterTitle: "Story cluster not found",
    clusterMessage: "That cluster id is not in the local mock catalog.",
    backToDigest: "Back to Daily Digest",
  },
  error: {
    title: "Something went wrong",
    description: "Try again, or return to the digest if the problem persists.",
    tryAgain: "Try again",
  },
  loading: {
    digest: "Loading digest…",
    detail: "Loading…",
  },
  subscribe: {
    heading: "Stay in the loop",
    subheading: "Get a brief when the digest updates. No spam — just signal.",
    placeholder: "your@email.com",
    cta: "Subscribe",
    successHeading: "You're in.",
    successMessage: "We'll ping you when the next digest drops.",
    alreadySubscribed: "You're already subscribed.",
    errorMessage: "Something went wrong. Try again in a moment.",
  },
};
