import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { AppProviders } from "@/components/app-providers";
import { JsonLd } from "@/components/shared/json-ld";
import { SiteFooter } from "@/components/layout/site-footer";
import { TopNav } from "@/components/layout/top-nav";
import { PageShell } from "@/components/layout/page-shell";
import { Ticker } from "@/components/layout/ticker";
import type { Lang } from "@/lib/i18n";
import { FONT_VARIABLES } from "@/lib/fonts";
import { websiteJsonLd } from "@/lib/seo/json-ld";

/**
 * Before the first paint: the theme, and a reader who chose Chinese is sent from an English
 * page to its /zh address (crawlers and readers without a choice stay on the page they asked
 * for). The path test is isLocalizable in lib/i18n/routing.ts.
 */
const HEAD_SCRIPT = `try{var d=document.documentElement;d.setAttribute('data-theme',localStorage.getItem('sipply-theme')||'dark');var l=location,p=l.pathname;if(localStorage.getItem('pai-lang')==='zh'&&!/^\\/zh(\\/|$)/.test(p)&&/^\\/(?:$|(?:story|archive|radar|topics|weekly|daily)(?:\\/|$))/.test(p)){l.replace('/zh'+(p==='/'?'':p)+l.search+l.hash)}}catch(e){}`;

/** The document every page shares: fonts, theme, ticker, nav, main column and footer. */
export function RootDocument({ lang, children }: { lang: Lang; children: ReactNode }) {
  return (
    <html lang={lang === "zh" ? "zh-CN" : "en"} suppressHydrationWarning className={FONT_VARIABLES}>
      {/* Rendered only by the root layouts (app/[lang]/layout.tsx, app/admin/layout.tsx), where
          <head> is the App Router's way; the rule only knows about pages/_document */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        {/* In the <head>, not metadata.alternates: pages set their own alternates
            (canonical, hreflang), which would replace these and drop the feed link */}
        <link rel="alternate" type="application/rss+xml" title="Sipply: the newest AI stories" href="/feed.xml" />
        <script dangerouslySetInnerHTML={{ __html: HEAD_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        <JsonLd data={websiteJsonLd(lang)} />
        <Ticker lang={lang} />
        <AppProviders lang={lang}>
          <TopNav />
          <PageShell>{children}</PageShell>
          <SiteFooter />
        </AppProviders>
        <Analytics />
      </body>
    </html>
  );
}
