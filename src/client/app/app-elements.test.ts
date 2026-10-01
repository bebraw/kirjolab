import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exampleRoutes } from "../../app-routes";
import { renderHomePage } from "../../views/home";
import { collectAppElements, requiredAppElement } from "./app-elements";

describe("application element registry", () => {
  beforeEach(() => {
    class NativeElement {}
    vi.stubGlobal("HTMLElement", NativeElement);
    vi.stubGlobal("HTMLButtonElement", class extends NativeElement {});
    vi.stubGlobal("HTMLInputElement", class extends NativeElement {});
    vi.stubGlobal("HTMLSelectElement", class extends NativeElement {});
    vi.stubGlobal("HTMLTextAreaElement", class extends NativeElement {});
  });

  afterEach(() => vi.unstubAllGlobals());

  it("collects every required interface element through one typed boundary", () => {
    const ids: string[] = [];
    const elements = collectAppElements(<T extends Element>(id: string, type: { new (): T }): T => {
      ids.push(id);
      return Object.create(type.prototype) as T;
    });

    expect(ids).toHaveLength(72);
    expect(new Set(ids)).toHaveLength(ids.length);
    expect(elements.contextResourcePresenter).toBeDefined();
    expect(elements.chapterNotesPanel).toBeDefined();
    expect(elements.assistantGenerationPresenter).toBeDefined();
    expect(elements.referenceLibraryWorkspace).toBeDefined();
    expect(elements.source).toBeDefined();
    expect(elements.editorIndentationControl).toBeDefined();
    expect(elements.toast).toBeDefined();
    expect(elements.themePreference).toBeDefined();
  });

  it("rejects a missing or incorrectly typed element", () => {
    vi.stubGlobal("document", { getElementById: vi.fn(() => null) });

    expect(() => requiredAppElement("source-editor", HTMLTextAreaElement)).toThrow("Missing interface element: source-editor");
  });
  it("finds the correct native or registered component type for every element in the server-rendered editor", () => {
    const markup = renderHomePage(exampleRoutes);
    const tagsById = new Map(
      [...markup.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*\sid="([^"]+)"[^>]*>/gu)].map((match) => [match[2]!, match[1]!]),
    );
    const nativeTypes = new Map<Function, string>([
      [HTMLElement, "*"],
      [HTMLButtonElement, "button"],
      [HTMLSelectElement, "select"],
      [HTMLTextAreaElement, "textarea"],
    ]);
    const elements = collectAppElements(<T extends Element>(id: string, type: { new (): T }): T => {
      const tag = tagsById.get(id);
      expect(tag, `Server-rendered interface element ${id}`).toBeDefined();
      const nativeTag = nativeTypes.get(type);
      if (nativeTag && nativeTag !== "*") expect(tag).toBe(nativeTag);
      else if (!nativeTag) expect(customElements.get(tag!)).toBe(type);
      return Object.create(type.prototype) as T;
    });
    expect(elements.projectImportPanel).toBeDefined();
    expect(elements.newWorkspaceStartingPoints).toBeDefined();
  });
});
