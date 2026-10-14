/**
 * Where each topic sits on the radar chart (pure; runs on the server so the
 * client renders the exact same coordinates).
 *
 * Rings come from the API (evidence), sectors from the category. Inside its
 * ring a higher score sits closer to the center; blips in the same cell start
 * evenly spread across the sector and are then pushed apart until they no
 * longer overlap, staying inside their own ring and sector.
 */

import type { ApiRadarTopic, RadarRing } from "@/lib/api/types";
import { RADAR_SECTORS, radarSectorForTag, ringMove } from "@/lib/utils/radar";

/** Outer radius of each ring, inner first (SVG user units; the chart is centered on 0,0). */
export const RING_OUTER: Record<RadarRing, number> = { 1: 140, 2: 245, 3: 335 };
export const RADAR_RADIUS = RING_OUTER[3];
export const BLIP_RADIUS = 13;
/** Sectors start at 12 o'clock and run clockwise. */
export const SECTOR_START = -Math.PI / 2;
export const SECTOR_SPAN = (2 * Math.PI) / RADAR_SECTORS.length;
const CENTER_HOLE = 30;
const GAP = 5;
const ITERATIONS = 400;

/** Blip center; ``tail`` starts in the middle of the ring the topic was in MOVE_LOOKBACK_DAYS ago. */
export type BlipPosition = { x: number; y: number; tail?: { x: number; y: number } };

type Blip = { id: string; ang: number; rad: number; a0: number; a1: number; r0: number; r1: number; x: number; y: number };

function ringInner(ring: RadarRing): number {
  return ring === 1 ? CENTER_HOLE : RING_OUTER[(ring - 1) as RadarRing];
}

export function layoutRadar(topics: ApiRadarTopic[]): Record<string, BlipPosition> {
  const scoreRange = new Map<RadarRing, { min: number; max: number }>();
  for (const t of topics) {
    const r = scoreRange.get(t.ring) ?? { min: Infinity, max: -Infinity };
    scoreRange.set(t.ring, { min: Math.min(r.min, t.score), max: Math.max(r.max, t.score) });
  }

  const blips: Blip[] = [];
  RADAR_SECTORS.forEach((sector, si) => {
    for (const ring of [1, 2, 3] as RadarRing[]) {
      const cell = topics
        .filter((t) => t.ring === ring && radarSectorForTag(t.topicTag) === sector)
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      const r0 = ringInner(ring);
      const r1 = RING_OUTER[ring];
      const band = r1 - r0;
      const a0 = SECTOR_START + si * SECTOR_SPAN;
      // A ring with no topics at all has no score range (and no cells to place)
      const { min, max } = scoreRange.get(ring) ?? { min: 0, max: 0 };
      cell.forEach((t, k) => {
        const f = max > min ? (max - t.score) / (max - min) : 0.5;
        const stagger = cell.length > 2 ? (k % 2 ? 1 : -1) * band * 0.12 : 0;
        const ang = a0 + (SECTOR_SPAN * (k + 0.5)) / cell.length;
        const rad = r0 + band * (0.22 + 0.56 * f) + stagger;
        blips.push({ id: t.id, ang, rad, a0, a1: a0 + SECTOR_SPAN, r0, r1, x: 0, y: 0 });
      });
    }
  });

  const minDist = 2 * BLIP_RADIUS + GAP;
  const toXY = () => {
    for (const b of blips) {
      b.x = b.rad * Math.cos(b.ang);
      b.y = b.rad * Math.sin(b.ang);
    }
  };
  for (let it = 0; it < ITERATIONS; it++) {
    toXY();
    for (let i = 0; i < blips.length; i++) {
      for (let j = i + 1; j < blips.length; j++) {
        const a = blips[i];
        const b = blips[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < minDist) {
          const push = (minDist - d) / 2;
          dx /= d;
          dy /= d;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
    // Back to polar, clamped inside the blip's own ring band and sector
    for (const b of blips) {
      let ang = Math.atan2(b.y, b.x);
      while (ang < b.a0 - Math.PI) ang += 2 * Math.PI;
      while (ang > b.a1 + Math.PI) ang -= 2 * Math.PI;
      const rad = Math.min(Math.max(Math.hypot(b.x, b.y), b.r0 + BLIP_RADIUS + 3), b.r1 - BLIP_RADIUS - 3);
      const margin = (BLIP_RADIUS + 4) / rad;
      b.rad = rad;
      b.ang = Math.min(Math.max(ang, b.a0 + margin), b.a1 - margin);
    }
  }
  toXY();

  const round = (v: number) => Math.round(v * 10) / 10;
  const byId = new Map(topics.map((t) => [t.id, t]));
  const out: Record<string, BlipPosition> = {};
  for (const b of blips) {
    const pos: BlipPosition = { x: round(b.x), y: round(b.y) };
    const move = ringMove(byId.get(b.id)!);
    if (move?.kind === "moved") {
      const r = (ringInner(move.from) + RING_OUTER[move.from]) / 2;
      pos.tail = { x: round(r * Math.cos(b.ang)), y: round(r * Math.sin(b.ang)) };
    }
    out[b.id] = pos;
  }
  return out;
}
