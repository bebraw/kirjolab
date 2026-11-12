import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelParagraphAnalysis, ModelProvider } from "../assistant/model-provider";
import { ParagraphAnalysisController, type ParagraphAnalysisContext } from "./paragraph-analysis";

const context: ParagraphAnalysisContext = {
  key: "chapter-1:paragraph-2",
  request: {
    selectedPassage: "The sample includes registered trials.",
    sectionTitle: "Sampling",
    previousParagraph: "We compare intervention designs.",
    nextParagraph: "Duplicate trials were excluded.",
  },
};
const result: ModelParagraphAnalysis = {
  purpose: "Defines which trials enter the comparison.",
  hints: ["Consider specifying the registration period."],
  adapter: "openai-compatible",
  providerLabel: "Local test model",
  model: "test-model",
};

function setup() {
  const analyzeParagraph = vi.fn<ModelProvider["analyzeParagraph"]>().mockResolvedValue(result);
  const controller = new ParagraphAnalysisController();
  controller.setProvider({ analyzeParagraph });
  controller.update(context);
  return { controller, analyzeParagraph };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("automatic paragraph analysis", () => {
  it("requires session opt-in and one quiet pause before analyzing the selected paragraph", async () => {
    const { controller, analyzeParagraph } = setup();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(controller.snapshot.status).toBe("off");
    expect(analyzeParagraph).not.toHaveBeenCalled();
    controller.setEnabled(true);
    expect(controller.snapshot.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(1_499);
    expect(analyzeParagraph).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(analyzeParagraph).toHaveBeenCalledWith(context.request, { signal: expect.any(AbortSignal) });
    expect(controller.snapshot).toEqual({ status: "current", result, error: null });
  });

  it("invalidates old results immediately and debounces changes to neighboring context", async () => {
    const { controller, analyzeParagraph } = setup();
    controller.setEnabled(true);
    await vi.advanceTimersByTimeAsync(1_500);
    controller.update({ ...context, request: { ...context.request, nextParagraph: "A changed adjacent paragraph." } });
    expect(controller.snapshot.status).toBe("stale");
    await vi.advanceTimersByTimeAsync(1_000);
    controller.update({ ...context, request: { ...context.request, nextParagraph: "Another adjacent edit." } });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(analyzeParagraph).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(analyzeParagraph).toHaveBeenCalledTimes(2);
    expect(controller.snapshot.status).toBe("current");
  });

  it("does not reanalyze unchanged inputs or copy feedback onto a different paragraph", async () => {
    const { controller, analyzeParagraph } = setup();
    controller.setEnabled(true);
    await vi.advanceTimersByTimeAsync(1_500);
    controller.update(structuredClone(context));
    controller.setEnabled(true);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(analyzeParagraph).toHaveBeenCalledTimes(1);
    controller.update({ ...context, key: "chapter-2:paragraph-1" });
    expect(controller.snapshot).toEqual({ status: "pending", result: null, error: null });
  });

  it("aborts in-flight requests and rejects their late results after edits", async () => {
    const { controller, analyzeParagraph } = setup();
    let resolveOld: (value: ModelParagraphAnalysis) => void = () => {
      throw new Error("Request not started");
    };
    analyzeParagraph.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    controller.setEnabled(true);
    await vi.advanceTimersByTimeAsync(1_500);
    const signal = analyzeParagraph.mock.calls[0]?.[1]?.signal;
    controller.update({ ...context, request: { ...context.request, selectedPassage: "Changed source." } });
    expect(signal?.aborted).toBe(true);
    resolveOld(result);
    await Promise.resolve();
    expect(controller.snapshot.result).toBeNull();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(controller.snapshot.status).toBe("current");
  });

  it("ignores late failures after the active paragraph becomes unavailable", async () => {
    const { controller, analyzeParagraph } = setup();
    let rejectOld: (error: Error) => void = () => {
      throw new Error("Request not started");
    };
    analyzeParagraph.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectOld = reject;
        }),
    );
    controller.setEnabled(true);
    await vi.advanceTimersByTimeAsync(1_500);
    controller.update(null);
    expect(analyzeParagraph.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    rejectOld(new Error("Late network failure"));
    await Promise.resolve();
    expect(controller.snapshot).toEqual({ status: "unavailable", result: null, error: null });
  });

  it("pauses for unavailable source and resumes without losing session opt-in", async () => {
    const { controller, analyzeParagraph } = setup();
    controller.setEnabled(true);
    controller.update(null);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(analyzeParagraph).not.toHaveBeenCalled();
    expect(controller.snapshot.status).toBe("unavailable");
    controller.update(context);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(controller.snapshot.status).toBe("current");
  });

  it("forgets old provider results immediately when model settings change", async () => {
    const { controller } = setup();
    controller.setEnabled(true);
    await vi.advanceTimersByTimeAsync(1_500);
    controller.setProvider(null);
    expect(controller.snapshot).toEqual({ status: "unavailable", result: null, error: null });
    const analyzeParagraph = vi.fn<ModelProvider["analyzeParagraph"]>().mockResolvedValue({ ...result, purpose: null, hints: [] });
    const provider = { analyzeParagraph };
    controller.setProvider(provider);
    controller.setProvider(provider);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(analyzeParagraph).toHaveBeenCalledTimes(1);
    expect(controller.snapshot.status).toBe("unclear");
  });

  it("shows failure without an automatic retry loop and lets the author explicitly retry", async () => {
    const { controller, analyzeParagraph } = setup();
    analyzeParagraph.mockRejectedValueOnce(new Error("Provider unavailable"));
    controller.setEnabled(true);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(controller.snapshot).toEqual({ status: "failed", result: null, error: "Provider unavailable" });
    controller.update(context);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(analyzeParagraph).toHaveBeenCalledTimes(1);
    controller.retry();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(controller.snapshot.status).toBe("current");
    controller.retry();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(analyzeParagraph).toHaveBeenCalledTimes(2);
  });

  it("provides a bounded generic failure when a provider rejects without an Error", async () => {
    const { controller, analyzeParagraph } = setup();
    analyzeParagraph.mockRejectedValueOnce(null);
    controller.setEnabled(true);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(controller.snapshot.error).toBe("Paragraph analysis is unavailable. Try again.");
  });

  it("cancels and clears feedback when disabled or disposed", async () => {
    const { controller, analyzeParagraph } = setup();
    controller.setEnabled(true);
    controller.setEnabled(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(controller.snapshot).toEqual({ status: "off", result: null, error: null });
    expect(analyzeParagraph).not.toHaveBeenCalled();
    controller.setEnabled(true);
    controller.dispose();
    controller.update(context);
    controller.setProvider({ analyzeParagraph });
    controller.setEnabled(true);
    controller.retry();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(analyzeParagraph).not.toHaveBeenCalled();
  });

  it("isolates input and snapshot objects and releases subscriptions", async () => {
    const { controller, analyzeParagraph } = setup();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    const changed = { key: context.key, request: { ...context.request } };
    controller.update(changed);
    changed.request = { ...changed.request, selectedPassage: "Mutated outside controller." };
    controller.setEnabled(true);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(analyzeParagraph.mock.calls[0]?.[0].selectedPassage).toBe(context.request.selectedPassage);
    expect(listener).toHaveBeenCalled();
    const snapshot = controller.snapshot;
    Object.assign(snapshot, { status: "off" });
    expect(controller.snapshot.status).toBe("current");
    unsubscribe();
    listener.mockClear();
    controller.setEnabled(false);
    expect(listener).not.toHaveBeenCalled();
  });
});
