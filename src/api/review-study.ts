import { parseReviewProtocolContent } from "../domain/review-study";
import { previewReviewBibTeX, reviewImportLimits } from "../domain/review-search";
import type { ScreeningDecisionValue, ScreeningStage } from "../domain/review-screening";
import { parseEvidencePointer, type ExtractionValue } from "../domain/review-evidence";
import type { AuthIdentity } from "../security/auth";

const maximumProtocolRequestBytes = 2 * 1024 * 1024;

export async function handleReviewStudyApi(
  request: Request,
  study: DurableObjectStub<import("../durable-objects/review-study").ReviewStudy>,
  identity: AuthIdentity,
  suffix: string,
): Promise<Response> {
  if (suffix === "/review-study" && request.method === "GET") {
    return noStore(await study.getSnapshot("slr", identity.email));
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
        body.criterion,
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
  if (suffix === "/review-study/evidence" && request.method === "GET") return noStore(await study.getEvidenceSnapshot(identity.email));
  const qualityMatch = /^\/review-study\/records\/([a-f0-9-]{36})\/quality-values$/iu.exec(suffix);
  if (qualityMatch?.[1] && request.method === "POST") {
    const body = await qualityValueRequest(request);
    return noStore(
      await study.submitQualityAssessment(
        body.expectedRevision,
        qualityMatch[1],
        body.questionId,
        body.answerId,
        body.evidence,
        identity.email,
      ),
    );
  }
  const extractionMatch = /^\/review-study\/records\/([a-f0-9-]{36})\/extraction-values$/iu.exec(suffix);
  if (extractionMatch?.[1] && request.method === "POST") {
    const body = await extractionValueRequest(request);
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
  return Response.json({ error: "Review-study route not found" }, { status: 404 });
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
    evidence: parseEvidencePointer(value.evidence, true)!,
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
    (input.value !== null && typeof input.value !== "string" && typeof input.value !== "number" && typeof input.value !== "boolean") ||
    (input.missingReason !== null && typeof input.missingReason !== "string")
  ) {
    throw new Error("Extraction value request is invalid");
  }
  return {
    expectedRevision: input.expectedRevision,
    fieldId: input.fieldId,
    value: input.value,
    missingReason: input.missingReason,
    evidence: parseEvidencePointer(input.evidence, input.value !== null),
  };
}

async function screeningDecisionRequest(request: Request): Promise<{
  expectedRevision: number;
  stage: ScreeningStage;
  decision: ScreeningDecisionValue;
  reason: string;
  criterion: string;
}> {
  const value: unknown = await request.json();
  if (
    !isRecord(value) ||
    typeof value.expectedRevision !== "number" ||
    !Number.isSafeInteger(value.expectedRevision) ||
    (value.stage !== "title-abstract" && value.stage !== "full-text") ||
    (value.decision !== "include" && value.decision !== "exclude" && value.decision !== "uncertain") ||
    typeof value.reason !== "string" ||
    typeof value.criterion !== "string"
  ) {
    throw new Error("Review screening decision request is invalid");
  }
  return {
    expectedRevision: value.expectedRevision,
    stage: value.stage,
    decision: value.decision,
    reason: value.reason,
    criterion: value.criterion,
  };
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
    typeof value.sourceId !== "string" ||
    typeof value.query !== "string" ||
    typeof value.searchedAt !== "string" ||
    typeof value.digest !== "string"
  ) {
    throw new Error("Review search run request is invalid");
  }
  return {
    expectedRevision: value.expectedRevision,
    sourceId: value.sourceId,
    query: value.query,
    searchedAt: value.searchedAt,
    bibtex: value.bibtex,
    digest: value.digest,
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

function noStore(value: unknown): Response {
  return Response.json(value, { headers: { "cache-control": "no-store" } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
