import { describe, expect, it } from "vitest";
import { nothing, type TemplateResult } from "lit";
import { isTemplateResult } from "lit/directive-helpers.js";
import { ManuscriptMapPanel } from "./manuscript-map-panel";

class OutlinePanel extends ManuscriptMapPanel {
  view(): TemplateResult {
    return this.render();
  }

  review(pass: string): void {
    this.changePass(targetEvent({ value: pass }));
  }
}

function targetEvent(currentTarget: object): Event {
  return Object.defineProperty(new Event("change"), "currentTarget", { value: currentTarget });
}

function templates(value: unknown): TemplateResult[] {
  if (Array.isArray(value)) return value.flatMap(templates);
  if (!isTemplateResult(value, 1)) return [];
  return [value, ...value.values.flatMap(templates)];
}

function rows(view: TemplateResult, className: string): TemplateResult[] {
  return templates(view).filter((template) => template.strings.join("").includes(`class="${className}"`));
}

function binding(template: TemplateResult, marker: string): unknown {
  const index = template.strings.findIndex((part) => part.includes(marker));
  if (index < 0) throw new Error(`Missing rendered binding: ${marker}`);
  return template.values[index];
}

function invoke(handler: unknown, target: object): void {
  if (typeof handler !== "function") throw new Error("Missing rendered event handler");
  handler(targetEvent(target));
}

function setWholeDocument(panel: OutlinePanel, checked: boolean): void {
  const view = panel.view();
  const index = view.strings.findIndex((part) => part.includes("/> Whole document"));
  invoke(view.values[index - 1], { checked });
}

function toggle(panel: OutlinePanel, sectionIndex: number): void {
  const section = rows(panel.view(), "outline-heading-row")[sectionIndex]!;
  invoke(binding(section, "@click="), { dataset: { headingKey: binding(section, "data-heading-key=") } });
}

describe("outline presentation interactions", () => {
  it("keeps caret selection and the reading marker distinct at heading and paragraph boundaries", () => {
    const panel = new OutlinePanel();
    const source = "# First\n\nFirst paragraph.\n\n## Child\n\nChild paragraph.\n\n# Last\n\nLast paragraph.";
    panel.setSource(source);
    panel.setEditorPosition("", source.indexOf("First paragraph."), source.indexOf("Child paragraph.") + 0.5);
    let paragraphs = rows(panel.view(), "outline-paragraph");
    expect(paragraphs.map((row) => binding(row, "aria-pressed="))).toEqual(["true", "false", "false"]);
    expect(paragraphs.map((row) => binding(row, "aria-current="))).toEqual([nothing, "location", nothing]);
    expect(paragraphs.map((row) => binding(row, "data-range-from="))).toEqual([9, 37, 63]);
    expect(paragraphs.map((row) => binding(row, "data-range-to="))).toEqual([25, 53, 78]);
    expect(rows(panel.view(), "outline-heading-row").map((row) => binding(row, "aria-pressed="))).toEqual(["false", "false", "false"]);

    panel.setEditorPosition("", source.indexOf("# Last"), source.indexOf("# Last"));
    expect(rows(panel.view(), "outline-heading-row").map((row) => binding(row, "aria-pressed="))).toEqual(["false", "false", "true"]);
    paragraphs = rows(panel.view(), "outline-paragraph");
    expect(paragraphs.map((row) => binding(row, "aria-pressed="))).toEqual(["false", "false", "false"]);
    expect(paragraphs.map((row) => binding(row, "aria-current="))).toEqual([nothing, nothing, nothing]);
    expect(rows(panel.view(), "outline-heading-row").map((row) => binding(row, "data-range-to="))).toEqual([7, 35, 61]);
  });

  it("collapses nested passages, preserves collapse across prose edits, and expands again", () => {
    const panel = new OutlinePanel();
    panel.setSource("# Study\n\nOpening.\n\n## Detail\n\nNested.\n\n# End\n\nClosing.");
    expect(rows(panel.view(), "outline-paragraph")).toHaveLength(3);
    toggle(panel, 0);
    expect(rows(panel.view(), "outline-paragraph")).toHaveLength(1);
    expect(rows(panel.view(), "outline-heading-row")).toHaveLength(2);
    expect(binding(rows(panel.view(), "outline-heading-row")[0]!, "aria-expanded=")).toBe("false");
    panel.setSource("Preface.\n\n# Study\n\nAn edited opening.\n\n## Detail\n\nNested.\n\n# End\n\nClosing.");
    expect(rows(panel.view(), "outline-paragraph")).toHaveLength(2);
    toggle(panel, 0);
    expect(rows(panel.view(), "outline-paragraph")).toHaveLength(4);
    expect(binding(rows(panel.view(), "outline-heading-row")[0]!, "aria-expanded=")).toBe("true");
    panel.setSource("# Different\n\nNew passage.");
    expect(rows(panel.view(), "outline-paragraph")).toHaveLength(1);
  });

  it("gives duplicate headings independent expansion controls", () => {
    const panel = new OutlinePanel();
    panel.setSource("# Study\n\nFirst.\n\n# Study\n\nSecond.");
    const headings = rows(panel.view(), "outline-heading-row");
    expect(binding(headings[0]!, "data-heading-key=")).not.toBe(binding(headings[1]!, "data-heading-key="));
    toggle(panel, 1);
    expect(rows(panel.view(), "outline-paragraph")).toHaveLength(1);
    expect(binding(rows(panel.view(), "outline-paragraph")[0]!, "data-range-from=")).toBe(9);
    toggle(panel, 1);
    expect(rows(panel.view(), "outline-paragraph")).toHaveLength(2);
  });

  it("limits section hints to three, whole-document hints to twenty, and scopes paragraphs precisely", () => {
    const panel = new OutlinePanel();
    const paragraphs = Array.from({ length: 25 }, (_, index) => `This point ${index + 1} needs an explicit subject.`);
    const source = `# Study\n\n${paragraphs.join("\n\n")}`;
    panel.setSource(source);
    panel.review("clarity");
    panel.setEditorPosition("", 0);
    expect(rows(panel.view(), "manuscript-map-item")).toHaveLength(3);
    expect(binding(panel.view(), 'id="editing-pass-cue-count">')).toBe(25);
    setWholeDocument(panel, true);
    expect(rows(panel.view(), "manuscript-map-item")).toHaveLength(20);
    expect(binding(panel.view(), 'id="editing-pass-cue-count">')).toBe(25);
    setWholeDocument(panel, false);
    const start = source.indexOf("This point 12 ");
    panel.setEditorPosition("", start);
    const cues = rows(panel.view(), "manuscript-map-item");
    expect(cues).toHaveLength(1);
    expect(binding(cues[0]!, "data-range-from=")).toBe(start);
    expect(binding(cues[0]!, "data-range-to=")).toBe(start + paragraphs[11]!.length);
    expect(binding(panel.view(), 'id="editing-pass-cue-count">')).toBe(1);
    panel.setEditorPosition("", source.length + 1);
    expect(rows(panel.view(), "manuscript-map-item")).toHaveLength(0);
    expect(binding(panel.view(), 'id="editing-pass-cue-count">')).toBe(0);
  });
});
