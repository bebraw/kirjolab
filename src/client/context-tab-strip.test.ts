import { describe, expect, it } from "vitest";
import { ContextTabStrip, contextPrimaryTabActionEvent, contextTabFocusIndex, type ContextPrimaryTabAction } from "./context-tab-strip";

class TestContextTabStrip extends ContextTabStrip {
  protected override scheduleUpdate(): void {}

  renderForTest() {
    return this.render();
  }

  activateForTest(action?: string): void {
    const event = new Event("test");
    Object.defineProperty(event, "currentTarget", { value: { dataset: { contextAction: action } } });
    this.activatePrimaryTab(event);
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  updatedForTest(): void {
    this.updated(new Map());
  }

  moveFocusForTest(event: Event): void {
    this.moveFocus(event as KeyboardEvent);
  }

  connectForTest(): void {
    this.connectedCallback();
  }
}

describe("context tab strip", () => {
  it("renders fixed and resource tab states", () => {
    const strip = new TestContextTabStrip();
    let replaced = false;
    Object.defineProperty(strip, "replaceChildren", { value: () => (replaced = true) });
    strip.connectForTest();
    expect(strip.renderForTest()).toBeDefined();
    strip.setTabs({ activeKey: "assistant", items: [] });
    expect(strip.renderForTest()).toBeDefined();
    expect(strip.rootForTest()).toBe(strip);
    expect(replaced).toBe(true);
  });

  it("emits bounded primary tab intents", () => {
    const strip = new TestContextTabStrip();
    const actions: ContextPrimaryTabAction[] = [];
    strip.addEventListener(contextPrimaryTabActionEvent, (event) => {
      actions.push((event as CustomEvent<ContextPrimaryTabAction>).detail);
    });

    strip.activateForTest();
    strip.activateForTest("preview");
    strip.activateForTest("library");
    strip.activateForTest("assistant");

    expect(actions).toEqual(["preview", "library", "assistant"]);
  });

  it("resolves roving focus navigation", () => {
    expect(contextTabFocusIndex("ArrowRight", 2, 3)).toBe(0);
    expect(contextTabFocusIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(contextTabFocusIndex("Home", 2, 3)).toBe(0);
    expect(contextTabFocusIndex("End", 0, 3)).toBe(2);
    expect(contextTabFocusIndex("Enter", 0, 3)).toBeNull();
  });

  it("delegates resources and focuses fixed or dynamic tabs", async () => {
    const strip = new TestContextTabStrip();
    const data = { activeKey: "preview" as const, items: [] };
    let delegated = false;
    const focused: string[] = [];
    const tabs = [
      { id: "context-preview-tab", focus: () => focused.push("preview") },
      { id: "context-tab-publication-item", focus: () => focused.push("resource") },
    ];
    Object.defineProperty(strip, "querySelector", { value: () => ({ setTabs: () => (delegated = true) }) });
    Object.defineProperty(strip, "querySelectorAll", { value: () => tabs });

    strip.setTabs(data);
    strip.updatedForTest();
    strip.focusTab("preview");
    strip.focusTab("publication:item");
    await Promise.resolve();

    expect(delegated).toBe(true);
    expect(focused).toEqual(["preview", "resource"]);
  });

  it("moves roving focus only for unmodified navigation keys", () => {
    const strip = new TestContextTabStrip();
    const focused: string[] = [];
    const previewTab = { tabIndex: 0, focus: () => focused.push("preview") };
    const libraryTab = { tabIndex: -1, focus: () => focused.push("library") };
    const tabs = [previewTab, libraryTab];
    Object.defineProperty(strip, "querySelectorAll", { value: () => tabs });
    const keydown = (key: string, target: object, metaKey = false): Event => {
      const event = new Event("keydown", { cancelable: true });
      Object.defineProperties(event, {
        altKey: { value: false },
        ctrlKey: { value: false },
        key: { value: key },
        metaKey: { value: metaKey },
        target: { value: target },
      });
      return event;
    };

    strip.moveFocusForTest(keydown("ArrowRight", previewTab));
    strip.moveFocusForTest(keydown("ArrowRight", libraryTab, true));
    strip.moveFocusForTest(keydown("Enter", libraryTab));
    strip.moveFocusForTest(keydown("ArrowRight", {}));

    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0]);
    expect(focused).toEqual(["library"]);
  });
});
