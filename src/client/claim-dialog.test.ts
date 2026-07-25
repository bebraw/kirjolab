import { describe, expect, it } from "vitest";
import type { AnnotationResource, ClaimResource } from "../domain/workspace";
import { ClaimDialog, claimDialogSaveEvent, type ClaimDialogSave } from "./claim-dialog";

class TestClaimDialog extends ClaimDialog {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  changeForTest(field: "note" | "relation" | "text", value: string): void {
    const event = eventWithControl({ value });
    if (field === "text") this.changeText(event);
    else if (field === "note") this.changeNote(event);
    else this.changeRelation(event);
  }

  toggleForTest(value: string, checked: boolean): void {
    this.toggleEvidence(eventWithControl({ checked, value }));
  }

  saveForTest(): void {
    this.save(new Event("submit"));
  }
}

function eventWithControl(control: { readonly checked?: boolean; readonly value: string }): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: control });
  return event;
}

const annotations = [
  annotation("annotation-1", "Primary evidence", 2, "First quote"),
  annotation("annotation-2", "", 4, "Second quote"),
] satisfies readonly AnnotationResource[];

const claim = {
  createdAt: "2026-07-25T00:00:00.000Z",
  id: "claim-1",
  note: "Working note",
  text: "Inspectable evidence supports the claim.",
  updatedAt: "2026-07-25T00:00:00.000Z",
} satisfies ClaimResource;

function annotation(id: string, comment: string, page: number, quote: string): AnnotationResource {
  return {
    comment,
    createdAt: "2026-07-25T00:00:00.000Z",
    fragments: [],
    id,
    page,
    pdfId: "pdf-1",
    prefix: "",
    quote,
    rects: [],
    suffix: "",
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
}

describe("claim dialog", () => {
  it("renders create and edit state in light DOM", () => {
    const panel = new TestClaimDialog();
    expect(panel.rootForTest()).toBe(panel);
    expect(panel.renderForTest()).toBeDefined();
    panel.open(claim, annotations, [{ annotationId: "annotation-1", relation: "extends" }]);
    expect(panel.renderForTest()).toBeDefined();
  });

  it("owns values, evidence selection, and typed save intent", () => {
    const panel = new TestClaimDialog();
    let saved: ClaimDialogSave | undefined;
    panel.addEventListener(claimDialogSaveEvent, (event) => {
      saved = (event as CustomEvent<ClaimDialogSave>).detail;
    });
    panel.open(undefined, annotations, []);
    panel.changeForTest("text", "A bounded claim");
    panel.changeForTest("note", "Interpret cautiously");
    panel.changeForTest("relation", "contradicts");
    panel.toggleForTest("annotation-2", true);
    panel.toggleForTest("annotation-1", true);
    panel.toggleForTest("annotation-1", false);
    panel.saveForTest();

    expect(saved).toEqual({
      evidence: [{ annotationId: "annotation-2", relation: "contradicts" }],
      note: "Interpret cautiously",
      text: "A bounded claim",
    });
  });
});
