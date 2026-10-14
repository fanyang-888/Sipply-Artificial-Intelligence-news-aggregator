/** ISO-week helpers for the weekly recap pages. */

import type { Lang } from "@/lib/i18n";

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const DAY = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" });

function utc(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

/** "Oct 12 – 18, 2026" / "Sep 28 – Oct 4, 2026"; 中文 "2026年10月12日–18日". */
export function formatWeekRange(start: string, end: string, lang: Lang): string {
  const a = utc(start);
  const b = utc(end);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  if (lang === "zh") {
    const head = `${a.getUTCFullYear()}年${a.getUTCMonth() + 1}月${a.getUTCDate()}日`;
    const tail = sameMonth ? `${b.getUTCDate()}日` : `${b.getUTCMonth() + 1}月${b.getUTCDate()}日`;
    const year = a.getUTCFullYear() === b.getUTCFullYear() ? "" : `${b.getUTCFullYear()}年`;
    return `${head}–${year}${tail}`;
  }
  const tail = sameMonth ? DAY.format(b) : MONTH_DAY.format(b);
  const startYear = a.getUTCFullYear() === b.getUTCFullYear() ? "" : `, ${a.getUTCFullYear()}`;
  return `${MONTH_DAY.format(a)}${startYear} – ${tail}, ${b.getUTCFullYear()}`;
}

/** The weeks before and after ``week`` that have a recap (``weeks`` is newest first). */
export function neighbourWeeks<T extends { week: string }>(weeks: T[], week: string): { newer: T | null; older: T | null } {
  const i = weeks.findIndex((w) => w.week === week);
  if (i < 0) return { newer: null, older: null };
  return { newer: weeks[i - 1] ?? null, older: weeks[i + 1] ?? null };
}

/** ISO week key ("2026-W42") of a date, in UTC. */
export function isoWeekKey(d: Date): string {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const weekday = day.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  day.setUTCDate(day.getUTCDate() + 4 - weekday); // the Thursday of this week decides the year
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
