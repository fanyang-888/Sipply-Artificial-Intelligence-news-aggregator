#!/usr/bin/env node
/**
 * Draws the README charts from the live API, as a light and a dark SVG each
 * (the README picks one with <picture> and prefers-color-scheme):
 *
 *   docs/images/chart-signals-{light,dark}.svg   Trend Radar signals by platform
 *   docs/images/chart-run-time-{light,dark}.svg  where a pipeline run spends its time
 *
 *   node scripts/readme-charts.mjs
 *
 * Bars are one blue (validated for 3:1 against GitHub's white and #0d1117
 * pages), 18px thick with a 4px rounded end, the value at the tip; text is ink,
 * never the bar color. The SVGs carry <title>/<desc> with every value.
 */
import { writeFileSync, mkdirSync } from "node:fs";

const API = (process.env.API_URL || "https://personal-ai-intelligence-tool-production.up.railway.app").replace(/\/$/, "");
const OUT = new URL("../docs/images/", import.meta.url);

const THEMES = {
  light: { bar: "#2a78d6", primary: "#0b0b0b", secondary: "#52514e", muted: "#6e6d68", baseline: "#c3c2b7" },
  dark: { bar: "#3987e5", primary: "#f0efec", secondary: "#c3c2b7", muted: "#9a9993", baseline: "#383835" },
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => n.toLocaleString("en-US");

/** A horizontal bar per row, sorted by the caller; rows are {label, value, tip}. */
function barChart({ title, subtitle, rows, theme, labelWidth, note }) {
  const t = THEMES[theme];
  const W = 720;
  const top = 64;
  const rowH = 30;
  const bar = 18;
  const tipRoom = 120;
  const x0 = labelWidth + 12;
  const plotW = W - x0 - tipRoom;
  const max = Math.max(...rows.map((r) => r.value));
  const H = top + rows.length * rowH + (note ? 34 : 14);
  const r = 4;

  const marks = rows
    .map((row, i) => {
      const y = top + i * rowH + (rowH - bar) / 2;
      const w = Math.round(Math.max(2, (row.value / max) * plotW) * 10) / 10;
      const rr = Math.min(r, w);
      // square at the baseline, rounded at the data end
      const d = `M${x0},${y} h${+(w - rr).toFixed(1)} a${rr},${rr} 0 0 1 ${rr},${rr} v${bar - 2 * rr} a${rr},${rr} 0 0 1 -${rr},${rr} h-${+(w - rr).toFixed(1)} z`;
      const cy = y + bar / 2 + 4.5;
      return [
        `<text x="${labelWidth}" y="${cy}" text-anchor="end" fill="${t.secondary}" font-size="13">${esc(row.label)}</text>`,
        `<path d="${d}" fill="${t.bar}"><title>${esc(`${row.label}: ${row.tip}`)}</title></path>`,
        `<text x="${x0 + w + 8}" y="${cy}" fill="${t.primary}" font-size="13" font-variant-numeric="tabular-nums">${esc(row.tip)}</text>`,
      ].join("\n  ");
    })
    .join("\n  ");

  const desc = rows.map((row) => `${row.label}: ${row.tip}`).join("; ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d" font-family="${FONT}">
  <title id="t">${esc(title)}</title>
  <desc id="d">${esc(`${subtitle}. ${desc}`)}</desc>
  <text x="0" y="20" fill="${t.primary}" font-size="15" font-weight="600">${esc(title)}</text>
  <text x="0" y="42" fill="${t.muted}" font-size="12">${esc(subtitle)}</text>
  <line x1="${x0}" y1="${top - 4}" x2="${x0}" y2="${top + rows.length * rowH + 4}" stroke="${t.baseline}" stroke-width="1"/>
  ${marks}${note ? `\n  <text x="0" y="${H - 8}" fill="${t.muted}" font-size="12">${esc(note)}</text>` : ""}
</svg>
`;
}

async function getJson(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const day = (iso) => iso.slice(0, 10);

async function signalsChart() {
  const radar = await getJson("/api/radar");
  const sources = radar.sources.filter((s) => s.signalCount > 0).sort((a, b) => b.signalCount - a.signalCount);
  const total = sources.reduce((n, s) => n + s.signalCount, 0);
  const rows = sources.map((s) => ({
    label: s.label === "Google News" ? "News (Google News)" : s.label,
    value: s.signalCount,
    tip: `${fmt(s.signalCount)} · ${Math.round((s.signalCount / total) * 100) || "<1"}%`,
  }));
  return {
    name: "chart-signals",
    title: "Trend Radar signals by platform",
    subtitle: `${fmt(total)} signals in the last ${radar.windowDays} days · snapshot of ${day(radar.generatedAt)}`,
    rows,
    labelWidth: 140,
  };
}

const STAGE_LABELS = {
  ingest_signals: "Fetch community signals",
  summarize: "Summarize stories",
  describe_signal_topics: "Describe radar topics",
  brief_signal_topics: "Brief radar topics",
  translate_signals: "Translate signals",
  translate_clusters: "Translate stories",
  ingest_full_articles: "Fetch full articles",
  merge_signal_topics: "Merge radar topics",
  build_signal_topics: "Build radar topics",
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function runTimeChart() {
  const runs = await getJson("/api/pipeline-runs?limit=40");
  const ok = runs.filter((r) => r.status === "success" && r.triggered_by === "cron" && r.stage_results);
  // Only runs with today's stage list, so stages that were added or removed don't skew the medians
  const current = Object.keys(ok[0].stage_results);
  const same = ok.filter((r) => current.every((k) => k in r.stage_results));
  const per = {};
  for (const r of same)
    for (const [k, v] of Object.entries(r.stage_results)) if (v && typeof v.elapsed_sec === "number") (per[k] ??= []).push(v.elapsed_sec);

  const named = [];
  let other = 0;
  for (const [k, xs] of Object.entries(per)) {
    const m = median(xs);
    if (STAGE_LABELS[k]) named.push({ label: STAGE_LABELS[k], value: m });
    else other += m;
  }
  named.sort((a, b) => b.value - a.value);
  const rows = [...named, { label: "Everything else", value: other }].map((r) => ({ ...r, tip: `${Math.round(r.value)} s` }));
  const total = median(same.map((r) => r.total_elapsed_sec));
  return {
    name: "chart-run-time",
    title: "Where a pipeline run spends its time",
    subtitle: `Median seconds per stage · ${same.length} runs, ${day(same.at(-1).started_at)} to ${day(same[0].started_at)} · a run takes about ${Math.round(total / 60)} min`,
    rows,
    labelWidth: 170,
    note: "Summaries, translations and topic write-ups are LLM calls; the fetch stages wait on outside APIs.",
  };
}

mkdirSync(OUT, { recursive: true });
for (const chart of [await signalsChart(), await runTimeChart()]) {
  for (const theme of Object.keys(THEMES)) {
    const file = new URL(`${chart.name}-${theme}.svg`, OUT);
    writeFileSync(file, barChart({ ...chart, theme }));
    console.log("wrote", file.pathname);
  }
}
