import { describe, expect, it } from "vitest";
import { renderNotFoundPage } from "./not-found";

describe("renderNotFoundPage", () => {
  it("renders the missing path in the response body", () => {
    const html = renderNotFoundPage("/missing");

    expect(html).toContain("Not Found");
    expect(html).toContain("/missing");
  });
});
