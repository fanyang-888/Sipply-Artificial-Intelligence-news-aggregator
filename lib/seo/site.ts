/** Canonical site origin. The apex sipply.dev redirects here, so links and structured data use www. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.sipply.dev").replace(/\/$/, "");

export const SITE_NAME = "Sipply";

/** The brand line, kept in English everywhere (it is the name's own pun: sip · supply · simply). */
export const SITE_TAGLINE = "Sip AI News Simply";

export const SITE_DESCRIPTION =
  "A daily AI-industry digest: reporting from AI labs, tech press and research feeds, grouped into stories, ranked, and summarized with key takeaways and why each one matters.";

/** Anything that names a story: its id, and its slug when the API sends one. */
export type StoryRef = { id: string; slug?: string | null };

/**
 * A story's address: /story/<slug> (keyword URL, permanent). Without a slug (an API
 * from before slugs) the old /cluster/<id>, which redirects to it.
 */
export function storyPath(story: StoryRef): string {
  return story.slug ? `/story/${story.slug}` : `/cluster/${story.id}`;
}

export function storyUrl(story: StoryRef): string {
  return `${SITE_URL}${storyPath(story)}`;
}
