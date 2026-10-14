import { describe, expect, it } from "vitest";
import { formatWeekRange, isoWeekKey, neighbourWeeks } from "@/lib/utils/weeks";

describe("formatWeekRange", () => {
  it("formats a week in English and Chinese", () => {
    expect(formatWeekRange("2026-10-12", "2026-10-18", "en")).toBe("Oct 12 – 18, 2026");
    expect(formatWeekRange("2026-09-28", "2026-10-04", "en")).toBe("Sep 28 – Oct 4, 2026");
    expect(formatWeekRange("2026-12-28", "2027-01-03", "en")).toBe("Dec 28, 2026 – Jan 3, 2027");
    expect(formatWeekRange("2026-10-12", "2026-10-18", "zh")).toBe("2026年10月12日–18日");
    expect(formatWeekRange("2026-09-28", "2026-10-04", "zh")).toBe("2026年9月28日–10月4日");
    expect(formatWeekRange("2026-12-28", "2027-01-03", "zh")).toBe("2026年12月28日–2027年1月3日");
  });
});

describe("neighbourWeeks", () => {
  const weeks = [{ week: "2026-W42" }, { week: "2026-W41" }, { week: "2026-W39" }];
  it("finds the newer and older recaps that exist", () => {
    expect(neighbourWeeks(weeks, "2026-W41")).toEqual({ newer: { week: "2026-W42" }, older: { week: "2026-W39" } });
    expect(neighbourWeeks(weeks, "2026-W42").newer).toBeNull();
    expect(neighbourWeeks(weeks, "2026-W30")).toEqual({ newer: null, older: null });
  });
});

describe("isoWeekKey", () => {
  it("matches the backend's ISO weeks, including year edges", () => {
    expect(isoWeekKey(new Date("2026-10-14T23:00:00Z"))).toBe("2026-W42");
    expect(isoWeekKey(new Date("2026-10-12T00:00:00Z"))).toBe("2026-W42"); // Monday
    expect(isoWeekKey(new Date("2026-10-18T23:59:00Z"))).toBe("2026-W42"); // Sunday
    expect(isoWeekKey(new Date("2026-12-31T12:00:00Z"))).toBe("2026-W53");
    expect(isoWeekKey(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
    expect(isoWeekKey(new Date("2027-01-04T12:00:00Z"))).toBe("2027-W01");
  });
});
