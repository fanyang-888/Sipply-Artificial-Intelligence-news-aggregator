import { beforeEach, describe, expect, it, vi } from "vitest";

const postUnsubscribe = vi.fn();
vi.mock("@/lib/api", () => ({ postUnsubscribe: (token: string) => postUnsubscribe(token) }));

const { GET, POST } = await import("./route");

const TOKEN = "Zk3y_test-token-not-real";

function oneClick(query: string) {
  // What a mail client sends for a List-Unsubscribe-Post header (RFC 8058)
  return new Request(`https://www.sipply.dev/api/unsubscribe${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  });
}

describe("/api/unsubscribe", () => {
  beforeEach(() => {
    postUnsubscribe.mockReset();
    postUnsubscribe.mockResolvedValue({ status: "unsubscribed" });
  });

  it("passes a mail client's one-click unsubscribe on to the API", async () => {
    const res = await POST(oneClick(`?token=${TOKEN}`));
    expect(res.status).toBe(200);
    expect(postUnsubscribe).toHaveBeenCalledWith(TOKEN);
  });

  it("says so when the API couldn't do it, so the client can try again", async () => {
    postUnsubscribe.mockRejectedValue(new Error("API down"));
    expect((await POST(oneClick(`?token=${TOKEN}`))).status).toBe(502);
  });

  it("refuses a request without a token", async () => {
    expect((await POST(oneClick(""))).status).toBe(400);
    expect((await POST(oneClick(`?token=${"x".repeat(65)}`))).status).toBe(400);
    expect(postUnsubscribe).not.toHaveBeenCalled();
  });

  it("sends a client that opens the address to the page with the button", async () => {
    const res = GET(new Request(`https://www.sipply.dev/api/unsubscribe?token=${TOKEN}`));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`https://www.sipply.dev/unsubscribe?token=${TOKEN}`);
    expect(postUnsubscribe).not.toHaveBeenCalled();
  });
});
