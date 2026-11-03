import { postConfirmSubscription } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { localePath } from "@/lib/i18n/routing";
import { formFields, formLang, subscriptionToken } from "@/lib/subscription";

// The button on /subscribe/confirm, a plain HTML form. Confirming takes the click, not just
// opening the emailed link: mail scanners open links, and must not confirm a sign-up someone
// else typed in. The reader is sent back to the page, which says what happened.

export async function POST(request: Request): Promise<Response> {
  const form = await formFields(request);
  const token = subscriptionToken(form?.get("token"));

  let status = "invalid";
  if (token) {
    try {
      status = (await postConfirmSubscription(token)).status;
    } catch (err) {
      status = err instanceof ApiError && err.status === 404 ? "invalid" : "error";
    }
  }
  const page = new URL(localePath("/subscribe/confirm", formLang(form?.get("lang"))), request.url);
  page.searchParams.set("status", status);
  if (status === "error" && token) page.searchParams.set("token", token); // offer the button again
  return Response.redirect(page, 303);
}
