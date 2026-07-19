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
