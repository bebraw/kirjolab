import type { ReviewProfile } from "./review-study";

export const reviewResourceLimits = {
  catalogEntries: 200,
  members: 200,
  projectLinks: 5_000,
  titleCharacters: 120,
} as const;

export type ReviewRole = "owner" | "member";

export interface ReviewSummary {
  readonly id: string;
  readonly title: string;
  readonly profile: ReviewProfile;
  readonly href: string;
  readonly role: ReviewRole;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
}

export interface ReviewLocator {
  readonly reviewId: string;
  readonly storageKey: string;
  readonly legacyWorkspaceId: string | null;
}

export interface ReviewCatalogRecord extends ReviewSummary {
  readonly locator: ReviewLocator;
}

export interface ReviewMember {
  readonly id: string;
  readonly email: string;
  readonly role: ReviewRole;
  readonly addedAt: string;
}

export interface ReviewMemberSeed {
  readonly id?: string;
  readonly email: string;
  readonly role: ReviewRole;
  readonly addedAt?: string;
}

export type ProjectReviewLinkStatus = "active" | "unlinked";

export interface ProjectReviewLink {
  readonly id: string;
  readonly reviewId: string;
  readonly workspaceId: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly status: ProjectReviewLinkStatus;
  readonly unlinkedAt: string | null;
  readonly unlinkedBy: string | null;
}

export interface ReviewAccessStatus {
  readonly reviewId: string | null;
  readonly legacySeededAt: string | null;
  readonly deletedAt: string | null;
}

export interface ReviewLegacyInitialization {
  readonly reviewId: string;
  readonly members: readonly ReviewMember[];
  readonly legacySeededAt: string;
}

export interface ReviewCatalogBackupSnapshot {
  readonly records: readonly ReviewCatalogRecord[];
  readonly bookmark: string | null;
}

export interface ReviewAccessBackupState {
  readonly reviewId: string;
  readonly legacySeededAt: string | null;
  readonly deletedAt: string | null;
  readonly members: readonly ReviewMember[];
  readonly projectLinks: readonly ProjectReviewLink[];
}

export interface ReviewAccessBackupSnapshot extends ReviewAccessBackupState {
  readonly bookmark: string | null;
}

export interface ReviewDeletionBoundary {
  readonly reviewId: string;
  readonly deletedAt: string;
  readonly unlinkedProjectIds: readonly string[];
}

export interface ReviewDeletionSnapshot {
  readonly members: readonly ReviewMember[];
  readonly projectLinks: readonly ProjectReviewLink[];
  readonly deletedAt: string | null;
}

export interface CreateReviewCatalogInput {
  readonly title: string;
  readonly profile: ReviewProfile;
}

export interface RegisterReviewCatalogInput {
  readonly id: string;
  readonly title: string;
  readonly profile: ReviewProfile;
  readonly role: ReviewRole;
  readonly storageKey: string;
  readonly legacyWorkspaceId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
}

export interface RegisterLegacyReviewInput {
  readonly reviewId?: string;
  readonly title: string;
  readonly profile: ReviewProfile;
  readonly role: ReviewRole;
  readonly storageKey: string;
  readonly legacyWorkspaceId: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly archivedAt?: string | null;
}

export interface UpdateReviewCatalogInput {
  readonly title?: string;
  readonly archived?: boolean;
}

export function isReviewId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

export function isWorkspaceRouteId(value: string): boolean {
  return /^[a-z0-9-]{1,64}$/iu.test(value);
}

export function isReviewStorageKey(value: string): boolean {
  return /^[a-z0-9:-]{1,128}$/iu.test(value);
}

export function normalizeReviewTitle(value: string): string {
  const title = value.trim();
  if (!title || title.length > reviewResourceLimits.titleCharacters) throw new Error("Review title is invalid");
  return title;
}

export function normalizeReviewEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new Error("Review member email is invalid");
  return email;
}

export function isReviewProfile(value: unknown): value is ReviewProfile {
  return value === "slr" || value === "mlr";
}

export function isReviewRole(value: unknown): value is ReviewRole {
  return value === "owner" || value === "member";
}

export function isIsoTimestamp(value: string): boolean {
  return value.length <= 40 && !Number.isNaN(Date.parse(value));
}

export function isReviewSummary(value: unknown): value is ReviewSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    isReviewId(value.id) &&
    typeof value.title === "string" &&
    value.title === value.title.trim() &&
    value.title.length > 0 &&
    value.title.length <= reviewResourceLimits.titleCharacters &&
    isReviewProfile(value.profile) &&
    value.href === `/review/${value.id}` &&
    isReviewRole(value.role) &&
    typeof value.createdAt === "string" &&
    isIsoTimestamp(value.createdAt) &&
    typeof value.updatedAt === "string" &&
    isIsoTimestamp(value.updatedAt) &&
    (value.archivedAt === null || (typeof value.archivedAt === "string" && isIsoTimestamp(value.archivedAt)))
  );
}

export function isReviewSummaries(value: unknown): value is ReviewSummary[] {
  return Array.isArray(value) && value.length <= reviewResourceLimits.catalogEntries && value.every(isReviewSummary);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
