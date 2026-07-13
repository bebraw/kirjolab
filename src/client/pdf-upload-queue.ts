export const maximumPdfBatchFiles = 20;

export type PdfUploadState = "queued" | "uploading" | "added" | "existing" | "failed";

export interface ExistingPdfUpload {
  readonly referenceId: string;
  readonly referenceKey: string;
  readonly archived: boolean;
}

export type PdfUploadOutcome = { readonly disposition: "created" } | ({ readonly disposition: "existing" } & ExistingPdfUpload);

export interface PdfUploadQueueItem {
  readonly file: File;
  readonly state: PdfUploadState;
  readonly error?: string;
  readonly existing?: ExistingPdfUpload;
}

export interface PdfUploadQueueSnapshot {
  readonly items: readonly PdfUploadQueueItem[];
  readonly completed: number;
  readonly total: number;
}

export interface PdfUploadBatchResult {
  readonly items: readonly PdfUploadQueueItem[];
  readonly added: readonly File[];
  readonly existing: readonly ExistingPdfUpload[];
  readonly failed: readonly File[];
}

export async function uploadPdfBatch(
  files: readonly File[],
  upload: (file: File) => Promise<PdfUploadOutcome>,
  update: (snapshot: PdfUploadQueueSnapshot) => void,
): Promise<PdfUploadBatchResult> {
  if (files.length > maximumPdfBatchFiles) {
    throw new RangeError(`Choose at most ${maximumPdfBatchFiles} PDFs per batch.`);
  }

  const items: PdfUploadQueueItem[] = files.map((file) => ({ file, state: "queued" }));
  const publish = (): void => {
    update({
      items: items.map((item) => ({ ...item })),
      completed: items.filter((item) => item.state === "added" || item.state === "existing" || item.state === "failed").length,
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
      const outcome = await upload(current.file);
      items[index] =
        outcome.disposition === "created"
          ? { file: current.file, state: "added" }
          : {
              file: current.file,
              state: "existing",
              existing: {
                referenceId: outcome.referenceId,
                referenceKey: outcome.referenceKey,
                archived: outcome.archived,
              },
            };
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
    existing: items.flatMap((item) => (item.state === "existing" && item.existing ? [item.existing] : [])),
    failed: items.filter((item) => item.state === "failed").map((item) => item.file),
  };
}
