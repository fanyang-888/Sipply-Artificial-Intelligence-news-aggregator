# 7. One visual language on every page; motion never takes over scrolling

Date: 2026-10-15 (#83, #85, #91, #105) · Status: Accepted

## Context
The home page was redesigned (DesignCode-style full-screen panels, a portfolio-style story carousel). A polished home page next to old inner pages looked unfinished, and the admin looked like a different product.

## Decision
- Tokens in `app/globals.css` (dark and light sets, not an inversion), type and control styles in `lib/ui/classes.ts`, one `PageHeader` for every page's opening; glass panels with hairline rows; one accent colour.
- Type roles: Fraunces for headlines and section titles, DM Sans for reading, IBM Plex Mono small capitals **only for metadata** (the tagline was removed from the nav for reading as a code label, #105).
- The home page is four panels, one focal point each. The carousel is native horizontal scroll with snap points; vertical scrolling is never hijacked. Reveal-on-enter applies only below the fold, and the server HTML is fully visible without JavaScript or with reduced motion.

## Consequences
- A restyle is a token or primitive change, applied everywhere at once; admin pages follow the theme too.
- Every new component starts from the shared classes instead of inventing its own.
