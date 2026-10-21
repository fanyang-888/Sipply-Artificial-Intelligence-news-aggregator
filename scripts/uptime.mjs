// Is the live site up, and is the pipeline still running? Run every 30 minutes by
// .github/workflows/uptime.yml; a failing run makes GitHub email the repo owner.
//
//   node scripts/uptime.mjs            # checks https://www.sipply.dev and the production API
//
// Each check is tried three times, 20 s apart, so a single slow response doesn't alert.
// Pipeline failures email ALERT_EMAIL on their own (backend/app/services/alerts.py); this
// catches what they can't: the site or API down, or the cron no longer running at all.

const SITE = process.env.SITE_URL ?? "https://www.sipply.dev";
const API = process.env.API_URL ?? "https://personal-ai-intelligence-tool-production.up.railway.app";
const UA = "sipply-uptime (+https://github.com/fanyang-888/Sipply-Artificial-Intelligence-news-aggregator)";
// Runs start at 02/08/14/20 UTC and take about 10 minutes
const MAX_HOURS_SINCE_RUN = 8;

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
  return { status: res.status, body: await res.text() };
}

const checks = [
  [
    "home page lists stories",
    async () => {
      const r = await get(`${SITE}/`);
      if (r.status !== 200) return `HTTP ${r.status}`;
      if (!r.body.includes('href="/story/')) return "no story links";
      return null;
    },
  ],
  [
    "a story page opens",
    async () => {
      const home = await get(`${SITE}/`);
      const path = home.body.match(/href="(\/story\/[a-z0-9-]+)"/)?.[1];
      if (!path) return "no story link on the home page";
      const r = await get(`${SITE}${path}`);
      return r.status === 200 && r.body.includes("<h1") ? null : `HTTP ${r.status} for ${path}`;
    },
  ],
  [
    "Chinese home page",
    async () => {
      const r = await get(`${SITE}/zh`);
      return r.status === 200 ? null : `HTTP ${r.status}`;
    },
  ],
  [
    "sitemaps",
    async () => {
      const index = await get(`${SITE}/sitemap.xml`);
      if (index.status !== 200 || !index.body.includes("<sitemapindex")) return `index HTTP ${index.status}`;
      const pages = await get(`${SITE}/sitemaps/pages.xml`);
      return pages.status === 200 && pages.body.includes("<url>") ? null : `pages.xml HTTP ${pages.status}`;
    },
  ],
  [
    "news sitemap has stories from the last two days",
    async () => {
      const r = await get(`${SITE}/news-sitemap.xml`);
      if (r.status !== 200) return `HTTP ${r.status}`;
      return r.body.includes("<url>") ? null : "empty: no new stories in 48 hours";
    },
  ],
  [
    "API answers",
    async () => {
      const health = await get(`${API}/health`);
      if (health.status !== 200) return `/health HTTP ${health.status}`;
      const radar = await get(`${API}/api/radar?limit=1`);
      return radar.status === 200 && JSON.parse(radar.body).topics?.length ? null : `/api/radar HTTP ${radar.status}`;
    },
  ],
  [
    `pipeline ran in the last ${MAX_HOURS_SINCE_RUN} hours`,
    async () => {
      const r = await get(`${API}/api/pipeline-runs?limit=10`);
      if (r.status !== 200) return `HTTP ${r.status}`;
      const last = JSON.parse(r.body).find((run) => run.status === "success" && run.finished_at);
      if (!last) return "no successful run in the last 10";
      const hours = (Date.now() - new Date(last.finished_at).getTime()) / 3_600_000;
      return hours <= MAX_HOURS_SINCE_RUN ? null : `last success ${hours.toFixed(1)} h ago (${last.finished_at})`;
    },
  ],
];

async function attempt(check) {
  let problem = null;
  for (let i = 0; i < 3; i++) {
    try {
      problem = await check();
    } catch (err) {
      problem = String(err?.message ?? err);
    }
    if (!problem) return null;
    if (i < 2) await new Promise((r) => setTimeout(r, 20_000));
  }
  return problem;
}

let failed = 0;
for (const [name, check] of checks) {
  const problem = await attempt(check);
  console.log(`${problem ? "FAIL" : "ok  "}  ${name}${problem ? `: ${problem}` : ""}`);
  if (problem) failed += 1;
}
console.log(failed ? `\n${failed} of ${checks.length} checks failed` : `\nall ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
