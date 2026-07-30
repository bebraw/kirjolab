import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppToast, appToastActionEvent, appToastDismissEvent } from "./app-toast";

class TestAppToast extends AppToast {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  emitActionForTest(): void {
    this.emitAction();
  }
}

function createToast(): TestAppToast {
  const toast = new TestAppToast();
  Object.defineProperty(toast, "dataset", { value: {} });
  Object.defineProperty(toast, "matches", { value: vi.fn(() => false) });
  toast.showPopover = vi.fn();
  toast.hidePopover = vi.fn();
  return toast;
}

describe("application toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { clearTimeout, setTimeout });
    vi.stubGlobal("document", { body: { append: vi.fn() }, querySelector: vi.fn(() => null) });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("owns messages, actions, and one-shot action intent", () => {
    const toast = createToast();
    expect(toast.rootForTest()).toBe(toast);
    expect(toast.renderForTest()).toBeDefined();
    const actions: string[] = [];
    const run = vi.fn();
    toast.addEventListener(appToastActionEvent, () => actions.push("action"));
    toast.show("Deleted", { action: run, actionLabel: "Undo", persistent: true });
    expect(toast.renderForTest()).toBeDefined();
    toast.emitActionForTest();
    toast.emitActionForTest();
    expect(actions).toEqual(["action"]);
    expect(run).toHaveBeenCalledOnce();
  });

  it("dismisses transient notices after their requested duration", () => {
    const toast = createToast();
    const dismissals: string[] = [];
    toast.addEventListener(appToastDismissEvent, () => dismissals.push("dismissed"));
    toast.show("Earlier", { durationMs: 10 });
    toast.show("Saved", { durationMs: 25 });
    expect(toast.dataset.visible).toBe("true");
    vi.advanceTimersByTime(10);
    expect(dismissals).toEqual([]);
    vi.advanceTimersByTime(15);
    expect(toast.dataset.visible).toBeUndefined();
    expect(dismissals).toEqual(["dismissed"]);
  });

  it("restores a pinned notice after a transient notice dismisses", () => {
    const toast = createToast();
    const refresh = vi.fn();
    toast.pin("Update available", { action: refresh, actionLabel: "Refresh" });
    toast.show("Saved", { durationMs: 25 });

    vi.advanceTimersByTime(25);
    expect(toast.dataset.visible).toBe("true");
    toast.emitActionForTest();
    expect(refresh).toHaveBeenCalledOnce();
  });
});
