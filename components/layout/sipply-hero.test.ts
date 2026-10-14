import { describe, expect, it } from "vitest";
import { pipelineAgeLabel } from "@/components/layout/sipply-hero";

describe("pipelineAgeLabel", () => {
  const finished = "2026-10-14T14:03:18.767657Z";

  it("shows the real age of the last run", () => {
    expect(pipelineAgeLabel(finished, Date.parse("2026-10-14T14:03:40Z"))).toBe("just now");
    expect(pipelineAgeLabel(finished, Date.parse("2026-10-14T14:45:00Z"))).toBe("41m ago");
    expect(pipelineAgeLabel(finished, Date.parse("2026-10-14T18:30:00Z"))).toBe("4h ago");
  });

  it("uses a fixed UTC time before mount, so server and browser render the same text", () => {
    expect(pipelineAgeLabel(finished, null)).toBe("at 14:03 UTC");
  });
});
