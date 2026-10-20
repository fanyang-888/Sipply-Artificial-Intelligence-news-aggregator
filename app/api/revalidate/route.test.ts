import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag: (...args: unknown[]) => revalidateTag(...args) }));

const { POST } = await import("./route");

const SECRET = "test-secret-not-real";

function request(body: unknown, auth: string | null = `Bearer ${SECRET}`) {
  return new Request("https://www.sipply.dev/api/revalidate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  });
}

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    revalidateTag.mockClear();
    vi.stubEnv("REVALIDATE_SECRET", SECRET);
  });

  it("expires each tag the pipeline sends, at once (crawlers told by IndexNow get the new page)", async () => {
    const id = "6ddc0f5e-6121-46cd-b03a-f9865cb5ddae";
    const res = await POST(request({ tags: ["run", "story:google-launches-universal-cart-6ddc0f5e", `story-id:${id}`] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revalidated: 3 });
    expect(revalidateTag.mock.calls).toEqual([
      ["run", { expire: 0 }],
      ["story:google-launches-universal-cart-6ddc0f5e", { expire: 0 }],
      [`story-id:${id}`, { expire: 0 }],
    ]);
  });

  it("refuses anyone without the secret, and works only once it is set", async () => {
    expect((await POST(request({ tags: ["run"] }, null))).status).toBe(401);
    expect((await POST(request({ tags: ["run"] }, "Bearer wrong"))).status).toBe(401);
    vi.stubEnv("REVALIDATE_SECRET", "");
    expect((await POST(request({ tags: ["run"] }, "Bearer "))).status).toBe(503);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("refuses tags it doesn't know and oversized requests", async () => {
    expect((await POST(request({ tags: ["run", "/admin"] }))).status).toBe(400);
    expect((await POST(request({ tags: "run" }))).status).toBe(400);
    expect((await POST(request({ tags: Array(2001).fill("run") }))).status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
