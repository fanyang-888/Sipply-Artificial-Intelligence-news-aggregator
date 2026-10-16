# 11. A page is visible as soon as its HTML arrives

Date: 2026-10-16 (#116, #117) · Status: Accepted

## Context
ADR 10's trigger fired: radar Lighthouse performance 88, LCP 3.9 s. The radar's weight was not the cause, because every page had an LCP of about 4 s on slow 4G. A throttled browser loop showed the reason. The HTML and fonts had arrived by 1.9 s, yet the page stayed black except for the ticker until about 4 s.

The cause was a language gate from the first i18n work. It rendered the whole page at `opacity-0` until React had hydrated and read the saved language, to spare Chinese readers a flash of English. It hid the page from everyone, and with JavaScript off the page never appeared at all. That broke ADR 2 in a way no crawler check caught, because the text was in the HTML, just invisible.

## Decision
- **No hiding by default.** The server HTML is shown as it arrives; nothing in the page shell carries a class that hides it.
- **Gate only the readers it concerns.** When something has to wait for the client, here a saved language, the inline head script sets a flag before first paint, and CSS hides the page only while the flag is there. Today that flag is `data-lang-gate`, set when `pai-lang` is `zh`.
- **A fallback that doesn't need the scripts.** The same CSS opens the gate after 4 s, so a reader whose scripts fail still gets a page.
- **A test that guards it.** A unit test renders the page shell on the server and fails if anything above `<main>` hides it.
- **A browser check in CI that guards all of it** (`scripts/stability.mjs`, #119). The smoke job loads every kind of page in Chrome on a throttled phone (Lighthouse's slow 4G, 4× CPU), twice. A page fails if its largest paint comes more than 1 s after its first, if a loading skeleton (`aria-busy`) appears in `<main>` after the first paint, or if layout shift reaches 0.05. With JavaScript off, `<main>` and everything around it must be fully opaque. Reintroducing #116's `opacity-0` or removing #117's `startTransition` fails it.

## Consequences
- On slow 4G with a 4× slower CPU, home LCP went from 4.0 s to 1.6 s and radar from 4.0 s to 1.6–1.9 s; LCP now equals the first paint.
- Readers without JavaScript see the page again.
- Readers who chose Chinese still wait for hydration, about 4 s on slow 4G, in exchange for no flash of English. Rendering Chinese on the server, through a cookie or `/zh` URLs, would remove that wait and is the next step if it matters.
- Layout shifts are now visible too. While the page was hidden, nothing that moved during loading counted; once it showed, Lighthouse measured layout shift up to 0.79. #117 removed the three causes:
  - The language provider updated its context right after mount. If the page's Suspense boundary was still hydrating, React dropped the server HTML, showed the loading skeleton for about 300 ms and rendered the page again. The update now runs in `startTransition`, so React finishes hydrating first.
  - The home date line was added after mount, which wrapped it on phones. It is now rendered on the server in UTC and then switched to the reader's local date.
  - The mono font's generated fallback was Arial scaled to 135%, which set labels at different widths. It is now a system monospace.
  The rule that follows: anything that appears or changes size after load needs its space in the server HTML, and updates that start right after mount go in a transition.
- ADR 10 stands: the radar's weight was not what slowed it.
- When Lighthouse reports a slow LCP, look at a screenshot of the first seconds before suspecting fonts or bundle size.
