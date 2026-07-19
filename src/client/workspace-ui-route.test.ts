import { describe, expect, it } from "vitest";
import { readWorkspaceUiRoute, researchTargetFromContextKey, workspaceUiRouteUrl } from "./workspace-ui-route";

describe("workspace UI routes", () => {
  it("uses the stable workspace defaults for an empty query", () => {
    expect(readWorkspaceUiRoute(new URL("https://example.test/editor/demo"))).toEqual({
      rail: "files",
      mode: "write",
      surface: "authoring",
      contextKey: "preview",
    });
  });

  it("reads bounded reconstructible selections", () => {
    const state = readWorkspaceUiRoute(
      new URL(
        "https://example.test/editor/demo?file=file-2&rail=research&mode=map&surface=context&layout=pdf&context=pdf%3Apdf-1&page=7&annotation=note-1",
      ),
    );
    expect(state).toEqual({
      fileId: "file-2",
      rail: "research",
      mode: "map",
      surface: "context",
      layout: "pdf",
      contextKey: "pdf:pdf-1",
      page: 7,
      annotationId: "note-1",
    });
    expect(researchTargetFromContextKey(state.contextKey)).toEqual({ kind: "pdf", id: "pdf-1" });
  });

  it("rejects invalid values and PDF location on non-PDF tabs", () => {
    expect(
      readWorkspaceUiRoute(
        new URL("https://example.test/editor/demo?rail=nope&mode=nope&context=publication%3Apub-1&page=4&annotation=note-1"),
      ),
    ).toEqual({ rail: "files", mode: "write", surface: "authoring", contextKey: "publication:pub-1" });
  });

  it.each(["preview", "library", "assistant"] as const)("accepts the permanent %s context", (context) => {
    expect(readWorkspaceUiRoute(new URL(`https://example.test/editor/demo?context=${context}`)).contextKey).toBe(context);
    expect(researchTargetFromContextKey(context)).toBeNull();
  });

  it.each([
    ["publication:publication-1", { kind: "publication", id: "publication-1" }],
    ["pdf:pdf-1", { kind: "pdf", id: "pdf-1" }],
    ["library-pdf:artifact-1", { kind: "library-pdf", id: "artifact-1" }],
    ["candidate:candidate-1", { kind: "candidate", id: "candidate-1" }],
  ] as const)("parses the resource context %s", (context, target) => {
    const state = readWorkspaceUiRoute(new URL(`https://example.test/editor/demo?context=${encodeURIComponent(context)}`));
    expect(state.contextKey).toBe(context);
    expect(researchTargetFromContextKey(state.contextKey)).toEqual(target);
  });

  it.each([
    "file=",
    `file=${"f".repeat(129)}`,
    "file=file%0Aid",
    "context=unknown%3Aresource-1",
    "context=pdf%3A",
    `context=pdf%3A${"p".repeat(129)}`,
  ])("drops the invalid bounded identity in %s", (query) => {
    const state = readWorkspaceUiRoute(new URL(`https://example.test/editor/demo?${query}`));
    expect(state.fileId).toBeUndefined();
    expect(state.contextKey).toBe("preview");
  });

  it.each(["0", "-1", "1.5", "1000000", "words"])("rejects invalid PDF page %s", (page) => {
    const state = readWorkspaceUiRoute(new URL(`https://example.test/editor/demo?context=pdf%3Apdf-1&page=${page}`));
    expect(state.page).toBeUndefined();
  });

  it("accepts the bounded maximum PDF page", () => {
    expect(readWorkspaceUiRoute(new URL("https://example.test/editor/demo?context=pdf%3Apdf-1&page=999999")).page).toBe(999999);
  });

  it("keeps annotation focus exclusive to workspace PDFs", () => {
    expect(
      readWorkspaceUiRoute(new URL("https://example.test/editor/demo?context=library-pdf%3Aartifact-1&annotation=note-1")),
    ).not.toHaveProperty("annotationId");
    expect(readWorkspaceUiRoute(new URL("https://example.test/editor/demo?context=pdf%3Apdf-1&annotation=note%7F1"))).not.toHaveProperty(
      "annotationId",
    );
  });

  it("omits defaults and preserves parameters owned by other features", () => {
    const url = workspaceUiRouteUrl(new URL("https://example.test/editor/demo?keep=yes&rail=comments"), {
      rail: "files",
      mode: "write",
      surface: "context",
      layout: "split",
      contextKey: "library-pdf:artifact-1",
      page: 2,
    });
    expect(url).toBe("/editor/demo?keep=yes&surface=context&context=library-pdf%3Aartifact-1&page=2");
  });

  it("writes every non-default selection and keeps the URL fragment", () => {
    expect(
      workspaceUiRouteUrl(new URL("https://example.test/editor/demo#section"), {
        fileId: "file-2",
        rail: "comments",
        mode: "map",
        surface: "context",
        layout: "editor",
        contextKey: "pdf:pdf-2",
        page: 1,
        annotationId: "annotation-2",
      }),
    ).toBe(
      "/editor/demo?file=file-2&rail=comments&mode=map&surface=context&layout=editor&context=pdf%3Apdf-2&annotation=annotation-2#section",
    );
  });

  it("round trips the writing guide rail", () => {
    const state = readWorkspaceUiRoute(new URL("https://example.test/editor/demo?rail=guide"));
    expect(state.rail).toBe("guide");
    expect(workspaceUiRouteUrl(new URL("https://example.test/editor/demo"), state)).toBe("/editor/demo?rail=guide");
  });

  it("does not serialize PDF-only location fields for other resource kinds", () => {
    expect(
      workspaceUiRouteUrl(new URL("https://example.test/editor/demo?page=9&annotation=old"), {
        rail: "files",
        mode: "write",
        surface: "authoring",
        contextKey: "candidate:candidate-1",
        page: 9,
        annotationId: "annotation-1",
      }),
    ).toBe("/editor/demo?context=candidate%3Acandidate-1");
  });
});
