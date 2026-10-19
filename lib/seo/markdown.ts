/**
 * Plain-markdown versions for machines:
 * - /story/<slug>.md, a story in English then Chinese, linked from the story page's <head>
 *   (rel="alternate" type="text/markdown"); AI search cited .md pages like this (audit 2026-10-18);
 * - /llms-full.txt, the newest stories in full (https://llmstxt.org), next to /llms.txt.
 */

import type { ApiCluster, ApiFeedItem } from "@/lib/api/types";
import { localePath } from "@/lib/i18n/routing";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL, storyPath, storyUrl } from "@/lib/seo/site";

function flat(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function day(iso: string | null | undefined): string | null {
  return iso ? iso.slice(0, 10) : null;
}

export function storyMarkdown(c: ApiCluster): string {
  const zhUrl = `${SITE_URL}${localePath(storyPath(c), "zh")}`;
  const lines: string[] = [`# ${flat(c.title.en)}`, ""];
  const meta = [
    day(c.firstSeenAt) ? `Published: ${day(c.firstSeenAt)}` : null,
    day(c.lastSeenAt) ? `Updated: ${day(c.lastSeenAt)}` : null,
    c.topicTag ? `Category: ${c.topicTag}` : null,
  ].filter(Boolean);
  if (meta.length) lines.push(meta.join(" · "), "");
  lines.push(`Source page: ${storyUrl(c)} · 中文: ${zhUrl}`, "");
  if (c.summary.en) lines.push("## Summary", "", c.summary.en.trim(), "");
  const takeaways = c.takeaways.map((t) => flat(t.en)).filter(Boolean);
  if (takeaways.length) lines.push("## Key takeaways", "", ...takeaways.map((t) => `- ${t}`), "");
  const why = flat(c.whyItMatters.en);
  const readers = [
    ["Product managers", c.audience?.pm?.en],
    ["Developers", c.audience?.developer?.en],
    ["Students and job seekers", c.audience?.studentJobSeeker?.en],
  ].filter(([, text]) => flat(text));
  if (why || readers.length) {
    lines.push("## Why it matters", "");
    if (why) lines.push(why, "");
    if (readers.length) lines.push(...readers.map(([who, text]) => `- **${who}:** ${flat(text)}`), "");
  }
  if (c.articles.length) {
    lines.push("## Sources", "");
    for (const a of c.articles) {
      const about = [a.sourceName, day(a.publishedAt)].filter(Boolean).join(", ");
      lines.push(`- [${flat(a.title)}](${a.url})${about ? ` (${about})` : ""}`);
    }
    lines.push("");
  }
  if (c.title.zh || c.summary.zh) {
    lines.push("## 中文", "", `### ${flat(c.title.zh) || flat(c.title.en)}`, "");
    if (c.summary.zh) lines.push(c.summary.zh.trim(), "");
    const zhTakeaways = c.takeaways.map((t) => flat(t.zh)).filter(Boolean);
    if (zhTakeaways.length) lines.push("**要点：**", "", ...zhTakeaways.map((t) => `- ${t}`), "");
    if (c.whyItMatters.zh) lines.push(`**为什么重要：** ${flat(c.whyItMatters.zh)}`, "");
  }
  lines.push(`---`, `${SITE_NAME}: ${SITE_TAGLINE}. ${SITE_URL}`, "");
  return lines.join("\n");
}

export function llmsFullTxt(items: ApiFeedItem[], now: Date = new Date()): string {
  const lines = [
    `# ${SITE_NAME} — ${SITE_TAGLINE}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `The ${items.length} newest stories in full, as of ${now.toISOString().slice(0, 16)}Z. Each story's page has the ` +
      `takeaways and every source article; a markdown copy is at its address plus ".md", and a Chinese page under ${SITE_URL}/zh. ` +
      `The map of the site is ${SITE_URL}/llms.txt.`,
    "",
  ];
  for (const s of items) {
    lines.push(`## ${flat(s.title)}`, "");
    const meta = [day(s.publishedAt), s.topicTag, storyUrl(s)].filter(Boolean).join(" · ");
    lines.push(meta, "");
    if (s.summary) lines.push(s.summary.trim(), "");
    if (s.whyItMatters) lines.push(`Why it matters: ${flat(s.whyItMatters)}`, "");
    if (s.sourceNames.length) lines.push(`Sources: ${s.sourceNames.join(", ")}`, "");
  }
  return lines.join("\n");
}
