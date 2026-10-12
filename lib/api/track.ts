/**
 * Client-side event tracking — fire-and-forget.
 * Calls POST /api/events; silently swallows all errors.
 *
 * Every event carries a stable anonymous `device_id` (localStorage, no login)
 * plus the user's self-declared `role`, so the backend can attribute behaviour
 * to an individual browser for retention metrics and personalization.
 */

type EventType = "cluster_viewed";

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "")) ?? "http://localhost:8000";

const DEVICE_KEY = "sipply_device_id";
const ROLE_KEY = "sipply_preferred_role";

/** Stable anonymous id for this browser; created on first call. */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `d_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

function getRole(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ROLE_KEY);
  } catch {
    return null;
  }
}

export function trackEvent(type: EventType, entityId: string): void {
  // Fire-and-forget — POST directly to FastAPI, never throws.
  // keepalive lets the request survive a page navigation (e.g. clicking through).
  fetch(`${API_BASE}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      entity_id: entityId,
      device_id: getDeviceId(),
      role: getRole(),
    }),
    keepalive: true,
  }).catch(() => {
    // silently ignore network errors
  });
}
