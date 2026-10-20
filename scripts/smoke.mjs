#!/usr/bin/env node
/**
 * Smoke test: fetch every kind of page as a crawler would (raw HTML, no
 * JavaScript) and check that the content, structured data and machine entry
 * points are there. Catches what unit tests and tsc can't, such as a page
 * whose server HTML carries a loading skeleton instead of its stories.
 *
 *   node scripts/smoke.mjs http://localhost:3000     # a `next start` build
 *   node scripts/smoke.mjs https://www.sipply.dev    # production
 *
 * Exits 1 if any check fails.
 */

const BASE = (process.argv[2] || process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const UA = "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot) sipply-smoke";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
}

async function get(path) {
  const res = await fetch(BASE + path, { headers: { "User-Agent": UA }, redirect: "follow" });
  const type = res.headers.get("content-type") || "";
  const body = type.startsWith("image/") ? "" : await res.text();
  if (type.startsWith("image/")) await res.arrayBuffer();
  return { status: res.status, type, body };
}

function jsonLdTypes(html) {
  const types = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) {
    try {
      const data = JSON.parse(m[1]);
      for (const node of data["@graph"] ?? [data]) types.push(node["@type"]);
    } catch {
      types.push("INVALID");
    }
  }
  return types;
}

const links = (html, prefix) => [...new Set([...html.matchAll(new RegExp(`href="(${prefix}[^"#?]+)"`, "g"))].map((m) => m[1]))];
const meta = (html, key) => html.match(new RegExp(`(?:property|name)="${key}" content="([^"]*)"`))?.[1];
const title = (html) => html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
// A feed entity that survived decoding shows up escaped once more ("&amp;#8217;")
const doubleEscaped = (html) => /&amp;#\d+;/.test(html);

async function page(path, { minLinks = 0, linkPrefix = "/story/", ld = [], label = path } = {}) {
  const { status, body } = await get(path);
  check(`${label} 200`, status === 200, `status ${status}`);
  if (status !== 200) return body;
  check(`${label} has a title`, title(body).includes("Sipply"), title(body));
  check(`${label} has a canonical URL`, /rel="canonical" href="https:\/\/www\.sipply\.dev/.test(body));
  const types = jsonLdTypes(body);
  for (const t of ["WebSite", ...ld]) check(`${label} JSON-LD ${t}`, types.includes(t), types.join(", "));
  check(`${label} JSON-LD parses`, !types.includes("INVALID"));
  if (minLinks) {
    const n = links(body, linkPrefix).length;
    check(`${label} ≥${minLinks} ${linkPrefix} links in the HTML`, n >= minLinks, `${n} found`);
  }
  check(`${label} no double-escaped entities`, !doubleEscaped(body));
  check(`${label} has the site footer`, body.includes("<footer"));
  return body;
}

async function main() {
  console.log(`smoke: ${BASE}\n`);

  const home = await page("/", { minLinks: 5, ld: ["ItemList"], label: "home" });
  // Rendered on the server, not added after load: a line that appears late pushes the headline down
  check("home has the date line in the HTML", /(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day, [A-Z][a-z]+ \d{1,2}, \d{4}/.test(home));

  const story = links(home, "/story/")[0];
  if (story) {
    const html = await page(story, { ld: ["NewsArticle", "BreadcrumbList"], label: "story" });
    check("story's canonical URL is its /story/ address", html.includes(`rel="canonical" href="https://www.sipply.dev${story}"`));
    // The old address answers a real 308 to the new one (not a page that redirects after loading)
    // The page's data (RSC payload) escapes its quotes: \"id\":\"…\"
    const id = html.match(/\\?"id\\?":\\?"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)?.[1];
    const old = id ? await fetch(`${BASE}/cluster/${id}`, { redirect: "manual", headers: { "User-Agent": UA } }) : null;
    check(
      "old /cluster/<id> URL redirects 308 to the story",
      old !== null && old.status === 308 && (old.headers.get("location") || "").endsWith(story),
      old ? `${old.status} → ${old.headers.get("location")}` : "no story id in the page",
    );
    check("story has a headline", /<h1[^>]*>\s*\S/.test(html));
    check("story og:image", Boolean(meta(html, "og:image")));
    check("story article:published_time", Boolean(meta(html, "article:published_time")));
    const md = await get(`${story}.md`);
    check("story's markdown copy", md.status === 200 && md.body.startsWith("# ") && md.body.includes("## Sources"), `${md.status}`);
    check("story page links its markdown copy", html.includes(`type="text/markdown" href="https://www.sipply.dev${story}.md"`));
    const og = await get(`${story}/opengraph-image`);
    check("story share image is a PNG", og.status === 200 && og.type.startsWith("image/png"), `${og.status} ${og.type}`);
  } else {
    check("home links to a story", false);
  }

  await page("/archive", { minLinks: 10, ld: ["CollectionPage"], label: "archive" });
  const radar = await page("/radar", { label: "radar" });
  check("radar draws its chart", radar.includes("<svg"));

  const topics = await page("/topics", { minLinks: 5, linkPrefix: "/topics/", ld: ["CollectionPage"], label: "topics" });
  const topic = links(topics, "/topics/")[0];
  if (topic) await page(topic, { minLinks: 1, ld: ["BreadcrumbList", "CollectionPage"], label: "topic page" });

  const weekly = await page("/weekly", { minLinks: 1, linkPrefix: "/weekly/", ld: ["CollectionPage"], label: "weekly" });
  const week = links(weekly, "/weekly/")[0];
  if (week) await page(week, { minLinks: 1, ld: ["BreadcrumbList", "CollectionPage"], label: "week page" });

  const daily = await page("/daily", { minLinks: 1, linkPrefix: "/daily/", ld: ["CollectionPage"], label: "daily" });
  const day = links(daily, "/daily/")[0];
  if (day) await page(day, { minLinks: 1, ld: ["BreadcrumbList", "CollectionPage"], label: "day page" });
  else check("daily lists a day", false);

  const feed = await get("/feed.xml");
  const feedItems = (feed.body.match(/<item>/g) || []).length;
  check("RSS feed has ≥10 stories", feed.status === 200 && feed.type.includes("rss") && feedItems >= 10, `${feed.status} ${feed.type} ${feedItems} items`);
  check("home links its RSS feed", /rel="alternate" type="application\/rss\+xml"[^>]*href="\/feed\.xml"/.test(home));

  const news = await get("/news-sitemap.xml");
  check(
    "news sitemap lists recent stories",
    news.status === 200 && news.body.includes("sitemap-news/0.9") && /<news:publication_date>/.test(news.body),
    `${news.status}, ${(news.body.match(/<url>/g) || []).length} URLs`,
  );

  // Chinese: every page has a server-rendered /zh twin, and the two name each other (hreflang)
  check("home names its Chinese page (hreflang)", /hrefLang="zh-CN" href="https:\/\/www\.sipply\.dev\/zh"/i.test(home));
  const zhHome = await page("/zh", { minLinks: 5, linkPrefix: "/zh/story/", ld: ["ItemList"], label: "zh home" });
  check("zh home is <html lang=zh-CN>", /<html[^>]*lang="zh-CN"/.test(zhHome));
  check("zh home's canonical URL is /zh", zhHome.includes('rel="canonical" href="https://www.sipply.dev/zh"'));
  check("zh home is in Chinese in the HTML", (zhHome.match(/[\u4e00-\u9fff]/g) || []).length > 500);
  const zhStory = links(zhHome, "/zh/story/")[0];
  if (zhStory) {
    const html = await page(zhStory, { ld: ["NewsArticle", "BreadcrumbList"], label: "zh story" });
    check("zh story is <html lang=zh-CN>", /<html[^>]*lang="zh-CN"/.test(html));
    check("zh story's structured data is in Chinese", html.includes('"inLanguage":"zh-CN"'));
    check("zh story names its English page (hreflang)", /hrefLang="en" href="https:\/\/www\.sipply\.dev\/story\//i.test(html));
  } else {
    check("zh home links to a zh story", false);
  }
  const en = await fetch(`${BASE}/en/radar`, { redirect: "manual", headers: { "User-Agent": UA } });
  check("/en/… redirects 308 to the address without it", en.status === 308 && (en.headers.get("location") || "").endsWith("/radar"), `${en.status}`);
  const zhMissing = await get("/zh/no-such-page-smoke-test");
  check("unknown zh URL is a 404", zhMissing.status === 404, `status ${zhMissing.status}`);

  const missing = await get("/no-such-page-smoke-test");
  check("unknown URL is a 404", missing.status === 404, `status ${missing.status}`);

  const admin = await get("/admin/login");
  check("admin is noindex", /name="robots" content="noindex/.test(admin.body));

  const card = await get("/opengraph-image");
  check("site share image is a PNG", card.status === 200 && card.type.startsWith("image/png"), `${card.status} ${card.type}`);

  // /sitemap.xml is an index of smaller sitemaps (lib/seo/sitemap.ts)
  const sitemap = await get("/sitemap.xml");
  const files = [...sitemap.body.matchAll(/<loc>https:\/\/www\.sipply\.dev(\/sitemaps\/[^<]+)<\/loc>/g)].map((m) => m[1]);
  check("sitemap index lists the pages and story sitemaps", sitemap.status === 200 && sitemap.body.includes("<sitemapindex") && files.includes("/sitemaps/pages.xml") && files.some((f) => f.startsWith("/sitemaps/stories-")), files.join(" "));
  const pagesMap = await get("/sitemaps/pages.xml");
  const pageLocs = (pagesMap.body.match(/<loc>/g) || []).length;
  check("pages sitemap lists ≥10 URLs", pagesMap.status === 200 && pageLocs >= 10, `${pageLocs} URLs`);
  const storiesMap = await get(files.find((f) => f.startsWith("/sitemaps/stories-")) ?? "/sitemaps/stories-0.xml");
  check("story sitemaps list the Chinese pages", storiesMap.status === 200 && storiesMap.body.includes("<loc>https://www.sipply.dev/zh/story/"));

  const robots = await get("/robots.txt");
  check("robots.txt points to the sitemap", robots.status === 200 && robots.body.includes("Sitemap:"));
  check("robots.txt points to the news sitemap", robots.body.includes("/news-sitemap.xml"));

  const full = await get("/llms-full.txt");
  check("llms-full.txt has the newest stories in full", full.status === 200 && full.body.startsWith("# Sipply") && (full.body.match(/^## /gm) || []).length >= 10);

  const llms = await get("/llms.txt");
  check("llms.txt starts with the site name", llms.status === 200 && llms.body.startsWith("# Sipply"));

  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? "  ok  " : "  FAIL"}  ${r.name}${r.ok || !r.detail ? "" : `  (${r.detail})`}`);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("smoke: could not run:", err);
  process.exit(1);
});
