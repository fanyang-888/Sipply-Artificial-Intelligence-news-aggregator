import { describe, expect, it } from "vitest";
import type { ApiCluster } from "@/lib/api/types";
import { digestOrder, positionInDigest } from "./today-position";

const story = (id: string) => ({ id }) as ApiCluster;
const digest = { featured: story("lead"), topClusters: [story("a"), story("lead"), story("b")] };

describe("digestOrder", () => {
  it("puts the featured story first and doesn't repeat it", () => {
    expect(digestOrder(digest).map((c) => c.id)).toEqual(["lead", "a", "b"]);
  });

  it("is just the list when nothing is featured", () => {
    expect(digestOrder({ featured: null, topClusters: [story("a"), story("b")] }).map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("positionInDigest", () => {
  it("names the story after the lead", () => {
    expect(positionInDigest(digest, "lead")).toEqual({ next: story("a"), inDigest: true });
  });

  it("has no next for today's last story, but knows it was in the digest", () => {
    expect(positionInDigest(digest, "b")).toEqual({ next: null, inDigest: true });
  });

  it("knows a story that isn't in today's digest", () => {
    expect(positionInDigest(digest, "old")).toEqual({ next: null, inDigest: false });
  });
});
