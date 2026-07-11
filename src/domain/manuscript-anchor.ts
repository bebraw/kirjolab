import * as Y from "yjs";

const contextLength = 64;
const maximumEncodedRelativePositionLength = 512;
const maximumRelativePositionBytes = 384;

interface ManuscriptAnchorMetadata {
  readonly version: 1;
  readonly fileId: string;
  readonly exact: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly originalRange: {
    readonly start: number;
    readonly end: number;
  };
  readonly anchoredRevision: number;
}

export interface ManuscriptAnchorSelector extends ManuscriptAnchorMetadata {
  readonly relativeStart: string | null;
  readonly relativeEnd: string | null;
}

export interface StoredManuscriptAnchor extends ManuscriptAnchorMetadata {
  readonly relativeStart: ArrayBuffer | null;
  readonly relativeEnd: ArrayBuffer | null;
}

export interface ResolvedManuscriptAnchor {
  readonly status: "resolved";
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly exactMatch: boolean;
}

export type ManuscriptAnchorResolution = ResolvedManuscriptAnchor | { readonly status: "stale" };

export function createManuscriptAnchor(
  document: Y.Doc,
  start: number,
  end: number,
  anchoredRevision: number,
  fileId = "main",
  source = document.getText("source"),
): StoredManuscriptAnchor {
  assertRange(start, end, source.length);
  if (!Number.isSafeInteger(anchoredRevision) || anchoredRevision < 0) {
    throw new RangeError("The anchored revision must be a non-negative safe integer");
  }

  const text = source.toString();
  return {
    version: 1,
    fileId,
    relativeStart: copyBytes(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(source, start, 0))),
    relativeEnd: copyBytes(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(source, end, -1))),
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - contextLength), start),
    suffix: text.slice(end, end + contextLength),
    originalRange: { start, end },
    anchoredRevision,
  };
}

export function toManuscriptAnchorSelector(anchor: StoredManuscriptAnchor): ManuscriptAnchorSelector {
  return {
    ...metadata(anchor),
    relativeStart: anchor.relativeStart === null ? null : encodeBase64Url(anchor.relativeStart),
    relativeEnd: anchor.relativeEnd === null ? null : encodeBase64Url(anchor.relativeEnd),
  };
}

export function toStoredManuscriptAnchor(selector: ManuscriptAnchorSelector): StoredManuscriptAnchor {
  return {
    ...metadata(selector),
    relativeStart: selector.relativeStart === null ? null : decodeBase64Url(selector.relativeStart),
    relativeEnd: selector.relativeEnd === null ? null : decodeBase64Url(selector.relativeEnd),
  };
}

export function resolveManuscriptAnchor(
  document: Y.Doc,
  anchor: StoredManuscriptAnchor | ManuscriptAnchorSelector,
): ManuscriptAnchorResolution {
  if (anchor.relativeStart === null || anchor.relativeEnd === null) return { status: "stale" };

  try {
    document.getText("source");
    document.getText(`file:${anchor.fileId}`);
    const start = Y.createAbsolutePositionFromRelativePosition(decodeRelativePosition(anchor.relativeStart), document, false);
    const end = Y.createAbsolutePositionFromRelativePosition(decodeRelativePosition(anchor.relativeEnd), document, false);
    if (!start || !end || start.type !== end.type) return { status: "stale" };
    const typeName = [...document.share.entries()].find(([, type]) => type === start.type)?.[0];
    if (!typeName || (typeName !== "source" && typeName !== `file:${anchor.fileId}`)) return { status: "stale" };
    const source = document.getText(typeName);
    if (source !== start.type) return { status: "stale" };
    if (!Number.isSafeInteger(start.index) || !Number.isSafeInteger(end.index) || start.index < 0 || end.index > source.length) {
      return { status: "stale" };
    }
    if (end.index <= start.index) return { status: "stale" };

    const text = source.toString().slice(start.index, end.index);
    return { status: "resolved", start: start.index, end: end.index, text, exactMatch: text === anchor.exact };
  } catch {
    return { status: "stale" };
  }
}

export function isManuscriptAnchorSelector(value: unknown): value is ManuscriptAnchorSelector {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "version",
      "fileId",
      "relativeStart",
      "relativeEnd",
      "exact",
      "prefix",
      "suffix",
      "originalRange",
      "anchoredRevision",
    ]) ||
    value.version !== 1
  ) {
    return false;
  }
  if (!isStringWithin(value.fileId, 128, true)) return false;
  if (!isEncodedRelativePosition(value.relativeStart) || !isEncodedRelativePosition(value.relativeEnd)) return false;
  if (!isStringWithin(value.exact, 50_000, true)) return false;
  if (!isStringWithin(value.prefix, 256) || !isStringWithin(value.suffix, 256)) return false;
  if (!isRecord(value.originalRange) || !hasExactKeys(value.originalRange, ["start", "end"])) return false;
  const { start, end } = value.originalRange;
  return (
    Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    typeof start === "number" &&
    typeof end === "number" &&
    start >= 0 &&
    end > start &&
    Number.isSafeInteger(value.anchoredRevision) &&
    typeof value.anchoredRevision === "number" &&
    value.anchoredRevision >= 0
  );
}

export function isManuscriptAnchorResolution(value: unknown): value is ManuscriptAnchorResolution {
  if (!isRecord(value)) return false;
  if (value.status === "stale") return hasExactKeys(value, ["status"]);
  return (
    hasExactKeys(value, ["status", "start", "end", "text", "exactMatch"]) &&
    value.status === "resolved" &&
    Number.isSafeInteger(value.start) &&
    Number.isSafeInteger(value.end) &&
    typeof value.start === "number" &&
    typeof value.end === "number" &&
    value.start >= 0 &&
    value.end > value.start &&
    typeof value.text === "string" &&
    value.text.length === value.end - value.start &&
    typeof value.exactMatch === "boolean"
  );
}

function metadata(anchor: StoredManuscriptAnchor | ManuscriptAnchorSelector): ManuscriptAnchorMetadata {
  return {
    version: 1,
    fileId: anchor.fileId,
    exact: anchor.exact,
    prefix: anchor.prefix,
    suffix: anchor.suffix,
    originalRange: { start: anchor.originalRange.start, end: anchor.originalRange.end },
    anchoredRevision: anchor.anchoredRevision,
  };
}

function decodeRelativePosition(value: string | ArrayBuffer): Y.RelativePosition {
  const bytes = typeof value === "string" ? new Uint8Array(decodeBase64Url(value)) : new Uint8Array(value);
  if (bytes.byteLength === 0 || bytes.byteLength > maximumRelativePositionBytes) throw new Error("Invalid relative position length");
  return Y.decodeRelativePosition(bytes);
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function encodeBase64Url(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): ArrayBuffer {
  if (
    value.length === 0 ||
    value.length > maximumEncodedRelativePositionLength ||
    !/^[A-Za-z0-9_-]+$/u.test(value) ||
    value.length % 4 === 1
  ) {
    throw new Error("Invalid base64url relative position");
  }
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function assertRange(start: number, end: number, maximum: number): void {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > maximum) {
    throw new RangeError("The manuscript anchor range is invalid");
  }
}

function isEncodedRelativePosition(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length > 0 &&
      value.length <= maximumEncodedRelativePositionLength &&
      /^[A-Za-z0-9_-]+$/u.test(value) &&
      value.length % 4 !== 1)
  );
}

function isStringWithin(value: unknown, maximumLength: number, required = false): value is string {
  return typeof value === "string" && value.length <= maximumLength && (!required || value.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}
