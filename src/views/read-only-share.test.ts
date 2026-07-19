import { describe, expect, it } from "vitest";
import type { WorkspaceSnapshot } from "../domain/workspace";
import { renderReadOnlySharePage, resolveReadOnlyShareFile } from "./read-only-share";

const snapshot: WorkspaceSnapshot = {
  id: "workspace-1",
  title: "Review <draft>",
  entryFileId: "main-file",
  folders: [],
  assets: [],
  files: [
    {
      id: "section-file",
      path: "sections/results.md",
      mediaType: "text/markdown",
      content: "Results & discussion",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    },
    {
      id: "main-file",
      path: "main.md",
      mediaType: "text/markdown",
      content: "# Main <source>",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    },
  ],
  composition: { content: "# Composed <manuscript>", sourceMap: [], diagnostics: [], dependencies: {} },
  source: "# Main <source>",
  bibliography: "",
  revision: 7,
  publicationProfile: { citationStyle: "apa", locale: "en-US", submissionTemplate: "article", paperSize: "a4" },
  pdfs: [],
  publications: [],
  projectReferences: [],
  researchShares: [],
  publicationPdfLinks: [],
  annotations: [],
  links: [],
  claims: [],
  claimEvidenceLinks: [],
  claimLinks: [],
  comments: [],
  candidates: [],
  reviewArtifactPins: [],
};

describe("read-only project viewer", () => {
  it("defaults to the entry source beside the PDF in the read-only editor shell", () => {
    const html = renderReadOnlySharePage(snapshot, "/share/locator.secret", null);

    expect(resolveReadOnlyShareFile(snapshot, null).id).toBe("main-file");
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
    expect(html).toContain('<script type="module" src="/shared-editor.js"></script>');
    expect(html).toContain('data-app-mode="shared-editor" data-shared-editor-mode="read-only"');
    expect(html).toContain('data-shared-revision="7"');
    expect(html).toContain('data-shared-file-id="main-file"');
    expect(html).toContain('data-shared-socket-path="/share/locator.secret/socket"');
    expect(html).not.toContain("data-shared-save-path");
    expect(html).not.toContain("data-shared-snapshot-path");
    expect(html).toContain('id="shared-editor-surfaces" data-active-surface="authoring" data-layout="split"');
    expect(html).toContain('aria-label="Project files"');
    expect(html).toContain('id="shared-source-highlight" data-shared-highlight');
    expect(html).toContain(
      'id="shared-source" data-shared-source maxlength="2000000" spellcheck="true" aria-describedby="shared-editor-help shared-collaborator-selections" readonly',
    );
    expect(html).toContain('id="shared-pdf-viewer" data-shared-pdf-viewer src="/share/locator.secret/document.pdf"');
    expect(html).toContain('href="?file=main-file" aria-current="page"');
    expect(html).toContain('<option value="main-file" selected>main.md</option>');
    expect(html.indexOf("main.md")).toBeLessThan(html.indexOf("sections/results.md"));
    expect(html).toContain("Review &lt;draft&gt;");
    expect(html).toContain("# Main &lt;source&gt;");
    expect(html).not.toContain("# Main <source>");
    expect(html).toContain("Anyone with this link can view");
    expect(html).not.toContain('<script type="module" src="/app.js"></script>');
    expect(html).not.toContain('id="workspace-settings"');
    expect(html).not.toContain('id="share-workspace"');
    expect(html).not.toContain("/api/workspaces/");
  });

  it("selects authored files with file navigation and falls back to the entry file", () => {
    expect(resolveReadOnlyShareFile(snapshot, "section-file").id).toBe("section-file");
    expect(resolveReadOnlyShareFile(snapshot, "missing").id).toBe("main-file");

    const html = renderReadOnlySharePage(snapshot, "/share/locator.secret", "section-file");
    expect(html).toContain('href="?file=section-file" aria-current="page"');
    expect(html).toContain("Results &amp; discussion");
  });

  it("keeps legacy file and PDF view links compatible with the editor shell", () => {
    expect(resolveReadOnlyShareFile(snapshot, null, "file:section-file").id).toBe("section-file");

    const legacyFileHtml = renderReadOnlySharePage(snapshot, "/share/locator.secret", null, "file:section-file");
    expect(legacyFileHtml).toContain('href="?file=section-file" aria-current="page"');
    expect(legacyFileHtml).toContain("Results &amp; discussion");

    const legacyPdfHtml = renderReadOnlySharePage(snapshot, "/share/locator.secret", null, "pdf");
    expect(legacyPdfHtml).toContain('id="shared-editor-surfaces" data-active-surface="authoring" data-layout="pdf"');
    expect(legacyPdfHtml).toContain('<option value="pdf" selected>PDF only</option>');
  });

  it("keeps legacy composed Markdown links readable without making them a primary navigation target", () => {
    const html = renderReadOnlySharePage(snapshot, "/share/locator.secret", null, "markdown");

    expect(html).toContain('data-shared-file-id="composed-manuscript"');
    expect(html).toContain('<option value="" selected>Composed manuscript</option>');
    expect(html).toContain("# Composed &lt;manuscript&gt;");
    expect(html).not.toContain("# Composed <manuscript>");
    expect(html).not.toContain('href="?view=markdown"');
  });
});
