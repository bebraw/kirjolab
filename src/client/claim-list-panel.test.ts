import { describe, expect, it } from "vitest";
import type { AnnotationResource, ClaimEvidenceLink, ClaimPassageLink, ClaimResource, ManuscriptAnchorSelector } from "../domain/workspace";
import { ClaimListPanel, claimListActionEvent, type ClaimListAction } from "./claim-list-panel";

const createdAt = "2026-07-25T00:00:00.000Z";
const anchor: ManuscriptAnchorSelector = {
  anchoredRevision: 1,
  exact: "Original passage",
  fileId: "main",
  originalRange: { end: 16, start: 0 },
  prefix: "",
  relativeEnd: "AQ",
  relativeStart: "AA",
  suffix: "",
  version: 1,
};
const annotation: AnnotationResource = {
  comment: "Supports the claim",
  createdAt,
  fragments: [],
  id: "annotation:1",
  page: 2,
  pdfId: "pdf:1",
  prefix: "",
  quote: "Evidence",
  rects: [],
  suffix: "",
  updatedAt: createdAt,
};
const claim: ClaimResource = { createdAt, id: "claim:1", note: "Working note", text: "Grounded claim", updatedAt: createdAt };
const evidenceLink: ClaimEvidenceLink = {
  annotationId: annotation.id,
  claimId: claim.id,
  createdAt,
  id: "claim-evidence:1",
  relation: "supports",
};
const passageLink: ClaimPassageLink = {
  anchor,
  claimId: claim.id,
  createdAt,
  id: "claim-passage:1",
  resolution: { end: 16, exactMatch: true, start: 0, status: "resolved", text: anchor.exact },
};

class TestClaimListPanel extends ClaimListPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  evidenceForTest(key?: string, checked = true): void {
    this.selectEvidence(eventWithTarget(key ? { checked, dataset: { modelEvidenceKey: key } } : { checked, dataset: {} }));
  }

  createForTest(): void {
    this.createClaim();
  }

  claimForTest(action?: string, claimId = claim.id): void {
    this.actOnClaim(eventWithTarget({ dataset: { claimAction: action, claimId } }));
  }

  annotationForTest(annotationId?: string): void {
    this.openAnnotation(eventWithTarget({ dataset: annotationId ? { annotationId } : {} }));
  }

  passageForTest(claimId = claim.id): void {
    this.openPassage(eventWithTarget({ dataset: { claimId } }));
  }
}

function eventWithTarget(target: object): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: target });
  return event;
}

describe("claim list panel", () => {
  it("renders empty and populated claim states", () => {
    const panel = new TestClaimListPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setClaims({
      annotations: [annotation],
      claims: [claim, { ...claim, id: "claim:2", note: "" }],
      evidenceLinks: [evidenceLink, { ...evidenceLink, annotationId: "missing", claimId: "claim:2", id: "claim-evidence:2" }],
      passageLinks: [passageLink],
      selectedEvidenceKeys: new Set(["claim:1"]),
    });
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("emits bounded claim and navigation intents", () => {
    const panel = new TestClaimListPanel();
    const actions: ClaimListAction[] = [];
    panel.addEventListener(claimListActionEvent, (event) => actions.push((event as CustomEvent<ClaimListAction>).detail));
    panel.setClaims({
      annotations: [annotation],
      claims: [claim],
      evidenceLinks: [evidenceLink],
      passageLinks: [passageLink],
      selectedEvidenceKeys: new Set(),
    });

    panel.createForTest();
    panel.evidenceForTest();
    panel.evidenceForTest("claim:1", false);
    panel.claimForTest("missing");
    panel.claimForTest("edit", "missing");
    panel.claimForTest("edit");
    panel.claimForTest("delete");
    panel.claimForTest("link-passage");
    panel.annotationForTest();
    panel.annotationForTest(annotation.id);
    panel.passageForTest("missing");
    panel.passageForTest();

    expect(actions).toEqual([
      { action: "create" },
      { action: "evidence", key: "claim:1", selected: false },
      { action: "edit", claim },
      { action: "delete", claim },
      { action: "link-passage", claimId: claim.id },
      { action: "open-annotation", annotationId: annotation.id },
      { action: "open-passage", anchor },
    ]);
  });
});
