import { OG_CONTENT_TYPE, OG_SIZE, siteCard } from "@/lib/seo/og-card";

export const alt = "Sipply — Daily AI Intelligence";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** The share image for the home page and any page without its own. */
export default function Image() {
  return siteCard();
}
