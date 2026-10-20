/**
 * How long the site caches API data, and the tags the pipeline uses to refresh it.
 *
 * Vercel stores each rebuilt page (an ISR write; the Hobby plan includes 200K write units
 * a month, used up by 2026-10-20) and no two rebuilds of a page are byte for byte the same,
 * so pages are cached for long and the pipeline marks what each run changed
 * (POST /api/revalidate, app/api/revalidate/route.ts; backend/app/services/site_revalidate.py):
 * - data that changes with every run carries RUN_TAG and lives a day at most;
 * - a story's data carries its own tags and lives a week at most.
 */

export const RUN_TAG = "run";
export const RUN_TTL = 86_400;
export const STORY_TTL = 604_800;

/** The tags of a story's cached data; the pipeline sends the same strings for a story it changed. */
export const storySlugTag = (slug: string) => `story:${slug}`;
export const storyIdTag = (id: string) => `story-id:${id}`;

const TAG = /^(?:run|story:[a-z0-9-]{1,120}|story-id:[0-9a-f-]{36})$/;

/** One of the tags above (anything else in a revalidate request is refused). */
export function isCacheTag(tag: unknown): tag is string {
  return typeof tag === "string" && TAG.test(tag);
}
