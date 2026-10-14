import { describe, expect, it } from "vitest";
import type { ApiRadarTopic, RadarRing } from "@/lib/api/types";
import { RADAR_SECTORS, radarSectorForTag } from "@/lib/utils/radar";
import { BLIP_RADIUS, RING_OUTER, SECTOR_SPAN, SECTOR_START, layoutRadar } from "@/lib/utils/radar-layout";

// Category, ring and score of the 40 live topics on 2026-10-13 14:04 UTC
const LIVE: [string, RadarRing, number][] = [
  ["Safety", 1, 86.2], ["Infrastructure", 1, 82.3], ["Regulation", 1, 79.6], ["Regulation", 1, 73.5],
  ["Safety", 1, 70.6], ["Other", 3, 68.9], ["Product Launch", 1, 68.7], ["Other", 3, 68.0],
  ["Other", 3, 65.5], ["Product Launch", 3, 65.4], ["Infrastructure", 2, 63.9], ["Product Launch", 2, 63.8],
  ["Product Launch", 2, 63.0], ["Product Launch", 3, 62.8], ["Product Launch", 2, 62.6], ["Other", 3, 62.0],
  ["Model Release", 1, 62.0], ["Product Launch", 3, 60.3], ["Other", 3, 60.1], ["Other", 2, 59.9],
  ["Infrastructure", 1, 59.9], ["Product Launch", 3, 59.8], ["Other", 3, 59.6], ["Product Launch", 3, 59.4],
  ["Model Release", 2, 59.1], ["Model Release", 2, 59.1], ["Product Launch", 2, 59.1], ["Other", 3, 58.9],
  ["Infrastructure", 1, 58.3], ["Product Launch", 3, 58.2], ["Regulation", 3, 57.6], ["Product Launch", 1, 57.6],
  ["Research", 2, 57.5], ["Model Release", 2, 57.4], ["Other", 3, 57.4], ["Model Release", 2, 57.4],
  ["Other", 3, 57.0], ["Funding", 2, 57.0], ["Product Launch", 2, 56.9], ["Other", 3, 56.8],
];

function topics(rows: [string, RadarRing, number][]): ApiRadarTopic[] {
  return rows.map(([topicTag, ring, score], i) => ({ id: `t${i}`, topicTag, ring, score }) as ApiRadarTopic);
}

describe("layoutRadar", () => {
  const input = topics(LIVE);
  const pos = layoutRadar(input);

  it("places every topic inside its own ring and sector", () => {
    for (const t of input) {
      const p = pos[t.id];
      expect(p).toBeDefined();
      const r = Math.hypot(p.x, p.y);
      const inner = t.ring === 1 ? 0 : RING_OUTER[(t.ring - 1) as RadarRing];
      expect(r).toBeGreaterThanOrEqual(inner + BLIP_RADIUS);
      expect(r).toBeLessThanOrEqual(RING_OUTER[t.ring] - BLIP_RADIUS);

      const si = RADAR_SECTORS.indexOf(radarSectorForTag(t.topicTag));
      let a = Math.atan2(p.y, p.x) - (SECTOR_START + si * SECTOR_SPAN);
      a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      expect(a).toBeLessThanOrEqual(SECTOR_SPAN);
    }
  });

  it("keeps blips from overlapping", () => {
    const ps = Object.values(pos);
    let closest = Infinity;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) closest = Math.min(closest, Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y));
    }
    expect(closest).toBeGreaterThanOrEqual(2 * BLIP_RADIUS);
  });

  it("puts the higher score nearer the center within a ring and sector", () => {
    // Two policy topics in the inner ring: 86.2 (t0) and 70.6 (t4)
    expect(Math.hypot(pos.t0.x, pos.t0.y)).toBeLessThan(Math.hypot(pos.t4.x, pos.t4.y));
  });

  it("is deterministic and handles an empty radar or an empty ring", () => {
    expect(layoutRadar(topics(LIVE))).toEqual(pos);
    expect(layoutRadar([])).toEqual({});
    // A day with no mainstream topic
    const noInner = layoutRadar(topics(LIVE.filter(([, ring]) => ring !== 1)));
    expect(Object.keys(noInner)).toHaveLength(LIVE.filter(([, ring]) => ring !== 1).length);
  });
});
