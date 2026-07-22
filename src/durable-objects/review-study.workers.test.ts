import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { defaultReviewProtocol, type ReviewSearchSource } from "../domain/review-study";
import { previewReviewBibTeX, reviewImportLimits } from "../domain/review-search";
import { ReviewStudy } from "./review-study";

describe("ReviewStudy in the Workers runtime", () => {
  it("reports existing review data without initializing a blank study", async () => {
    const study = env.REVIEW_STUDIES.getByName(`review-discovery-${crypto.randomUUID()}`);

    expect(await study.hasReviewData()).toBe(false);
    expect(
      await runInDurableObject(study, (_instance: ReviewStudy, state) => ({
        protocols: state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM protocol_revisions").one().count,
        revision: state.storage.sql.exec<{ revision: number }>("SELECT revision FROM review_meta WHERE singleton = 1").one().revision,
      })),
    ).toEqual({ protocols: 0, revision: 0 });

    await study.getSnapshot();

    expect(await study.hasReviewData()).toBe(true);
  });

  it("initializes one immutable profile under concurrent requests", async () => {
    const sameProfile = env.REVIEW_STUDIES.getByName(`review-profile-same-${crypto.randomUUID()}`);
    const [first, second] = await Promise.all([
      sameProfile.initializeProfile("mlr", "first@example.test"),
      sameProfile.initializeProfile("mlr", "second@example.test"),
    ]);
    expect(first).toMatchObject({ ok: true, value: { revision: 1, protocol: { profile: "mlr" } } });
    expect(second).toMatchObject({ ok: true, value: { revision: 1, protocol: { profile: "mlr" } } });
    expect(
      await runInDurableObject(
        sameProfile,
        (_instance: ReviewStudy, state) =>
          state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM protocol_revisions").one().count,
      ),
    ).toBe(1);

    const conflicting = env.REVIEW_STUDIES.getByName(`review-profile-conflict-${crypto.randomUUID()}`);
    const results = await Promise.all([
      conflicting.initializeProfile("slr", "slr@example.test"),
      conflicting.initializeProfile("mlr", "mlr@example.test"),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      {
        ok: false,
        code: "profile-conflict",
        error: "Review method profile conflicts with the initialized study",
      },
    ]);
    const winner = results.find((result) => result.ok);
    if (!winner?.ok) throw new Error("Review profile initialization had no winner");
    expect((await conflicting.getSnapshot()).protocol.profile).toBe(winner.value.protocol.profile);
  });

  it("persists isolated immutable protocol revisions", async () => {
    const study = env.REVIEW_STUDIES.getByName("review-a");
    const other = env.REVIEW_STUDIES.getByName("review-b");
    const initial = await study.getSnapshot("mlr", "owner@example.com");
    expect(initial).toMatchObject({ revision: 1, protocol: { profile: "mlr", status: "draft" } });
    expect((await other.getSnapshot()).protocol.profile).toBe("slr");

    const content = {
      ...defaultReviewProtocol("mlr"),
      objective: "Map practices",
      researchQuestions: [{ id: "rq1", text: "Which practices exist?" }],
      conceptGroups: [{ id: "practice", label: "Practice", facet: null, terms: ["software practice"] }],
      sources: [formalSource({ id: "scopus", name: "Scopus", url: "https://scopus.com", dialect: "scopus", fieldScope: "title-abstract" })],
    };
    const edited = await study.replaceProtocol({ expectedRevision: 1, content, actor: "owner@example.com" });
    expect(edited).toMatchObject({ revision: 2, protocol: { objective: "Map practices", revision: 2 } });
    expect(edited.protocolHistory).toHaveLength(2);
    expect(edited.protocol.sourceQueries[0]?.query).toBe('TITLE-ABS(("software practice"))');

    const frozen = await study.freezeProtocol(2, "owner@example.com");
    expect(frozen).toMatchObject({ revision: 3, protocol: { status: "frozen" } });
    await runInDurableObject(study, (instance: ReviewStudy) => {
      expect(() => instance.replaceProtocol({ expectedRevision: 3, content, actor: "owner@example.com" })).toThrow("amended");
    });
    await runInDurableObject(study, (instance: ReviewStudy) => {
      expect(() =>
        instance.amendProtocol({
          expectedRevision: 3,
          content: { ...content, objective: "Unscoped amendment" },
          rationale: "Missing an impact declaration",
          actor: "owner@example.com",
        }),
      ).toThrow("affected stage");
    });
    expect((await study.getSnapshot()).revision).toBe(3);
    const amended = await study.amendProtocol({
      expectedRevision: 3,
      content: {
        ...content,
        objective: "Map current practices",
        amendmentImpact: { stages: ["search"], recordIds: [] },
      },
      rationale: "Pilot search exposed ambiguity",
      actor: "owner@example.com",
    });
    expect(amended).toMatchObject({ revision: 4, protocol: { status: "frozen", rationale: "Pilot search exposed ambiguity" } });
    const obligations = await study.getReassessmentSnapshot();
    expect(obligations).toMatchObject({
      revision: 4,
      obligations: [
        {
          amendmentProtocolRevision: 4,
          stage: "search",
          recordId: null,
          status: "open",
          createdRevision: 4,
        },
      ],
    });
    const completed = await study.completeReassessmentObligation(
      obligations.revision,
      obligations.obligations[0]!.id,
      "Repeated the registered search under the successor protocol",
      "owner@example.com",
    );
    expect(completed).toMatchObject({
      revision: 5,
      obligations: [
        {
          status: "completed",
          completedRevision: 5,
          completedBy: "owner@example.com",
          completionRationale: "Repeated the registered search under the successor protocol",
        },
      ],
    });
  });

  it("keeps the review method profile immutable after creation", async () => {
    const study = env.REVIEW_STUDIES.getByName(`review-profile-${crypto.randomUUID()}`);
    const initial = await study.getSnapshot("slr", "owner@example.com");
    await runInDurableObject(study, (instance: ReviewStudy) => {
      expect(() =>
        instance.replaceProtocol({
          expectedRevision: initial.revision,
          content: defaultReviewProtocol("mlr"),
          actor: "owner@example.com",
        }),
      ).toThrow("profile cannot change");
    });
    const frozen = await study.freezeProtocol(initial.revision, "owner@example.com");
    await runInDurableObject(study, (instance: ReviewStudy) => {
      expect(() =>
        instance.amendProtocol({
          expectedRevision: frozen.revision,
          content: {
            ...defaultReviewProtocol("mlr"),
            amendmentImpact: { stages: ["search"], recordIds: [] },
          },
          rationale: "Attempt to change the method profile",
          actor: "owner@example.com",
        }),
      ).toThrow("profile cannot change");
    });
    await expect(study.getSnapshot()).resolves.toMatchObject({
      revision: frozen.revision,
      protocol: { profile: "slr", status: "frozen" },
    });
  });

  it("rejects stale writers and records its migration", async () => {
    const study = env.REVIEW_STUDIES.getByName("review-conflict");
    await study.getSnapshot();
    await runInDurableObject(study, (instance: ReviewStudy) => {
      expect(() => instance.replaceProtocol({ expectedRevision: 0, content: defaultReviewProtocol(), actor: "owner@example.com" })).toThrow(
        "revision conflict",
      );
    });
    expect(
      await runInDurableObject(study, (_instance: ReviewStudy, state) =>
        state.storage.sql.exec<{ version: number; name: string }>("SELECT version, name FROM _kirjolab_migrations").toArray(),
      ),
    ).toEqual([
      { version: 1, name: "store-review-protocol-revisions" },
      { version: 2, name: "store-search-runs-and-reviewed-duplicates" },
      { version: 3, name: "store-append-only-screening-decisions" },
      { version: 4, name: "store-evidence-linked-appraisal-and-extraction" },
      { version: 5, name: "store-review-model-candidates" },
      { version: 6, name: "allow-rationales-for-negative-appraisal" },
      { version: 7, name: "make-review-revisions-reconstructible" },
      { version: 8, name: "retain-review-import-provenance-and-capacity" },
      { version: 9, name: "pin-review-workflow-to-protocol-revisions" },
    ]);
  });

  it("fails closed below an adopted history floor", async () => {
    const study = env.REVIEW_STUDIES.getByName(`review-history-floor-${crypto.randomUUID()}`);
    const first = await study.getSnapshot();
    const current = await study.replaceProtocol({
      expectedRevision: first.revision,
      content: { ...defaultReviewProtocol(), objective: "Adopt reconstructible history" },
      actor: "owner@example.com",
    });

    await runInDurableObject(study, (instance: ReviewStudy, state) => {
      state.storage.sql.exec("UPDATE review_meta SET history_floor_revision = ? WHERE singleton = 1", current.revision);
      expect(() => instance.getExportAuthorityAtRevision(current.revision - 1, "owner@example.com")).toThrow(
        `predates reconstructible history floor ${current.revision}`,
      );
      expect(() => instance.getSynthesisAtRevision(current.revision - 1, "owner@example.com")).toThrow(
        `predates reconstructible history floor ${current.revision}`,
      );
      expect(instance.getExportAuthorityAtRevision(current.revision, "owner@example.com").revision).toBe(current.revision);
    });
  });

  it("materializes and restores owner-scoped review payloads", async () => {
    const ownerKey = await sha256Hex(crypto.randomUUID());
    const source = env.REVIEW_STUDIES.getByName(`review-backup-source-${crypto.randomUUID()}`);
    const initial = await source.getSnapshot();
    const current = await source.replaceProtocol({
      expectedRevision: initial.revision,
      content: { ...defaultReviewProtocol(), objective: "Restore this exact review authority" },
      actor: "owner@example.com",
    });
    const backup = await source.createBackupSnapshot(ownerKey);
    expect(backup).toMatchObject({
      reference: {
        reviewRevision: current.revision,
        protocolRevision: current.protocol.revision,
        payloadDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
        authorityDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
      revisionSeed: `review:${current.revision}:protocol:${current.protocol.revision}`,
    });
    if (!backup.reference) throw new Error("Expected a review backup reference");

    const restored = env.REVIEW_STUDIES.getByName(`review-backup-restored-${crypto.randomUUID()}`);
    const verification = await restored.restoreBackupPayload(ownerKey, backup.reference);
    expect(verification).toEqual({
      payloadDigest: backup.reference.payloadDigest,
      authorityDigest: backup.reference.authorityDigest,
      reviewRevision: backup.reference.reviewRevision,
      protocolRevision: backup.reference.protocolRevision,
      historyFloorRevision: backup.reference.historyFloorRevision,
    });
    expect((await restored.getSnapshot()).protocol.objective).toBe("Restore this exact review authority");
    await expect(restored.restoreBackupPayload(ownerKey, backup.reference)).resolves.toEqual(verification);
    await runInDurableObject(restored, async (instance: ReviewStudy) => {
      await expect(instance.restoreBackupPayload("b".repeat(64), backup.reference!)).rejects.toThrow("outside owner scope");
    });

    const occupied = env.REVIEW_STUDIES.getByName(`review-backup-occupied-${crypto.randomUUID()}`);
    await occupied.getSnapshot();
    await runInDurableObject(occupied, async (instance: ReviewStudy) => {
      await expect(instance.restoreBackupPayload(ownerKey, backup.reference!)).rejects.toThrow("different review data");
    });
  });

  it("deletes the complete review authority with the project", async () => {
    const study = env.REVIEW_STUDIES.getByName(`review-delete-${crypto.randomUUID()}`);
    await study.getSnapshot();
    await study.deleteReviewData();
    expect(
      await runInDurableObject(
        study,
        (_instance: ReviewStudy, state) =>
          state.storage.sql
            .exec<{ count: number }>("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
            .one().count,
      ),
    ).toBe(0);
  });

  it("imports immutable occurrences and merges only reviewed duplicates", async () => {
    const study = env.REVIEW_STUDIES.getByName(`review-search-${crypto.randomUUID()}`);
    const initial = await study.getSnapshot();
    const content = {
      ...defaultReviewProtocol(),
      sources: [formalSource({ id: "scopus", name: "Scopus", url: "https://scopus.com", dialect: "scopus", fieldScope: "title-abstract" })],
    };
    await study.replaceProtocol({ expectedRevision: initial.revision, content, actor: "owner@example.com" });
    const frozen = await study.freezeProtocol(2, "owner@example.com");
    const bibtex = `@article{one, title={Same Study}, author={Doe, Jane}, year={2025}, doi={10.1/same}}
@article{two, title={Same Study}, author={Doe, Jane}, year={2025}, doi={10.1/same}}`;
    const preview = await previewReviewBibTeX(bibtex);
    const imported = await study.confirmSearchRun({
      expectedRevision: frozen.revision,
      sourceId: "scopus",
      query: "TITLE-ABS(test)",
      searchedAt: "2026-07-17T09:00:00Z",
      bibtex,
      digest: preview.digest,
      ...importProvenance(2, "scopus-results.bib"),
      actor: "owner@example.com",
    });
    expect(imported.counts).toEqual({ identified: 2, unique: 2, duplicatesRemoved: 0 });
    expect(imported.runs).toHaveLength(1);
    expect(imported.runs[0]).toMatchObject({ reportedResultCount: 2, importBatchIds: [expect.any(String)] });
    expect(imported.batches).toEqual([
      expect.objectContaining({
        id: imported.runs[0]!.importBatchIds[0],
        runId: imported.runs[0]!.id,
        filename: "scopus-results.bib",
        format: "bibtex",
        mediaType: "application/x-bibtex",
        parserVersion: "kirjolab-bibtex-v1",
        reportedResultCount: 2,
        byteCount: new TextEncoder().encode(bibtex).byteLength,
      }),
    ]);
    expect(new Set(imported.occurrences.map((occurrence) => occurrence.batchId))).toEqual(new Set(imported.runs[0]!.importBatchIds));
    expect(imported.duplicateCandidates).toHaveLength(1);
    const authorityAtImport = await study.getExportAuthorityAtRevision(imported.revision, "reviewer@example.com");
    const candidate = imported.duplicateCandidates[0]!;
    const merged = await study.resolveDuplicate(imported.revision, candidate.id, "merge", candidate.leftId, "reviewer@example.com");
    expect(merged.revision).toBe(imported.revision + 1);
    expect(merged.counts).toEqual({ identified: 2, unique: 1, duplicatesRemoved: 1 });
    expect(new Set(merged.occurrences.map((occurrence) => occurrence.recordId))).toEqual(new Set([candidate.leftId]));
    expect(merged.duplicateCandidates[0]).toMatchObject({ status: "merged", resolvedBy: "reviewer@example.com" });
    expect(await study.getExportAuthorityAtRevision(imported.revision, "reviewer@example.com")).toEqual(authorityAtImport);
    expect(authorityAtImport.search).toMatchObject({
      counts: { identified: 2, unique: 2, duplicatesRemoved: 0 },
      duplicateCandidates: [{ status: "pending", resolvedAt: null, resolvedBy: null }],
    });
  });

  it("enforces aggregate search-run, batch, occurrence, and record limits atomically", async () => {
    const study = env.REVIEW_STUDIES.getByName(`review-import-limits-${crypto.randomUUID()}`);
    const initial = await study.getSnapshot();
    await study.replaceProtocol({
      expectedRevision: initial.revision,
      content: {
        ...defaultReviewProtocol(),
        sources: [
          {
            id: "source",
            name: "Source",
            url: "",
            dialect: "generic",
            fieldScope: "all-fields",
            sourceClass: "bibliographic-database",
            evidenceClass: "formal",
            greySourceClass: null,
          },
        ],
      },
      actor: "owner@example.com",
    });
    await study.freezeProtocol(2, "owner@example.com");
    const bibtex = "@article{study, title={Bounded Study}, year={2025}}";
    const preview = await previewReviewBibTeX(bibtex);
    const input = {
      expectedRevision: 3,
      sourceId: "source",
      query: "bounded",
      searchedAt: "2026-07-17T09:00:00Z",
      bibtex,
      digest: preview.digest,
      ...importProvenance(1),
      actor: "owner@example.com",
    };
    const setCounts = async (searchRuns: number, batches: number, occurrences: number, records: number): Promise<void> => {
      await runInDurableObject(study, (_instance: ReviewStudy, state) => {
        state.storage.sql.exec(
          "UPDATE review_meta SET search_run_count = ?, import_batch_count = ?, occurrence_count = ?, record_count = ? WHERE singleton = 1",
          searchRuns,
          batches,
          occurrences,
          records,
        );
      });
    };
    const expectImportFailure = async (message: string): Promise<void> => {
      await runInDurableObject(study, async (instance: ReviewStudy) => {
        await expect(instance.confirmSearchRun(input)).rejects.toThrow(message);
      });
    };

    await setCounts(256, 0, 0, 0);
    await expectImportFailure("search run limit");
    await setCounts(0, 1_024, 0, 0);
    await expectImportFailure("import batch limit");
    await setCounts(0, 0, 100_000, 0);
    await expectImportFailure("occurrence limit");
    await setCounts(0, 0, 0, 50_000);
    await expectImportFailure("record limit");
    await setCounts(0, 0, 0, 0);
    await runInDurableObject(study, (_instance: ReviewStudy, state) => {
      state.storage.sql.exec("UPDATE review_meta SET import_byte_count = ? WHERE singleton = 1", reviewImportLimits.bibtexBytes);
    });
    await expectImportFailure("aggregate import byte limit");
    expect((await study.getSnapshot()).revision).toBe(3);

    await setCounts(0, 0, 0, 0);
    await runInDurableObject(study, (_instance: ReviewStudy, state) => {
      state.storage.sql.exec("UPDATE review_meta SET import_byte_count = 0 WHERE singleton = 1");
    });
    await expect(study.confirmSearchRun(input)).resolves.toMatchObject({ revision: 4, counts: { identified: 1, unique: 1 } });
    expect(
      await runInDurableObject(
        study,
        (_instance: ReviewStudy, state) =>
          state.storage.sql.exec<{ import_byte_count: number }>("SELECT import_byte_count FROM review_meta WHERE singleton = 1").one()
            .import_byte_count,
      ),
    ).toBe(preview.byteCount);
  });

  it("blinds independent screening decisions and preserves adjudicated conflicts", async () => {
    const study = env.REVIEW_STUDIES.getByName(`review-screen-${crypto.randomUUID()}`);
    const initial = await study.getSnapshot();
    const content = {
      ...defaultReviewProtocol(),
      screening: { reviewersPerStage: 2 as const, blinded: true },
      eligibilityCriteria: [
        {
          id: "addresses-rq",
          kind: "include" as const,
          text: "Addresses the research question",
          applicableStages: ["title-abstract", "full-text"] as const,
        },
        {
          id: "not-empirical",
          kind: "exclude" as const,
          text: "Not empirical",
          applicableStages: ["title-abstract", "full-text"] as const,
        },
      ],
      sources: [formalSource({ id: "source", name: "Source", url: "", dialect: "generic", fieldScope: "all-fields" })],
    };
    await study.replaceProtocol({ expectedRevision: initial.revision, content, actor: "owner@example.com" });
    await study.freezeProtocol(2, "owner@example.com");
    const bibtex = "@article{study, title={Screen Me}, author={Doe, Jane}, year={2025}, abstract={Evidence}}";
    const preview = await previewReviewBibTeX(bibtex);
    const searched = await study.confirmSearchRun({
      expectedRevision: 3,
      sourceId: "source",
      query: "evidence",
      searchedAt: "2026-07-17T09:00:00Z",
      bibtex,
      digest: preview.digest,
      ...importProvenance(1),
      actor: "owner@example.com",
    });
    const recordId = searched.records[0]!.id;
    await runInDurableObject(study, (instance: ReviewStudy) => {
      expect(() =>
        instance.submitScreeningDecision(
          searched.revision,
          recordId,
          "title-abstract",
          "include",
          "Mismatched criterion kind",
          "not-empirical",
          "reviewer-a@example.com",
        ),
      ).toThrow("inapplicable");
    });
    expect((await study.getSnapshot()).revision).toBe(searched.revision);
    const first = await study.submitScreeningDecision(
      searched.revision,
      recordId,
      "title-abstract",
      "include",
      "Relevant",
      "addresses-rq",
      "reviewer-a@example.com",
    );
    expect(first.records[0]?.titleAbstract).toMatchObject({
      outcome: "pending",
      decisions: [
        {
          protocolRevision: 3,
          criterionId: "addresses-rq",
          criterionText: "Addresses the research question",
          reviewer: "reviewer-a@example.com",
        },
      ],
    });
    expect((await study.getScreeningSnapshot("reviewer-b@example.com")).records[0]?.titleAbstract.decisions).toEqual([]);
    const second = await study.submitScreeningDecision(
      first.revision,
      recordId,
      "title-abstract",
      "exclude",
      "Not empirical",
      "not-empirical",
      "reviewer-b@example.com",
    );
    expect(second.records[0]?.titleAbstract).toMatchObject({ outcome: "conflict" });
    expect(second.records[0]?.titleAbstract.decisions).toHaveLength(2);
    const adjudicated = await study.adjudicateScreening(
      second.revision,
      recordId,
      "title-abstract",
      "include",
      "Reviewers reached consensus",
      "lead@example.com",
    );
    expect(adjudicated.records[0]?.titleAbstract).toMatchObject({
      outcome: "include",
      adjudication: {
        protocolRevision: 3,
        criterionId: "addresses-rq",
        criterionText: "Addresses the research question",
        adjudicator: "lead@example.com",
      },
    });
    expect(adjudicated.records[0]?.titleAbstract.decisions).toHaveLength(2);
    const fullText = await study.submitScreeningDecision(
      adjudicated.revision,
      recordId,
      "full-text",
      "include",
      "Eligible",
      "addresses-rq",
      "reviewer-a@example.com",
    );
    expect(fullText.records[0]?.fullText.outcome).toBe("pending");
  });

  it("records evidence-linked quality answers and typed extraction with missingness", async () => {
    const study = env.REVIEW_STUDIES.getByName(`review-evidence-${crypto.randomUUID()}`);
    const initial = await study.getSnapshot();
    const defaults = defaultReviewProtocol();
    const content = {
      ...defaults,
      researchQuestions: [{ id: "rq1", text: "What evidence was reported?" }],
      eligibilityCriteria: [
        {
          id: "eligible",
          kind: "include" as const,
          text: "Eligible for the review",
          applicableStages: ["title-abstract", "full-text"] as const,
        },
        {
          id: "appraisal-exclusion",
          kind: "exclude" as const,
          text: "Excluded after final eligibility appraisal",
          applicableStages: ["full-text"] as const,
        },
      ],
      qualityAssessment: {
        questions: [{ id: "method", text: "Is the method clear?" }],
        answers: defaults.qualityAssessment.answers,
        minimumScore: 0.5,
      },
      extractionFields: [
        {
          id: "year",
          label: "Year",
          type: "integer" as const,
          values: [],
          researchQuestionIds: ["rq1"],
          requiredness: "required" as const,
          cardinality: "single" as const,
          condition: null,
        },
        {
          id: "finding",
          label: "Key finding",
          type: "text" as const,
          values: [],
          researchQuestionIds: ["rq1"],
          requiredness: "required" as const,
          cardinality: "single" as const,
          condition: null,
        },
      ],
      sources: [formalSource({ id: "source", name: "Source", url: "", dialect: "generic", fieldScope: "all-fields" })],
    };
    await study.replaceProtocol({ expectedRevision: initial.revision, content, actor: "owner@example.com" });
    await study.freezeProtocol(2, "owner@example.com");
    const bibtex = "@article{study, title={Evidence Study}, year={2025}}";
    const preview = await previewReviewBibTeX(bibtex);
    const searched = await study.confirmSearchRun({
      expectedRevision: 3,
      sourceId: "source",
      query: "evidence",
      searchedAt: "2026-07-17T09:00:00Z",
      bibtex,
      digest: preview.digest,
      ...importProvenance(1),
      actor: "owner@example.com",
    });
    const recordId = searched.records[0]!.id;
    const title = await study.submitScreeningDecision(
      searched.revision,
      recordId,
      "title-abstract",
      "include",
      "Relevant",
      "eligible",
      "reviewer@example.com",
    );
    const full = await study.submitScreeningDecision(
      title.revision,
      recordId,
      "full-text",
      "include",
      "Eligible",
      "eligible",
      "reviewer@example.com",
    );
    expect(await study.getEvidenceSnapshot("reviewer@example.com")).toMatchObject({ records: [] });
    const final = await study.decideFinalInclusion(
      full.revision,
      recordId,
      "include",
      null,
      "Eligible after appraisal readiness check",
      "reviewer@example.com",
    );
    expect(final).toMatchObject({
      counts: { finalInclusionPending: 0, finalInclusionIncluded: 1, finalInclusionExcluded: 0 },
      records: [
        {
          finalInclusion: {
            outcome: "include",
            decision: { protocolRevision: 3, criterionId: null, criterionText: "" },
          },
        },
      ],
    });
    const authorityAtInitialInclusion = await study.getExportAuthorityAtRevision(final.revision, "reviewer@example.com");
    const excluded = await study.decideFinalInclusion(
      final.revision,
      recordId,
      "exclude",
      "appraisal-exclusion",
      "The final appraisal found an exclusion",
      "reviewer@example.com",
    );
    expect(excluded.records[0]?.finalInclusion).toMatchObject({
      outcome: "exclude",
      decision: {
        protocolRevision: 3,
        criterionId: "appraisal-exclusion",
        criterionText: "Excluded after final eligibility appraisal",
      },
    });
    expect(await study.getEvidenceSnapshot("reviewer@example.com")).toMatchObject({ records: [] });
    expect(await study.getExportAuthorityAtRevision(final.revision, "reviewer@example.com")).toEqual(authorityAtInitialInclusion);
    const reincluded = await study.decideFinalInclusion(
      excluded.revision,
      recordId,
      "include",
      null,
      "The exclusion was corrected after source verification",
      "reviewer@example.com",
    );
    const quality = await study.submitQualityAssessment(
      reincluded.revision,
      recordId,
      "method",
      "yes",
      evidencePointer(recordId, "quality-method", "The method was preregistered.", 3, "Methods"),
      "",
      "reviewer@example.com",
    );
    expect(quality.records[0]).toMatchObject({
      qualityScore: 1,
      qualityComplete: true,
      qualityRejected: false,
      qualityValues: [{ protocolRevision: 3, criterionId: "method", criterionText: "Is the method clear?" }],
    });
    const extracted = await study.submitExtractionValue(
      quality.revision,
      recordId,
      "year",
      2025,
      null,
      evidencePointer(recordId, "extraction-year", "Published 2025", 1, "Front matter"),
      "reviewer@example.com",
    );
    const missing = await study.submitExtractionValue(
      extracted.revision,
      recordId,
      "finding",
      null,
      "Not reported",
      null,
      "reviewer@example.com",
    );
    expect(missing.records[0]).toMatchObject({ extractionComplete: true });
    expect(missing.records[0]?.extractionValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ protocolRevision: 3, criterionId: "year", criterionText: "Year", value: 2025 }),
        expect.objectContaining({ protocolRevision: 3, criterionId: "finding", criterionText: "Key finding", value: null }),
      ]),
    );
    const synthesisAtMissing = await study.getSynthesisAtRevision(missing.revision, "reviewer@example.com");
    expect(synthesisAtMissing).toMatchObject({
      revision: missing.revision,
      flow: { identified: 1, included: 1 },
      matrix: [{ title: "Evidence Study", Year: 2025, "Key finding": "Missing: Not reported" }],
    });
    const revised = await study.submitExtractionValue(
      missing.revision,
      recordId,
      "year",
      2026,
      null,
      evidencePointer(recordId, "extraction-year-correction", "Corrected to 2026", 1, "Front matter"),
      "reviewer@example.com",
    );
    expect(revised.revision).toBe(missing.revision + 1);
    expect(await study.getSynthesisAtRevision(missing.revision, "reviewer@example.com")).toEqual(synthesisAtMissing);
    expect(await study.getSynthesis("reviewer@example.com")).toMatchObject({ matrix: [{ Year: 2026 }] });

    const evidenceRecord = revised.records[0]!;
    const appraisal = evidenceRecord.qualityValues.at(-1)!;
    const year = evidenceRecord.extractionValues.filter((value) => value.fieldId === "year").at(-1)!;
    const findings = await study.createFinding(
      revised.revision,
      {
        researchQuestionId: "rq1",
        statement: "The study reports evidence from 2026.",
        interpretation: "The corrected publication year is used.",
        extractionValueIds: [year.id],
        appraisalValueIds: [appraisal.id],
        evidence: [
          { contributorKind: "extraction", contributorId: year.id, pointer: year.evidence! },
          { contributorKind: "appraisal", contributorId: appraisal.id, pointer: appraisal.evidence! },
        ],
        supersedesId: null,
      },
      "reviewer@example.com",
    );
    expect(findings).toMatchObject({
      findings: [{ reviewRevision: findings.revision, protocolRevision: 3, researchQuestionId: "rq1" }],
    });
    expect(await study.getSynthesis("reviewer@example.com")).toMatchObject({
      findings: [{ statement: "The study reports evidence from 2026." }],
    });

    const authorityBeforeAmendment = await study.getExportAuthorityAtRevision(findings.revision, "reviewer@example.com");
    const amended = await study.amendProtocol({
      expectedRevision: findings.revision,
      content: {
        ...content,
        objective: "Reassess extraction under clarified coding guidance",
        amendmentImpact: { stages: ["extraction"], recordIds: [recordId] },
      },
      rationale: "Pilot coding exposed an ambiguous year rule",
      actor: "owner@example.com",
    });
    const reassessment = await study.getReassessmentSnapshot();
    expect(reassessment).toMatchObject({
      revision: amended.revision,
      obligations: [
        {
          amendmentProtocolRevision: amended.revision,
          stage: "extraction",
          recordId,
          status: "open",
        },
      ],
    });
    const evidenceAfterAmendment = await study.getEvidenceSnapshot("reviewer@example.com");
    expect(evidenceAfterAmendment.protocolRevision).toBe(amended.revision);
    expect(evidenceAfterAmendment.records[0]?.extractionValues.at(-1)).toMatchObject({ protocolRevision: 3, value: 2026 });
    expect(await study.getScreeningSnapshot("reviewer@example.com")).toMatchObject({
      records: [
        {
          titleAbstract: { decisions: [{ protocolRevision: 3, criterionId: "eligible" }] },
          fullText: { decisions: [{ protocolRevision: 3, criterionId: "eligible" }] },
          finalInclusion: { decision: { protocolRevision: 3, outcome: "include" } },
        },
      ],
    });
    const reassessed = await study.submitExtractionValue(
      amended.revision,
      recordId,
      "year",
      2026,
      null,
      evidencePointer(recordId, "extraction-year-reassessed", "Year coding was reconfirmed as 2026", 1, "Front matter"),
      "reviewer@example.com",
    );
    expect(reassessed.records[0]?.extractionValues.at(-1)).toMatchObject({
      protocolRevision: amended.revision,
      criterionId: "year",
      criterionText: "Year",
    });
    const completed = await study.completeReassessmentObligation(
      reassessed.revision,
      reassessment.obligations[0]!.id,
      "Re-extracted the affected field against the clarified protocol",
      "reviewer@example.com",
    );
    expect(completed.obligations[0]).toMatchObject({ status: "completed", completedRevision: completed.revision });
    expect(await study.getExportAuthorityAtRevision(findings.revision, "reviewer@example.com")).toEqual(authorityBeforeAmendment);
  });

  it("records model provenance and applies candidates only after human acceptance", async () => {
    const study = env.REVIEW_STUDIES.getByName(`review-model-${crypto.randomUUID()}`);
    const initial = await study.getSnapshot();
    const content = {
      ...defaultReviewProtocol(),
      modelAssistance: { mode: "assisted" as const },
      eligibilityCriteria: [
        {
          id: "empirical",
          kind: "include" as const,
          text: "Empirical",
          applicableStages: ["title-abstract", "full-text"] as const,
        },
      ],
      extractionFields: [
        {
          id: "design",
          label: "Design",
          type: "single-choice" as const,
          values: ["survey"],
          researchQuestionIds: [],
          requiredness: "required" as const,
          cardinality: "single" as const,
          condition: null,
        },
      ],
      sources: [formalSource({ id: "source", name: "Source", url: "", dialect: "generic", fieldScope: "all-fields" })],
    };
    await study.replaceProtocol({ expectedRevision: initial.revision, content, actor: "owner@example.com" });
    await study.freezeProtocol(2, "owner@example.com");
    const bibtex = "@article{study, title={A Survey}, abstract={We conducted a survey.}}";
    const preview = await previewReviewBibTeX(bibtex);
    const searched = await study.confirmSearchRun({
      expectedRevision: 3,
      sourceId: "source",
      query: "survey",
      searchedAt: "2026-07-17T09:00:00Z",
      bibtex,
      digest: preview.digest,
      ...importProvenance(1),
      actor: "owner@example.com",
    });
    const recordId = searched.records[0]!.id;
    const screeningCandidate = await study.createModelCandidate({
      expectedRevision: searched.revision,
      operation: "screen-record",
      recordId,
      stage: "title-abstract",
      provider: "Browser-local OpenAI-compatible",
      model: "local-model",
      promptTemplateVersion: "review-screening-v1",
      sourceScope: ["bibliographic title", "bibliographic abstract", "frozen eligibility criteria"],
      result: { decision: "include", criterion: "empirical", rationale: "Reports a study.", evidence: "survey" },
      actor: "reviewer@example.com",
    });
    const authorityWithPendingModel = await study.getExportAuthorityAtRevision(screeningCandidate.revision, "reviewer@example.com");
    expect((await study.getScreeningSnapshot("reviewer@example.com")).records[0]?.titleAbstract.outcome).toBe("pending");
    const acceptedScreen = await study.resolveModelCandidate(
      screeningCandidate.revision,
      screeningCandidate.candidates[0]!.id,
      "accepted",
      "reviewer@example.com",
    );
    expect(acceptedScreen.revision).toBe(screeningCandidate.revision + 1);
    expect(acceptedScreen.candidates[0]).toMatchObject({ disposition: "accepted", model: "local-model" });
    expect(await study.getExportAuthorityAtRevision(screeningCandidate.revision, "reviewer@example.com")).toEqual(
      authorityWithPendingModel,
    );
    expect(authorityWithPendingModel).toMatchObject({
      model: { candidates: [{ disposition: "pending", disposedAt: null, disposedBy: null }] },
      screening: { records: [{ titleAbstract: { outcome: "pending", decisions: [] } }] },
    });
    const titleState = await study.getScreeningSnapshot("reviewer@example.com");
    expect(titleState.records[0]?.titleAbstract).toMatchObject({
      outcome: "include",
      decisions: [{ protocolRevision: 3, criterionId: "empirical", criterionText: "Empirical" }],
    });
    const full = await study.submitScreeningDecision(
      titleState.revision,
      recordId,
      "full-text",
      "include",
      "Eligible",
      "empirical",
      "reviewer@example.com",
    );
    const final = await study.decideFinalInclusion(
      full.revision,
      recordId,
      "include",
      "empirical",
      "Included in the synthesis set",
      "reviewer@example.com",
    );
    const extractionCandidate = await study.createModelCandidate({
      expectedRevision: final.revision,
      operation: "extract-field",
      recordId,
      stage: null,
      provider: "Browser-local OpenAI-compatible",
      model: "local-model",
      promptTemplateVersion: "review-extraction-v1",
      sourceScope: ["researcher-authorized exact quotation", "frozen extraction field"],
      result: {
        fieldId: "design",
        value: "survey",
        missingReason: null,
        evidence: evidencePointer(recordId, "model-design", "We conducted a survey.", 2, "Methods"),
        rationale: "The design is explicit.",
      },
      actor: "reviewer@example.com",
    });
    await study.resolveModelCandidate(
      extractionCandidate.revision,
      extractionCandidate.candidates.find((candidate) => candidate.operation === "extract-field")!.id,
      "accepted",
      "reviewer@example.com",
    );
    expect(await study.getEvidenceSnapshot("reviewer@example.com")).toMatchObject({
      protocol: {
        researchQuestions: content.researchQuestions,
        extractionFields: content.extractionFields,
      },
      records: [
        {
          extractionComplete: true,
          extractionValues: [{ protocolRevision: 3, criterionId: "design", criterionText: "Design", value: "survey" }],
        },
      ],
    });
  });
});

function importProvenance(reportedResultCount: number, filename = "source-results.bib") {
  return { filename, mediaType: "application/x-bibtex" as const, reportedResultCount };
}

function evidencePointer(recordId: string, selectorId: string, quote: string, page: number, location: string) {
  return { kind: "pdf-annotation" as const, resourceId: `record:${recordId}:pdf`, selectorId, quote, page, location };
}

function formalSource(source: Pick<ReviewSearchSource, "id" | "name" | "url" | "dialect" | "fieldScope">): ReviewSearchSource {
  return {
    ...source,
    sourceClass: "bibliographic-database",
    evidenceClass: "formal",
    greySourceClass: null,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
