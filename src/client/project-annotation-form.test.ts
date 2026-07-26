import { describe, expect, it } from "vitest";
import {
  ProjectAnnotationForm,
  projectAnnotationActionEvent,
  projectAnnotationSaveEvent,
  type ProjectAnnotationAction,
  type ProjectAnnotationSave,
  type ProjectHighlightTool,
} from "./project-annotation-form";

class TestProjectAnnotationForm extends ProjectAnnotationForm {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  changeForTest(field: "comment" | "page" | "prefix" | "suffix", value: string): void {
    const event = new Event("input");
    Object.defineProperty(event, "currentTarget", { value: { value } });
    if (field === "comment") this.changeComment(event);
    else if (field === "page") this.changePage(event);
    else if (field === "prefix") this.changePrefix(event);
    else this.changeSuffix(event);
  }

  saveForTest(link: boolean): void {
    const event = new Event("submit") as SubmitEvent;
    Object.defineProperty(event, "submitter", {
      value: link ? { id: "save-and-link-annotation" } : null,
    });
    this.save(event);
  }

  actionForTest(action: "cite" | "undo" | ProjectHighlightTool): void {
    if (action === "cite") this.citePage();
    else if (action === "undo") this.undoHighlight();
    else this.chooseTool(action);
  }
}

describe("project annotation form", () => {
  it("owns a light-DOM form with empty and populated PDF choices", () => {
    const panel = new TestProjectAnnotationForm();
    expect(panel.rootForTest()).toBe(panel);
    expect(panel.renderForTest()).toBeDefined();
    panel.setPdfs([
      { id: "pdf-1", name: "Paper one" },
      { id: "pdf-2", name: "Paper two" },
    ]);
    panel.selectPdf("pdf-2");
    panel.selectPdf("missing");
    expect(panel.renderForTest()).toBeDefined();
    panel.setPdfs([{ id: "pdf-1", name: "Paper one" }], "missing");
    expect(panel.renderForTest()).toBeDefined();
  });

  it("presents captured and saved annotation values", () => {
    const panel = new TestProjectAnnotationForm();
    panel.showCapture({ page: 3, prefix: "before", quote: "evidence", suffix: "after" });
    panel.setStatus("Selection saved.");
    panel.setVisible(false);
    panel.setTool("erase");
    panel.setUndoAvailable(true);
    panel.setCitationCount(2);
    panel.showAnnotation({ comment: "Important", page: 4, prefix: "left", quote: "claim", suffix: "right" });
    panel.changeForTest("page", "5");
    panel.changeForTest("prefix", "new left");
    panel.changeForTest("suffix", "new right");
    expect(panel.renderForTest()).toBeDefined();
  });

  it("emits save and link intents with the current comment", () => {
    const panel = new TestProjectAnnotationForm();
    const intents: ProjectAnnotationSave[] = [];
    panel.addEventListener(projectAnnotationSaveEvent, (event) => {
      intents.push((event as CustomEvent<ProjectAnnotationSave>).detail);
    });
    panel.changeForTest("comment", "Use this");
    panel.saveForTest(false);
    panel.saveForTest(true);
    expect(intents).toEqual([
      { comment: "Use this", link: false },
      { comment: "Use this", link: true },
    ]);
  });

  it("emits bounded toolbar and citation intents", () => {
    const panel = new TestProjectAnnotationForm();
    const actions: ProjectAnnotationAction[] = [];
    panel.addEventListener(projectAnnotationActionEvent, (event) => {
      actions.push((event as CustomEvent<ProjectAnnotationAction>).detail);
    });

    panel.actionForTest("paint");
    panel.actionForTest("erase");
    panel.actionForTest("undo");
    panel.actionForTest("cite");

    expect(actions).toEqual([
      { action: "choose-tool", tool: "paint" },
      { action: "choose-tool", tool: "erase" },
      { action: "undo-highlight" },
      { action: "cite-page" },
    ]);
  });
});
