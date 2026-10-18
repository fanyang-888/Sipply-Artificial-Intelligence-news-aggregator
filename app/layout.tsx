import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces, IBM_Plex_Mono, Playfair_Display } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AppProviders } from "@/components/app-providers";
import { JsonLd } from "@/components/shared/json-ld";
import { SiteFooter } from "@/components/layout/site-footer";
import { TopNav } from "@/components/layout/top-nav";
import { PageShell } from "@/components/layout/page-shell";
import { Ticker } from "@/components/layout/ticker";
import { websiteJsonLd } from "@/lib/seo/json-ld";
import { SITE_DESCRIPTION, SITE_TAGLINE, SITE_URL } from "@/lib/seo/site";
import "./globals.css";

export const metadata: Metadata = {
  // Resolves relative canonical / Open Graph URLs to the canonical origin
  metadataBase: new URL(SITE_URL),
  title: {
    default: `Sipply — ${SITE_TAGLINE}`,
    template: "%s | Sipply",
  },
  description: SITE_DESCRIPTION,
  openGraph: { siteName: "Sipply", type: "website", locale: "en_US" },
  // Search Console / Bing Webmaster ownership tags: set the tokens in Vercel's env, no code change
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
  twitter: { card: "summary_large_image" },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/logo.png",
  },
};

// Self-hosted at build time: no request to Google from the reader's browser, preloaded,
// and no CSS → font-CSS → font chain blocking the first paint. Fraunces is the LCP headline.
const fraunces = Fraunces({ subsets: ["latin"], axes: ["opsz"], variable: "--font-fraunces", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
// Mono labels fall back to a system monospace, not next/font's generated face (Arial scaled
// 135%): monospace widths match Plex Mono's 0.6em, so when the font swaps in nothing rewraps.
// The Arial fallback rewrapped labels and pushed whole pages down (CLS up to 0.79).
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", "monospace"],
});
// Only the wordmark, at 900; it is in the nav on every page, so it loads with the page
const playfair = Playfair_Display({ subsets: ["latin"], weight: "900", variable: "--font-playfair", display: "swap" });

/** The browser chrome's colour on phones: the dark stage (the default theme). */
export const viewport: Viewport = { themeColor: "#080c12" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${dmSans.variable} ${plexMono.variable} ${playfair.variable}`}
    >
      <head>
        {/* In the layout's <head>, not metadata.alternates: pages set their own alternates
            (canonical), which would replace the layout's and drop the feed link */}
        <link rel="alternate" type="application/rss+xml" title="Sipply: the newest AI stories" href="/feed.xml" />
        <script
          dangerouslySetInnerHTML={{
            // Theme before first paint. A reader who chose Chinese gets data-lang-gate, which hides
            // the page until the client has switched it to Chinese (no English flash); everyone
            // else, crawlers and readers without JavaScript see the server HTML at once.
            __html: `try{var d=document.documentElement;d.setAttribute('data-theme',localStorage.getItem('sipply-theme')||'dark');if(localStorage.getItem('pai-lang')==='zh')d.setAttribute('data-lang-gate','');}catch(e){}`,
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        <JsonLd data={websiteJsonLd()} />
        <Ticker />
        <AppProviders>
          <TopNav />
          <PageShell>{children}</PageShell>
          <SiteFooter />
        </AppProviders>
        <Analytics />
      </body>
    </html>
  );
}
