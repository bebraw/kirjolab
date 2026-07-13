import { describe, expect, it } from "vitest";
import {
  bibliographicSnapshot,
  compareWebSnapshotText,
  crossrefMetadataFields,
  extractWebDocument,
  isCrossrefLibraryPreview,
  isCrossrefMetadata,
  isReferenceLibrarySnapshot,
  likelyReferenceIdentity,
  memorableReferenceKey,
  missingRequiredBibliographicFields,
  normalizeWebSourceUrl,
  referenceFromBibTeX,
} from "./reference-library";

const provenance = { method: "bibtex", capturedAt: "2026-07-11T10:00:00.000Z", actor: "owner@example.test" } as const;
const capturedWebSnapshot = {
  id: "snapshot-1",
  referenceId: "reference-1",
  requestedUrl: "https://example.com/start#fragment",
  finalUrl: "https://example.com/article",
  accessedAt: "2026-07-12T10:30:00.000Z",
  status: 200,
  contentType: "text/html; charset=utf-8",
  rawObjectKey: "libraries/owner/web/snapshot-1/raw",
  readableObjectKey: "libraries/owner/web/snapshot-1/readable.txt",
  rawSize: 200,
  readableSize: 100,
  contentHash: "sha256:captured",
  title: "Captured title",
  authors: ["Captured Author"],
  publisher: "Captured Publisher",
  publishedAt: "2024-05-03",
  complete: false,
  diagnostics: ["Partial capture"],
  redirectChain: ["https://example.com/article"],
  etag: '"capture"',
  lastModified: "Fri, 03 May 2024 10:00:00 GMT",
} as const;

describe("shared reference library", () => {
  it("accepts only bounded, fingerprinted Crossref library previews", () => {
    const preview = {
      referenceId: "reference-1",
      doi: "10.5555/example",
      metadata: {
        type: "article",
        title: "Inspectable evidence",
        authors: ["Doe, Jane"],
        year: "2026",
        venue: "Open Research",
        doi: "10.5555/example",
        url: "https://doi.org/10.5555/example",
        abstract: "Evidence",
      },
      metadataFingerprint: "a".repeat(64),
    };
    expect(isCrossrefLibraryPreview(preview)).toBe(true);
    for (const metadataFingerprint of ["stale", "a".repeat(63), "a".repeat(65), "A".repeat(64)]) {
      expect(isCrossrefLibraryPreview({ ...preview, metadataFingerprint })).toBe(false);
    }
    expect(isCrossrefLibraryPreview({ ...preview, referenceId: 1 })).toBe(false);
    expect(isCrossrefLibraryPreview({ ...preview, doi: null })).toBe(false);
    expect(isCrossrefLibraryPreview({ ...preview, metadata: null })).toBe(false);

    expect(crossrefMetadataFields).toEqual(["type", "title", "authors", "year", "venue", "doi", "url", "abstract"]);
    const atBounds = {
      type: "x".repeat(100),
      title: "x".repeat(2_000),
      authors: Array.from({ length: 100 }, () => "x".repeat(500)),
      year: "x".repeat(100),
      venue: "x".repeat(2_000),
      doi: "x".repeat(500),
      url: "x".repeat(2_000),
      abstract: "x".repeat(20_000),
    };
    expect(isCrossrefMetadata(atBounds)).toBe(true);
    for (const metadata of [
      { ...atBounds, type: "" },
      { ...atBounds, type: "x".repeat(101) },
      { ...atBounds, type: null },
      { ...atBounds, title: "" },
      { ...atBounds, title: "x".repeat(2_001) },
      { ...atBounds, title: null },
      { ...atBounds, authors: "Doe, Jane" },
      { ...atBounds, authors: Array.from({ length: 101 }, () => "Doe, Jane") },
      { ...atBounds, authors: [1] },
      { ...atBounds, authors: ["x".repeat(501)] },
      { ...atBounds, year: "x".repeat(101) },
      { ...atBounds, year: null },
      { ...atBounds, venue: "x".repeat(2_001) },
      { ...atBounds, venue: null },
      { ...atBounds, doi: "" },
      { ...atBounds, doi: "x".repeat(501) },
      { ...atBounds, doi: null },
      { ...atBounds, url: "x".repeat(2_001) },
      { ...atBounds, url: null },
      { ...atBounds, abstract: "x".repeat(20_001) },
      { ...atBounds, abstract: null },
    ]) {
      expect(isCrossrefMetadata(metadata)).toBe(false);
    }
  });

  it("rejects Crossref author arrays when any provider name is invalid", () => {
    const metadata = {
      type: "article",
      title: "Evidence",
      authors: ["Doe, Jane"],
      year: "2026",
      venue: "Journal",
      doi: "10.5555/evidence",
      url: "https://doi.org/10.5555/evidence",
      abstract: "",
    };
    expect(isCrossrefMetadata({ ...metadata, authors: ["Doe, Jane", 1] })).toBe(false);
    expect(isCrossrefMetadata({ ...metadata, authors: ["Doe, Jane", { length: 1 }] })).toBe(false);
    expect(isCrossrefMetadata({ ...metadata, authors: ["Doe, Jane", "x".repeat(501)] })).toBe(false);
  });

  it("derives memorable reference keys from available metadata", () => {
    expect(memorableReferenceKey({ title: "Climate adaptation pathways", authors: ["Smith, Jane"], year: "2024" })).toBe("smith2024");
    expect(memorableReferenceKey({ title: "Climate adaptation pathways", authors: ["Jane Smith"], year: "2024" }, true)).toBe(
      "smith2024climate",
    );
    expect(memorableReferenceKey({ title: "Climate adaptation pathways.pdf", authors: [], year: "" })).toBe("sourceundatedclimate");
    expect(memorableReferenceKey({ title: "Über methods", authors: ["Jöhn Dœ"], year: "forthcoming" })).toBe("dœundateduber");
    expect(memorableReferenceKey({ title: "The study of climate", authors: ["Ada Mary van Rossum"], year: "Spring 2025" }, true)).toBe(
      "rossum2025study",
    );
    expect(memorableReferenceKey({ title: "Smith and the AI", authors: ["Smith,"], year: "x2025y" })).toBe("smith2025");
    expect(memorableReferenceKey({ title: "Smith and the AI", authors: ["Smith,"], year: "12025" })).toBe("smithundatedwork");
    expect(memorableReferenceKey({ title: "Smith and the AI", authors: ["Smith,"], year: "20251" })).toBe("smithundatedwork");
    expect(memorableReferenceKey({ title: "A study", authors: [" , Jane"], year: "" })).toBe("sourceundatedstudy");
    expect(memorableReferenceKey({ title: "The AI of an", authors: [], year: "" })).toBe("sourceundatedwork");
    expect(memorableReferenceKey({ title: "Map of evidence", authors: [" Jane Smith "], year: "2025" }, true)).toBe("smith2025map");
    expect(memorableReferenceKey({ title: "Evidence map", authors: [], year: "2025" })).toBe("source2025evidence");
    expect(memorableReferenceKey({ title: "x".repeat(100), authors: [], year: "" })).toHaveLength(80);
  });
  it("retains per-field provenance and derives a portable snapshot", () => {
    const record = referenceFromBibTeX(
      {
        type: "article",
        citationKey: "doe2026",
        fields: { title: "Evidence", author: "Doe, Jane", year: "2026", journal: "Research", doi: "https://doi.org/10.1/ABC" },
      },
      "reference-1",
      provenance,
    );
    expect(record.doi).toBe("10.1/abc");
    expect(record.provenance.title).toEqual(provenance);
    expect(missingRequiredBibliographicFields(record)).toEqual([]);
    expect(bibliographicSnapshot(record, "captured")).toMatchObject({
      referenceId: "reference-1",
      capturedAt: "captured",
      tombstone: false,
    });
    expect(bibliographicSnapshot(record, "captured")).toEqual({
      referenceId: "reference-1",
      type: "article",
      title: "Evidence",
      authors: ["Doe, Jane"],
      year: "2026",
      venue: "Research",
      doi: "10.1/abc",
      url: "",
      capturedAt: "captured",
      tombstone: false,
      webSnapshot: null,
    });
    expect(bibliographicSnapshot(record, "project-capture", capturedWebSnapshot)).toEqual({
      referenceId: "reference-1",
      type: "article",
      title: "Captured title",
      authors: ["Captured Author"],
      year: "2024",
      venue: "Captured Publisher",
      doi: "10.1/abc",
      url: "",
      capturedAt: "project-capture",
      tombstone: false,
      webSnapshot: {
        id: "snapshot-1",
        accessedAt: "2026-07-12T10:30:00.000Z",
        finalUrl: "https://example.com/article",
        contentHash: "sha256:captured",
        complete: false,
        diagnostics: ["Partial capture"],
      },
    });
    expect(
      bibliographicSnapshot(record, "project-capture", {
        ...capturedWebSnapshot,
        title: "",
        authors: [],
        publisher: "",
        publishedAt: "not dated",
      }),
    ).toMatchObject({ title: "Evidence", authors: [], year: "", venue: "", webSnapshot: { diagnostics: ["Partial capture"] } });
  });

  it("validates BibTeX type requirements without requiring a DOI", () => {
    const record = referenceFromBibTeX({ type: "article", citationKey: "draft", fields: { title: "Draft" } }, "draft", provenance);
    expect(missingRequiredBibliographicFields(record)).toEqual(["authors", "year", "venue"]);
    const manual = referenceFromBibTeX({ type: "manual", citationKey: "guide", fields: { title: "Guide" } }, "guide", provenance);
    expect(missingRequiredBibliographicFields(manual)).toEqual([]);
  });

  it("deduplicates by DOI before a normalized bibliographic fingerprint", () => {
    const first = { title: "A Study", authors: ["Doe, Jane"], year: "2026", doi: "10.1/ABC" };
    const second = { title: "Different", authors: [], year: "", doi: "https://doi.org/10.1/abc" };
    expect(likelyReferenceIdentity(first)).toBe("doi:10.1/abc");
    expect(likelyReferenceIdentity(first)).toBe(likelyReferenceIdentity(second));
    expect(likelyReferenceIdentity({ ...first, doi: "" })).toBe("work:a study|2026|doe jane");
    expect(likelyReferenceIdentity({ title: " Étude—One! ", authors: ["Ångström, Ada"], year: " 2025 ", doi: "" })).toBe(
      "work:e tude one|2025|a ngstro m ada",
    );
  });

  it("covers BibTeX type-specific required fields", () => {
    const complete = {
      id: "record",
      type: "article",
      title: "Title",
      authors: ["Author"],
      year: "2026",
      venue: "Venue",
      doi: "",
      url: "",
      abstract: "",
      provenance: {},
      archivedAt: null,
      deletedAt: null,
      createdAt: provenance.capturedAt,
      updatedAt: provenance.capturedAt,
    } as const;
    for (const type of ["article", "book", "inbook", "incollection", "inproceedings", "mastersthesis", "phdthesis", "techreport"]) {
      expect(missingRequiredBibliographicFields({ ...complete, type }), type).toEqual([]);
    }
    expect(missingRequiredBibliographicFields({ ...complete, type: "proceedings", authors: [], venue: "" })).toEqual([]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "unpublished", year: "", venue: "" })).toEqual([]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "unknown", authors: [], year: "", venue: "" })).toEqual([]);
    expect(missingRequiredBibliographicFields({ ...complete, authors: [] })).toEqual(["authors"]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "article", title: " ", authors: [], year: "", venue: "" })).toEqual([
      "title",
      "authors",
      "year",
      "venue",
    ]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "book", title: "", authors: [], year: "", venue: "" })).toEqual([
      "title",
      "authors",
      "year",
      "venue",
    ]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "inbook", title: "", authors: [], year: "", venue: "" })).toEqual([
      "title",
      "authors",
      "year",
      "venue",
    ]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "incollection", title: "", authors: [], year: "", venue: "" })).toEqual([
      "title",
      "authors",
      "year",
      "venue",
    ]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "inproceedings", title: "", authors: [], year: "", venue: "" })).toEqual(
      ["title", "authors", "year", "venue"],
    );
    expect(missingRequiredBibliographicFields({ ...complete, type: "manual", title: "" })).toEqual(["title"]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "mastersthesis", title: "", authors: [], year: "", venue: "" })).toEqual(
      ["title", "authors", "year", "venue"],
    );
    expect(missingRequiredBibliographicFields({ ...complete, type: "misc", title: "" })).toEqual(["title"]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "phdthesis", title: "", authors: [], year: "", venue: "" })).toEqual([
      "title",
      "authors",
      "year",
      "venue",
    ]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "proceedings", title: "", year: "" })).toEqual(["title", "year"]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "techreport", title: "", authors: [], year: "", venue: "" })).toEqual([
      "title",
      "authors",
      "year",
      "venue",
    ]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "unpublished", title: "", authors: [] })).toEqual(["title", "authors"]);
  });

  it("validates complete private-library snapshots and rejects malformed boundaries", () => {
    const record = referenceFromBibTeX({ type: "manual", citationKey: "guide", fields: { title: "Guide" } }, "guide", provenance);
    const valid = {
      references: [record],
      referenceKeyStates: { [record.id]: "final" },
      artifacts: [],
      webSources: [],
      webSnapshots: [],
      notes: [],
      highlights: [],
      tags: {},
      collections: {},
      reading: [],
    };
    expect(isReferenceLibrarySnapshot(valid)).toBe(true);
    for (const change of [
      {},
      { references: null },
      { references: [{ ...record, id: 1 }] },
      { references: [{ ...record, authors: [1] }] },
      { references: [{ ...record, provenance: null }] },
      { references: [{ ...record, archivedAt: 1 }] },
      { references: [{ ...record, deletedAt: 1 }] },
      { referenceKeyStates: null },
      { referenceKeyStates: { [record.id]: "mutable" } },
      { artifacts: null },
      { webSources: null },
      { webSnapshots: null },
      { notes: null },
      { highlights: null },
      { tags: [] },
      { tags: { [record.id]: [1] } },
      { collections: [] },
      { collections: { [record.id]: [1] } },
      { reading: null },
    ]) {
      const candidate = Object.keys(change).length === 0 ? [] : { ...valid, ...change };
      expect(isReferenceLibrarySnapshot(candidate), JSON.stringify(change)).toBe(false);
    }
    const reading = { referenceId: record.id, status: "reading", rating: 4, priority: "high", updatedAt: "now" } as const;
    expect(isReferenceLibrarySnapshot({ ...valid, reading: [reading] })).toBe(true);
    for (const status of ["unread", "read"] as const) {
      expect(isReferenceLibrarySnapshot({ ...valid, reading: [{ ...reading, status }] })).toBe(true);
    }
    for (const priority of ["low", "normal"] as const) {
      expect(isReferenceLibrarySnapshot({ ...valid, reading: [{ ...reading, priority }] })).toBe(true);
    }
    expect(isReferenceLibrarySnapshot({ ...valid, reading: [{ ...reading, rating: null }] })).toBe(true);
    for (const change of [
      { referenceId: 1 },
      { status: "queued" },
      { rating: "4" },
      { rating: 0 },
      { rating: 6 },
      { rating: 1.5 },
      { priority: "urgent" },
      { updatedAt: 1 },
    ]) {
      expect(isReferenceLibrarySnapshot({ ...valid, reading: [{ ...reading, ...change }] }), JSON.stringify(change)).toBe(false);
    }
    expect(isReferenceLibrarySnapshot(null)).toBe(false);
    expect(bibliographicSnapshot({ ...record, deletedAt: "deleted" }, "snapshot")).toMatchObject({
      referenceId: "guide",
      capturedAt: "snapshot",
      tombstone: true,
    });

    const webValid = {
      ...valid,
      webSources: [
        {
          referenceId: record.id,
          canonicalUrl: "https://example.com/article",
          createdAt: provenance.capturedAt,
          updatedAt: provenance.capturedAt,
        },
      ],
      webSnapshots: [{ ...capturedWebSnapshot, referenceId: record.id }],
    };
    expect(isReferenceLibrarySnapshot(webValid)).toBe(true);
    for (const [field, invalid] of Object.entries({
      id: 1,
      referenceId: 1,
      requestedUrl: 1,
      finalUrl: 1,
      accessedAt: 1,
      status: "200",
      contentType: 1,
      rawObjectKey: 1,
      readableObjectKey: 1,
      rawSize: "200",
      readableSize: "100",
      contentHash: 1,
      title: 1,
      authors: [1],
      publisher: 1,
      publishedAt: 1,
      complete: "yes",
      diagnostics: [1],
      redirectChain: [1],
      etag: 1,
      lastModified: 1,
    })) {
      expect(
        isReferenceLibrarySnapshot({ ...webValid, webSnapshots: [{ ...capturedWebSnapshot, referenceId: record.id, [field]: invalid }] }),
        field,
      ).toBe(false);
    }
    for (const [field, invalid] of Object.entries({ referenceId: 1, canonicalUrl: 1, createdAt: 1, updatedAt: 1 })) {
      expect(isReferenceLibrarySnapshot({ ...webValid, webSources: [{ ...webValid.webSources[0], [field]: invalid }] }), field).toBe(false);
    }
  });

  it("normalizes public web identities and rejects credentialed or private destinations", () => {
    expect(normalizeWebSourceUrl(" HTTPS://Example.com:443/article#section ")).toBe("https://example.com/article");
    expect(normalizeWebSourceUrl("http://8.8.8.8/source?version=1#old")).toBe("http://8.8.8.8/source?version=1");
    expect(normalizeWebSourceUrl("https://[2606:4700:4700::1111]/source")).toBe("https://[2606:4700:4700::1111]/source");
    expect(normalizeWebSourceUrl("http://example.com:80/source")).toBe("http://example.com/source");
    expect(normalizeWebSourceUrl("https://fcdomain.com/source")).toBe("https://fcdomain.com/source");
    for (const [url, message] of [
      ["file:///tmp/source", "Web source URL must use HTTP or HTTPS"],
      ["https://user:secret@example.com/", "Web source URL must not contain credentials"],
      ["https://example.com:8443/source", "Web source URL must use a standard HTTP port"],
      ["http://localhost/source", "Web source URL must resolve to a public host"],
    ] as const) {
      expect(() => normalizeWebSourceUrl(url), url).toThrow(message);
    }
    for (const url of [
      "http://localhost/source",
      "http://127.0.0.1/source",
      "http://10.0.0.1/source",
      "http://192.168.1.1/source",
      "http://0.0.0.0/source",
      "http://100.64.0.1/source",
      "http://169.254.2.1/source",
      "http://172.31.255.255/source",
      "http://192.0.0.1/source",
      "http://198.18.0.1/source",
      "http://224.0.0.1/source",
      "http://[::1]/source",
      "http://[fc00::1]/source",
      "http://[fe80::1]/source",
      "http://service.internal/source",
      "http://printer.local/source",
    ]) {
      expect(() => normalizeWebSourceUrl(url), url).toThrow();
    }
    for (const url of [
      "http://100.63.255.255/source",
      "http://100.128.0.0/source",
      "http://169.253.255.255/source",
      "http://169.255.0.0/source",
      "http://172.15.255.255/source",
      "http://172.32.0.0/source",
      "http://191.255.255.255/source",
      "http://198.17.255.255/source",
      "http://198.20.0.0/source",
      "http://223.255.255.255/source",
    ]) {
      expect(normalizeWebSourceUrl(url), url).toBe(url);
    }
  });

  it("extracts citation metadata and readable text without retaining executable markup", () => {
    const extraction = extractWebDocument(
      `<!doctype html><html><head>
        <title>Fallback title</title>
        <meta property="og:title" content="Captured &amp; inspectable">
        <meta name="author" content="Ada Writer">
        <meta property="og:site_name" content="Research Notes">
        <meta property="article:published_time" content="2026-07-12">
        <style>secret style</style><script>secret script</script>
      </head><body><main><h1>Captured evidence</h1><p>One idea.</p><p>Another idea.</p></main></body></html>`,
      "text/html; charset=utf-8",
    );
    expect(extraction).toMatchObject({
      title: "Captured & inspectable",
      authors: ["Ada Writer"],
      publisher: "Research Notes",
      publishedAt: "2026-07-12",
    });
    expect(extraction.readableText).toContain("Captured evidence\nOne idea.\nAnother idea.");
    expect(extraction.readableText).not.toMatch(/secret|<script/iu);
    expect(
      extractWebDocument(
        `<html><head><title>Fallback <em>title</em></title><meta name=author content=Writer><meta name="author" content="Writer"><meta name="application-name" content="Publisher"><meta name="date" content="2024"></head><body>Before<br>After<hr><section>Section</section>${" enough".repeat(20)}</body></html>`,
        " TEXT/HTML ; charset=utf-8 ",
      ),
    ).toMatchObject({
      title: "Fallback title",
      authors: ["Writer"],
      publisher: "Publisher",
      publishedAt: "2024",
      diagnostics: [],
    });
    expect(extractWebDocument("  first\r\n\r\n\tsecond  \rthird ", "text/plain; charset=utf-8")).toEqual({
      title: "",
      authors: [],
      publisher: "",
      publishedAt: "",
      readableText: "first\n\nsecond\nthird",
      diagnostics: ["Plain-text sources do not expose structured citation metadata."],
    });
    expect(extractWebDocument("binary", "application/pdf")).toEqual({
      title: "",
      authors: [],
      publisher: "",
      publishedAt: "",
      readableText: "",
      diagnostics: ["application/pdf cannot be extracted as readable web text."],
    });
    expect(extractWebDocument("binary", "")).toMatchObject({
      readableText: "",
      diagnostics: ["Unknown media type cannot be extracted as readable web text."],
    });
    const sparse = extractWebDocument(
      `<html><head><title>Fallback &#x54;itle</title><meta content='Second Author' name='citation_author'><meta name='dc.date' content='2025'></head><body>&#99999999; short</body></html>`,
      "application/xhtml+xml",
    );
    expect(sparse).toMatchObject({ title: "Fallback Title", authors: ["Second Author"], publishedAt: "2025" });
    expect(sparse.readableText).toBe("Fallback Title &#99999999; short");
    expect(sparse.diagnostics).toEqual(["Very little readable text was extracted; the page may require scripts or authentication."]);
    expect(extractWebDocument("<html><body>short</body></html>", "text/html").diagnostics).toEqual([
      "No page title was detected; enter one before saving the source.",
      "Very little readable text was extracted; the page may require scripts or authentication.",
    ]);
    expect(extractWebDocument("<html><head><title>&#0; &bogus;</title></head><body>text</body></html>", "text/html").title).toBe(
      "\u0000 &bogus;",
    );
  });

  it("compares readable captures as neutral line additions and removals", () => {
    expect(compareWebSnapshotText("same\ntext", "same\ntext")).toMatchObject({ identical: true, addedLines: 0, removedLines: 0 });
    expect(compareWebSnapshotText("Heading\nOld claim\nShared", "Heading\nNew claim\nShared\nAppendix")).toMatchObject({
      identical: false,
      addedLines: 2,
      removedLines: 1,
      hunks: [
        { beforeLine: 2, afterLine: 2, removed: ["Old claim"], added: ["New claim"] },
        { beforeLine: 4, afterLine: 4, removed: [], added: ["Appendix"] },
      ],
    });
    expect(compareWebSnapshotText("A\nB", "X\nA\nB")).toMatchObject({
      addedLines: 1,
      removedLines: 0,
      hunks: [{ beforeLine: 1, afterLine: 1, removed: [], added: ["X"], truncated: false }],
    });
    expect(compareWebSnapshotText("A\nB\nC", "A\nC")).toMatchObject({
      addedLines: 0,
      removedLines: 1,
      hunks: [{ beforeLine: 2, afterLine: 2, removed: ["B"], added: [], truncated: false }],
    });
    const manyBefore = Array.from({ length: 30 }, (_, index) => `before-${index}`).join("\n");
    const manyAfter = Array.from({ length: 30 }, (_, index) => `after-${index}`).join("\n");
    expect(compareWebSnapshotText(manyBefore, manyAfter)).toMatchObject({
      beforeLines: 30,
      afterLines: 30,
      addedLines: 30,
      removedLines: 30,
      hunks: [{ beforeLine: 1, afterLine: 1, truncated: true }],
    });
    const segmentedBefore = Array.from({ length: 102 }, (_, index) => [`old-${index}`, `shared-${index}`])
      .flat()
      .join("\n");
    const segmentedAfter = Array.from({ length: 102 }, (_, index) => [`new-${index}`, `shared-${index}`])
      .flat()
      .join("\n");
    const capped = compareWebSnapshotText(segmentedBefore, segmentedAfter);
    expect(capped).toMatchObject({ identical: false, beforeLines: 204, afterLines: 204, addedLines: 105, removedLines: 105 });
    expect(capped.hunks).toHaveLength(101);
    expect(capped.hunks.at(-1)).toMatchObject({ beforeLine: 200, afterLine: 200, truncated: true });
  });
});
