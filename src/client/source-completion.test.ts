import { describe, expect, it, vi } from "vitest";
import { SourceCompletion, sourceCompletionActionEvent, type SourceCompletionAction } from "./source-completion";

class TestSourceCompletion extends SourceCompletion {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  emitForTest(action: SourceCompletionAction): void {
    this.emitAction(action);
  }
}

describe("source completion", () => {
  it("owns empty and action-labelled option presentation", () => {
    const completion = new TestSourceCompletion();
    expect(completion.rootForTest()).toBe(completion);
    expect(completion.renderForTest()).toBeDefined();
    const source = { setAttribute: vi.fn(), removeAttribute: vi.fn() } as unknown as HTMLTextAreaElement;
    completion.show(
      [
        { value: "paper2026", metadata: "Paper" },
        { value: "library2026", metadata: "Library paper", action: "Add and cite" },
      ],
      source,
    );
    expect(completion.renderForTest()).toBeDefined();
    expect(source.setAttribute).toHaveBeenCalledWith("aria-expanded", "true");
    completion.hide();
    expect(source.removeAttribute).toHaveBeenCalledWith("aria-activedescendant");
  });

  it("emits acceptance and dismissal intents", () => {
    const completion = new TestSourceCompletion();
    const actions: SourceCompletionAction[] = [];
    completion.addEventListener(sourceCompletionActionEvent, (event) => {
      actions.push((event as CustomEvent<SourceCompletionAction>).detail);
    });
    completion.emitForTest({ action: "accept", index: 1 });
    completion.emitForTest({ action: "dismiss" });
    expect(actions).toEqual([{ action: "accept", index: 1 }, { action: "dismiss" }]);
  });

  it("owns keyboard selection and acceptance", () => {
    const completion = new TestSourceCompletion();
    const source = { setAttribute: vi.fn(), removeAttribute: vi.fn() } as unknown as HTMLTextAreaElement;
    const actions: SourceCompletionAction[] = [];
    completion.addEventListener(sourceCompletionActionEvent, (event) => {
      actions.push((event as CustomEvent<SourceCompletionAction>).detail);
    });
    completion.show(
      [
        { value: "first", metadata: "First" },
        { value: "second", metadata: "Second" },
      ],
      source,
    );
    const key = (value: string, isComposing = false) => ({ key: value, isComposing, preventDefault: vi.fn() }) as unknown as KeyboardEvent;
    expect(completion.handleKey(key("ArrowDown"))).toBe(true);
    expect(completion.handleKey(key("Enter"))).toBe(true);
    expect(completion.handleKey(key("Escape"))).toBe(true);
    expect(completion.handleKey(key("x"))).toBe(false);
    expect(completion.handleKey(key("Enter", true))).toBe(false);
    expect(actions).toEqual([{ action: "accept", index: 1 }, { action: "dismiss" }]);
  });
});
