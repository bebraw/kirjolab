import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProjectAnnotationForm,
  projectAnnotationActionEvent,
  projectAnnotationSavedEvent,
  type ProjectAnnotationAction,
  type ProjectAnnotationSaved,
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

  saveForTest(link: boolean): Promise<void> {
    const event = new Event("submit") as SubmitEvent;
    Object.defineProperty(event, "submitter", {
      value: link ? { id: "save-and-link-annotation" } : null,
    });
    return this.save(event);
  }

  actionForTest(action: "cite" | "undo" | ProjectHighlightTool): void {
    if (action === "cite") this.citePage();
    else if (action === "undo") this.undoHighlight();
    else this.chooseTool(action);
  }
}

afterEach(() => vi.restoreAllMocks());

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
    panel.showCapture({
      page: 3,
      prefix: "before",
      quote: "evidence",
      rects: [{ height: 0.1, width: 0.2, x: 0.1, y: 0.2 }],
      suffix: "after",
    });
    expect(panel.renderForTest().values).toContain("Captured 1 line from page 3. Saving automatically…");
    panel.setTool("erase");
    panel.showCapture({ page: 4, prefix: "", quote: "evidence", rects: [], suffix: "" });
    expect(panel.renderForTest().values).toContain("Erasing overlapping highlight strokes…");
    panel.setStatus("Selection saved.");
    panel.setVisible(false);
    panel.setUndoStroke({ annotationId: "annotation-1", fragmentId: "fragment-1" });
    panel.setCitationCount(2);
    panel.showAnnotation({ id: "annotation-1", comment: "Important", page: 4, prefix: "left", quote: "claim", suffix: "right" });
    panel.changeForTest("page", "5");
    panel.changeForTest("prefix", "new left");
    panel.changeForTest("suffix", "new right");
    expect(panel.renderForTest()).toBeDefined();
  });

  it("owns note persistence and emits completed save and link outcomes", async () => {
    const panel = new TestProjectAnnotationForm();
    const outcomes: ProjectAnnotationSaved[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    panel.addEventListener(projectAnnotationSavedEvent, (event) => {
      outcomes.push((event as CustomEvent<ProjectAnnotationSaved>).detail);
    });
    panel.changeForTest("comment", "Use this");
    await panel.saveForTest(false);
    panel.showAnnotation({ id: "annotation-1", comment: "Use this", page: 1, prefix: "", quote: "Evidence", suffix: "" });
    await panel.saveForTest(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/workspace/annotations/annotation-1",
      expect.objectContaining({ body: JSON.stringify({ comment: "Use this" }), method: "PUT" }),
    );
    expect(outcomes).toEqual([{ annotationId: "annotation-1", link: true, message: "Highlight note saved." }]);
  });

  it("keeps failed note saves local and retryable", async () => {
    const panel = new TestProjectAnnotationForm();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ error: "Denied" }, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    panel.showAnnotation({ id: "annotation-1", comment: "Use this", page: 1, prefix: "", quote: "Evidence", suffix: "" });

    await panel.saveForTest(false);
    expect(panel.renderForTest()).toBeDefined();
    await panel.saveForTest(false);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("owns highlight creation and stroke-extension persistence", async () => {
    const panel = new TestProjectAnnotationForm();
    const created = annotation("annotation-1", [fragment("fragment-1")]);
    const extended = annotation("annotation-1", [fragment("fragment-1"), fragment("fragment-2")]);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(created))
      .mockResolvedValueOnce(Response.json(extended));
    panel.configure("/api/workspaces/workspace");
    const capture = { page: 2, prefix: "Before", quote: "Evidence", rects: [{ height: 0.1, width: 0.2, x: 0.1, y: 0.2 }], suffix: "After" };

    await expect(panel.saveCapture("pdf-1", capture)).resolves.toBe(true);
    await expect(panel.saveCapture("pdf-1", capture, "annotation/1")).resolves.toBe(true);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/workspaces/workspace/annotations",
      expect.objectContaining({ body: JSON.stringify({ pdfId: "pdf-1", ...capture, comment: "" }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/workspaces/workspace/annotations/annotation%2F1/fragments",
      expect.objectContaining({ body: JSON.stringify(capture) }),
    );
    expect(panel.renderForTest()).toBeDefined();
  });

  it("keeps malformed and failed highlight captures local and retryable", async () => {
    const panel = new TestProjectAnnotationForm();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ invalid: true }))
      .mockResolvedValueOnce(Response.json({ ...annotation("annotation-1", []), fragments: [] }))
      .mockResolvedValueOnce(Response.json(annotation("annotation-1", [fragment("fragment-1")])));
    panel.configure("/api/workspaces/workspace");
    const capture = { page: 2, prefix: "", quote: "Evidence", rects: [], suffix: "" };

    await expect(panel.saveCapture("pdf-1", capture)).resolves.toBe(false);
    await expect(panel.saveCapture("pdf-1", capture)).resolves.toBe(false);
    expect(panel.renderForTest()).toBeDefined();
    await expect(panel.saveCapture("pdf-1", capture)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("emits bounded toolbar and citation intents", () => {
    const panel = new TestProjectAnnotationForm();
    const actions: ProjectAnnotationAction[] = [];
    panel.addEventListener(projectAnnotationActionEvent, (event) => {
      actions.push((event as CustomEvent<ProjectAnnotationAction>).detail);
    });

    panel.actionForTest("paint");
    panel.actionForTest("erase");
    panel.setUndoStroke({ annotationId: "annotation-1", fragmentId: "fragment-1" });
    panel.actionForTest("undo");
    panel.actionForTest("cite");

    expect(actions).toEqual([
      { action: "choose-tool", tool: "paint" },
      { action: "choose-tool", tool: "erase" },
      { action: "undo-highlight", annotationId: "annotation-1", fragmentId: "fragment-1" },
      { action: "cite-page" },
    ]);
  });
});

function fragment(id: string) {
  return { createdAt: "2026-07-25T00:00:00.000Z", id, prefix: "Before", quote: "Evidence", rects: [], suffix: "After" };
}

function annotation(id: string, fragments: ReturnType<typeof fragment>[]) {
  return {
    comment: "",
    createdAt: "2026-07-25T00:00:00.000Z",
    fragments,
    id,
    page: 2,
    pdfId: "pdf-1",
    prefix: "Before",
    quote: "Evidence",
    rects: [],
    suffix: "After",
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
}
