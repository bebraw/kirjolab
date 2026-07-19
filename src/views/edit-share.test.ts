import { describe, expect, it } from "vitest";
import type { WorkspaceSnapshot } from "../domain/workspace";
import { renderEditSharePage, resolveEditShareFile } from "./edit-share";

const file = (id: string, path: string, content: string) => ({
  id,
  path,
  mediaType: "text/markdown" as const,
  content,
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
});

const snapshot: WorkspaceSnapshot = {
  id: "workspace-1",
  title: "Editable <draft>",
  entryFileId: "main-file",
  folders: [],
  assets: [],
  files: [file("section-file", "sections/results.md", "Results & discussion"), file("main-file", "main.md", "# Main <source>")],
  composition: { content: "", sourceMap: [], diagnostics: [], dependencies: {} },
  source: "# Main <source>",
  bibliography: "",
  revision: 9,
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

describe("editable project viewer", () => {
  it("defaults to main.md and renders the capability-scoped editor shell beside the PDF", () => {
    const html = renderEditSharePage(snapshot, "/edit/locator.secret", null);

    expect(resolveEditShareFile(snapshot, null).id).toBe("main-file");
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
    expect(html).toContain('<script type="module" src="/shared-editor.js"></script>');
    expect(html).toContain('data-app-mode="shared-editor" data-shared-editor-mode="edit"');
    expect(html).toContain('data-shared-revision="9"');
    expect(html).toContain('data-shared-file-id="main-file"');
    expect(html).toContain('data-shared-socket-path="/edit/locator.secret/socket"');
    expect(html).toContain('data-shared-save-path="/edit/locator.secret/files/main-file"');
    expect(html).toContain('data-shared-snapshot-path="/edit/locator.secret/snapshot"');
    expect(html).toContain('id="shared-editor-surfaces" data-active-surface="authoring" data-layout="split"');
    expect(html).toContain('aria-label="Project files"');
    expect(html).toContain('id="edit-source-highlight" data-shared-highlight');
    expect(html).toContain('id="edit-source" data-shared-source maxlength="2000000"');
    expect(html).not.toContain(
      'id="edit-source" data-shared-source maxlength="2000000" spellcheck="true" aria-describedby="shared-editor-help edit-collaborator-selections" readonly',
    );
    expect(html).toContain('id="edit-file-switcher" name="file"');
    expect(html).toContain('<option value="main-file" selected>main.md</option>');
    expect(html).toContain('<option value="section-file">sections/results.md</option>');
    expect(html).toContain('id="edit-collaborator-selections" data-shared-collaborator-selections aria-live="polite"');
    expect(html).toContain("# Main &lt;source&gt;");
    expect(html).not.toContain("# Main <source>");
    expect(html).toContain('id="edit-pdf-viewer" data-shared-pdf-viewer src="/edit/locator.secret/document.pdf"');
    expect(html.indexOf("main.md")).toBeLessThan(html.indexOf("sections/results.md"));
    expect(html).toContain(
      '<a class="project-file-row" data-active="true" href="?file=main-file" aria-current="page"><span class="min-w-0 truncate">main.md</span><span class="project-file-kind">Editing</span></a>',
    );
    expect(html).toContain(
      '<a class="project-file-row" data-active="false" href="?file=section-file"><span class="min-w-0 truncate">sections/results.md</span></a>',
    );
    expect(html).toContain("Anyone with this link can edit");
    expect(html).not.toContain('<script type="module" src="/app.js"></script>');
    expect(html).not.toContain('id="workspace-settings"');
    expect(html).not.toContain('id="share-workspace"');
    expect(html).not.toContain("/api/workspaces/");
  });

  it("selects a requested authored file and falls back to the entry file", () => {
    expect(resolveEditShareFile(snapshot, "section-file").id).toBe("section-file");
    expect(resolveEditShareFile(snapshot, "missing").id).toBe("main-file");
    const html = renderEditSharePage(snapshot, "/edit/locator.secret", "section-file");
    expect(html).toContain('href="?file=section-file" aria-current="page"');
    expect(html).toContain(
      '<a class="project-file-row" data-active="true" href="?file=section-file" aria-current="page"><span class="min-w-0 truncate">sections/results.md</span><span class="project-file-kind">Editing</span></a>',
    );
    expect(html).toContain(
      '<a class="project-file-row" data-active="false" href="?file=main-file"><span class="min-w-0 truncate">main.md</span></a>',
    );
    expect(html).toContain("Results &amp; discussion");
  });
});
