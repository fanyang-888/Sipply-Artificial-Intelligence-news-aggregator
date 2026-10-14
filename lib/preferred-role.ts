"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Lang } from "@/lib/i18n";

/** Keys match Cluster.audience and the backend's why_it_matters_{pm,dev,students} copy. */
export type Role = "pm" | "developer" | "studentJobSeeker";

export const ROLES: readonly Role[] = ["pm", "developer", "studentJobSeeker"];

const ROLE_LABELS: Record<Role, { en: string; zh: string; enShort: string; zhShort: string }> = {
  pm: { en: "Product Manager", zh: "产品经理", enShort: "PM", zhShort: "产品" },
  developer: { en: "Developer / Engineer", zh: "开发者 / 工程师", enShort: "Dev", zhShort: "开发" },
  studentJobSeeker: { en: "Student / Job Seeker", zh: "学生 / 求职者", enShort: "Student", zhShort: "学生" },
};

// Same key lib/api/track.ts reads to tag events with the viewer's role.
const STORAGE_KEY = "sipply_preferred_role";
// localStorage's own "storage" event only fires in *other* tabs.
const CHANGE_EVENT = "sipply:preferred-role";

export function isRole(value: string | null): value is Role {
  return value !== null && (ROLES as readonly string[]).includes(value);
}

export function roleLabel(role: Role, lang: Lang, short = false): string {
  const l = ROLE_LABELS[role];
  if (lang === "zh") return short ? l.zhShort : l.zh;
  return short ? l.enShort : l.en;
}

/** Synchronous read for non-React callers (e.g. building a request); prefer usePreferredRole in components. */
export function readPreferredRole(): Role | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isRole(value) ? value : null;
  } catch {
    return null;
  }
}

/** Save the role, or forget it (null = read as a general reader). */
export function writePreferredRole(role: Role | null): void {
  try {
    if (role) localStorage.setItem(STORAGE_KEY, role);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked — the choice just won't persist
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The viewer's self-declared role, shared by every component on the page.
 * null until chosen (and always null during server render).
 */
export function usePreferredRole(): [Role | null, (role: Role | null) => void] {
  const role = useSyncExternalStore(subscribe, readPreferredRole, () => null);
  const setRole = useCallback((next: Role | null) => writePreferredRole(next), []);
  return [role, setRole];
}
