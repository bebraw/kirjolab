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

  previewForTest(): string {
    return this.targetPreview;
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
    panel.showTarget({ passage: "Reviewed passage", scope: "sentence", target: { start: 4, end: 4 } });
    panel.setGenerateDisabled(false);
    expect(panel.renderForTest()).toBeDefined();
  });

  it("owns operation-specific target presentation", () => {
    const panel = new TestAssistantTaskPanel();
    panel.showTarget({ passage: null, scope: "sentence", target: null });
    expect(panel.previewForTest()).toBe("Place the caret in manuscript text or select the exact passage to target.");
    panel.operationForTest("draft-claim");
    panel.showTarget({ passage: "Ignored", scope: "selection", target: { start: 1, end: 3 } });
    expect(panel.previewForTest()).toContain("selected annotation snapshots");
    panel.operationForTest("build-table");
    panel.showTarget({ passage: null, scope: "selection", target: { start: 2, end: 6 } });
    expect(panel.previewForTest()).toContain("replace 4 selected characters");
    panel.showTarget({ passage: null, scope: "selection", target: { start: 2, end: 2 } });
    expect(panel.previewForTest()).toContain("inserted at the visible caret");
    panel.showTarget({ passage: null, scope: "selection", target: null });
    expect(panel.previewForTest()).toContain("Place the caret where the table should be inserted");
    panel.operationForTest("phrase-passage");
    panel.showTarget({ passage: `${"word ".repeat(40)}tail`, scope: "paragraph", target: { start: 0, end: 4 } });
    expect(panel.previewForTest()).toMatch(/^Paragraph at target · “.{180}…”$/u);
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
