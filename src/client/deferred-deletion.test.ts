import { afterEach, describe, expect, it, vi } from "vitest";
import { DeferredDeletionController, type DeferredDeletionNoticeOptions } from "./deferred-deletion";

function setup(commit = vi.fn(async () => undefined)) {
  vi.useFakeTimers();
  const notices: { message: string; options: DeferredDeletionNoticeOptions | undefined }[] = [];
  const hide = vi.fn();
  const restore = vi.fn();
  const controller = new DeferredDeletionController((message, options) => notices.push({ message, options }), 25);
  const deletion = {
    key: "file:1",
    deletedMessage: "Deleted.",
    restoredMessage: "Restored.",
    failedMessage: "Failed.",
    hide,
    restore,
    commit,
  };
  controller.schedule(deletion);
  return { commit, controller, deletion, hide, notices, restore };
}

afterEach(() => vi.useRealTimers());

describe("deferred deletion", () => {
  it("hides immediately and commits after the undo window", async () => {
    const { commit, hide, notices, restore } = setup();
    expect(hide).toHaveBeenCalledOnce();
    expect(notices[0]).toMatchObject({ message: "Deleted.", options: { actionLabel: "Undo", durationMs: 25 } });
    await vi.advanceTimersByTimeAsync(25);
    expect(commit).toHaveBeenCalledOnce();
    expect(restore).not.toHaveBeenCalled();
  });

  it("cancels the commit and restores through the one-shot undo action", async () => {
    const { commit, notices, restore } = setup();
    notices[0]?.options?.action();
    notices[0]?.options?.action();
    await vi.advanceTimersByTimeAsync(25);
    expect(commit).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledOnce();
    expect(notices.at(-1)?.message).toBe("Restored.");
  });

  it("restores and reports a failed commit", async () => {
    const { notices, restore } = setup(vi.fn(async () => Promise.reject(new Error("unavailable"))));
    await vi.advanceTimersByTimeAsync(25);
    expect(restore).toHaveBeenCalledOnce();
    expect(notices.at(-1)?.message).toBe("Failed.");
  });

  it("ignores duplicate schedules while the same deletion is pending", () => {
    const { controller, deletion, hide } = setup();
    controller.schedule(deletion);
    expect(hide).toHaveBeenCalledOnce();
  });
});
