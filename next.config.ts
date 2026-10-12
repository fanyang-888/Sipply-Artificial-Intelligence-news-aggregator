import type { NextConfig } from "next";
import path from "path";

const pagesBasePath = process.env.PAGES_BASE_PATH ?? "";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:8000";

const securityHeaders = [
  // Prevent iframe embedding (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  // Stop MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Only send origin in Referer, not full URL
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Enforce HTTPS for 1 year
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  // Disable unused browser features
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // CSP — 'unsafe-inline' required for Next.js inline scripts + Tailwind
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      `connect-src 'self' ${API_BASE} https://vitals.vercel-insights.com`,
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

// Bots that need <head> metadata in the first bytes (no streamed metadata).
// Next's default list (next/dist/shared/lib/router/utils/html-bots.js, 16.2) —
// setting this option replaces it, so it is copied — plus AI search/assistant crawlers.
const HTML_LIMITED_BOTS = new RegExp(
  [
    "[\\w-]+-Google|Google-[\\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou",
    "bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot",
    "facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp",
    "SkypeUriPreview|Yeti|googleweblight",
    "GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-SearchBot|Claude-User|anthropic-ai",
    "PerplexityBot|Perplexity-User|CCBot|Amazonbot|meta-externalagent",
  ].join("|"),
  "i",
);

const nextConfig: NextConfig = {
  htmlLimitedBots: HTML_LIMITED_BOTS,
  ...(pagesBasePath
    ? { basePath: pagesBasePath, assetPrefix: pagesBasePath }
    : {}),
  images: {
    unoptimized: true,
  },
  // Avoid picking ~/package-lock.json when another lockfile exists up the tree
  turbopack: {
    root: path.join(__dirname),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  // The LinkedIn-draft feature was retired; old shared links land on the digest
  async redirects() {
    return [
      { source: "/draft/:path*", destination: "/", permanent: true },
      { source: "/admin/drafts", destination: "/admin", permanent: true },
    ];
  },
};

export default nextConfig;
