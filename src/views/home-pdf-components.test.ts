import { describe, expect, it } from "vitest";
import { renderIcon, type IconName } from "../ui/icons";
import { renderLibraryPdfRail } from "./home-pdf-components";

function expectControlIcon(html: string, controlId: string, icon: IconName): void {
  const start = html.indexOf(`id="${controlId}"`);
  const control = html.slice(start, html.indexOf("</button>", start));
  expect(start).toBeGreaterThan(-1);
  expect(control).toContain(renderIcon(icon));
}

describe("renderLibraryPdfRail", () => {
  it("binds page navigation controls to their directional icons", () => {
    const html = renderLibraryPdfRail();

    expect(html).toContain('<nav class="library-pdf-page-rail" aria-label="Private PDF controls">');
    expect(html).toContain('aria-label="PDF page navigation"');
    expectControlIcon(html, "previous-library-paper-page", "chevronUp");
    expectControlIcon(html, "next-library-paper-page", "chevronDown");
    expect(html).toContain('id="library-paper-page-indicator">–<span class="sr-only"> PDF page</span>');
  });

  it("binds every annotation action to its semantic icon", () => {
    const html = renderLibraryPdfRail();

    const contracts = [
      ["library-select-tool", "select"],
      ["library-text-tool", "text"],
      ["library-note-tool", "note"],
      ["library-draw-tool", "draw"],
      ["undo-library-drawing", "undo"],
      ["export-library-annotated-pdf", "download"],
      ["open-library-pdf-inspector", "annotations"],
    ] as const;
    for (const [controlId, icon] of contracts) {
      expectControlIcon(html, controlId, icon);
    }
    expect(html).toContain('role="toolbar" aria-label="PDF annotation tools"');
    expect(html).toContain('id="library-ink-options" role="group" aria-label="Drawing style" hidden');
    expect(html).toContain('id="open-library-pdf-inspector" type="button" aria-label="Annotations"');
    expect(html).toContain('id="library-highlight-count">0</span>');
  });
});
