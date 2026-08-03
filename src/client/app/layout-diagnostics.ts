import { copyText } from "../platform/clipboard";
import { applicationVersion } from "../platform/offline-service-worker";

const diagnosticTargetSelectors = [
  "#app-header",
  ".app-header-row",
  ".app-header-primary",
  ".app-header-secondary",
  "#workspace-switcher-control",
  "#workspace-switcher",
  ".header-action-menu",
  "#account-menu",
  "#workspace-surfaces",
  ".source-rail",
  "#authoring-surface",
  "#context-surface",
  ".editor-toolbar",
  "#source-editor-shell",
  "#source-editor",
  "#source-editor-highlight",
] as const;

const siblingContainerSelectors = [".app-header-primary", ".app-header-secondary", "#workspace-surfaces", ".editor-toolbar"] as const;

const safeElementIds = new Set([
  "account-menu",
  "app-header",
  "authoring-surface",
  "connection-status-panel",
  "context-surface",
  "copy-layout-debug",
  "layout-debug-panel",
  "layout-debug-status",
  "open-export",
  "refresh-layout-debug",
  "share-workspace",
  "source-editor",
  "source-editor-highlight",
  "source-editor-shell",
  "workspace-layout-control",
  "workspace-surfaces",
  "workspace-switcher",
  "workspace-switcher-control",
]);

const historyLimit = 16;
const findingLimit = 48;
const targetLimit = 80;
const overflowTolerance = 1;

interface LayoutRect {
  readonly bottom: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
}

interface VisualViewportSnapshot {
  readonly height: number;
  readonly offsetLeft: number;
  readonly offsetTop: number;
  readonly scale: number;
  readonly width: number;
}

interface LayoutTimelineEntry {
  readonly activeElement: string | null;
  readonly capturedAt: string;
  readonly document: {
    readonly clientHeight: number;
    readonly clientWidth: number;
    readonly scrollHeight: number;
    readonly scrollWidth: number;
  };
  readonly media: LayoutMediaSnapshot;
  readonly reason: string;
  readonly viewport: {
    readonly innerHeight: number;
    readonly innerWidth: number;
    readonly scrollX: number;
    readonly scrollY: number;
    readonly visual: VisualViewportSnapshot | null;
  };
  readonly workspace: {
    readonly activeSurface: string | null;
    readonly appMode: string | null;
    readonly layout: string | null;
  };
}

interface LayoutMediaSnapshot {
  readonly coarsePointer: boolean;
  readonly hoverNone: boolean;
  readonly landscape: boolean;
  readonly minimum70Rem: boolean;
  readonly minimum90Rem: boolean;
  readonly standalone: boolean;
}

interface TargetMeasurement {
  readonly clientHeight: number;
  readonly clientWidth: number;
  readonly label: string;
  readonly rect: LayoutRect;
  readonly scrollHeight: number;
  readonly scrollWidth: number;
  readonly style: {
    readonly display: string;
    readonly flex: string;
    readonly flexShrink: string;
    readonly fontSize: string;
    readonly gridTemplateColumns: string;
    readonly maxWidth: string;
    readonly minWidth: string;
    readonly overflowX: string;
    readonly overflowY: string;
    readonly position: string;
    readonly textSizeAdjust: string;
    readonly whiteSpace: string;
    readonly width: string;
  };
}

interface ViewportOverflowFinding {
  readonly element: string;
  readonly excessLeft: number;
  readonly excessRight: number;
  readonly kind: "viewport-overflow";
}

interface SiblingOverlapFinding {
  readonly container: string;
  readonly first: string;
  readonly horizontalOverlap: number;
  readonly kind: "sibling-overlap";
  readonly second: string;
  readonly verticalOverlap: number;
}

interface SelfOverflowFinding {
  readonly element: string;
  readonly horizontalOverflow: number;
  readonly kind: "self-overflow";
  readonly verticalOverflow: number;
}

type LayoutFinding = ViewportOverflowFinding | SiblingOverlapFinding | SelfOverflowFinding;

interface LayoutCapture extends LayoutTimelineEntry {
  readonly findings: readonly LayoutFinding[];
  readonly offenderCount: number;
  readonly targets: readonly TargetMeasurement[];
}

interface DiagnosticTarget {
  readonly element: HTMLElement;
  readonly label: string;
}

let activeDiagnostics: LayoutDiagnosticsController | null = null;

export function layoutDiagnosticsEnabled(url: URL): boolean {
  return url.searchParams.get("layout-debug") === "1";
}

export function startLayoutDiagnostics(url = new URL(location.href)): LayoutDiagnosticsController | null {
  if (!layoutDiagnosticsEnabled(url)) return null;
  if (activeDiagnostics) return activeDiagnostics;
  activeDiagnostics = new LayoutDiagnosticsController(window, document);
  activeDiagnostics.start();
  return activeDiagnostics;
}

export function activeLayoutDiagnosticsReport(reason: string): string | null {
  return activeDiagnostics?.report(reason) ?? null;
}

export class LayoutDiagnosticsController {
  readonly #browserWindow: Window;
  readonly #document: Document;
  readonly #history: LayoutTimelineEntry[] = [];
  readonly #pendingReasons = new Set<string>();
  readonly #panel: HTMLElement;
  readonly #status: HTMLElement;
  readonly #copyStatus: HTMLElement;
  readonly #refreshButton: HTMLButtonElement;
  readonly #copyButton: HTMLButtonElement;
  #frame: number | null = null;
  #lastOffenderCount = 0;
  #started = false;

  constructor(browserWindow: Window, browserDocument: Document) {
    this.#browserWindow = browserWindow;
    this.#document = browserDocument;
    const panel = browserDocument.createElement("aside");
    panel.className = "layout-debug-panel";
    panel.id = "layout-debug-panel";
    panel.setAttribute("aria-label", "Layout diagnostics");
    panel.setAttribute("role", "region");

    const label = browserDocument.createElement("strong");
    label.textContent = "Layout debug";
    const status = browserDocument.createElement("span");
    status.className = "layout-debug-status";
    status.id = "layout-debug-status";
    const refreshButton = diagnosticButton(browserDocument, "refresh-layout-debug", "Refresh");
    const copyButton = diagnosticButton(browserDocument, "copy-layout-debug", "Copy report");
    const copyStatus = browserDocument.createElement("span");
    copyStatus.className = "layout-debug-copy-status";
    copyStatus.id = "layout-debug-copy-status";
    copyStatus.hidden = true;
    copyStatus.setAttribute("aria-live", "polite");
    copyStatus.setAttribute("role", "status");
    panel.append(label, status, refreshButton, copyButton, copyStatus);

    this.#panel = panel;
    this.#status = status;
    this.#copyStatus = copyStatus;
    this.#refreshButton = refreshButton;
    this.#copyButton = copyButton;
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#document.documentElement.dataset.layoutDebug = "true";
    this.#document.body.append(this.#panel);
    this.#positionPanel();
    this.#refreshButton.addEventListener("click", this.#refresh);
    this.#copyButton.addEventListener("pointerdown", this.#captureBeforeCopy);
    this.#copyButton.addEventListener("click", this.#copy);
    this.#browserWindow.addEventListener("resize", this.#windowResize);
    this.#browserWindow.addEventListener("orientationchange", this.#orientationChange);
    this.#document.addEventListener("focusin", this.#focusIn);
    this.#document.addEventListener("focusout", this.#focusOut);
    this.#browserWindow.visualViewport?.addEventListener("resize", this.#visualViewportResize);
    this.#browserWindow.visualViewport?.addEventListener("scroll", this.#visualViewportScroll);
    this.#refreshCapture("enabled");
  }

  stop(): void {
    if (!this.#started) return;
    this.#started = false;
    if (this.#frame !== null) this.#browserWindow.cancelAnimationFrame(this.#frame);
    this.#frame = null;
    this.#pendingReasons.clear();
    this.#refreshButton.removeEventListener("click", this.#refresh);
    this.#copyButton.removeEventListener("pointerdown", this.#captureBeforeCopy);
    this.#copyButton.removeEventListener("click", this.#copy);
    this.#browserWindow.removeEventListener("resize", this.#windowResize);
    this.#browserWindow.removeEventListener("orientationchange", this.#orientationChange);
    this.#document.removeEventListener("focusin", this.#focusIn);
    this.#document.removeEventListener("focusout", this.#focusOut);
    this.#browserWindow.visualViewport?.removeEventListener("resize", this.#visualViewportResize);
    this.#browserWindow.visualViewport?.removeEventListener("scroll", this.#visualViewportScroll);
    clearOffenderMarkers(this.#document);
    this.#panel.remove();
    delete this.#document.documentElement.dataset.layoutDebug;
    if (activeDiagnostics === this) activeDiagnostics = null;
  }

  report(reason: string): string {
    this.#flushScheduledCapture();
    const current = this.#refreshCapture(reason);
    const report = {
      schemaVersion: 1,
      shell: applicationVersion,
      device: deviceSnapshot(this.#browserWindow),
      current,
      history: [...this.#history],
    };
    return `Kirjolab layout diagnostics\n${JSON.stringify(report, null, 2)}`;
  }

  readonly #refresh = (): void => {
    this.#refreshCapture("manual-refresh");
  };

  readonly #captureBeforeCopy = (): void => {
    this.#record("copy-pointerdown");
  };

  readonly #copy = (): void => {
    void this.#copyReport();
  };

  readonly #windowResize = (): void => this.#repositionAndSchedule("window-resize");
  readonly #orientationChange = (): void => this.#repositionAndSchedule("orientation-change");
  readonly #focusIn = (): void => this.#schedule("focus-in");
  readonly #focusOut = (): void => this.#schedule("focus-out");
  readonly #visualViewportResize = (): void => this.#repositionAndSchedule("visual-viewport-resize");
  readonly #visualViewportScroll = (): void => this.#repositionAndSchedule("visual-viewport-scroll");

  async #copyReport(): Promise<void> {
    this.#copyStatus.hidden = true;
    try {
      await copyText(this.report("panel-copy"));
      this.#copyStatus.textContent = "Copied.";
    } catch {
      this.#copyStatus.textContent = "Copy failed.";
    }
    this.#copyStatus.hidden = false;
    this.#positionPanel();
  }

  #schedule(reason: string): void {
    this.#pendingReasons.add(reason);
    if (this.#frame !== null) return;
    this.#frame = this.#browserWindow.requestAnimationFrame(() => {
      this.#frame = null;
      const reasons = [...this.#pendingReasons];
      this.#pendingReasons.clear();
      this.#record(reasons.join("+"));
    });
  }

  #repositionAndSchedule(reason: string): void {
    this.#positionPanel();
    this.#schedule(reason);
  }

  #positionPanel(): void {
    const viewport = this.#browserWindow.visualViewport;
    if (!viewport) return;
    const edge = 12;
    const top = Math.max(viewport.offsetTop + edge, viewport.offsetTop + viewport.height - this.#panel.offsetHeight - edge);
    const right = Math.max(edge, this.#browserWindow.innerWidth - viewport.offsetLeft - viewport.width + edge);
    this.#panel.style.top = `${rounded(top)}px`;
    this.#panel.style.right = `${rounded(right)}px`;
    this.#panel.style.bottom = "auto";
    this.#panel.style.maxWidth = `${Math.max(0, rounded(viewport.width - edge * 2))}px`;
  }

  #flushScheduledCapture(): void {
    if (this.#frame === null) return;
    this.#browserWindow.cancelAnimationFrame(this.#frame);
    this.#frame = null;
    const reasons = [...this.#pendingReasons];
    this.#pendingReasons.clear();
    if (reasons.length > 0) this.#record(reasons.join("+"));
  }

  #record(reason: string): LayoutTimelineEntry {
    const entry = collectTimelineEntry(reason, this.#browserWindow, this.#document);
    this.#history.push(entry);
    if (this.#history.length > historyLimit) this.#history.splice(0, this.#history.length - historyLimit);
    this.#renderStatus(entry, this.#lastOffenderCount);
    return entry;
  }

  #refreshCapture(reason: string): LayoutCapture {
    const entry = collectLayoutCapture(reason, this.#browserWindow, this.#document);
    this.#history.push(timelineEntry(entry));
    if (this.#history.length > historyLimit) this.#history.splice(0, this.#history.length - historyLimit);
    this.#lastOffenderCount = entry.offenderCount;
    this.#renderStatus(entry, entry.offenderCount);
    return entry;
  }

  #renderStatus(entry: LayoutTimelineEntry, offenderCount: number): void {
    const horizontalOverflow = Math.max(0, entry.document.scrollWidth - entry.document.clientWidth);
    const verticalOverflow = Math.max(0, entry.document.scrollHeight - entry.document.clientHeight);
    const viewportWidth = entry.viewport.visual?.width ?? entry.viewport.innerWidth;
    const viewportHeight = entry.viewport.visual?.height ?? entry.viewport.innerHeight;
    this.#status.textContent = `viewport ${Math.round(viewportWidth)}×${Math.round(viewportHeight)} · page x +${horizontalOverflow} / y +${verticalOverflow} · offenders ${offenderCount}`;
    this.#positionPanel();
  }
}

function diagnosticButton(documentTarget: Document, id: string, label: string): HTMLButtonElement {
  const button = documentTarget.createElement("button");
  button.className = "layout-debug-action";
  button.id = id;
  button.type = "button";
  button.textContent = label;
  return button;
}

function collectLayoutCapture(reason: string, browserWindow: Window, documentTarget: Document): LayoutCapture {
  clearOffenderMarkers(documentTarget);
  const timeline = collectTimelineEntry(reason, browserWindow, documentTarget);
  const targets = collectDiagnosticTargets(browserWindow, documentTarget);
  const viewportFindings: ViewportOverflowFinding[] = [];
  const selfFindings: SelfOverflowFinding[] = [];
  const offenders = new Set<HTMLElement>();
  const measurements = targets.map(({ element, label }) => {
    const measurement = measureTarget(browserWindow, element, label);
    const documentLeft = measurement.rect.left + browserWindow.scrollX;
    const documentRight = measurement.rect.right + browserWindow.scrollX;
    const excessLeft = Math.max(0, -documentLeft);
    const excessRight = Math.max(0, documentRight - timeline.document.clientWidth);
    if (excessLeft > overflowTolerance || excessRight > overflowTolerance) {
      viewportFindings.push({
        element: label,
        excessLeft: rounded(excessLeft),
        excessRight: rounded(excessRight),
        kind: "viewport-overflow",
      });
      offenders.add(element);
    }
    const horizontalOverflow = Math.max(0, measurement.scrollWidth - measurement.clientWidth);
    const verticalOverflow = Math.max(0, measurement.scrollHeight - measurement.clientHeight);
    if (horizontalOverflow > overflowTolerance) {
      selfFindings.push({ element: label, horizontalOverflow, kind: "self-overflow", verticalOverflow });
      offenders.add(element);
    }
    return measurement;
  });
  const overlapFindings = collectSiblingOverlaps(browserWindow, documentTarget, offenders);
  for (const element of offenders) element.dataset.layoutDebugOffender = "true";
  const findings = [...viewportFindings, ...overlapFindings, ...selfFindings].slice(0, findingLimit);
  return { ...timeline, findings, offenderCount: offenders.size, targets: measurements };
}

function collectTimelineEntry(reason: string, browserWindow: Window, documentTarget: Document): LayoutTimelineEntry {
  const root = documentTarget.documentElement;
  const workspace = documentTarget.querySelector<HTMLElement>("#workspace-surfaces");
  const visualViewport = browserWindow.visualViewport;
  return {
    activeElement: safeActiveElementLabel(documentTarget.activeElement),
    capturedAt: new Date().toISOString(),
    document: {
      clientHeight: root.clientHeight,
      clientWidth: root.clientWidth,
      scrollHeight: root.scrollHeight,
      scrollWidth: root.scrollWidth,
    },
    media: mediaSnapshot(browserWindow),
    reason,
    viewport: {
      innerHeight: browserWindow.innerHeight,
      innerWidth: browserWindow.innerWidth,
      scrollX: browserWindow.scrollX,
      scrollY: browserWindow.scrollY,
      visual: visualViewport
        ? {
            height: rounded(visualViewport.height),
            offsetLeft: rounded(visualViewport.offsetLeft),
            offsetTop: rounded(visualViewport.offsetTop),
            scale: rounded(visualViewport.scale),
            width: rounded(visualViewport.width),
          }
        : null,
    },
    workspace: {
      activeSurface: workspace?.dataset.activeSurface ?? null,
      appMode: documentTarget.body.dataset.appMode ?? null,
      layout: workspace?.dataset.layout ?? null,
    },
  };
}

function timelineEntry(capture: LayoutCapture): LayoutTimelineEntry {
  const { findings: _findings, offenderCount: _offenderCount, targets: _targets, ...entry } = capture;
  return entry;
}

function collectDiagnosticTargets(browserWindow: Window, documentTarget: Document): DiagnosticTarget[] {
  const targets: DiagnosticTarget[] = [];
  const seen = new Set<HTMLElement>();
  const add = (element: HTMLElement | null, label: string): void => {
    if (!element || seen.has(element) || element.closest("#layout-debug-panel") || !visibleElement(browserWindow, element)) return;
    seen.add(element);
    targets.push({ element, label });
  };
  for (const selector of diagnosticTargetSelectors) add(documentTarget.querySelector<HTMLElement>(selector), selector);
  for (const selector of siblingContainerSelectors) {
    const container = documentTarget.querySelector<HTMLElement>(selector);
    if (!container) continue;
    for (const child of Array.from(container.children)) {
      if (targets.length >= targetLimit) break;
      if (child instanceof HTMLElement) add(child, safeElementLabel(child));
    }
  }
  return targets.slice(0, targetLimit);
}

function collectSiblingOverlaps(browserWindow: Window, documentTarget: Document, offenders: Set<HTMLElement>): SiblingOverlapFinding[] {
  return siblingContainerSelectors.flatMap((selector) =>
    containerOverlapFindings(browserWindow, documentTarget.querySelector<HTMLElement>(selector), selector, offenders),
  );
}

function containerOverlapFindings(
  browserWindow: Window,
  container: HTMLElement | null,
  label: string,
  offenders: Set<HTMLElement>,
): SiblingOverlapFinding[] {
  if (!container) return [];
  const children = Array.from(container.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && visibleElement(browserWindow, child),
  );
  return elementPairs(children).flatMap(([first, second]) => {
    const finding = siblingOverlapFinding(label, first, second);
    if (!finding) return [];
    offenders.add(first);
    offenders.add(second);
    return [finding];
  });
}

function elementPairs(elements: readonly HTMLElement[]): Array<readonly [HTMLElement, HTMLElement]> {
  const pairs: Array<readonly [HTMLElement, HTMLElement]> = [];
  for (let firstIndex = 0; firstIndex < elements.length; firstIndex += 1) {
    const first = elements[firstIndex];
    if (!first) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < elements.length; secondIndex += 1) {
      const second = elements[secondIndex];
      if (second) pairs.push([first, second]);
    }
  }
  return pairs;
}

function siblingOverlapFinding(container: string, first: HTMLElement, second: HTMLElement): SiblingOverlapFinding | null {
  const firstRect = first.getBoundingClientRect();
  const secondRect = second.getBoundingClientRect();
  const horizontalOverlap = Math.min(firstRect.right, secondRect.right) - Math.max(firstRect.left, secondRect.left);
  const verticalOverlap = Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top);
  if (horizontalOverlap <= overflowTolerance || verticalOverlap <= overflowTolerance) return null;
  return {
    container,
    first: safeElementLabel(first),
    horizontalOverlap: rounded(horizontalOverlap),
    kind: "sibling-overlap",
    second: safeElementLabel(second),
    verticalOverlap: rounded(verticalOverlap),
  };
}

function measureTarget(browserWindow: Window, element: HTMLElement, label: string): TargetMeasurement {
  const style = browserWindow.getComputedStyle(element);
  return {
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    label,
    rect: rectSnapshot(element.getBoundingClientRect()),
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
    style: {
      display: style.display,
      flex: style.flex,
      flexShrink: style.flexShrink,
      fontSize: style.fontSize,
      gridTemplateColumns: style.gridTemplateColumns,
      maxWidth: style.maxWidth,
      minWidth: style.minWidth,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      position: style.position,
      textSizeAdjust: style.getPropertyValue("-webkit-text-size-adjust") || style.getPropertyValue("text-size-adjust"),
      whiteSpace: style.whiteSpace,
      width: style.width,
    },
  };
}

function visibleElement(browserWindow: Window, element: HTMLElement): boolean {
  const style = browserWindow.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return !element.hidden && style.display !== "none" && style.visibility !== "hidden" && (rect.width > 0 || rect.height > 0);
}

function clearOffenderMarkers(documentTarget: Document): void {
  for (const element of documentTarget.querySelectorAll<HTMLElement>('[data-layout-debug-offender="true"]')) {
    delete element.dataset.layoutDebugOffender;
  }
}

function safeActiveElementLabel(element: Element | null): string | null {
  return element instanceof HTMLElement ? safeElementLabel(element) : null;
}

function safeElementLabel(element: HTMLElement): string {
  if (safeElementIds.has(element.id)) return `#${element.id}`;
  const classes = Array.from(element.classList)
    .filter((name) => /^[a-z][a-z0-9_-]*$/u.test(name))
    .slice(0, 3)
    .map((name) => `.${name}`)
    .join("");
  return `${element.tagName.toLowerCase()}${classes}`;
}

function rectSnapshot(rect: DOMRect): LayoutRect {
  return {
    bottom: rounded(rect.bottom),
    height: rounded(rect.height),
    left: rounded(rect.left),
    right: rounded(rect.right),
    top: rounded(rect.top),
    width: rounded(rect.width),
  };
}

function mediaSnapshot(browserWindow: Window): LayoutMediaSnapshot {
  return {
    coarsePointer: browserWindow.matchMedia("(pointer: coarse)").matches,
    hoverNone: browserWindow.matchMedia("(hover: none)").matches,
    landscape: browserWindow.matchMedia("(orientation: landscape)").matches,
    minimum70Rem: browserWindow.matchMedia("(min-width: 70rem)").matches,
    minimum90Rem: browserWindow.matchMedia("(min-width: 90rem)").matches,
    standalone: browserWindow.matchMedia("(display-mode: standalone)").matches,
  };
}

function deviceSnapshot(browserWindow: Window) {
  const orientation = browserWindow.screen.orientation;
  return {
    devicePixelRatio: browserWindow.devicePixelRatio,
    maxTouchPoints: browserWindow.navigator.maxTouchPoints,
    platform: browserWindow.navigator.platform,
    screen: {
      angle: orientation?.angle ?? null,
      availHeight: browserWindow.screen.availHeight,
      availWidth: browserWindow.screen.availWidth,
      height: browserWindow.screen.height,
      orientation: orientation?.type ?? null,
      width: browserWindow.screen.width,
    },
    standalone: Reflect.get(browserWindow.navigator, "standalone") === true,
    userAgent: browserWindow.navigator.userAgent,
  };
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}
