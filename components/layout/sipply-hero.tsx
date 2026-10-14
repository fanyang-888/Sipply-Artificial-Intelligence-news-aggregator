"use client";

import { useNowMinute } from "@/lib/use-now-minute";
import { ageParts } from "@/lib/utils/radar";

const UTC_TIME = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

/** "3h ago" once mounted; "at 14:03 UTC" during server render (no hydration mismatch). */
export function pipelineAgeLabel(iso: string, now: number | null): string {
  const parts = now == null ? null : ageParts(iso, new Date(now));
  if (!parts) return `at ${UTC_TIME.format(new Date(iso))} UTC`;
  return parts.unit === "m" && parts.value === 0 ? "just now" : `${parts.value}${parts.unit} ago`;
}

export function SippyHero({ dateLabel, updatedAt }: { dateLabel: string; updatedAt: string | null }) {
  const now = useNowMinute();

  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
        padding: "20px 0 16px",
        marginBottom: "40px",
        display: "flex",
        alignItems: "baseline",
        gap: "20px",
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "11px",
          letterSpacing: ".12em",
          textTransform: "uppercase",
          color: "var(--accent)",
          fontWeight: 500,
        }}
      >
        Intelligence Brief
      </span>
      <span
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "11px",
          color: "var(--text-muted)",
          letterSpacing: ".05em",
        }}
      >
        {dateLabel}
      </span>
      {updatedAt ? (
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "10px",
            color: "var(--green)",
            letterSpacing: ".08em",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--green)",
              animation: "sp-pulse 2s infinite",
            }}
          />
          Pipeline updated {pipelineAgeLabel(updatedAt, now)}
        </span>
      ) : null}
    </div>
  );
}
