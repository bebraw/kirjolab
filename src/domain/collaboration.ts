import * as Y from "yjs";

export const collaborationProtocolVersion = 1 as const;

export type ServerCollaborationMessage =
  | { type: "sync"; protocol: typeof collaborationProtocolVersion; revision: number }
  | { type: "ack"; revision: number }
  | { type: "revision"; revision: number }
  | { type: "reset"; revision: number }
  | { type: "presence"; collaborators: number }
  | { type: "resources" };

export function encodeServerCollaborationMessage(message: unknown): string {
  if (!isServerCollaborationMessage(message)) throw new TypeError("Invalid server collaboration message");
  return JSON.stringify(message);
}

export function parseServerCollaborationMessage(value: string): ServerCollaborationMessage | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isServerCollaborationMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isServerCollaborationMessage(value: unknown): value is ServerCollaborationMessage {
  if (!isRecord(value) || typeof value.type !== "string") return false;

  switch (value.type) {
    case "sync":
      return (
        hasExactKeys(value, ["type", "protocol", "revision"]) &&
        value.protocol === collaborationProtocolVersion &&
        isRevision(value.revision)
      );
    case "ack":
    case "revision":
    case "reset":
      return hasExactKeys(value, ["type", "revision"]) && isRevision(value.revision);
    case "presence":
      return hasExactKeys(value, ["type", "collaborators"]) && isRevision(value.collaborators);
    case "resources":
      return hasExactKeys(value, ["type"]);
    default:
      return false;
  }
}

export function applyYjsUpdateOnce(document: Y.Doc, update: Uint8Array): boolean {
  Y.decodeUpdate(update);
  const origin = Symbol("accepted-collaboration-update");
  let applied = false;
  const observeUpdate = (_acceptedUpdate: Uint8Array, updateOrigin: unknown): void => {
    if (updateOrigin === origin) applied = true;
  };

  document.on("update", observeUpdate);
  try {
    Y.applyUpdate(document, update, origin);
  } finally {
    document.off("update", observeUpdate);
  }
  return applied;
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
