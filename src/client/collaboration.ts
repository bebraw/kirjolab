export type PendingUpdateState = "pending" | "sent";

export interface PendingUpdate {
  readonly sequence: number;
  readonly state: PendingUpdateState;
  readonly payload: ArrayBuffer;
}

interface StoredUpdate {
  sequence: number;
  state: PendingUpdateState;
  payload: ArrayBuffer;
}

export class PendingUpdateQueue {
  readonly #updates: StoredUpdate[] = [];
  #nextSequence = 1;

  get size(): number {
    return this.#updates.length;
  }

  get sentCount(): number {
    return this.#updates.filter((update) => update.state === "sent").length;
  }

  enqueue(payload: ArrayBuffer | ArrayBufferView): number {
    const sequence = this.#nextSequence;
    this.#nextSequence += 1;
    this.#updates.push({ sequence, state: "pending", payload: copyPayload(payload) });
    return sequence;
  }

  nextUnsent(): PendingUpdate | undefined {
    const update = this.#updates.find((candidate) => candidate.state === "pending");
    return update ? copyUpdate(update) : undefined;
  }

  markSent(sequence: number): void {
    const update = this.#updates.find((candidate) => candidate.state === "pending");
    if (!update) throw new Error("No unsent collaboration update is available");
    if (update.sequence !== sequence) throw new Error("Collaboration updates must be sent in FIFO order");
    update.state = "sent";
  }

  acknowledge(): PendingUpdate {
    const update = this.#updates[0];
    if (!update || update.state !== "sent") throw new Error("No sent collaboration update is awaiting acknowledgement");
    this.#updates.shift();
    return copyUpdate(update);
  }

  resetForReconnect(): void {
    for (const update of this.#updates) update.state = "pending";
  }
}

export class CoalescedRefresh {
  readonly #refresh: () => Promise<void>;
  #active: Promise<void> | undefined;
  #requested = false;

  constructor(refresh: () => Promise<void>) {
    this.#refresh = refresh;
  }

  get isRunning(): boolean {
    return this.#active !== undefined;
  }

  request(): Promise<void> {
    this.#requested = true;
    this.#active ??= Promise.resolve().then(() => this.#drain());
    return this.#active;
  }

  async #drain(): Promise<void> {
    try {
      while (this.#requested) {
        this.#requested = false;
        await this.#refresh();
      }
    } finally {
      this.#requested = false;
      this.#active = undefined;
    }
  }
}

function copyUpdate(update: StoredUpdate): PendingUpdate {
  return { sequence: update.sequence, state: update.state, payload: update.payload.slice(0) };
}

function copyPayload(payload: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (payload instanceof ArrayBuffer) return payload.slice(0);
  const copy = new ArrayBuffer(payload.byteLength);
  new Uint8Array(copy).set(new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength));
  return copy;
}
