#!/usr/bin/env node
/**
 * Layout stability: load each kind of page in Chrome as Lighthouse's mobile run does (a phone
 * viewport, slow 4G, a 4× slower CPU) and check that the page shows as soon as its HTML
 * arrives and stays put while the scripts run. Guards ADR 11, which raw-HTML checks can't see:
 *
 *   - the page is hidden until JavaScript runs (#116): the largest paint comes long after the first
 *   - hydration swaps the shown page for the loading skeleton (#117): an aria-busy element
 *     appears in <main> after the first paint
 *   - layout shift (CLS was up to 0.79)
 *
 *   node scripts/stability.mjs http://localhost:3000     # a `next start` build
 *
 * Needs Google Chrome installed (GitHub's ubuntu runners have it). Each page loads twice and a
 * check fails only if it fails both times, so one slow load doesn't fail CI. Exits 1 on failure.
 */

import { chromium } from "playwright-core";

const BASE = (process.argv[2] || process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const RUNS = 2;
const MAX_CLS = 0.05;
// The largest paint may come this long after the first one; a page hidden until hydration takes seconds
const MAX_LCP_AFTER_FCP_MS = 1000;

// Lighthouse's mobile defaults: Moto G Power viewport, slow 4G, 4× CPU slowdown
const DEVICE = {
  viewport: { width: 412, height: 823 },
  screen: { width: 412, height: 823 },
  deviceScaleFactor: 1.75,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 sipply-stability",
};
const NETWORK = {
  offline: false,
  latency: 562.5,
  downloadThroughput: (1474.56 * 1024) / 8,
  uploadThroughput: (675 * 1024) / 8,
};
const CPU_SLOWDOWN = 4;

// Runs in the page before any of its scripts
function recordStability() {
  const s = (window.__stability = { cls: 0, shifts: [], lcp: 0, lcpElement: "", busy: [] });
  const describe = (el) => {
    if (!el || !el.tagName) return "";
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `<${el.tagName.toLowerCase()}${cls ? "." + cls : ""}>${text ? ` "${text}"` : ""}`;
  };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      s.cls += e.value;
      s.shifts.push({ t: Math.round(e.startTime), value: e.value, nodes: (e.sources || []).map((x) => describe(x.node)) });
    }
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      s.lcp = e.startTime;
      s.lcpElement = describe(e.element);
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
  // A loading skeleton (aria-busy) that shows up in <main>; compared with first paint at the end
  const noteBusy = (el) => {
    if (el.closest("main")) s.busy.push({ t: Math.round(performance.now()), element: describe(el) });
  };
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "attributes") {
        if (r.target.getAttribute("aria-busy") === "true") noteBusy(r.target);
        continue;
      }
      for (const node of r.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches('[aria-busy="true"]')) noteBusy(node);
        for (const el of node.querySelectorAll('[aria-busy="true"]')) noteBusy(el);
      }
    }
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
}

async function measure(browser, path) {
  const context = await browser.newContext(DEVICE);
  try {
    const page = await context.newPage();
    await page.addInitScript(recordStability);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", NETWORK);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });

    const res = await page.goto(BASE + path, { waitUntil: "load", timeout: 60_000 });
    if (!res || res.status() !== 200) throw new Error(`status ${res?.status()}`);
    // Let hydration, late fonts and prefetches finish, then a little longer for anything that moves after
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2_000);

    const r = await page.evaluate(() => ({
      ...window.__stability,
      fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
    }));
    const busyAfterFcp = r.fcp == null ? r.busy : r.busy.filter((b) => b.t > r.fcp);
    return {
      fcp: r.fcp,
      lcp: r.lcp,
      cls: r.cls,
      lcpElement: r.lcpElement,
      shifts: r.shifts.sort((a, b) => b.value - a.value).slice(0, 3),
      busyAfterFcp,
      checks: {
        [`CLS < ${MAX_CLS}`]: r.cls < MAX_CLS,
        [`largest paint ≤ first paint + ${MAX_LCP_AFTER_FCP_MS} ms`]: r.fcp != null && r.lcp > 0 && r.lcp <= r.fcp + MAX_LCP_AFTER_FCP_MS,
        "no loading skeleton in <main> after first paint": busyAfterFcp.length === 0,
      },
    };
  } finally {
    await context.close();
  }
}

// Without JavaScript nothing may hide the page: <main> and everything around it fully opaque
async function visibleWithoutJs(browser) {
  const context = await browser.newContext({ ...DEVICE, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 60_000 });
    return await page.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return { ok: false, detail: "no <main>" };
      for (let el = main; el; el = el.parentElement) {
        const style = getComputedStyle(el);
        if (style.opacity !== "1" || style.visibility === "hidden" || style.display === "none") {
          const cls = typeof el.className === "string" ? el.className : "";
          return { ok: false, detail: `<${el.tagName.toLowerCase()} class="${cls}"> opacity ${style.opacity}, visibility ${style.visibility}` };
        }
      }
      return { ok: true, detail: "" };
    });
  } finally {
    await context.close();
  }
}

const ms = (v) => (v == null ? "—" : `${Math.round(v)}`);

function printTable(rows) {
  const cols = Object.keys(rows[0]);
  const width = (c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length));
  const line = (r) => "  " + cols.map((c) => String(r[c]).padEnd(width(c))).join("  ");
  console.log(line(Object.fromEntries(cols.map((c) => [c, c]))));
  for (const r of rows) console.log(line(r));
}

async function main() {
  console.log(`stability: ${BASE} (412×823, slow 4G, ${CPU_SLOWDOWN}× CPU, ${RUNS} runs per page)\n`);

  const home = await (await fetch(BASE + "/")).text();
  const story = home.match(/href="(\/cluster\/[^"#?]+)"/)?.[1];
  const paths = ["/", "/radar", "/archive", "/topics", "/weekly", ...(story ? [story] : [])];

  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome" });
  } catch (err) {
    console.error("stability: could not start Google Chrome (playwright-core uses the installed Chrome):\n", err.message);
    process.exit(1);
  }

  const failures = [];
  if (!story) failures.push({ path: "/", check: "home links to a story", detail: "no /cluster/ link in the HTML" });

  const rows = [];
  try {
    for (const path of paths) {
      const runs = [];
      for (let i = 0; i < RUNS; i++) {
        try {
          runs.push(await measure(browser, path));
        } catch (err) {
          runs.push({ error: err.message.split("\n")[0] });
        }
      }
      for (const [i, r] of runs.entries()) {
        const failed = r.error ? [] : Object.entries(r.checks).filter(([, ok]) => !ok).map(([name]) => name);
        rows.push({
          page: i === 0 ? path : "",
          run: i + 1,
          FCP: r.error ? "—" : ms(r.fcp),
          LCP: r.error ? "—" : ms(r.lcp),
          "LCP−FCP": r.error ? "—" : r.fcp == null ? "—" : ms(r.lcp - r.fcp),
          CLS: r.error ? "—" : r.cls.toFixed(3),
          skeleton: r.error ? "—" : r.busyAfterFcp.length ? "yes" : "no",
          result: r.error ? `error: ${r.error}` : failed.length ? `FAIL: ${failed.join("; ")}` : "ok",
        });
      }
      // A check fails only if every run failed it (a run that didn't load fails them all)
      if (runs.every((r) => r.error)) {
        failures.push({ path, check: "page loads", detail: runs.map((r, i) => `run ${i + 1}: ${r.error}`).join("\n        ") });
        continue;
      }
      for (const name of Object.keys(runs.find((r) => !r.error).checks)) {
        if (!runs.every((r) => r.error || !r.checks[name])) continue;
        const detail = runs
          .map((r, i) => {
            if (r.error) return `run ${i + 1}: ${r.error}`;
            if (name.startsWith("CLS")) return `run ${i + 1}: ${r.cls.toFixed(3)} from ${r.shifts.map((x) => `${x.value.toFixed(3)} at ${x.t} ms ${x.nodes.filter(Boolean).join(", ")}`).join(" | ")}`;
            if (name.startsWith("largest")) return `run ${i + 1}: FCP ${ms(r.fcp)} ms, LCP ${ms(r.lcp)} ms on ${r.lcpElement}`;
            return `run ${i + 1}: ${r.busyAfterFcp.map((b) => `${b.element} at ${b.t} ms`).join(", ")} (FCP ${ms(r.fcp)} ms)`;
          })
          .join("\n        ");
        failures.push({ path, check: name, detail });
      }
    }

    const js = await visibleWithoutJs(browser);
    if (!js.ok) failures.push({ path: "/ (JavaScript off)", check: "<main> and its parents are visible", detail: js.detail });
    printTable(rows);
    console.log(`\n  ${js.ok ? "ok  " : "FAIL"}  / with JavaScript off: <main> and its parents are visible${js.ok ? "" : `  (${js.detail})`}`);
  } finally {
    await browser.close();
  }

  if (failures.length) {
    console.log(`\n${failures.length} check(s) failed in every run:`);
    for (const f of failures) console.log(`  FAIL  ${f.path}: ${f.check}\n        ${f.detail}`);
    process.exit(1);
  }
  console.log("\nAll pages stable.");
}

main().catch((err) => {
  console.error("stability: could not run:", err);
  process.exit(1);
});
