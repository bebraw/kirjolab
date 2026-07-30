export const maximumReviewBackupPayloadBytes = 64 * 1024 * 1024;

export function assertReviewBackupPayloadByteCount(byteCount: number): void {
  if (byteCount <= 0) throw new Error("Review backup payload is invalid");
  if (byteCount > maximumReviewBackupPayloadBytes) throw new Error("Review backup payload exceeds 64 MiB");
}
