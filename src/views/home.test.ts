import { describe, expect, it } from "vitest";
import { exampleRoutes } from "../app-routes";
import { renderHomePage } from "./home";

describe("renderHomePage", () => {
  it("renders the complete scholarly workspace shell", () => {
    const html = renderHomePage(exampleRoutes);

    expect(html).toContain("KIRJOLAB");
    expect(html).toContain('data-app-mode="workspace" data-workspace-id="demo" data-identity-email="local@kirjolab.invalid"');
    expect(html).toContain('class="action-menu header-action-menu ui-menu" data-action-menu');
    expect(html).toContain('<a class="header-library-link" href="/library">Library</a>');
    expect(html).not.toContain('class="library-header-context"');
    expect(html).toContain('id="manage-workspaces" type="button"><strong>Open projects</strong></button>');
    expect(html).toContain('id="editor-more-menu" data-action-menu');
    expect(html).toContain('aria-label="More editor actions"');
    expect(html).not.toContain('role="menu"');
    expect(html).not.toContain('role="menuitem"');
    expect(html).toContain('aria-label="Project view"');
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
    expect(html).toContain('accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml"');
    expect(html).toContain('id="theme-preference" aria-label="Appearance"');
    expect(html).toContain('id="preferences-menu" data-settings-menu');
    expect(html).toContain('id="citation-completion-scope" aria-label="Citation suggestion scope"');
    expect(html).toContain('aria-label="Open preferences" title="Preferences"');
    expect(html).toContain('id="account-menu" data-action-menu');
    expect(html).toContain('class="account-trigger" aria-label="Account for local@kirjolab.invalid" title="Account"');
    expect(html).toContain('<circle cx="12" cy="8" r="3.25"></circle>');
    expect(html).not.toContain('aria-label="Account for local@kirjolab.invalid">Account</summary>');
    expect(html).toContain("<span>Local development</span>");
    expect(html).toContain("Local mode has no login session.");
    expect(html).not.toContain('id="log-out"');
    expect(html).toContain('<option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>');
    expect(html).toContain('<p class="eyebrow">New project</p>');
    expect(html).toContain('id="new-workspace-template-list"');
    expect(html).toContain('id="save-workspace-template"');
    expect(html).toContain('id="save-template-dialog"');
    expect(html).toContain('id="create-workspace" type="submit" disabled>Create project</button>');
    expect(html).toContain('id="new-workspace-template-preview" aria-live="polite"');
    expect(html).toContain('id="new-workspace-template-id" type="hidden"');
    expect(html).toContain("Browse the structure and publication setup before choosing a template.");
    expect(html).toContain('id="workspace-catalog-filter"');
    expect(html).toContain('id="read-only-share-heading"');
    expect(html).toContain('id="create-read-only-share" type="button">Create link</button>');
    expect(html).toContain('id="read-only-share-link" type="text" readonly');
    expect(html).toContain('id="revoke-read-only-share" type="button">Revoke read-only link</button>');
    expect(html).toContain('id="edit-share-heading"');
    expect(html).toContain('id="create-edit-share" type="button">Create link</button>');
    expect(html).toContain('id="edit-share-link" type="text" readonly');
    expect(html).toContain('id="revoke-edit-share" type="button">Revoke edit link</button>');
    expect(html).toContain('id="diagnostic-summary"');
    expect(html).toContain('id="preview-file-context"');
    expect(html).toContain('id="authoring-context-resizer" role="separator"');
    expect(html).toContain("Annotate this paper");
    expect(html).toContain("Import BibTeX");
    expect(html).toContain('id="open-citation-network"');
    expect(html).toContain('id="citation-network" aria-labelledby="citation-network-heading"');
    expect(html).toContain('id="filter-project-citations" type="button" aria-pressed="false"');
    expect(html).toContain('id="citation-assertion-form"');
    expect(html).toContain('id="citation-network-graph" viewBox="0 0 800 360" role="img" aria-label="Citation network graph"');
    expect(html).toContain('id="citation-network-list" aria-live="polite"');
    expect(html).toContain("Conflicting relationships remain visible.");
    expect(html).toContain('id="publication-list"');
    expect(html).toContain('id="knowledge-search-form"');
    expect(html).toContain('id="knowledge-connection-list"');
    expect(html).toContain('id="show-write-mode" type="button" aria-pressed="true">Write</button>');
    expect(html).toContain('id="show-map-mode" type="button" aria-pressed="false">Map</button>');
    expect(html).toContain('id="project-map" aria-labelledby="project-map-heading" hidden');
    expect(html).toContain('id="project-map-graph" viewBox="0 0 1000 600" role="img"');
    expect(html).not.toContain("<summary><span>Project graph</span>");
    expect(html).not.toContain('id="explore-research-graph"');
    expect(html).toContain('id="claim-list"');
    expect(html).toContain('id="claim-form"');
    expect(html).toContain('id="project-evidence" hidden');
    expect(html).toContain(
      '<summary><span>Project evidence</span><span class="count-badge" id="project-evidence-count">0</span></summary>',
    );
    expect(html).not.toContain("<summary><span>Papers</span>");
    expect(html).not.toContain("<summary><span>Highlights</span>");
    expect(html).toContain('id="workspace-surfaces" data-active-surface="authoring"');
    expect(html).toContain('id="show-authoring-surface"');
    expect(html).toContain('id="show-context-surface"');
    expect(html).toContain('id="show-files-rail" type="button" role="tab" aria-label="Files"');
    expect(html).toContain('id="show-research-rail" type="button" role="tab" aria-label="Research"');
    expect(html).toContain('id="show-comments-rail" type="button" role="tab" aria-label="Comments"');
    expect(html).toContain('id="show-guide-rail" type="button" role="tab" aria-label="Writing guide"');
    expect(html).toContain('aria-selected="true" title="Files"');
    expect(html).toContain('aria-selected="false" title="Research"');
    expect(html).toContain('aria-selected="false" title="Comments"');
    expect(html).toContain('aria-selected="false" title="Writing guide"');
    expect(html).toContain('id="files-rail-panel" role="tabpanel" aria-labelledby="show-files-rail">');
    expect(html).toContain('id="research-rail-panel" role="tabpanel" aria-labelledby="show-research-rail" hidden>');
    expect(html).toContain('<h1 class="text-xl font-semibold tracking-[-0.035em]">Files</h1>');
    expect(html).toContain('id="new-project-file-rail" type="button" aria-label="Add file" title="Add file">');
    expect(html).toContain('id="new-project-folder-rail" type="button" aria-label="Add folder" title="Add folder">');
    expect(html).toContain('id="upload-project-images" type="button" aria-label="Add image" title="Add image">');
    expect(html.match(/class="rail-action-icon"/gu)).toHaveLength(3);
    expect(html).toContain("<strong>Move or rename file</strong>");
    expect(html).not.toContain('id="project-file-count"');
    expect(html).not.toContain("Files · A–Z");
    expect(html).not.toContain("Project files</p>");
    expect(html).toContain("<summary><span>Bibliography</span></summary>");
    expect(html).toContain('class="count-badge rail-mode-count" id="manuscript-comment-count"');
    expect(html).toContain('id="comments-rail-panel" role="tabpanel"');
    expect(html).toContain('id="guide-rail-panel" role="tabpanel"');
    expect(html).toContain('id="open-research-diary" type="button">Start diary</button>');
    expect(html).toContain('id="open-research-questions" type="button">Start question ledger</button>');
    expect(html).toContain('<select class="field mt-2" id="editing-pass">');
    expect(html).toContain('id="open-reviewer-response" type="button">Start matrix</button>');
    expect(html).toContain('id="download-reviewer-response" type="button" disabled>Export letter</button>');
    expect(html).toContain('id="manuscript-comment-form"');
    expect(html).not.toContain('id="manuscript-comments"');
    expect(html).toContain('id="derived-project-bibliography"');
    expect(html).toContain('class="bibliography-editor rail-bibliography-editor" id="bibliography-editor"');
    expect(html).toContain('class="button-secondary hidden" id="open-source-citation"');
    expect(html).toContain('class="editor-toolbar ui-toolbar"');
    expect(html.match(/class="editor-toolbar-group"/gu)).toHaveLength(2);
    expect(html).not.toContain('id="project-file-switcher"');
    expect(html).toContain('class="source-editor-highlight" id="source-editor-highlight" aria-hidden="true"');
    expect(html).toContain('class="source-editor" id="source-editor" spellcheck="true"');
    expect(html).toContain('id="source-completion" role="listbox" aria-label="Source suggestions" hidden');
    expect(html).toContain('id="vim-toggle" type="button" aria-pressed="false" title="Enable Vim keybindings"');
    expect(html).toContain('id="vim-mode-status" role="status" aria-live="polite" hidden>NORMAL</span>');
    expect(html).toContain('id="open-project-history"');
    expect(html).toContain('id="project-history-dialog"');
    expect(html).toContain("Browse, compare, restore, or branch from saved versions.");
    expect(html).toContain('id="open-export" type="button">Export</button>');
    expect(html).toContain('id="share-workspace" type="button">Share project</button>');
    expect(html).toContain('id="word-count-badge"');
    expect(html).toContain('id="export-dialog"');
    expect(html).toContain("Choose a format for the composed project.");
    expect(html).toContain("/api/workspaces/demo/export/document.pdf");
    expect(html).toContain("/api/workspaces/demo/export/latex.zip");
    expect(html).toContain("/api/workspaces/demo/export/source.zip");
    expect(html).toContain('id="export-statistics"');
    expect(html).toContain('id="context-tab-list" role="tablist" aria-label="Research context"');
    expect(html).toContain('class="context-tab-list ui-tab-list"');
    expect(html.match(/class="context-tab ui-tab"/gu)).toHaveLength(3);
    expect(html.match(/class="(?:new-workspace-dialog|reference-library-dialog)[^"]*ui-dialog"/gu)).toHaveLength(10);
    expect(html).toContain('id="open-github-import"');
    expect(html).toContain('id="github-import-dialog"');
    expect(html).toContain('id="github-publish-review"');
    expect(html).toContain('id="github-pull-review"');
    expect(html.match(/data-touch-target="true"/gu)).toHaveLength(8);
    expect(html).toContain('id="archive-workspace" type="button" data-destructive="true"');
    expect(html).toContain('id="context-resource-tabs" role="presentation"');
    expect(html).not.toContain('id="pin-active-context"');
    expect(html).not.toContain('id="close-active-context"');
    expect(html).toContain('id="pdf-context-controls" hidden');
    expect(html).toContain('id="context-preview-tab" type="button" role="tab"');
    expect(html).toContain('id="web-source-url"');
    expect(html).not.toContain("Optional metadata overrides");
    expect(html).not.toContain('id="web-source-title"');
    expect(html).toContain('aria-controls="context-preview-panel" aria-selected="true"');
    expect(html).toContain('id="context-preview-panel" role="tabpanel"');
    expect(html).toContain('id="context-assistant-tab" type="button" role="tab"');
    expect(html).toContain('aria-controls="context-assistant-panel" aria-selected="false"');
    expect(html).toContain('id="context-assistant-panel" role="tabpanel"');
    expect(html).toContain('id="context-publication-panel" role="tabpanel"');
    expect(html).toContain('id="context-pdf-panel" role="tabpanel"');
    expect(html).toContain('id="annotation-composer"');
    expect(html).toContain('id="library-highlight-composer"');
    expect(html).toContain('id="open-library-pdf-inspector"');
    expect(html).toContain('id="close-library-pdf-inspector"');
    expect(html).toContain('role="toolbar" aria-label="PDF annotation tools"');
    expect(html).toContain('id="library-highlight-form"');
    expect(html).toContain('id="library-project-use"');
    expect(html).toContain('id="context-candidate-panel" role="tabpanel"');
    expect(html).toContain('id="context-publication-panel" role="tabpanel" aria-label="Publication context" tabindex="0" hidden');
    expect(html).toContain('id="context-pdf-panel" role="tabpanel" aria-label="PDF context" tabindex="0" hidden');
    expect(html).toContain('id="paper-text-layer"');
    expect(html).toContain('id="save-and-link-annotation"');
    expect(html).not.toContain('id="paper-dialog"');
    expect(html).not.toContain('id="writing-assistant"');
    expect(html.indexOf('id="comments-rail-panel"')).toBeLessThan(html.indexOf('id="authoring-surface"'));
    expect(html.indexOf('id="bibliography-editor"')).toBeLessThan(html.indexOf('id="authoring-surface"'));
    expect(html).toContain("Draft a reviewable revision");
    expect(html).toContain('src="/app.js"');
    expect(html).toContain('href="/styles.css"');
    expect(html).toContain("/api/workspaces/demo");
    expect(html).toContain("Collaborative scholarly workspace");
    expect(html).toContain("Portable workspace resource");
    expect(html).toContain("Stable workspace resource");
    expect(html).toContain(
      '<button type="button" data-insert-syntax="bibliography"><strong>Bibliography</strong><code>::bibliography[]</code></button>',
    );
    expect(html).toContain("Workspace catalog");
    expect(html).toContain("Authenticated identity");
    expect(html).toContain("JSON health endpoint for tooling and smoke tests");
    expect(html).not.toContain("Stryker was here!");
    expect(renderHomePage(exampleRoutes, "workspace", `person"@example.org`)).toContain("person&quot;@example.org");
  });

  it("renders a project-free library shell", () => {
    const html = renderHomePage(exampleRoutes, "demo", "person@example.org", "local", "library");

    expect(html).toContain('data-app-mode="library"');
    expect(html).toContain('<a class="header-library-link" href="/library" aria-current="page">Library</a>');
    expect(html).toContain('id="library-pdf-upload"');
    expect(html).toContain('id="library-highlight-composer"');
    expect(html).toContain('id="export-library-annotated-pdf"');
    expect(html).toContain('id="previous-library-paper-page"');
    expect(html).toContain('id="library-paper-page-indicator"');
    expect(html).toContain('id="next-library-paper-page"');
    expect(html).toContain('<div class="library-header-context"><div class="context-tabs" id="context-tabs">');
    expect(html).not.toContain('class="project-view-control');
    expect(html).not.toContain('aria-label="Project view"');
    expect(html).toContain('id="workspace-layout" hidden aria-hidden="true" tabindex="-1"');
    expect(html).toContain('id="share-workspace" type="button" hidden>Share project</button>');
    expect(html).not.toContain(
      '<section class="context-column preview-column min-w-0 bg-app-paper" id="context-surface" aria-label="Research context">\n        <div class="context-tabs"',
    );
  });

  it("offers Cloudflare Access identities a native logout control", () => {
    const html = renderHomePage(exampleRoutes, "workspace", "person@example.org", "access");

    expect(html).toContain('aria-label="Account for person@example.org"');
    expect(html).toContain(
      '<div class="account-menu-identity"><strong title="person@example.org">person@example.org</strong><span>Cloudflare Access</span></div>',
    );
    expect(html).toContain('<a id="log-out" href="/cdn-cgi/access/logout"><strong>Log out</strong><span>All Access apps</span></a>');
    expect(html).not.toContain("Local mode has no login session.");
  });

  it("renders an inline, review-first DOI intake before evidence capture", () => {
    const html = renderHomePage(exampleRoutes);

    expect(html).toContain('<details class="publication-intake" id="publication-intake">');
    expect(html).toContain("Identify reference");
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
    expect(html).toContain('id="cite-active-pdf" type="button" disabled>Cite linked reference</button>');

    expect(html.indexOf('id="publication-intake"')).toBeLessThan(html.indexOf('id="annotation-composer-title"'));
  });

  it("renders accessible bounded batch PDF intake in the Library", () => {
    const html = renderHomePage(exampleRoutes);

    expect(html).toContain('id="library-pdf-dropzone" for="library-pdf-upload"');
    expect(html).toContain("Add reference");
    expect(html).toContain("Upload up to 20");
    expect(html).toContain(
      'id="library-pdf-upload" type="file" accept="application/pdf" multiple aria-describedby="library-pdf-upload-help"',
    );
    expect(html).toContain('id="library-pdf-upload-status" aria-live="polite"');
    expect(html).not.toContain('id="library-pdf-upload-status" role="dialog"');
  });

  it("keeps Library intake, discovery, and tools compact", () => {
    const html = renderHomePage(exampleRoutes);

    expect(html).toContain('<summary class="button-primary">Add reference</summary>');
    expect(html).toContain('placeholder="Search references…"');
    expect(html).toContain('title="Filter and sort references">Filter</summary>');
    expect(html).toContain('aria-label="Library tools" title="Library tools">•••</summary>');
    expect(html).not.toContain("Private research memory");
    expect(html).not.toContain("Filters and library tools");
    expect(html).not.toContain("Add the source now");
  });

  it("renders an accessible, focused passage-revision review in research context", () => {
    const html = renderHomePage(exampleRoutes);

    expect(html).toContain(
      'class="context-panel context-candidate-panel" id="context-candidate-panel" role="tabpanel" aria-label="Model revision context" tabindex="0" hidden',
    );
    expect(html).not.toContain('id="close-candidate-context"');
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
    const mainEnd = html.indexOf("</main>");
    expect(panel).toBeGreaterThan(html.indexOf('id="context-pdf-panel"'));
    expect(panel).toBeLessThan(mainEnd);
    expect(original).toBeLessThan(proposal);
    expect(proposal).toBeLessThan(evidence);
    expect(evidence).toBeLessThan(reject);
    expect(reject).toBeLessThan(apply);
  });

  it("scopes the local model operation to selected prose and labelled instruction", () => {
    const html = renderHomePage(exampleRoutes);

    expect(html).toContain("Uses only the selected passage and chosen evidence.");
    expect(html).toContain("Review the draft in Context before applying it.");
    expect(html).toContain(
      '<label class="field-label model-instruction-field" for="model-instruction"><span id="model-instruction-label">Revision instruction</span>',
    );
    expect(html).toContain('id="model-instruction" maxlength="4000" rows="2"');
    expect(html).toContain("Improve clarity while preserving the claim and citation syntax.");
    expect(html).toContain('id="model-status" role="status" aria-live="polite"');
    expect(html).toContain("Select manuscript text and at least one annotation or claim to ground the request.");
    expect(html).toContain("Drafts open in Context and do not change the manuscript until applied.");
    expect(html).toContain('<select class="field" id="model-operation">');
    expect(html).toContain('<option value="draft-claim">Draft evidence-backed claim</option>');
    expect(html).toContain('id="model-claim-relation-field" hidden');
    expect(html).toContain('<select class="field" id="model-claim-relation">');
    expect(html).toContain('<option value="contradicts">Contradicts</option>');
    expect(html).toContain('<select class="field" id="llm-model">');
    expect(html).toContain('<option value="">Find loaded models</option>');
    expect(html).toContain('<select class="field" id="llm-reasoning-effort">');
    expect(html).toContain('<option value="none">Off · fastest</option>');
    expect(html).toContain('id="discover-llm-models" type="button">Find loaded models</button>');
    expect(html).toContain('id="open-preferences-from-assistant" type="button">Connection settings</button>');

    expect(html.indexOf('id="preferences-menu"')).toBeLessThan(html.indexOf('id="llm-endpoint"'));
    expect(html.indexOf('id="llm-endpoint"')).toBeLessThan(html.indexOf('id="model-instruction"'));
    expect(html).not.toContain('id="assistant-model-settings"');
    expect(html.indexOf('id="model-instruction"')).toBeLessThan(html.indexOf('id="generate-candidate"'));
  });
});
