/** Site and section titles/descriptions for <head>, structured data and share cards, per language. */

import type { Lang } from "@/lib/i18n";
import { pageAlternates } from "@/lib/i18n/routing";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/seo/site";

type Copy = { title: string; description: string };

const SITE: Record<Lang, Copy> = {
  en: { title: `${SITE_NAME} — ${SITE_TAGLINE}`, description: SITE_DESCRIPTION },
  zh: {
    title: `${SITE_NAME} — AI 新闻，轻松一口`,
    description: "每日 AI 行业简报：汇集 AI 实验室、科技媒体和研究论文的报道，归并成故事、排好顺序，并配上要点和它为什么重要。英文原文与中文译文并列。",
  },
};

const SECTIONS = {
  archive: {
    en: { title: "Archive: every AI story", description: "Every AI story Sipply has synthesized, newest first: searchable by keyword and filtered by category (models, research, funding, products, policy & safety, open source & infra)." },
    zh: { title: "资料库：全部 AI 报道", description: "Sipply 整理过的每一条 AI 报道，按时间倒序：可按关键词搜索，按分类筛选（模型、研究、融资、产品、政策与安全、开源与基建）。" },
  },
  radar: {
    en: { title: "Trend Radar", description: "What the AI community is discussing right now: Hacker News, Bluesky, Lobsters, news, YouTube, DEV and new GitHub repos grouped into topics, scored by volume, engagement and how fast they are rising." },
    zh: { title: "趋势雷达", description: "AI 社区此刻在讨论什么：Hacker News、Bluesky、Lobsters、新闻、YouTube、DEV 和新的 GitHub 项目被归并成话题，按讨论量、互动和升温速度打分。" },
  },
  topics: {
    en: { title: "Companies & models", description: "Every AI story about OpenAI, Anthropic, Google & Gemini, Meta, DeepSeek and other AI companies and model families, one page each." },
    zh: { title: "公司与模型", description: "关于 OpenAI、Anthropic、Google 与 Gemini、Meta、DeepSeek 等 AI 公司和模型家族的全部报道，每家一页。" },
  },
  weekly: {
    en: { title: "Weekly recaps", description: "The week's top AI stories, by category and company, every week." },
    zh: { title: "每周回顾", description: "每周最重要的 AI 报道，按分类和公司整理。" },
  },
  daily: {
    en: { title: "AI news by day", description: "Every AI story Sipply covered, one page per day: what happened first, then papers and newsletters." },
    zh: { title: "每日 AI 新闻", description: "Sipply 报道过的每条 AI 新闻，每天一页：先是当天发生的事，再是论文和简报。" },
  },
} satisfies Record<string, Record<Lang, Copy>>;

export type Section = keyof typeof SECTIONS;

export function siteCopy(lang: Lang): Copy {
  return SITE[lang];
}

export function sectionCopy(section: Section, lang: Lang): Copy {
  return SECTIONS[section][lang];
}

/** The route's language param, "en" for anything unexpected. */
export function asLang(value: string): Lang {
  return value === "zh" ? "zh" : "en";
}

/** <head> for a section page: its title and description in ``lang``, canonical URL and hreflang. */
export function sectionMetadata(section: Section, path: string, lang: Lang): import("next").Metadata {
  const { title, description } = sectionCopy(section, lang);
  const alternates = pageAlternates(path, lang);
  return {
    title,
    description,
    alternates,
    openGraph: { siteName: SITE_NAME, title: `${title} | ${SITE_NAME}`, description, url: alternates.canonical },
  };
}
