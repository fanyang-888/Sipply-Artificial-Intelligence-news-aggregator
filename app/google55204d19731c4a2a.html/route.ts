// Google Search Console ownership check for https://www.sipply.dev/ (URL-prefix
// property, HTML file method); Google asks to keep it after verification. A route,
// not public/google….html: the [lang] segment took that path and served a page.
export const dynamic = "force-static";

export function GET() {
  return new Response("google-site-verification: google55204d19731c4a2a.html", {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
