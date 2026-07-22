import { describe, expect, it } from "vitest";
import { editorPresenceSegments } from "./editor-presence";

describe("editor collaborator presence", () => {
  it("preserves Markdown text while marking selections and carets", () => {
    const source = "## Shared evidence\n\nA claim.";
    const segments = editorPresenceSegments(source, [
      { collaboratorId: "writer-one", start: 3, end: 9 },
      { collaboratorId: "writer-two", start: 22, end: 22 },
    ]);

    expect(segments.map(({ text }) => text).join("")).toBe(source);
    expect(
      segments
        .filter(({ selectionColor }) => selectionColor !== null)
        .map(({ text }) => text)
        .join(""),
    ).toBe("Shared");
    expect(segments.find(({ caretColors }) => caretColors.length > 0)).toMatchObject({ text: "claim." });
  });

  it("supports empty documents, end carets, overlapping selections, and bounded stale offsets", () => {
    expect(editorPresenceSegments("", [{ collaboratorId: "empty", start: 0, end: 0 }])[0]?.caretColors).toHaveLength(1);

    const source = "Text";
    const segments = editorPresenceSegments(source, [
      { collaboratorId: "first", start: 0, end: 4 },
      { collaboratorId: "second", start: 2, end: 4 },
      { collaboratorId: "last", start: 99, end: 99 },
    ]);

    expect(segments.map(({ text }) => text).join("")).toBe(source);
    expect(segments.at(-1)).toMatchObject({ text: "" });
    expect(segments.at(-1)?.caretColors).toHaveLength(1);
  });

  it("marks a remembered local target independently from collaborators", () => {
    const segments = editorPresenceSegments("Local target", [
      { collaboratorId: "local-author", start: 0, end: 5, local: true },
      { collaboratorId: "remote-author", start: 12, end: 12 },
    ]);

    expect(segments.find(({ text }) => text === "Local")?.selectionColor).toBe("local");
    expect(segments.at(-1)?.caretColors).not.toContain("local");
  });

  it("aligns presence with Markdown boundaries and stable collaborator colors", () => {
    expect(
      editorPresenceSegments("## Head\nBody", [
        { collaboratorId: "writer-two", start: 1, end: 10 },
        { collaboratorId: "presence", start: 8, end: 8 },
      ]),
    ).toEqual([
      { text: "#", kind: "heading-marker", selectionColor: null, caretColors: [] },
      { text: "#", kind: "heading-marker", selectionColor: 2, caretColors: [] },
      { text: " Head", kind: "heading", selectionColor: 2, caretColors: [] },
      { text: "\n", kind: null, selectionColor: 2, caretColors: [] },
      { text: "Bo", kind: null, selectionColor: 2, caretColors: [3] },
      { text: "dy", kind: null, selectionColor: null, caretColors: [] },
    ]);
  });

  it("emits an empty anchor only for an empty document or end caret", () => {
    expect(editorPresenceSegments("Plain", [])).toEqual([{ text: "Plain", kind: null, selectionColor: null, caretColors: [] }]);
    expect(editorPresenceSegments("", [])).toEqual([{ text: "", kind: null, selectionColor: null, caretColors: [] }]);
  });
});
