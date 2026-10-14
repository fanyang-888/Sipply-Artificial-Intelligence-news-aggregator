/**
 * TypeScript types matching the FastAPI response schemas.
 * These are API wire types — components use the existing domain types
 * (Cluster) after mapping.
 */

import type { LocalizedString } from "@/types/localized";

export type ApiLocalizedStr = { en: string; zh: string | null };

export type ApiAudienceBlocks = {
  pm: ApiLocalizedStr;
  developer: ApiLocalizedStr;
  studentJobSeeker: ApiLocalizedStr;
};

export type ApiArticleInCluster = {
  id: string;
  title: string;
  url: string;
  sourceName: string | null;
  publishedAt: string | null;
  excerpt: string | null;
};

export type ApiCluster = {
  id: string;
  clusterType: string;
  title: ApiLocalizedStr;
  theme: string;
  themes: string[];
  tags: string[];
  topicTag: string | null;
  storyStatus: string;
  clusterScore: number | null;
  freshnessLabel: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  summary: ApiLocalizedStr;
  takeaways: ApiLocalizedStr[];
  whyItMatters: ApiLocalizedStr;
  audience: ApiAudienceBlocks;
  articleIds: string[];
  articles: ApiArticleInCluster[];
  relatedClusterIds: string[];
  articleCount: number;
  sourceCount: number;
};

export type ApiDigest = {
  date: string;
  featured: ApiCluster | null;
  topClusters: ApiCluster[];
  /** True when topClusters were re-ordered for this reader. Absent from older cached payloads. */
  personalized?: boolean;
};

export type ApiSearchResponse = {
  query: string;
  clusters: ApiArchiveClusterRow[];
  total: number;
};

export type ApiArchiveClusterRow = {
  id: string;
  type: "cluster";
  title: string;
  title_zh: string | null;
  summary: string | null;
  summary_zh: string | null;
  tags: string[];
  theme: string;
  topicTag: string | null;
  storyStatus: string;
  clusterScore: number | null;
  lastSeenAt: string | null;
  sourceCount: number;
  sourceNames: string[];
};

// ---------------------------------------------------------------------------
// Trend Radar
// ---------------------------------------------------------------------------

export type RadarSourceKey =
  | "hn"
  | "news"
  | "youtube"
  | "github"
  | "devto"
  | "lobsters"
  | "bluesky"
  | "threads";

/** Display order for source chips and counts. */
export const RADAR_SOURCE_ORDER: RadarSourceKey[] = [
  "hn",
  "news",
  "youtube",
  "bluesky",
  "threads",
  "github",
  "devto",
  "lobsters",
];

export type ApiRadarSignal = {
  id: string;
  title: string;
  /** Simplified Chinese title; null until the translate_signals stage has run. */
  titleZh: string | null;
  url: string;
  discussionUrl: string | null;
  source: RadarSourceKey;
  kind:
    | "hn_story"
    | "hn_ask"
    | "gnews_item"
    | "yt_video"
    | "gh_repo"
    | "devto_post"
    | "lobsters_story"
    | "bsky_post"
    | "threads_post";
  outlet: string | null;
  author: string | null;
  points: number | null;
  numComments: number | null;
  viewCount: number | null;
  likeCount: number | null;
  publishedAt: string | null;
  topicId: string | null;
};

export type ApiRadarScoreComponents = {
  volume: number;
  engagement: number;
  velocity: number;
  recency: number;
  relevance: number;
};

export type ApiRadarCoverage = {
  /** "covered": Sipply has a story on this topic; "gap": checked, no story yet. */
  status: "covered" | "gap";
  clusterId: string | null;
  title: string | null;
  titleZh: string | null;
};

/** 1 = mainstream, 2 = picking up, 3 = weak signal. */
export type RadarRing = 1 | 2 | 3;
export type RadarMomentum = "rising" | "steady" | "cooling";

export type ApiRadarTopic = {
  id: string;
  label: string;
  labelZh: string | null;
  topicTag: string;
  keywords: string[];
  score: number;
  components: ApiRadarScoreComponents;
  /** Daily rate over the last 3 days ÷ daily rate before (1 = flat). */
  velocity: number;
  rising: boolean;
  signalCount: number;
  sourceCounts: Partial<Record<RadarSourceKey, number>>;
  engagement: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  /** Signals per day across the radar window, oldest first. */
  dailyCounts: number[];
  /** Evidence ring: how many signals, on how many platforms. */
  ring: RadarRing;
  momentum: RadarMomentum;
  /** First seen within two days of the radar build. */
  isNew: boolean;
  /** One or two sentences on what happened; null until described (inner rings only). */
  summaryEn: string | null;
  summaryZh: string | null;
  /** Whether Sipply has a story on it; null for weak signals and topics not checked yet. */
  coverage: ApiRadarCoverage | null;
  signals: ApiRadarSignal[];
  questions: ApiRadarSignal[];
};

export type ApiRadarSource = {
  key: RadarSourceKey;
  label: string;
  active: boolean;
  signalCount: number;
  lastFetchedAt: string | null;
};

export type ApiRadar = {
  generatedAt: string | null;
  windowDays: number;
  sources: ApiRadarSource[];
  topics: ApiRadarTopic[];
  questions: ApiRadarSignal[];
};
