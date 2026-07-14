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
};

describe("editable project viewer", () => {
  it("defaults to main.md and renders a bounded editor beside the PDF", () => {
    const html = renderEditSharePage(snapshot, "/edit/locator.secret", null);

    expect(resolveEditShareFile(snapshot, null).id).toBe("main-file");
    expect(html).toContain('<script type="module" src="/edit-share.js"></script>');
    expect(html).toContain('data-edit-revision="9"');
    expect(html).toContain('data-edit-file-id="main-file"');
    expect(html).toContain('data-edit-socket-path="/edit/locator.secret/socket"');
    expect(html).toContain('data-edit-save-path="/edit/locator.secret/files/main-file"');
    expect(html).toContain('id="edit-source-highlight"');
    expect(html).toContain('id="edit-source" maxlength="2000000"');
    expect(html).toContain('id="edit-collaborator-selections" aria-live="polite"');
    expect(html).toContain("# Main &lt;source&gt;");
    expect(html).not.toContain("# Main <source>");
    expect(html).toContain('id="edit-pdf-viewer" src="/edit/locator.secret/document.pdf"');
    expect(html.indexOf("main.md")).toBeLessThan(html.indexOf("sections/results.md"));
  });

  it("selects a requested authored file and falls back to the entry file", () => {
    expect(resolveEditShareFile(snapshot, "section-file").id).toBe("section-file");
    expect(resolveEditShareFile(snapshot, "missing").id).toBe("main-file");
    const html = renderEditSharePage(snapshot, "/edit/locator.secret", "section-file");
    expect(html).toContain('href="?file=section-file" aria-current="page"');
    expect(html).toContain("Results &amp; discussion");
  });
});
