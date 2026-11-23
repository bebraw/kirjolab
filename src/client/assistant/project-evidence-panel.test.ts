import { afterEach, describe, expect, it, vi } from "vitest";
import { isTemplateResult } from "lit/directive-helpers.js";
import type { AnnotationResource, ClaimEvidenceLink, PassageLink, PdfResource, PublicationPdfLink } from "../../domain/workspace/workspace";
import { ProjectEvidencePanel } from "./project-evidence-panel";

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
    editor?: { dataset: { annotationId: string }; open: boolean },
  ): Promise<void> {
    return this.actOnFragment(
      eventWithTarget({
        closest: () => ({ closest: () => editor, querySelector: () => ({ value: "Revised evidence" }) }),
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

type RecordedAction =
  | { readonly action: "annotation-removed"; readonly annotationId: string; readonly message: string }
  | { readonly action: "edit-annotation"; readonly annotation: AnnotationResource }
  | { readonly action: "evidence"; readonly key: string; readonly selected: boolean }
  | { readonly action: "fragment-removed"; readonly annotationDeleted: boolean; readonly annotationId: string; readonly announce: boolean }
  | { readonly action: "link-annotation"; readonly annotationId: string }
  | { readonly action: "mutation"; readonly message: string }
  | { readonly action: "notice"; readonly message: string }
  | { readonly action: "open-passage"; readonly anchor: PassageLink["anchor"] }
  | { readonly action: "open-pdf"; readonly annotationId?: string; readonly page?: number; readonly pdf: PdfResource };

function recordActions(panel: ProjectEvidencePanel, refreshAfterErase = () => Promise.resolve()): RecordedAction[] {
  const actions: RecordedAction[] = [];
  panel.bind({
    annotationRemoved: (annotationId, message) => actions.push({ action: "annotation-removed", annotationId, message }),
    completeMutation: (message) => actions.push({ action: "mutation", message }),
    editAnnotation: (annotation) => actions.push({ action: "edit-annotation", annotation }),
    fragmentRemoved: async ({ annotationDeleted, annotationId, announce }) => {
      actions.push({ action: "fragment-removed", annotationDeleted, annotationId, announce });
      await refreshAfterErase();
    },
    linkAnnotation: (annotationId) => actions.push({ action: "link-annotation", annotationId }),
    notice: (message) => actions.push({ action: "notice", message }),
    openPassage: (anchor) => actions.push({ action: "open-passage", anchor }),
    openPdf: (pdf, page, annotationId) =>
      actions.push({ action: "open-pdf", ...(annotationId ? { annotationId } : {}), ...(page ? { page } : {}), pdf }),
  });
  panel.bindEvidenceSelection((key, selected) => actions.push({ action: "evidence", key, selected }));
  return actions;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function templateText(value: unknown): string {
  if (Array.isArray(value)) return value.map(templateText).join("");
  if (isTemplateResult(value, 1)) return value.strings.reduce((text, part, index) => text + part + templateText(value.values[index]), "");
  return typeof value === "string" || typeof value === "boolean" || typeof value === "number" ? String(value) : "";
}

function view(panel: TestProjectEvidencePanel): string {
  return templateText(panel.renderForTest()).replace(/\s+/gu, " ").trim();
}

const emptyEvidence = { annotations: [], claimEvidenceLinks: [], links: [], pdfs: [], publicationPdfLinks: [] };

describe("project evidence panel", () => {
  it("groups highlights by paper, keeps orphans visible, and retains the reader’s disclosure choices", () => {
    const panel = new TestProjectEvidencePanel();
    Object.defineProperty(panel, "querySelector", { value: () => null });
    expect(panel.focusEvidence()).toBe(false);
    expect(panel.rootForTest()).toBe(panel);
    expect(view(panel)).toContain('id="project-evidence" ?hidden=true .open=false');
    expect(view(panel)).toContain("title=0 papers, 0 highlights >0</span");

    const assigned = { ...emptyEvidence, annotations: [annotation], pdfs: [pdf] };
    panel.setEvidence(assigned, new Set(["annotation:annotation:1"]));
    const first = view(panel);
    expect(first).toContain('id="project-evidence" ?hidden=false .open=true');
    expect(first).toContain("title=1 paper, 1 highlight >2</span");
    expect(first).toContain('id="unassigned-annotation-list" ?hidden=true');
    expect(first).toContain("data-pdf-annotation-group=pdf:1 ?hidden=false .open=false");
    expect(first).toContain("data-pdf-annotation-count=pdf:1>1</span>");
    expect(first).toContain("Use annotation “Evidence” on page 2 as model evidence .checked=true");
    expect(first).toContain("Working note");
    expect(first).toContain("Adjust 1 stroke </summary>");

    panel.toggleEvidenceForTest(false);
    panel.toggleForTest(pdf.id);
    const orphan = { ...annotation, id: "orphan", pdfId: "gone", quote: "Orphan passage", comment: "" };
    const second = { ...pdf, id: "empty", name: "Empty paper" };
    panel.setEvidence({ ...assigned, annotations: [annotation, orphan], pdfs: [pdf, second] }, new Set());
    const grouped = view(panel);
    expect(grouped).toContain('id="project-evidence" ?hidden=false .open=false');
    expect(grouped).toContain("title=2 papers, 2 highlights >4</span");
    expect(grouped).toContain("data-pdf-annotation-group=pdf:1 ?hidden=false .open=true");
    expect(grouped).toContain("data-pdf-annotation-group=empty ?hidden=true .open=false");
    const [papers, orphans] = grouped.split('id="unassigned-annotation-list" ?hidden=false');
    expect(papers).toContain("data-annotation-resource-id=annotation:1");
    expect(papers).not.toContain("data-annotation-resource-id=orphan");
    expect(orphans).toContain("Use annotation “Orphan passage” on page 2 as model evidence .checked=false");
    expect(orphans).not.toContain("Working note");

    panel.toggleForTest(pdf.id, false);
    expect(view(panel)).toContain("data-pdf-annotation-group=pdf:1 ?hidden=false .open=false");
    panel.toggleForTest(pdf.id);
    panel.setEvidence(emptyEvidence, new Set());
    expect(view(panel)).toContain('id="project-evidence" ?hidden=true .open=false');
    panel.setEvidence(assigned, new Set());
    expect(view(panel)).toContain("data-pdf-annotation-group=pdf:1 ?hidden=false .open=false");
  });

  it("labels and targets the editing controls for each individual stroke", () => {
    const panel = new TestProjectEvidencePanel();
    const second = { ...annotation.fragments[0]!, id: "stroke-b", quote: "Second passage" };
    panel.setEvidence(
      { ...emptyEvidence, annotations: [{ ...annotation, fragments: [...annotation.fragments, second] }], pdfs: [pdf] },
      new Set(),
    );
    const rendered = view(panel);
    expect(rendered).toContain("Adjust 2 strokes </summary>");
    expect(rendered).toContain("aria-label=Text for highlight stroke 1 .value=Evidence");
    expect(rendered).toContain("aria-label=Text for highlight stroke 2 .value=Second passage");
    for (const [label, action] of [
      ["←", "left"],
      ["↑", "up"],
      ["↓", "down"],
      ["→", "right"],
      ["Wider", "wider"],
      ["Narrower", "narrower"],
      ["Taller", "taller"],
      ["Shorter", "shorter"],
    ]) {
      expect(rendered).toContain(`data-fragment-id=stroke-b data-fragment-adjustment=${action} aria-label=${label} highlight stroke 2`);
    }
    expect(rendered).toMatch(/data-fragment-id=stroke-b data-fragment-action="save"[^>]*> Save text/u);
    expect(rendered).toMatch(/data-fragment-id=stroke-b data-fragment-action="remove"[^>]*> Erase stroke/u);
    for (const [action, label] of [
      ["open", "Open evidence"],
      ["edit", "Edit note"],
      ["link", "Link selected manuscript text"],
      ["delete", "Delete highlight"],
    ]) {
      expect(rendered).toContain(`data-annotation-action=${action} ?disabled=false @click= > ${label}`);
    }
  });

  it("updates passage navigation as an anchor changes or becomes stale", () => {
    const panel = new TestProjectEvidencePanel();
    panel.setEvidence({ ...emptyEvidence, annotations: [annotation], links: [link], pdfs: [pdf] }, new Set());
    expect(view(panel)).toContain("data-anchor-status=resolved data-anchor-match=exact ?disabled=false @click= > Open linked passage");
    panel.setPassageLinks([{ ...link, resolution: { status: "resolved", exactMatch: false, start: 0, end: 7, text: "Revised" } }]);
    expect(view(panel)).toContain("data-anchor-status=resolved data-anchor-match=changed ?disabled=false @click= > Open changed passage");
    panel.setPassageLinks([{ ...link, resolution: { status: "stale" } }]);
    expect(view(panel)).toContain(
      "data-anchor-status=stale data-anchor-match=unavailable ?disabled=true @click= > Linked passage is stale",
    );
    panel.setPassageLinks([]);
    expect(view(panel)).not.toContain("data-anchor-status=");
  });

  it("shows why attached evidence cannot be removed and indicates when deletion is in progress", async () => {
    const panel = new TestProjectEvidencePanel();
    const snapshot = { ...emptyEvidence, annotations: [annotation], links: [link], pdfs: [pdf] };
    panel.setEvidence({ ...snapshot, claimEvidenceLinks: [claimEvidenceLink], publicationPdfLinks: [publicationPdfLink] }, new Set());
    await panel.removeAnnotationForTest();
    expect(view(panel)).toContain('role="status" ?hidden=false>Remove this highlight from 1 claim(s) before deleting it.');
    await panel.removeForTest();
    expect(view(panel)).toContain(
      'role="status" ?hidden=false>Cannot remove paper.pdf: remove 1 highlight(s) and 1 reference link(s) first.',
    );

    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.setEvidence(snapshot, new Set());
    const deletion = panel.removeAnnotationForTest();
    const busy = view(panel);
    expect(confirm).toHaveBeenCalledExactlyOnceWith("Delete this highlight and its 1 manuscript link(s)?");
    expect(busy).toContain('role="status" ?hidden=false>Deleting highlight…');
    expect(busy).toContain("data-annotation-action=delete ?disabled=true @click= > Deleting…");
    expect(busy).toContain("data-annotation-action=open ?disabled=false");
    expect(busy).toMatch(/data-pdf-action="remove"[^>]*\?disabled=true/u);
    await deletion;
    expect(view(panel)).toContain("data-annotation-action=delete ?disabled=false @click= > Delete highlight");
    expect(view(panel)).toContain('role="status" ?hidden=true>');
  });

  it("emits bounded PDF, annotation, passage, and evidence intents", () => {
    const panel = new TestProjectEvidencePanel();
    const actions = recordActions(panel);
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

  it("owns annotation card reveal", () => {
    const panel = new TestProjectEvidencePanel();
    const scrollIntoView = vi.fn();
    Object.defineProperty(panel, "querySelectorAll", {
      value: () => [{ dataset: { annotationResourceId: annotation.id }, scrollIntoView }],
    });

    expect(panel.revealAnnotation(annotation.id)).toBe(true);
    expect(panel.revealAnnotation("missing")).toBe(false);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  it("owns adjusted fragment persistence and emits completed or removal outcomes", async () => {
    const panel = new TestProjectEvidencePanel();
    const actions = recordActions(panel);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
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
      { action: "mutation", message: "Highlight stroke adjusted." },
      { action: "mutation", message: "Highlight stroke adjusted." },
      { action: "fragment-removed", annotationDeleted: false, annotationId: annotation.id, announce: true },
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

  it("keeps a stroke edit open until it can be saved after erasing another stroke", async () => {
    const panel = new TestProjectEvidencePanel();
    panel.setEvidence({ annotations: [annotation], claimEvidenceLinks: [], links: [], pdfs: [pdf], publicationPdfLinks: [] }, new Set());
    let finishRefresh = (): void => undefined;
    const refresh = new Promise<void>((resolve) => {
      finishRefresh = resolve;
    });
    const refreshAfterErase = vi.fn(() => refresh);
    recordActions(panel, refreshAfterErase);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const editor = {
      dataset: { annotationId: annotation.id },
      open: true,
      removeAttribute() {
        this.open = false;
      },
    };
    const save = () => panel.fragmentForTest("save", undefined, annotation.id, annotation.fragments[0]!.id, editor);

    const erase = panel.removeFragment(annotation.id, "erased");
    await vi.waitFor(() => expect(refreshAfterErase).toHaveBeenCalledOnce());
    await save();
    expect(editor.open).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    finishRefresh();
    await erase;
    await save();
    expect(editor.open).toBe(false);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "PUT", body: expect.stringContaining("Revised evidence") }),
    );
  });

  it("leaves the current editor open when a save finishes for a previous annotation", async () => {
    const panel = new TestProjectEvidencePanel();
    panel.setEvidence({ annotations: [annotation], claimEvidenceLinks: [], links: [], pdfs: [pdf], publicationPdfLinks: [] }, new Set());
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const editor = { dataset: { annotationId: annotation.id }, open: true };
    const save = panel.fragmentForTest("save", undefined, annotation.id, annotation.fragments[0]!.id, editor);
    editor.dataset.annotationId = "another annotation";
    await save;
    expect(editor.open).toBe(true);
  });

  it("owns passage-link persistence and emits the completed outcome", async () => {
    const panel = new TestProjectEvidencePanel();
    const actions = recordActions(panel);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    const input = {
      annotationId: "annotation/1",
      fileId: "main",
      start: 0,
      end: 16,
      excerpt: "Selected passage",
      sourceRevision: 4,
    };

    await panel.linkPassage(input);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/workspaces/workspace/links", {
      body: JSON.stringify(input),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(actions).toEqual([{ action: "mutation", message: "Annotation linked to the selected passage." }]);
  });

  it("selects the requested highlight and opens only its matching PDF or manuscript passage", () => {
    const panel = new TestProjectEvidencePanel();
    const actions = recordActions(panel);
    const otherPdf = { ...pdf, id: "pdf:other" };
    const otherAnnotation = { ...annotation, id: "annotation:other", page: 7, pdfId: otherPdf.id };
    const otherLink = { ...link, annotationId: otherAnnotation.id, anchor: { ...link.anchor, fileId: "supplement" } };
    panel.setEvidence(
      { ...emptyEvidence, pdfs: [pdf, otherPdf], annotations: [annotation, otherAnnotation], links: [link, otherLink] },
      new Set(),
    );
    panel.evidenceForTest(otherAnnotation.id, true);
    panel.annotationForTest("open", otherAnnotation.id);
    panel.passageForTest(otherAnnotation.id);
    panel.setEvidence({ ...emptyEvidence, annotations: [otherAnnotation] }, new Set());
    panel.annotationForTest("open", otherAnnotation.id);
    panel.passageForTest(otherAnnotation.id);

    expect(actions).toEqual([
      { action: "evidence", key: otherAnnotation.id, selected: true },
      { action: "open-pdf", pdf: otherPdf, page: 7, annotationId: otherAnnotation.id },
      { action: "open-passage", anchor: otherLink.anchor },
    ]);
  });

  it("owns project PDF validation, persistence, and completed outcomes", async () => {
    const panel = new TestProjectEvidencePanel();
    const actions = recordActions(panel);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    const file = new File(["%PDF-1.7"], "paper draft.pdf", { type: "application/pdf" });

    await panel.uploadPdf(null);
    await panel.uploadPdf(new File(["image"], "figure.png", { type: "image/png" }));
    expectStatus(panel, "Choose a PDF file.");
    await panel.uploadPdf(file);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/workspace/pdfs", {
      body: file,
      headers: { "content-type": "application/pdf", "x-file-name": "paper%20draft.pdf" },
      method: "POST",
    });
    expect(actions).toEqual([{ action: "mutation", message: "PDF imported without modifying the source file." }]);
  });

  it("keeps project PDF upload failures local and retryable", async () => {
    const panel = new TestProjectEvidencePanel();
    const actions = recordActions(panel);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ error: "Denied" }, { status: 403 }))
      .mockRejectedValueOnce(null)
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    const file = new File(["%PDF-1.7"], "paper.pdf", { type: "application/pdf" });

    await panel.uploadPdf(file);
    expectStatus(panel, "Denied");
    await panel.uploadPdf(file);
    expectStatus(panel, "Could not import paper.pdf.");
    expect(actions).toEqual([]);
    await panel.uploadPdf(file);
    expectStatus(panel, "");
    expect(actions).toEqual([{ action: "mutation", message: "PDF imported without modifying the source file." }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps failed passage linking local and retryable", async () => {
    const panel = new TestProjectEvidencePanel();
    const actions = recordActions(panel);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ error: "Denied" }, { status: 403 }))
      .mockRejectedValueOnce(null)
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    const input = { annotationId: "annotation-1", fileId: "main", start: 0, end: 16, excerpt: "Selected passage", sourceRevision: 4 };

    await panel.linkPassage(input);
    expectStatus(panel, "Denied");
    await panel.linkPassage(input);
    expectStatus(panel, "Could not link the annotation to the selected passage.");
    expect(actions).toEqual([]);
    await panel.linkPassage(input);
    expectStatus(panel, "");
    expect(actions).toEqual([{ action: "mutation", message: "Annotation linked to the selected passage." }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("owns highlight fragment update and deletion transport", async () => {
    const panel = new TestProjectEvidencePanel();
    const actions = recordActions(panel);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    panel.configure("/api/workspaces/workspace");
    const input = { prefix: "Before", quote: "  Revised evidence  ", rects: annotation.fragments[0]!.rects, suffix: "After" };

    await expect(panel.updateFragment("annotation/1", "fragment/1", input)).resolves.toBe(true);
    await expect(panel.removeFragment("annotation/1", "fragment/1")).resolves.toBe(true);
    expect(actions).toEqual([{ action: "fragment-removed", annotationDeleted: true, annotationId: "annotation/1", announce: false }]);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/workspaces/workspace/annotations/annotation%2F1/fragments/fragment%2F1", {
      body: JSON.stringify({ ...input, quote: "Revised evidence" }),
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
    });
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
      .mockRejectedValueOnce(null)
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    const input = { prefix: "", quote: "Evidence", rects: [], suffix: "" };

    await expect(panel.updateFragment("annotation-1", "fragment-1", { ...input, quote: " " })).resolves.toBe(false);
    expectStatus(panel, "A highlight stroke needs enough text to find the idea again.");
    await expect(panel.updateFragment("annotation-1", "fragment-1", input)).resolves.toBe(false);
    expectStatus(panel, "Denied");
    await expect(panel.updateFragment("annotation-1", "fragment-1", input)).resolves.toBe(false);
    expectStatus(panel, "Could not adjust the highlight stroke.");
    await expect(panel.updateFragment("annotation-1", "fragment-1", input)).resolves.toBe(true);
    expectStatus(panel, "");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retains a stroke when erasing fails and announces only its successful retry", async () => {
    const panel = new TestProjectEvidencePanel();
    const actions = recordActions(panel);
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(null)
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(panel.removeFragment(annotation.id, "stroke", true)).resolves.toBe(false);
    expectStatus(panel, "Could not erase the highlight stroke.");
    expect(actions).toEqual([]);
    await expect(panel.removeFragment(annotation.id, "stroke", true)).resolves.toBe(true);
    expectStatus(panel, "");
    expect(actions).toEqual([{ action: "fragment-removed", annotationDeleted: false, annotationId: annotation.id, announce: true }]);
  });

  it.each([
    { annotations: [annotation], references: [], highlightsCount: 1, referencesCount: 0 },
    { annotations: [], references: [publicationPdfLink], highlightsCount: 0, referencesCount: 1 },
  ])(
    "blocks PDF removal with $highlightsCount highlights and $referencesCount reference links",
    async ({ annotations, references, highlightsCount, referencesCount }) => {
      const panel = new TestProjectEvidencePanel();
      const actions = recordActions(panel);
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const confirm = vi.fn(() => true);
      vi.stubGlobal("confirm", confirm);
      panel.setEvidence(
        {
          annotations: [...annotations, { ...annotation, id: "annotation:other", pdfId: "pdf:other" }],
          claimEvidenceLinks: [],
          links: [],
          pdfs: [pdf],
          publicationPdfLinks: [...references, { ...publicationPdfLink, id: "link:other", pdfId: "pdf:other" }],
        },
        new Set(),
      );

      panel.pdfForTest("remove");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
      const message = `Cannot remove paper.pdf: remove ${highlightsCount} highlight(s) and ${referencesCount} reference link(s) first.`;
      expect(actions).toEqual([{ action: "notice", message }]);
      expectStatus(panel, message);
    },
  );

  it("owns confirmed PDF removal and emits the completed outcome", async () => {
    const panel = new TestProjectEvidencePanel();
    const actions = recordActions(panel);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    panel.configure("/api/workspaces/workspace");

    await panel.removeForTest({ ...pdf, id: "pdf/1" });

    expect(confirm).toHaveBeenCalledExactlyOnceWith("Remove paper.pdf from this project? The imported PDF bytes will be deleted.");
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/workspaces/workspace/pdfs/pdf%2F1", {
      method: "DELETE",
      credentials: "same-origin",
    });
    expect(actions).toEqual([{ action: "mutation", message: "paper.pdf removed from the project." }]);
  });

  it("honors cancellation and permits retry after a provider failure", async () => {
    const panel = new TestProjectEvidencePanel();
    const actions = recordActions(panel);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockRejectedValueOnce(null)
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmMock);
    panel.configure("/api/workspaces/workspace");

    await panel.removeForTest();
    expect(fetchMock).not.toHaveBeenCalled();
    confirmMock.mockReturnValue(true);
    await panel.removeForTest();
    expectStatus(panel, "Request failed (503)");
    await panel.removeForTest();
    expectStatus(panel, "Could not remove paper.pdf.");
    expect(actions).toEqual([]);
    await panel.removeForTest();
    expectStatus(panel, "");
    expect(actions).toEqual([{ action: "mutation", message: "paper.pdf removed from the project." }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
    const actions = recordActions(panel);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    panel.setEvidence(
      {
        annotations: [annotation],
        claimEvidenceLinks: [claimEvidenceLink, { ...claimEvidenceLink, id: "claim-evidence:other", annotationId: "annotation:other" }],
        links: [link],
        pdfs: [pdf],
        publicationPdfLinks: [],
      },
      new Set(),
    );

    panel.annotationForTest("delete");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(actions).toEqual([{ action: "notice", message: "Remove this highlight from 1 claim(s) before deleting it." }]);
    expectStatus(panel, "Remove this highlight from 1 claim(s) before deleting it.");
  });

  it("owns confirmed annotation deletion and emits the completed outcome", async () => {
    const panel = new TestProjectEvidencePanel();
    const actions = recordActions(panel);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    panel.configure("/api/workspaces/workspace");
    panel.setPassageLinks([{ ...link, annotationId: "annotation/1" }, link]);

    await panel.removeAnnotationForTest({ ...annotation, id: "annotation/1" });

    expect(confirm).toHaveBeenCalledExactlyOnceWith("Delete this highlight and its 1 manuscript link(s)?");
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/workspaces/workspace/annotations/annotation%2F1", {
      credentials: "same-origin",
      method: "DELETE",
    });
    expect(actions).toEqual([
      { action: "annotation-removed", annotationId: "annotation/1", message: "Highlight deleted; the PDF remains unchanged." },
    ]);
  });

  it("honors annotation cancellation and permits retry after failure", async () => {
    const panel = new TestProjectEvidencePanel();
    const actions = recordActions(panel);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockRejectedValueOnce(null)
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmMock);
    panel.configure("/api/workspaces/workspace");

    await panel.removeAnnotationForTest();
    expect(fetchMock).not.toHaveBeenCalled();
    confirmMock.mockReturnValue(true);
    await panel.removeAnnotationForTest();
    expectStatus(panel, "Request failed (503)");
    await panel.removeAnnotationForTest();
    expectStatus(panel, "Could not delete the highlight.");
    expect(actions).toEqual([]);
    await panel.removeAnnotationForTest();
    expectStatus(panel, "");
    expect(actions).toEqual([
      { action: "annotation-removed", annotationId: annotation.id, message: "Highlight deleted; the PDF remains unchanged." },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
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

function expectStatus(panel: TestProjectEvidencePanel, message: string): void {
  expect(view(panel)).toContain(`role="status" ?hidden=${!message}>${message}</p>`);
}
