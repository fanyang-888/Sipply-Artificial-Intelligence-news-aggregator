/**
 * Server-side reads for pages, metadata, the sitemap and llms.txt.
 *
 * These run in Server Components / route handlers with Next's fetch cache, so
 * crawlers get complete HTML without running any JavaScript. Client components
 * keep using lib/api/index.ts.
 */

import { cache } from "react";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { ApiError } from "./client";
import type { ApiCluster, ApiDigest } from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export type ApiClusterIndexEntry = { id: string; lastSeenAt: string | null };

async function getJson<T>(path: string, revalidate: number): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { next: { revalidate } });
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${path}`);
  return res.json() as Promise<T>;
}

/** The API says this story doesn't exist (unknown id → 404, malformed id → 422). */
export function isMissing(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 422);
}

/** True while `next build` prerenders; the API may not be reachable (or deployed) yet. */
export function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
}

/** Cached per render, so generateMetadata and the page share one request. */
export const getCluster = cache((id: string) =>
  getJson<ApiCluster>(`/api/clusters/${encodeURIComponent(id)}`, 3600),
);

/** The global (non-personalized) digest; readers get their own order client-side. */
export const getDigest = cache(() => getJson<ApiDigest>("/api/digest/today", 300));

export function getClusterIndex(): Promise<ApiClusterIndexEntry[]> {
  return getJson<ApiClusterIndexEntry[]>("/api/clusters/index", 3600);
}
