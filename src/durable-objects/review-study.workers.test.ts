import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { defaultReviewProtocol } from "../domain/review-study";
import { previewReviewBibTeX } from "../domain/review-search";
import { ReviewStudy } from "./review-study";

describe("ReviewStudy in the Workers runtime", () => {
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
      sources: [
        { id: "scopus", name: "Scopus", url: "https://scopus.com", dialect: "scopus" as const, fieldScope: "title-abstract" as const },
      ],
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
    const amended = await study.amendProtocol({
      expectedRevision: 3,
      content: { ...content, objective: "Map current practices" },
      rationale: "Pilot search exposed ambiguity",
      actor: "owner@example.com",
    });
    expect(amended).toMatchObject({ revision: 4, protocol: { status: "frozen", rationale: "Pilot search exposed ambiguity" } });
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
      sources: [
        { id: "scopus", name: "Scopus", url: "https://scopus.com", dialect: "scopus" as const, fieldScope: "title-abstract" as const },
      ],
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
    expect((await study.getSnapshot()).revision).toBe(3);

    await setCounts(0, 0, 0, 0);
    await expect(study.confirmSearchRun(input)).resolves.toMatchObject({ revision: 4, counts: { identified: 1, unique: 1 } });
  });

  it("blinds independent screening decisions and preserves adjudicated conflicts", async () => {
    const study = env.REVIEW_STUDIES.getByName(`review-screen-${crypto.randomUUID()}`);
    const initial = await study.getSnapshot();
    const content = {
      ...defaultReviewProtocol(),
      screening: { reviewersPerStage: 2 as const, blinded: true },
      inclusionCriteria: ["Addresses the research question"],
      exclusionCriteria: ["Not empirical"],
      sources: [{ id: "source", name: "Source", url: "", dialect: "generic" as const, fieldScope: "all-fields" as const }],
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
    const first = await study.submitScreeningDecision(
      searched.revision,
      recordId,
      "title-abstract",
      "include",
      "Relevant",
      "Addresses the research question",
      "reviewer-a@example.com",
    );
    expect(first.records[0]?.titleAbstract).toMatchObject({ outcome: "pending", decisions: [{ reviewer: "reviewer-a@example.com" }] });
    expect((await study.getScreeningSnapshot("reviewer-b@example.com")).records[0]?.titleAbstract.decisions).toEqual([]);
    const second = await study.submitScreeningDecision(
      first.revision,
      recordId,
      "title-abstract",
      "exclude",
      "Not empirical",
      "Not empirical",
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
    expect(adjudicated.records[0]?.titleAbstract).toMatchObject({ outcome: "include", adjudication: { adjudicator: "lead@example.com" } });
    expect(adjudicated.records[0]?.titleAbstract.decisions).toHaveLength(2);
    const fullText = await study.submitScreeningDecision(
      adjudicated.revision,
      recordId,
      "full-text",
      "include",
      "Eligible",
      "Addresses the research question",
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
      qualityAssessment: {
        questions: [{ id: "method", text: "Is the method clear?" }],
        answers: defaults.qualityAssessment.answers,
        minimumScore: 0.5,
      },
      extractionFields: [
        { id: "year", label: "Year", type: "integer" as const, values: [], researchQuestionIds: [] },
        { id: "finding", label: "Key finding", type: "string" as const, values: [], researchQuestionIds: [] },
      ],
      sources: [{ id: "source", name: "Source", url: "", dialect: "generic" as const, fieldScope: "all-fields" as const }],
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
      "",
      "reviewer@example.com",
    );
    const full = await study.submitScreeningDecision(
      title.revision,
      recordId,
      "full-text",
      "include",
      "Eligible",
      "",
      "reviewer@example.com",
    );
    const quality = await study.submitQualityAssessment(
      full.revision,
      recordId,
      "method",
      "yes",
      { quote: "The method was preregistered.", page: 3, location: "Methods" },
      "",
      "reviewer@example.com",
    );
    expect(quality.records[0]).toMatchObject({ qualityScore: 1, qualityComplete: true, qualityRejected: false });
    const extracted = await study.submitExtractionValue(
      quality.revision,
      recordId,
      "year",
      2025,
      null,
      { quote: "Published 2025", page: 1, location: "Front matter" },
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
    expect(missing.records[0]?.extractionValues).toHaveLength(2);
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
      { quote: "Corrected to 2026", page: 1, location: "Front matter" },
      "reviewer@example.com",
    );
    expect(revised.revision).toBe(missing.revision + 1);
    expect(await study.getSynthesisAtRevision(missing.revision, "reviewer@example.com")).toEqual(synthesisAtMissing);
    expect(await study.getSynthesis("reviewer@example.com")).toMatchObject({ matrix: [{ Year: 2026 }] });
  });

  it("records model provenance and applies candidates only after human acceptance", async () => {
    const study = env.REVIEW_STUDIES.getByName(`review-model-${crypto.randomUUID()}`);
    const initial = await study.getSnapshot();
    const content = {
      ...defaultReviewProtocol(),
      modelAssistance: { mode: "assisted" as const },
      inclusionCriteria: ["Empirical"],
      extractionFields: [{ id: "design", label: "Design", type: "enum" as const, values: ["survey"], researchQuestionIds: [] }],
      sources: [{ id: "source", name: "Source", url: "", dialect: "generic" as const, fieldScope: "all-fields" as const }],
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
      result: { decision: "include", criterion: "Empirical", rationale: "Reports a study.", evidence: "survey" },
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
    expect(titleState.records[0]?.titleAbstract.outcome).toBe("include");
    const full = await study.submitScreeningDecision(
      titleState.revision,
      recordId,
      "full-text",
      "include",
      "Eligible",
      "Empirical",
      "reviewer@example.com",
    );
    const extractionCandidate = await study.createModelCandidate({
      expectedRevision: full.revision,
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
        evidence: { quote: "We conducted a survey.", page: 2, location: "Methods" },
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
      records: [{ extractionComplete: true, extractionValues: [{ value: "survey" }] }],
    });
  });
});

function importProvenance(reportedResultCount: number, filename = "source-results.bib") {
  return { filename, mediaType: "application/x-bibtex" as const, reportedResultCount };
}
