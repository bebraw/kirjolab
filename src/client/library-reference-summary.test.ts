import { describe, expect, it } from "vitest";
import type { BibliographicRecord, LibraryPdfArtifact } from "../domain/reference-library";
import {
  LibraryReferenceSummary,
  libraryReferenceSummaryActionEvent,
  type LibraryReferenceSummaryAction,
  type LibraryReferenceSummaryData,
} from "./library-reference-summary";

class TestLibraryReferenceSummary extends LibraryReferenceSummary {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  emitForTest(action: LibraryReferenceSummaryAction): void {
    this.emitAction(action);
  }
}

const reference = {
  id: "ref-1",
  referenceKey: "doe2026",
  type: "article",
  title: "A {Useful} Paper",
  authors: ["Jane Doe"],
  year: "2026",
  venue: "Journal",
  doi: "",
  url: "",
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
  contentType: "application/pdf" as const,
  size: 2048,
  objectKey: "pdfs/paper",
  fingerprint: "fingerprint",
  rights: "private" as const,
  createdAt: "2026-07-25T00:00:00.000Z",
} satisfies LibraryPdfArtifact;

function data(overrides: Partial<LibraryReferenceSummaryData> = {}): LibraryReferenceSummaryData {
  return {
    keyState: "final",
    linkedCitationAlias: null,
    primaryArtifact: null,
    reference,
    workspace: false,
    ...overrides,
  };
}

describe("library reference summary", () => {
  it("owns light-DOM summary variants", () => {
    const summary = new TestLibraryReferenceSummary();
    expect(summary.rootForTest()).toBe(summary);
    expect(summary.renderForTest()).toBeDefined();
    summary.setData(data({ keyState: "provisional", primaryArtifact: artifact }));
    expect(summary.renderForTest()).toBeDefined();
    summary.setData(data({ linkedCitationAlias: "paper", workspace: true }));
    expect(summary.renderForTest()).toBeDefined();
  });

  it("emits typed PDF, link, and unlink actions", () => {
    const summary = new TestLibraryReferenceSummary();
    const actions: LibraryReferenceSummaryAction[] = [];
    summary.addEventListener(libraryReferenceSummaryActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryReferenceSummaryAction>).detail);
    });
    summary.emitForTest({ action: "open-pdf", artifact });
    summary.emitForTest({ action: "link", referenceId: reference.id, referenceKey: reference.referenceKey });
    summary.emitForTest({ action: "unlink", referenceId: reference.id });
    expect(actions).toEqual([
      { action: "open-pdf", artifact },
      { action: "link", referenceId: "ref-1", referenceKey: "doe2026" },
      { action: "unlink", referenceId: "ref-1" },
    ]);
  });
});
