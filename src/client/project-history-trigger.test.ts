import { describe, expect, it } from "vitest";
import { ProjectHistoryTrigger, projectHistoryOpenEvent } from "./project-history-trigger";

class TestProjectHistoryTrigger extends ProjectHistoryTrigger {
  renderForTest() {
    return this.render();
  }

  openForTest(): void {
    this.open();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }
}

describe("project history trigger", () => {
  it("renders revision state and emits an open intent", () => {
    const trigger = new TestProjectHistoryTrigger();
    let opened = false;
    trigger.addEventListener(projectHistoryOpenEvent, () => {
      opened = true;
    });

    trigger.setRevision(7);
    trigger.openForTest();

    expect(trigger.renderForTest()).toBeDefined();
    expect(trigger.rootForTest()).toBe(trigger);
    expect(opened).toBe(true);
  });
});
