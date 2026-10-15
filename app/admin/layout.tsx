import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Nothing under /admin is for search engines (robots.txt disallows it too). */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
