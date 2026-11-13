import { describe, expect, it, vi } from "vitest";
import { cleanupLibraryPdfShares } from "./library-pdf-share-cleanup";

describe("revoked PDF copy cleanup", () => {
  it("removes each stored copy before completing its durable cleanup record", async () => {
    const completed: string[] = [];
    const bucket = { delete: vi.fn(async (key: string | string[]) => void completed.push(`deleted:${key}`)) };
    const library = {
      getPendingPdfShareCleanup: vi.fn(async () => [{ id: "share-1", digest: "a".repeat(64) }]),
      completePdfShareCleanup: vi.fn(async (id: string, digest: string) => void completed.push(`completed:${id}:${digest}`)),
    };

    await cleanupLibraryPdfShares(bucket, library);

    expect(completed).toEqual([`deleted:pdf-shares/${"a".repeat(64)}.pdf`, `completed:share-1:${"a".repeat(64)}`]);
  });

  it("retains failed deletions for retry while cleaning other revoked copies", async () => {
    const first = { id: "share-1", digest: "a".repeat(64) };
    const second = { id: "share-2", digest: "b".repeat(64) };
    const pending = new Map([
      [first.id, first],
      [second.id, second],
    ]);
    const bucket = {
      delete: vi
        .fn<(key: string | string[]) => Promise<void>>()
        .mockRejectedValueOnce(new Error("Storage unavailable"))
        .mockResolvedValue(undefined),
    };
    const library = {
      getPendingPdfShareCleanup: vi.fn(async () => [...pending.values()]),
      completePdfShareCleanup: vi.fn(async (id: string) => void pending.delete(id)),
    };

    await cleanupLibraryPdfShares(bucket, library);
    expect([...pending.values()]).toEqual([first]);
    await cleanupLibraryPdfShares(bucket, library);

    expect([...pending.values()]).toEqual([]);
    expect(bucket.delete.mock.calls).toEqual([
      [`pdf-shares/${first.digest}.pdf`],
      [`pdf-shares/${second.digest}.pdf`],
      [`pdf-shares/${first.digest}.pdf`],
    ]);
  });
});
