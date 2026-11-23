import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { isPdfDraftResult, type PdfDraftResult } from "../../domain/reference-library";
import { createEvidencePdf, createReferenceEvidencePdf, createTwoPageEvidencePdf } from "../../test-support/pdf-fixture";

async function uploadPaper(context: BrowserContext, origin: string, data = createEvidencePdf()): Promise<PdfDraftResult> {
  await context.setExtraHTTPHeaders({ "x-kirjolab-local-user": `pdf-layout-${crypto.randomUUID()}@example.com` });
  const upload = await context.request.post("/api/library/pdfs", {
    headers: { origin, "content-type": "application/pdf", "x-file-name": "layout.pdf" },
    data,
  });
  expect(upload.ok()).toBe(true);
  const draft: unknown = await upload.json();
  if (!isPdfDraftResult(draft)) throw new Error("Expected uploaded PDF draft");
  return draft;
}

async function openPaper(page: Page, draft: PdfDraftResult): Promise<void> {
  await page.goto(`/library/pdfs/${draft.artifact.id}`);
  await expect(page.locator(".pdfViewer .textLayer")).toContainText("Knowledge grows through inspectable evidence.");
}

test.describe("PDF pinch zoom", () => {
  test.use({ hasTouch: true });

  test("zooms in and out in Select mode in continuous view", async ({ page, context, baseURL }) => {
    if (!baseURL) throw new Error("Expected browser test origin");
    const draft = await uploadPaper(context, baseURL);
    await openPaper(page, draft);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await page.locator("#library-pdf-view-options").click();
    await page.locator("#toggle-library-paper-continuous").click();

    const pdfPage = page.locator('.pdfViewer .page[data-page-number="1"]');
    const pageWidth = () => pdfPage.evaluate((element) => element.getBoundingClientRect().width);
    await expect.poll(pageWidth).toBeGreaterThan(0);
    const fittedWidth = await pageWidth();
    const reader = page.locator("#paper-reader");
    const bounds = await reader.boundingBox();
    if (!bounds) throw new Error("Expected a visible PDF reader");
    const x = Math.round(bounds.x + bounds.width / 2);
    const y = Math.round(bounds.y + bounds.height / 3);
    const input = await context.newCDPSession(page);

    await input.send("Input.synthesizePinchGesture", { x, y, scaleFactor: 1.5, gestureSourceType: "touch" });
    await expect.poll(pageWidth).toBeGreaterThan(fittedWidth);

    const zoomedWidth = await pageWidth();
    await input.send("Input.synthesizePinchGesture", { x, y, scaleFactor: 0.8, gestureSourceType: "mouse" });
    await expect
      .poll(async () => {
        const width = await pageWidth();
        return width > fittedWidth && width < zoomedWidth;
      })
      .toBe(true);
    await expect(reader).toHaveAttribute("data-display-mode", "continuous");
    await expect(page.getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("keeps a scrolled PDF page painted and anchored through pinch zoom", async ({ page, context, baseURL }) => {
    if (!baseURL) throw new Error("Expected browser test origin");
    const draft = await uploadPaper(context, baseURL, createTwoPageEvidencePdf());
    await page.goto(`/library/pdfs/${draft.artifact.id}`);
    await expect(page.locator(".pdfViewer .textLayer")).toContainText("First page keeps its reading position.");
    await page.locator("#library-pdf-view-options").click();
    await page.locator("#toggle-library-paper-continuous").click();
    await page.getByRole("button", { name: "Next PDF page" }).click();
    await expect(page.locator("#library-paper-page-indicator")).toHaveText("2 / 2");

    const pdfPage = page.locator('.pdfViewer .page[data-page-number="2"]');
    const canvas = pdfPage.locator("canvas[role=presentation]");
    const width = () => pdfPage.evaluate((element) => element.getBoundingClientRect().width);
    await expect
      .poll(() =>
        canvas.evaluate((element) => {
          if (element instanceof HTMLCanvasElement && element.width > 0) return element.getContext("2d")?.getImageData(0, 0, 1, 1).data[3];
        }),
      )
      .toBe(255);
    const fitted = await width();
    const before = await pdfPage.boundingBox();
    if (!before) throw new Error("Expected the second PDF page");
    const x = Math.round(before.x + before.width * 0.42);
    const y = Math.round(before.y + 280);
    const pageFraction = (y - before.y) / before.height;
    const input = await context.newCDPSession(page);
    const [{ maximumDrift, blankFrame, framesAfterRender }] = await Promise.all([
      pdfPage.evaluate(
        (element, { fitted, pageFraction, y }) =>
          new Promise<{ maximumDrift: number; blankFrame: boolean; framesAfterRender: number }>((resolve) => {
            const startedAt = performance.now();
            const initialCanvas = element.querySelector('canvas[role="presentation"]');
            let maximumDrift = 0;
            let blankFrame = false;
            let framesAfterRender = 0;
            function measure(now: number): void {
              const rect = element.getBoundingClientRect();
              maximumDrift = Math.max(maximumDrift, Math.abs(rect.top + pageFraction * rect.height - y));
              const canvas = element.querySelector("canvas");
              const canvasWidth = canvas?.width ?? 0;
              if (!canvasWidth || canvas?.getContext("2d")?.getImageData(0, 0, 1, 1).data[3] !== 255) blankFrame = true;
              const repainted = canvas !== initialCanvas || element.querySelector("canvas[aria-hidden=true]");
              if (rect.width > fitted && repainted) framesAfterRender += 1;
              if (framesAfterRender >= 5 || now - startedAt > 5_000) resolve({ maximumDrift, blankFrame, framesAfterRender });
              else requestAnimationFrame(measure);
            }
            requestAnimationFrame(measure);
          }),
        { fitted, pageFraction, y },
      ),
      input.send("Input.synthesizePinchGesture", { x, y, scaleFactor: 1.5, gestureSourceType: "mouse" }),
    ]);

    await expect.poll(width).toBeGreaterThan(fitted);
    expect(framesAfterRender).toBeGreaterThanOrEqual(5);
    expect(blankFrame).toBe(false);
    expect(maximumDrift).toBeLessThan(2);
    await expect(page.locator("#library-paper-page-indicator")).toHaveText("2 / 2");
  });
});

test("fits the page without leaving the two-page layout", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Expected browser test origin");
  const draft = await uploadPaper(context, baseURL, createTwoPageEvidencePdf());
  await page.goto(`/library/pdfs/${draft.artifact.id}`);
  await expect(page.locator(".pdfViewer .textLayer")).toContainText("First page keeps its reading position.");
  const menu = page.getByRole("button", { name: "View options", exact: true });
  await menu.click();
  await page.locator("#library-pdf-spread").click();
  await expect(page.locator("#paper-reader")).toHaveAttribute("data-display-mode", "spread");
  if ((await menu.getAttribute("aria-expanded")) !== "true") await menu.click();
  await page.locator("#library-pdf-fit-mode").click();
  await expect(page.locator("#paper-reader")).toHaveAttribute("data-display-mode", "spread");
  await expect(page.locator("#library-pdf-spread")).toHaveAttribute("aria-pressed", "true");
});

test("activates the touched spread page without moving the paper under the pointer", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Expected browser test origin");
  const draft = await uploadPaper(context, baseURL, createReferenceEvidencePdf([["Cover"], ["Left page"], ["Right page"]]));
  await page.goto(`/library/pdfs/${draft.artifact.id}`);
  const menu = page.getByRole("button", { name: "View options", exact: true });
  await menu.click();
  await page.locator("#library-pdf-spread").click();
  await page.getByRole("button", { name: "Next PDF page" }).click();
  const reader = page.locator("#paper-reader");
  const right = reader.locator('.page[data-page-number="3"] .textLayer');
  await expect(right).toContainText("Right page");
  const top = await reader.evaluate((el) => el.scrollTop);
  await right.dispatchEvent("pointerdown", { bubbles: true, pointerType: "pen" });
  await expect(page.locator("#library-paper-page-indicator")).toHaveText("3 / 3");
  expect(await reader.evaluate((el) => el.scrollTop)).toBe(top);
  if ((await menu.getAttribute("aria-expanded")) !== "true") await menu.click();
  await page.locator("#library-pdf-spread").click();
  await expect(reader.locator(".page")).toHaveCount(1);
  await expect(reader.locator(".textLayer")).toContainText("Right page");
});

test("applies a tool chosen in single-page view to previously rendered spread pages", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Expected browser test origin");
  const draft = await uploadPaper(context, baseURL, createReferenceEvidencePdf([["Cover"], ["Left page"], ["Right page"]]));
  await page.goto(`/library/pdfs/${draft.artifact.id}`);
  const menu = page.getByRole("button", { name: "View options", exact: true });
  async function toggleSpread(): Promise<void> {
    if ((await menu.getAttribute("aria-expanded")) !== "true") await menu.click();
    await page.locator("#library-pdf-spread").click();
  }
  await toggleSpread();
  await page.getByRole("button", { name: "Next PDF page" }).click();
  const left = page.locator('.page[data-page-number="2"] .pdf-markups');
  const right = page.locator('.page[data-page-number="3"] .pdf-markups');
  await expect(left).toHaveAttribute("data-tool", "select");
  await expect(right).toBeVisible();
  await right.dispatchEvent("pointerdown", { bubbles: true, pointerType: "pen" });
  await toggleSpread();
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  await toggleSpread();
  await expect(left).toHaveAttribute("data-tool", "draw");
  await expect(right).toHaveAttribute("data-tool", "draw");
});

test("keeps a saved quotation aligned with its text across layouts and zoom", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Expected browser test origin");
  const draft = await uploadPaper(context, baseURL);
  await openPaper(page, draft);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const text = page.locator(".pdfViewer .textLayer span").filter({ hasText: "Knowledge grows through inspectable evidence." }).first();
  await text.evaluate((span) => {
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    span.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await page.locator("#library-highlight-form").getByRole("button", { name: "Save", exact: true }).click();
  const highlight = page.locator(".pdfViewer .pdf-highlight[data-private='true']").first();
  await expect(highlight).toBeVisible();
  await page.getByRole("button", { name: "Close annotation inspector" }).click();
  await page.getByRole("button", { name: "View options", exact: true }).click();
  await page.locator("#toggle-library-paper-continuous").click();
  await expect(highlight).toBeVisible();
  await page.getByRole("button", { name: "View options", exact: true }).click();
  const pageWidth = () => page.locator(".pdfViewer .page").evaluate((element) => element.getBoundingClientRect().width);
  const before = await pageWidth();
  await page.locator("#library-pdf-zoom-in").click();
  await expect.poll(pageWidth).toBeGreaterThan(before);
  await expect
    .poll(async () => {
      const mark = await highlight.boundingBox();
      const quote = await text.boundingBox();
      if (!mark || !quote) return false;
      const centerY = quote.y + quote.height / 2;
      return mark.y <= centerY && centerY <= mark.y + mark.height && Math.abs(mark.x - quote.x) < 3;
    })
    .toBe(true);
});

test("keeps PDF view options open while stepping zoom", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Expected browser test origin");
  const draft = await uploadPaper(context, baseURL);
  await openPaper(page, draft);

  const pageWidth = () => page.locator(".pdfViewer .page").evaluate((element) => element.getBoundingClientRect().width);
  const fittedWidth = await pageWidth();
  const viewOptions = page.getByRole("button", { name: "View options", exact: true });
  const panel = page.getByRole("group", { name: "PDF view options" });
  await viewOptions.click();
  await panel.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(pageWidth).toBeGreaterThan(fittedWidth);
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect.poll(pageWidth).toBe(fittedWidth);
  await expect(panel).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(viewOptions).toBeFocused();
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 640 },
  { width: 390, height: 844 },
]) {
  test.describe(`private PDF overlays at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("keeps hidden-navigation restore and annotation inspector controls separate", async ({ page, context, baseURL }) => {
      if (!baseURL) throw new Error("Expected browser test origin");
      const draft = await uploadPaper(context, baseURL);
      await openPaper(page, draft);
      await page.getByRole("button", { name: "Hide top navigation" }).click();
      await page.getByRole("button", { name: "Annotations", exact: true }).click();
      const inspector = page.getByRole("complementary", { name: "PDF annotation inspector" });
      const restore = page.getByRole("button", { name: "Show top navigation" });
      await expect(inspector).toBeVisible();
      const inspectorBounds = await inspector.boundingBox();
      const restoreBounds = await restore.boundingBox();
      if (!inspectorBounds || !restoreBounds) throw new Error("Expected visible inspector and navigation restore");
      expect(restoreBounds.x + restoreBounds.width).toBeLessThanOrEqual(inspectorBounds.x);
      await expect(page.locator(".library-pdf-page-rail [data-preview-navigation-restore]")).toBeVisible();
      const next = await page.getByRole("button", { name: "Next PDF page" }).boundingBox();
      if (!next) throw new Error("Expected visible PDF page navigation");
      expect(restoreBounds.y + restoreBounds.height).toBeLessThanOrEqual(next.y);
      expect(inspectorBounds.y + inspectorBounds.height).toBeLessThanOrEqual(viewport.height);
      await page.getByRole("button", { name: "Close annotation inspector" }).click();
      await expect(inspector).toBeHidden();
      await restore.click();
      await expect(page.locator("#app-header")).toBeVisible();
    });

    test("keeps a right-edge note and its full close target inside the PDF page", async ({ page, context, baseURL }) => {
      if (!baseURL) throw new Error("Expected browser test origin");
      const draft = await uploadPaper(context, baseURL);
      const note = await context.request.post(`/api/library/references/${draft.reference.id}/pdf-markups`, {
        headers: { origin: baseURL },
        data: { kind: "note", artifactId: draft.artifact.id, page: 1, x: 0.95, y: 0.25, body: "Edge note" },
      });
      expect(note.ok()).toBe(true);
      await openPaper(page, draft);
      const pin = page.getByRole("button", { name: "Open note on page 1" });
      await pin.click();
      await page.getByRole("button", { name: "Close annotation inspector" }).click();
      const card = page.getByRole("complementary", { name: "Note on page 1", exact: true });
      await expect(card).toContainText("Edge note");
      const close = page.getByRole("button", { name: "Close note on page 1" });
      const pageBounds = await page.locator(".pdfViewer .page").boundingBox();
      const cardBounds = await card.boundingBox();
      const closeBounds = await close.boundingBox();
      if (!pageBounds || !cardBounds || !closeBounds) throw new Error("Expected visible note and PDF page");
      expect(cardBounds.x).toBeGreaterThanOrEqual(pageBounds.x);
      expect(cardBounds.x + cardBounds.width).toBeLessThanOrEqual(pageBounds.x + pageBounds.width);
      expect(closeBounds.x + closeBounds.width).toBeLessThanOrEqual(cardBounds.x + cardBounds.width);
      expect(closeBounds.y + closeBounds.height).toBeLessThanOrEqual(cardBounds.y + cardBounds.height);
      await close.click();
      await expect(card).toHaveCount(0);
      await expect(pin).toBeFocused();
    });
  });
}
