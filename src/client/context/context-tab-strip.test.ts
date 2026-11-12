import { describe, expect, it, vi } from "vitest";
import type { LibraryPdfArtifact, ProjectReferencePdf } from "../../domain/reference-library";
import type { ModelCandidate, PdfResource, PublicationResource } from "../../domain/workspace/workspace";
import {
  ContextTabStrip,
  contextPrimaryTabActionEvent,
  contextTabFocusIndex,
  type ContextPrimaryTabAction,
  type ContextTabStripSources,
} from "./context-tab-strip";
import { contextResourceTabActionEvent } from "./context-resource-tabs";
import { contextTabOverviewActionEvent } from "./context-tab-overview";
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
  name: "10.1016_j.journal.final(4).pdf",
  objectKey: "pdfs/paper.pdf",
  size: 1024,
};
const artifact: LibraryPdfArtifact = {
  contentType: "application/pdf",
  createdAt,
  fingerprint: "library-fingerprint",
  id: "library-pdf:1",
  name: "download_7f82c1b0.pdf",
  objectKey: "library/library.pdf",
  referenceId: publication.id,
  rights: "private",
  size: 2048,
};
const referencePdf: ProjectReferencePdf = {
  fingerprint: "reference-fingerprint",
  id: "reference-pdf:1",
  name: "fulltext (accepted manuscript) [1].pdf",
  referenceId: publication.id,
  size: 4096,
};
const candidate: ModelCandidate = {
  createdAt,
  evidence: [],
  id: "revision-123",
  instruction: "Clarify the claim",
  model: "review-model",
  operation: "draft-claim",
  promptVersion: "draft-claim-v1",
  proposedNote: "",
  proposedText: "A clearer claim.",
  providerAdapter: "openai-compatible",
  providerLabel: "Writing provider",
  relation: "supports",
  status: "pending",
};

interface TemplateLike {
  readonly strings: readonly string[];
  readonly values: readonly unknown[];
}

function templateText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!isTemplateLike(value)) return "";
  return value.strings.reduce((text, part, index) => `${text}${part}${templateText(value.values[index])}`, "");
}

function isTemplateLike(value: unknown): value is TemplateLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "strings" in value &&
    Array.isArray(value.strings) &&
    "values" in value &&
    Array.isArray(value.values)
  );
}

class TestContextTabStrip extends ContextTabStrip {
  readonly absentPanels = new Set<string>();
  readonly panels = new Map<
    string,
    {
      dataset: Record<string, string>;
      hidden: boolean;
      label: string | null;
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

  protected override controlledPanel(id: string): HTMLElement | null {
    if (this.absentPanels.has(id)) return null;
    let panel = this.panels.get(id);
    if (!panel) {
      panel = {
        dataset: {},
        hidden: false,
        label: "Fallback panel label",
        labelledBy: null,
        previewActive: false,
        scrollTop: 0,
        visible: false,
        removeAttribute: (name) => {
          if (name === "aria-label") panel!.label = null;
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
    chapterNotesAvailable: false,
    libraryArtifacts: [],
    publications: [],
    referencePdfs: [],
    standaloneLibrary: false,
    tabs,
    ...overrides,
  };
}

describe("context tab strip", () => {
  it("renders accessible fixed tabs with only the selected tab in the tab order", () => {
    const strip = new TestContextTabStrip();
    const initial = templateText(strip.renderForTest()).replace(/\s+/g, " ");
    expect(initial).toContain('role="tablist" aria-label="Research context"');
    expect(initial).toContain(
      'id=context-preview-tab type="button" role="tab" aria-controls=context-preview-panel aria-selected=true tabindex=0',
    );
    expect(initial).toContain(
      'id=context-outline-tab type="button" role="tab" aria-controls=context-outline-panel aria-selected=false tabindex=-1',
    );
    expect(initial).not.toContain("context-chapter-notes-tab");

    strip.setTabs(sources("outline", [{ kind: "outline", key: "outline", scrollTop: 0 }]));
    const selected = templateText(strip.renderForTest()).replace(/\s+/g, " ");
    expect(selected.match(/<button\b/g)).toHaveLength(4);
    expect(selected).toContain(
      'id=context-preview-tab type="button" role="tab" aria-controls=context-preview-panel aria-selected=false tabindex=-1 data-context-action=preview @click= > Preview </button>',
    );
    expect(selected).toContain(
      'id=context-outline-tab type="button" role="tab" aria-controls=context-outline-panel aria-selected=true tabindex=0 data-context-action=outline @click= > Outline & hints </button>',
    );
    expect(selected).toContain(
      'id=context-library-tab type="button" role="tab" aria-controls=context-library-panel aria-selected=false tabindex=-1 data-context-action=library @click= > Library </button>',
    );
    expect(selected).toContain(
      'id=context-assistant-tab type="button" role="tab" aria-controls=context-assistant-panel aria-selected=false tabindex=-1 data-context-action=assistant @click= > Writing assistant </button>',
    );
  });

  it("shows Outline & hints beside the editor and restores its scroll without opening a resource", () => {
    const strip = new TestContextTabStrip();
    strip.setTabs(sources("outline", [{ kind: "outline", key: "outline", scrollTop: 42 }]));

    expect(strip.titlesForTest()).toEqual(["Outline & hints"]);
    expect(strip.panels.get("context-outline-panel")?.hidden).toBe(false);
    expect(strip.panels.get("context-outline-scroll")?.scrollTop).toBe(42);
    expect(strip.fixedScrollTop("outline")).toBe(42);
    expect(strip.panels.get("context-preview-panel")?.hidden).toBe(true);
    expect(strip.panels.get("context-pdf-panel")?.hidden).toBe(true);
    expect(strip.panels.get("preview-sync-controls")?.visible).toBe(false);
  });

  it("excludes the manuscript outline from standalone Library tab navigation", () => {
    const strip = new TestContextTabStrip();
    strip.setTabs(
      sources(
        "outline",
        [
          { kind: "outline", key: "outline", scrollTop: 0 },
          { kind: "library", key: "library", scrollTop: 0 },
        ],
        { standaloneLibrary: true },
      ),
    );

    expect(strip.titlesForTest()).toEqual(["Library"]);
    expect(strip.panels.get("context-outline-panel")?.hidden).toBe(true);
    expect(templateText(strip.renderForTest())).not.toContain("context-outline-tab");
  });

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

  it("owns fixed titles and resource-keyed PDF labels", () => {
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
        { libraryArtifacts: [artifact], publications: [publication], referencePdfs: [referencePdf] },
      ),
    );

    expect(strip.titlesForTest()).toEqual([
      "Preview",
      "Library",
      "Writing assistant",
      publication.title,
      `pdf:${pdf.id}`,
      `library-pdf:${artifact.id}`,
      `library-pdf:${referencePdf.id}`,
      "Revision",
    ]);
  });

  it("shows Chapter notes only when the active file has a companion", () => {
    const strip = new TestContextTabStrip();
    const tabs: readonly ResearchContextTab[] = [
      { kind: "preview", key: "preview", scrollTop: 0 },
      { kind: "chapter-notes", key: "chapter-notes", scrollTop: 18 },
      { kind: "library", key: "library", scrollTop: 0 },
      { kind: "assistant", key: "assistant", scrollTop: 0 },
    ];

    strip.setTabs(sources("preview", tabs));
    expect(strip.titlesForTest()).toEqual(["Preview", "Library", "Writing assistant"]);

    strip.setTabs(sources("chapter-notes", tabs, { chapterNotesAvailable: true }));
    expect(strip.titlesForTest()).toEqual(["Preview", "Chapter notes", "Library", "Writing assistant"]);
    expect(strip.panels.get("context-chapter-notes-panel")?.hidden).toBe(false);
    expect(strip.panels.get("context-chapter-notes-scroll")?.scrollTop).toBe(18);
    expect(templateText(strip.renderForTest()).replace(/\s+/g, " ")).toContain(
      'id=context-chapter-notes-tab type="button" role="tab" aria-controls=context-chapter-notes-panel aria-selected=true tabindex=0 data-context-action=chapter-notes @click= > Chapter notes </button>',
    );
  });

  it("labels saved revisions by their own model and keeps missing references identifiable", () => {
    const strip = new TestContextTabStrip();
    strip.setTabs(
      sources(
        "candidate:revision-123",
        [
          { id: candidate.id, key: "candidate:revision-123", kind: "candidate", scrollTop: 0 },
          { id: "missing", key: "publication:missing", kind: "publication", scrollTop: 0 },
        ],
        { candidates: [{ ...candidate, id: "other", model: "other-model" }, candidate], publications: [publication] },
      ),
    );

    expect(strip.titlesForTest()).toEqual(["Revision · review-model · revi", "Reference"]);
    expect(strip.panels.get("context-candidate-panel")).toMatchObject({
      hidden: false,
      label: null,
      labelledBy: "context-tab-candidate-revision-123",
    });
  });

  it("keeps PDF labels stable when filename metadata changes or is unavailable", () => {
    const strip = new TestContextTabStrip();
    const projectTab = {
      id: pdf.id,
      key: `pdf:${pdf.id}` as const,
      kind: "pdf" as const,
      page: 1,
      focusedAnnotationId: null,
      scrollTop: 0,
    };
    const libraryTab = {
      id: artifact.id,
      key: `library-pdf:${artifact.id}` as const,
      kind: "library-pdf" as const,
      page: 1,
      focusedAnnotationId: null,
      scrollTop: 0,
    };

    strip.setTabs(sources(projectTab.key, [projectTab, libraryTab], { libraryArtifacts: [artifact] }));
    expect(strip.titlesForTest()).toEqual([projectTab.key, libraryTab.key]);

    strip.setTabs(
      sources(projectTab.key, [projectTab, libraryTab], {
        libraryArtifacts: [{ ...artifact, name: "renamed-library.pdf" }],
      }),
    );
    expect(strip.titlesForTest()).toEqual([projectTab.key, libraryTab.key]);

    strip.setTabs(sources(projectTab.key, [projectTab, libraryTab]));
    expect(strip.titlesForTest()).toEqual([projectTab.key, libraryTab.key]);
  });

  it("kind-qualifies colliding workspace and Library PDF ids", () => {
    const strip = new TestContextTabStrip();
    const projectTab = {
      id: "shared-id",
      key: "pdf:shared-id" as const,
      kind: "pdf" as const,
      page: 1,
      focusedAnnotationId: null,
      scrollTop: 0,
    };
    const libraryTab = {
      id: "shared-id",
      key: "library-pdf:shared-id" as const,
      kind: "library-pdf" as const,
      page: 1,
      focusedAnnotationId: null,
      scrollTop: 0,
    };

    strip.setTabs(sources(projectTab.key, [projectTab, libraryTab]));

    expect(strip.titlesForTest()).toEqual([projectTab.key, libraryTab.key]);
  });

  it("emits bounded primary tab intents", () => {
    const strip = new TestContextTabStrip();
    const actions: ContextPrimaryTabAction[] = [];
    strip.addEventListener(contextPrimaryTabActionEvent, (event) => {
      expect(event.bubbles).toBe(true);
      expect(event.composed).toBe(true);
      actions.push((event as CustomEvent<ContextPrimaryTabAction>).detail);
    });

    strip.activateForTest();
    strip.activateForTest("preview");
    strip.activateForTest("outline");
    strip.activateForTest("chapter-notes");
    strip.activateForTest("library");
    strip.activateForTest("assistant");

    expect(actions).toEqual(["preview", "outline", "chapter-notes", "library", "assistant"]);
  });

  it("routes primary and child navigation through one boundary", () => {
    const strip = new TestContextTabStrip();
    const navigation = { activate: vi.fn(), close: vi.fn(), openLibrary: vi.fn() };
    strip.bindNavigation(navigation);

    strip.activateForTest("preview");
    strip.activateForTest("outline");
    strip.activateForTest("chapter-notes");
    strip.activateForTest("library");
    strip.dispatchEvent(new CustomEvent(contextResourceTabActionEvent, { detail: { action: "activate", key: "publication:reference-1" } }));
    strip.dispatchEvent(new CustomEvent(contextResourceTabActionEvent, { detail: { action: "close", key: "pdf:pdf-1" } }));
    strip.dispatchEvent(new CustomEvent(contextTabOverviewActionEvent, { detail: { action: "activate", key: "candidate:candidate-1" } }));
    strip.dispatchEvent(new CustomEvent(contextTabOverviewActionEvent, { detail: { action: "close", key: "library-pdf:artifact-1" } }));

    expect(navigation.openLibrary).toHaveBeenCalledOnce();
    expect(navigation.activate.mock.calls).toEqual([
      ["preview"],
      ["outline"],
      ["chapter-notes"],
      ["publication:reference-1"],
      ["candidate:candidate-1"],
    ]);
    expect(navigation.close.mock.calls).toEqual([["pdf:pdf-1"], ["library-pdf:artifact-1"]]);
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
    const data = sources(
      "outline",
      [
        { kind: "preview", key: "preview", scrollTop: 0 },
        { kind: "outline", key: "outline", scrollTop: 0 },
        { kind: "chapter-notes", key: "chapter-notes", scrollTop: 0 },
        { kind: "library", key: "library", scrollTop: 0 },
        { kind: "assistant", key: "assistant", scrollTop: 0 },
        { id: "item", key: "publication:item", kind: "publication", scrollTop: 0 },
      ],
      { chapterNotesAvailable: true },
    );
    const overview = { setTabs: vi.fn() };
    const resources = { setTabs: vi.fn() };
    const focused: string[] = [];
    const tabs = [
      { id: "context-preview-tab", focus: () => focused.push("preview") },
      { id: "context-outline-tab", focus: () => focused.push("outline") },
      { id: "context-chapter-notes-tab", focus: () => focused.push("chapter-notes") },
      { id: "context-library-tab", focus: () => focused.push("library") },
      { id: "context-assistant-tab", focus: () => focused.push("assistant") },
      { id: "context-tab-publication-item", focus: () => focused.push("resource") },
    ];
    Object.defineProperty(strip, "querySelector", {
      value: (selector: string) => {
        if (selector === "context-resource-tabs-panel") return resources;
        if (selector === "context-tab-overview-panel") return overview;
        return null;
      },
    });
    Object.defineProperty(strip, "querySelectorAll", { value: (selector: string) => (selector === "[role=tab]" ? tabs : []) });

    strip.setTabs(data);
    strip.updatedForTest();
    strip.focusTab("preview");
    strip.focusTab("outline");
    strip.focusTab("chapter-notes");
    strip.focusTab("library");
    strip.focusTab("assistant");
    strip.focusTab("publication:item");
    strip.focusTab("publication:closed");
    await Promise.resolve();

    expect(resources.setTabs).toHaveBeenCalledExactlyOnceWith({
      activeKey: "outline",
      items: [{ tab: data.tabs[5], title: "Reference" }],
    });
    expect(overview.setTabs).toHaveBeenCalledExactlyOnceWith({
      activeKey: "outline",
      standaloneLibrary: false,
      items: [
        { tab: data.tabs[0], title: "Preview" },
        { tab: data.tabs[1], title: "Outline & hints" },
        { tab: data.tabs[2], title: "Chapter notes" },
        { tab: data.tabs[3], title: "Library" },
        { tab: data.tabs[4], title: "Writing assistant" },
        { tab: data.tabs[5], title: "Reference" },
      ],
    });
    expect(focused).toEqual(["preview", "outline", "chapter-notes", "library", "assistant", "resource"]);
  });

  it("tolerates children and controlled panels that have not mounted yet", () => {
    const strip = new TestContextTabStrip();
    Object.defineProperty(strip, "querySelector", { value: () => null });
    for (const id of [
      "context-pdf-panel",
      "context-publication-panel",
      "preview-context-controls",
      "preview-sync-controls",
      "preview-navigation-control",
    ]) {
      strip.absentPanels.add(id);
    }

    expect(() => {
      strip.setTabs(sources("publication:item", [{ id: "item", key: "publication:item", kind: "publication", scrollTop: 0 }]));
      strip.updatedForTest();
    }).not.toThrow();
    expect(strip.titlesForTest()).toEqual(["Reference"]);
  });

  it("owns resource panel visibility, labels, and PDF mode presentation", () => {
    const strip = new TestContextTabStrip();
    const publication = { id: "item", key: "publication:item" as const, kind: "publication" as const, scrollTop: 0 };

    strip.setTabs(sources(publication.key, [publication]));

    expect(strip.panels.get("context-publication-panel")).toMatchObject({
      hidden: false,
      label: null,
      labelledBy: "context-tab-publication-item",
    });
    const libraryPdfTab = {
      id: "paper",
      key: "library-pdf:paper" as const,
      kind: "library-pdf" as const,
      scrollTop: 0,
      page: 1,
      focusedAnnotationId: null,
    };
    strip.setTabs(sources(libraryPdfTab.key, [libraryPdfTab]));
    expect(strip.panels.get("context-pdf-panel")).toMatchObject({
      dataset: { libraryPdf: "true", readonlyPdf: "false" },
      hidden: false,
      label: null,
      labelledBy: "context-tab-library-pdf-paper",
    });
    expect(strip.panels.get("context-publication-panel")?.hidden).toBe(true);
    expect(strip.panels.get("pdf-context-controls")?.hidden).toBe(true);

    const projectPdf = {
      id: pdf.id,
      key: `pdf:${pdf.id}` as const,
      kind: "pdf" as const,
      scrollTop: 0,
      page: 1,
      focusedAnnotationId: null,
    };
    strip.setTabs(sources(projectPdf.key, [projectPdf]));
    expect(strip.panels.get("context-pdf-panel")).toMatchObject({
      dataset: { libraryPdf: "false", readonlyPdf: "false" },
      hidden: false,
      labelledBy: "context-tab-pdf-pdf:1",
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

    strip.setTabs(
      sources(readonlyPdf.key, [readonlyPdf], {
        libraryArtifacts: [artifact],
        referencePdfs: [
          { ...referencePdf, id: "unrelated-reference" },
          { ...referencePdf, ownArtifactId: artifact.id },
        ],
      }),
    );
    expect(strip.panels.get("context-pdf-panel")?.dataset).toEqual({ libraryPdf: "true", readonlyPdf: "false" });

    strip.setTabs(
      sources(readonlyPdf.key, [readonlyPdf], {
        libraryArtifacts: [{ ...artifact, id: "unrelated-artifact" }],
        referencePdfs: [{ ...referencePdf, ownArtifactId: artifact.id }],
      }),
    );
    expect(strip.panels.get("context-pdf-panel")?.dataset).toEqual({ libraryPdf: "true", readonlyPdf: "true" });
  });

  it("keeps exactly the selected panel visible while moving between writing and research tabs", () => {
    const strip = new TestContextTabStrip();
    const tabs: readonly ResearchContextTab[] = [
      { kind: "preview", key: "preview", scrollTop: 0 },
      { kind: "outline", key: "outline", scrollTop: 0 },
      { kind: "chapter-notes", key: "chapter-notes", scrollTop: 0 },
      { kind: "library", key: "library", scrollTop: 0 },
      { kind: "assistant", key: "assistant", scrollTop: 0 },
      { kind: "publication", id: "item", key: "publication:item", scrollTop: 0 },
      { kind: "candidate", id: "revision", key: "candidate:revision", scrollTop: 0 },
    ];
    const panelIds = [
      "context-preview-panel",
      "context-outline-panel",
      "context-chapter-notes-panel",
      "context-library-panel",
      "context-assistant-panel",
      "context-publication-panel",
      "context-candidate-panel",
      "context-pdf-panel",
    ];

    for (const [index, tab] of tabs.entries()) {
      strip.setTabs(sources(tab.key, tabs, { chapterNotesAvailable: true }));
      expect(panelIds.filter((id) => strip.panels.get(id)?.hidden === false)).toEqual([panelIds[index]]);
      expect(strip.panels.get("preview-context-controls")?.hidden).toBe(tab.key !== "preview");
      expect(strip.panels.get("preview-sync-controls")?.visible).toBe(tab.key === "preview");
      expect(strip.panels.get("preview-navigation-control")?.previewActive).toBe(tab.key === "preview");
      expect(strip.panels.get("pdf-context-controls")?.hidden).toBe(true);
    }
  });

  it("captures and restores fixed-panel scroll positions", () => {
    const strip = new TestContextTabStrip();

    strip.setTabs(sources("preview", [{ kind: "preview", key: "preview", scrollTop: 16 }]));
    expect(strip.fixedScrollTop("preview")).toBe(16);
    expect(strip.panels.get("preview-scroll")?.scrollTop).toBe(16);
    strip.setTabs(sources("outline", [{ kind: "outline", key: "outline", scrollTop: 70 }]));
    const outlineScroll = strip.panels.get("context-outline-scroll");
    if (!outlineScroll) throw new Error("Outline scroll container was not restored");
    outlineScroll.scrollTop = 96;
    expect(strip.fixedScrollTop("outline")).toBe(96);
    strip.setTabs(sources("library", [{ kind: "library", key: "library", scrollTop: 42 }]));
    expect(strip.fixedScrollTop("library")).toBe(42);
    expect(strip.fixedScrollTop("outline")).toBe(96);
    strip.setTabs(sources("assistant", [{ kind: "assistant", key: "assistant", scrollTop: 24 }]));
    expect(strip.panels.get("context-assistant-scroll")?.scrollTop).toBe(24);
    expect(strip.fixedScrollTop("publication:item")).toBeNull();
    strip.setTabs(sources("outline", [{ kind: "outline", key: "outline", scrollTop: 96 }]));
    expect(outlineScroll.scrollTop).toBe(96);
  });

  it("moves roving focus only for unmodified navigation keys", () => {
    const strip = new TestContextTabStrip();
    const focused: string[] = [];
    const previewTab = { tabIndex: 0, focus: () => focused.push("preview") };
    const libraryTab = { tabIndex: -1, focus: () => focused.push("library") };
    const tabs = [previewTab, libraryTab];
    Object.defineProperty(strip, "querySelectorAll", { value: (selector: string) => (selector === "[role=tab]" ? tabs : []) });
    const keydown = (key: string, target: object, modifier?: "altKey" | "ctrlKey" | "metaKey"): Event => {
      const event = new Event("keydown", { cancelable: true });
      Object.defineProperties(event, {
        altKey: { value: modifier === "altKey" },
        ctrlKey: { value: modifier === "ctrlKey" },
        key: { value: key },
        metaKey: { value: modifier === "metaKey" },
        target: { value: target },
      });
      return event;
    };

    const forward = keydown("ArrowRight", previewTab);
    strip.moveFocusForTest(forward);
    expect(forward.defaultPrevented).toBe(true);
    for (const event of [
      keydown("ArrowRight", libraryTab, "metaKey"),
      keydown("ArrowRight", libraryTab, "altKey"),
      keydown("ArrowRight", libraryTab, "ctrlKey"),
      keydown("Enter", libraryTab),
      keydown("ArrowRight", {}),
    ]) {
      strip.moveFocusForTest(event);
      expect(event.defaultPrevented).toBe(false);
    }

    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0]);
    expect(focused).toEqual(["library"]);
  });
});
