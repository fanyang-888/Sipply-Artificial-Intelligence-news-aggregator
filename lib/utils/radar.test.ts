import { describe, expect, it } from "vitest";
import type { ApiRadarSignal, ApiRadarTopic } from "@/lib/api/types";
import { en } from "@/lib/i18n";
import {
  DEFAULT_RADAR_FILTERS,
  ageParts,
  filterRadarTopics,
  hasActiveFilter,
  radarBrief,
  radarSectorForTag,
  ringMove,
  topicPlatforms,
  withRadarDefaults,
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
    trailSignals: [],
    trailRings: [],
    ring: 3,
    momentum: "steady",
    isNew: false,
    summaryEn: null,
    summaryZh: null,
    coverage: null,
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
    topic({ id: "a", topicTag: "Model Release", sourceCounts: { hn: 2, news: 1 }, rising: true, momentum: "rising" }),
    topic({ id: "b", topicTag: "Funding", sourceCounts: { news: 3 } }),
    topic({ id: "c", topicTag: "Other", sourceCounts: { hn: 1 } }),
  ];
  const ids = (ts: ApiRadarTopic[]) => ts.map((t) => t.id);

  it("passes everything through with default filters", () => {
    expect(ids(filterRadarTopics(topics, DEFAULT_RADAR_FILTERS))).toEqual(["a", "b", "c"]);
  });

  it("combines category, source and momentum filters", () => {
    expect(ids(filterRadarTopics(topics, { ...DEFAULT_RADAR_FILTERS, group: "funding" }))).toEqual(["b"]);
    expect(ids(filterRadarTopics(topics, { ...DEFAULT_RADAR_FILTERS, group: "other" }))).toEqual(["c"]);
    expect(ids(filterRadarTopics(topics, { ...DEFAULT_RADAR_FILTERS, source: "hn" }))).toEqual(["a", "c"]);
    expect(ids(filterRadarTopics(topics, { ...DEFAULT_RADAR_FILTERS, source: "news", momentum: "rising" }))).toEqual(["a"]);
    expect(ids(filterRadarTopics(topics, { ...DEFAULT_RADAR_FILTERS, source: "youtube" }))).toEqual([]);
  });

  it("knows when any filter is on", () => {
    expect(hasActiveFilter(DEFAULT_RADAR_FILTERS)).toBe(false);
    expect(hasActiveFilter({ ...DEFAULT_RADAR_FILTERS, momentum: "cooling" })).toBe(true);
  });
});

describe("radarSectorForTag / topicPlatforms", () => {
  it("puts untagged topics in the 'other' sector and lists platforms in display order", () => {
    expect(radarSectorForTag("Infrastructure")).toBe("opensource");
    expect(radarSectorForTag("Other")).toBe("other");
    expect(radarSectorForTag("Something new")).toBe("other");
    expect(topicPlatforms(topic({ sourceCounts: { news: 3, youtube: 0, hn: 1 } }))).toEqual(["hn", "news"]);
  });
});

describe("radarBrief", () => {
  it("counts rings, finds the fastest riser and Sipply's gaps", () => {
    const gap = { status: "gap", clusterId: null, title: null, titleZh: null } as const;
    const covered = { status: "covered", clusterId: "c1", title: "Story", titleZh: null } as const;
    const brief = radarBrief([
      topic({ id: "a", ring: 1, momentum: "rising", velocity: 4.9, coverage: covered, isNew: true }),
      topic({ id: "b", ring: 1, momentum: "rising", velocity: 49, coverage: gap }),
      topic({ id: "c", ring: 2, momentum: "steady", velocity: 60, coverage: gap }),
      topic({ id: "d", ring: 3, momentum: "cooling" }),
    ]);
    expect(brief.rings).toEqual([2, 1, 1]);
    expect(brief.fastest?.id).toBe("b"); // c is faster but not rising
    expect([brief.checked, brief.gaps, brief.newCount]).toEqual([3, 2, 1]);
    expect(radarBrief([]).fastest).toBeNull();
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

describe("withRadarDefaults", () => {
  it("derives ring and momentum when an older API leaves them out", () => {
    const old = (o: Partial<ApiRadarTopic>) => {
      const t = topic(o) as Partial<ApiRadarTopic>;
      for (const k of ["ring", "momentum", "isNew", "summaryEn", "summaryZh", "coverage"] as const) delete t[k];
      return t as ApiRadarTopic;
    };
    const radar = withRadarDefaults({
      generatedAt: "2026-10-13T14:00:00Z",
      windowDays: 14,
      sources: [],
      questions: [],
      topics: [
        old({ id: "a", signalCount: 48, sourceCounts: { hn: 10, news: 37, youtube: 1 }, velocity: 4.9, lastSeenAt: "2026-10-13T02:00:00Z",
          dailyCounts: [0, 0, 0, 0, 0, 0, 0, 2, 3, 4, 2, 10, 12, 15] }),
        old({ id: "b", signalCount: 3, sourceCounts: { hn: 2, news: 1 }, velocity: 1.97, lastSeenAt: "2026-10-12T10:00:00Z",
          dailyCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1] }),
        old({ id: "c", signalCount: 4, sourceCounts: { youtube: 4 }, velocity: 0.3, lastSeenAt: "2026-10-02T10:00:00Z",
          dailyCounts: [0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }),
        old({ id: "d", signalCount: 14, sourceCounts: { hn: 8, news: 6 }, velocity: 1.2, lastSeenAt: "2026-10-13T08:00:00Z",
          dailyCounts: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }),
      ],
    });
    expect(radar.topics.map((t) => [t.ring, t.momentum])).toEqual([
      [1, "rising"],
      [2, "new"],
      [3, "cooling"],
      [2, "steady"],
    ]);
    expect(radar.topics[0]).toMatchObject({ isNew: false, summaryEn: null, coverage: null });
    expect(radar.topics[1].isNew).toBe(true);
  });

  it("keeps what the API sends", () => {
    const t = topic({ ring: 1, momentum: "cooling", signalCount: 2, rising: true });
    expect(withRadarDefaults({ generatedAt: null, windowDays: 14, sources: [], questions: [], topics: [t] }).topics[0]).toMatchObject({
      ring: 1,
      momentum: "cooling",
    });
  });
});

describe("ringMove", () => {
  // 7-day trails for brevity; MOVE_LOOKBACK_DAYS = 3 compares with index length - 4
  it("tells moved, stayed and appeared apart", () => {
    const moved = topic({ ring: 1, signalCount: 53, trailSignals: [0, 1, 2, 3, 20, 40, 53], trailRings: [0, 3, 3, 3, 1, 1, 1] });
    expect(ringMove(moved)).toEqual({ kind: "moved", from: 3, fromSignals: 3 });
    const stayed = topic({ ring: 2, trailSignals: [5, 6, 6, 7, 8, 8, 9], trailRings: [2, 2, 2, 2, 2, 2, 2] });
    expect(ringMove(stayed)).toEqual({ kind: "stayed" });
    const fresh = topic({ ring: 2, trailSignals: [0, 0, 0, 0, 1, 3, 6], trailRings: [0, 0, 0, 0, 3, 2, 2] });
    expect(ringMove(fresh)).toEqual({ kind: "appeared" });
    expect(ringMove(topic({ trailRings: [3, 3] }))).toBeNull(); // trail too short
  });

  it("feeds the brief, biggest jump first", () => {
    const a = topic({ id: "a", ring: 2, score: 90, trailSignals: [1, 1, 1, 1, 2, 4, 6], trailRings: [3, 3, 3, 3, 3, 2, 2] });
    const b = topic({ id: "b", ring: 1, score: 60, trailSignals: [1, 1, 1, 2, 9, 30, 40], trailRings: [3, 3, 3, 3, 2, 1, 1] });
    const c = topic({ id: "c", ring: 2, trailSignals: [5, 5, 5, 5, 5, 6, 6], trailRings: [2, 2, 2, 2, 2, 2, 2] });
    expect(radarBrief([a, b, c]).moved.map((m) => [m.topic.id, m.from])).toEqual([
      ["b", 3],
      ["a", 3],
    ]);
  });
});
