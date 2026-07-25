import { describe, expect, it } from "vitest";
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
}

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

  it("emits open, reanchor, and resolve intents", () => {
    const list = new TestManuscriptCommentList();
    const actions: ManuscriptCommentAction[] = [];
    list.addEventListener(manuscriptCommentActionEvent, (event) => actions.push((event as CustomEvent<ManuscriptCommentAction>).detail));
    list.setComments([comment]);
    list.actForTest();
    list.actForTest("missing", "missing");
    list.actForTest("open");
    list.actForTest("reanchor");
    list.actForTest("resolve");
    expect(actions).toEqual([
      { action: "open", anchor },
      { action: "reanchor", commentId: comment.id },
      { action: "resolve", commentId: comment.id },
    ]);
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
