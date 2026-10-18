import { describe, expect, it } from "vitest";
import { dayTitle, formatDay, isDayKey, neighbourDays, utcDayKey, weekDays } from "./days";

describe("day pages", () => {
  it("accepts only real YYYY-MM-DD days", () => {
    expect(isDayKey("2026-10-18")).toBe(true);
    for (const bad of ["2026-13-01", "2026-02-30", "18-10-2026", "2026-10-1", "today", ""]) {
      expect(isDayKey(bad)).toBe(false);
    }
  });

  it("names a day in UTC, whatever the reader's clock", () => {
    expect(utcDayKey(new Date("2026-10-18T23:30:00-07:00"))).toBe("2026-10-19");
    expect(formatDay("2026-10-18", "en")).toBe("Sunday, October 18, 2026");
    expect(formatDay("2026-10-18", "en", { weekday: false })).toBe("October 18, 2026");
    expect(formatDay("2026-10-18", "zh")).toBe("2026年10月18日 星期日");
  });

  it("calls only the current day 'today' in the page title", () => {
    const now = new Date("2026-10-18T09:00:00Z");
    expect(dayTitle("2026-10-18", 14, now)).toBe("AI news today, October 18, 2026: 14 stories");
    expect(dayTitle("2026-10-17", 1, now)).toBe("AI news, October 17, 2026: 1 story");
  });

  it("finds the days before and after (the list is newest first)", () => {
    const days = [{ date: "2026-10-18" }, { date: "2026-10-17" }, { date: "2026-10-15" }];
    expect(neighbourDays(days, "2026-10-17")).toEqual({ newer: days[0], older: days[2] });
    expect(neighbourDays(days, "2026-10-18")).toEqual({ newer: null, older: days[1] });
    expect(neighbourDays(days, "2026-09-01")).toEqual({ newer: null, older: null });
  });

  it("lists the seven days of a week, Monday first", () => {
    expect(weekDays("2026-10-12")).toEqual([
      "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18",
    ]);
  });
});
