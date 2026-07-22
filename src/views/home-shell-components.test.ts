import { describe, expect, it } from "vitest";
import { renderContextTabs, renderWorkspaceLayoutControl } from "./home-shell-components";

describe("renderWorkspaceLayoutControl", () => {
  it("renders a labelled project view selector in workspace mode", () => {
    const html = renderWorkspaceLayoutControl("workspace");

    expect(html).toContain('<label class="project-view-control');
    expect(html).toContain('id="workspace-layout" aria-label="Project view"');
    expect(html).toContain('<option value="split">Split</option>');
    expect(html).toContain('<option value="editor">Editor only</option>');
    expect(html).toContain('<option value="context">Context only</option>');
    expect(html).toContain('<option value="pdf">PDF only</option>');
    expect(html).not.toContain("aria-hidden");
  });

  it("preserves the layout state hook without showing a project control in library mode", () => {
    const html = renderWorkspaceLayoutControl("library");

    expect(html).toBe(
      '<select id="workspace-layout" hidden aria-hidden="true" tabindex="-1"><option value="split">Split</option><option value="editor">Editor only</option>\n              <option value="context">Context only</option><option value="pdf">PDF only</option></select>',
    );
  });
});

describe("renderContextTabs", () => {
  it("renders the stable accessible tab and overview contracts", () => {
    const html = renderContextTabs();

    expect(html.match(/class="context-tab ui-tab"/gu)).toHaveLength(3);
    expect(html).toContain('id="context-tab-list" role="tablist" aria-label="Research context"');
    expect(html).toContain(
      'id="context-preview-tab" type="button" role="tab" aria-controls="context-preview-panel" aria-selected="true" tabindex="0"',
    );
    expect(html).toContain(
      'id="context-library-tab" type="button" role="tab" aria-controls="context-library-panel" aria-selected="false" tabindex="-1"',
    );
    expect(html).toContain(
      'id="context-assistant-tab" type="button" role="tab" aria-controls="context-assistant-panel" aria-selected="false" tabindex="-1"',
    );
    expect(html).toContain('id="context-resource-tabs" role="presentation"');
    expect(html).toContain('id="context-tab-overview" data-action-menu hidden');
    expect(html).toContain('id="context-tab-overview-list" aria-label="Open contexts"');
    expect(html).toContain('id="preview-context-controls"');
    expect(html).toContain('id="pdf-context-controls" hidden');
  });
});
