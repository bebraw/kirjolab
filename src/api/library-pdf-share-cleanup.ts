export interface LibraryPdfShareCleanupApi {
  getPendingPdfShareCleanup(): Promise<readonly { readonly id: string; readonly digest: string }[]>;
  completePdfShareCleanup(id: string, digest: string): Promise<void>;
}

export async function cleanupLibraryPdfShares(bucket: Pick<R2Bucket, "delete">, library: LibraryPdfShareCleanupApi): Promise<void> {
  const pending = await library.getPendingPdfShareCleanup();
  // Failed storage operations retain their durable pending record for the next owner operation.
  await Promise.allSettled(pending.map(async (share) => await cleanupLibraryPdfShare(bucket, library, share)));
}

export async function cleanupLibraryPdfShare(
  bucket: Pick<R2Bucket, "delete">,
  library: Pick<LibraryPdfShareCleanupApi, "completePdfShareCleanup">,
  share: { readonly id: string; readonly digest: string },
): Promise<void> {
  await bucket.delete(`pdf-shares/${share.digest}.pdf`);
  await library.completePdfShareCleanup(share.id, share.digest);
}
