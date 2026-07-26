import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnnotationResource, ClaimEvidenceLink, PassageLink, PdfResource, PublicationPdfLink } from "../domain/workspace";
import { ProjectEvidencePanel, projectEvidenceActionEvent, type ProjectEvidenceAction } from "./project-evidence-panel";

const createdAt = "2026-07-25T00:00:00.000Z";
const pdf: PdfResource = {
  contentType: "application/pdf",
  createdAt,
  fingerprint: "fingerprint",
  id: "pdf:1",
  name: "paper.pdf",
  objectKey: "pdfs/paper.pdf",
  size: 1024,
};
const annotation: AnnotationResource = {
  comment: "Working note",
  createdAt,
  fragments: [
    {
      createdAt,
      id: "fragment:1",
      prefix: "Before",
      quote: "Evidence",
      rects: [{ height: 0.1, width: 0.2, x: 0.1, y: 0.2 }],
      suffix: "After",
    },
  ],
  id: "annotation:1",
  page: 2,
  pdfId: pdf.id,
  prefix: "Before",
  quote: "Evidence",
  rects: [],
  suffix: "After",
  updatedAt: createdAt,
};
const link: PassageLink = {
  anchor: {
    anchoredRevision: 1,
    exact: "Linked passage",
    fileId: "main",
    originalRange: { end: 14, start: 0 },
    prefix: "",
    relativeEnd: "AQ",
    relativeStart: "AA",
    suffix: "",
    version: 1,
  },
  annotationId: annotation.id,
  createdAt,
  id: "passage:1",
  resolution: { end: 14, exactMatch: true, start: 0, status: "resolved", text: "Linked passage" },
};
const publicationPdfLink: PublicationPdfLink = {
  createdAt,
  id: "publication-pdf:1",
  pdfId: pdf.id,
  publicationId: "publication:1",
};
const claimEvidenceLink: ClaimEvidenceLink = {
  annotationId: annotation.id,
  claimId: "claim:1",
  createdAt,
  id: "claim-evidence:1",
  relation: "supports",
};

class TestProjectEvidencePanel extends ProjectEvidencePanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  toggleForTest(pdfId?: string, open = true): void {
    this.togglePdf(eventWithTarget({ dataset: pdfId ? { pdfAnnotationGroup: pdfId } : {}, open }));
  }

  toggleEvidenceForTest(open: boolean): void {
    this.toggleEvidence(eventWithTarget({ open }));
  }

  pdfForTest(action?: string, pdfId = pdf.id): void {
    this.actOnPdf(eventWithTarget({ dataset: { pdfAction: action, pdfId } }));
  }

  evidenceForTest(key?: string, checked = true): void {
    this.selectEvidence(eventWithTarget({ checked, dataset: key ? { modelEvidenceKey: key } : {} }));
  }

  annotationForTest(action?: string, annotationId = annotation.id): void {
    this.actOnAnnotation(eventWithTarget({ dataset: { annotationAction: action, annotationId } }));
  }

  passageForTest(annotationId = annotation.id): void {
    this.openPassage(eventWithTarget({ dataset: { annotationId } }));
  }

  fragmentForTest(
    action?: string,
    adjustment?: string,
    annotationId = annotation.id,
    fragmentId = annotation.fragments[0]!.id,
  ): Promise<void> {
    return this.actOnFragment(
      eventWithTarget({
        closest: () => ({ closest: () => null, querySelector: () => ({ value: "Revised evidence" }) }),
        dataset: { annotationId, fragmentAction: action, fragmentAdjustment: adjustment, fragmentId },
      }),
    );
  }

  removeForTest(value: PdfResource = pdf): Promise<void> {
    return this.removePdf(value);
  }

  removeAnnotationForTest(value: AnnotationResource = annotation): Promise<void> {
    return this.removeAnnotation(value);
  }
}

function eventWithTarget(target: object): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: target });
  return event;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("project evidence panel", () => {
  it("renders empty, assigned, unassigned, linked, and selected states", () => {
    const panel = new TestProjectEvidencePanel();
    Object.defineProperty(panel, "querySelector", { value: () => null });
    expect(panel.focusEvidence()).toBe(false);
    expect(panel.renderForTest()).toBeDefined();
    panel.setEvidence(
      {
        annotations: [annotation, { ...annotation, id: "annotation:2", pdfId: "missing" }],
        claimEvidenceLinks: [],
        links: [link],
        pdfs: [pdf],
        publicationPdfLinks: [],
      },
      new Set(["annotation:1"]),
    );
    panel.toggleForTest(pdf.id);
    panel.toggleEvidenceForTest(false);
    expect(panel.renderForTest()).toBeDefined();
    panel.setEvidence(
      {
        annotations: [],
        claimEvidenceLinks: [],
        links: [],
        pdfs: [],
        publicationPdfLinks: [],
      },
      new Set(),
    );
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("emits bounded PDF, annotation, passage, and evidence intents", () => {
    const panel = new TestProjectEvidencePanel();
    const actions: ProjectEvidenceAction[] = [];
    panel.addEventListener(projectEvidenceActionEvent, (event) => actions.push((event as CustomEvent<ProjectEvidenceAction>).detail));
    panel.setEvidence(
      {
        annotations: [annotation],
        claimEvidenceLinks: [],
        links: [link],
        pdfs: [pdf],
        publicationPdfLinks: [],
      },
      new Set(),
    );

    panel.toggleForTest();
    panel.pdfForTest("open", "missing");
    panel.pdfForTest();
    panel.pdfForTest("open");
    panel.evidenceForTest();
    panel.evidenceForTest("annotation:1", false);
    panel.annotationForTest("open", "missing");
    panel.annotationForTest();
    panel.annotationForTest("open");
    panel.annotationForTest("edit");
    panel.annotationForTest("link");
    panel.passageForTest("missing");
    panel.passageForTest();
    const changedAnchor = { ...link.anchor, exact: "Changed passage" };
    panel.setPassageLinks([{ ...link, anchor: changedAnchor }]);
    panel.passageForTest();

    expect(actions).toEqual([
      { action: "open-pdf", pdf },
      { action: "evidence", key: "annotation:1", selected: false },
      { action: "open-pdf", annotationId: annotation.id, page: annotation.page, pdf },
      { action: "edit-annotation", annotation },
      { action: "link-annotation", annotationId: annotation.id },
      { action: "open-passage", anchor: link.anchor },
      { action: "open-passage", anchor: changedAnchor },
    ]);
  });

  it("owns adjusted fragment persistence and emits completed or removal outcomes", async () => {
    const panel = new TestProjectEvidencePanel();
    const actions: ProjectEvidenceAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    panel.addEventListener(projectEvidenceActionEvent, (event) => actions.push((event as CustomEvent<ProjectEvidenceAction>).detail));
    panel.setEvidence(
      {
        annotations: [annotation],
        claimEvidenceLinks: [],
        links: [],
        pdfs: [pdf],
        publicationPdfLinks: [],
      },
      new Set(),
    );

    await panel.fragmentForTest("save", undefined, "missing");
    await panel.fragmentForTest("save");
    await panel.fragmentForTest(undefined, "right");
    await panel.fragmentForTest("remove");

    expect(actions).toEqual([
      { action: "fragment-updated", message: "Highlight stroke adjusted." },
      { action: "fragment-updated", message: "Highlight stroke adjusted." },
      { action: "remove-fragment", annotationId: annotation.id, fragmentId: annotation.fragments[0]!.id },
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/workspaces/workspace/annotations/annotation%3A1/fragments/fragment%3A1",
      expect.objectContaining({
        body: JSON.stringify({
          prefix: "Before",
          quote: "Revised evidence",
          rects: [{ height: 0.1, width: 0.2, x: 0.105, y: 0.2 }],
          suffix: "After",
        }),
      }),
    );
  });

  it("owns passage-link persistence and emits the completed outcome", async () => {
    const panel = new TestProjectEvidencePanel();
    const actions: ProjectEvidenceAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    panel.addEventListener(projectEvidenceActionEvent, (event) => actions.push((event as CustomEvent<ProjectEvidenceAction>).detail));
    const input = {
      annotationId: "annotation/1",
      fileId: "main",
      start: 0,
      end: 16,
      excerpt: "Selected passage",
      sourceRevision: 4,
    };

    await panel.linkPassage(input);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/workspace/links",
      expect.objectContaining({ body: JSON.stringify(input), method: "POST" }),
    );
    expect(actions).toEqual([{ action: "annotation-linked", message: "Annotation linked to the selected passage." }]);
  });

  it("owns project PDF validation, persistence, and completed outcomes", async () => {
    const panel = new TestProjectEvidencePanel();
    const actions: ProjectEvidenceAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    panel.addEventListener(projectEvidenceActionEvent, (event) => actions.push((event as CustomEvent<ProjectEvidenceAction>).detail));
    const file = new File(["%PDF-1.7"], "paper draft.pdf", { type: "application/pdf" });

    await panel.uploadPdf(new File(["image"], "figure.png", { type: "image/png" }));
    await panel.uploadPdf(file);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/workspace/pdfs", {
      body: file,
      headers: { "content-type": "application/pdf", "x-file-name": "paper%20draft.pdf" },
      method: "POST",
    });
    expect(actions).toEqual([{ action: "pdf-imported", message: "PDF imported without modifying the source file." }]);
  });

  it("keeps project PDF upload failures local and retryable", async () => {
    const panel = new TestProjectEvidencePanel();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ error: "Denied" }, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    const file = new File(["%PDF-1.7"], "paper.pdf", { type: "application/pdf" });

    await panel.uploadPdf(file);
    expect(panel.renderForTest()).toBeDefined();
    await panel.uploadPdf(file);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps failed passage linking local and retryable", async () => {
    const panel = new TestProjectEvidencePanel();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ error: "Denied" }, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    const input = { annotationId: "annotation-1", fileId: "main", start: 0, end: 16, excerpt: "Selected passage", sourceRevision: 4 };

    await panel.linkPassage(input);
    expect(panel.renderForTest()).toBeDefined();
    await panel.linkPassage(input);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("owns highlight fragment update and deletion transport", async () => {
    const panel = new TestProjectEvidencePanel();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    panel.configure("/api/workspaces/workspace");
    const input = { prefix: "Before", quote: "  Revised evidence  ", rects: annotation.fragments[0]!.rects, suffix: "After" };

    await expect(panel.updateFragment("annotation/1", "fragment/1", input)).resolves.toBe(true);
    await expect(panel.removeFragment("annotation/1", "fragment/1")).resolves.toEqual({ annotationDeleted: true });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/workspaces/workspace/annotations/annotation%2F1/fragments/fragment%2F1",
      expect.objectContaining({ body: JSON.stringify({ ...input, quote: "Revised evidence" }), method: "PUT" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/workspaces/workspace/annotations/annotation%2F1/fragments/fragment%2F1", {
      credentials: "same-origin",
      method: "DELETE",
    });
  });

  it("keeps invalid and failed highlight fragment mutations local and retryable", async () => {
    const panel = new TestProjectEvidencePanel();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ error: "Denied" }, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    const input = { prefix: "", quote: "Evidence", rects: [], suffix: "" };

    await expect(panel.updateFragment("annotation-1", "fragment-1", { ...input, quote: " " })).resolves.toBe(false);
    await expect(panel.updateFragment("annotation-1", "fragment-1", input)).resolves.toBe(false);
    expect(panel.renderForTest()).toBeDefined();
    await expect(panel.updateFragment("annotation-1", "fragment-1", input)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("blocks removal while highlights or reference links remain", async () => {
    const panel = new TestProjectEvidencePanel();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    panel.configure("/api/workspaces/workspace");
    panel.setEvidence(
      {
        annotations: [annotation],
        claimEvidenceLinks: [],
        links: [],
        pdfs: [pdf],
        publicationPdfLinks: [publicationPdfLink],
      },
      new Set(),
    );

    await panel.removeForTest();

    expect(fetchMock).not.toHaveBeenCalled();
    const notices: ProjectEvidenceAction[] = [];
    panel.addEventListener(projectEvidenceActionEvent, (event) => notices.push((event as CustomEvent<ProjectEvidenceAction>).detail));
    await panel.removeForTest();
    expect(notices).toEqual([
      { action: "notice", message: "Cannot remove paper.pdf: remove 1 highlight(s) and 1 reference link(s) first." },
    ]);
    expect(panel.renderForTest()).toBeDefined();
  });

  it("owns confirmed PDF removal and emits the completed outcome", async () => {
    const panel = new TestProjectEvidencePanel();
    const actions: ProjectEvidenceAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    panel.configure("/api/workspaces/workspace");
    panel.addEventListener(projectEvidenceActionEvent, (event) => actions.push((event as CustomEvent<ProjectEvidenceAction>).detail));

    await panel.removeForTest({ ...pdf, id: "pdf/1" });

    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/workspace/pdfs/pdf%2F1", expect.objectContaining({ method: "DELETE" }));
    expect(actions).toEqual([{ action: "pdf-removed", message: "paper.pdf removed from the project." }]);
  });

  it("honors cancellation and permits retry after a provider failure", async () => {
    const panel = new TestProjectEvidencePanel();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmMock);
    panel.configure("/api/workspaces/workspace");

    await panel.removeForTest();
    expect(fetchMock).not.toHaveBeenCalled();
    confirmMock.mockReturnValue(true);
    await panel.removeForTest();
    expect(panel.renderForTest()).toBeDefined();
    await panel.removeForTest();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores duplicate removals while one is pending", async () => {
    const panel = new TestProjectEvidencePanel();
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pendingResponse);
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock);
    panel.configure("/api/workspaces/workspace");

    const first = panel.removeForTest();
    await panel.removeForTest();
    respond(new Response(null, { status: 200 }));
    await first;

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks annotation deletion while claim evidence remains", async () => {
    const panel = new TestProjectEvidencePanel();
    const actions: ProjectEvidenceAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch");
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    panel.setEvidence(
      {
        annotations: [annotation],
        claimEvidenceLinks: [claimEvidenceLink],
        links: [link],
        pdfs: [pdf],
        publicationPdfLinks: [],
      },
      new Set(),
    );
    panel.addEventListener(projectEvidenceActionEvent, (event) => actions.push((event as CustomEvent<ProjectEvidenceAction>).detail));

    await panel.removeAnnotationForTest();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(actions).toEqual([{ action: "notice", message: "Remove this highlight from 1 claim(s) before deleting it." }]);
  });

  it("owns confirmed annotation deletion and emits the completed outcome", async () => {
    const panel = new TestProjectEvidencePanel();
    const actions: ProjectEvidenceAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    panel.configure("/api/workspaces/workspace");
    panel.setPassageLinks([link]);
    panel.addEventListener(projectEvidenceActionEvent, (event) => actions.push((event as CustomEvent<ProjectEvidenceAction>).detail));

    await panel.removeAnnotationForTest({ ...annotation, id: "annotation/1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/workspace/annotations/annotation%2F1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(actions).toEqual([
      { action: "annotation-removed", annotationId: "annotation/1", message: "Highlight deleted; the PDF remains unchanged." },
    ]);
  });

  it("honors annotation cancellation and permits retry after failure", async () => {
    const panel = new TestProjectEvidencePanel();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmMock);
    panel.configure("/api/workspaces/workspace");

    await panel.removeAnnotationForTest();
    expect(fetchMock).not.toHaveBeenCalled();
    confirmMock.mockReturnValue(true);
    await panel.removeAnnotationForTest();
    expect(panel.renderForTest()).toBeDefined();
    await panel.removeAnnotationForTest();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one duplicate-submit lock across resource removals", async () => {
    const panel = new TestProjectEvidencePanel();
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pendingResponse);
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock);
    panel.configure("/api/workspaces/workspace");

    const first = panel.removeAnnotationForTest();
    await panel.removeForTest();
    respond(new Response(null, { status: 200 }));
    await first;

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
