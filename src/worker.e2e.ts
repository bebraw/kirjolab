import { expect, test, type Locator, type Page } from "@playwright/test";
import { isKnowledgeSearchResults, isWorkspaceKnowledgeGraph } from "./domain/knowledge";
import { isWorkspaceSnapshot, isWorkspaceSummaries } from "./domain/workspace";
import {
  createEvidencePdf,
  createHighlightedEvidencePdf,
  createLinkedEvidencePdf,
  createMetadataEvidencePdf,
  createTwoPageEvidencePdf,
} from "./test-support/pdf-fixture";

test("renders shared primitive states in the local UI inventory", async ({ page }) => {
  await page.goto("/__ui");

  await expect(page.locator("[data-ui-inventory]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Primary action" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download" })).toHaveCSS("gap", "8px");
  await expect(page.getByRole("button", { name: "Selected" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Working" })).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("button", { name: "Remove" })).toHaveAttribute("data-destructive", "true");
  const destructivePrimary = page.getByRole("button", { name: "Delete permanently" });
  await expect(destructivePrimary).toHaveCSS("background-color", "rgb(163, 58, 50)");
  await expect(destructivePrimary).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(page.getByRole("button", { name: "Unavailable" })).toBeDisabled();
  const closeButton = page.getByRole("button", { name: "Close example" });
  await expect(closeButton).toHaveAttribute("data-touch-target", "true");
  await expect(closeButton.locator("svg")).toHaveCSS("stroke", /rgb\(/u);
  await expect(closeButton.locator("svg")).not.toHaveCSS("stroke", "none");
  await expect(page.getByLabel("Field label")).toHaveValue("Inspectable value");
  await expect(page.locator(".ui-status[data-tone='warning']")).toHaveCSS("color", "rgb(139, 85, 20)");
  await expect(page.locator(".ui-status[data-tone='error']")).toContainText("Could not save");
  await expect(page.getByRole("group", { name: "Static dialog example" })).toBeVisible();

  const primitivePanel = page.locator("#ui-controls-heading").locator("..").locator("..");
  for (const theme of ["light", "dark"] as const) {
    await page.locator("html").evaluate((html, value) => {
      html.dataset.theme = value;
    }, theme);
    await expectContrastAtLeast(destructivePrimary, destructivePrimary, 4.5);
    await expectContrastAtLeast(page.locator(".ui-status[data-tone='warning']"), primitivePanel, 4.5);
    await expectContrastAtLeast(page.locator(".ui-status[data-tone='error']"), primitivePanel, 4.5);
  }

  const selectedBackground = await page
    .getByRole("button", { name: "Selected" })
    .evaluate((button) => getComputedStyle(button).backgroundColor);
  expect(selectedBackground).not.toBe("rgba(0, 0, 0, 0)");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("button", { name: "Primary action" })).toHaveCSS("transition-duration", "0s");
});

async function expectContrastAtLeast(foreground: Locator, background: Locator, minimum: number): Promise<void> {
  const [foregroundColor, backgroundColor] = await Promise.all([
    foreground.evaluate((element) => getComputedStyle(element).color),
    background.evaluate((element) => getComputedStyle(element).backgroundColor),
  ]);
  expect(contrastRatio(foregroundColor, backgroundColor)).toBeGreaterThanOrEqual(minimum);
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(parseRgb(foreground));
  const backgroundLuminance = relativeLuminance(parseRgb(background));
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

function parseRgb(value: string): readonly [number, number, number] {
  const channels = value
    .match(/\d+(?:\.\d+)?/gu)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Expected an RGB color, received ${value}`);
  return [channels[0]!, channels[1]!, channels[2]!];
}

function relativeLuminance(channels: readonly [number, number, number]): number {
  const [red, green, blue] = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

test("keeps wrapped dashboard and review hero glyphs separated", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const examples = [
    { path: "/", selector: "#dashboard-heading", lines: ["Pick up the", "thread."] },
    { path: "/review", selector: "#reviews-heading", lines: ["Keep the", "method", "reusable."] },
  ] as const;

  for (const example of examples) {
    await page.goto(example.path);
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.locator(example.selector).evaluate((heading) => {
      const style = getComputedStyle(heading);
      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("Expected a canvas text context");
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const range = document.createRange();
      const textNode = heading.firstChild;
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) throw new Error("Expected a text-only hero heading");
      const renderedLines: Array<{ text: string; top: number }> = [];
      for (let index = 0; index < (textNode.textContent?.length ?? 0); index += 1) {
        range.setStart(textNode, index);
        range.setEnd(textNode, index + 1);
        const rect = range.getClientRects()[0];
        if (!rect) continue;
        const currentLine = renderedLines.at(-1);
        if (!currentLine || Math.abs(currentLine.top - rect.top) > 0.5) {
          renderedLines.push({ text: textNode.textContent?.[index] ?? "", top: rect.top });
        } else {
          currentLine.text += textNode.textContent?.[index] ?? "";
        }
      }
      const lines = renderedLines.map((line) => line.text.trim());
      const glyphs = lines.map((line) => context.measureText(line));
      return {
        gaps: glyphs
          .slice(0, -1)
          .map(
            (current, index) =>
              renderedLines[index + 1]!.top -
              renderedLines[index]!.top -
              current.actualBoundingBoxDescent -
              glyphs[index + 1]!.actualBoundingBoxAscent,
          ),
        fontSize: Number.parseFloat(style.fontSize),
        lines,
      };
    });

    expect(metrics.lines).toEqual(example.lines);
    expect(Math.min(...metrics.gaps)).toBeGreaterThanOrEqual(metrics.fontSize * 0.08);
  }
});

async function readProjectMapGeometry(page: Page) {
  return page.locator("#project-map-canvas").evaluate((canvas) => {
    const canvasBounds = canvas.getBoundingClientRect();
    const nodes = [...canvas.querySelectorAll<HTMLElement>(".project-map-node")].map((node) => ({
      id: node.dataset.resourceId ?? node.textContent ?? "unknown",
      bounds: node.getBoundingClientRect(),
    }));
    const overlaps: string[] = [];
    for (const [index, node] of nodes.entries()) {
      for (const other of nodes.slice(index + 1)) {
        const overlapX = Math.min(node.bounds.right, other.bounds.right) - Math.max(node.bounds.left, other.bounds.left);
        const overlapY = Math.min(node.bounds.bottom, other.bounds.bottom) - Math.max(node.bounds.top, other.bounds.top);
        if (overlapX > 1 && overlapY > 1) overlaps.push(`${node.id} / ${other.id}`);
      }
    }
    const graph = canvas.querySelector<SVGSVGElement>("#project-map-graph");
    const viewBox = graph?.viewBox.baseVal;
    const graphVisible = graph?.checkVisibility() ?? false;
    const screenMatrix = graph?.getScreenCTM();
    const nodeById = new Map(nodes.map((node) => [node.id, node.bounds]));
    const connectorsAligned =
      !graphVisible ||
      !graph ||
      !screenMatrix ||
      [...graph.querySelectorAll<SVGPathElement>(".project-map-edge")].every((path) => {
        const from = path.dataset.from ? nodeById.get(path.dataset.from) : undefined;
        const to = path.dataset.to ? nodeById.get(path.dataset.to) : undefined;
        if (!from || !to) return false;
        const start = path.getPointAtLength(0).matrixTransform(screenMatrix);
        const end = path.getPointAtLength(path.getTotalLength()).matrixTransform(screenMatrix);
        const touches = (point: DOMPoint, bounds: DOMRect) =>
          point.x >= bounds.left - 5 && point.x <= bounds.right + 5 && point.y >= bounds.top - 5 && point.y <= bounds.bottom + 5;
        return touches(start, from) && touches(end, to);
      });
    return {
      canvasHeight: canvasBounds.height,
      canvasWidth: canvasBounds.width,
      contained: nodes.every(
        (node) =>
          node.bounds.left >= canvasBounds.left - 1 &&
          node.bounds.right <= canvasBounds.right + 1 &&
          node.bounds.top >= canvasBounds.top - 1 &&
          node.bounds.bottom <= canvasBounds.bottom + 1,
      ),
      connectorsAligned,
      edgeCount: graph?.querySelectorAll(".project-map-edge").length ?? 0,
      graphVisible,
      horizontalOverflow: canvas.scrollWidth - canvas.clientWidth,
      lanes: [...canvas.querySelectorAll<HTMLElement>(".project-map-lane-heading")].map((heading) => heading.textContent),
      overlaps,
      viewBoxHeight: viewBox?.height ?? 0,
      viewBoxWidth: viewBox?.width ?? 0,
    };
  });
}

async function selectLocalModel(page: Page, model: string): Promise<void> {
  const selector = page.locator("#llm-model");
  await selector.evaluate((element: HTMLSelectElement, value) => {
    if (![...element.options].some((option) => option.value === value)) element.add(new Option(value, value));
  }, model);
  await selector.selectOption(model);
}

test("imports, annotates, and exports a private PDF without a project", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        const file = data.files?.[0];
        sessionStorage.setItem("shared-pdf", JSON.stringify(file ? { name: file.name, size: file.size, type: file.type } : null));
      },
    });
  });
  const workspaceRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/api/workspaces")) workspaceRequests.push(pathname);
  });
  const libraryResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/library");

  await page.goto("/library");
  expect((await libraryResponse).status()).toBe(200);
  await expect(page.locator("body")).toHaveAttribute("data-app-mode", "library");
  await expect(page.locator("header #context-tabs")).toBeVisible();
  await expect(page.locator("#context-surface > #context-tabs")).toHaveCount(0);
  await expect(page.locator("header #context-library-tab")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#context-library-panel")).toBeVisible();
  await expect(page.locator("#authoring-surface")).toBeHidden();
  await expect(page.getByText("Add reference", { exact: true })).toBeVisible();
  await expect(page.getByText("View", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Project view")).toHaveCount(0);
  await expect(page.getByTitle(/^Add :cite/u)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Share project" })).toBeHidden();
  await expect(page.locator("#share-workspace")).toHaveAttribute("hidden", "");

  await page.locator("#library-pdf-upload").setInputFiles({
    name: "student_submission.pdf",
    mimeType: "application/pdf",
    buffer: createHighlightedEvidencePdf(),
  });
  const studentPdf = page.locator("#reference-library-list .library-reference-row").filter({ hasText: /student submission/iu });
  await expect(studentPdf).toBeVisible();
  await studentPdf.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(page.getByRole("tab", { name: "student_submission.pdf" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Close student_submission.pdf" })).toBeVisible();
  await expect(page.locator("header").getByRole("tab", { name: "student_submission.pdf" })).toBeVisible();
  await expect(page.locator("header #pdf-context-controls")).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("header #pdf-context-controls")).toBeHidden();
  await page.setViewportSize({ width: 1024, height: 640 });
  await expect(page.getByRole("toolbar", { name: "PDF annotation tools" })).toBeVisible();
  const compactRail = await page.locator(".library-pdf-page-rail").evaluate((rail) => {
    const railBounds = rail.getBoundingClientRect();
    const pageControlsBounds = rail.querySelector<HTMLElement>(".library-pdf-page-controls")?.getBoundingClientRect();
    const annotationToolsBounds = rail.querySelector<HTMLElement>(".library-pdf-annotation-tools")?.getBoundingClientRect();
    const buttons = [...rail.querySelectorAll<HTMLElement>(".library-pdf-annotation-tools .library-pdf-rail-button")]
      .filter((button) => button.offsetParent !== null)
      .map((button) => button.getBoundingClientRect());
    return {
      columns: new Set(buttons.map((button) => Math.round(button.left))).size,
      groupGap: (annotationToolsBounds?.top ?? 0) - (pageControlsBounds?.bottom ?? 0),
      lastToolBottom: Math.max(...buttons.map((button) => button.bottom)),
      visibleRailBottom: Math.min(railBounds.bottom, window.innerHeight),
    };
  });
  expect(compactRail.columns).toBe(2);
  expect(compactRail.groupGap).toBeLessThanOrEqual(16);
  expect(compactRail.lastToolBottom).toBeLessThanOrEqual(compactRail.visibleRailBottom);
  await page.locator("#library-draw-tool").click();
  await expect(page.locator("#library-ink-options")).toBeVisible();
  const drawingLayout = await page.locator("#library-ink-options").evaluate((options) => {
    const bounds = options.getBoundingClientRect();
    const railBounds = options.closest<HTMLElement>(".library-pdf-page-rail")?.getBoundingClientRect();
    const controlCenters = ["#library-draw-color", "#library-draw-width", "#undo-library-drawing"].map((selector) => {
      const control = options.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
      return control ? control.left + control.width / 2 : 0;
    });
    const widthBounds = options.querySelector<HTMLElement>("#library-draw-width")?.getBoundingClientRect();
    return {
      bottom: bounds.bottom,
      insideRail: Boolean(railBounds && bounds.left >= railBounds.left && bounds.right <= railBounds.right),
      verticalControls: Math.max(...controlCenters) - Math.min(...controlCenters) <= 2,
      verticalWidth: Boolean(widthBounds && widthBounds.height > widthBounds.width),
      viewportHeight: window.innerHeight,
      pageOverflowsHorizontally: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  expect(drawingLayout.bottom).toBeLessThanOrEqual(drawingLayout.viewportHeight);
  expect(drawingLayout.insideRail).toBe(true);
  expect(drawingLayout.verticalControls).toBe(true);
  expect(drawingLayout.verticalWidth).toBe(true);
  expect(drawingLayout.pageOverflowsHorizontally).toBe(false);
  await page.locator("#library-text-tool").click();
  await expect(page.locator("#library-highlight-composer")).toBeHidden();
  await expect(page.locator("#paper-text-layer")).toContainText("Knowledge grows through inspectable evidence.");
  await expect(page.locator("#export-library-annotated-pdf")).toBeDisabled();
  await page.getByRole("button", { name: "Annotations", exact: true }).click();
  await page.locator("#detect-library-pdf-highlights").click();
  await expect(page.locator("#library-highlight-import-status")).toContainText("1 candidate found");
  await expect(page.locator("#library-highlight-import-list")).toContainText("Knowledge grows through inspectable evidence.");
  await page.getByLabel("Private note for detected highlight on page 1").fill("Imported from the PDF");
  await page.getByRole("button", { name: "Import selected" }).click();
  await expect(page.locator("#toast")).toHaveText("1 PDF highlight imported to your library.");
  await expect(page.locator("#library-highlight-list")).toContainText("Imported from the PDF");
  await page.getByRole("button", { name: "Annotations", exact: true }).click();
  const fittedCanvasWidth = Number(await page.locator("#paper-canvas").getAttribute("width"));
  await page.locator("#paper-reader").dispatchEvent("wheel", { ctrlKey: true, deltaY: -40, deltaMode: 0 });
  await page.locator("#paper-reader").dispatchEvent("wheel", { ctrlKey: true, deltaY: -40, deltaMode: 0 });
  await expect(page.locator("#paper-canvas")).toHaveAttribute("width", String(fittedCanvasWidth));
  await expect(page.locator("#paper-page")).toHaveAttribute("style", /transform: scale/u);
  await expect.poll(async () => Number(await page.locator("#paper-canvas").getAttribute("width"))).toBeGreaterThan(fittedCanvasWidth);
  await expect
    .poll(async () => page.locator("#paper-reader").evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeGreaterThan(0);
  await expect(page.locator("#paper-page")).not.toHaveAttribute("style", /transform: scale/u);
  const zoomedVerticalReach = await page.locator("#paper-reader").evaluate((reader) => {
    reader.scrollTop = reader.scrollHeight;
    const readerBounds = reader.getBoundingClientRect();
    const pageBounds = reader.querySelector<HTMLElement>("#paper-page")?.getBoundingClientRect();
    return {
      maximumScrollTop: reader.scrollTop,
      pageBottomBeyondReader: (pageBounds?.bottom ?? Number.POSITIVE_INFINITY) - readerBounds.bottom,
    };
  });
  expect(zoomedVerticalReach.maximumScrollTop).toBeGreaterThan(0);
  expect(zoomedVerticalReach.pageBottomBeyondReader).toBeLessThanOrEqual(0);
  await page.locator("#paper-reader").dispatchEvent("wheel", { ctrlKey: true, deltaY: 80, deltaMode: 0 });
  await expect.poll(async () => Number(await page.locator("#paper-canvas").getAttribute("width"))).toBe(fittedCanvasWidth);
  await page.locator("#paper-text-layer").evaluate((layer) => {
    const span = layer.querySelector("span");
    if (!span?.firstChild) throw new Error("Expected rendered student PDF text");
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    layer.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await page.locator("#library-highlight-comment").fill("Student feedback");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("#library-highlight-list")).toContainText("Student feedback");
  await expect(page.locator("#export-library-annotated-pdf")).toBeEnabled();
  await page.getByRole("button", { name: "Export annotated" }).click();
  await expect(page.locator("#toast")).toHaveText("Choose Save to Files to keep the annotated PDF.");
  await expect
    .poll(async () => JSON.parse((await page.evaluate(() => sessionStorage.getItem("shared-pdf"))) ?? "null"))
    .toMatchObject({ name: "student_submission-annotated.pdf", type: "application/pdf" });
  await page.getByRole("button", { name: "Close student_submission.pdf" }).click();
  await expect(page).toHaveURL(/\/library$/u);
  await expect(page.locator("header #context-library-tab")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#context-library-panel")).toBeVisible();
  await expect(page.locator("#context-assistant-panel")).toBeHidden();
  expect(workspaceRequests).toEqual([]);
});

test("follows internal and external links from the active PDF page", async ({ page }) => {
  await page.goto("/library");
  await page.locator("#library-pdf-upload").setInputFiles({
    name: "linked-reading.pdf",
    mimeType: "application/pdf",
    buffer: createLinkedEvidencePdf(),
  });
  const linkedPdf = page.locator("#reference-library-list .library-reference-row").filter({ hasText: /linked reading/iu });
  await linkedPdf.getByRole("button", { name: "PDF", exact: true }).click();

  await expect(page.locator("#paper-links .pdf-link")).toHaveCount(2);
  const external = page.getByRole("link", { name: "Open PDF link: https://example.com/source" });
  await expect(external).toHaveAttribute("target", "_blank");
  await expect(external).toHaveAttribute("rel", "noopener noreferrer nofollow");
  await page.getByRole("link", { name: "Follow link within PDF" }).click();
  await expect(page.locator("#paper-page-indicator")).toHaveText("2 / 2");
});

test("creates, rotates, and revokes a read-only project link", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Link review");
  const api = `/api/workspaces/${workspaceId}/share-link`;
  const origin = "http://127.0.0.1:8788";
  const headers = { origin };

  expect(await (await page.request.get(api)).json()).toEqual({ active: false, createdAt: null, href: null });
  const created = await page.request.post(api, { headers });
  expect(created.status()).toBe(201);
  const first = (await created.json()) as { href: string };
  const activeStatus = (await (await page.request.get(api)).json()) as Record<string, unknown>;
  expect(activeStatus).toMatchObject({ active: true, createdAt: expect.any(String), href: first.href });
  expect(activeStatus).not.toHaveProperty("token");
  await page.goto(`/editor/${workspaceId}`);
  await page.locator("#share-workspace").click();
  await expect(page.locator("#read-only-share-link")).toHaveValue(`${origin}${first.href}`);
  await page.locator("#close-share-workspace").click();
  await page.reload();
  await page.locator("#share-workspace").click();
  await expect(page.locator("#read-only-share-link")).toHaveValue(`${origin}${first.href}`);
  await page.locator("#close-share-workspace").click();
  const shared = await page.request.get(first.href);
  expect(shared.status()).toBe(200);
  expect(shared.headers()["referrer-policy"]).toBe("no-referrer");
  expect(shared.headers()["content-security-policy"]).toContain("frame-src 'self'");
  expect(shared.headers()["cross-origin-embedder-policy"]).toBeUndefined();
  const sharedHtml = await shared.text();
  expect(sharedHtml).toContain("Link review");
  expect(sharedHtml).toContain('<script type="module" src="/shared-editor.js"></script>');
  expect(sharedHtml).toContain('data-app-mode="shared-editor" data-shared-editor-mode="read-only"');
  expect(sharedHtml).toContain('id="shared-editor-surfaces" data-active-surface="authoring" data-layout="split"');
  expect(sharedHtml).toContain('id="shared-source" data-shared-source');
  expect(sharedHtml).toContain('aria-describedby="shared-editor-help shared-collaborator-selections" readonly');
  expect(sharedHtml).toContain(`id="shared-pdf-viewer" data-shared-pdf-viewer src="${first.href}/document.pdf"`);
  expect(sharedHtml).not.toContain("data-shared-save-path");
  expect(sharedHtml).not.toContain("data-shared-snapshot-path");
  expect(sharedHtml).not.toContain('<script type="module" src="/app.js"></script>');
  expect(sharedHtml).not.toContain('id="workspace-settings"');
  expect(sharedHtml).not.toContain('id="share-workspace"');

  const pdf = await page.request.get(`${first.href}/document.pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect(pdf.headers()["content-disposition"]).toContain("inline");
  expect(pdf.headers()["cross-origin-resource-policy"]).toBe("same-origin");
  expect((await pdf.body()).toString("ascii", 0, 4)).toBe("%PDF");

  const project = (await (await page.request.get(`/api/workspaces/${workspaceId}`)).json()) as {
    files: Array<{ id: string; path: string }>;
  };
  const mainFile = project.files.find((file) => file.path === "main.md");
  expect(mainFile).toBeDefined();
  const source = await page.request.get(`${first.href}?file=${encodeURIComponent(mainFile!.id)}`);
  expect(source.status()).toBe(200);
  expect(await source.text()).toContain(`href="?file=${mainFile!.id}" aria-current="page"`);
  const legacySource = await page.request.get(`${first.href}?view=${encodeURIComponent(`file:${mainFile!.id}`)}`);
  expect(legacySource.status()).toBe(200);
  expect(await legacySource.text()).toContain(`href="?file=${mainFile!.id}" aria-current="page"`);
  const legacyPdf = await page.request.get(`${first.href}?view=pdf`);
  expect(legacyPdf.status()).toBe(200);
  expect(await legacyPdf.text()).toContain('id="shared-editor-surfaces" data-active-surface="authoring" data-layout="pdf"');

  const rotated = await page.request.post(api, { headers });
  expect(rotated.status()).toBe(201);
  const invalidated = await page.request.get(first.href);
  expect(invalidated.status()).toBe(404);
  expect(await invalidated.text()).not.toContain(first.href);
  expect((await page.request.get(`${first.href}/document.pdf`)).status()).toBe(404);
  const second = (await rotated.json()) as { href: string };
  expect((await page.request.get(second.href)).status()).toBe(200);

  expect((await page.request.delete(api, { headers })).status()).toBe(204);
  expect((await page.request.get(second.href)).status()).toBe(404);
});

test("shares the owner-scoped demo through an opaque public locator", async ({ page }) => {
  await page.goto("/editor/demo");
  const response = await page.request.post("/api/workspaces/demo/share-link", {
    headers: { origin: "http://127.0.0.1:8788" },
  });
  expect(response.status()).toBe(201);
  const share = (await response.json()) as { href: string };
  expect(share.href).toMatch(/^\/share\/(?!demo\.)[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/u);
  const shared = await page.request.get(share.href);
  expect(shared.status()).toBe(200);
  expect(await shared.text()).toContain("Evidence becomes prose");
});

test("creates, edits through, rotates, and revokes a scoped edit link", async ({ page, browser }) => {
  const workspaceId = await createWorkspace(page, "External editor");
  const api = `/api/workspaces/${workspaceId}/edit-link`;
  const origin = "http://127.0.0.1:8788";
  expect(await (await page.request.get(api)).json()).toEqual({ active: false, createdAt: null, href: null });

  const created = await page.request.post(api, { headers: { origin } });
  expect(created.status()).toBe(201);
  const first = (await created.json()) as { href: string };
  expect(first.href).toMatch(/^\/edit\/[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/u);
  const activeStatusResponse = await page.request.get(api);
  expect(activeStatusResponse.headers()["cache-control"]).toBe("no-store");
  const activeStatus = (await activeStatusResponse.json()) as Record<string, unknown>;
  expect(activeStatus).toMatchObject({ active: true, createdAt: expect.any(String), href: first.href });
  expect(activeStatus).not.toHaveProperty("token");
  await page.goto(`/editor/${workspaceId}`);
  await page.locator("#share-workspace").click();
  await expect(page.locator("#edit-share-link")).toHaveValue(`${origin}${first.href}`);
  await page.locator("#close-share-workspace").click();
  await page.reload();
  await page.locator("#share-workspace").click();
  await expect(page.locator("#edit-share-link")).toHaveValue(`${origin}${first.href}`);
  await page.locator("#close-share-workspace").click();

  const editSnapshotResponse = await page.request.get(`${first.href}/snapshot`);
  expect(editSnapshotResponse.status()).toBe(200);
  const editSnapshot = (await editSnapshotResponse.json()) as {
    revision: number;
    files: Array<{ id: string; path: string; content: string }>;
  };
  expect(editSnapshot).toMatchObject({ revision: expect.any(Number), files: expect.any(Array) });
  expect(editSnapshot).not.toHaveProperty("pdfs");
  expect(editSnapshot).not.toHaveProperty("projectReferences");
  const main = editSnapshot.files.find((file) => file.path === "main.md");
  expect(main).toBeDefined();

  const editPageResponse = await page.request.get(first.href);
  expect(editPageResponse.status()).toBe(200);
  const editHtml = await editPageResponse.text();
  expect(editHtml).toContain('<script type="module" src="/shared-editor.js"></script>');
  expect(editHtml).toContain('data-app-mode="shared-editor" data-shared-editor-mode="edit"');
  expect(editHtml).toContain(`data-shared-save-path="${first.href}/files/${main!.id}"`);
  expect(editHtml).toContain(`data-shared-snapshot-path="${first.href}/snapshot"`);
  expect(editHtml).toContain('id="edit-source" data-shared-source');
  expect(editHtml).toContain(`id="edit-pdf-viewer" data-shared-pdf-viewer src="${first.href}/document.pdf"`);
  expect(editHtml).not.toContain('<script type="module" src="/app.js"></script>');
  expect(editHtml).not.toContain('id="workspace-settings"');
  expect(editHtml).not.toContain('id="share-workspace"');

  const denied = await page.request.patch(`${first.href}/files/${main!.id}`, {
    headers: { origin: "https://attacker.example" },
    data: { content: "hostile overwrite", revision: editSnapshot.revision },
  });
  expect(denied.status()).toBe(403);
  const oversized = await page.request.patch(`${first.href}/files/${main!.id}`, {
    headers: { origin },
    data: { content: "x".repeat(2_000_001), revision: editSnapshot.revision },
  });
  expect(oversized.status()).toBe(400);

  const editorContext = await browser.newContext();
  const editor = await editorContext.newPage();
  await editor.goto(first.href);
  await expect(editor.locator("#edit-save-status")).toContainText("Saved · revision");
  await expect(editor.locator("#edit-live-status")).toHaveText("Live · 2 writers");

  await editor.locator("#edit-source").evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(2, 2);
    textarea.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await expectCollaboratorCaretAligned(page.locator("#source-editor-highlight .collaborator-caret"));

  await page.locator("#source-editor").evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(4, 4);
    textarea.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await expectCollaboratorCaretAligned(editor.locator("#edit-source-highlight .collaborator-caret"));

  await editor.locator("#edit-source").fill("# Edited externally\n\nA scoped link update.\n");
  await expect(editor.locator("#edit-save-status")).toHaveText(`Saved · revision ${editSnapshot.revision + 1}`);

  await page.goto(`/editor/${workspaceId}`);
  await expect(page.locator("#source-editor")).toHaveValue("# Edited externally\n\nA scoped link update.\n");
  const stale = await page.request.patch(`${first.href}/files/${main!.id}`, {
    headers: { origin },
    data: { content: "stale overwrite", revision: editSnapshot.revision },
  });
  expect(stale.status()).toBe(409);

  const rotated = await page.request.post(api, { headers: { origin } });
  expect(rotated.status()).toBe(201);
  const second = (await rotated.json()) as { href: string };
  await expect(editor.locator("#edit-live-status")).toHaveText("Edit access ended");
  await expect(editor.locator("#edit-source")).toBeDisabled();
  expect((await page.request.get(first.href)).status()).toBe(404);
  expect((await page.request.get(second.href)).status()).toBe(200);

  expect((await page.request.delete(api, { headers: { origin } })).status()).toBe(204);
  expect((await page.request.get(second.href)).status()).toBe(404);
  await editorContext.close();
});

test("refreshes a read-only project after live document edits", async ({ page, browser }) => {
  const workspaceId = await createWorkspace(page, "Live read-only review");
  const shareResponse = await page.request.post(`/api/workspaces/${workspaceId}/share-link`, {
    headers: { origin: "http://127.0.0.1:8788" },
  });
  const share = (await shareResponse.json()) as { href: string };
  const readerContext = await browser.newContext();
  const reader = await readerContext.newPage();

  await reader.goto(share.href);
  await expect(reader.locator("#shared-live-status")).toContainText("Live · revision");
  await expect(reader.locator("#shared-source")).toHaveAttribute("readonly", "");
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.locator("#save-status")).toHaveText("Saved");
  await page.locator("#source-editor").fill("# Live review\n\nUpdated for the reader without a manual reload.\n");
  await expect(page.locator("#save-status")).toHaveText("Saved");
  await expect(reader.locator("#shared-source")).toHaveValue("# Live review\n\nUpdated for the reader without a manual reload.\n");

  const beforeHostileFrameValue: unknown = await (await page.request.get(`/api/workspaces/${workspaceId}`)).json();
  if (!isWorkspaceSnapshot(beforeHostileFrameValue)) throw new Error("Expected a workspace snapshot before a hostile reader frame");
  const rejected = await reader.evaluate(
    async () =>
      await new Promise<{ code: number; reason: string }>((resolve, reject) => {
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(`${protocol}//${location.host}${location.pathname}/socket`);
        const timeout = window.setTimeout(() => reject(new Error("Read-only socket accepted an authored update")), 5_000);
        socket.addEventListener("open", () => socket.send(new Uint8Array([1]).buffer));
        socket.addEventListener("close", (event) => {
          window.clearTimeout(timeout);
          resolve({ code: event.code, reason: event.reason });
        });
      }),
  );
  expect(rejected).toEqual({ code: 1008, reason: "Read-only project connections cannot send messages" });
  const afterHostileFrameValue: unknown = await (await page.request.get(`/api/workspaces/${workspaceId}`)).json();
  if (!isWorkspaceSnapshot(afterHostileFrameValue)) throw new Error("Expected a workspace snapshot after a hostile reader frame");
  expect(afterHostileFrameValue.revision).toBe(beforeHostileFrameValue.revision);
  expect(afterHostileFrameValue.source).toBe(beforeHostileFrameValue.source);

  const disconnected = reader.evaluate(
    async () =>
      await new Promise<{ code: number; reason: string }>((resolve) => {
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(`${protocol}//${location.host}${location.pathname}/socket`);
        socket.addEventListener("open", () => {
          document.body.dataset.testSocketOpen = "true";
        });
        socket.addEventListener("close", (event) => resolve({ code: event.code, reason: event.reason }));
      }),
  );
  await expect(reader.locator("body")).toHaveAttribute("data-test-socket-open", "true");
  expect(
    (
      await page.request.post(`/api/workspaces/${workspaceId}/share-link`, {
        headers: { origin: "http://127.0.0.1:8788" },
      })
    ).status(),
  ).toBe(201);
  expect(await disconnected).toEqual({ code: 1008, reason: "Read-only link changed" });
  await expect(reader.locator("#shared-live-status")).toHaveText("Live access ended");

  await readerContext.close();
});

test("renames, archives, duplicates, and permanently deletes projects", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Lifecycle source");
  const api = `/api/workspaces/${workspaceId}`;
  const headers = { origin: "http://127.0.0.1:8788" };
  let response = await page.request.patch(`${api}/settings`, { headers, data: { title: "Renamed lifecycle", archived: true } });
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ id: workspaceId, title: "Renamed lifecycle", archivedAt: expect.any(String) });
  response = await page.request.patch(`${api}/settings`, {
    headers,
    data: { publicationProfile: { citationStyle: "ieee", locale: "fi-FI", submissionTemplate: "anonymous-review", paperSize: "letter" } },
  });
  expect(response.ok()).toBe(true);
  expect(await (await page.request.get(api)).json()).toMatchObject({
    publicationProfile: { citationStyle: "ieee", locale: "fi-FI", submissionTemplate: "anonymous-review", paperSize: "letter" },
  });
  response = await page.request.post(`${api}/duplicate`, { headers, data: { title: "Lifecycle copy" } });
  expect(response.status()).toBe(201);
  const duplicate = (await response.json()) as { id: string; title: string };
  expect(duplicate).toMatchObject({ title: "Lifecycle copy" });
  expect(await (await page.request.get(`/api/workspaces/${duplicate.id}`)).json()).toMatchObject({
    publicationProfile: { citationStyle: "ieee", locale: "fi-FI", submissionTemplate: "anonymous-review", paperSize: "letter" },
  });
  const readLink = (await (await page.request.post(`${api}/share-link`, { headers })).json()) as { href: string };
  const editLink = (await (await page.request.post(`${api}/edit-link`, { headers })).json()) as { href: string };
  expect((await page.request.delete(`${api}/settings`, { headers })).status()).toBe(204);
  expect((await page.request.get(api)).status()).toBe(404);
  expect((await page.request.get(readLink.href)).status()).toBe(404);
  expect((await page.request.get(editLink.href)).status()).toBe(404);
  expect((await page.request.get(`/api/workspaces/${duplicate.id}`)).ok()).toBe(true);
});

test("keeps GitHub publish confirmation visible after refreshing sync state", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "GitHub publish feedback");
  const api = `/api/workspaces/${workspaceId}/github-sync`;
  const commitSha = "c".repeat(40);
  let published = false;
  await page.route(`**${api}`, async (route) => {
    await route.fulfill({
      json: {
        owner: "bebraw",
        repository: "scalability_book",
        branch: "kirjolab-smoke-test",
        rootPath: "book",
        commitSha,
      },
    });
  });
  await page.route(`**${api}/status`, async (route) => {
    await route.fulfill({
      json: {
        owner: "bebraw",
        repository: "scalability_book",
        branch: "kirjolab-smoke-test",
        rootPath: "book",
        commitSha,
        remoteHead: commitSha,
        remoteHeadChanged: false,
        relationship: published ? "synced" : "kirjolab-ahead",
        incomingChanges: 0,
        outgoingChanges: published ? 0 : 1,
        conflicts: 0,
      },
    });
  });
  await page.route(`**${api}/publish-previews`, async (route) => {
    await route.fulfill({
      status: 201,
      json: {
        id: crypto.randomUUID(),
        expectedRemoteHead: "a".repeat(40),
        plan: {
          changes: [{ path: "00_introduction.md", content: "# Revised introduction\n" }],
          skippedLocalPaths: [],
          blocking: [],
        },
      },
    });
  });
  await page.route(`**${api}/publishes`, async (route) => {
    published = true;
    await route.fulfill({ json: { commitSha } });
  });

  await page.goto(`/editor/${workspaceId}`);
  await expect(page.locator("#workspace-surfaces")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#github-sync-label")).toHaveText("GitHub · Push available");
  await page.locator("#github-sync-trigger").click();
  await page.getByRole("button", { name: "Push to GitHub" }).click();
  await expect(page.locator("#github-sync-status")).toContainText("bebraw/scalability_book");
  await expect(page.locator("#github-publish-review")).toContainText("1 tracked path change");
  await page.getByRole("button", { name: "Publish commit" }).click();
  await expect(page.locator("#github-publish-review")).toHaveText(`Published commit ${commitSha.slice(0, 10)}.`);
  await expect(page.locator("#github-sync-label")).toHaveText("GitHub · Synced");
});

test("shows an automatically advanced checkpoint after changes outside tracked Markdown", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "GitHub branch movement");
  const api = `/api/workspaces/${workspaceId}/github-sync`;
  const synchronizedCommit = "a".repeat(40);
  const remoteHead = "b".repeat(40);
  await page.route(`**${api}`, async (route) => {
    await route.fulfill({
      json: {
        owner: "bebraw",
        repository: "scalability_book",
        branch: "main",
        rootPath: "book",
        commitSha: synchronizedCommit,
      },
    });
  });
  await page.route(`**${api}/status`, async (route) => {
    await route.fulfill({
      json: {
        owner: "bebraw",
        repository: "scalability_book",
        branch: "main",
        rootPath: "book",
        commitSha: remoteHead,
        remoteHead,
        remoteHeadChanged: false,
        relationship: "synced",
        incomingChanges: 0,
        outgoingChanges: 0,
        conflicts: 0,
      },
    });
  });
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.locator("#github-sync-label")).toHaveText("GitHub · Synced");
  await page.locator("#github-sync-trigger").click();
  await expect(page.locator("#github-sync-detail")).toContainText(`Tracked Markdown matches main at ${remoteHead.slice(0, 10)}`);
  await expect(page.getByRole("button", { name: "Pull from GitHub" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Push to GitHub" })).toBeDisabled();
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("#github-sync-label")).toHaveText("GitHub · Synced");
  await page.context().setOffline(false);
});

test("previews and confirms incoming GitHub changes", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "GitHub pull feedback");
  const api = `/api/workspaces/${workspaceId}/github-sync`;
  const previewId = crypto.randomUUID();
  await page.route(`**${api}`, async (route) => {
    await route.fulfill({
      json: {
        owner: "bebraw",
        repository: "scalability_book",
        branch: "main",
        rootPath: "book",
        commitSha: "a".repeat(40),
      },
    });
  });
  await page.route(`**${api}/status`, async (route) => {
    await route.fulfill({
      json: {
        owner: "bebraw",
        repository: "scalability_book",
        branch: "main",
        rootPath: "book",
        commitSha: "a".repeat(40),
        remoteHead: "b".repeat(40),
        remoteHeadChanged: true,
        relationship: "github-ahead",
        incomingChanges: 1,
        outgoingChanges: 0,
        conflicts: 0,
      },
    });
  });
  await page.route(`**${api}/pull-previews`, async (route) => {
    await route.fulfill({
      status: 201,
      json: {
        id: previewId,
        plan: {
          changes: [{ base: { path: "00_introduction.md" }, remote: { path: "00_introduction.md" } }],
          blocking: [],
        },
      },
    });
  });
  await page.route(`**${api}/pulls`, async (route) => {
    expect(await route.request().postDataJSON()).toEqual({ previewId, resolutions: [] });
    await route.fulfill({ json: { binding: {} } });
  });

  await page.goto(`/editor/${workspaceId}`);
  await expect(page.locator("#workspace-surfaces")).toHaveAttribute("data-ready", "true");
  await page.locator(".header-action-menu summary").click();
  await page.getByRole("button", { name: "Project settings" }).click();
  await page.getByRole("button", { name: "Preview pull" }).click();
  await expect(page.locator("#github-pull-review")).toContainText("1 incoming change ready to pull");
  await expect(page.locator("#github-pull-review")).toContainText("Update · 00_introduction.md");
  await page.getByRole("button", { name: "Pull changes" }).click();
  await expect(page.locator("#github-pull-review")).toHaveText("Pulled the reviewed changes from GitHub.");
});

test("requires an explicit GitHub conflict resolution", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "GitHub conflict review");
  const api = `/api/workspaces/${workspaceId}/github-sync`;
  const previewId = crypto.randomUUID();
  await page.route(`**${api}`, async (route) => {
    await route.fulfill({
      json: {
        owner: "bebraw",
        repository: "scalability_book",
        branch: "main",
        rootPath: "book",
        commitSha: "a".repeat(40),
      },
    });
  });
  await page.route(`**${api}/status`, async (route) => {
    await route.fulfill({
      json: {
        owner: "bebraw",
        repository: "scalability_book",
        branch: "main",
        rootPath: "book",
        commitSha: "a".repeat(40),
        remoteHead: "b".repeat(40),
        remoteHeadChanged: true,
        relationship: "conflicted",
        incomingChanges: 0,
        outgoingChanges: 0,
        conflicts: 1,
      },
    });
  });
  await page.route(`**${api}/pull-previews`, async (route) => {
    await route.fulfill({
      status: 201,
      json: {
        id: previewId,
        plan: {
          changes: [],
          blocking: [
            {
              base: { path: "chapter.md", content: "Base" },
              local: { path: "chapter.md", content: "Kirjolab version" },
              remote: { path: "chapter.md", content: "GitHub version" },
            },
          ],
        },
      },
    });
  });
  await page.route(`**${api}/pulls`, async (route) => {
    expect(await route.request().postDataJSON()).toEqual({ previewId, resolutions: [{ conflict: 0, choice: "remote" }] });
    await route.fulfill({ json: { binding: {} } });
  });

  await page.goto(`/editor/${workspaceId}`);
  await expect(page.locator("#workspace-surfaces")).toHaveAttribute("data-ready", "true");
  await page.locator(".header-action-menu summary").click();
  await page.getByRole("button", { name: "Project settings" }).click();
  await page.getByRole("button", { name: "Preview pull" }).click();
  await expect(page.locator("#github-pull-review")).toContainText("Kirjolab version");
  await expect(page.locator("#github-pull-review")).toContainText("GitHub version");
  await expect(page.getByRole("button", { name: "Pull changes" })).toBeDisabled();
  await page.getByLabel("Resolution").selectOption("remote");
  await page.getByRole("button", { name: "Pull changes" }).click();
  await expect(page.locator("#github-pull-review")).toHaveText("Pulled the reviewed changes from GitHub.");
});

test("switches and remembers focused workspace views", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Focus modes");
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.locator("#workspace-surfaces")).toHaveAttribute("data-ready", "true");
  const layout = page.locator("#workspace-layout");
  await layout.selectOption("editor");
  await expect(page.locator("#workspace-surfaces")).toHaveAttribute("data-layout", "editor");
  await expect(page.locator("#authoring-surface")).toBeVisible();
  await expect(page.locator("#context-surface")).toBeHidden();
  await layout.selectOption("split");
  await page.locator("#show-research-rail").click();
  await page.locator("#show-map-mode").click();
  await page.getByRole("tab", { name: "Writing assistant" }).click();
  await layout.selectOption("context");
  await expect(page.locator("#authoring-surface")).toBeHidden();
  await expect(page.locator("#context-surface")).toBeVisible();
  await expect
    .poll(() => Object.fromEntries(new URL(page.url()).searchParams))
    .toMatchObject({ rail: "research", mode: "map", surface: "context", layout: "context", context: "assistant" });
  await page.reload();
  await expect(layout).toHaveValue("context");
  await expect(page.locator("#show-research-rail")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#show-map-mode")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#context-assistant-panel")).toBeVisible();
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("context")).toBeNull();
  await page.goBack();
  await expect(page.locator("#context-assistant-panel")).toBeVisible();
  await layout.selectOption("pdf");
  await expect(page.locator("#context-surface")).toBeVisible();
  await expect(page.locator("#toast")).toContainText("Add or open a PDF");
  await layout.selectOption("split");
  await expect(page.locator("#authoring-surface")).toBeVisible();
  await expect(page.locator("#context-surface")).toBeVisible();
});

test("follows and remembers the selected appearance", async ({ page }) => {
  await page.goto("/editor/demo");
  await expect(page.locator("#workspace-surfaces")).toHaveAttribute("data-ready", "true");
  const appearance = page.locator("#theme-preference");
  await page.locator("#preferences-menu > summary").click();
  await expect(page.locator("#preferences-menu")).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(page.locator("#preferences-menu")).not.toHaveAttribute("open", "");
  await expect(page.locator("#preferences-menu > summary")).toBeFocused();
  await page.locator("#preferences-menu > summary").click();
  await expect(page.locator("#application-version")).toHaveText(/^[a-f0-9]{16}$/u);
  await page.locator("#copy-application-version").click();
  await expect(page.locator("#toast")).toContainText("Copied application version");

  await expect(appearance).toHaveValue("system");
  await appearance.selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");

  await page.reload();
  await page.locator("#preferences-menu > summary").click();
  await expect(appearance).toHaveValue("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await appearance.selectOption("system");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light dark");
});

test("keeps an activated application update available until refresh", async ({ page }) => {
  await page.goto("/editor/demo");
  await page.evaluate(async () => await navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator("#workspace-surfaces")).toHaveAttribute("data-ready", "true");

  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event("controllerchange")));
  await expect(page.locator("#toast")).toContainText("A new version of Kirjolab is available.");
  await expect(page.getByRole("button", { name: "Refresh now" })).toBeVisible();

  await page.locator("#preferences-menu > summary").click();
  await page.locator("#copy-application-version").click();
  await expect(page.locator("#toast")).toContainText("Copied application version");
  await expect(page.locator("#toast")).toContainText("A new version of Kirjolab is available.", { timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Refresh now" })).toBeVisible();
});

test("keeps the workspace within a compact desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  const workspaceId = await createWorkspace(page, "Compact desktop");
  await page.goto(`/editor/${workspaceId}`);

  await expect(page.locator("#show-authoring-surface")).toBeVisible();
  await expect(page.locator("#show-context-surface")).toBeVisible();
  expect(
    await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
  ).toMatchObject({ clientWidth: 1100, scrollWidth: 1100 });

  await page.setViewportSize({ width: 2048, height: 566 });
  const shortWideLayout = await page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>("#workspace-surfaces")!.getBoundingClientRect();
    const editor = document.querySelector<HTMLElement>("#source-editor-shell")!.getBoundingClientRect();
    const toast = document.querySelector<HTMLElement>("#toast")!;
    return {
      documentFits: document.documentElement.scrollHeight <= document.documentElement.clientHeight,
      workspaceFits: workspace.bottom <= innerHeight,
      editorFillsRow: Math.abs(editor.bottom - workspace.bottom) <= 1,
      toastDisplay: getComputedStyle(toast).display,
    };
  });
  expect(shortWideLayout).toEqual({
    documentFits: true,
    workspaceFits: true,
    editorFillsRow: true,
    toastDisplay: "none",
  });
});

test("lets iPad Preview and Library readers hide and restore top navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1366 });
  const workspaceId = await createWorkspace(page, "Focused iPad preview");
  await page.goto(`/editor/${workspaceId}`);
  await page.getByRole("button", { name: "Context" }).click();

  const header = page.locator("#app-header");
  const context = page.locator("#context-surface");
  const initialHeight = await context.evaluate((element) => element.getBoundingClientRect().height);
  await page.getByRole("button", { name: "Hide top navigation" }).click();

  await expect(header).toBeHidden();
  await expect(page.locator("body")).toHaveAttribute("data-preview-navigation", "hidden");
  await expect(page.getByRole("button", { name: "Show top navigation" })).toHaveAttribute("aria-pressed", "true");
  expect(await context.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(initialHeight + 50);

  await page.reload();
  await expect(header).toBeHidden();
  await page.getByRole("button", { name: "Context" }).click();
  await page.getByRole("button", { name: "Show top navigation" }).click();
  await expect(header).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-preview-navigation", "visible");

  await page.goto("/library");
  const libraryHeaderPrimary = page.locator("#app-header .app-header-primary");
  const libraryHeaderSecondary = page.locator("#app-header .app-header-secondary");
  const libraryContext = page.locator("#context-surface");
  const initialLibraryHeight = await libraryContext.evaluate((element) => element.getBoundingClientRect().height);
  await page.getByRole("button", { name: "Hide top navigation" }).click();

  await expect(libraryHeaderPrimary).toBeHidden();
  await expect(libraryHeaderSecondary).toBeHidden();
  await expect(page.getByRole("button", { name: "Show top navigation" })).toBeVisible();
  expect(await libraryContext.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(initialLibraryHeight + 10);

  await page.reload();
  await expect(libraryHeaderPrimary).toBeHidden();
  await expect(libraryHeaderSecondary).toBeHidden();
  await page.getByRole("button", { name: "Show top navigation" }).click();
  await expect(libraryHeaderPrimary).toBeVisible();
  await expect(libraryHeaderSecondary).toBeVisible();
});

test("resizes and remembers the desktop project rail", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const workspaceId = await createWorkspace(page, "Resizable project rail");
  await page.goto(`/editor/${workspaceId}`);

  const resizer = page.getByRole("separator", { name: "Resize project rail" });
  const rail = page.locator(".source-rail");
  await expect(resizer).toBeVisible();
  await expect(resizer).toHaveAttribute("aria-valuenow", "272");

  await page.getByRole("button", { name: "Collapse project rail" }).click();
  await expect(rail).toBeHidden();
  await expect(resizer).toBeHidden();
  const expandRail = page.getByRole("button", { name: "Show project rail" });
  await expect(expandRail).toBeVisible();
  await expect(expandRail).toBeFocused();
  await page.reload();
  await expect(rail).toBeHidden();
  await expandRail.click();
  await expect(rail).toBeVisible();
  await expect(page.getByRole("button", { name: "Collapse project rail" })).toBeFocused();

  const resizerBox = await resizer.boundingBox();
  if (!resizerBox) throw new Error("Expected project-rail resizer bounds");
  await page.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + 40);
  await page.mouse.down();
  await page.mouse.move(resizerBox.x + resizerBox.width / 2 + 64, resizerBox.y + 40);
  await page.mouse.up();
  await expect(resizer).toHaveAttribute("aria-valuenow", "336");
  await expect.poll(async () => Math.round((await rail.boundingBox())?.width ?? 0)).toBe(336);
  await expect(page.locator(".rail-mode-label").first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole("separator", { name: "Resize project rail" })).toHaveAttribute("aria-valuenow", "336");
  await page.setViewportSize({ width: 1152, height: 900 });
  await expect(resizer).toHaveAttribute("aria-valuenow", "272");
  expect(
    await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })),
  ).toMatchObject({ clientWidth: 1152, scrollWidth: 1152 });
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(resizer).toHaveAttribute("aria-valuenow", "336");
  await resizer.focus();
  await resizer.press("ArrowLeft");
  await expect(resizer).toHaveAttribute("aria-valuenow", "320");
  await resizer.press("Home");
  await expect(resizer).toHaveAttribute("aria-valuenow", "272");
  await expect
    .poll(
      async () => await page.locator("#workspace-surfaces").evaluate((element) => element.style.getPropertyValue("--source-rail-width")),
    )
    .toBe("");
});

test("filters and quickly opens project files", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const workspaceId = await createWorkspace(page, "Quick project files");
  const api = `/api/workspaces/${workspaceId}`;
  const projectPaths = [
    "chapters/method.md",
    "notes/findings.md",
    ...Array.from({ length: 20 }, (_, index) => `supporting-${String(index + 1).padStart(2, "0")}.md`),
  ];
  for (const path of projectPaths) {
    const response = await page.request.post(`${api}/files`, {
      headers: { origin: "http://127.0.0.1:8788" },
      data: { path, content: `## ${path}\n` },
    });
    expect(response.status()).toBe(201);
  }
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.locator(".project-file-row", { hasText: "supporting-20.md" })).toHaveCount(1);

  const viewportContainment = await page.evaluate(() => {
    const rail = document.querySelector<HTMLElement>(".source-rail")!;
    return {
      documentFits: document.documentElement.scrollHeight <= document.documentElement.clientHeight,
      railScrolls: rail.scrollHeight > rail.clientHeight,
      uploadContainedByRail: rail.contains(document.querySelector<HTMLInputElement>("#project-image-upload")!.offsetParent),
    };
  });
  expect(viewportContainment).toEqual({ documentFits: true, railScrolls: true, uploadContainedByRail: true });

  const filter = page.getByRole("searchbox", { name: "Filter project files" });
  await filter.fill("method");
  await expect(page.locator(".project-file-row", { hasText: "method.md" })).toBeVisible();
  await expect(page.locator(".project-file-row", { hasText: "findings.md" })).toBeHidden();
  await expect(page.locator("#project-file-filter-status")).toContainText("1 of");
  await filter.press("Enter");
  await expect(page.locator("#preview-file-context")).toHaveText("chapters/method.md · isolated file");
  await expect(page.locator("#source-editor")).toBeFocused();

  await page.getByRole("button", { name: "Collapse project rail" }).click();
  await page.keyboard.press("Control+p");
  await expect(page.locator(".source-rail")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Files" })).toHaveAttribute("aria-selected", "true");
  await expect(filter).toBeFocused();
});

test("keeps workspace and Library navigation usable on a phone", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Phone layout");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/editor/${workspaceId}`);

  const workspaceLayout = await page.evaluate(() => {
    const headerGroups = [...document.querySelectorAll<HTMLElement>(".app-header-row > div")].map((group) => group.getBoundingClientRect());
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      separateHeaderRows: headerGroups[0]!.bottom <= headerGroups[1]!.top,
      groupsFit: headerGroups.every((group) => group.left >= 0 && group.right <= innerWidth),
    };
  });
  expect(workspaceLayout).toEqual({ clientWidth: 390, scrollWidth: 390, separateHeaderRows: true, groupsFit: true });
  await expect(page.locator("#show-authoring-surface")).toBeVisible();

  await page.goto("/library");
  const libraryLayout = await page.evaluate(() => {
    const primaryHeader = document.querySelector<HTMLElement>(".app-header-row > div:first-child")!.getBoundingClientRect();
    const contextHeader = document.querySelector<HTMLElement>(".library-header-context")!.getBoundingClientRect();
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      contextFollowsPrimaryHeader: contextHeader.top >= primaryHeader.bottom,
      contextFits: contextHeader.left >= 0 && contextHeader.right <= innerWidth,
    };
  });
  expect(libraryLayout).toEqual({
    clientWidth: 390,
    scrollWidth: 390,
    contextFollowsPrimaryHeader: true,
    contextFits: true,
  });
  await expect(page.locator("#context-library-panel")).toBeVisible();
});

test("keeps shared, editable, and missing views usable on a narrow phone", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Narrow phone layout");
  const origin = "http://127.0.0.1:8788";
  const shareResponse = await page.request.post(`/api/workspaces/${workspaceId}/share-link`, { headers: { origin } });
  const editResponse = await page.request.post(`/api/workspaces/${workspaceId}/edit-link`, { headers: { origin } });
  const share = (await shareResponse.json()) as { href: string };
  const edit = (await editResponse.json()) as { href: string };
  await page.setViewportSize({ width: 320, height: 568 });

  await page.goto(`/editor/${workspaceId}`);
  await expect(page.locator("#workspace-switcher")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  await page.goto(share.href);
  await expect(page.locator("#shared-file-switcher")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Project files" })).toBeHidden();
  expect(await page.locator("#shared-file-switcher").evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(96);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  await page.goto(edit.href);
  await expect(page.locator("#edit-file-switcher")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Project files" })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  await page.setViewportSize({ width: 1200, height: 500 });
  await page.goto(share.href);
  const pdfBounds = await page.locator("#shared-pdf-viewer").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { bottom: bounds.bottom, height: bounds.height };
  });
  expect(pdfBounds.bottom).toBeLessThanOrEqual(500);
  expect(pdfBounds.height).toBeGreaterThan(200);

  await page.setViewportSize({ width: 320, height: 568 });
  const missingResponse = await page.goto("/does-not-exist");
  expect(missingResponse?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Return to Kirjolab" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test("keeps editor controls visible at a compact split width", async ({ page }) => {
  await page.setViewportSize({ width: 1197, height: 800 });
  const workspaceId = await createWorkspace(page, "Compact split toolbar");
  await page.goto(`/editor/${workspaceId}`);

  await expect(page.locator("#project-file-switcher")).toHaveCount(0);
  await expect(page.locator("#files-rail-panel")).toBeVisible();
  const toolbarFit = await page.locator(".editor-toolbar").evaluate((toolbar) => {
    const toolbarBounds = toolbar.getBoundingClientRect();
    const visibleControls = [
      ...toolbar.querySelectorAll(":scope > .editor-toolbar-group > button, :scope > .editor-toolbar-group > details > summary"),
    ].filter((control): control is HTMLElement => control instanceof HTMLElement && control.offsetParent !== null);
    const clippedControls = visibleControls.flatMap((control) => {
      const bounds = control.getBoundingClientRect();
      const fits =
        bounds.left >= toolbarBounds.left &&
        bounds.right <= toolbarBounds.right &&
        bounds.top >= toolbarBounds.top &&
        bounds.bottom <= toolbarBounds.bottom;
      return fits ? [] : [control.textContent?.trim() ?? control.tagName];
    });
    return {
      pageOverflows: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) > window.innerWidth,
      clippedControls,
      rowCount: new Set(
        [...toolbar.querySelectorAll(":scope > .editor-toolbar-group")]
          .filter((group): group is HTMLElement => group instanceof HTMLElement && group.offsetParent !== null)
          .map((group) => Math.round(group.getBoundingClientRect().top)),
      ).size,
    };
  });
  expect(toolbarFit).toEqual({ pageOverflows: false, clippedControls: [], rowCount: 1 });

  const editorFit = await page.locator("#authoring-surface").evaluate((authoring) => {
    const workspace = document.querySelector<HTMLElement>("#workspace-surfaces")!;
    const shell = authoring.querySelector<HTMLElement>("#source-editor-shell")!;
    const editor = shell.querySelector<HTMLTextAreaElement>("#source-editor")!;
    return {
      authoringGap: Math.round(workspace.getBoundingClientRect().bottom - authoring.getBoundingClientRect().bottom),
      editorGap: Math.round(authoring.getBoundingClientRect().bottom - shell.getBoundingClientRect().bottom),
      resize: getComputedStyle(editor).resize,
    };
  });
  expect(editorFit).toEqual({ authoringGap: 0, editorGap: 0, resize: "none" });

  await page.locator("#editor-more-menu summary").click();
  const moreMenu = page.locator("#editor-more-menu .editor-command-menu");
  await expect(moreMenu.getByRole("button", { name: /History/ })).toBeVisible();
  await expect(moreMenu.getByRole("button", { name: /Vim editing/ })).toHaveCount(0);
  await expect(moreMenu.getByRole("button", { name: "Move or rename file" })).toBeVisible();
  await page.locator("#editor-more-menu summary").click();

  await page.locator("#editor-insert-menu summary").click();
  const includeAction = page.locator("#include-project-file-list [data-include-file-id]").first();
  await expect(includeAction.locator("code")).toHaveText("::include[…]");
  const includeActionFit = await includeAction.evaluate((button) => {
    const label = button.querySelector("strong")?.getBoundingClientRect();
    const help = button.querySelector("code")?.getBoundingClientRect();
    const menu = button.closest(".editor-command-menu")?.getBoundingClientRect();
    if (!label || !help || !menu) throw new Error("Expected include action geometry");
    return {
      textOverlaps: label.right > help.left,
      actionFits: label.left >= menu.left && help.right <= menu.right,
    };
  });
  expect(includeActionFit).toEqual({ textOverlaps: false, actionFits: true });
});

test("keeps the local editor target visible after focus moves to Context", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Remembered editor target");
  await page.goto(`/editor/${workspaceId}`);
  const editor = page.locator("#source-editor");
  await editor.fill("# Target\n\nVisible selection remains anchored.");

  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(2, 2);
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await expect(page.locator("#editor-target-status")).toContainText("main.md · line 1 · caret");
  await expect(page.locator('#source-editor-highlight .source-editor-line[data-line-number="1"] .local-author-caret')).toHaveCount(1);

  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(10, 27);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });

  await expect(page.locator("#editor-target-status")).toContainText("main.md · line 3 · 17 characters selected");
  await page.getByRole("tab", { name: "Writing assistant" }).click();
  await expect(page.locator("#source-editor-highlight .local-author-selection")).toContainText("Visible selection");

  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  const localCaret = page.locator("#source-editor-highlight .local-author-caret");
  await expect(localCaret).toHaveCSS("visibility", "hidden");
  await page.getByRole("tab", { name: "Writing assistant" }).click();
  await expect(page.locator("#editor-target-status")).toContainText("line 3 · caret");
  await expect(localCaret).toHaveCSS("visibility", "visible");
  expect(await localCaret.evaluate((element) => getComputedStyle(element, "::after").content)).toBe("none");
});

test("highlights Markdown without replacing the native editor", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const workspaceId = await createWorkspace(page, "Highlighted source");
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  const source = [
    "## Findings {#findings}",
    "",
    "Use :cite[smith2024], **careful emphasis**, and [context](https://example.test).",
    '<img src=x onerror="document.body.dataset.injected=true">',
    `Long wrapped prose ${"word ".repeat(80)}`,
    ...Array.from({ length: 80 }, (_, index) => `- Supporting line ${index + 1}`),
  ].join("\n");
  const editor = page.locator("#source-editor");
  const highlight = page.locator("#source-editor-highlight");
  await editor.fill(source);

  await expect(highlight).toHaveText(source);
  await expect(highlight.locator(".markdown-token-heading")).toContainText("Findings");
  await expect(highlight.locator(".markdown-token-directive")).toContainText(":cite[smith2024]");
  await expect(highlight.locator(".markdown-token-link")).toContainText("[context](https://example.test)");
  const sourceLines = highlight.locator(".source-editor-line");
  await expect(sourceLines).toHaveCount(source.split("\n").length);
  await expect(sourceLines.first()).toHaveAttribute("data-line-number", "1");
  await expect(sourceLines.last()).toHaveAttribute("data-line-number", String(source.split("\n").length));
  expect(
    await sourceLines.first().evaluate((line) => {
      const style = getComputedStyle(line, "::before");
      return style.content.includes("1") && style.color !== "rgba(0, 0, 0, 0)";
    }),
  ).toBe(true);
  await expect(highlight.locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.dataset.injected)).toBeUndefined();
  const highlightGeometry = await page.locator(".source-editor-shell").evaluate((shell) => {
    const textarea = shell.querySelector<HTMLTextAreaElement>("#source-editor")!;
    const mirror = shell.querySelector<HTMLElement>("#source-editor-highlight")!;
    const inputStyle = getComputedStyle(textarea);
    const mirrorStyle = getComputedStyle(mirror);
    return {
      sameWidth: textarea.clientWidth === mirror.clientWidth,
      font: inputStyle.font === mirrorStyle.font,
      padding: inputStyle.padding === mirrorStyle.padding,
      outerInlinePadding: parseFloat(inputStyle.paddingInlineEnd),
      textInset: parseFloat(inputStyle.paddingInlineStart),
      wrappedLineNumberStaysAligned: [...mirror.querySelectorAll<HTMLElement>(".source-editor-line")].some(
        (line) => line.getBoundingClientRect().height > parseFloat(mirrorStyle.lineHeight) * 1.5,
      ),
      whiteSpace: mirrorStyle.whiteSpace,
    };
  });
  expect(highlightGeometry).toMatchObject({
    sameWidth: true,
    font: true,
    padding: true,
    wrappedLineNumberStaysAligned: true,
    whiteSpace: "pre-wrap",
  });
  expect(highlightGeometry.outerInlinePadding).toBeGreaterThanOrEqual(16);
  expect(highlightGeometry.outerInlinePadding).toBeLessThanOrEqual(24);
  expect(highlightGeometry.textInset).toBeLessThanOrEqual(76);
  const verticalExtent = await page.locator(".source-editor-shell").evaluate((shell) => {
    const textarea = shell.querySelector<HTMLTextAreaElement>("#source-editor")!;
    const mirror = shell.querySelector<HTMLElement>("#source-editor-highlight")!;
    return {
      textarea: textarea.scrollHeight,
      mirror: mirror.scrollHeight,
      lineHeight: getComputedStyle(textarea).lineHeight,
    };
  });
  expect(verticalExtent.lineHeight).toBe("27px");
  expect(Math.abs(verticalExtent.textarea - verticalExtent.mirror), JSON.stringify(verticalExtent)).toBeLessThanOrEqual(1);
  const scrollPositions = await editor.evaluate((element: HTMLTextAreaElement) => {
    const mirror = document.querySelector<HTMLElement>("#source-editor-highlight")!;
    const maximum = element.scrollHeight - element.clientHeight;
    return [0, maximum / 2, maximum].map((position) => {
      element.scrollTop = position;
      element.dispatchEvent(new Event("scroll"));
      return { textarea: element.scrollTop, mirror: mirror.scrollTop };
    });
  });
  expect(scrollPositions.every(({ textarea, mirror }) => Math.abs(textarea - mirror) <= 1)).toBe(true);

  await page.emulateMedia({ forcedColors: "active" });
  expect(
    await sourceLines.first().evaluate((line) => {
      const gutter = getComputedStyle(line, "::before");
      const editor = getComputedStyle(document.querySelector("#source-editor")!);
      return gutter.color !== "rgba(0, 0, 0, 0)" && editor.color !== "rgba(0, 0, 0, 0)";
    }),
  ).toBe(true);
  await page.emulateMedia({ forcedColors: "none" });
});

test("undoes local Markdown edits without reverting collaborators", async ({ page, context }) => {
  const workspaceId = await createWorkspace(page, "Undoable source editing");
  const path = `/editor/${workspaceId}`;
  await page.goto(path);
  const collaborator = await context.newPage();
  await collaborator.goto(path);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();

  const editor = page.locator("#source-editor");
  const collaboratorEditor = collaborator.locator("#source-editor");
  const shared = "# Shared draft\n";
  await editor.fill(shared);
  await expect(collaboratorEditor).toHaveValue(shared);

  await collaboratorEditor.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  });
  await collaboratorEditor.pressSequentially("Remote note.\n");
  const remotelyEdited = `${shared}Remote note.\n`;
  await expect(editor).toHaveValue(remotelyEdited);

  await page.waitForTimeout(550);
  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  });
  await editor.pressSequentially("Local note.\n");
  const locallyEdited = `${remotelyEdited}Local note.\n`;
  await expect(collaboratorEditor).toHaveValue(locallyEdited);

  await editor.press("ControlOrMeta+z");
  await expect(editor).toHaveValue(remotelyEdited);
  await expect(collaboratorEditor).toHaveValue(remotelyEdited);
  await editor.press("ControlOrMeta+Shift+z");
  await expect(editor).toHaveValue(locallyEdited);
  await expect(collaboratorEditor).toHaveValue(locallyEdited);

  await page.locator("#new-project-file-rail").click();
  await page.locator("#project-file-path").fill("notes.md");
  await page.locator("#project-file-form").getByRole("button", { name: "Save file" }).click();
  await editor.fill("File-specific history\n");
  await page.locator(".project-file-row", { hasText: "main.md" }).click();
  await page.locator(".project-file-row", { hasText: "notes.md" }).click();
  await editor.press("ControlOrMeta+z");
  await expect(editor).toHaveValue("");
  await collaborator.locator(".project-file-row", { hasText: "notes.md" }).click();
  await expect(collaboratorEditor).toHaveValue("");
  await collaborator.close();
});

test("restores offline manuscript edits and synchronizes them after reconnect", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Offline train draft");
  const path = `/editor/${workspaceId}`;
  await page.goto(path);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  await expect.poll(async () => await page.locator("body").getAttribute("data-offline-ready")).toBe("true");
  await expect.poll(async () => await page.locator("body").getAttribute("data-offline-saved-at")).not.toBeNull();

  const editor = page.locator("#source-editor");
  const onlineSource = "# Train draft\n\nThe connection may disappear.\n";
  const previousOfflineSave = await page.locator("body").getAttribute("data-offline-saved-at");
  await editor.fill(onlineSource);
  await expect(page.locator("#save-status")).toHaveText("Saved");
  await expect.poll(async () => await page.locator("body").getAttribute("data-offline-saved-at")).not.toBe(previousOfflineSave);

  await page.context().setOffline(true);
  await page.reload();
  await expect(editor).toHaveValue(onlineSource);
  await expect(editor).toBeEnabled();
  await expect(page.locator("#connection-status")).toContainText("Offline");

  const offlineSource = `${onlineSource}\nWritten between stations.\n`;
  await editor.fill(offlineSource);
  await expect(page.locator("#save-status")).toHaveText("Saved offline");
  await page.reload();
  await expect(editor).toHaveValue(offlineSource);
  await expect(page.locator("#save-status")).toHaveText("Saved offline");

  await page.context().setOffline(false);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  await expect(page.locator("#save-status")).toHaveText("Saved");
  await expect.poll(async () => (await readWorkspaceSnapshot(page, `/api/workspaces/${workspaceId}`)).source).toBe(offlineSource);
});

test("offers opt-in Vim editing over the collaborative textarea", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Vim source editing");
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  const editor = page.locator("#source-editor");
  const toggle = page.locator("#vim-toggle");
  const mode = page.locator("#vim-mode-status");
  await editor.fill("one two\nthree");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.locator("#preferences-menu > summary").click();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(mode).toHaveText("NORMAL");
  await expect(editor).toBeFocused();

  await editor.press("g");
  await editor.press("g");
  await editor.press("w");
  expect(await editor.evaluate((element: HTMLTextAreaElement) => element.selectionStart)).toBe(4);
  await editor.press("i");
  await expect(mode).toHaveText("INSERT");
  await editor.pressSequentially("new ");
  await editor.press("Escape");
  await expect(mode).toHaveText("NORMAL");
  await expect(editor).toHaveValue("one new two\nthree");

  await editor.press("0");
  await editor.press("d");
  await editor.press("d");
  await expect(editor).toHaveValue("three");
  await editor.press("q");
  await expect(editor).toHaveValue("three");
  await expect(page.locator("#source-editor-highlight")).toHaveText("three");
  await expect(page.locator("#save-status")).toHaveText("Saved");

  await page.reload();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(mode).toHaveText("NORMAL");
  await page.locator("#preferences-menu > summary").click();
  await toggle.click();
  await expect(mode).toBeHidden();
  await editor.press("End");
  await editor.press("q");
  await expect(editor).toHaveValue("threeq");
});

test("opens a live WYSIWYM scholarly workspace", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Live WYSIWYM workspace");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/editor/${workspaceId}`);

  await expect(page.getByRole("link", { name: "KIRJOLAB" })).toBeVisible();
  const accountSummary = page.locator("#account-menu summary");
  await expect(accountSummary).toHaveAttribute("aria-label", "Account for local@kirjolab.invalid");
  await expect(accountSummary).toHaveAttribute("title", "Account");
  await expect(accountSummary.locator("svg")).toBeVisible();
  await accountSummary.click();
  await expect(page.locator("#account-menu")).toContainText("Local mode has no login session.");
  await expect(page.locator("#log-out")).toHaveCount(0);
  await accountSummary.click();
  await expect(page.getByRole("heading", { level: 1, name: "Files" })).toBeVisible();
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();
  const railModes = page.locator(".rail-mode-switcher");
  await expect(railModes.locator(".rail-mode-icon")).toHaveCount(4);
  await expect(page.getByRole("tab", { name: "Files" })).toHaveAttribute("title", "Files");
  await expect(page.getByRole("tab", { name: "Research" })).toHaveAttribute("title", "Research");
  await expect(page.getByRole("tab", { name: "Comments" })).toHaveAttribute("title", "Comments");
  await expect(page.getByRole("tab", { name: "Writing guide" })).toHaveAttribute("title", "Writing guide");
  await expect(page.getByRole("tab", { name: "Files" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#files-rail-panel")).toBeVisible();
  await expect(page.locator("#research-rail-panel")).toBeHidden();
  expect(await railModes.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.locator("#save-status")).toHaveText("Saved");
  const assistantTab = page.getByRole("tab", { name: "Writing assistant" });
  await expect(assistantTab).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= document.documentElement.clientHeight)).toBe(true);
  const previewTab = page.getByRole("tab", { name: "Preview" });
  const libraryTab = page.getByRole("tab", { name: "Library" });
  await previewTab.focus();
  await previewTab.press("ArrowRight");
  await expect(libraryTab).toBeFocused();
  await libraryTab.press("Enter");
  await expect(page.locator("#context-library-panel")).toBeVisible();
  await libraryTab.press("ArrowRight");
  await expect(assistantTab).toBeFocused();
  await assistantTab.press("Enter");
  await expect(page.locator("#context-assistant-panel")).toBeVisible();
  await previewTab.click();
  await expect(page.locator("#open-source-citation")).toBeHidden();
  await expect(page.locator("#pin-active-context")).toHaveCount(0);
  await expect(page.locator("#close-active-context")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Project settings" })).toBeHidden();
  await page.locator(".header-action-menu summary").click();
  await expect(page.getByRole("button", { name: "Project settings" })).toBeVisible();
  await page.getByRole("button", { name: "Project settings" }).click();
  await expect(page.locator("#workspace-settings-dialog")).toBeVisible();
  await page.locator("#close-workspace-settings").click();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  await expect(page.locator("#source-editor")).toHaveValue(/## Evidence becomes prose/);

  await page.getByRole("tab", { name: "Files" }).click();
  await expect(page.locator("#project-file-list")).toContainText("main.md");
  await expect(page.getByRole("button", { name: "Add file" }).first()).toBeVisible();
  const insertMenu = page.locator("#editor-insert-menu");
  const insertSummary = insertMenu.locator("summary");
  await insertSummary.focus();
  await insertSummary.press("Enter");
  await expect(insertMenu).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(insertMenu).not.toHaveAttribute("open", "");
  await expect(insertSummary).toBeFocused();
  await insertSummary.click();
  await insertMenu.getByRole("button", { name: /Citation/ }).click();
  await expect(page.locator("#source-editor")).toHaveValue(/:cite\[key\]/);
  await page.getByRole("tab", { name: "Research" }).click();
  const paneResizer = page.getByRole("separator", { name: "Resize authoring and context panes" });
  await paneResizer.focus();
  await paneResizer.press("ArrowRight");
  await expect
    .poll(
      async () => await page.locator("#workspace-surfaces").evaluate((element) => element.style.getPropertyValue("--authoring-pane-width")),
    )
    .toMatch(/px$/u);
  const resizedPaneWidth = await page
    .locator("#workspace-surfaces")
    .evaluate((element) => element.style.getPropertyValue("--authoring-pane-width"));
  await libraryTab.click();
  await expect
    .poll(
      async () => await page.locator("#workspace-surfaces").evaluate((element) => element.style.getPropertyValue("--authoring-pane-width")),
    )
    .toBe(resizedPaneWidth);
  await assistantTab.click();
  await expect
    .poll(
      async () => await page.locator("#workspace-surfaces").evaluate((element) => element.style.getPropertyValue("--authoring-pane-width")),
    )
    .toBe(resizedPaneWidth);
  await previewTab.click();
  await paneResizer.press("Home");
  await expect
    .poll(
      async () => await page.locator("#workspace-surfaces").evaluate((element) => element.style.getPropertyValue("--authoring-pane-width")),
    )
    .toBe("");

  await page
    .locator("#source-editor")
    .fill(
      "## Evidence becomes prose {#sec-evidence}\n\nA live collaborative note cites prior work :cite[merton1942].[^live]\n\n| State | Result |\n| --- | --- |\n| Shared | **Visible** |\n\n[^live]: Rendered by Kirjolab.\n",
    );
  await expect(page.locator("#preview")).toContainText("Merton, 1942");
  await expect(page.locator("#diagnostic-summary")).toHaveText("No syntax errors");
  await expect(page.locator("#preview")).toContainText("A live collaborative note cites prior work");
  await expect(page.locator("#preview table")).toContainText("Visible");
  await expect(page.locator("#preview .footnotes")).toContainText("Rendered by Kirjolab");
  await expect(page.locator("#preview .section-number").first()).toBeVisible();
  await expect(page.locator("#revision-badge")).not.toHaveText("r0");
  await page.locator("#source-editor").evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  });
  await page.locator("#editor-insert-menu summary").click();
  await page.locator('[data-insert-syntax="bibliography"]').click();
  await expect(page.locator("#source-editor")).toHaveValue(/::bibliography\[\]$/u);
  await expect(page.locator("#preview .semantic-bibliography")).toContainText(
    "Merton, Robert K. (1942). The Normative Structure of Science.",
  );

  await page.locator("#source-editor").evaluate((element: HTMLTextAreaElement) => {
    const citation = element.value.indexOf(":cite[merton1942]");
    element.focus();
    element.setSelectionRange(citation + 7, citation + 7);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await expect(page.locator("#open-source-citation")).toBeVisible();
  for (let step = 0; step < 10; step += 1) await paneResizer.press("ArrowLeft");
  const citedSourceFit = await page.locator("#open-source-citation").evaluate((button) => {
    const toolbar = button.closest(".editor-toolbar");
    if (!(toolbar instanceof HTMLElement)) throw new Error("Expected editor toolbar");
    const buttonBounds = button.getBoundingClientRect();
    const toolbarBounds = toolbar.getBoundingClientRect();
    const labelRange = document.createRange();
    labelRange.selectNodeContents(button);
    return {
      labelLines: labelRange.getClientRects().length,
      whiteSpace: getComputedStyle(button).whiteSpace,
      insideToolbar: buttonBounds.top >= toolbarBounds.top && buttonBounds.bottom <= toolbarBounds.bottom,
      pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  expect(citedSourceFit).toEqual({ labelLines: 1, whiteSpace: "nowrap", insideToolbar: true, pageOverflows: false });

  const exported = await page.request.get(`${api}/export/document.md`);
  expect(exported.ok()).toBe(true);
  expect(exported.headers()["content-disposition"]).toContain("kirjolab-document.md");
  expect(await exported.text()).toContain("A live collaborative note cites prior work");

  await expect(page.locator("#word-count-badge")).toContainText("words");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.locator("#export-dialog")).toBeVisible();
  await expect(page.locator("#export-statistics")).toContainText("Composed prose from main.md");
  await expect(page.getByRole("link", { name: /PDF Formatted document/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /LaTeX project/ })).toBeVisible();

  const statistics = await page.request.get(`${api}/export/statistics.json`);
  expect(statistics.ok()).toBe(true);
  expect(await statistics.json()).toMatchObject({ countingRule: "kirjolab-prose-v1", totalWords: expect.any(Number) });
  const latex = await page.request.get(`${api}/export/latex.zip`);
  expect(latex.ok()).toBe(true);
  expect(latex.headers()["content-type"]).toContain("application/zip");
  expect((await latex.body()).subarray(0, 2).toString()).toBe("PK");
  const pdf = await page.request.get(`${api}/export/document.pdf`);
  expect(pdf.ok()).toBe(true);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const sourceBundle = await page.request.get(`${api}/export/source.zip`);
  expect(sourceBundle.ok()).toBe(true);
  expect((await sourceBundle.body()).subarray(0, 2).toString()).toBe("PK");
});

test("styles rendered Markdown headings in descending size order", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Heading hierarchy workspace");
  await page.goto(`/editor/${workspaceId}`);
  await page.locator("#source-editor").fill("# Research manuscript\n\n## Evidence\n\n### Analysis\n\n#### Detail\n\nBody text.\n");

  await expect(page.locator("#preview h1")).toHaveText("Research manuscript");
  const headingFontSizes = await page
    .locator("#preview h1, #preview h2, #preview h3, #preview > b")
    .evaluateAll((headings) => headings.map((heading) => Number.parseFloat(getComputedStyle(heading).fontSize)));
  expect(headingFontSizes).toHaveLength(4);
  expect(headingFontSizes[0]).toBeGreaterThan(headingFontSizes[1]!);
  expect(headingFontSizes[1]).toBeGreaterThan(headingFontSizes[2]!);
  expect(headingFontSizes[2]).toBeGreaterThan(headingFontSizes[3]!);
});

test("synchronizes the source caret and rendered Preview in both directions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const workspaceId = await createWorkspace(page, "Source Preview synchronization");
  const source = "# Synchronized paper\n\nFirst passage.\n\n## Findings\n\nSecond passage.\n";
  await page.goto(`/editor/${workspaceId}`);
  const editor = page.locator("#source-editor");
  await editor.fill(source);

  const controls = page.getByRole("group", { name: "Synchronize source and preview" });
  await expect(controls).toBeVisible();
  const dividerCenterOffset = await controls.evaluate((element) => {
    const divider = document.querySelector("#authoring-context-resizer");
    if (!(divider instanceof HTMLElement)) throw new Error("Expected authoring/context divider");
    const controlBounds = element.getBoundingClientRect();
    const dividerBounds = divider.getBoundingClientRect();
    return controlBounds.left + controlBounds.width / 2 - (dividerBounds.left + dividerBounds.width / 2);
  });
  expect(dividerCenterOffset).toBeCloseTo(0, 5);
  const controlEdgesAreInteractive = await controls.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const centerY = bounds.top + bounds.height / 2;
    return [bounds.left + 1, bounds.right - 1].every((x) => element.contains(document.elementFromPoint(x, centerY)));
  });
  expect(controlEdgesAreInteractive).toBe(true);
  const secondPassage = page.locator("#preview p", { hasText: "Second passage." });
  await expect(secondPassage).toBeVisible();

  await editor.evaluate((element: HTMLTextAreaElement, offset: number) => {
    element.focus();
    element.setSelectionRange(offset, offset);
  }, source.indexOf("Second passage."));
  await page.getByRole("button", { name: "Reveal centered source passage in Preview" }).click();
  await expect(secondPassage).toHaveAttribute("data-preview-sync-active", "true");

  const firstPassage = page.locator("#preview p", { hasText: "First passage." });
  await firstPassage.click();
  await expect(editor).toBeFocused();
  await expect
    .poll(async () => await editor.evaluate((element: HTMLTextAreaElement) => element.selectionStart))
    .toBe(source.indexOf("First passage."));
  await expect(firstPassage).toHaveAttribute("data-preview-sync-active", "true");
});

test("synchronizes Preview from the centered editor passage instead of a stale caret", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const workspaceId = await createWorkspace(page, "Source viewport synchronization");
  const source = Array.from({ length: 40 }, (_, index) => `## Section ${index + 1}\n\nPassage ${index + 1}.\n`).join("\n");
  await page.goto(`/editor/${workspaceId}`);
  const editor = page.locator("#source-editor");
  await editor.fill(source);
  const passage = page.locator("#preview p", { hasText: "Passage 30." });
  await expect(passage).toBeVisible();

  await editor.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(0, 0));
  const sourceLine = page.locator("#source-editor-highlight .source-editor-line", { hasText: "Passage 30." });
  await expect
    .poll(async () =>
      Math.abs(
        await sourceLine.evaluate((line) => {
          const editor = document.querySelector<HTMLTextAreaElement>("#source-editor");
          if (!editor || !(line instanceof HTMLElement)) throw new Error("Expected source editor line");
          editor.scrollTop = line.offsetTop + line.clientHeight / 2 - editor.clientHeight / 2;
          return line.offsetTop + line.clientHeight / 2 - (editor.scrollTop + editor.clientHeight / 2);
        }),
      ),
    )
    .toBeLessThan(1);

  await page.getByRole("button", { name: "Reveal centered source passage in Preview" }).click();
  await expect
    .poll(async () =>
      Math.abs(
        await passage.evaluate((element) => {
          const previewScroll = document.querySelector("#preview-scroll");
          if (!previewScroll) throw new Error("Expected Preview scroller");
          const passageBounds = element.getBoundingClientRect();
          const previewBounds = previewScroll.getBoundingClientRect();
          return passageBounds.top + passageBounds.height / 2 - (previewBounds.top + previewBounds.height / 2);
        }),
      ),
    )
    .toBeLessThan(1);
  expect(
    await page.evaluate(() => ({
      documentFits: document.documentElement.scrollHeight <= document.documentElement.clientHeight,
      scrollY: window.scrollY,
    })),
  ).toEqual({ documentFits: true, scrollY: 0 });

  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.scrollTop = 0;
  });
  await page.getByRole("button", { name: "Reveal centered Preview passage in source" }).click();
  await expect
    .poll(async () => await editor.evaluate((element: HTMLTextAreaElement) => element.selectionStart))
    .toBe(source.indexOf("Passage 30."));
  await expect
    .poll(async () =>
      Math.abs(
        await sourceLine.evaluate((line) => {
          const editor = document.querySelector<HTMLTextAreaElement>("#source-editor");
          if (!editor || !(line instanceof HTMLElement)) throw new Error("Expected source editor line");
          return line.offsetTop + line.clientHeight / 2 - (editor.scrollTop + editor.clientHeight / 2);
        }),
      ),
    )
    .toBeLessThan(1);
});

test("keeps Markdown comment blocks in source and out of publication", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Markdown comments workspace");
  const api = `/api/workspaces/${workspaceId}`;
  const source = `## Visible

::: comment
## Hidden draft
::include[missing.md]
:cite[missing]
:::

Published ending.
`;
  await page.goto(`/editor/${workspaceId}`);
  await page.locator("#source-editor").fill(source);

  await expect(page.locator("#source-editor")).toHaveValue(source);
  await expect(page.locator("#source-editor-highlight .markdown-token-comment").filter({ hasText: "Hidden draft" })).toBeVisible();
  await expect(page.locator("#preview")).toContainText("Visible");
  await expect(page.locator("#preview")).toContainText("Published ending.");
  await expect(page.locator("#preview")).not.toContainText("Hidden draft");
  await expect.poll(async () => (await page.request.get(`${api}/export/document.md`)).status()).toBe(200);
  expect(await (await page.request.get(`${api}/export/document.md`)).text()).not.toContain("Hidden draft");
});

test("maps broken export composition back to authored source without losing recovery output", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Broken export diagnostics");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  await page.locator("#source-editor").fill("# Broken\n::include[missing.md]\n");
  await expect(page.locator("#diagnostic-summary")).toContainText("issues");
  await expect.poll(async () => (await page.request.get(`${api}/export/document.md`)).status()).toBe(422);

  const failed = await page.request.get(`${api}/export/document.md`);
  expect(await failed.json()).toMatchObject({
    error: "Project composition must be fixed before export",
    diagnostics: [{ code: "missing-file", path: "main.md", line: 2, includeChain: [expect.any(String)] }],
  });
  const diagnostics = await page.request.get(`${api}/export/diagnostics.json`);
  expect(diagnostics.ok()).toBe(true);
  expect(await diagnostics.json()).toMatchObject([{ code: "missing-file", line: 2 }]);
  const sourceBundle = await page.request.get(`${api}/export/source.zip`);
  expect(sourceBundle.ok()).toBe(true);
  expect((await sourceBundle.body()).subarray(0, 2).toString()).toBe("PK");
  await expect(page.locator("#preview")).toContainText("Broken");
});

test("uploads project images, inserts relative Markdown, and renders authorized bytes", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Illustrated project");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.locator("#project-file-list")).toContainText("figures/");
  const figuresFolder = page.locator(".project-folder-row", { hasText: "figures/" });
  await figuresFolder.locator("summary").click();
  const folderMenu = figuresFolder.locator(".editor-command-menu");
  await expect(folderMenu.getByRole("button", { name: "Move or rename" })).toBeVisible();
  await expect(folderMenu.getByRole("button", { name: "Delete empty folder" })).toBeVisible();
  const folderMenuFit = await folderMenu.evaluate((menu) => {
    const rail = menu.closest(".source-rail");
    if (!rail) throw new Error("Expected Files rail");
    const menuBounds = menu.getBoundingClientRect();
    const railBounds = rail.getBoundingClientRect();
    return {
      leftClipped: menuBounds.left < railBounds.left,
      rightClipped: menuBounds.right > railBounds.right,
    };
  });
  expect(folderMenuFit).toEqual({ leftClipped: false, rightClipped: false });
  await figuresFolder.locator("summary").click();

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await page.locator("#project-image-upload").setInputFiles({ name: "result chart.png", mimeType: "image/png", buffer: png });
  const asset = page.locator(".project-asset-row", { hasText: "result chart.png" });
  await expect(asset).toBeVisible();
  await asset.locator("summary").click();
  const assetMenu = asset.locator(".editor-command-menu");
  await expect(assetMenu.getByRole("button", { name: "Insert image" })).toBeVisible();
  await expect(assetMenu.getByRole("link", { name: "Open image" })).toBeVisible();
  await expect(assetMenu.getByRole("button", { name: "Delete image" })).toBeVisible();
  const assetMenuFit = await assetMenu.evaluate((menu) => {
    const rail = menu.closest(".source-rail");
    if (!rail) throw new Error("Expected Files rail");
    const menuBounds = menu.getBoundingClientRect();
    const railBounds = rail.getBoundingClientRect();
    return {
      leftClipped: menuBounds.left < railBounds.left,
      rightClipped: menuBounds.right > railBounds.right,
    };
  });
  expect(assetMenuFit).toEqual({ leftClipped: false, rightClipped: false });
  await asset.getByRole("button", { name: "Insert image" }).click();
  await expect(page.locator("#source-editor")).toHaveValue(/!\[result chart\]\(<figures\/result chart\.png>\)/u);
  const previewImage = page.locator("#preview img");
  await expect(previewImage).toBeVisible();
  await expect(previewImage).toHaveAttribute("src", /\/api\/workspaces\/[^/]+\/assets\//u);

  const imageUrl = await previewImage.getAttribute("src").then((value) => value ?? "");
  const imageResponse = await page.request.get(imageUrl);
  expect(imageResponse.ok()).toBe(true);
  expect(imageResponse.headers()["content-type"]).toBe("image/png");
  expect(imageResponse.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await imageResponse.body()).toEqual(png);

  await asset.getByRole("button", { name: "Delete image" }).click();
  await expect(asset).toBeHidden();
  await expect(page.locator("#toast")).toContainText("Deleted figures/result chart.png.");
  await page.locator("#toast").getByRole("button", { name: "Undo" }).click();
  await expect(asset).toBeVisible();
  await expect(page.locator("#toast")).toHaveText("Restored figures/result chart.png.");
  expect((await page.request.get(imageUrl)).ok()).toBe(true);

  await asset.locator("summary").click();
  const deletion = page.waitForResponse((response) => response.request().method() === "DELETE" && response.url() === imageResponse.url());
  await asset.getByRole("button", { name: "Delete image" }).click();
  await expect(asset).toBeHidden();
  const deletionResponse = await deletion;
  expect(deletionResponse.ok()).toBe(true);
  expect(await deletionResponse.json()).toMatchObject({ assets: [] });

  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><defs><linearGradient id="ink"><stop stop-color="#1d4ed8"/></linearGradient></defs><rect width="40" height="20" rx="3" fill="url(#ink)"/></svg>',
  );
  await page.locator("#project-image-upload").setInputFiles({ name: "vector result.svg", mimeType: "image/svg+xml", buffer: svg });
  const svgAsset = page.locator(".project-asset-row", { hasText: "vector result.svg" });
  await expect(svgAsset).toBeVisible();
  await svgAsset.locator("summary").click();
  await svgAsset.getByRole("button", { name: "Insert image" }).click();
  await expect(page.locator("#source-editor")).toHaveValue(/!\[vector result\]\(<figures\/vector result\.svg>\)/u);
  const svgPreview = page.locator('#preview img[alt="vector result"]');
  await expect(svgPreview).toBeVisible();
  const svgResponse = await page.request.get((await svgPreview.getAttribute("src")) ?? "");
  expect(svgResponse.ok()).toBe(true);
  expect(svgResponse.headers()["content-type"]).toBe("image/svg+xml");
  expect(svgResponse.headers()["content-security-policy"]).toBe("sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  expect(svgResponse.headers()["cross-origin-resource-policy"]).toBe("same-origin");
  expect(await svgResponse.body()).toEqual(svg);

  const rejectedActiveSvg = await page.request.post(`${api}/assets`, {
    headers: {
      "content-type": "image/svg+xml",
      "x-file-path": encodeURIComponent("figures/active.svg"),
      origin: new URL(page.url()).origin,
    },
    data: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  });
  expect(rejectedActiveSvg.status()).toBe(415);
  const rejectedExternalSvg = await page.request.post(`${api}/assets`, {
    headers: {
      "content-type": "image/svg+xml",
      "x-file-path": encodeURIComponent("figures/external.svg"),
      origin: new URL(page.url()).origin,
    },
    data: '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.test/tracker.png"/></svg>',
  });
  expect(rejectedExternalSvg.status()).toBe(415);
  const sourceBundle = await page.request.get(`${api}/export/source.zip`);
  expect(sourceBundle.ok()).toBe(true);
  expect((await sourceBundle.body()).subarray(0, 2).toString()).toBe("PK");
});

test("authors textual and parenthetical citation aliases", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Citation aliases");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/editor/${workspaceId}`);
  const source = "## Argument\n\nAs :citet[merton1942] argues, compare :citep[merton1942].\n";
  const editor = page.locator("#source-editor");
  await editor.fill(source);
  await expect(page.locator("#diagnostic-summary")).toHaveText("No syntax errors");
  await expect(page.locator("#preview")).toContainText("As Merton (1942) argues, compare (Merton, 1942).");
  await expect(page.locator('#preview [data-citation="merton1942"]')).toHaveCount(2);

  await editor.evaluate((element: HTMLTextAreaElement) => {
    const citation = element.value.indexOf(":citet[merton1942]");
    element.focus();
    element.setSelectionRange(citation + 5, citation + 5);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await expect(page.locator("#open-source-citation")).toBeVisible();
  const markdown = await page.request.get(`${api}/export/document.md`);
  const exportedSource = await markdown.text();
  expect(exportedSource).toContain(":citet[merton1942]");
  expect(exportedSource).toContain(":citep[merton1942]");
});

test("shares linked reference PDFs with members but not public links", async ({ page, browser }) => {
  test.slow();
  await page.addInitScript(() => {
    Object.defineProperty(Promise, "withResolvers", { configurable: true, value: undefined, writable: true });
  });
  const failedPdfWorkerRequests: string[] = [];
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).pathname === "/pdf.worker.js") failedPdfWorkerRequests.push(request.failure()?.errorText ?? "failed");
  });
  const workspaceId = await createWorkspace(page, "Private library boundary");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();

  await page.getByRole("tab", { name: "Library" }).click();
  await expect(page.locator("#context-library-panel")).toBeVisible();
  await expect(page.locator("#reference-library-dialog")).toHaveCount(0);
  await page.locator("#library-bibliography-upload").setInputFiles({
    name: "private-library.bib",
    mimeType: "application/x-bibtex",
    buffer: Buffer.from(`@manual{privateGuide,
      title = {Private Research Guide},
      author = {Writer, Ada},
      year = {2026}
    }`),
  });
  const card = page.locator("#reference-library-list .library-reference-row").filter({ hasText: "Private Research Guide" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("writer2026");
  await expect(card.getByRole("button", { name: "PDF", exact: true })).toHaveCount(0);
  await expect(page.locator("#publication-list")).not.toContainText("Private Research Guide");

  await card.getByRole("button", { name: "Add" }).click();
  await expect(page.locator("#publication-list")).toContainText("Private Research Guide");
  await page.locator("#library-pdf-upload").setInputFiles({
    name: "climate_adaptation.pdf",
    mimeType: "application/pdf",
    buffer: createTwoPageEvidencePdf(),
  });
  const pdfCard = page.locator("#reference-library-list .library-reference-row").filter({ hasText: "climate adaptation" });
  await expect(pdfCard).toContainText("sourceundatedclimate");
  await expect(page.locator("#unidentified-pdf-section")).toBeHidden();

  const beforePrivateReading = await readWorkspaceSnapshot(page, api);
  await expect(pdfCard.locator(".library-reference-details")).not.toHaveAttribute("open", "");
  await pdfCard.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(page.getByRole("tab", { name: "climate_adaptation.pdf" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#pdf-context-controls")).toBeVisible();
  await expect(page.locator("#paper-status")).toHaveText("Private library PDF · select text to highlight");
  await expect(page.locator("#annotation-composer")).toBeHidden();
  await expect(page.locator("#library-highlight-composer")).toBeHidden();
  await expect(page.locator("#library-highlight-composer")).not.toContainText("Highlight this PDF");
  await expect(page.getByRole("toolbar", { name: "PDF annotation tools" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Text", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Note", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Draw", exact: true })).toBeVisible();
  await expect(page.locator("#context-pdf-panel .context-pdf-body")).toHaveCSS("grid-template-columns", /\d+(?:\.\d+)?px \d+(?:\.\d+)?px/);
  await page.getByRole("button", { name: "Annotations", exact: true }).click();
  await expect(page.locator("#library-highlight-composer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Annotations", exact: true })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Close annotation inspector" }).click();
  await expect(page.locator("#library-highlight-composer")).toBeHidden();
  await expect(page.locator("#library-highlight-form")).toBeHidden();
  await expect(page.locator("#library-draw-color")).toHaveValue("#d33f49");
  await expect(page.locator("#export-library-annotated-pdf")).toBeDisabled();
  await expect(page.locator("#paper-page-indicator")).toHaveText("1 / 2");
  expect(failedPdfWorkerRequests).toEqual([]);
  const fittedCanvasWidth = Number(await page.locator("#paper-canvas").getAttribute("width"));
  await page.locator("#paper-reader").dispatchEvent("wheel", { ctrlKey: true, deltaY: -80, deltaMode: 0 });
  await expect.poll(async () => Number(await page.locator("#paper-canvas").getAttribute("width"))).toBeGreaterThan(fittedCanvasWidth);
  await page.locator("#paper-reader").evaluate((reader) => {
    reader.scrollLeft = (reader.scrollWidth - reader.clientWidth) / 2;
  });
  await page.locator("#paper-reader").dispatchEvent("wheel", { deltaX: 70, deltaY: 4, deltaMode: 0 });
  await expect(page.locator("#paper-page-indicator")).toHaveText("1 / 2");
  await page.locator("#paper-reader").evaluate((reader) => {
    reader.scrollLeft = reader.scrollWidth;
  });
  await page.locator("#paper-reader").dispatchEvent("wheel", { deltaX: 70, deltaY: 4, deltaMode: 0 });
  await expect(page.locator("#paper-page-indicator")).toHaveText("2 / 2");
  expect(await page.locator("#paper-reader").evaluate((reader) => reader.scrollLeft)).toBe(0);
  await page.waitForTimeout(450);
  await page.locator("#paper-reader").dispatchEvent("wheel", { deltaX: -70, deltaY: 4, deltaMode: 0 });
  await expect(page.locator("#paper-page-indicator")).toHaveText("1 / 2");
  await page.locator("#paper-text-layer").evaluate((layer) => {
    const startTouch = new Touch({ identifier: 10, target: layer, clientX: 220, clientY: 120 });
    layer.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [startTouch] }));
    const endTouch = new Touch({ identifier: 10, target: layer, clientX: 130, clientY: 125 });
    layer.dispatchEvent(new TouchEvent("touchend", { bubbles: true, changedTouches: [endTouch], touches: [] }));
  });
  await expect(page.locator("#paper-page-indicator")).toHaveText("2 / 2");
  await page.locator("#paper-text-layer").evaluate((layer) => {
    const startTouch = new Touch({ identifier: 11, target: layer, clientX: 130, clientY: 120 });
    layer.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [startTouch] }));
    const endTouch = new Touch({ identifier: 11, target: layer, clientX: 220, clientY: 125 });
    layer.dispatchEvent(new TouchEvent("touchend", { bubbles: true, changedTouches: [endTouch], touches: [] }));
  });
  await expect(page.locator("#paper-page-indicator")).toHaveText("1 / 2");
  await page.locator("#paper-reader").dispatchEvent("wheel", { ctrlKey: true, deltaY: 80, deltaMode: 0 });
  await expect.poll(async () => Number(await page.locator("#paper-canvas").getAttribute("width"))).toBe(fittedCanvasWidth);
  await page.waitForTimeout(450);
  await page.locator("#paper-reader").dispatchEvent("wheel", { deltaX: 8, deltaY: 80, deltaMode: 0 });
  await expect(page.locator("#paper-page-indicator")).toHaveText("1 / 2");
  await page.locator("#paper-reader").dispatchEvent("wheel", { deltaX: 70, deltaY: 4, deltaMode: 0 });
  await expect(page.locator("#paper-page-indicator")).toHaveText("2 / 2");
  await page.waitForTimeout(450);
  await page.locator("#paper-reader").dispatchEvent("wheel", { deltaX: -70, deltaY: 4, deltaMode: 0 });
  await expect(page.locator("#paper-page-indicator")).toHaveText("1 / 2");
  await page.locator("#paper-text-layer").evaluate((layer) => {
    const startTouch = new Touch({ identifier: 9, target: layer, clientX: 220, clientY: 120 });
    layer.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [startTouch] }));
    const endTouch = new Touch({ identifier: 9, target: layer, clientX: 130, clientY: 125 });
    layer.dispatchEvent(new TouchEvent("touchend", { bubbles: true, changedTouches: [endTouch], touches: [] }));
  });
  await expect(page.locator("#paper-page-indicator")).toHaveText("2 / 2");
  await page.locator("#previous-paper-page").click();
  await expect(page.locator("#paper-page-indicator")).toHaveText("1 / 2");
  await page.locator("#paper-text-layer").evaluate((layer) => {
    const span = layer.querySelector("span");
    if (!span?.firstChild) throw new Error("Expected private PDF text");
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    layer.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await expect(page.locator("#paper-highlights [data-draft='true']")).toHaveCount(1);
  await expect(page.locator("#paper-status")).toHaveText("Private selection captured from page 1");
  await expect(page.locator("#library-highlight-composer")).toBeVisible();
  await expect.poll(async () => await page.evaluate(() => window.getSelection()?.isCollapsed)).toBe(false);
  await expect(page.locator("#library-highlight-quote")).not.toHaveValue("");
  await page.locator("#library-highlight-comment").fill("Private reading insight");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("#toast")).toHaveText("Private highlight saved to your library.");
  await expect(page.locator("#library-highlight-count")).toHaveText("1");
  await expect(page.locator("#library-highlight-list")).toContainText("Private reading insight");
  await expect.poll(async () => await page.evaluate(() => window.getSelection()?.isCollapsed)).toBe(true);
  await page.getByRole("button", { name: "Annotations", exact: true }).click();
  await page.locator("#paper-text-layer").evaluate((layer) => {
    const span = layer.querySelector("span");
    if (!span?.firstChild) throw new Error("Expected private PDF text");
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    layer.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await expect(page.locator("#library-highlight-form")).toBeVisible();
  await page.locator("#library-highlight-comment").fill("Additive follow-up");
  await page.locator("#save-library-highlight").click();
  await expect(page.locator("#toast")).toHaveText("Existing private highlight extended.");
  await expect(page.locator("#library-highlight-count")).toHaveText("1");
  await expect(page.locator("#library-highlight-list")).toContainText("Private reading insight");
  await expect(page.locator("#library-highlight-list")).toContainText("Additive follow-up");

  const highlightCard = page.locator("#library-highlight-list article").filter({ hasText: "Private reading insight" });
  await highlightCard.getByRole("button", { name: "Edit note" }).click();
  await page.locator("#library-highlight-comment").fill("Revised reading insight");
  await page.locator("#save-library-highlight").click();
  await expect(page.locator("#toast")).toHaveText("Private highlight note updated.");
  await expect(page.locator("#library-highlight-list")).toContainText("Revised reading insight");
  await expect(page.locator("#library-highlight-list")).not.toContainText("Additive follow-up");
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.locator("#paper-highlights [data-private='true']").first().click();
  await expect(page.locator("#library-highlight-form")).toBeVisible();
  await expect(page.locator("#library-highlight-comment")).toHaveValue("Revised reading insight");
  await page.locator("#cancel-library-highlight").click();

  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.locator("#paper-markups").evaluate((layer) => {
    const rect = layer.getBoundingClientRect();
    const start = { bubbles: true, pointerId: 70, clientX: rect.left + rect.width * 0.6, clientY: rect.top + rect.height * 0.25 };
    layer.dispatchEvent(new PointerEvent("pointerdown", start));
    layer.dispatchEvent(new PointerEvent("pointermove", { ...start, clientY: start.clientY + 40 }));
    layer.dispatchEvent(new PointerEvent("pointerup", { ...start, clientY: start.clientY + 40 }));
  });
  await expect(page.locator("#paper-markups .pdf-note-pin[data-draft='true']")).toHaveCount(0);
  await expect(page.locator("#library-note-form")).toBeHidden();
  await page.locator("#paper-markups").evaluate((layer) => {
    const rect = layer.getBoundingClientRect();
    const event = { bubbles: true, pointerId: 71, clientX: rect.left + rect.width * 0.7, clientY: rect.top + rect.height * 0.25 };
    layer.dispatchEvent(new PointerEvent("pointerdown", event));
    layer.dispatchEvent(new PointerEvent("pointerup", event));
  });
  await expect(page.locator("#paper-markups .pdf-note-pin[data-draft='true']")).toHaveCount(1);
  await page.locator("#library-note-body").fill("Initial page note");
  await page.locator("#library-note-form").getByRole("button", { name: "Save note" }).click();
  await expect(page.locator("#library-highlight-count")).toHaveText("2");
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.locator("#paper-markups .pdf-note-pin").click();
  await expect(page.locator("#library-markup-selection")).toContainText("drag its pin to move");
  await page.locator("#edit-selected-library-note").click();
  await page.locator("#library-note-body").fill("Revised page note");
  await page.locator("#library-note-form").getByRole("button", { name: "Save note" }).click();
  await expect(page.locator("#toast")).toHaveText("Private note updated.");
  await expect(page.locator("#library-highlight-list")).toContainText("Revised page note");
  await expect(page.locator("#library-highlight-list")).not.toContainText("Initial page note");
  const notePin = page.locator("#paper-markups .pdf-note-pin");
  const noteBox = await notePin.boundingBox();
  if (!noteBox) throw new Error("Expected a movable PDF note pin");
  await page.mouse.move(noteBox.x + noteBox.width / 2, noteBox.y + noteBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(noteBox.x + 35, noteBox.y + 28, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator("#toast")).toHaveText("Note moved.");
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  await expect(page.locator("#paper-markups")).toHaveCSS("touch-action", "none");
  const touchPan = await page.locator("#paper-markups").evaluate((layer) => {
    const reader = layer.closest<HTMLElement>("#paper-reader");
    if (!reader) throw new Error("Expected the PDF reader");
    const overflow = document.createElement("div");
    overflow.style.height = "1000px";
    reader.append(overflow);
    const previousHeight = reader.style.height;
    reader.style.height = "100px";
    reader.scrollTop = 40;
    const startTouch = new Touch({ identifier: 1, target: layer, clientX: 100, clientY: 100 });
    const start = new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [startTouch] });
    layer.dispatchEvent(start);
    const movedTouch = new Touch({ identifier: 1, target: layer, clientX: 100, clientY: 70 });
    const move = new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [movedTouch] });
    layer.dispatchEvent(move);
    layer.dispatchEvent(new TouchEvent("touchend", { bubbles: true, changedTouches: [movedTouch], touches: [] }));
    const scrollTop = reader.scrollTop;
    overflow.remove();
    reader.style.height = previousHeight;
    return { startPrevented: start.defaultPrevented, movePrevented: move.defaultPrevented, scrollTop };
  });
  expect(touchPan).toEqual({ startPrevented: true, movePrevented: true, scrollTop: 70 });
  await page.locator("#paper-markups").evaluate((layer) => {
    const rect = layer.getBoundingClientRect();
    const event = {
      bubbles: true,
      pointerId: 72,
      pointerType: "touch",
      clientX: rect.left + rect.width * 0.3,
      clientY: rect.top + rect.height * 0.3,
    };
    layer.dispatchEvent(new PointerEvent("pointerdown", event));
    layer.dispatchEvent(new PointerEvent("pointermove", { ...event, clientX: rect.left + rect.width * 0.4 }));
    layer.dispatchEvent(new PointerEvent("pointerup", event));
  });
  await expect(page.locator("#paper-markups polyline")).toHaveCount(0);
  await expect(page.locator("#library-highlight-status")).toContainText("touch gestures pan and zoom");
  const markupBox = await page.locator("#paper-markups").boundingBox();
  if (!markupBox) throw new Error("Expected a drawable PDF page");
  await page.mouse.move(markupBox.x + markupBox.width * 0.25, markupBox.y + markupBox.height * 0.35);
  await page.mouse.down();
  const drawingTouch = await page.locator("#paper-markups").evaluate((layer) => {
    const reader = layer.closest<HTMLElement>("#paper-reader");
    if (!reader) throw new Error("Expected the PDF reader");
    const overflow = document.createElement("div");
    overflow.style.height = "1000px";
    reader.append(overflow);
    const previousHeight = reader.style.height;
    reader.style.height = "100px";
    reader.scrollTop = 40;
    const startTouch = new Touch({ identifier: 2, target: layer, clientX: 100, clientY: 100 });
    const start = new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [startTouch] });
    layer.dispatchEvent(start);
    const movedTouch = new Touch({ identifier: 2, target: layer, clientX: 100, clientY: 70 });
    const move = new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [movedTouch] });
    layer.dispatchEvent(move);
    layer.dispatchEvent(new TouchEvent("touchend", { bubbles: true, changedTouches: [movedTouch], touches: [] }));
    const scrollTop = reader.scrollTop;
    overflow.remove();
    reader.style.height = previousHeight;
    return {
      drawingActive: layer.dataset.drawingActive,
      startPrevented: start.defaultPrevented,
      movePrevented: move.defaultPrevented,
      scrollTop,
    };
  });
  expect(drawingTouch).toEqual({ drawingActive: "true", startPrevented: true, movePrevented: true, scrollTop: 40 });
  await page.locator("#paper-markups").evaluate((layer) => {
    layer.addEventListener("pointermove", (event) => layer.toggleAttribute("data-drawing-move-cancelled", event.defaultPrevented), {
      once: true,
    });
  });
  await page.mouse.move(markupBox.x + markupBox.width * 0.48, markupBox.y + markupBox.height * 0.42, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator("#paper-markups")).not.toHaveAttribute("data-drawing-active", "true");
  await expect(page.locator("#paper-markups")).toHaveAttribute("data-drawing-move-cancelled", "");
  await expect(page.locator("#paper-markups polyline")).toHaveCount(1);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.locator("#paper-markups polyline").dispatchEvent("pointerdown", { bubbles: true, pointerId: 73, pointerType: "mouse" });
  await expect(page.locator("#library-markup-selection")).toContainText("Line on page 1");
  await page.locator("#library-selected-draw-color").fill("#116655");
  await page.locator("#library-selected-draw-width").fill("7");
  await page.locator("#library-markup-selection").getByRole("button", { name: "Apply style" }).click();
  await expect(page.locator("#toast")).toHaveText("Line style updated.");
  await expect(page.locator("#paper-markups polyline")).toHaveAttribute("stroke", "#116655");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await expect(page.locator("#export-library-annotated-pdf")).toBeEnabled();
  const annotatedDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export annotated" }).click();
  await expect.poll(async () => (await annotatedDownload).suggestedFilename()).toBe("climate_adaptation-annotated.pdf");
  await expect(page.locator("#paper-highlights [data-draft='true']")).toHaveCount(0);
  expect(await readWorkspaceSnapshot(page, api)).toEqual(beforePrivateReading);
  await page.locator("#next-paper-page").click();
  await expect(page.locator("#paper-page-indicator")).toHaveText("2 / 2");
  expect(await readWorkspaceSnapshot(page, api)).toEqual(beforePrivateReading);
  await page.getByRole("tab", { name: "Library" }).click();
  const refreshedPdfCard = page.locator("#reference-library-list .library-reference-row").filter({ hasText: "climate adaptation" });
  await refreshedPdfCard.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(page.locator("#paper-page-indicator")).toHaveText("2 / 2");
  await page.getByRole("button", { name: "Annotations", exact: true }).click();
  await page
    .locator("#library-highlight-list article")
    .filter({ hasText: "Revised reading insight" })
    .getByRole("button", { name: "Open page 1" })
    .click();
  await expect(page.locator("#paper-page-indicator")).toHaveText("1 / 2");
  await expect(page.locator("#library-highlight-status")).toHaveText("Showing saved private highlight on page 1.");

  const editor = page.locator("#source-editor");
  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await page
    .locator("#library-highlight-list article")
    .filter({ hasText: "Revised reading insight" })
    .getByRole("button", { name: "Cite in manuscript" })
    .click();
  await expect(editor).toHaveValue(/:cite\[sourceundatedclimate\]\{locator="p\. 1"\}/u);
  const citedSnapshot = await readWorkspaceSnapshot(page, api);
  expect(citedSnapshot.projectReferences.some((link) => link.citationAlias === "sourceundatedclimate")).toBe(true);
  expect(citedSnapshot.researchShares).toHaveLength(0);

  const projectUse = page.locator("#library-project-use");
  await page.getByText("Project sharing", { exact: true }).click();
  await expect(projectUse).toContainText("Available to project members");
  await expect(projectUse).toContainText("Public read-only and edit links never include reference PDFs");
  await expect(projectUse.getByRole("button", { name: "Add reference to project" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Share highlight with project" })).toBeEnabled();
  await expect(projectUse.getByRole("button", { name: /Share PDF|Revoke PDF/u })).toHaveCount(0);

  const referencePdfsResponse = await page.request.get(`${api}/reference-pdfs`);
  expect(referencePdfsResponse.status()).toBe(200);
  const referencePdfs = (await referencePdfsResponse.json()) as Array<{ id: string; name: string; referenceId: string }>;
  expect(referencePdfs).toEqual([expect.objectContaining({ name: "climate_adaptation.pdf", referenceId: expect.any(String) })]);
  const referencePdfId = referencePdfs[0]!.id;
  const invited = await page.request.post(`${api}/members`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { email: "linked-pdf-reader@example.org" },
  });
  expect(invited.status()).toBe(201);
  const memberContext = await browser.newContext({
    baseURL: "http://127.0.0.1:8788",
    extraHTTPHeaders: { "x-kirjolab-local-user": "linked-pdf-reader@example.org" },
  });
  const memberPdfs = await memberContext.request.get(`${api}/reference-pdfs`);
  expect(memberPdfs.status()).toBe(200);
  expect(await memberPdfs.json()).toEqual(referencePdfs);
  const memberPdf = await memberContext.request.get(`${api}/reference-pdfs/${referencePdfId}`);
  expect([200, 206]).toContain(memberPdf.status());
  expect(memberPdf.headers()["content-type"]).toContain("application/pdf");
  expect((await memberPdf.body()).toString("ascii", 0, 4)).toBe("%PDF");
  await memberContext.close();

  const readOnlyLink = (await (await page.request.post(`${api}/share-link`, { headers: { origin: "http://127.0.0.1:8788" } })).json()) as {
    href: string;
  };
  const editLink = (await (await page.request.post(`${api}/edit-link`, { headers: { origin: "http://127.0.0.1:8788" } })).json()) as {
    href: string;
  };
  expect((await page.request.get(`${readOnlyLink.href}/reference-pdfs/${referencePdfId}`)).status()).toBe(404);
  expect((await page.request.get(`${editLink.href}/reference-pdfs/${referencePdfId}`)).status()).toBe(404);

  await page.getByRole("button", { name: "Share highlight with project" }).click();
  await expect(page.getByRole("button", { name: "Revoke highlight share" })).toBeVisible();
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).researchShares.length).toBe(1);
  await page.getByRole("button", { name: "Revoke highlight share" }).click();
  await expect(page.getByRole("button", { name: "Share highlight with project" })).toBeVisible();
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).researchShares.length).toBe(0);
  await page.getByRole("tab", { name: "Library" }).click();

  await openLibraryReferenceDetails(card);
  await expect(card.getByLabel("Reading status for Private Research Guide")).toBeVisible();
  await expect(card.getByLabel("Reading priority for Private Research Guide")).toBeVisible();
  await expect(card.getByLabel("Rating for Private Research Guide")).toBeVisible();
  await expect(card.getByLabel("Collections for Private Research Guide")).toBeVisible();
  await expect(card.getByLabel("Abstract for Private Research Guide")).toBeVisible();
  await expect(card.getByLabel("Private note for Private Research Guide")).toBeVisible();
  expect(
    await card
      .locator(".library-reference-details input, .library-reference-details textarea, .library-reference-details select")
      .evaluateAll((elements) => elements.every((element) => Boolean(element.id || element.getAttribute("name")))),
  ).toBe(true);
  const tags = card.getByLabel("Private tags for Private Research Guide");
  await tags.fill("methods, revisit");
  await card.getByRole("button", { name: "Save tags" }).click();
  await expect(page.locator("#toast")).toHaveText("Private tags saved.");
  await expect(card.getByLabel("Private tags for Private Research Guide")).toHaveValue("methods, revisit");
  await page.getByText("Filter", { exact: true }).click();
  await page.locator("#reference-filter-organization").fill("methods");
  await expect(page.locator("#reference-filter-count")).toHaveText(/1 \/ \d+/u);
  await page.locator("#reference-filter-linkage").selectOption("linked");
  await expect(card).toBeVisible();
  await page.locator("#reference-filter-query").fill("no matching reference");
  await expect(page.locator("#reference-library-list")).toContainText("No matching references.");
  await page.locator("#reference-filter-query").fill("");
  await page.locator("#reference-filter-organization").fill("");
  await openLibraryReferenceDetails(card);
  await card.getByPlaceholder("Add a private note").fill("Only share this interpretation deliberately.");
  await card.getByRole("button", { name: "Save private note" }).click();
  await expect(page.locator("#toast")).toHaveText("Private note saved. It is not visible to project collaborators.");
  await expect(card).toContainText("Only share this interpretation deliberately.");
  await openLibraryReferenceDetails(card);
  await card
    .locator(".rounded-sm")
    .filter({ hasText: "Only share this interpretation deliberately." })
    .first()
    .getByRole("button", { name: "Share snapshot with project" })
    .click();
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).researchShares.length).toBe(1);

  const uncitedExport = await page.request.get(`${api}/export/bibliography.bib`);
  expect(await uncitedExport.text()).not.toContain("writer2026");
  await openLibraryReferenceDetails(card);
  await page.locator("#context-library-scroll").evaluate((element) => {
    element.scrollTop = 160;
  });
  await page.getByRole("tab", { name: "Preview" }).click();
  await page.getByRole("tab", { name: "Library" }).click();
  await expect.poll(async () => await page.locator("#context-library-scroll").evaluate((element) => element.scrollTop)).toBe(160);
  await page.locator("#source-editor").fill("# Study\n\nThis uses the guide :cite[writer2026].\n");
  await expect.poll(async () => await (await page.request.get(`${api}/export/bibliography.bib`)).text()).toContain("writer2026");
});

test("uploads a bounded PDF batch with partial success and retry", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Batch PDF intake");
  const requestedFiles: string[] = [];
  let failBetaOnce = true;
  await page.route("**/api/library/pdfs", async (route) => {
    const encodedName = route.request().headers()["x-file-name"] ?? "";
    const name = decodeURIComponent(encodedName);
    requestedFiles.push(name);
    if (name === "batch_beta.pdf" && failBetaOnce) {
      failBetaOnce = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary upload failure" }) });
      return;
    }
    await route.continue();
  });

  await page.goto(`/editor/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  await page.getByRole("tab", { name: "Library" }).click();
  await page.locator("#library-pdf-upload").setInputFiles([
    { name: "batch_alpha.pdf", mimeType: "application/pdf", buffer: createEvidencePdf("Batch alpha evidence.") },
    { name: "batch_beta.pdf", mimeType: "application/pdf", buffer: createEvidencePdf("Batch beta evidence.") },
    { name: "batch_gamma.pdf", mimeType: "application/pdf", buffer: createEvidencePdf("Batch gamma evidence.") },
  ]);

  const status = page.locator("#library-pdf-upload-status");
  await expect(status).toContainText("3 of 3 processed");
  await expect(status.locator('[data-upload-state="added"]')).toHaveCount(2);
  await expect(status.locator('[data-upload-state="failed"]')).toContainText("Temporary upload failure");
  await expect(page.locator("#reference-library-list .library-reference-row").filter({ hasText: "batch alpha" })).toBeVisible();
  await expect(page.locator("#reference-library-list .library-reference-row").filter({ hasText: "batch gamma" })).toBeVisible();
  await expect(page.locator("#reference-library-list .library-reference-row").filter({ hasText: "batch beta" })).toHaveCount(0);

  await status.getByRole("button", { name: "Retry failed" }).click();
  await expect(status).toContainText("1 of 1 processed");
  await expect(status.locator('[data-upload-state="added"]')).toContainText("batch_beta.pdf");
  await expect(status.getByRole("button", { name: "Retry failed" })).toHaveCount(0);
  await expect(page.locator("#reference-library-list .library-reference-row").filter({ hasText: "batch beta" })).toBeVisible();
  expect(requestedFiles).toEqual(["batch_alpha.pdf", "batch_beta.pdf", "batch_gamma.pdf", "batch_beta.pdf"]);

  const oversizedBatch = Array.from({ length: 21 }, (_, index) => ({
    name: `overflow_${index}.pdf`,
    mimeType: "application/pdf",
    buffer: createEvidencePdf(`Overflow evidence ${index}.`),
  }));
  await page.locator("#library-pdf-upload").setInputFiles(oversizedBatch);
  await expect(page.locator("#toast")).toHaveText("Choose at most 20 PDFs per batch.");
  expect(requestedFiles).toHaveLength(4);
});

test("resolves an exact PDF repeat and reveals its archived Library source", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Exact PDF identity");
  const bytes = createEvidencePdf("Canonical duplicate evidence.");
  await page.goto(`/editor/${workspaceId}`);
  await page.getByRole("tab", { name: "Library" }).click();
  await page.locator("#library-pdf-upload").setInputFiles({
    name: "canonical_repeat.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });

  const libraryList = page.locator("#reference-library-list");
  const card = libraryList.locator(".library-reference-row").filter({ hasText: "canonical repeat" });
  await expect(card).toBeVisible();
  await openLibraryReferenceDetails(card);
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toMatch(/Archive “canonical repeat”\?.*hidden from the active Library.*restore/iu);
    void dialog.dismiss();
  });
  await card.getByRole("button", { name: "Archive" }).click();
  await expect(card).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await card.getByRole("button", { name: "Archive" }).click();
  await expect(card).toHaveCount(0);

  await page.locator("#library-pdf-upload").setInputFiles({
    name: "selected_again.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });
  const status = page.locator("#library-pdf-upload-status");
  await expect(status.locator('[data-upload-state="existing"]')).toContainText(/Already in library · sourceundatedcanonical/u);
  await expect(status.getByRole("button", { name: /Show sourceundatedcanonical in Library/u })).toBeVisible();
  await status.getByRole("button", { name: /Show sourceundatedcanonical in Library/u }).click();

  await expect(page.locator("#show-archived-references")).toHaveAttribute("aria-pressed", "true");
  await expect(libraryList.locator(".library-reference-row").filter({ hasText: "canonical repeat" })).toContainText("archived");
  await expect(page.locator("#reference-filter-query")).toHaveValue("sourceundatedcanonical");
});

test("reviews bounded PDF metadata before enriching a library record", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "PDF metadata review");
  await page.goto(`/editor/${workspaceId}`);
  await page.getByRole("tab", { name: "Library" }).click();
  await page.locator("#library-pdf-upload").setInputFiles({
    name: "metadata_review.pdf",
    mimeType: "application/pdf",
    buffer: createMetadataEvidencePdf(),
  });

  const draft = page.locator("#reference-library-list .library-reference-row").filter({ hasText: "metadata review" });
  await expect(draft).toContainText("sourceundatedmetadata");
  await openLibraryReferenceDetails(draft);
  await page.route("**/api/library/references/*/metadata-refinement/preview", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ referenceId: "local-review", artifactId: "local-pdf", candidates: [] }),
    });
  });
  await draft.getByRole("button", { name: "Refine metadata" }).click();
  await expect(draft.getByLabel("title for metadata review")).toHaveValue("metadata review");
  await expect(draft.locator('[data-metadata-suggestion="pdf"]')).toHaveCount(4);
  await expect(draft.getByLabel("Use PDF suggestion for title").locator("..")).toContainText("Metadata Review in Practice");
  await expect(draft.getByLabel("Use PDF suggestion for authors").locator("..")).toContainText("Doe, Jane; Roe, Alex");
  await expect(draft.getByLabel("Use PDF suggestion for year").locator("..")).toContainText("2025");
  await expect(draft.getByLabel("Use PDF suggestion for doi").locator("..")).toContainText("10.5555/metadata.review");

  await draft.getByRole("button", { name: "Apply selected metadata" }).click();
  const enriched = page.locator("#reference-library-list .library-reference-row").filter({ hasText: "Metadata Review in Practice" });
  await expect(enriched).toContainText("doe2025 · refinable key");
  const library = (await (await page.request.get("/api/library")).json()) as {
    references: Array<{ title: string; provenance: Record<string, { method: string }> }>;
  };
  expect(library.references.find((reference) => reference.title === "Metadata Review in Practice")?.provenance).toMatchObject({
    title: { method: "pdf-metadata" },
    authors: { method: "pdf-metadata" },
    year: { method: "pdf-metadata" },
    doi: { method: "pdf-metadata" },
  });
});

test("reviews a selected provider match and fields during PDF metadata refinement", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Provider metadata refinement");
  await page.goto(`/editor/${workspaceId}`);
  await page.getByRole("tab", { name: "Library" }).click();
  await page.locator("#library-pdf-upload").setInputFiles({
    name: "provider_review.pdf",
    mimeType: "application/pdf",
    buffer: createMetadataEvidencePdf(),
  });
  const card = page.locator("#reference-library-list .library-reference-row").filter({ hasText: "provider review" });
  await expect(card).toBeVisible();
  const library = (await (await page.request.get("/api/library")).json()) as {
    references: Array<{ id: string; title: string }>;
    artifacts: Array<{ id: string; referenceId: string }>;
  };
  const reference = library.references.find((item) => item.title === "provider review");
  const artifact = library.artifacts.find((item) => item.referenceId === reference?.id);
  if (!reference || !artifact) throw new Error("Expected PDF-backed library reference");
  const preview = {
    referenceId: reference.id,
    artifactId: artifact.id,
    candidates: [
      {
        provider: "openalex",
        match: "bibliographic",
        score: 94,
        metadata: {
          type: "article",
          title: "OpenAlex reviewed title",
          authors: ["Jane Doe"],
          year: "2026",
          venue: "OpenAlex venue",
          doi: "10.5555/shared-review",
          url: "https://openalex.org/work",
          abstract: "OpenAlex abstract",
        },
        metadataFingerprint: "a".repeat(64),
      },
      {
        provider: "crossref",
        match: "bibliographic",
        score: 91,
        metadata: {
          type: "article",
          title: "Crossref reviewed title",
          authors: ["Doe, Jane", "Roe, Alex"],
          year: "2026",
          venue: "Provider Journal",
          doi: "10.5555/shared-review",
          url: "https://doi.org/10.5555/shared-review",
          abstract: "Provider abstract",
        },
        metadataFingerprint: "b".repeat(64),
      },
    ],
  };
  let previewRequests = 0;
  await page.route("**/api/library/references/*/metadata-refinement/preview", async (route) => {
    previewRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "x-kirjolab-metadata-cache": previewRequests === 1 ? "miss" : "hit" },
      body: JSON.stringify(preview),
    });
  });
  let acceptedSelections: unknown;
  await page.route("**/api/library/references/*/metadata-refinement/accept", async (route) => {
    const body: unknown = route.request().postDataJSON();
    acceptedSelections = isRecord(body) ? body.selections : undefined;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reference) });
  });

  await openLibraryReferenceDetails(card);
  await card.getByRole("button", { name: "Refine metadata" }).click();
  await expect(card).toContainText("compare OpenAlex, Crossref");
  await expect(card).toContainText("OpenAlex reviewed title");
  await expect(card.getByLabel("title for provider review")).toHaveValue("provider review");
  await expect(card.locator('[data-metadata-suggestion="provider"]')).toHaveCount(8);
  await card.getByRole("button", { name: "Refine metadata" }).click();
  await expect(card).toContainText("Recent preview reused");
  expect(previewRequests).toBe(2);
  await card.getByLabel("Suggested source for authors").selectOption({ label: "Crossref" });
  await card.getByLabel("Suggested source for venue").selectOption({ label: "Crossref" });
  await card.getByRole("button", { name: "Apply from 2 sources" }).click();
  await expect(page.locator("#toast")).toHaveText("Scholarly metadata applied with field-level provenance.");
  expect(acceptedSelections).toEqual([
    {
      provider: "openalex",
      doi: "10.5555/shared-review",
      metadataFingerprint: "a".repeat(64),
      fields: ["type", "title", "year", "doi", "url", "abstract"],
    },
    {
      provider: "crossref",
      doi: "10.5555/shared-review",
      metadataFingerprint: "b".repeat(64),
      fields: ["authors", "venue"],
    },
  ]);
});

test("round-trips CSL JSON and portable library metadata", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Library interchange");
  await page.goto(`/editor/${workspaceId}`);
  await page.getByRole("tab", { name: "Library" }).click();
  await page.locator("#library-csl-upload").setInputFiles({
    name: "zotero-export.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify([
        {
          id: "zoteroGuide",
          type: "article-journal",
          title: "Zotero Guide",
          author: [{ family: "Writer", given: "Ada" }],
          issued: { "date-parts": [[2026]] },
        },
      ]),
    ),
  });
  await expect(page.locator("#reference-library-list")).toContainText("Zotero Guide");
  const csl = await page.request.get("/api/library/export/csl.json");
  expect(csl.ok()).toBe(true);
  expect(await csl.json()).toContainEqual(expect.objectContaining({ title: "Zotero Guide" }));
  const archive = await page.request.get("/api/library/export/library.zip");
  expect(archive.ok()).toBe(true);
  expect((await archive.body()).subarray(0, 2).toString()).toBe("PK");
});

test("records and reviews source citation assertions in an accessible shared network", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Citation assertion network");
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();

  await page.getByRole("tab", { name: "Library" }).click();
  await page.locator("#library-bibliography-upload").setInputFiles({
    name: "citation-network.bib",
    mimeType: "application/x-bibtex",
    buffer: Buffer.from(`@article{networkAlpha,
      title = {Network Alpha Study},
      author = {Alpha, Ada},
      year = {2024},
      doi = {10.1000/network-alpha}
    }
    @article{networkBeta,
      title = {Network Beta Study},
      author = {Beta, Bea},
      year = {2025},
      doi = {10.1000/network-beta}
    }`),
  });
  const alpha = page.locator("#reference-library-list .library-reference-row").filter({ hasText: "Network Alpha Study" });
  await expect(alpha).toBeVisible();
  const alphaId = await alpha.getAttribute("data-reference-id");
  if (!alphaId) throw new Error("Network Alpha reference id is missing");
  await alpha.getByRole("button", { name: "Add" }).click();

  await page.locator('summary[aria-label="Library tools"]').click();
  await page.locator("#open-citation-network").click();
  await expect(page.locator("#citation-network")).toBeVisible();
  await page.locator("#citation-assertion-citing").selectOption({ label: "Network Alpha Study" });
  await page.locator("#citation-assertion-cited").selectOption({ label: "Network Beta Study" });
  await page.locator("#citation-assertion-form").getByRole("button", { name: "Record assertion" }).click();

  const list = page.locator("#citation-network-list");
  await expect(list).toContainText("Network Alpha Study → Network Beta Study");
  await expect(list).toContainText("cites · confirmed · manual");
  await expect(list).toContainText("Kirjolab researcher assertion");
  await expect(page.locator("#citation-network-graph line")).toHaveCount(1);
  await expect(page.locator("#citation-network-graph circle")).toHaveCount(2);

  page.once("dialog", (dialog) => dialog.accept("Checked the source reference list"));
  await list.getByRole("button", { name: "Confirm" }).click();
  await expect(list).toContainText("confirmed by");
  await page.locator("#filter-project-citations").click();
  await expect(page.locator("#filter-project-citations")).toHaveAttribute("aria-pressed", "true");
  await expect(list).toContainText("Network Alpha Study → Network Beta Study");
  await expect(list).toContainText("Current project");

  const responseId = `sha256:${"a".repeat(64)}`;
  const candidateId = "77777777-7777-4777-8777-777777777777";
  const observedAt = "2026-07-16T10:00:00.000Z";
  await page.route(`**/api/library/references/${alphaId}/citation-expansions`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        provider: "crossref",
        direction: "references",
        seedReferenceId: alphaId,
        retrievedAt: observedAt,
        responseId,
        sourceLocator: "https://api.crossref.org/works/10.1000%2Fnetwork-alpha",
        assertions: [],
        unmatched: [
          {
            doi: "10.1000/snowball-candidate",
            title: "Snowball Candidate Study",
            authors: "Candidate, Casey",
            year: "2023",
            unstructured: "",
          },
        ],
        truncated: false,
        requestedBy: "owner@example.test",
      }),
    });
  });
  await page.route(`**/api/library/references/${alphaId}/citation-candidates`, async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        created: true,
        reference: {
          id: candidateId,
          referenceKey: "candidate2023snowball",
          type: "article",
          title: "Snowball Candidate Study",
          authors: ["Candidate, Casey"],
          year: "2023",
          venue: "Research Journal",
          doi: "10.1000/snowball-candidate",
          url: "https://doi.org/10.1000/snowball-candidate",
          abstract: "",
          provenance: {},
          archivedAt: null,
          deletedAt: null,
          createdAt: observedAt,
          updatedAt: observedAt,
        },
        assertion: {
          id: "88888888-8888-4888-8888-888888888888",
          citingReferenceId: alphaId,
          citedReferenceId: candidateId,
          polarity: "cites",
          evidenceState: "extracted",
          method: "provider",
          assertedBy: "Crossref",
          observedAt,
          sourceKind: "provider-response",
          sourceId: responseId,
          sourceLocator: "https://api.crossref.org/works/10.1000%2Fnetwork-alpha",
          confidence: null,
          review: null,
          createdAt: observedAt,
        },
      }),
    });
  });
  const alphaNetworkCard = list.locator("article").filter({ hasText: "Network Alpha Study" }).first();
  await alphaNetworkCard.getByRole("button", { name: "Expand references" }).click();
  await expect(list).toContainText("Backward snowball · Crossref");
  await expect(list).toContainText("Snowball Candidate Study");
  await expect(list.getByRole("link", { name: "Verify DOI" })).toHaveAttribute("href", "https://doi.org/10.1000/snowball-candidate");
  await list.getByRole("button", { name: "Save candidate" }).click();
  await expect(page.locator("#toast")).toContainText("Reference saved with its discovery trail.");
  await expect(list).toContainText("This seed may be saturated for backward snowballing.");
  await expect(list).not.toContainText("Snowball Candidate Study");
});

test("keeps resource-keyed research context beside authoring", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Research context boundary");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  await openResearchRail(page);
  await expect(page.locator("#project-evidence")).toBeHidden();

  await page.locator("#preview .semantic-citation[data-citation='merton1942']").evaluate((element: HTMLButtonElement) => element.click());
  await expect(page.locator("#insert-context-citation")).toBeEnabled();
  await expect(page.locator("#insert-context-citation")).toHaveAttribute(
    "title",
    "Insert this reference at the remembered manuscript caret",
  );
  await page.getByRole("tab", { name: "Preview" }).click();

  const editor = page.locator("#source-editor");
  const body = Array.from(
    { length: 36 },
    (_, index) => `Paragraph ${index + 1} keeps enough manuscript context visible while a source is inspected.`,
  ).join("\n\n");
  const source = `## Context pane {#context-pane}\n\nThe manuscript cites prior work :cite[merton1942].\n\n${body}`;
  await editor.fill(source);
  await expect(page.locator("#preview .semantic-citation[data-citation='merton1942']")).toBeVisible();

  await page.locator("#pdf-upload").setInputFiles({
    name: "context-paper.pdf",
    mimeType: "application/pdf",
    buffer: createTwoPageEvidencePdf(),
  });
  await expect(page.locator("#project-evidence")).toBeVisible();
  await expect(page.locator("#pdf-list")).toContainText("context-paper.pdf");
  await page.locator("#pdf-upload").setInputFiles({
    name: "current-paper.pdf",
    mimeType: "application/pdf",
    buffer: createEvidencePdf(),
  });
  await expect(page.locator("#pdf-list")).toContainText("current-paper.pdf");

  const imported = await readWorkspaceSnapshot(page, api);
  const delayedPdf = imported.pdfs.find((pdf) => pdf.name === "context-paper.pdf");
  if (!delayedPdf) throw new Error("Expected the delayed PDF resource");
  await page.route(`**${api}/pdfs/${delayedPdf.id}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue().catch(() => undefined);
  });
  await page.locator("#pdf-list button[data-pdf-id]").filter({ hasText: "context-paper.pdf" }).click();
  await page.locator("#pdf-list button[data-pdf-id]").filter({ hasText: "current-paper.pdf" }).click();
  await expect(page.getByRole("tab", { name: "current-paper.pdf", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#paper-text-layer")).toContainText("Knowledge grows through inspectable evidence.");
  await page.waitForTimeout(300);
  await expect(page.getByRole("tab", { name: "current-paper.pdf", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#paper-text-layer")).toContainText("Knowledge grows through inspectable evidence.");
  await page.unroute(`**${api}/pdfs/${delayedPdf.id}`);
  await page.getByRole("tab", { name: "Preview" }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page
    .locator("#pdf-list article")
    .filter({ hasText: "current-paper.pdf" })
    .getByRole("button", { name: "Remove from project" })
    .click();
  await expect(page.locator("#pdf-list")).not.toContainText("current-paper.pdf");
  expect((await readWorkspaceSnapshot(page, api)).pdfs.some((pdf) => pdf.name === "current-paper.pdf")).toBe(false);

  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  const previewScroll = page.locator("#preview-scroll");
  await previewScroll.evaluate((element) => {
    element.scrollTop = 240;
  });
  const previewPosition = await previewScroll.evaluate((element) => element.scrollTop);
  expect(previewPosition).toBeGreaterThan(0);

  await page.locator("#preview .semantic-citation[data-citation='merton1942']").evaluate((element: HTMLButtonElement) => element.click());
  await expect(page.locator("#context-publication-panel")).toBeVisible();
  await expect(page.locator("#context-publication-title")).toHaveText("The Normative Structure of Science");
  const publicationTabId = await page.getByRole("tab", { name: "The Normative Structure of Science" }).getAttribute("id");
  await expect(page.locator("#context-publication-panel")).toHaveAttribute("aria-labelledby", publicationTabId ?? "missing");
  await expect(page.locator("#context-publication-pdfs")).toContainText("No paper connected");
  await expect(page.locator("#publication-pdf-link-form")).toBeVisible();
  await expect(page.locator("#publication-pdf-link-form")).toContainText("Add a paper from this project");

  await page.getByRole("tab", { name: "Research" }).click();
  await page.locator("#publication-list").evaluate((list) => (list.previousElementSibling as HTMLElement | null)?.click());
  await page.getByRole("button", { name: "Manage in library" }).click();
  await expect(page.locator("#context-library-tab")).toHaveAttribute("aria-selected", "true");
  const managedReference = page.locator("#reference-library-list .library-reference-row").filter({
    hasText: "The Normative Structure of Science",
  });
  await expect(managedReference).toBeFocused();
  await expect(managedReference.locator(".library-reference-details")).toHaveAttribute("open", "");
  await page.getByRole("tab", { name: "The Normative Structure of Science" }).click();

  await page.locator("#publication-pdf-link").selectOption({ label: "context-paper.pdf" });
  await page.locator("#publication-pdf-link-form").getByRole("button", { name: "Add paper" }).click();
  await expect(page.locator("#context-publication-pdfs")).toContainText("context-paper.pdf");
  await expect(page.locator("#publication-pdf-link-form")).toBeHidden();
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).publicationPdfLinks.length).toBe(1);
  const graphResponse = await page.request.get(`${api}/graph`);
  const graph: unknown = await graphResponse.json();
  expect(isWorkspaceKnowledgeGraph(graph) ? graph.edges.some((edge) => edge.relation === "has-artifact") : false).toBe(true);
  await page
    .locator("#pdf-list article")
    .filter({ hasText: "context-paper.pdf" })
    .getByRole("button", { name: "Remove from project" })
    .click();
  await expect(page.locator("#toast")).toContainText("remove 0 highlight(s) and 1 reference link(s) first");

  const contextMutations: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && new URL(request.url()).pathname.startsWith(api)) contextMutations.push(request.method());
  });
  await page.locator("#context-publication-pdfs").getByRole("button", { name: "Open" }).click();
  await expect(page.locator("#context-pdf-panel")).toBeVisible();
  await expect(page.getByRole("tab", { name: "The Normative Structure of Science" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close The Normative Structure of Science" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close context-paper.pdf" })).toBeVisible();
  const contextOverview = page.locator("#context-tab-overview");
  await expect(contextOverview).toBeVisible();
  await expect(page.locator("#context-tab-overview-count")).toHaveText("5");
  await contextOverview.locator("summary").click();
  await expect(page.locator("#context-tab-overview-list")).toContainText("Preview");
  await expect(page.locator("#context-tab-overview-list")).toContainText("The Normative Structure of Science");
  await page.locator("#context-tab-overview-list [data-context-key]").filter({ hasText: "Preview" }).click();
  await expect(page.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "context-paper.pdf" }).click();
  const pdfTabId = await page.getByRole("tab", { name: "context-paper.pdf" }).getAttribute("id");
  await expect(page.locator("#context-pdf-panel")).toHaveAttribute("aria-labelledby", pdfTabId ?? "missing");
  await expect(page.locator("#annotation-pdf")).toBeDisabled();
  await expect(page.locator("#annotation-pdf")).toHaveValue(delayedPdf.id);
  await expect(page.getByRole("button", { name: "Share project" })).toBeVisible();
  await expect(page.locator("#paper-status")).toHaveText("Select text to capture evidence");
  await expect
    .poll(async () => page.locator("#paper-reader").evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(1);
  await page.locator("#next-paper-page").click();
  await expect(page.locator("#paper-page-indicator")).toHaveText("2 / 2");
  await page.locator("#paper-reader").evaluate((element) => {
    element.scrollTop = 120;
  });

  await page.getByRole("tab", { name: "Preview" }).click();
  expect(await previewScroll.evaluate((element) => element.scrollTop)).toBe(previewPosition);
  const refreshAnnotation = await page.request.post(`${api}/annotations`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: {
      pdfId: delayedPdf.id,
      page: 2,
      quote: "Second page verifies restored PDF context.",
      prefix: "",
      suffix: "",
      comment: "Refresh must preserve reading positions",
      rects: [],
    },
  });
  expect(refreshAnnotation.status()).toBe(201);
  await expect(page.locator("#annotation-list")).toContainText("Refresh must preserve reading positions");
  await expect(page.locator(`[data-pdf-resource-id="${delayedPdf.id}"] [data-pdf-annotations]`)).toContainText(
    "Refresh must preserve reading positions",
  );
  expect(await previewScroll.evaluate((element) => element.scrollTop)).toBe(previewPosition);
  contextMutations.length = 0;
  await page.getByRole("tab", { name: "context-paper.pdf" }).click();
  await expect(page.locator("#paper-page-indicator")).toHaveText("2 / 2");
  const pdfPosition = await page.locator("#paper-reader").evaluate((element) => element.scrollTop);
  expect(pdfPosition).toBeGreaterThan(0);
  const activePdfRefresh = await page.request.post(`${api}/annotations`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: {
      pdfId: delayedPdf.id,
      page: 2,
      quote: "Second page verifies restored PDF context.",
      prefix: "",
      suffix: "",
      comment: "Active PDF refresh keeps its position",
      rects: [],
    },
  });
  expect(activePdfRefresh.status()).toBe(201);
  await expect(page.locator("#annotation-list")).toContainText("Active PDF refresh keeps its position");
  await expect(page.locator("#paper-page-indicator")).toHaveText("2 / 2");
  expect(await page.locator("#paper-reader").evaluate((element) => element.scrollTop)).toBe(pdfPosition);
  contextMutations.length = 0;

  await page.locator("#cite-active-pdf").click();
  await expect(editor).toHaveValue(`${source} :cite[merton1942]{locator="p. 2"}`);
  await expect(page.locator("#preview .semantic-citation[data-citation='merton1942'][data-locator='p. 2']")).toHaveCount(1);
  await page.getByRole("tab", { name: "context-paper.pdf" }).click();
  await page.locator("#previous-paper-page").click();
  await expect(page.locator("#paper-page-indicator")).toHaveText("1 / 2");
  await page.getByRole("tab", { name: "Preview" }).click();
  await page
    .locator("#preview .semantic-citation[data-citation='merton1942'][data-locator='p. 2']")
    .evaluate((element: HTMLButtonElement) => element.click());
  await expect(page.locator("#context-pdf-panel")).toBeVisible();
  await expect(page.locator("#paper-page-indicator")).toHaveText("2 / 2");

  await page.getByRole("tab", { name: "The Normative Structure of Science" }).click();
  await page.getByRole("tab", { name: "Preview" }).focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "context-paper.pdf" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "The Normative Structure of Science" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page.locator("#context-pdf-panel")).toBeVisible();
  expect(contextMutations).toEqual([]);
  await page.getByRole("tab", { name: "The Normative Structure of Science" }).click();
  await page.locator("#insert-context-citation").click();
  await expect.poll(async () => ((await editor.inputValue()).match(/:cite\[merton1942\]/gu) ?? []).length).toBe(3);
  await page.getByRole("tab", { name: "The Normative Structure of Science" }).click();
  await expect(page.getByRole("tab", { name: "The Normative Structure of Science" })).toHaveAttribute("aria-selected", "true");
  await contextOverview.locator("summary").click();
  await page.getByRole("button", { name: "Close The Normative Structure of Science from context list" }).click();
  await expect(page.getByRole("tab", { name: "The Normative Structure of Science" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Writing assistant" })).toHaveAttribute("aria-selected", "true");

  await page.setViewportSize({ width: 800, height: 900 });
  await page.locator("#show-context-surface").click();
  await expect(page.locator("#context-surface")).toBeVisible();
  await expect(page.locator("#authoring-surface")).toBeHidden();
  await page.locator("#show-authoring-surface").click();
  await expect(page.locator("#authoring-surface")).toBeVisible();
  await expect(editor).toHaveValue(`${source} :cite[merton1942]{locator="p. 2"} :cite[merton1942]`);
});

test("reviews DOI metadata before adding and connecting an imported paper", async ({ page }) => {
  const origin = "http://127.0.0.1:8788";
  const workspaceId = await createWorkspace(page, "Reviewed DOI intake");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  await openResearchRail(page);

  await page.locator("#pdf-upload").setInputFiles({
    name: "identified-paper.pdf",
    mimeType: "application/pdf",
    buffer: createEvidencePdf(),
  });
  await page.locator("#pdf-list button[data-pdf-id]").filter({ hasText: "identified-paper.pdf" }).click();
  await expect(page.locator("#publication-intake")).toBeVisible();
  await page.locator("#publication-intake summary").click();
  const baseline = await readWorkspaceSnapshot(page, api);
  const pdf = baseline.pdfs.find((item) => item.name === "identified-paper.pdf");
  if (!pdf) throw new Error("Expected imported DOI-intake PDF");

  const preview = {
    pdfId: pdf.id,
    doi: "10.5555/reviewed-intake",
    metadata: {
      type: "article",
      title: "Reviewed metadata becomes working memory",
      authors: ["Lovelace, Ada"],
      year: "2026",
      venue: "Journal of Inspectable Intake",
      doi: "10.5555/reviewed-intake",
      url: "https://doi.org/10.5555/reviewed-intake",
      abstract: "A deterministic Crossref fixture.",
    },
    metadataFingerprint: "a".repeat(64),
    citationKey: "lovelace2026",
    existingPublicationId: null,
  };
  await page.route(`**${api}/publication-intake/preview`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(preview) });
  });

  await page.locator("#publication-intake-doi").fill("https://doi.org/10.5555/reviewed-intake");
  await page.locator("#publication-intake-form").getByRole("button", { name: "Look up DOI" }).click();
  await expect(page.locator("#publication-intake-review")).toBeVisible();
  await expect(page.locator("#publication-intake-title")).toHaveText("Reviewed metadata becomes working memory");
  await expect(page.locator("#publication-intake-key")).toHaveValue("lovelace2026");
  await page.locator("#publication-intake-cancel").click();
  await expect(page.locator("#publication-intake-review")).toBeHidden();
  expect(await readWorkspaceSnapshot(page, api)).toEqual(baseline);

  await page.locator("#publication-intake-form").getByRole("button", { name: "Look up DOI" }).click();
  await expect(page.locator("#publication-intake-review")).toBeVisible();
  await page.route(`**${api}/publication-intake/accept`, async (route) => {
    const body: unknown = route.request().postDataJSON();
    if (!isRecord(body) || body.pdfId !== pdf.id) throw new Error("Expected the active PDF intake request");
    const importedResponse = await page.request.post(`${api}/bibliography/import`, {
      headers: { origin },
      data: {
        bibtex: `@article{lovelace2026,
          title = {Reviewed metadata becomes working memory},
          author = {Lovelace, Ada},
          year = {2026},
          journal = {Journal of Inspectable Intake},
          doi = {10.5555/reviewed-intake}
        }`,
      },
    });
    const imported: unknown = await importedResponse.json();
    if (!isWorkspaceSnapshot(imported)) throw new Error("Expected imported publication snapshot");
    const publication = imported.publications.find((item) => item.doi === preview.doi);
    if (!publication) throw new Error("Expected DOI-matched publication");
    const linkResponse = await page.request.post(`${api}/publication-pdf-links`, {
      headers: { origin },
      data: { publicationId: publication.id, pdfId: pdf.id },
    });
    const link: unknown = await linkResponse.json();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ publication, link, publicationCreated: true, linkCreated: true }),
    });
  });

  await page.locator("#publication-intake-accept").click();
  await expect(page.locator("#context-publication-title")).toHaveText("Reviewed metadata becomes working memory");
  await expect(page.getByRole("tab", { name: "Reviewed metadata becomes working memory" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#toast")).toContainText("manuscript is unchanged");
  const accepted = await readWorkspaceSnapshot(page, api);
  expect(accepted.source).toBe(baseline.source);
  expect(accepted.source).not.toContain(":cite[lovelace2026]");
  expect(accepted.bibliography).toContain("@article{lovelace2026,");
  const publication = accepted.publications.find((item) => item.doi === preview.doi);
  expect(publication).toBeDefined();
  expect(accepted.publicationPdfLinks).toContainEqual(expect.objectContaining({ publicationId: publication?.id, pdfId: pdf.id }));
});

test("auto-saves, extends, undoes, erases, and deletes PDF highlights", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Editable highlight lifecycle");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  await openResearchRail(page);
  await page.locator("#pdf-upload").setInputFiles({
    name: "editable-highlights.pdf",
    mimeType: "application/pdf",
    buffer: createEvidencePdf(),
  });
  await page.locator("#pdf-list button[data-pdf-id]").filter({ hasText: "editable-highlights.pdf" }).click();
  await expect(page.locator("#paper-status")).toHaveText("Select text to capture evidence");
  let delayFirstSave = true;
  await page.route(`**${api}/annotations`, async (route) => {
    if (delayFirstSave && route.request().method() === "POST") {
      delayFirstSave = false;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await route.continue();
  });

  const paintSelection = async (): Promise<void> => {
    await page.locator("#paper-text-layer").evaluate((layer) => {
      const span = layer.querySelector("span");
      if (!span?.firstChild) throw new Error("Expected rendered PDF text");
      const range = document.createRange();
      range.selectNodeContents(span);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      layer.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
  };

  await paintSelection();
  await expect(page.locator("#paper-highlights .pdf-highlight[data-draft='true']")).toBeVisible();
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).annotations[0]?.fragments.length).toBe(1);
  await paintSelection();
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).annotations[0]?.fragments.length).toBe(2);
  expect((await readWorkspaceSnapshot(page, api)).annotations).toHaveLength(1);

  await page.getByRole("button", { name: "Undo last stroke" }).click();
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).annotations[0]?.fragments.length).toBe(1);
  await paintSelection();
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).annotations[0]?.fragments.length).toBe(2);

  await page.getByRole("button", { name: "Eraser" }).click();
  await page.locator("#paper-highlights .pdf-highlight[data-fragment-id]").last().click();
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).annotations[0]?.fragments.length).toBe(1);

  await openResearchCollection(page, "Project evidence");
  let annotationCard = page.locator("#annotation-list .resource-card").first();
  await annotationCard.getByText("Adjust 1 stroke").click();
  await annotationCard.getByLabel("Text for highlight stroke 1").fill("Corrected touch selection idea");
  await annotationCard.getByRole("button", { name: "Save text" }).click();
  await expect
    .poll(async () => (await readWorkspaceSnapshot(page, api)).annotations[0]?.fragments[0]?.quote)
    .toBe("Corrected touch selection idea");
  const beforeX = (await readWorkspaceSnapshot(page, api)).annotations[0]!.fragments[0]!.rects[0]!.x;
  annotationCard = page.locator("#annotation-list .resource-card").first();
  await annotationCard.getByText("Adjust 1 stroke").click();
  await annotationCard.getByRole("button", { name: "→ highlight stroke 1" }).click();
  await expect
    .poll(async () => (await readWorkspaceSnapshot(page, api)).annotations[0]?.fragments[0]?.rects[0]?.x)
    .toBeGreaterThan(beforeX);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.locator("#annotation-list").getByRole("button", { name: "Delete highlight" }).click();
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).annotations.length).toBe(0);
});

test("converges source edits across two writers", async ({ page, context }) => {
  const collaborator = await context.newPage();
  await Promise.all([page.goto("/editor/demo"), collaborator.goto("/editor/demo")]);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();
  await expect(collaborator.getByText(/Live · 2 writers/)).toBeVisible();

  const sharedSource = "## Shared evidence {#shared-evidence}\n\nThe first writer contributes a claim.\n";
  await page.locator("#source-editor").fill(sharedSource);
  await expect(collaborator.locator("#source-editor")).toHaveValue(sharedSource);
  await expect(collaborator.locator("#source-editor-highlight")).toHaveText(sharedSource);

  const expandedSource = `${sharedSource}\nThe second writer connects the evidence.\n`;
  await collaborator.locator("#source-editor").fill(expandedSource);
  await expect(page.locator("#source-editor")).toHaveValue(expandedSource);
  await expect(page.locator("#source-editor-highlight")).toHaveText(expandedSource);

  const selectedText = "second writer";
  await page.locator("#source-editor").evaluate((element: HTMLTextAreaElement, text: string) => {
    const start = element.value.indexOf(text);
    element.focus();
    element.setSelectionRange(start, start + text.length);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  }, selectedText);
  const remoteSelection = collaborator.locator("#source-editor-highlight .collaborator-selection");
  await expect(remoteSelection).toHaveText(selectedText);
  await expect(remoteSelection).toHaveAttribute("data-collaborator-color", /^[0-3]$/u);
  await expect(collaborator.locator("#source-editor-highlight")).toHaveText(expandedSource);

  await page.locator("#source-editor").evaluate((element: HTMLTextAreaElement, text: string) => {
    const caret = element.value.indexOf(text);
    element.setSelectionRange(caret, caret);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  }, selectedText);
  const remoteCaret = collaborator.locator("#source-editor-highlight .collaborator-caret");
  await expect(remoteCaret).toHaveAttribute("data-collaborator-color", /^[0-3]$/u);
  await expectCollaboratorCaretAligned(remoteCaret);

  await page.locator("#source-editor").evaluate((element: HTMLTextAreaElement, text: string) => {
    const start = element.value.indexOf(text);
    element.setSelectionRange(start, start + text.length);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  }, selectedText);
  await expect(remoteSelection).toHaveText(selectedText);

  const sourceBeforeComment = await page.locator("#source-editor").inputValue();
  await page.getByRole("tab", { name: /Comments/ }).click();
  await expect(page.locator("#comments-rail-panel")).toBeVisible();
  await page.locator("#manuscript-comment-body").fill("Keep this collaboration claim concrete.");
  await page.locator("#manuscript-comment-form").getByRole("button", { name: "Add comment" }).click();
  await expect(collaborator.locator("#manuscript-comment-list")).toContainText("Keep this collaboration claim concrete.");
  await collaborator.getByRole("tab", { name: /Comments/ }).click();

  await collaborator.locator("#source-editor").evaluate((element: HTMLTextAreaElement, text: string) => {
    const start = element.value.indexOf(text);
    element.focus();
    element.setRangeText("", start, start + text.length, "start");
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentForward" }));
  }, selectedText);
  const sourceAfterDeletion = sourceBeforeComment.replace(selectedText, "");
  await expect(page.locator("#source-editor")).toHaveValue(sourceAfterDeletion);
  await expect(page.locator("#manuscript-comment-list").getByRole("button", { name: "Re-anchor to selection" })).toBeVisible();

  const revisedText = "first writer";
  await page.locator("#source-editor").evaluate((element: HTMLTextAreaElement, text: string) => {
    const start = element.value.indexOf(text);
    element.focus();
    element.setSelectionRange(start, start + text.length);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  }, revisedText);
  await page.locator("#manuscript-comment-list").getByRole("button", { name: "Re-anchor to selection" }).click();
  await expect(page.locator("#manuscript-comment-list blockquote")).toHaveText(revisedText);
  await expect(page.locator("#manuscript-comment-list").getByRole("button", { name: "Open linked passage" })).toBeVisible();

  await collaborator.locator("#manuscript-comment-list").getByRole("button", { name: "Resolve" }).click();
  await expect(page.locator("#manuscript-comment-list")).toContainText("resolved");
  await expect(page.locator("#source-editor")).toHaveValue(sourceAfterDeletion);
  await collaborator.close();
});

test("does not revise a manuscript when collaborators only reconnect", async ({ page, context }) => {
  const workspaceId = await createWorkspace(page, "Connection boundary");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  const baseline = await readWorkspaceSnapshot(page, api);

  const collaborator = await context.newPage();
  await collaborator.goto(`/editor/${workspaceId}`);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();
  await expect(collaborator.getByText(/Live · 2 writers/)).toBeVisible();

  await collaborator.reload();
  await expect(collaborator.getByText(/Live · 2 writers/)).toBeVisible();
  await collaborator.close();

  // A short quiet period makes the negative assertion cover all queued socket frames.
  await page.waitForTimeout(200);
  const afterReconnect = await readWorkspaceSnapshot(page, api);
  expect(afterReconnect.revision).toBe(baseline.revision);
  expect(afterReconnect.source).toBe(baseline.source);
  expect(afterReconnect.bibliography).toBe(baseline.bibliography);
});

test("keeps a focused caret attached to manuscript text during a remote insertion", async ({ page, context }) => {
  const workspaceId = await createWorkspace(page, "Caret boundary");
  const path = `/editor/${workspaceId}`;
  await page.goto(path);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();

  const collaborator = await context.newPage();
  await collaborator.goto(path);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();
  await expect(collaborator.getByText(/Live · 2 writers/)).toBeVisible();

  const source = "Alpha keeps its logical caret.\n";
  const editor = page.locator("#source-editor");
  await editor.fill(source);
  await expect(collaborator.locator("#source-editor")).toHaveValue(source);
  await editor.evaluate((element: HTMLTextAreaElement) => {
    const caret = element.value.indexOf(" keeps");
    element.focus();
    element.setSelectionRange(caret, caret);
  });
  await expect(editor).toBeFocused();

  const prefix = "A collaborator notes: ";
  await collaborator.locator("#source-editor").fill(`${prefix}${source}`);
  await expect(editor).toHaveValue(`${prefix}${source}`);
  await expect
    .poll(async () => await editor.evaluate((element: HTMLTextAreaElement) => element.selectionStart))
    .toBe(prefix.length + "Alpha".length);

  await page.keyboard.type("!");
  await expect(editor).toHaveValue(`${prefix}Alpha! keeps its logical caret.\n`);
  await expect(collaborator.locator("#source-editor")).toHaveValue(`${prefix}Alpha! keeps its logical caret.\n`);
  await collaborator.close();
});

test("invalidates shared resources without replacing the collaborative manuscript", async ({ page, context }) => {
  const workspaceId = await createWorkspace(page, "Resource invalidation boundary");
  const api = `/api/workspaces/${workspaceId}`;
  const path = `/editor/${workspaceId}`;
  await page.goto(path);
  const collaborator = await context.newPage();
  await collaborator.goto(path);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();
  await expect(collaborator.getByText(/Live · 2 writers/)).toBeVisible();

  const sharedSource = "## Shared resource boundary {#shared-resource}\n\nThe manuscript remains under Yjs ownership.\n";
  await page.locator("#source-editor").fill(sharedSource);
  await expect(collaborator.locator("#source-editor")).toHaveValue(sharedSource);
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).source).toBe(sharedSource);

  const pdfResponse = await page.request.post(`${api}/pdfs`, {
    headers: {
      origin: "http://127.0.0.1:8788",
      "content-type": "application/pdf",
      "x-file-name": "socket-invalidated-evidence.pdf",
    },
    data: createEvidencePdf(),
  });
  expect(pdfResponse.status()).toBe(201);

  await expect(page.locator("#pdf-list")).toContainText("socket-invalidated-evidence.pdf");
  await expect(collaborator.locator("#pdf-list")).toContainText("socket-invalidated-evidence.pdf");
  await expect(page.locator("#source-editor")).toHaveValue(sharedSource);
  await expect(collaborator.locator("#source-editor")).toHaveValue(sharedSource);
  expect((await readWorkspaceSnapshot(page, api)).source).toBe(sharedSource);
  await collaborator.close();
});

test("keeps annotation and claim passage anchors attached across remote insertions", async ({ page, context }) => {
  const origin = "http://127.0.0.1:8788";
  const workspaceId = await createWorkspace(page, "Durable passage anchors");
  const api = `/api/workspaces/${workspaceId}`;
  const pdfResponse = await page.request.post(`${api}/pdfs`, {
    headers: { origin, "content-type": "application/pdf", "x-file-name": "anchor-evidence.pdf" },
    data: createEvidencePdf(),
  });
  const pdf: unknown = await pdfResponse.json();
  if (!isRecord(pdf) || typeof pdf.id !== "string") throw new Error("Expected an imported PDF");
  const annotationResponse = await page.request.post(`${api}/annotations`, {
    headers: { origin },
    data: {
      pdfId: pdf.id,
      page: 1,
      quote: "Knowledge grows through inspectable evidence.",
      prefix: "",
      suffix: "",
      comment: "Durable annotation anchor",
      rects: [],
    },
  });
  const annotation: unknown = await annotationResponse.json();
  if (!isRecord(annotation) || typeof annotation.id !== "string") throw new Error("Expected an annotation");
  const claimResponse = await page.request.post(`${api}/claims`, {
    headers: { origin },
    data: {
      text: "Durable anchors keep claims connected to prose.",
      note: "Durable claim anchor",
      evidence: [{ annotationId: annotation.id, relation: "supports" }],
    },
  });
  const claim: unknown = await claimResponse.json();
  if (!isRecord(claim) || typeof claim.id !== "string") throw new Error("Expected a claim");

  const path = `/editor/${workspaceId}`;
  await page.goto(path);
  const collaborator = await context.newPage();
  await collaborator.goto(path);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();
  await expect(collaborator.getByText(/Live · 2 writers/)).toBeVisible();

  const annotationExcerpt = "The annotation passage stays addressable.";
  const claimExcerpt = "The claim passage stays addressable.";
  const source = [
    "## Durable anchors {#durable-anchors}",
    "",
    "Context before annotation.",
    annotationExcerpt,
    "Context between passages.",
    claimExcerpt,
    "",
  ].join("\n");
  const editor = page.locator("#source-editor");
  await editor.fill(source);
  await expect(collaborator.locator("#source-editor")).toHaveValue(source);
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).source).toBe(source);
  const anchoredSnapshot = await readWorkspaceSnapshot(page, api);
  const annotationStart = source.indexOf(annotationExcerpt);
  const claimStart = source.indexOf(claimExcerpt);

  const annotationLinkResponse = await page.request.post(`${api}/links`, {
    headers: { origin },
    data: {
      annotationId: annotation.id,
      fileId: anchoredSnapshot.entryFileId,
      sourceRevision: anchoredSnapshot.revision,
      start: annotationStart,
      end: annotationStart + annotationExcerpt.length,
      excerpt: annotationExcerpt,
    },
  });
  expect(annotationLinkResponse.status()).toBe(201);
  const claimLinkResponse = await page.request.post(`${api}/claim-links`, {
    headers: { origin },
    data: {
      claimId: claim.id,
      fileId: anchoredSnapshot.entryFileId,
      sourceRevision: anchoredSnapshot.revision,
      start: claimStart,
      end: claimStart + claimExcerpt.length,
      excerpt: claimExcerpt,
    },
  });
  expect(claimLinkResponse.status()).toBe(201);

  const linkedSnapshot = await readWorkspaceSnapshot(page, api);
  const annotationLink: unknown = linkedSnapshot.links.find((link) => link.annotationId === annotation.id);
  const claimLink: unknown = linkedSnapshot.claimLinks.find((link) => link.claimId === claim.id);
  expectPassageAnchor(annotationLink, {
    exact: annotationExcerpt,
    originalRange: { start: annotationStart, end: annotationStart + annotationExcerpt.length },
    anchoredRevision: anchoredSnapshot.revision,
  });
  expectPassageAnchor(claimLink, {
    exact: claimExcerpt,
    originalRange: { start: claimStart, end: claimStart + claimExcerpt.length },
    anchoredRevision: anchoredSnapshot.revision,
  });
  expectResolvedPassage(annotationLink, annotationStart, annotationExcerpt);
  expectResolvedPassage(claimLink, claimStart, claimExcerpt);

  await openResearchCollection(page, "Project evidence");
  await openResearchCollection(page, "Claims");
  const annotationCard = page.locator("#annotation-list article").filter({ hasText: "Durable annotation anchor" });
  const claimCard = page.locator("#claim-list article").filter({ hasText: "Durable anchors keep claims connected" });
  await expect(annotationCard.getByRole("button", { name: "Open linked passage" })).toBeVisible();
  await expect(claimCard.getByRole("button", { name: "Open linked passage" })).toBeVisible();

  const annotationInsertion = "New context before the annotation.\n";
  const collaboratorEditor = collaborator.locator("#source-editor");
  await collaboratorEditor.evaluate(
    (element: HTMLTextAreaElement, input: { at: number; insertion: string }) => {
      element.focus();
      element.setRangeText(input.insertion, input.at, input.at, "end");
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: input.insertion }));
    },
    { at: annotationStart, insertion: annotationInsertion },
  );
  const afterAnnotationInsertion = `${source.slice(0, annotationStart)}${annotationInsertion}${source.slice(annotationStart)}`;
  await expect(editor).toHaveValue(afterAnnotationInsertion);

  const claimInsertion = "New context before the claim.\n";
  const shiftedClaimStart = afterAnnotationInsertion.indexOf(claimExcerpt);
  await collaboratorEditor.evaluate(
    (element: HTMLTextAreaElement, input: { at: number; insertion: string }) => {
      element.focus();
      element.setRangeText(input.insertion, input.at, input.at, "end");
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: input.insertion }));
    },
    { at: shiftedClaimStart, insertion: claimInsertion },
  );
  const shiftedSource = `${afterAnnotationInsertion.slice(0, shiftedClaimStart)}${claimInsertion}${afterAnnotationInsertion.slice(shiftedClaimStart)}`;
  await expect(editor).toHaveValue(shiftedSource);
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).source).toBe(shiftedSource);

  const shiftedSnapshot = await readWorkspaceSnapshot(page, api);
  const shiftedAnnotationLink: unknown = shiftedSnapshot.links.find((link) => link.annotationId === annotation.id);
  const shiftedClaimLink: unknown = shiftedSnapshot.claimLinks.find((link) => link.claimId === claim.id);
  const resolvedAnnotationStart = annotationStart + annotationInsertion.length;
  const resolvedClaimStart = claimStart + annotationInsertion.length + claimInsertion.length;
  expectResolvedPassage(shiftedAnnotationLink, resolvedAnnotationStart, annotationExcerpt);
  expectResolvedPassage(shiftedClaimLink, resolvedClaimStart, claimExcerpt);

  await annotationCard.getByRole("button", { name: "Open linked passage" }).click();
  await expect(editor).toBeFocused();
  await expectEditorSelection(editor, resolvedAnnotationStart, annotationExcerpt);
  await claimCard.getByRole("button", { name: "Open linked passage" }).click();
  await expect(editor).toBeFocused();
  await expectEditorSelection(editor, resolvedClaimStart, claimExcerpt);

  const candidatePrefix = "A reviewed candidate adds context.\n";
  const candidateTarget = "## Durable anchors {#durable-anchors}";
  if (typeof annotation.updatedAt !== "string") throw new Error("Expected an annotation version");
  const candidateResponse = await page.request.post(`${api}/candidates`, {
    headers: { origin },
    data: {
      providerAdapter: "openai-compatible",
      providerLabel: "Browser-local test provider",
      model: "anchor-preserving-model",
      promptVersion: "revise-selection-v1",
      instruction: "Add one context line before this heading.",
      target: {
        fileId: shiftedSnapshot.entryFileId,
        start: 0,
        end: candidateTarget.length,
        excerpt: candidateTarget,
        sourceRevision: shiftedSnapshot.revision,
      },
      evidence: [{ kind: "annotation", id: annotation.id, version: annotation.updatedAt }],
      proposedReplacement: `${candidatePrefix}${candidateTarget}`,
    },
  });
  expect(candidateResponse.status()).toBe(201);
  const candidate: unknown = await candidateResponse.json();
  if (!isRecord(candidate) || typeof candidate.id !== "string") throw new Error("Expected an anchor-preserving candidate");
  const applyResponse = await page.request.post(`${api}/candidates/${candidate.id}/apply`, { headers: { origin } });
  expect(applyResponse.ok()).toBe(true);
  await expect(editor).toHaveValue(`${candidatePrefix}${shiftedSource}`);
  const candidateSnapshot = await readWorkspaceSnapshot(page, api);
  expectResolvedPassage(
    candidateSnapshot.links.find((link) => link.annotationId === annotation.id),
    resolvedAnnotationStart + candidatePrefix.length,
    annotationExcerpt,
  );
  expectResolvedPassage(
    candidateSnapshot.claimLinks.find((link) => link.claimId === claim.id),
    resolvedClaimStart + candidatePrefix.length,
    claimExcerpt,
  );

  const candidateAnnotationStart = resolvedAnnotationStart + candidatePrefix.length;
  const changedAnnotationExcerpt = annotationExcerpt.replace("stays", "moves");
  const changedWordStart = candidateAnnotationStart + annotationExcerpt.indexOf("stays");
  await expect(collaboratorEditor).toHaveValue(`${candidatePrefix}${shiftedSource}`);
  await collaboratorEditor.evaluate(
    (element: HTMLTextAreaElement, range: { start: number; end: number }) => {
      element.focus();
      element.setRangeText("moves", range.start, range.end, "end");
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "moves" }));
    },
    { start: changedWordStart, end: changedWordStart + "stays".length },
  );
  await expect(editor).toHaveValue(
    `${candidatePrefix}${shiftedSource.slice(0, resolvedAnnotationStart)}${changedAnnotationExcerpt}${shiftedSource.slice(
      resolvedAnnotationStart + annotationExcerpt.length,
    )}`,
  );
  const changedAction = annotationCard.getByRole("button", { name: "Open changed passage" });
  await expect(changedAction).toBeEnabled();
  await expect(changedAction).toHaveAttribute("data-anchor-match", "changed");
  const changedSnapshot = await readWorkspaceSnapshot(page, api);
  expect(readPassageResolution(changedSnapshot.links.find((link) => link.annotationId === annotation.id))).toMatchObject({
    status: "resolved",
    start: candidateAnnotationStart,
    end: candidateAnnotationStart + changedAnnotationExcerpt.length,
    text: changedAnnotationExcerpt,
    exactMatch: false,
  });
  await changedAction.click();
  await expectEditorSelection(editor, candidateAnnotationStart, changedAnnotationExcerpt);
  await collaborator.close();
});

test("reports a deleted passage anchor as stale instead of guessing", async ({ page, context }) => {
  const origin = "http://127.0.0.1:8788";
  const workspaceId = await createWorkspace(page, "Passage anchor failure modes");
  const api = `/api/workspaces/${workspaceId}`;
  const pdfResponse = await page.request.post(`${api}/pdfs`, {
    headers: { origin, "content-type": "application/pdf", "x-file-name": "stale-anchor.pdf" },
    data: createEvidencePdf(),
  });
  const pdf: unknown = await pdfResponse.json();
  if (!isRecord(pdf) || typeof pdf.id !== "string") throw new Error("Expected an imported PDF");
  const annotationResponse = await page.request.post(`${api}/annotations`, {
    headers: { origin },
    data: {
      pdfId: pdf.id,
      page: 1,
      quote: "Knowledge grows through inspectable evidence.",
      prefix: "",
      suffix: "",
      comment: "Failure-mode anchor",
      rects: [],
    },
  });
  const annotation: unknown = await annotationResponse.json();
  if (!isRecord(annotation) || typeof annotation.id !== "string") throw new Error("Expected an annotation");

  const path = `/editor/${workspaceId}`;
  await page.goto(path);
  const collaborator = await context.newPage();
  await collaborator.goto(path);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();
  const excerpt = "This passage has a durable identity.";
  const source = `## Resolution boundary\n\nBefore.\n${excerpt}\nAfter.\n`;
  await page.locator("#source-editor").fill(source);
  await expect(collaborator.locator("#source-editor")).toHaveValue(source);
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).source).toBe(source);
  const sourceSnapshot = await readWorkspaceSnapshot(page, api);
  const start = source.indexOf(excerpt);
  const linkResponse = await page.request.post(`${api}/links`, {
    headers: { origin },
    data: {
      annotationId: annotation.id,
      fileId: sourceSnapshot.entryFileId,
      sourceRevision: sourceSnapshot.revision,
      start,
      end: start + excerpt.length,
      excerpt,
    },
  });
  expect(linkResponse.status()).toBe(201);

  const staleSource = `${source.slice(0, start)}${source.slice(start + excerpt.length)}`;
  await collaborator.locator("#source-editor").evaluate(
    (element: HTMLTextAreaElement, range: { start: number; end: number }) => {
      element.focus();
      element.setRangeText("", range.start, range.end, "start");
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentForward" }));
    },
    { start, end: start + excerpt.length },
  );
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).source).toBe(staleSource);
  const staleSnapshot = await readWorkspaceSnapshot(page, api);
  const staleLink: unknown = staleSnapshot.links.find((link) => link.annotationId === annotation.id);
  expect(readPassageResolution(staleLink)).toMatchObject({ status: "stale" });
  const staleAction = page.locator('#annotation-list [data-anchor-status="stale"]');
  await expect(staleAction).toHaveText("Linked passage is stale");
  await expect(staleAction).toBeDisabled();
  await collaborator.close();
});

test("creates and inserts transcluded project files", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Transclusion authoring");
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.locator("#save-status")).toHaveText("Saved");
  const source = page.locator("#source-editor");
  const entrySource = "## Introduction\n\nBefore\nAfter\n";
  await source.fill(entrySource);
  await source.evaluate((element: HTMLTextAreaElement, selection: number) => {
    element.focus();
    element.setSelectionRange(selection, selection);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  }, entrySource.indexOf("After"));

  const fileMenu = page.locator(".action-menu", { has: page.locator("#create-and-include-project-file") });
  await fileMenu.locator("summary").click();
  await page.locator("#create-and-include-project-file").click();
  await page.locator("#project-file-path").fill("chapters/method.md");
  await page.locator("#project-file-form").getByRole("button", { name: "Save file" }).click();
  await expect(source).toHaveValue("## Introduction\n\nBefore\n\n::include[chapters/method.md]\nAfter\n");
  await expect(page.locator(".project-folder-row", { hasText: "chapters/" })).toBeVisible();
  await expect(page.locator(".project-file-row", { hasText: "method.md" })).toBeVisible();

  await source.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await page.locator("#editor-insert-menu summary").click();
  await page
    .locator("#include-project-file-list")
    .getByRole("button", { name: /chapters\/method\.md/u })
    .click();
  await expect(source).toHaveValue(/::include\[chapters\/method\.md\]\n$/u);
  await page.locator(".project-file-row", { hasText: "method.md" }).click();
  await source.fill("## Method\n\nDescribe the procedure.\n");
  await expect(page.locator("#source-editor-highlight")).toHaveText("## Method\n\nDescribe the procedure.\n");
  await expect(page.locator("#source-editor-highlight .markdown-token-heading")).toContainText("Method");
  await expect(page.locator("#preview-file-context")).toHaveText("chapters/method.md · isolated file");
  await expect(page.locator("#preview h2 .section-number")).toHaveText("2 ");
  await expect(page.locator("#preview")).toContainText("Describe the procedure.");
  await expect(page.locator("#preview")).not.toContainText("Before");

  await page.locator("#new-project-folder-rail").click();
  await page.locator("#project-file-path").fill("notes");
  await page.locator("#project-file-form").getByRole("button", { name: "Save folder" }).click();
  const notesFolder = page.locator(".project-folder-row", { hasText: "notes/" });
  await expect(notesFolder).toBeVisible();
  await notesFolder.locator("summary").click();
  await notesFolder.getByRole("button", { name: "Move or rename" }).click();
  await page.locator("#project-file-path").fill("appendices/notes");
  await page.locator("#project-file-form").getByRole("button", { name: "Save folder" }).click();
  await expect(page.locator(".project-folder-row", { hasText: "appendices/" })).toBeVisible();
  const movedNotesFolder = page.locator(".project-folder-row", { hasText: "notes/" });
  await expect(movedNotesFolder).toBeVisible();
  await movedNotesFolder.locator("summary").click();
  await movedNotesFolder.getByRole("button", { name: "Delete empty folder" }).click();
  await expect(movedNotesFolder).toBeHidden();
  await expect(page.locator("#toast")).toContainText("Deleted appendices/notes.");
  await page.locator("#toast").getByRole("button", { name: "Undo" }).click();
  await expect(movedNotesFolder).toBeVisible();
  await expect(page.locator("#toast")).toHaveText("Restored appendices/notes.");

  await movedNotesFolder.locator("summary").click();
  const folderDeletion = page.waitForResponse(
    (response) => response.request().method() === "DELETE" && response.url().includes("/folders/"),
  );
  await movedNotesFolder.getByRole("button", { name: "Delete empty folder" }).click();
  await expect(movedNotesFolder).toBeHidden();
  const folderDeletionValue: unknown = await (await folderDeletion).json();
  if (!isWorkspaceSnapshot(folderDeletionValue)) throw new Error("Expected a workspace snapshot after deleting a folder");
  expect(folderDeletionValue.folders.some((folder) => folder.path === "appendices/notes")).toBe(false);

  await fileMenu.locator("summary").click();
  await page.locator("#rename-project-file").click();
  await page.locator("#project-file-path").fill("methods/method.md");
  await page.locator("#project-file-form").getByRole("button", { name: "Save file" }).click();
  const movedSnapshot = await readWorkspaceSnapshot(page, `/api/workspaces/${workspaceId}`);
  expect(movedSnapshot.source).toContain("::include[methods/method.md]");
  expect(movedSnapshot.files.some((file) => file.path === "methods/method.md")).toBe(true);
  await page.locator(".project-file-row", { hasText: "main.md" }).click();
  await expect(page.locator("#preview-file-context")).toHaveText("main.md · composed paper");
  await expect(page.locator("#preview")).toContainText("Before");
  await expect(page.locator("#preview")).toContainText("Describe the procedure.");

  await page.locator(".header-action-menu summary").click();
  await page.getByRole("button", { name: "Project settings" }).click();
  await page.locator("#workspace-entry-file").selectOption({ label: "methods/method.md" });
  await Promise.all([
    page.waitForNavigation(),
    page.locator("#workspace-settings-form").getByRole("button", { name: "Save title" }).click(),
  ]);
  await expect(page.locator("#preview-file-context")).toHaveText("methods/method.md · composed paper");
  await expect(page.locator("#preview")).toContainText("Describe the procedure.");
  await expect(page.locator("#preview")).not.toContainText("Before");

  await page
    .locator(".action-menu", { has: page.locator("#rename-project-file") })
    .locator("summary")
    .click();
  await page.locator("#rename-project-file").click();
  await page.locator("#project-file-path").fill("chapters/revised-method.md");
  await page.locator("#project-file-form").getByRole("button", { name: "Save file" }).click();
  await expect(page.locator("#preview-file-context")).toHaveText("chapters/revised-method.md · composed paper");

  const mainFile = page.locator(".project-file-row", { hasText: "main.md" });
  await mainFile.click();
  await fileMenu.locator("summary").click();
  await page.locator("#delete-project-file").click();
  await expect(mainFile).toBeHidden();
  await expect(page.locator("#toast")).toContainText("Deleted main.md.");
  await page.locator("#toast").getByRole("button", { name: "Undo" }).click();
  await expect(mainFile).toBeVisible();
  await expect(page.locator("#toast")).toHaveText("Restored main.md.");

  await fileMenu.locator("summary").click();
  const fileDeletion = page.waitForResponse((response) => response.request().method() === "DELETE" && response.url().includes("/files/"));
  await page.locator("#delete-project-file").click();
  await expect(mainFile).toBeHidden();
  const fileDeletionValue: unknown = await (await fileDeletion).json();
  if (!isWorkspaceSnapshot(fileDeletionValue)) throw new Error("Expected a workspace snapshot after deleting a file");
  expect(fileDeletionValue.files.some((file) => file.path === "main.md")).toBe(false);
});

test("completes include paths relative to the active project file", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Include completion");
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.locator("#save-status")).toHaveText("Saved");

  await page.locator("#new-project-file-rail").click();
  await page.locator("#project-file-path").fill("chapters/method.md");
  await page.locator("#project-file-form").getByRole("button", { name: "Save file" }).click();
  await page.locator(".project-file-row", { hasText: "main.md" }).click();

  const source = page.locator("#source-editor");
  await source.fill("::include[chapters/met]");
  await source.evaluate((element: HTMLTextAreaElement) => {
    element.setSelectionRange(element.value.length - 1, element.value.length - 1);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await expect(page.locator("#source-completion")).toBeVisible();
  await expect(page.locator("#source-completion").getByRole("option").first()).toContainText("chapters/method.md");
  await source.press("Enter");
  await expect(source).toHaveValue("::include[chapters/method.md]");

  await page.locator(".project-file-row", { hasText: "method.md" }).click();
  await source.fill("::include[KIRJ]");
  await source.evaluate((element: HTMLTextAreaElement) => {
    element.setSelectionRange(element.value.length - 1, element.value.length - 1);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await expect(page.locator("#source-completion").getByRole("option").first()).toContainText("../KIRJOLAB.md");
  await source.press("Tab");
  await expect(source).toHaveValue("::include[../KIRJOLAB.md]");
});

test("isolates clients that send unsupported collaboration frames", async ({ page }) => {
  await page.goto("/editor/demo");
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();

  const beforeValue: unknown = await (await page.request.get("/api/workspaces/demo")).json();
  if (!isWorkspaceSnapshot(beforeValue)) throw new Error("Expected a workspace snapshot before hostile frames");

  const outcomes = await page.evaluate(async () => {
    const endpoint = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/workspaces/demo/socket`;
    const sendAndWaitForClose = async (payload: string | Uint8Array): Promise<{ code: number; reason: string }> =>
      await new Promise((resolve, reject) => {
        const socket = new WebSocket(endpoint);
        const timeout = window.setTimeout(() => {
          socket.close();
          reject(new Error("Hostile collaboration socket was not closed"));
        }, 5_000);
        socket.addEventListener("open", () => socket.send(typeof payload === "string" ? payload : new Uint8Array(payload).buffer));
        socket.addEventListener("close", (event) => {
          window.clearTimeout(timeout);
          resolve({ code: event.code, reason: event.reason });
        });
      });

    return await Promise.all([
      sendAndWaitForClose(JSON.stringify({ type: "revision", revision: 999_999 })),
      sendAndWaitForClose(new Uint8Array([255])),
    ]);
  });

  expect(outcomes).toEqual([
    { code: 1003, reason: "Unsupported client collaboration metadata" },
    { code: 1007, reason: "Invalid document update" },
  ]);
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();

  const afterValue: unknown = await (await page.request.get("/api/workspaces/demo")).json();
  if (!isWorkspaceSnapshot(afterValue)) throw new Error("Expected a workspace snapshot after hostile frames");
  expect(afterValue.revision).toBe(beforeValue.revision);
  expect(afterValue.source).toBe(beforeValue.source);
});

test("creates, shares, and navigates isolated workspaces", async ({ page, browser }) => {
  await page.goto("/editor/demo");
  await page.locator(".header-action-menu summary").click();
  await page.getByRole("button", { name: "New project" }).click();
  await page.locator("#new-workspace-title").fill("Independent inquiry");
  await page.locator('[data-template-id="builtin-guided"]').click();
  await page.locator("#new-workspace-dialog").getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/editor\/[0-9a-f-]{36}$/u);

  const workspaceId = new URL(page.url()).pathname.split("/").at(-1);
  if (!workspaceId) throw new Error("Expected a workspace id");
  await expect(page.locator("#workspace-switcher")).toHaveValue(workspaceId);
  await expect(page.locator("#workspace-switcher option:checked")).toHaveText("Independent inquiry");
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();
  await page.locator(".header-action-menu summary").click();
  await page.getByRole("button", { name: "Open projects" }).click();
  await page.locator("#workspace-catalog-filter").fill("Independent inquiry");
  await expect(page.locator("#workspace-catalog-list")).toContainText("Independent inquiry");
  await expect(page.locator("#workspace-catalog-list")).toContainText("Current project");
  await page.locator("#workspace-catalog-filter").fill("No matching project title");
  await expect(page.locator("#workspace-catalog-list")).toContainText("No projects match this title.");
  await page.locator("#workspace-catalog-dialog").getByRole("button", { name: "Close" }).click();

  const isolatedSource = "## Independent evidence {#independent}\n\nThis belongs to one workspace.\n";
  await page.locator("#source-editor").fill(isolatedSource);
  await expect(page.locator("#preview")).toContainText("This belongs to one workspace.");

  await page.getByRole("button", { name: "Share project" }).click();
  await expect(page.locator("#workspace-member-list")).toContainText("local@kirjolab.invalid");
  await page.locator("#invite-member-email").fill("collaborator@example.org");
  await page.getByRole("button", { name: "Invite collaborator" }).click();
  await expect(page.locator("#workspace-member-list")).toContainText("collaborator@example.org");
  await page.locator("#close-share-workspace").click();

  const collaboratorContext = await browser.newContext({
    baseURL: "http://127.0.0.1:8788",
    extraHTTPHeaders: { "x-kirjolab-local-user": "collaborator@example.org" },
  });
  const collaborator = await collaboratorContext.newPage();
  await collaborator.goto(`/editor/${workspaceId}`);
  await expect(collaborator.locator("#source-editor")).toHaveValue(isolatedSource);
  await expect(collaborator.locator("#workspace-switcher")).toHaveValue(workspaceId);
  await collaboratorContext.close();

  const intruderContext = await browser.newContext({
    baseURL: "http://127.0.0.1:8788",
    extraHTTPHeaders: { "x-kirjolab-local-user": "intruder@example.org" },
  });
  const intruderResponse = await intruderContext.request.get(`/api/workspaces/${workspaceId}`);
  expect(intruderResponse.status()).toBe(404);
  await intruderContext.close();

  const catalogResponse = await page.request.get("/api/workspaces");
  const catalog: unknown = await catalogResponse.json();
  expect(isWorkspaceSummaries(catalog)).toBe(true);
  expect(isWorkspaceSummaries(catalog) ? catalog.some((workspace) => workspace.id === workspaceId) : false).toBe(true);

  await page.goto("/editor/demo");
  await expect(page.locator("#workspace-switcher")).toHaveValue("demo");
  await expect(page.locator("#source-editor")).not.toHaveValue(isolatedSource);
});

test("starts from built-in and promoted personal project templates", async ({ page }) => {
  await page.goto("/editor/demo");
  await page.locator(".header-action-menu summary").click();
  await page.getByRole("button", { name: "New project" }).click();
  await expect(page.locator("#new-workspace-template-list")).toContainText("Literature review");
  await expect(page.locator("#create-workspace")).toBeDisabled();
  await expect(page.locator("#new-workspace-template-preview")).toContainText("Guided starter");
  const guidedTemplate = page.locator('[data-template-id="builtin-guided"]');
  await expect(guidedTemplate).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".template-choice", { has: guidedTemplate })).toHaveAttribute("data-selected", "false");
  await page.locator("#cancel-new-workspace").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#new-workspace-title")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".header-action-menu summary")).toBeFocused();
  await page.locator(".header-action-menu summary").click();
  await page.getByRole("button", { name: "New project" }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  const desktopBrowser = await page.locator(".template-browser").evaluate((browser) => {
    const index = browser.querySelector<HTMLElement>(".template-browser-index")!.getBoundingClientRect();
    const preview = browser.querySelector<HTMLElement>(".template-preview")!.getBoundingClientRect();
    return { indexRight: index.right, previewLeft: preview.left };
  });
  expect(desktopBrowser.previewLeft).toBeGreaterThanOrEqual(desktopBrowser.indexRight - 1);
  await page.setViewportSize({ width: 640, height: 900 });
  const compactBrowser = await page.locator(".template-browser").evaluate((browser) => {
    const index = browser.querySelector<HTMLElement>(".template-browser-index")!.getBoundingClientRect();
    const preview = browser.querySelector<HTMLElement>(".template-preview")!.getBoundingClientRect();
    return { indexBottom: index.bottom, previewTop: preview.top, overflow: document.documentElement.scrollWidth - innerWidth };
  });
  expect(compactBrowser.previewTop).toBeGreaterThanOrEqual(compactBrowser.indexBottom - 1);
  expect(compactBrowser.overflow).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('[data-template-id="builtin-literature-review"]').click();
  await expect(page.locator('[data-template-id="builtin-literature-review"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#new-workspace-template-preview")).toContainText("sections/search-strategy.md");
  await expect(page.locator("#new-workspace-template-preview")).toContainText("Publication setup");
  await expect(page.locator("#new-workspace-template-id")).toHaveValue("builtin-literature-review");
  await expect(page.locator("#new-workspace-template-preview")).toContainText("Selected starting point");
  await expect(page.locator("#create-workspace")).toBeEnabled();
  await page.locator("#new-workspace-title").fill("Review workflow");
  await page.locator("#create-workspace").click();
  await page.waitForURL(/\/editor\/[0-9a-f-]{36}$/u);

  const reviewWorkspaceId = new URL(page.url()).pathname.split("/").at(-1);
  if (!reviewWorkspaceId) throw new Error("Expected a review workspace id");
  const reviewApi = `/api/workspaces/${reviewWorkspaceId}`;
  const reviewSnapshot = await readWorkspaceSnapshot(page, reviewApi);
  expect(reviewSnapshot.files.some((file) => file.path === "sections/search-strategy.md")).toBe(true);
  expect(reviewSnapshot.files.some((file) => file.path === "KIRJOLAB.md")).toBe(false);

  const reusableFile = await page.request.post(`${reviewApi}/files`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { path: "sections/lab-checklist.md", content: "## Lab checklist\n\nReusable steps.\n" },
  });
  expect(reusableFile.status()).toBe(201);
  await page.reload();
  await page.locator(".header-action-menu summary").click();
  await page.getByRole("button", { name: "Project settings" }).click();
  await page.locator("#save-workspace-template").click();
  await expect(page.locator("#save-template-dialog")).toBeVisible();
  await page.locator("#save-template-name").fill("Lab review workflow");
  await page.locator("#save-template-description").fill("A reusable evidence review workflow.");
  await page.locator("#save-template-form").getByRole("button", { name: "Save template" }).click();
  await expect(page.locator("#toast")).toContainText(/saved .* as a personal template/iu);

  const templatesResponse = await page.request.get("/api/project-templates");
  expect(templatesResponse.ok()).toBe(true);
  const templates: unknown = await templatesResponse.json();
  if (!Array.isArray(templates)) throw new Error("Expected project template summaries");
  const personal = templates.find(
    (template) => isRecord(template) && template.source === "personal" && template.name === "Lab review workflow",
  );
  if (!isRecord(personal) || typeof personal.id !== "string") throw new Error("Expected a personal project template");
  expect("seed" in personal).toBe(false);
  expect(isRecord(personal.preview)).toBe(true);
  expect(JSON.stringify(personal.preview)).not.toContain("Reusable steps.");

  await page.locator(".header-action-menu summary").click();
  await page.getByRole("button", { name: "New project" }).click();
  await page.locator(`[data-template-id="${personal.id}"]`).click();
  await expect(page.locator("#new-workspace-template-preview")).toContainText("sections/lab-checklist.md");
  await expect(page.locator("#new-workspace-template-id")).toHaveValue(personal.id);
  await page.locator("#new-workspace-title").fill("Reusable review");
  await page.locator("#create-workspace").click();
  await page.waitForURL(/\/editor\/[0-9a-f-]{36}$/u);

  const personalWorkspaceId = new URL(page.url()).pathname.split("/").at(-1);
  if (!personalWorkspaceId) throw new Error("Expected a personal-template workspace id");
  const personalApi = `/api/workspaces/${personalWorkspaceId}`;
  const personalSnapshot = await readWorkspaceSnapshot(page, personalApi);
  expect(personalSnapshot.files.some((file) => file.path === "sections/lab-checklist.md")).toBe(true);
  const replacementFile = await page.request.post(`${personalApi}/files`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { path: "sections/replacement-only.md", content: "## Replacement\n\nOnly in the replacement.\n" },
  });
  expect(replacementFile.status()).toBe(201);
  const replacement = await page.request.post(`${personalApi}/template`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: {
      templateId: personal.id,
      name: "Lab review workflow",
      description: "Updated reusable evidence review workflow.",
    },
  });
  expect(replacement.ok()).toBe(true);

  const instantiated = await page.request.post("/api/workspaces", {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { title: "Updated reusable review", templateId: personal.id },
  });
  expect(instantiated.status()).toBe(201);
  const instantiatedSummary: unknown = await instantiated.json();
  if (!isRecord(instantiatedSummary) || typeof instantiatedSummary.id !== "string") {
    throw new Error("Expected a project created from the replacement template");
  }
  const instantiatedSnapshot = await readWorkspaceSnapshot(page, `/api/workspaces/${instantiatedSummary.id}`);
  expect(instantiatedSnapshot.files.some((file) => file.path === "sections/replacement-only.md")).toBe(true);

  await page.locator(".header-action-menu summary").click();
  await page.getByRole("button", { name: "New project" }).click();
  const personalTemplate = page.locator(`[data-template-id="${personal.id}"]`);
  const personalTemplateRow = page.locator(".template-choice", { has: personalTemplate });
  await personalTemplateRow.getByRole("button", { name: "Remove" }).click();
  await expect(personalTemplateRow).toBeHidden();
  await expect(page.locator("#toast")).toContainText("Deleted template “Lab review workflow”.");
  await page.locator("#toast").getByRole("button", { name: "Undo" }).click();
  await expect(personalTemplateRow).toBeVisible();
  await expect(page.locator("#toast")).toHaveText("Restored template “Lab review workflow”.");

  const templateDeletion = page.waitForResponse(
    (response) => response.request().method() === "DELETE" && response.url().includes("/api/project-templates/"),
  );
  await personalTemplateRow.getByRole("button", { name: "Remove" }).click();
  await expect(personalTemplateRow).toBeHidden();
  expect((await templateDeletion).ok()).toBe(true);
  const remainingTemplates: unknown = await (await page.request.get("/api/project-templates")).json();
  if (!Array.isArray(remainingTemplates)) throw new Error("Expected project template summaries after deletion");
  expect(remainingTemplates.some((template) => isRecord(template) && template.id === personal.id)).toBe(false);
});

test("gates GitHub project import behind a user connection", async ({ page }) => {
  let connected = false;
  await page.route("**/api/github/connection", async (route) => {
    if (route.request().method() === "DELETE") {
      connected = false;
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      json: connected
        ? { connected: true, user: { id: "42", login: "researcher" }, connectedAt: "2026-07-16T12:00:00.000Z" }
        : { connected: false },
    });
  });
  await page.route("**/api/github/installations", async (route) => {
    await route.fulfill({ json: { installations: [{ id: 7, accountId: "42", accountLogin: "researcher", accountType: "User" }] } });
  });
  await page.route("**/api/github/installations/7/repositories", async (route) => {
    await route.fulfill({
      json: {
        repositories: [
          {
            id: 99,
            owner: "researcher",
            name: "manuscript",
            fullName: "researcher/manuscript",
            private: true,
            defaultBranch: "main",
          },
        ],
      },
    });
  });
  await page.route("**/api/github/installations/7/repositories/99/branches", async (route) => {
    await route.fulfill({
      json: {
        repository: {
          id: 99,
          owner: "researcher",
          name: "manuscript",
          fullName: "researcher/manuscript",
          private: true,
          defaultBranch: "main",
        },
        branches: [
          { name: "main", protected: true },
          { name: "draft", protected: false },
        ],
      },
    });
  });
  await page.goto("/editor/demo");
  await page.locator(".header-action-menu summary").click();
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByRole("button", { name: "Import GitHub" }).click();
  await expect(page.locator("#github-connection-status")).toContainText("Connect GitHub");
  await expect(page.getByRole("link", { name: "Connect GitHub" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview import" })).toBeDisabled();

  connected = true;
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.locator(".header-action-menu summary").click();
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByRole("button", { name: "Import GitHub" }).click();
  await expect(page.locator("#github-connection-status")).toContainText("Connected as @researcher");
  await expect(page.getByRole("link", { name: "Manage repository access" })).toBeVisible();
  await expect(page.locator("#github-installation-id")).toHaveValue("7");
  await expect(page.locator("#github-repository")).toHaveValue("99");
  await expect(page.locator("#github-branch")).toHaveValue("main");
  await expect(page.locator("#github-branch option:checked")).toContainText("protected");
  await expect(page.getByRole("button", { name: "Preview import" })).toBeEnabled();
});

test("names, compares, restores, and branches immutable project revisions", async ({ page, browser }) => {
  const workspaceId = await createWorkspace(page, "Revision workflow");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();
  await page.locator("#source-editor").fill("# Revised manuscript\n\nA versioned claim.\n");
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).source).toContain("A versioned claim.");

  const historyResponse = await page.request.get(`${api}/history`);
  expect(historyResponse.ok()).toBe(true);
  const history: unknown = await historyResponse.json();
  if (!Array.isArray(history) || !isRecord(history[0]) || typeof history[0].revision !== "number") {
    throw new Error("Expected project revision history");
  }
  const head = history[0].revision;
  const milestone = await page.request.post(`${api}/history/${head}/milestones`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { name: "review draft", description: "Sent for review" },
  });
  expect(milestone.status()).toBe(201);
  const invited = await page.request.post(`${api}/members`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { email: "history-reader@example.org" },
  });
  expect(invited.status()).toBe(201);
  const memberContext = await browser.newContext({
    baseURL: "http://127.0.0.1:8788",
    extraHTTPHeaders: { "x-kirjolab-local-user": "history-reader@example.org" },
  });
  expect((await memberContext.request.get(`${api}/history`)).status()).toBe(200);
  const forbiddenMilestone = await memberContext.request.post(`${api}/history/${head}/milestones`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { name: "member cannot tag" },
  });
  expect(forbiddenMilestone.status()).toBe(403);
  await memberContext.close();

  const fileCreated = await page.request.post(`${api}/files`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { path: "appendix/reviewer-notes.md", content: "Reviewer response\n" },
  });
  expect(fileCreated.status()).toBe(201);
  const nextHistory: unknown = await (await page.request.get(`${api}/history`)).json();
  if (!Array.isArray(nextHistory) || !isRecord(nextHistory[0]) || typeof nextHistory[0].revision !== "number") {
    throw new Error("Expected updated project revision history");
  }
  const next = nextHistory[0].revision;
  const compared = await page.request.get(`${api}/history/compare?from=${head}&to=${next}`);
  expect(compared.ok()).toBe(true);
  await expect(compared.json()).resolves.toMatchObject({
    fromRevision: head,
    toRevision: next,
    files: expect.arrayContaining([expect.objectContaining({ status: "added", afterPath: "appendix/reviewer-notes.md" })]),
  });

  await page.locator("#editor-more-menu summary").click();
  await page.getByRole("button", { name: /History/ }).click();
  await expect(page.locator("#project-history-dialog")).toBeVisible();
  await expect(page.locator("#project-history-list")).toContainText("review draft");
  await expect(page.locator("#project-history-list")).toContainText("project-file-create");
  await page.locator("#close-project-history").click();

  const branch = await page.request.post(`${api}/history/${head}/seed`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { title: "Reviewer response branch" },
  });
  expect(branch.status()).toBe(201);
  const branchSummary: unknown = await branch.json();
  if (!isRecord(branchSummary) || typeof branchSummary.id !== "string") throw new Error("Expected revision branch workspace");
  const branchSnapshot = await readWorkspaceSnapshot(page, `/api/workspaces/${branchSummary.id}`);
  expect(branchSnapshot.source).toContain("A versioned claim.");
  expect(branchSnapshot.files.some((file) => file.path === "appendix/reviewer-notes.md")).toBe(false);

  const restored = await page.request.post(`${api}/history/${head}/restore`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: {},
  });
  expect(restored.ok()).toBe(true);
  await expect
    .poll(async () => (await readWorkspaceSnapshot(page, api)).files.some((file) => file.path === "appendix/reviewer-notes.md"))
    .toBe(false);
  const restoredHistory: unknown = await (await page.request.get(`${api}/history`)).json();
  expect(restoredHistory).toEqual(expect.arrayContaining([expect.objectContaining({ reason: `restore:r${head}` })]));
});

test("projects the default canonical bibliography into a fresh workspace", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Default bibliography projection");
  const snapshot = await readWorkspaceSnapshot(page, `/api/workspaces/${workspaceId}`);
  const publication = snapshot.publications.find((candidate) => candidate.citationKey === "merton1942");

  expect(publication).toMatchObject({
    type: "article",
    title: "The Normative Structure of Science",
    authors: ["Merton, Robert K."],
    year: "1942",
    venue: "The Sociology of Science",
    metadataSource: "bibtex",
  });
});

test("starts a fresh project with a syntax guide and discoverable transclusion example", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Transclusion starter");
  const snapshot = await readWorkspaceSnapshot(page, `/api/workspaces/${workspaceId}`);

  expect(snapshot.files).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: "main.md", content: expect.stringContaining("::include[sections/transclusion.md]") }),
      expect.objectContaining({ path: "sections/transclusion.md", content: expect.stringContaining("Included from another file") }),
      expect.objectContaining({
        path: "KIRJOLAB.md",
        content: expect.stringMatching(/:citet\[<key>\].*::bibliography\[\].*::include\[sections\/methods\.md\]/su),
      }),
    ]),
  );
  expect(snapshot.source).not.toContain("Kirjolab guide");
  expect(snapshot.composition.content).toContain("This section lives in `sections/transclusion.md`");
  expect(snapshot.composition.content).not.toContain("Kirjolab guide");
  expect(snapshot.composition.diagnostics).toEqual([]);
});

test("derives collaborative project bibliography from shared-library aliases", async ({ page, context }) => {
  const workspaceId = await createWorkspace(page, "Derived project bibliography");
  const api = `/api/workspaces/${workspaceId}`;
  const path = `/editor/${workspaceId}`;
  await page.goto(path);
  const collaborator = await context.newPage();
  await collaborator.goto(path);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();

  const imported = await page.request.post(`${api}/bibliography/import`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: {
      bibtex: `@article{collaborative2026,
        author = {Doe, Jane and Researcher, Alex},
        title = {Collaborative Reference Projection},
        year = {2026},
        journal = {Journal of Shared Evidence},
        doi = {10.5555/collaborative.2026}
      }`,
    },
  });
  expect(imported.status()).toBe(200);
  await expect(page.locator("#publication-list")).toContainText("Collaborative Reference Projection");
  await expect(collaborator.locator("#publication-list")).toContainText("Collaborative Reference Projection");
  const snapshot = await readWorkspaceSnapshot(page, api);
  const link = snapshot.projectReferences.find((item) => item.citationAlias === "collaborative2026");
  if (!link) throw new Error("Expected a shared-library project link");

  await expect(page.locator("#bibliography-editor")).toHaveAttribute("readonly", "");
  await expect(page.locator("#bibliography-editor")).toBeHidden();
  await expect(collaborator.locator("#bibliography-editor")).toHaveValue(/@article\{collaborative2026/u);
  await page.getByRole("tab", { name: "Library" }).click();
  const referenceCard = page
    .locator("#reference-library-list .library-reference-row")
    .filter({ hasText: "Collaborative Reference Projection" });
  await openLibraryReferenceDetails(referenceCard);
  await referenceCard.getByLabel("title for Collaborative Reference Projection").fill("Updated Collaborative Reference Projection");
  await referenceCard.getByRole("button", { name: "Save details" }).click();
  await expect(page.locator("#toast")).toHaveText("Bibliographic details saved with manual provenance.");
  await expect(page.locator("#bibliography-editor")).toHaveValue(/title = \{Updated Collaborative Reference Projection\}/u);
  await expect(collaborator.locator("#bibliography-editor")).toHaveValue(/title = \{Updated Collaborative Reference Projection\}/u);
  const source = "# Shared source\n\nThe project cites :cite[collaborative2026].\n";
  await page.locator("#source-editor").fill(source);
  await expect(collaborator.locator("#source-editor")).toHaveValue(source);

  const renamed = await page.request.patch(`${api}/references/${link.referenceId}`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { citationAlias: "renamed2027" },
  });
  expect(renamed.ok()).toBe(true);
  await expect(page.locator("#source-editor")).toHaveValue(/:cite\[renamed2027\]/u);
  await expect(collaborator.locator("#source-editor")).toHaveValue(/:cite\[renamed2027\]/u);
  await expect(page.locator("#bibliography-editor")).toHaveValue(/@article\{renamed2027/u);

  const guardedUnlink = await page.request.delete(`${api}/references/${link.referenceId}`, {
    headers: { origin: "http://127.0.0.1:8788" },
  });
  expect(guardedUnlink.status()).toBe(409);
  await collaborator.close();
});

test("keeps legacy project BibTeX import compatible without exposing it in the project UI", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Stable shared import");
  const api = `/api/workspaces/${workspaceId}`;
  await page.goto(`/editor/${workspaceId}`);
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();
  await expect(page.locator("#bibliography-upload")).toHaveCount(0);
  await expect(page.getByLabel("Import project BibTeX")).toHaveCount(0);

  const invalidImport = await page.request.post(`${api}/bibliography/import`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { bibtex: "not bibtex at all" },
  });
  expect(invalidImport.status()).toBe(400);
  expect(await invalidImport.json()).toEqual({ error: "No valid BibTeX entries found" });

  const validImport = await page.request.post(`${api}/bibliography/import`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: {
      bibtex: `@article{inspectable2026,
  author = {Doe, Jane and Researcher, Alex},
  title = {{I}nspectable {R}eference {W}orkflows},
  year = {2026},
  journal = {Journal of Open Evidence},
  doi = {https://doi.org/10.5555/inspectable.2026}
}`,
    },
  });
  expect(validImport.status()).toBe(200);

  await expect(page.locator("#publication-list")).toContainText("Inspectable Reference Workflows");
  await expect(page.locator("#publication-list")).toContainText("10.5555/inspectable.2026");
  await expect(page.locator("#publication-count")).not.toHaveText("0");
  await expect(page.locator("#bibliography-editor")).toHaveValue(/@article\{inspectable2026,/u);

  const response = await page.request.get(api);
  const value: unknown = await response.json();
  expect(response.ok()).toBe(true);
  const imported = isWorkspaceSnapshot(value)
    ? value.publications.find((publication) => publication.citationKey === "inspectable2026")
    : undefined;
  expect(imported).toMatchObject({
    title: "{I}nspectable {R}eference {W}orkflows",
    doi: "10.5555/inspectable.2026",
    metadataSource: "bibtex",
  });

  await page.getByRole("tab", { name: "Library" }).click();
  const importedCard = page
    .locator("#reference-library-list .library-reference-row")
    .filter({ hasText: "Inspectable Reference Workflows" });
  await expect(importedCard.getByRole("heading", { name: "Inspectable Reference Workflows" })).toBeVisible();
  await openLibraryReferenceDetails(importedCard);
  await expect(importedCard.getByLabel("title for Inspectable Reference Workflows")).toHaveValue("{I}nspectable {R}eference {W}orkflows");
  await page.locator("#reference-filter-query").fill("inspectable reference workflows");
  await expect(importedCard).toBeVisible();
  await page.locator("#reference-filter-query").fill("");

  const updatedImport = await page.request.post(`${api}/bibliography/import`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: {
      bibtex: `@article{Inspectable2026,
  author = {Doe, Jane},
  title = {Updated Reference Workflows},
  year = {2027},
  doi = {10.5555/inspectable.2026}
}`,
    },
  });
  expect(updatedImport.status()).toBe(200);
  await expect(page.locator("#publication-list")).toContainText("Updated Reference Workflows");
  const updatedResponse = await page.request.get(api);
  const updatedValue: unknown = await updatedResponse.json();
  const updated = isWorkspaceSnapshot(updatedValue)
    ? updatedValue.publications.find((publication) => publication.citationKey === "inspectable2026")
    : undefined;
  expect(updated?.id).toBe(imported?.id);
  expect(updated).toMatchObject({ title: "Updated Reference Workflows", year: "2027" });
});

test("persists and atomically replaces evidence-backed claims", async ({ page }) => {
  await page.goto("/editor/demo");
  const origin = "http://127.0.0.1:8788";
  const workspaceResponse = await page.request.post("/api/workspaces", {
    headers: { origin },
    data: { title: "Claim boundary" },
  });
  const workspace: unknown = await workspaceResponse.json();
  if (!isRecord(workspace) || typeof workspace.id !== "string") throw new Error("Expected a created workspace");
  const api = `/api/workspaces/${workspace.id}`;

  const pdfResponse = await page.request.post(`${api}/pdfs`, {
    headers: { origin, "content-type": "application/pdf", "x-file-name": "claim-evidence.pdf" },
    data: createEvidencePdf(),
  });
  const pdf: unknown = await pdfResponse.json();
  if (!isRecord(pdf) || typeof pdf.id !== "string") throw new Error("Expected an imported PDF");

  const annotationResponse = await page.request.post(`${api}/annotations`, {
    headers: { origin },
    data: {
      pdfId: pdf.id,
      page: 1,
      quote: "Knowledge grows through inspectable evidence.",
      prefix: "",
      suffix: "",
      comment: "Claim source",
      rects: [],
    },
  });
  const annotation: unknown = await annotationResponse.json();
  if (!isRecord(annotation) || typeof annotation.id !== "string") throw new Error("Expected an annotation");

  const claimResponse = await page.request.post(`${api}/claims`, {
    headers: { origin },
    data: {
      text: "Inspectable evidence strengthens scholarly claims.",
      note: "Initial synthesis",
      evidence: [{ annotationId: annotation.id, relation: "supports" }],
    },
  });
  expect(claimResponse.status()).toBe(201);
  const claim: unknown = await claimResponse.json();
  if (!isRecord(claim) || typeof claim.id !== "string") throw new Error("Expected a claim");

  const updateResponse = await page.request.put(`${api}/claims/${claim.id}`, {
    headers: { origin },
    data: {
      text: "Inspectable evidence keeps scholarly claims accountable.",
      note: "Revised synthesis",
      evidence: [{ annotationId: annotation.id, relation: "extends" }],
    },
  });
  expect(updateResponse.ok()).toBe(true);

  const snapshotResponse = await page.request.get(api);
  const snapshot: unknown = await snapshotResponse.json();
  if (!isWorkspaceSnapshot(snapshot)) throw new Error("Expected a claim snapshot");
  const excerpt = "The preview resolves a link back to";
  const start = snapshot.source.indexOf(excerpt);
  const linkResponse = await page.request.post(`${api}/claim-links`, {
    headers: { origin },
    data: {
      claimId: claim.id,
      fileId: snapshot.entryFileId,
      start,
      end: start + excerpt.length,
      excerpt,
      sourceRevision: snapshot.revision,
    },
  });
  expect(linkResponse.status()).toBe(201);

  const rejectedUpdate = await page.request.put(`${api}/claims/${claim.id}`, {
    headers: { origin },
    data: {
      text: "This update must roll back.",
      note: "",
      evidence: [{ annotationId: crypto.randomUUID(), relation: "supports" }],
    },
  });
  expect(rejectedUpdate.status()).toBe(400);
  const afterRejected: unknown = await (await page.request.get(api)).json();
  if (!isWorkspaceSnapshot(afterRejected)) throw new Error("Expected an unchanged claim snapshot");
  expect(afterRejected.claims).toMatchObject([
    { id: claim.id, text: "Inspectable evidence keeps scholarly claims accountable.", note: "Revised synthesis" },
  ]);
  expect(afterRejected.claimEvidenceLinks).toMatchObject([{ claimId: claim.id, annotationId: annotation.id, relation: "extends" }]);
  expect(afterRejected.claimLinks).toMatchObject([{ claimId: claim.id, anchor: { exact: excerpt } }]);

  const deleteResponse = await page.request.delete(`${api}/claims/${claim.id}`, { headers: { origin } });
  expect(deleteResponse.status()).toBe(204);
  const afterDelete: unknown = await (await page.request.get(api)).json();
  if (!isWorkspaceSnapshot(afterDelete)) throw new Error("Expected a post-delete snapshot");
  expect(afterDelete.annotations).toHaveLength(1);
  expect(afterDelete.claims).toEqual([]);
  expect(afterDelete.claimEvidenceLinks).toEqual([]);
  expect(afterDelete.claimLinks).toEqual([]);
});

test("selects the explicit local companion connection", async ({ page }) => {
  await page.goto("/editor/demo");
  await openWritingAssistant(page, true);
  await page.locator("#llm-connection").selectOption("companion");
  await expect(page.locator("#llm-endpoint")).toHaveValue("http://127.0.0.1:8790/v1/chat/completions");
  await expect(page.locator("#model-status")).toContainText("npm run dev");
  await selectLocalModel(page, "qwen-local");
  await page.locator("#llm-reasoning-effort").selectOption("low");
  await page.reload();
  await page.locator("#preferences-menu > summary").click();
  await expect(page.locator("#llm-connection")).toHaveValue("companion");
  await expect(page.locator("#llm-endpoint")).toHaveValue("http://127.0.0.1:8790/v1/chat/completions");
  await expect(page.locator("#llm-model")).toHaveValue("qwen-local");
  await expect(page.locator("#llm-reasoning-effort")).toHaveValue("low");
});

test("discovers loaded local models for the writing assistant", async ({ page }) => {
  await page.route("http://127.0.0.1:1234/v1/models", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ data: [{ id: "qwen/qwen3.5-9b" }, { id: "gemma/local" }] }),
    });
  });
  await page.goto("/editor/demo");
  await openWritingAssistant(page, true);
  await expect(page.locator("#llm-model")).toHaveValue("");
  await page.getByRole("button", { name: "Find loaded models" }).click();

  await expect(page.locator("#llm-model")).toHaveValue("qwen/qwen3.5-9b");
  await expect(page.locator("#llm-model option")).toHaveCount(2);
  await expect(page.locator("#llm-model")).toHaveText(/qwen\/qwen3\.5-9b.*gemma\/local/su);
  await expect(page.locator("#model-status")).toHaveText("Found 2 loaded models. Using qwen/qwen3.5-9b.");
  await page.locator("#llm-model").selectOption("gemma/local");
  await expect(page.locator("#model-status")).toHaveText("Using gemma/local for new writing assistant requests.");
});

test("rejects a delayed model candidate after a concurrent manuscript edit", async ({ page, context }) => {
  const origin = "http://127.0.0.1:8788";
  const workspaceId = await createWorkspace(page, "Stale model boundary");
  const api = `/api/workspaces/${workspaceId}`;
  const pdfResponse = await page.request.post(`${api}/pdfs`, {
    headers: { origin, "content-type": "application/pdf", "x-file-name": "model-evidence.pdf" },
    data: createEvidencePdf(),
  });
  const pdf: unknown = await pdfResponse.json();
  if (!isRecord(pdf) || typeof pdf.id !== "string") throw new Error("Expected an imported PDF");
  const annotationResponse = await page.request.post(`${api}/annotations`, {
    headers: { origin },
    data: {
      pdfId: pdf.id,
      page: 1,
      quote: "Knowledge grows through inspectable evidence.",
      prefix: "",
      suffix: "",
      comment: "Model grounding",
      rects: [],
    },
  });
  expect(annotationResponse.status()).toBe(201);

  let markLlmRequested = (): void => undefined;
  const llmRequested = new Promise<void>((resolve) => {
    markLlmRequested = resolve;
  });
  let releaseLlm = (): void => undefined;
  const waitForLlmRelease = new Promise<void>((resolve) => {
    releaseLlm = resolve;
  });
  await page.route("http://127.0.0.1:1234/v1/chat/completions", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
      return;
    }
    markLlmRequested();
    await waitForLlmRelease;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        choices: [{ message: { content: "This stale replacement must not be stored." } }],
      }),
    });
  });

  const path = `/editor/${workspaceId}`;
  await page.goto(path);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  await expect(page.locator("#annotation-list")).toContainText("Model grounding");
  const editor = page.locator("#source-editor");
  const baseSource = "## Model boundary {#model-boundary}\n\nThis paragraph is grounded in visible evidence.\n";
  await editor.fill(baseSource);
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).source).toBe(baseSource);
  const baseSnapshot = await readWorkspaceSnapshot(page, api);

  const collaborator = await context.newPage();
  await collaborator.goto(path);
  await expect(page.getByText(/Live · 2 writers/)).toBeVisible();
  await expect(collaborator.locator("#source-editor")).toHaveValue(baseSource);

  await editor.evaluate((element: HTMLTextAreaElement) => {
    const start = element.value.indexOf("This paragraph");
    element.focus();
    element.setSelectionRange(start, start + "This paragraph is grounded in visible evidence.".length);
  });
  await openResearchCollection(page, "Project evidence");
  await page.locator("[data-annotation-id]").first().check();
  await openWritingAssistant(page, true);
  await page.locator("#llm-endpoint").fill("http://127.0.0.1:1234/v1/chat/completions");
  await selectLocalModel(page, "delayed-local-model");
  await expect(page.getByRole("button", { name: "Draft revision" })).toBeEnabled();
  await page.getByRole("button", { name: "Draft revision" }).click();
  await llmRequested;

  const concurrentSource = `${baseSource}\nA collaborator changes the manuscript while the model is thinking.\n`;
  await collaborator.locator("#source-editor").fill(concurrentSource);
  await expect(editor).toHaveValue(concurrentSource);
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).source).toBe(concurrentSource);
  const concurrentSnapshot = await readWorkspaceSnapshot(page, api);
  expect(concurrentSnapshot.revision).toBeGreaterThan(baseSnapshot.revision);
  await expect(page.locator("#revision-badge")).toHaveText(`r${concurrentSnapshot.revision}`);

  const candidateResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `${api}/candidates` && response.request().method() === "POST",
  );
  releaseLlm();
  expect((await candidateResponse).status()).toBe(409);
  await expect(page.locator("#model-status")).toContainText(/stale|changed/iu);
  await expect(page.locator("#candidate-list article")).toHaveCount(0);
  await expect(page.locator("#candidate-list")).toContainText("Drafts open in Context");
  const finalSnapshot = await readWorkspaceSnapshot(page, api);
  expect(finalSnapshot.candidates).toEqual([]);
  expect(finalSnapshot.source).toBe(concurrentSource);
  await collaborator.close();
});

test("turns one clarity answer into a reviewable targeted revision", async ({ page }) => {
  const workspaceId = await createWorkspace(page, "Clarity drill");
  const api = `/api/workspaces/${workspaceId}`;
  const requests: unknown[] = [];
  await page.route("**/api/library/discovery", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ query: "visible evidence review time" });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          providers: [{ provider: "crossref", score: 42 }],
          identifiers: [{ scheme: "doi", value: "10.5555/discovery" }],
          metadata: {
            type: "article",
            title: "Verified discovery",
            authors: ["Doe, Jane"],
            year: "2026",
            venue: "Research Systems",
            doi: "10.5555/discovery",
            url: "https://doi.org/10.5555/discovery",
            abstract: "Registry-backed metadata.",
          },
        },
      ]),
    });
  });
  await page.route("http://127.0.0.1:1234/v1/chat/completions", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
      return;
    }
    const body: unknown = route.request().postDataJSON();
    requests.push(body);
    const schemaName =
      isRecord(body) && isRecord(body.response_format) && isRecord(body.response_format.json_schema)
        ? body.response_format.json_schema.name
        : null;
    const content =
      schemaName === "kirjolab_reference_query"
        ? JSON.stringify({ query: "visible evidence review time", rationale: "Names the mechanism and outcome." })
        : schemaName === "kirjolab_clarity_question"
          ? JSON.stringify({ issue: "Better does not name an outcome.", question: "What improves, and for whom?" })
          : schemaName === "kirjolab_table"
            ? JSON.stringify({
                caption: "Review outcomes",
                columns: ["Workflow", "Review time"],
                rows: [
                  ["Baseline", "12 min"],
                  ["Kirjolab", "8 min"],
                ],
              })
            : schemaName === "kirjolab_ideas"
              ? JSON.stringify({
                  ideas: [
                    {
                      title: "Measure review time",
                      direction: "Name one affected group and measurable outcome.",
                      draft: "The workflow reduces review time for editors.",
                    },
                    {
                      title: "Compare steps",
                      direction: "Contrast the two workflows.",
                      draft: "The workflow removes a separate evidence lookup step.",
                    },
                    {
                      title: "Explain mechanism",
                      direction: "Connect visible evidence to review speed.",
                      draft: "Visible evidence lets editors validate claims without leaving the draft.",
                    },
                  ],
                })
              : schemaName === "kirjolab_phrasing_alternatives"
                ? JSON.stringify({
                    alternatives: [
                      {
                        text: "The findings suggest that this workflow may reduce review time.",
                        rationale: "Qualifies the inference.",
                      },
                      {
                        text: "This workflow appears to reduce review time under the tested conditions.",
                        rationale: "Bounds the claim to observed conditions.",
                      },
                      {
                        text: "The observed results are consistent with faster review.",
                        rationale: "Avoids causal certainty.",
                      },
                    ],
                  })
                : JSON.stringify({
                    rewrites: [
                      { text: "The workflow cuts review time for editors.", rationale: "Names the outcome and affected group." },
                      { text: "Editors review drafts faster with this workflow.", rationale: "States the effect directly." },
                    ],
                  });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ choices: [{ message: { content } }] }),
    });
  });

  await page.goto(`/editor/${workspaceId}`);
  await expect(page.getByText(/Live · 1 writer/)).toBeVisible();
  const editor = page.locator("#source-editor");
  const source = "# Review\n\nThis workflow is better for everyone.\n";
  await editor.fill(source);
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).source).toBe(source);
  await editor.evaluate((element: HTMLTextAreaElement) => {
    const caret = element.value.indexOf("better") + 2;
    element.focus();
    element.setSelectionRange(caret, caret);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await openWritingAssistant(page, true);
  await page.locator("#model-operation").selectOption("clarity-drill");
  await page.locator("#llm-endpoint").fill("http://127.0.0.1:1234/v1/chat/completions");
  await selectLocalModel(page, "clarity-test-model");
  await expect(page.locator("#assistant-target-preview")).toContainText("This workflow is better for everyone.");
  await page.getByRole("button", { name: "Start drill" }).click();
  await expect(page.getByText("What improves, and for whom?")).toBeVisible();
  await page.locator("#assistant-interactive-result textarea").fill("It reduces the time editors spend reviewing a draft.");
  await page.getByRole("button", { name: "Show precise rewrites" }).click();
  await expect(page.getByText("The workflow cuts review time for editors.")).toBeVisible();
  await page.getByRole("button", { name: "Review this revision" }).first().click();

  await expect(page.locator("#context-candidate-before")).toHaveText("This workflow is better for everyone.");
  await expect(page.locator("#context-candidate-after")).toHaveText("The workflow cuts review time for editors.");
  await expect(editor).toHaveValue(source);
  expect(requests).toHaveLength(2);
  expect((await readWorkspaceSnapshot(page, api)).candidates).toContainEqual(expect.objectContaining({ evidence: [], status: "pending" }));

  await page.getByRole("tab", { name: "Writing assistant" }).click();
  await page.locator("#model-operation").selectOption("ideate");
  await page.getByRole("button", { name: "Generate ideas" }).click();
  await expect(page.getByText("Measure review time")).toBeVisible();
  await page.getByRole("button", { name: "Review this direction" }).first().click();
  await expect(page.locator("#context-candidate-after")).toHaveText("The workflow reduces review time for editors.");
  await expect(editor).toHaveValue(source);
  expect(requests).toHaveLength(3);

  await page.getByRole("tab", { name: "Writing assistant" }).click();
  await page.locator("#model-operation").selectOption("phrase-passage");
  await expect(page.locator("#assistant-phrasing-purpose-field")).toBeVisible();
  await page.locator("#assistant-phrasing-purpose").selectOption("qualify-claim");
  await page.getByRole("button", { name: "Suggest alternatives" }).click();
  await expect(page.getByText("The findings suggest that this workflow may reduce review time.")).toBeVisible();
  const phrasingRequest = requests[3];
  expect(phrasingRequest).toMatchObject({
    messages: [
      expect.any(Object),
      expect.objectContaining({
        content: expect.stringContaining('"rhetoricalPurpose":{"id":"qualify-claim"'),
      }),
    ],
  });
  expect(JSON.stringify(phrasingRequest)).not.toContain("10.1371");
  await page.getByRole("button", { name: "Review this alternative" }).first().click();
  await expect(page.locator("#context-candidate-after")).toHaveText("The findings suggest that this workflow may reduce review time.");
  await expect(editor).toHaveValue(source);
  expect(requests).toHaveLength(4);

  await page.getByRole("tab", { name: "Writing assistant" }).click();
  await page.locator("#model-operation").selectOption("build-table");
  await page.locator("#assistant-table-caption").fill("Review outcomes");
  await page.locator("#assistant-table-columns").fill("Workflow\nReview time");
  await page.locator("#assistant-table-rows").fill("Baseline | 12 min\nKirjolab | 8 min");
  await page.getByRole("button", { name: "Build syntax" }).click();
  await expect(page.locator("#assistant-interactive-result pre")).toContainText("| Workflow | Review time |");
  await page.getByRole("button", { name: "Insert table" }).click();
  await expect(editor).toHaveValue(/\| Kirjolab \| 8 min \|/u);
  expect(requests).toHaveLength(5);

  await page.getByRole("tab", { name: "Writing assistant" }).click();
  await page.locator("#model-operation").selectOption("find-references");
  await page.getByRole("button", { name: "Find references" }).click();
  await expect(page.getByText("Verified discovery")).toBeVisible();
  await expect(page.getByRole("link", { name: "Verify DOI" })).toHaveAttribute("href", "https://doi.org/10.5555/discovery");
  await page.getByRole("button", { name: "Save to library" }).click();
  await expect(page.getByRole("button", { name: "Saved to library" })).toBeDisabled();
  expect(requests).toHaveLength(6);
});

test("moves evidence from PDF annotation through reviewed model prose", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const workspaceId = await createWorkspace(page, "Evidence to prose loop");
  const api = `/api/workspaces/${workspaceId}`;
  const modelRequests: unknown[] = [];
  const decisionRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith(`${api}/candidates/`) && /\/(?:apply|reject)$/u.test(path)) decisionRequests.push(path);
  });
  await page.route("http://127.0.0.1:1234/v1/chat/completions", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
      return;
    }
    const requestBody: unknown = route.request().postDataJSON();
    modelRequests.push(requestBody);
    const providerPrompt = readProviderPrompt(requestBody);
    const content =
      typeof providerPrompt.evidenceRelation === "string"
        ? JSON.stringify({
            text: "Inspectable evidence makes scholarly claims more defensible.",
            note: "Drafted from the selected source annotation.",
          })
        : "Grounded revisions retain a visible path to their evidence :cite[merton1942].";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        choices: [
          {
            message: {
              content,
            },
          },
        ],
      }),
    });
  });

  await page.goto(`/editor/${workspaceId}`);
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible({ timeout: 10_000 });
  await openResearchRail(page);
  const initialSource =
    "## Evidence becomes prose {#sec-evidence}\n\nKirjolab keeps the path from an annotation to a claim and into cited prose visible :cite[merton1942].\n\n## Return to the source {#sec-source}\n\nThe preview resolves a link back to :ref[sec-evidence].\n";
  await page.locator("#source-editor").fill(initialSource);
  await expect(page.locator("#revision-badge")).not.toHaveText("r0");

  await page.locator("#pdf-upload").setInputFiles({
    name: "evidence.pdf",
    mimeType: "application/pdf",
    buffer: createEvidencePdf(),
  });
  await expect(page.locator("#pdf-list")).toContainText("evidence.pdf");

  const editor = page.locator("#source-editor");
  await editor.evaluate((element: HTMLTextAreaElement) => {
    const start = element.value.indexOf("Kirjolab keeps");
    element.focus();
    element.setSelectionRange(start, start + "Kirjolab keeps the path".length);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  });

  await page.locator("#pdf-list button[data-pdf-id]").first().click();
  await expect(page.locator("#context-preview-panel")).toBeHidden();
  await expect(page.locator("#context-pdf-panel")).toBeVisible();
  await expect(page.getByRole("tab", { name: "evidence.pdf" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#paper-status")).toHaveText("Select text to capture evidence");
  await page.locator("#paper-text-layer").evaluate((layer) => {
    const span = layer.querySelector("span");
    if (!span?.firstChild) throw new Error("Expected rendered PDF text");
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    layer.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await expect(page.locator("#annotation-quote")).toHaveValue("Knowledge grows through inspectable evidence.");
  await expect(page.locator("#annotation-selection-status")).toContainText("saved automatically");
  await page.locator("#annotation-comment").fill("Grounding for the revision");
  await page.getByRole("button", { name: "Link highlight to selection" }).click();
  await expect(page.locator("#annotation-list")).toContainText("Knowledge grows through inspectable evidence.");
  await expect.poll(async () => (await readWorkspaceSnapshot(page, api)).links.length).toBeGreaterThan(0);

  const annotationCard = page.locator("#annotation-list article").filter({ hasText: "Knowledge grows" }).first();

  const snapshotAfterLink = await page.request.get(api);
  expect(snapshotAfterLink.ok()).toBe(true);
  const linkedSnapshot: unknown = await snapshotAfterLink.json();
  expect(isWorkspaceSnapshot(linkedSnapshot) ? linkedSnapshot.links.length : 0).toBeGreaterThan(0);

  await openResearchCollection(page, "Claims");
  await page.getByRole("button", { name: "New claim" }).click();
  await page.locator("#claim-text").fill("Inspectable evidence strengthens scholarly claims.");
  await page.locator("#claim-note").fill("Human-authored synthesis");
  await page.locator('#claim-evidence-options input[type="checkbox"]').first().check();
  await page.locator("#claim-dialog").getByRole("button", { name: "Save claim" }).click();
  await expect(page.locator("#claim-list")).toContainText("Inspectable evidence strengthens scholarly claims.");
  await expect(page.locator("#knowledge-connection-list")).toContainText("supports");

  await page
    .locator("#claim-list article")
    .filter({ hasText: "Inspectable evidence strengthens scholarly claims." })
    .first()
    .getByRole("button", { name: "Edit" })
    .click();
  await page.locator("#claim-text").fill("Inspectable evidence keeps scholarly claims accountable.");
  await page.locator("#claim-note").fill("Revised human synthesis");
  await page.locator("#claim-relation").selectOption("extends");
  await page.locator("#claim-dialog").getByRole("button", { name: "Save claim" }).click();
  const claimCard = page.locator("#claim-list article").filter({ hasText: "keeps scholarly claims accountable" }).first();
  await expect(claimCard).toContainText("extends · Grounding for the revision");
  const claimResourceId = await claimCard.getAttribute("data-claim-resource-id");
  if (!claimResourceId) throw new Error("Expected a stable claim resource id");

  await page.getByRole("button", { name: "New claim" }).click();
  await page.locator("#claim-text").fill("UNSELECTED DECOY EVIDENCE MUST STAY LOCAL.");
  await page.locator("#claim-note").fill("This claim must not enter the model request.");
  await page.locator('#claim-evidence-options input[type="checkbox"]').first().check();
  await page.locator("#claim-dialog").getByRole("button", { name: "Save claim" }).click();
  await expect(page.locator("#claim-list")).toContainText("UNSELECTED DECOY EVIDENCE MUST STAY LOCAL.");

  await editor.evaluate((element: HTMLTextAreaElement) => {
    const start = element.value.indexOf("into cited prose");
    element.focus();
    element.setSelectionRange(start, start + "into cited prose".length);
  });
  await claimCard.getByRole("button", { name: "Link selected prose" }).click();
  await expect(claimCard.getByRole("button", { name: "Open linked passage" })).toBeVisible();

  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator("#source-editor-shell")).toBeHidden();
  await expect(page.locator("#project-map")).toBeVisible();
  await expect.poll(async () => page.locator("#project-map-nodes .project-map-node").count()).toBeGreaterThan(4);
  await expect(page.locator("#project-map-nodes .project-map-node").first()).toBeFocused();
  await expect(page.locator("#project-map-nodes")).toContainText("Inspectable evidence keeps scholarly claims accountable.");
  await expect(page.locator("#knowledge-connection-list")).toContainText("supports");
  await expect.poll(async () => page.locator("#project-map-graph .project-map-edge").count()).toBeGreaterThan(0);
  const desktopMap = await readProjectMapGeometry(page);
  expect(desktopMap.contained).toBe(true);
  expect(desktopMap.connectorsAligned).toBe(true);
  expect(desktopMap.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(desktopMap.lanes).toEqual(["Source material", "Evidence & reasoning", "Manuscript"]);
  expect(desktopMap.overlaps).toEqual([]);
  expect(desktopMap.graphVisible).toBe(true);
  expect(desktopMap.viewBoxWidth).toBeCloseTo(desktopMap.canvasWidth, 0);
  expect(desktopMap.viewBoxHeight).toBeCloseTo(desktopMap.canvasHeight, 0);
  const mapClaim = page.locator('.project-map-node[data-kind="claim"]').first();
  await mapClaim.hover();
  await expect(page.locator('#project-map-graph .project-map-edge[data-emphasis="active"]')).not.toHaveCount(0);
  await expect(page.locator('#project-map-nodes .project-map-node[data-emphasis="muted"]')).not.toHaveCount(0);
  await page.mouse.move(0, 0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Authoring", exact: true }).click();
  await expect(page.locator("#project-map")).toBeVisible();
  await expect.poll(async () => (await readProjectMapGeometry(page)).graphVisible).toBe(false);
  const phoneMap = await readProjectMapGeometry(page);
  expect(phoneMap.contained).toBe(true);
  expect(phoneMap.connectorsAligned).toBe(true);
  expect(phoneMap.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(phoneMap.overlaps).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect.poll(async () => (await readProjectMapGeometry(page)).graphVisible).toBe(true);

  await page.locator("#knowledge-search-input").fill("human synthesis accountable");
  await page.locator("#knowledge-search-form").getByRole("button", { name: "Find" }).click();
  await expect(page.locator("#knowledge-search-results")).toContainText("Inspectable evidence keeps scholarly claims accountable.");

  await page.locator("#knowledge-search-input").fill("Grounding revision");
  await page.locator("#knowledge-search-form").getByRole("button", { name: "Find" }).click();
  await expect(page.locator("#knowledge-search-results")).toContainText("Grounding for the revision");
  await expect(page.locator("#knowledge-connection-list")).toContainText("annotates");
  await expect(page.locator("#knowledge-connection-list")).toContainText("used-in");

  const searchResponse = await page.request.get(`${api}/search?q=inspectable%20evidence`);
  const searchResults: unknown = await searchResponse.json();
  expect(searchResponse.ok()).toBe(true);
  expect(isKnowledgeSearchResults(searchResults)).toBe(true);
  const graphResponse = await page.request.get(`${api}/graph`);
  const graph: unknown = await graphResponse.json();
  expect(graphResponse.ok()).toBe(true);
  expect(isWorkspaceKnowledgeGraph(graph)).toBe(true);
  if (!isWorkspaceKnowledgeGraph(graph)) throw new Error("Expected a typed workspace graph");
  expect(graph.nodes).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: "project" }), expect.objectContaining({ kind: "person" })]),
  );
  expect(graph.edges).toEqual(
    expect.arrayContaining([expect.objectContaining({ relation: "contains" }), expect.objectContaining({ relation: "participates-in" })]),
  );

  await page.locator("#knowledge-search-input").fill("");
  await page.locator("#knowledge-search-form").getByRole("button", { name: "Find" }).click();
  await claimCard.getByRole("button", { name: "Open linked passage" }).click();
  await expect(page.locator("#project-map")).toBeHidden();
  await expect(editor).toBeFocused();

  await openResearchCollection(page, "Project evidence");
  await annotationCard.getByRole("button", { name: "Open evidence" }).click();
  await expect(page.locator("#paper-highlights .pdf-highlight[data-focused='true']")).toBeVisible();
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.locator("#context-preview-panel")).toBeVisible();
  await expect(page.locator("#context-pdf-panel")).toBeHidden();
  await page.getByRole("tab", { name: "evidence.pdf" }).click();
  await expect(page.locator("#paper-highlights .pdf-highlight[data-focused='true']")).toBeVisible();
  await annotationCard.getByRole("button", { name: "Open linked passage" }).click();
  await expect(editor).toBeFocused();

  await page.getByRole("checkbox", { name: /Use annotation .*Knowledge grows through inspectable evidence/iu }).check();
  await page.getByRole("checkbox", { name: /Use claim .*keeps scholarly claims accountable/iu }).check();
  await expect(page.getByRole("checkbox", { name: /Use claim .*UNSELECTED DECOY/iu })).not.toBeChecked();
  const selectedPassage = "Kirjolab keeps the path from an annotation to a claim and into cited prose visible :cite[merton1942].";
  await editor.evaluate((element: HTMLTextAreaElement, passage: string) => {
    const start = element.value.indexOf("Kirjolab keeps");
    element.focus();
    element.setSelectionRange(start, start + passage.length);
  }, selectedPassage);
  await openWritingAssistant(page, true);
  await page.locator("#llm-endpoint").fill("http://127.0.0.1:1234/v1/chat/completions");
  await selectLocalModel(page, "test-local-model");
  const sourceBeforeDraft = await editor.inputValue();
  await page.getByRole("button", { name: "Draft revision" }).click();

  await expect(page.locator("#model-status")).toHaveText("Candidate ready. Review its exact replacement and evidence in Context.");
  await expect.poll(() => modelRequests.length).toBe(1);
  const firstPrompt = readProviderPrompt(modelRequests[0]);
  expect(modelRequests[0]).toMatchObject({ reasoning_effort: "none" });
  expect(firstPrompt).toEqual({
    selectedPassage,
    instruction: "Improve clarity while preserving the claim and citation syntax.",
    orderedEvidence: [
      {
        order: 1,
        kind: "annotation",
        id: expect.any(String),
        label: "PDF annotation on page 1",
        content: expect.stringContaining("Knowledge grows through inspectable evidence"),
      },
      {
        order: 2,
        kind: "claim",
        id: expect.any(String),
        label: "Researcher-authored claim",
        content: expect.stringContaining("Inspectable evidence keeps scholarly claims accountable"),
      },
    ],
  });
  expect(JSON.stringify(firstPrompt)).not.toContain("UNSELECTED DECOY");
  expect(JSON.stringify(firstPrompt)).not.toContain("Return to the source");
  await expect(page.locator("#candidate-list")).toContainText("test-local-model · pending");
  await expect(page.locator("#knowledge-connection-list")).toContainText("derived-from");
  const candidateGraphValue: unknown = await (await page.request.get(`${api}/graph`)).json();
  if (!isWorkspaceKnowledgeGraph(candidateGraphValue)) throw new Error("Expected model candidate graph provenance");
  expect(candidateGraphValue.nodes).toContainEqual(expect.objectContaining({ kind: "model-candidate" }));
  expect(candidateGraphValue.edges).toContainEqual(
    expect.objectContaining({ relation: "derived-from", from: expect.stringMatching(/^model-candidate:/u) }),
  );
  await expect(page.locator("#context-candidate-panel")).toBeVisible();
  await expect(page.locator("#context-candidate-before")).toContainText("Kirjolab keeps the path");
  await expect(page.locator("#context-candidate-after")).toHaveText(
    "Grounded revisions retain a visible path to their evidence :cite[merton1942].",
  );
  await expect(page.locator("#context-candidate-evidence")).toContainText("Grounding for the revision");
  await expect(editor).toHaveValue(sourceBeforeDraft);
  await page.getByRole("button", { name: "Reject revision" }).dblclick();
  await expect(page.locator("#context-candidate-status")).toContainText("Rejected");
  await expect(page.getByRole("tab", { name: "Writing assistant" })).toBeFocused();
  await expect(editor).toHaveValue(sourceBeforeDraft);
  expect(decisionRequests.filter((path) => path.endsWith("/reject"))).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Draft revision" })).toBeEnabled();
  await page.getByRole("button", { name: "Draft revision" }).click();
  await expect(page.locator("#model-status")).toHaveText("Candidate ready. Review its exact replacement and evidence in Context.");
  await expect.poll(() => modelRequests.length).toBe(2);
  expect(readProviderPrompt(modelRequests[1])).toEqual(firstPrompt);
  await expect(page.locator("#context-candidate-status")).toContainText("Pending review");
  await expect(editor).toHaveValue(sourceBeforeDraft);
  await page.getByRole("button", { name: "Apply replacement" }).click();
  const expectedAppliedSource = sourceBeforeDraft.replace(
    selectedPassage,
    "Grounded revisions retain a visible path to their evidence :cite[merton1942].",
  );
  await expect(editor).toHaveValue(expectedAppliedSource);
  await expect(page.locator("#preview")).toContainText("Grounded revisions retain a visible path");
  await expect(page.locator("#context-candidate-status")).toContainText("Accepted");

  await page.getByRole("tab", { name: "Writing assistant" }).click();
  await page.locator("#model-operation").selectOption("draft-claim");
  await page.locator("#model-claim-relation").selectOption("extends");
  await page.locator("#model-instruction").fill("Draft one claim about why inspectable evidence matters.");
  await expect(page.getByRole("button", { name: "Draft claim" })).toBeEnabled();
  await page.getByRole("button", { name: "Draft claim" }).click();
  await expect(page.locator("#model-status")).toContainText("Claim draft ready");
  await expect.poll(() => modelRequests.length).toBe(3);
  expect(readProviderPrompt(modelRequests[2])).toEqual({
    instruction: "Draft one claim about why inspectable evidence matters.",
    evidenceRelation: "extends",
    orderedAnnotations: [
      {
        order: 1,
        id: expect.any(String),
        label: "PDF annotation on page 1",
        content: expect.stringContaining("Knowledge grows through inspectable evidence"),
      },
    ],
  });
  await expect(page.locator("#context-candidate-before-label")).toHaveText("Research instruction");
  await expect(page.locator("#context-candidate-after-label")).toHaveText("Proposed claim and note");
  await expect(page.locator("#context-candidate-evidence-heading")).toHaveText("Annotations used for this claim");
  await expect(page.locator("#context-candidate-after")).toContainText("Inspectable evidence makes scholarly claims more defensible.");
  await page.getByRole("button", { name: "Create claim" }).click();
  await expect(page.locator("#context-candidate-status")).toContainText("Accepted");
  await expect(page.locator("#claim-list")).toContainText("Inspectable evidence makes scholarly claims more defensible.");
  const claimDraftSnapshot = await readWorkspaceSnapshot(page, api);
  const draftedClaim = claimDraftSnapshot.claims.find((claim) => claim.text.includes("more defensible"));
  expect(draftedClaim).toBeDefined();
  expect(claimDraftSnapshot.claimEvidenceLinks).toContainEqual(expect.objectContaining({ claimId: draftedClaim?.id, relation: "extends" }));

  await page.getByRole("tab", { name: "Writing assistant" }).click();
  await page
    .locator("#candidate-list article")
    .filter({ hasText: "Kirjolab keeps the path" })
    .first()
    .getByRole("button", { name: "Open review" })
    .click();

  page.once("dialog", (dialog) => void dialog.accept());
  await claimCard.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(`[data-claim-resource-id="${claimResourceId}"]`)).toHaveCount(0);
  await expect(page.locator("#annotation-list")).toContainText("Grounding for the revision");
  await expect(page.locator("#context-candidate-evidence")).toContainText("keeps scholarly claims accountable");

  const currentSnapshot: unknown = await (await page.request.get(api)).json();
  if (!isWorkspaceSnapshot(currentSnapshot)) throw new Error("Expected a workspace snapshot");
  const staleEvidence = currentSnapshot.annotations[0];
  if (!staleEvidence) throw new Error("Expected model evidence for the stale candidate");
  const staleExcerpt = "## Evidence becomes prose {#sec-evidence}";
  const staleStart = currentSnapshot.source.indexOf(staleExcerpt);
  const staleCandidateResponse = await page.request.post(`${api}/candidates`, {
    headers: { origin: "http://127.0.0.1:8788" },
    data: {
      providerAdapter: "openai-compatible",
      providerLabel: "Browser-local test provider",
      model: "stale-model",
      promptVersion: "revise-selection-v1",
      instruction: "Propose a stale replacement.",
      target: {
        fileId: currentSnapshot.entryFileId,
        start: staleStart,
        end: staleStart + staleExcerpt.length,
        excerpt: staleExcerpt,
        sourceRevision: currentSnapshot.revision,
      },
      evidence: [{ kind: "annotation", id: staleEvidence.id, version: staleEvidence.updatedAt }],
      proposedReplacement: "## This candidate must not apply",
    },
  });
  expect(staleCandidateResponse.ok()).toBe(true);
  const staleCandidate: unknown = await staleCandidateResponse.json();
  if (!isRecord(staleCandidate) || typeof staleCandidate.id !== "string") throw new Error("Expected a model candidate");
  await page.reload();
  await expect(page.getByText(/Live · \d+ writer/)).toBeVisible();
  await openWritingAssistant(page);
  const staleCard = page.locator("#candidate-list article").filter({ hasText: "stale-model · pending" }).first();
  await staleCard.getByRole("button", { name: "Open review" }).click();
  await expect(page.locator("#context-candidate-status")).toContainText("Pending review");
  const sourceBeforeStaleEdit = await editor.inputValue();
  const sourceAfterStaleEdit = `${sourceBeforeStaleEdit}\nA newer writer edit.\n`;
  await editor.fill(sourceAfterStaleEdit);
  await expect
    .poll(async () => {
      const value: unknown = await (await page.request.get(api)).json();
      return isWorkspaceSnapshot(value) ? value.revision : -1;
    })
    .toBeGreaterThan(currentSnapshot.revision);
  await expect(page.locator("#context-candidate-status")).toContainText("Pending but stale");
  await expect(page.getByRole("button", { name: "Apply replacement" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reject revision" })).toBeEnabled();
  await page.getByRole("button", { name: "Reject revision" }).click();
  await expect(page.locator("#context-candidate-status")).toContainText("Rejected");
  await expect(editor).toHaveValue(sourceAfterStaleEdit);

  const bibliography = await page.request.get(`${api}/export/bibliography.bib`);
  expect(bibliography.ok()).toBe(true);
  expect(await bibliography.text()).toContain("@article{merton1942");
});

test("keeps protocol criteria stable through final review inclusion", async ({ page }) => {
  const reviewId = await createReview(page, "Stable review decisions", "slr");
  const api = `/api/reviews/${reviewId}`;

  await page.goto(`/review/${reviewId}`);
  await expect(page.locator("#review-protocol-status")).toContainText("Protocol revision");
  await page.locator("#review-objective").fill("Establish whether explicit workflow gates improve evidence review traceability.");
  await page.locator("#review-questions").fill("How do explicit workflow gates affect traceability?");
  await page.locator("#review-concepts").fill("Workflow :: workflow gate; staged review\nOutcome :: traceability; provenance");
  await page.locator("#review-sources").fill("Evidence index | https://evidence.example | generic | all-fields | manual-search | formal |");
  await page.locator("#review-inclusion-criteria").fill("Reports an empirical review workflow | title-abstract; full-text");
  await page.locator("#review-exclusion-criteria").fill("Does not report review outcomes | title-abstract; full-text");
  await page.locator("#review-extraction-fields").fill("Finding | text | | RQ1 | required | single |");
  await page.getByRole("button", { name: "Save protocol" }).click();
  await expect(page.locator("#review-protocol-status")).toHaveText("Protocol saved.");

  const draftValue: unknown = await (await page.request.get(`${api}/review-study`)).json();
  if (!isRecord(draftValue) || !isRecord(draftValue.protocol) || !Array.isArray(draftValue.protocol.eligibilityCriteria)) {
    throw new Error("Expected saved eligibility criteria");
  }
  const draftCriteria = new Map(
    draftValue.protocol.eligibilityCriteria.map((criterion) => {
      if (!isRecord(criterion) || typeof criterion.id !== "string" || typeof criterion.text !== "string") {
        throw new Error("Expected a structured eligibility criterion");
      }
      return [criterion.text, criterion.id] as const;
    }),
  );
  const inclusionCriterionId = draftCriteria.get("Reports an empirical review workflow");
  if (!inclusionCriterionId) throw new Error("Expected the inclusion criterion id");

  await page.locator("#freeze-review-protocol").click();
  await expect(page.locator("#review-protocol-status")).toHaveText("Protocol frozen. Future changes will be recorded as amendments.");
  await expect(page.locator("#review-protocol-state")).toContainText("Frozen");
  await expect(page.locator("#review-step-search")).toBeEnabled();

  const frozenValue: unknown = await (await page.request.get(`${api}/review-study`)).json();
  if (!isRecord(frozenValue) || !isRecord(frozenValue.protocol) || !Array.isArray(frozenValue.protocol.eligibilityCriteria)) {
    throw new Error("Expected frozen eligibility criteria");
  }
  const frozenCriteria = new Map(
    frozenValue.protocol.eligibilityCriteria.map((criterion) => {
      if (!isRecord(criterion) || typeof criterion.id !== "string" || typeof criterion.text !== "string") {
        throw new Error("Expected a frozen structured criterion");
      }
      return [criterion.text, criterion.id] as const;
    }),
  );
  expect(frozenCriteria).toEqual(draftCriteria);

  await page.locator("#review-step-search").click();
  await expect(page.locator("#review-search-content")).toBeVisible();
  await page.locator("#review-reported-result-count").fill("1");
  await page.locator("#review-search-bibtex").fill(`@article{workflow2026,
  title = {Explicit workflow gates preserve review traceability},
  author = {Doe, Jane},
  year = {2026},
  journal = {Journal of Evidence Workflows},
  abstract = {An empirical study of staged screening and auditable evidence review.},
  doi = {10.5555/workflow.2026}
}`);
  await page.locator("#preview-review-import").click();
  await expect(page.locator("#review-import-status")).toContainText("Preview ready");
  await expect(page.locator("#confirm-review-import")).toBeEnabled();
  await page.locator("#confirm-review-import").click();
  await expect(page.locator("#review-import-status")).toHaveText("Immutable search run recorded.");
  await expect(page.locator("#review-search-counts")).toContainText("1 unique");
  await expect(page.locator("#review-step-screen")).toBeEnabled();

  await page.locator("#review-step-screen").click();
  const recordCard = page.locator("#review-screen-list .review-screen-card").filter({
    hasText: "Explicit workflow gates preserve review traceability",
  });
  await expect(recordCard).toBeVisible();
  await expect(page.locator("#review-step-appraise")).toBeDisabled();
  await expect(page.locator("#review-step-extract")).toBeDisabled();

  let decisionForm = recordCard.locator("form.review-screen-form").first();
  await decisionForm.locator('select[name="decision"]').selectOption("include");
  await decisionForm.locator('select[name="criterionId"]').selectOption(inclusionCriterionId);
  await decisionForm.locator('input[name="reason"]').fill("The title and abstract describe an empirical workflow study.");
  await decisionForm.getByRole("button", { name: "Record decision" }).click();
  await expect(page.locator("#review-screen-status")).toHaveText("Screening decision recorded.");
  await expect(recordCard.locator(".count-badge")).toHaveText("include");

  await page.locator("#review-screen-stage").selectOption("full-text");
  await expect(recordCard).toBeVisible();
  decisionForm = recordCard.locator("form.review-screen-form").first();
  await decisionForm.locator('select[name="decision"]').selectOption("include");
  await decisionForm.locator('select[name="criterionId"]').selectOption(inclusionCriterionId);
  await decisionForm.locator('input[name="reason"]').fill("The full text reports the staged review outcomes.");
  await decisionForm.getByRole("button", { name: "Record decision" }).click();
  await expect(page.locator("#review-screen-status")).toHaveText("Screening decision recorded.");
  await expect(page.locator("#review-step-appraise")).toBeDisabled();
  await expect(page.locator("#review-step-extract")).toBeDisabled();

  const finalForm = recordCard.locator("form.review-screen-form").filter({ hasText: "Final inclusion" });
  await finalForm.locator('select[name="outcome"]').selectOption("include");
  await finalForm.locator('input[name="reason"]').fill("The eligible study enters the synthesis corpus.");
  await finalForm.getByRole("button", { name: "Record final inclusion" }).click();
  await expect(page.locator("#review-screen-status")).toHaveText("Final inclusion recorded separately from full-text eligibility.");
  await expect(page.locator("#review-step-appraise")).toBeEnabled();
  await expect(page.locator("#review-step-extract")).toBeEnabled();

  const screeningValue: unknown = await (await page.request.get(`${api}/review-study/screening`)).json();
  if (!isRecord(screeningValue) || !Array.isArray(screeningValue.records) || !isRecord(screeningValue.records[0])) {
    throw new Error("Expected the screened review record");
  }
  const screenedRecord = screeningValue.records[0];
  if (!isRecord(screenedRecord.titleAbstract) || !isRecord(screenedRecord.fullText) || !isRecord(screenedRecord.finalInclusion)) {
    throw new Error("Expected staged and final screening state");
  }
  expect(screenedRecord.titleAbstract.decisions).toEqual(
    expect.arrayContaining([expect.objectContaining({ criterionId: inclusionCriterionId })]),
  );
  expect(screenedRecord.fullText.decisions).toEqual(
    expect.arrayContaining([expect.objectContaining({ criterionId: inclusionCriterionId })]),
  );
  expect(screenedRecord.finalInclusion).toMatchObject({ outcome: "include" });

  await page.locator("#review-step-appraise").click();
  await expect(page.locator("#review-appraise-content")).toBeVisible();
  await expect(page.locator("#review-appraise-list")).toContainText("Explicit workflow gates preserve review traceability");
  await page.locator("#review-step-extract").click();
  await expect(page.locator("#review-extract-content")).toBeVisible();
  await expect(page.locator("#review-extract-list")).toContainText("Finding");
});

test("serves stable health and browser assets", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    name: "kirjolab",
    routes: [
      "/",
      "/library",
      "/library/pdfs/:id",
      "/editor",
      "/editor/:id",
      "/review",
      "/review/:id",
      "/workspaces/:id",
      "/share/:token",
      "/edit/:token",
      "/api/workspaces",
      "/api/workspaces/demo",
      "/api/reviews",
      "/api/reviews/:id",
      "/api/session",
      "/api/health",
    ],
  });

  const [styles, client, serviceWorker] = await Promise.all([
    request.get("/styles.css"),
    request.get("/app.js"),
    request.get("/service-worker.js"),
  ]);
  const [stylesBody, clientBody, serviceWorkerBody] = await Promise.all([styles.text(), client.text(), serviceWorker.text()]);
  expect(styles.ok(), stylesBody).toBe(true);
  expect(client.ok(), clientBody).toBe(true);
  expect(serviceWorker.ok(), serviceWorkerBody).toBe(true);
  expect(styles.headers()["content-type"]).toContain("text/css");
  expect(client.headers()["content-type"]).toContain("text/javascript");

  const pdfRuntimePath = clientBody.match(/\/pdfjs-module-[a-f0-9]{16}\.js/u)?.[0];
  const markdownRuntimePath = clientBody.match(/\/markdown-module-[a-f0-9]{16}\.js/u)?.[0];
  const offlineCacheName = serviceWorkerBody.match(/kirjolab-offline-shell-[a-f0-9]{16}/u)?.[0];
  expect(pdfRuntimePath).toBeTruthy();
  expect(markdownRuntimePath).toBeTruthy();
  expect(offlineCacheName).toBeTruthy();
  expect(clientBody).toContain(offlineCacheName);
  expect(serviceWorkerBody).toContain(markdownRuntimePath);

  const pdfRuntime = await request.get(pdfRuntimePath!);
  expect(pdfRuntime.ok()).toBe(true);
  expect(pdfRuntime.headers()["content-type"]).toContain("javascript");
  expect(pdfRuntime.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");

  const markdownRuntime = await request.get(markdownRuntimePath!);
  expect(markdownRuntime.ok()).toBe(true);
  expect(markdownRuntime.headers()["content-type"]).toContain("javascript");
  expect(markdownRuntime.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readProviderPrompt(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || !Array.isArray(value.messages)) throw new Error("Expected an OpenAI-compatible request");
  const userMessage = value.messages.find((message) => isRecord(message) && message.role === "user");
  if (!isRecord(userMessage) || typeof userMessage.content !== "string") throw new Error("Expected a provider user message");
  const prompt: unknown = JSON.parse(userMessage.content);
  if (!isRecord(prompt)) throw new Error("Expected a structured provider prompt");
  return prompt;
}

async function createWorkspace(page: Page, title: string): Promise<string> {
  const response = await page.request.post("/api/workspaces", {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { title },
  });
  expect(response.status()).toBe(201);
  const workspace: unknown = await response.json();
  if (!isRecord(workspace) || typeof workspace.id !== "string") throw new Error("Expected a created workspace");
  return workspace.id;
}

async function createReview(page: Page, title: string, profile: "slr" | "mlr"): Promise<string> {
  const response = await page.request.post("/api/reviews", {
    headers: { origin: "http://127.0.0.1:8788" },
    data: { title, profile },
  });
  expect(response.status()).toBe(201);
  const review: unknown = await response.json();
  if (!isRecord(review) || typeof review.id !== "string") throw new Error("Expected a created review");
  return review.id;
}

async function readWorkspaceSnapshot(page: Page, api: string) {
  const response = await page.request.get(api);
  expect(response.ok()).toBe(true);
  const value: unknown = await response.json();
  if (!isWorkspaceSnapshot(value)) throw new Error("Expected a workspace snapshot");
  return value;
}

interface ExpectedPassageAnchor {
  exact: string;
  originalRange: { start: number; end: number };
  anchoredRevision: number;
}

function expectPassageAnchor(link: unknown, expected: ExpectedPassageAnchor): void {
  if (!isRecord(link) || !isRecord(link.anchor)) throw new Error("Expected a passage anchor selector");
  expect(link.anchor).toMatchObject({ version: 1, ...expected });
  expect(link.anchor.relativeStart).toMatch(/^[A-Za-z0-9_-]+$/u);
  expect(link.anchor.relativeEnd).toMatch(/^[A-Za-z0-9_-]+$/u);
}

function readPassageResolution(link: unknown): Record<string, unknown> {
  if (!isRecord(link) || !isRecord(link.resolution)) throw new Error("Expected a passage anchor resolution");
  return link.resolution;
}

function expectResolvedPassage(link: unknown, start: number, text: string): void {
  expect(readPassageResolution(link)).toMatchObject({
    status: "resolved",
    start,
    end: start + text.length,
    text,
    exactMatch: true,
  });
}

async function expectEditorSelection(editor: Locator, start: number, text: string): Promise<void> {
  await expect
    .poll(
      async () =>
        await editor.evaluate((element: HTMLTextAreaElement) => ({
          start: element.selectionStart,
          end: element.selectionEnd,
          text: element.value.slice(element.selectionStart, element.selectionEnd),
        })),
    )
    .toEqual({ start, end: start + text.length, text });
}

async function expectCollaboratorCaretAligned(caretLocator: Locator): Promise<void> {
  await expect(caretLocator).toHaveCount(1);
  const geometry = await caretLocator.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    const line = element.parentElement!;
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let adjacentText: Text | null = null;
    while (walker.nextNode()) {
      const text = walker.currentNode as Text;
      if (text.length > 0 && element.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING) {
        adjacentText = text;
        break;
      }
    }
    if (!adjacentText) throw new Error("Expected rendered text after collaborator caret");
    const glyphRange = document.createRange();
    glyphRange.setStart(adjacentText, 0);
    glyphRange.setEnd(adjacentText, 1);
    const caret = element.getBoundingClientRect();
    const glyph = glyphRange.getBoundingClientRect();
    return {
      visible: parseFloat(style.height) > 14 && style.width === "2px" && style.backgroundColor !== "rgba(0, 0, 0, 0)",
      caret: { top: caret.top, bottom: caret.bottom },
      glyph: { top: glyph.top, bottom: glyph.bottom },
    };
  });
  expect(geometry.visible).toBe(true);
  expect(Math.abs(geometry.caret.top - geometry.glyph.top)).toBeLessThanOrEqual(3);
  expect(Math.abs(geometry.caret.bottom - geometry.glyph.bottom)).toBeLessThanOrEqual(3);
}

async function openResearchCollection(page: Page, name: string): Promise<void> {
  await openResearchRail(page);
  const collection = page.locator(".rail-collection").filter({ has: page.getByText(name, { exact: true }) });
  await collection.evaluate((element: HTMLDetailsElement) => {
    element.open = true;
  });
  if (name === "Project evidence") {
    await collection.locator(".project-evidence-highlights").evaluateAll((elements: HTMLDetailsElement[]) => {
      for (const element of elements) element.open = true;
    });
  }
}

async function openLibraryReferenceDetails(reference: Locator): Promise<void> {
  const details = reference.locator(".library-reference-details");
  if (!(await details.evaluate((element: HTMLDetailsElement) => element.open))) {
    await reference.getByText("Details", { exact: true }).click();
  }
}

async function openResearchRail(page: Page): Promise<void> {
  const tab = page.getByRole("tab", { name: "Research" });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  await expect(page.locator("#research-rail-panel")).toBeVisible();
}

async function openWritingAssistant(page: Page, includeSettings = false): Promise<void> {
  await page.getByRole("tab", { name: "Writing assistant" }).click();
  await expect(page.locator("#context-assistant-panel")).toBeVisible();
  if (includeSettings) {
    await page.locator("#open-preferences-from-assistant").click();
    await expect(page.locator("#preferences-menu")).toHaveAttribute("open", "");
  }
}
