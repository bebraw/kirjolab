import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManuscriptAnchorSelector, ManuscriptComment } from "../domain/workspace";
import {
  ManuscriptCommentList,
  manuscriptCommentActionEvent,
  manuscriptCommentCreateEvent,
  type ManuscriptCommentAction,
} from "./manuscript-comment-list";

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

afterEach(() => vi.restoreAllMocks());

describe("manuscript comment list", () => {
  it("renders empty, open, stale, and resolved states", () => {
    const list = new TestManuscriptCommentList();
    expect(list.renderForTest()).toBeDefined();
    list.setComments([
      comment,
      { ...comment, id: "comment:2", resolution: { status: "stale" } },
      { ...comment, id: "comment:3", status: "resolved" },
    ]);
    expect(list.renderForTest()).toBeDefined();
    expect(list.rootForTest()).toBe(list);
  });

  it("emits editor-dependent open and reanchor intents", () => {
    const list = new TestManuscriptCommentList();
    const actions: ManuscriptCommentAction[] = [];
    list.addEventListener(manuscriptCommentActionEvent, (event) => actions.push((event as CustomEvent<ManuscriptCommentAction>).detail));
    list.setComments([comment]);
    list.actForTest();
    list.actForTest("missing", "missing");
    list.actForTest("open");
    list.actForTest("reanchor");
    expect(actions).toEqual([
      { action: "open", anchor },
      { action: "reanchor", commentId: comment.id },
    ]);
  });

  it("owns resolution persistence and emits the completed outcome", async () => {
    const list = new TestManuscriptCommentList();
    const actions: ManuscriptCommentAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    list.configure("/api/workspaces/workspace");
    list.addEventListener(manuscriptCommentActionEvent, (event) => actions.push((event as CustomEvent<ManuscriptCommentAction>).detail));

    await list.resolveForTest("comment/1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/workspace/comments/comment%2F1/resolve",
      expect.objectContaining({ method: "POST" }),
    );
    expect(actions).toEqual([{ action: "resolved", message: "Comment resolved; its revision history is preserved." }]);
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

  it("emits the current comment and resets after save", () => {
    const list = new TestManuscriptCommentList();
    const comments: string[] = [];
    list.addEventListener(manuscriptCommentCreateEvent, (event) => {
      comments.push((event as CustomEvent<string>).detail);
    });
    list.changeForTest("Check this claim");
    list.createForTest();
    expect(comments).toEqual(["Check this claim"]);
    list.markSaved();
    list.createForTest();
    expect(comments).toEqual(["Check this claim", ""]);
    expect(list.renderForTest()).toBeDefined();
  });
});
