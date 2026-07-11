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
    expect(html).toContain('id="context-candidate-panel" role="tabpanel"');
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

  it("renders an accessible, focused passage-revision review in research context", () => {
    const html = renderHomePage(exampleRoutes);

    expect(html).toContain(
      'class="context-panel context-candidate-panel" id="context-candidate-panel" role="tabpanel" aria-label="Model revision context" tabindex="0" hidden',
    );
    expect(html).toContain('id="close-candidate-context" type="button" aria-label="Close revision context"');
    expect(html).toContain('id="context-candidate-scroll"');
    expect(html).toContain('id="context-candidate-title"');
    expect(html).toContain('id="context-candidate-meta"');
    expect(html).toContain('id="context-candidate-status" role="status" aria-live="polite"');
    expect(html).toContain('id="context-candidate-evidence"');
    expect(html).toContain('id="context-candidate-reject" type="button" disabled>Reject revision</button>');
    expect(html).toContain('id="context-candidate-apply" type="button" disabled>Apply replacement</button>');

    expect(html).toContain('id="context-candidate-before-label">Original passage</h3>');
    expect(html).toContain('id="context-candidate-before" role="region" aria-labelledby="context-candidate-before-label" tabindex="0"');
    expect(html).toContain('id="context-candidate-after-label">Proposed replacement</h3>');
    expect(html).toContain('id="context-candidate-after" role="region" aria-labelledby="context-candidate-after-label" tabindex="0"');
    expect(html).toContain('aria-label="Passage revision comparison"');
    expect(html).toContain('aria-labelledby="context-candidate-evidence-heading"');
    expect(html).toContain("Evidence used for this revision");
    expect(html).toContain('aria-label="Revision decision"');

    const panel = html.indexOf('id="context-candidate-panel"');
    const original = html.indexOf('id="context-candidate-before-label"');
    const proposal = html.indexOf('id="context-candidate-after-label"');
    const evidence = html.indexOf('id="context-candidate-evidence-heading"');
    const reject = html.indexOf('id="context-candidate-reject"');
    const apply = html.indexOf('id="context-candidate-apply"');
    const workbench = html.indexOf('class="workbench');
    expect(panel).toBeGreaterThan(html.indexOf('id="context-pdf-panel"'));
    expect(panel).toBeLessThan(workbench);
    expect(original).toBeLessThan(proposal);
    expect(proposal).toBeLessThan(evidence);
    expect(evidence).toBeLessThan(reject);
    expect(reject).toBeLessThan(apply);
  });

  it("scopes the local model operation to selected prose and labelled instruction", () => {
    const html = renderHomePage(exampleRoutes);

    expect(html).toContain(
      "The selected passage, revision instruction, chosen evidence, and configured model identifier are sent from your browser to the local OpenAI-compatible endpoint.",
    );
    expect(html).toContain("No other manuscript text is sent.");
    expect(html).toContain("The proposed replacement stays separate for review in Context.");
    expect(html).toContain('<label class="field-label model-instruction-field" for="model-instruction">Revision instruction');
    expect(html).toContain('id="model-instruction" maxlength="4000" rows="2"');
    expect(html).toContain("Improve clarity while preserving the claim and citation syntax.");
    expect(html).toContain('id="model-status" role="status" aria-live="polite"');
    expect(html).toContain("Select manuscript text and at least one annotation or claim to ground the request.");
    expect(html).toContain("Grounded revisions open in Context and remain separate from the manuscript until you apply one.");

    expect(html.indexOf('id="llm-endpoint"')).toBeLessThan(html.indexOf('id="model-instruction"'));
    expect(html.indexOf('id="llm-model"')).toBeLessThan(html.indexOf('id="model-instruction"'));
    expect(html.indexOf('id="model-instruction"')).toBeLessThan(html.indexOf('id="generate-candidate"'));
  });
});
