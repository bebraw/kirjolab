import { describe, expect, it } from "vitest";
import { cssResponse, escapeHtml, htmlResponse, scriptResponse } from "./shared";

describe("htmlResponse", () => {
  it("returns no-store HTML responses", () => {
    const response = htmlResponse("<p>Hello</p>", 201, new URL("https://app.example/workspaces/demo"));

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'self'; base-uri 'none'; connect-src 'self' wss://app.example http://127.0.0.1:* https://127.0.0.1:* http://localhost:* https://localhost:* http://[::1]:* https://[::1]:*; font-src 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; img-src 'self' http: https:; manifest-src 'none'; media-src 'none'; object-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; style-src-attr 'unsafe-inline'; worker-src 'self'",
    );
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(response.headers.get("cross-origin-embedder-policy")).toBe("require-corp");
  });
});

describe("cssResponse", () => {
  it("returns no-store CSS responses", () => {
    const response = cssResponse(":root {}");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("scriptResponse", () => {
  it("returns no-store JavaScript responses", () => {
    const response = scriptResponse("export {};");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("escapeHtml", () => {
  it("escapes characters that are significant in HTML", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});
