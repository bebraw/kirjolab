import { describe, expect, it } from "vitest";
import { ContextTabStrip, contextPrimaryTabActionEvent, contextTabFocusIndex, type ContextPrimaryTabAction } from "./context-tab-strip";

class TestContextTabStrip extends ContextTabStrip {
  readonly panels = new Map<
    string,
    {
      dataset: Record<string, string>;
      hidden: boolean;
      labelledBy: string | null;
      removeAttribute(name: string): void;
      setAttribute(name: string, value: string): void;
    }
  >();

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

  protected override controlledPanel(id: string): HTMLElement {
    let panel = this.panels.get(id);
    if (!panel) {
      panel = {
        dataset: {},
        hidden: false,
        labelledBy: null,
        removeAttribute: (name) => {
          if (name === "aria-label") return;
        },
        setAttribute: (name, value) => {
          if (name === "aria-labelledby") panel!.labelledBy = value;
        },
      };
      this.panels.set(id, panel);
    }
    return panel as unknown as HTMLElement;
  }
}

describe("context tab strip", () => {
  it("renders fixed and resource tab states", () => {
    const strip = new TestContextTabStrip();
    let replaced = false;
    Object.defineProperty(strip, "replaceChildren", { value: () => (replaced = true) });
    strip.connectForTest();
    expect(strip.renderForTest()).toBeDefined();
    strip.setTabs({ activeKey: "assistant", items: [], standaloneLibrary: false });
    expect(strip.panels.get("context-assistant-panel")?.hidden).toBe(false);
    expect(strip.panels.get("context-preview-panel")?.hidden).toBe(true);
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
    const data = {
      activeKey: "preview" as const,
      items: [
        { tab: { kind: "preview" as const, key: "preview" as const, scrollTop: 0 }, title: "Preview" },
        {
          tab: { id: "item", key: "publication:item" as const, kind: "publication" as const, scrollTop: 0 },
          title: "Reference",
        },
      ],
      standaloneLibrary: false,
    };
    let overviewItems = 0;
    let resourceItems = 0;
    const focused: string[] = [];
    const tabs = [
      { id: "context-preview-tab", focus: () => focused.push("preview") },
      { id: "context-tab-publication-item", focus: () => focused.push("resource") },
    ];
    Object.defineProperty(strip, "querySelector", {
      value: (selector: string) => ({
        setTabs: (input: { readonly items: readonly unknown[] }) => {
          if (selector === "context-resource-tabs-panel") resourceItems = input.items.length;
          else overviewItems = input.items.length;
        },
      }),
    });
    Object.defineProperty(strip, "querySelectorAll", { value: () => tabs });

    strip.setTabs(data);
    strip.updatedForTest();
    strip.focusTab("preview");
    strip.focusTab("publication:item");
    await Promise.resolve();

    expect(resourceItems).toBe(1);
    expect(overviewItems).toBe(2);
    expect(focused).toEqual(["preview", "resource"]);
  });

  it("owns resource panel visibility, labels, and PDF mode presentation", () => {
    const strip = new TestContextTabStrip();
    const publication = { id: "item", key: "publication:item" as const, kind: "publication" as const, scrollTop: 0 };

    strip.setTabs({
      activeKey: publication.key,
      items: [{ tab: publication, title: "Reference" }],
      standaloneLibrary: false,
    });
    strip.setPdfMode(true, false);

    expect(strip.panels.get("context-publication-panel")).toMatchObject({
      hidden: false,
      labelledBy: "context-tab-publication-item",
    });
    const pdf = {
      id: "paper",
      key: "library-pdf:paper" as const,
      kind: "library-pdf" as const,
      scrollTop: 0,
      page: 1,
      focusedAnnotationId: null,
    };
    strip.setTabs({ activeKey: pdf.key, items: [{ tab: pdf, title: "Paper" }], standaloneLibrary: false });
    strip.setPdfMode(true, false);
    expect(strip.panels.get("context-pdf-panel")).toMatchObject({
      dataset: { libraryPdf: "true", readonlyPdf: "false" },
      hidden: false,
    });
    expect(strip.panels.get("pdf-context-controls")?.hidden).toBe(false);
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
