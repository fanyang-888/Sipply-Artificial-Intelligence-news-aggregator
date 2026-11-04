/**
 * The pages a subscriber reaches from an email (/subscribe/confirm, /unsubscribe) are plain
 * HTML forms that post to the site's own routes (app/api/subscribe/confirm, app/api/unsubscribe),
 * which call the API: they work without JavaScript, and without the browser reaching the API.
 */

import type { Lang } from "@/lib/i18n";

/** A subscriber's secret from a link or a form (backend Subscriber.token), or null. */
export function subscriptionToken(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
}

export function formLang(value: unknown): Lang {
  return value === "zh" ? "zh" : "en";
}

/** A POST's form fields (url-encoded or multipart), or null if it has none. */
export async function formFields(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}
