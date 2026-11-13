import { expect, test, type APIRequestContext } from "@playwright/test";
import { isPdfDraftResult, type PdfDraftResult } from "../../domain/reference-library";
import { createEvidencePdf } from "../../test-support/pdf-fixture";

async function uploadPaper(request: APIRequestContext, origin: string, filename: string, title: string): Promise<PdfDraftResult> {
  const upload = await request.post("/api/library/pdfs", {
    headers: { origin, "content-type": "application/pdf", "x-file-name": filename },
    data: createEvidencePdf(`Evidence from ${filename}.`),
  });
  expect(upload.ok()).toBe(true);
  const draft: unknown = await upload.json();
  if (!isPdfDraftResult(draft)) throw new Error("Expected uploaded PDF draft");
  await saveTitle(request, origin, draft.reference.id, title);
  return draft;
}

async function saveTitle(request: APIRequestContext, origin: string, referenceId: string, title: string): Promise<void> {
  const response = await request.patch(`/api/library/references/${referenceId}`, {
    headers: { origin },
    data: { type: "article", title, authors: ["Researcher, Ada"], year: "2026", venue: "", doi: "", url: "", abstract: "" },
  });
  expect(response.ok()).toBe(true);
}

test("distinguishes standalone article tabs and keeps titles current after returning to the Library", async ({
  page,
  context,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Expected browser test origin");
  await context.setExtraHTTPHeaders({ "x-kirjolab-local-user": `pdf-titles-${crypto.randomUUID()}@example.com` });
  const first = await uploadPaper(context.request, baseURL, "first-paper.pdf", "Evidence \\& {reproducibility}");
  const second = await uploadPaper(context.request, baseURL, "second-paper.pdf", "Independent methods");
  const other = await context.newPage();
  const firstRoute = `/library/pdfs/${first.artifact.id}`;
  const secondRoute = `/library/pdfs/${second.artifact.id}`;

  await page.goto(firstRoute);
  await other.goto(secondRoute);
  await expect(page.locator("#paper-text-layer")).toContainText("Evidence from first-paper.pdf.");
  await expect(other.locator("#paper-text-layer")).toContainText("Evidence from second-paper.pdf.");
  await expect(page).toHaveTitle("Evidence & reproducibility · Kirjolab");
  await expect(other).toHaveTitle("Independent methods · Kirjolab");

  await saveTitle(context.request, baseURL, first.reference.id, "Revised evidence title");
  await page.reload();
  await expect(page).toHaveTitle("Revised evidence title · Kirjolab");
  await expect(other).toHaveTitle("Independent methods · Kirjolab");

  // Saved titles must contain text, but BibTeX formatting can decode to an empty display title.
  await saveTitle(context.request, baseURL, second.reference.id, "{}");
  await other.reload();
  await expect(other).toHaveTitle("second-paper.pdf · Kirjolab");
  await expect(other.locator("#paper-text-layer")).toContainText("Evidence from second-paper.pdf.");

  await page.locator(`button[data-context-action="close"][data-context-key="library-pdf:${first.artifact.id}"]`).click();
  await expect(page).toHaveURL(`${baseURL}/library`);
  await expect(page).toHaveTitle("Library · Kirjolab");

  await other.getByRole("link", { name: "Library", exact: true }).click();
  await expect(other).toHaveURL(`${baseURL}/library`);
  await expect(other).toHaveTitle("Library · Kirjolab");
  await other.goBack();
  await expect(other).toHaveURL(`${baseURL}${secondRoute}`);
  await expect(other).toHaveTitle("second-paper.pdf · Kirjolab");
});
