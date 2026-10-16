# 6. Public pages describe the world, never Sipply's own gaps

Date: 2026-10-15 (#81) · Status: Accepted

## Context
The radar showed "Sipply hasn't covered 14 of these 31 topics" and AI-citation stats such as "AI assistants cited Sipply 0 times". These are useful to the editor and undermine a reader's trust.

## Decision
Anything that measures Sipply against the outside world lives behind the admin login: coverage gaps, content briefs for uncovered topics, and Sipply's citation rate (`/admin/gaps`, `/admin/ai-citations`, `/api/admin/*`). Public pages and public API JSON only show positive facts ("✓ On Sipply" links, which sites assistants cite).

## Consequences
- New self-metrics default to admin; exposing one publicly is a deliberate decision.
- The public API can't be used to reconstruct the gap list.
