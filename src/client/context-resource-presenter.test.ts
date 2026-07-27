import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryPdfArtifact, ProjectReferencePdf } from "../domain/reference-library";
import { workspaceSnapshotFixture } from "../test-support/workspace-fixture";
import { AssistantWorkflowStatus } from "./assistant-workflow-status";
import { CandidateListPanel } from "./candidate-list-panel";
import { CandidateReviewPanel } from "./candidate-review-panel";
import { ClaimListPanel } from "./claim-list-panel";
import { ContextResourcePresenter, type ContextResourceSources } from "./context-resource-presenter";
import { LibraryPdfInspector } from "./library-pdf-inspector";
import { ManuscriptCommentList } from "./manuscript-comment-list";
import { ProjectAnnotationForm } from "./project-annotation-form";
import { ProjectEvidencePanel } from "./project-evidence-panel";
import { PublicationContextPanel } from "./publication-context-panel";
import { PublicationIntakePanel } from "./publication-intake-panel";
import { PublicationListPanel } from "./publication-list-panel";
import type { ResearchResourceTab } from "./research-context";
import { WorkspaceRailTabs } from "./workspace-rail-tabs";

const libraryPdf: LibraryPdfArtifact = {
  contentType: "application/pdf",
  createdAt: "created",
  fingerprint: "library-fingerprint",
  id: "library/pdf",
  name: "library.pdf",
  objectKey: "library/library.pdf",
  referenceId: "reference:1",
  rights: "private",
  size: 2048,
};
const referencePdf: ProjectReferencePdf = {
  fingerprint: "reference-fingerprint",
  id: "reference/pdf",
  name: "reference.pdf",
  referenceId: "reference:1",
  size: 4096,
};

function resourceTab(kind: "pdf" | "library-pdf", id: string): Extract<ResearchResourceTab, { kind: "pdf" | "library-pdf" }> {
  return { focusedAnnotationId: null, id, key: `${kind}:${id}`, kind, page: 1, scrollTop: 0 };
}

function sources(activeTab: ResearchResourceTab | undefined): ContextResourceSources {
  return {
    activeTab,
    candidateDecision: null,
    libraryArtifacts: [libraryPdf],
    referencePdfs: [referencePdf],
    snapshot: workspaceSnapshotFixture,
    sourceRevision: 3,
    stableDocument: true,
  };
}

function setup() {
  const presenter = new ContextResourcePresenter();
  const elements = {
    "assistant-workflow-status": new AssistantWorkflowStatus(),
    "candidate-list-panel": new CandidateListPanel(),
    "candidate-review-panel": new CandidateReviewPanel(),
    "claim-list-panel": new ClaimListPanel(),
    "library-pdf-inspector": new LibraryPdfInspector(),
    "manuscript-comment-list-panel": new ManuscriptCommentList(),
    "project-annotation-form": new ProjectAnnotationForm(),
    "project-evidence-panel": new ProjectEvidencePanel(),
    "publication-context-panel": new PublicationContextPanel(),
    "publication-intake-panel": new PublicationIntakePanel(),
    "publication-list-panel": new PublicationListPanel(),
    "paper-reader": Object.assign(new HTMLElement(), { scrollTop: 36 }),
    "workspace-rail-tabs": new WorkspaceRailTabs(),
  };
  Object.defineProperty(elements["publication-context-panel"], "querySelector", { configurable: true, value: () => null });
  Object.defineProperty(elements["candidate-review-panel"], "querySelector", { configurable: true, value: () => null });
  Object.defineProperty(presenter, "ownerDocument", {
    value: { getElementById: (id: string) => elements[id as keyof typeof elements] ?? null },
  });
  return { elements, presenter };
}

describe("context resource presenter", () => {
  beforeEach(() =>
    vi.stubGlobal(
      "HTMLElement",
      class {
        scrollTop = 0;
      },
    ),
  );
  afterEach(() => vi.unstubAllGlobals());

  it("presents publication and candidate resources through their Lit owners", () => {
    const { elements, presenter } = setup();
    const setPublication = vi.spyOn(elements["publication-context-panel"], "setPublication").mockReturnValue(true);
    const setCandidate = vi.spyOn(elements["candidate-review-panel"], "setCandidate").mockReturnValue(true);
    const publicationTab = { id: "publication:1", key: "publication:publication:1", kind: "publication", scrollTop: 12 } as const;
    const candidateTab = { id: "candidate:1", key: "candidate:candidate:1", kind: "candidate", scrollTop: 24 } as const;

    expect(presenter.present(sources(publicationTab))).toMatchObject({ publicationPresented: true });
    presenter.present({ ...sources(candidateTab), candidateDecision: { action: "apply", id: candidateTab.id } });

    expect(setPublication).toHaveBeenCalledWith(expect.objectContaining({ publicationId: publicationTab.id }));
    expect(setCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId: candidateTab.id, decision: { action: "apply", id: candidateTab.id } }),
    );
  });

  it("switches project, private-Library, and shared-reference PDF presentation", () => {
    const { elements, presenter } = setup();
    const setPdf = vi.spyOn(elements["publication-intake-panel"], "setPdf");
    const setAnnotationVisible = vi.spyOn(elements["project-annotation-form"], "setVisible");
    const setInspectorVisible = vi.spyOn(elements["library-pdf-inspector"], "setVisible");

    expect(presenter.present(sources(resourceTab("pdf", "project/pdf")))).toMatchObject({ activeLibraryArtifact: undefined });
    expect(presenter.present(sources(resourceTab("library-pdf", libraryPdf.id)))).toMatchObject({
      activeLibraryArtifact: libraryPdf,
    });
    expect(presenter.present(sources(resourceTab("library-pdf", referencePdf.id)))).toMatchObject({
      activeLibraryArtifact: undefined,
    });

    expect(setPdf).toHaveBeenCalledWith("project/pdf", [], []);
    expect(setAnnotationVisible.mock.calls.map(([visible]) => visible)).toEqual([true, false, false]);
    expect(setInspectorVisible.mock.calls.map(([visible]) => visible)).toEqual([false, true, false]);
  });

  it("clears PDF-only presentation when no resource is active", () => {
    const { elements, presenter } = setup();
    const setCitationContext = vi.spyOn(elements["project-annotation-form"], "setCitationContext");

    expect(presenter.present(sources(undefined))).toEqual({
      activeLibraryArtifact: undefined,
      publicationPresented: false,
    });
    expect(setCitationContext).toHaveBeenCalledWith(null, []);
  });

  it("reads resource scroll from the owning panel", () => {
    const { elements, presenter } = setup();
    Object.defineProperty(elements["publication-context-panel"], "querySelector", { value: () => ({ scrollTop: 12 }) });
    Object.defineProperty(elements["candidate-review-panel"], "querySelector", { value: () => ({ scrollTop: 24 }) });

    expect(presenter.resourceScrollTop({ id: "publication:1", key: "publication:publication:1", kind: "publication", scrollTop: 0 })).toBe(
      12,
    );
    expect(presenter.resourceScrollTop({ id: "candidate:1", key: "candidate:candidate:1", kind: "candidate", scrollTop: 0 })).toBe(24);
    expect(presenter.resourceScrollTop(resourceTab("pdf", "pdf:1"))).toBe(36);
  });

  it("projects canonical workspace resources across their bounded Lit owners", () => {
    const { elements, presenter } = setup();
    const snapshot = {
      ...workspaceSnapshotFixture,
      annotations: [
        {
          comment: "Evidence",
          createdAt: "created",
          fragments: [],
          id: "annotation-1",
          page: 2,
          pdfId: "pdf-1",
          prefix: "",
          quote: "Quoted evidence",
          rects: [],
          suffix: "",
          updatedAt: "updated",
        },
      ],
    };
    const reconcileEvidence = vi.spyOn(elements["assistant-workflow-status"], "reconcileEvidence");
    const setEvidence = vi.spyOn(elements["project-evidence-panel"], "setEvidence");
    const setPdfs = vi.spyOn(elements["project-annotation-form"], "setPdfs");
    const setWorkspace = vi.spyOn(elements["publication-list-panel"], "setWorkspace");
    const setClaims = vi.spyOn(elements["claim-list-panel"], "setWorkspace");
    const setComments = vi.spyOn(elements["manuscript-comment-list-panel"], "setComments").mockReturnValue(3);
    const setCommentCount = vi.spyOn(elements["workspace-rail-tabs"], "setCommentCount");
    const setCandidates = vi.spyOn(elements["candidate-list-panel"], "setCandidates");

    expect(presenter.presentWorkspace(snapshot, "pdf-1")).toEqual(snapshot.annotations);
    expect(reconcileEvidence).toHaveBeenCalledWith(snapshot.annotations, snapshot.claims);
    expect(setEvidence).toHaveBeenCalledWith(snapshot, expect.any(Set));
    expect(setPdfs).toHaveBeenCalledWith(snapshot.pdfs, "pdf-1");
    expect(setWorkspace).toHaveBeenCalledWith(snapshot);
    expect(setClaims).toHaveBeenCalledWith(snapshot, expect.any(Set));
    expect(setComments).toHaveBeenCalledWith(snapshot.comments);
    expect(setCommentCount).toHaveBeenCalledWith(3);
    expect(setCandidates).toHaveBeenCalledWith(snapshot.candidates);
    expect(presenter.presentWorkspace(snapshot, undefined)).toEqual([]);
  });
});
