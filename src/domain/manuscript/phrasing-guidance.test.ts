import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import inventory from "../../../phrasing-guidance/inventory.json";
import sources from "../../../phrasing-guidance/sources.json";
import {
  isPhrasingPurposeId,
  phrasingGuidanceRelease,
  phrasingPatternsForPurpose,
  phrasingPurposes,
  validatePhrasingGuidanceArtifacts,
} from "./phrasing-guidance";

const attributionPath = "phrasing-guidance/ATTRIBUTION.md";
const validAttribution = "Inventory 2026-07-17.2; CC BY; see sources.json";

function expectInvalid(inventoryValue: unknown, ledgerValue: unknown, attribution: string, message: string): void {
  expect(() => validatePhrasingGuidanceArtifacts(inventoryValue, ledgerValue, attribution)).toThrow(message);
}

describe("phrasing guidance inventory", () => {
  it("exposes the reviewed release without source metadata", () => {
    expect(phrasingGuidanceRelease()).toEqual({
      inventoryVersion: "2026-07-17.2",
      extractionVersion: "plos-jats-patterns-v2",
      reviewedAt: "2026-07-17",
    });
    expect(phrasingPurposes().map(({ id }) => id)).toEqual([
      "qualify-claim",
      "contrast-findings",
      "introduce-evidence",
      "state-limitation",
    ]);
    expect(phrasingPatternsForPurpose("qualify-claim")).toEqual([
      { id: "qualify-suggests", purposeId: "qualify-claim", template: "These findings suggest that {claim}." },
    ]);
    expect(JSON.stringify(phrasingPatternsForPurpose("qualify-claim"))).not.toContain("10.1371");
  });

  it("bounds pattern selection and purpose parsing", () => {
    expect(phrasingPatternsForPurpose("qualify-claim", 0)).toEqual([]);
    expect(phrasingPatternsForPurpose("qualify-claim", -1)).toEqual([]);
    expect(phrasingPatternsForPurpose("qualify-claim", 0.9)).toEqual([]);
    expect(phrasingPatternsForPurpose("qualify-claim", 999)).toHaveLength(1);
    expect(phrasingPatternsForPurpose("qualify-claim", Number.NaN)).toEqual([]);
    expect(isPhrasingPurposeId("state-limitation")).toBe(true);
    expect(isPhrasingPurposeId("make-grand-claim")).toBe(false);
    expect(isPhrasingPurposeId(null)).toBe(false);
  });

  it("validates licences, provenance, recurrence, similarity review, and attribution", async () => {
    const attribution = await readFile(attributionPath, "utf8");
    expect(() => validatePhrasingGuidanceArtifacts(inventory, sources, attribution)).not.toThrow();
  });

  it("includes PLOS Computational Biology evidence for every rhetorical purpose", () => {
    const computationalSourceIds = new Set(
      sources.sources.filter(({ venue }) => venue === "PLOS Computational Biology").map(({ id }) => id),
    );

    for (const pattern of inventory.patterns) {
      expect(pattern.sourceIds.some((sourceId) => computationalSourceIds.has(sourceId))).toBe(true);
    }
  });

  it("fails closed on a disallowed licence", async () => {
    const changed = structuredClone(sources);
    changed.sources[0]!.license = "CC-BY-NC-4.0";
    const attribution = await readFile(attributionPath, "utf8");
    expect(() => validatePhrasingGuidanceArtifacts(inventory, changed, attribution)).toThrow("disallowed licence");
  });

  it("rejects stale similarity review and non-reciprocal provenance", async () => {
    const stale = structuredClone(inventory);
    stale.patterns[0]!.review.extractionVersion = "older-extraction";
    const unlinked = structuredClone(sources);
    unlinked.sources[0]!.patternIds = ["limitation-interpreted-light"];
    const attribution = await readFile(attributionPath, "utf8");
    expect(() => validatePhrasingGuidanceArtifacts(stale, sources, attribution)).toThrow("similarity review is stale");
    expect(() => validatePhrasingGuidanceArtifacts(inventory, unlinked, attribution)).toThrow("does not reciprocate");
  });

  it("rejects malformed inventory envelope fields", () => {
    expectInvalid(null, sources, validAttribution, "Inventory must be an object");
    expectInvalid([], sources, validAttribution, "Inventory must be an object");
    expectInvalid({ ...inventory, schemaVersion: 2 }, sources, validAttribution, "Inventory schema version must be 1");
    expectInvalid({ ...inventory, inventoryVersion: "" }, sources, validAttribution, "Inventory version must be a bounded string");
    expectInvalid(
      { ...inventory, extractionVersion: "x".repeat(81) },
      sources,
      validAttribution,
      "Extraction version must be a bounded string",
    );
    expectInvalid({ ...inventory, reviewedAt: "2026-13-01" }, sources, validAttribution, "Inventory review date is invalid");
    expectInvalid({ ...inventory, reviewedAt: "17-07-2026" }, sources, validAttribution, "Inventory review date is invalid");
    expectInvalid({ ...inventory, taxonomy: null }, sources, validAttribution, "Taxonomy must be an array");
    expectInvalid({ ...inventory, patterns: null }, sources, validAttribution, "Patterns must be an array");
  });

  it("enforces the complete unique purpose taxonomy", () => {
    const duplicate = structuredClone(inventory);
    duplicate.taxonomy[1]!.id = duplicate.taxonomy[0]!.id;
    expectInvalid(duplicate, sources, validAttribution, "Purpose ids must be unique");

    expectInvalid(
      { ...inventory, taxonomy: inventory.taxonomy.slice(0, 3) },
      sources,
      validAttribution,
      "Inventory must define every allowlisted rhetorical purpose once",
    );
    expectInvalid(
      { ...inventory, taxonomy: [null, ...inventory.taxonomy.slice(1)] },
      sources,
      validAttribution,
      "Purpose must be an object",
    );
    expectInvalid(
      { ...inventory, taxonomy: [{ ...inventory.taxonomy[0], id: "unknown" }, ...inventory.taxonomy.slice(1)] },
      sources,
      validAttribution,
      "Phrasing purpose is not allowlisted",
    );
    expectInvalid(
      { ...inventory, taxonomy: [{ ...inventory.taxonomy[0], label: "" }, ...inventory.taxonomy.slice(1)] },
      sources,
      validAttribution,
      "Purpose label must be a bounded string",
    );
    expectInvalid(
      { ...inventory, taxonomy: [{ ...inventory.taxonomy[0], description: "x".repeat(241) }, ...inventory.taxonomy.slice(1)] },
      sources,
      validAttribution,
      "Purpose description must be a bounded string",
    );
  });

  it("enforces pattern identity, purpose, template, and slots", () => {
    const first = inventory.patterns[0]!;
    const second = inventory.patterns[1]!;
    expectInvalid(
      { ...inventory, patterns: [{ ...first, id: second.id }, ...inventory.patterns.slice(1)] },
      sources,
      validAttribution,
      "Pattern ids must be unique",
    );
    expectInvalid(
      { ...inventory, patterns: [{ ...first, id: "Not_Kebab" }, ...inventory.patterns.slice(1)] },
      sources,
      validAttribution,
      "Pattern id must be kebab-case",
    );
    expectInvalid(
      { ...inventory, patterns: [{ ...first, purposeId: "unknown" }, ...inventory.patterns.slice(1)] },
      sources,
      validAttribution,
      `Pattern ${first.id} has an unknown purpose`,
    );
    expectInvalid(
      { ...inventory, patterns: [{ ...first, template: "" }, ...inventory.patterns.slice(1)] },
      sources,
      validAttribution,
      "Pattern template must be a bounded string",
    );
    expectInvalid(
      { ...inventory, patterns: [{ ...first, slots: null }, ...inventory.patterns.slice(1)] },
      sources,
      validAttribution,
      "Pattern slots must be an array",
    );
    expectInvalid(
      { ...inventory, patterns: [{ ...first, slots: [null] }, ...inventory.patterns.slice(1)] },
      sources,
      validAttribution,
      "Pattern slot must be an object",
    );
    expectInvalid(
      { ...inventory, patterns: [{ ...first, slots: [{ name: "Claim", type: "clause" }] }, ...inventory.patterns.slice(1)] },
      sources,
      validAttribution,
      "Slot name must be kebab-case",
    );
    expectInvalid(
      { ...inventory, patterns: [{ ...first, slots: [{ name: "claim", type: "word" }] }, ...inventory.patterns.slice(1)] },
      sources,
      validAttribution,
      `Pattern ${first.id} has an unknown slot type`,
    );
    expectInvalid(
      {
        ...inventory,
        patterns: [{ ...first, template: "{claim} and {claim}", slots: [...first.slots, ...first.slots] }, ...inventory.patterns.slice(1)],
      },
      sources,
      validAttribution,
      `Slot names for ${first.id} must be unique`,
    );
    expectInvalid(
      { ...inventory, patterns: [{ ...first, template: "No placeholder." }, ...inventory.patterns.slice(1)] },
      sources,
      validAttribution,
      `Pattern ${first.id} slots must exactly match its ordered placeholders`,
    );
    expectInvalid(
      {
        ...inventory,
        patterns: [{ ...first, template: "{other}", slots: [{ name: "claim", type: "clause" }] }, ...inventory.patterns.slice(1)],
      },
      sources,
      validAttribution,
      `Pattern ${first.id} slots must exactly match its ordered placeholders`,
    );
  });

  it("enforces pattern approval and review metadata", () => {
    const first = inventory.patterns[0]!;
    const replaceReview = (review: Record<string, unknown>): unknown => ({
      ...inventory,
      patterns: [{ ...first, review }, ...inventory.patterns.slice(1)],
    });

    expectInvalid(
      replaceReview({ ...first.review, decision: "rejected" }),
      sources,
      validAttribution,
      `Pattern ${first.id} is not approved`,
    );
    expectInvalid(
      replaceReview({ ...first.review, distinctiveSourceLanguage: true }),
      sources,
      validAttribution,
      `Pattern ${first.id} is not approved`,
    );
    expectInvalid(
      replaceReview({ ...first.review, reviewedBy: "" }),
      sources,
      validAttribution,
      "Pattern reviewer must be a bounded string",
    );
    expectInvalid(
      replaceReview({ ...first.review, method: "" }),
      sources,
      validAttribution,
      "Similarity review method must be a bounded string",
    );
    expectInvalid(
      replaceReview({ ...first.review, extractionVersion: "old" }),
      sources,
      validAttribution,
      `Pattern ${first.id} similarity review is stale`,
    );
    expectInvalid(
      { ...inventory, patterns: [{ ...first, sourceIds: first.sourceIds.slice(0, 2) }, ...inventory.patterns.slice(1)] },
      sources,
      validAttribution,
      "Pattern source ids must contain 3 to 20 values",
    );
  });

  it("validates ledger envelope, retrieval service, and attribution independently", () => {
    expectInvalid(inventory, null, validAttribution, "Source ledger must be an object");
    expectInvalid(inventory, { ...sources, schemaVersion: 2 }, validAttribution, "Source ledger schema version must be 1");
    expectInvalid(inventory, { ...sources, inventoryVersion: "old" }, validAttribution, "Inventory and source ledger versions must match");
    expectInvalid(inventory, { ...sources, retrievalService: null }, validAttribution, "Retrieval service must be an object");
    expectInvalid(
      inventory,
      { ...sources, retrievalService: { ...sources.retrievalService, name: "" } },
      validAttribution,
      "Retrieval service name must be a bounded string",
    );
    expectInvalid(
      inventory,
      { ...sources, retrievalService: { ...sources.retrievalService, url: "http://example.com" } },
      validAttribution,
      "Retrieval service URL must use HTTPS",
    );
    expectInvalid(inventory, { ...sources, sources: null }, validAttribution, "Sources must be an array");
    expectInvalid(inventory, sources, "CC BY; sources.json", "Attribution must identify the inventory, CC BY terms, and source ledger");
    expectInvalid(
      inventory,
      sources,
      "2026-07-17.2; sources.json",
      "Attribution must identify the inventory, CC BY terms, and source ledger",
    );
    expectInvalid(inventory, sources, "2026-07-17.2; CC BY", "Attribution must identify the inventory, CC BY terms, and source ledger");
  });

  it("enforces source identity, metadata, retrieval, and pattern ids", () => {
    const first = sources.sources[0]!;
    const replaceFirst = (changed: Record<string, unknown>): unknown => ({
      ...sources,
      sources: [{ ...first, ...changed }, ...sources.sources.slice(1)],
    });

    expectInvalid(inventory, replaceFirst({ id: sources.sources[1]!.id }), validAttribution, "Source ids must be unique");
    expectInvalid(inventory, replaceFirst({ id: "Not_Kebab" }), validAttribution, "Source id must be kebab-case");
    expectInvalid(inventory, replaceFirst({ doi: "" }), validAttribution, "Source DOI must be a bounded string");
    expectInvalid(inventory, replaceFirst({ title: "" }), validAttribution, "Source title must be a bounded string");
    expectInvalid(inventory, replaceFirst({ authors: [] }), validAttribution, "Source authors must contain 1 to 100 values");
    expectInvalid(
      inventory,
      replaceFirst({ authors: ["Jane Doe", "Jane-Doe"] }),
      validAttribution,
      `Authors for ${first.id} must be unique`,
    );
    expectInvalid(inventory, replaceFirst({ venue: "" }), validAttribution, "Source venue must be a bounded string");
    expectInvalid(inventory, replaceFirst({ license: "MIT" }), validAttribution, `Source ${first.id} has a disallowed licence`);
    expectInvalid(inventory, replaceFirst({ retrieval: null }), validAttribution, "Source retrieval must be an object");
    expectInvalid(
      inventory,
      replaceFirst({ retrieval: { ...first.retrieval, route: "manual" } }),
      validAttribution,
      `Source ${first.id} has an undesignated retrieval route`,
    );
    expectInvalid(
      inventory,
      replaceFirst({ retrieval: { ...first.retrieval, url: "http://example.com" } }),
      validAttribution,
      "Source retrieval URL must use HTTPS",
    );
    expectInvalid(
      inventory,
      replaceFirst({ retrieval: { ...first.retrieval, retrievedAt: "yesterday" } }),
      validAttribution,
      "Source retrieval date is invalid",
    );
    expectInvalid(inventory, replaceFirst({ patternIds: [] }), validAttribution, "Source pattern ids must contain 1 to 20 values");
    expectInvalid(
      inventory,
      replaceFirst({ patternIds: [first.patternIds[0], first.patternIds[0]] }),
      validAttribution,
      `Pattern ids for ${first.id} must be unique`,
    );
  });

  it("rejects incomplete, conflicting, and non-reciprocal provenance graphs", () => {
    const firstPattern = inventory.patterns[0]!;
    const duplicateSource = structuredClone(inventory);
    duplicateSource.patterns[0]!.sourceIds[1] = duplicateSource.patterns[0]!.sourceIds[0]!;
    expectInvalid(duplicateSource, sources, validAttribution, `Source ids for ${firstPattern.id} must be unique`);

    const unknownSource = structuredClone(inventory);
    unknownSource.patterns[0]!.sourceIds[0] = "unknown-source";
    expectInvalid(unknownSource, sources, validAttribution, `Pattern ${firstPattern.id} references unknown source unknown-source`);

    const sameVenue = structuredClone(sources);
    for (const source of sameVenue.sources) {
      if (firstPattern.sourceIds.includes(source.id)) source.venue = "One Venue";
    }
    expectInvalid(inventory, sameVenue, validAttribution, `Pattern ${firstPattern.id} requires at least two venues`);

    const sharedAuthor = structuredClone(sources);
    const supporting = sharedAuthor.sources.filter(({ id }) => firstPattern.sourceIds.includes(id));
    supporting[1]!.authors[0] = supporting[0]!.authors[0]!;
    expectInvalid(inventory, sharedAuthor, validAttribution, `Pattern ${firstPattern.id} sources must have independent author groups`);

    const unknownPattern = structuredClone(sources);
    unknownPattern.sources[0]!.patternIds.push("unknown-pattern");
    expectInvalid(
      inventory,
      unknownPattern,
      validAttribution,
      `Source ${unknownPattern.sources[0]!.id} references unknown pattern unknown-pattern`,
    );

    const missingBacklink = structuredClone(inventory);
    missingBacklink.patterns[0]!.sourceIds = missingBacklink.patterns[0]!.sourceIds.slice(1);
    expectInvalid(
      missingBacklink,
      sources,
      validAttribution,
      `Pattern ${firstPattern.id} does not reciprocate source ${sources.sources[0]!.id}`,
    );
  });
});
