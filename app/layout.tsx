import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { AppProviders } from "@/components/app-providers";
import { JsonLd } from "@/components/shared/json-ld";
import { SiteFooter } from "@/components/layout/site-footer";
import { TopNav } from "@/components/layout/top-nav";
import { PageShell } from "@/components/layout/page-shell";
import { Ticker } from "@/components/layout/ticker";
import { websiteJsonLd } from "@/lib/seo/json-ld";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/seo/site";
import "./globals.css";

export const metadata: Metadata = {
  // Resolves relative canonical / Open Graph URLs to the canonical origin
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Sipply — Daily AI Intelligence",
    template: "%s | Sipply",
  },
  description: SITE_DESCRIPTION,
  openGraph: { siteName: "Sipply", type: "website", locale: "en_US" },
  twitter: { card: "summary_large_image" },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/logo.png",
  },
};

/** The browser chrome's colour on phones: the dark stage (the default theme). */
export const viewport: Viewport = { themeColor: "#080c12" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The fonts come from Google; opening the connections early shortens the first paint */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('sipply-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}`,
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
