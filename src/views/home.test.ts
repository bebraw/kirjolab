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
});
