/**
 * Share images (Open Graph / Twitter cards) in the site's own language: a
 * near-black stage, one light behind a Fraunces headline, mono micro-labels,
 * the wordmark in the corner. Used by every `opengraph-image.tsx`.
 */

import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/seo/site";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const INK = "#d4e4f7";
const SOFT = "#a9bdd3";
const MUTED = "#5a7a9a";
const ACCENT = "#4a9eff";
const BG = "#080c12";

type GoogleFont = { name: string; weight: 300 | 400; data: ArrayBuffer };

const fontCache = new Map<string, Promise<GoogleFont | null>>();

/**
 * One weight of a Google font as woff/ttf (what Google serves to a client that
 * doesn't advertise woff2). Cached per server instance; null when the fetch
 * fails, in which case the card falls back to ImageResponse's built-in font.
 */
function googleFont(family: string, weight: 300 | 400): Promise<GoogleFont | null> {
  const key = `${family}:${weight}`;
  let pending = fontCache.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1; rv:5.0) Gecko/20100101 Firefox/5.0" },
          next: { revalidate: 86_400 },
        }).then((r) => (r.ok ? r.text() : ""));
        // Google answers this client with woff (or ttf); ImageResponse reads both
        const url = css.match(/src:\s*url\(([^)]+\.(?:ttf|woff))\)/)?.[1];
        if (!url) return null;
        const data = await fetch(url, { next: { revalidate: 86_400 } }).then((r) => (r.ok ? r.arrayBuffer() : null));
        return data ? { name: family, weight, data } : null;
      } catch {
        return null;
      }
    })();
    fontCache.set(key, pending);
    // A failed fetch shouldn't be remembered forever
    pending.then((font) => {
      if (!font) fontCache.delete(key);
    });
  }
  return pending;
}

export type OgCardProps = {
  /** Mono capitals above the headline; the first item is in the accent colour. */
  eyebrow: string[];
  title: string;
  /** One or two lines under the headline. */
  subtitle?: string;
};

/** At most `max` characters, cut at a word, with an ellipsis (two mono lines at 24px hold about 135). */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,;:\s]+$/, "")}…`;
}

/** Headline size by length, so long titles still fit in three lines. */
function titleSize(title: string): number {
  if (title.length <= 48) return 82;
  if (title.length <= 80) return 68;
  if (title.length <= 110) return 58;
  return 50;
}

export async function ogCard({ eyebrow, title, subtitle }: OgCardProps): Promise<ImageResponse> {
  const [fraunces, mono] = await Promise.all([googleFont("Fraunces", 300), googleFont("IBM Plex Mono", 400)]);
  const fonts = [fraunces, mono].filter((f): f is GoogleFont => f !== null);
  const serif = fraunces ? "Fraunces" : "serif";
  const monoFamily = mono ? "IBM Plex Mono" : "monospace";
  const size = titleSize(title);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 72px 56px",
          background: BG,
          color: INK,
          fontFamily: serif,
          position: "relative",
        }}
      >
        {/* The one light on the card */}
        <div
          style={{
            position: "absolute",
            top: -300,
            left: 180,
            width: 840,
            height: 560,
            borderRadius: 9999,
            // Fades out well inside the box, so the box's edge never shows
            background: "radial-gradient(closest-side, rgba(74,158,255,.32) 0%, rgba(74,158,255,.10) 40%, rgba(74,158,255,0) 68%)",
          }}
        />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontFamily: monoFamily,
              fontSize: 21,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            {eyebrow.map((item, i) => (
              <span key={i} style={{ display: "flex", color: i === 0 ? ACCENT : MUTED, marginRight: 22 }}>
                {i > 0 ? <span style={{ marginRight: 22, color: MUTED }}>·</span> : null}
                {item}
              </span>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 30,
              maxHeight: Math.round(size * 1.08) * 3,
              overflow: "hidden",
              fontSize: size,
              fontWeight: 300,
              lineHeight: `${Math.round(size * 1.08)}px`,
              letterSpacing: "-0.02em",
              color: INK,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                display: "flex",
                marginTop: 26,
                maxWidth: 1000,
                maxHeight: 72,
                overflow: "hidden",
                fontFamily: monoFamily,
                fontSize: 24,
                lineHeight: "36px",
                color: SOFT,
              }}
            >
              {clip(subtitle, 130)}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 300, letterSpacing: "-0.01em" }}>
            <span>Sip</span>
            <span style={{ color: ACCENT }}>ply</span>
          </div>
          <div style={{ display: "flex", fontFamily: monoFamily, fontSize: 20, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED }}>
            sipply.dev
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      // An empty list would leave ImageResponse with no font at all; omit it to get its built-in one
      ...(fonts.length > 0
        ? { fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: "normal" as const })) }
        : {}),
    },
  );
}

/** The site's own card, also the fallback when a page's data can't be read. */
export function siteCard(): Promise<ImageResponse> {
  return ogCard({
    eyebrow: ["Daily AI intelligence"],
    title: `${SITE_NAME} — the day's AI news, grouped into stories and ranked`,
    subtitle: "Reporting from AI labs, tech press and research feeds, with key takeaways and why each story matters.",
  });
}
