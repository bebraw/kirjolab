import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { isPdfDraftResult, type PdfDraftResult } from "../../domain/reference-library";
import { createEvidencePdf } from "../../test-support/pdf-fixture";

async function uploadPaper(context: BrowserContext, origin: string): Promise<PdfDraftResult> {
  await context.setExtraHTTPHeaders({ "x-kirjolab-local-user": `pdf-layout-${crypto.randomUUID()}@example.com` });
  const upload = await context.request.post("/api/library/pdfs", {
    headers: { origin, "content-type": "application/pdf", "x-file-name": "layout.pdf" },
    data: createEvidencePdf(),
  });
  expect(upload.ok()).toBe(true);
  const draft: unknown = await upload.json();
  if (!isPdfDraftResult(draft)) throw new Error("Expected uploaded PDF draft");
  return draft;
}

async function openPaper(page: Page, draft: PdfDraftResult): Promise<void> {
  await page.goto(`/library/pdfs/${draft.artifact.id}`);
  await expect(page.locator("#paper-text-layer")).toContainText("Knowledge grows through inspectable evidence.");
}

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
      expect(inspectorBounds.y).toBeGreaterThanOrEqual(restoreBounds.y + restoreBounds.height);
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
      const pageBounds = await page.locator("#paper-page").boundingBox();
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
