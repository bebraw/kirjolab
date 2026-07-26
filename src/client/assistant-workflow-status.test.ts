import { describe, expect, it, vi } from "vitest";
import type { AnnotationResource, ClaimResource } from "../domain/workspace";
import { AssistantWorkflowStatus, assistantWorkflowActionEvent, type AssistantWorkflowAction } from "./assistant-workflow-status";

const timestamp = "2026-07-25T00:00:00.000Z";
const annotation: AnnotationResource = {
  comment: "Research note",
  createdAt: timestamp,
  fragments: [],
  id: "1",
  page: 3,
  pdfId: "pdf:1",
  prefix: "Before",
  quote: "Evidence",
  rects: [],
  suffix: "After",
  updatedAt: timestamp,
};
const claim: ClaimResource = { createdAt: timestamp, id: "1", note: "Working note", text: "Claim text", updatedAt: timestamp };

class TestAssistantWorkflowStatus extends AssistantWorkflowStatus {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  actionForTest(action: AssistantWorkflowAction): void {
    this.emitAction(action);
  }

  settingsForTest(event: Event): void {
    this.openSettings(event);
  }
}

describe("assistant workflow status", () => {
  it("owns operation-specific attribution and live status presentation", () => {
    const panel = new TestAssistantWorkflowStatus();
    expect(panel.rootForTest()).toBe(panel);
    expect(panel.renderForTest()).toBeDefined();
    panel.setOperation("phrase-passage");
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.status).toBe("Choose a rhetorical purpose, then compare contextual alternatives before opening exact review.");
    panel.setOperation("draft-claim");
    expect(panel.status).toBe("Select at least one annotation to ground the claim draft.");
    panel.setOperation("build-table");
    expect(panel.status).toBe("Choose a target and the required evidence, then generate a reviewable draft.");

    panel.generationStarted("draft-claim");
    expect(panel.status).toBe("Asking the local model for one grounded claim draft…");
    panel.generationStarted("clarity-drill");
    expect(panel.status).toBe("Finding the single ambiguity that matters most…");
    panel.generationStarted("revise-selection");
    expect(panel.status).toBe("Asking the local model for a grounded candidate…");
  });

  it("owns selected evidence and its live count status", () => {
    const panel = new TestAssistantWorkflowStatus();
    panel.setEvidenceSelected("invalid", true);
    panel.setEvidenceSelected("annotation:1", true);
    panel.setEvidenceSelected("claim:1", true);
    expect(panel.selectedEvidenceKeys).toEqual(new Set(["annotation:1", "claim:1"]));
    expect(panel.status).toBe("2 resources selected for grounding.");

    panel.reconcileEvidence(new Set(["claim:1"]));
    expect(panel.selectedEvidenceKeys).toEqual(new Set(["claim:1"]));
    panel.setEvidenceSelected("claim:1", false);
    expect(panel.status).toBe("0 resources selected for grounding.");

    for (let index = 0; index < 13; index += 1) panel.setEvidenceSelected(`annotation:${index}`, true);
    expect(panel.selectedEvidenceKeys.size).toBe(13);
    expect(panel.status).toBe("Choose no more than 12 evidence resources.");
  });

  it("projects ordered selected annotations and claims for model grounding", () => {
    const panel = new TestAssistantWorkflowStatus();
    panel.setEvidenceSelected("annotation:missing", true);
    panel.setEvidenceSelected("annotation:1", true);
    panel.setEvidenceSelected("claim:1", true);
    panel.setEvidenceSelected("claim:missing", true);

    expect(panel.modelEvidence([annotation], [claim])).toEqual({
      annotationItems: [
        {
          content: "Quote: Evidence\nContext before: Before\nContext after: After\nResearcher note: Research note",
          id: "1",
          kind: "annotation",
          label: "PDF annotation on page 3",
        },
      ],
      annotationReferences: [{ id: "1", kind: "annotation", version: timestamp }],
      items: [
        {
          content: "Quote: Evidence\nContext before: Before\nContext after: After\nResearcher note: Research note",
          id: "1",
          kind: "annotation",
          label: "PDF annotation on page 3",
        },
        {
          content: "Claim: Claim text\nWorking note: Working note",
          id: "1",
          kind: "claim",
          label: "Researcher-authored claim",
        },
      ],
      references: [
        { id: "1", kind: "annotation", version: timestamp },
        { id: "1", kind: "claim", version: timestamp },
      ],
    });

    const minimal = new TestAssistantWorkflowStatus();
    minimal.setEvidenceSelected("annotation:1", true);
    minimal.setEvidenceSelected("claim:1", true);
    expect(
      minimal
        .modelEvidence([{ ...annotation, comment: "", prefix: "", suffix: "" }], [{ ...claim, note: "" }])
        .items.map((item) => item.content),
    ).toEqual(["Quote: Evidence", "Claim: Claim text"]);
  });

  it("emits typed workflow actions", () => {
    const panel = new TestAssistantWorkflowStatus();
    const actions: AssistantWorkflowAction[] = [];
    panel.addEventListener(assistantWorkflowActionEvent, (event) => {
      actions.push((event as CustomEvent<AssistantWorkflowAction>).detail);
    });

    panel.actionForTest("choose-evidence");
    const click = new Event("click", { bubbles: true });
    const stopPropagation = vi.spyOn(click, "stopPropagation");
    panel.settingsForTest(click);

    expect(actions).toEqual(["choose-evidence", "open-settings"]);
    expect(stopPropagation).toHaveBeenCalledOnce();
  });
});
