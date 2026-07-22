import * as Y from "yjs";

export const collaborationProtocolVersion = 1 as const;

export type ServerCollaborationMessage =
  | { type: "sync"; protocol: typeof collaborationProtocolVersion; revision: number }
  | { type: "ack"; revision: number }
  | { type: "revision"; revision: number }
  | { type: "reset"; revision: number }
  | { type: "presence"; collaborators: number }
  | { type: "selection"; collaboratorId: string; fileId: string; start: number; end: number; revision: number }
  | { type: "selection-clear"; collaboratorId: string }
  | { type: "resources" };

export interface ClientSelectionMessage {
  readonly type: "selection";
  readonly protocol: typeof collaborationProtocolVersion;
  readonly fileId: string;
  readonly start: number;
  readonly end: number;
  readonly revision: number;
}

export function encodeClientSelectionMessage(message: ClientSelectionMessage): string {
  if (!isClientSelectionMessage(message)) throw new TypeError("Invalid client selection message");
  return JSON.stringify(message);
}

export function parseClientSelectionMessage(value: string): ClientSelectionMessage | null {
  if (value.length > 1_024) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isClientSelectionMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isClientSelectionMessage(value: unknown): value is ClientSelectionMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["type", "protocol", "fileId", "start", "end", "revision"]) &&
    value.type === "selection" &&
    value.protocol === collaborationProtocolVersion &&
    isIdentifier(value.fileId) &&
    isRevision(value.start) &&
    isRevision(value.end) &&
    value.end >= value.start &&
    isRevision(value.revision)
  );
}

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
    case "selection":
      return (
        hasExactKeys(value, ["type", "collaboratorId", "fileId", "start", "end", "revision"]) &&
        isIdentifier(value.collaboratorId) &&
        isIdentifier(value.fileId) &&
        isRevision(value.start) &&
        isRevision(value.end) &&
        value.end >= value.start &&
        isRevision(value.revision)
      );
    case "selection-clear":
      return hasExactKeys(value, ["type", "collaboratorId"]) && isIdentifier(value.collaboratorId);
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

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
