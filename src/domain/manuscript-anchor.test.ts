import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  createManuscriptAnchor,
  isManuscriptAnchorResolution,
  isManuscriptAnchorSelector,
  resolveManuscriptAnchor,
  toManuscriptAnchorSelector,
  toStoredManuscriptAnchor,
  type ManuscriptAnchorSelector,
  type StoredManuscriptAnchor,
} from "./manuscript-anchor";

describe("durable manuscript anchors", () => {
  it("creates a versioned Yjs selector with exact source context", () => {
    const document = documentWithSource("Before target after");
    const stored = createManuscriptAnchor(document, 7, 13, 4);
    const selector = toManuscriptAnchorSelector(stored);

    expect(selector).toMatchObject({
      version: 1,
      exact: "target",
      prefix: "Before ",
      suffix: " after",
      originalRange: { start: 7, end: 13 },
      anchoredRevision: 4,
    });
    expect(selector.relativeStart).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(selector.relativeEnd).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(selector.relativeStart).not.toContain("=");
    expect(selector.relativeEnd).not.toContain("=");
    expect(isManuscriptAnchorSelector(selector)).toBe(true);
    expect(toManuscriptAnchorSelector(toStoredManuscriptAnchor(selector))).toEqual(selector);
    expect(resolveManuscriptAnchor(document, stored)).toEqual({
      status: "resolved",
      start: 7,
      end: 13,
      text: "target",
      exactMatch: true,
    });

    const longContext = `${"p".repeat(80)}target${"s".repeat(80)}`;
    const longDocument = documentWithSource(longContext);
    const contextual = createManuscriptAnchor(longDocument, 80, 86, 0);
    expect(contextual.prefix).toBe("p".repeat(64));
    expect(contextual.suffix).toBe("s".repeat(64));
  });

  it("survives edits followed by persistence and reconstruction", () => {
    const original = documentWithSource("Before target after");
    const selector = toManuscriptAnchorSelector(createManuscriptAnchor(original, 7, 13, 2));
    original.getText("source").insert(0, "New ");
    const restored = new Y.Doc();
    Y.applyUpdate(restored, Y.encodeStateAsUpdate(original));

    expect(resolveManuscriptAnchor(restored, selector)).toEqual({
      status: "resolved",
      start: 11,
      end: 17,
      text: "target",
      exactMatch: true,
    });
  });

  it("keeps insertions at both selection boundaries outside the anchor", () => {
    const document = documentWithSource("a target z");
    const stored = createManuscriptAnchor(document, 2, 8, 1);
    const source = document.getText("source");
    source.insert(2, "X");
    const shifted = resolveManuscriptAnchor(document, stored);
    expect(shifted).toMatchObject({ status: "resolved", start: 3, end: 9, text: "target", exactMatch: true });
    if (shifted.status === "resolved") source.insert(shifted.end, "Y");

    expect(resolveManuscriptAnchor(document, stored)).toEqual({
      status: "resolved",
      start: 3,
      end: 9,
      text: "target",
      exactMatch: true,
    });
  });

  it("resolves changed anchored text while reporting the failed exact match", () => {
    const document = documentWithSource("Before target after");
    const stored = createManuscriptAnchor(document, 7, 13, 1);
    const source = document.getText("source");
    source.delete(8, 1);
    source.insert(8, "X");

    expect(resolveManuscriptAnchor(document, stored)).toEqual({
      status: "resolved",
      start: 7,
      end: 13,
      text: "tXrget",
      exactMatch: false,
    });
  });

  it("marks deleted, missing, malformed, and wrong-type positions stale without fallback", () => {
    const deletedDocument = documentWithSource("Before target after");
    const deleted = createManuscriptAnchor(deletedDocument, 7, 13, 1);
    deletedDocument.getText("source").delete(7, 6);
    expect(resolveManuscriptAnchor(deletedDocument, deleted)).toEqual({ status: "stale" });

    const sourceDocument = documentWithSource("Before target after");
    const base = toManuscriptAnchorSelector(createManuscriptAnchor(sourceDocument, 7, 13, 1));
    expect(resolveManuscriptAnchor(sourceDocument, { ...base, relativeStart: null })).toEqual({ status: "stale" });
    expect(resolveManuscriptAnchor(sourceDocument, { ...base, relativeEnd: null })).toEqual({ status: "stale" });
    expect(resolveManuscriptAnchor(sourceDocument, { ...base, relativeStart: "not*base64url" })).toEqual({ status: "stale" });
    expect(
      resolveManuscriptAnchor(sourceDocument, {
        ...toStoredManuscriptAnchor(base),
        relativeStart: new Uint8Array([255]).buffer,
      }),
    ).toEqual({ status: "stale" });

    const wrongType = relativeSelectorForBibliography(sourceDocument, base);
    expect(resolveManuscriptAnchor(sourceDocument, wrongType)).toEqual({ status: "stale" });
    expect(resolveManuscriptAnchor(sourceDocument, { ...toStoredManuscriptAnchor(base), relativeStart: wrongType.relativeStart })).toEqual({
      status: "stale",
    });
    expect(resolveManuscriptAnchor(sourceDocument, { ...toStoredManuscriptAnchor(base), relativeEnd: wrongType.relativeEnd })).toEqual({
      status: "stale",
    });
    expect(resolveManuscriptAnchor(sourceDocument, { ...toStoredManuscriptAnchor(base), relativeStart: new ArrayBuffer(0) })).toEqual({
      status: "stale",
    });
    expect(
      resolveManuscriptAnchor(sourceDocument, {
        ...toStoredManuscriptAnchor(base),
        relativeStart: new ArrayBuffer(385),
      }),
    ).toEqual({ status: "stale" });

    const quoteOnly: ManuscriptAnchorSelector = { ...base, relativeStart: null, relativeEnd: null };
    expect(sourceDocument.getText("source").toString().slice(quoteOnly.originalRange.start, quoteOnly.originalRange.end)).toBe(
      quoteOnly.exact,
    );
    expect(resolveManuscriptAnchor(sourceDocument, quoteOnly)).toEqual({ status: "stale" });
  });

  it("validates selector and resolution representations", () => {
    const document = documentWithSource("Before target after");
    const selector = toManuscriptAnchorSelector(createManuscriptAnchor(document, 7, 13, 0));
    const resolution = resolveManuscriptAnchor(document, selector);

    expect(isManuscriptAnchorSelector(selector)).toBe(true);
    expect(isManuscriptAnchorSelector({ ...selector, version: 0 })).toBe(false);
    expect(isManuscriptAnchorSelector({ ...selector, relativeEnd: "=" })).toBe(false);
    expect(isManuscriptAnchorSelector({ ...selector, originalRange: { start: 4, end: 4 } })).toBe(false);
    expect(isManuscriptAnchorSelector({ ...selector, extra: true })).toBe(false);
    expect(isManuscriptAnchorSelector({ ...selector, originalRange: { ...selector.originalRange, extra: true } })).toBe(false);
    expect(isManuscriptAnchorResolution(resolution)).toBe(true);
    expect(isManuscriptAnchorResolution({ status: "stale" })).toBe(true);
    expect(isManuscriptAnchorResolution({ status: "stale", start: 7 })).toBe(false);
    expect(isManuscriptAnchorResolution({ ...resolution, end: "13" })).toBe(false);
    expect(isManuscriptAnchorResolution({ ...resolution, text: "short" })).toBe(false);
    expect(isManuscriptAnchorResolution({ ...resolution, extra: true })).toBe(false);
    expect(isManuscriptAnchorResolution({ status: "ambiguous" })).toBe(false);
    for (const change of [
      { relativeStart: "" },
      { relativeStart: "A" },
      { relativeStart: "x".repeat(513) },
      { exact: "" },
      { exact: "x".repeat(50_001) },
      { prefix: 1 },
      { prefix: "x".repeat(257) },
      { suffix: 1 },
      { suffix: "x".repeat(257) },
      { originalRange: null },
      { originalRange: { start: -1, end: 4 } },
      { originalRange: { start: 0.5, end: 4 } },
      { originalRange: { start: 0, end: "4" } },
      { anchoredRevision: -1 },
      { anchoredRevision: 0.5 },
      { anchoredRevision: "0" },
    ]) {
      expect(isManuscriptAnchorSelector({ ...selector, ...change }), JSON.stringify(change)).toBe(false);
    }
    expect(isManuscriptAnchorSelector(null)).toBe(false);
    expect(isManuscriptAnchorSelector([])).toBe(false);
    for (const invalid of [
      null,
      [],
      { status: "resolved", start: -1, end: 6, text: "target", exactMatch: true },
      { status: "resolved", start: 7.5, end: 13, text: "target", exactMatch: true },
      { status: "resolved", start: 7, end: 7, text: "", exactMatch: true },
      { status: "resolved", start: 7, end: 13, text: "target", exactMatch: "yes" },
    ]) {
      expect(isManuscriptAnchorResolution(invalid), JSON.stringify(invalid)).toBe(false);
    }
    expect(() => toStoredManuscriptAnchor({ ...selector, relativeStart: "A" })).toThrow("base64url");
    expect(() => createManuscriptAnchor(document, 13, 7, 0)).toThrow("range is invalid");
    expect(() => createManuscriptAnchor(document, -1, 7, 0)).toThrow("range is invalid");
    expect(() => createManuscriptAnchor(document, 0.5, 7, 0)).toThrow("range is invalid");
    expect(() => createManuscriptAnchor(document, 7, document.getText("source").length + 1, 0)).toThrow("range is invalid");
    expect(() => createManuscriptAnchor(document, 7, 13, -1)).toThrow("revision");
    expect(() => createManuscriptAnchor(document, 7, 13, 0.5)).toThrow("revision");
  });
});

function documentWithSource(value: string): Y.Doc {
  const document = new Y.Doc();
  document.getText("source").insert(0, value);
  return document;
}

function relativeSelectorForBibliography(document: Y.Doc, base: ManuscriptAnchorSelector): StoredManuscriptAnchor {
  const bibliography = document.getText("bibliography");
  bibliography.insert(0, "reference");
  return {
    version: 1,
    relativeStart: bytes(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(bibliography, 0, 0))),
    relativeEnd: bytes(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(bibliography, bibliography.length, -1))),
    exact: base.exact,
    prefix: base.prefix,
    suffix: base.suffix,
    originalRange: base.originalRange,
    anchoredRevision: base.anchoredRevision,
  };
}

function bytes(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}
