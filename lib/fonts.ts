import { DM_Sans, Fraunces, IBM_Plex_Mono, Playfair_Display } from "next/font/google";

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

export const FONT_VARIABLES = `${fraunces.variable} ${dmSans.variable} ${plexMono.variable} ${playfair.variable}`;
