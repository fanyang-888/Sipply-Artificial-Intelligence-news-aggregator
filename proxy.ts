import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "admin_session";

/**
 * - /admin/*: a light guard; real HMAC validation + JWT auth happen in admin-proxy and FastAPI.
 * - Pages: English lives at the root and is served from app/[lang] with lang "en" (a rewrite,
 *   the address stays); Chinese lives under /zh. /en/… redirects to the address without it,
 *   so every page has one URL per language.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    // Skip the login page to avoid a redirect loop
    if (pathname.startsWith("/admin/login")) return NextResponse.next();
    if (!request.cookies.get(SESSION_COOKIE)?.value) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }
  if (pathname === "/zh" || pathname.startsWith("/zh/")) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/en${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Not: Next's own files, the API routes, the old /cluster/<id> redirect handler, and files
  // with an extension (feed.xml, llms.txt, sitemap.xml, robots.txt, icons, the IndexNow key)
  matcher: ["/((?!_next/|_vercel/|api/|cluster/|.*\\.[A-Za-z0-9]+$).*)"],
};
