import { afterEach, describe, expect, it, vi } from "vitest";
import { previewNavigationStorageKey } from "./preview-navigation";
import { PreviewNavigationControl } from "./preview-navigation-control";

class TestPreviewNavigationControl extends PreviewNavigationControl {
  renderForTest() {
    return this.render();
  }

  initializeForTest(): void {
    this.connectToggle();
    this.restoreNavigation();
  }

  toggleForTest(): void {
    this.toggleNavigation();
  }

  showForTest(): void {
    this.showNavigation();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preview navigation control", () => {
  it("restores, toggles, persists, labels, and hands off focus", () => {
    const control = new TestPreviewNavigationControl();
    control.setAttribute("app-mode", "library");
    const label = { textContent: "" };
    const toggle = {
      addEventListener: vi.fn(),
      focus: vi.fn(),
      querySelector: vi.fn(() => label),
      setAttribute: vi.fn(),
      title: "",
      hidden: false,
    };
    const restore = { focus: vi.fn(), hidden: true, getClientRects: () => [], addEventListener: vi.fn() };
    const pdfRestore = { focus: vi.fn(), hidden: true, getClientRects: () => [{}], addEventListener: vi.fn() };
    const body = { dataset: {} as Record<string, string> };
    const storage = {
      getItem: vi.fn(() => "true"),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };
    vi.stubGlobal("document", { body, querySelector: () => toggle, querySelectorAll: () => [restore, pdfRestore] });
    vi.stubGlobal("localStorage", storage);

    expect(control.renderForTest()).toBeDefined();
    control.initializeForTest();
    expect(toggle.hidden).toBe(false);
    expect(body.dataset.previewNavigation).toBe("hidden");
    expect(label.textContent).toBe("Show nav");
    expect(restore.hidden).toBe(false);
    expect(pdfRestore.hidden).toBe(false);

    control.show();
    expect(body.dataset.previewNavigation).toBe("visible");
    expect(toggle.focus).not.toHaveBeenCalled();
    expect(storage.removeItem).toHaveBeenCalledWith(previewNavigationStorageKey);
    expect(restore.hidden).toBe(true);
    expect(pdfRestore.hidden).toBe(true);

    control.showForTest();
    expect(body.dataset.previewNavigation).toBe("visible");
    expect(storage.removeItem).toHaveBeenCalledWith(previewNavigationStorageKey);
    expect(toggle.focus).toHaveBeenCalledOnce();
    expect(restore.hidden).toBe(true);
    expect(pdfRestore.hidden).toBe(true);

    control.toggleForTest();
    expect(storage.setItem).toHaveBeenCalledWith(previewNavigationStorageKey, "true");
    expect(restore.focus).not.toHaveBeenCalled();
    expect(pdfRestore.focus).toHaveBeenCalledOnce();
    expect(restore.hidden).toBe(false);
    expect(pdfRestore.hidden).toBe(false);
  });

  it("keeps visible behavior when browser storage is unavailable", () => {
    const control = new TestPreviewNavigationControl();
    const toggle = {
      addEventListener: vi.fn(),
      focus: vi.fn(),
      querySelector: vi.fn(() => null),
      setAttribute: vi.fn(),
      title: "",
      hidden: false,
    };
    const restore = { focus: vi.fn(), hidden: true, getClientRects: () => [{}], addEventListener: vi.fn() };
    const body = { dataset: {} as Record<string, string> };
    vi.stubGlobal("document", { body, querySelector: () => toggle, querySelectorAll: () => [restore] });
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("unavailable");
      },
      removeItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("unavailable");
      },
    });

    control.initializeForTest();
    control.toggleForTest();
    control.showForTest();

    expect(body.dataset.previewNavigation).toBe("visible");
    expect(restore.hidden).toBe(true);
  });
});
