export const maximumPdfBatchFiles = 20;

export type PdfUploadState = "queued" | "uploading" | "added" | "failed";

export interface PdfUploadQueueItem {
  readonly file: File;
  readonly state: PdfUploadState;
  readonly error?: string;
}

export interface PdfUploadQueueSnapshot {
  readonly items: readonly PdfUploadQueueItem[];
  readonly completed: number;
  readonly total: number;
}

export interface PdfUploadBatchResult {
  readonly items: readonly PdfUploadQueueItem[];
  readonly added: readonly File[];
  readonly failed: readonly File[];
}

export async function uploadPdfBatch(
  files: readonly File[],
  upload: (file: File) => Promise<void>,
  update: (snapshot: PdfUploadQueueSnapshot) => void,
): Promise<PdfUploadBatchResult> {
  if (files.length > maximumPdfBatchFiles) {
    throw new RangeError(`Choose at most ${maximumPdfBatchFiles} PDFs per batch.`);
  }

  const items: PdfUploadQueueItem[] = files.map((file) => ({ file, state: "queued" }));
  const publish = (): void => {
    update({
      items: items.map((item) => ({ ...item })),
      completed: items.filter((item) => item.state === "added" || item.state === "failed").length,
      total: items.length,
    });
  };

  publish();
  for (let index = 0; index < items.length; index += 1) {
    const current = items[index];
    if (!current) continue;
    items[index] = { file: current.file, state: "uploading" };
    publish();
    try {
      await upload(current.file);
      items[index] = { file: current.file, state: "added" };
    } catch (error) {
      items[index] = {
        file: current.file,
        state: "failed",
        error: error instanceof Error && error.message ? error.message : "Upload failed",
      };
    }
    publish();
  }

  return {
    items: items.map((item) => ({ ...item })),
    added: items.filter((item) => item.state === "added").map((item) => item.file),
    failed: items.filter((item) => item.state === "failed").map((item) => item.file),
  };
}
