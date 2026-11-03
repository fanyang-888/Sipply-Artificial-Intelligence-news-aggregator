import { beforeEach, describe, expect, it, vi } from "vitest";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const postConfirmSubscription = vi.fn();
vi.mock("@/lib/api", () => ({ postConfirmSubscription: (token: string) => postConfirmSubscription(token) }));
vi.mock("@/lib/api/client", () => ({ ApiError }));

const { POST } = await import("./route");

const TOKEN = "Zk3y_test-token-not-real";

function button(fields: Record<string, string>) {
  // The button on /subscribe/confirm: a plain HTML form
  return new Request("https://www.sipply.dev/api/subscribe/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

async function outcome(fields: Record<string, string>) {
  const res = await POST(button(fields));
  expect(res.status).toBe(303);
  return res.headers.get("location");
}

describe("POST /api/subscribe/confirm", () => {
  beforeEach(() => {
    postConfirmSubscription.mockReset();
    postConfirmSubscription.mockResolvedValue({ status: "confirmed" });
  });

  it("confirms, then sends the reader back to the page in their language", async () => {
    expect(await outcome({ token: TOKEN, lang: "en" })).toBe("https://www.sipply.dev/subscribe/confirm?status=confirmed");
    expect(postConfirmSubscription).toHaveBeenCalledWith(TOKEN);
    postConfirmSubscription.mockResolvedValue({ status: "already_confirmed" });
    expect(await outcome({ token: TOKEN, lang: "zh" })).toBe("https://www.sipply.dev/zh/subscribe/confirm?status=already_confirmed");
  });

  it("says when the link names no subscription", async () => {
    postConfirmSubscription.mockRejectedValue(new ApiError(404, "no such token"));
    expect(await outcome({ token: TOKEN, lang: "en" })).toBe("https://www.sipply.dev/subscribe/confirm?status=invalid");
    expect(await outcome({ lang: "en" })).toBe("https://www.sipply.dev/subscribe/confirm?status=invalid");
  });

  it("offers the button again when the API failed", async () => {
    postConfirmSubscription.mockRejectedValue(new Error("API down"));
    expect(await outcome({ token: TOKEN, lang: "en" })).toBe(`https://www.sipply.dev/subscribe/confirm?status=error&token=${TOKEN}`);
  });
});
