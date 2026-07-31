import { describe, expect, it } from "vitest";
import { maximumReviewJsonRequestBytes, readReviewJson } from "./review-request";

describe("bounded review JSON requests", () => {
  it("rejects an oversized declared body before reading it", async () => {
    const request = new Request("https://kirjolab.test/api/reviews", {
      method: "POST",
      headers: { "content-length": String(maximumReviewJsonRequestBytes + 1) },
      body: "{}",
    });

    await expect(readReviewJson(request)).rejects.toThrow("too large");
    expect(request.bodyUsed).toBe(false);
  });

  it("enforces the byte limit when no Content-Length is declared", async () => {
    const body = JSON.stringify({ value: "x".repeat(maximumReviewJsonRequestBytes) });
    const request = new Request("https://kirjolab.test/api/reviews", { method: "POST", body });

    expect(request.headers.has("content-length")).toBe(false);
    await expect(readReviewJson(request)).rejects.toThrow("too large");
  });

  it("parses valid UTF-8 JSON within the limit", async () => {
    const request = new Request("https://kirjolab.test/api/reviews", { method: "POST", body: '{"title":"Evidence"}' });

    await expect(readReviewJson(request)).resolves.toEqual({ title: "Evidence" });
  });
});
