import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    expect(elements.assistantGenerationPresenter).toBeDefined();
    expect(elements.referenceLibraryWorkspace).toBeDefined();
    expect(elements.source).toBeDefined();
    expect(elements.toast).toBeDefined();
    expect(elements.themePreference).toBeDefined();
  });

  it("rejects a missing or incorrectly typed element", () => {
    vi.stubGlobal("document", { getElementById: vi.fn(() => null) });

    expect(() => requiredAppElement("source-editor", HTMLTextAreaElement)).toThrow("Missing interface element: source-editor");
  });
});
