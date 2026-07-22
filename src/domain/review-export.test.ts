import { createHash } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { materializeReviewFinding } from "./review-findings";
import { buildReviewSynthesis } from "./review-synthesis";
import { defaultReviewProtocol, materializeProtocolRevision } from "./review-study";
import {
  buildReviewPackage,
  reviewBibliographyBibTeX,
  reviewExtractionCsv,
  reviewHistoryJson,
  reviewPrismaData,
  reviewPrismaSvg,
  stableReviewJson,
  type ReviewExportAuthority,
} from "./review-export";
import type { ReviewRecord, ReviewSearchSnapshot } from "./review-search";
import type { ReviewScreeningSnapshot, ScreeningDecision } from "./review-screening";
import type { ReviewEvidenceSnapshot } from "./review-evidence";

const timestamp = "2026-07-17T10:00:00.000Z";

describe("review reproducibility export", () => {
  it("derives interoperable artifacts and a deterministic digest manifest from one revision", async () => {
    const authority = fixture();
    expect(reviewExtractionCsv(authority)).toContain('"Exact, quoted evidence"');
    expect(reviewBibliographyBibTeX(authority)).toContain("kirjolab_status = {included}");
    const prisma = reviewPrismaData(authority);
    expect(prisma).toMatchObject({ reviewRevision: 7, identified: 1, included: 1 });
    expect(reviewPrismaSvg(prisma)).toContain('role="img" aria-labelledby="title description"');

    const first = await buildReviewPackage("review-1", authority);
    const second = await buildReviewPackage("review-1", authority);
    expect(first).toEqual(second);
    const files = unzipSync(first);
    expect(Object.keys(files).sort()).toEqual([
      "analysis-contributors.json",
      "analysis-definitions.json",
      "analysis-diagnostics.json",
      "analysis-findings.json",
      "bibliography.bib",
      "extraction.csv",
      "finding-history.json",
      "history.json",
      "manifest.json",
      "model-disclosure.json",
      "prisma.json",
      "prisma.svg",
      "reassessment.json",
      "review.json",
      "search-history.json",
    ]);
    const manifest = JSON.parse(strFromU8(files["manifest.json"]!)) as {
      reviewId: string;
      reviewRevision: number;
      files: Array<{ path: string; sha256: string; bytes: number }>;
    };
    expect(manifest.reviewId).toBe("review-1");
    expect(manifest).not.toHaveProperty("workspaceId");
    expect(manifest.reviewRevision).toBe(7);
    expect(manifest.files).toHaveLength(14);
    expect(manifest.files.every((file) => /^[a-f0-9]{64}$/u.test(file.sha256) && file.bytes > 0)).toBe(true);
    const analysisDefinitions = JSON.parse(strFromU8(files["analysis-definitions.json"]!)) as {
      definitions: Array<Record<string, unknown>>;
    };
    expect(analysisDefinitions).toMatchObject({
      schemaVersion: "kirjolab-review-analysis-v1",
      reviewRevision: 7,
      protocolRevision: 2,
    });
    expect(analysisDefinitions.definitions[0]).toMatchObject({
      id: "review-process-analysis",
      revision: 1,
      reviewRevision: 7,
      protocolRevision: 2,
    });
    expect(JSON.parse(strFromU8(files["analysis-diagnostics.json"]!))).toMatchObject({ diagnostics: [] });
    expect(strFromU8(files["analysis-contributors.json"]!)).not.toContain("reviewer@example.com");
    expect(JSON.parse(strFromU8(files["analysis-findings.json"]!))).toMatchObject({
      findings: [{ id: "finding-current", supersedesId: "finding-original" }],
    });
    expect(JSON.parse(strFromU8(files["finding-history.json"]!))).toMatchObject({
      findings: [{ id: "finding-original" }, { id: "finding-current", supersedesId: "finding-original" }],
    });
    expect(JSON.parse(strFromU8(files["reassessment.json"]!))).toMatchObject({
      revision: 7,
      obligations: [{ id: "reassessment-1", status: "completed" }],
    });
    expect(JSON.parse(strFromU8(files["review.json"]!))).toMatchObject({
      reassessment: { obligations: [{ id: "reassessment-1" }] },
      findings: { findings: [{ id: "finding-original" }, { id: "finding-current" }] },
    });
    expect(reviewHistoryJson(authority)).toContain("finding-original");
    expect(reviewHistoryJson(authority)).toContain("reassessment-completion");
    expect({
      bibliography: reviewBibliographyBibTeX(authority),
      csv: reviewExtractionCsv(authority),
      historySha256: sha256Text(reviewHistoryJson(authority)),
      packageSha256: sha256Bytes(first),
      prisma,
      prismaSvg: reviewPrismaSvg(prisma),
    }).toMatchInlineSnapshot(`
      {
        "bibliography": "@article{study_record-1,
        author = {Doe, Jane},
        title = {Included Study},
        year = {2025},
        journal = {Journal},
        doi = {10.1/study},
        url = {https://example.test/study},
        abstract = {Relevant evidence.},
        kirjolab_record_id = {record-1},
        kirjolab_status = {included}
      }
      ",
        "csv": "recordId,title,protocolRevision,fieldId,criterionId,criterionText,field,value,valueSelectorKind,valueResourceId,valueSelectorId,missingReason,evidenceSelectorKind,evidenceResourceId,evidenceSelectorId,quote,page,location,reviewer,createdAt
      record-1,Included Study,2,finding,finding,Finding,Finding,Effective,,,,,pdf-annotation,pdf-1,annotation-1,"Exact, quoted evidence",4,Results,reviewer@example.com,2026-07-17T10:00:00.000Z
      ",
        "historySha256": "9313a17e21e3f5919fcf9a69ad21239e24745d01da69d7213f4c99a9b24f10e5",
        "packageSha256": "3c7b21f6b1ab1d694fe7132b34a9226f2031b4a15f6ec8d1afc3a4fd726d80d1",
        "prisma": {
          "duplicatesRemoved": 0,
          "exclusionReasons": {
            "fullText": {},
            "titleAbstract": {},
          },
          "fullTextAssessed": 1,
          "fullTextExcluded": 0,
          "identified": 1,
          "included": 1,
          "reviewRevision": 7,
          "schemaVersion": "prisma-2020-flow-v1",
          "titleAbstractExcluded": 0,
          "titleAbstractScreened": 1,
        },
        "prismaSvg": "<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 730" role="img" aria-labelledby="title description"><title id="title">PRISMA study flow</title><desc id="description">PRISMA flow for review revision 7: 1 records identified, 0 duplicates removed, and 1 studies included.</desc><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z"/></marker></defs><style>rect{fill:#fff;stroke:#334155;stroke-width:2}path{fill:none;stroke:#334155;stroke-width:2}text{font-family:system-ui,sans-serif;font-size:15px;fill:#0f172a}</style><path d="M220 94 V130" marker-end="url(#arrow)"/><path d="M220 194 V230" marker-end="url(#arrow)"/><path d="M220 294 V330" marker-end="url(#arrow)"/><path d="M220 394 V430" marker-end="url(#arrow)"/><path d="M220 494 V530" marker-end="url(#arrow)"/><path d="M220 594 V630" marker-end="url(#arrow)"/><g><rect x="40" y="30" width="360" height="64" rx="8"/><text x="220" y="57" text-anchor="middle">Records identified</text><text x="220" y="79" text-anchor="middle" font-weight="700">n = 1</text></g><g><rect x="40" y="130" width="360" height="64" rx="8"/><text x="220" y="157" text-anchor="middle">Duplicates removed</text><text x="220" y="179" text-anchor="middle" font-weight="700">n = 0</text></g><g><rect x="40" y="230" width="360" height="64" rx="8"/><text x="220" y="257" text-anchor="middle">Records screened</text><text x="220" y="279" text-anchor="middle" font-weight="700">n = 1</text></g><g><rect x="40" y="330" width="360" height="64" rx="8"/><text x="220" y="357" text-anchor="middle">Records excluded</text><text x="220" y="379" text-anchor="middle" font-weight="700">n = 0</text></g><g><rect x="40" y="430" width="360" height="64" rx="8"/><text x="220" y="457" text-anchor="middle">Full texts assessed</text><text x="220" y="479" text-anchor="middle" font-weight="700">n = 1</text></g><g><rect x="40" y="530" width="360" height="64" rx="8"/><text x="220" y="557" text-anchor="middle">Full texts excluded</text><text x="220" y="579" text-anchor="middle" font-weight="700">n = 0</text></g><g><rect x="40" y="630" width="360" height="64" rx="8"/><text x="220" y="657" text-anchor="middle">Studies included</text><text x="220" y="679" text-anchor="middle" font-weight="700">n = 1</text></g></svg>
      ",
      }
    `);
  });

  it("reports exclusions, adjudications, model disclosure, and empty extraction tables", async () => {
    const authority = fixture();
    const record = authority.screening.records[0]!;
    const excluded = {
      ...record,
      titleAbstract: {
        outcome: "exclude" as const,
        decisions: [{ ...record.titleAbstract.decisions[0]!, decision: "exclude" as const, reason: "Wrong population" }],
        adjudication: {
          id: "adjudication-1",
          recordId: record.record.id,
          stage: "title-abstract" as const,
          protocolRevision: 2,
          outcome: "exclude" as const,
          reason: "Wrong population",
          criterionId: "wrong-population",
          criterionText: "Wrong population",
          adjudicator: "lead@example.com",
          createdAt: "2026-07-17T11:00:00.000Z",
        },
      },
      fullText: { outcome: "pending" as const, decisions: [], adjudication: null },
      finalInclusion: { outcome: "pending" as const, decision: null },
    };
    const changed: ReviewExportAuthority = {
      ...authority,
      screening: { ...authority.screening, records: [excluded] },
      evidence: { ...authority.evidence, records: [] },
      model: {
        revision: 7,
        candidates: [
          {
            id: "model-1",
            operation: "screen-record",
            recordId: record.record.id,
            stage: "title-abstract",
            provider: "Local",
            model: "review-model",
            promptTemplateVersion: "v1",
            sourceScope: ["title", "abstract"],
            result: { decision: "exclude", criterion: "Population", rationale: "Not eligible", evidence: "Title" },
            createdAt: timestamp,
            createdBy: "reviewer@example.com",
            disposition: "rejected",
            disposedAt: "2026-07-17T11:05:00.000Z",
            disposedBy: "reviewer@example.com",
          },
        ],
      },
    };

    expect(reviewPrismaData(changed).exclusionReasons.titleAbstract).toEqual({ "Wrong population": 1 });
    expect(reviewBibliographyBibTeX(changed)).toContain("kirjolab_status = {excluded-title-abstract}");
    expect(reviewExtractionCsv(changed)).toMatch(/^recordId,/u);
    expect(reviewHistoryJson(changed)).toContain("screening-adjudication");
    expect(reviewHistoryJson(changed)).toContain("model-candidate");
    expect(stableReviewJson({ z: 1, a: { y: 2, x: 1 } })).toBe('{\n  "a": {\n    "x": 1,\n    "y": 2\n  },\n  "z": 1\n}\n');
    expect({
      bibliography: reviewBibliographyBibTeX(changed),
      csv: reviewExtractionCsv(changed),
      historySha256: sha256Text(reviewHistoryJson(changed)),
      prisma: reviewPrismaData(changed),
    }).toMatchInlineSnapshot(`
      {
        "bibliography": "@article{study_record-1,
        author = {Doe, Jane},
        title = {Included Study},
        year = {2025},
        journal = {Journal},
        doi = {10.1/study},
        url = {https://example.test/study},
        abstract = {Relevant evidence.},
        kirjolab_record_id = {record-1},
        kirjolab_status = {excluded-title-abstract}
      }
      ",
        "csv": "recordId,title,protocolRevision,fieldId,criterionId,criterionText,field,value,valueSelectorKind,valueResourceId,valueSelectorId,missingReason,evidenceSelectorKind,evidenceResourceId,evidenceSelectorId,quote,page,location,reviewer,createdAt
      ",
        "historySha256": "2d4d53f9f99522b0b28e5afc50fdc6c738b3821e832b42b224023cabd18560cf",
        "prisma": {
          "duplicatesRemoved": 0,
          "exclusionReasons": {
            "fullText": {},
            "titleAbstract": {
              "Wrong population": 1,
            },
          },
          "fullTextAssessed": 1,
          "fullTextExcluded": 0,
          "identified": 1,
          "included": 1,
          "reviewRevision": 7,
          "schemaVersion": "prisma-2020-flow-v1",
          "titleAbstractExcluded": 0,
          "titleAbstractScreened": 1,
        },
      }
    `);

    const fullTextExcluded: ReviewExportAuthority = {
      ...authority,
      screening: {
        ...authority.screening,
        records: [
          {
            ...record,
            finalInclusion: { outcome: "pending", decision: null },
            fullText: {
              outcome: "exclude",
              decisions: [{ ...record.fullText.decisions[0]!, decision: "exclude", reason: "No full text" }],
              adjudication: null,
            },
          },
        ],
      },
    };
    expect(reviewBibliographyBibTeX(fullTextExcluded)).toContain("kirjolab_status = {excluded-full-text}");
  });

  it("escapes formula-looking CSV cells before spreadsheet import", () => {
    const authority = fixture();
    const record = authority.evidence.records[0]!;
    const dangerous: ReviewExportAuthority = {
      ...authority,
      evidence: {
        ...authority.evidence,
        records: [
          {
            ...record,
            record: { ...record.record, id: "@record", metadata: { ...record.record.metadata, title: "=CMD()" } },
            extractionValues: [{ ...record.extractionValues[0]!, fieldId: "-field", value: "+SUM(1,1)", reviewer: "@reviewer" }],
          },
        ],
      },
    };

    const csv = reviewExtractionCsv(dangerous);
    expect(csv).toContain("'@record");
    expect(csv).toContain("'=CMD()");
    expect(csv).toContain("'-field");
    expect(csv).toContain('"\'+SUM(1,1)"');
    expect(csv).toContain("'@reviewer");
    expect(csv).toMatchInlineSnapshot(`
      "recordId,title,protocolRevision,fieldId,criterionId,criterionText,field,value,valueSelectorKind,valueResourceId,valueSelectorId,missingReason,evidenceSelectorKind,evidenceResourceId,evidenceSelectorId,quote,page,location,reviewer,createdAt
      '@record,'=CMD(),2,'-field,finding,Finding,'-field,"'+SUM(1,1)",,,,,pdf-annotation,pdf-1,annotation-1,"Exact, quoted evidence",4,Results,'@reviewer,2026-07-17T10:00:00.000Z
      "
    `);
  });

  it("exports final exclusions, exact selectors, and append-only audit events", async () => {
    const authority = fixture();
    const record = authority.screening.records[0]!;
    const extraction = authority.evidence.records[0]!.extractionValues[0]!;
    const screening: ReviewScreeningSnapshot = {
      ...authority.screening,
      records: [
        {
          ...record,
          fullText: {
            ...record.fullText,
            adjudication: {
              id: "adjudication-full-text",
              recordId: record.record.id,
              stage: "full-text",
              protocolRevision: 2,
              outcome: "include",
              reason: "Eligible after discussion",
              criterionId: null,
              criterionText: "",
              adjudicator: "lead@example.com",
              createdAt: "2026-07-17T11:30:00.000Z",
            },
          },
          finalInclusion: {
            outcome: "exclude",
            decision: {
              id: "final-exclusion",
              recordId: record.record.id,
              protocolRevision: 2,
              outcome: "exclude",
              reason: "Below the appraisal threshold",
              criterionId: "quality-threshold",
              criterionText: "Fails quality threshold",
              reviewer: "lead@example.com",
              createdAt: "2026-07-17T14:00:00.000Z",
            },
          },
        },
      ],
      counts: {
        ...authority.screening.counts,
        finalInclusionIncluded: 0,
        finalInclusionExcluded: 1,
      },
    };
    const evidence: ReviewEvidenceSnapshot = {
      ...authority.evidence,
      records: [
        {
          ...authority.evidence.records[0]!,
          qualityValues: [
            {
              id: "quality-1",
              recordId: record.record.id,
              protocolRevision: 2,
              questionId: "method-quality",
              criterionId: "method-quality",
              criterionText: "Is the method credible?",
              answerId: "yes",
              evidence: null,
              rationale: "Reported clearly",
              reviewer: "reviewer@example.com",
              createdAt: "2026-07-17T11:45:00.000Z",
            },
          ],
          extractionValues: [
            extraction,
            { ...extraction, id: "value-array", value: ["Alpha", "Beta"], evidence: null },
            {
              ...extraction,
              id: "value-selector",
              value: { kind: "web-passage", resourceId: "share-1", selectorId: "snapshot-1" },
              evidence: {
                kind: "web-passage",
                resourceId: "share-1",
                selectorId: "snapshot-1",
                quote: "A cited web passage",
                page: null,
                location: "Results",
              },
            },
            { ...extraction, id: "value-missing", value: null, missingReason: "Not reported", evidence: null },
          ],
        },
      ],
    };
    const changed: ReviewExportAuthority = {
      ...authority,
      search: {
        ...authority.search,
        duplicateCandidates: [
          {
            id: "duplicate-resolved",
            leftId: record.record.id,
            rightId: "record-2",
            signals: ["title-year"],
            confidence: "probable",
            status: "distinct",
            resolvedAt: "2026-07-17T11:15:00.000Z",
            resolvedBy: "lead@example.com",
          },
        ],
      },
      screening,
      evidence,
      model: {
        revision: 7,
        candidates: [
          {
            id: "model-pending",
            operation: "screen-record",
            recordId: record.record.id,
            stage: "title-abstract",
            provider: "Local",
            model: "review-model",
            promptTemplateVersion: "v1",
            sourceScope: ["title"],
            result: { decision: "include", criterion: "", rationale: "Likely eligible", evidence: "Title" },
            createdAt: "2026-07-17T12:15:00.000Z",
            createdBy: "reviewer@example.com",
            disposition: "pending",
            disposedAt: null,
            disposedBy: null,
          },
        ],
      },
      reassessment: {
        revision: 7,
        obligations: [
          {
            id: "reassessment-open",
            amendmentProtocolRevision: 2,
            stage: "title-abstract",
            recordId: null,
            status: "open",
            createdRevision: 7,
            completedRevision: null,
            completedAt: null,
            completedBy: null,
            completionRationale: null,
          },
          {
            id: "reassessment-complete",
            amendmentProtocolRevision: 2,
            stage: "extraction",
            recordId: record.record.id,
            status: "completed",
            createdRevision: 6,
            completedRevision: 7,
            completedAt: "2026-07-17T13:00:00.000Z",
            completedBy: "lead@example.com",
            completionRationale: null,
          },
        ],
      },
    };

    expect(reviewPrismaData(changed).exclusionReasons.fullText).toEqual({ "Fails quality threshold": 1 });
    expect(reviewBibliographyBibTeX(changed)).toContain("kirjolab_status = {excluded-final}");
    const csv = reviewExtractionCsv(changed);
    expect(csv).toContain('"[""Alpha"",""Beta""]"');
    expect(csv).toContain("web-passage,share-1,snapshot-1");
    expect(csv).toContain("Not reported");

    const history = JSON.parse(reviewHistoryJson(changed)) as {
      events: Array<{ kind: string; subject: string; detail: string }>;
    };
    expect(history.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "duplicate-resolution", subject: "duplicate-resolved" }),
        expect.objectContaining({ kind: "screening-adjudication", subject: "adjudication-full-text" }),
        expect.objectContaining({ kind: "final-inclusion-decision", subject: "final-exclusion", detail: "exclude" }),
        expect.objectContaining({ kind: "quality-value", subject: "quality-1" }),
        expect.objectContaining({ kind: "model-candidate", subject: "model-pending", detail: "screen-record:pending" }),
        expect.objectContaining({ kind: "reassessment-completion", subject: "reassessment-complete", detail: "extraction:" }),
      ]),
    );
    expect(history.events).not.toContainEqual(expect.objectContaining({ subject: "reassessment-open" }));

    const files = unzipSync(await buildReviewPackage("review-1", changed));
    expect(JSON.parse(strFromU8(files["manifest.json"]!))).toMatchObject({ generatedAt: "2026-07-17T14:00:00.000Z" });
    expect({
      bibliography: reviewBibliographyBibTeX(changed),
      csv,
      historySha256: sha256Text(reviewHistoryJson(changed)),
      packageSha256: sha256Bytes(await buildReviewPackage("review-1", changed)),
      prisma: reviewPrismaData(changed),
    }).toMatchInlineSnapshot(`
      {
        "bibliography": "@article{study_record-1,
        author = {Doe, Jane},
        title = {Included Study},
        year = {2025},
        journal = {Journal},
        doi = {10.1/study},
        url = {https://example.test/study},
        abstract = {Relevant evidence.},
        kirjolab_record_id = {record-1},
        kirjolab_status = {excluded-final}
      }
      ",
        "csv": "recordId,title,protocolRevision,fieldId,criterionId,criterionText,field,value,valueSelectorKind,valueResourceId,valueSelectorId,missingReason,evidenceSelectorKind,evidenceResourceId,evidenceSelectorId,quote,page,location,reviewer,createdAt
      record-1,Included Study,2,finding,finding,Finding,Finding,Effective,,,,,pdf-annotation,pdf-1,annotation-1,"Exact, quoted evidence",4,Results,reviewer@example.com,2026-07-17T10:00:00.000Z
      record-1,Included Study,2,finding,finding,Finding,Finding,"[""Alpha"",""Beta""]",,,,,,,,,,,reviewer@example.com,2026-07-17T10:00:00.000Z
      record-1,Included Study,2,finding,finding,Finding,Finding,"{""kind"":""web-passage"",""resourceId"":""share-1"",""selectorId"":""snapshot-1""}",web-passage,share-1,snapshot-1,,web-passage,share-1,snapshot-1,A cited web passage,,Results,reviewer@example.com,2026-07-17T10:00:00.000Z
      record-1,Included Study,2,finding,finding,Finding,Finding,,,,,Not reported,,,,,,,reviewer@example.com,2026-07-17T10:00:00.000Z
      ",
        "historySha256": "65dc3da9f01671530f20cde6491f67155777535a00f59f71665beea7c920146b",
        "packageSha256": "33b84c50997ccebeb547f86b7994368b743e97d3dca7d838bfa099109954a8b1",
        "prisma": {
          "duplicatesRemoved": 0,
          "exclusionReasons": {
            "fullText": {
              "Fails quality threshold": 1,
            },
            "titleAbstract": {},
          },
          "fullTextAssessed": 1,
          "fullTextExcluded": 0,
          "identified": 1,
          "included": 1,
          "reviewRevision": 7,
          "schemaVersion": "prisma-2020-flow-v1",
          "titleAbstractExcluded": 0,
          "titleAbstractScreened": 1,
        },
      }
    `);
  });

  it("covers formatter fallbacks without leaking inactive records", async () => {
    const authority = fixture();
    const sourceRecord = authority.search.records[0]!;
    const screeningRecord = authority.screening.records[0]!;
    const conference = {
      ...sourceRecord,
      id: "conference-record-long",
      metadata: {
        ...sourceRecord.metadata,
        citationKey: "conference",
        type: "inproceedings",
        title: "Conference Study",
        authors: ["Doe, Jane", "Roe, Alex"],
        venue: "Proceedings",
        url: "",
        abstract: "",
      },
    };
    const untyped = {
      ...sourceRecord,
      id: "untyped-record-long",
      metadata: { ...sourceRecord.metadata, citationKey: "untyped", type: "", title: "Untyped Study" },
    };
    const inactive = {
      ...sourceRecord,
      id: "inactive-record-long",
      state: "merged" as const,
      mergedInto: sourceRecord.id,
      metadata: { ...sourceRecord.metadata, citationKey: "inactive", title: "Inactive Study" },
    };
    const titleExcluded = {
      ...screeningRecord,
      record: conference,
      titleAbstract: {
        outcome: "exclude" as const,
        decisions: [
          { ...screeningRecord.titleAbstract.decisions[0]!, decision: "exclude" as const, criterionText: "Older reason" },
          {
            ...screeningRecord.titleAbstract.decisions[0]!,
            id: "latest-exclusion",
            decision: "exclude" as const,
            criterionText: "",
            reason: "Latest reason",
          },
        ],
        adjudication: null,
      },
    };
    const adjudicated = {
      ...screeningRecord,
      record: untyped,
      titleAbstract: {
        outcome: "exclude" as const,
        decisions: [],
        adjudication: {
          id: "fallback-adjudication",
          recordId: untyped.id,
          stage: "title-abstract" as const,
          protocolRevision: 2,
          outcome: "exclude" as const,
          reason: "Adjudicated reason",
          criterionId: null,
          criterionText: "",
          adjudicator: "lead@example.com",
          createdAt: timestamp,
        },
      },
      fullText: { ...screeningRecord.fullText, outcome: "include" as const },
      finalInclusion: { outcome: "pending" as const, decision: null },
    };
    const changed: ReviewExportAuthority = {
      ...authority,
      search: { ...authority.search, records: [conference, untyped, inactive] },
      screening: { ...authority.screening, records: [titleExcluded, adjudicated] },
      model: {
        revision: 7,
        candidates: [
          {
            id: "latest-model",
            operation: "screen-record",
            recordId: sourceRecord.id,
            stage: "title-abstract",
            provider: "Local",
            model: "review-model",
            promptTemplateVersion: "v1",
            sourceScope: ["title"],
            result: { decision: "include", criterion: "", rationale: "Eligible", evidence: "Title" },
            createdAt: timestamp,
            createdBy: "reviewer@example.com",
            disposition: "accepted",
            disposedAt: "2026-07-18T10:00:00.000Z",
            disposedBy: "reviewer@example.com",
          },
        ],
      },
    };

    const bibliography = reviewBibliographyBibTeX(changed);
    expect(bibliography).toContain("@inproceedings{conference_conferen");
    expect(bibliography).toContain("author = {Doe, Jane and Roe, Alex}");
    expect(bibliography).toContain("booktitle = {Proceedings}");
    expect(bibliography).toContain("@article{untyped_untyped-");
    expect(bibliography).toContain("kirjolab_status = {awaiting-final-inclusion}");
    expect(bibliography).not.toContain("Inactive Study");
    expect(bibliography).not.toContain("url = {}");
    expect(reviewPrismaData(changed).exclusionReasons.titleAbstract).toEqual({
      "Adjudicated reason": 1,
      "Latest reason": 1,
    });
    const files = unzipSync(await buildReviewPackage("review-1", changed));
    expect(JSON.parse(strFromU8(files["manifest.json"]!))).toMatchObject({ generatedAt: "2026-07-18T10:00:00.000Z" });

    const evidenceRecord = authority.evidence.records[0]!;
    const latestEvidence: ReviewExportAuthority = {
      ...authority,
      evidence: {
        ...authority.evidence,
        records: [
          {
            ...evidenceRecord,
            extractionValues: [{ ...evidenceRecord.extractionValues[0]!, createdAt: "2026-07-19T10:00:00.000Z" }],
          },
        ],
      },
    };
    const evidenceFiles = unzipSync(await buildReviewPackage("review-1", latestEvidence));
    expect(JSON.parse(strFromU8(evidenceFiles["manifest.json"]!))).toMatchObject({ generatedAt: "2026-07-19T10:00:00.000Z" });
  });
});

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fixture(): ReviewExportAuthority {
  const content = {
    ...defaultReviewProtocol(),
    researchQuestions: [{ id: "rq1", text: "What works?" }],
    extractionFields: [
      {
        id: "finding",
        label: "Finding",
        type: "text" as const,
        values: [],
        researchQuestionIds: ["rq1"],
        requiredness: "required" as const,
        cardinality: "single" as const,
        condition: null,
      },
    ],
  };
  const protocolRevision = materializeProtocolRevision(content, 2, "frozen", "Frozen", "owner@example.com", timestamp);
  const protocol = { revision: 7, protocol: protocolRevision, protocolHistory: [protocolRevision] };
  const record: ReviewRecord = {
    id: "record-1",
    state: "active",
    mergedInto: null,
    metadata: {
      citationKey: "study",
      type: "article",
      title: "Included Study",
      authors: ["Doe, Jane"],
      year: "2025",
      venue: "Journal",
      doi: "10.1/study",
      url: "https://example.test/study",
      abstract: "Relevant evidence.",
      identity: "doi:10.1/study",
      warnings: [],
    },
  };
  const search: ReviewSearchSnapshot = {
    revision: 7,
    runs: [
      {
        id: "run-1",
        protocolRevision: 2,
        sourceId: "source",
        sourceName: "Source",
        query: "evidence",
        searchedAt: timestamp,
        importedAt: timestamp,
        importedBy: "owner@example.com",
        digest: "a".repeat(64),
        reportedResultCount: 1,
        detectedEntries: 1,
        skippedEntries: 0,
        occurrenceCount: 1,
        importBatchIds: ["batch-1"],
      },
    ],
    batches: [
      {
        id: "batch-1",
        runId: "run-1",
        format: "bibtex",
        filename: "source.bib",
        mediaType: "application/x-bibtex",
        byteCount: 128,
        digest: "a".repeat(64),
        parserVersion: "kirjolab-bibtex-v1",
        reportedResultCount: 1,
      },
    ],
    occurrences: [
      { id: "occurrence-1", runId: "run-1", batchId: "batch-1", recordId: record.id, citationKey: "study", imported: record.metadata },
    ],
    records: [record],
    duplicateCandidates: [],
    counts: { identified: 1, unique: 1, duplicatesRemoved: 0 },
  };
  const titleDecision = decision(record.id, "title-abstract");
  const fullDecision = decision(record.id, "full-text");
  const screening: ReviewScreeningSnapshot = {
    revision: 7,
    reviewersPerStage: 1,
    blinded: false,
    records: [
      {
        record,
        titleAbstract: { outcome: "include", decisions: [titleDecision], adjudication: null },
        fullText: { outcome: "include", decisions: [fullDecision], adjudication: null },
        finalInclusion: {
          outcome: "include",
          decision: {
            id: "final-inclusion",
            recordId: record.id,
            protocolRevision: 2,
            outcome: "include",
            reason: "Eligible after appraisal",
            criterionId: null,
            criterionText: "",
            reviewer: "reviewer@example.com",
            createdAt: timestamp,
          },
        },
      },
    ],
    counts: {
      titleAbstractPending: 0,
      titleAbstractIncluded: 1,
      fullTextPending: 0,
      fullTextIncluded: 1,
      finalInclusionPending: 0,
      finalInclusionIncluded: 1,
      finalInclusionExcluded: 0,
      conflicts: 0,
    },
  };
  const evidence: ReviewEvidenceSnapshot = {
    revision: 7,
    protocolRevision: 2,
    protocol: {
      researchQuestions: protocolRevision.researchQuestions,
      qualityAssessment: protocolRevision.qualityAssessment,
      extractionFields: protocolRevision.extractionFields,
    },
    records: [
      {
        record,
        qualityValues: [],
        qualityScore: 0,
        qualityRejected: false,
        qualityComplete: true,
        extractionValues: [
          {
            id: "value-1",
            recordId: record.id,
            protocolRevision: 2,
            fieldId: "finding",
            criterionId: "finding",
            criterionText: "Finding",
            value: "Effective",
            missingReason: null,
            evidence: {
              kind: "pdf-annotation",
              resourceId: "pdf-1",
              selectorId: "annotation-1",
              quote: "Exact, quoted evidence",
              page: 4,
              location: "Results",
            },
            reviewer: "reviewer@example.com",
            createdAt: timestamp,
          },
        ],
        extractionComplete: true,
      },
    ],
  };
  const model = { revision: 7, candidates: [] };
  const extraction = evidence.records[0]!.extractionValues[0]!;
  const originalFinding = materializeReviewFinding(
    {
      researchQuestionId: "rq1",
      statement: "The included study reports an effect.",
      interpretation: "Initial interpretation.",
      extractionValueIds: [extraction.id],
      appraisalValueIds: [],
      evidence: [{ contributorKind: "extraction", contributorId: extraction.id, pointer: extraction.evidence! }],
      supersedesId: null,
    },
    {
      id: "finding-original",
      reviewRevision: 6,
      protocolRevision: 2,
      createdBy: "reviewer@example.com",
      createdAt: "2026-07-17T11:00:00.000Z",
    },
  );
  const currentFinding = materializeReviewFinding(
    {
      researchQuestionId: "rq1",
      statement: "The included study reports an effective result.",
      interpretation: "Revised interpretation.",
      extractionValueIds: [extraction.id],
      appraisalValueIds: [],
      evidence: [{ contributorKind: "extraction", contributorId: extraction.id, pointer: extraction.evidence! }],
      supersedesId: originalFinding.id,
    },
    {
      id: "finding-current",
      reviewRevision: 7,
      protocolRevision: 2,
      createdBy: "reviewer@example.com",
      createdAt: "2026-07-17T12:00:00.000Z",
    },
  );
  const findings = { revision: 7, findings: [originalFinding, currentFinding] };
  const reassessment = {
    revision: 7,
    obligations: [
      {
        id: "reassessment-1",
        amendmentProtocolRevision: 2,
        stage: "extraction" as const,
        recordId: record.id,
        status: "completed" as const,
        createdRevision: 6,
        completedRevision: 7,
        completedAt: "2026-07-17T12:30:00.000Z",
        completedBy: "reviewer@example.com",
        completionRationale: "Rechecked extracted values.",
      },
    ],
  };
  const synthesis = buildReviewSynthesis(protocol, search, screening, evidence, findings, reassessment);
  return { revision: 7, protocol, reassessment, search, screening, evidence, model, findings, synthesis };
}

function decision(recordId: string, stage: "title-abstract" | "full-text"): ScreeningDecision {
  return {
    id: `decision-${stage}`,
    recordId,
    stage,
    protocolRevision: 2,
    reviewer: "reviewer@example.com",
    decision: "include",
    reason: "Eligible",
    criterionId: null,
    criterionText: "",
    createdAt: timestamp,
  };
}
