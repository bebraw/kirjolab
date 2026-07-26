import { describe, expect, it } from "vitest";
import type { BibliographicRecord } from "../domain/reference-library";
import type { WorkspaceSnapshot } from "../domain/workspace";
import { workspaceSnapshotFixture } from "../test-support/workspace-fixture";
import { LibraryPdfProjectUse, type LibraryPdfProjectUseContext } from "./library-pdf-project-use";
import { projectReferenceChangedEvent, type ProjectReferenceChanged, type ProjectReferenceMutation } from "./project-reference-mutation";

class TestProjectUse extends LibraryPdfProjectUse {
  readonly requests: { apiBase: string; mutation: ProjectReferenceMutation }[] = [];
  requestError: Error | null = null;

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  linkForTest(): Promise<void> {
    return this.linkReference();
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

const reference: BibliographicRecord = {
  id: "reference-1",
  referenceKey: "source2026",
  type: "article",
  title: "Source",
  authors: [],
  year: "2026",
  venue: "",
  doi: "",
  url: "",
  abstract: "",
  provenance: {},
  archivedAt: null,
  deletedAt: null,
  createdAt: "created",
  updatedAt: "updated",
};

const context = (overrides: Partial<LibraryPdfProjectUseContext> = {}): LibraryPdfProjectUseContext => ({
  artifact: { referenceId: reference.id },
  projectApiBase: "/api/workspaces/workspace",
  projectReferences: [],
  references: [reference],
  ...overrides,
});

describe("library PDF project use", () => {
  it("owns unidentified, unavailable, unlinked, and linked presentation", () => {
    const projectUse = new TestProjectUse();
    expect(projectUse.rootForTest()).toBe(projectUse);
    expect(projectUse.renderForTest()).toBeDefined();
    projectUse.setContext(context({ artifact: { referenceId: null } }));
    expect(projectUse.renderForTest()).toBeDefined();
    projectUse.setContext(context({ projectApiBase: null }));
    expect(projectUse.renderForTest()).toBeDefined();
    projectUse.setContext(context());
    expect(projectUse.renderForTest()).toBeDefined();
    projectUse.setContext(context({ projectReferences: [{ citationAlias: "source", referenceId: reference.id }] }));
    expect(projectUse.renderForTest()).toBeDefined();
  });

  it("owns stable link transport and emits only the completed workspace outcome", async () => {
    const projectUse = new TestProjectUse();
    const outcomes: ProjectReferenceChanged[] = [];
    projectUse.addEventListener(projectReferenceChangedEvent, (event) => {
      outcomes.push((event as CustomEvent<ProjectReferenceChanged>).detail);
    });
    projectUse.setContext(context());

    await projectUse.linkForTest();

    expect(projectUse.requests).toEqual([
      {
        apiBase: "/api/workspaces/workspace",
        mutation: { action: "link", citationAlias: "source2026", referenceId: "reference-1" },
      },
    ]);
    expect(outcomes).toEqual([
      {
        message: "Added :cite[source2026] to this project's reference set.",
        snapshot: workspaceSnapshotFixture,
      },
    ]);
  });

  it("keeps failures retryable and ignores unavailable targets", async () => {
    const projectUse = new TestProjectUse();
    projectUse.setContext(context({ projectApiBase: null }));
    await projectUse.linkForTest();
    projectUse.setContext(context());
    projectUse.requestError = new Error("Denied");
    await expect(projectUse.linkForTest()).rejects.toThrow("Denied");
    projectUse.requestError = null;
    await projectUse.linkForTest();
    expect(projectUse.requests).toHaveLength(2);
  });
});
