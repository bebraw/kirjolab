import { describe, expect, it } from "vitest";
import { createHealthResponse } from "./health";

describe("createHealthResponse", () => {
  it("returns the stable JSON payload for health checks", async () => {
    const response = createHealthResponse(["/", "/api/health"]);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      name: "kirjolab",
      routes: ["/", "/api/health"],
      deployment: null,
    });
  });

  it("includes the active Worker version metadata", async () => {
    const deployment = {
      id: "45b7c17d-42bf-4d4e-b101-65bcdb035b7f",
      tag: "d54d9d8",
      timestamp: "2026-07-29T17:00:00.000Z",
    };
    const response = createHealthResponse(["/api/health"], deployment);

    await expect(response.json()).resolves.toEqual({
      ok: true,
      name: "kirjolab",
      routes: ["/api/health"],
      deployment,
    });
  });
});
