import type { ExtractedDataValue } from "../domain/review-evidence";
import type { ReviewResearchQuestion } from "../domain/review-study";

export interface ReviewPublicationTarget {
  readonly projectLinkId: string;
  readonly workspaceId: string;
}

export function latestExtractionValue(values: readonly ExtractedDataValue[], fieldId: string): ExtractedDataValue | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index]!.fieldId === fieldId) return values[index]!;
  }
  return null;
}

export function reviewIdentityFromApiBase(apiBase: string): string {
  const match = /^\/api\/reviews\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu.exec(apiBase);
  if (!match?.[1]) throw new Error("Review API base is invalid");
  return match[1].toLowerCase();
}

export function reviewSynthesisPublicationPath(reviewId: string): string {
  if (!isUuid(reviewId)) throw new Error("Review identity is invalid");
  return `review/${reviewId.toLowerCase()}/synthesis.md`;
}

export function reviewPublicationProjectApi(target: ReviewPublicationTarget): string {
  assertPublicationTarget(target);
  return `/api/workspaces/${encodeURIComponent(target.workspaceId)}`;
}

export function reviewSynthesisPublicationRequest(
  reviewId: string,
  target: ReviewPublicationTarget,
  expectedProjectRevision: number,
  reviewRevision: number,
): {
  readonly projectLinkId: string;
  readonly expectedProjectRevision: number;
  readonly reviewRevision: number;
  readonly artifactId: "synthesis";
  readonly analysisDefinitionId: "review-synthesis-report";
  readonly path: string;
} {
  assertPublicationTarget(target);
  if (!Number.isSafeInteger(expectedProjectRevision) || expectedProjectRevision < 0) throw new Error("Project revision is invalid");
  if (!Number.isSafeInteger(reviewRevision) || reviewRevision < 1) throw new Error("Review revision is invalid");
  return {
    projectLinkId: target.projectLinkId.toLowerCase(),
    expectedProjectRevision,
    reviewRevision,
    artifactId: "synthesis",
    analysisDefinitionId: "review-synthesis-report",
    path: reviewSynthesisPublicationPath(reviewId),
  };
}

export function resolveResearchQuestionReferences(value: string, researchQuestions: readonly ReviewResearchQuestion[]): string[] {
  return value
    .split(";")
    .map((reference) => reference.trim())
    .filter(Boolean)
    .map((reference) => {
      const match = /^rq(\d+)$/iu.exec(reference);
      if (!match) return reference;
      const index = Number(match[1]) - 1;
      return researchQuestions[index]?.id ?? reference;
    });
}

export function researchQuestionReference(id: string, researchQuestions: readonly ReviewResearchQuestion[]): string {
  const index = researchQuestions.findIndex((question) => question.id === id);
  return index < 0 ? id : `rq${index + 1}`;
}

export function assertPublicationTarget(target: ReviewPublicationTarget): void {
  if (!isUuid(target.projectLinkId) || !/^[a-z0-9-]{1,64}$/iu.test(target.workspaceId)) {
    throw new Error("Review publication target is invalid");
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
