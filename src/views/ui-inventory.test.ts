import { describe, expect, it } from "vitest";
import { renderUiInventoryPage } from "./ui-inventory";

describe("renderUiInventoryPage", () => {
  it("renders representative primitive and state contracts", () => {
    const html = renderUiInventoryPage();

    expect(html).toContain("Kirjolab interface language");
    expect(html).toContain("data-ui-inventory");
    expect(html).toContain(
      '<div class="ui-panel overflow-hidden"><div class="h-20 bg-app-canvas"></div><p class="border-t border-app-line p-3 font-sans text-xs font-bold">Canvas</p></div>',
    );
    expect(html).toContain('<div class="h-20 bg-app-paper"></div>');
    expect(html).toContain(">Paper</p></div>");
    expect(html).toContain('<div class="h-20 bg-app-surface"></div>');
    expect(html).toContain(">Surface</p></div>");
    expect(html).toContain('<div class="h-20 bg-app-accent"></div>');
    expect(html).toContain(">Accent</p></div>");
    expect(html).toContain('<button class="button-primary" type="button"><span>Primary action</span></button>');
    expect(html).toContain('<button class="button-secondary" type="button"><span>Secondary action</span></button>');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11');
    expect(html).toContain("<span>Download</span>");
    expect(html).toContain('<button class="button-secondary" type="button" data-compact="true"><span>Compact</span></button>');
    expect(html).toContain('<button class="button-secondary" type="button" aria-pressed="true"><span>Selected</span></button>');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-destructive="true"');
    expect(html).toContain('<button class="button-secondary" type="button" data-destructive="true"><span>Remove</span></button>');
    expect(html).toContain('<button class="button-primary" type="button" data-destructive="true"><span>Delete permanently</span></button>');
    expect(html).toContain('<button class="button-secondary" type="button" disabled><span>Unavailable</span></button>');
    expect(html).toContain('<button class="button-secondary" type="button" aria-busy="true"><span>Working</span></button>');
    expect(html).toContain('data-touch-target="true"');
    expect(html).toContain('type="button" aria-label="Close example" title="Close" data-touch-target="true"');
    expect(html).toContain('class="ui-dialog relative block"');
    expect(html).toContain('data-tone="error"');
    expect(html).toContain(
      '<footer class="ui-dialog-actions"><button class="button-secondary" type="button"><span>Cancel</span></button><button class="button-primary" type="button"><span>Confirm</span></button></footer>',
    );
  });
});
