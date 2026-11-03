import { postUnsubscribe } from "@/lib/api";

// Mail clients' one-click unsubscribe (RFC 8058). Every digest names this address in its
// List-Unsubscribe header (backend/app/services/email_service.py) and the client POSTs
// "List-Unsubscribe=One-Click" here; the API deletes the subscriber. The site's address is
// used, not the API's, so a link in an old email keeps working if the API moves.

const MAX_TOKEN = 64;

function tokenOf(request: Request): string | null {
  const token = new URL(request.url).searchParams.get("token");
  return token && token.length <= MAX_TOKEN ? token : null;
}

export async function POST(request: Request): Promise<Response> {
  const token = tokenOf(request);
  if (!token) return Response.json({ error: "token required" }, { status: 400 });
  try {
    await postUnsubscribe(token);
  } catch {
    return Response.json({ error: "unsubscribe failed, try again" }, { status: 502 });
  }
  return Response.json({ status: "unsubscribed" });
}

/** A client that opens the address instead gets the page with the button. */
export function GET(request: Request): Response {
  const token = tokenOf(request);
  const page = new URL("/unsubscribe", request.url);
  if (token) page.searchParams.set("token", token);
  return Response.redirect(page, 303);
}
