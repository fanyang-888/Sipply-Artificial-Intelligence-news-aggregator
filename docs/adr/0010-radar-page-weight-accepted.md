# 10. Keep the radar page's weight for now

Date: 2026-10-16 · Status: Accepted (revisit at the trigger below)

## Context
`/radar` is 660 KB of HTML: 256 KB of hidden topic cards (all 40, for crawlers, ADR 2) and 213 KB of React hydration data. It looked like a problem.

## Decision
Measured before acting: 126 KB over the wire (gzip), Lighthouse mobile performance 97 and LCP 2.3 s, the fastest page on the site. Slimming it means turning the topic cards into server components, a refactor of the radar's interaction for no reader-visible gain. Not done.

## Consequences
Revisit if radar performance drops below 90, LCP passes 2.5 s, or the radar shows more than 40 topics.
