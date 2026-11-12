import type { ModelParagraphAnalysis, ModelProvider, ParagraphAnalysisRequest } from "../assistant/model-provider";

export interface ParagraphAnalysisContext {
  /** File-qualified passage identity. A different key must never inherit another passage's feedback. */
  readonly key: string;
  readonly request: ParagraphAnalysisRequest;
}

export interface ParagraphAnalysisSnapshot {
  readonly status: "off" | "unavailable" | "pending" | "stale" | "current" | "unclear" | "failed";
  readonly result: ModelParagraphAnalysis | null;
  readonly error: string | null;
}

type ParagraphAnalysisProvider = Pick<ModelProvider, "analyzeParagraph">;

/** Disposable, opt-in analysis of the selected paragraph; never owns manuscript state. */
export class ParagraphAnalysisController {
  private enabled = false;
  private disposed = false;
  private provider: ParagraphAnalysisProvider | null = null;
  private context: ParagraphAnalysisContext | null = null;
  private contextFingerprint = "null";
  private current: ParagraphAnalysisSnapshot = { status: "off", result: null, error: null };
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abort: AbortController | null = null;
  private listeners = new Set<(snapshot: ParagraphAnalysisSnapshot) => void>();

  get snapshot(): ParagraphAnalysisSnapshot {
    return structuredClone(this.current);
  }

  subscribe(listener: (snapshot: ParagraphAnalysisSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed || this.enabled === enabled) return;
    this.enabled = enabled;
    this.schedule(false);
  }

  setProvider(provider: ParagraphAnalysisProvider | null): void {
    if (this.disposed || this.provider === provider) return;
    this.provider = provider;
    this.schedule(false);
  }

  update(context: ParagraphAnalysisContext | null): void {
    if (this.disposed) return;
    const next = context ? { key: context.key, request: { ...context.request } } : null;
    const fingerprint = JSON.stringify(next);
    if (fingerprint === this.contextFingerprint) return;
    const samePassage = next !== null && next.key === this.context?.key;
    this.context = next;
    this.contextFingerprint = fingerprint;
    this.schedule(samePassage);
  }

  retry(): void {
    if (!this.disposed && this.current.status === "failed") this.schedule(false);
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
    this.context = null;
    this.provider = null;
    this.current = { status: "off", result: null, error: null };
    this.listeners.clear();
  }

  private schedule(retainStaleResult: boolean): void {
    this.cancel();
    const result = retainStaleResult ? this.current.result : null;
    if (!this.enabled) {
      this.publish({ status: "off", result: null, error: null });
      return;
    }
    if (!this.context || !this.provider) {
      this.publish({ status: "unavailable", result: null, error: null });
      return;
    }
    const context = this.context;
    const provider = this.provider;
    const generation = this.generation;
    this.publish({ status: result ? "stale" : "pending", result, error: null });
    this.timer = setTimeout(() => void this.dispatch(context, provider, generation), 1_500);
  }

  private cancel(): void {
    this.generation += 1;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.abort?.abort();
    this.abort = null;
  }

  private publish(snapshot: ParagraphAnalysisSnapshot): void {
    this.current = snapshot;
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private async dispatch(context: ParagraphAnalysisContext, provider: ParagraphAnalysisProvider, generation: number): Promise<void> {
    if (generation !== this.generation || this.disposed) return;
    this.timer = null;
    const abort = new AbortController();
    this.abort = abort;
    this.publish({ ...this.current, status: "pending" });
    try {
      const result = await provider.analyzeParagraph({ ...context.request }, { signal: abort.signal });
      if (generation !== this.generation || this.disposed) return;
      this.publish({ status: result.purpose === null ? "unclear" : "current", result: structuredClone(result), error: null });
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      this.publish({
        status: "failed",
        result: null,
        error: error instanceof Error ? error.message : "Paragraph analysis is unavailable. Try again.",
      });
    } finally {
      if (this.abort === abort) this.abort = null;
    }
  }
}
