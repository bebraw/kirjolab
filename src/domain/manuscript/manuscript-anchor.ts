import * as v from "valibot";
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

const safeIndexSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const originalRangeSchema = v.pipe(
  v.strictObject({ start: safeIndexSchema, end: safeIndexSchema }),
  v.check(({ start, end }) => end > start),
);
const encodedRelativePositionSchema = v.nullable(
  v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(maximumEncodedRelativePositionLength),
    v.regex(/^[A-Za-z0-9_-]+$/u),
    v.check((value) => value.length % 4 !== 1),
  ),
);
const manuscriptAnchorSelectorSchema = v.strictObject({
  version: v.literal(1),
  fileId: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  relativeStart: encodedRelativePositionSchema,
  relativeEnd: encodedRelativePositionSchema,
  exact: v.pipe(v.string(), v.minLength(1), v.maxLength(50_000)),
  prefix: v.pipe(v.string(), v.maxLength(256)),
  suffix: v.pipe(v.string(), v.maxLength(256)),
  originalRange: originalRangeSchema,
  anchoredRevision: safeIndexSchema,
});
const manuscriptAnchorResolutionSchema = v.union([
  v.strictObject({ status: v.literal("stale") }),
  v.pipe(
    v.strictObject({
      status: v.literal("resolved"),
      start: safeIndexSchema,
      end: safeIndexSchema,
      text: v.string(),
      exactMatch: v.boolean(),
    }),
    v.check(({ start, end, text }) => end > start && text.length === end - start),
  ),
]);

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
  return v.is(manuscriptAnchorSelectorSchema, value);
}

export function isManuscriptAnchorResolution(value: unknown): value is ManuscriptAnchorResolution {
  return v.is(manuscriptAnchorResolutionSchema, value);
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
