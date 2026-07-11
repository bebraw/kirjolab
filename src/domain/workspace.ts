import {
  isManuscriptAnchorResolution,
  isManuscriptAnchorSelector,
  type ManuscriptAnchorResolution,
  type ManuscriptAnchorSelector,
} from "./manuscript-anchor";

export type { ManuscriptAnchorResolution, ManuscriptAnchorSelector } from "./manuscript-anchor";

export const demoWorkspaceId = "demo";
export const localOwnerId = "local";

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
export type ClaimEvidenceRelation = "supports" | "contradicts" | "extends";

export interface WorkspaceSummary {
  id: string;
  title: string;
  href: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkspaceRole = "owner" | "member";

export interface WorkspaceMember {
  email: string;
  role: WorkspaceRole;
  addedAt: string;
}

export interface PdfResource {
  id: string;
  name: string;
  contentType: "application/pdf";
  size: number;
  objectKey: string;
  fingerprint: string;
  createdAt: string;
}

export interface PublicationResource {
  id: string;
  citationKey: string;
  type: string;
  title: string;
  authors: string[];
  year: string;
  venue: string;
  doi: string;
  url: string;
  abstract: string;
  metadataSource: "bibtex" | "crossref";
  createdAt: string;
  updatedAt: string;
}

export interface PublicationPdfLink {
  id: string;
  publicationId: string;
  pdfId: string;
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
  rects: PdfSelectionRect[];
  createdAt: string;
}

export interface PdfSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PassageLink {
  id: string;
  annotationId: string;
  anchor: ManuscriptAnchorSelector;
  resolution: ManuscriptAnchorResolution;
  createdAt: string;
}

export interface ClaimResource {
  id: string;
  text: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimEvidenceLink {
  id: string;
  claimId: string;
  annotationId: string;
  relation: ClaimEvidenceRelation;
  createdAt: string;
}

export interface ClaimPassageLink {
  id: string;
  claimId: string;
  anchor: ManuscriptAnchorSelector;
  resolution: ManuscriptAnchorResolution;
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
  publications: PublicationResource[];
  publicationPdfLinks: PublicationPdfLink[];
  annotations: AnnotationResource[];
  links: PassageLink[];
  claims: ClaimResource[];
  claimEvidenceLinks: ClaimEvidenceLink[];
  claimLinks: ClaimPassageLink[];
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
  rects: PdfSelectionRect[];
}

export interface ManuscriptPassageInput {
  start: number;
  end: number;
  excerpt: string;
  sourceRevision: number;
}

export interface CreateAnnotationLinkInput {
  annotation: CreateAnnotationInput;
  passage: ManuscriptPassageInput;
}

export interface AnnotationLinkResult {
  annotation: AnnotationResource;
  link: PassageLink;
}

export interface CreateWorkspaceInput {
  title: string;
}

export interface InviteWorkspaceMemberInput {
  email: string;
}

export interface ImportBibliographyInput {
  bibtex: string;
}

export interface CreatePublicationPdfLinkInput {
  publicationId: string;
  pdfId: string;
}

export interface PublicationEnrichment {
  title: string;
  authors: string[];
  year: string;
  venue: string;
  doi: string;
  url: string;
  abstract: string;
}

export interface CreatePassageLinkInput extends ManuscriptPassageInput {
  annotationId: string;
}

export interface ClaimEvidenceInput {
  annotationId: string;
  relation: ClaimEvidenceRelation;
}

export interface UpsertClaimInput {
  text: string;
  note: string;
  evidence: ClaimEvidenceInput[];
}

export interface CreateClaimPassageLinkInput extends ManuscriptPassageInput {
  claimId: string;
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
    isStringWithin(value.comment, 4_000) &&
    Array.isArray(value.rects) &&
    value.rects.length <= 64 &&
    value.rects.every(isPdfSelectionRect)
  );
}

export function isCreateAnnotationLinkInput(value: unknown): value is CreateAnnotationLinkInput {
  return isRecord(value) && isCreateAnnotationInput(value.annotation) && isManuscriptPassageInput(value.passage);
}

export function isCreateWorkspaceInput(value: unknown): value is CreateWorkspaceInput {
  return isRecord(value) && isStringWithin(value.title, 120, true);
}

export function isInviteWorkspaceMemberInput(value: unknown): value is InviteWorkspaceMemberInput {
  return isRecord(value) && isEmail(value.email);
}

export function isImportBibliographyInput(value: unknown): value is ImportBibliographyInput {
  return isRecord(value) && isStringWithin(value.bibtex, 2_000_000, true);
}

export function isCreatePublicationPdfLinkInput(value: unknown): value is CreatePublicationPdfLinkInput {
  return isRecord(value) && isStringWithin(value.publicationId, 128, true) && isStringWithin(value.pdfId, 128, true);
}

export function isWorkspaceMembers(value: unknown): value is WorkspaceMember[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) && isEmail(item.email) && (item.role === "owner" || item.role === "member") && isNonEmptyString(item.addedAt),
    )
  );
}

export function isWorkspaceSummaries(value: unknown): value is WorkspaceSummary[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        isNonEmptyString(item.id) &&
        isNonEmptyString(item.title) &&
        isNonEmptyString(item.href) &&
        isNonEmptyString(item.createdAt) &&
        isNonEmptyString(item.updatedAt),
    )
  );
}

export function isCreatePassageLinkInput(value: unknown): value is CreatePassageLinkInput {
  return isRecord(value) && isStringWithin(value.annotationId, 128, true) && isManuscriptPassageInput(value);
}

export function isUpsertClaimInput(value: unknown): value is UpsertClaimInput {
  if (!isRecord(value) || !isStringWithin(value.text, 2_000, true) || !isStringWithin(value.note, 8_000)) return false;
  if (!Array.isArray(value.evidence) || value.evidence.length === 0 || value.evidence.length > 20) return false;
  const annotationIds = new Set<string>();
  for (const evidence of value.evidence) {
    if (
      !isRecord(evidence) ||
      !isStringWithin(evidence.annotationId, 128, true) ||
      !isClaimEvidenceRelation(evidence.relation) ||
      annotationIds.has(evidence.annotationId)
    ) {
      return false;
    }
    annotationIds.add(evidence.annotationId);
  }
  return true;
}

export function isCreateClaimPassageLinkInput(value: unknown): value is CreateClaimPassageLinkInput {
  return isRecord(value) && isStringWithin(value.claimId, 128, true) && isManuscriptPassageInput(value);
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
    Array.isArray(value.publications) &&
    Array.isArray(value.publicationPdfLinks) &&
    value.publicationPdfLinks.every(isPublicationPdfLink) &&
    Array.isArray(value.annotations) &&
    Array.isArray(value.links) &&
    value.links.every(isPassageLink) &&
    Array.isArray(value.claims) &&
    value.claims.every(isClaimResource) &&
    Array.isArray(value.claimEvidenceLinks) &&
    value.claimEvidenceLinks.every(isClaimEvidenceLink) &&
    Array.isArray(value.claimLinks) &&
    value.claimLinks.every(isClaimPassageLink) &&
    Array.isArray(value.candidates)
  );
}

function isPublicationPdfLink(value: unknown): value is PublicationPdfLink {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.publicationId) &&
    isNonEmptyString(value.pdfId) &&
    isNonEmptyString(value.createdAt)
  );
}

function isManuscriptPassageInput(value: unknown): value is ManuscriptPassageInput {
  return (
    isRecord(value) &&
    Number.isInteger(value.start) &&
    Number.isInteger(value.end) &&
    typeof value.start === "number" &&
    typeof value.end === "number" &&
    value.start >= 0 &&
    value.end > value.start &&
    isStringWithin(value.excerpt, 50_000, true) &&
    isNonNegativeInteger(value.sourceRevision)
  );
}

function isClaimEvidenceRelation(value: unknown): value is ClaimEvidenceRelation {
  return value === "supports" || value === "contradicts" || value === "extends";
}

function isClaimResource(value: unknown): value is ClaimResource {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isStringWithin(value.text, 2_000, true) &&
    isStringWithin(value.note, 8_000) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.updatedAt)
  );
}

function isClaimEvidenceLink(value: unknown): value is ClaimEvidenceLink {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.claimId) &&
    isNonEmptyString(value.annotationId) &&
    isClaimEvidenceRelation(value.relation) &&
    isNonEmptyString(value.createdAt)
  );
}

function isClaimPassageLink(value: unknown): value is ClaimPassageLink {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.claimId) &&
    isManuscriptAnchorSelector(value.anchor) &&
    isManuscriptAnchorResolution(value.resolution) &&
    isNonEmptyString(value.createdAt)
  );
}

function isPassageLink(value: unknown): value is PassageLink {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.annotationId) &&
    isManuscriptAnchorSelector(value.anchor) &&
    isManuscriptAnchorResolution(value.resolution) &&
    isNonEmptyString(value.createdAt)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
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

function isEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function isPdfSelectionRect(value: unknown): value is PdfSelectionRect {
  if (!isRecord(value)) return false;
  const coordinates = [value.x, value.y, value.width, value.height];
  return (
    coordinates.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)) &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    value.x >= 0 &&
    value.y >= 0 &&
    value.width > 0 &&
    value.height > 0 &&
    value.x + value.width <= 1.000_001 &&
    value.y + value.height <= 1.000_001
  );
}
