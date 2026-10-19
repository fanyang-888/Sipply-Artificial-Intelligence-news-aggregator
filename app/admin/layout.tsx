import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { RootDocument } from "@/components/layout/root-document";
import { SITE_URL } from "@/lib/seo/site";
import "../globals.css";

/** Nothing under /admin is for search engines (robots.txt disallows it too). English only. */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Sipply admin", template: "%s | Sipply admin" },
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = { themeColor: "#080c12" };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <RootDocument lang="en">{children}</RootDocument>;
}
