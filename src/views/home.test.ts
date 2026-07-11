import { describe, expect, it } from "vitest";
import { exampleRoutes } from "../app-routes";
import { renderHomePage } from "./home";

describe("renderHomePage", () => {
  it("renders the complete scholarly workspace shell", () => {
    const html = renderHomePage(exampleRoutes);

    expect(html).toContain("KIRJOLAB");
    expect(html).toContain("Manuscript preview");
    expect(html).toContain("Annotate this paper");
    expect(html).toContain("Import BibTeX");
    expect(html).toContain('id="publication-list"');
    expect(html).toContain('id="knowledge-search-form"');
    expect(html).toContain('id="knowledge-connection-list"');
    expect(html).toContain('id="claim-list"');
    expect(html).toContain('id="claim-form"');
    expect(html).toContain('id="workspace-surfaces" data-active-surface="authoring"');
    expect(html).toContain('id="show-authoring-surface"');
    expect(html).toContain('id="show-context-surface"');
    expect(html).toContain('id="open-source-citation"');
    expect(html).toContain('id="context-tab-list" role="tablist" aria-label="Research context"');
    expect(html).toContain('id="context-resource-tabs" role="presentation"');
    expect(html).toContain('id="pin-active-context"');
    expect(html).toContain('id="close-active-context"');
    expect(html).toContain('id="context-preview-tab" type="button" role="tab"');
    expect(html).toContain('aria-controls="context-preview-panel" aria-selected="true"');
    expect(html).toContain('id="context-preview-panel" role="tabpanel"');
    expect(html).toContain('id="context-publication-panel" role="tabpanel"');
    expect(html).toContain('id="context-pdf-panel" role="tabpanel"');
    expect(html).toContain('id="context-publication-panel" role="tabpanel" aria-label="Publication context" tabindex="0" hidden');
    expect(html).toContain('id="context-pdf-panel" role="tabpanel" aria-label="PDF context" tabindex="0" hidden');
    expect(html).toContain('id="paper-text-layer"');
    expect(html).toContain('id="save-and-link-annotation"');
    expect(html).not.toContain('id="paper-dialog"');
    expect(html).toContain("Propose, inspect, apply");
    expect(html).toContain('src="/app.js"');
    expect(html).toContain('href="/styles.css"');
    expect(html).toContain("/api/workspaces/demo");
    expect(html).toContain("Collaborative scholarly workspace");
    expect(html).toContain("Portable workspace resource");
    expect(html).toContain("Stable workspace resource");
    expect(html).toContain("Workspace catalog");
    expect(html).toContain("Authenticated identity");
    expect(html).toContain("JSON health endpoint for tooling and smoke tests");
    expect(html).not.toContain("Stryker was here!");
    expect(renderHomePage(exampleRoutes, "workspace", `person\"@example.org`)).toContain("person&quot;@example.org");
  });

  it("renders an inline, review-first DOI intake before evidence capture", () => {
    const html = renderHomePage(exampleRoutes);

    expect(html).toContain('<section class="publication-intake" id="publication-intake" aria-labelledby="publication-intake-heading">');
    expect(html).toContain("Identify this paper");
    expect(html).toContain("Review DOI metadata before adding the reference and connecting this PDF.");
    expect(html).toContain('<form class="publication-intake-form" id="publication-intake-form">');
    expect(html).toContain('<label class="field-label" for="publication-intake-doi">DOI</label>');
    expect(html).toContain('id="publication-intake-doi" type="text" inputmode="url" maxlength="500" required autocomplete="off"');
    expect(html).toContain('id="publication-intake-status" role="status" aria-live="polite"');
    expect(html).toContain("Looking up a DOI does not change the library.");
    expect(html).toContain('class="publication-intake-review" id="publication-intake-review" hidden');
    expect(html).toContain('id="publication-intake-title"');
    expect(html).toContain('id="publication-intake-meta"');
    expect(html).toContain('<label class="field-label mt-3" for="publication-intake-key">Citation key');
    expect(html).toContain('id="publication-intake-key" type="text" maxlength="200" required autocomplete="off"');
    expect(html).toContain('id="publication-intake-accept" type="button">Add to library &amp; connect</button>');
    expect(html).toContain('id="publication-intake-cancel" type="button">Cancel</button>');
    expect(html).toContain('class="publication-intake-linked" id="publication-intake-linked" hidden');
    expect(html).toContain('id="publication-intake-linked-list"');
    expect(html).toContain('type="submit">Look up DOI</button>');

    expect(html.indexOf('id="publication-intake"')).toBeLessThan(html.indexOf('id="annotation-composer-title"'));
  });
});
