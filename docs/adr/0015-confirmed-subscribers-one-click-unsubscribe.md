# 15. Subscribers confirm their address, and leave with one click

Date: 2026-11-03 · Status: Accepted

## Context
Until now the subscribe box stored any address it was given, and the daily digest went to every stored address. Each digest ended with "To unsubscribe, reply with 'unsubscribe' in the subject". But:
- nothing read those replies, and nothing could: the sender, `digest@sipply.dev`, has no Reply-To, and sipply.dev has no MX record, so a reply bounces;
- anyone could type someone else's address into the box, and that person would then get a daily email with no way to stop it, except marking it as spam. Spam reports hurt the domain's sending reputation, which the operator's alert emails share.

## Decision
- **Double opt-in.** A sign-up stores the address unconfirmed and emails it a link (`/subscribe/confirm?token=…`, under `/zh` for a Chinese sign-up). Only confirmed subscribers get the digest (`app/services/subscriptions.py`).
  - Signing up again resends the link, at most every 15 minutes and 3 times in all, so the box can't be used to flood an inbox.
  - If the confirmation email can't be sent, the reader is told (503) and signing up again retries.
  - An address never confirmed is deleted 7 days after it signed up, in the `prune_old_data` stage; a resend doesn't postpone that.
- **Each subscriber has a secret token**, in their confirmation and unsubscribe links, and the language they signed up in, for the pages those links open. Unsubscribing deletes the address; it doesn't mark it.
- **Confirming and leaving take a click.** Mail scanners open links, and some run JavaScript, so opening a link changes nothing. Both pages are plain HTML forms rendered on the server: they post to the site's own routes (`app/api/subscribe/confirm`, `app/api/unsubscribe`), which call the API and send the reader back with the outcome. They work without JavaScript, and without the browser reaching the API.
- **Every digest carries its subscriber's own unsubscribe link**: in the footer (the page with the button), and as `List-Unsubscribe` with `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058), so Gmail, Yahoo and Apple Mail show their own unsubscribe button.
  - The header names the site (`www.sipply.dev/api/unsubscribe`), which passes the request to the API; a link in an old email keeps working if the API's address changes. A client that opens the address with GET gets the page.
  - The API answers 200 either way, saying `unsubscribed` or `not_subscribed` (used already, or removed), and the page says which. These endpoints aren't rate-limited: their requests come from the site's servers, and a token can't be guessed.
- **No email asks for a reply.**
- **Subscribers from before this count as confirmed.** They signed up when there was no confirmation step; from now on each digest lets them leave. The token column has a database default too, so the previous release, which may still serve for a moment while the API migrates, can store a sign-up.

## Consequences
- A sign-up now needs RESEND_API_KEY on the API service too, not only on the cron service. `/health` says whether the API can send email (`"mail"`), and the uptime check fails when it can't.
- A new subscriber's first digest comes only after they click the link and the button; some never will.
- Every digest is built per subscriber (one more string format each), still one Resend call each.
- Rolling the services back past this release would send the digest to unconfirmed addresses again: the old code reads every row.
