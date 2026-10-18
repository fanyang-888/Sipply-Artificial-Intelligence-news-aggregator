/** Helpers for the day pages (/daily/2026-10-18). A day is a UTC calendar day, like the API's. */

import type { Lang } from "@/lib/i18n";

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ZH_WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

function noonUtc(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

/** A real calendar day written YYYY-MM-DD. */
export function isDayKey(key: string): boolean {
  const m = DAY_RE.exec(key);
  if (!m) return false;
  const d = noonUtc(key);
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() + 1 === Number(m[2]) && d.getUTCDate() === Number(m[3]);
}

/** The UTC day ("2026-10-18") a moment falls on. */
export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "Saturday, October 18, 2026" / "2026年10月18日 星期六"; ``weekday: false`` drops the weekday. */
export function formatDay(key: string, lang: Lang, { weekday = true }: { weekday?: boolean } = {}): string {
  const d = noonUtc(key);
  if (lang === "zh") {
    const date = `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
    return weekday ? `${date} ${ZH_WEEKDAYS[d.getUTCDay()]}` : date;
  }
  return new Intl.DateTimeFormat("en-US", {
    weekday: weekday ? "long" : undefined,
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/**
 * The page title search engines and AI assistants see: "AI news today, …" only on
 * the day itself, so an older page never claims to be today's.
 */
export function dayTitle(key: string, storyCount: number, now: Date = new Date()): string {
  const date = formatDay(key, "en", { weekday: false });
  const lead = key === utcDayKey(now) ? `AI news today, ${date}` : `AI news, ${date}`;
  return `${lead}: ${storyCount} ${storyCount === 1 ? "story" : "stories"}`;
}

/** The days before and after ``day`` that have a page (``days`` is newest first). */
export function neighbourDays<T extends { date: string }>(days: T[], day: string): { newer: T | null; older: T | null } {
  const i = days.findIndex((d) => d.date === day);
  if (i < 0) return { newer: null, older: null };
  return { newer: days[i - 1] ?? null, older: days[i + 1] ?? null };
}

/** The seven days of the week starting ``monday``. */
export function weekDays(monday: string): string[] {
  const start = noonUtc(monday).getTime();
  return Array.from({ length: 7 }, (_, i) => utcDayKey(new Date(start + i * 86_400_000)));
}
