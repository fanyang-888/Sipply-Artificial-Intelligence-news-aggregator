"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { useI18n } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/routing";

/**
 * next/link in the page's language: on a Chinese page "/radar" goes to "/zh/radar".
 * Machine files, admin, the API and other sites are left as they are (localePath).
 */
export default function Link({ href, ...rest }: ComponentProps<typeof NextLink>) {
  const { lang } = useI18n();
  const localized =
    typeof href === "string"
      ? localePath(href, lang)
      : href.pathname
        ? { ...href, pathname: localePath(href.pathname, lang) }
        : href;
  return <NextLink href={localized} {...rest} />;
}
