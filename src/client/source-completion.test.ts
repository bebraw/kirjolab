import { describe, expect, it, vi } from "vitest";
import {
  SourceCompletion,
  sourceCompletionActionEvent,
  type SourceCompletionAction,
  type SourceCompletionInputs,
  type SourceCompletionIntent,
  type SourceCompletionOption,
} from "./source-completion";

const includeIntent: SourceCompletionIntent = {
  kind: "include",
  context: { query: "chap", start: 10, end: 14 },
  candidate: { reference: "chapters/method.md", path: "chapters/method.md" },
};

function option(value: string, metadata: string, action?: string): SourceCompletionOption {
  return { value, metadata, intent: includeIntent, ...(action ? { action } : {}) };
}

class TestSourceCompletion extends SourceCompletion {
  positions: number[] = [];

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  emitForTest(action: SourceCompletionAction): void {
    this.emitAction(action);
  }

  protected override position(_source: HTMLTextAreaElement, start: number): void {
    this.positions.push(start);
  }
}

describe("source completion", () => {
  it("owns empty and action-labelled option presentation", () => {
    const completion = new TestSourceCompletion();
    expect(completion.rootForTest()).toBe(completion);
    expect(completion.renderForTest()).toBeDefined();
    const source = { setAttribute: vi.fn(), removeAttribute: vi.fn() } as unknown as HTMLTextAreaElement;
    completion.show([option("paper2026", "Paper"), option("library2026", "Library paper", "Add and cite")], source);
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
    completion.emitForTest({ action: "accept", intent: includeIntent });
    completion.emitForTest({ action: "dismiss" });
    expect(actions).toEqual([{ action: "accept", intent: includeIntent }, { action: "dismiss" }]);
  });

  it("owns keyboard selection and acceptance", () => {
    const completion = new TestSourceCompletion();
    const source = { setAttribute: vi.fn(), removeAttribute: vi.fn() } as unknown as HTMLTextAreaElement;
    const actions: SourceCompletionAction[] = [];
    completion.addEventListener(sourceCompletionActionEvent, (event) => {
      actions.push((event as CustomEvent<SourceCompletionAction>).detail);
    });
    completion.show([option("first", "First"), option("second", "Second")], source);
    const key = (value: string, isComposing = false) => ({ key: value, isComposing, preventDefault: vi.fn() }) as unknown as KeyboardEvent;
    expect(completion.handleKey(key("ArrowDown"))).toBe(true);
    expect(completion.handleKey(key("Enter"))).toBe(true);
    expect(completion.handleKey(key("Escape"))).toBe(true);
    expect(completion.handleKey(key("x"))).toBe(false);
    expect(completion.handleKey(key("Enter", true))).toBe(false);
    expect(actions).toEqual([{ action: "accept", intent: includeIntent }, { action: "dismiss" }]);
  });

  it("ranks and presents include and citation candidates beside their token", () => {
    const completion = new TestSourceCompletion();
    const source = { setAttribute: vi.fn(), removeAttribute: vi.fn() } as unknown as HTMLTextAreaElement;

    completion.showIncludes(
      [
        { path: "notes/method.md", reference: "notes/method.md" },
        { path: "results.md", reference: "results.md" },
      ],
      { end: 9, query: "meth", start: 5 },
      source,
    );
    expect(completion.renderForTest()).toBeDefined();
    completion.showCitations(
      [{ authors: ["Doe"], key: "doe2026", referenceId: "reference:1", scope: "library", title: "Result", year: "2026" }],
      { end: 12, query: "doe", start: 9 },
      source,
    );
    expect(completion.renderForTest()).toBeDefined();
    expect(completion.positions).toEqual([5, 9]);

    completion.showIncludes([], { end: 3, query: "missing", start: 0 }, source);
    expect(source.removeAttribute).toHaveBeenCalledWith("aria-activedescendant");
  });

  it("owns editor context detection for include and citation presentation", () => {
    const completion = new TestSourceCompletion();
    const source = {
      value: "::include[chap",
      selectionEnd: 14,
      removeAttribute: vi.fn(),
      setAttribute: vi.fn(),
    };
    Reflect.set(completion, "source", source);
    vi.stubGlobal("document", { activeElement: source });
    const inputs = {
      citations: [{ authors: ["Doe"], key: "doe2026", referenceId: "reference-1", scope: "library", title: "Result", year: "2026" }],
      includes: [{ path: "chapters/method.md", reference: "chapters/method.md" }],
      workspace: true,
    } satisfies SourceCompletionInputs;

    expect(completion.refresh(inputs)).toBe(false);
    expect(completion.positions).toEqual([10]);

    source.value = ":cite[doe";
    source.selectionEnd = 9;
    Reflect.set(completion, "scopeSelect", { value: "library" });
    expect(completion.refresh(inputs)).toBe(true);
    expect(completion.positions).toEqual([10, 6]);

    vi.stubGlobal("document", { activeElement: null });
    expect(completion.refresh(inputs)).toBe(false);
    expect(source.removeAttribute).toHaveBeenCalledWith("aria-activedescendant");
    vi.stubGlobal("document", { activeElement: source });
    expect(completion.refresh({ ...inputs, workspace: false })).toBe(false);
    source.value = "Plain manuscript text";
    source.selectionEnd = source.value.length;
    expect(completion.refresh(inputs)).toBe(false);
    vi.unstubAllGlobals();
  });

  it("binds editor interaction and persisted citation scope", () => {
    vi.useFakeTimers();
    const storage = new Map([["kirjolab:citation-completion-scope", "library"]]);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    });
    vi.stubGlobal("window", { clearTimeout, setTimeout });
    const completion = new TestSourceCompletion();
    const source = Object.assign(new EventTarget(), {
      removeAttribute: vi.fn(),
      setAttribute: vi.fn(),
    }) as unknown as HTMLTextAreaElement;
    const scope = Object.assign(new EventTarget(), { value: "project" }) as unknown as HTMLSelectElement;
    const actions: SourceCompletionAction[] = [];
    completion.addEventListener(sourceCompletionActionEvent, (event) => {
      actions.push((event as CustomEvent<SourceCompletionAction>).detail);
    });

    completion.bindEditor(source, scope);
    expect(completion.scope).toBe("library");
    expect(scope.value).toBe("library");
    completion.show([option("paper", "Paper")], source);
    const enter = Object.assign(new Event("keydown", { cancelable: true }), { isComposing: false, key: "Enter" });
    source.dispatchEvent(enter);
    scope.value = "project";
    scope.dispatchEvent(new Event("change"));
    source.dispatchEvent(new Event("blur"));
    vi.runAllTimers();

    expect(localStorage.setItem).toHaveBeenCalledWith("kirjolab:citation-completion-scope", "project");
    expect(actions).toEqual([
      { action: "accept", intent: includeIntent },
      { action: "scope-change", scope: "project" },
      { action: "dismiss" },
    ]);
    vi.useRealTimers();
  });
});
