import { describe, expect, it } from "vitest";
import type { LibraryPdfArtifact, ProjectReferencePdf } from "../domain/reference-library";
import type { PdfResource, PublicationResource } from "../domain/workspace";
import {
  ContextTabStrip,
  contextPrimaryTabActionEvent,
  contextTabFocusIndex,
  type ContextPrimaryTabAction,
  type ContextTabStripSources,
} from "./context-tab-strip";
import type { ResearchContextKey, ResearchContextTab } from "./research-context";

const createdAt = "2026-07-25T00:00:00.000Z";
const publication: PublicationResource = {
  abstract: "",
  authors: ["Ada Author"],
  citationKey: "Author2026",
  createdAt,
  doi: "",
  id: "publication:1",
  metadataSource: "crossref",
  title: "A study",
  type: "article",
  updatedAt: createdAt,
  url: "",
  venue: "Journal",
  year: "2026",
};
const pdf: PdfResource = {
  contentType: "application/pdf",
  createdAt,
  fingerprint: "fingerprint",
  id: "pdf:1",
  name: "paper.pdf",
  objectKey: "pdfs/paper.pdf",
  size: 1024,
};
const artifact: LibraryPdfArtifact = {
  contentType: "application/pdf",
  createdAt,
  fingerprint: "library-fingerprint",
  id: "library-pdf:1",
  name: "library.pdf",
  objectKey: "library/library.pdf",
  referenceId: publication.id,
  rights: "private",
  size: 2048,
};
const referencePdf: ProjectReferencePdf = {
  fingerprint: "reference-fingerprint",
  id: "reference-pdf:1",
  name: "reference.pdf",
  referenceId: publication.id,
  size: 4096,
};

class TestContextTabStrip extends ContextTabStrip {
  readonly panels = new Map<
    string,
    {
      dataset: Record<string, string>;
      hidden: boolean;
      labelledBy: string | null;
      previewActive: boolean;
      scrollTop: number;
      visible: boolean;
      removeAttribute(name: string): void;
      setPreviewActive(active: boolean): void;
      setAttribute(name: string, value: string): void;
      setVisible(visible: boolean): void;
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

  titlesForTest(): readonly string[] {
    return this.data.items.map(({ title }) => title);
  }

  protected override controlledPanel(id: string): HTMLElement {
    let panel = this.panels.get(id);
    if (!panel) {
      panel = {
        dataset: {},
        hidden: false,
        labelledBy: null,
        previewActive: false,
        scrollTop: 0,
        visible: false,
        removeAttribute: (name) => {
          if (name === "aria-label") return;
        },
        setPreviewActive: (active) => {
          panel!.previewActive = active;
        },
        setAttribute: (name, value) => {
          if (name === "aria-labelledby") panel!.labelledBy = value;
        },
        setVisible: (visible) => {
          panel!.visible = visible;
        },
      };
      this.panels.set(id, panel);
    }
    return panel as unknown as HTMLElement;
  }
}

function sources(
  activeKey: ResearchContextKey,
  tabs: readonly ResearchContextTab[] = [],
  overrides: Partial<ContextTabStripSources> = {},
): ContextTabStripSources {
  return {
    activeKey,
    candidates: [],
    libraryArtifacts: [],
    pdfs: [],
    publications: [],
    referencePdfs: [],
    standaloneLibrary: false,
    tabs,
    ...overrides,
  };
}

describe("context tab strip", () => {
  it("renders fixed and resource tab states", () => {
    const strip = new TestContextTabStrip();
    let replaced = false;
    Object.defineProperty(strip, "replaceChildren", { value: () => (replaced = true) });
    strip.connectForTest();
    expect(strip.renderForTest()).toBeDefined();
    strip.setTabs(sources("assistant"));
    expect(strip.panels.get("context-assistant-panel")?.hidden).toBe(false);
    expect(strip.panels.get("context-preview-panel")?.hidden).toBe(true);
    expect(strip.panels.get("preview-context-controls")?.hidden).toBe(true);
    expect(strip.panels.get("preview-sync-controls")?.visible).toBe(false);
    expect(strip.panels.get("preview-navigation-control")?.previewActive).toBe(false);
    expect(strip.renderForTest()).toBeDefined();
    expect(strip.rootForTest()).toBe(strip);
    expect(replaced).toBe(true);
  });

  it("owns fixed and canonical resource titles", () => {
    const strip = new TestContextTabStrip();
    strip.setTabs(
      sources(
        "preview",
        [
          { kind: "preview", key: "preview", scrollTop: 0 },
          { kind: "library", key: "library", scrollTop: 0 },
          { kind: "assistant", key: "assistant", scrollTop: 0 },
          { id: publication.id, key: `publication:${publication.id}`, kind: "publication", scrollTop: 0 },
          { id: pdf.id, key: `pdf:${pdf.id}`, kind: "pdf", page: 1, focusedAnnotationId: null, scrollTop: 0 },
          { id: artifact.id, key: `library-pdf:${artifact.id}`, kind: "library-pdf", page: 1, focusedAnnotationId: null, scrollTop: 0 },
          {
            id: referencePdf.id,
            key: `library-pdf:${referencePdf.id}`,
            kind: "library-pdf",
            page: 1,
            focusedAnnotationId: null,
            scrollTop: 0,
          },
          { id: "missing", key: "candidate:missing", kind: "candidate", scrollTop: 0 },
        ],
        { libraryArtifacts: [artifact], pdfs: [pdf], publications: [publication], referencePdfs: [referencePdf] },
      ),
    );

    expect(strip.titlesForTest()).toEqual([
      "Preview",
      "Library",
      "Writing assistant",
      publication.title,
      pdf.name,
      artifact.name,
      referencePdf.name,
      "Revision",
    ]);
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
    const data = sources("preview", [
      { kind: "preview", key: "preview", scrollTop: 0 },
      { id: "item", key: "publication:item", kind: "publication", scrollTop: 0 },
    ]);
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

    strip.setTabs(sources(publication.key, [publication]));

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
    strip.setTabs(sources(pdf.key, [pdf]));
    expect(strip.panels.get("context-pdf-panel")).toMatchObject({
      dataset: { libraryPdf: "true", readonlyPdf: "false" },
      hidden: false,
    });
    expect(strip.panels.get("pdf-context-controls")?.hidden).toBe(false);

    const privatePdf = {
      id: artifact.id,
      key: `library-pdf:${artifact.id}` as const,
      kind: "library-pdf" as const,
      scrollTop: 0,
      page: 1,
      focusedAnnotationId: null,
    };
    strip.setTabs(sources(privatePdf.key, [privatePdf], { libraryArtifacts: [artifact] }));
    expect(strip.panels.get("context-pdf-panel")?.dataset).toEqual({ libraryPdf: "true", readonlyPdf: "false" });

    const readonlyPdf = {
      id: referencePdf.id,
      key: `library-pdf:${referencePdf.id}` as const,
      kind: "library-pdf" as const,
      scrollTop: 0,
      page: 1,
      focusedAnnotationId: null,
    };
    strip.setTabs(sources(readonlyPdf.key, [readonlyPdf], { referencePdfs: [referencePdf] }));
    expect(strip.panels.get("context-pdf-panel")?.dataset).toEqual({ libraryPdf: "true", readonlyPdf: "true" });
  });

  it("captures and restores fixed-panel scroll positions", () => {
    const strip = new TestContextTabStrip();

    expect(strip.restoreFixedScroll("library", 42)).toBe(true);
    expect(strip.fixedScrollTop("library")).toBe(42);
    expect(strip.restoreFixedScroll("assistant", 24)).toBe(true);
    expect(strip.panels.get("context-assistant-scroll")?.scrollTop).toBe(24);
    expect(strip.fixedScrollTop("publication:item")).toBeNull();
    expect(strip.restoreFixedScroll("publication:item", 1)).toBe(false);
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
