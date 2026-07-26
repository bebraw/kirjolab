import { describe, expect, it } from "vitest";
import type { AnnotationResource, PassageLink, PdfResource } from "../domain/workspace";
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

  fragmentForTest(action?: string, adjustment?: string, annotationId = annotation.id, fragmentId = annotation.fragments[0]!.id): void {
    this.actOnFragment(
      eventWithTarget({
        closest: () => ({ closest: () => null, querySelector: () => ({ value: "Revised evidence" }) }),
        dataset: { annotationId, fragmentAction: action, fragmentAdjustment: adjustment, fragmentId },
      }),
    );
  }
}

function eventWithTarget(target: object): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: target });
  return event;
}

describe("project evidence panel", () => {
  it("renders empty, assigned, unassigned, linked, and selected states", () => {
    const panel = new TestProjectEvidencePanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setEvidence({
      annotations: [annotation, { ...annotation, id: "annotation:2", pdfId: "missing" }],
      links: [link],
      pdfs: [pdf],
      selectedEvidenceKeys: new Set(["annotation:1"]),
    });
    panel.toggleForTest(pdf.id);
    panel.toggleEvidenceForTest(false);
    expect(panel.renderForTest()).toBeDefined();
    panel.setEvidence({ annotations: [], links: [], pdfs: [], selectedEvidenceKeys: new Set() });
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("emits bounded PDF, annotation, passage, and evidence intents", () => {
    const panel = new TestProjectEvidencePanel();
    const actions: ProjectEvidenceAction[] = [];
    panel.addEventListener(projectEvidenceActionEvent, (event) => actions.push((event as CustomEvent<ProjectEvidenceAction>).detail));
    panel.setEvidence({ annotations: [annotation], links: [link], pdfs: [pdf], selectedEvidenceKeys: new Set() });

    panel.toggleForTest();
    panel.pdfForTest("open", "missing");
    panel.pdfForTest();
    panel.pdfForTest("open");
    panel.pdfForTest("remove");
    panel.evidenceForTest();
    panel.evidenceForTest("annotation:1", false);
    panel.annotationForTest("open", "missing");
    panel.annotationForTest();
    panel.annotationForTest("open");
    panel.annotationForTest("edit");
    panel.annotationForTest("link");
    panel.annotationForTest("delete");
    panel.passageForTest("missing");
    panel.passageForTest();
    const changedAnchor = { ...link.anchor, exact: "Changed passage" };
    panel.setPassageLinks([{ ...link, anchor: changedAnchor }]);
    panel.passageForTest();

    expect(actions).toEqual([
      { action: "open-pdf", pdf },
      { action: "remove-pdf", pdf },
      { action: "evidence", key: "annotation:1", selected: false },
      { action: "open-pdf", annotationId: annotation.id, page: annotation.page, pdf },
      { action: "edit-annotation", annotation },
      { action: "link-annotation", annotationId: annotation.id },
      { action: "delete-annotation", annotation },
      { action: "open-passage", anchor: link.anchor },
      { action: "open-passage", anchor: changedAnchor },
    ]);
  });

  it("emits adjusted, saved, and removed fragment intents", () => {
    const panel = new TestProjectEvidencePanel();
    const actions: ProjectEvidenceAction[] = [];
    panel.addEventListener(projectEvidenceActionEvent, (event) => actions.push((event as CustomEvent<ProjectEvidenceAction>).detail));
    panel.setEvidence({ annotations: [annotation], links: [], pdfs: [pdf], selectedEvidenceKeys: new Set() });

    panel.fragmentForTest("save", undefined, "missing");
    panel.fragmentForTest("save");
    panel.fragmentForTest(undefined, "right");
    panel.fragmentForTest("remove");

    expect(actions).toEqual([
      {
        action: "update-fragment",
        annotationId: annotation.id,
        fragmentId: annotation.fragments[0]!.id,
        prefix: "Before",
        quote: "Revised evidence",
        rects: annotation.fragments[0]!.rects,
        suffix: "After",
      },
      expect.objectContaining({
        action: "update-fragment",
        annotationId: annotation.id,
        rects: [{ height: 0.1, width: 0.2, x: 0.105, y: 0.2 }],
      }),
      { action: "remove-fragment", annotationId: annotation.id, fragmentId: annotation.fragments[0]!.id },
    ]);
  });
});
