import { describe, expect, it, vi } from "vitest";
import { CoalescedRefresh, PendingUpdateQueue } from "./collaboration";

describe("PendingUpdateQueue", () => {
  it("copies payloads and exposes unsent updates in FIFO order", () => {
    const queue = new PendingUpdateQueue();
    const firstPayload = new Uint8Array([1, 2, 3]);
    const firstSequence = queue.enqueue(firstPayload);
    const secondSequence = queue.enqueue(new Uint8Array([4, 5]));
    firstPayload[0] = 9;

    const first = queue.nextUnsent();
    expect(first).toMatchObject({ sequence: firstSequence, state: "pending" });
    expect(bytes(first?.payload)).toEqual([1, 2, 3]);
    if (first) new Uint8Array(first.payload)[1] = 9;
    expect(bytes(queue.nextUnsent()?.payload)).toEqual([1, 2, 3]);

    queue.markSent(firstSequence);
    expect(queue.nextUnsent()).toMatchObject({ sequence: secondSequence, state: "pending" });
    expect(queue.sentCount).toBe(1);
    expect(queue.size).toBe(2);
  });

  it("strictly sends and acknowledges the FIFO head", () => {
    const queue = new PendingUpdateQueue();
    const first = queue.enqueue(new Uint8Array([1]));
    const second = queue.enqueue(new Uint8Array([2]));

    expect(() => queue.acknowledge()).toThrow("No sent collaboration update");
    expect(() => queue.markSent(second)).toThrow("FIFO order");

    queue.markSent(first);
    queue.markSent(second);
    expect(queue.nextUnsent()).toBeUndefined();
    expect(bytes(queue.acknowledge().payload)).toEqual([1]);
    expect(queue.size).toBe(1);
    expect(queue.sentCount).toBe(1);
    expect(bytes(queue.acknowledge().payload)).toEqual([2]);
    expect(queue.size).toBe(0);
    expect(() => queue.markSent(first)).toThrow("No unsent collaboration update");
  });

  it("returns sent updates to the pending FIFO on reconnect", () => {
    const queue = new PendingUpdateQueue();
    const first = queue.enqueue(new Uint8Array([1]));
    const second = queue.enqueue(new Uint8Array([2]));
    queue.markSent(first);
    queue.markSent(second);

    queue.resetForReconnect();

    expect(queue.sentCount).toBe(0);
    expect(queue.nextUnsent()).toMatchObject({ sequence: first, state: "pending" });
    queue.markSent(first);
    expect(queue.nextUnsent()).toMatchObject({ sequence: second, state: "pending" });
  });
});

describe("CoalescedRefresh", () => {
  it("serializes refreshes and coalesces concurrent requests into one trailing run", async () => {
    const releases: Array<() => void> = [];
    let active = 0;
    let maximumActive = 0;
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          releases.push(() => {
            active -= 1;
            resolve();
          });
        }),
    );
    const coalesced = new CoalescedRefresh(refresh);

    const running = coalesced.request();
    expect(coalesced.request()).toBe(running);
    expect(coalesced.request()).toBe(running);
    expect(coalesced.isRunning).toBe(true);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(coalesced.request()).toBe(running);
    expect(coalesced.request()).toBe(running);

    releases[0]?.();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(maximumActive).toBe(1);
    releases[1]?.();
    await running;

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(coalesced.isRunning).toBe(false);
  });

  it("allows one later run for requests received during the trailing refresh", async () => {
    const releases: Array<() => void> = [];
    const refresh = vi.fn(() => new Promise<void>((resolve) => releases.push(resolve)));
    const coalesced = new CoalescedRefresh(refresh);

    const running = coalesced.request();
    void coalesced.request();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    void coalesced.request();
    releases[0]?.();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    void coalesced.request();
    void coalesced.request();
    releases[1]?.();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(3));
    releases[2]?.();
    await running;

    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("resets its state after a refresh failure", async () => {
    const refresh = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => {
        throw new Error("refresh failed");
      })
      .mockResolvedValueOnce();
    const coalesced = new CoalescedRefresh(refresh);

    await expect(coalesced.request()).rejects.toThrow("refresh failed");
    expect(coalesced.isRunning).toBe(false);
    await expect(coalesced.request()).resolves.toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

function bytes(payload: ArrayBuffer | undefined): number[] {
  return payload ? Array.from(new Uint8Array(payload)) : [];
}
