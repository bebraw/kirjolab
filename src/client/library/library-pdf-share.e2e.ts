import { expect, test } from "@playwright/test";
import { resolve, sep } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, PDFHexString, PDFName, PDFString, StandardFonts } from "pdf-lib";
import { isPdfDraftResult } from "../../domain/reference-library";
import { createRevisionEvidencePdf } from "../../test-support/pdf-revision-fixture";

test("exports an anonymous review with editable imported comments and no reviewer metadata", async ({ page, context, baseURL }) => {
  if (!baseURL) throw new Error("Expected browser test origin");
  await context.setExtraHTTPHeaders({ "x-kirjolab-local-user": `anonymous-review-${crypto.randomUUID()}@example.com` });
  const source = await PDFDocument.create({ updateMetadata: false });
  const font = await source.embedFont(StandardFonts.TimesRoman);
  const paper = source.addPage([600, 800]);
  paper.drawText("Evidence for anonymous review.", { x: 40, y: 700, size: 18, font });
  source.setAuthor("Reviewer metadata identity");
  source.catalog.set(
    PDFName.of("Metadata"),
    source.context.register(source.context.stream("<x:xmpmeta>XMP reviewer identity</x:xmpmeta>", { Type: "Metadata", Subtype: "XML" })),
  );
  paper.node.addAnnot(
    source.context.register(
      source.context.obj({
        Type: "Annot",
        Subtype: "Text",
        Rect: [40, 60, 54, 74],
        T: PDFHexString.fromText("Preview reviewer identity"),
        Contents: PDFString.of("Please explain the evidence."),
        F: 4,
        P: paper.ref,
      }),
    ),
  );
  const original = await source.save();
  const upload = await context.request.post("/api/library/pdfs", {
    headers: { origin: baseURL, "content-type": "application/pdf", "x-file-name": "reviewer-name.pdf" },
    data: Buffer.from(original),
  });
  expect(upload.ok()).toBe(true);
  const draft: unknown = await upload.json();
  if (!isPdfDraftResult(draft)) throw new Error("Expected uploaded PDF draft");
  await page.goto(`/library/pdfs/${draft.artifact.id}`);
  await expect(page.locator(".pdfViewer .textLayer")).toContainText("Evidence for anonymous review.");
  await page.getByRole("button", { name: "More PDF actions" }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export anonymous review", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("anonymous-review.pdf");
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    expect(pdf.numPages).toBe(1);
    const metadata = await pdf.getMetadata();
    expect(metadata.info).not.toHaveProperty("Author");
    expect(metadata.metadata).toBeNull();
    const paper = await pdf.getPage(1);
    expect((await paper.getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join("")).toBe(
      "Evidence for anonymous review.",
    );
    expect(await paper.getAnnotations()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subtype: "Text",
          titleObj: expect.objectContaining({ str: "Reviewer" }),
          contentsObj: expect.objectContaining({ str: "Please explain the evidence." }),
        }),
      ]),
    );
  } finally {
    await task.destroy();
  }
  const stored = await context.request.get(`/api/library/pdfs/${draft.artifact.id}`);
  expect(await stored.body()).toEqual(Buffer.from(original));
  expect((await context.request.get(`/api/library/pdfs/${crypto.randomUUID()}/anonymous-review`)).status()).toBe(404);
  expect(
    (
      await context.request.get(`/api/library/pdfs/${draft.artifact.id}/anonymous-review`, {
        headers: { "x-kirjolab-local-user": `other-reviewer-${crypto.randomUUID()}@example.com` },
      })
    ).status(),
  ).toBe(404);
});

async function expectCurrentRevision(bytes: Uint8Array, note?: string): Promise<void> {
  const task = getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: resolve("node_modules/pdfjs-dist/standard_fonts") + sep,
  });
  try {
    const pdf = await task.promise;
    expect(pdf.numPages).toBe(3);
    const expected = [
      "First page: inspectable evidence.",
      "Second page: reproducible methods.",
      "Final page: the current conclusion survives.",
    ];
    for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const text = await page.getTextContent();
      expect(text.items.map((item) => ("str" in item ? item.str : "")).join("")).toBe(expected[pageNumber - 1]);
      expect(Object.values(text.styles).map((style) => style.fontFamily)).toEqual(["serif"]);
    }
    if (note) {
      const annotations = await (await pdf.getPage(3)).getAnnotations();
      expect(annotations.map((annotation) => annotation.contentsObj?.str)).toContain(note);
    }
  } finally {
    await task.destroy();
  }
}

test("shares an annotated PDF snapshot by link and revokes access", async ({ page, context, browser, baseURL }) => {
  if (!baseURL) throw new Error("Expected browser test origin");
  await context.setExtraHTTPHeaders({ "x-kirjolab-local-user": `pdf-share-${crypto.randomUUID()}@example.com` });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const headers = { origin: baseURL };
  const source = createRevisionEvidencePdf({ xref: "incremental-table", objects: "obsolete-stream" });
  const upload = await context.request.post("/api/library/pdfs", {
    headers: { ...headers, "content-type": "application/pdf", "x-file-name": "colleague.pdf" },
    data: source,
  });
  expect(upload.ok()).toBe(true);
  const draft: unknown = await upload.json();
  if (!isPdfDraftResult(draft)) throw new Error("Expected uploaded PDF draft");
  const originalUrl = `/api/library/pdfs/${draft.artifact.id}`;
  const original = await context.request.get(originalUrl);
  expect(original.status()).toBe(200);
  expect(await original.body()).toEqual(source);
  await expectCurrentRevision(await original.body());
  const notesPath = `/api/library/references/${draft.reference.id}/pdf-markups`;
  const note = await context.request.post(notesPath, {
    headers,
    data: { kind: "note", artifactId: draft.artifact.id, page: 3, x: 0.3, y: 0.3, body: "Please clarify this finding." },
  });
  expect(note.ok()).toBe(true);

  await page.goto(`/library/pdfs/${draft.artifact.id}`);
  await expect(page.locator(".pdfViewer .textLayer")).toContainText("First page: inspectable evidence.");
  await page.getByRole("button", { name: "More PDF actions" }).click();
  await page.getByRole("button", { name: "Share annotated copy", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share annotated copy" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("No shared copies yet.");
  await dialog.getByRole("button", { name: "Create share link" }).click();
  const link = dialog.getByLabel("Share link", { exact: true });
  await expect(link).toHaveValue(/\/share\/pdf\/[A-Za-z0-9_-]{43}$/u);
  const href = await link.inputValue();
  await dialog.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("Link copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(href);

  const recipientContext = await browser.newContext();
  try {
    const recipient = await recipientContext.newPage();
    await recipient.goto(href);
    await expect(recipient.getByRole("heading", { level: 1 })).toHaveText("colleague-annotated.pdf");
    await expect(recipient.getByTitle("Shared annotated PDF")).toBeVisible();
    const downloadUrl = await recipient.getByRole("link", { name: "Download PDF" }).getAttribute("href");
    if (!downloadUrl) throw new Error("Expected PDF download URL");
    const download = await recipientContext.request.get(new URL(downloadUrl, href).href);
    expect(download.status()).toBe(200);
    expect(download.headers()["content-type"]).toBe("application/pdf");
    expect(download.headers()["content-disposition"]).toContain("attachment");
    const sharedBytes = await download.body();
    expect(download.headers()["content-length"]).toBe(String(sharedBytes.length));
    expect(download.headers()["content-range"]).toBeUndefined();
    expect(download.headers()["cache-control"]).toBe("private, no-store");
    expect(sharedBytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(sharedBytes).not.toEqual(source);
    await expectCurrentRevision(sharedBytes, "Please clarify this finding.");
    expect(await (await context.request.get(originalUrl)).body()).toEqual(source);

    for (const [range, start, length] of [
      ["bytes=0-31", 0, 32],
      ["bytes=-16", sharedBytes.length - 16, 16],
    ] as const) {
      const partial = await recipientContext.request.get(new URL(downloadUrl, href).href, { headers: { range } });
      expect(partial.status()).toBe(206);
      expect(partial.headers()["accept-ranges"]).toBe("bytes");
      expect(partial.headers()["content-type"]).toBe("application/pdf");
      expect(partial.headers()["content-range"]).toBe(`bytes ${start}-${start + length - 1}/${sharedBytes.length}`);
      expect(partial.headers()["content-length"]).toBe(String(length));
      expect(partial.headers()["cache-control"]).toBe("private, no-store");
      expect(await partial.body()).toEqual(sharedBytes.subarray(start, start + length));
    }

    const laterNote = await context.request.post(notesPath, {
      headers,
      data: { kind: "note", artifactId: draft.artifact.id, page: 1, x: 0.5, y: 0.5, body: "Later private thought." },
    });
    expect(laterNote.ok()).toBe(true);
    const unchanged = await recipientContext.request.get(new URL(downloadUrl, href).href);
    expect(await unchanged.body()).toEqual(sharedBytes);

    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("button", { name: "More PDF actions" }).click();
    await page.getByRole("button", { name: "Share annotated copy", exact: true }).click();
    await expect(dialog.getByLabel("Share link", { exact: true })).toHaveValue(href);
    await dialog.getByRole("button", { name: "Revoke link", exact: true }).click();
    await expect(dialog).toContainText("No shared copies yet.");
    expect((await recipientContext.request.get(href)).status()).toBe(404);
    expect((await recipientContext.request.get(new URL(downloadUrl, href).href)).status()).toBe(404);
    expect((await recipientContext.request.get(new URL(downloadUrl, href).href, { headers: { range: "bytes=0-31" } })).status()).toBe(404);
  } finally {
    await recipientContext.close();
  }
});
