import { describe, expect, it, vi } from "vitest";

import * as Markdown from "../../domain/manuscript/markdown";
import type { MarkdownRuntime } from "../preview/markdown-runtime";
import {
  ChapterNotesPanel,
  chapterNotesPanelActionEvent,
  type ChapterNotesFile,
  type ChapterNotesPanelAction,
} from "./chapter-notes-panel";

const chapterPath = "chapters/01_introduction.md";
const notes: ChapterNotesFile = {
  content: "# Questions\n\nWhat belongs in the opening?",
  id: "file:introduction-notes",
  path: "chapters/01_introduction.notes.md",
};

interface TemplateLike {
  readonly strings: readonly string[];
  readonly values: readonly unknown[];
}

function templateText(template: TemplateLike): string {
  return template.strings.reduce((output, part, index) => `${output}${part}${templateValueText(template.values[index])}`, "");
}

function templateValueText(value: unknown): string {
  if (isTemplateLike(value)) return templateText(value);
  return typeof value === "string" ? value : "";
}

function isTemplateLike(value: unknown): value is TemplateLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "strings" in value &&
    Array.isArray(value.strings) &&
    "values" in value &&
    Array.isArray(value.values)
  );
}

class TestChapterNotesPanel extends ChapterNotesPanel {
  runtime: Promise<MarkdownRuntime> = Promise.resolve(Markdown);

  override get updateComplete(): Promise<boolean> {
    return Promise.resolve(true);
  }

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  openForTest(): void {
    this.openInEditor();
  }

  stateForTest(): string {
    return this.view.kind;
  }

  valueForTest(): string | null {
    return "value" in this.view ? this.view.value : null;
  }

  protected override loadRuntime(): Promise<MarkdownRuntime> {
    return this.runtime;
  }
}

describe("chapter notes panel", () => {
  it("renders unavailable and empty companion states", async () => {
    const panel = new TestChapterNotesPanel();
    expect(panel.rootForTest()).toBe(panel);
    expect(templateText(panel.renderForTest())).toContain("Open a chapter to read its companion notes.");

    await expect(panel.presentNotes({ chapterPath, notes: null })).resolves.toEqual({ available: false });
    expect(panel.stateForTest()).toBe("unavailable");
    expect(templateText(panel.renderForTest())).toContain(`No companion notes are available for ${chapterPath}.`);

    await expect(panel.presentNotes({ chapterPath, notes: { ...notes, content: "  \n" } })).resolves.toEqual({ available: true });
    expect(panel.stateForTest()).toBe("empty");
    expect(templateText(panel.renderForTest())).toContain("This notes file is empty. Open it in the editor to start capturing ideas.");
    expect(templateText(panel.renderForTest())).toContain(notes.path);
  });

  it("renders scholarly Markdown through the sanitized workspace runtime", async () => {
    const panel = new TestChapterNotesPanel();
    const source = "# Finding\n\n<script>alert('notes')</script>\n\n[unsafe](javascript:alert(1))";
    const renderWorkspaceMarkdown = vi.fn(Markdown.renderWorkspaceMarkdown);
    panel.runtime = Promise.resolve({ ...Markdown, renderWorkspaceMarkdown });

    await expect(panel.presentNotes({ chapterPath, notes: { ...notes, content: source } })).resolves.toEqual({ available: true });

    expect(renderWorkspaceMarkdown).toHaveBeenCalledWith(source, "");
    expect(panel.stateForTest()).toBe("html");
    expect(panel.valueForTest()).toContain("<h1");
    expect(panel.valueForTest()).toContain("&#x3C;script>");
    expect(panel.valueForTest()).not.toContain("<script");
    expect(panel.valueForTest()).not.toMatch(/href="javascript:/u);
    expect(templateText(panel.renderForTest())).toContain("Chapter notes");
  });

  it("falls back to inert Markdown source when the rich renderer is unavailable", async () => {
    const panel = new TestChapterNotesPanel();
    panel.runtime = Promise.reject(new Error("Renderer unavailable"));

    await expect(panel.presentNotes({ chapterPath, notes })).resolves.toEqual({ available: false });

    expect(panel.stateForTest()).toBe("source");
    expect(panel.valueForTest()).toBe(notes.content);
    const rendered = templateText(panel.renderForTest());
    expect(rendered).toContain("Rich notes preview is unavailable. Showing Markdown source.");
    expect(rendered).toContain(notes.content);
  });

  it("discards a render superseded while its runtime loads", async () => {
    const panel = new TestChapterNotesPanel();
    let release: ((runtime: MarkdownRuntime) => void) | undefined;
    panel.runtime = new Promise((resolve) => {
      release = resolve;
    });
    const stale = panel.presentNotes({ chapterPath, notes });
    expect(panel.stateForTest()).toBe("loading");
    expect(templateText(panel.renderForTest())).toContain("Rendering chapter notes…");
    panel.runtime = Promise.resolve(Markdown);

    await expect(panel.presentNotes({ chapterPath, notes: { ...notes, content: "# Current" } })).resolves.toEqual({
      available: true,
    });
    release?.(Markdown);
    await expect(stale).resolves.toBeNull();
    expect(panel.valueForTest()).toContain("Current");
  });

  it("emits one typed open-in-editor intent for the current notes file", async () => {
    const panel = new TestChapterNotesPanel();
    const actions: ChapterNotesPanelAction[] = [];
    const eventFlags: { bubbles: boolean; composed: boolean }[] = [];
    panel.addEventListener(chapterNotesPanelActionEvent, (event) => {
      const action = event as CustomEvent<ChapterNotesPanelAction>;
      actions.push(action.detail);
      eventFlags.push({ bubbles: action.bubbles, composed: action.composed });
    });

    panel.openForTest();
    await panel.presentNotes({ chapterPath: "", notes });
    panel.openForTest();
    await panel.presentNotes({ chapterPath, notes });
    panel.openForTest();

    expect(actions).toEqual([{ action: "open-in-editor", chapterPath, fileId: notes.id, path: notes.path }]);
    expect(eventFlags).toEqual([{ bubbles: true, composed: true }]);
  });
});
