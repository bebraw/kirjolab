import { describe, expect, it } from "vitest";
import type { WorkspaceSnapshot } from "../domain/workspace";
import { renderReadOnlySharePage, resolveReadOnlyShareView } from "./read-only-share";

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
  it("defaults to the rendered PDF with output and sorted file navigation", () => {
    const html = renderReadOnlySharePage(snapshot, "/share/locator.secret", null);

    expect(resolveReadOnlyShareView(snapshot, null)).toEqual({ kind: "pdf" });
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
    expect(html).toContain('<script type="module" src="/read-only-share.js"></script>');
    expect(html).toContain('data-share-revision="7" data-share-socket-path="/share/locator.secret/socket"');
    expect(html).toContain('id="shared-live-status">Connecting · revision 7</span>');
    expect(html).toContain('id="shared-pdf-viewer" src="/share/locator.secret/document.pdf"');
    expect(html).toContain('href="?view=pdf" aria-current="page"');
    expect(html).toContain('<option value="pdf" selected>Rendered PDF</option>');
    expect(html.indexOf("main.md")).toBeLessThan(html.indexOf("sections/results.md"));
    expect(html).toContain("Review &lt;draft&gt;");
  });

  it("renders composed Markdown without treating authored content as HTML", () => {
    const html = renderReadOnlySharePage(snapshot, "/share/locator.secret", "markdown");

    expect(resolveReadOnlyShareView(snapshot, "markdown")).toEqual({ kind: "markdown" });
    expect(html).toContain('href="?view=markdown" aria-current="page"');
    expect(html).toContain("# Composed &lt;manuscript&gt;");
    expect(html).not.toContain("# Composed <manuscript>");
  });

  it("selects an authored file and falls back to PDF for an unknown selection", () => {
    const selected = resolveReadOnlyShareView(snapshot, "file:section-file");
    expect(selected).toMatchObject({ kind: "file", file: { id: "section-file" } });

    const html = renderReadOnlySharePage(snapshot, "/share/locator.secret", "file:section-file");
    expect(html).toContain('href="?view=file%3Asection-file" aria-current="page"');
    expect(html).toContain("Results &amp; discussion");
    expect(resolveReadOnlyShareView(snapshot, "file:missing")).toEqual({ kind: "pdf" });
  });
});
