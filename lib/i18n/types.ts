import type { SourceChannel } from "@/types/source";

export type Lang = "en" | "zh";

export type ChannelLabels = Record<SourceChannel, string>;

export type Translations = {
  nav: {
    dailyDigest: string;
    dailyDigestShort: string;
    archive: string;
    searchPlaceholder: string;
    searchAria: string;
    mainAria: string;
  };
  /** Browser tab titles (client-updated; follows language toggle). */
  meta: {
    titleBrand: string;
    titleHome: string;
    titleArchive: string;
    titleStoryFallback: string;
  };
  home: {
    title: string;
    subtitle: string;
    emptyFeaturedTitle: string;
    emptyFeaturedDesc: string;
    topClusters: string;
    viewAllInsights: string;
    categoryBarAria: string;
    personalizedNote: string;
    emptyClustersTitle: string;
    emptyClustersDesc: string;
    goToArchive: string;
  };
  digest: {
    ingestChannelsAria: string;
    sourcesPrefix: string;
    whyItMattersPrefix: string;
    viewStory: string;
    featuredFallback: string;
    formatMoreChannelTypesHidden: (extraTypeCount: number) => string;
    srOnlySources: string;
    srOnlyFreshness: string;
    srOnlyRelevance: string;
    formatChannelBadgeAria: (count: number, channelLabel: string) => string;
  };
  formatSourceCount: (n: number) => string;
  discover: {
    title: string;
    bodyBeforeEmphasis: string;
    bodyEmphasis: string;
    bodyAfterEmphasis: string;
    cta: string;
  };
  archive: {
    title: string;
    description: string;
    searchPlaceholder: string;
    searchLabel: string;
    results: string;
    emptyCatalog: string;
    noResultsTitle: string;
    noResultsMessage: string;
    filterCategory: string;
    allCategories: string;
    loading: string;
    suggestThemesLead: string;
    sortBestMatch: string;
    sortNewest: string;
    loadingMore: string;
    loadMore: (remaining: number) => string;
    resultCountStories: (n: number) => string;
    freshnessMinutes: (m: number) => string;
    freshnessHours: (h: number) => string;
    freshnessDays: (d: number) => string;
    sourceCountLabel: (n: number) => string;
  };
  channels: ChannelLabels;
  cluster: {
    summary: string;
    takeaways: string;
    whyItMatters: string;
    whyItMattersForYou: string;
    audiencePm: string;
    audienceDeveloper: string;
    audienceStudent: string;
    coveredSources: string;
    relatedStories: string;
    /** Shown in Chinese mode above product-structured story body (bilingual assist disclaimer). */
    bilingualAssistTrustNote: string;
    /** Under covered sources: originals stay in source language. */
    sourceOriginalPreservedNote: string;
    headerStoryStatus: string;
    headerSourceCount: string;
    headerScore: string;
    headerFirstSeen: string;
    headerLastUpdated: string;
    emptyCoveredSources: string;
    credibilityPrefix: string;
    breadcrumbAria: string;
    backToDigest: string;
    nextStory: string;
    formatReadTimeMinutes: (minutes: number) => string;
    formatSourceDiversityBroad: (outlets: number, articles: number) => string;
    formatSourceDiversityNarrow: (outlets: number, articles: number) => string;
    allCaughtUpToday: string;
    caughtUpViewArchive: string;
  };
  notFound: {
    clusterTitle: string;
    clusterMessage: string;
    backToDigest: string;
  };
  error: {
    title: string;
    description: string;
    tryAgain: string;
  };
  loading: {
    digest: string;
    detail: string;
  };
  subscribe: {
    heading: string;
    subheading: string;
    placeholder: string;
    cta: string;
    successHeading: string;
    successMessage: string;
    alreadySubscribed: string;
    errorMessage: string;
  };
};
