# 12. Each language has its own URL

Date: 2026-10-19 · Status: Accepted (replaces the language gate of ADR 11)

## Context
Sipply writes every story in English and Chinese, but until now the Chinese existed only in the
browser: the server rendered English, and a reader who had chosen Chinese got the page
re-rendered on the client. A crawler fetching the home page saw two Chinese characters.
Chinese search engines and AI assistants could not find, read or cite any of the Chinese
summaries, and Chinese readers waited for the scripts behind a hidden page (ADR 11).

## Decision
- **English at the root, Chinese under `/zh`.** `/story/<slug>` and `/zh/story/<slug>`, `/radar` and
  `/zh/radar`, and so on for every public page. Both are rendered on the server: `<html lang>`,
  title, description, structured data (`inLanguage`), the ticker and every word on the page.
- **One page implementation.** All public pages live in `app/[lang]/`. `proxy.ts` rewrites English
  addresses to `lang = "en"` (the URL stays), lets `/zh/…` through, and redirects `/en/…` to the
  address without it, so each page has exactly one URL per language.
- **The pair names itself.** Every page declares its canonical URL and both languages with
  `hreflang` (`x-default` is English). The sitemap lists both languages with their alternates; the
  news sitemap has a Chinese entry for each recent story with a Chinese title.
- **Links stay in the page's language.** `components/shared/link.tsx` prefixes internal links with
  `/zh` on Chinese pages (machine files, admin and other sites are left alone).
- **The reader's choice.** The language buttons remember the choice and open the same page in the
  other language. On an English page, a reader who chose Chinese is sent to the `/zh` address by the
  inline head script before the first paint; crawlers and readers who never chose stay where they are.
- **Admin stays English** with its own root layout.

## Consequences
- Search engines and AI assistants can index and cite the Chinese pages; the site has twice the URLs.
- Chinese readers get server-rendered Chinese at first paint; the hidden-page gate of ADR 11 is gone.
- Share images stay English (their fonts have no Chinese glyphs).
- Pages no longer have a page-wide loading skeleton (only the archive keeps its own), so the server
  answers after its data: missing pages are real 404s and a story URL with old words is a real 308.
  Pages are cached (ISR, 5 minutes), so readers rarely wait for that.
