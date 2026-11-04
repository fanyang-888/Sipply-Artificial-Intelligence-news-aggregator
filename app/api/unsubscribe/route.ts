import { postUnsubscribe } from "@/lib/api";
import { localePath } from "@/lib/i18n/routing";
import { formFields, formLang, subscriptionToken } from "@/lib/subscription";

// Two callers:
// - Mail clients' one-click unsubscribe (RFC 8058). Every digest names this address in its
//   List-Unsubscribe header (backend/app/services/email_service.py); the client POSTs
//   "List-Unsubscribe=One-Click" with the token in the query and gets JSON back. The site's
//   address is used, not the API's, so a link in an old email keeps working if the API moves.
// - The button on /unsubscribe, a plain HTML form ("source=page"): it is sent back to the
//   page, which says what happened.

export async function POST(request: Request): Promise<Response> {
  const form = await formFields(request);
  const token = subscriptionToken(new URL(request.url).searchParams.get("token") ?? form?.get("token"));

  if (form?.get("source") !== "page") {
    if (!token) return Response.json({ error: "token required" }, { status: 400 });
    try {
      return Response.json(await postUnsubscribe(token));
    } catch {
      return Response.json({ error: "unsubscribe failed, try again" }, { status: 502 });
    }
  }

  let status = "not_subscribed";
  if (token) {
    try {
      status = (await postUnsubscribe(token)).status;
    } catch {
      status = "error";
    }
  }
  const page = new URL(localePath("/unsubscribe", formLang(form.get("lang"))), request.url);
  page.searchParams.set("status", status);
  if (status === "error" && token) page.searchParams.set("token", token); // offer the button again
  return Response.redirect(page, 303);
}

/** A client that opens the address instead gets the page with the button. */
export function GET(request: Request): Response {
  const token = subscriptionToken(new URL(request.url).searchParams.get("token"));
  const page = new URL("/unsubscribe", request.url);
  if (token) page.searchParams.set("token", token);
  return Response.redirect(page, 303);
}
