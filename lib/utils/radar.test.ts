import { describe, expect, it } from "vitest";
import type { ApiRadarSignal, ApiRadarTopic } from "@/lib/api/types";
import { en } from "@/lib/i18n";
import {
  DEFAULT_RADAR_FILTERS,
  ageParts,
  filterRadarTopics,
  formatCompact,
  engagementLabel,
  formatVelocity,
  radarTitle,
  sparklineHeights,
  topicGroupForTag,
} from "@/lib/utils/radar";

function topic(overrides: Partial<ApiRadarTopic>): ApiRadarTopic {
  return {
    id: "t",
    label: "label",
    labelZh: null,
    topicTag: "Other",
    keywords: [],
    score: 50,
    components: { volume: 0, engagement: 0, velocity: 0, recency: 0, relevance: 0 },
    velocity: 1,
    rising: false,
    signalCount: 1,
    sourceCounts: { hn: 1 },
    engagement: 0,
    firstSeenAt: null,
    lastSeenAt: null,
    dailyCounts: [],
    signals: [],
    questions: [],
    ...overrides,
  };
}

describe("topicGroupForTag", () => {
  it("maps backend tags onto the shared category groups", () => {
    expect(topicGroupForTag("Model Release")).toBe("models");
    expect(topicGroupForTag("Benchmark")).toBe("research");
    expect(topicGroupForTag("Safety")).toBe("policy");
    expect(topicGroupForTag("Other")).toBeNull();
  });
});

describe("filterRadarTopics", () => {
  const topics = [
    topic({ id: "a", topicTag: "Model Release", sourceCounts: { hn: 2, news: 1 }, rising: true }),
    topic({ id: "b", topicTag: "Funding", sourceCounts: { news: 3 } }),
    topic({ id: "c", topicTag: "Other", sourceCounts: { hn: 1 } }),
  ];
  const ids = (ts: ApiRadarTopic[]) => ts.map((t) => t.id);

  it("passes everything through with default filters", () => {
    expect(ids(filterRadarTopics(topics, DEFAULT_RADAR_FILTERS))).toEqual(["a", "b", "c"]);
  });

  it("combines category, source and rising filters", () => {
    expect(ids(filterRadarTopics(topics, { ...DEFAULT_RADAR_FILTERS, group: "funding" }))).toEqual(["b"]);
    expect(ids(filterRadarTopics(topics, { ...DEFAULT_RADAR_FILTERS, source: "hn" }))).toEqual(["a", "c"]);
    expect(ids(filterRadarTopics(topics, { ...DEFAULT_RADAR_FILTERS, source: "news", risingOnly: true }))).toEqual(["a"]);
    expect(ids(filterRadarTopics(topics, { ...DEFAULT_RADAR_FILTERS, source: "youtube" }))).toEqual([]);
  });
});

describe("engagementLabel", () => {
  const sig = (o: Partial<ApiRadarSignal>): ApiRadarSignal => ({
    id: "s", title: "t", titleZh: null, url: "u", discussionUrl: null, source: "hn", kind: "hn_story",
    outlet: null, author: null, points: null, numComments: null, viewCount: null, likeCount: null,
    publishedAt: null, topicId: null, ...o,
  });

  it("uses each platform's own unit", () => {
    expect(engagementLabel(sig({ source: "hn", points: 120, numComments: 45 }), en.radar)).toBe("120 pts · 45 comments");
    expect(engagementLabel(sig({ source: "github", kind: "gh_repo", points: 3177 }), en.radar)).toBe("★ 3.2k");
    expect(engagementLabel(sig({ source: "bluesky", kind: "bsky_post", likeCount: 40, numComments: 7 }), en.radar)).toBe("♥ 40 · 7 replies");
    expect(engagementLabel(sig({ source: "devto", kind: "devto_post", points: 50, numComments: 5 }), en.radar)).toBe("50 reactions · 5 comments");
    expect(engagementLabel(sig({ source: "youtube", kind: "yt_video", viewCount: 25300 }), en.radar)).toBe("25k views");
  });

  it("shows nothing when the platform reports no engagement", () => {
    expect(engagementLabel(sig({ source: "threads", kind: "threads_post" }), en.radar)).toBeNull();
    expect(engagementLabel(sig({ source: "news", kind: "gnews_item" }), en.radar)).toBeNull();
  });
});

describe("radarTitle", () => {
  it("uses the Chinese title only in zh mode, falling back to the original", () => {
    expect(radarTitle("Claude Haiku 5.5", "Claude Haiku 5.5 发布", "zh")).toBe("Claude Haiku 5.5 发布");
    expect(radarTitle("Claude Haiku 5.5", "Claude Haiku 5.5 发布", "en")).toBe("Claude Haiku 5.5");
    expect(radarTitle("Untranslated", null, "zh")).toBe("Untranslated");
  });
});

describe("formatting", () => {
  it("formats velocity", () => {
    expect(formatVelocity(3.94)).toBe("3.9×");
    expect(formatVelocity(11.67)).toBe("12×");
  });

  it("formats compact counts", () => {
    expect(formatCompact(950)).toBe("950");
    expect(formatCompact(1000)).toBe("1k");
    expect(formatCompact(1234)).toBe("1.2k");
    expect(formatCompact(25300)).toBe("25k");
  });

  it("scales sparkline bars to the busiest day", () => {
    expect(sparklineHeights([0, 1, 4, 2], 20)).toEqual([1, 5, 20, 10]);
    expect(sparklineHeights([0, 0], 20)).toEqual([1, 1]);
  });

  it("splits ages into minutes, hours, then days", () => {
    const now = new Date("2026-10-12T12:00:00Z");
    expect(ageParts("2026-10-12T11:30:00Z", now)).toEqual({ unit: "m", value: 30 });
    expect(ageParts("2026-10-11T12:00:00Z", now)).toEqual({ unit: "h", value: 24 });
    expect(ageParts("2026-10-09T12:00:00Z", now)).toEqual({ unit: "d", value: 3 });
    expect(ageParts(null, now)).toBeNull();
  });
});
