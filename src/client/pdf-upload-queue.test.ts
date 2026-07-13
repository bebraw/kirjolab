import { describe, expect, it, vi } from "vitest";
import { maximumPdfBatchFiles, uploadPdfBatch, type PdfUploadQueueSnapshot } from "./pdf-upload-queue";

describe("PDF upload queue", () => {
  it("uploads in order with one active request and preserves partial success", async () => {
    const files = [pdf("first.pdf"), pdf("broken.pdf"), pdf("third.pdf")];
    const order: string[] = [];
    const snapshots: PdfUploadQueueSnapshot[] = [];
    let active = 0;
    let maximumActive = 0;

    const result = await uploadPdfBatch(
      files,
      async (file) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        order.push(file.name);
        await Promise.resolve();
        active -= 1;
        if (file.name === "broken.pdf") throw new Error("Invalid PDF");
        return { disposition: "created" };
      },
      (snapshot) => snapshots.push(snapshot),
    );

    expect(order).toEqual(["first.pdf", "broken.pdf", "third.pdf"]);
    expect(maximumActive).toBe(1);
    expect(result.added.map((file) => file.name)).toEqual(["first.pdf", "third.pdf"]);
    expect(result.failed.map((file) => file.name)).toEqual(["broken.pdf"]);
    expect(result.existing).toEqual([]);
    expect(result.items.map(({ state, error }) => ({ state, error }))).toEqual([
      { state: "added", error: undefined },
      { state: "failed", error: "Invalid PDF" },
      { state: "added", error: undefined },
    ]);
    expect(snapshots[0]?.items.map((item) => item.state)).toEqual(["queued", "queued", "queued"]);
    expect(snapshots.at(-1)).toMatchObject({ completed: 3, total: 3 });
  });

  it("publishes every transition and normalizes unknown failures", async () => {
    const snapshots: PdfUploadQueueSnapshot[] = [];
    const result = await uploadPdfBatch(
      [pdf("paper.pdf")],
      async () => {
        throw "offline";
      },
      (snapshot) => snapshots.push(snapshot),
    );

    expect(snapshots.map((snapshot) => snapshot.items[0]?.state)).toEqual(["queued", "uploading", "failed"]);
    expect(result.items[0]).toMatchObject({ state: "failed", error: "Upload failed" });
  });

  it("treats an existing source as a completed non-retryable outcome", async () => {
    const snapshots: PdfUploadQueueSnapshot[] = [];
    const result = await uploadPdfBatch(
      [pdf("repeat.pdf")],
      async () => ({ disposition: "existing", referenceId: "reference-1", referenceKey: "doe2026", archived: true }),
      (snapshot) => snapshots.push(snapshot),
    );

    expect(snapshots.map((snapshot) => snapshot.items[0]?.state)).toEqual(["queued", "uploading", "existing"]);
    expect(snapshots.at(-1)).toMatchObject({ completed: 1, total: 1 });
    expect(result.added).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.existing).toEqual([{ referenceId: "reference-1", referenceKey: "doe2026", archived: true }]);
    expect(result.items[0]).toMatchObject({
      state: "existing",
      existing: { referenceId: "reference-1", referenceKey: "doe2026", archived: true },
    });
  });

  it("rejects an oversized batch before publishing or uploading", async () => {
    const upload = vi.fn<(file: File) => Promise<{ disposition: "created" }>>().mockResolvedValue({ disposition: "created" });
    const update = vi.fn<(snapshot: PdfUploadQueueSnapshot) => void>();
    const files = Array.from({ length: maximumPdfBatchFiles + 1 }, (_, index) => pdf(`${index}.pdf`));

    await expect(uploadPdfBatch(files, upload, update)).rejects.toThrow(`Choose at most ${maximumPdfBatchFiles} PDFs per batch.`);
    expect(upload).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

function pdf(name: string): File {
  return new File(["%PDF-1.7"], name, { type: "application/pdf" });
}
