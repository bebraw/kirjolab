import { afterEach, describe, expect, it, vi } from "vitest";
import { isTemplateResult } from "lit/directive-helpers.js";
import type { LibraryHighlight } from "../../domain/reference-library";
import {
  LibraryPdfAnnotationForms,
  libraryPdfAnnotationActionEvent,
  type LibraryPdfAnnotationAction,
} from "./library-pdf-annotation-forms";

class TestLibraryPdfAnnotationForms extends LibraryPdfAnnotationForms {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  changeForTest(field: "comment" | "note" | "color" | "width", value: string): void {
    const event = new Event("input");
    Object.defineProperty(event, "currentTarget", { value: { value } });
    const ids = {
      comment: "library-highlight-comment",
      note: "library-note-body",
      color: "library-selected-draw-color",
      width: "library-selected-draw-width",
    };
    this.bindingForTest(ids[field], "input").call(this, event);
  }

  async submitForTest(form: "highlight" | "note" | "drawing"): Promise<void> {
    const event = new Event("submit", { cancelable: true });
    const ids = { highlight: "library-highlight-form", note: "library-note-form", drawing: "library-markup-selection" };
    await this.bindingForTest(ids[form], "submit").call(this, event);
    expect(event.defaultPrevented).toBe(true);
  }

  bindingForTest(id: string, event: string): (...args: unknown[]) => unknown {
    const template = this.renderForTest();
    let currentId = "";
    for (const [index, part] of template.strings.entries()) {
      const ids = [...part.matchAll(/\bid="([^"]+)"/gu)];
      currentId = ids.at(-1)?.[1] ?? currentId;
      if (currentId !== id || !part.trimEnd().endsWith(`@${event}=`)) continue;
      const listener: unknown = template.values[index];
      if (typeof listener !== "function") throw new Error(`Expected ${event} listener for ${id}`);
      return (...args) => Reflect.apply(listener, this, args);
    }
    throw new Error(`Expected ${event} binding for ${id}`);
  }

  clickForTest(id: string): void {
    this.bindingForTest(id, "click").call(this, new Event("click"));
  }

  shortcutForTest(event: Event, formId = "library-note-form"): void {
    const template = this.renderForTest();
    let insideForm = false;
    for (const [index, part] of template.strings.entries()) {
      if (part.includes("<form")) insideForm = part.includes(`id="${formId}"`);
      if (!insideForm || !part.trimEnd().endsWith("@keydown=")) continue;
      const listener = template.values[index];
      if (typeof listener !== "function") throw new Error(`Expected keyboard listener for ${formId}`);
      listener.call(this, event);
      return;
    }
    throw new Error(`Expected keyboard-enabled form ${formId}`);
  }

  async deleteForTest(): Promise<void> {
    await this.deleteMarkup();
  }

  emitForTest(action: LibraryPdfAnnotationAction): void {
    this.emitAction(action);
  }
}

const rects = [{ height: 0.1, width: 0.4, x: 0.1, y: 0.2 }];
const highlight: LibraryHighlight = {
  artifactId: "artifact:1",
  comment: "",
  createdAt: "2026-07-25T00:00:00.000Z",
  id: "highlight:1",
  page: 5,
  quote: "selected claim",
  rects,
  referenceId: "reference:1",
  updatedAt: "2026-07-25T00:00:00.000Z",
};

class AnnotationForm {
  hidden = false;
  readonly button = { disabled: false };

  constructor(readonly requestSubmit: () => void) {}

  querySelector(selector: string) {
    return selector === 'button[type="submit"]' ? this.button : null;
  }
}

function saveKey(form: AnnotationForm, options: KeyboardEventInit): Event {
  const event = Object.assign(new Event("keydown", { cancelable: true }), {
    key: "Enter",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
    ...options,
  });
  Object.defineProperty(event, "currentTarget", { value: form });
  return event;
}

function renderedText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (!isTemplateResult(value, 1)) return "";
  return value.strings.reduce((text, part, index) => `${text}${part}${renderedText(value.values[index])}`, "");
}

function formHidden(forms: TestLibraryPdfAnnotationForms, id: string): boolean {
  const match = new RegExp(`id="${id}"\\s+\\?hidden=(true|false)`, "u").exec(renderedText(forms.renderForTest()));
  if (!match) throw new Error(`Expected rendered annotation form ${id}`);
  return match[1] === "true";
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("library PDF annotation forms", () => {
  it.each([{ metaKey: true }, { ctrlKey: true }])("saves a new page note with the modified Enter shortcut %j", async (modifiers) => {
    vi.stubGlobal("HTMLFormElement", AnnotationForm);
    const forms = new TestLibraryPdfAnnotationForms();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    forms.showNote("First line\nSecond line", {
      artifactId: "artifact:1",
      editingId: null,
      page: 5,
      referenceId: "reference:1",
      x: 0.2,
      y: 0.3,
    });
    let submitted: Promise<void> | undefined;
    const form = new AnnotationForm(() => {
      submitted = forms.submitForTest("note");
    });
    const event = saveKey(form, modifiers);

    forms.shortcutForTest(event);
    await submitted;

    expect(event.defaultPrevented).toBe(true);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "/api/library/references/reference%3A1/pdf-markups",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ kind: "note", artifactId: "artifact:1", page: 5, x: 0.2, y: 0.3, body: "First line\nSecond line" }),
      }),
    );
    expect(forms.noteOpen).toBe(false);
  });

  it.each([
    { metaKey: false },
    { metaKey: false, shiftKey: true },
    { isComposing: true },
    { repeat: true },
    { shiftKey: true },
    { altKey: true },
    { key: "Escape" },
  ])("leaves ordinary typing and unrelated keyboard gestures unchanged %j", (options) => {
    vi.stubGlobal("HTMLFormElement", AnnotationForm);
    const forms = new TestLibraryPdfAnnotationForms();
    const requestSubmit = vi.fn();
    const event = saveKey(new AnnotationForm(requestSubmit), { metaKey: true, ...options });

    forms.shortcutForTest(event);

    expect(requestSubmit).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it.each(["hidden", "disabled"])("does not submit a %s annotation form", (state) => {
    vi.stubGlobal("HTMLFormElement", AnnotationForm);
    const forms = new TestLibraryPdfAnnotationForms();
    const requestSubmit = vi.fn();
    const form = new AnnotationForm(requestSubmit);
    form.hidden = state === "hidden";
    form.button.disabled = state === "disabled";

    forms.shortcutForTest(saveKey(form, { ctrlKey: true }));

    expect(requestSubmit).not.toHaveBeenCalled();
  });

  it("leaves already handled shortcuts and events outside a form alone", () => {
    vi.stubGlobal("HTMLFormElement", AnnotationForm);
    const forms = new TestLibraryPdfAnnotationForms();
    const requestSubmit = vi.fn();
    const event = saveKey(new AnnotationForm(requestSubmit), { metaKey: true });
    event.preventDefault();

    forms.shortcutForTest(event);
    forms.shortcutForTest(Object.assign(new Event("keydown"), { key: "Enter", metaKey: true }));

    expect(requestSubmit).not.toHaveBeenCalled();
  });

  it("keeps a shortcut inert when the form has no enabled save control", () => {
    vi.stubGlobal("HTMLFormElement", AnnotationForm);
    const forms = new TestLibraryPdfAnnotationForms();
    const requestSubmit = vi.fn();
    const form = new AnnotationForm(requestSubmit);
    vi.spyOn(form, "querySelector").mockReturnValue(null);
    const event = saveKey(form, { metaKey: true });

    forms.shortcutForTest(event);

    expect(requestSubmit).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("advertises keyboard saving on both note editors", () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const rendered = renderedText(forms.renderForTest());
    expect(rendered.match(/title="Save note \(Cmd\/Ctrl\+Enter\)"/gu)).toHaveLength(2);
    expect(rendered.match(/aria-keyshortcuts="Meta\+Enter Control\+Enter"/gu)).toHaveLength(2);
  });

  it("emits actions configured to cross its inspector owner", () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const received: CustomEvent<LibraryPdfAnnotationAction>[] = [];
    forms.addEventListener(libraryPdfAnnotationActionEvent, (event) => {
      received.push(event as CustomEvent<LibraryPdfAnnotationAction>);
    });

    forms.emitForTest({ action: "cancel-highlight" });

    expect(received).toHaveLength(1);
    expect(received[0]?.detail).toEqual({ action: "cancel-highlight" });
    expect(received[0]?.bubbles).toBe(true);
    expect(received[0]?.composed).toBe(true);
  });

  it("owns bounded light-DOM composer visibility", () => {
    const forms = new TestLibraryPdfAnnotationForms();
    expect(forms.rootForTest()).toBe(forms);
    expect(forms.empty).toBe(true);
    expect(formHidden(forms, "library-highlight-form")).toBe(true);
    expect(formHidden(forms, "library-note-form")).toBe(true);
    expect(formHidden(forms, "library-markup-selection")).toBe(true);
    const initial = renderedText(forms.renderForTest());
    expect(initial).toContain("Selected annotation");
    expect(initial).toContain(".value=#d33f49");
    expect(initial).toMatch(/id="library-highlight-comment"[\s\S]*?\.value=\s+@input=/u);
    expect(initial).toMatch(/id="library-note-body"[\s\S]*?\.value=\s+@input=/u);
    expect(initial.match(/role="status" \?hidden=true>/gu)).toHaveLength(3);

    forms.showHighlight({ highlightId: null, page: 3, quote: "evidence", comment: "private", rects: [] });
    expect(forms.highlightOpen).toBe(true);
    expect(forms.empty).toBe(false);
    expect(formHidden(forms, "library-highlight-form")).toBe(false);
    expect(renderedText(forms.renderForTest())).toContain("“evidence”");
    expect(renderedText(forms.renderForTest())).toContain("private");
    forms.clearHighlight(4);
    expect(formHidden(forms, "library-highlight-form")).toBe(true);
    expect(renderedText(forms.renderForTest())).not.toContain("“evidence”");
    expect(renderedText(forms.renderForTest())).not.toContain(".value=private");
    expect(renderedText(forms.renderForTest())).toContain('id="library-highlight-page" type="hidden" .value=4');

    forms.showNote("draft");
    expect(forms.noteOpen).toBe(true);
    expect(formHidden(forms, "library-note-form")).toBe(false);
    forms.clearNote();
    expect(formHidden(forms, "library-note-form")).toBe(true);
    expect(renderedText(forms.renderForTest())).not.toContain(".value=draft");

    forms.showMarkup({ id: "drawing:1", label: "Line on page 2", kind: "drawing", referenceId: "reference:1", color: "#112233", width: 8 });
    expect(forms.markupOpen).toBe(true);
    expect(formHidden(forms, "library-markup-selection")).toBe(false);
    expect(renderedText(forms.renderForTest())).toContain("Line on page 2");
    forms.showMarkup({ id: "note:1", label: "Note on page 2", kind: "note", referenceId: "reference:1" });
    forms.clearMarkup();
    expect(forms.empty).toBe(true);
    expect(formHidden(forms, "library-markup-selection")).toBe(true);
  });

  it("shows line styling only for drawings and retains the selected style when no replacement is supplied", () => {
    const forms = new TestLibraryPdfAnnotationForms();
    forms.showMarkup({ id: "drawing:1", label: "Line", kind: "drawing", referenceId: "reference:1", color: "#112233", width: 8 });
    const drawing = renderedText(forms.renderForTest());
    expect(drawing).toContain('class="library-selected-drawing-options" ?hidden=false');
    expect(drawing).toMatch(/id="edit-selected-library-note"[\s\S]*?\?hidden=true/u);
    expect(drawing).toContain('type="color" .value=#112233');
    expect(drawing).toContain('id="library-selected-draw-width-value">8</output>');
    expect(drawing).toContain("Apply style");

    forms.showMarkup({ id: "note:1", label: "Note", kind: "note", referenceId: "reference:1" });
    const note = renderedText(forms.renderForTest());
    expect(note).toContain('class="library-selected-drawing-options" ?hidden=true');
    expect(note).toMatch(/id="edit-selected-library-note"[\s\S]*?\?hidden=false/u);
    expect(note).toContain('type="color" .value=#112233');
    expect(note).toContain('id="library-selected-draw-width-value">8</output>');
  });

  it("keeps the current note context for draft-only updates and clears it when the editor closes", async () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    forms.showNote("First draft", { artifactId: "artifact:1", editingId: null, page: 1, referenceId: "reference:1", x: 0.2, y: 0.3 });
    forms.showNote("Updated draft");
    await forms.submitForTest("note");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ kind: "note", artifactId: "artifact:1", page: 1, x: 0.2, y: 0.3, body: "Updated draft" }),
      }),
    );
    forms.showNote();
    expect(renderedText(forms.renderForTest())).toMatch(/id="library-note-body"[\s\S]*?\.value=\s+@input=/u);
    forms.changeForTest("note", "No stale target");
    await forms.submitForTest("note");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("focuses the appropriate editor only after its controls have rendered", async () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const comment = { focus: vi.fn() };
    const note = { focus: vi.fn() };
    let finishRender = (_updated: boolean): void => undefined;
    const rendered = new Promise<boolean>((resolve) => {
      finishRender = resolve;
    });
    Object.defineProperty(forms, "updateComplete", { value: rendered });
    Object.defineProperty(forms, "querySelector", {
      value: (selector: string) => {
        if (selector === "#library-highlight-comment") return comment;
        if (selector === "#library-note-body") return note;
        return null;
      },
    });

    forms.focusHighlightComment();
    forms.focusNote();
    expect(comment.focus).not.toHaveBeenCalled();
    expect(note.focus).not.toHaveBeenCalled();
    finishRender(true);
    await rendered;

    expect(comment.focus).toHaveBeenCalledOnce();
    expect(note.focus).toHaveBeenCalledOnce();
  });

  it("does not persist empty drafts or drafts without an authorized PDF context", async () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    forms.showNote("Unbound note");
    await forms.submitForTest("note");
    forms.showNote(" \n ", { artifactId: "artifact:1", editingId: null, page: 1, referenceId: "reference:1", x: 0.2, y: 0.3 });
    await forms.submitForTest("note");
    forms.showHighlight({ highlightId: null, page: 1, quote: "Unbound evidence", comment: "Private", rects });
    await forms.submitForTest("highlight");
    forms.setHighlightContext({ artifactId: "artifact:1", referenceId: "reference:1", highlights: [] });
    forms.showHighlight({ highlightId: null, page: 1, quote: " \n ", comment: "Private", rects });
    await forms.submitForTest("highlight");
    await forms.submitForTest("drawing");
    await forms.deleteForTest();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(forms.noteOpen).toBe(true);
    expect(forms.highlightOpen).toBe(true);
  });

  it.each([
    { ...highlight, artifactId: "different-pdf" },
    { ...highlight, page: 6 },
    { ...highlight, rects: [{ x: 0.7, y: 0.7, width: 0.1, height: 0.1 }] },
  ])("creates independent evidence when an existing highlight does not overlap the same PDF page: %j", async (existing) => {
    const forms = new TestLibraryPdfAnnotationForms();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const actions: LibraryPdfAnnotationAction[] = [];
    forms.addEventListener(libraryPdfAnnotationActionEvent, (event) =>
      actions.push((event as CustomEvent<LibraryPdfAnnotationAction>).detail),
    );
    forms.setHighlightContext({ artifactId: "artifact:1", referenceId: "reference:1", highlights: [existing] });
    forms.showHighlight({ highlightId: null, page: 5, quote: "New evidence", comment: "", rects });

    await forms.submitForTest("highlight");

    expect(actions).toEqual([{ action: "highlight-saved", kind: "created" }]);
    expect(forms.highlightOpen).toBe(false);
  });

  it("persists current highlight and note values and emits drawing intents", async () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const actions: LibraryPdfAnnotationAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    forms.addEventListener(libraryPdfAnnotationActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfAnnotationAction>).detail);
    });

    forms.setHighlightContext({ artifactId: highlight.artifactId, highlights: [highlight], referenceId: highlight.referenceId });
    forms.showHighlight({ highlightId: null, page: 5, quote: "  selected claim  ", comment: "", rects });
    forms.changeForTest("comment", "Explain this");
    await forms.submitForTest("highlight");
    expect(forms.highlightOpen).toBe(false);
    forms.showNote("", {
      artifactId: "artifact:1",
      editingId: null,
      page: 5,
      referenceId: "reference:1",
      x: 0.2,
      y: 0.3,
    });
    forms.changeForTest("note", "  Margin note  ");
    await forms.submitForTest("note");
    expect(forms.noteOpen).toBe(false);
    forms.showMarkup({ id: "drawing/1", label: "Line", kind: "drawing", referenceId: "reference/1" });
    forms.changeForTest("color", "#abcdef");
    forms.changeForTest("width", "12");
    await forms.submitForTest("drawing");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/references/reference%3A1/highlights",
      expect.objectContaining({
        body: JSON.stringify({
          artifactId: "artifact:1",
          page: 5,
          quote: "selected claim",
          comment: "Explain this",
          rects,
        }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/references/reference%3A1/pdf-markups",
      expect.objectContaining({
        body: JSON.stringify({
          kind: "note",
          artifactId: "artifact:1",
          page: 5,
          x: 0.2,
          y: 0.3,
          body: "Margin note",
        }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/references/reference%2F1/pdf-markups/drawing%2F1",
      expect.objectContaining({
        body: JSON.stringify({ color: "#abcdef", width: 12 }),
        method: "PATCH",
      }),
    );
    expect(actions).toEqual([
      { action: "highlight-saved", kind: "extended" },
      { action: "note-saved", kind: "created" },
      { action: "markup-saved", kind: "updated" },
    ]);
  });

  it("updates an existing page note through stable encoded identities", async () => {
    vi.stubGlobal("HTMLFormElement", AnnotationForm);
    const forms = new TestLibraryPdfAnnotationForms();
    const actions: LibraryPdfAnnotationAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    forms.showNote("Revised note", {
      artifactId: "artifact:1",
      editingId: "note/1",
      page: 7,
      referenceId: "reference/1",
      x: 0.4,
      y: 0.6,
    });
    forms.addEventListener(libraryPdfAnnotationActionEvent, (event) =>
      actions.push((event as CustomEvent<LibraryPdfAnnotationAction>).detail),
    );

    let submitted: Promise<void> | undefined;
    forms.shortcutForTest(
      saveKey(
        new AnnotationForm(() => {
          submitted = forms.submitForTest("note");
        }),
        { metaKey: true },
      ),
    );
    await submitted;

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/references/reference%2F1/pdf-markups/note%2F1",
      expect.objectContaining({
        body: JSON.stringify({ page: 7, x: 0.4, y: 0.6, body: "Revised note" }),
        method: "PATCH",
      }),
    );
    expect(actions).toEqual([{ action: "note-saved", kind: "updated" }]);
  });

  it("reports page-note failures and permits retry", async () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    forms.showNote("Retry me", {
      artifactId: "artifact:1",
      editingId: null,
      page: 5,
      referenceId: "reference:1",
      x: 0.2,
      y: 0.3,
    });

    await forms.submitForTest("note");
    expect(forms.noteOpen).toBe(true);
    expect(renderedText(forms.renderForTest())).toContain("Request failed (503)");
    expect(renderedText(forms.renderForTest())).toContain("Retry me");
    await forms.submitForTest("note");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(forms.noteOpen).toBe(false);
    expect(renderedText(forms.renderForTest())).not.toContain("Request failed (503)");
  });

  it("ignores duplicate page-note saves while one is pending", async () => {
    vi.stubGlobal("HTMLFormElement", AnnotationForm);
    const forms = new TestLibraryPdfAnnotationForms();
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pendingResponse);
    forms.showNote("Save once", {
      artifactId: "artifact:1",
      editingId: null,
      page: 5,
      referenceId: "reference:1",
      x: 0.2,
      y: 0.3,
    });

    const first = forms.submitForTest("note");
    expect(renderedText(forms.renderForTest())).toContain("Saving private note…");
    expect(renderedText(forms.renderForTest())).toMatch(
      /id="library-note-form"[\s\S]*?<button[\s\S]*?\?disabled=true[\s\S]*?>\s+Saving…\s+<\/button>/u,
    );
    expect(renderedText(forms.renderForTest()).match(/role="status" \?hidden=false>/gu)).toHaveLength(3);
    const requestSubmit = vi.fn();
    forms.shortcutForTest(saveKey(new AnnotationForm(requestSubmit), { metaKey: true }));
    await forms.submitForTest("note");
    respond(new Response(null, { status: 200 }));
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestSubmit).not.toHaveBeenCalled();
    expect(renderedText(forms.renderForTest())).not.toContain("Saving…");
  });

  it("updates an existing highlight note through stable encoded identities", async () => {
    vi.stubGlobal("HTMLFormElement", AnnotationForm);
    const forms = new TestLibraryPdfAnnotationForms();
    const actions: LibraryPdfAnnotationAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    forms.setHighlightContext({ artifactId: highlight.artifactId, highlights: [highlight], referenceId: "reference/1" });
    forms.showHighlight({ highlightId: "highlight/1", page: 5, quote: highlight.quote, comment: "Revised", rects });
    expect(renderedText(forms.renderForTest())).toMatch(/id="save-library-highlight"[\s\S]*?>\s+Save note\s+<\/button>/u);
    forms.addEventListener(libraryPdfAnnotationActionEvent, (event) =>
      actions.push((event as CustomEvent<LibraryPdfAnnotationAction>).detail),
    );

    let submitted: Promise<void> | undefined;
    forms.shortcutForTest(
      saveKey(
        new AnnotationForm(() => {
          submitted = forms.submitForTest("highlight");
        }),
        { ctrlKey: true },
      ),
      "library-highlight-form",
    );
    await submitted;

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/references/reference%2F1/highlights/highlight%2F1",
      expect.objectContaining({ body: JSON.stringify({ comment: "Revised" }), method: "PATCH" }),
    );
    expect(actions).toEqual([{ action: "highlight-saved", kind: "updated" }]);
  });

  it("reports provider failures and permits retry", async () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    forms.setHighlightContext({ artifactId: highlight.artifactId, highlights: [], referenceId: highlight.referenceId });
    forms.showHighlight({ highlightId: null, page: 5, quote: highlight.quote, comment: "", rects });

    await forms.submitForTest("highlight");
    expect(forms.highlightOpen).toBe(true);
    expect(renderedText(forms.renderForTest())).toContain("Request failed (503)");
    expect(renderedText(forms.renderForTest())).toContain("selected claim");
    await forms.submitForTest("highlight");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(forms.highlightOpen).toBe(false);
    expect(renderedText(forms.renderForTest())).not.toContain("Request failed (503)");
  });

  it("ignores duplicate highlight saves while one is pending", async () => {
    const forms = new TestLibraryPdfAnnotationForms();
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pendingResponse);
    forms.setHighlightContext({ artifactId: highlight.artifactId, highlights: [], referenceId: highlight.referenceId });
    forms.showHighlight({ highlightId: null, page: 5, quote: highlight.quote, comment: "", rects });

    const first = forms.submitForTest("highlight");
    expect(renderedText(forms.renderForTest())).toContain("Saving private highlight…");
    expect(renderedText(forms.renderForTest())).toMatch(/id="save-library-highlight"[\s\S]*?>\s+Saving…\s+<\/button>/u);
    await forms.submitForTest("highlight");
    respond(new Response(null, { status: 200 }));
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(renderedText(forms.renderForTest())).toMatch(/id="save-library-highlight"[\s\S]*?>\s+Save\s+<\/button>/u);
  });

  it("deletes the selected markup through stable encoded identities", async () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const actions: LibraryPdfAnnotationAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    forms.showMarkup({ id: "note/1", label: "Note", kind: "note", referenceId: "reference/1" });
    forms.addEventListener(libraryPdfAnnotationActionEvent, (event) =>
      actions.push((event as CustomEvent<LibraryPdfAnnotationAction>).detail),
    );

    await forms.deleteForTest();

    expect(fetchMock).toHaveBeenCalledWith("/api/library/references/reference%2F1/pdf-markups/note%2F1", {
      credentials: "same-origin",
      method: "DELETE",
    });
    expect(actions).toEqual([{ action: "markup-saved", kind: "deleted" }]);
    expect(forms.markupOpen).toBe(false);
  });

  it("reports selected-markup failures and permits retry", async () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    forms.showMarkup({ id: "drawing:1", label: "Line", kind: "drawing", referenceId: "reference:1" });

    await forms.submitForTest("drawing");
    expect(forms.markupOpen).toBe(true);
    expect(renderedText(forms.renderForTest())).toContain("Request failed (503)");
    await forms.submitForTest("drawing");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(renderedText(forms.renderForTest())).not.toContain("Request failed (503)");
  });

  it("keeps a selected note editable when deleting it fails, then closes it after a successful retry", async () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const actions: LibraryPdfAnnotationAction[] = [];
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ error: "Please retry deleting this note." }, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    forms.addEventListener(libraryPdfAnnotationActionEvent, (event) =>
      actions.push((event as CustomEvent<LibraryPdfAnnotationAction>).detail),
    );
    forms.showMarkup({ id: "note:1", label: "Note on page 2", kind: "note", referenceId: "reference:1" });

    await forms.deleteForTest();
    expect(forms.markupOpen).toBe(true);
    expect(renderedText(forms.renderForTest())).toContain("Please retry deleting this note.");
    expect(actions).toEqual([]);
    await forms.deleteForTest();

    expect(forms.markupOpen).toBe(false);
    expect(renderedText(forms.renderForTest())).not.toContain("Please retry deleting this note.");
    expect(actions).toEqual([{ action: "markup-saved", kind: "deleted" }]);
  });

  it("ignores duplicate selected-markup mutations while one is pending", async () => {
    const forms = new TestLibraryPdfAnnotationForms();
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pendingResponse);
    forms.showMarkup({ id: "drawing:1", label: "Line", kind: "drawing", referenceId: "reference:1" });

    const first = forms.submitForTest("drawing");
    expect(renderedText(forms.renderForTest())).toContain("Updating private line…");
    expect(renderedText(forms.renderForTest())).toContain("Applying…");
    await forms.submitForTest("drawing");
    await forms.deleteForTest();
    respond(new Response(null, { status: 200 }));
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(renderedText(forms.renderForTest())).toContain("Apply style");
    expect(renderedText(forms.renderForTest())).not.toContain("Applying…");
  });

  it.each([
    ["highlight", "Could not save the private highlight."],
    ["note", "Could not save the private note."],
    ["drawing", "Could not update the private line."],
    ["delete", "Could not delete the private annotation."],
  ] as const)("keeps useful feedback and allows retry when %s rejects without an Error", async (operation, message) => {
    const forms = new TestLibraryPdfAnnotationForms();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(null)
      .mockResolvedValue(new Response(null, { status: 200 }));
    forms.setHighlightContext({ artifactId: "artifact:1", referenceId: "reference:1", highlights: [] });
    forms.showHighlight({ highlightId: null, page: 1, quote: "Evidence", comment: "Draft", rects });
    forms.showNote("Draft", { artifactId: "artifact:1", editingId: null, page: 1, referenceId: "reference:1", x: 0.2, y: 0.3 });
    forms.showMarkup({ id: "drawing:1", label: "Line", kind: "drawing", referenceId: "reference:1" });
    const submit = () => (operation === "delete" ? forms.deleteForTest() : forms.submitForTest(operation));

    await submit();
    expect(renderedText(forms.renderForTest())).toContain(message);
    await submit();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(renderedText(forms.renderForTest())).not.toContain(message);
    expect(renderedText(forms.renderForTest())).not.toContain("?disabled=true");
  });

  it("does not apply drawing styles to a selected note", async () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    forms.showMarkup({ id: "note:1", label: "Note", kind: "note", referenceId: "reference:1" });
    await forms.submitForTest("drawing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("emits cancellation and selected-markup intents", () => {
    const forms = new TestLibraryPdfAnnotationForms();
    const actions: LibraryPdfAnnotationAction[] = [];
    forms.addEventListener(libraryPdfAnnotationActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfAnnotationAction>).detail);
    });

    forms.clickForTest("cancel-library-highlight");
    forms.clickForTest("cancel-library-note");
    forms.clickForTest("edit-selected-library-note");
    forms.clickForTest("cancel-library-markup-selection");

    expect(actions).toEqual([
      { action: "cancel-highlight" },
      { action: "cancel-note" },
      { action: "edit-note" },
      { action: "clear-markup" },
    ]);
  });
});
