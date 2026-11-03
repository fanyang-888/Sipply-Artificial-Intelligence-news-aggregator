# 15. Subscribers confirm their address, and leave with one click

Date: 2026-11-03 · Status: Accepted

## Context
Until now the subscribe box stored any address it was given, and the daily digest went to every stored address. Each digest ended with "To unsubscribe, reply with 'unsubscribe' in the subject". But:
- nothing read those replies, and nothing could: the sender, `digest@sipply.dev`, has no Reply-To, and sipply.dev has no MX record, so a reply bounces;
- anyone could type someone else's address into the box, and that person would then get a daily email with no way to stop it, except marking it as spam. Spam reports hurt the domain's sending reputation, which the operator's alert emails share.

## Decision
- **Double opt-in.** A sign-up stores the address unconfirmed and emails it a link (`/subscribe/confirm?token=…`, or under `/zh` for a Chinese sign-up). Only confirmed subscribers get the digest (`app/services/subscriptions.py`).
  - Signing up again resends the link at most every 15 minutes, so the box can't be used to flood an inbox.
  - If the confirmation email can't be sent, the reader is told (503) and signing up again retries.
  - An address never confirmed is deleted 7 days after its last confirmation email, in the `prune_old_data` stage.
- **Each subscriber has a secret token**, in their confirmation and unsubscribe links. Unsubscribing deletes the address; it doesn't mark it.
- **Every digest carries its subscriber's own unsubscribe link**: in the footer (a page with a button), and as `List-Unsubscribe` with `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058), so Gmail, Yahoo and Apple Mail show their own unsubscribe button.
  - The header names the site (`www.sipply.dev/api/unsubscribe`), which passes the request to the API; a link in an old email keeps working if the API's address changes.
  - Opening the footer link doesn't unsubscribe: mail scanners open links. Leaving takes the button, or the mail client's one-click POST.
  - The API's unsubscribe answers "unsubscribed" for any token, and isn't rate-limited: one-click requests come from a few mail providers' servers, and a token can't be guessed.
- **No email asks for a reply.**
- **Subscribers from before this count as confirmed.** They signed up when there was no confirmation step; from now on each digest lets them leave.

## Consequences
- A sign-up now needs RESEND_API_KEY on the API service too, not only on the cron service.
- A new subscriber's first digest comes only after they click the link; some never will.
- Every digest is built per subscriber (one more string format each), still one Resend call each.
