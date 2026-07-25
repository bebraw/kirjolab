import { describe, expect, it, vi } from "vitest";
import { AssistantWorkflowStatus, assistantWorkflowActionEvent, type AssistantWorkflowAction } from "./assistant-workflow-status";

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
