export const demoWorkspaceId = "demo";

export const defaultSource = `## Evidence becomes prose {#sec-evidence}

Kirjolab keeps the path from an annotation to a claim and into cited prose visible :cite[merton1942]{locator="p. 270"}.

## Return to the source {#sec-source}

The preview resolves a link back to :ref[sec-evidence]. Select this paragraph, attach a PDF annotation, and ask a local model to propose a grounded revision.
`;

export const defaultBibliography = `@article{merton1942,
  author = {Merton, Robert K.},
  title = {The Normative Structure of Science},
  year = {1942},
  journal = {The Sociology of Science}
}
`;

export type CandidateStatus = "pending" | "accepted" | "rejected";

export interface PdfResource {
  id: string;
  name: string;
  contentType: "application/pdf";
  size: number;
  objectKey: string;
  createdAt: string;
}

export interface AnnotationResource {
  id: string;
  pdfId: string;
  page: number;
  quote: string;
  prefix: string;
  suffix: string;
  comment: string;
  createdAt: string;
}

export interface PassageLink {
  id: string;
  annotationId: string;
  start: number;
  end: number;
  excerpt: string;
  createdAt: string;
}

export interface ModelCandidate {
  id: string;
  provider: string;
  model: string;
  operation: "revise-selection";
  sourceRevision: number;
  sourceIds: string[];
  proposedSource: string;
  status: CandidateStatus;
  createdAt: string;
}

export interface WorkspaceSnapshot {
  id: string;
  title: string;
  source: string;
  bibliography: string;
  revision: number;
  pdfs: PdfResource[];
  annotations: AnnotationResource[];
  links: PassageLink[];
  candidates: ModelCandidate[];
}

export type ApplyCandidateResult = { ok: true; snapshot: WorkspaceSnapshot } | { ok: false; error: string };

export interface CreateAnnotationInput {
  pdfId: string;
  page: number;
  quote: string;
  prefix: string;
  suffix: string;
  comment: string;
}

export interface CreatePassageLinkInput {
  annotationId: string;
  start: number;
  end: number;
  excerpt: string;
}

export interface CreateCandidateInput {
  provider: string;
  model: string;
  sourceRevision: number;
  sourceIds: string[];
  proposedSource: string;
}

export function isCreateAnnotationInput(value: unknown): value is CreateAnnotationInput {
  if (!isRecord(value)) return false;

  return (
    isStringWithin(value.pdfId, 128, true) &&
    Number.isInteger(value.page) &&
    typeof value.page === "number" &&
    value.page > 0 &&
    isStringWithin(value.quote, 20_000, true) &&
    isStringWithin(value.prefix, 2_000) &&
    isStringWithin(value.suffix, 2_000) &&
    isStringWithin(value.comment, 4_000)
  );
}

export function isCreatePassageLinkInput(value: unknown): value is CreatePassageLinkInput {
  if (!isRecord(value)) return false;

  return (
    isStringWithin(value.annotationId, 128, true) &&
    Number.isInteger(value.start) &&
    Number.isInteger(value.end) &&
    typeof value.start === "number" &&
    typeof value.end === "number" &&
    value.start >= 0 &&
    value.end > value.start &&
    isStringWithin(value.excerpt, 50_000, true)
  );
}

export function isCreateCandidateInput(value: unknown): value is CreateCandidateInput {
  if (!isRecord(value)) return false;

  return (
    isStringWithin(value.provider, 512, true) &&
    isStringWithin(value.model, 256, true) &&
    Number.isInteger(value.sourceRevision) &&
    typeof value.sourceRevision === "number" &&
    value.sourceRevision >= 0 &&
    Array.isArray(value.sourceIds) &&
    value.sourceIds.length <= 100 &&
    value.sourceIds.every((value) => isStringWithin(value, 128, true)) &&
    isStringWithin(value.proposedSource, 2_000_000, true)
  );
}

export function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.title) &&
    typeof value.source === "string" &&
    typeof value.bibliography === "string" &&
    typeof value.revision === "number" &&
    Array.isArray(value.pdfs) &&
    Array.isArray(value.annotations) &&
    Array.isArray(value.links) &&
    Array.isArray(value.candidates)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringWithin(value: unknown, maximumLength: number, required = false): value is string {
  return typeof value === "string" && value.length <= maximumLength && (!required || value.trim().length > 0);
}
