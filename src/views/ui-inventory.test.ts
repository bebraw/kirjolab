import { describe, expect, it } from "vitest";
import { renderUiInventoryPage } from "./ui-inventory";

describe("renderUiInventoryPage", () => {
  it("renders representative primitive and state contracts", () => {
    const html = renderUiInventoryPage();

    expect(html).toContain("Kirjolab interface language");
    expect(html).toContain("data-ui-inventory");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-destructive="true"');
    expect(html).toContain('data-touch-target="true"');
    expect(html).toContain('class="ui-dialog relative block"');
    expect(html).toContain('data-tone="error"');
  });
});
