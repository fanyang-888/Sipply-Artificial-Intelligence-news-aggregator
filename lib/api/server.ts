/**
 * Server-side reads for pages, metadata, the sitemap and llms.txt.
 *
 * These run in Server Components / route handlers with Next's fetch cache, so
 * crawlers get complete HTML without running any JavaScript. Client components
 * keep using lib/api/index.ts.
 */

import { cache } from "react";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { RUN_TAG, RUN_TTL, STORY_TTL, storyIdTag, storySlugTag } from "./cache-policy";
import { ApiError } from "./client";
import type {
  ApiCluster,
  ApiDayDetail,
  ApiDaySummary,
  ApiDigest,
  ApiFeedItem,
  ApiSearchResponse,
  ApiTopicDetail,
  ApiTopicSummary,
  ApiWeekDetail,
  ApiWeekSummary,
} from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export type ApiClusterIndexEntry = { id: string; slug?: string; lastSeenAt: string | null };

async function getJson<T>(path: string, revalidate: number, tags: string[] = [RUN_TAG]): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { next: { revalidate, tags } });
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
// "?with=slug" is ignored by the API; it only gives these responses a new cache key, so
// copies cached (kept across deploys) before stories had slugs are not reused
export const getCluster = cache((id: string) =>
  getJson<ApiCluster>(`/api/clusters/${encodeURIComponent(id)}?with=slug`, STORY_TTL, [storyIdTag(id)]),
);

/** A story by its URL key; the response's ``slug`` is the canonical one (redirect when it differs). */
export const getClusterBySlug = cache((slug: string) =>
  getJson<ApiCluster>(`/api/clusters/by-slug/${encodeURIComponent(slug)}`, STORY_TTL, [storySlugTag(slug)]),
);

/** The global (non-personalized) digest; readers get their own order client-side. */
export const getDigest = cache(() => getJson<ApiDigest>("/api/digest/today", RUN_TTL));

/** When the newest finished pipeline run ended (ISO), or null if none has finished. */
export async function getLastPipelineRunAt(): Promise<string | null> {
  const runs = await getJson<{ finished_at: string | null }[]>("/api/pipeline-runs?limit=3", RUN_TTL);
  return runs.find((r) => r.finished_at)?.finished_at ?? null;
}

export function getTopics(): Promise<ApiTopicSummary[]> {
  return getJson<ApiTopicSummary[]>("/api/topics", RUN_TTL);
}

/** Cached per render, so generateMetadata and the page share one request. */
export const getTopic = cache((slug: string) =>
  getJson<ApiTopicDetail>(`/api/topics/${encodeURIComponent(slug)}`, RUN_TTL),
);

export function getWeeks(): Promise<ApiWeekSummary[]> {
  return getJson<ApiWeekSummary[]>("/api/weeks", RUN_TTL);
}

export const getWeek = cache((week: string) =>
  getJson<ApiWeekDetail>(`/api/weeks/${encodeURIComponent(week)}`, RUN_TTL),
);

/**
 * The newest stories, as the archive's first page shows them (server-rendered
 * so the page has content without JS), with the time they were fetched: the
 * client reuses it for the freshness labels, so both sides of hydration agree.
 */
export async function getLatestStories(limit: number): Promise<{ result: ApiSearchResponse; renderedAt: number }> {
  const result = await getJson<ApiSearchResponse>(`/api/search?limit=${limit}&sort_by=date`, RUN_TTL);
  return { result, renderedAt: Date.now() };
}

export function getClusterIndex(): Promise<ApiClusterIndexEntry[]> {
  return getJson<ApiClusterIndexEntry[]>("/api/clusters/index?with=slug", RUN_TTL);
}

export function getDays(): Promise<ApiDaySummary[]> {
  return getJson<ApiDaySummary[]>("/api/days", RUN_TTL);
}

export const getDay = cache((day: string) =>
  getJson<ApiDayDetail>(`/api/days/${encodeURIComponent(day)}`, RUN_TTL),
);

/** The newest stories, for the RSS feed and the news sitemap. */
export function getFeed(limit = 50): Promise<ApiFeedItem[]> {
  return getJson<ApiFeedItem[]>(`/api/feed?limit=${limit}`, RUN_TTL);
}

