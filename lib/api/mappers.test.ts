import { describe, expect, it } from "vitest";
import { apiClusterToCluster, archiveRowToCluster } from "@/lib/api/mappers";
import type { ApiArchiveClusterRow, ApiCluster } from "@/lib/api/types";

const ls = (en: string, zh: string | null = null) => ({ en, zh });

const apiCluster: ApiCluster = {
  id: "c1",
  clusterType: "event",
  title: ls("Title", "标题"),
  theme: "event",
  themes: [],
  tags: ["AI"],
  topicTag: "Funding",
  storyStatus: "new",
  clusterScore: 72,
  freshnessLabel: "2h ago",
  firstSeenAt: "2026-07-01T00:00:00Z",
  lastSeenAt: "2026-07-02T00:00:00Z",
  summary: ls("Summary"),
  takeaways: [],
  whyItMatters: ls("Why"),
  audience: { pm: ls("For PMs"), developer: ls("For devs"), studentJobSeeker: ls("For students") },
  articleIds: ["a1", "a2"],
  articles: [],
  relatedClusterIds: [],
  articleCount: 2,
  sourceCount: 2,
};

describe("apiClusterToCluster", () => {
  it("keeps topicTag (regression: it used to be dropped, hiding the homepage filter)", () => {
    expect(apiClusterToCluster(apiCluster).topicTag).toBe("Funding");
    expect(apiClusterToCluster({ ...apiCluster, topicTag: null }).topicTag).toBeUndefined();
  });

  it("keeps the per-role why-it-matters copy", () => {
    const audience = apiClusterToCluster(apiCluster).audience;
    expect(audience.pm).toEqual({ en: "For PMs", zh: "" });
    expect(audience.studentJobSeeker).toEqual({ en: "For students", zh: "" });
  });
});

describe("archiveRowToCluster", () => {
  const row: ApiArchiveClusterRow = {
    id: "r1",
    type: "cluster",
    title: "Raised Series B",
    title_zh: "完成 B 轮融资",
    summary: null,
    summary_zh: null,
    tags: [],
    theme: "event",
    topicTag: "Funding",
    storyStatus: "new",
    clusterScore: 61,
    lastSeenAt: "2026-07-02T00:00:00Z",
    sourceCount: 3,
    sourceNames: ["TechCrunch"],
  };

  it("sizes articleIds so cards report the source count", () => {
    expect(archiveRowToCluster(row).articleIds).toHaveLength(3);
  });

  it("keeps bilingual title and tolerates a missing summary", () => {
    const c = archiveRowToCluster(row, "1d ago");
    expect(c.title).toEqual({ en: "Raised Series B", zh: "完成 B 轮融资" });
    expect(c.summary).toEqual({ en: "", zh: "" });
    expect(c.freshnessLabel).toBe("1d ago");
  });
});
