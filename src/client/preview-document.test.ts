import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSnapshot } from "../domain/workspace";
import { workspaceSnapshotFixture } from "../test-support/workspace-fixture";
import { PreviewDocument } from "./preview-document";

interface Bounds {
  readonly top: number;
  readonly left?: number;
  readonly width?: number;
  readonly height: number;
}

class FakeElement extends EventTarget {
  readonly dataset: Record<string, string> = {};
  readonly sources: FakeElement[] = [];
  readonly imageNodes: FakeElement[] = [];
  readonly anchors = new Map<string, FakeElement>();
  textContent = "";
  innerHTML = "";
  clientHeight = 100;
  scrollTop = 0;
  scrolled = false;
  src = "";
  #bounds: Bounds = { top: 0, left: 0, width: 100, height: 100 };

  setBounds(bounds: Bounds): void {
    this.#bounds = bounds;
  }

  getBoundingClientRect(): DOMRect {
    const { top, left = 0, width = 0, height } = this.#bounds;
    return { top, left, width, height } as DOMRect;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return selector === "img" ? this.imageNodes : this.sources;
  }

  querySelector(selector: string): FakeElement | null {
    if (selector === '[data-preview-sync-active="true"]') {
      return this.sources.find(({ dataset }) => dataset.previewSyncActive === "true") ?? null;
    }
    return this.anchors.get(selector.slice(1)) ?? null;
  }

  contains(element: unknown): boolean {
    return this.sources.includes(element as FakeElement);
  }

  closest(): FakeElement {
    return this;
  }

  removeAttribute(name: string): void {
    if (name === "data-preview-sync-active") delete this.dataset.previewSyncActive;
  }

  scrollIntoView(): void {
    this.scrolled = true;
  }
}

const htmlElement = (element: FakeElement): HTMLElement => element as never;

describe("preview document", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    vi.stubGlobal("HTMLElement", FakeElement);
    vi.stubGlobal("window", { clearTimeout, setTimeout });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("owns preview content, clicks, images, scroll reset, and anchor navigation", () => {
    const article = new FakeElement();
    const viewport = new FakeElement();
    const image = new FakeElement();
    const anchor = new FakeElement();
    article.imageNodes.push(image);
    article.anchors.set("section", anchor);
    const preview = new PreviewDocument(htmlElement(article), htmlElement(viewport));
    const root = { getElementById: (id: string) => (id === "preview" ? article : viewport) } as never;
    expect(PreviewDocument.forDocument(root)).toBeInstanceOf(PreviewDocument);
    expect(() => PreviewDocument.forDocument({ getElementById: () => null } as never)).toThrow("Missing #preview");
    let clicked = false;
    preview.onClick(() => {
      clicked = true;
    });

    preview.showSource("source");
    expect(article.textContent).toBe("source");
    preview.showHtml("<p>rendered</p>");
    expect(article.innerHTML).toBe("<p>rendered</p>");
    article.dispatchEvent(new Event("click"));
    expect(clicked).toBe(true);
    expect([...preview.images()]).toEqual([image]);
    viewport.scrollTop = 40;
    preview.resetScroll();
    expect(viewport.scrollTop).toBe(0);
    preview.scrollToAnchor("section");
    expect(anchor.scrolled).toBe(true);
  });

  it("selects and centers the nearest matching source span", () => {
    const article = new FakeElement();
    const viewport = new FakeElement();
    viewport.setBounds({ top: 20, left: 10, width: 80, height: 100 });
    const broad = new FakeElement();
    broad.dataset.sourceFrom = "0";
    broad.dataset.sourceTo = "20";
    broad.setBounds({ top: 55, height: 20 });
    const narrow = new FakeElement();
    narrow.dataset.sourceFrom = "5";
    narrow.dataset.sourceTo = "10";
    narrow.setBounds({ top: 60, height: 10 });
    article.sources.push(broad, narrow);
    vi.stubGlobal("document", { elementFromPoint: () => null });
    const preview = new PreviewDocument(htmlElement(article), htmlElement(viewport));

    expect(preview.centeredSourceElement()).toBe(narrow);
    expect(preview.nearestSourceElement([7])).toBe(narrow);
    expect(preview.nearestSourceElement([30])).toBeNull();
    preview.center(broad as never);
    expect(viewport.scrollTop).toBe(-5);
  });

  it("resolves authorized project images relative to their source files", () => {
    const article = new FakeElement();
    const local = new FakeElement();
    const hidden = new FakeElement();
    const external = new FakeElement();
    article.imageNodes.push(local, hidden, external);
    const preview = new PreviewDocument(htmlElement(article), htmlElement(new FakeElement()));
    const snapshot = {
      ...workspaceSnapshotFixture,
      entryFileId: "chapter",
      files: [{ ...workspaceSnapshotFixture.files[0]!, id: "chapter", path: "chapters/method.md" }],
      assets: [
        {
          id: "asset-1",
          path: "figures/result.png",
          mediaType: "image/png",
          size: 10,
          objectKey: "assets/result.png",
          fingerprint: "result",
          createdAt: "created",
          updatedAt: "updated",
        },
        {
          id: "asset-2",
          path: "figures/hidden.png",
          mediaType: "image/png",
          size: 10,
          objectKey: "assets/hidden.png",
          fingerprint: "hidden",
          createdAt: "created",
          updatedAt: "updated",
        },
      ],
    } satisfies WorkspaceSnapshot;

    preview.resolveProjectImages({
      apiBase: "/api/workspaces/workspace",
      hiddenAssetIds: new Set(["asset-2"]),
      snapshot,
      source: "![Result](../figures/result.png)\n![Hidden](../figures/hidden.png)\n![Remote](https://example.org/x.png)",
      sourceMap: [],
    });

    expect(local.src).toBe("/api/workspaces/workspace/assets/asset-1");
    expect(hidden.src).toBe("");
    expect(external.src).toBe("");
  });

  it("prefers the centered source element and replaces transient sync emphasis", () => {
    const article = new FakeElement();
    const viewport = new FakeElement();
    const previous = new FakeElement();
    previous.dataset.previewSyncActive = "true";
    const centered = new FakeElement();
    article.sources.push(previous, centered);
    vi.stubGlobal("document", { elementFromPoint: () => centered });
    const preview = new PreviewDocument(htmlElement(article), htmlElement(viewport));

    expect(preview.centeredSourceElement()).toBe(centered);
    preview.markSyncTarget(centered as never);
    expect(previous.dataset.previewSyncActive).toBeUndefined();
    expect(centered.dataset.previewSyncActive).toBe("true");
    preview.markSyncTarget(previous as never);
    vi.runAllTimers();
    expect(previous.dataset.previewSyncActive).toBeUndefined();
  });
});
