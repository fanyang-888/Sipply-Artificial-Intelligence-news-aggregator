/**
 * Public API layer — all backend calls go through here.
 * Components import from "@/lib/api" and never call fetch directly.
 */

import { apiFetch, apiPost } from "./client";
import type {
  ApiCluster,
  ApiDigest,
  ApiSearchResponse,
} from "./types";

// ---------------------------------------------------------------------------
// Digest
// ---------------------------------------------------------------------------

/** Pass the reader to get topClusters re-ranked by their reading history and role. */
export async function fetchTodayDigest(reader?: {
  deviceId?: string;
  role?: string | null;
}): Promise<ApiDigest> {
  const qs = new URLSearchParams();
  if (reader?.deviceId) qs.set("device_id", reader.deviceId);
  if (reader?.role) qs.set("role", reader.role);
  const q = qs.toString();
  return apiFetch<ApiDigest>(`/api/digest/today${q ? `?${q}` : ""}`);
}

// ---------------------------------------------------------------------------
// Clusters
// ---------------------------------------------------------------------------

export async function fetchClusters(params?: {
  limit?: number;
  offset?: number;
}): Promise<ApiCluster[]> {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const q = qs.toString();
  return apiFetch<ApiCluster[]>(`/api/clusters${q ? `?${q}` : ""}`);
}

export async function fetchCluster(id: string): Promise<ApiCluster> {
  return apiFetch<ApiCluster>(`/api/clusters/${id}`);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function fetchSearch(params: {
  q?: string;
  /** Canonical backend topic_tag values (already expanded from a topic group). */
  topicTags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: "score" | "date";
}): Promise<ApiSearchResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.topicTags?.length) qs.set("topic_tags", params.topicTags.join(","));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null && params.offset > 0) qs.set("offset", String(params.offset));
  if (params.sortBy && params.sortBy !== "score") qs.set("sort_by", params.sortBy);
  return apiFetch<ApiSearchResponse>(`/api/search?${qs.toString()}`);
}

// ---------------------------------------------------------------------------
// Subscribe
// ---------------------------------------------------------------------------

export async function postSubscribe(email: string): Promise<{ status: string }> {
  return apiPost<{ status: string }>("/api/subscribe", { email });
}

// Re-export types for convenience
export type { ApiCluster, ApiDigest, ApiSearchResponse } from "./types";
