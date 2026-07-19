import { parseReviewProtocolContent, type ReviewProfile } from "../domain/review-study";
import { previewReviewBibTeX, reviewBibTeXImport, reviewImportLimits } from "../domain/review-search";
import type { ScreeningDecisionValue, ScreeningStage } from "../domain/review-screening";
import type { ReviewModelOperation } from "../domain/review-model";
import { parseReviewFindingInput, type ReviewFindingInput } from "../domain/review-findings";
import {
  parseEvidencePointer,
  parseExtractionValueShape,
  type ExtractionValue,
  type ReviewEvidencePointer,
  type ReviewSourceSelectorValue,
} from "../domain/review-evidence";
import {
  blockingReviewSynthesisDiagnostics,
  reviewSynthesisCsv,
  reviewSynthesisMarkdown,
  reviewSynthesisReportDefinition,
} from "../domain/review-synthesis";
import {
  buildReviewPackage,
  reviewAuthorityJson,
  reviewBibliographyBibTeX,
  reviewExtractionCsv,
  reviewPrismaData,
  reviewPrismaSvg,
  stableReviewJson,
} from "../domain/review-export";
import type { AuthIdentity } from "../security/auth";
import { canonicalReviewArtifactPath } from "../domain/workspace";

const maximumProtocolRequestBytes = 2 * 1024 * 1024;

export interface ReviewStudyApiContext {
  readonly reviewId: string;
  readonly linkId: string | null;
  readonly profile: ReviewProfile;
}

export async function handleReviewStudyApi(
  request: Request,
  study: DurableObjectStub<import("../durable-objects/review-study").ReviewStudy>,
  identity: AuthIdentity,
  suffix: string,
  room?: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom>,
  workspaceId?: string,
  context: ReviewStudyApiContext = {
    reviewId: "legacy-project-review",
    linkId: "legacy-project-review-link",
    profile: "slr",
  },
): Promise<Response> {
  if (suffix === "/review-study" && request.method === "GET") {
    return noStore(await study.getSnapshot(context.profile, identity.email));
  }
  if (suffix === "/review-study/protocol" && request.method === "PUT") {
    const body = await protocolRequest(request);
    return noStore(
      await study.replaceProtocol({
        expectedRevision: body.expectedRevision,
        content: body.content,
        ...(body.rationale ? { rationale: body.rationale } : {}),
        actor: identity.email,
      }),
    );
  }
  if (suffix === "/review-study/protocol/freeze" && request.method === "POST") {
    const body = await expectedRevisionRequest(request);
    return noStore(await study.freezeProtocol(body.expectedRevision, identity.email));
  }
  if (suffix === "/review-study/protocol/amend" && request.method === "POST") {
    const body = await protocolRequest(request, true);
    return noStore(
      await study.amendProtocol({
        expectedRevision: body.expectedRevision,
        content: body.content,
        rationale: body.rationale!,
        actor: identity.email,
      }),
    );
  }
  if (suffix === "/review-study/reassessments" && request.method === "GET") {
    return noStore(await study.getReassessmentSnapshot());
  }
  const reassessmentMatch = /^\/review-study\/reassessments\/([a-f0-9-]{36})\/complete$/iu.exec(suffix);
  if (reassessmentMatch?.[1] && request.method === "POST") {
    const body = await reassessmentCompletionRequest(request);
    return noStore(await study.completeReassessmentObligation(body.expectedRevision, reassessmentMatch[1], body.rationale, identity.email));
  }
  if (suffix === "/review-study/search-import-previews" && request.method === "POST") {
    const body = await searchImportBody(request);
    return noStore(await previewReviewBibTeX(body.bibtex));
  }
  if (suffix === "/review-study/search-runs" && request.method === "GET") return noStore(await study.getSearchSnapshot());
  if (suffix === "/review-study/search-runs" && request.method === "POST") {
    const body = await searchRunRequest(request);
    return noStore(await study.confirmSearchRun({ ...body, actor: identity.email }));
  }
  const duplicateMatch = /^\/review-study\/duplicate-candidates\/([a-f0-9-]{36})\/resolve$/iu.exec(suffix);
  if (duplicateMatch?.[1] && request.method === "POST") {
    const body = await duplicateResolutionRequest(request);
    return noStore(
      await study.resolveDuplicate(body.expectedRevision, duplicateMatch[1], body.action, body.canonicalRecordId, identity.email),
    );
  }
  if (suffix === "/review-study/screening" && request.method === "GET") return noStore(await study.getScreeningSnapshot(identity.email));
  const screeningMatch = /^\/review-study\/records\/([a-f0-9-]{36})\/screening-decisions$/iu.exec(suffix);
  if (screeningMatch?.[1] && request.method === "POST") {
    const body = await screeningDecisionRequest(request);
    return noStore(
      await study.submitScreeningDecision(
        body.expectedRevision,
        screeningMatch[1],
        body.stage,
        body.decision,
        body.reason,
        body.criterionId,
        identity.email,
      ),
    );
  }
  const adjudicationMatch = /^\/review-study\/records\/([a-f0-9-]{36})\/screening-adjudications$/iu.exec(suffix);
  if (adjudicationMatch?.[1] && request.method === "POST") {
    const body = await screeningAdjudicationRequest(request);
    return noStore(
      await study.adjudicateScreening(body.expectedRevision, adjudicationMatch[1], body.stage, body.outcome, body.reason, identity.email),
    );
  }
  const finalInclusionMatch = /^\/review-study\/records\/([a-f0-9-]{36})\/final-inclusion-decisions$/iu.exec(suffix);
  if (finalInclusionMatch?.[1] && request.method === "POST") {
    const body = await finalInclusionDecisionRequest(request);
    return noStore(
      await study.decideFinalInclusion(
        body.expectedRevision,
        finalInclusionMatch[1],
        body.outcome,
        body.criterionId,
        body.reason,
        identity.email,
      ),
    );
  }
  if (suffix === "/review-study/evidence" && request.method === "GET") return noStore(await study.getEvidenceSnapshot(identity.email));
  const qualityMatch = /^\/review-study\/records\/([a-f0-9-]{36})\/quality-values$/iu.exec(suffix);
  if (qualityMatch?.[1] && request.method === "POST") {
    const body = await qualityValueRequest(request);
    await assertAuthorizedReviewSelector(body.evidence, room, workspaceId);
    return noStore(
      await study.submitQualityAssessment(
        body.expectedRevision,
        qualityMatch[1],
        body.questionId,
        body.answerId,
        body.evidence,
        body.rationale,
        identity.email,
      ),
    );
  }
  const extractionMatch = /^\/review-study\/records\/([a-f0-9-]{36})\/extraction-values$/iu.exec(suffix);
  if (extractionMatch?.[1] && request.method === "POST") {
    const body = await extractionValueRequest(request);
    await assertAuthorizedReviewSelector(body.evidence, room, workspaceId);
    if (isReviewSourceSelectorValue(body.value)) await assertAuthorizedReviewSelector(body.value, room, workspaceId);
    return noStore(
      await study.submitExtractionValue(
        body.expectedRevision,
        extractionMatch[1],
        body.fieldId,
        body.value,
        body.missingReason,
        body.evidence,
        identity.email,
      ),
    );
  }
  if (suffix === "/review-study/model-candidates" && request.method === "GET") {
    return noStore(await study.getModelSnapshot(identity.email));
  }
  if (suffix === "/review-study/model-candidates" && request.method === "POST") {
    const body = await modelCandidateRequest(request);
    for (const selector of modelExtractionSelectors(body.operation, body.result)) {
      await assertAuthorizedReviewSelector(selector, room, workspaceId);
    }
    return noStore(await study.createModelCandidate({ ...body, actor: identity.email }));
  }
  const modelCandidateMatch = /^\/review-study\/model-candidates\/([a-f0-9-]{36})\/(accept|reject)$/iu.exec(suffix);
  if (modelCandidateMatch?.[1] && modelCandidateMatch[2] && request.method === "POST") {
    const body = await expectedRevisionRequest(request);
    if (modelCandidateMatch[2] === "accept") {
      const candidate = (await study.getModelSnapshot(identity.email)).candidates.find((item) => item.id === modelCandidateMatch[1]);
      if (candidate) {
        for (const selector of modelExtractionSelectors(candidate.operation, candidate.result)) {
          await assertAuthorizedReviewSelector(selector, room, workspaceId);
        }
      }
    }
    return noStore(
      await study.resolveModelCandidate(
        body.expectedRevision,
        modelCandidateMatch[1],
        modelCandidateMatch[2] === "accept" ? "accepted" : "rejected",
        identity.email,
      ),
    );
  }
  if (suffix === "/review-study/findings" && request.method === "GET") {
    return noStore(await study.getFindingsSnapshot());
  }
  if (suffix === "/review-study/findings" && request.method === "POST") {
    const body = await reviewFindingRequest(request);
    for (const link of body.finding.evidence) await assertAuthorizedReviewSelector(link.pointer, room, workspaceId);
    return noStore(await study.createFinding(body.expectedRevision, body.finding, identity.email));
  }
  if (suffix === "/review-study/synthesis" && request.method === "GET") return noStore(await study.getSynthesis(identity.email));
  if (suffix === "/review-study/synthesis.csv" && request.method === "GET") {
    return download(reviewSynthesisCsv(await study.getSynthesis(identity.email)), "text/csv; charset=utf-8", "review-synthesis.csv");
  }
  if (suffix === "/review-study/synthesis.md" && request.method === "GET") {
    return download(
      reviewSynthesisMarkdown(await study.getSynthesis(identity.email)),
      "text/markdown; charset=utf-8",
      "review-synthesis.md",
    );
  }
  if (suffix === "/review-study/synthesis/publish" && request.method === "POST") {
    if (!room || !workspaceId || !context.linkId) throw new Error("Project room is unavailable for review publication");
    const body = await synthesisPublishRequest(request, context);
    const synthesis = await study.getSynthesisAtRevision(body.reviewRevision, identity.email);
    const blockingDiagnostics = blockingReviewSynthesisDiagnostics(synthesis);
    if (blockingDiagnostics.length > 0) {
      return Response.json(
        {
          code: "review-synthesis-blocked",
          error: "Review synthesis has blocking diagnostics and cannot be published",
          reviewRevision: synthesis.revision,
          diagnostics: blockingDiagnostics,
        },
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    }
    const definition = reviewSynthesisReportDefinition(synthesis);
    if (body.analysisDefinitionId !== definition.id) throw new Error("Review analysis definition is unavailable");
    const content = `<!-- kirjolab-review-artifact review-id=${context.reviewId} link-id=${context.linkId} publication-id=${body.publicationId} definition=${definition.id} definition-revision=${definition.revision} review-revision=${definition.reviewRevision} protocol-revision=${definition.protocolRevision} generator=kirjolab-review-synthesis generator-schema=kirjolab-review-analysis-v1 -->\n${reviewSynthesisMarkdown(synthesis)}`;
    const generatedAt = new Date().toISOString();
    const pin = {
      path: body.path,
      reviewId: context.reviewId,
      linkId: context.linkId,
      publicationId: body.publicationId,
      reviewRevision: definition.reviewRevision,
      protocolRevision: definition.protocolRevision,
      analysisDefinitionId: definition.id,
      analysisDefinitionRevision: definition.revision,
      generator: "kirjolab-review-synthesis",
      generatorSchema: "kirjolab-review-analysis-v1",
      digest: await sha256Text(content),
      publishedBy: identity.email,
      generatedAt,
    };
    const result = await room.upsertReviewArtifact(workspaceId, body.path, content, body.expectedProjectRevision, pin);
    if (!result.ok) {
      const status = result.code === "invalid-path" || result.code === "content-too-large" || result.code === "invalid-pin" ? 400 : 409;
      return Response.json({ code: result.code, error: result.error }, { status, headers: { "cache-control": "no-store" } });
    }
    return noStore({ path: body.path, directive: `::review-artifact[${body.path}]`, pin, project: result.value });
  }
  if (suffix.startsWith("/review-study/export/") && request.method === "GET") {
    const authority = await study.getExportAuthority(identity.email);
    if (suffix === "/review-study/export/review.json") {
      return download(reviewAuthorityJson(authority), "application/json; charset=utf-8", "review.json");
    }
    if (suffix === "/review-study/export/extraction.csv") {
      return download(reviewExtractionCsv(authority), "text/csv; charset=utf-8", "extraction.csv");
    }
    if (suffix === "/review-study/export/bibliography.bib") {
      return download(reviewBibliographyBibTeX(authority), "application/x-bibtex; charset=utf-8", "bibliography.bib");
    }
    const prisma = reviewPrismaData(authority);
    if (suffix === "/review-study/export/prisma.json") {
      return download(stableReviewJson(prisma), "application/json; charset=utf-8", "prisma.json");
    }
    if (suffix === "/review-study/export/prisma.svg") {
      return download(reviewPrismaSvg(prisma), "image/svg+xml; charset=utf-8", "prisma.svg");
    }
    if (suffix === "/review-study/export/review.zip") {
      return binaryDownload(await buildReviewPackage(context.reviewId, authority), "application/zip", "review.zip");
    }
  }
  return Response.json({ error: "Review-study route not found" }, { status: 404 });
}

async function synthesisPublishRequest(
  request: Request,
  context: ReviewStudyApiContext,
): Promise<{
  expectedProjectRevision: number;
  reviewRevision: number;
  path: string;
  publicationId: string;
  analysisDefinitionId: string;
}> {
  const value: unknown = await request.json();
  if (
    !isRecord(value) ||
    typeof value.expectedProjectRevision !== "number" ||
    !Number.isSafeInteger(value.expectedProjectRevision) ||
    typeof value.reviewRevision !== "number" ||
    !Number.isSafeInteger(value.reviewRevision) ||
    value.reviewRevision < 1
  ) {
    throw new Error("Review synthesis publication request is invalid");
  }
  if (typeof value.projectLinkId === "string" && value.projectLinkId !== context.linkId) {
    throw new Error("Review publication project link does not match its target");
  }
  const artifactId = typeof value.artifactId === "string" ? value.artifactId.trim() : "synthesis";
  if (!/^[a-z0-9_-]{1,80}$/u.test(artifactId)) throw new Error("Review publication artifact identity is invalid");
  const publicationId =
    typeof value.publicationId === "string" && value.publicationId.trim()
      ? value.publicationId.trim()
      : `${context.reviewId}:${artifactId}`;
  if (publicationId.length > 128 || !/^[a-z0-9:_-]+$/iu.test(publicationId)) {
    throw new Error("Review publication identity is invalid");
  }
  const analysisDefinitionId =
    typeof value.analysisDefinitionId === "string" && value.analysisDefinitionId.trim()
      ? value.analysisDefinitionId.trim()
      : "review-synthesis-report";
  if (analysisDefinitionId.length > 128) throw new Error("Review analysis definition is invalid");
  const canonicalPath = canonicalReviewArtifactPath(context.reviewId, artifactId);
  if (!canonicalPath) throw new Error("Review publication review identity is invalid");
  const path = typeof value.path === "string" ? value.path.trim() : canonicalPath;
  if (path !== canonicalPath) throw new Error("Review synthesis path must use its review and artifact identities");
  return {
    expectedProjectRevision: value.expectedProjectRevision,
    reviewRevision: value.reviewRevision,
    path,
    publicationId,
    analysisDefinitionId,
  };
}

async function reviewFindingRequest(request: Request): Promise<{ expectedRevision: number; finding: ReviewFindingInput }> {
  const value: unknown = await request.json();
  if (!isRecord(value) || !("finding" in value)) throw new Error("Review finding request is invalid");
  return { expectedRevision: parseRevision(value.expectedRevision), finding: parseReviewFindingInput(value.finding) };
}

async function modelCandidateRequest(request: Request): Promise<{
  expectedRevision: number;
  operation: ReviewModelOperation;
  recordId: string;
  stage: ScreeningStage | null;
  provider: string;
  model: string;
  promptTemplateVersion: string;
  sourceScope: string[];
  result: unknown;
}> {
  const value: unknown = await request.json();
  if (
    !isRecord(value) ||
    typeof value.expectedRevision !== "number" ||
    !Number.isSafeInteger(value.expectedRevision) ||
    (value.operation !== "screen-record" && value.operation !== "extract-field") ||
    typeof value.recordId !== "string" ||
    (value.stage !== null && value.stage !== "title-abstract" && value.stage !== "full-text") ||
    typeof value.provider !== "string" ||
    typeof value.model !== "string" ||
    typeof value.promptTemplateVersion !== "string" ||
    !Array.isArray(value.sourceScope) ||
    !value.sourceScope.every((item) => typeof item === "string")
  ) {
    throw new Error("Review model candidate request is invalid");
  }
  return {
    expectedRevision: value.expectedRevision,
    operation: value.operation,
    recordId: value.recordId,
    stage: value.stage,
    provider: value.provider,
    model: value.model,
    promptTemplateVersion: value.promptTemplateVersion,
    sourceScope: value.sourceScope,
    result: value.result,
  };
}

async function qualityValueRequest(request: Request) {
  const value: unknown = await request.json();
  if (
    !isRecord(value) ||
    typeof value.expectedRevision !== "number" ||
    !Number.isSafeInteger(value.expectedRevision) ||
    typeof value.questionId !== "string" ||
    typeof value.answerId !== "string"
  ) {
    throw new Error("Quality assessment request is invalid");
  }
  return {
    expectedRevision: value.expectedRevision,
    questionId: value.questionId,
    answerId: value.answerId,
    evidence: parseEvidencePointer(value.evidence, false),
    rationale: typeof value.rationale === "string" ? value.rationale : "",
  };
}

async function extractionValueRequest(request: Request): Promise<{
  expectedRevision: number;
  fieldId: string;
  value: ExtractionValue;
  missingReason: string | null;
  evidence: ReturnType<typeof parseEvidencePointer>;
}> {
  const input: unknown = await request.json();
  if (
    !isRecord(input) ||
    typeof input.expectedRevision !== "number" ||
    !Number.isSafeInteger(input.expectedRevision) ||
    typeof input.fieldId !== "string" ||
    (input.missingReason !== null && typeof input.missingReason !== "string")
  ) {
    throw new Error("Extraction value request is invalid");
  }
  return {
    expectedRevision: input.expectedRevision,
    fieldId: input.fieldId,
    value: parseExtractionValueShape(input.value),
    missingReason: input.missingReason,
    evidence: parseEvidencePointer(input.evidence, input.value !== null),
  };
}

async function screeningDecisionRequest(request: Request): Promise<{
  expectedRevision: number;
  stage: ScreeningStage;
  decision: ScreeningDecisionValue;
  reason: string;
  criterionId: string | null;
}> {
  const value: unknown = await request.json();
  if (
    !isRecord(value) ||
    typeof value.expectedRevision !== "number" ||
    !Number.isSafeInteger(value.expectedRevision) ||
    (value.stage !== "title-abstract" && value.stage !== "full-text") ||
    (value.decision !== "include" && value.decision !== "exclude" && value.decision !== "uncertain") ||
    typeof value.reason !== "string" ||
    (value.criterionId !== null && typeof value.criterionId !== "string")
  ) {
    throw new Error("Review screening decision request is invalid");
  }
  return {
    expectedRevision: value.expectedRevision,
    stage: value.stage,
    decision: value.decision,
    reason: value.reason,
    criterionId: value.criterionId,
  };
}

async function finalInclusionDecisionRequest(request: Request): Promise<{
  expectedRevision: number;
  outcome: "include" | "exclude";
  criterionId: string | null;
  reason: string;
}> {
  const value: unknown = await request.json();
  if (
    !isRecord(value) ||
    typeof value.expectedRevision !== "number" ||
    !Number.isSafeInteger(value.expectedRevision) ||
    (value.outcome !== "include" && value.outcome !== "exclude") ||
    (value.criterionId !== null && typeof value.criterionId !== "string") ||
    typeof value.reason !== "string"
  ) {
    throw new Error("Review final-inclusion decision request is invalid");
  }
  return {
    expectedRevision: value.expectedRevision,
    outcome: value.outcome,
    criterionId: value.criterionId,
    reason: value.reason,
  };
}

async function reassessmentCompletionRequest(request: Request): Promise<{ expectedRevision: number; rationale: string }> {
  const value: unknown = await request.json();
  if (
    !isRecord(value) ||
    typeof value.expectedRevision !== "number" ||
    !Number.isSafeInteger(value.expectedRevision) ||
    value.expectedRevision < 1 ||
    typeof value.rationale !== "string" ||
    !value.rationale.trim() ||
    value.rationale.trim().length > 2_000
  ) {
    throw new Error("Review reassessment completion request is invalid");
  }
  return { expectedRevision: value.expectedRevision, rationale: value.rationale.trim() };
}

async function screeningAdjudicationRequest(request: Request): Promise<{
  expectedRevision: number;
  stage: ScreeningStage;
  outcome: "include" | "exclude";
  reason: string;
}> {
  const value: unknown = await request.json();
  if (
    !isRecord(value) ||
    typeof value.expectedRevision !== "number" ||
    !Number.isSafeInteger(value.expectedRevision) ||
    (value.stage !== "title-abstract" && value.stage !== "full-text") ||
    (value.outcome !== "include" && value.outcome !== "exclude") ||
    typeof value.reason !== "string"
  ) {
    throw new Error("Review screening adjudication request is invalid");
  }
  return { expectedRevision: value.expectedRevision, stage: value.stage, outcome: value.outcome, reason: value.reason };
}

async function searchRunRequest(request: Request) {
  const value = await searchImportBody(request);
  if (
    typeof value.expectedRevision !== "number" ||
    !Number.isSafeInteger(value.expectedRevision) ||
    value.expectedRevision < 1 ||
    typeof value.sourceId !== "string" ||
    !value.sourceId.trim() ||
    value.sourceId.length > 128 ||
    typeof value.query !== "string" ||
    !value.query.trim() ||
    value.query.length > 20_000 ||
    typeof value.searchedAt !== "string" ||
    Number.isNaN(Date.parse(value.searchedAt)) ||
    typeof value.digest !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.digest) ||
    typeof value.filename !== "string" ||
    !validReviewImportFilename(value.filename) ||
    value.mediaType !== reviewBibTeXImport.mediaType ||
    typeof value.reportedResultCount !== "number" ||
    !Number.isSafeInteger(value.reportedResultCount) ||
    value.reportedResultCount < 0 ||
    value.reportedResultCount > reviewImportLimits.reportedResults
  ) {
    throw new Error("Review search run request is invalid");
  }
  return {
    expectedRevision: value.expectedRevision,
    sourceId: value.sourceId.trim(),
    query: value.query,
    searchedAt: value.searchedAt,
    bibtex: value.bibtex,
    digest: value.digest,
    filename: value.filename.trim(),
    mediaType: value.mediaType,
    reportedResultCount: value.reportedResultCount,
  };
}

async function searchImportBody(request: Request): Promise<Record<string, unknown> & { bibtex: string }> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > reviewImportLimits.bibtexBytes + 100_000) throw new Error("Review BibTeX import is too large");
  const value: unknown = await request.json();
  if (!isRecord(value) || typeof value.bibtex !== "string") throw new Error("Review BibTeX import request is invalid");
  return { ...value, bibtex: value.bibtex };
}

async function duplicateResolutionRequest(request: Request): Promise<{
  expectedRevision: number;
  action: "merge" | "distinct";
  canonicalRecordId: string | null;
}> {
  const value: unknown = await request.json();
  if (
    !isRecord(value) ||
    typeof value.expectedRevision !== "number" ||
    !Number.isSafeInteger(value.expectedRevision) ||
    (value.action !== "merge" && value.action !== "distinct") ||
    (value.canonicalRecordId !== null && typeof value.canonicalRecordId !== "string")
  ) {
    throw new Error("Review duplicate resolution is invalid");
  }
  return { expectedRevision: value.expectedRevision, action: value.action, canonicalRecordId: value.canonicalRecordId };
}

async function protocolRequest(request: Request, requireRationale = false) {
  assertRequestSize(request);
  const value: unknown = await request.json();
  if (!isRecord(value)) throw new Error("Review protocol request is invalid");
  const expectedRevision = parseRevision(value.expectedRevision);
  const content = parseReviewProtocolContent(value.content);
  const rationale = typeof value.rationale === "string" ? value.rationale.trim() : undefined;
  if (requireRationale && !rationale) throw new Error("Protocol amendment rationale is required");
  if (rationale && rationale.length > 2_000) throw new Error("Protocol rationale is invalid");
  return { expectedRevision, content, rationale };
}

async function expectedRevisionRequest(request: Request): Promise<{ expectedRevision: number }> {
  assertRequestSize(request);
  const value: unknown = await request.json();
  if (!isRecord(value)) throw new Error("Review protocol request is invalid");
  return { expectedRevision: parseRevision(value.expectedRevision) };
}

function parseRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error("Review revision is invalid");
  return value;
}

function assertRequestSize(request: Request): void {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > maximumProtocolRequestBytes) throw new Error("Review protocol request is too large");
}

function validReviewImportFilename(value: string): boolean {
  const filename = value.trim();
  return (
    filename.length > 0 &&
    filename.length <= reviewImportLimits.filenameCharacters &&
    /\.bib$/iu.test(filename) &&
    !filename.includes("/") &&
    !filename.includes("\\") &&
    !hasAsciiControlCharacter(filename)
  );
}

function hasAsciiControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

async function assertAuthorizedReviewSelector(
  selector: ReviewEvidencePointer | ReviewSourceSelectorValue | null,
  room: DurableObjectStub<import("../durable-objects/document-room").DocumentRoom> | undefined,
  workspaceId: string | undefined,
): Promise<void> {
  if (selector === null) return;
  if ("kind" in selector && selector.kind === "legacy-unresolved") throw new Error("Review evidence selector is unresolved");
  if (!room || !workspaceId) throw new Error("Project evidence authority is unavailable");
  const snapshot = await room.getSnapshot(workspaceId);
  if (selector.kind === "pdf-annotation") {
    const annotation = snapshot.annotations.find(
      (candidate) =>
        candidate.pdfId === selector.resourceId &&
        (candidate.id === selector.selectorId || candidate.fragments.some((fragment) => fragment.id === selector.selectorId)),
    );
    if (annotation) {
      if ("quote" in selector) {
        const selectedQuote =
          annotation.id === selector.selectorId
            ? annotation.quote
            : annotation.fragments.find((fragment) => fragment.id === selector.selectorId)?.quote;
        if (selectedQuote?.trim() !== selector.quote.trim() || selector.page !== annotation.page) {
          throw new Error("Review PDF evidence does not match its shared annotation");
        }
      }
      return;
    }
    const sharedHighlight = snapshot.researchShares.find(
      (share) =>
        share.revokedAt === null &&
        share.id === selector.resourceId &&
        share.resourceId === selector.selectorId &&
        share.content.kind === "highlight",
    );
    if (sharedHighlight?.content.kind === "highlight") {
      if (
        "quote" in selector &&
        (sharedHighlight.content.quote.trim() !== selector.quote.trim() || sharedHighlight.content.page !== selector.page)
      ) {
        throw new Error("Review PDF evidence does not match its shared highlight");
      }
      return;
    }
  }
  if (selector.kind === "web-passage") {
    const sharedSnapshot = snapshot.researchShares.find(
      (share) =>
        share.revokedAt === null &&
        share.id === selector.resourceId &&
        share.content.kind === "web-snapshot" &&
        share.content.snapshotId === selector.selectorId,
    );
    if (sharedSnapshot) return;
  }
  throw new Error("Review evidence selector is not shared with this project");
}

function isReviewSourceSelectorValue(value: ExtractionValue): value is ReviewSourceSelectorValue {
  return isRecord(value) && (value.kind === "pdf-annotation" || value.kind === "web-passage");
}

function modelExtractionSelectors(
  operation: ReviewModelOperation,
  result: unknown,
): readonly (ReviewEvidencePointer | ReviewSourceSelectorValue)[] {
  if (operation !== "extract-field") return [];
  if (!isRecord(result)) throw new Error("Review model candidate result is invalid");
  const value = parseExtractionValueShape(result.value);
  const evidence = parseEvidencePointer(result.evidence, value !== null);
  return [evidence, isReviewSourceSelectorValue(value) ? value : null].filter(
    (selector): selector is ReviewEvidencePointer | ReviewSourceSelectorValue => selector !== null,
  );
}

function noStore(value: unknown): Response {
  return Response.json(value, { headers: { "cache-control": "no-store" } });
}

function download(content: string, contentType: string, filename: string): Response {
  return new Response(content, {
    headers: { "cache-control": "no-store", "content-type": contentType, "content-disposition": `attachment; filename="${filename}"` },
  });
}

function binaryDownload(content: Uint8Array, contentType: string, filename: string): Response {
  return new Response(content, {
    headers: { "cache-control": "no-store", "content-type": contentType, "content-disposition": `attachment; filename="${filename}"` },
  });
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
