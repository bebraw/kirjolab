import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceLayoutManager, type WorkspaceLayoutElements } from "./workspace-layout-manager";

class FakeElement extends EventTarget {
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly styleValues = new Map<string, string>();
  readonly style = {
    removeProperty: (name: string) => this.styleValues.delete(name),
    setProperty: (name: string, value: string) => this.styleValues.set(name, value),
  };
  previousElementSibling: FakeElement | null = null;
  nextElementSibling: FakeElement | null = null;
  focused = false;
  rect = { bottom: 100, height: 100, left: 0, right: 100, top: 0, width: 100 };
  readonly pointers = new Set<number>();
  readonly descendants = new Map<string, FakeElement>();

  querySelector(selector: string): FakeElement | null {
    return this.descendants.get(selector) ?? null;
  }

  focus(): void {
    this.focused = true;
  }

  getBoundingClientRect(): DOMRect {
    return this.rect as DOMRect;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  setPointerCapture(pointerId: number): void {
    this.pointers.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.pointers.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.pointers.delete(pointerId);
  }
}

function event(type: string, values: Readonly<Record<string, string | number>> = {}): Event {
  const result = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(values)) Object.defineProperty(result, key, { value });
  return result;
}

interface LayoutFakes {
  readonly authoring: FakeElement;
  readonly collapse: FakeElement;
  readonly context: FakeElement;
  readonly expand: FakeElement;
  readonly paneResizer: FakeElement;
  readonly rail: FakeElement;
  readonly sourceResizer: FakeElement;
  readonly surfaces: FakeElement;
}

function fixture(): { readonly elements: WorkspaceLayoutElements; readonly fakes: LayoutFakes } {
  const surfaces = new FakeElement();
  surfaces.rect.width = 1_200;
  const rail = new FakeElement();
  rail.rect = { ...rail.rect, left: 0, right: 272, width: 272 };
  const sourceResizer = new FakeElement();
  sourceResizer.rect.width = 8;
  sourceResizer.previousElementSibling = rail;
  const authoring = new FakeElement();
  authoring.rect = { ...authoring.rect, left: 208, right: 708, width: 500 };
  const context = new FakeElement();
  context.rect = { ...context.rect, left: 716, right: 1_200, width: 484 };
  const paneResizer = new FakeElement();
  paneResizer.rect.width = 8;
  paneResizer.previousElementSibling = authoring;
  paneResizer.nextElementSibling = context;
  const collapse = new FakeElement();
  const expand = new FakeElement();
  surfaces.descendants.set("#authoring-context-resizer", paneResizer);
  surfaces.descendants.set("#collapse-source-rail", collapse);
  surfaces.descendants.set("#expand-source-rail", expand);
  surfaces.descendants.set("#source-rail-resizer", sourceResizer);
  return {
    elements: {
      authoringContextResizer: paneResizer,
      collapseSourceRail: collapse,
      expandSourceRail: expand,
      sourceRailResizer: sourceResizer,
      workspaceSurfaces: surfaces,
    },
    fakes: { authoring, collapse, context, expand, paneResizer, rail, sourceResizer, surfaces },
  };
}

const storage = new Map<string, string>();
const browserWindow = new EventTarget();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("window", browserWindow);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("workspace layout manager", () => {
  it("resolves workspace-owned controls from the layout root", () => {
    const { fakes } = fixture();
    storage.set("kirjolab:authoring-pane:project:preview", "520");
    const manager = WorkspaceLayoutManager.forWorkspace(
      "project",
      { contextResourcePresenter: { activeTab: undefined }, workspaceSurfaces: fakes.surfaces },
      { resize: vi.fn() },
    );
    manager.restorePaneWidth();
    fakes.collapse.dispatchEvent(event("click"));
    expect(fakes.surfaces.styleValues.get("--authoring-pane-width")).toBe("520px");
    expect(fakes.surfaces.dataset.sourceRail).toBe("collapsed");
    expect(fakes.expand.focused).toBe(true);
  });

  it("rejects an incomplete workspace layout", () => {
    const { fakes } = fixture();
    fakes.surfaces.descendants.delete("#source-rail-resizer");
    expect(() =>
      WorkspaceLayoutManager.forWorkspace(
        "project",
        { contextResourcePresenter: { activeTab: undefined }, workspaceSurfaces: fakes.surfaces },
        { resize: vi.fn() },
      ),
    ).toThrow("Required workspace layout control is missing: #source-rail-resizer");
  });

  it("restores and toggles source-rail collapse with focus transfer", () => {
    storage.set("kirjolab:source-rail-collapsed", "true");
    const { elements, fakes } = fixture();
    new WorkspaceLayoutManager(elements, { paneStorageKey: () => "pane", resizePdf: vi.fn() });
    expect(fakes.surfaces.dataset.sourceRail).toBe("collapsed");
    fakes.expand.dispatchEvent(event("click"));
    expect(fakes.surfaces.dataset.sourceRail).toBe("expanded");
    expect(fakes.collapse.focused).toBe(true);
    fakes.collapse.dispatchEvent(event("click"));
    expect(fakes.expand.focused).toBe(true);
    expect(storage.get("kirjolab:source-rail-collapsed")).toBe("true");
  });

  it("owns rail keyboard, pointer, persistence, and responsive restoration", () => {
    const { elements, fakes } = fixture();
    const resizePdf = vi.fn();
    new WorkspaceLayoutManager(elements, { paneStorageKey: () => "pane", resizePdf });
    fakes.sourceResizer.dispatchEvent(event("keydown", { key: "ArrowRight" }));
    expect(storage.get("kirjolab:source-rail-width")).toBe("288");
    fakes.sourceResizer.dispatchEvent(event("keydown", { key: "Home" }));
    expect(storage.has("kirjolab:source-rail-width")).toBe(false);
    fakes.sourceResizer.dispatchEvent(event("pointerdown", { clientX: 300, pointerId: 3 }));
    fakes.sourceResizer.dispatchEvent(event("pointermove", { clientX: 320, pointerId: 3 }));
    fakes.sourceResizer.dispatchEvent(event("pointerup", { clientX: 320, pointerId: 3 }));
    expect(storage.get("kirjolab:source-rail-width")).toBe("316");
    browserWindow.dispatchEvent(event("resize"));
    expect(fakes.surfaces.styleValues.get("--source-rail-width")).toBe("316px");
    expect(resizePdf).toHaveBeenCalledTimes(3);
  });

  it("restores context-specific pane widths and handles keyboard and cancelled drags", () => {
    storage.set("pane:preview", "520");
    const { elements, fakes } = fixture();
    const resizePdf = vi.fn();
    const manager = new WorkspaceLayoutManager(elements, { paneStorageKey: () => "pane:preview", resizePdf });
    manager.restorePaneWidth();
    expect(fakes.surfaces.styleValues.get("--authoring-pane-width")).toBe("520px");
    fakes.paneResizer.dispatchEvent(event("keydown", { key: "ArrowLeft" }));
    expect(storage.get("pane:preview")).toBe("476");
    fakes.paneResizer.dispatchEvent(event("pointerdown", { clientX: 600, pointerId: 4 }));
    fakes.paneResizer.dispatchEvent(event("pointercancel", { clientX: 610, pointerId: 4 }));
    fakes.paneResizer.dispatchEvent(event("keydown", { key: "Home" }));
    expect(storage.has("pane:preview")).toBe(false);
    expect(fakes.paneResizer.attributes.get("aria-valuenow")).toBe("48");
    expect(resizePdf).toHaveBeenCalledTimes(3);
  });
});
