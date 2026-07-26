import { afterEach, describe, expect, it, vi } from "vitest";
import { errorMessage, expectOk, jsonFetch } from "./http";

afterEach(() => vi.unstubAllGlobals());

describe("client HTTP helpers", () => {
  it("sends same-origin JSON requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await jsonFetch("/api/example", { value: 1 }, "PATCH");

    expect(fetchMock).toHaveBeenCalledWith("/api/example", {
      body: JSON.stringify({ value: 1 }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
  });

  it("accepts successful responses and preserves validated API errors", async () => {
    await expect(expectOk(new Response(null, { status: 204 }))).resolves.toBeUndefined();
    await expect(expectOk(Response.json({ error: "Denied" }, { status: 403 }))).rejects.toThrow("Denied");
  });

  it("falls back to the response status for malformed errors", async () => {
    await expect(expectOk(Response.json({ error: 42 }, { status: 500 }))).rejects.toThrow("Request failed (500)");
    await expect(expectOk(new Response("not json", { status: 502 }))).rejects.toThrow("Request failed (502)");
  });

  it("normalizes unknown caught values", () => {
    expect(errorMessage(new Error("Specific"), "Fallback")).toBe("Specific");
    expect(errorMessage("unknown", "Fallback")).toBe("Fallback");
  });
});
