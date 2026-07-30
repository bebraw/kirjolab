import { describe, expect, it } from "vitest";
import { assertReviewBackupPayloadByteCount, maximumReviewBackupPayloadBytes } from "./review-backup-limits";

describe("review backup payload byte limits", () => {
  it("accepts the exact supported range", () => {
    expect(() => assertReviewBackupPayloadByteCount(1)).not.toThrow();
    expect(() => assertReviewBackupPayloadByteCount(maximumReviewBackupPayloadBytes)).not.toThrow();
  });

  it("rejects empty and oversized payloads", () => {
    expect(() => assertReviewBackupPayloadByteCount(0)).toThrow("Review backup payload is invalid");
    expect(() => assertReviewBackupPayloadByteCount(maximumReviewBackupPayloadBytes + 1)).toThrow("Review backup payload exceeds 64 MiB");
  });
});
