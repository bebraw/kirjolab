import { describe, expect, it } from "vitest";
import type { BibliographicRecord, LibraryPdfArtifact } from "../../domain/reference-library";
import type { WorkspaceSnapshot } from "../../domain/workspace/workspace";
import { workspaceSnapshotFixture } from "../../test-support/workspace-fixture";
import {
  LibraryReferenceSummary,
  libraryReferenceSummaryActionEvent,
  type LibraryReferenceSummaryAction,
  type LibraryReferenceSummaryData,
} from "./library-reference-summary";
import {
  projectReferenceChangedEvent,
  type ProjectReferenceChanged,
  type ProjectReferenceMutation,
} from "../project/project-reference-mutation";

class TestLibraryReferenceSummary extends LibraryReferenceSummary {
  readonly requests: { apiBase: string; mutation: ProjectReferenceMutation }[] = [];
  requestError: Error | null = null;

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  emitForTest(action: LibraryReferenceSummaryAction): void {
    this.emitAction(action);
  }

  openPrimaryPdfForTest(): void {
    this.openPrimaryPdf();
  }

  linkForTest(): Promise<void> {
    return this.linkReference();
  }

  unlinkForTest(): Promise<void> {
    return this.unlinkReference();
  }

  protected override async requestProjectReferenceMutation(
    apiBase: string,
    mutation: ProjectReferenceMutation,
  ): Promise<WorkspaceSnapshot> {
    this.requests.push({ apiBase, mutation });
    if (this.requestError) throw this.requestError;
    return workspaceSnapshotFixture;
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
  doi: "10.1000/useful",
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
    projectApiBase: null,
    reference,
    ...overrides,
  };
}

describe("library reference summary", () => {
  it("owns light-DOM summary and project availability variants", () => {
    const summary = new TestLibraryReferenceSummary();
    expect(summary.rootForTest()).toBe(summary);
    expect(summary.renderForTest()).toBeDefined();
    summary.setData(data({ keyState: "provisional", primaryArtifact: artifact }));
    expect(summary.renderForTest()).toBeDefined();
    summary.setData(data({ projectApiBase: "/api/workspaces/workspace" }));
    expect(summary.renderForTest()).toBeDefined();
    summary.setData(data({ linkedCitationAlias: "paper", projectApiBase: "/api/workspaces/workspace" }));
    expect(summary.renderForTest()).toBeDefined();
  });

  it("keeps PDF and citation-trail navigation as typed intents", () => {
    const summary = new TestLibraryReferenceSummary();
    const actions: LibraryReferenceSummaryAction[] = [];
    summary.addEventListener(libraryReferenceSummaryActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryReferenceSummaryAction>).detail);
    });
    summary.emitForTest({ action: "open-pdf", artifact });
    summary.emitForTest({ action: "open-citation-network", referenceId: reference.id });
    summary.emitForTest({ action: "find-open-pdf", reference });
    expect(actions).toEqual([
      { action: "open-pdf", artifact },
      { action: "open-citation-network", referenceId: reference.id },
      { action: "find-open-pdf", reference },
    ]);
  });

  it("opens the primary PDF from its summary and leaves summaries without PDFs inert", () => {
    const summary = new TestLibraryReferenceSummary();
    const actions: LibraryReferenceSummaryAction[] = [];
    summary.addEventListener(libraryReferenceSummaryActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryReferenceSummaryAction>).detail);
    });

    summary.openPrimaryPdfForTest();
    summary.setData(data());
    summary.openPrimaryPdfForTest();
    summary.setData(data({ primaryArtifact: artifact }));
    summary.openPrimaryPdfForTest();

    expect(actions).toEqual([{ action: "open-pdf", artifact }]);
  });

  it("owns stable link and unlink requests and emits completed workspace outcomes", async () => {
    const summary = new TestLibraryReferenceSummary();
    const outcomes: ProjectReferenceChanged[] = [];
    summary.addEventListener(projectReferenceChangedEvent, (event) => {
      outcomes.push((event as CustomEvent<ProjectReferenceChanged>).detail);
    });
    summary.setData(data({ projectApiBase: "/api/workspaces/workspace" }));
    await summary.linkForTest();
    summary.setData(data({ linkedCitationAlias: "doe2026", projectApiBase: "/api/workspaces/workspace" }));
    await summary.unlinkForTest();

    expect(summary.requests).toEqual([
      {
        apiBase: "/api/workspaces/workspace",
        mutation: { action: "link", citationAlias: "doe2026", referenceId: "ref-1" },
      },
      { apiBase: "/api/workspaces/workspace", mutation: { action: "unlink", referenceId: "ref-1" } },
    ]);
    expect(outcomes.map(({ message }) => message)).toEqual([
      "Added :cite[doe2026] to this project's reference set.",
      "Reference removed from this project; the private library record remains.",
    ]);
  });

  it("keeps provider failures retryable and guards unavailable targets", async () => {
    const summary = new TestLibraryReferenceSummary();
    await summary.linkForTest();
    summary.setData(data({ projectApiBase: "/api/workspaces/workspace" }));
    summary.requestError = new Error("Denied");
    await expect(summary.linkForTest()).rejects.toThrow("Denied");
    summary.requestError = null;
    await summary.linkForTest();

    expect(summary.requests).toHaveLength(2);
  });
});
