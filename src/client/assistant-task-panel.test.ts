import { describe, expect, it } from "vitest";
import { AssistantTaskPanel, assistantTaskChangeEvent, assistantTaskGenerateEvent, type AssistantTaskChange } from "./assistant-task-panel";

class TestAssistantTaskPanel extends AssistantTaskPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  operationForTest(value: string): void {
    this.changeOperation(eventWithTarget({ value }));
  }

  scopeForTest(value: string): void {
    this.changeTargetScope(eventWithTarget({ value }));
  }

  instructionForTest(value: string): void {
    this.changeInstruction(eventWithTarget({ value }));
  }

  relationForTest(value: string): void {
    this.changeRelation(eventWithTarget({ value }));
  }

  purposeForTest(value: string): void {
    this.changePurpose(eventWithTarget({ value }));
  }

  tableForTest(caption: string, columns: string, rows: string): void {
    this.changeTableCaption(eventWithTarget({ value: caption }));
    this.changeTableColumns(eventWithTarget({ value: columns }));
    this.changeTableRows(eventWithTarget({ value: rows }));
  }

  generateForTest(): void {
    this.generate();
  }
}

function eventWithTarget(target: object): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: target });
  return event;
}

describe("assistant task panel", () => {
  it("renders every operation-specific presentation state", () => {
    const panel = new TestAssistantTaskPanel();
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
    for (const operation of ["draft-claim", "phrase-passage", "build-table", "clarity-drill", "ideate", "find-references"]) {
      panel.operationForTest(operation);
      expect(panel.renderForTest()).toBeDefined();
    }
    panel.setTargetPreview("Sentence at target · “Reviewed passage”");
    panel.setGenerateDisabled(false);
    expect(panel.renderForTest()).toBeDefined();
  });

  it("owns task values and emits change and enabled generation intents", () => {
    const panel = new TestAssistantTaskPanel();
    const changes: AssistantTaskChange[] = [];
    let generations = 0;
    panel.addEventListener(assistantTaskChangeEvent, (event) => changes.push((event as CustomEvent<AssistantTaskChange>).detail));
    panel.addEventListener(assistantTaskGenerateEvent, () => (generations += 1));

    panel.generateForTest();
    panel.operationForTest("build-table");
    panel.scopeForTest("selection");
    panel.instructionForTest("Build a comparison");
    panel.relationForTest("extends");
    panel.purposeForTest("establish-territory");
    panel.tableForTest("Results", "Method\nScore", "A | 1");
    panel.setGenerateDisabled(false);
    panel.generateForTest();

    expect(panel.value).toMatchObject({
      instruction: "Build a comparison",
      operation: { id: "build-table" },
      phrasingPurposeId: "establish-territory",
      relation: "extends",
      tableCaption: "Results",
      tableColumns: "Method\nScore",
      tableRows: "A | 1",
      targetScope: "selection",
    });
    expect(changes).toEqual(["operation", "target", "input", "input", "input", "input", "input", "input"]);
    expect(generations).toBe(1);
  });
});
