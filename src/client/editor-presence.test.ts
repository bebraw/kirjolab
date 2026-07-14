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
});
