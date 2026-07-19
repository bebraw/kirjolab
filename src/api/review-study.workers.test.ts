import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { defaultReviewProtocol } from "../domain/review-study";
import type { AuthIdentity } from "../security/auth";
import { handleReviewStudyApi } from "./review-study";

const identity = {
  subject: "local:test",
  email: "reviewer@example.com",
  ownerKey: "review-api-test",
  mode: "local",
} satisfies AuthIdentity;

describe("review-study API in the Workers runtime", () => {
  it("reads, edits, and freezes an authenticated study stub", async () => {
    const study = env.REVIEW_STUDIES.getByName(`review-api-${crypto.randomUUID()}`);
    const read = await handleReviewStudyApi(
      new Request("http://example.com/api/workspaces/project/review-study"),
      study,
      identity,
      "/review-study",
    );
    expect(read.headers.get("cache-control")).toBe("no-store");
    const initial = (await read.json()) as { revision: number };

    const content = {
      ...defaultReviewProtocol(),
      objective: "Answer a reproducible question",
      researchQuestions: [{ id: "rq1", text: "What is known?" }],
    };
    const update = await handleReviewStudyApi(
      jsonRequest(
        "http://example.com/api/workspaces/project/review-study/protocol",
        { expectedRevision: initial.revision, content },
        "PUT",
      ),
      study,
      identity,
      "/review-study/protocol",
    );
    expect(update.status).toBe(200);
    await expect(update.json()).resolves.toMatchObject({ revision: 2, protocol: { objective: "Answer a reproducible question" } });

    const freeze = await handleReviewStudyApi(
      jsonRequest("http://example.com/api/workspaces/project/review-study/protocol/freeze", { expectedRevision: 2 }),
      study,
      identity,
      "/review-study/protocol/freeze",
    );
    await expect(freeze.json()).resolves.toMatchObject({ revision: 3, protocol: { status: "frozen", createdBy: identity.email } });
  });

  it("rejects malformed protocol requests and unknown routes", async () => {
    const study = env.REVIEW_STUDIES.getByName(`review-api-invalid-${crypto.randomUUID()}`);
    await expect(
      handleReviewStudyApi(
        jsonRequest("http://example.com/api/workspaces/project/review-study/protocol", { expectedRevision: 0, content: {} }, "PUT"),
        study,
        identity,
        "/review-study/protocol",
      ),
    ).rejects.toThrow("revision");
    expect(
      (
        await handleReviewStudyApi(
          new Request("http://example.com/api/workspaces/project/review-study/missing"),
          study,
          identity,
          "/review-study/missing",
        )
      ).status,
    ).toBe(404);
  });

  it("previews and confirms a source search import", async () => {
    const study = env.REVIEW_STUDIES.getByName(`review-api-search-${crypto.randomUUID()}`);
    const initial = (await (
      await handleReviewStudyApi(new Request("http://example.com/review"), study, identity, "/review-study")
    ).json()) as { revision: number };
    const content = {
      ...defaultReviewProtocol(),
      sources: [
        { id: "acm", name: "ACM DL", url: "https://dl.acm.org", dialect: "acm-dl" as const, fieldScope: "title-abstract" as const },
      ],
      eligibilityCriteria: [
        {
          id: "include-relevant-study",
          kind: "include" as const,
          text: "Addresses the review question",
          applicableStages: ["title-abstract", "full-text"] as const,
        },
      ],
    };
    const inclusionCriterionId = content.eligibilityCriteria.find(
      (criterion) => criterion.kind === "include" && criterion.applicableStages.includes("title-abstract"),
    )!.id;
    await handleReviewStudyApi(
      jsonRequest("http://example.com/protocol", { expectedRevision: initial.revision, content }, "PUT"),
      study,
      identity,
      "/review-study/protocol",
    );
    await handleReviewStudyApi(
      jsonRequest("http://example.com/freeze", { expectedRevision: 2 }),
      study,
      identity,
      "/review-study/protocol/freeze",
    );
    const bibtex = "@article{study, title={A Study}, author={Doe, Jane}, year={2025}}";
    const previewResponse = await handleReviewStudyApi(
      jsonRequest("http://example.com/preview", { bibtex }),
      study,
      identity,
      "/review-study/search-import-previews",
    );
    const preview = (await previewResponse.json()) as { digest: string };
    const confirmation = {
      expectedRevision: 3,
      sourceId: "acm",
      query: "[[Title: study]]",
      searchedAt: "2026-07-17T10:00:00Z",
      bibtex,
      digest: preview.digest,
      filename: "acm-results.bib",
      mediaType: "application/x-bibtex",
      reportedResultCount: 1,
    };
    for (const invalid of [
      { ...confirmation, filename: "../results.bib" },
      { ...confirmation, mediaType: "text/plain" },
      { ...confirmation, reportedResultCount: -1 },
    ]) {
      await expect(
        handleReviewStudyApi(jsonRequest("http://example.com/runs", invalid), study, identity, "/review-study/search-runs"),
      ).rejects.toThrow("search run request");
    }
    const confirm = await handleReviewStudyApi(
      jsonRequest("http://example.com/runs", confirmation),
      study,
      identity,
      "/review-study/search-runs",
    );
    const confirmed = (await confirm.json()) as {
      revision: number;
      records: { id: string }[];
      runs: { importBatchIds: string[]; reportedResultCount: number }[];
      batches: { filename: string; parserVersion: string; byteCount: number }[];
      occurrences: { batchId: string }[];
    };
    expect(confirmed).toMatchObject({ revision: 4, counts: { identified: 1, unique: 1 } });
    expect(confirmed.runs[0]).toMatchObject({ reportedResultCount: 1, importBatchIds: [expect.any(String)] });
    expect(confirmed.batches[0]).toMatchObject({
      filename: "acm-results.bib",
      parserVersion: "kirjolab-bibtex-v1",
      byteCount: new TextEncoder().encode(bibtex).byteLength,
    });
    expect(confirmed.occurrences[0]?.batchId).toBe(confirmed.runs[0]?.importBatchIds[0]);
    const screening = await handleReviewStudyApi(
      jsonRequest("http://example.com/screen", {
        expectedRevision: confirmed.revision,
        stage: "title-abstract",
        decision: "include",
        reason: "Relevant",
        criterionId: inclusionCriterionId,
      }),
      study,
      identity,
      `/review-study/records/${confirmed.records[0]!.id}/screening-decisions`,
    );
    await expect(screening.json()).resolves.toMatchObject({ revision: 5, counts: { titleAbstractIncluded: 1 } });
  });

  it("authorizes exact project selectors for model extraction candidates", async () => {
    const key = `review-api-model-selector-${crypto.randomUUID()}`;
    const workspaceId = "project";
    const study = env.REVIEW_STUDIES.getByName(key);
    const room = env.DOCUMENT_ROOMS.getByName(key);
    const initial = await study.getSnapshot("slr", identity.email);
    const criterionId = "eligible";
    const fieldId = "source-passage";
    await study.replaceProtocol({
      expectedRevision: initial.revision,
      content: {
        ...defaultReviewProtocol(),
        modelAssistance: { mode: "assisted" },
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
        eligibilityCriteria: [
          {
            id: criterionId,
            kind: "include",
            text: "Eligible",
            applicableStages: ["title-abstract", "full-text"],
          },
        ],
        extractionFields: [
          {
            id: fieldId,
            label: "Source passage",
            type: "source-selector",
            values: [],
            researchQuestionIds: [],
            requiredness: "required",
            cardinality: "single",
            condition: null,
          },
        ],
      },
      actor: identity.email,
    });
    const frozen = await study.freezeProtocol(initial.revision + 1, identity.email);
    const bibtex = "@article{study, title={A Study}, abstract={Relevant evidence.}}";
    const preview = (await (
      await handleReviewStudyApi(
        jsonRequest("http://example.com/preview", { bibtex }),
        study,
        identity,
        "/review-study/search-import-previews",
      )
    ).json()) as { digest: string };
    const searched = await study.confirmSearchRun({
      expectedRevision: frozen.revision,
      sourceId: "source",
      query: "study",
      searchedAt: "2026-07-19T09:00:00Z",
      bibtex,
      digest: preview.digest,
      filename: "source-results.bib",
      mediaType: "application/x-bibtex",
      reportedResultCount: 1,
      actor: identity.email,
    });
    const recordId = searched.records[0]!.id;
    const titleIncluded = await study.submitScreeningDecision(
      searched.revision,
      recordId,
      "title-abstract",
      "include",
      "Relevant",
      criterionId,
      identity.email,
    );
    const fullTextIncluded = await study.submitScreeningDecision(
      titleIncluded.revision,
      recordId,
      "full-text",
      "include",
      "Eligible",
      criterionId,
      identity.email,
    );
    const finallyIncluded = await study.decideFinalInclusion(
      fullTextIncluded.revision,
      recordId,
      "include",
      criterionId,
      "Included for extraction",
      identity.email,
    );

    const pdfId = crypto.randomUUID();
    await room.registerPdf({
      id: pdfId,
      name: "study.pdf",
      contentType: "application/pdf",
      size: 42,
      objectKey: `review-api-model-selector/${pdfId}.pdf`,
      fingerprint: `test:${pdfId}`,
      createdAt: new Date().toISOString(),
    });
    const annotation = await room.createAnnotation({
      pdfId,
      page: 2,
      quote: "The sampled source passage.",
      prefix: "Before",
      suffix: "After",
      comment: "Extraction evidence",
      rects: [],
    });
    const evidence = {
      kind: "pdf-annotation" as const,
      resourceId: pdfId,
      selectorId: annotation.id,
      quote: annotation.quote,
      page: annotation.page,
      location: "Methods, p. 2",
    };
    const value = {
      kind: "pdf-annotation" as const,
      resourceId: pdfId,
      selectorId: annotation.fragments[0]!.id,
    };
    const candidateRequest = {
      expectedRevision: finallyIncluded.revision,
      operation: "extract-field" as const,
      recordId,
      stage: null,
      provider: "Browser-local OpenAI-compatible",
      model: "local-model",
      promptTemplateVersion: "review-extraction-v1",
      sourceScope: ["researcher-authorized exact quotation"],
      result: {
        fieldId,
        value,
        missingReason: null,
        evidence,
        rationale: "The passage is explicit.",
      },
    };

    await expect(
      handleReviewStudyApi(
        jsonRequest("http://example.com/model-candidates", {
          ...candidateRequest,
          result: { ...candidateRequest.result, evidence: { ...evidence, quote: "Fabricated quote" } },
        }),
        study,
        identity,
        "/review-study/model-candidates",
        room,
        workspaceId,
      ),
    ).rejects.toThrow("does not match");
    await expect(
      handleReviewStudyApi(
        jsonRequest("http://example.com/model-candidates", {
          ...candidateRequest,
          result: { ...candidateRequest.result, value: { ...value, selectorId: crypto.randomUUID() } },
        }),
        study,
        identity,
        "/review-study/model-candidates",
        room,
        workspaceId,
      ),
    ).rejects.toThrow("not shared");
    await expect(study.getModelSnapshot(identity.email)).resolves.toMatchObject({
      revision: finallyIncluded.revision,
      candidates: [],
    });

    const createdResponse = await handleReviewStudyApi(
      jsonRequest("http://example.com/model-candidates", candidateRequest),
      study,
      identity,
      "/review-study/model-candidates",
      room,
      workspaceId,
    );
    const created = (await createdResponse.json()) as {
      revision: number;
      candidates: { id: string; disposition: string }[];
    };
    expect(created.candidates).toEqual([expect.objectContaining({ disposition: "pending" })]);

    const accepted = await handleReviewStudyApi(
      jsonRequest("http://example.com/accept", { expectedRevision: created.revision }),
      study,
      identity,
      `/review-study/model-candidates/${created.candidates[0]!.id}/accept`,
      room,
      workspaceId,
    );
    const acceptedSnapshot = (await accepted.json()) as {
      revision: number;
      candidates: { id: string; disposition: string }[];
    };
    expect(acceptedSnapshot).toMatchObject({ candidates: [{ disposition: "accepted" }] });
    await expect(study.getEvidenceSnapshot(identity.email)).resolves.toMatchObject({
      records: [{ extractionValues: [{ fieldId, value, evidence }] }],
    });

    const revokedAnnotation = await room.createAnnotation({
      pdfId,
      page: 3,
      quote: "This authority will be revoked.",
      prefix: "Before",
      suffix: "After",
      comment: "Temporary extraction evidence",
      rects: [],
    });
    const revokedEvidence = {
      ...evidence,
      selectorId: revokedAnnotation.id,
      quote: revokedAnnotation.quote,
      page: revokedAnnotation.page,
      location: "Results, p. 3",
    };
    const revokedValue = {
      ...value,
      selectorId: revokedAnnotation.fragments[0]!.id,
    };
    const revokedCandidateResponse = await handleReviewStudyApi(
      jsonRequest("http://example.com/model-candidates", {
        ...candidateRequest,
        expectedRevision: acceptedSnapshot.revision,
        result: { ...candidateRequest.result, value: revokedValue, evidence: revokedEvidence },
      }),
      study,
      identity,
      "/review-study/model-candidates",
      room,
      workspaceId,
    );
    const revokedCandidate = (await revokedCandidateResponse.json()) as {
      revision: number;
      candidates: { id: string; disposition: string }[];
    };
    const pendingId = revokedCandidate.candidates.find((candidate) => candidate.disposition === "pending")!.id;
    await room.deleteAnnotation(revokedAnnotation.id);
    await expect(
      handleReviewStudyApi(
        jsonRequest("http://example.com/accept", { expectedRevision: revokedCandidate.revision }),
        study,
        identity,
        `/review-study/model-candidates/${pendingId}/accept`,
        room,
        workspaceId,
      ),
    ).rejects.toThrow("not shared");
    await expect(study.getModelSnapshot(identity.email)).resolves.toMatchObject({
      revision: revokedCandidate.revision,
      candidates: [{ disposition: "accepted" }, { id: pendingId, disposition: "pending" }],
    });
  });

  it("publishes one exact review revision with an atomic project pin", async () => {
    const key = `review-api-publish-${crypto.randomUUID()}`;
    const study = env.REVIEW_STUDIES.getByName(key);
    const room = env.DOCUMENT_ROOMS.getByName(key);
    const initialReview = await study.getSnapshot("slr", identity.email);
    const frozen = await study.freezeProtocol(initialReview.revision, identity.email);
    const initialProject = await room.getSnapshot("project");
    const reviewId = crypto.randomUUID();
    const linkId = crypto.randomUUID();
    await room.linkReview("project", linkId, reviewId, key, identity.email, new Date().toISOString());

    const published = await handleReviewStudyApi(
      jsonRequest("http://example.com/publish", {
        expectedProjectRevision: initialProject.revision,
        reviewRevision: frozen.revision,
        path: "review/synthesis.md",
      }),
      study,
      identity,
      "/review-study/synthesis/publish",
      room,
      "project",
      { reviewId, linkId },
    );
    expect(published.status).toBe(200);
    const payload = (await published.json()) as {
      directive: string;
      pin: {
        reviewId: string;
        linkId: string;
        publicationId: string;
        reviewRevision: number;
        protocolRevision: number;
        analysisDefinitionId: string;
        generatorSchema: string;
        digest: string;
        publishedBy: string;
      };
      project: { revision: number };
    };
    expect(payload.directive).toBe("::review-artifact[review/synthesis.md]");
    expect(payload.pin).toMatchObject({
      reviewRevision: frozen.revision,
      protocolRevision: frozen.protocol.revision,
      analysisDefinitionId: "review-synthesis-report",
      reviewId,
      linkId,
      publicationId: `${reviewId}:synthesis`,
      generatorSchema: "kirjolab-review-analysis-v1",
      publishedBy: identity.email,
    });
    expect(payload.pin.digest).toMatch(/^[a-f0-9]{64}$/u);

    const project = await room.getSnapshot("project");
    expect(project.revision).toBe(payload.project.revision);
    expect(project.reviewArtifactPins).toEqual([expect.objectContaining(payload.pin)]);
    expect(project.files.find((file) => file.path === "review/synthesis.md")?.content).toContain(`review-revision=${frozen.revision}`);

    await study.amendProtocol({
      expectedRevision: frozen.revision,
      content: { ...frozen.protocol, amendmentImpact: { stages: ["reporting"], recordIds: [] } },
      rationale: "Later review activity",
      actor: identity.email,
    });
    await expect(room.getSnapshot("project")).resolves.toMatchObject({
      revision: payload.project.revision,
      reviewArtifactPins: [{ reviewRevision: frozen.revision }],
    });
  });

  it("returns structured blocking diagnostics without changing the project", async () => {
    const key = `review-api-blocked-${crypto.randomUUID()}`;
    const study = env.REVIEW_STUDIES.getByName(key);
    const room = env.DOCUMENT_ROOMS.getByName(key);
    const draft = await study.getSnapshot("slr", identity.email);
    const initialProject = await room.getSnapshot("project");
    const reviewId = crypto.randomUUID();
    const linkId = crypto.randomUUID();
    await room.linkReview("project", linkId, reviewId, key, identity.email, new Date().toISOString());

    const response = await handleReviewStudyApi(
      jsonRequest("http://example.com/publish", {
        expectedProjectRevision: initialProject.revision,
        reviewRevision: draft.revision,
        path: "review/synthesis.md",
      }),
      study,
      identity,
      "/review-study/synthesis/publish",
      room,
      "project",
      { reviewId, linkId },
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "review-synthesis-blocked",
      reviewRevision: draft.revision,
      diagnostics: [{ code: "protocol-draft", blocking: true }],
    });
    await expect(room.getSnapshot("project")).resolves.toMatchObject({
      revision: initialProject.revision,
      reviewArtifactPins: [],
    });
  });
});

function jsonRequest(url: string, body: unknown, method: "POST" | "PUT" = "POST"): Request {
  return new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
