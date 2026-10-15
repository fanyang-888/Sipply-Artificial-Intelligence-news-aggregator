import type { ApiRadarSignal } from "@/lib/api/types";
import type { LocalizedString } from "@/types/localized";
import type { Article } from "@/types/article";

export type AudienceBlocks = {
  pm: LocalizedString;
  developer: LocalizedString;
  studentJobSeeker: LocalizedString;
};

export type Cluster = {
  id: string;
  /** Display label for cluster detail header (often mirrors theme). */
  clusterType: string;
  title: LocalizedString;
  subtitle?: LocalizedString;
  description?: LocalizedString;
  /** Archive / filter theme key */
  theme: string;
  themes?: string[];
  tags?: string[];
  topicTag?: string;
  storyStatus?: string;
  clusterScore?: number;
  freshnessLabel?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  summary: LocalizedString;
  takeaways: LocalizedString[];
  whyItMatters: LocalizedString;
  audience: AudienceBlocks;
  articleIds: string[];
  articles?: Article[];
  relatedClusterIds: string[];
  /** Company / model-family pages this story belongs to. */
  topics?: { slug: string; name: string }[];
  /** Community posts about this story (Hacker News, Bluesky…), from the Trend Radar. */
  discussions?: ApiRadarSignal[];
};
