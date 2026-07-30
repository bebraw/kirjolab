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
    expectControlIcon(html, "toggle-library-paper-continuous", "continuousPages");
    expect(html).toContain('id="toggle-library-paper-continuous" type="button" aria-pressed="false"');
    expect(html).toContain('id="library-paper-page-indicator"');
    expect(html).toContain('class="pdf-page-jump-input" type="number" min="1"');
  });

  it("binds every annotation action to its semantic icon", () => {
    const html = renderLibraryPdfRail();

    expect(html).toContain('<library-pdf-annotation-toolbar id="library-pdf-annotation-toolbar">');
    const contracts = [
      ["library-select-tool", "select"],
      ["library-note-tool", "note"],
      ["library-draw-tool", "draw"],
      ["undo-library-drawing", "undo"],
      ["download-library-original-pdf", "guide"],
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

  it("keeps frequent controls visible and groups secondary PDF actions", () => {
    const html = renderLibraryPdfRail();

    expect(html).toContain('id="open-library-pdf-search"');
    expect(html).toContain('id="library-pdf-view-options" role="button" aria-label="View options" aria-haspopup="menu"');
    expect(html).toContain('role="group" aria-label="PDF view options"');
    expect(html).toContain('id="library-pdf-more-actions" role="button" aria-label="More PDF actions" aria-haspopup="menu"');
    expect(html).toContain('role="group" aria-label="PDF actions"');
    expect(html).toContain("Contents &amp; thumbnails");
    expect(html).toContain("Export annotated copy");
  });
});
