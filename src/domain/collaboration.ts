import * as v from "valibot";
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

const revisionSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const identifierSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(128));
const clientSelectionMessageSchema = v.pipe(
  v.strictObject({
    type: v.literal("selection"),
    protocol: v.literal(collaborationProtocolVersion),
    fileId: identifierSchema,
    start: revisionSchema,
    end: revisionSchema,
    revision: revisionSchema,
  }),
  v.check((value) => value.end >= value.start),
);
const serverSelectionMessageSchema = v.pipe(
  v.strictObject({
    type: v.literal("selection"),
    collaboratorId: identifierSchema,
    fileId: identifierSchema,
    start: revisionSchema,
    end: revisionSchema,
    revision: revisionSchema,
  }),
  v.check((value) => value.end >= value.start),
);
const serverCollaborationMessageSchema = v.union([
  v.strictObject({ type: v.literal("sync"), protocol: v.literal(collaborationProtocolVersion), revision: revisionSchema }),
  v.strictObject({ type: v.literal("ack"), revision: revisionSchema }),
  v.strictObject({ type: v.literal("revision"), revision: revisionSchema }),
  v.strictObject({ type: v.literal("reset"), revision: revisionSchema }),
  v.strictObject({ type: v.literal("presence"), collaborators: revisionSchema }),
  serverSelectionMessageSchema,
  v.strictObject({ type: v.literal("selection-clear"), collaboratorId: identifierSchema }),
  v.strictObject({ type: v.literal("resources") }),
]);

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

function isClientSelectionMessage(value: unknown): value is ClientSelectionMessage {
  return v.is(clientSelectionMessageSchema, value);
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
  return v.is(serverCollaborationMessageSchema, value);
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
