import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicationResource } from "../domain/workspace";
import { ProjectAnnotationForm, type ProjectAnnotationSaved, type ProjectHighlightTool } from "./project-annotation-form";
import { PublicationIntakePanel, type PublicationIntakeAction } from "./publication-intake-panel";

const publication = {
  abstract: "",
  authors: ["Ada Author"],
  citationKey: "author2026",
  createdAt: "2026-07-25T00:00:00.000Z",
  doi: "10.5555/intake",
  id: "publication-1",
  metadataSource: "crossref",
  title: "Reviewed intake",
  type: "article",
  updatedAt: "2026-07-25T00:00:00.000Z",
  url: "https://doi.org/10.5555/intake",
  venue: "Journal",
  year: "2026",
} satisfies PublicationResource;

class TestProjectAnnotationForm extends ProjectAnnotationForm {
  readonly intakeForTest = new PublicationIntakePanel();

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

  intakeActionForTest(detail: PublicationIntakeAction): Promise<void> {
    return this.handleIntake(new CustomEvent("publication-intake-action", { detail }));
  }

  firstUpdatedForTest(): void {
    this.firstUpdated();
  }

  protected override get intake(): PublicationIntakePanel {
    return this.intakeForTest;
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
    expect(panel.renderForTest().values).toContain("Select across a saved highlight stroke or tap it to erase that content.");
    panel.showCapture({ page: 4, prefix: "", quote: "evidence", rects: [], suffix: "" });
    expect(panel.renderForTest().values).toContain("Erasing overlapping highlight strokes…");
    panel.setTool("paint");
    expect(panel.renderForTest().values).toContain("Paint PDF text to save or extend a highlight.");
    panel.setStatus("Selection saved.");
    panel.setVisible(false);
    panel.setUndoStroke({ annotationId: "annotation-1", fragmentId: "fragment-1" });
    panel.setCitationContext("pdf-1", [
      { id: "link-1", pdfId: "pdf-1", publicationId: "publication-1", createdAt: "2026-07-25T00:00:00.000Z" },
      { id: "link-2", pdfId: "pdf-2", publicationId: "publication-2", createdAt: "2026-07-25T00:00:00.000Z" },
    ]);
    expect(panel.renderForTest().values).toContain("Cite current page");
    panel.setCitationContext(null, []);
    expect(panel.renderForTest().values).toContain("Identify before citing");
    panel.showAnnotation({ id: "annotation-1", comment: "Important", page: 4, prefix: "left", quote: "claim", suffix: "right" });
    panel.changeForTest("page", "5");
    panel.changeForTest("prefix", "new left");
    panel.changeForTest("suffix", "new right");
    expect(panel.renderForTest()).toBeDefined();
  });

  it("owns nested publication intake presentation and outcomes", async () => {
    const panel = new TestProjectAnnotationForm();
    const openPublication = vi.fn();
    const presentNotice = vi.fn();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const setPdf = vi.spyOn(panel.intakeForTest, "setPdf");
    const configure = vi.spyOn(panel.intakeForTest, "configure");
    const complete = vi.spyOn(panel.intakeForTest, "completeAcceptance").mockReturnValue(true);
    const fail = vi.spyOn(panel.intakeForTest, "failAcceptance");
    panel.bindIntake({ openPublication, presentNotice, publications: () => [publication], refresh });

    panel.setIntakePdf("pdf-1", [publication], []);
    panel.firstUpdatedForTest();
    await panel.intakeActionForTest({ action: "open-reference", publicationId: publication.id });
    await panel.intakeActionForTest({ action: "accepted", doi: publication.doi, requestId: 3 });
    await panel.intakeActionForTest({ action: "accepted", doi: "10.5555/missing", requestId: 4 });

    expect(setPdf).toHaveBeenCalledWith("pdf-1", [publication], []);
    expect(configure).toHaveBeenCalledWith("");
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledWith(3);
    expect(openPublication).toHaveBeenCalledTimes(2);
    expect(presentNotice).toHaveBeenCalledWith("Reference added and connected; the manuscript is unchanged.");
    expect(fail).toHaveBeenCalledWith(4, expect.any(Error));
  });

  it("owns note persistence and emits completed save and link outcomes", async () => {
    const panel = new TestProjectAnnotationForm();
    const outcomes: ProjectAnnotationSaved[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    panel.bindWorkflow({
      chooseTool: vi.fn(),
      completeSave: (saved) => outcomes.push(saved),
      citePage: vi.fn(),
      undoHighlight: vi.fn(),
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

  it("routes bounded toolbar and citation intents", () => {
    const panel = new TestProjectAnnotationForm();
    const chooseTool = vi.fn();
    const citePage = vi.fn();
    const undoHighlight = vi.fn();
    panel.bindWorkflow({
      chooseTool,
      completeSave: vi.fn(),
      citePage,
      undoHighlight,
    });

    panel.actionForTest("paint");
    panel.actionForTest("erase");
    panel.setUndoStroke({ annotationId: "annotation-1", fragmentId: "fragment-1" });
    panel.actionForTest("undo");
    panel.actionForTest("cite");

    expect(chooseTool).toHaveBeenNthCalledWith(1, "paint");
    expect(chooseTool).toHaveBeenNthCalledWith(2, "erase");
    expect(undoHighlight).toHaveBeenCalledWith("annotation-1", "fragment-1");
    expect(citePage).toHaveBeenCalledOnce();
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
