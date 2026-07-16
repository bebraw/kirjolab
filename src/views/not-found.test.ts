import { describe, expect, it } from "vitest";
import { renderNotFoundPage } from "./not-found";

describe("renderNotFoundPage", () => {
  it("renders the missing path in the response body", () => {
    const html = renderNotFoundPage("/missing");

    expect(html).toContain("This page is outside the project.");
    expect(html).toContain("/missing");
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain('<link rel="stylesheet" href="/styles.css">');
    expect(html).toContain('href="/">Return to Kirjolab</a>');
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
  });
});
