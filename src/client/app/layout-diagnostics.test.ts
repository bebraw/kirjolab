import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeLayoutDiagnosticsReport,
  layoutDiagnosticsEnabled,
  startLayoutDiagnostics,
  type LayoutDiagnosticsController,
} from "./layout-diagnostics";

interface FakeRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

class FakeElement extends EventTarget {
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  className = "";
  clientHeight = 40;
  clientWidth = 100;
  hidden = false;
  id = "";
  parentElement: FakeElement | null = null;
  scrollHeight = 40;
  scrollWidth = 100;
  textContent = "";
  type = "";
  value = "";
  readonly tagName: string;
  rect: FakeRect;

  constructor(tagName: string, rect = fakeRect(0, 0, 100, 40)) {
    super();
    this.tagName = tagName.toUpperCase();
    this.rect = rect;
  }

  get classList(): readonly string[] {
    return this.className.split(/\s+/u).filter(Boolean);
  }

  get offsetHeight(): number {
    return this.clientHeight;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  closest(selector: string): FakeElement | null {
    if (selector !== "#layout-debug-panel") return null;
    if (this.id === "layout-debug-panel") return this;
    return this.parentElement?.closest(selector) ?? null;
  }

  getBoundingClientRect(): FakeRect {
    return this.rect;
  }

  remove(): void {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }

  select(): void {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  findById(id: string): FakeElement | null {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.findById(id);
      if (found) return found;
    }
    return null;
  }

  descendants(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
}

class FakeDocument extends EventTarget {
  activeElement: FakeElement | null = null;
  readonly body = new FakeElement("body", fakeRect(0, 0, 1194, 834));
  readonly documentElement = new FakeElement("html", fakeRect(0, 0, 1194, 834));
  readonly elements = new Map<string, FakeElement>();
  execCommand = vi.fn(() => true);

  constructor() {
    super();
    this.documentElement.clientHeight = 834;
    this.documentElement.clientWidth = 1194;
    this.documentElement.scrollHeight = 834;
    this.documentElement.scrollWidth = 1194;
    this.body.clientHeight = 834;
    this.body.clientWidth = 1194;
    this.body.scrollHeight = 834;
    this.body.scrollWidth = 1194;
    this.body.dataset.appMode = "workspace";
    this.documentElement.append(this.body);
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }

  querySelector(selector: string): FakeElement | null {
    return this.elements.get(selector) ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector !== '[data-layout-debug-offender="true"]') return [];
    return this.documentElement.descendants().filter((element) => element.dataset.layoutDebugOffender === "true");
  }

  register(selector: string, element: FakeElement, parent = this.body): FakeElement {
    this.elements.set(selector, element);
    if (!element.parentElement) parent.append(element);
    return element;
  }
}

class FakeVisualViewport extends EventTarget {
  height = 760;
  offsetLeft = 0;
  offsetTop = 24;
  scale = 1;
  width = 1194;
}

class FakeWindow extends EventTarget {
  readonly cancelledFrames: number[] = [];
  readonly frames = new Map<number, FrameRequestCallback>();
  readonly media = new Map<string, boolean>([
    ["(display-mode: standalone)", false],
    ["(hover: none)", true],
    ["(min-width: 70rem)", true],
    ["(min-width: 90rem)", false],
    ["(orientation: landscape)", true],
    ["(pointer: coarse)", true],
  ]);
  readonly navigator = {
    maxTouchPoints: 5,
    platform: "iPad",
    standalone: false,
    userAgent: "Fake iPad WebKit",
  };
  readonly screen = {
    availHeight: 834,
    availWidth: 1194,
    height: 834,
    orientation: { angle: 90, type: "landscape-primary" },
    width: 1194,
  };
  devicePixelRatio = 2;
  innerHeight = 834;
  innerWidth = 1194;
  scrollX = 0;
  scrollY = 0;
  visualViewport: FakeVisualViewport | null = new FakeVisualViewport();
  #nextFrame = 1;

  cancelAnimationFrame(frame: number): void {
    this.cancelledFrames.push(frame);
    this.frames.delete(frame);
  }

  getComputedStyle(element: FakeElement) {
    return {
      display: element.style.display ?? "flex",
      flex: element.style.flex ?? "0 1 auto",
      flexShrink: element.style.flexShrink ?? "1",
      fontSize: element.style.fontSize ?? "16px",
      gridTemplateColumns: element.style.gridTemplateColumns ?? "none",
      maxWidth: element.style.maxWidth ?? "none",
      minWidth: element.style.minWidth ?? "0px",
      overflowX: element.style.overflowX ?? "visible",
      overflowY: element.style.overflowY ?? "visible",
      position: element.style.position ?? "static",
      visibility: element.style.visibility ?? "visible",
      whiteSpace: element.style.whiteSpace ?? "normal",
      width: element.style.width ?? `${element.rect.width}px`,
      getPropertyValue: (name: string) => element.style[name] ?? "",
    };
  }

  matchMedia(query: string): { matches: boolean } {
    return { matches: this.media.get(query) ?? false };
  }

  requestAnimationFrame(callback: FrameRequestCallback): number {
    const frame = this.#nextFrame;
    this.#nextFrame += 1;
    this.frames.set(frame, callback);
    return frame;
  }

  runFrames(): void {
    const frames = [...this.frames.entries()];
    this.frames.clear();
    for (const [frame, callback] of frames) callback(frame);
  }
}

interface TestEnvironment {
  readonly copy: ReturnType<typeof vi.fn>;
  readonly document: FakeDocument;
  readonly source: FakeElement;
  readonly toolbar: FakeElement;
  readonly toolbarAction: FakeElement;
  readonly window: FakeWindow;
}

interface ParsedReport {
  readonly current: {
    readonly activeElement: string | null;
    readonly findings: readonly { readonly kind: string }[];
    readonly media: {
      readonly coarsePointer: boolean;
      readonly landscape: boolean;
      readonly minimum70Rem: boolean;
      readonly minimum90Rem: boolean;
    };
    readonly offenderCount: number;
    readonly viewport: { readonly visual: { readonly height: number; readonly offsetTop: number; readonly width: number } | null };
    readonly workspace: { readonly activeSurface: string | null; readonly appMode: string | null; readonly layout: string | null };
  };
  readonly device: {
    readonly devicePixelRatio: number;
    readonly maxTouchPoints: number;
    readonly platform: string;
    readonly userAgent: string;
  };
  readonly history: readonly { readonly reason: string }[];
  readonly shell: string;
}

let controller: LayoutDiagnosticsController | null = null;

describe("layout diagnostics", () => {
  afterEach(() => {
    controller?.stop();
    controller = null;
    vi.unstubAllGlobals();
  });

  it("requires the exact layout-debug query opt-in without touching the DOM", () => {
    expect(layoutDiagnosticsEnabled(new URL("https://example.test/editor/demo?layout-debug=1"))).toBe(true);
    for (const value of ["", "0", "01", "true"]) {
      expect(layoutDiagnosticsEnabled(new URL(`https://example.test/editor/demo?layout-debug=${value}`))).toBe(false);
    }
    vi.stubGlobal(
      "document",
      new Proxy(
        {},
        {
          get: () => {
            throw new Error("disabled diagnostics accessed the document");
          },
        },
      ),
    );
    vi.stubGlobal("window", {});

    expect(startLayoutDiagnostics(new URL("https://example.test/editor/demo?layout-debug=true"))).toBeNull();
    expect(activeLayoutDiagnosticsReport("disabled")).toBeNull();
  });

  it("copies content-free iPad geometry and keeps a bounded event history", async () => {
    const environment = installEnvironment();
    environment.source.value = "private manuscript text";
    environment.source.dataset.workspaceId = "private-workspace-id";
    controller = startLayoutDiagnostics(new URL("https://example.test/editor/private-workspace-id?layout-debug=1"));
    expect(controller).not.toBeNull();
    expect(startLayoutDiagnostics(new URL("https://example.test/editor/other?layout-debug=1"))).toBe(controller);

    const panel = environment.document.body.findById("layout-debug-panel");
    const status = environment.document.body.findById("layout-debug-status");
    const copyStatus = environment.document.body.findById("layout-debug-copy-status");
    const copy = environment.document.body.findById("copy-layout-debug");
    expect(panel?.attributes.get("role")).toBe("region");
    expect(status?.textContent).toContain("viewport 1194×760");
    expect(panel?.style.top).toBe("732px");
    expect(environment.document.documentElement.dataset.layoutDebug).toBe("true");

    environment.document.activeElement = environment.source;
    environment.document.dispatchEvent(new Event("focusin"));
    environment.window.dispatchEvent(new Event("resize"));
    environment.window.dispatchEvent(new Event("orientationchange"));
    if (environment.window.visualViewport) {
      environment.window.visualViewport.height = 500;
      environment.window.visualViewport.offsetLeft = 20;
      environment.window.visualViewport.offsetTop = 100;
      environment.window.visualViewport.width = 800;
    }
    if (panel) panel.clientHeight = 120;
    environment.window.visualViewport?.dispatchEvent(new Event("resize"));
    environment.window.visualViewport?.dispatchEvent(new Event("scroll"));
    expect(panel?.style.top).toBe("468px");
    expect(panel?.style.right).toBe("386px");
    expect(panel?.style.maxWidth).toBe("776px");
    environment.window.runFrames();
    for (let index = 0; index < 20; index += 1) {
      environment.window.dispatchEvent(new Event("resize"));
      environment.window.runFrames();
    }
    environment.document.dispatchEvent(new Event("focusout"));
    environment.window.runFrames();
    if (panel) panel.clientHeight = 150;
    copy?.dispatchEvent(new Event("pointerdown"));
    environment.document.dispatchEvent(new Event("focusout"));
    copy?.dispatchEvent(new Event("click"));
    await vi.waitFor(() => expect(copyStatus?.textContent).toBe("Copied."));
    expect(panel?.style.top).toBe("438px");
    expect(environment.copy).toHaveBeenCalledOnce();

    const copied = String(environment.copy.mock.calls[0]?.[0]);
    const report = parseReport(copied);
    expect(report.shell).toBe("development");
    expect(report.device).toMatchObject({
      devicePixelRatio: 2,
      maxTouchPoints: 5,
      platform: "iPad",
      userAgent: "Fake iPad WebKit",
    });
    expect(report.current).toMatchObject({
      activeElement: "#source-editor",
      media: { coarsePointer: true, landscape: true, minimum70Rem: true, minimum90Rem: false },
      viewport: { visual: { height: 500, offsetTop: 100, width: 800 } },
      workspace: { activeSurface: "authoring", appMode: "workspace", layout: "split" },
    });
    expect(report.history).toHaveLength(16);
    expect(report.history.at(-3)?.reason).toBe("copy-pointerdown");
    expect(report.history.at(-2)?.reason).toBe("focus-out");
    expect(report.history.at(-1)?.reason).toBe("panel-copy");
    expect(copied).not.toContain("private manuscript text");
    expect(copied).not.toContain("private-workspace-id");

    const visualViewport = environment.window.visualViewport;
    controller?.stop();
    controller = null;
    environment.window.dispatchEvent(new Event("resize"));
    environment.document.dispatchEvent(new Event("focusin"));
    visualViewport?.dispatchEvent(new Event("resize"));
    expect(environment.window.frames.size).toBe(0);
  });

  it("marks bounded target overflow and sibling collisions until refresh", () => {
    const environment = installEnvironment();
    const overlappingAction = new FakeElement("button", fakeRect(100, 100, 80, 36));
    overlappingAction.className = "button-secondary";
    const offscreenAction = new FakeElement("button", fakeRect(1200, 100, 48, 36));
    offscreenAction.className = "button-secondary";
    environment.toolbar.append(overlappingAction, offscreenAction);
    environment.toolbar.scrollWidth = 650;
    environment.document.documentElement.scrollWidth = 1248;
    controller = startLayoutDiagnostics(new URL("https://example.test/editor/demo?layout-debug=1"));

    expect(environment.toolbarAction.dataset.layoutDebugOffender).toBe("true");
    expect(overlappingAction.dataset.layoutDebugOffender).toBe("true");
    expect(offscreenAction.dataset.layoutDebugOffender).toBe("true");
    expect(environment.toolbar.dataset.layoutDebugOffender).toBe("true");
    const report = parseReport(activeLayoutDiagnosticsReport("test-overflow") ?? "");
    expect(report.current.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "viewport-overflow" }),
        expect.objectContaining({ kind: "sibling-overlap" }),
        expect.objectContaining({ kind: "self-overflow" }),
      ]),
    );
    expect(report.current.offenderCount).toBe(4);

    overlappingAction.rect = fakeRect(300, 100, 80, 36);
    offscreenAction.rect = fakeRect(400, 100, 48, 36);
    environment.toolbar.scrollWidth = environment.toolbar.clientWidth;
    environment.document.documentElement.scrollWidth = 1194;
    environment.document.body.findById("refresh-layout-debug")?.dispatchEvent(new Event("click"));
    expect(environment.toolbarAction.dataset.layoutDebugOffender).toBeUndefined();
    expect(overlappingAction.dataset.layoutDebugOffender).toBeUndefined();
    expect(offscreenAction.dataset.layoutDebugOffender).toBeUndefined();
    expect(environment.toolbar.dataset.layoutDebugOffender).toBeUndefined();
    expect(environment.document.body.findById("layout-debug-status")?.textContent).toContain("offenders 0");
  });

  it("normalizes target rectangles after horizontal viewport panning", () => {
    const environment = installEnvironment();
    const targets = new Set([...environment.document.elements.values(), environment.toolbarAction]);
    for (const target of targets) target.rect = shiftedRect(target.rect, -48);
    environment.window.scrollX = 48;

    controller = startLayoutDiagnostics(new URL("https://example.test/editor/demo?layout-debug=1"));

    const report = parseReport(activeLayoutDiagnosticsReport("panned") ?? "");
    expect(report.current.offenderCount).toBe(0);
    expect(report.current.findings).not.toEqual(expect.arrayContaining([expect.objectContaining({ kind: "viewport-overflow" })]));
  });

  it("reports an absent visual viewport and removes every listener and marker", () => {
    const environment = installEnvironment();
    environment.window.visualViewport = null;
    environment.toolbarAction.rect = fakeRect(1200, 100, 48, 36);
    controller = startLayoutDiagnostics(new URL("https://example.test/editor/demo?layout-debug=1"));
    const report = parseReport(activeLayoutDiagnosticsReport("no-visual-viewport") ?? "");
    expect(report.current.viewport.visual).toBeNull();
    expect(environment.toolbarAction.dataset.layoutDebugOffender).toBe("true");

    environment.window.dispatchEvent(new Event("resize"));
    expect(environment.window.frames.size).toBe(1);
    controller?.stop();
    controller?.stop();
    controller = null;
    expect(environment.window.cancelledFrames).toHaveLength(1);
    expect(environment.toolbarAction.dataset.layoutDebugOffender).toBeUndefined();
    expect(environment.document.documentElement.dataset.layoutDebug).toBeUndefined();
    expect(environment.document.body.findById("layout-debug-panel")).toBeNull();
    expect(activeLayoutDiagnosticsReport("stopped")).toBeNull();
  });

  it("shows a local copy failure without throwing", async () => {
    const environment = installEnvironment();
    environment.copy.mockRejectedValue(new Error("denied"));
    environment.document.execCommand.mockReturnValue(false);
    controller = startLayoutDiagnostics(new URL("https://example.test/editor/demo?layout-debug=1"));
    environment.document.body.findById("copy-layout-debug")?.dispatchEvent(new Event("click"));

    const copyStatus = environment.document.body.findById("layout-debug-copy-status");
    await vi.waitFor(() => expect(copyStatus?.textContent).toBe("Copy failed."));
  });
});

function installEnvironment(): TestEnvironment {
  const documentTarget = new FakeDocument();
  const browserWindow = new FakeWindow();
  const header = documentTarget.register("#app-header", configuredElement("header", "app-header", fakeRect(0, 0, 1194, 64)));
  const headerRow = documentTarget.register(".app-header-row", configuredElement("div", "", fakeRect(0, 0, 1194, 64)), header);
  const headerPrimary = documentTarget.register(
    ".app-header-primary",
    configuredElement("div", "", fakeRect(0, 0, 700, 64), "app-header-primary"),
    headerRow,
  );
  documentTarget.register(
    ".app-header-secondary",
    configuredElement("div", "", fakeRect(720, 0, 474, 64), "app-header-secondary"),
    headerRow,
  );
  const workspaceSwitcherControl = documentTarget.register(
    "#workspace-switcher-control",
    configuredElement("workspace-switcher-control", "workspace-switcher-control", fakeRect(300, 12, 220, 40)),
    headerPrimary,
  );
  documentTarget.register(
    "#workspace-switcher",
    configuredElement("select", "workspace-switcher", fakeRect(300, 12, 220, 40)),
    workspaceSwitcherControl,
  );
  documentTarget.register(".header-action-menu", configuredElement("details", "", fakeRect(540, 12, 90, 40)), headerPrimary);
  documentTarget.register("#account-menu", configuredElement("details", "account-menu", fakeRect(1138, 12, 40, 40)));
  const workspace = documentTarget.register(
    "#workspace-surfaces",
    configuredElement("main", "workspace-surfaces", fakeRect(0, 64, 1194, 770), "workspace-grid"),
  );
  workspace.dataset.activeSurface = "authoring";
  workspace.dataset.layout = "split";
  documentTarget.register(".source-rail", configuredElement("aside", "", fakeRect(0, 64, 0, 770), "source-rail"), workspace);
  const authoring = documentTarget.register(
    "#authoring-surface",
    configuredElement("section", "authoring-surface", fakeRect(0, 64, 600, 770)),
    workspace,
  );
  documentTarget.register("#context-surface", configuredElement("section", "context-surface", fakeRect(600, 64, 594, 770)), workspace);
  const toolbar = documentTarget.register(
    ".editor-toolbar",
    configuredElement("div", "", fakeRect(0, 64, 600, 48), "editor-toolbar"),
    authoring,
  );
  const toolbarAction = configuredElement("button", "", fakeRect(20, 70, 120, 36), "button-secondary");
  toolbar.append(toolbarAction);
  const shell = documentTarget.register(
    "#source-editor-shell",
    configuredElement("div", "source-editor-shell", fakeRect(0, 112, 600, 722)),
    authoring,
  );
  const source = documentTarget.register(
    "#source-editor",
    configuredElement("textarea", "source-editor", fakeRect(16, 128, 568, 690)),
    shell,
  );
  documentTarget.register(
    "#source-editor-highlight",
    configuredElement("pre", "source-editor-highlight", fakeRect(16, 128, 568, 690)),
    shell,
  );
  const copy = vi.fn(async () => undefined);
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", documentTarget);
  vi.stubGlobal("window", browserWindow);
  vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
  return { copy, document: documentTarget, source, toolbar, toolbarAction, window: browserWindow };
}

function configuredElement(tagName: string, id: string, rect: FakeRect, className = ""): FakeElement {
  const element = new FakeElement(tagName, rect);
  element.id = id;
  element.className = className;
  element.clientHeight = rect.height;
  element.clientWidth = rect.width;
  element.scrollHeight = rect.height;
  element.scrollWidth = rect.width;
  return element;
}

function fakeRect(left: number, top: number, width: number, height: number): FakeRect {
  return { bottom: top + height, height, left, right: left + width, top, width };
}

function shiftedRect(rect: FakeRect, horizontal: number): FakeRect {
  return { ...rect, left: rect.left + horizontal, right: rect.right + horizontal };
}

function parseReport(value: string): ParsedReport {
  const json = value.slice(value.indexOf("\n") + 1);
  return JSON.parse(json);
}
