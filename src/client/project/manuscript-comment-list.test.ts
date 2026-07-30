import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManuscriptAnchorSelector, ManuscriptComment } from "../../domain/workspace/workspace";
import { ManuscriptCommentList, type ManuscriptCommentAuthoring } from "./manuscript-comment-list";

const anchor: ManuscriptAnchorSelector = {
  anchoredRevision: 1,
  exact: "Selected passage",
  fileId: "main",
  originalRange: { end: 16, start: 0 },
  prefix: "",
  relativeEnd: "AQ",
  relativeStart: "AA",
  suffix: "",
  version: 1,
};
const comment: ManuscriptComment = {
  anchor,
  authorId: "member:1",
  authorLabel: "Ada",
  body: "Clarify this point.",
  createdAt: "2026-07-25T00:00:00.000Z",
  id: "comment:1",
  resolution: { end: 16, exactMatch: true, start: 0, status: "resolved", text: anchor.exact },
  status: "open",
  updatedAt: "2026-07-25T00:00:00.000Z",
};

class TestManuscriptCommentList extends ManuscriptCommentList {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  actForTest(action?: string, commentId = comment.id): void {
    const event = new Event("click");
    Object.defineProperty(event, "currentTarget", { value: { dataset: { commentAction: action, commentId } } });
    this.act(event);
  }

  changeForTest(body: string): void {
    const event = new Event("input");
    Object.defineProperty(event, "currentTarget", { value: { value: body } });
    this.changeBody(event);
  }

  createForTest(): void {
    this.create(new Event("submit"));
  }

  resolveForTest(commentId = comment.id): Promise<void> {
    return this.resolve(commentId);
  }
}

type RecordedAction =
  | { readonly action: "mutated"; readonly message: string }
  | { readonly action: "notice"; readonly message: string }
  | { readonly action: "open"; readonly anchor: ManuscriptAnchorSelector };

function bind(
  list: ManuscriptCommentList,
  authoring: () => ManuscriptCommentAuthoring = () => ({ passage: null, sourceRevision: 0, stable: true }),
): RecordedAction[] {
  const actions: RecordedAction[] = [];
  list.bind({
    authoring,
    completeMutation: (message) => actions.push({ action: "mutated", message }),
    notice: (message) => actions.push({ action: "notice", message }),
    openPassage: (anchor) => actions.push({ action: "open", anchor }),
  });
  return actions;
}

afterEach(() => vi.restoreAllMocks());

describe("manuscript comment list", () => {
  it("renders empty, open, stale, and resolved states", () => {
    const list = new TestManuscriptCommentList();
    expect(list.renderForTest()).toBeDefined();
    expect(
      list.setComments([
        comment,
        { ...comment, id: "comment:2", resolution: { status: "stale" } },
        { ...comment, id: "comment:3", status: "resolved" },
      ]),
    ).toBe(2);
    expect(list.renderForTest()).toBeDefined();
    expect(list.rootForTest()).toBe(list);
  });

  it("emits editor-dependent open intents", () => {
    const list = new TestManuscriptCommentList();
    const actions = bind(list);
    list.setComments([comment]);
    list.actForTest();
    list.actForTest("missing", "missing");
    list.actForTest("open");
    expect(actions).toEqual([{ action: "open", anchor }]);
  });

  it("owns resolution persistence and emits the completed outcome", async () => {
    const list = new TestManuscriptCommentList();
    const actions = bind(list);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    list.configure("/api/workspaces/workspace");

    await list.resolveForTest("comment/1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/workspace/comments/comment%2F1/resolve",
      expect.objectContaining({ method: "POST" }),
    );
    expect(actions).toEqual([{ action: "mutated", message: "Comment resolved; its revision history is preserved." }]);
  });

  it("reports resolution failures and permits retry", async () => {
    const list = new TestManuscriptCommentList();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    list.configure("/api/workspaces/workspace");

    await list.resolveForTest();
    expect(list.renderForTest()).toBeDefined();
    await list.resolveForTest();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores duplicate resolutions while one is pending", async () => {
    const list = new TestManuscriptCommentList();
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pendingResponse);
    list.configure("/api/workspaces/workspace");

    const first = list.resolveForTest();
    await list.resolveForTest();
    respond(new Response(null, { status: 200 }));
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates and re-anchors through the bound authoring passage", async () => {
    const list = new TestManuscriptCommentList();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const passage = { fileId: "main", start: 0, end: 16, excerpt: "Selected passage" };
    list.configure("/api/workspaces/workspace");
    bind(list, () => ({ passage, sourceRevision: 4, stable: true }));
    list.setComments([{ ...comment, resolution: { status: "stale" } }]);
    list.changeForTest("Check this claim");
    list.createForTest();
    list.actForTest("reanchor");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const versionedPassage = { ...passage, sourceRevision: 4 };
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/workspaces/workspace/comments",
      expect.objectContaining({ body: JSON.stringify({ ...versionedPassage, body: "Check this claim" }), method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/workspaces/workspace/comments/comment%3A1/reanchor",
      expect.objectContaining({ body: JSON.stringify(versionedPassage), method: "POST" }),
    );
    expect(list.renderForTest()).toBeDefined();
  });

  it("reports missing selections without persisting", () => {
    const list = new TestManuscriptCommentList();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const actions = bind(list);
    list.setComments([{ ...comment, resolution: { status: "stale" } }]);

    list.createForTest();
    list.actForTest("reanchor");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(actions).toEqual([
      { action: "notice", message: "Select manuscript text before adding a comment." },
      { action: "notice", message: "Select the revised manuscript passage before re-anchoring the comment." },
    ]);
  });

  it("reports unstable authoring without reading the passage", () => {
    const list = new TestManuscriptCommentList();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const actions = bind(list, () => ({
      passage: { fileId: "main", start: 0, end: 16, excerpt: "Selected passage" },
      sourceRevision: 4,
      stable: false,
    }));
    list.setComments([{ ...comment, resolution: { status: "stale" } }]);

    list.createForTest();
    list.actForTest("reanchor");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(actions).toEqual([
      { action: "notice", message: "Wait for the manuscript to finish synchronizing before commenting." },
      { action: "notice", message: "Wait for the manuscript to finish synchronizing before re-anchoring." },
    ]);
  });

  it("owns create and re-anchor persistence and emits completed outcomes", async () => {
    const list = new TestManuscriptCommentList();
    const actions = bind(list);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    list.configure("/api/workspaces/workspace");
    list.changeForTest("Check this claim");
    const passage = { fileId: "main", start: 0, end: 16, excerpt: "Selected passage", sourceRevision: 4 };

    await list.createAt({ ...passage, body: "Check this claim" });
    await list.reanchorAt("comment/1", passage);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/workspaces/workspace/comments",
      expect.objectContaining({ body: JSON.stringify({ ...passage, body: "Check this claim" }), method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/workspaces/workspace/comments/comment%2F1/reanchor",
      expect.objectContaining({ body: JSON.stringify(passage), method: "POST" }),
    );
    expect(actions).toEqual([
      { action: "mutated", message: "Comment anchored to the selected passage." },
      { action: "mutated", message: "Comment linked to the selected passage; earlier anchors remain in project history." },
    ]);
  });

  it("keeps failed comment creation local and retryable", async () => {
    const list = new TestManuscriptCommentList();
    const actions = bind(list);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ error: "Denied" }, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    list.configure("/api/workspaces/workspace");
    const input = { fileId: "main", start: 0, end: 16, excerpt: "Selected passage", sourceRevision: 4, body: "Check this claim" };

    await list.createAt(input);
    expect(list.renderForTest()).toBeDefined();
    await list.createAt(input);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(actions).toEqual([{ action: "mutated", message: "Comment anchored to the selected passage." }]);
  });
});
