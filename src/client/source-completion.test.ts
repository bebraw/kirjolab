import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SourceCompletion,
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

function setProject(completion: SourceCompletion, inputs: SourceCompletionInputs): void {
  completion.setProject(inputs, inputs.activeFileId, inputs.workspace);
}

class TestSourceCompletion extends SourceCompletion {
  positions: number[] = [];

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  protected override position(_source: HTMLTextAreaElement, start: number): void {
    this.positions.push(start);
  }
}

afterEach(() => vi.unstubAllGlobals());

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

  it("owns keyboard selection and acceptance", () => {
    const completion = new TestSourceCompletion();
    const source = { setAttribute: vi.fn(), removeAttribute: vi.fn() } as unknown as HTMLTextAreaElement;
    const intents: SourceCompletionIntent[] = [];
    completion.bindAcceptance((intent) => intents.push(intent));
    completion.show([option("first", "First"), option("second", "Second")], source);
    const key = (value: string, isComposing = false) => ({ key: value, isComposing, preventDefault: vi.fn() }) as unknown as KeyboardEvent;
    expect(completion.handleKey(key("ArrowDown"))).toBe(true);
    expect(completion.handleKey(key("Enter"))).toBe(true);
    expect(completion.hidden).toBe(true);
    expect(completion.handleKey(key("Escape"))).toBe(false);
    expect(completion.handleKey(key("x"))).toBe(false);
    expect(completion.handleKey(key("Enter", true))).toBe(false);
    expect(intents).toEqual([includeIntent]);
  });

  it("owns project include and Library citation acceptance", async () => {
    const completion = new TestSourceCompletion();
    const source = { setAttribute: vi.fn(), removeAttribute: vi.fn() } as unknown as HTMLTextAreaElement;
    const acceptMutation = vi.fn().mockResolvedValue(undefined);
    const preserveRange = vi.fn(() => () => ({ start: 12, end: 15 }));
    const presentNotice = vi.fn();
    const replaceRange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    completion.bindProjectAcceptance("/api/workspaces/workspace", {
      editorInsertMenu: { replaceRange },
      editorStatus: { preserveRange },
      projectFileDialog: { acceptProjectMutation: acceptMutation },
      toast: { show: presentNotice },
    });

    completion.show([option("chapter", "Chapter")], source);
    completion.handleKey({ key: "Enter", isComposing: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(replaceRange).toHaveBeenCalledWith(10, 14, "chapters/method.md");

    completion.show(
      [
        {
          value: "doe2026",
          metadata: "Library paper",
          intent: {
            kind: "citation",
            context: { query: "doe", start: 6, end: 9 },
            candidate: {
              authors: ["Doe"],
              key: "doe2026",
              referenceId: "reference-1",
              scope: "library",
              title: "Result",
              year: "2026",
            },
          },
        },
      ],
      source,
    );
    completion.handleKey({ key: "Enter", isComposing: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);

    await vi.waitFor(() => expect(acceptMutation).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/workspace/references", {
      body: JSON.stringify({ referenceId: "reference-1", citationAlias: "doe2026" }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(preserveRange).toHaveBeenCalledWith(6, 9);
    expect(replaceRange).toHaveBeenLastCalledWith(12, 15, "doe2026");
    expect(presentNotice).toHaveBeenCalledWith("Added and cited doe2026.");
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
      activeFileId: "file-1",
      files: [
        { id: "file-1", path: "manuscript.md" },
        { id: "file-2", path: "chapters/method.md" },
      ],
      projectReferences: [],
      workspace: true,
    } satisfies SourceCompletionInputs;

    setProject(completion, inputs);
    expect(completion.positions).toEqual([10]);

    source.value = ":cite[doe";
    source.selectionEnd = 9;
    Reflect.set(completion, "scopeSelect", { value: "library" });
    Reflect.set(completion, "libraryReferences", [
      {
        archivedAt: null,
        authors: ["Doe"],
        deletedAt: null,
        id: "reference-1",
        referenceKey: "doe2026",
        title: "Result",
        year: "2026",
      },
    ]);
    setProject(completion, inputs);
    expect(completion.positions).toEqual([10, 6]);

    vi.stubGlobal("document", { activeElement: null });
    setProject(completion, inputs);
    expect(source.removeAttribute).toHaveBeenCalledWith("aria-activedescendant");
    vi.stubGlobal("document", { activeElement: source });
    setProject(completion, { ...inputs, workspace: false });
    source.value = "Plain manuscript text";
    source.selectionEnd = source.value.length;
    setProject(completion, inputs);
    vi.unstubAllGlobals();
  });

  it("loads and validates Library citations for its local scope", async () => {
    const completion = new TestSourceCompletion();
    const source = {
      value: ":cite[doe",
      selectionEnd: 9,
      removeAttribute: vi.fn(),
      setAttribute: vi.fn(),
    };
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        artifacts: [],
        collections: {},
        highlights: [],
        notes: [],
        reading: [],
        referenceKeyStates: {},
        references: [],
        tags: {},
        webSnapshots: [],
        webSources: [],
      }),
    );
    Reflect.set(completion, "source", source);
    Reflect.set(completion, "scopeSelect", { value: "library" });
    vi.stubGlobal("document", { activeElement: source });
    vi.stubGlobal("fetch", fetchMock);

    setProject(completion, { activeFileId: null, files: [], projectReferences: [], workspace: true });

    await vi.waitFor(() => expect(Reflect.get(completion, "libraryReferences")).toEqual([]));
    setProject(completion, { activeFileId: null, files: [], projectReferences: [], workspace: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/library", { credentials: "same-origin" });
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
      selectionEnd: 14,
      setAttribute: vi.fn(),
      value: "::include[chap",
    }) as unknown as HTMLTextAreaElement;
    const scope = Object.assign(new EventTarget(), { value: "project" }) as unknown as HTMLSelectElement;
    const intents: SourceCompletionIntent[] = [];
    completion.bindAcceptance((intent) => intents.push(intent));

    completion.bindEditor(source, scope);
    vi.stubGlobal("document", { activeElement: source });
    completion.setProject(
      {
        files: [
          { id: "file-1", path: "manuscript.md" },
          { id: "file-2", path: "chapters/method.md" },
        ],
        projectReferences: [],
      },
      "file-1",
      true,
    );
    source.dispatchEvent(new Event("input"));
    expect(completion.scope).toBe("library");
    expect(scope.value).toBe("library");
    expect(completion.positions).toEqual([10, 10]);
    completion.show([option("paper", "Paper")], source);
    const enter = Object.assign(new Event("keydown", { cancelable: true }), { isComposing: false, key: "Enter" });
    source.dispatchEvent(enter);
    scope.value = "project";
    scope.dispatchEvent(new Event("change"));
    source.dispatchEvent(new Event("blur"));
    vi.runAllTimers();

    expect(localStorage.setItem).toHaveBeenCalledWith("kirjolab:citation-completion-scope", "project");
    expect(intents).toEqual([includeIntent]);
    expect(completion.hidden).toBe(true);
    vi.useRealTimers();
  });
});
