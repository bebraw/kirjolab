import { describe, expect, it } from "vitest";
import { renderUiInventoryPage } from "./ui-inventory";

describe("renderUiInventoryPage", () => {
  it("renders representative primitive and state contracts", () => {
    const html = renderUiInventoryPage();

    expect(html).toContain("Kirjolab interface language");
    expect(html).toContain("data-ui-inventory");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11');
    expect(html).toContain("<span>Download</span>");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-destructive="true"');
    expect(html).toContain('<button class="button-primary" type="button" data-destructive="true"><span>Delete permanently</span></button>');
    expect(html).toContain('data-touch-target="true"');
    expect(html).toContain('class="ui-dialog relative block"');
    expect(html).toContain('data-tone="error"');
  });
});
