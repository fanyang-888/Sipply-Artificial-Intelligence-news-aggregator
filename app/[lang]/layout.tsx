import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { RootDocument } from "@/components/layout/root-document";
import { LANGS } from "@/lib/i18n/routing";
import { asLang, siteCopy } from "@/lib/seo/copy";
import { SITE_URL } from "@/lib/seo/site";
import "../globals.css";

type Props = { children: ReactNode; params: Promise<{ lang: string }> };

// English pages are served at the root (proxy.ts rewrites them to /en/…), Chinese ones under /zh.
// No "dynamicParams = false" here: child segments inherit it, and every story, topic, week and
// day page (rendered on demand) would 404. The layout rejects other languages itself.
export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = asLang((await params).lang);
  const copy = siteCopy(lang);
  return {
    // Resolves relative canonical / Open Graph URLs to the canonical origin
    metadataBase: new URL(SITE_URL),
    title: { default: copy.title, template: "%s | Sipply" },
    description: copy.description,
    openGraph: {
      siteName: "Sipply",
      type: "website",
      locale: lang === "zh" ? "zh_CN" : "en_US",
      alternateLocale: lang === "zh" ? "en_US" : "zh_CN",
    },
    // Search Console / Bing Webmaster ownership tags: set the tokens in Vercel's env, no code change
    verification: {
      google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
      other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
    },
    twitter: { card: "summary_large_image" },
    icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }], apple: "/logo.png" },
  };
}

/** The browser chrome's colour on phones: the dark stage (the default theme). */
export const viewport: Viewport = { themeColor: "#080c12" };

export default async function LangLayout({ children, params }: Props) {
  const { lang } = await params;
  if (lang !== "en" && lang !== "zh") notFound();
  return <RootDocument lang={lang}>{children}</RootDocument>;
}
