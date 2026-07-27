export interface DeferredDeletion {
  readonly key: string;
  readonly deletedMessage: string;
  readonly restoredMessage: string;
  readonly failedMessage: string;
  readonly hide: () => void;
  readonly restore: () => void;
  readonly commit: () => Promise<void>;
}

export interface DeferredDeletionNoticeOptions {
  readonly action: () => void;
  readonly actionLabel: "Undo";
  readonly durationMs: number;
}

type PresentNotice = (message: string, options?: DeferredDeletionNoticeOptions) => void;

export class DeferredDeletionController {
  readonly #pending = new Map<string, { deletion: DeferredDeletion; timer: ReturnType<typeof globalThis.setTimeout> }>();
  readonly #present: PresentNotice;
  readonly #graceMs: number;

  constructor(present: PresentNotice, graceMs = 6_000) {
    this.#present = present;
    this.#graceMs = graceMs;
  }

  schedule(deletion: DeferredDeletion): void {
    if (this.#pending.has(deletion.key)) return;
    deletion.hide();
    const timer = globalThis.setTimeout(() => void this.#commit(deletion.key), this.#graceMs);
    this.#pending.set(deletion.key, { deletion, timer });
    this.#present(deletion.deletedMessage, {
      action: () => this.#undo(deletion.key),
      actionLabel: "Undo",
      durationMs: this.#graceMs,
    });
  }

  #undo(key: string): void {
    const pending = this.#take(key);
    if (!pending) return;
    globalThis.clearTimeout(pending.timer);
    pending.deletion.restore();
    this.#present(pending.deletion.restoredMessage);
  }

  async #commit(key: string): Promise<void> {
    const pending = this.#take(key);
    if (!pending) return;
    try {
      await pending.deletion.commit();
    } catch {
      pending.deletion.restore();
      this.#present(pending.deletion.failedMessage);
    }
  }

  #take(key: string) {
    const pending = this.#pending.get(key);
    if (pending) this.#pending.delete(key);
    return pending;
  }
}
