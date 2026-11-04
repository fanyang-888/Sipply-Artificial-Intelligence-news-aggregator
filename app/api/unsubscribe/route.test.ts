import { beforeEach, describe, expect, it, vi } from "vitest";

const postUnsubscribe = vi.fn();
vi.mock("@/lib/api", () => ({ postUnsubscribe: (token: string) => postUnsubscribe(token) }));

const { GET, POST } = await import("./route");

const TOKEN = "Zk3y_test-token-not-real";

function oneClick(query: string, type = "application/x-www-form-urlencoded") {
  // What a mail client sends for a List-Unsubscribe-Post header (RFC 8058)
  const body = type.startsWith("multipart") ? (() => { const f = new FormData(); f.set("List-Unsubscribe", "One-Click"); return f; })() : "List-Unsubscribe=One-Click";
  return new Request(`https://www.sipply.dev/api/unsubscribe${query}`, {
    method: "POST",
    headers: type.startsWith("multipart") ? undefined : { "Content-Type": type },
    body,
  });
}

function pageForm(fields: Record<string, string>) {
  // The button on /unsubscribe: a plain HTML form, so it works without JavaScript
  return new Request("https://www.sipply.dev/api/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ source: "page", ...fields }).toString(),
  });
}

describe("/api/unsubscribe", () => {
  beforeEach(() => {
    postUnsubscribe.mockReset();
    postUnsubscribe.mockResolvedValue({ status: "unsubscribed" });
  });

  it("passes a mail client's one-click unsubscribe on to the API, form-encoded or multipart", async () => {
    for (const type of ["application/x-www-form-urlencoded", "multipart/form-data"]) {
      const res = await POST(oneClick(`?token=${TOKEN}`, type));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "unsubscribed" });
    }
    expect(postUnsubscribe).toHaveBeenCalledTimes(2);
    expect(postUnsubscribe).toHaveBeenCalledWith(TOKEN);
  });

  it("tells a mail client when the API couldn't do it, so it can try again", async () => {
    postUnsubscribe.mockRejectedValue(new Error("API down"));
    expect((await POST(oneClick(`?token=${TOKEN}`))).status).toBe(502);
  });

  it("refuses a request without a usable token", async () => {
    expect((await POST(oneClick(""))).status).toBe(400);
    expect((await POST(oneClick(`?token=${"x".repeat(65)}`))).status).toBe(400);
    expect(postUnsubscribe).not.toHaveBeenCalled();
  });

  it("sends the page's button back to the page, in its language, with what happened", async () => {
    let res = await POST(pageForm({ token: TOKEN, lang: "en" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://www.sipply.dev/unsubscribe?status=unsubscribed");

    postUnsubscribe.mockResolvedValue({ status: "not_subscribed" });
    res = await POST(pageForm({ token: TOKEN, lang: "zh" }));
    expect(res.headers.get("location")).toBe("https://www.sipply.dev/zh/unsubscribe?status=not_subscribed");
  });

  it("offers the button again when the API failed", async () => {
    postUnsubscribe.mockRejectedValue(new Error("API down"));
    const res = await POST(pageForm({ token: TOKEN, lang: "en" }));
    expect(res.headers.get("location")).toBe(`https://www.sipply.dev/unsubscribe?status=error&token=${TOKEN}`);
  });

  it("sends a client that opens the address to the page with the button, unsubscribing no one", async () => {
    const res = GET(new Request(`https://www.sipply.dev/api/unsubscribe?token=${TOKEN}`));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`https://www.sipply.dev/unsubscribe?token=${TOKEN}`);
    expect(postUnsubscribe).not.toHaveBeenCalled();
  });
});
