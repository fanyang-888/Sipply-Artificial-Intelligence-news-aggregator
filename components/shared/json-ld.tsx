import { serializeJsonLd } from "@/lib/seo/json-ld";

/** schema.org data for crawlers (see lib/seo/json-ld.ts). */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
