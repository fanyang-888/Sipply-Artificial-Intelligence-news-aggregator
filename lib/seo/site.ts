/** Canonical site origin. The apex sipply.dev redirects here, so links and structured data use www. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.sipply.dev").replace(/\/$/, "");

export const SITE_NAME = "Sipply";

/** The brand line, kept in English everywhere (it is the name's own pun: sip · supply · simply). */
export const SITE_TAGLINE = "Sip AI News Simply";

export const SITE_DESCRIPTION =
  "A daily AI-industry digest: reporting from AI labs, tech press and research feeds, grouped into stories, ranked, and summarized with key takeaways and why each one matters.";

export function storyPath(id: string): string {
  return `/cluster/${id}`;
}

export function storyUrl(id: string): string {
  return `${SITE_URL}${storyPath(id)}`;
}
