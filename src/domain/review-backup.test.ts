import { describe, expect, it } from "vitest";
import { buildReviewSynthesis } from "./review-synthesis";
import { defaultReviewProtocol, materializeProtocolRevision } from "./review-study";
import {
  materializeReviewBackupArtifact,
  maximumReviewBackupPayloadBytes,
  parseReviewBackupPayload,
  parseReviewBackupReference,
  reviewBackupPayloadDigest,
  reviewBackupPayloadJson,
  reviewBackupPayloadKey,
  reviewBackupSchemaVersion,
  reviewBackupTableNames,
  type ReviewStudyBackupPayload,
  verifyReviewBackupPayload,
} from "./review-backup";
import type { ReviewExportAuthority } from "./review-export";
import { sha256Text } from "./sha256";

const ownerKey = "a".repeat(64);

describe("review backup payload", () => {
  it("canonicalizes versioned table rows independently of insertion order", async () => {
    const payload = backupPayload();
    const reordered = {
      ...payload,
      tables: [...payload.tables]
        .reverse()
        .map((table) => ({ name: table.name, rows: [...table.rows].reverse().map((row) => reverseRecord(row)) })),
    } satisfies ReviewStudyBackupPayload;

    expect(reviewBackupPayloadJson(reordered)).toBe(reviewBackupPayloadJson(payload));
    expect(await reviewBackupPayloadDigest(reordered)).toBe(await reviewBackupPayloadDigest(payload));
    expect(reviewBackupPayloadJson(payload).endsWith("\n")).toBe(true);
    expect(parseReviewBackupPayload(reviewBackupPayloadJson(reordered))).toEqual(
      parseReviewBackupPayload(reviewBackupPayloadJson(payload)),
    );

    const changed = backupPayload("Changed objective");
    expect(await reviewBackupPayloadDigest(changed)).not.toBe(await reviewBackupPayloadDigest(payload));
    expect(
      parseReviewBackupPayload(reviewBackupPayloadJson({ ...payload, reviewRevision: 1, protocolRevision: 1, historyFloorRevision: 1 })),
    ).toMatchObject({
      reviewRevision: 1,
      protocolRevision: 1,
      historyFloorRevision: 1,
    });
    expect(
      parseReviewBackupPayload(reviewBackupPayloadJson({ ...payload, reviewRevision: 1, protocolRevision: 1, historyFloorRevision: 0 })),
    ).toMatchObject({
      historyFloorRevision: 0,
    });
  });

  it("materializes an owner-scoped content-addressed reference with exact authority identity", async () => {
    const payload = backupPayload();
    const artifact = await materializeReviewBackupArtifact(ownerKey, payload, exportAuthority());

    expect(artifact.reference).toMatchObject({
      schemaVersion: reviewBackupSchemaVersion,
      backupKey: `backups/reviews/${ownerKey}/${artifact.reference.payloadDigest}.json`,
      byteCount: new TextEncoder().encode(artifact.body).byteLength,
      reviewRevision: payload.reviewRevision,
      protocolRevision: payload.protocolRevision,
      historyFloorRevision: payload.historyFloorRevision,
    });
    expect(artifact.reference.payloadDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(artifact.reference.authorityDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(parseReviewBackupReference(artifact.reference, ownerKey)).toEqual(artifact.reference);
    await expect(verifyReviewBackupPayload(ownerKey, artifact.reference, artifact.body)).resolves.toEqual(
      parseReviewBackupPayload(artifact.body),
    );
    expect(reviewBackupPayloadKey(ownerKey.toUpperCase(), artifact.reference.payloadDigest.toUpperCase())).toBe(
      artifact.reference.backupKey,
    );
    expect(reviewBackupPayloadKey(` ${ownerKey} `, ` ${artifact.reference.payloadDigest} `)).toBe(artifact.reference.backupKey);

    const changedAuthority = await materializeReviewBackupArtifact(ownerKey, payload, exportAuthority("Changed authority"));
    expect(changedAuthority.reference.payloadDigest).toBe(artifact.reference.payloadDigest);
    expect(changedAuthority.reference.authorityDigest).not.toBe(artifact.reference.authorityDigest);
  });

  it("rejects malformed, incomplete, unbounded, and cross-owner payload references", async () => {
    const payload = backupPayload();
    const artifact = await materializeReviewBackupArtifact(ownerKey, payload, exportAuthority());
    const tables = payload.tables;

    for (const invalid of [
      { ...payload, schemaVersion: "future" },
      { ...payload, reviewRevision: 0 },
      { ...payload, protocolRevision: 8 },
      { ...payload, historyFloorRevision: 8 },
      { ...payload, tables: tables.slice(1) },
      { ...payload, tables: [...tables, tables[0]] },
      {
        ...payload,
        tables: tables.map((table, index) =>
          index === 0 && typeof table === "object" && table !== null ? { ...table, rows: [{ invalid: { nested: true } }] } : table,
        ),
      },
    ]) {
      expect(() => parseReviewBackupPayload(JSON.stringify(invalid))).toThrow("Review backup payload is invalid");
    }
    expect(() => parseReviewBackupPayload("not json")).toThrow("Review backup payload is invalid");
    expect(() => parseReviewBackupPayload("")).toThrow("Review backup payload is invalid");
    expect(() => reviewBackupPayloadJson({ ...payload, reviewRevision: 0 })).toThrow("Review backup payload is invalid");
    expect(() => reviewBackupPayloadKey("owner", artifact.reference.payloadDigest)).toThrow("owner key is invalid");
    expect(() => reviewBackupPayloadKey(ownerKey, "digest")).toThrow("payload digest is invalid");
    expect(() => parseReviewBackupReference(artifact.reference, "b".repeat(64))).toThrow("outside owner scope");
    expect(() => parseReviewBackupReference({ ...artifact.reference, byteCount: maximumReviewBackupPayloadBytes + 1 })).toThrow(
      "reference is invalid",
    );
    await expect(
      verifyReviewBackupPayload(ownerKey, { ...artifact.reference, byteCount: artifact.reference.byteCount + 1 }, artifact.body),
    ).rejects.toThrow("byte count does not match reference");
    await expect(
      verifyReviewBackupPayload(ownerKey, artifact.reference, artifact.body.replace("Map practices", "Map practice!")),
    ).rejects.toThrow("digest does not match reference");
    await expect(
      verifyReviewBackupPayload(ownerKey, { ...artifact.reference, reviewRevision: artifact.reference.reviewRevision + 1 }, artifact.body),
    ).rejects.toThrow("revisions do not match reference");
    await expect(
      materializeReviewBackupArtifact(ownerKey, payload, { ...exportAuthority(), revision: payload.reviewRevision - 1 }),
    ).rejects.toThrow("authority does not match payload revisions");
  });

  it("validates every payload table, row, and reference boundary", async () => {
    const payload = backupPayload();
    const artifact = await materializeReviewBackupArtifact(ownerKey, payload, exportAuthority());
    const firstTable = payload.tables[0]!;
    const replaceFirstTable = (table: unknown) => ({ ...payload, tables: [table, ...payload.tables.slice(1)] });

    for (const invalidPayload of [
      null,
      [],
      { ...payload, reviewRevision: "7" },
      { ...payload, reviewRevision: -1 },
      { ...payload, reviewRevision: 1.5 },
      { ...payload, protocolRevision: "2" },
      { ...payload, protocolRevision: 0 },
      { ...payload, historyFloorRevision: "1" },
      { ...payload, historyFloorRevision: -1 },
      { ...payload, tables: null },
      replaceFirstTable(null),
      replaceFirstTable({ ...firstTable, name: "unknown" }),
      replaceFirstTable({ ...firstTable, rows: null }),
      replaceFirstTable({ ...firstTable, rows: [null] }),
      replaceFirstTable({ ...firstTable, rows: [{}] }),
      replaceFirstTable({ ...firstTable, rows: [{ Invalid: "value" }] }),
      replaceFirstTable({ ...firstTable, rows: [{ "1invalid": "value" }] }),
      replaceFirstTable({ ...firstTable, rows: [{ "invalid-key": "value" }] }),
      replaceFirstTable({ ...firstTable, rows: [{ valid: true }] }),
      replaceFirstTable({ ...firstTable, rows: [{ valid: [] }] }),
      replaceFirstTable({ ...firstTable, rows: [{ valid: "value", Invalid: "value" }] }),
      replaceFirstTable({ ...firstTable, rows: [{ valid: "value", other: { nested: true } }] }),
    ]) {
      expect(() => parseReviewBackupPayload(JSON.stringify(invalidPayload))).toThrow("Review backup payload is invalid");
    }

    const reference = artifact.reference;
    for (const invalidReference of [
      null,
      [],
      { ...reference, schemaVersion: "future" },
      { ...reference, backupKey: 42 },
      { ...reference, backupKey: "x".repeat(1_025) },
      { ...reference, byteCount: "1" },
      { ...reference, byteCount: 0 },
      { ...reference, byteCount: 1.5 },
      { ...reference, payloadDigest: "a".repeat(63) },
      { ...reference, payloadDigest: `x${"a".repeat(64)}` },
      { ...reference, authorityDigest: "A".repeat(64) },
      { ...reference, reviewRevision: 0 },
      { ...reference, reviewRevision: 1.5 },
      { ...reference, protocolRevision: 0 },
      { ...reference, protocolRevision: reference.reviewRevision + 1 },
      { ...reference, historyFloorRevision: -1 },
      { ...reference, historyFloorRevision: reference.reviewRevision + 1 },
    ]) {
      expect(() => parseReviewBackupReference(invalidReference)).toThrow("Review backup reference is invalid");
    }
    expect(
      parseReviewBackupReference({ ...reference, backupKey: "x".repeat(1_024), byteCount: maximumReviewBackupPayloadBytes }),
    ).toMatchObject({ backupKey: "x".repeat(1_024), byteCount: maximumReviewBackupPayloadBytes });
    expect(
      parseReviewBackupReference({
        ...reference,
        protocolRevision: reference.reviewRevision,
        historyFloorRevision: reference.reviewRevision,
      }),
    ).toMatchObject({ protocolRevision: reference.reviewRevision, historyFloorRevision: reference.reviewRevision });

    const nonFinitePayload = {
      ...payload,
      tables: [{ ...firstTable, rows: [{ valid: Number.POSITIVE_INFINITY }] }, ...payload.tables.slice(1)],
    } satisfies ReviewStudyBackupPayload;
    expect(() => reviewBackupPayloadJson(nonFinitePayload)).toThrow("Review backup payload is invalid");
    const nullableInput = {
      ...payload,
      tables: [{ ...firstTable, rows: [{ valid: null }] }, ...payload.tables.slice(1)],
    } satisfies ReviewStudyBackupPayload;
    const nullablePayload = parseReviewBackupPayload(reviewBackupPayloadJson(nullableInput));
    expect(nullablePayload.tables.find((table) => table.name === firstTable.name)?.rows[0]).toEqual({ valid: null });

    const nonCanonicalBody = ` ${artifact.body}`;
    const nonCanonicalDigest = await sha256Text(nonCanonicalBody);
    const nonCanonicalReference = {
      ...reference,
      byteCount: new TextEncoder().encode(nonCanonicalBody).byteLength,
      payloadDigest: nonCanonicalDigest,
      backupKey: reviewBackupPayloadKey(ownerKey, nonCanonicalDigest),
    };
    await expect(verifyReviewBackupPayload(ownerKey, nonCanonicalReference, nonCanonicalBody)).rejects.toThrow("payload is not canonical");
    await expect(
      verifyReviewBackupPayload(ownerKey, { ...reference, protocolRevision: reference.protocolRevision + 1 }, artifact.body),
    ).rejects.toThrow("revisions do not match reference");
    await expect(
      verifyReviewBackupPayload(ownerKey, { ...reference, historyFloorRevision: reference.historyFloorRevision + 1 }, artifact.body),
    ).rejects.toThrow("revisions do not match reference");

    const authority = exportAuthority();
    for (const mismatch of [
      { ...authority, revision: authority.revision + 1 },
      { ...authority, protocol: { ...authority.protocol, revision: authority.protocol.revision + 1 } },
      {
        ...authority,
        protocol: {
          ...authority.protocol,
          protocol: { ...authority.protocol.protocol, revision: authority.protocol.protocol.revision + 1 },
        },
      },
    ]) {
      await expect(materializeReviewBackupArtifact(ownerKey, payload, mismatch)).rejects.toThrow(
        "authority does not match payload revisions",
      );
    }
  });
});

function backupPayload(objective = "Map practices"): ReviewStudyBackupPayload {
  const rowsByTable = new Map<string, readonly Record<string, string | number | null>[]>([
    [
      "protocol_revisions",
      [
        {
          revision: 1,
          status: "draft",
          payload_json: JSON.stringify({ objective: "Initial" }),
          rationale: "Review created",
          created_at: "2026-07-17T08:00:00.000Z",
          created_by: "owner@example.test",
        },
        {
          revision: 2,
          status: "frozen",
          payload_json: JSON.stringify({ objective }),
          rationale: "Protocol frozen",
          created_at: "2026-07-17T09:00:00.000Z",
          created_by: "owner@example.test",
        },
      ],
    ],
    [
      "search_runs",
      [
        {
          id: "run-1",
          protocol_revision: 2,
          source_id: "source-1",
          created_revision: 3,
        },
      ],
    ],
  ]);
  return {
    schemaVersion: reviewBackupSchemaVersion,
    reviewRevision: 7,
    protocolRevision: 2,
    historyFloorRevision: 1,
    tables: reviewBackupTableNames.map((name) => ({ name, rows: rowsByTable.get(name) ?? [] })),
  };
}

function exportAuthority(objective = "Map practices"): ReviewExportAuthority {
  const protocolRevision = materializeProtocolRevision(
    { ...defaultReviewProtocol(), objective },
    2,
    "frozen",
    "Protocol frozen",
    "owner@example.test",
  );
  const protocol = { revision: 7, protocol: protocolRevision, protocolHistory: [protocolRevision] };
  const search = {
    revision: 7,
    runs: [],
    batches: [],
    occurrences: [],
    records: [],
    duplicateCandidates: [],
    counts: { identified: 0, unique: 0, duplicatesRemoved: 0 },
  };
  const screening = {
    revision: 7,
    reviewersPerStage: 1 as const,
    blinded: false,
    records: [],
    counts: {
      titleAbstractPending: 0,
      titleAbstractIncluded: 0,
      fullTextPending: 0,
      fullTextIncluded: 0,
      finalInclusionPending: 0,
      finalInclusionIncluded: 0,
      finalInclusionExcluded: 0,
      conflicts: 0,
    },
  };
  const evidence = {
    revision: 7,
    protocolRevision: 2,
    protocol: {
      researchQuestions: protocolRevision.researchQuestions,
      qualityAssessment: protocolRevision.qualityAssessment,
      extractionFields: protocolRevision.extractionFields,
    },
    records: [],
  };
  const findings = { revision: 7, findings: [] };
  const reassessment = { revision: 7, obligations: [] };
  return {
    revision: 7,
    protocol,
    search,
    screening,
    evidence,
    model: { revision: 7, candidates: [] },
    findings,
    reassessment,
    synthesis: buildReviewSynthesis(protocol, search, screening, evidence, findings, reassessment),
  };
}

function reverseRecord(record: Readonly<Record<string, string | number | null>>): Readonly<Record<string, string | number | null>> {
  return Object.fromEntries(Object.entries(record).reverse());
}
