import { describe, expect, it } from "vitest";
import type { BibliographicRecord, LibraryPdfArtifact, ResearchShareSnapshot, WebSnapshot } from "../domain/reference-library";
import {
  LibraryReferenceResearchRows,
  libraryReferenceResearchActionEvent,
  type LibraryReferenceResearchAction,
  type LibraryReferenceResearchData,
} from "./library-reference-research-rows";

class TestLibraryReferenceResearchRows extends LibraryReferenceResearchRows {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  emitForTest(action: LibraryReferenceResearchAction): void {
    this.emitAction(action);
  }
}

const reference = {
  id: "ref-1",
  referenceKey: "doe2026",
  type: "article",
  title: "Paper",
  authors: ["Jane Doe"],
  year: "2026",
  venue: "Journal",
  doi: "",
  url: "https://example.test/paper",
  abstract: "",
  provenance: {},
  archivedAt: null,
  deletedAt: null,
  createdAt: "2026-07-25T00:00:00.000Z",
  updatedAt: "2026-07-25T00:00:00.000Z",
} satisfies BibliographicRecord;

const artifact = {
  id: "pdf-1",
  referenceId: reference.id,
  name: "paper.pdf",
  contentType: "application/pdf",
  size: 2048,
  objectKey: "pdfs/pdf-1",
  fingerprint: "fingerprint",
  rights: "private",
  createdAt: "2026-07-25T00:00:00.000Z",
} satisfies LibraryPdfArtifact;

const webSnapshot = (id: string, accessedAt: string, complete = true): WebSnapshot => ({
  id,
  referenceId: reference.id,
  requestedUrl: reference.url,
  finalUrl: reference.url,
  accessedAt,
  status: 200,
  contentType: "text/html",
  rawObjectKey: `snapshots/${id}/raw`,
  readableObjectKey: `snapshots/${id}/readable`,
  rawSize: 200,
  readableSize: 100,
  contentHash: id,
  title: reference.title,
  authors: reference.authors,
  publisher: reference.venue,
  publishedAt: reference.year,
  complete,
  diagnostics: complete ? [] : ["Partial capture"],
  redirectChain: [],
  etag: "",
  lastModified: "",
});

const share = {
  id: "share-1",
  projectId: "project-1",
  referenceId: reference.id,
  resourceId: "note-1",
  kind: "note",
  content: { kind: "note", body: "Private note" },
  createdAt: "2026-07-25T00:00:00.000Z",
  revokedAt: null,
} satisfies ResearchShareSnapshot;

function data(overrides: Partial<LibraryReferenceResearchData> = {}): LibraryReferenceResearchData {
  return {
    artifacts: [artifact],
    canonicalUrl: reference.url,
    highlights: [
      {
        id: "highlight-1",
        referenceId: reference.id,
        artifactId: artifact.id,
        page: 2,
        quote: "Evidence",
        comment: "",
        rects: [{ x: 0, y: 0, width: 1, height: 1 }],
        createdAt: "created",
        updatedAt: "updated",
      },
    ],
    linkedSnapshotId: "snapshot-2",
    notes: [{ id: "note-1", referenceId: reference.id, body: "Private note", createdAt: "created", updatedAt: "updated" }],
    reference,
    referenceLinked: true,
    researchShares: [share],
    webSnapshots: [webSnapshot("snapshot-2", "2026-07-25T10:00:00.000Z"), webSnapshot("snapshot-1", "invalid timestamp", false)],
    ...overrides,
  };
}

describe("library reference research rows", () => {
  it("owns empty and populated light-DOM research presentation", () => {
    const rows = new TestLibraryReferenceResearchRows();
    expect(rows.rootForTest()).toBe(rows);
    expect(rows.renderForTest()).toBeDefined();
    rows.setData(data());
    expect(rows.renderForTest()).toBeDefined();
    rows.setData(data({ artifacts: [], canonicalUrl: null, highlights: [], notes: [], researchShares: [], webSnapshots: [] }));
    expect(rows.renderForTest()).toBeDefined();
  });

  it("emits coordinator-owned lifecycle actions", () => {
    const rows = new TestLibraryReferenceResearchRows();
    const actions: LibraryReferenceResearchAction[] = [];
    rows.addEventListener(libraryReferenceResearchActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryReferenceResearchAction>).detail);
    });
    rows.emitForTest({ action: "capture", canonicalUrl: reference.url });
    rows.emitForTest({ action: "compare", currentId: "snapshot-2", priorId: "snapshot-1" });
    rows.emitForTest({ action: "pin", referenceId: reference.id, snapshotId: "snapshot-2" });
    rows.emitForTest({ action: "revoke", shareId: share.id });
    rows.emitForTest({ action: "share", kind: "highlight", referenceId: reference.id, resourceId: "highlight-1" });
    expect(actions).toHaveLength(5);
  });
});
